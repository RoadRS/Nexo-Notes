import {
  AcademicAreaId,
  CachedAnalysisEntity,
  ConceptEntity,
  ResolvedAcademicContext,
} from '../types/models';
import {
  buildAnalysisCacheKey,
  CacheKeyContextOptions,
  isValidAcademicAreaId,
  parseAcademicAreaId,
} from './academicContext';
import {
  hasExcessiveMetadiscourse,
  isIncompleteOrTruncatedSentence,
} from './conceptDefiner';

export type AcademicContextInput =
  | ResolvedAcademicContext
  | CacheKeyContextOptions
  | AcademicAreaId
  | {
      areaId?: AcademicAreaId | string | null;
      academicAreaId?: AcademicAreaId | string | null;
      academicField?: string | null;
      subject?: string | null;
      queryInstruction?: string;
      isAmbiguous?: boolean;
    }
  | string
  | null
  | undefined;

const GENERIC_DISCIPLINE_LABELS = new Set([
  '',
  'general',
  'general o multidisciplinario',
  'academico',
  'apunte academico',
  'apunte',
  'sin clasificar',
  'sin materia',
  'sin asignatura',
  'sin area',
  'desconocido',
  'desconocida',
  'area desconocida',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
]);

const KNOWN_ERROR_DEFINITION_SNIPPETS = [
  'no se pudo completar la operacion',
  'error al contactar',
  'error de conexion o cuota',
  'sin definicion disponible',
  'error al generar',
  'fallo en la consulta',
  'error procesando termino',
  'explicacion didactica orientada al marco teorico del apunte',
  'aplicacion practica del concepto en contextos de estudio',
  'definicion pendiente',
  'explicacion pendiente',
  'ejemplo pendiente',
];

/**
 * Normaliza un texto eliminando diacríticos, signos de puntuación sobrantes y espacios repetidos.
 */
export function normalizeConceptText(value?: string | null): string {
  if (!value || typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Normaliza el nombre de un término para índices y comparaciones.
 */
export function normalizeConceptTermName(termName?: string | null): string {
  if (!termName || typeof termName !== 'string') return '';
  return termName.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Determina si una etiqueta de campo/disciplina es genérica o vacía (sin área específica).
 */
export function isGenericDisciplineLabel(value?: string | null): boolean {
  const norm = normalizeConceptText(value);
  return !norm || GENERIC_DISCIPLINE_LABELS.has(norm);
}

/**
 * Resuelve un `AcademicAreaId` específico del catálogo (excluyendo `'general'`),
 * o `null` si la entrada es genérica, desconocida o no mapeable al catálogo.
 */
export function resolveSpecificAcademicAreaId(
  input?: AcademicContextInput
): Exclude<AcademicAreaId, 'general'> | null {
  if (!input) return null;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed || isGenericDisciplineLabel(trimmed)) return null;
    if (isValidAcademicAreaId(trimmed)) {
      return trimmed === 'general' ? null : trimmed;
    }
    const parsed = parseAcademicAreaId(trimmed);
    return parsed && parsed !== 'general' ? parsed : null;
  }

  if (typeof input === 'object') {
    const candidateIds = [
      'areaId' in input ? input.areaId : undefined,
      'academicAreaId' in input ? input.academicAreaId : undefined,
    ];

    for (const candidate of candidateIds) {
      if (typeof candidate === 'string' && candidate.trim()) {
        if (isValidAcademicAreaId(candidate) && candidate !== 'general') {
          return candidate;
        }
        const parsed = parseAcademicAreaId(candidate);
        if (parsed && parsed !== 'general') {
          return parsed;
        }
      }
    }

    const candidateFields = [
      'academicField' in input ? input.academicField : undefined,
      'subject' in input ? input.subject : undefined,
      'disciplineLabel' in input ? (input as ResolvedAcademicContext).disciplineLabel : undefined,
    ];

    for (const field of candidateFields) {
      if (typeof field === 'string' && field.trim() && !isGenericDisciplineLabel(field)) {
        const parsed = parseAcademicAreaId(field);
        if (parsed && parsed !== 'general') {
          return parsed;
        }
      }
    }
  }

  return null;
}

/**
 * Resuelve la clave canónica de disciplina para un concepto o contexto:
 * - `'area:<AcademicAreaId>'` cuando pertenece a una de las 8 áreas específicas del catálogo.
 * - `'field:<campo_normalizado>'` cuando tiene una asignatura específica fuera del catálogo.
 * - `'unknown'` cuando no tiene disciplina o es genérica (`'General'`, `''`, etc.).
 */
export function resolveCanonicalDisciplineKey(input?: AcademicContextInput): string {
  const specificArea = resolveSpecificAcademicAreaId(input);
  if (specificArea) {
    return `area:${specificArea}`;
  }

  if (typeof input === 'string') {
    const norm = normalizeConceptText(input);
    if (norm && !GENERIC_DISCIPLINE_LABELS.has(norm)) {
      return `field:${norm.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
    }
    return 'unknown';
  }

  if (input && typeof input === 'object') {
    const rawField =
      ('academicField' in input && input.academicField) ||
      ('subject' in input && input.subject) ||
      ('areaId' in input && typeof input.areaId === 'string' ? input.areaId : '') ||
      '';
    const norm = normalizeConceptText(rawField);
    if (norm && !GENERIC_DISCIPLINE_LABELS.has(norm)) {
      return `field:${norm.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
    }
  }

  return 'unknown';
}

/**
 * Construye la clave contextual de `analysisCache` delegando en `buildAnalysisCacheKey`.
 */
export function resolveContextualCacheKey(
  termName: string,
  contextOrArea?: AcademicContextInput,
  explicitInstructionOverride?: string
): string {
  const specificArea = resolveSpecificAcademicAreaId(contextOrArea);
  if (specificArea) {
    if (contextOrArea && typeof contextOrArea === 'object') {
      return buildAnalysisCacheKey(
        termName,
        {
          areaId: specificArea,
          queryInstruction:
            'queryInstruction' in contextOrArea ? contextOrArea.queryInstruction : undefined,
          isAmbiguous: 'isAmbiguous' in contextOrArea ? contextOrArea.isAmbiguous : undefined,
        },
        explicitInstructionOverride
      );
    }
    return buildAnalysisCacheKey(termName, specificArea, explicitInstructionOverride);
  }

  if (typeof contextOrArea === 'string' || !contextOrArea) {
    return buildAnalysisCacheKey(termName, contextOrArea ?? 'general', explicitInstructionOverride);
  }

  const fallbackArea =
    ('academicField' in contextOrArea && contextOrArea.academicField) ||
    ('subject' in contextOrArea && contextOrArea.subject) ||
    ('areaId' in contextOrArea && contextOrArea.areaId) ||
    'general';

  return buildAnalysisCacheKey(
    termName,
    {
      areaId: String(fallbackArea),
      queryInstruction:
        'queryInstruction' in contextOrArea ? contextOrArea.queryInstruction : undefined,
      isAmbiguous: 'isAmbiguous' in contextOrArea ? contextOrArea.isAmbiguous : undefined,
    },
    explicitInstructionOverride
  );
}

/**
 * Verifica si una entrada de `analysisCache` contiene una definición válida y no es un error o texto vacío (D-07).
 */
export function isValidCacheAnalysisEntry(
  entry?: Partial<CachedAnalysisEntity> | null
): entry is CachedAnalysisEntity {
  if (!entry || typeof entry !== 'object') return false;
  if ((entry as { hasError?: boolean }).hasError === true) return false;

  const termName = typeof entry.termName === 'string' ? entry.termName.trim() : '';
  const definition =
    typeof entry.academicDefinition === 'string' ? entry.academicDefinition.trim() : '';
  const plainExplanation =
    typeof entry.plainExplanation === 'string' ? entry.plainExplanation.trim() : '';
  if (!termName || !definition || !plainExplanation) return false;

  const normalizedTerm = normalizeConceptText(termName);
  const normalizedDef = normalizeConceptText(definition);
  const normalizedPlain = normalizeConceptText(plainExplanation);
  const normalizedExample = normalizeConceptText(entry.illustrativeExample || '');

  if (
    normalizedDef.length < 15 ||
    normalizedDef === normalizedTerm ||
    normalizedDef === `definicion de ${normalizedTerm}`
  ) {
    return false;
  }

  for (const snippet of KNOWN_ERROR_DEFINITION_SNIPPETS) {
    if (
      normalizedDef.includes(snippet) ||
      normalizedPlain.includes(snippet) ||
      normalizedExample.includes(snippet)
    ) {
      return false;
    }
  }

  if (
    isIncompleteOrTruncatedSentence(definition, 15) ||
    isIncompleteOrTruncatedSentence(plainExplanation, 15) ||
    hasExcessiveMetadiscourse(definition, 'definition') ||
    hasExcessiveMetadiscourse(plainExplanation, 'explanation')
  ) {
    return false;
  }

  return true;
}

/**
 * Comprueba si una entrada almacenada en `analysisCache` es contextualmente compatible
 * con la disciplina/área solicitada (D-01).
 *
 * Reglas:
 * - Si la entrada no es válida (vacía o error), devuelve `false`.
 * - Si es un registro legacy sin clave contextual (`!termKey.includes('::')`),
 *   solo es válido si tiene una disciplina específica reconocible y coincide exactamente
 *   con la disciplina del contexto consultado. Un registro legacy sin área o con área
 *   genérica/desconocida nunca se sirve como coincidencia válida.
 * - Si tiene clave contextual o `academicField`, su disciplina canónica debe coincidir
 *   con la disciplina del contexto consultado.
 */
export function isCacheEntryCompatibleWithContext(
  entry: CachedAnalysisEntity | null | undefined,
  targetContext?: AcademicContextInput
): boolean {
  if (!isValidCacheAnalysisEntry(entry)) return false;

  const targetDiscipline = resolveCanonicalDisciplineKey(targetContext);
  const entryKey = (entry.termKey || '').trim();
  const isLegacyKey = !entryKey.includes('::');

  const keyParts = isLegacyKey ? [] : entryKey.split('::');
  const keyAreaSegment = keyParts.length >= 2 ? keyParts[1] : undefined;

  const entryDiscipline = resolveCanonicalDisciplineKey({
    academicAreaId: entry.academicAreaId || keyAreaSegment,
    academicField: entry.academicField,
  });

  if (isLegacyKey) {
    // Registro antiguo sin clave contextual: solo reutilizable si su área es específica y coincide con la consulta
    if (entryDiscipline === 'unknown' || targetDiscipline === 'unknown') {
      return false;
    }
    return entryDiscipline === targetDiscipline;
  }

  // Si la consulta pide una disciplina específica, la entrada debe pertenecer a esa misma disciplina
  if (targetDiscipline !== 'unknown') {
    return entryDiscipline === targetDiscipline;
  }

  // Si la consulta es general/sin disciplina, solo coincide si la entrada también es general
  return entryDiscipline === 'unknown';
}

/**
 * Selecciona de forma segura la entrada de caché entre una coincidencia por clave contextual exacta
 * y una posible coincidencia por clave legacy (solo nombre normalizado) (D-01).
 */
export function selectCompatibleCachedAnalysis(params: {
  contextualMatch?: CachedAnalysisEntity | null;
  legacyMatch?: CachedAnalysisEntity | null;
  targetContext?: AcademicContextInput;
}): CachedAnalysisEntity | null {
  const { contextualMatch, legacyMatch, targetContext } = params;

  if (contextualMatch && isCacheEntryCompatibleWithContext(contextualMatch, targetContext)) {
    return contextualMatch;
  }

  if (legacyMatch && isCacheEntryCompatibleWithContext(legacyMatch, targetContext)) {
    return legacyMatch;
  }

  return null;
}

/**
 * Prepara de forma segura una entrada para guardarse en `analysisCache` (D-01 y D-07):
 * - Rechaza entradas vacías, con `hasError` o con textos de error conocidos (devuelve `null` para no sobrescribir).
 * - Asegura que `termKey` sea siempre la clave contextual (`<termino>::<area>`).
 * - Evita que una regeneración contextual (`sources: []`, `queryStatus: 'sin_verificar'`) o una definición nueva
 *   herede `sources`, `supportedSegments`, `verificationStatus` o `queryStatus` de una entrada previa.
 */
export function prepareSafeCacheEntryToSave(
  existing: CachedAnalysisEntity | null | undefined,
  incoming: CachedAnalysisEntity,
  contextOrArea?: AcademicContextInput
): CachedAnalysisEntity | null {
  if (!isValidCacheAnalysisEntry(incoming)) {
    return null;
  }

  const incomingKey = (incoming.termKey || '').trim();
  const keyParts = incomingKey.includes('::') ? incomingKey.split('::') : [];

  const effectiveContext: AcademicContextInput = contextOrArea ?? {
    academicAreaId: incoming.academicAreaId || keyParts[1],
    academicField: incoming.academicField,
  };

  const baseContextualKey = resolveContextualCacheKey(
    incoming.termName || keyParts[0] || incomingKey,
    effectiveContext
  );
  const extraSegments = keyParts.slice(2).filter(Boolean);
  const contextualKey =
    extraSegments.length > 0 && !baseContextualKey.includes(`::${extraSegments[0]}`)
      ? `${baseContextualKey}::${extraSegments.join('::')}`
      : baseContextualKey;

  const specificAreaId = resolveSpecificAcademicAreaId(effectiveContext) ?? undefined;
  const incomingSources = Array.isArray(incoming.sources) ? incoming.sources : [];
  const incomingSegments = Array.isArray(incoming.supportedSegments)
    ? incoming.supportedSegments
    : [];
  const incomingQueries = Array.isArray(incoming.queriesConsulted)
    ? incoming.queriesConsulted
    : [incoming.termName];

  const effectiveQueryStatus =
    incoming.queryStatus ||
    (incomingSources.length > 0 ? 'fuentes_consultadas' : 'sin_verificar');

  // Encontrar fuentes en Modalidad B ('fuentes_consultadas') no equivale a verificar una afirmación
  const effectiveVerificationStatus =
    effectiveQueryStatus === 'fuentes_consultadas' || incomingSources.length === 0
      ? 'no_verificado'
      : incoming.verificationStatus || 'no_verificado';

  const isContextualUpdate =
    incomingSources.length === 0 &&
    (effectiveQueryStatus === 'sin_verificar' ||
      effectiveVerificationStatus === 'no_verificado');

  const normalizedIncomingEntry: CachedAnalysisEntity = {
    ...incoming,
    termKey: contextualKey,
    academicContextKey: incoming.academicContextKey || contextualKey,
    academicAreaId: incoming.academicAreaId || specificAreaId,
    sources: incomingSources,
    supportedSegments: incomingSegments,
    verificationStatus: effectiveVerificationStatus,
    queryStatus: effectiveQueryStatus,
    queriesConsulted: incomingQueries,
    groundingUsed:
      isContextualUpdate || effectiveQueryStatus === 'fuentes_consultadas'
        ? false
        : Boolean(incoming.groundingUsed),
  };

  // D-07: Si la nueva entrada es una definición contextual o su definición cambió o pertenece a otra área,
  // NUNCA hereda fuentes ni estado verificado de una entrada anterior.
  if (!existing || isContextualUpdate) {
    return normalizedIncomingEntry;
  }

  const sameContext =
    isCacheEntryCompatibleWithContext(existing, effectiveContext) &&
    normalizeConceptText(existing.academicDefinition) ===
      normalizeConceptText(incoming.academicDefinition);

  if (
    sameContext &&
    incomingSources.length === 0 &&
    Array.isArray(existing.sources) &&
    existing.sources.length > 0
  ) {
    return {
      ...normalizedIncomingEntry,
      sources: existing.sources,
      supportedSegments:
        incomingSegments.length > 0 ? incomingSegments : existing.supportedSegments || [],
      verificationStatus: existing.verificationStatus,
      queryStatus: existing.queryStatus || normalizedIncomingEntry.queryStatus,
      queriesConsulted:
        existing.queriesConsulted && existing.queriesConsulted.length > 0
          ? existing.queriesConsulted
          : incomingQueries,
      groundingUsed: Boolean(existing.groundingUsed || incoming.groundingUsed),
    };
  }

  return normalizedIncomingEntry;
}

/**
 * Obtiene la clave canónica de identidad de un concepto en el glosario:
 * `<normalizedName>::<canonicalDisciplineKey>` (D-02).
 */
export function getGlossaryConceptIdentityKey(
  concept: Pick<ConceptEntity, 'termName' | 'normalizedName' | 'academicField' | 'academicAreaId'>
): string {
  const normName = normalizeConceptTermName(concept.normalizedName || concept.termName);
  const disciplineKey = resolveCanonicalDisciplineKey({
    academicAreaId: concept.academicAreaId,
    academicField: concept.academicField,
  });
  return `${normName}::${disciplineKey}`;
}

/**
 * Determina si dos registros de concepto representan el mismo concepto académico en el glosario (D-02):
 * - Coinciden si tienen el mismo `id` no vacío.
 * - O si coinciden tanto su `normalizedName` como su disciplina/área académica canónica.
 */
export function isSameGlossaryConceptIdentity(
  a: Pick<ConceptEntity, 'id' | 'termName' | 'normalizedName' | 'academicField' | 'academicAreaId'>,
  b: Pick<ConceptEntity, 'id' | 'termName' | 'normalizedName' | 'academicField' | 'academicAreaId'>
): boolean {
  if (a.id && b.id && a.id === b.id) {
    return true;
  }
  const normA = normalizeConceptTermName(a.normalizedName || a.termName);
  const normB = normalizeConceptTermName(b.normalizedName || b.termName);
  if (!normA || normA !== normB) {
    return false;
  }
  return getGlossaryConceptIdentityKey(a) === getGlossaryConceptIdentityKey(b);
}

export interface SaveConceptMergeOptions {
  /**
   * Indica que el cambio en `isFavorite` proviene de una acción explícita del usuario
   * (ej. `toggleFavoriteConcept`), permitiendo cambiar `true` -> `false`.
   */
  explicitFavoriteChange?: boolean;
  /**
   * Indica que el cambio en `userNotes` proviene de una edición explícita de notas personales.
   */
  explicitUserNotesChange?: boolean;
}

/**
 * Fusiona un concepto entrante con uno existente en el glosario preservando siempre
 * `id`, `createdAt`, `isFavorite` y `userNotes` salvo modificación explícita (D-02).
 */
export function mergeGlossaryConceptOnSave(
  existing: ConceptEntity | null | undefined,
  incoming: ConceptEntity,
  options?: SaveConceptMergeOptions
): ConceptEntity {
  const normalizedName = normalizeConceptTermName(incoming.normalizedName || incoming.termName);
  const resolvedAreaId =
    incoming.academicAreaId ||
    resolveSpecificAcademicAreaId({
      academicAreaId: incoming.academicAreaId,
      academicField: incoming.academicField,
    }) ||
    existing?.academicAreaId;

  if (!existing) {
    return {
      ...incoming,
      normalizedName,
      ...(resolvedAreaId ? { academicAreaId: resolvedAreaId } : {}),
      isFavorite: Boolean(incoming.isFavorite),
    };
  }

  const nextIsFavorite = options?.explicitFavoriteChange
    ? Boolean(incoming.isFavorite)
    : Boolean(existing.isFavorite || incoming.isFavorite);

  const hasExplicitUserNotes =
    options?.explicitUserNotesChange ||
    (incoming.id === existing.id && incoming.userNotes !== undefined) ||
    (typeof incoming.userNotes === 'string' && incoming.userNotes.trim().length > 0);

  const nextUserNotes = hasExplicitUserNotes ? incoming.userNotes : existing.userNotes;

  return {
    ...existing,
    ...incoming,
    id: existing.id,
    normalizedName,
    ...(resolvedAreaId ? { academicAreaId: resolvedAreaId } : {}),
    createdAt: existing.createdAt || incoming.createdAt,
    isFavorite: nextIsFavorite,
    userNotes: nextUserNotes,
  };
}

/**
 * Reconcilia un lote de conceptos nuevos con la lista existente del glosario (D-02):
 * - Preserva favoritos, notas personales, `id` y `createdAt` al actualizar un concepto de la misma disciplina.
 * - Mantiene separados los homónimos de distintas disciplinas sin sobrescribirlos.
 * - No genera duplicados cuando se guarda varias veces el mismo término en la misma disciplina.
 */
export function reconcileGlossaryConceptBatch(
  existingList: ConceptEntity[],
  incomingList: ConceptEntity[],
  options?: SaveConceptMergeOptions
): {
  updatedToPersist: ConceptEntity[];
  allGlossary: ConceptEntity[];
} {
  const byId = new Map<string, ConceptEntity>();
  const byIdentity = new Map<string, ConceptEntity>();

  for (const item of existingList) {
    const normalizedItem: ConceptEntity = {
      ...item,
      normalizedName: normalizeConceptTermName(item.normalizedName || item.termName),
    };
    byId.set(normalizedItem.id, normalizedItem);
    const identityKey = getGlossaryConceptIdentityKey(normalizedItem);
    if (!byIdentity.has(identityKey)) {
      byIdentity.set(identityKey, normalizedItem);
    }
  }

  const updatedById = new Map<string, ConceptEntity>();

  for (const rawIncoming of incomingList) {
    const identityKey = getGlossaryConceptIdentityKey(rawIncoming);
    const existing =
      (rawIncoming.id ? byId.get(rawIncoming.id) : undefined) || byIdentity.get(identityKey);

    const merged = mergeGlossaryConceptOnSave(existing, rawIncoming, options);
    const mergedIdentityKey = getGlossaryConceptIdentityKey(merged);

    byId.set(merged.id, merged);
    byIdentity.set(mergedIdentityKey, merged);
    updatedById.set(merged.id, merged);
  }

  return {
    updatedToPersist: Array.from(updatedById.values()),
    allGlossary: Array.from(byId.values()),
  };
}

/**
 * Determina si un término ya existe en el glosario para la disciplina/área académica actual (D-09).
 */
export function isTermInGlossaryForContext(
  glossary: ConceptEntity[],
  termName: string,
  targetContext?: AcademicContextInput
): boolean {
  const normTerm = normalizeConceptTermName(termName);
  if (!normTerm || !Array.isArray(glossary) || glossary.length === 0) {
    return false;
  }

  const targetDiscipline = resolveCanonicalDisciplineKey(targetContext);

  return glossary.some((concept) => {
    const conceptNorm = normalizeConceptTermName(concept.normalizedName || concept.termName);
    if (conceptNorm !== normTerm) return false;

    const conceptDiscipline = resolveCanonicalDisciplineKey({
      academicAreaId: concept.academicAreaId,
      academicField: concept.academicField,
    });

    return conceptDiscipline === targetDiscipline;
  });
}
