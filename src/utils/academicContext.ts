/**
 * Nexo Notes — Motor de Contexto Académico Inteligente (Fase 1)
 *
 * Responsabilidades:
 * A. Catálogo de las 9 áreas académicas oficiales y vocabulario disciplinario ponderado.
 * B. Inferencia local determinista de disciplina por nota (`inferNoteDiscipline`), sin llamadas a IA.
 * C. Resolución jerárquica de 4 niveles + desambiguación (`resolveAcademicContext`).
 * D. Generación segura de claves de caché contextuales (`buildAnalysisCacheKey`).
 */

import {
  AcademicAreaId,
  AcademicProfile,
  AppPreferences,
  ContextResolutionSource,
  DisciplineEvidenceLevel,
  DisciplineMode,
  FolderEntity,
  NoteEntity,
  ResolvedAcademicContext,
} from '../types/models';

export interface AcademicAreaDefinition {
  id: AcademicAreaId;
  label: string;
  shortLabel: string;
  description: string;
  /** Alias directos para reconocer nombres de áreas o instrucciones explícitas */
  aliases: string[];
  /** Términos generales del nombre del área que no añaden matiz extra en la clave de caché */
  broadAreaTerms: string[];
  /** Términos o raíces de alta especificidad disciplinaria (peso base alto: 3.0) */
  anchorTerms: string[];
  /** Términos o raíces de apoyo contextual (peso base moderado: 1.5) */
  contextualTerms: string[];
}

export interface PolysemousTermDefinition {
  term: string;
  relatedAreas: AcademicAreaId[];
  note: string;
}

/**
 * Términos académicos polisémicos que cambian sustancialmente de significado
 * según la disciplina y NO deben disparar alta confianza cuando aparecen aislados.
 */
export const POLYSEMOUS_ACADEMIC_TERMS: PolysemousTermDefinition[] = [
  {
    term: 'humanismo',
    relatedAreas: ['psicologia', 'humanidades_filosofia', 'educacion'],
    note: 'Corriente terapéutica (Rogers/Maslow) en psicología vs. movimiento filosófico-histórico renacentista.',
  },
  {
    term: 'humanista',
    relatedAreas: ['psicologia', 'humanidades_filosofia', 'educacion'],
    note: 'Enfoque centrado en la persona en psicología vs. tradición clásica y filosófica en humanidades.',
  },
  {
    term: 'alienacion',
    relatedAreas: ['humanidades_filosofia', 'ciencias_sociales', 'psicologia', 'economia_negocios_derecho'],
    note: 'Concepto filosófico (Hegel/Marx), sociológico, psicopatológico o jurídico.',
  },
  {
    term: 'estructura',
    relatedAreas: ['ciencias_sociales', 'psicologia', 'ingenieria_tecnologia', 'ciencias_naturales'],
    note: 'Estructura social, estructura psíquica, estructura de datos o estructura molecular.',
  },
  {
    term: 'estructuralismo',
    relatedAreas: ['psicologia', 'humanidades_filosofia', 'ciencias_sociales', 'economia_negocios_derecho'],
    note: 'Wundt/Titchener en psicología, Saussure/Lévi-Strauss en humanidades y ciencias sociales, CEPAL en economía.',
  },
  {
    term: 'resiliencia',
    relatedAreas: ['psicologia', 'ingenieria_tecnologia', 'ciencias_naturales', 'ciencias_sociales'],
    note: 'Adaptación psicológica ante la adversidad, tolerancia a fallos en sistemas o elasticidad de materiales.',
  },
  {
    term: 'paradigma',
    relatedAreas: ['humanidades_filosofia', 'ciencias_naturales', 'ingenieria_tecnologia', 'ciencias_sociales'],
    note: 'Epistemología (Kuhn), paradigmas de programación o modelos de investigación social.',
  },
  {
    term: 'sistema',
    relatedAreas: ['ingenieria_tecnologia', 'salud_vida', 'ciencias_sociales', 'psicologia'],
    note: 'Sistema informático, sistema biológico/fisiológico, sistema social o terapia sistémica.',
  },
  {
    term: 'sujeto',
    relatedAreas: ['humanidades_filosofia', 'psicologia', 'economia_negocios_derecho', 'ciencias_sociales'],
    note: 'Sujeto cognoscente, sujeto clínico/inconsciente, sujeto de derecho o actor social.',
  },
  {
    term: 'identidad',
    relatedAreas: ['psicologia', 'ciencias_sociales', 'humanidades_filosofia', 'ciencias_naturales'],
    note: 'Identidad personal/ego, identidad cultural/colectiva, principio lógico de identidad o identidad matemática.',
  },
  {
    term: 'conducta',
    relatedAreas: ['psicologia', 'economia_negocios_derecho', 'salud_vida', 'educacion'],
    note: 'Comportamiento psicológico, conducta típica antijurídica o pauta clínica.',
  },
  {
    term: 'memoria',
    relatedAreas: ['psicologia', 'ingenieria_tecnologia', 'humanidades_filosofia', 'salud_vida'],
    note: 'Memoria cognitiva/episódica, memoria RAM/caché, memoria histórica o memoria inmunológica.',
  },
  {
    term: 'red',
    relatedAreas: ['ingenieria_tecnologia', 'ciencias_sociales', 'psicologia', 'salud_vida'],
    note: 'Red de computadoras, red social/comunitaria o red neuronal.',
  },
  {
    term: 'cultura',
    relatedAreas: ['ciencias_sociales', 'humanidades_filosofia', 'educacion', 'economia_negocios_derecho'],
    note: 'Antropología cultural, historia cultural o cultura organizacional.',
  },
];

/**
 * A. Catálogo oficial de las 9 áreas académicas
 */
export const ACADEMIC_AREA_CATALOG: Record<AcademicAreaId, AcademicAreaDefinition> = {
  psicologia: {
    id: 'psicologia',
    label: 'Psicología',
    shortLabel: 'Psicología',
    description: 'Procesos cognitivos, afectivos, conductuales, psicopatología, evaluación y psicoterapia.',
    aliases: [
      'psicologia',
      'psicologico',
      'psicologica',
      'psicoterapia',
      'psicoanalisis',
      'neuropsicologia',
      'psicopatologia',
      'salud mental',
    ],
    broadAreaTerms: ['psicologia', 'psicologico', 'psicologica'],
    anchorTerms: [
      'psicologia',
      'psicopatolog',
      'psicoterapi',
      'psicoanal',
      'neuropsicolog',
      'cognitivo conductual',
      'psicologia humanista',
      'terapia humanista',
      'carl rogers',
      'abraham maslow',
      'autorrealizacion',
      'condicionamiento clasico',
      'condicionamiento operante',
      'inconsciente',
      'transferencia',
      'contratransferencia',
      'mecanismos de defensa',
      'dsm',
      'cie 11',
      'memoria de trabajo',
      'funciones ejecutivas',
      'disonancia cognitiva',
      'apego',
      'psicometr',
      'trastorno de ansiedad',
      'trastorno depresivo',
      'esquizofrenia',
      'vygotsky',
      'piaget',
      'skinner',
      'bandura',
      'freud',
      'lacan',
      'beck',
    ],
    contextualTerms: [
      'cognitiv',
      'conductual',
      'afectiv',
      'emocion',
      'motivacion',
      'percepcion',
      'atencion',
      'personalidad',
      'autoestima',
      'terapia',
      'clinica psicologica',
      'evaluacion psicologica',
      'trauma',
      'duelo',
      'ansiedad',
      'depresion',
      'subjetividad',
    ],
  },

  salud_vida: {
    id: 'salud_vida',
    label: 'Salud y ciencias de la vida',
    shortLabel: 'Salud y vida',
    description: 'Medicina, biología, enfermería, farmacología, anatomía, fisiología y ciencias biomédicas.',
    aliases: [
      'salud y ciencias de la vida',
      'ciencias de la salud',
      'ciencias de la vida',
      'medicina',
      'biologia',
      'enfermeria',
      'farmacologia',
      'fisiologia',
      'anatomia',
      'biomedicina',
      'bioquimica',
      'nutricion',
      'odontologia',
    ],
    broadAreaTerms: ['salud', 'ciencias', 'vida', 'medicina', 'medico', 'medica', 'biologia', 'biologico', 'biologica'],
    anchorTerms: [
      'fisiolog',
      'anatom',
      'bioquimic',
      'fisiopatolog',
      'farmacolog',
      'farmacocinetica',
      'farmacodinamia',
      'histolog',
      'inmunolog',
      'epidemiolog',
      'semiolog',
      'homeostasis',
      'mitocondri',
      'ribosom',
      'replicacion del adn',
      'transcripcion genetica',
      'metabolismo celular',
      'cardiovascular',
      'endocrino',
      'sistema nervioso central',
      'neurotransmisor',
      'sinapsis',
      'anticuerpo',
      'antigeno',
      'patogeno',
      'microbiolog',
      'enfermeria',
      'diagnostico diferencial',
    ],
    contextualTerms: [
      'biolog',
      'celul',
      'genetica',
      'enzima',
      'proteina',
      'tejido',
      'organo',
      'paciente',
      'sintoma',
      'tratamiento medico',
      'clinico',
      'fisioterapia',
      'metabolismo',
      'infeccion',
      'inflamacion',
    ],
  },

  ciencias_naturales: {
    id: 'ciencias_naturales',
    label: 'Ciencias naturales y exactas',
    shortLabel: 'Ciencias exactas',
    description: 'Física, química, matemáticas, estadística, astronomía y ciencias de la Tierra.',
    aliases: [
      'ciencias naturales y exactas',
      'ciencias exactas',
      'ciencias naturales',
      'fisica',
      'quimica',
      'matematicas',
      'matematica',
      'estadistica',
      'geologia',
      'astronomia',
    ],
    broadAreaTerms: ['ciencias', 'naturales', 'exactas', 'fisica', 'quimica', 'matematica', 'matematicas'],
    anchorTerms: [
      'termodinamic',
      'electromagnetismo',
      'mecanica cuantica',
      'relatividad',
      'estequiometr',
      'enlace covalente',
      'enlace ionico',
      'tabla periodica',
      'oxidorreduccion',
      'cinematica',
      'calculo diferencial',
      'calculo integral',
      'algebra lineal',
      'ecuacion diferencial',
      'espacio vectorial',
      'autovalor',
      'entropia',
      'entalpia',
      'teorema',
      'derivada parcial',
      'distribucion de probabilidad',
      'inferencia estadistica',
    ],
    contextualTerms: [
      'fisica',
      'quimica',
      'matematica',
      'geometria',
      'trigonometria',
      'atomo',
      'molecula',
      'reaccion quimica',
      'energia cinetica',
      'campo magnetico',
      'vector',
      'matriz',
      'polinomio',
      'probabilidad',
    ],
  },

  humanidades_filosofia: {
    id: 'humanidades_filosofia',
    label: 'Humanidades y filosofía',
    shortLabel: 'Humanidades y filosofía',
    description: 'Filosofía, historia, literatura, ética, epistemología, estética, lingüística y arte.',
    aliases: [
      'humanidades y filosofia',
      'filosofia',
      'filosofico',
      'filosofica',
      'humanidades',
      'historia',
      'historico',
      'historica',
      'literatura',
      'etica',
      'epistemologia',
      'metafisica',
      'estetica',
      'arte',
      'filologia',
    ],
    broadAreaTerms: ['humanidades', 'filosofia', 'filosofico', 'filosofica'],
    anchorTerms: [
      'epistemolog',
      'metafisic',
      'ontolog',
      'deontolog',
      'teleolog',
      'fenomenolog',
      'hermeneutic',
      'existencialismo',
      'escolastica',
      'humanismo renacentista',
      'antropocentrismo',
      'imperativo categorico',
      'idealismo trascendental',
      'materialismo historico',
      'dialectica',
      'silogismo',
      'historiograf',
      'ilustracion',
      'renacimiento',
      'edad media',
      'kant',
      'hegel',
      'aristoteles',
      'platon',
      'socrates',
      'descartes',
      'nietzsche',
      'heidegger',
      'spinoza',
      'hume',
      'foucault',
      'erasmo',
      'maquiavelo',
    ],
    contextualTerms: [
      'filosof',
      'etica',
      'moral',
      'estetica',
      'logica',
      'retorica',
      'poetica',
      'narrativa',
      'literatura',
      'historia',
      'antiguedad',
      'modernidad',
      'posmodernidad',
      'racionalismo',
      'empirismo',
    ],
  },

  ciencias_sociales: {
    id: 'ciencias_sociales',
    label: 'Ciencias sociales y comunicación',
    shortLabel: 'Ciencias sociales',
    description: 'Sociología, antropología, ciencia política, relaciones internacionales, comunicación y periodismo.',
    aliases: [
      'ciencias sociales y comunicacion',
      'ciencias sociales',
      'sociologia',
      'sociologico',
      'sociologica',
      'antropologia',
      'ciencia politica',
      'politica',
      'comunicacion',
      'periodismo',
      'relaciones internacionales',
      'trabajo social',
      'geografia humana',
    ],
    broadAreaTerms: ['ciencias', 'sociales', 'comunicacion', 'sociologia', 'sociologico', 'sociologica'],
    anchorTerms: [
      'sociolog',
      'antropolog',
      'etnograf',
      'ciencia politica',
      'estratificacion social',
      'movilidad social',
      'hegemonia',
      'opinion publica',
      'agenda setting',
      'semiotica',
      'medios de comunicacion',
      'periodismo',
      'geopolitica',
      'soberania',
      'estado nacion',
      'poliarquia',
      'burocracia',
      'accion social',
      'capital social',
      'habitus',
      'durkheim',
      'max weber',
      'bourdieu',
      'gramsci',
      'habermas',
      'bauman',
    ],
    contextualTerms: [
      'sociedad',
      'comunidad',
      'ciudadania',
      'democracia',
      'ideologia',
      'movimiento social',
      'clase social',
      'desigualdad',
      'migracion',
      'globalizacion',
      'discurso',
      'audiencia',
      'comunicacion',
    ],
  },

  ingenieria_tecnologia: {
    id: 'ingenieria_tecnologia',
    label: 'Ingeniería y tecnología',
    shortLabel: 'Ingeniería y tecnología',
    description: 'Ingeniería de software, ciencias de la computación, redes, electrónica, sistemas e ingeniería industrial.',
    aliases: [
      'ingenieria y tecnologia',
      'ingenieria',
      'tecnologia',
      'software',
      'arquitectura de software',
      'informatica',
      'computacion',
      'programacion',
      'sistemas',
      'redes',
      'ciberseguridad',
      'electronica',
    ],
    broadAreaTerms: ['ingenieria', 'tecnologia', 'tecnologico', 'tecnologica'],
    anchorTerms: [
      'microservicio',
      'arquitectura de software',
      'ingenieria de software',
      'base de datos',
      'estructura de datos',
      'algoritm',
      'compilador',
      'sistema operativo',
      'sistema distribuido',
      'contenedor',
      'docker',
      'kubernetes',
      'endpoint',
      'graphql',
      'rest api',
      'api rest',
      'backend',
      'frontend',
      'fullstack',
      'balanceador de carga',
      'latencia',
      'concurrencia',
      'criptograf',
      'ciberseguridad',
      'aprendizaje automatico',
      'machine learning',
      'red neuronal artificial',
      'protocolo tcp',
      'http',
      'devops',
      'refactoring',
      'patron de diseno',
    ],
    contextualTerms: [
      'software',
      'hardware',
      'servidor',
      'cliente',
      'codigo',
      'programacion',
      'interfaz',
      'despliegue',
      'escalabilidad',
      'automatizacion',
      'sensor',
      'circuito',
      'ingenieria',
      'api',
    ],
  },

  economia_negocios_derecho: {
    id: 'economia_negocios_derecho',
    label: 'Economía, negocios y derecho',
    shortLabel: 'Economía y derecho',
    description: 'Economía, administración, finanzas, contabilidad, marketing y ciencias jurídicas.',
    aliases: [
      'economia negocios y derecho',
      'economia, negocios y derecho',
      'economia',
      'economico',
      'economica',
      'negocios',
      'derecho',
      'juridico',
      'juridica',
      'leyes',
      'finanzas',
      'administracion',
      'contabilidad',
      'marketing',
    ],
    broadAreaTerms: ['economia', 'economico', 'economica', 'negocios', 'derecho', 'juridico', 'juridica'],
    anchorTerms: [
      'macroeconom',
      'microeconom',
      'jurisprudencia',
      'derecho constitucional',
      'derecho civil',
      'derecho penal',
      'derecho administrativo',
      'derecho laboral',
      'acto juridico',
      'norma juridica',
      'debido proceso',
      'tutela jurisdiccional',
      'politica monetaria',
      'politica fiscal',
      'inflacion',
      'producto interno bruto',
      'elasticidad de la demanda',
      'costo de oportunidad',
      'ventaja comparativa',
      'estado financiero',
      'balance general',
      'flujo de caja',
      'mercado de capitales',
      'tasa de interes',
      'keynes',
      'kelsen',
    ],
    contextualTerms: [
      'econom',
      'juridic',
      'constitucion',
      'contrato',
      'obligacion',
      'delito',
      'sentencia',
      'tribunal',
      'mercado',
      'oferta',
      'demanda',
      'empresa',
      'inversion',
      'contabilidad',
      'finanzas',
      'tributo',
    ],
  },

  educacion: {
    id: 'educacion',
    label: 'Educación',
    shortLabel: 'Educación',
    description: 'Pedagogía, didáctica, diseño curricular, evaluación educativa y políticas educativas.',
    aliases: [
      'educacion',
      'educativo',
      'educativa',
      'pedagogia',
      'pedagogico',
      'pedagogica',
      'didactica',
      'docencia',
      'ciencias de la educacion',
      'curriculo',
    ],
    broadAreaTerms: ['educacion', 'educativo', 'educativa', 'pedagogia', 'pedagogico', 'pedagogica'],
    anchorTerms: [
      'pedagog',
      'didactic',
      'diseno curricular',
      'curriculo educativo',
      'evaluacion formativa',
      'evaluacion sumativa',
      'andamiaje',
      'zona de desarrollo proximo',
      'aprendizaje significativo',
      'constructivismo pedagogico',
      'secuencia didactica',
      'rubrica de evaluacion',
      'practica docente',
      'transposicion didactica',
      'alfabetizacion',
      'educacion inclusiva',
      'ausubel',
      'paulo freire',
      'comenio',
      'montessori',
    ],
    contextualTerms: [
      'docente',
      'estudiante',
      'aula',
      'ensenanza',
      'escolar',
      'curricul',
      'competencia educativa',
      'plan de estudios',
      'tutoria',
      'formacion',
    ],
  },

  general: {
    id: 'general',
    label: 'General o multidisciplinario',
    shortLabel: 'General / Multidisciplinario',
    description: 'Enfoque abierto o transversal que compara perspectivas cuando un concepto abarca varias disciplinas.',
    aliases: [
      'general',
      'general o multidisciplinario',
      'multidisciplinario',
      'multidisciplinar',
      'interdisciplinario',
      'interdisciplinar',
      'transversal',
      'varias disciplinas',
      'comparar disciplinas',
      'ambas disciplinas',
    ],
    broadAreaTerms: [
      'general',
      'multidisciplinario',
      'multidisciplinar',
      'interdisciplinario',
      'interdisciplinar',
      'transversal',
    ],
    anchorTerms: [],
    contextualTerms: [],
  },
};

export const ACADEMIC_AREAS_LIST: AcademicAreaDefinition[] = Object.values(ACADEMIC_AREA_CATALOG);

const SPECIFIC_AREA_IDS: AcademicAreaId[] = [
  'psicologia',
  'salud_vida',
  'ciencias_naturales',
  'humanidades_filosofia',
  'ciencias_sociales',
  'ingenieria_tecnologia',
  'economia_negocios_derecho',
  'educacion',
];

/**
 * Materias genéricas o por defecto heredadas que no deben sesgar por sí solas
 * la inferencia disciplinaria cuando el contenido de la nota trata de otro tema.
 */
const GENERIC_PLACEHOLDER_SUBJECTS = new Set([
  'general',
  'general o multidisciplinario',
  'lectura universitaria',
  'documento',
  'sin materia',
  'apunte',
  'nota',
  'notas',
]);

/**
 * Valor por defecto heredado en versiones previas de `DEFAULT_PREFERENCES.lastSubject`.
 * Solo debe reforzar Psicología si el cuerpo/título de la nota ya contiene evidencia psicológica real.
 */
const LEGACY_DEFAULT_SUBJECT_NORMALIZED = 'psicologia cognitiva';

/**
 * Normaliza un texto para comparación léxica determinista:
 * - Convierte a minúsculas.
 * - Elimina tildes/diacríticos (conservando letras base).
 * - Sustituye signos de puntuación por espacios y colapsa espacios múltiples.
 */
export function normalizeAcademicText(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Obtiene la definición de un área académica a partir de su ID (con fallback seguro a 'general').
 */
export function getAcademicAreaDefinition(areaId?: AcademicAreaId | string | null): AcademicAreaDefinition {
  if (areaId && areaId in ACADEMIC_AREA_CATALOG) {
    return ACADEMIC_AREA_CATALOG[areaId as AcademicAreaId];
  }
  return ACADEMIC_AREA_CATALOG.general;
}

/**
 * Construye la expresión regular de coincidencia léxica para un término normalizado.
 */
function buildTermMatchRegex(normalizedTerm: string, globalFlag = false): RegExp {
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flags = globalFlag ? 'gi' : 'i';

  // Si es una frase de varias palabras o una palabra corta (<= 4 letras), exigir límite de palabra o plural simple
  if (normalizedTerm.includes(' ') || normalizedTerm.length <= 4) {
    return new RegExp(`(?:^|\\s)(${escaped}(?:s|es)?)(?=\\s|$)`, flags);
  }

  // Para raíces de >= 5 letras (ej. 'epistemolog', 'microservicio', 'psicopatolog'), permitir sufijos morfológicos
  return new RegExp(`(?:^|\\s)(${escaped}[a-z0-9]*)(?=\\s|$)`, flags);
}

/**
 * Comprueba si un término o raíz normalizada aparece como palabra o prefijo léxico válido
 * dentro de un texto normalizado.
 */
function matchesTermInNormalizedText(normalizedText: string, normalizedTerm: string): boolean {
  if (!normalizedText || !normalizedTerm) return false;
  return buildTermMatchRegex(normalizedTerm, false).test(normalizedText);
}

/**
 * Elimina de un texto normalizado las ocurrencias de un término ya contabilizado,
 * evitando que las palabras que forman parte de un término compuesto cuenten otra vez
 * como señales independientes en la misma fuente.
 */
function maskMatchedTermInText(normalizedText: string, normalizedTerm: string): string {
  if (!normalizedText || !normalizedTerm) return normalizedText;
  const regex = buildTermMatchRegex(normalizedTerm, true);
  return normalizedText.replace(regex, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extrae únicamente las cláusulas afirmativas de una instrucción o texto explícito,
 * descartando cláusulas negadas como "no lo expliques desde la psicología" o "en vez de psicología".
 */
function extractPositiveInstructionClauses(rawText: string): string {
  const lowered = rawText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Dividir por signos de puntuación o conectores adversativos ("sino", "pero", "aunque", "mientras que")
  // o antes de verbos directivos ("explica", "analiza", "enfoca", "usa", "aborda")
  const rawClauses = lowered.split(
    /(?:[,;.]|\b(?:sino|pero|aunque|mientras\s+que)\b|(?=\b(?:explica|explicalo|analiza|analizalo|enfoca|enfocalo|aborda|abordalo|usa|utiliza)\b))/i
  );

  const negationPattern =
    /\b(?:no|sin|evita|evitar|evitando|en\s+lugar\s+de|en\s+vez\s+de|lejos\s+de|tampoco|nunca|jamas)\b/i;

  const positiveClauses = rawClauses
    .map((c) => normalizeAcademicText(c))
    .filter((c) => c.length > 0 && !negationPattern.test(c));

  if (positiveClauses.length > 0) {
    return positiveClauses.join(' ').trim();
  }

  return normalizeAcademicText(rawText);
}

/**
 * Detecta si un texto de instrucción solicita explícitamente comparar o contrastar varias disciplinas.
 */
function hasExplicitComparativeIntent(normalizedText: string): boolean {
  if (!normalizedText) return false;
  return /\b(?:compara[a-z]*|contrast[a-z]*|diferencia[a-z]*|ambas\s+disciplinas|varias\s+disciplinas|distintas\s+disciplinas|multidisciplin[a-z]*|interdisciplin[a-z]*|entre\s+[a-z\s]+\s+y\s+[a-z]+)\b/i.test(
    normalizedText
  );
}

/**
 * Reconoce un `AcademicAreaId` a partir de un identificador, nombre de área, materia o instrucción explícita.
 * - Ignora menciones negadas (ej. "No desde la psicología, explícalo desde la filosofía" -> `humanidades_filosofia`).
 * - Si la solicitud compara explícitamente dos o más disciplinas sin negarlas, devuelve `'general'`.
 * - Devuelve `null` si no logra identificar ninguna disciplina clara.
 */
export function parseAcademicAreaId(rawInput?: string | null): AcademicAreaId | null {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (trimmed in ACADEMIC_AREA_CATALOG) {
    return trimmed as AcademicAreaId;
  }

  const fullNormalized = normalizeAcademicText(trimmed);
  if (!fullNormalized) return null;

  // 0. Comprobar coincidencia directa con 'general' o sus alias
  const generalArea = ACADEMIC_AREA_CATALOG.general;
  if (
    normalizeAcademicText(generalArea.label) === fullNormalized ||
    normalizeAcademicText(generalArea.shortLabel) === fullNormalized ||
    generalArea.aliases.some((alias) => {
      const normAlias = normalizeAcademicText(alias);
      return fullNormalized === normAlias || matchesTermInNormalizedText(fullNormalized, normAlias);
    })
  ) {
    return 'general';
  }

  // Extraer cláusulas afirmativas (descartando negaciones como "no desde la psicología")
  const positiveText = extractPositiveInstructionClauses(trimmed);
  if (!positiveText) return null;

  // 1. Evaluar TODAS las áreas específicas (sin sesgo por orden de catálogo)
  const matchedAliasAreas = new Set<AcademicAreaId>();
  const scoresByArea: Record<AcademicAreaId, number> = {
    psicologia: 0,
    salud_vida: 0,
    ciencias_naturales: 0,
    humanidades_filosofia: 0,
    ciencias_sociales: 0,
    ingenieria_tecnologia: 0,
    economia_negocios_derecho: 0,
    educacion: 0,
    general: 0,
  };

  for (const areaId of SPECIFIC_AREA_IDS) {
    const area = ACADEMIC_AREA_CATALOG[areaId];
    if (
      normalizeAcademicText(area.label) === positiveText ||
      normalizeAcademicText(area.shortLabel) === positiveText
    ) {
      return area.id;
    }

    for (const alias of area.aliases) {
      const normAlias = normalizeAcademicText(alias);
      if (positiveText === normAlias || matchesTermInNormalizedText(positiveText, normAlias)) {
        matchedAliasAreas.add(area.id);
        scoresByArea[area.id] += 5;
      }
    }

    for (const anchor of area.anchorTerms) {
      if (matchesTermInNormalizedText(positiveText, normalizeAcademicText(anchor))) {
        scoresByArea[area.id] += 3;
      }
    }

    for (const ctxTerm of area.contextualTerms) {
      if (matchesTermInNormalizedText(positiveText, normalizeAcademicText(ctxTerm))) {
        scoresByArea[area.id] += 1.5;
      }
    }
  }

  const activeAreas = SPECIFIC_AREA_IDS.filter((id) => scoresByArea[id] > 0).sort(
    (a, b) => scoresByArea[b] - scoresByArea[a]
  );

  if (activeAreas.length === 0) {
    return null;
  }

  // Si se mencionan positivamente 2 o más disciplinas distintas y hay intención comparativa o empate directo,
  // devolver 'general' para habilitar una explicación comparativa/multidisciplinaria.
  if (activeAreas.length >= 2) {
    const topScore = scoresByArea[activeAreas[0]];
    const secondScore = scoresByArea[activeAreas[1]];
    if (
      hasExplicitComparativeIntent(positiveText) ||
      matchedAliasAreas.size >= 2 ||
      topScore === secondScore
    ) {
      return 'general';
    }
  }

  return activeAreas[0];
}

export interface NoteDisciplineInferenceInput {
  title?: string;
  content?: string;
  subject?: string;
  tags?: string[];
  folderName?: string;
  folderSubject?: string;
  relatedDocumentTitles?: string[];
  selectedFragment?: string;
}

export interface DisciplineInferenceResult {
  detectedArea: AcademicAreaId;
  disciplineLabel: string;
  confidence: DisciplineEvidenceLevel;
  evidence: string[];
  matchedTerms: string[];
  polysemousTermsFound: string[];
  scoresByArea: Record<AcademicAreaId, number>;
  isAmbiguous: boolean;
}

/**
 * Comprueba si un término candidato es léxicamente redundante respecto a un término compuesto
 * ya registrado en `alreadyMatchedTerms` (ej. 'software' o 'ingenieria' dentro de 'ingenieria de software').
 */
function isSubsumedByMatchedTerms(candidateNorm: string, alreadyMatchedRawTerms: Set<string>): boolean {
  for (const existingRaw of alreadyMatchedRawTerms) {
    const existingNorm = normalizeAcademicText(existingRaw);
    if (existingNorm === candidateNorm) return true;
    if (existingNorm.length > candidateNorm.length && matchesTermInNormalizedText(existingNorm, candidateNorm)) {
      return true;
    }
  }
  return false;
}

/**
 * B. `inferNoteDiscipline()`
 * Inferencia local determinista de la disciplina académica de un apunte.
 *
 * Reglas de diseño:
 * - No realiza llamadas a Gemini ni a servicios de red.
 * - Pondera título, fragmento seleccionado, carpeta, etiquetas, documentos relacionados, materia y cuerpo.
 * - Evita que las palabras que forman parte de un término compuesto cuenten otra vez como señales independientes.
 * - Evita que el valor por defecto heredado `'Psicología Cognitiva'` en `subject` o `folderSubject` infle la confianza cuando el texto real de la nota es neutro o de otra disciplina.
 * - Exige longitud mínima y pluralidad de señales independientes para otorgar evidencia `'high'`.
 */
export function inferNoteDiscipline(input: NoteDisciplineInferenceInput = {}): DisciplineInferenceResult {
  const normTitle = normalizeAcademicText(input.title);
  const normContent = normalizeAcademicText(input.content);
  const normFragment = normalizeAcademicText(input.selectedFragment);
  const normSubjectRaw = normalizeAcademicText(input.subject);
  const normFolderName = normalizeAcademicText(input.folderName);
  const normFolderSubjectRaw = normalizeAcademicText(input.folderSubject);
  const normTags = normalizeAcademicText((input.tags || []).join(' '));
  const normDocs = normalizeAcademicText((input.relatedDocumentTitles || []).join(' '));

  const isPlaceholderSubject = GENERIC_PLACEHOLDER_SUBJECTS.has(normSubjectRaw);
  const isLegacyDefaultSubject = normSubjectRaw === LEGACY_DEFAULT_SUBJECT_NORMALIZED;
  const normSubject = isPlaceholderSubject ? '' : normSubjectRaw;

  const isPlaceholderFolderSubject = GENERIC_PLACEHOLDER_SUBJECTS.has(normFolderSubjectRaw);
  const isLegacyDefaultFolderSubject = normFolderSubjectRaw === LEGACY_DEFAULT_SUBJECT_NORMALIZED;
  const normFolderSubject =
    isPlaceholderFolderSubject || isLegacyDefaultFolderSubject ? '' : normFolderSubjectRaw;

  const normFolder = [normFolderName, normFolderSubject].filter(Boolean).join(' ').trim();

  const intrinsicNoteText = [
    normTitle,
    normFragment,
    normContent,
    normFolderName,
    normTags,
    normDocs,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const fullNormalizedText = [
    intrinsicNoteText,
    normFolderSubject,
    isLegacyDefaultSubject ? '' : normSubject,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const totalWords = fullNormalizedText
    ? fullNormalizedText.split(/\s+/).length
    : intrinsicNoteText
      ? intrinsicNoteText.split(/\s+/).length
      : 0;

  const scoresByArea: Record<AcademicAreaId, number> = {
    psicologia: 0,
    salud_vida: 0,
    ciencias_naturales: 0,
    humanidades_filosofia: 0,
    ciencias_sociales: 0,
    ingenieria_tecnologia: 0,
    economia_negocios_derecho: 0,
    educacion: 0,
    general: 0,
  };

  const matchedTermsByArea: Record<AcademicAreaId, Set<string>> = {
    psicologia: new Set(),
    salud_vida: new Set(),
    ciencias_naturales: new Set(),
    humanidades_filosofia: new Set(),
    ciencias_sociales: new Set(),
    ingenieria_tecnologia: new Set(),
    economia_negocios_derecho: new Set(),
    educacion: new Set(),
    general: new Set(),
  };

  const anchorHitsByArea: Record<AcademicAreaId, number> = {
    psicologia: 0,
    salud_vida: 0,
    ciencias_naturales: 0,
    humanidades_filosofia: 0,
    ciencias_sociales: 0,
    ingenieria_tecnologia: 0,
    economia_negocios_derecho: 0,
    educacion: 0,
    general: 0,
  };

  const evidenceByArea: Record<AcademicAreaId, string[]> = {
    psicologia: [],
    salud_vida: [],
    ciencias_naturales: [],
    humanidades_filosofia: [],
    ciencias_sociales: [],
    ingenieria_tecnologia: [],
    economia_negocios_derecho: [],
    educacion: [],
    general: [],
  };

  // Detectar términos polisémicos presentes en el texto
  const polysemousTermsFound: string[] = [];
  for (const poly of POLYSEMOUS_ACADEMIC_TERMS) {
    const normPoly = normalizeAcademicText(poly.term);
    if (matchesTermInNormalizedText(fullNormalizedText, normPoly)) {
      polysemousTermsFound.push(poly.term);
    }
  }

  // Evaluar coincidencias en cada área específica
  const baseSources: Array<{ label: string; text: string; multiplier: number }> = [
    { label: 'Título', text: normTitle, multiplier: 1.5 },
    { label: 'Fragmento', text: normFragment, multiplier: 1.4 },
    { label: 'Carpeta', text: normFolder, multiplier: 1.3 },
    { label: 'Etiquetas', text: normTags, multiplier: 1.3 },
    { label: 'Documentos', text: normDocs, multiplier: 1.2 },
    { label: 'Contenido', text: normContent, multiplier: 1.0 },
  ];

  for (const areaId of SPECIFIC_AREA_IDS) {
    const area = ACADEMIC_AREA_CATALOG[areaId];

    // Copia mutable de texto por fuente para enmascarar ocurrencias ya consumidas por términos compuestos más largos
    const remainingSources = baseSources.map((s) => ({ ...s }));

    // Combinar y ordenar candidatos: primero términos compuestos de más palabras/longitud y mayor peso (anclas antes que contextuales)
    const candidates: Array<{ rawTerm: string; normTerm: string; baseWeight: number; isAnchor: boolean }> = [
      ...area.anchorTerms.map((t) => ({
        rawTerm: t.trim(),
        normTerm: normalizeAcademicText(t),
        baseWeight: 3.0,
        isAnchor: true,
      })),
      ...area.contextualTerms.map((t) => ({
        rawTerm: t.trim(),
        normTerm: normalizeAcademicText(t),
        baseWeight: 1.5,
        isAnchor: false,
      })),
    ].sort((a, b) => {
      const wordsDiff = b.normTerm.split(/\s+/).length - a.normTerm.split(/\s+/).length;
      if (wordsDiff !== 0) return wordsDiff;
      if (b.isAnchor !== a.isAnchor) return b.isAnchor ? 1 : -1;
      return b.normTerm.length - a.normTerm.length;
    });

    for (const candidate of candidates) {
      const { rawTerm, normTerm, baseWeight, isAnchor } = candidate;
      if (!normTerm) continue;

      // Si el candidato es una raíz/palabra que ya forma parte de un término compuesto detectado en esta área,
      // no volver a contabilizarlo como señal independiente (corrige H-01).
      if (isSubsumedByMatchedTerms(normTerm, matchedTermsByArea[areaId])) {
        continue;
      }

      let bestSourceMultiplier = 0;
      const matchedSources: string[] = [];

      for (const source of remainingSources) {
        if (source.text && matchesTermInNormalizedText(source.text, normTerm)) {
          matchedSources.push(source.label);
          if (source.multiplier > bestSourceMultiplier) {
            bestSourceMultiplier = source.multiplier;
          }
          // Enmascarar las ocurrencias coincididas en esta fuente para que sus palabras internas no disparen sub-términos
          source.text = maskMatchedTermInText(source.text, normTerm);
        }
      }

      if (bestSourceMultiplier > 0) {
        const multiSourceBonus = matchedSources.length > 1 ? 0.35 : 0;
        const points = baseWeight * bestSourceMultiplier + multiSourceBonus;

        scoresByArea[areaId] += points;
        matchedTermsByArea[areaId].add(rawTerm);
        if (isAnchor) {
          anchorHitsByArea[areaId] += 1;
        }
        if (evidenceByArea[areaId].length < 5) {
          evidenceByArea[areaId].push(`${matchedSources[0]}: «${rawTerm}»`);
        }
      }
    }
  }

  // Número de señales halladas en el contenido/título/etiquetas antes de evaluar `subject`
  const intrinsicMatchesByArea: Record<AcademicAreaId, number> = {
    psicologia: matchedTermsByArea.psicologia.size,
    salud_vida: matchedTermsByArea.salud_vida.size,
    ciencias_naturales: matchedTermsByArea.ciencias_naturales.size,
    humanidades_filosofia: matchedTermsByArea.humanidades_filosofia.size,
    ciencias_sociales: matchedTermsByArea.ciencias_sociales.size,
    ingenieria_tecnologia: matchedTermsByArea.ingenieria_tecnologia.size,
    economia_negocios_derecho: matchedTermsByArea.economia_negocios_derecho.size,
    educacion: matchedTermsByArea.educacion.size,
    general: 0,
  };

  // Evaluar `subject` y `folderSubject` protegiendo frente al valor por defecto heredado 'Psicología Cognitiva' (corrige H-03)
  if (normSubject || isLegacyDefaultFolderSubject) {
    if (isLegacyDefaultSubject || isLegacyDefaultFolderSubject) {
      // 'Psicología Cognitiva' solo refuerza Psicología si el cuerpo/título de la nota YA tiene evidencia psicológica real
      // y ninguna otra disciplina la supera.
      const maxOtherAreaScore = Math.max(
        ...SPECIFIC_AREA_IDS.filter((id) => id !== 'psicologia').map((id) => scoresByArea[id])
      );
      if (intrinsicMatchesByArea.psicologia > 0 && scoresByArea.psicologia >= maxOtherAreaScore) {
        scoresByArea.psicologia += 1.5;
        evidenceByArea.psicologia.unshift(`Materia: «${(input.subject || input.folderSubject || '').trim()}»`);
      }
    } else if (normSubject) {
      const subjectArea = parseAcademicAreaId(normSubject);
      if (subjectArea && subjectArea !== 'general') {
        const maxOtherAreaScore = Math.max(
          ...SPECIFIC_AREA_IDS.filter((id) => id !== subjectArea).map((id) => scoresByArea[id])
        );
        const subjectAreaContentScore = scoresByArea[subjectArea];

        // Si el contenido apunta claramente a otra disciplina y tiene 0 coincidencias con `subject`, no inflar `subject`
        if (!(subjectAreaContentScore === 0 && maxOtherAreaScore >= 4.5)) {
          const subjectPoints = subjectAreaContentScore > 0 ? 3.0 : 2.0;
          scoresByArea[subjectArea] += subjectPoints;
          if (!isSubsumedByMatchedTerms(normSubject, matchedTermsByArea[subjectArea])) {
            matchedTermsByArea[subjectArea].add(input.subject!.trim());
          }
          evidenceByArea[subjectArea].unshift(`Materia: «${input.subject!.trim()}»`);
        }
      }
    }
  }

  // Ordenar áreas por puntuación descendente
  const rankedAreas = [...SPECIFIC_AREA_IDS].sort((a, b) => scoresByArea[b] - scoresByArea[a]);
  const topArea = rankedAreas[0];
  const secondArea = rankedAreas[1];
  const topScore = scoresByArea[topArea];
  const secondScore = scoresByArea[secondArea];
  const distinctMatches = matchedTermsByArea[topArea].size;
  const intrinsicTopMatches = intrinsicMatchesByArea[topArea];
  const anchorHits = anchorHitsByArea[topArea];

  // Si no hay señales específicas o el texto solo contiene términos polisémicos aislados
  if (topScore === 0) {
    const isPolysemousOnly = polysemousTermsFound.length > 0;
    return {
      detectedArea: 'general',
      disciplineLabel: ACADEMIC_AREA_CATALOG.general.label,
      confidence: 'low',
      evidence: isPolysemousOnly
        ? [`Término polisémico sin contexto disciplinario suficiente: «${polysemousTermsFound.join('», «')}»`]
        : [],
      matchedTerms: [],
      polysemousTermsFound,
      scoresByArea,
      isAmbiguous: true,
    };
  }

  // Clasificación determinista de nivel de evidencia ('high' | 'medium' | 'low')
  // Reglas:
  // - Textos breves (< 6 palabras), con < 3 señales independientes o sin señales en el contenido intrínseco nunca reciben 'high'.
  // - Textos mixtos donde una segunda disciplina también tiene alta presencia (secondScore >= 6 y topScore < secondScore * 1.5)
  //   se tratan con cautela como interdisciplinarios/ambiguos.
  const hasStrongCompetingDiscipline = secondScore >= 6.0 && topScore < secondScore * 1.5;
  const hasClearMarginForHigh = secondScore === 0 ? true : topScore >= secondScore * 1.6;
  const hasClearMarginForMedium =
    !hasStrongCompetingDiscipline && (secondScore === 0 ? true : topScore >= secondScore * 1.3);

  let confidence: DisciplineEvidenceLevel = 'low';

  if (
    totalWords >= 6 &&
    distinctMatches >= 3 &&
    intrinsicTopMatches >= 2 &&
    anchorHits >= 1 &&
    topScore >= 7.0 &&
    hasClearMarginForHigh
  ) {
    confidence = 'high';
  } else if (
    totalWords >= 4 &&
    distinctMatches >= 2 &&
    intrinsicTopMatches >= 1 &&
    topScore >= 3.5 &&
    hasClearMarginForMedium
  ) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Si la evidencia es baja o existe competencia disciplinaria fuerte, marcar ambiguo
  const isCloseTie = (secondScore > 0 && topScore < secondScore * 1.25) || hasStrongCompetingDiscipline;
  const isAmbiguous =
    confidence === 'low' && (isCloseTie || polysemousTermsFound.length > 0 || topScore < 3.0);

  const resolvedDetectedArea: AcademicAreaId =
    confidence === 'low' && (isCloseTie || topScore < 2.5) ? 'general' : topArea;

  return {
    detectedArea: resolvedDetectedArea,
    disciplineLabel: ACADEMIC_AREA_CATALOG[resolvedDetectedArea].label,
    confidence,
    evidence: evidenceByArea[topArea],
    matchedTerms: Array.from(matchedTermsByArea[topArea]),
    polysemousTermsFound,
    scoresByArea,
    isAmbiguous,
  };
}

export interface QueryContextOverrideInput {
  areaId?: AcademicAreaId | string;
  instruction?: string;
}

export interface ResolveAcademicContextInput {
  /**
   * Nivel 1: Instrucción o disciplina explícita temporal para la consulta actual.
   * Puede ser un objeto `{ areaId, instruction }` o directamente un string como "Explícalo desde la filosofía".
   */
  queryOverride?: QueryContextOverrideInput | string | null;
  /**
   * Nivel 2 y 3: Nota actual y metadatos asociados (modo manual vs automático).
   */
  note?: (Partial<NoteEntity> & NoteDisciplineInferenceInput) | null;
  /**
   * Nivel 4: Perfil académico global del usuario configurado en Onboarding/Ajustes.
   */
  academicProfile?: AcademicProfile | null;
}

/**
 * Comprueba si un string corresponde explícitamente al modo "General o multidisciplinario".
 */
function isExplicitGeneralOrMultidisciplinaryInput(rawInput: string): boolean {
  const norm = normalizeAcademicText(rawInput);
  if (!norm) return false;
  if (GENERIC_PLACEHOLDER_SUBJECTS.has(norm)) return true;
  return ACADEMIC_AREA_CATALOG.general.aliases.some(
    (alias) => normalizeAcademicText(alias) === norm || matchesTermInNormalizedText(norm, normalizeAcademicText(alias))
  );
}

/**
 * C. `resolveAcademicContext()`
 * Resuelve el contexto académico activo siguiendo estrictamente la jerarquía de 5 pasos:
 *
 * 1. Instrucción o disciplina explícita de la consulta actual (`query_override`).
 * 2. Disciplina fijada manualmente en la nota (`note_manual`).
 * 3. Disciplina detectada automáticamente en la nota con evidencia suficiente (`note_auto`).
 * 4. Perfil académico global como orientación de respaldo (`global_profile`).
 * 5. Contexto insuficiente o multidisciplinario (`multidisciplinary_ambiguous`).
 *
 * Función pura: no muta la nota ni las preferencias globales.
 */
export function resolveAcademicContext(
  input: ResolveAcademicContextInput = {}
): ResolvedAcademicContext {
  const { queryOverride, note, academicProfile } = input;

  // -------------------------------------------------------------------------
  // NIVEL 1: Contexto explícito de la consulta actual (Query Override)
  // -------------------------------------------------------------------------
  if (queryOverride) {
    const rawArea = typeof queryOverride === 'string' ? undefined : queryOverride.areaId;
    const rawInstruction =
      typeof queryOverride === 'string'
        ? queryOverride.trim()
        : queryOverride.instruction?.trim();

    const parsedExplicitArea = rawArea ? parseAcademicAreaId(rawArea) : null;
    const parsedFromInstruction = rawInstruction ? parseAcademicAreaId(rawInstruction) : null;
    const effectiveArea = parsedExplicitArea || parsedFromInstruction;

    if (effectiveArea || rawInstruction) {
      const finalArea: AcademicAreaId = effectiveArea || 'general';
      const areaDef = getAcademicAreaDefinition(finalArea);

      // Es comparativo/multidisciplinario si el área resuelta es 'general' y:
      // - no hay instrucción específica, o
      // - la propia instrucción solicita comparar varias disciplinas (parsedFromInstruction === 'general').
      const isComparativeInstruction = parsedFromInstruction === 'general';
      const isMultidisciplinaryOverride =
        finalArea === 'general' && (!rawInstruction || isComparativeInstruction);

      return {
        areaId: finalArea,
        disciplineLabel: areaDef.label,
        specificSubject: note?.subject,
        career: academicProfile?.career,
        specialty: academicProfile?.specialty,
        queryInstruction: rawInstruction || undefined,
        source: 'query_override',
        confidence: isMultidisciplinaryOverride ? 'low' : 'high',
        isAmbiguous: isMultidisciplinaryOverride,
        evidenceTerms: rawInstruction ? [rawInstruction] : [areaDef.label],
        rationale: rawInstruction
          ? isComparativeOverrideRationale(isMultidisciplinaryOverride, rawInstruction)
          : `Prioridad 1: Disciplina seleccionada explícitamente para esta consulta (${areaDef.label}).`,
      };
    }
  }

  // -------------------------------------------------------------------------
  // NIVEL 2: Disciplina fijada manualmente en la nota (`disciplineMode === 'manual'`)
  // -------------------------------------------------------------------------
  if (note?.disciplineMode === 'manual' && note.manualDiscipline?.trim()) {
    const manualRaw = note.manualDiscipline.trim();
    const isExplicitGeneral = isExplicitGeneralOrMultidisciplinaryInput(manualRaw);

    if (isExplicitGeneral) {
      const generalDef = ACADEMIC_AREA_CATALOG.general;
      return {
        areaId: 'general',
        disciplineLabel: generalDef.label,
        specificSubject: note.subject || generalDef.label,
        career: academicProfile?.career,
        specialty: academicProfile?.specialty,
        source: 'note_manual',
        confidence: 'low',
        isAmbiguous: true,
        evidenceTerms: [manualRaw],
        rationale: `Prioridad 2: Modo general o multidisciplinario fijado manualmente en la nota.`,
      };
    }

    // Si es una disciplina específica (del catálogo o personalizada como "Criminología Forense"),
    // se respeta como contexto manual explícito con confianza alta y sin ambigüedad (corrige H-04).
    const parsedManualArea = parseAcademicAreaId(manualRaw);
    const resolvedAreaId: AcademicAreaId =
      parsedManualArea && parsedManualArea !== 'general' ? parsedManualArea : 'general';
    const areaDef = getAcademicAreaDefinition(resolvedAreaId);
    const resolvedLabel =
      resolvedAreaId !== 'general' ? areaDef.label : manualRaw;

    return {
      areaId: resolvedAreaId,
      disciplineLabel: resolvedLabel,
      specificSubject: note.subject || manualRaw,
      career: academicProfile?.career,
      specialty: academicProfile?.specialty,
      source: 'note_manual',
      confidence: 'high',
      isAmbiguous: false,
      evidenceTerms: [manualRaw],
      rationale: `Prioridad 2: Disciplina fijada manualmente en la nota (${resolvedLabel}).`,
    };
  }

  // -------------------------------------------------------------------------
  // NIVEL 3: Detección automática en la nota con evidencia suficiente (`high` o `medium`)
  // -------------------------------------------------------------------------
  const inference = inferNoteDiscipline(note || {});
  const hasSufficientAutoEvidence =
    inference.detectedArea !== 'general' &&
    (inference.confidence === 'high' || inference.confidence === 'medium') &&
    !inference.isAmbiguous;

  if (hasSufficientAutoEvidence) {
    return {
      areaId: inference.detectedArea,
      disciplineLabel: inference.disciplineLabel,
      specificSubject: note?.subject,
      career: academicProfile?.career,
      specialty: academicProfile?.specialty,
      source: 'note_auto',
      confidence: inference.confidence,
      isAmbiguous: false,
      evidenceTerms: inference.matchedTerms,
      rationale: `Prioridad 3: Disciplina inferida automáticamente del contenido de la nota (${inference.disciplineLabel}, evidencia ${inference.confidence}).`,
    };
  }

  // Si la nota en modo automático ya tenía una disciplina detectada persistida con confianza alta/media
  // y el objeto recibido es un resumen sin contenido o esa misma disciplina sigue siendo la principal sin ser superada:
  if (
    note?.disciplineMode !== 'manual' &&
    isValidAcademicAreaId(note?.detectedDiscipline) &&
    note.detectedDiscipline !== 'general' &&
    (note.detectedDisciplineConfidence === 'high' || note.detectedDisciplineConfidence === 'medium')
  ) {
    const hasNoContentProvided = !note.content?.trim() && !note.title?.trim();
    const stillMatchesPersisted =
      inference.scoresByArea[note.detectedDiscipline] > 0 &&
      inference.detectedArea === note.detectedDiscipline &&
      !inference.isAmbiguous;

    if (hasNoContentProvided || stillMatchesPersisted) {
      const persistedDef = getAcademicAreaDefinition(note.detectedDiscipline);
      return {
        areaId: note.detectedDiscipline,
        disciplineLabel: persistedDef.label,
        specificSubject: note?.subject,
        career: academicProfile?.career,
        specialty: academicProfile?.specialty,
        source: 'note_auto',
        confidence: note.detectedDisciplineConfidence,
        isAmbiguous: false,
        evidenceTerms: inference.matchedTerms,
        rationale: `Prioridad 3: Disciplina detectada en la nota (${persistedDef.label}, evidencia ${note.detectedDisciplineConfidence}).`,
      };
    }
  }

  // -------------------------------------------------------------------------
  // NIVEL 4: Perfil académico global como orientación de respaldo
  // -------------------------------------------------------------------------
  if (academicProfile?.primaryArea && academicProfile.primaryArea !== 'general') {
    const profileAreaDef = getAcademicAreaDefinition(academicProfile.primaryArea);
    // Si el texto tiene un término polisémico aislado sin contexto suficiente, mantenemos la alerta de ambigüedad
    const hasPolysemousAmbiguity = inference.polysemousTermsFound.length > 0;

    return {
      areaId: academicProfile.primaryArea,
      disciplineLabel: profileAreaDef.label,
      specificSubject: note?.subject,
      career: academicProfile.career,
      specialty: academicProfile.specialty,
      source: 'global_profile',
      confidence: 'low',
      isAmbiguous: hasPolysemousAmbiguity,
      evidenceTerms: inference.matchedTerms,
      rationale: hasPolysemousAmbiguity
        ? `Prioridad 4: Orientación por perfil académico global (${profileAreaDef.label}), con aviso de término polisémico sin contexto suficiente en la nota.`
        : `Prioridad 4: Orientación de respaldo por perfil académico global (${profileAreaDef.label}) ante falta de evidencia específica en la nota.`,
    };
  }

  // -------------------------------------------------------------------------
  // NIVEL 5: Contexto insuficiente o perfil General / Multidisciplinario
  // -------------------------------------------------------------------------
  return {
    areaId: 'general',
    disciplineLabel: ACADEMIC_AREA_CATALOG.general.label,
    specificSubject: note?.subject,
    career: academicProfile?.career,
    specialty: academicProfile?.specialty,
    source: 'multidisciplinary_ambiguous',
    confidence: 'low',
    isAmbiguous: true,
    evidenceTerms: inference.matchedTerms,
    rationale:
      'Prioridad 5: Contexto general o evidencia insuficiente; se requiere explicación comparativa entre las principales disciplinas relevantes.',
  };
}

function isComparativeOverrideRationale(isMultidisciplinary: boolean, rawInstruction: string): string {
  if (isMultidisciplinary) {
    return `Prioridad 1: Solicitud explícita comparativa o multidisciplinaria en la consulta («${rawInstruction}»).`;
  }
  return `Prioridad 1: Instrucción explícita en la consulta («${rawInstruction}»).`;
}

export interface CacheKeyContextOptions {
  areaId?: AcademicAreaId | string;
  queryInstruction?: string;
  isAmbiguous?: boolean;
}

/**
 * Palabras conversacionales de redirección disciplinaria que no añaden matiz conceptual propio
 * cuando van seguidas únicamente del nombre del área ya representada en `canonicalArea`.
 */
const INSTRUCTION_FRAMING_STOPWORDS = new Set([
  'explicalo',
  'explica',
  'explicar',
  'explicame',
  'analizalo',
  'analiza',
  'analizar',
  'definelo',
  'define',
  'definir',
  'abordalo',
  'aborda',
  'abordar',
  'enfocalo',
  'enfoca',
  'enfocar',
  'enfoque',
  'perspectiva',
  'contexto',
  'punto',
  'vista',
  'ambito',
  'campo',
  'area',
  'disciplina',
  'materia',
  'segun',
  'desde',
  'para',
  'con',
  'como',
  'del',
  'de',
  'la',
  'el',
  'los',
  'las',
  'lo',
  'un',
  'una',
  'en',
  'por',
  'favor',
  'solo',
  'solamente',
  'unicamente',
]);

/**
 * Normaliza un segmento para su uso seguro dentro de una clave de caché (`analysisCache`).
 */
function normalizeCacheKeySegment(value?: string | null): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

/**
 * Extrae el matiz específico adicional de una instrucción temporal (corrige H-05):
 * - Descarta cláusulas negadas.
 * - Elimina prefijos conversacionales redundantes ("explícalo desde la...", "enfoque...", "perspectiva de...")
 *   y los términos genéricos del nombre del área ya capturada por `canonicalArea`.
 * - Si la instrucción solo repetía la disciplina (ej. "Explícalo desde la filosofía" o "Desde la filosofía"),
 *   devuelve `""` para evitar fragmentar la caché con claves duplicadas innecesarias.
 * - Si la instrucción incluye matices reales (ej. "Explícalo desde la filosofía renacentista" o "existencialista de Sartre"),
 *   conserva dichos matices normalizados (`"renacentista"`, `"existencialista_sartre"`).
 */
function extractInstructionNuanceSegment(
  rawInstruction: string,
  canonicalArea: AcademicAreaId | string
): string {
  const positiveText = extractPositiveInstructionClauses(rawInstruction);
  if (!positiveText) return '';

  const areaDef =
    canonicalArea in ACADEMIC_AREA_CATALOG
      ? ACADEMIC_AREA_CATALOG[canonicalArea as AcademicAreaId]
      : null;

  const broadAreaWords = new Set<string>(
    areaDef ? areaDef.broadAreaTerms.map((w) => normalizeAcademicText(w)) : []
  );

  const tokens = positiveText
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => !INSTRUCTION_FRAMING_STOPWORDS.has(token))
    .filter((token) => !broadAreaWords.has(token));

  return normalizeCacheKeySegment(tokens.join('_'));
}

/**
 * D. `buildAnalysisCacheKey()`
 * Construye una clave determinista para `analysisCache` que evita colisiones entre disciplinas
 * y contempla los matices relevantes de las instrucciones temporales por consulta.
 *
 * Nota de arquitectura (Fase 1): esta función aún no está conectada a `indexedDB.ts` ni a `ConceptAnalysisModal.tsx`
 * (esa integración corresponde a la Fase 4).
 *
 * Formato documentado de la clave:
 * `<termino_normalizado>::<area_disciplinaria_canónica>[::q_<matiz_instruccion_normalizado>][::multidisciplinar]`
 *
 * Ejemplos:
 * - `buildAnalysisCacheKey('Humanismo', 'psicologia')` -> `'humanismo::psicologia'`
 * - `buildAnalysisCacheKey('Humanismo', 'humanidades_filosofia')` -> `'humanismo::humanidades_filosofia'`
 * - `buildAnalysisCacheKey('Humanismo', 'psicologia', 'Explícalo desde la filosofía')`
 *    -> `'humanismo::humanidades_filosofia'` (colapsa prefijo conversacional redundante)
 * - `buildAnalysisCacheKey('Humanismo', 'psicologia', 'Explícalo desde la filosofía renacentista')`
 *    -> `'humanismo::humanidades_filosofia::q_renacentista'` (conserva matiz adicional)
 */
export function buildAnalysisCacheKey(
  termName: string,
  contextOrArea?: ResolvedAcademicContext | CacheKeyContextOptions | AcademicAreaId | string | null,
  explicitInstructionOverride?: string
): string {
  const normTerm = normalizeCacheKeySegment(termName) || 'termino_sin_nombre';

  let rawArea: string | undefined;
  let rawInstruction: string | undefined = explicitInstructionOverride?.trim();
  let isAmbiguous = false;

  if (typeof contextOrArea === 'string') {
    rawArea = contextOrArea;
  } else if (contextOrArea && typeof contextOrArea === 'object') {
    rawArea = contextOrArea.areaId;
    if (!rawInstruction && 'queryInstruction' in contextOrArea && contextOrArea.queryInstruction) {
      rawInstruction = contextOrArea.queryInstruction.trim();
    }
    if ('isAmbiguous' in contextOrArea && typeof contextOrArea.isAmbiguous === 'boolean') {
      isAmbiguous = contextOrArea.isAmbiguous;
    }
  }

  // Si existe una instrucción temporal que menciona una disciplina explícita (ej. "Explícalo desde la filosofía"),
  // la disciplina efectiva de la clave refleja ese override temporal.
  const instructionArea = rawInstruction ? parseAcademicAreaId(rawInstruction) : null;
  const parsedArea = instructionArea || (rawArea ? parseAcademicAreaId(rawArea) : null);
  const canonicalArea = parsedArea || normalizeCacheKeySegment(rawArea) || 'general';

  const parts: string[] = [normTerm, canonicalArea];

  if (rawInstruction) {
    const nuanceSegment = extractInstructionNuanceSegment(rawInstruction, canonicalArea);
    if (nuanceSegment) {
      parts.push(`q_${nuanceSegment}`);
    }
  } else if (isAmbiguous && canonicalArea !== 'general') {
    parts.push('multidisciplinar');
  }

  return parts.join('::');
}

/**
 * E. Helpers de Persistencia y Onboarding del Perfil Académico Global (Fase 2)
 */

/**
 * Verifica si un valor corresponde a uno de los 9 `AcademicAreaId` válidos del catálogo.
 */
export function isValidAcademicAreaId(value: unknown): value is AcademicAreaId {
  return typeof value === 'string' && value in ACADEMIC_AREA_CATALOG;
}

/**
 * Valida y limpia un objeto `AcademicProfile`.
 * Devuelve `undefined` si no existe o si está incompleto (p. ej. carece de un `primaryArea` válido),
 * evitando guardar o tratar perfiles incompletos como si el onboarding hubiera finalizado.
 */
export function sanitizeAcademicProfile(rawProfile: unknown): AcademicProfile | undefined {
  if (!rawProfile || typeof rawProfile !== 'object') return undefined;
  const candidate = rawProfile as Record<string, unknown>;

  if (!isValidAcademicAreaId(candidate.primaryArea)) {
    return undefined;
  }

  const career =
    typeof candidate.career === 'string' && candidate.career.trim().length > 0
      ? candidate.career.trim().slice(0, 120)
      : undefined;

  const specialty =
    typeof candidate.specialty === 'string' && candidate.specialty.trim().length > 0
      ? candidate.specialty.trim().slice(0, 120)
      : undefined;

  const updatedAt =
    typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) && candidate.updatedAt > 0
      ? candidate.updatedAt
      : Date.now();

  return {
    primaryArea: candidate.primaryArea,
    career,
    specialty,
    updatedAt,
  };
}

/**
 * Limpia y normaliza `AppPreferences` al leer o guardar en IndexedDB:
 * - Conserva total compatibilidad con instalaciones antiguas que no tenían `academicProfile` ni `onboardingCompleted`.
 * - Si existe un `academicProfile` válido, asegura que `onboardingCompleted` sea `true`.
 * - Si `academicProfile` era inválido/incompleto y el usuario no omitió expresamente el onboarding (`onboardingCompleted !== true`),
 *   descarta el perfil incompleto y mantiene `onboardingCompleted: false`.
 */
export function sanitizeAppPreferences(
  rawPrefs: Partial<AppPreferences> | null | undefined,
  defaults: AppPreferences
): AppPreferences {
  const merged: AppPreferences = {
    ...defaults,
    ...(rawPrefs || {}),
  };

  const validProfile = sanitizeAcademicProfile(rawPrefs?.academicProfile);
  const explicitlySkippedOrCompleted = rawPrefs?.onboardingCompleted === true;

  // Si se proporcionó un objeto academicProfile corrupto/incompleto (sin primaryArea válida),
  // no debe dar por completado el onboarding salvo que se hubiera omitido expresamente sin perfil.
  const hadInvalidProfileObject =
    rawPrefs?.academicProfile !== undefined &&
    rawPrefs?.academicProfile !== null &&
    !validProfile;

  const onboardingCompleted = validProfile
    ? true
    : hadInvalidProfileObject
      ? false
      : explicitlySkippedOrCompleted;

  return {
    theme:
      merged.theme === 'light' || merged.theme === 'dark' || merged.theme === 'system'
        ? merged.theme
        : defaults.theme,
    chunkSize:
      typeof merged.chunkSize === 'number' && merged.chunkSize > 0
        ? merged.chunkSize
        : defaults.chunkSize,
    autoDetectOnSave:
      typeof merged.autoDetectOnSave === 'boolean'
        ? merged.autoDetectOnSave
        : defaults.autoDetectOnSave,
    lastSubject:
      typeof merged.lastSubject === 'string' && merged.lastSubject.trim().length > 0
        ? merged.lastSubject.trim()
        : defaults.lastSubject,
    showSourcesPreview:
      typeof merged.showSourcesPreview === 'boolean'
        ? merged.showSourcesPreview
        : defaults.showSourcesPreview,
    offlineOnlyMode:
      typeof merged.offlineOnlyMode === 'boolean'
        ? merged.offlineOnlyMode
        : defaults.offlineOnlyMode,
    academicProfile: validProfile,
    onboardingCompleted,
  };
}

/**
 * Determina si debe mostrarse el modal de Onboarding inicial.
 * Solo se muestra cuando la carga inicial terminó, no existe un perfil académico válido configurado
 * y el usuario no ha completado ni omitido previamente el onboarding.
 */
export function shouldShowAcademicOnboarding(
  preferences: AppPreferences,
  isLoading = false
): boolean {
  if (isLoading) return false;
  const validProfile = sanitizeAcademicProfile(preferences.academicProfile);
  if (validProfile) return false;
  if (preferences.onboardingCompleted === true) return false;
  return true;
}

export interface SaveAcademicProfileInput {
  primaryArea: AcademicAreaId;
  career?: string;
  specialty?: string;
}

/**
 * Construye el nuevo objeto `AppPreferences` al guardar un perfil académico válido
 * (desde el Onboarding inicial o desde Ajustes).
 */
export function buildUpdatedPreferencesWithProfile(
  currentPrefs: AppPreferences,
  input: SaveAcademicProfileInput
): AppPreferences {
  if (!isValidAcademicAreaId(input.primaryArea)) {
    throw new Error(`Área académica inválida: ${String(input.primaryArea)}`);
  }

  const profile: AcademicProfile = {
    primaryArea: input.primaryArea,
    career: input.career?.trim() ? input.career.trim().slice(0, 120) : undefined,
    specialty: input.specialty?.trim() ? input.specialty.trim().slice(0, 120) : undefined,
    updatedAt: Date.now(),
  };

  const areaDef = getAcademicAreaDefinition(profile.primaryArea);
  const nextLastSubject =
    profile.primaryArea === 'general'
      ? 'General'
      : profile.career || areaDef.label;

  return {
    ...currentPrefs,
    academicProfile: profile,
    onboardingCompleted: true,
    lastSubject: nextLastSubject,
  };
}

/**
 * Construye el nuevo objeto `AppPreferences` cuando el usuario decide omitir el Onboarding inicial
 * para configurarlo más adelante en Ajustes:
 * - No guarda ningún `academicProfile` incompleto ni impone una disciplina.
 * - Marca `onboardingCompleted: true` para no volver a mostrar el modal en cada inicio.
 */
export function buildUpdatedPreferencesOnSkipOnboarding(
  currentPrefs: AppPreferences
): AppPreferences {
  const nextLastSubject =
    normalizeAcademicText(currentPrefs.lastSubject) === LEGACY_DEFAULT_SUBJECT_NORMALIZED
      ? 'General'
      : currentPrefs.lastSubject || 'General';

  return {
    ...currentPrefs,
    academicProfile: undefined,
    onboardingCompleted: true,
    lastSubject: nextLastSubject,
  };
}

/**
 * F. Helpers de Contexto Académico Individual por Nota (Fase 3)
 */

export interface NoteAcademicSyncOptions {
  folder?: Pick<FolderEntity, 'name' | 'subject'> | null;
}

/**
 * Sincroniza los campos académicos de una nota (`disciplineMode`, `manualDiscipline`,
 * `detectedDiscipline`, `detectedDisciplineConfidence`) reutilizando `inferNoteDiscipline()`:
 * - En modo `'manual'` (cuando existe `manualDiscipline` no vacío), conserva intacta la disciplina
 *   fijada por el usuario hasta que vuelva explícitamente a `'auto'`.
 * - En modo `'auto'`, actualiza la disciplina detectada según el título, contenido, materia,
 *   etiquetas y carpeta actuales de la nota.
 */
export function syncNoteAcademicContext(
  note: NoteEntity,
  options?: NoteAcademicSyncOptions
): NoteEntity {
  const isManual =
    note.disciplineMode === 'manual' &&
    typeof note.manualDiscipline === 'string' &&
    note.manualDiscipline.trim().length > 0;

  const inference = inferNoteDiscipline({
    title: note.title,
    content: note.content,
    subject: note.subject,
    tags: note.tags,
    folderName: options?.folder?.name,
    folderSubject: options?.folder?.subject,
  });

  let nextDetectedDiscipline: AcademicAreaId = inference.detectedArea;
  let nextDetectedConfidence: DisciplineEvidenceLevel = inference.confidence;

  // En modo automático, si la nota ya tenía una disciplina detectada con confianza alta/media
  // y tras una edición menor sigue siendo el área con mayor puntuación (> 0) sin ambigüedad,
  // evitar parpadeos innecesarios a 'low'. Si otra disciplina la supera o el contenido se vacía, se actualiza.
  if (
    !isManual &&
    inference.confidence === 'low' &&
    isValidAcademicAreaId(note.detectedDiscipline) &&
    note.detectedDiscipline !== 'general' &&
    (note.detectedDisciplineConfidence === 'high' || note.detectedDisciplineConfidence === 'medium') &&
    inference.scoresByArea[note.detectedDiscipline] > 0 &&
    inference.detectedArea === note.detectedDiscipline &&
    !inference.isAmbiguous
  ) {
    nextDetectedDiscipline = note.detectedDiscipline;
    nextDetectedConfidence = 'medium';
  }

  if (isManual) {
    return {
      ...note,
      disciplineMode: 'manual',
      manualDiscipline: note.manualDiscipline!.trim(),
      detectedDiscipline: nextDetectedDiscipline,
      detectedDisciplineConfidence: nextDetectedConfidence,
    };
  }

  return {
    ...note,
    disciplineMode: 'auto',
    manualDiscipline: undefined,
    detectedDiscipline: nextDetectedDiscipline,
    detectedDisciplineConfidence: nextDetectedConfidence,
  };
}

/**
 * Cambia el modo de contexto académico de una nota entre `'auto'` y `'manual'`
 * o actualiza la disciplina manual fijada por el usuario:
 * - Al pasar de `'auto'` a `'manual'`, conserva la disciplina elegida (o fija la disciplina actualmente
 *   resuelta si no se especifica otra).
 * - Al volver de `'manual'` a `'auto'`, limpia `manualDiscipline` y reanuda inmediatamente la detección
 *   automática sobre el contenido actual de la nota.
 */
export function setNoteAcademicMode(
  note: NoteEntity,
  mode: DisciplineMode,
  manualDisciplineInput?: AcademicAreaId | string,
  options?: {
    folder?: Pick<FolderEntity, 'name' | 'subject'> | null;
    academicProfile?: AcademicProfile | null;
  }
): NoteEntity {
  if (mode === 'manual') {
    let targetManual =
      typeof manualDisciplineInput === 'string' && manualDisciplineInput.trim().length > 0
        ? manualDisciplineInput.trim()
        : typeof note.manualDiscipline === 'string' && note.manualDiscipline.trim().length > 0
          ? note.manualDiscipline.trim()
          : '';

    if (!targetManual) {
      const currentResolved = resolveAcademicContext({
        note: {
          ...note,
          disciplineMode: 'auto',
          folderName: options?.folder?.name,
          folderSubject: options?.folder?.subject,
        },
        academicProfile: options?.academicProfile,
      });
      targetManual = currentResolved.areaId;
    }

    return syncNoteAcademicContext(
      {
        ...note,
        disciplineMode: 'manual',
        manualDiscipline: targetManual,
      },
      { folder: options?.folder }
    );
  }

  // Modo 'auto': limpiar disciplina manual y recalcular desde cero según el contenido actual
  return syncNoteAcademicContext(
    {
      ...note,
      disciplineMode: 'auto',
      manualDiscipline: undefined,
      detectedDiscipline: undefined,
      detectedDisciplineConfidence: undefined,
    },
    { folder: options?.folder }
  );
}

export interface BuildInitialNoteEntityInput {
  id?: string;
  title?: string;
  content?: string;
  subject?: string;
  folderId?: string;
  folder?: Pick<FolderEntity, 'id' | 'name' | 'subject'> | null;
  tags?: string[];
  isPinned?: boolean;
  preferences?: Partial<AppPreferences> | null;
  now?: number;
}

/**
 * Construye una nueva `NoteEntity` con valores iniciales coherentes para `subject`
 * y campos de contexto académico en modo `'auto'`, sin imponer `'Psicología Cognitiva'`
 * cuando el usuario no ha configurado ese perfil.
 */
export function buildInitialNoteEntity(input: BuildInitialNoteEntityInput = {}): NoteEntity {
  const now = input.now ?? Date.now();
  const title = input.title?.trim() || 'Nota sin título';
  const content = input.content ?? '';
  const folderId = input.folderId || input.folder?.id || undefined;
  const validProfile = sanitizeAcademicProfile(input.preferences?.academicProfile);

  let defaultSubject = '';
  if (input.subject && input.subject.trim().length > 0) {
    defaultSubject = input.subject.trim();
  } else if (input.folder?.subject && input.folder.subject.trim().length > 0) {
    defaultSubject = input.folder.subject.trim();
  } else if (validProfile) {
    defaultSubject =
      validProfile.primaryArea === 'general'
        ? 'General'
        : validProfile.career || getAcademicAreaDefinition(validProfile.primaryArea).label;
  } else if (input.preferences?.lastSubject && input.preferences.lastSubject.trim().length > 0) {
    const rawLast = input.preferences.lastSubject.trim();
    defaultSubject =
      normalizeAcademicText(rawLast) === LEGACY_DEFAULT_SUBJECT_NORMALIZED ? 'General' : rawLast;
  } else {
    defaultSubject = 'General';
  }

  const trimmedContent = content.trim();
  const wordCount = trimmedContent ? trimmedContent.split(/\s+/).length : 0;
  const charCount = content.length;

  const baseNote: NoteEntity = {
    id: input.id || `note-${now}-${Math.random().toString(36).substring(2, 7)}`,
    title,
    content,
    folderId,
    subject: defaultSubject,
    tags: input.tags ? [...input.tags] : [],
    isPinned: input.isPinned ?? false,
    createdAt: now,
    updatedAt: now,
    wordCount,
    charCount,
    disciplineMode: 'auto',
    manualDiscipline: undefined,
  };

  return syncNoteAcademicContext(baseNote, { folder: input.folder });
}

export interface NoteAcademicSummary {
  mode: DisciplineMode;
  modeLabel: 'Auto' | 'Manual';
  areaId: AcademicAreaId;
  disciplineLabel: string;
  shortLabel: string;
  manualValue?: string;
  source: ContextResolutionSource;
  confidence: DisciplineEvidenceLevel;
  isAmbiguous: boolean;
  statusDescription: string;
  badgeText: string;
  badgeTooltip: string;
}

/**
 * Obtiene el resumen de contexto académico de una nota para mostrar en `NoteEditor` y `NotesList`:
 * - Evita recalcular `inferNoteDiscipline()` si la nota ya está en modo `'manual'` o si ya posee
 *   `detectedDiscipline` y `detectedDisciplineConfidence` persistidos.
 * - Soporta de forma transparente notas antiguas sin campos académicos calculándolos bajo demanda.
 */
export function getNoteAcademicSummary(
  note: Partial<NoteEntity> | null | undefined,
  options?: {
    folder?: Pick<FolderEntity, 'name' | 'subject'> | null;
    academicProfile?: AcademicProfile | null;
  }
): NoteAcademicSummary {
  const validProfile = sanitizeAcademicProfile(options?.academicProfile);
  const isManual =
    note?.disciplineMode === 'manual' &&
    typeof note.manualDiscipline === 'string' &&
    note.manualDiscipline.trim().length > 0;

  if (isManual) {
    const resolved = resolveAcademicContext({
      note,
      academicProfile: validProfile,
    });
    const areaDef = getAcademicAreaDefinition(resolved.areaId);
    const shortLabel =
      resolved.areaId !== 'general'
        ? areaDef.shortLabel
        : isExplicitGeneralOrMultidisciplinaryInput(note!.manualDiscipline!)
          ? areaDef.shortLabel
          : resolved.disciplineLabel;

    return {
      mode: 'manual',
      modeLabel: 'Manual',
      areaId: resolved.areaId,
      disciplineLabel: resolved.disciplineLabel,
      shortLabel,
      manualValue: note!.manualDiscipline!.trim(),
      source: 'note_manual',
      confidence: resolved.confidence,
      isAmbiguous: resolved.isAmbiguous,
      statusDescription: 'Fijada manualmente para este apunte',
      badgeText: `Manual · ${shortLabel}`,
      badgeTooltip: `Contexto académico fijado manualmente: ${resolved.disciplineLabel}`,
    };
  }

  // Modo automático: reutilizar campos persistidos si ya existen en la nota para no re-analizar en cada renderizado
  const hasPersistedDetection =
    isValidAcademicAreaId(note?.detectedDiscipline) &&
    (note?.detectedDisciplineConfidence === 'high' ||
      note?.detectedDisciplineConfidence === 'medium' ||
      note?.detectedDisciplineConfidence === 'low');

  let areaId: AcademicAreaId = 'general';
  let source: ContextResolutionSource = 'multidisciplinary_ambiguous';
  let confidence: DisciplineEvidenceLevel = 'low';
  let isAmbiguous = true;

  if (hasPersistedDetection) {
    const detArea = note!.detectedDiscipline!;
    const detConf = note!.detectedDisciplineConfidence!;

    if (detArea !== 'general' && (detConf === 'high' || detConf === 'medium')) {
      areaId = detArea;
      source = 'note_auto';
      confidence = detConf;
      isAmbiguous = false;
    } else if (validProfile && validProfile.primaryArea !== 'general') {
      areaId = validProfile.primaryArea;
      source = 'global_profile';
      confidence = 'low';
      isAmbiguous = false;
    } else {
      areaId = 'general';
      source = 'multidisciplinary_ambiguous';
      confidence = 'low';
      isAmbiguous = true;
    }
  } else {
    const resolved = resolveAcademicContext({
      note: {
        ...(note || {}),
        disciplineMode: 'auto',
        folderName: options?.folder?.name,
        folderSubject: options?.folder?.subject,
      },
      academicProfile: validProfile,
    });
    areaId = resolved.areaId;
    source = resolved.source;
    confidence = resolved.confidence;
    isAmbiguous = resolved.isAmbiguous;
  }

  const areaDef = getAcademicAreaDefinition(areaId);
  let statusDescription = 'Contexto abierto o multidisciplinario';
  if (source === 'note_auto') {
    statusDescription =
      confidence === 'high'
        ? 'Detectada automáticamente en este apunte (confianza alta)'
        : 'Detectada automáticamente en este apunte (confianza media)';
  } else if (source === 'global_profile') {
    statusDescription = 'Orientada por tu perfil académico global';
  }

  return {
    mode: 'auto',
    modeLabel: 'Auto',
    areaId,
    disciplineLabel: areaDef.label,
    shortLabel: areaDef.shortLabel,
    source,
    confidence,
    isAmbiguous,
    statusDescription,
    badgeText: `Auto · ${areaDef.shortLabel}`,
    badgeTooltip:
      source === 'note_auto'
        ? `Disciplina detectada automáticamente: ${areaDef.label}`
        : source === 'global_profile'
          ? `Contexto automático según tu perfil global: ${areaDef.label}`
          : `Contexto automático: ${areaDef.label}`,
  };
}


