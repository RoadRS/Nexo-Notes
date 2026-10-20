/**
 * Pruebas unitarias deterministas de Integridad de Caché y Glosario (Fase 4.1)
 * Ejecutable directamente con `bun run src/utils/cacheIntegrity.test.ts`
 * y compatible con `bun run lint` (`tsc --noEmit`) sin llamadas a Gemini ni red.
 */

import { CachedAnalysisEntity, ConceptEntity } from '../types/models';
import {
  AcademicContextInput,
  isSameGlossaryConceptIdentity,
  isTermInGlossaryForContext,
  mergeGlossaryConceptOnSave,
  normalizeConceptTermName,
  prepareSafeCacheEntryToSave,
  reconcileGlossaryConceptBatch,
  resolveContextualCacheKey,
  SaveConceptMergeOptions,
  selectCompatibleCachedAnalysis,
} from './cacheIntegrity';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Simulador determinista en memoria de `analysisCache` y `glossary` que reproduce
 * exactamente la lógica de `localDB` (`src/db/indexedDB.ts`) y `AppContext` (`src/context/AppContext.tsx`).
 */
class InMemoryIntegrityStore {
  private cache = new Map<string, CachedAnalysisEntity>();
  private glossary = new Map<string, ConceptEntity>();

  putRawLegacyCacheEntry(entry: CachedAnalysisEntity): void {
    this.cache.set(entry.termKey, { ...entry });
  }

  getCachedAnalysis(
    termName: string,
    contextOrArea?: AcademicContextInput
  ): CachedAnalysisEntity | null {
    const trimmed = (termName || '').trim();
    if (!trimmed) return null;

    const isAlreadyContextualKey = trimmed.includes('::') && !contextOrArea;
    const contextualKey = isAlreadyContextualKey
      ? trimmed
      : resolveContextualCacheKey(trimmed, contextOrArea);
    const legacyKey = normalizeConceptTermName(
      isAlreadyContextualKey ? trimmed.split('::')[0] : trimmed
    );
    const effectiveContext: AcademicContextInput = isAlreadyContextualKey
      ? { areaId: trimmed.split('::')[1] }
      : contextOrArea;

    const contextualMatch = this.cache.get(contextualKey) ?? null;
    const legacyMatch =
      legacyKey !== contextualKey ? (this.cache.get(legacyKey) ?? null) : null;

    return selectCompatibleCachedAnalysis({
      contextualMatch,
      legacyMatch,
      targetContext: effectiveContext,
    });
  }

  saveCachedAnalysis(
    entry: CachedAnalysisEntity,
    contextOrArea?: AcademicContextInput
  ): CachedAnalysisEntity | null {
    const effectiveContext: AcademicContextInput = contextOrArea ?? {
      academicAreaId: entry?.academicAreaId,
      academicField: entry?.academicField,
    };

    const preview = prepareSafeCacheEntryToSave(null, entry, effectiveContext);
    if (!preview) return null;

    const existing = this.cache.get(preview.termKey) ?? null;
    const safeToSave = prepareSafeCacheEntryToSave(existing, entry, effectiveContext);
    if (!safeToSave) return null;

    this.cache.set(safeToSave.termKey, safeToSave);
    return safeToSave;
  }

  saveConcept(concept: ConceptEntity, options?: SaveConceptMergeOptions): ConceptEntity {
    const normalized = normalizeConceptTermName(concept.normalizedName || concept.termName);
    const matches = Array.from(this.glossary.values()).filter(
      (c) => normalizeConceptTermName(c.normalizedName || c.termName) === normalized
    );
    const sameIdentityMatches = matches.filter(
      (c) => c.id === concept.id || isSameGlossaryConceptIdentity(c, concept)
    );
    const existing =
      sameIdentityMatches.find((c) => c.id === concept.id) || sameIdentityMatches[0];

    const merged = mergeGlossaryConceptOnSave(existing, concept, options);
    for (const m of sameIdentityMatches) {
      if (m.id !== merged.id) {
        this.glossary.delete(m.id);
      }
    }
    this.glossary.set(merged.id, merged);
    return merged;
  }

  saveMultipleConcepts(concepts: ConceptEntity[], options?: SaveConceptMergeOptions): void {
    const existingList = Array.from(this.glossary.values());
    const { updatedToPersist } = reconcileGlossaryConceptBatch(existingList, concepts, options);
    for (const item of updatedToPersist) {
      this.glossary.set(item.id, item);
    }
  }

  getAllConcepts(): ConceptEntity[] {
    return Array.from(this.glossary.values());
  }
}

export async function runCacheIntegrityTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (id: string, name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ id, name, passed: false, details: message });
    }
  };

  // 1. Guardar en caché `Inhibición` para Psicología y consultar `Inhibición` para Bioquímica o Salud y Ciencias de la Vida no devuelve la definición de Psicología.
  await runTest(
    'CI-01',
    'Guardar en caché Inhibición para Psicología y consultar en Bioquímica o Salud y Ciencias de la Vida no devuelve la definición de Psicología',
    () => {
      const store = new InMemoryIntegrityStore();
      store.saveCachedAnalysis(
        {
          termKey: 'inhibicion',
          termName: 'Inhibición',
          academicField: 'Psicología Cognitiva',
          academicDefinition:
            'Proceso ejecutivo de supresión activa de respuestas prepotentes o interferencias irrelevantes.',
          plainExplanation: 'Freno cognitivo de respuestas automáticas.',
          illustrativeExample: 'Tarea de Stroop.',
          sources: [],
          verificationStatus: 'no_verificado',
          queryStatus: 'sin_verificar',
          queriesConsulted: ['Inhibición'],
          groundingUsed: false,
          analyzedAt: 1700000000000,
        },
        'Psicología'
      );

      const bioquimicaResult = store.getCachedAnalysis('Inhibición', 'Bioquímica');
      const saludVidaResult = store.getCachedAnalysis('Inhibición', 'salud_vida');
      const filosofiaResult = store.getCachedAnalysis('Inhibición', 'Filosofía');

      assertCondition(
        bioquimicaResult === null,
        `Consultar en Bioquímica devolvió definición de otra disciplina: ${JSON.stringify(bioquimicaResult)}`
      );
      assertCondition(
        saludVidaResult === null,
        `Consultar en Salud y Ciencias de la Vida devolvió definición de Psicología`
      );
      assertCondition(
        filosofiaResult === null,
        `Consultar en Filosofía devolvió definición de Psicología`
      );
    }
  );

  // 2. Guardar en caché `Inhibición` para Psicología y volver a consultar en Psicología sí devuelve la definición de Psicología.
  await runTest(
    'CI-02',
    'Guardar en caché Inhibición para Psicología y volver a consultar en Psicología sí devuelve la definición de Psicología',
    () => {
      const store = new InMemoryIntegrityStore();
      const saved = store.saveCachedAnalysis(
        {
          termKey: 'inhibicion',
          termName: 'Inhibición',
          academicField: 'Psicología',
          academicDefinition:
            'Proceso ejecutivo de supresión activa de respuestas prepotentes o interferencias irrelevantes.',
          plainExplanation: 'Freno cognitivo de respuestas automáticas.',
          illustrativeExample: 'Tarea de Stroop.',
          sources: [],
          verificationStatus: 'no_verificado',
          queryStatus: 'sin_verificar',
          queriesConsulted: ['Inhibición'],
          groundingUsed: false,
          analyzedAt: 1700000000000,
        },
        'Psicología'
      );

      assertCondition(saved !== null, 'La entrada válida de Psicología debió guardarse.');
      assertCondition(
        saved?.termKey === 'inhibicion::psicologia',
        `Se esperaba clave contextual 'inhibicion::psicologia', se obtuvo '${saved?.termKey}'`
      );

      const hitByLabel = store.getCachedAnalysis('Inhibición', 'Psicología');
      const hitByAreaId = store.getCachedAnalysis('Inhibición', 'psicologia');
      const hitBySubfield = store.getCachedAnalysis('Inhibición', 'Psicología Cognitiva');

      assertCondition(
        hitByLabel !== null &&
          hitByLabel.academicDefinition.includes('supresión activa de respuestas prepotentes'),
        'No devolvió la definición de Psicología al consultar por etiqueta Psicología'
      );
      assertCondition(
        hitByAreaId !== null && hitByAreaId.termKey === 'inhibicion::psicologia',
        'No devolvió la definición de Psicología al consultar por areaId psicologia'
      );
      assertCondition(
        hitBySubfield !== null && hitBySubfield.termKey === 'inhibicion::psicologia',
        'No devolvió la definición de Psicología al consultar desde Psicología Cognitiva'
      );
    }
  );

  // 3. Un registro antiguo en `analysisCache` sin contexto o de área desconocida no contamina una consulta de otra disciplina.
  await runTest(
    'CI-03',
    'Un registro antiguo en analysisCache sin contexto o de área desconocida no contamina una consulta de otra disciplina',
    () => {
      const store = new InMemoryIntegrityStore();

      // Registro legacy sin área específica
      store.putRawLegacyCacheEntry({
        termKey: 'inhibicion',
        termName: 'Inhibición',
        academicField: '',
        academicDefinition: 'Definición antigua sin área asignada.',
        plainExplanation: 'Explicación antigua.',
        illustrativeExample: '',
        sources: [],
        verificationStatus: 'no_verificado',
        queriesConsulted: [],
        groundingUsed: false,
        analyzedAt: 1690000000000,
      });

      assertCondition(
        store.getCachedAnalysis('Inhibición', 'Psicología') === null,
        'Un registro legacy sin área no debe servirse para Psicología'
      );
      assertCondition(
        store.getCachedAnalysis('Inhibición', 'Bioquímica') === null,
        'Un registro legacy sin área no debe servirse para Bioquímica'
      );

      // Registro legacy con área genérica ('General')
      store.putRawLegacyCacheEntry({
        termKey: 'asimilacion',
        termName: 'Asimilación',
        academicField: 'General',
        academicDefinition: 'Definición genérica heredada.',
        plainExplanation: 'Explicación genérica.',
        illustrativeExample: '',
        sources: [],
        verificationStatus: 'no_verificado',
        queriesConsulted: [],
        groundingUsed: false,
        analyzedAt: 1690000000000,
      });

      assertCondition(
        store.getCachedAnalysis('Asimilación', 'Psicología') === null,
        'Un registro legacy con área General no debe servirse para Psicología'
      );

      // Registro legacy con área específica de Psicología: no contamina Bioquímica pero sí es compatible con Psicología
      store.putRawLegacyCacheEntry({
        termKey: 'condicionamiento',
        termName: 'Condicionamiento',
        academicField: 'Psicología',
        academicDefinition: 'Aprendizaje asociativo entre estímulos y respuestas.',
        plainExplanation: 'Asociación E-R.',
        illustrativeExample: 'Perros de Pavlov.',
        sources: [],
        verificationStatus: 'no_verificado',
        queriesConsulted: [],
        groundingUsed: false,
        analyzedAt: 1690000000000,
      });

      assertCondition(
        store.getCachedAnalysis('Condicionamiento', 'Bioquímica') === null,
        'Un registro legacy de Psicología no debe contaminar Bioquímica'
      );
      assertCondition(
        store.getCachedAnalysis('Condicionamiento', 'Psicología') !== null,
        'Un registro legacy con academicField explícito de Psicología sí puede leerse en Psicología'
      );
    }
  );

  // 4. Una regeneración contextual con `sources: []` no hereda `sources` ni `verificationStatus: 'verificado'` de una entrada previa.
  await runTest(
    'CI-04',
    'Una regeneración contextual con sources: [] no hereda sources ni verificationStatus: verificado de una entrada previa',
    () => {
      const store = new InMemoryIntegrityStore();

      // Primero se guarda una entrada verificada con fuentes web
      store.saveCachedAnalysis(
        {
          termKey: 'memoria de trabajo::psicologia',
          termName: 'Memoria de trabajo',
          academicField: 'Psicología',
          academicDefinition: 'Definición previa verificada con fuentes web.',
          plainExplanation: 'Explicación previa.',
          illustrativeExample: 'Ejemplo previo.',
          sources: [
            {
              title: 'Baddeley (2000) - The episodic buffer',
              url: 'https://example.edu/baddeley-2000',
              snippet: 'The episodic buffer is a third slave system...',
            },
          ],
          supportedSegments: ['Definición previa verificada'],
          verificationStatus: 'verificado',
          queryStatus: 'contrastado_web',
          queriesConsulted: ['Memoria de trabajo Baddeley'],
          groundingUsed: true,
          analyzedAt: 1700000000000,
        },
        'Psicología'
      );

      // Ahora ocurre una regeneración contextual limpia (sources: [], queryStatus: 'sin_verificar', verificationStatus: 'no_verificado')
      store.saveCachedAnalysis(
        {
          termKey: 'memoria de trabajo::psicologia',
          termName: 'Memoria de trabajo',
          academicField: 'Psicología',
          academicDefinition:
            'Nueva definición contextual regenerada a partir de los apuntes actuales.',
          plainExplanation: 'Nueva explicación sencilla.',
          illustrativeExample: 'Nuevo ejemplo.',
          sources: [],
          supportedSegments: [],
          verificationStatus: 'no_verificado',
          queryStatus: 'sin_verificar',
          queriesConsulted: ['Memoria de trabajo'],
          groundingUsed: false,
          analyzedAt: 1700005000000,
        },
        'Psicología'
      );

      const updated = store.getCachedAnalysis('Memoria de trabajo', 'Psicología');
      assertCondition(updated !== null, 'La entrada actualizada debe existir en caché');
      assertCondition(
        updated?.sources.length === 0,
        `La regeneración contextual no debe heredar sources antiguos, pero tiene ${updated?.sources.length}`
      );
      assertCondition(
        updated?.verificationStatus === 'no_verificado',
        `Se esperaba verificationStatus 'no_verificado', pero se obtuvo '${updated?.verificationStatus}'`
      );
      assertCondition(
        updated?.queryStatus === 'sin_verificar',
        `Se esperaba queryStatus 'sin_verificar', pero se obtuvo '${updated?.queryStatus}'`
      );
      assertCondition(
        updated?.groundingUsed === false,
        'groundingUsed debe ser false tras una regeneración contextual'
      );
    }
  );

  // 5. Guardar un concepto ya marcado como `isFavorite: true` desde el modal de análisis conserva `isFavorite: true`, `id`, `createdAt` y `userNotes`.
  await runTest(
    'CI-05',
    'Guardar un concepto ya marcado como isFavorite: true desde el modal de análisis conserva isFavorite: true, id, createdAt y userNotes',
    () => {
      const store = new InMemoryIntegrityStore();
      const originalCreatedAt = 1680000000000;

      // Concepto existente en el glosario, marcado como favorito y con notas personales del estudiante
      store.saveConcept({
        id: 'concept-original-fav-1',
        termName: 'Ejecutivo central',
        normalizedName: 'ejecutivo central',
        academicField: 'Psicología Cognitiva',
        context: 'Contexto inicial',
        academicDefinition: 'Definición inicial del ejecutivo central.',
        plainExplanation: 'Explicación inicial.',
        illustrativeExample: 'Ejemplo inicial.',
        verificationStatus: 'no_verificado',
        sources: [],
        isFavorite: true,
        userNotes: 'Repasar para el examen parcial con el modelo de Baddeley.',
        createdAt: originalCreatedAt,
        updatedAt: originalCreatedAt,
      });

      // El modal de análisis vuelve a guardar el concepto con un nuevo id temporal y `isFavorite: false`
      store.saveMultipleConcepts([
        {
          id: 'concept-new-modal-temp-99',
          termName: 'Ejecutivo central',
          normalizedName: 'ejecutivo central',
          academicField: 'Psicología Cognitiva',
          context: 'Ejecutivo central dirige la atención y coordina sistemas esclavos.',
          academicDefinition: 'Componente atencional maestro de la memoria de trabajo.',
          plainExplanation: 'Dirige el foco atencional.',
          illustrativeExample: 'Supervisar dos tareas simultáneas.',
          verificationStatus: 'verificado',
          queryStatus: 'contrastado_web',
          sources: [
            {
              title: 'Baddeley 1996',
              url: 'https://example.org/baddeley',
              snippet: 'Central executive',
            },
          ],
          isFavorite: false,
          createdAt: 1710000000000,
          updatedAt: 1710000000000,
        },
      ]);

      const all = store.getAllConcepts();
      assertCondition(all.length === 1, `Se esperaba 1 concepto, se encontraron ${all.length}`);

      const saved = all[0];
      assertCondition(
        saved.id === 'concept-original-fav-1',
        `Se perdió el id original: '${saved.id}'`
      );
      assertCondition(
        saved.createdAt === originalCreatedAt,
        `Se perdió el createdAt original: ${saved.createdAt}`
      );
      assertCondition(
        saved.isFavorite === true,
        'Se sobrescribió isFavorite: true con false al guardar desde el modal'
      );
      assertCondition(
        saved.userNotes === 'Repasar para el examen parcial con el modelo de Baddeley.',
        `Se perdieron las notas personales userNotes: '${saved.userNotes}'`
      );
      assertCondition(
        saved.academicDefinition === 'Componente atencional maestro de la memoria de trabajo.',
        'La definición académica actualizada sí debió guardarse'
      );
    }
  );

  // 6. Guardar `Inhibición` en Psicología y después guardar `Inhibición` en Bioquímica mantiene ambas entradas separadas en el glosario.
  await runTest(
    'CI-06',
    'Guardar Inhibición en Psicología y después guardar Inhibición en Bioquímica mantiene ambas entradas separadas en el glosario',
    () => {
      const store = new InMemoryIntegrityStore();

      store.saveConcept({
        id: 'concept-inhibicion-psico',
        termName: 'Inhibición',
        normalizedName: 'inhibición',
        academicField: 'Psicología',
        context: 'Control inhibitorio ejecutivo.',
        academicDefinition: 'Mecanismo ejecutivo que suprime respuestas dominantes inapropiadas.',
        plainExplanation: 'Control mental de impulsos.',
        illustrativeExample: 'Frenar una respuesta automática en Stroop.',
        verificationStatus: 'no_verificado',
        sources: [],
        isFavorite: true,
        createdAt: 1700000001000,
        updatedAt: 1700000001000,
      });

      store.saveConcept({
        id: 'concept-inhibicion-bioq',
        termName: 'Inhibición',
        normalizedName: 'inhibición',
        academicField: 'Bioquímica',
        context: 'Cinética enzimática y unión al sitio activo.',
        academicDefinition:
          'Disminución de la velocidad de una reacción catalizada por una enzima debido a un inhibidor competitivo o alostérico.',
        plainExplanation: 'Molécula que reduce la actividad de una enzima.',
        illustrativeExample: 'Inhibición competitiva de la succinato deshidrogenasa por malonato.',
        verificationStatus: 'no_verificado',
        sources: [],
        isFavorite: false,
        createdAt: 1700000002000,
        updatedAt: 1700000002000,
      });

      const all = store.getAllConcepts();
      assertCondition(
        all.length === 2,
        `El glosario debe mantener ambos homónimos separados (esperado: 2, actual: ${all.length})`
      );

      const psico = all.find((c) => c.id === 'concept-inhibicion-psico');
      const bioq = all.find((c) => c.id === 'concept-inhibicion-bioq');

      assertCondition(Boolean(psico), 'Falta la entrada de Inhibición en Psicología');
      assertCondition(Boolean(bioq), 'Falta la entrada de Inhibición en Bioquímica');
      assertCondition(
        psico?.academicDefinition.includes('suprime respuestas dominantes') === true,
        'La definición de Psicología fue alterada'
      );
      assertCondition(
        bioq?.academicDefinition.includes('catalizada por una enzima') === true,
        'La definición de Bioquímica fue alterada'
      );
    }
  );

  // 7. Guardar dos veces `Inhibición` en la misma disciplina actualiza el mismo registro y no crea duplicados.
  await runTest(
    'CI-07',
    'Guardar dos veces Inhibición en la misma disciplina actualiza el mismo registro y no crea duplicados',
    () => {
      const store = new InMemoryIntegrityStore();

      store.saveConcept({
        id: 'concept-psico-1',
        termName: 'Inhibición',
        normalizedName: 'inhibición',
        academicField: 'Psicología',
        context: 'Versión 1',
        academicDefinition: 'Definición versión 1 en Psicología.',
        plainExplanation: 'Explicación 1.',
        illustrativeExample: 'Ejemplo 1.',
        verificationStatus: 'no_verificado',
        sources: [],
        isFavorite: false,
        createdAt: 1700000001000,
        updatedAt: 1700000001000,
      });

      // Segunda vez en la misma disciplina (incluso con subcampo de la misma área canónica)
      store.saveMultipleConcepts([
        {
          id: 'concept-psico-2',
          termName: 'Inhibición',
          normalizedName: 'inhibición',
          academicField: 'Psicología Cognitiva',
          context: 'Versión 2',
          academicDefinition: 'Definición versión 2 actualizada en Psicología.',
          plainExplanation: 'Explicación 2.',
          illustrativeExample: 'Ejemplo 2.',
          verificationStatus: 'verificado',
          sources: [],
          isFavorite: false,
          createdAt: 1700000005000,
          updatedAt: 1700000005000,
        },
      ]);

      const all = store.getAllConcepts();
      assertCondition(
        all.length === 1,
        `Guardar dos veces en la misma disciplina no debe duplicar (esperado: 1, actual: ${all.length})`
      );
      assertCondition(
        all[0].id === 'concept-psico-1',
        `Debe conservar el id del registro existente ('concept-psico-1'), actual: '${all[0].id}'`
      );
      assertCondition(
        all[0].academicDefinition === 'Definición versión 2 actualizada en Psicología.',
        'Debe actualizar la definición del registro existente'
      );
    }
  );

  // 8. Desmarcar manualmente un favorito desde el glosario (`toggleFavoriteConcept` o lógica equivalente) sí cambia `isFavorite` a `false`.
  await runTest(
    'CI-08',
    'Desmarcar manualmente un favorito desde el glosario sí cambia isFavorite a false',
    () => {
      const store = new InMemoryIntegrityStore();

      const initial = store.saveConcept({
        id: 'concept-fav-toggle',
        termName: 'Bucle fonológico',
        normalizedName: 'bucle fonológico',
        academicField: 'Psicología',
        context: 'Baddeley',
        academicDefinition: 'Subsistema verbal de la memoria de trabajo.',
        plainExplanation: 'Almacén verbal temporal.',
        illustrativeExample: 'Repetir un número mentalmente.',
        verificationStatus: 'no_verificado',
        sources: [],
        isFavorite: true,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      });

      assertCondition(initial.isFavorite === true, 'El concepto debe iniciar como favorito');

      // Acción explícita de desmarcar favorito desde el glosario (equivalente a toggleFavoriteConcept)
      const toggledOff = store.saveConcept(
        { ...initial, isFavorite: false },
        { explicitFavoriteChange: true }
      );

      assertCondition(
        toggledOff.isFavorite === false,
        'Desmarcar explícitamente un favorito debe cambiar isFavorite a false'
      );
      assertCondition(
        store.getAllConcepts()[0]?.isFavorite === false,
        'El estado persistido en el glosario debe reflejar isFavorite: false'
      );
    }
  );

  // 9. El filtro `alreadyInGlossary` marca como existente un término solo cuando existe en la misma disciplina/área, y no cuando solo existe un homónimo de otra disciplina.
  await runTest(
    'CI-09',
    'El filtro alreadyInGlossary marca como existente un término solo cuando existe en la misma disciplina y no cuando solo existe un homónimo de otra disciplina',
    () => {
      const glossary: ConceptEntity[] = [
        {
          id: 'concept-psico-inh',
          termName: 'Inhibición',
          normalizedName: 'inhibición',
          academicField: 'Psicología',
          academicAreaId: 'psicologia',
          context: 'Control ejecutivo',
          academicDefinition: 'Supresión de respuestas prepotentes.',
          plainExplanation: 'Freno inhibitorio.',
          illustrativeExample: 'Stroop.',
          verificationStatus: 'no_verificado',
          sources: [],
          isFavorite: false,
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
        },
      ];

      const inPsicologia = isTermInGlossaryForContext(glossary, 'Inhibición', 'Psicología');
      const inPsicologiaCognitiva = isTermInGlossaryForContext(
        glossary,
        'Inhibición',
        'Psicología Cognitiva'
      );
      const inBioquimica = isTermInGlossaryForContext(glossary, 'Inhibición', 'Bioquímica');
      const inFilosofia = isTermInGlossaryForContext(glossary, 'Inhibición', 'Filosofía');

      assertCondition(
        inPsicologia === true,
        'Debe marcarse como existente en Psicología'
      );
      assertCondition(
        inPsicologiaCognitiva === true,
        'Debe marcarse como existente en Psicología Cognitiva (misma área canónica)'
      );
      assertCondition(
        inBioquimica === false,
        'NO debe marcarse como existente al analizar un apunte de Bioquímica'
      );
      assertCondition(
        inFilosofia === false,
        'NO debe marcarse como existente al analizar un apunte de Filosofía'
      );
    }
  );

  // 10. Una respuesta vacía o de error no sobrescribe una entrada válida en `analysisCache`.
  await runTest(
    'CI-10',
    'Una respuesta vacía o de error no sobrescribe una entrada válida en analysisCache',
    () => {
      const store = new InMemoryIntegrityStore();

      store.saveCachedAnalysis(
        {
          termKey: 'agenda visoespacial::psicologia',
          termName: 'Agenda visoespacial',
          academicField: 'Psicología',
          academicDefinition:
            'Subsistema de la memoria de trabajo encargado de mantener y manipular imágenes visuales y espaciales.',
          plainExplanation: 'Mantiene información visual y espacial a corto plazo.',
          illustrativeExample: 'Imaginar una ruta en un mapa.',
          sources: [],
          verificationStatus: 'no_verificado',
          queryStatus: 'sin_verificar',
          queriesConsulted: ['Agenda visoespacial'],
          groundingUsed: false,
          analyzedAt: 1700000000000,
        },
        'Psicología'
      );

      // Intento 1: definición vacía
      const emptyAttempt = store.saveCachedAnalysis(
        {
          termKey: 'agenda visoespacial::psicologia',
          termName: 'Agenda visoespacial',
          academicField: 'Psicología',
          academicDefinition: '   ',
          plainExplanation: '',
          illustrativeExample: '',
          sources: [],
          verificationStatus: 'no_verificado',
          queriesConsulted: [],
          groundingUsed: false,
          analyzedAt: 1700000010000,
        },
        'Psicología'
      );

      // Intento 2: texto de fallo conocido
      const errorTextAttempt = store.saveCachedAnalysis(
        {
          termKey: 'agenda visoespacial::psicologia',
          termName: 'Agenda visoespacial',
          academicField: 'Psicología',
          academicDefinition: 'No se pudo completar la operación para este término.',
          plainExplanation: 'Error de conexión o cuota al consultar el servicio.',
          illustrativeExample: '',
          sources: [],
          verificationStatus: 'no_verificado',
          queriesConsulted: [],
          groundingUsed: false,
          analyzedAt: 1700000020000,
        },
        'Psicología'
      );

      // Intento 3: objeto marcado con hasError: true
      const hasErrorAttempt = store.saveCachedAnalysis(
        {
          termKey: 'agenda visoespacial::psicologia',
          termName: 'Agenda visoespacial',
          academicField: 'Psicología',
          academicDefinition: 'Definición parcial con bandera de error.',
          plainExplanation: 'Explicación parcial.',
          illustrativeExample: '',
          sources: [],
          verificationStatus: 'no_verificado',
          queriesConsulted: [],
          groundingUsed: false,
          analyzedAt: 1700000030000,
          hasError: true,
        } as CachedAnalysisEntity,
        'Psicología'
      );

      assertCondition(emptyAttempt === null, 'Una definición vacía debe ser rechazada');
      assertCondition(errorTextAttempt === null, 'Un mensaje de error conocido debe ser rechazado');
      assertCondition(hasErrorAttempt === null, 'Una entrada con hasError: true debe ser rechazada');

      const preserved = store.getCachedAnalysis('Agenda visoespacial', 'Psicología');
      assertCondition(preserved !== null, 'La entrada válida previa debe seguir existiendo');
      assertCondition(
        preserved?.academicDefinition.includes('imágenes visuales y espaciales') === true,
        'La definición válida previa no debió ser sobrescrita'
      );
    }
  );

  return results;
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((arg) => arg.replace(/\\/g, '/').endsWith('cacheIntegrity.test.ts'));

if (isDirectExecution) {
  runCacheIntegrityTestSuite().then((results) => {
    let failed = 0;
    console.log('=== Nexo Notes: Suite de Pruebas de Integridad de Caché y Glosario (Fase 4.1) ===');
    for (const r of results) {
      if (r.passed) {
        console.log(`  [PASS] ${r.id}: ${r.name}`);
      } else {
        failed++;
        console.error(`  [FAIL] ${r.id}: ${r.name}\n         Detalle: ${r.details}`);
      }
    }
    console.log(`\nResultado: ${results.length - failed}/${results.length} pruebas superadas.`);
    if (failed > 0) {
      process.exit(1);
    }
  });
}
