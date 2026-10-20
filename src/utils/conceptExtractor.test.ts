/**
 * Pruebas unitarias deterministas del Extractor de Conceptos (Fase 3.3)
 * Ejecutable directamente con `bun run src/utils/conceptExtractor.test.ts`
 * y compatible con `bun run lint` (`tsc --noEmit`) sin llamadas externas a red.
 */

import { AcademicProfile, NoteEntity } from '../types/models';
import {
  ConceptExtractionError,
  EXTRACTION_FALLBACK_MODEL,
  EXTRACTION_PRIMARY_MODEL,
  buildConceptExtractionPrompt,
  buildExtractionRequestPayload,
  classifyExtractionError,
  createExtractionConcurrencyGuard,
  deduplicateExtractedTerms,
  extractTermsFromChunksWithResilience,
  parseAndValidateExtractedTerms,
} from './conceptExtractor';

export const WORKING_MEMORY_REFERENCE_NOTE = {
  title: 'Memoria de trabajo y componentes de Baddeley',
  content: `La memoria de trabajo según Baddeley y Hitch mantiene y manipula información temporalmente durante tareas cognitivas complejas.
Ejecutivo central dirige la atención coordina sistemas esclavos y supervisa el control inhibitorio.
Bucle fonológico procesa información verbal y acústica mediante almacén fonológico y repaso subvocal.
Agenda visoespacial mantiene y manipula imágenes visuales y relaciones espaciales.
Buffer episódico integra información multimodal del bucle fonológico y la agenda visoespacial con la memoria a largo plazo.`,
};

export const EXPECTED_REFERENCE_CONCEPTS = [
  'Memoria de trabajo',
  'Ejecutivo central',
  'Bucle fonológico',
  'Agenda visoespacial',
  'Buffer episódico',
];

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runConceptExtractorUnitTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runCase = async (id: string, name: string, fn: () => Promise<string> | string) => {
    try {
      const details = await fn();
      results.push({ id, name, passed: true, details });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id, name, passed: false, details: msg });
    }
  };

  // 1. Caso de referencia (Memoria de trabajo y componentes de Baddeley)
  await runCase(
    'CE-01',
    'Caso de referencia: extracción consistente de los 5 conceptos canónicos de Memoria de trabajo (Baddeley)',
    async () => {
      const payload = buildExtractionRequestPayload({
        text: WORKING_MEMORY_REFERENCE_NOTE.content,
        title: WORKING_MEMORY_REFERENCE_NOTE.title,
        defaultSubject: 'General',
      });

      const prompt = buildConceptExtractionPrompt({
        chunkText: payload.text,
        subject: payload.subject,
        title: payload.title,
        academicContext: payload.academicContext,
      });

      assertCondition(
        prompt.includes('Ejecutivo central') &&
          prompt.includes('Bucle fonológico') &&
          prompt.includes('Agenda visoespacial') &&
          prompt.includes('Buffer episódico') &&
          prompt.includes('Psicología'),
        'El prompt de extracción debe incluir las reglas de delimitación canónica y la disciplina resuelta Psicología'
      );

      const simulatedModelJson = JSON.stringify({
        terms: [
          {
            name: 'Memoria de trabajo',
            academicField: 'Psicología Cognitiva',
            contextSnippet:
              'La memoria de trabajo según Baddeley y Hitch mantiene y manipula información temporalmente.',
            isCompound: true,
          },
          {
            name: 'Ejecutivo central',
            academicField: 'Psicología Cognitiva',
            contextSnippet:
              'Ejecutivo central dirige la atención coordina sistemas esclavos y supervisa el control inhibitorio.',
            isCompound: true,
          },
          {
            name: 'Bucle fonológico',
            academicField: 'Psicología Cognitiva',
            contextSnippet:
              'Bucle fonológico procesa información verbal y acústica mediante almacén fonológico y repaso subvocal.',
            isCompound: true,
          },
          {
            name: 'Agenda visoespacial',
            academicField: 'Psicología Cognitiva',
            contextSnippet:
              'Agenda visoespacial mantiene y manipula imágenes visuales y relaciones espaciales.',
            isCompound: true,
          },
          {
            name: 'Buffer episódico',
            academicField: 'Psicología Cognitiva',
            contextSnippet:
              'Buffer episódico integra información multimodal del bucle fonológico y la agenda visoespacial.',
            isCompound: true,
          },
        ],
      });

      const extraction = await extractTermsFromChunksWithResilience(
        [payload.text],
        {
          subject: payload.subject,
          title: payload.title,
          academicContext: payload.academicContext,
        },
        async () => simulatedModelJson,
        { retryDelayMs: 0 }
      );

      const extractedNames = extraction.terms.map((t) => t.name);
      assertCondition(
        extractedNames.length === 5 &&
          EXPECTED_REFERENCE_CONCEPTS.every((expected) => extractedNames.includes(expected)),
        `Se esperaban exactamente los 5 conceptos de referencia, se obtuvo: ${JSON.stringify(extractedNames)}`
      );
      assertCondition(
        extraction.method === EXTRACTION_PRIMARY_MODEL,
        `El método reportado debe coincidir con el modelo real (${EXTRACTION_PRIMARY_MODEL}), obtuvo: ${extraction.method}`
      );

      return `5/5 conceptos extraídos (${extractedNames.join(', ')}), method=${extraction.method}`;
    }
  );

  // 2. JSON válido
  await runCase('CE-02', 'JSON válido: parseo correcto cuando la respuesta cumple el esquema', () => {
    const raw = JSON.stringify({
      terms: [
        {
          name: 'Disonancia cognitiva',
          academicField: 'Psicología Social',
          contextSnippet: 'Estado de tensión ante creencias contradictorias.',
          isCompound: true,
        },
      ],
    });
    const parsed = parseAndValidateExtractedTerms(raw);
    assertCondition(
      parsed.length === 1 &&
        parsed[0].name === 'Disonancia cognitiva' &&
        parsed[0].academicField === 'Psicología Social' &&
        parsed[0].isCompound === true,
      'Debe parsear correctamente un JSON válido que cumple el esquema'
    );
    return `Concepto parseado: "${parsed[0].name}" (${parsed[0].academicField})`;
  });

  // 3. JSON envuelto en Markdown
  await runCase(
    'CE-03',
    'JSON envuelto en Markdown: parseo correcto cuando llega dentro de bloques ```json ... ```',
    () => {
      const wrapped =
        '```json\n{\n  "terms": [\n    {\n      "name": "Potencial de acción",\n      "academicField": "Neurociencia",\n      "contextSnippet": "Despolarización rápida de la membrana neuronal.",\n      "isCompound": true\n    }\n  ]\n}\n```';
      const parsed = parseAndValidateExtractedTerms(wrapped);
      assertCondition(
        parsed.length === 1 && parsed[0].name === 'Potencial de acción',
        'Debe limpiar bloques ```json y parsear el objeto válidamente'
      );
      return `Parseado exitosamente desde bloque Markdown: "${parsed[0].name}"`;
    }
  );

  // 4. JSON truncado o malformado
  await runCase(
    'CE-04',
    'JSON truncado o malformado: fallo controlado sin devolver silenciosamente terms: [] como éxito',
    () => {
      const truncated = '{"terms": [{"name": "Ejecutivo central", "academicField": "Psicología"';
      let caughtError: ConceptExtractionError | null = null;
      try {
        parseAndValidateExtractedTerms(truncated);
      } catch (err) {
        if (err instanceof ConceptExtractionError) {
          caughtError = err;
        }
      }
      assertCondition(
        caughtError !== null &&
          caughtError.kind === 'MALFORMED_RESPONSE' &&
          caughtError.statusCode === 502,
        'Debe lanzar ConceptExtractionError con kind=MALFORMED_RESPONSE ante JSON truncado'
      );
      return `Error controlado capturado: kind=${caughtError!.kind}, status=${caughtError!.statusCode}`;
    }
  );

  // 5. Campos inválidos o faltantes
  await runCase(
    'CE-05',
    'Campos inválidos: fallo controlado cuando faltan campos obligatorios o tienen tipos incorrectos',
    () => {
      const missingFieldsJson = JSON.stringify({
        terms: [
          {
            name: 'Memoria sensorial',
            // falta academicField, contextSnippet e isCompound tiene tipo incorrecto
            isCompound: 'si',
          },
        ],
      });

      let caughtError: ConceptExtractionError | null = null;
      try {
        parseAndValidateExtractedTerms(missingFieldsJson);
      } catch (err) {
        if (err instanceof ConceptExtractionError) {
          caughtError = err;
        }
      }

      assertCondition(
        caughtError !== null && caughtError.kind === 'MALFORMED_RESPONSE',
        'Debe rechazar elementos cuyos campos obligatorios falten o tengan tipos inválidos'
      );
      return `Validación de esquema rechazó payload inválido con kind=${caughtError!.kind}`;
    }
  );

  // 6. Deduplicación sin fusionar conceptos distintos
  await runCase(
    'CE-06',
    'Deduplicación: elimina términos repetidos equivalentes sin fusionar conceptos distintos',
    () => {
      const rawTerms = [
        {
          name: 'Bucle fonológico',
          academicField: 'Psicología',
          contextSnippet: 'Procesa información verbal.',
          isCompound: true,
        },
        {
          name: '  bucle   fonologico ',
          academicField: 'Psicología',
          contextSnippet: 'Duplicado sin tilde y con espacios.',
          isCompound: true,
        },
        {
          name: 'Agenda visoespacial',
          academicField: 'Psicología',
          contextSnippet: 'Manipula imágenes visuales.',
          isCompound: true,
        },
      ];

      const deduplicated = deduplicateExtractedTerms(rawTerms);
      assertCondition(
        deduplicated.length === 2 &&
          deduplicated[0].name === 'Bucle fonológico' &&
          deduplicated[1].name === 'Agenda visoespacial',
        `Se esperaban 2 conceptos únicos tras deduplicar, se obtuvo: ${deduplicated.length}`
      );
      return `3 entradas -> ${deduplicated.length} únicos ("${deduplicated[0].name}", "${deduplicated[1].name}")`;
    }
  );

  // 7. Error transitorio (503 / UNAVAILABLE) con recuperación exitosa
  await runCase(
    'CE-07',
    'Error transitorio (503 / UNAVAILABLE): reintento y recuperación exitosa con modelo primario o de respaldo',
    async () => {
      const callHistory: Array<{ model: string; attempt: number }> = [];

      const res = await extractTermsFromChunksWithResilience(
        ['Texto sobre condicionamiento operante y refuerzo positivo.'],
        { subject: 'Psicología', title: 'Conductismo' },
        async ({ model, attempt }) => {
          callHistory.push({ model, attempt });
          if (callHistory.length < 3) {
            const err: any = new Error('503 Service Unavailable: high demand');
            err.status = 503;
            throw err;
          }
          return JSON.stringify({
            terms: [
              {
                name: 'Condicionamiento operante',
                academicField: 'Psicología',
                contextSnippet: 'Aprendizaje basado en consecuencias.',
                isCompound: true,
              },
            ],
          });
        },
        { maxAttemptsPerModel: 2, retryDelayMs: 0 }
      );

      assertCondition(
        callHistory.length === 3 &&
          callHistory[0].model === EXTRACTION_PRIMARY_MODEL &&
          callHistory[1].model === EXTRACTION_PRIMARY_MODEL &&
          callHistory[2].model === EXTRACTION_FALLBACK_MODEL &&
          res.method === EXTRACTION_FALLBACK_MODEL &&
          res.terms.length === 1,
        'Debe reintentar el modelo primario y conmutar al modelo de respaldo ante errores 503'
      );
      return `Recuperado en intento ${res.attemptsUsed} usando respaldo (${res.method})`;
    }
  );

  // 8. Agotamiento de reintentos
  await runCase(
    'CE-08',
    'Agotamiento de reintentos: devuelve error explícito y nunca 200 OK con lista vacía',
    async () => {
      let attempts = 0;
      let finalError: ConceptExtractionError | null = null;

      try {
        await extractTermsFromChunksWithResilience(
          ['Fragmento de prueba'],
          { subject: 'Psicología', title: 'Apunte' },
          async () => {
            attempts++;
            const err: any = new Error('503 UNAVAILABLE: Model overloaded');
            err.status = 503;
            throw err;
          },
          { maxAttemptsPerModel: 2, retryDelayMs: 0 }
        );
      } catch (err) {
        if (err instanceof ConceptExtractionError) {
          finalError = err;
        }
      }

      assertCondition(
        attempts === 4 &&
          finalError !== null &&
          finalError.kind === 'TRANSIENT_ERROR' &&
          finalError.statusCode === 503,
        `Al agotar los 4 intentos (2 por modelo) debe lanzar ConceptExtractionError 503, obtuvo: ${JSON.stringify(finalError)}`
      );
      return `4/4 intentos agotados -> lanzó error explícito (${finalError!.kind}, HTTP ${finalError!.statusCode})`;
    }
  );

  // 9. Error permanente (400 / solicitud inválida) sin reintentos innecesarios
  await runCase(
    'CE-09',
    'Error permanente (400 / solicitud inválida): falla inmediatamente sin reintentar',
    async () => {
      let attempts = 0;
      let caught: ConceptExtractionError | null = null;

      try {
        await extractTermsFromChunksWithResilience(
          ['Texto de prueba'],
          { subject: 'Psicología', title: 'Apunte' },
          async () => {
            attempts++;
            const err: any = new Error('400 INVALID_ARGUMENT: request payload invalid');
            err.status = 400;
            throw err;
          },
          { maxAttemptsPerModel: 2, retryDelayMs: 0 }
        );
      } catch (err) {
        if (err instanceof ConceptExtractionError) {
          caught = err;
        }
      }

      assertCondition(
        attempts === 1 &&
          caught !== null &&
          caught.kind === 'PERMANENT_ERROR' &&
          caught.retryable === false &&
          caught.statusCode === 400,
        `Ante error 400 solo debe realizar 1 intento y marcar retryable=false, hizo ${attempts} intentos`
      );
      return `Detenido en intento ${attempts} con kind=${caught!.kind}, status=${caught!.statusCode}`;
    }
  );

  // 10. Texto válido sin conceptos (0 conceptos legítimos vs fallo técnico)
  await runCase(
    'CE-10',
    'Texto válido sin conceptos: cuando el modelo devuelve {"terms": []}, retorna éxito con 0 conceptos sin error',
    async () => {
      const res = await extractTermsFromChunksWithResilience(
        ['Recordar traer el cuaderno el próximo martes a las ocho de la mañana.'],
        { subject: 'General', title: 'Recordatorio' },
        async () => JSON.stringify({ terms: [] }),
        { retryDelayMs: 0 }
      );

      assertCondition(
        Array.isArray(res.terms) && res.terms.length === 0 && res.attemptsUsed === 1,
        'Debe aceptar legítimamente {"terms": []} en el primer intento sin lanzar error técnico'
      );
      return `Resultado exitoso con 0 conceptos en ${res.attemptsUsed} intento`;
    }
  );

  // 11. Contexto académico resuelto de la nota
  await runCase(
    'CE-11',
    'Contexto académico: transmite la disciplina resuelta de la nota y no General cuando existe contexto específico',
    () => {
      const noteWithDefaultSubject: NoteEntity = {
        id: 'note-wm-1',
        title: WORKING_MEMORY_REFERENCE_NOTE.title,
        content: WORKING_MEMORY_REFERENCE_NOTE.content,
        subject: 'General',
        tags: [],
        isPinned: false,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        wordCount: 68,
        charCount: 515,
        disciplineMode: 'auto',
      };

      const psychProfile: AcademicProfile = {
        primaryArea: 'psicologia',
        career: 'Licenciatura en Psicología',
        specialty: 'Neuropsicología Cognitiva',
        updatedAt: 1700000000000,
      };

      const payload = buildExtractionRequestPayload({
        text: noteWithDefaultSubject.content,
        title: noteWithDefaultSubject.title,
        defaultSubject: noteWithDefaultSubject.subject,
        note: noteWithDefaultSubject,
        academicProfile: psychProfile,
      });

      assertCondition(
        payload.subject === 'Psicología' &&
          payload.academicContext.areaId === 'psicologia' &&
          payload.academicContext.disciplineLabel === 'Psicología' &&
          payload.academicContext.career === 'Licenciatura en Psicología',
        `El payload no debe enviar 'General' cuando la nota resuelve a Psicología; obtuvo subject="${payload.subject}", areaId="${payload.academicContext.areaId}"`
      );

      // También verificar modo manual en otra disciplina aunque subject sea 'General'
      const manualLawNote: NoteEntity = {
        ...noteWithDefaultSubject,
        title: 'Apunte breve',
        content: 'Notas generales de clase.',
        subject: 'General',
        disciplineMode: 'manual',
        manualDiscipline: 'economia_negocios_derecho',
      };

      const manualPayload = buildExtractionRequestPayload({
        text: manualLawNote.content,
        note: manualLawNote,
        academicProfile: psychProfile,
      });

      assertCondition(
        manualPayload.subject === 'Economía, negocios y derecho' &&
          manualPayload.academicContext.areaId === 'economia_negocios_derecho' &&
          manualPayload.academicContext.mode === 'manual',
        `En modo manual debe prevalecer la disciplina fijada sobre 'General' y sobre el perfil global; obtuvo "${manualPayload.subject}"`
      );

      return `Auto->"${payload.subject}" (${payload.academicContext.source}), Manual->"${manualPayload.subject}"`;
    }
  );

  // 12. Bloqueo de concurrencia ante doble clic
  await runCase(
    'CE-12',
    'Bloqueo de concurrencia: impide disparar dos extracciones simultáneas por doble clic',
    async () => {
      const guard = createExtractionConcurrencyGuard();
      let executions = 0;

      let releaseFirst!: () => void;
      const firstBarrier = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      const firstCallPromise = guard.run(async () => {
        executions++;
        await firstBarrier;
        return 'primera_extraccion';
      });

      assertCondition(
        guard.isBusy() === true,
        'El guardia debe reportar isBusy()=true mientras la primera extracción sigue en curso'
      );

      const secondCallResult = await guard.run(async () => {
        executions++;
        return 'segunda_extraccion_duplicada';
      });

      releaseFirst();
      const firstCallResult = await firstCallPromise;

      assertCondition(
        executions === 1 &&
          firstCallResult.executed === true &&
          secondCallResult.executed === false &&
          guard.isBusy() === false,
        `Solo debe ejecutarse 1 extracción ante doble clic simultáneo; ejecuciones=${executions}`
      );

      return `Doble clic bloqueado correctamente (executions=${executions}, secondCall.executed=${secondCallResult.executed})`;
    }
  );

  // 13. 429 en modelo principal: no repetir inmediatamente el mismo modelo y conmutar al alternativo
  await runCase(
    'CE-13',
    '429 en modelo principal: no repite inmediatamente el modelo principal y conmuta al alternativo (exactamente 2 llamadas)',
    async () => {
      const calls: Array<{ model: string; attempt: number }> = [];

      const res = await extractTermsFromChunksWithResilience(
        ['Texto sobre sinapsis y neurotransmisores.'],
        { subject: 'Neurociencia', title: 'Sinapsis' },
        async ({ model, attempt }) => {
          calls.push({ model, attempt });
          if (model === EXTRACTION_PRIMARY_MODEL) {
            const err: any = new Error(
              '429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric GenerateContent'
            );
            err.status = 429;
            throw err;
          }
          return JSON.stringify({
            terms: [
              {
                name: 'Neurotransmisor',
                academicField: 'Neurociencia',
                contextSnippet: 'Sustancia química liberada en la hendidura sináptica.',
                isCompound: false,
              },
            ],
          });
        },
        { retryDelayMs: 0 }
      );

      assertCondition(
        calls.length === 2 &&
          calls[0].model === EXTRACTION_PRIMARY_MODEL &&
          calls[1].model === EXTRACTION_FALLBACK_MODEL &&
          res.method === EXTRACTION_FALLBACK_MODEL &&
          res.terms.length === 1,
        `Se esperaban exactamente 2 llamadas (1 en primario, 1 en alternativo); se hicieron ${calls.length}: ${JSON.stringify(calls)}`
      );

      return `Conmutación inmediata ante 429 sin repetir el modelo primario: ${calls[0].model} (429) -> ${calls[1].model} (éxito en intento ${calls[1].attempt})`;
    }
  );

  // 14. 429 en modelo principal y 429 en modelo alternativo: detención inmediata sin llamadas redundantes
  await runCase(
    'CE-14',
    '429 en modelo principal y 429 en alternativo: detiene de inmediato los reintentos (exactamente 2 llamadas totales)',
    async () => {
      const calls: Array<{ model: string; attempt: number }> = [];
      let caughtError: ConceptExtractionError | null = null;

      try {
        await extractTermsFromChunksWithResilience(
          ['Texto de prueba sobre memoria.'],
          { subject: 'Psicología', title: 'Memoria' },
          async ({ model, attempt }) => {
            calls.push({ model, attempt });
            const err: any = new Error('429 RESOURCE_EXHAUSTED: Rate limit exceeded (15 RPM)');
            err.status = 429;
            throw err;
          },
          { maxAttemptsPerModel: 2, retryDelayMs: 0 }
        );
      } catch (err) {
        if (err instanceof ConceptExtractionError) {
          caughtError = err;
        }
      }

      assertCondition(
        calls.length === 2 &&
          calls[0].model === EXTRACTION_PRIMARY_MODEL &&
          calls[1].model === EXTRACTION_FALLBACK_MODEL &&
          caughtError !== null &&
          caughtError.statusCode === 429,
        `Ante 429 en ambos modelos deben realizarse exactamente 2 llamadas y detenerse; se hicieron ${calls.length}: ${JSON.stringify(calls)}`
      );

      return `Detención inmediata en llamada ${calls.length} con error estructurado 429 (${caughtError!.category ?? caughtError!.kind})`;
    }
  );

  // 15. 503 recuperable en reintento del mismo modelo y Timeout (504)
  await runCase(
    'CE-15',
    '503 y Timeout: permite reintento progresivo en el mismo modelo y clasifica correctamente timeout (504)',
    async () => {
      const calls: Array<{ model: string; attempt: number }> = [];

      // 503 se recupera en el intento 2 del modelo primario
      const res503 = await extractTermsFromChunksWithResilience(
        ['Texto sobre refuerzo intermitente.'],
        { subject: 'Psicología', title: 'Conductismo' },
        async ({ model, attempt }) => {
          calls.push({ model, attempt });
          if (attempt === 1) {
            const err: any = new Error('503 Service Unavailable: High demand on model');
            err.status = 503;
            throw err;
          }
          return JSON.stringify({
            terms: [
              {
                name: 'Refuerzo intermitente',
                academicField: 'Psicología',
                contextSnippet: 'Programa de reforzamiento no continuo.',
                isCompound: true,
              },
            ],
          });
        },
        { retryDelayMs: 0 }
      );

      assertCondition(
        calls.length === 2 &&
          calls[0].model === EXTRACTION_PRIMARY_MODEL &&
          calls[1].model === EXTRACTION_PRIMARY_MODEL &&
          res503.method === EXTRACTION_PRIMARY_MODEL,
        `El 503 debe reintentar el modelo primario progresivamente; llamadas=${calls.length}`
      );

      // Verificación de timeout / DEADLINE_EXCEEDED
      const timeoutErr: any = new Error('504 DEADLINE_EXCEEDED: Deadline exceeded after 30.0s');
      timeoutErr.status = 504;
      const classifiedTimeout = classifyExtractionError(timeoutErr);

      assertCondition(
        classifiedTimeout.statusCode === 504 &&
          classifiedTimeout.category === 'timeout' &&
          classifiedTimeout.message.includes('timeout'),
        `Timeout debe clasificarse con HTTP 504 y category=timeout; obtuvo: ${JSON.stringify(classifiedTimeout)}`
      );

      return `503 recuperado en llamada 2 (${calls[1].model}) y timeout clasificado correctamente con HTTP 504`;
    }
  );

  // 16. Bucle por fragmentos (chunks): la cuota agotada no provoca cadenas redundantes en fragmentos posteriores
  await runCase(
    'CE-16',
    'Extracción por fragmentos: la cuota agotada en un modelo omite llamadas redundantes en fragmentos siguientes y detiene ante fallo general',
    async () => {
      const callsScenario1: Array<{ chunkIndex: number; model: string }> = [];

      // Escenario 1: Chunk 0 tiene 429 en primario y éxito en alternativo.
      // Chunk 1 debe usar directamente el alternativo y NO volver a probar el primario agotado.
      const multiChunkRes = await extractTermsFromChunksWithResilience(
        ['Fragmento 1 sobre atención sostenida.', 'Fragmento 2 sobre atención selectiva.'],
        { subject: 'Psicología', title: 'Atención' },
        async ({ model, chunkIndex }) => {
          callsScenario1.push({ chunkIndex, model });
          if (model === EXTRACTION_PRIMARY_MODEL) {
            const err: any = new Error('429 RESOURCE_EXHAUSTED: quota exceeded');
            err.status = 429;
            throw err;
          }
          return JSON.stringify({
            terms: [
              {
                name: chunkIndex === 0 ? 'Atención sostenida' : 'Atención selectiva',
                academicField: 'Psicología',
                contextSnippet: 'Capacidad de mantener el foco atencional.',
                isCompound: true,
              },
            ],
          });
        },
        { retryDelayMs: 0 }
      );

      assertCondition(
        callsScenario1.length === 3 &&
          callsScenario1[0].chunkIndex === 0 &&
          callsScenario1[0].model === EXTRACTION_PRIMARY_MODEL &&
          callsScenario1[1].chunkIndex === 0 &&
          callsScenario1[1].model === EXTRACTION_FALLBACK_MODEL &&
          callsScenario1[2].chunkIndex === 1 &&
          callsScenario1[2].model === EXTRACTION_FALLBACK_MODEL &&
          multiChunkRes.terms.length === 2,
        `En múltiples fragmentos el primario no debe volver a llamarse tras 429; llamadas=${JSON.stringify(callsScenario1)}`
      );

      // Escenario 2: Chunk 0 falla con 429 en ambos modelos.
      // Chunk 1 NUNCA debe ejecutarse (detención inmediata total).
      const callsScenario2: Array<{ chunkIndex: number; model: string }> = [];
      let caughtExhaustion: ConceptExtractionError | null = null;

      try {
        await extractTermsFromChunksWithResilience(
          ['Fragmento A', 'Fragmento B', 'Fragmento C'],
          { subject: 'Psicología', title: 'Prueba' },
          async ({ model, chunkIndex }) => {
            callsScenario2.push({ chunkIndex, model });
            const err: any = new Error('429 RESOURCE_EXHAUSTED');
            err.status = 429;
            throw err;
          },
          { retryDelayMs: 0 }
        );
      } catch (err) {
        if (err instanceof ConceptExtractionError) {
          caughtExhaustion = err;
        }
      }

      assertCondition(
        callsScenario2.length === 2 &&
          callsScenario2.every((c) => c.chunkIndex === 0) &&
          caughtExhaustion !== null &&
          caughtExhaustion.statusCode === 429,
        `Si ambos modelos agotan cuota en chunk 0, no deben ejecutarse chunks 1 y 2; llamadas=${JSON.stringify(callsScenario2)}`
      );

      return `Chunk 1 reutilizó alternativo directamente (3 llamadas totales) y Chunk 0 con 429 general abortó inmediatamente chunks siguientes (2 llamadas totales)`;
    }
  );

  // 17. Clasificación honesta de causas de error (cuota vs límite temporal vs timeout vs alta demanda)
  await runCase(
    'CE-17',
    'Clasificación honesta de causas de error: distingue cuota agotada, límite temporal, 429 genérico, timeout, alta demanda y solicitud inválida',
    () => {
      // 1. Cuota de uso agotada (plan/créditos)
      const errQuota = classifyExtractionError(
        new Error('429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric GenerateContent (free tier)')
      );
      assertCondition(
        errQuota.category === 'quota_exhausted' &&
          errQuota.statusCode === 429 &&
          errQuota.message.toLowerCase().includes('cuota de uso'),
        `Debe clasificar cuota agotada: ${JSON.stringify(errQuota)}`
      );

      // 2. Límite temporal por minuto (RPM)
      const errRateLimit = classifyExtractionError(
        new Error('429 RESOURCE_EXHAUSTED: Rate limit exceeded: 15 requests per minute')
      );
      assertCondition(
        errRateLimit.category === 'rate_limit' &&
          errRateLimit.statusCode === 429 &&
          errRateLimit.message.toLowerCase().includes('límite temporal'),
        `Debe clasificar límite temporal de solicitudes: ${JSON.stringify(errRateLimit)}`
      );

      // 3. 429 genérico sin información suficiente
      const errGeneric429 = classifyExtractionError(new Error('429 RESOURCE_EXHAUSTED'));
      assertCondition(
        errGeneric429.category === 'unspecified_429' &&
          errGeneric429.statusCode === 429 &&
          errGeneric429.message.includes('Límite de solicitudes o cuota'),
        `No debe afirmar que conoce la causa exacta ante 429 genérico: ${JSON.stringify(errGeneric429)}`
      );

      // 4. Timeout
      const errTimeout = classifyExtractionError(new Error('DEADLINE_EXCEEDED'));
      assertCondition(
        errTimeout.category === 'timeout' && errTimeout.statusCode === 504,
        `Debe clasificar timeout con 504: ${JSON.stringify(errTimeout)}`
      );

      // 5. Alta demanda (503)
      const errHighDemand = classifyExtractionError(new Error('503 Service Unavailable: High demand'));
      assertCondition(
        errHighDemand.category === 'high_demand' && errHighDemand.statusCode === 503,
        `Debe clasificar alta demanda con 503: ${JSON.stringify(errHighDemand)}`
      );

      // 6. Solicitud inválida (400)
      const errInvalid = classifyExtractionError(new Error('400 INVALID_ARGUMENT'));
      assertCondition(
        errInvalid.category === 'invalid_request' &&
          errInvalid.statusCode === 400 &&
          errInvalid.retryable === false,
        `Debe clasificar solicitud inválida con 400 permanente: ${JSON.stringify(errInvalid)}`
      );

      return '6 categorías de error analizadas y clasificadas con precisión honesta';
    }
  );

  // 18. 429 en modelo principal seguido de 503 en el alternativo: recuperación en reintento acotada a 3 llamadas
  await runCase(
    'CE-18',
    '429 en modelo principal seguido de 503 en el alternativo: permite 1 reintento con espera en el alternativo y se recupera en 3 llamadas totales',
    async () => {
      const calls: Array<{ model: string; attempt: number }> = [];

      // Escenario A: 429 en primario -> 503 en alternativo -> reintento de alternativo tiene éxito (3 llamadas totales)
      const resRecovered = await extractTermsFromChunksWithResilience(
        ['Texto sobre plasticidad neuronal y sinaptogénesis.'],
        { subject: 'Neurociencia', title: 'Plasticidad' },
        async ({ model, attempt }) => {
          calls.push({ model, attempt });
          if (attempt === 1) {
            const err: any = new Error('429 RESOURCE_EXHAUSTED: rate limit');
            err.status = 429;
            throw err;
          }
          if (attempt === 2) {
            const err: any = new Error('503 Service Unavailable: High demand');
            err.status = 503;
            throw err;
          }
          return JSON.stringify({
            terms: [
              {
                name: 'Plasticidad neuronal',
                academicField: 'Neurociencia',
                contextSnippet: 'Capacidad del sistema nervioso de modificar su estructura.',
                isCompound: true,
              },
            ],
          });
        },
        { retryDelayMs: 0 }
      );

      assertCondition(
        calls.length === 3 &&
          calls[0].model === EXTRACTION_PRIMARY_MODEL &&
          calls[1].model === EXTRACTION_FALLBACK_MODEL &&
          calls[2].model === EXTRACTION_FALLBACK_MODEL &&
          resRecovered.method === EXTRACTION_FALLBACK_MODEL &&
          resRecovered.terms.length === 1,
        `Se esperaban exactamente 3 llamadas (1 en primario por 429, 2 en alternativo por 503 recuperado); llamadas=${JSON.stringify(calls)}`
      );

      // Escenario B: 429 en primario -> 503 en alternativo -> reintento de alternativo vuelve a fallar con 503 (falla estrictamente en 3 llamadas)
      const callsFailed: Array<{ model: string; attempt: number }> = [];
      let caught503: ConceptExtractionError | null = null;

      try {
        await extractTermsFromChunksWithResilience(
          ['Texto de prueba.'],
          { subject: 'Neurociencia', title: 'Plasticidad' },
          async ({ model, attempt }) => {
            callsFailed.push({ model, attempt });
            if (attempt === 1) {
              const err: any = new Error('429 RESOURCE_EXHAUSTED');
              err.status = 429;
              throw err;
            }
            const err: any = new Error('503 Service Unavailable: Still high demand');
            err.status = 503;
            throw err;
          },
          { maxAttemptsPerModel: 2, retryDelayMs: 0 }
        );
      } catch (err) {
        if (err instanceof ConceptExtractionError) {
          caught503 = err;
        }
      }

      assertCondition(
        callsFailed.length === 3 &&
          callsFailed[0].model === EXTRACTION_PRIMARY_MODEL &&
          callsFailed[1].model === EXTRACTION_FALLBACK_MODEL &&
          callsFailed[2].model === EXTRACTION_FALLBACK_MODEL &&
          caught503 !== null &&
          caught503.statusCode === 503,
        `Ante 429 seguido de 503 persistente debe detenerse estrictamente en 3 llamadas; llamadas=${JSON.stringify(callsFailed)}`
      );

      return `Recuperación exitosa en 3 llamadas (${calls[0].model} 429 -> ${calls[1].model} 503 -> ${calls[2].model} éxito) y límite estricto de 3 llamadas ante 503 persistente`;
    }
  );

  return results;
}

const suiteResults = await runConceptExtractorUnitTests();
const failed = suiteResults.filter((r) => !r.passed);

for (const res of suiteResults) {
  const badge = res.passed ? 'PASS' : 'FAIL';
  console.log(`[${badge}] Caso ${res.id}: ${res.name}\n       -> ${res.details}`);
}

if (failed.length > 0) {
  console.error(`\nFallaron ${failed.length} de ${suiteResults.length} pruebas.`);
  throw new Error(`Fallaron ${failed.length} pruebas unitarias de extracción.`);
} else {
  console.log(`\nTodas las ${suiteResults.length} pruebas unitarias del extractor pasaron exitosamente.`);
}
