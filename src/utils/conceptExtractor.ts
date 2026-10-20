import {
  AcademicAreaId,
  AcademicProfile,
  ContextResolutionSource,
  DisciplineMode,
  FolderEntity,
  NoteEntity,
} from '../types/models';
import { getNoteAcademicSummary, resolveAcademicContext } from './academicContext';

export const EXTRACTION_PRIMARY_MODEL = 'gemini-3.5-flash-lite';
export const EXTRACTION_FALLBACK_MODEL = 'gemini-3.8-flash';

export interface RawExtractedTerm {
  name: string;
  academicField: string;
  contextSnippet: string;
  isCompound: boolean;
}

export interface ExtractionAcademicContextMetadata {
  areaId: AcademicAreaId;
  disciplineLabel: string;
  source: ContextResolutionSource;
  mode: DisciplineMode;
  career?: string;
  specialty?: string;
}

export interface ExtractionRequestPayload {
  text: string;
  title: string;
  noteTitle: string;
  subject: string;
  academicContext: ExtractionAcademicContextMetadata;
}

export type ExtractionErrorKind =
  | 'TRANSIENT_ERROR'
  | 'PERMANENT_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'INVALID_REQUEST';

export type ApiErrorCategory =
  | 'quota_exhausted'
  | 'rate_limit'
  | 'unspecified_429'
  | 'timeout'
  | 'high_demand'
  | 'invalid_request'
  | 'unauthorized'
  | 'not_found'
  | 'unknown';

export class ConceptExtractionError extends Error {
  public readonly kind: ExtractionErrorKind;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly details?: string;
  public readonly category?: ApiErrorCategory;

  constructor(
    kind: ExtractionErrorKind,
    message: string,
    statusCode: number,
    retryable: boolean,
    details?: string,
    category?: ApiErrorCategory
  ) {
    super(message);
    this.name = 'ConceptExtractionError';
    this.kind = kind;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.details = details;
    this.category = category;
  }
}

const GENERIC_SUBJECT_LABELS = new Set([
  '',
  'general',
  'general o multidisciplinario',
  'sin materia',
  'sin asignatura',
]);

function isGenericSubject(subject?: string | null): boolean {
  if (!subject || typeof subject !== 'string') return true;
  return GENERIC_SUBJECT_LABELS.has(subject.trim().toLowerCase());
}

/**
 * Resolves the effective academic context for concept extraction from a NoteEntity, its FolderEntity,
 * and the user's global AcademicProfile, preventing a default 'General' subject from masking
 * a specific resolved discipline (manual, auto-inferred, or profile-based).
 */
export function buildExtractionRequestPayload(params: {
  text: string;
  title?: string;
  defaultSubject?: string;
  note?: Partial<NoteEntity> | null;
  folders?: FolderEntity[];
  academicProfile?: AcademicProfile | null;
}): ExtractionRequestPayload {
  const { text, title, defaultSubject, note, folders = [], academicProfile } = params;
  const effectiveTitle = (title ?? note?.title ?? 'Apunte').trim() || 'Apunte';
  const rawNoteSubject = (defaultSubject ?? note?.subject ?? '').trim();

  const folder = note?.folderId ? folders.find((f) => f.id === note.folderId) ?? null : null;

  let areaId: AcademicAreaId = 'general';
  let disciplineLabel = 'General o multidisciplinario';
  let source: ContextResolutionSource = 'multidisciplinary_ambiguous';
  let mode: DisciplineMode = note?.disciplineMode === 'manual' ? 'manual' : 'auto';

  if (note) {
    // Re-evaluate with current textToAnalyze in case the user is analyzing a specific fragment or updated text
    const textChangedFromNote = Boolean(text && note.content && text.trim() !== note.content.trim());
    const noteSnapshot: Partial<NoteEntity> = {
      ...note,
      title: effectiveTitle,
      content: text || note.content || '',
      // If analyzing a specific fragment or updated text in auto mode, allow fresh inference on the text
      ...(textChangedFromNote && note.disciplineMode !== 'manual'
        ? { detectedDiscipline: undefined, detectedDisciplineConfidence: undefined }
        : {}),
    };
    const summary = getNoteAcademicSummary(noteSnapshot, {
      folder,
      academicProfile: academicProfile ?? undefined,
    });
    areaId = summary.areaId;
    disciplineLabel = summary.disciplineLabel;
    source = summary.source;
    mode = summary.mode;
  } else {
    const resolution = resolveAcademicContext({
      note: {
        title: effectiveTitle,
        content: text,
        subject: isGenericSubject(rawNoteSubject) ? undefined : rawNoteSubject,
        folderName: folder?.name,
        folderSubject: folder?.subject,
      },
      academicProfile: academicProfile ?? undefined,
    });
    areaId = resolution.areaId;
    disciplineLabel = resolution.disciplineLabel;
    source = resolution.source;
  }

  let effectiveSubject: string;
  if (mode === 'manual') {
    effectiveSubject = disciplineLabel;
  } else if (areaId !== 'general') {
    effectiveSubject = isGenericSubject(rawNoteSubject) ? disciplineLabel : rawNoteSubject;
  } else {
    effectiveSubject = isGenericSubject(rawNoteSubject) ? 'General' : rawNoteSubject;
  }

  return {
    text,
    title: effectiveTitle,
    noteTitle: effectiveTitle,
    subject: effectiveSubject,
    academicContext: {
      areaId,
      disciplineLabel,
      source,
      mode,
      career: academicProfile?.career?.trim() || undefined,
      specialty: academicProfile?.specialty?.trim() || undefined,
    },
  };
}

/**
 * Splits note text into bounded chunks at sentence or line boundaries so concepts are not cut mid-phrase.
 */
export function splitTextIntoExtractionChunks(text: string, maxChunkSize = 4000): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChunkSize) return [trimmed];

  const chunks: string[] = [];
  let i = 0;
  while (i < trimmed.length) {
    let end = Math.min(i + maxChunkSize, trimmed.length);
    if (end < trimmed.length) {
      const lastPeriod = trimmed.lastIndexOf('.', end);
      const lastNewline = trimmed.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > i + maxChunkSize * 0.5) {
        end = breakPoint + 1;
      }
    }
    const piece = trimmed.slice(i, end).trim();
    if (piece.length > 0) {
      chunks.push(piece);
    }
    i = end;
  }
  return chunks;
}

/**
 * Builds the structured prompt for concept extraction.
 * Delimits canonical concept names from adjacent explanations in telegraphic student notes
 * and treats the academic context strictly as an interpretive guide.
 */
export function buildConceptExtractionPrompt(params: {
  chunkText: string;
  subject?: string;
  title?: string;
  academicContext?: Partial<ExtractionAcademicContextMetadata> | null;
}): string {
  const { chunkText, subject, title, academicContext } = params;
  const effectiveTitle = (title || 'Apunte de estudio').trim();
  const discipline =
    academicContext?.disciplineLabel && academicContext.areaId !== 'general'
      ? academicContext.disciplineLabel
      : !isGenericSubject(subject)
      ? subject!.trim()
      : 'General o multidisciplinario';

  const specialtyHint = [academicContext?.career, academicContext?.specialty]
    .filter(Boolean)
    .join(' · ');

  return `Actúa como un analista terminológico universitario riguroso.
Tu tarea es extraer TODOS los conceptos académicos y técnicos presentes en el siguiente fragmento de apuntes de estudio.

CONTEXTO DEL APUNTE:
- Título del apunte: "${effectiveTitle}"
- Disciplina académica orientadora: "${discipline}"${specialtyHint ? ` (${specialtyHint})` : ''}
- Regla de contexto: Utiliza la disciplina como guía interpretativa para reconocer la terminología técnica del área, pero NUNCA inventes ni agregues conceptos que no aparezcan explícitamente mencionados en el texto del estudiante.

REGLAS ESTRICTAS DE DELIMITACIÓN TERMINOLÓGICA:
1. Separa el NOMBRE CANÓNICO de su explicación adyacente:
   - Los apuntes de estudiantes suelen ser telegráficos, sin puntuación ni dos puntos, colocando el nombre del concepto seguido inmediatamente por su función, definición o característica.
   - Extrae en "name" ÚNICAMENTE el sustantivo o sintagma nominal canónico del concepto (normalmente de 1 a 4 palabras), sin verbos conjugados ni predicados explicativos.
   - Ejemplo de delimitación correcta en apuntes sin puntuación:
     * Si el apunte dice: "Ejecutivo central dirige la atención coordina sistemas esclavos" -> name: "Ejecutivo central" (NO incluyas "dirige la atención...").
     * Si el apunte dice: "Bucle fonológico procesa información verbal y acústica" -> name: "Bucle fonológico".
     * Si el apunte dice: "Agenda visoespacial mantiene y manipula imágenes visuales" -> name: "Agenda visoespacial".
     * Si el apunte dice: "Buffer episódico integra información multimodal con la memoria a largo plazo" -> name: "Buffer episódico".
2. Cobertura completa del fragmento:
   - Incluye tanto el concepto principal del tema (ej. "Memoria de trabajo") como todos los subcomponentes, sistemas o conceptos técnicos específicos que el apunte enumere o describa.
   - No fusiones conceptos distintos en uno solo ni omitas componentes técnicos por tener explicaciones breves.
   - No extraigas nombres sueltos de autores ni fechas como conceptos independientes a menos que formen parte del nombre canónico de un modelo, ley o teoría explícita en el texto.
3. Fragmento de contexto ("contextSnippet"):
   - Incluye una cita breve y concisa (máximo 140 caracteres) de la línea o frase donde aparece el término en el apunte. No copies el párrafo entero repetidamente.
4. Si el texto no contiene ningún concepto académico o técnico identificable, devuelve exactamente {"terms": []}.

TEXTO DEL APUNTE A ANALIZAR:
"""
${chunkText}
"""

Devuelve EXCLUSIVAMENTE un objeto JSON válido con la propiedad "terms" siguiendo el esquema indicado.`;
}

function normalizeTermComparisonKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function cleanCanonicalTermName(rawName: string): string {
  return rawName
    .trim()
    .replace(/^[-•*–—\d.)\s]+/, '')
    .replace(/[:.;,\s]+$/, '')
    .replace(/\s+/g, ' ');
}

function cleanContextSnippet(rawSnippet: string, maxLength = 160): string {
  const normalized = rawSnippet.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Strips optional Markdown code fences (e.g. ```json ... ```) around a JSON string.
 */
export function stripMarkdownJsonFences(rawText: string): string {
  const trimmed = rawText.trim();
  const fenceMatch = trimmed.match(/^```(?:json|JSON)?\s*\r?\n?([\s\S]*?)\r?\n?```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

/**
 * Deduplicates extracted terms by normalized canonical name (case/accent/space-insensitive)
 * without collapsing distinct concepts.
 */
export function deduplicateExtractedTerms(terms: RawExtractedTerm[]): RawExtractedTerm[] {
  const seen = new Map<string, RawExtractedTerm>();

  for (const term of terms) {
    const key = normalizeTermComparisonKey(term.name);
    if (!key) continue;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, term);
    } else if (!existing.contextSnippet && term.contextSnippet) {
      seen.set(key, {
        ...existing,
        contextSnippet: term.contextSnippet,
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Parses, validates, normalizes, and deduplicates the raw JSON response from the extraction model.
 * Throws a ConceptExtractionError('MALFORMED_RESPONSE') if the payload is not valid JSON or violates the schema.
 */
export function parseAndValidateExtractedTerms(
  rawText: unknown,
  options?: { fallbackSubject?: string; maxSnippetLength?: number }
): RawExtractedTerm[] {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new ConceptExtractionError(
      'MALFORMED_RESPONSE',
      'El modelo devolvió una respuesta vacía durante la extracción de conceptos.',
      502,
      true
    );
  }

  const cleanedJsonText = stripMarkdownJsonFences(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanedJsonText);
  } catch (err: any) {
    throw new ConceptExtractionError(
      'MALFORMED_RESPONSE',
      'La respuesta del modelo no es un JSON válido o está truncada.',
      502,
      true,
      err?.message || String(err)
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConceptExtractionError(
      'MALFORMED_RESPONSE',
      'La respuesta del modelo no tiene la estructura de objeto esperada ({ terms: [...] }).',
      502,
      true
    );
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.terms)) {
    throw new ConceptExtractionError(
      'MALFORMED_RESPONSE',
      'El objeto JSON devuelto no contiene el arreglo obligatorio "terms".',
      502,
      true
    );
  }

  if (record.terms.length === 0) {
    return [];
  }

  const maxSnippetLength = options?.maxSnippetLength ?? 160;
  const fallbackSubject = options?.fallbackSubject?.trim() || 'General';
  const validated: RawExtractedTerm[] = [];

  for (let idx = 0; idx < record.terms.length; idx++) {
    const item = record.terms[idx];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ConceptExtractionError(
        'MALFORMED_RESPONSE',
        `El elemento en terms[${idx}] no es un objeto válido.`,
        502,
        true
      );
    }

    const rawItem = item as Record<string, unknown>;
    if (
      typeof rawItem.name !== 'string' ||
      typeof rawItem.academicField !== 'string' ||
      typeof rawItem.contextSnippet !== 'string' ||
      typeof rawItem.isCompound !== 'boolean'
    ) {
      throw new ConceptExtractionError(
        'MALFORMED_RESPONSE',
        `El elemento en terms[${idx}] incumple los tipos obligatorios (name, academicField, contextSnippet, isCompound).`,
        502,
        true
      );
    }

    const cleanName = cleanCanonicalTermName(rawItem.name);
    const cleanField = rawItem.academicField.trim() || fallbackSubject;
    const cleanSnippet = cleanContextSnippet(rawItem.contextSnippet, maxSnippetLength);

    if (cleanName.length < 2) {
      throw new ConceptExtractionError(
        'MALFORMED_RESPONSE',
        `El concepto en terms[${idx}] tiene un nombre vacío o inválido.`,
        502,
        true
      );
    }

    validated.push({
      name: cleanName,
      academicField: cleanField,
      contextSnippet: cleanSnippet,
      isCompound: rawItem.isCompound || cleanName.includes(' '),
    });
  }

  return deduplicateExtractedTerms(validated);
}

export interface AnalyzedErrorReason {
  category: ApiErrorCategory;
  userMessage: string;
  statusCode: number;
  retryable: boolean;
  kind: ExtractionErrorKind;
}

/**
 * Distingue, cuando los detalles del error lo permitan, entre cuota agotada,
 * límite temporal de solicitudes (rate limit), alta demanda, timeout y solicitud inválida.
 * No afirma que se conoce la causa exacta si el error no proporciona información suficiente.
 */
export function analyzeApiErrorDetails(
  error: unknown,
  actionContext?: string
): AnalyzedErrorReason {
  const anyErr = error as any;
  const rawStatus =
    typeof anyErr?.status === 'number'
      ? anyErr.status
      : typeof anyErr?.statusCode === 'number'
      ? anyErr.statusCode
      : typeof anyErr?.error?.code === 'number'
      ? anyErr.error.code
      : undefined;

  const rawMessage =
    typeof anyErr?.message === 'string'
      ? anyErr.message
      : typeof anyErr?.error?.message === 'string'
      ? anyErr.error.message
      : typeof error === 'string'
      ? error
      : JSON.stringify(error ?? 'Error desconocido');

  const lowerMsg = rawMessage.toLowerCase();
  const upperMsg = rawMessage.toUpperCase();
  const contextSuffix = actionContext ? ` ${actionContext}` : '';

  // 1. Errores permanentes de autenticación o permisos (401, 403)
  const isAuth =
    rawStatus === 401 ||
    rawStatus === 403 ||
    lowerMsg.includes('api_key_invalid') ||
    lowerMsg.includes('api key not valid') ||
    lowerMsg.includes('permission_denied') ||
    lowerMsg.includes('unauthenticated') ||
    lowerMsg.includes('forbidden');

  if (isAuth) {
    return {
      category: 'unauthorized',
      userMessage: `Credenciales o permisos de API no válidos (401/403)${contextSuffix}. Verifica tu API key.`,
      statusCode: rawStatus === 401 ? 401 : 403,
      retryable: false,
      kind: 'PERMANENT_ERROR',
    };
  }

  // 2. Errores permanentes de solicitud / argumentos inválidos (400, 422)
  const isInvalid =
    rawStatus === 400 ||
    rawStatus === 422 ||
    lowerMsg.includes('invalid_argument') ||
    lowerMsg.includes('invalid argument') ||
    lowerMsg.includes('solicitud inválida') ||
    lowerMsg.includes('bad request') ||
    lowerMsg.includes('missing termname') ||
    lowerMsg.includes('payload invalid');

  if (isInvalid) {
    return {
      category: 'invalid_request',
      userMessage: `Solicitud rechazada por configuración o parámetro inválido (400 INVALID_ARGUMENT)${contextSuffix}.`,
      statusCode: 400,
      retryable: false,
      kind: 'PERMANENT_ERROR',
    };
  }

  // 3. Herramienta o modelo no disponible / no encontrado (404 / 502)
  const isNotFoundOrTool =
    rawStatus === 404 ||
    lowerMsg.includes('404') ||
    lowerMsg.includes('not_found') ||
    lowerMsg.includes('not found') ||
    lowerMsg.includes('search grounding is not supported') ||
    lowerMsg.includes('tool not supported');

  if (isNotFoundOrTool) {
    return {
      category: 'not_found',
      userMessage: `El modelo o la herramienta solicitada no está disponible${contextSuffix}.`,
      statusCode: 502,
      retryable: false,
      kind: 'PERMANENT_ERROR',
    };
  }

  // 4. Límite de solicitudes o cuota (429 / RESOURCE_EXHAUSTED)
  const is429 =
    rawStatus === 429 ||
    lowerMsg.includes('429') ||
    upperMsg.includes('RESOURCE_EXHAUSTED') ||
    lowerMsg.includes('resource exhausted') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('rate limit');

  if (is429) {
    // Evidencia específica de cuota agotada de plan / cuenta / diaria
    const mentionsQuotaExhausted =
      lowerMsg.includes('quota exceeded') ||
      lowerMsg.includes('exceeded your current quota') ||
      lowerMsg.includes('daily quota') ||
      lowerMsg.includes('free tier') ||
      lowerMsg.includes('free_tier') ||
      lowerMsg.includes('quota limit') ||
      lowerMsg.includes('insufficient_quota') ||
      lowerMsg.includes('check your plan') ||
      lowerMsg.includes('billing');

    // Evidencia específica de límite temporal por minuto (RPM / TPM)
    const mentionsRateLimit =
      lowerMsg.includes('rate limit') ||
      lowerMsg.includes('rate_limit') ||
      lowerMsg.includes('requests per minute') ||
      lowerMsg.includes('tokens per minute') ||
      lowerMsg.includes('rpm') ||
      lowerMsg.includes('tpm') ||
      lowerMsg.includes('per minute') ||
      lowerMsg.includes('too many requests') ||
      lowerMsg.includes('temporarily throttled');

    if (mentionsQuotaExhausted && !mentionsRateLimit) {
      return {
        category: 'quota_exhausted',
        userMessage: `Cuota de uso de la API agotada para este modelo (429 RESOURCE_EXHAUSTED)${contextSuffix}. Por favor, revisa tu plan o cuota disponible.`,
        statusCode: 429,
        retryable: true,
        kind: 'TRANSIENT_ERROR',
      };
    }

    if (mentionsRateLimit && !mentionsQuotaExhausted) {
      return {
        category: 'rate_limit',
        userMessage: `Límite temporal de solicitudes por minuto alcanzado (429 rate limit)${contextSuffix}. Espera unos momentos antes de reintentar.`,
        statusCode: 429,
        retryable: true,
        kind: 'TRANSIENT_ERROR',
      };
    }

    // Sin información suficiente para asegurar si es cuota acumulada o límite temporal
    return {
      category: 'unspecified_429',
      userMessage: `Límite de solicitudes o cuota alcanzado en la API (429 RESOURCE_EXHAUSTED)${contextSuffix}.`,
      statusCode: 429,
      retryable: true,
      kind: 'TRANSIENT_ERROR',
    };
  }

  // 5. Tiempo de espera agotado (Timeout / Deadline Exceeded / 504)
  const isTimeout =
    rawStatus === 504 ||
    lowerMsg.includes('504') ||
    lowerMsg.includes('deadline_exceeded') ||
    lowerMsg.includes('deadline exceeded') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('timed out') ||
    lowerMsg.includes('etimedout') ||
    lowerMsg.includes('econnreset') ||
    lowerMsg.includes('fetch failed');

  if (isTimeout) {
    return {
      category: 'timeout',
      userMessage: `Tiempo de espera agotado al conectar con el servicio (timeout/504)${contextSuffix}.`,
      statusCode: 504,
      retryable: true,
      kind: 'TRANSIENT_ERROR',
    };
  }

  // 6. Alta demanda / Indisponibilidad transitoria del servidor (503 / 502)
  const isHighDemand =
    rawStatus === 503 ||
    rawStatus === 502 ||
    lowerMsg.includes('503') ||
    lowerMsg.includes('unavailable') ||
    lowerMsg.includes('high demand') ||
    lowerMsg.includes('overloaded') ||
    lowerMsg.includes('service unavailable');

  if (isHighDemand) {
    return {
      category: 'high_demand',
      userMessage: `El servicio experimenta alta demanda o indisponibilidad temporal (503)${contextSuffix}. Reintenta en unos instantes.`,
      statusCode: 503,
      retryable: true,
      kind: 'TRANSIENT_ERROR',
    };
  }

  // 7. Error no clasificado
  const fallbackStatus = rawStatus && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  return {
    category: 'unknown',
    userMessage: `Error inesperado del servicio de análisis (${fallbackStatus})${contextSuffix}.`,
    statusCode: fallbackStatus,
    retryable: true,
    kind: 'TRANSIENT_ERROR',
  };
}

/**
 * Classifies an unknown error from the Gemini SDK or parser into a structured ConceptExtractionError.
 */
export function classifyExtractionError(err: unknown): ConceptExtractionError {
  if (err instanceof ConceptExtractionError) {
    return err;
  }

  const analyzed = analyzeApiErrorDetails(err, 'al extraer conceptos');
  const anyErr = err as any;
  const rawMessage =
    typeof anyErr?.message === 'string'
      ? anyErr.message
      : typeof anyErr?.error?.message === 'string'
      ? anyErr.error.message
      : typeof err === 'string'
      ? err
      : JSON.stringify(err ?? 'Error desconocido');

  return new ConceptExtractionError(
    analyzed.kind,
    analyzed.userMessage,
    analyzed.statusCode,
    analyzed.retryable,
    rawMessage,
    analyzed.category
  );
}

export interface ChunkExtractionResult {
  terms: RawExtractedTerm[];
  method: string;
  attemptsUsed: number;
}

export interface ExtractTermsResilienceOptions {
  models?: string[];
  maxAttemptsPerModel?: number;
  retryDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * Executes concept extraction across chunks with bounded retries and fallback model resilience.
 * Never returns 200 OK / empty array when a chunk fails due to technical or parse errors.
 */
export async function extractTermsFromChunksWithResilience(
  chunks: string[],
  context: {
    subject?: string;
    title?: string;
    academicContext?: Partial<ExtractionAcademicContextMetadata> | null;
  },
  callModel: (params: {
    model: string;
    prompt: string;
    chunkText: string;
    chunkIndex: number;
    attempt: number;
  }) => Promise<string>,
  options?: ExtractTermsResilienceOptions
): Promise<ChunkExtractionResult> {
  if (!Array.isArray(chunks) || chunks.length === 0 || chunks.every((c) => !c.trim())) {
    throw new ConceptExtractionError(
      'INVALID_REQUEST',
      'Se requiere un texto válido para extraer términos.',
      400,
      false
    );
  }

  const models =
    options?.models && options.models.length > 0
      ? options.models
      : [EXTRACTION_PRIMARY_MODEL, EXTRACTION_FALLBACK_MODEL];
  const maxAttemptsPerModel = Math.max(1, options?.maxAttemptsPerModel ?? 2);
  const retryDelayMs = options?.retryDelayMs ?? 900;
  const sleepFn = options?.sleepFn ?? defaultSleep;

  const collectedTerms: RawExtractedTerm[] = [];
  let lastModelUsed = models[0];
  let totalAttempts = 0;
  const exhaustedQuotaModels = new Set<string>();
  const rateLimitedModels = new Set<string>();
  let lastChunkError: ConceptExtractionError | null = null;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunkText = chunks[chunkIndex];
    const prompt = buildConceptExtractionPrompt({
      chunkText,
      subject: context.subject,
      title: context.title,
      academicContext: context.academicContext,
    });

    // Excluir de fragmentos posteriores únicamente modelos cuya cuota se haya identificado fehacientemente como agotada
    const nonExhaustedModels = models.filter((m) => !exhaustedQuotaModels.has(m));
    if (nonExhaustedModels.length === 0) {
      throw (
        lastChunkError ??
        new ConceptExtractionError(
          'TRANSIENT_ERROR',
          'La cuota de la API se encuentra agotada en todos los modelos disponibles para la extracción de conceptos.',
          429,
          true,
          'All extraction models exhausted quota',
          'quota_exhausted'
        )
      );
    }

    // Para rate_limit o 429 no especificado, evitar cadenas de llamadas priorizando modelos no limitados en esta extracción
    const candidateModels = [
      ...nonExhaustedModels.filter((m) => !rateLimitedModels.has(m)),
      ...nonExhaustedModels.filter((m) => rateLimitedModels.has(m)),
    ];

    let chunkSucceeded = false;
    lastChunkError = null;
    let switchedDueTo429 = false;
    let mIdx = 0;
    let attemptForModel = 0;

    while (mIdx < candidateModels.length && !chunkSucceeded) {
      const model = candidateModels[mIdx];
      attemptForModel++;
      totalAttempts++;

      try {
        const rawResponse = await callModel({
          model,
          prompt,
          chunkText,
          chunkIndex,
          attempt: totalAttempts,
        });

        const parsedTerms = parseAndValidateExtractedTerms(rawResponse, {
          fallbackSubject:
            context.academicContext?.disciplineLabel &&
            context.academicContext.areaId !== 'general'
              ? context.academicContext.disciplineLabel
              : context.subject || 'General',
        });

        collectedTerms.push(...parsedTerms);
        lastModelUsed = model;
        chunkSucceeded = true;
        break;
      } catch (err: unknown) {
        const classified = classifyExtractionError(err);
        lastChunkError = classified;

        // 1. Error permanente (400, credenciales inválidas, etc.): abortar inmediatamente sin más reintentos ni fragmentos
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
          if (classified.category === 'quota_exhausted') {
            exhaustedQuotaModels.add(model);
          } else {
            rateLimitedModels.add(model);
          }

          // Si ya habíamos conmutado al modelo alternativo por 429 y este también falla por cuota:
          // detener los reintentos inmediatamente y abortar todo el proceso de fragmentos
          if (switchedDueTo429) {
            throw classified;
          }

          switchedDueTo429 = true;
          mIdx++;
          attemptForModel = 0;

          if (mIdx >= candidateModels.length) {
            throw classified;
          }

          if (retryDelayMs > 0) {
            await sleepFn(Math.min(retryDelayMs, 300));
          }
          continue;
        }

        // 3. Errores transitorios (503 alta demanda, timeout 504, respuestas malformadas):
        // Permite hasta maxAttemptsPerModel en el modelo actual.
        // Si el modelo principal dio 429 y el alternativo da 503 o timeout,
        // permite una recuperación razonable con espera en el alternativo (hasta maxAttemptsPerModel, acotando a 3 llamadas totales)
        if (attemptForModel < maxAttemptsPerModel) {
          await sleepFn(retryDelayMs * attemptForModel);
          continue;
        } else {
          mIdx++;
          attemptForModel = 0;
          if (mIdx < candidateModels.length) {
            await sleepFn(retryDelayMs);
          }
        }
      }
    }

    if (!chunkSucceeded) {
      throw (
        lastChunkError ??
        new ConceptExtractionError(
          'TRANSIENT_ERROR',
          `No se pudo completar la extracción de conceptos en el fragmento ${chunkIndex + 1} tras agotar los reintentos.`,
          503,
          true
        )
      );
    }
  }

  return {
    terms: deduplicateExtractedTerms(collectedTerms),
    method: lastModelUsed,
    attemptsUsed: totalAttempts,
  };
}

/**
 * Concurrency lock helper to prevent duplicate simultaneous extraction requests (e.g., on double click).
 */
export function createExtractionConcurrencyGuard() {
  let active = false;

  return {
    isBusy(): boolean {
      return active;
    },
    async run<T>(task: () => Promise<T>): Promise<{ executed: true; value: T } | { executed: false }> {
      if (active) {
        return { executed: false };
      }
      active = true;
      try {
        const value = await task();
        return { executed: true, value };
      } finally {
        active = false;
      }
    },
  };
}
