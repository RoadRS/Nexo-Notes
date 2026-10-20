import {
  AcademicAreaId,
  AcademicProfile,
  FolderEntity,
  NoteEntity,
  SourceReference,
  TermQueryStatus,
  VerificationStatus,
} from '../types/models';
import {
  ACADEMIC_AREA_CATALOG,
  getAcademicAreaDefinition,
  isValidAcademicAreaId,
  parseAcademicAreaId,
} from './academicContext';
import {
  ApiErrorCategory,
  ExtractionAcademicContextMetadata,
  analyzeApiErrorDetails,
} from './conceptExtractor';
import { isGenericDisciplineLabel, normalizeConceptText } from './cacheIntegrity';

export const DEFINITION_PRIMARY_MODEL = 'gemini-3.5-flash-lite';
export const DEFINITION_FALLBACK_MODEL = 'gemini-3.8-flash';

export type DefinitionErrorKind =
  | 'INVALID_REQUEST'
  | 'MALFORMED_RESPONSE'
  | 'TRANSIENT_ERROR'
  | 'PERMANENT_ERROR';

export type DefinitionFailureStage =
  | 'request_validation'
  | 'model_invocation'
  | 'json_parse'
  | 'payload_validation';

export interface DefinitionAttemptDiagnostic {
  stage: DefinitionFailureStage;
  attempt: number;
  model: string;
  errorKind: DefinitionErrorKind;
  statusCode: number;
  retryable: boolean;
  areaId: AcademicAreaId;
  hasSpecificDiscipline: boolean;
  hasContextualEvidence: boolean;
  reason: string;
}

export class ConceptDefinitionError extends Error {
  public readonly kind: DefinitionErrorKind;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly details?: string;
  public readonly stage: DefinitionFailureStage;
  public readonly category?: ApiErrorCategory;

  constructor(
    kind: DefinitionErrorKind,
    message: string,
    statusCode: number,
    retryable: boolean,
    details?: string,
    stage: DefinitionFailureStage = 'model_invocation',
    category?: ApiErrorCategory
  ) {
    super(message);
    this.name = 'ConceptDefinitionError';
    this.kind = kind;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.details = details;
    this.stage = stage;
    this.category = category;
  }
}

export interface ContextualDefinitionTermInput {
  name: string;
  context?: string;
  subject?: string;
  noteTitle?: string;
  noteExcerpt?: string;
  academicContext?: Partial<ExtractionAcademicContextMetadata> | null;
}

export interface ResolvedDefinitionPromptContext {
  termName: string;
  areaId: AcademicAreaId;
  disciplineLabel: string;
  effectiveSubject: string;
  noteTitle?: string;
  contextSnippet?: string;
  noteExcerpt?: string;
  career?: string;
  specialty?: string;
  hasSpecificDiscipline: boolean;
  hasContextualEvidence: boolean;
}

export interface ValidatedAcademicDefinition {
  academicDefinition: string;
  plainExplanation: string;
  illustrativeExample: string;
  academicField: string;
}

const UI_PLACEHOLDER_CONTEXT_SNIPPETS = new Set([
  'termino anadido manualmente por el estudiante',
  'termino anadido manualmente por el estudiante.',
  'contexto de estudio academico',
  'contexto de estudio academico.',
  'sin contexto',
  'n/a',
]);

const GENERIC_NOTE_TITLES = new Set([
  '',
  'apunte',
  'apunte academico',
  'nota sin titulo',
  'sin titulo',
]);

/**
 * Frases de relleno o plantillas genéricas que nunca deben aceptarse como definición,
 * explicación o ejemplo válido ni guardarse en `analysisCache`.
 */
export const KNOWN_FILLER_OR_INVALID_PHRASES = [
  'explicacion didactica orientada al marco teorico del apunte',
  'aplicacion practica del concepto en contextos de estudio',
  'no se pudo completar la operacion',
  'error al contactar',
  'error de conexion o cuota',
  'sin definicion disponible',
  'error al generar',
  'fallo en la consulta',
  'error procesando termino',
  'definicion pendiente',
  'explicacion pendiente',
  'ejemplo pendiente',
  'lorem ipsum',
];

/**
 * Sanitiza un mensaje de diagnóstico para logs del servidor (oculta posibles claves o tokens y acota longitud).
 */
export function sanitizeDiagnosticReason(raw?: string | null, maxLen = 180): string {
  if (!raw || typeof raw !== 'string') return 'Sin detalle adicional';
  return raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_KEY]')
    .replace(/(?:api[_-]?key|token|authorization|secret|key)\s*[:=]\s*[^\s,;)]+/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Determina si un fragmento de contexto proviene de un marcador genérico de la interfaz
 * en lugar de texto real del apunte.
 */
export function isPlaceholderContextSnippet(snippet?: string | null): boolean {
  const norm = normalizeConceptText(snippet);
  if (!norm) return true;
  return UI_PLACEHOLDER_CONTEXT_SNIPPETS.has(norm);
}

/**
 * Extrae un fragmento relevante y acotado del apunte alrededor del término o de su snippet,
 * sin inventar contenido cuando el apunte está vacío.
 */
export function extractRelevantNoteExcerpt(
  fullNoteText?: string | null,
  termName?: string | null,
  contextSnippet?: string | null,
  maxChars = 900
): string | undefined {
  const cleanNote = typeof fullNoteText === 'string' ? fullNoteText.trim() : '';
  if (!cleanNote) return undefined;

  if (cleanNote.length <= maxChars) {
    return cleanNote;
  }

  const lowerNote = cleanNote.toLowerCase();
  const cleanTerm = (termName || '').trim().toLowerCase();
  const cleanSnippet =
    !isPlaceholderContextSnippet(contextSnippet) && contextSnippet
      ? contextSnippet.trim().toLowerCase()
      : '';

  let matchIndex = -1;
  if (cleanSnippet && cleanSnippet.length >= 12) {
    matchIndex = lowerNote.indexOf(cleanSnippet.slice(0, 40));
  }
  if (matchIndex < 0 && cleanTerm) {
    matchIndex = lowerNote.indexOf(cleanTerm);
  }

  if (matchIndex < 0) {
    return cleanNote.slice(0, maxChars).trim();
  }

  const halfWindow = Math.floor(maxChars / 2);
  const start = Math.max(0, matchIndex - halfWindow);
  const end = Math.min(cleanNote.length, start + maxChars);
  return cleanNote.slice(start, end).trim();
}

/**
 * Construye el payload enriquecido para solicitar la definición contextual de un término
 * desde `ConceptAnalysisModal`, aprovechando el contexto académico resuelto y el texto real del apunte.
 */
export function buildContextualDefinitionTermPayload(params: {
  name: string;
  contextSnippet?: string;
  academicField?: string;
  noteTitle?: string;
  noteText?: string;
  academicContext?: Partial<ExtractionAcademicContextMetadata> | null;
  note?: Partial<NoteEntity> | null;
  folders?: FolderEntity[];
  academicProfile?: AcademicProfile | null;
}): ContextualDefinitionTermInput {
  const cleanName = (params.name || '').trim();
  const realSnippet = isPlaceholderContextSnippet(params.contextSnippet)
    ? ''
    : (params.contextSnippet || '').trim();
  const noteExcerpt = extractRelevantNoteExcerpt(
    params.noteText ?? params.note?.content,
    cleanName,
    realSnippet
  );
  const effectiveTitle = (params.noteTitle ?? params.note?.title ?? '').trim();

  return {
    name: cleanName,
    context: realSnippet,
    subject: (params.academicField || params.note?.subject || 'General').trim(),
    ...(effectiveTitle && !GENERIC_NOTE_TITLES.has(normalizeConceptText(effectiveTitle))
      ? { noteTitle: effectiveTitle }
      : {}),
    ...(noteExcerpt ? { noteExcerpt } : {}),
    ...(params.academicContext ? { academicContext: params.academicContext } : {}),
  };
}

/**
 * Resuelve todos los metadatos disciplinares y contextuales disponibles para construir el prompt de Stage B.
 * Respeta explícitamente el área `General o multidisciplinario` sin confundirla con una disciplina concreta.
 */
export function resolveDefinitionPromptContext(
  input: ContextualDefinitionTermInput
): ResolvedDefinitionPromptContext {
  const termName = (input.name || '')
    .replace(/^["'«“]+|["'»”]+$/g, '')
    .trim();

  const rawSubject = (input.subject || '').trim();
  const ctxMeta = input.academicContext;

  const isExplicitManualGeneral =
    ctxMeta?.mode === 'manual' &&
    (ctxMeta?.areaId === 'general' || isGenericDisciplineLabel(ctxMeta?.disciplineLabel));

  let areaId: AcademicAreaId = 'general';
  if (!isExplicitManualGeneral) {
    if (ctxMeta?.areaId && isValidAcademicAreaId(ctxMeta.areaId) && ctxMeta.areaId !== 'general') {
      areaId = ctxMeta.areaId;
    } else if (rawSubject && !isGenericDisciplineLabel(rawSubject)) {
      const parsedFromSubject = parseAcademicAreaId(rawSubject);
      if (parsedFromSubject && parsedFromSubject !== 'general') {
        areaId = parsedFromSubject;
      }
    } else if (ctxMeta?.disciplineLabel && !isGenericDisciplineLabel(ctxMeta.disciplineLabel)) {
      const parsedFromLabel = parseAcademicAreaId(ctxMeta.disciplineLabel);
      if (parsedFromLabel && parsedFromLabel !== 'general') {
        areaId = parsedFromLabel;
      }
    } else if (ctxMeta?.career && !isGenericDisciplineLabel(ctxMeta.career)) {
      const parsedFromCareer = parseAcademicAreaId(ctxMeta.career);
      if (parsedFromCareer && parsedFromCareer !== 'general') {
        areaId = parsedFromCareer;
      }
    }
  }

  const areaDef = getAcademicAreaDefinition(areaId);
  const disciplineLabel =
    areaId !== 'general'
      ? areaDef.label
      : !isExplicitManualGeneral &&
          ctxMeta?.disciplineLabel &&
          !isGenericDisciplineLabel(ctxMeta.disciplineLabel)
        ? ctxMeta.disciplineLabel.trim()
        : !isExplicitManualGeneral && !isGenericDisciplineLabel(rawSubject)
          ? rawSubject
          : ACADEMIC_AREA_CATALOG.general.label;

  const effectiveSubject =
    !isExplicitManualGeneral && !isGenericDisciplineLabel(rawSubject)
      ? rawSubject
      : areaId !== 'general'
        ? areaDef.label
        : 'General o multidisciplinario';

  const cleanSnippet = isPlaceholderContextSnippet(input.context)
    ? undefined
    : input.context!.trim();

  const cleanExcerpt =
    typeof input.noteExcerpt === 'string' &&
    input.noteExcerpt.trim().length > 0 &&
    !isPlaceholderContextSnippet(input.noteExcerpt)
      ? input.noteExcerpt.trim()
      : undefined;

  const cleanTitle =
    typeof input.noteTitle === 'string' &&
    input.noteTitle.trim().length > 0 &&
    !GENERIC_NOTE_TITLES.has(normalizeConceptText(input.noteTitle))
      ? input.noteTitle.trim()
      : undefined;

  const rawCareer = ctxMeta?.career?.trim() || undefined;
  const career = rawCareer && !isGenericDisciplineLabel(rawCareer) ? rawCareer : undefined;

  const rawSpecialty = ctxMeta?.specialty?.trim() || undefined;
  const specialty =
    rawSpecialty && !isGenericDisciplineLabel(rawSpecialty) ? rawSpecialty : undefined;

  const hasSpecificDiscipline =
    areaId !== 'general' ||
    (!isExplicitManualGeneral && !isGenericDisciplineLabel(effectiveSubject));
  const hasContextualEvidence = Boolean(cleanSnippet || cleanExcerpt || cleanTitle);

  return {
    termName,
    areaId,
    disciplineLabel,
    effectiveSubject,
    noteTitle: cleanTitle,
    contextSnippet: cleanSnippet,
    noteExcerpt: cleanExcerpt,
    career,
    specialty,
    hasSpecificDiscipline,
    hasContextualEvidence,
  };
}

/**
 * Construye el prompt de generación de definición académica (Stage B - Contextual)
 * incorporando la disciplina resuelta, el título del apunte, el fragmento contextual
 * y las reglas de precisión conceptual, manejo del modo `General o multidisciplinario`
 * y honestidad epistémica ante términos ambiguos o con contexto insuficiente.
 */
export function buildContextualDefinitionPrompt(
  input: ContextualDefinitionTermInput
): string {
  const resolved = resolveDefinitionPromptContext(input);

  const contextLines: string[] = [];
  if (resolved.hasSpecificDiscipline) {
    contextLines.push(`- Área académica principal: ${resolved.disciplineLabel}`);
    if (
      normalizeConceptText(resolved.effectiveSubject) !==
      normalizeConceptText(resolved.disciplineLabel)
    ) {
      contextLines.push(`- Asignatura o subdisciplina específica: ${resolved.effectiveSubject}`);
    }
  } else {
    contextLines.push(
      '- Área académica: General o multidisciplinario (sin una disciplina única impuesta de antemano).'
    );
  }

  if (resolved.career) {
    contextLines.push(`- Carrera universitaria del estudiante: ${resolved.career}`);
  }
  if (resolved.specialty) {
    contextLines.push(`- Especialidad o enfoque: ${resolved.specialty}`);
  }
  if (resolved.noteTitle) {
    contextLines.push(`- Título del apunte: "${resolved.noteTitle}"`);
  }
  if (resolved.contextSnippet) {
    contextLines.push(`- Fragmento directo donde aparece el concepto: "${resolved.contextSnippet}"`);
  }
  if (
    resolved.noteExcerpt &&
    normalizeConceptText(resolved.noteExcerpt) !== normalizeConceptText(resolved.contextSnippet)
  ) {
    contextLines.push(`- Extracto relevante del apunte:\n"""\n${resolved.noteExcerpt}\n"""`);
  }
  if (!resolved.hasContextualEvidence) {
    contextLines.push(
      '- Contexto del apunte: Insuficiente o no proporcionado (solo se conoce el nombre del término).'
    );
  }

  const roleHeader = resolved.hasSpecificDiscipline
    ? `Eres un docente e investigador universitario de ${resolved.effectiveSubject}. Define con rigor académico y claridad didáctica el concepto "${resolved.termName}".`
    : `Eres un docente e investigador académico multidisciplinario. Define con precisión conceptual y prudencia epistémica el concepto "${resolved.termName}".`;

  const disciplineInstruction = resolved.hasSpecificDiscipline
    ? `1. ENCUADRE DISCIPLINAR Y DESAMBIGUACIÓN DE HOMÓNIMOS:
   - Define "${resolved.termName}" estrictamente desde la perspectiva de **${resolved.effectiveSubject}** (${resolved.disciplineLabel}).
   - Si el término es polisémico u homónimo en otras ciencias (p. ej., "Inhibición", "Asimilación", "Transferencia", "Esquema", "Resiliencia", "Vector"), adopta el significado técnico propio de ${resolved.effectiveSubject} y NO mezcles acepciones de otras disciplinas ajenas al apunte.`
    : `1. CRITERIO PARA ÁREA GENERAL O MULTIDISCIPLINARIA:
   - El área actual es **General o multidisciplinario** (no hay una disciplina única prefijada).
   - Si el fragmento del apunte determina claramente una disciplina concreta, define "${resolved.termName}" en ese marco.
   - Si el término tiene una acepción académica general clara y transversal, formula directamente esa definición general con precisión.
   - Si el término es ambiguo o polisémico (admite varias acepciones en distintas disciplinas como Psicología, Biología, Derecho, Ingeniería o Filosofía) y no hay contexto suficiente para elegir una sola:
     * Enuncia directamente el significado general del término en la primera oración de "academicDefinition" y distingue de forma concisa sus principales acepciones por disciplina.
     * NO inventes ni impongas arbitrariamente una disciplina concreta como si fuera la única.
     * En "academicField", escribe "General o multidisciplinario" cuando expongas múltiples acepciones o una definición general sin disciplina única.`;

  const epistemicInstruction = resolved.hasContextualEvidence
    ? `2. FIDELIDAD AL APUNTE Y HONESTIDAD EPISTÉMICA:
   - Ancla la definición en el sentido con que se emplea el término dentro del apunte.
   - NO inventes autores, fechas, citas bibliográficas ni datos empíricos que no estén respaldados por el apunte o por definiciones canónicas consolidadas.
   - Si el fragmento del apunte es breve o admite matices, mantén cautela e indícalo brevemente al final de "plainExplanation", sin preámbulos metadiscursivos.`
    : `2. HONESTIDAD EPISTÉMICA ANTE CONTEXTO LIMITADO O INSUFICIENTE:
   - No se dispone de texto del apunte para contextualizar "${resolved.termName}". Nunca inventes contexto inexistente, citas ni supuestos sobre un documento no proporcionado.
   - Si el término es unívoco, ofrece directamente su definición académica canónica.
   - Si el término admite varias acepciones según la disciplina, presenta primero su sentido general e identifica brevemente la ambigüedad (p. ej., qué significa en cada campo principal y qué dato del apunte permitiría acotarlo), sin usar largas introducciones metadiscursivas.`;

  const targetFrameLabel = resolved.hasSpecificDiscipline
    ? resolved.effectiveSubject
    : 'el ámbito académico correspondiente (o las disciplinas principales si el término es polisémico)';

  const fieldGuidance = resolved.hasSpecificDiscipline
    ? `Nombre específico de la disciplina o subdisciplina académica (p. ej., "${resolved.effectiveSubject}").`
    : `Escribe "General o multidisciplinario" si el término es transversal o ambiguo sin contexto suficiente; indica una disciplina específica solo si el texto del apunte la determina de forma inequívoca.`;

  return `${roleHeader}

CONTEXTO DISPONIBLE:
${contextLines.join('\n')}

REGLAS OBLIGATORIAS DE CALIDAD ACADÉMICA Y REDACCIÓN:
${disciplineInstruction}

${epistemicInstruction}

3. INICIO DIRECTO, COMPLETITUD GRAMATICAL Y PROHIBICIÓN DE METADISCURSO:
   - "academicDefinition": DEBE comenzar directamente en la primera palabra explicando qué es el concepto, su significado, categoría teórica o mecanismo en ${targetFrameLabel} (p. ej., "Proceso ejecutivo que...", "Corriente filosófica y cultural que...", "Concepto polisémico que designa...").
   - PROHIBIDO iniciar "academicDefinition" o "plainExplanation" con frases metadiscursivas sobre el apunte o la falta de contexto, como "Dado que el término carece de un contexto disciplinar específico en el apunte...", "Como no se especifica en el apunte...", "Ante la falta de contexto...".
   - "plainExplanation": DEBE explicar el concepto con lenguaje natural mediante una o más oraciones gramaticalmente completas con verbo principal (p. ej., "Consiste en...", "Se refiere a...", "Funciona como..."). PROHIBIDO comenzar con "Para un estudiante universitario, entender..." o dejar cláusulas infinitivas o subordinadas incompletas.
   - "illustrativeExample": Un ejemplo concreto, completo y aplicado que ilustre el concepto (especificando brevemente la disciplina si el término es multidisciplinario).
   - "academicField": ${fieldGuidance}
   - Todas las oraciones de todos los campos deben estar completas y terminar con punto final.

Devuelve ÚNICAMENTE un objeto JSON válido con las propiedades: "academicDefinition", "plainExplanation", "illustrativeExample" y "academicField".`;
}

const DANGLING_FINAL_TOKENS = new Set([
  'de',
  'del',
  'a',
  'al',
  'en',
  'con',
  'por',
  'para',
  'sin',
  'sobre',
  'entre',
  'hacia',
  'hasta',
  'segun',
  'mediante',
  'durante',
  'como',
  'que',
  'y',
  'e',
  'o',
  'u',
  'ni',
  'pero',
  'sino',
  'aunque',
  'si',
  'cuando',
  'donde',
  'mientras',
  'cuyo',
  'cuya',
  'cuyos',
  'cuyas',
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'su',
  'sus',
  'este',
  'esta',
  'estos',
  'estas',
  'ese',
  'esa',
  'esos',
  'esas',
  'es',
  'son',
  'fue',
  'era',
  'sea',
  'ser',
  'estar',
  'ha',
  'han',
  'habia',
  'puede',
  'pueden',
  'debe',
  'deben',
  'consiste',
  'radica',
]);

/**
 * Detecta estructuralmente si un texto está truncado o constituye una oración gramaticalmente incompleta:
 * - Cierre con puntos suspensivos (`...`, `…`), coma, dos puntos, punto y coma o guion;
 * - Ausencia de puntuación terminal válida (`.`, `!`, `?`);
 * - Paréntesis o comillas angulares desbalanceadas;
 * - Última palabra colgante (preposición, conjunción, artículo, determinante o auxiliar sin complemento);
 * - Cláusula subordinada inicial (`Dado que...`, `Puesto que...`, `Aunque...`) sin oración principal;
 * - Construcción infinitiva inicial (`Para un estudiante..., entender X...`) sin predicado verbal conjugado.
 */
export function isIncompleteOrTruncatedSentence(
  text?: string | null,
  minChars = 15
): boolean {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length < minChars) return true;

  // 1. Cierre abrupto con puntos suspensivos o signos de continuación
  if (/(\.{2,}|…|[,:;—–\-\\/])$/.test(trimmed)) {
    return true;
  }

  // 2. Desbalance de paréntesis o comillas angulares
  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  if (openParens !== closeParens) return true;

  const openGuillemets = (trimmed.match(/«/g) || []).length;
  const closeGuillemets = (trimmed.match(/»/g) || []).length;
  if (openGuillemets !== closeGuillemets) return true;

  // 3. Debe concluir con signo de cierre oracional (., !, ?) antes de posibles comillas o paréntesis finales
  const strippedTrailingQuotes = trimmed.replace(/['"»”)\]]+$/g, '').trim();
  if (!strippedTrailingQuotes || !/[.!?]$/.test(strippedTrailingQuotes)) {
    return true;
  }
  if (/(\.{2,}|…)$/.test(strippedTrailingQuotes)) {
    return true;
  }

  // 4. Verificar que la última palabra antes del signo final no sea una partícula colgante
  const bodyWithoutFinalPunct = strippedTrailingQuotes.replace(/[.!?]+$/g, '').trim();
  const words = normalizeConceptText(bodyWithoutFinalPunct).split(' ').filter(Boolean);
  if (words.length < 2) return true;

  const lastWord = words[words.length - 1];
  if (DANGLING_FINAL_TOKENS.has(lastWord)) {
    return true;
  }

  const normalizedFull = normalizeConceptText(trimmed);
  const sentences = strippedTrailingQuotes
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 5. Cláusula subordinada aislada sin oración principal tras coma
  if (
    sentences.length === 1 &&
    /^(dado que|puesto que|ya que|debido a que|en vista de que|a pesar de que|si bien|mientras que|cuando)\b/i.test(
      normalizedFull
    )
  ) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx === -1) {
      return true;
    }
    const afterComma = normalizeConceptText(trimmed.slice(commaIdx + 1));
    const afterWords = afterComma.split(' ').filter(Boolean);
    if (afterWords.length < 3) {
      return true;
    }
  }

  // 6. Frase infinitiva inicial ("Para un estudiante..., entender X...") sin verbo principal conjugado
  const firstSentenceNorm = normalizeConceptText(sentences[0] || trimmed);
  if (
    /^(para un\w*[\s,]+estudiante\w*|para el[\s,]+estudiante|como estudiante\w*|para)[\s,]+[a-z,\s]{0,35}\b(entender|comprender|analizar|estudiar|conocer|abordar|explicar|identificar)\b/.test(
      firstSentenceNorm
    )
  ) {
    const hasFiniteMainPredicate =
      /\b(es|son|consiste|significa|implica|permite|supone|representa|radica|ayuda|facilita|requiere|exige|se refiere|funciona|actua|sirve|constituye|define|describe|explica|muestra|indica)\b/.test(
        firstSentenceNorm
      );
    if (!hasFiniteMainPredicate) {
      return true;
    }
  }

  return false;
}

/**
 * Detecta si un campo de definición o explicación incurre en metadiscurso excesivo:
 * - Preámbulos justificativos sobre la falta de contexto, el apunte o la instrucción en lugar de definir directamente el término;
 * - Muletillas dirigidas al lector ("Para un estudiante universitario, entender X...") que desplazan o sustituyen la explicación sustantiva;
 * - Textos de una sola oración dominados por comentarios sobre el propio apunte en vez de explicar el concepto.
 */
export function hasExcessiveMetadiscourse(
  text?: string | null,
  fieldType: 'definition' | 'explanation' | 'example' = 'definition'
): boolean {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (!trimmed) return true;

  const norm = normalizeConceptText(trimmed);
  if (!norm) return true;

  const openingWindow = norm.slice(0, 150);

  // 1. Apertura metadiscursiva sobre el apunte, la consulta o la carencia de contexto
  const startsWithMetaCausalOpener =
    /^(dado que|puesto que|ya que|debido a que|como el termino|como no|al carecer|al no|ante la falta|ante la ausencia|en ausencia de|teniendo en cuenta que|considerando que|cabe senalar que|cabe aclarar que|es importante mencionar que|antes de definir|en el marco de este apunte|segun el contexto proporcionado)\b/.test(
      openingWindow
    );

  const mentionsMetaContextInOpener =
    /\b(contexto|apunte\w*|nota\w*|disciplin\w*|informacion|fragmento|especific\w*|proporcionad\w*|disponible|insuficiente|consulta)\b/.test(
      openingWindow
    );

  if (startsWithMetaCausalOpener && mentionsMetaContextInOpener) {
    return true;
  }

  // 2. Apertura con muletilla pedagógica o apelación al estudiante ("Para un estudiante universitario, entender...")
  if (fieldType === 'definition') {
    if (
      /^(para un\w*\s+estudiante\w*|para el\s+estudiante|como estudiante\w*|a nivel universitario|en el ambito universitario|para entender|para comprender|entender el|entender la|comprender el|comprender la)\b/.test(
        openingWindow
      )
    ) {
      return true;
    }
  }

  if (fieldType === 'explanation') {
    if (
      /^(para un\w*\s+estudiante\w*|para el\s+estudiante|como estudiante\w*|a nivel universitario)\b/.test(
        openingWindow
      )
    ) {
      return true;
    }
    if (/^(para entender|para comprender)\b/.test(openingWindow)) {
      const hasSubstantiveDefinitionMarker =
        /\b(consiste en|se refiere a|funciona como|es un proceso|es una corriente|es el mecanismo|es la capacidad|significa que|ocurre cuando)\b/.test(
          norm
        );
      if (!hasSubstantiveDefinitionMarker) {
        return true;
      }
    }
  }

  // 3. Si es una única oración y habla únicamente de que falta contexto sin definir el concepto
  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    sentences.length === 1 &&
    /\b(carece de un contexto|carece de contexto|falta de contexto|contexto insuficiente|sin un apunte especifico|no se proporciona contexto)\b/.test(
      norm
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Determina si un texto contiene frases genéricas de relleno, marcadores de error,
 * oraciones truncadas/incompletas o contenido vacío/trivial.
 */
export function isFillerOrInvalidDefinitionField(
  text?: string | null,
  termName?: string | null,
  minChars = 15,
  fieldType: 'definition' | 'explanation' | 'example' = 'definition'
): boolean {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (trimmed.length < minChars) return true;

  const norm = normalizeConceptText(trimmed);
  if (!norm || norm.length < minChars) return true;

  for (const phrase of KNOWN_FILLER_OR_INVALID_PHRASES) {
    if (norm.includes(phrase)) {
      return true;
    }
  }

  if (termName) {
    const normTerm = normalizeConceptText(termName);
    if (
      normTerm &&
      (norm === normTerm ||
        norm === `definicion de ${normTerm}` ||
        norm === `concepto de ${normTerm}` ||
        norm === `el termino ${normTerm}`)
    ) {
      return true;
    }
  }

  if (isIncompleteOrTruncatedSentence(trimmed, minChars)) {
    return true;
  }

  if (hasExcessiveMetadiscourse(trimmed, fieldType)) {
    return true;
  }

  return false;
}

/**
 * Verifica si un objeto de definición académica completo cumple todos los requisitos
 * para considerarse una definición válida y segura para el usuario y para `analysisCache`.
 */
export function isValidAcademicDefinitionPayload(
  payload?: Partial<ValidatedAcademicDefinition> | null,
  termName?: string | null
): payload is ValidatedAcademicDefinition {
  if (!payload || typeof payload !== 'object') return false;

  if (isFillerOrInvalidDefinitionField(payload.academicDefinition, termName, 20, 'definition')) {
    return false;
  }
  if (isFillerOrInvalidDefinitionField(payload.plainExplanation, termName, 15, 'explanation')) {
    return false;
  }
  if (isFillerOrInvalidDefinitionField(payload.illustrativeExample, termName, 15, 'example')) {
    return false;
  }

  // Evitar que la explicación sencilla sea una copia idéntica de la definición académica
  const normDef = normalizeConceptText(payload.academicDefinition);
  const normPlain = normalizeConceptText(payload.plainExplanation);
  if (normDef === normPlain) {
    return false;
  }

  return true;
}

/**
 * Extrae un bloque JSON si la respuesta viene envuelta en código Markdown (```json ... ```).
 */
function extractJsonCandidate(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return null;
}

/**
 * Parser de respaldo para respuestas etiquetadas por secciones (solo si contiene
 * explícitamente las secciones requeridas y sin inyectar nunca textos de relleno).
 */
function parseLabeledSectionsStrict(
  rawText: string
): Partial<ValidatedAcademicDefinition> | null {
  const lines = rawText.split('\n');
  let currentSection: 'def' | 'plain' | 'example' | 'field' | null = null;
  let academicDefinition = '';
  let plainExplanation = '';
  let illustrativeExample = '';
  let academicField = '';

  for (const rawLine of lines) {
    const l = rawLine.trim();
    if (!l) continue;

    const cleanHeader = l.replace(/^[-*#\d.\s]+/, '').replace(/\*\*/g, '').trim();

    if (
      /^(academicDefinition|d[eé]finici[oó]n\s+[aá]cad[eé]mic[aá]|d[eé]finici[oó]n)\s*:/i.test(
        cleanHeader
      )
    ) {
      currentSection = 'def';
      const inlineVal = cleanHeader.replace(/^[^:]*:\s*/, '').replace(/^\*+|\*+$/g, '').trim();
      if (inlineVal) academicDefinition += (academicDefinition ? '\n' : '') + inlineVal;
      continue;
    }
    if (
      /^(plainExplanation|l[eé]ngu[aá]j[eé]\s+s[eé]ncillo|[eé]xplic[aá]ci[oó]n\s+s[eé]ncill[aá]|[eé]xplic[aá]ci[oó]n)\s*:/i.test(
        cleanHeader
      )
    ) {
      currentSection = 'plain';
      const inlineVal = cleanHeader.replace(/^[^:]*:\s*/, '').replace(/^\*+|\*+$/g, '').trim();
      if (inlineVal) plainExplanation += (plainExplanation ? '\n' : '') + inlineVal;
      continue;
    }
    if (
      /^(illustrativeExample|[eé]j[eé]mplo\s+did[aá]ctico|[eé]j[eé]mplo\s+ilustr[aá]tivo|[eé]j[eé]mplo)\s*:/i.test(
        cleanHeader
      )
    ) {
      currentSection = 'example';
      const inlineVal = cleanHeader.replace(/^[^:]*:\s*/, '').replace(/^\*+|\*+$/g, '').trim();
      if (inlineVal) illustrativeExample += (illustrativeExample ? '\n' : '') + inlineVal;
      continue;
    }
    if (
      /^(academicField|disciplin[aá]|c[aá]mpo\s+[aá]cad[eé]mico|c[aá]mpo)\s*:/i.test(cleanHeader)
    ) {
      currentSection = 'field';
      const inlineVal = cleanHeader.replace(/^[^:]*:\s*/, '').replace(/^\*+|\*+$/g, '').trim();
      if (inlineVal) academicField = inlineVal;
      continue;
    }

    const cleanContent = l.replace(/^\*+|\*+$/g, '').trim();
    if (currentSection === 'def') {
      academicDefinition += (academicDefinition ? '\n' : '') + cleanContent;
    } else if (currentSection === 'plain') {
      plainExplanation += (plainExplanation ? '\n' : '') + cleanContent;
    } else if (currentSection === 'example') {
      illustrativeExample += (illustrativeExample ? '\n' : '') + cleanContent;
    }
  }

  if (!academicDefinition && !plainExplanation && !illustrativeExample) {
    return null;
  }

  return {
    academicDefinition: academicDefinition.trim(),
    plainExplanation: plainExplanation.trim(),
    illustrativeExample: illustrativeExample.trim(),
    academicField: academicField.trim(),
  };
}

/**
 * Parsea y valida de forma estricta la respuesta del modelo para una definición académica (Stage B).
 * Prioriza JSON estructurado y valida que ningún campo esté vacío, truncado, circular o relleno con frases genéricas.
 * Cuando no existe disciplina específica ni contexto del apunte, evita que se invente una disciplina concreta si la respuesta es general/multidisciplinaria.
 */
export function parseAndValidateDefinitionResponse(
  rawText: string,
  options: {
    termName: string;
    defaultAcademicField?: string;
    hasSpecificDiscipline?: boolean;
    hasContextualEvidence?: boolean;
  }
): ValidatedAcademicDefinition {
  const trimmed = typeof rawText === 'string' ? rawText.trim() : '';
  if (!trimmed) {
    throw new ConceptDefinitionError(
      'MALFORMED_RESPONSE',
      `El modelo devolvió una respuesta vacía al definir "${options.termName}".`,
      502,
      true,
      'Empty model response text',
      'json_parse'
    );
  }

  let candidateObj: Partial<ValidatedAcademicDefinition> | null = null;
  const jsonCandidate = extractJsonCandidate(trimmed);

  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        candidateObj = {
          academicDefinition:
            typeof record.academicDefinition === 'string'
              ? record.academicDefinition.trim()
              : typeof record.definition === 'string'
                ? record.definition.trim()
                : '',
          plainExplanation:
            typeof record.plainExplanation === 'string'
              ? record.plainExplanation.trim()
              : typeof record.explanation === 'string'
                ? record.explanation.trim()
                : '',
          illustrativeExample:
            typeof record.illustrativeExample === 'string'
              ? record.illustrativeExample.trim()
              : typeof record.example === 'string'
                ? record.example.trim()
                : '',
          academicField:
            typeof record.academicField === 'string'
              ? record.academicField.trim()
              : typeof record.discipline === 'string'
                ? record.discipline.trim()
                : '',
        };
      }
    } catch {
      candidateObj = parseLabeledSectionsStrict(trimmed);
    }
  } else {
    candidateObj = parseLabeledSectionsStrict(trimmed);
  }

  if (!candidateObj) {
    throw new ConceptDefinitionError(
      'MALFORMED_RESPONSE',
      `La respuesta del modelo para "${options.termName}" no tiene un formato estructurado válido.`,
      502,
      true,
      sanitizeDiagnosticReason(trimmed, 160),
      'json_parse'
    );
  }

  if (!isValidAcademicDefinitionPayload(candidateObj, options.termName)) {
    throw new ConceptDefinitionError(
      'MALFORMED_RESPONSE',
      `La definición generada para "${options.termName}" está incompleta o contiene texto genérico no válido.`,
      502,
      true,
      sanitizeDiagnosticReason(JSON.stringify(candidateObj), 180),
      'payload_validation'
    );
  }

  const fallbackField = (options.defaultAcademicField || 'General o multidisciplinario').trim();
  const rawModelField = (candidateObj.academicField || '').trim();
  const isContextStrictlyGeneralAndEmpty =
    options.hasSpecificDiscipline === false && options.hasContextualEvidence === false;

  let resolvedField: string;
  if (isContextStrictlyGeneralAndEmpty) {
    // Si el área es General/multidisciplinaria y no hay texto del apunte, no inventar una disciplina concreta
    // cuando la propia definición reconoce múltiples acepciones o carece de contexto.
    const normDef = normalizeConceptText(candidateObj.academicDefinition);
    const mentionsMultipleDisciplinesOrAmbiguity =
      normDef.includes('ambig') ||
      normDef.includes('polisem') ||
      normDef.includes('acepcion') ||
      normDef.includes('disciplina') ||
      normDef.includes('contexto insuficiente') ||
      normDef.includes('segun el ambito') ||
      normDef.includes('dependiendo del campo');

    if (
      !rawModelField ||
      isGenericDisciplineLabel(rawModelField) ||
      mentionsMultipleDisciplinesOrAmbiguity
    ) {
      resolvedField = 'General o multidisciplinario';
    } else {
      resolvedField = rawModelField;
    }
  } else if (rawModelField && !isGenericDisciplineLabel(rawModelField)) {
    resolvedField = rawModelField;
  } else if (!isGenericDisciplineLabel(fallbackField)) {
    resolvedField = fallbackField;
  } else {
    resolvedField =
      rawModelField && normalizeConceptText(rawModelField).includes('multidisciplin')
        ? 'General o multidisciplinario'
        : fallbackField || 'General o multidisciplinario';
  }

  return {
    academicDefinition: candidateObj.academicDefinition.trim(),
    plainExplanation: candidateObj.plainExplanation.trim(),
    illustrativeExample: candidateObj.illustrativeExample.trim(),
    academicField: resolvedField,
  };
}

/**
 * Clasifica errores durante la generación de definiciones contextuales conservando la etapa del fallo
 * y distinguiendo cuota agotada, límite temporal, alta demanda, timeout y solicitud inválida.
 */
export function classifyDefinitionError(
  error: unknown,
  defaultStage: DefinitionFailureStage = 'model_invocation'
): ConceptDefinitionError {
  if (error instanceof ConceptDefinitionError) {
    return error;
  }

  const analyzed = analyzeApiErrorDetails(error, 'al generar la definición académica');
  const rawMessage = sanitizeDiagnosticReason(
    (error as any)?.message || String(error || 'Error desconocido')
  );

  return new ConceptDefinitionError(
    analyzed.kind,
    analyzed.userMessage,
    analyzed.statusCode,
    analyzed.retryable,
    rawMessage,
    defaultStage,
    analyzed.category
  );
}

export interface DefinitionInvokeParams {
  model: string;
  prompt: string;
  attempt: number;
  termName: string;
  areaId: AcademicAreaId;
}

/**
 * Ejecuta la generación de definición contextual con reintentos controlados,
 * conmutación entre modelo primario y de respaldo, diagnóstico por etapas y validación estricta.
 * Aplica la política quirúrgica de cuota:
 * - Ante 429 RESOURCE_EXHAUSTED: no repite inmediatamente el mismo modelo; permite como máximo 1 intento
 *   con el alternativo y, si también falla por cuota, detiene de inmediato los reintentos.
 * - Ante 503, indisponibilidad o timeout: conserva reintentos limitados con espera progresiva.
 * - Ante errores permanentes (400, credenciales): falla inmediatamente sin reintentar.
 */
export async function generateContextualDefinitionWithResilience(
  input: ContextualDefinitionTermInput,
  invokeModel: (params: DefinitionInvokeParams) => Promise<string>,
  options?: {
    models?: string[];
    maxAttemptsPerModel?: number;
    retryDelayMs?: number;
    onDiagnostic?: (diag: DefinitionAttemptDiagnostic) => void;
  }
): Promise<{
  definition: ValidatedAcademicDefinition;
  modelUsed: string;
  attemptsUsed: number;
  resolvedContext: ResolvedDefinitionPromptContext;
  diagnostics: DefinitionAttemptDiagnostic[];
}> {
  const resolvedContext = resolveDefinitionPromptContext(input);
  if (!resolvedContext.termName) {
    throw new ConceptDefinitionError(
      'INVALID_REQUEST',
      'Nombre del término requerido para definición contextual.',
      400,
      false,
      'Missing termName in request',
      'request_validation',
      'invalid_request'
    );
  }

  const prompt = buildContextualDefinitionPrompt(input);
  const baseDelayMs = options?.retryDelayMs ?? 800;
  const diagnostics: DefinitionAttemptDiagnostic[] = [];

  const models =
    options?.models && options.models.length > 0
      ? options.models
      : [DEFINITION_PRIMARY_MODEL, DEFINITION_FALLBACK_MODEL];
  const maxAttemptsPerModel = Math.max(1, options?.maxAttemptsPerModel ?? 2);

  let currentModelIndex = 0;
  let attemptCountForCurrentModel = 0;
  let totalAttempts = 0;
  let switchedDueTo429 = false;
  let lastError: ConceptDefinitionError | null = null;

  while (currentModelIndex < models.length) {
    const model = models[currentModelIndex];
    totalAttempts++;
    attemptCountForCurrentModel++;

    try {
      const rawText = await invokeModel({
        model,
        prompt,
        attempt: totalAttempts,
        termName: resolvedContext.termName,
        areaId: resolvedContext.areaId,
      });

      const validated = parseAndValidateDefinitionResponse(rawText, {
        termName: resolvedContext.termName,
        defaultAcademicField: resolvedContext.effectiveSubject,
        hasSpecificDiscipline: resolvedContext.hasSpecificDiscipline,
        hasContextualEvidence: resolvedContext.hasContextualEvidence,
      });

      return {
        definition: validated,
        modelUsed: model,
        attemptsUsed: totalAttempts,
        resolvedContext,
        diagnostics,
      };
    } catch (err: unknown) {
      const classified = classifyDefinitionError(err, 'model_invocation');
      lastError = classified;

      const diag: DefinitionAttemptDiagnostic = {
        stage: classified.stage,
        attempt: totalAttempts,
        model,
        errorKind: classified.kind,
        statusCode: classified.statusCode,
        retryable: classified.retryable,
        areaId: resolvedContext.areaId,
        hasSpecificDiscipline: resolvedContext.hasSpecificDiscipline,
        hasContextualEvidence: resolvedContext.hasContextualEvidence,
        reason: sanitizeDiagnosticReason(classified.details || classified.message),
      };
      diagnostics.push(diag);
      options?.onDiagnostic?.(diag);

      // 1. Error permanente (400, credenciales inválidas, etc.): jamás reintentar
      if (
        !classified.retryable ||
        classified.statusCode === 400 ||
        classified.statusCode === 401 ||
        classified.statusCode === 403
      ) {
        throw classified;
      }

      // 2. Límite de cuota o solicitudes (429 RESOURCE_EXHAUSTED):
      if (classified.statusCode === 429) {
        // No repetir inmediatamente el mismo modelo.
        // Si ya habíamos conmutado al modelo alternativo por 429 y este también falla por cuota:
        // detener de inmediato los reintentos y lanzar el error estructurado
        if (switchedDueTo429) {
          throw classified;
        }

        switchedDueTo429 = true;
        currentModelIndex++;
        attemptCountForCurrentModel = 0;

        if (currentModelIndex >= models.length) {
          throw classified;
        }

        if (baseDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(baseDelayMs, 300)));
        }
        continue;
      }

      // 3. Errores transitorios (503 alta demanda, timeout 504, formato malformado):
      // Permite hasta maxAttemptsPerModel en el modelo actual.
      // Si el modelo principal dio 429 y el alternativo da 503 o timeout,
      // permite una recuperación razonable con espera en el alternativo (hasta maxAttemptsPerModel, acotando a 3 llamadas totales)
      if (attemptCountForCurrentModel < maxAttemptsPerModel) {
        if (baseDelayMs > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, baseDelayMs * attemptCountForCurrentModel)
          );
        }
        continue;
      } else {
        currentModelIndex++;
        attemptCountForCurrentModel = 0;
        if (currentModelIndex < models.length && baseDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, baseDelayMs));
        }
      }
    }
  }

  throw (
    lastError ||
    new ConceptDefinitionError(
      'TRANSIENT_ERROR',
      `No se pudo obtener una definición válida para "${resolvedContext.termName}".`,
      503,
      true,
      'All definition attempts exhausted',
      'model_invocation'
    )
  );
}

/**
 * Construye el prompt para Modalidad B: Búsqueda de fuentes en Google Search.
 * Respeta el contexto académico resuelto y exige redacción directa sin metadiscurso.
 */
export function buildSearchSourcesPrompt(input: ContextualDefinitionTermInput): string {
  const resolved = resolveDefinitionPromptContext(input);
  const frameDescription = resolved.hasSpecificDiscipline
    ? `${resolved.effectiveSubject} (${resolved.disciplineLabel})`
    : 'General o multidisciplinario';

  return `Realiza una búsqueda documental y bibliográfica en Google Search para el término académico "${resolved.termName}".
Área o asignatura: "${frameDescription}".
${resolved.noteTitle ? `Título del apunte: "${resolved.noteTitle}".\n` : ''}${
    resolved.contextSnippet
      ? `Contexto en el apunte: "${resolved.contextSnippet}".\n`
      : 'Contexto en el apunte: Sin fragmento específico proporcionado.\n'
  }
INSTRUCCIONES OBLIGATORIAS:
1. Consulta fuentes académicas, universitarias, manuales o publicaciones especializadas mediante Google Search.
2. NO inventes enlaces ni afirmaciones ausentes en las fuentes.
3. Redacta cada sección con oraciones completas y directas:
   - "academicDefinition": Comienza directamente explicando qué es "${resolved.termName}" según las fuentes académicas (en ${frameDescription}). PROHIBIDO empezar con "Dado que el término carece de contexto..." o introducciones metadiscursivas.
   - "plainExplanation": Explica el concepto en lenguaje claro mediante una o más oraciones completas con verbo principal. PROHIBIDO empezar con "Para un estudiante universitario, entender...".
   - "illustrativeExample": Ejemplo concreto y completo de aplicación.
   - "academicField": Disciplina académica confirmada o "General o multidisciplinario" si el término se aborda en múltiples disciplinas sin contexto específico.

Devuelve las secciones con este formato exacto:
academicDefinition: <definición directa y completa>
plainExplanation: <explicación clara y completa>
illustrativeExample: <ejemplo concreto y completo>
academicField: <disciplina o General o multidisciplinario>`;
}

/**
 * Construye el prompt para Modalidad C: Contrastación rigurosa con Google Search Grounding.
 * Distingue explícitamente entre encontrar fuentes relacionadas y verificar una afirmación.
 */
export function buildVerifyGroundingPrompt(input: ContextualDefinitionTermInput): string {
  const resolved = resolveDefinitionPromptContext(input);
  const frameDescription = resolved.hasSpecificDiscipline
    ? `${resolved.effectiveSubject} (${resolved.disciplineLabel})`
    : 'General o multidisciplinario';

  return `Realiza una contrastación académica rigurosa mediante Google Search Grounding para el concepto "${resolved.termName}".
Área o asignatura: "${frameDescription}".
${resolved.noteTitle ? `Título del apunte: "${resolved.noteTitle}".\n` : ''}${
    resolved.contextSnippet
      ? `Afirmación o contexto en el apunte del estudiante: "${resolved.contextSnippet}".\n`
      : 'Contexto en el apunte: Solo se proporcionó el nombre del término.\n'
  }
INSTRUCCIONES DE VERIFICACIÓN Y REDACCIÓN:
1. Utiliza Google Search Grounding para contrastar el concepto con fuentes académicas verificables.
2. DIFERENCIA ENTRE ENCONTRAR FUENTES Y VERIFICAR UNA AFIRMACIÓN:
   - "verificado": ÚNICAMENTE cuando las fuentes recuperadas respaldan directamente la definición técnica del concepto en el marco indicado.
   - "discrepancia": Cuando las fuentes académicas muestran posturas teóricas contrapuestas o contradicen el sentido planteado.
   - "no_verificado": Cuando no existen fuentes suficientes o cuando los enlaces encontrados son tangenciales y no permiten verificar la afirmación.
3. REGLAS DE ESTILO (SIN METADISCURSO NI FRASES INCOMPLETAS):
   - "academicDefinition": Comienza directamente explicando qué es el concepto, su significado o su mecanismo. PROHIBIDO iniciar con "Dado que el término carece de un contexto...".
   - "plainExplanation": Explica el concepto con lenguaje natural y oraciones completas. PROHIBIDO comenzar con "Para un estudiante universitario, entender...".
   - "illustrativeExample": Ejemplo aplicado y completo.
   - "academicField": Disciplina confirmada o "General o multidisciplinario".

Devuelve las secciones con este formato exacto:
academicDefinition: <definición directa y respaldada>
plainExplanation: <explicación sencilla en oración completa>
illustrativeExample: <ejemplo concreto y completo>
academicField: <disciplina>
verificationStatus: <verificado | discrepancia | no_verificado>`;
}

/**
 * Extrae de forma segura las fuentes web reales (`http`/`https`) y los segmentos respaldados
 * a partir del objeto `groundingMetadata` devuelto por Gemini.
 */
export function extractGroundingSourcesAndSegments(
  groundingMeta: unknown,
  defaultTitle = 'Fuente académica consultada en Google Search'
): {
  uniqueSources: SourceReference[];
  supportedSegments: string[];
  queriesConsulted: string[];
} {
  const meta = groundingMeta as {
    groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    groundingSupports?: Array<{
      groundingChunkIndices?: number[];
      segment?: { text?: string };
    }>;
    webSearchQueries?: string[];
  } | null;

  const sources: SourceReference[] = [];
  const supportedSegments: string[] = [];
  const chunks = Array.isArray(meta?.groundingChunks) ? meta!.groundingChunks : [];
  const supports = Array.isArray(meta?.groundingSupports) ? meta!.groundingSupports : [];
  const nowIso = new Date().toISOString();

  chunks.forEach((chunk, index) => {
    const rawUri = typeof chunk?.web?.uri === 'string' ? chunk.web.uri.trim() : '';
    if (!rawUri || !/^https?:\/\//i.test(rawUri)) {
      return;
    }

    let snippet = '';
    for (const sup of supports) {
      if (
        Array.isArray(sup?.groundingChunkIndices) &&
        sup.groundingChunkIndices.includes(index) &&
        typeof sup?.segment?.text === 'string'
      ) {
        const cleanSeg = sup.segment.text.trim();
        if (cleanSeg) {
          if (!snippet) snippet = cleanSeg;
          if (!supportedSegments.includes(cleanSeg)) {
            supportedSegments.push(cleanSeg);
          }
        }
      }
    }

    const rawTitle = typeof chunk?.web?.title === 'string' ? chunk.web.title.trim() : '';
    sources.push({
      title: rawTitle || defaultTitle,
      url: rawUri,
      snippet: snippet || undefined,
      accessedAt: nowIso,
    });
  });

  const uniqueSources = sources.filter(
    (s, idx, arr) => idx === arr.findIndex((x) => x.url === s.url)
  );

  const queriesConsulted = Array.isArray(meta?.webSearchQueries)
    ? meta!.webSearchQueries.map((q) => String(q).trim()).filter(Boolean)
    : [];

  return {
    uniqueSources,
    supportedSegments,
    queriesConsulted,
  };
}

/**
 * Extrae el estado `verificationStatus` reportado explícitamente por el modelo (por defecto `'no_verificado'`,
 * nunca `'verificado'` por omisión) y valida los campos de la definición con las mismas reglas estrictas de Stage B.
 */
export function parseAndValidateSearchGroundingResponse(
  rawText: string,
  options: {
    termName: string;
    defaultAcademicField?: string;
    hasSpecificDiscipline?: boolean;
    hasContextualEvidence?: boolean;
  }
): ValidatedAcademicDefinition & { reportedStatus: VerificationStatus } {
  const trimmed = typeof rawText === 'string' ? rawText.trim() : '';
  let reportedStatus: VerificationStatus = 'no_verificado';

  // Intentar detectar verificationStatus en JSON o en línea etiquetada
  const jsonCandidate = extractJsonCandidate(trimmed);
  if (jsonCandidate) {
    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
      const rawStatus =
        typeof parsed?.verificationStatus === 'string' ? parsed.verificationStatus.trim() : '';
      if (/^discrepancia$/i.test(rawStatus)) {
        reportedStatus = 'discrepancia';
      } else if (/^verificado$/i.test(rawStatus)) {
        reportedStatus = 'verificado';
      } else if (/^(no_verificado|no verificado)$/i.test(rawStatus)) {
        reportedStatus = 'no_verificado';
      }
    } catch {
      // Continúa con inspección por líneas
    }
  }

  for (const rawLine of trimmed.split('\n')) {
    const cleanHeader = rawLine.trim().replace(/^[-*#\d.\s]+/, '').replace(/\*\*/g, '').trim();
    if (/^(verificationStatus|[eé]st[aá]do\s+d[eé]\s+v[eé]rific[aá]ci[oó]n)\s*:/i.test(cleanHeader)) {
      const val = cleanHeader.replace(/^[^:]*:\s*/, '').trim();
      if (/discrepancia/i.test(val)) {
        reportedStatus = 'discrepancia';
      } else if (/no[_\s]?verificado/i.test(val)) {
        reportedStatus = 'no_verificado';
      } else if (/\bverificado\b/i.test(val)) {
        reportedStatus = 'verificado';
      }
    }
  }

  // Limpiar la línea verificationStatus antes de pasar al parser de secciones para que no se concatene al ejemplo
  const textWithoutStatusLine = trimmed
    .split('\n')
    .filter((line) => {
      const clean = line.trim().replace(/^[-*#\d.\s]+/, '').replace(/\*\*/g, '').trim();
      return !/^(verificationStatus|[eé]st[aá]do\s+d[eé]\s+v[eé]rific[aá]ci[oó]n)\s*:/i.test(clean);
    })
    .join('\n');

  const validated = parseAndValidateDefinitionResponse(textWithoutStatusLine, options);
  return {
    ...validated,
    reportedStatus,
  };
}

/**
 * Resuelve de forma honesta el estado de Modalidad B (Búsqueda de fuentes en Google Search):
 * Encontrar enlaces web NUNCA marca `verificationStatus: 'verificado'`.
 */
export function resolveSearchSourcesOutcome(params: {
  uniqueSources: SourceReference[];
  searchPerformed: boolean;
}): {
  verificationStatus: VerificationStatus;
  queryStatus: TermQueryStatus;
  groundingUsed: boolean;
  notice: string;
} {
  const hasSources = params.searchPerformed && params.uniqueSources.length > 0;
  if (hasSources) {
    return {
      verificationStatus: 'no_verificado',
      queryStatus: 'fuentes_consultadas',
      groundingUsed: false,
      notice:
        'Fuentes web consultadas mediante Google Search. Encontrar fuentes de referencia no equivale a verificar automáticamente las afirmaciones del apunte.',
    };
  }

  return {
    verificationStatus: 'no_verificado',
    queryStatus: 'sin_verificar',
    groundingUsed: false,
    notice:
      'Búsqueda completada en Google Search: no se encontraron fuentes web específicas para este término.',
  };
}

/**
 * Resuelve de forma honesta el estado de Modalidad C (Contrastación con Google Search Grounding):
 * - Si no se ejecutó la búsqueda o no hay fuentes web verificables (`uniqueSources.length === 0`), nunca marca `'verificado'` ni `'contrastado_web'`.
 * - Si hay fuentes pero el modelo o el texto señalan falta de respaldo para la afirmación, mantiene `verificationStatus: 'no_verificado'` (diferenciando entre hallar enlaces y verificar una afirmación).
 * - Si hay discrepancias teóricas entre fuentes, marca `verificationStatus: 'discrepancia'`.
 * - Solo marca `verificationStatus: 'verificado'` cuando existen fuentes reales y el modelo confirmó `'verificado'` sin indicadores de falta de evidencia.
 */
export function resolveVerifyGroundingOutcome(params: {
  uniqueSources: SourceReference[];
  supportedSegments: string[];
  reportedStatus: VerificationStatus;
  rawText: string;
  searchPerformed: boolean;
}): {
  verificationStatus: VerificationStatus;
  queryStatus: TermQueryStatus;
  groundingUsed: boolean;
  notice: string;
} {
  if (!params.searchPerformed || params.uniqueSources.length === 0) {
    return {
      verificationStatus: 'no_verificado',
      queryStatus: 'sin_verificar',
      groundingUsed: false,
      notice:
        'No se encontraron fuentes web verificables en Google Search Grounding para contrastar este concepto.',
    };
  }

  const normText = normalizeConceptText(params.rawText);
  const indicatesUnverified =
    params.reportedStatus === 'no_verificado' ||
    normText.includes('no se pudo verificar') ||
    normText.includes('sin respaldo suficiente') ||
    normText.includes('evidencia insuficiente') ||
    normText.includes('carece de respaldo');

  const indicatesDiscrepancy =
    params.reportedStatus === 'discrepancia' ||
    normText.includes('discrepancia') ||
    normText.includes('posturas encontradas') ||
    normText.includes('contradiccion entre fuentes');

  if (indicatesDiscrepancy && !indicatesUnverified) {
    return {
      verificationStatus: 'discrepancia',
      queryStatus: 'contrastado_web',
      groundingUsed: true,
      notice:
        'Contrastado con fuentes web: se detectaron discrepancias o posturas teóricas divergentes en la literatura consultada.',
    };
  }

  if (indicatesUnverified) {
    return {
      verificationStatus: 'no_verificado',
      queryStatus: 'contrastado_web',
      groundingUsed: true,
      notice:
        'Se localizaron fuentes web relacionadas, pero no aportan respaldo suficiente para verificar la afirmación en este contexto.',
    };
  }

  return {
    verificationStatus: 'verificado',
    queryStatus: 'contrastado_web',
    groundingUsed: true,
    notice:
      params.supportedSegments.length > 0
        ? 'Afirmaciones contrastadas y respaldadas con fuentes web vía Google Search Grounding.'
        : 'Concepto contrastado con fuentes web vía Google Search Grounding.',
  };
}

/**
 * Clasifica errores de Search / Grounding produciendo mensajes honestos que reflejan la causa real
 * (cuota 429, alta demanda 503, timeout 504, herramienta no soportada por el modelo 502 o solicitud inválida 400).
 */
export function classifySearchGroundingError(
  error: unknown,
  modality: 'google_search' | 'grounding' = 'google_search',
  defaultStage: DefinitionFailureStage = 'model_invocation'
): ConceptDefinitionError {
  if (error instanceof ConceptDefinitionError) {
    return error;
  }

  const action =
    modality === 'grounding'
      ? 'al contrastar con Google Search Grounding'
      : 'al buscar fuentes en Google Search';
  const analyzed = analyzeApiErrorDetails(error, action);
  const rawMessage = sanitizeDiagnosticReason(
    (error as any)?.message || String(error || 'Error desconocido')
  );

  return new ConceptDefinitionError(
    analyzed.kind,
    analyzed.userMessage,
    analyzed.statusCode,
    analyzed.retryable,
    rawMessage,
    defaultStage,
    analyzed.category
  );
}
