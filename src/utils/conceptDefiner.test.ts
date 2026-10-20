/**
 * Pruebas unitarias deterministas de Generación y Validación de Definiciones Académicas (Fase 4.2)
 * Ejecutable directamente con `bun run src/utils/conceptDefiner.test.ts`
 * y compatible con `bun run lint` (`tsc --noEmit`) sin llamadas externas a red.
 */

import { CachedAnalysisEntity } from '../types/models';
import {
  buildContextualDefinitionPrompt,
  buildContextualDefinitionTermPayload,
  buildSearchSourcesPrompt,
  buildVerifyGroundingPrompt,
  classifyDefinitionError,
  classifySearchGroundingError,
  ConceptDefinitionError,
  DEFINITION_FALLBACK_MODEL,
  DEFINITION_PRIMARY_MODEL,
  DefinitionAttemptDiagnostic,
  extractGroundingSourcesAndSegments,
  extractRelevantNoteExcerpt,
  generateContextualDefinitionWithResilience,
  hasExcessiveMetadiscourse,
  isIncompleteOrTruncatedSentence,
  isPlaceholderContextSnippet,
  isValidAcademicDefinitionPayload,
  parseAndValidateDefinitionResponse,
  parseAndValidateSearchGroundingResponse,
  resolveDefinitionPromptContext,
  resolveSearchSourcesOutcome,
  resolveVerifyGroundingOutcome,
  sanitizeDiagnosticReason,
} from './conceptDefiner';
import {
  isValidCacheAnalysisEntry,
  prepareSafeCacheEntryToSave,
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

export async function runConceptDefinerTestSuite(): Promise<TestResult[]> {
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

  // CD-01: JSON estructurado válido se parsea y valida correctamente
  await runTest(
    'CD-01',
    'JSON estructurado válido se parsea y valida conservando definición, explicación, ejemplo y disciplina',
    () => {
      const rawJson = JSON.stringify({
        academicDefinition:
          'Mecanismo de control ejecutivo encargado de suprimir deliberadamente respuestas prepotentes o interferencias cognitivas irrelevantes para la tarea actual.',
        plainExplanation:
          'Actúa como un freno atencional que impide responder por impulso cuando una tarea exige concentración selectiva.',
        illustrativeExample:
          'En la prueba de Stroop, nombrar el color de la tinta verde con que está escrita la palabra ROJO inhibiendo la lectura automática.',
        academicField: 'Psicología Cognitiva',
      });

      const parsed = parseAndValidateDefinitionResponse(rawJson, {
        termName: 'Inhibición',
        defaultAcademicField: 'Psicología',
      });

      assertCondition(
        parsed.academicField === 'Psicología Cognitiva',
        `Se esperaba 'Psicología Cognitiva', se obtuvo '${parsed.academicField}'`
      );
      assertCondition(
        parsed.academicDefinition.includes('control ejecutivo'),
        'La definición académica no se conservó correctamente'
      );
      assertCondition(
        parsed.plainExplanation.includes('freno atencional'),
        'La explicación sencilla no se conservó correctamente'
      );
      assertCondition(
        parsed.illustrativeExample.includes('Stroop'),
        'El ejemplo ilustrativo no se conservó correctamente'
      );
    }
  );

  // CD-02: JSON envuelto en bloque Markdown ```json ... ``` se parsea correctamente
  await runTest(
    'CD-02',
    'JSON envuelto en bloque Markdown ```json se parsea y valida correctamente',
    () => {
      const fenced = `\`\`\`json
{
  "academicDefinition": "Disminución de la velocidad de una reacción catalizada por una enzima debido a la unión de un inhibidor competitivo, no competitivo o acompetitivo.",
  "plainExplanation": "Ocurre cuando una molécula se une a la enzima e impide o dificulta que transforme el sustrato en producto.",
  "illustrativeExample": "El malonato compite con el succinato por el sitio activo de la succinato deshidrogenasa en el ciclo de Krebs.",
  "academicField": "Bioquímica"
}
\`\`\``;

      const parsed = parseAndValidateDefinitionResponse(fenced, {
        termName: 'Inhibición',
        defaultAcademicField: 'Bioquímica',
      });

      assertCondition(
        parsed.academicField === 'Bioquímica',
        `Se esperaba 'Bioquímica', se obtuvo '${parsed.academicField}'`
      );
      assertCondition(
        parsed.academicDefinition.includes('reacción catalizada por una enzima'),
        'No se extrajo la definición bioquímica desde el bloque Markdown'
      );
    }
  );

  // CD-03: Respuestas vacías, truncadas, circulares o con frases de relleno se rechazan explícitamente
  await runTest(
    'CD-03',
    'El validador rechaza respuestas vacías, truncadas, circulares o con frases de relleno antiguas',
    () => {
      // 1. Vacía
      let emptyRejected = false;
      try {
        parseAndValidateDefinitionResponse('   ', { termName: 'Inhibición' });
      } catch (e) {
        emptyRejected = e instanceof ConceptDefinitionError && e.kind === 'MALFORMED_RESPONSE';
      }
      assertCondition(emptyRejected, 'Una respuesta vacía debe lanzar MALFORMED_RESPONSE');

      // 2. Con las frases de relleno antiguas de server.ts
      let fillerRejected = false;
      try {
        parseAndValidateDefinitionResponse(
          JSON.stringify({
            academicDefinition:
              'Proceso cognitivo mediante el cual se retiene información temporalmente en el sistema.',
            plainExplanation: 'Explicación didáctica orientada al marco teórico del apunte.',
            illustrativeExample: 'Aplicación práctica del concepto en contextos de estudio.',
            academicField: 'Psicología',
          }),
          { termName: 'Memoria de trabajo' }
        );
      } catch (e) {
        fillerRejected = e instanceof ConceptDefinitionError && e.kind === 'MALFORMED_RESPONSE';
      }
      assertCondition(
        fillerRejected,
        'Las frases de relleno genéricas deben ser rechazadas por el validador'
      );

      // 3. Definición circular o demasiado corta
      const circularValid = isValidAcademicDefinitionPayload(
        {
          academicDefinition: 'Inhibición',
          plainExplanation: 'Explicación válida suficientemente extensa para la prueba.',
          illustrativeExample: 'Ejemplo válido suficientemente extenso para la prueba.',
          academicField: 'Psicología',
        },
        'Inhibición'
      );
      assertCondition(!circularValid, 'Una definición circular idéntica al término debe ser inválida');

      // 4. Definición y explicación idénticas (copia literal sin valor pedagógico)
      const duplicateFieldsValid = isValidAcademicDefinitionPayload(
        {
          academicDefinition:
            'Proceso ejecutivo encargado de suprimir respuestas dominantes inapropiadas en el sujeto.',
          plainExplanation:
            'Proceso ejecutivo encargado de suprimir respuestas dominantes inapropiadas en el sujeto.',
          illustrativeExample: 'En la tarea de Stroop se frena la lectura automática de la palabra.',
          academicField: 'Psicología',
        },
        'Inhibición'
      );
      assertCondition(
        !duplicateFieldsValid,
        'No debe aceptarse una respuesta donde plainExplanation sea copia literal de academicDefinition'
      );
    }
  );

  // CD-04: El contexto disciplinar y del apunte afecta al prompt y filtra placeholders de interfaz
  await runTest(
    'CD-04',
    'El prompt incorpora la disciplina resuelta, título y extracto real del apunte, eliminando marcadores artificiales de UI',
    () => {
      const noteText =
        'En la cinética enzimática de Michaelis-Menten, la inhibición competitiva aumenta la Km aparente sin modificar la Vmax porque el inhibidor compite reversiblemente por el sitio activo.';

      const bioqPayload = buildContextualDefinitionTermPayload({
        name: 'Inhibición',
        contextSnippet: 'Término añadido manualmente por el estudiante.',
        academicField: 'Bioquímica',
        noteTitle: 'Cinética enzimática y regulación alostérica',
        noteText,
        academicContext: {
          areaId: 'salud_vida',
          disciplineLabel: 'Salud y ciencias de la vida',
          source: 'note_auto',
          mode: 'auto',
          career: 'Bioquímica Clínica',
        },
      });

      assertCondition(
        isPlaceholderContextSnippet('Término añadido manualmente por el estudiante.') === true,
        'Debe detectar el texto artificial de término añadido manualmente como placeholder'
      );
      assertCondition(
        bioqPayload.context === '',
        'El payload no debe enviar el marcador de interfaz como si fuera cita del apunte'
      );
      assertCondition(
        Boolean(bioqPayload.noteExcerpt && bioqPayload.noteExcerpt.includes('Michaelis-Menten')),
        'El payload debe extraer el fragmento real del apunte cuando está disponible'
      );

      const promptBioq = buildContextualDefinitionPrompt(bioqPayload);
      const promptPsico = buildContextualDefinitionPrompt({
        name: 'Inhibición',
        context: 'El ejecutivo central supervisa el control inhibitorio en tareas de atención.',
        subject: 'Psicología Cognitiva',
        noteTitle: 'Memoria de trabajo de Baddeley',
        academicContext: {
          areaId: 'psicologia',
          disciplineLabel: 'Psicología',
          source: 'note_auto',
          mode: 'auto',
        },
      });

      assertCondition(
        promptBioq.includes('Bioquímica') &&
          promptBioq.includes('Cinética enzimática y regulación alostérica') &&
          promptBioq.includes('Michaelis-Menten') &&
          !promptBioq.includes('Término añadido manualmente por el estudiante'),
        'El prompt de Bioquímica debe incluir la disciplina, título y extracto real sin el placeholder de UI'
      );
      assertCondition(
        promptPsico.includes('Psicología Cognitiva') &&
          promptPsico.includes('Memoria de trabajo de Baddeley') &&
          promptPsico.includes('control inhibitorio'),
        'El prompt de Psicología debe incluir el contexto psicológico específico'
      );
    }
  );

  // CD-05: Ante ausencia de contexto del apunte o disciplina general, el prompt exige honestidad epistémica
  await runTest(
    'CD-05',
    'Cuando falta contexto del apunte o la disciplina es general, el prompt exige reconocer la incertidumbre sin inventar datos',
    () => {
      const resolved = resolveDefinitionPromptContext({
        name: 'Transferencia',
        context: 'Término añadido manualmente por el estudiante.',
        subject: 'General',
      });

      assertCondition(
        resolved.hasSpecificDiscipline === false,
        'No debe asumir una disciplina específica cuando el sujeto es General'
      );
      assertCondition(
        resolved.hasContextualEvidence === false,
        'No debe asumir evidencia contextual cuando solo hay un placeholder de UI'
      );

      const prompt = buildContextualDefinitionPrompt({
        name: 'Transferencia',
        context: '',
        subject: 'General',
      });

      assertCondition(
        prompt.includes('HONESTIDAD EPISTÉMICA ANTE CONTEXTO LIMITADO') &&
          prompt.includes('Nunca inventes contexto inexistente'),
        'El prompt sin contexto debe activar la instrucción explícita contra contenido inventado'
      );
    }
  );

  // CD-06: La caché rechaza definiciones con frases de relleno o incompletas y protege definiciones válidas previas
  await runTest(
    'CD-06',
    'analysisCache rechaza respuestas vacías, erróneas o con frases de relleno y no sobrescribe una definición válida previa',
    () => {
      const validPrevious: CachedAnalysisEntity = {
        termKey: 'inhibicion::psicologia',
        termName: 'Inhibición',
        academicField: 'Psicología',
        academicAreaId: 'psicologia',
        academicDefinition:
          'Mecanismo ejecutivo que suprime respuestas dominantes o interferencias irrelevantes durante una tarea cognitiva.',
        plainExplanation:
          'Permite frenar impulsos automáticos para mantener la atención en el objetivo.',
        illustrativeExample: 'Frenar la lectura automática de la palabra en la tarea de Stroop.',
        sources: [],
        verificationStatus: 'no_verificado',
        queryStatus: 'sin_verificar',
        queriesConsulted: ['Inhibición'],
        groundingUsed: false,
        analyzedAt: 1700000000000,
      };

      assertCondition(
        isValidCacheAnalysisEntry(validPrevious) === true,
        'La entrada previa completa debe ser válida'
      );

      // Candidato con relleno genérico en plainExplanation
      const fillerCandidate: CachedAnalysisEntity = {
        ...validPrevious,
        academicDefinition: 'Definición aparentemente larga pero acompañada de texto de plantilla.',
        plainExplanation: 'Explicación didáctica orientada al marco teórico del apunte.',
        illustrativeExample: 'Aplicación práctica del concepto en contextos de estudio.',
        analyzedAt: 1700000050000,
      };

      assertCondition(
        isValidCacheAnalysisEntry(fillerCandidate) === false,
        'isValidCacheAnalysisEntry debe rechazar entradas con frases de relleno'
      );
      assertCondition(
        prepareSafeCacheEntryToSave(validPrevious, fillerCandidate, 'Psicología') === null,
        'prepareSafeCacheEntryToSave debe devolver null para no sobrescribir la entrada válida previa'
      );

      // Candidato sin plainExplanation
      const incompleteCandidate: CachedAnalysisEntity = {
        ...validPrevious,
        plainExplanation: '   ',
      };
      assertCondition(
        prepareSafeCacheEntryToSave(validPrevious, incompleteCandidate, 'Psicología') === null,
        'Una entrada sin plainExplanation no debe guardarse en caché'
      );
    }
  );

  // CD-07: Resiliencia ante fallo transitorio o primera respuesta malformada y preservación del estado en fallo definitivo
  await runTest(
    'CD-07',
    'generateContextualDefinitionWithResilience se recupera de un 503 o JSON malformado y falla controladamente si se agotan los intentos',
    async () => {
      let callCount = 0;
      const modelsCalled: string[] = [];

      const recovered = await generateContextualDefinitionWithResilience(
        {
          name: 'Agenda visoespacial',
          context: 'Agenda visoespacial mantiene y manipula imágenes visuales y espaciales.',
          subject: 'Psicología Cognitiva',
        },
        async ({ model, attempt }) => {
          callCount++;
          modelsCalled.push(model);
          if (attempt === 1) {
            const err = new Error('503 Service Unavailable - high demand') as Error & {
              status?: number;
            };
            err.status = 503;
            throw err;
          }
          if (attempt === 2) {
            // Respuesta truncada/inválida en el segundo intento
            return '{"academicDefinition": "Texto truncado...';
          }
          return JSON.stringify({
            academicDefinition:
              'Subsistema esclavo del modelo de memoria de trabajo de Baddeley encargado de mantener y manipular representaciones visuales y espaciales.',
            plainExplanation:
              'Funciona como una pizarra mental temporal donde retenemos formas, colores, ubicaciones y movimientos en el espacio.',
            illustrativeExample:
              'Imaginar mentalmente cómo encajar muebles en una habitación o recordar el recorrido de un mapa.',
            academicField: 'Psicología Cognitiva',
          });
        },
        { retryDelayMs: 0 }
      );

      assertCondition(callCount === 3, `Se esperaban 3 intentos, se realizaron ${callCount}`);
      assertCondition(
        modelsCalled[0] === DEFINITION_PRIMARY_MODEL &&
          modelsCalled[2] === DEFINITION_FALLBACK_MODEL,
        `Plan de modelos inesperado: ${modelsCalled.join(' -> ')}`
      );
      assertCondition(
        recovered.definition.academicDefinition.includes('Baddeley'),
        'La definición recuperada en el tercer intento no coincide'
      );

      // Si todos los intentos devuelven error o relleno inválido, lanza ConceptDefinitionError sin devolver éxito falso
      let exhaustedError: ConceptDefinitionError | null = null;
      try {
        await generateContextualDefinitionWithResilience(
          {
            name: 'Buffer episódico',
            subject: 'Psicología',
          },
          async () =>
            JSON.stringify({
              academicDefinition: 'Explicación didáctica orientada al marco teórico del apunte.',
              plainExplanation: 'Explicación didáctica orientada al marco teórico del apunte.',
              illustrativeExample: 'Aplicación práctica del concepto en contextos de estudio.',
              academicField: 'Psicología',
            }),
          { retryDelayMs: 0 }
        );
      } catch (err) {
        if (err instanceof ConceptDefinitionError) {
          exhaustedError = err;
        }
      }

      assertCondition(
        exhaustedError !== null && exhaustedError.kind === 'MALFORMED_RESPONSE',
        'El agotamiento de intentos por respuestas con relleno debe lanzar MALFORMED_RESPONSE'
      );
    }
  );

  // CD-08: Extracción acotada de extracto relevante del apunte sin inventar texto ausente
  await runTest(
    'CD-08',
    'extractRelevantNoteExcerpt extrae la ventana relevante alrededor del concepto y devuelve undefined si el apunte está vacío',
    () => {
      assertCondition(
        extractRelevantNoteExcerpt('   ', 'Inhibición') === undefined,
        'Debe devolver undefined cuando el apunte está vacío'
      );

      const longNote =
        'Introducción general a la historia de la disciplina. '.repeat(20) +
        'El bucle fonológico procesa información verbal y acústica mediante un almacén fonológico temporal y un sistema de repaso articulatorio subvocal. ' +
        'Conclusiones finales del capítulo sobre otros procesos. '.repeat(20);

      const excerpt = extractRelevantNoteExcerpt(
        longNote,
        'Bucle fonológico',
        'Bucle fonológico procesa información verbal y acústica',
        300
      );

      assertCondition(
        Boolean(excerpt && excerpt.includes('bucle fonológico') && excerpt.length <= 300),
        `El extracto debe centrarse en el término y respetar el límite de longitud (len=${excerpt?.length})`
      );
    }
  );

  // CD-09: Carrera o área "General o multidisciplinario" (global o manual en nota) genera prompt coherente y acepta definición general
  await runTest(
    'CD-09',
    'El área o carrera "General o multidisciplinario" no induce contradicciones en el prompt y acepta definiciones generales válidas',
    () => {
      // Caso 1: Perfil o carrera configurada como "General o multidisciplinario"
      const resolvedGeneralCareer = resolveDefinitionPromptContext({
        name: 'Sistema',
        subject: 'General o multidisciplinario',
        academicContext: {
          areaId: 'general',
          disciplineLabel: 'General o multidisciplinario',
          source: 'global_profile',
          mode: 'auto',
          career: 'General o multidisciplinario',
        },
      });

      assertCondition(
        resolvedGeneralCareer.hasSpecificDiscipline === false &&
          resolvedGeneralCareer.disciplineLabel === 'General o multidisciplinario' &&
          resolvedGeneralCareer.career === undefined,
        `El contexto general no debe tratar "General o multidisciplinario" como disciplina específica; obtuvo: ${JSON.stringify(resolvedGeneralCareer)}`
      );

      // Caso 2: Nota puesta manualmente en "general" aunque note.subject heredado fuera "Psicología Cognitiva"
      const resolvedManualGeneral = resolveDefinitionPromptContext({
        name: 'Inhibición',
        subject: 'Psicología Cognitiva',
        academicContext: {
          areaId: 'general',
          disciplineLabel: 'General',
          source: 'note_manual',
          mode: 'manual',
        },
      });

      assertCondition(
        resolvedManualGeneral.hasSpecificDiscipline === false &&
          resolvedManualGeneral.disciplineLabel === 'General o multidisciplinario',
        `El modo manual "general" no debe filtrar la asignatura heredada; obtuvo: ${resolvedManualGeneral.disciplineLabel}`
      );

      const promptGeneral = buildContextualDefinitionPrompt({
        name: 'Sistema',
        subject: 'General o multidisciplinario',
        academicContext: {
          areaId: 'general',
          disciplineLabel: 'General o multidisciplinario',
          source: 'global_profile',
          mode: 'auto',
        },
      });

      assertCondition(
        !promptGeneral.includes('especialista en General') &&
          !promptGeneral.includes('marco teórico de General') &&
          promptGeneral.includes('General o multidisciplinario'),
        'El prompt general no debe contener frases contradictorias como "especialista en General" ni "marco teórico de General"'
      );

      const parsedGeneral = parseAndValidateDefinitionResponse(
        JSON.stringify({
          academicDefinition:
            'Conjunto organizado de elementos interdependientes que interactúan entre sí conforme a determinadas reglas o relaciones estructurales para conformar una totalidad funcional.',
          plainExplanation:
            'Se refiere a cualquier grupo de partes conectadas donde el funcionamiento del conjunto depende de cómo se relacionan sus componentes; para precisar su sentido técnico conviene indicar si se analiza desde la biología, la informática, la psicología o las ciencias sociales.',
          illustrativeExample:
            'Un ecosistema natural en biología, un sistema operativo en computación o el sistema familiar en ciencias sociales.',
          academicField: 'General o multidisciplinario',
        }),
        {
          termName: 'Sistema',
          defaultAcademicField: resolvedGeneralCareer.disciplineLabel,
          hasSpecificDiscipline: resolvedGeneralCareer.hasSpecificDiscipline,
          hasContextualEvidence: resolvedGeneralCareer.hasContextualEvidence,
        }
      );

      assertCondition(
        parsedGeneral.academicField === 'General o multidisciplinario',
        `Se esperaba academicField="General o multidisciplinario", se obtuvo "${parsedGeneral.academicField}"`
      );
    }
  );

  // CD-10: Término ambiguo con contexto insuficiente acepta respuesta prudente y no inventa disciplina única
  await runTest(
    'CD-10',
    'Un término ambiguo con contexto insuficiente acepta una respuesta prudente que reconoce múltiples acepciones sin imponer una disciplina única arbitraria',
    () => {
      const resolvedAmbiguous = resolveDefinitionPromptContext({
        name: 'Inhibición',
        context: 'Término añadido manualmente por el estudiante.',
        subject: 'General',
        academicContext: {
          areaId: 'general',
          disciplineLabel: 'General',
          source: 'multidisciplinary_ambiguous',
          mode: 'auto',
        },
      });

      // Respuesta prudente del modelo ante un término polisémico sin contexto, pero donde el modelo intentó poner una disciplina única en academicField
      const prudentAmbiguousJson = JSON.stringify({
        academicDefinition:
          'Concepto polisémico que designa la detención, disminución o bloqueo de un proceso, función o conducta. Según la disciplina: en psicología y neurociencia alude al control ejecutivo o sináptico que frena una respuesta; en bioquímica refiere a la reducción de la velocidad de una reacción enzimática; y en derecho procesal designa la abstención de un juez o funcionario.',
        plainExplanation:
          'Consiste en frenar o impedir que una acción, proceso mental o reacción química siga su curso habitual. Existen varias acepciones académicas plausibles según la materia donde se emplee el término.',
        illustrativeExample:
          'En psicología cognitiva, frenar la lectura automática en el test de Stroop; en bioquímica, un inhibidor competitivo que se une al sitio activo de una enzima.',
        academicField: 'Psicología Cognitiva',
      });

      const parsed = parseAndValidateDefinitionResponse(prudentAmbiguousJson, {
        termName: 'Inhibición',
        defaultAcademicField: resolvedAmbiguous.disciplineLabel,
        hasSpecificDiscipline: resolvedAmbiguous.hasSpecificDiscipline,
        hasContextualEvidence: resolvedAmbiguous.hasContextualEvidence,
      });

      assertCondition(
        parsed.academicField === 'General o multidisciplinario',
        `Ante término ambiguo sin disciplina ni contexto, no debe inventar una disciplina única ('${parsed.academicField}'), sino mantener 'General o multidisciplinario'`
      );
      assertCondition(
        parsed.academicDefinition.includes('polisémico') &&
          parsed.plainExplanation.includes('acepciones'),
        'Debe conservar íntegra la explicación prudente de ambigüedad'
      );
    }
  );

  // CD-11: Diagnóstico por etapa (request_validation, model_invocation, json_parse, payload_validation) y ausencia de TDZ en reintentos
  await runTest(
    'CD-11',
    'El flujo de resiliencia registra diagnósticos seguros por etapa y entrega termName en cada reintento sin errores de referencia',
    async () => {
      const capturedDiagnostics: DefinitionAttemptDiagnostic[] = [];
      const observedTermsInCallback: string[] = [];

      const result = await generateContextualDefinitionWithResilience(
        {
          name: 'Inhibición',
          subject: 'General o multidisciplinario',
          academicContext: {
            areaId: 'general',
            disciplineLabel: 'General o multidisciplinario',
            source: 'global_profile',
            mode: 'auto',
          },
        },
        async ({ attempt, termName, areaId }) => {
          observedTermsInCallback.push(`${termName}::${areaId}::${attempt}`);
          if (attempt === 1) {
            const apiErr = new Error(
              '503 Service Unavailable (apiKey=secreto1234567890 AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz12345)'
            ) as Error & { status?: number };
            apiErr.status = 503;
            throw apiErr;
          }
          if (attempt === 2) {
            return '{ json malformado sin cierre';
          }
          if (attempt === 3) {
            return JSON.stringify({
              academicDefinition: 'Inhibición',
              plainExplanation: 'Explicación demasiado corta',
              illustrativeExample: 'Ejemplo corto',
              academicField: 'General o multidisciplinario',
            });
          }
          return JSON.stringify({
            academicDefinition:
              'Proceso de restricción, suspensión o modulación de una actividad o respuesta dentro de un sistema biológico, cognitivo o institucional.',
            plainExplanation:
              'Consiste en frenar, bloquear o reducir una respuesta o actividad; su alcance exacto depende de si se aplica en psicología, bioquímica o derecho.',
            illustrativeExample:
              'Frenar una respuesta impulsiva en psicología o disminuir la actividad de una enzima en bioquímica.',
            academicField: 'General o multidisciplinario',
          });
        },
        {
          retryDelayMs: 0,
          onDiagnostic: (diag) => capturedDiagnostics.push(diag),
        }
      );

      assertCondition(
        observedTermsInCallback.length === 4 &&
          observedTermsInCallback.every((entry) => entry.startsWith('Inhibición::general::')),
        `El callback debe recibir termName y areaId válidos en todos los intentos: ${observedTermsInCallback.join(', ')}`
      );
      assertCondition(
        capturedDiagnostics.length === 3 &&
          capturedDiagnostics[0].stage === 'model_invocation' &&
          capturedDiagnostics[1].stage === 'json_parse' &&
          capturedDiagnostics[2].stage === 'payload_validation',
        `Las etapas diagnosticadas deben ser model_invocation -> json_parse -> payload_validation; obtuvo: ${capturedDiagnostics.map((d) => d.stage).join(' -> ')}`
      );
      assertCondition(
        !capturedDiagnostics[0].reason.includes('secreto1234567890') &&
          !capturedDiagnostics[0].reason.includes('AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz12345') &&
          sanitizeDiagnosticReason('key=abcd12345678').includes('REDACTED'),
        'El diagnóstico debe ocultar claves o tokens sensibles en los mensajes de error'
      );
      assertCondition(
        result.definition.academicField === 'General o multidisciplinario',
        'El resultado recuperado en el cuarto intento debe conservar el área general'
      );

      // Clasificación de request_validation cuando el término está vacío
      let emptyTermErr: unknown = null;
      try {
        await generateContextualDefinitionWithResilience(
          { name: '   ' },
          async () => '{}'
        );
      } catch (e) {
        emptyTermErr = e;
      }
      const classifiedEmpty = classifyDefinitionError(emptyTermErr);
      assertCondition(
        classifiedEmpty.stage === 'request_validation' &&
          classifiedEmpty.kind === 'INVALID_REQUEST' &&
          classifiedEmpty.statusCode === 400,
        `Un término vacío debe clasificarse en stage=request_validation con HTTP 400; obtuvo: ${JSON.stringify(classifiedEmpty)}`
      );
    }
  );

  // CD-12: Detección estructural de frases incompletas y metadiscurso excesivo (incluyendo los dos casos observados en Fase 4.3)
  await runTest(
    'CD-12',
    'Rechaza frases incompletas y metadiscurso excesivo ("Dado que el término carece...", "Para un estudiante universitario, entender el humanismo...") y protege la caché previa',
    async () => {
      // 1. Los dos ejemplos observados (tanto con puntos suspensivos como cerrados con punto)
      const example1Ellipsis =
        'Dado que el término carece de un contexto disciplinar específico en el apunte…';
      const example1PeriodFragment =
        'Dado que el término carece de un contexto disciplinar específico en el apunte.';
      const example1WithClause =
        'Dado que el término carece de un contexto disciplinar específico en el apunte, se presenta una aproximación general.';
      const example2Ellipsis = 'Para un estudiante universitario, entender el humanismo…';
      const example2InfinitiveFragment =
        'Para un estudiante universitario, entender el humanismo como una corriente cultural del Renacimiento.';
      const danglingPreposition =
        'Corriente filosófica e intelectual surgida en el Renacimiento que se caracteriza por la';

      assertCondition(
        isIncompleteOrTruncatedSentence(example1Ellipsis) === true &&
          isIncompleteOrTruncatedSentence(example1PeriodFragment) === true &&
          isIncompleteOrTruncatedSentence(example2Ellipsis) === true &&
          isIncompleteOrTruncatedSentence(example2InfinitiveFragment) === true &&
          isIncompleteOrTruncatedSentence(danglingPreposition) === true,
        'isIncompleteOrTruncatedSentence debe detectar cortes con puntos suspensivos, fragmentos subordinados/infinitivos sin verbo principal y preposiciones colgantes'
      );

      assertCondition(
        hasExcessiveMetadiscourse(example1Ellipsis, 'definition') === true &&
          hasExcessiveMetadiscourse(example1WithClause, 'definition') === true &&
          hasExcessiveMetadiscourse(example2Ellipsis, 'explanation') === true &&
          hasExcessiveMetadiscourse(example2InfinitiveFragment, 'explanation') === true,
        'hasExcessiveMetadiscourse debe rechazar introducciones metadiscursivas sobre la falta de contexto o muletillas dirigidas al estudiante'
      );

      // 2. El flujo con resiliencia rechaza una primera respuesta con metadiscurso/frase incompleta y regenera hasta obtener una definición directa
      let attempts = 0;
      const regenerated = await generateContextualDefinitionWithResilience(
        {
          name: 'Humanismo',
          subject: 'General o multidisciplinario',
        },
        async ({ attempt }) => {
          attempts = attempt;
          if (attempt === 1) {
            return JSON.stringify({
              academicDefinition: example1WithClause,
              plainExplanation: example2Ellipsis,
              illustrativeExample:
                'El estudio de los clásicos grecolatinos por Petrarca y Erasmo de Róterdam.',
              academicField: 'General o multidisciplinario',
            });
          }
          return JSON.stringify({
            academicDefinition:
              'Corriente intelectual, filosófica y cultural que sitúa al ser humano, su dignidad y su capacidad racional como eje del conocimiento y la ética. En filosofía e historia designa el movimiento renacentista europeo, mientras que en psicología refiere al enfoque centrado en la autorrealización.',
            plainExplanation:
              'Consiste en una postura que prioriza el valor, la agencia y el desarrollo integral de las personas frente a visiones dogmáticas o puramente mecanicistas.',
            illustrativeExample:
              'En historia cultural, la recuperación de textos clásicos en el Renacimiento; en psicología, la terapia centrada en la persona de Carl Rogers.',
            academicField: 'General o multidisciplinario',
          });
        },
        { retryDelayMs: 0 }
      );

      assertCondition(
        attempts === 2 &&
          regenerated.definition.academicDefinition.startsWith('Corriente intelectual'),
        `Debe rechazar el intento 1 con metadiscurso y aceptar el intento 2 directo (attempts=${attempts})`
      );

      // 3. No se guarda en analysisCache ni sustituye una definición válida previa
      const validPrevious: CachedAnalysisEntity = {
        termKey: 'humanismo::general',
        termName: 'Humanismo',
        academicField: 'General o multidisciplinario',
        academicDefinition:
          'Corriente intelectual y filosófica que sitúa al ser humano y su dignidad como eje del pensamiento ético y cultural.',
        plainExplanation:
          'Postura que destaca la autonomía, la razón y el desarrollo integral de las personas.',
        illustrativeExample:
          'El pensamiento renacentista de Erasmo o la psicología humanista de Rogers.',
        sources: [],
        verificationStatus: 'no_verificado',
        queryStatus: 'sin_verificar',
        queriesConsulted: ['Humanismo'],
        groundingUsed: false,
        analyzedAt: 1700000000000,
      };

      const defectiveCandidate: CachedAnalysisEntity = {
        ...validPrevious,
        academicDefinition: example1WithClause,
        plainExplanation: example2InfinitiveFragment,
        analyzedAt: 1700000090000,
      };

      assertCondition(
        isValidCacheAnalysisEntry(defectiveCandidate) === false &&
          prepareSafeCacheEntryToSave(validPrevious, defectiveCandidate, 'General') === null,
        'analysisCache debe rechazar definiciones con metadiscurso o frases incompletas y proteger la definición válida previa'
      );
    }
  );

  // CD-13: Fase 4.3 Search/Grounding — Diferencia entre encontrar fuentes y verificar una afirmación, y estados de verificación honestos
  await runTest(
    'CD-13',
    'Search/Grounding diferencia entre encontrar fuentes (no_verificado + fuentes_consultadas) y verificar una afirmación (verificado/discrepancia/no_verificado)',
    () => {
      const sampleMeta = {
        groundingChunks: [
          {
            web: {
              uri: 'https://plato.stanford.edu/entries/humanism/',
              title: 'Stanford Encyclopedia of Philosophy - Humanism',
            },
          },
          {
            web: {
              uri: 'https://apa.org/topics/humanistic-psychology',
              title: 'APA - Humanistic Psychology',
            },
          },
        ],
        groundingSupports: [
          {
            groundingChunkIndices: [0],
            segment: {
              text: 'Corriente filosófica que sitúa la agencia y dignidad humana en el centro.',
            },
          },
        ],
        webSearchQueries: ['humanismo filosofia psicologia'],
      };

      const extracted = extractGroundingSourcesAndSegments(sampleMeta);
      assertCondition(
        extracted.uniqueSources.length === 2 && extracted.supportedSegments.length === 1,
        'Debe extraer las 2 fuentes web válidas y el segmento respaldado'
      );

      // 1. Modalidad B (Buscar fuentes): aunque existan 2 fuentes web, verificationStatus NUNCA es 'verificado'
      const searchOutcome = resolveSearchSourcesOutcome({
        uniqueSources: extracted.uniqueSources,
        searchPerformed: true,
      });
      assertCondition(
        searchOutcome.verificationStatus === 'no_verificado' &&
          searchOutcome.queryStatus === 'fuentes_consultadas' &&
          searchOutcome.groundingUsed === false,
        `Modalidad B no debe marcar 'verificado' solo por encontrar enlaces: ${JSON.stringify(searchOutcome)}`
      );

      // 2. El parser de Search/Grounding tiene por defecto 'no_verificado' (nunca 'verificado' por omisión)
      const parsedDefaultStatus = parseAndValidateSearchGroundingResponse(
        `academicDefinition: Corriente filosófica e histórica que sitúa al ser humano como centro de la reflexión ética.
plainExplanation: Consiste en valorar la razón, la autonomía y la dignidad humana en la cultura y la ciencia.
illustrativeExample: El movimiento humanista del Renacimiento europeo encabezado por Erasmo de Róterdam.
academicField: Humanidades y filosofía`,
        { termName: 'Humanismo', defaultAcademicField: 'Humanidades y filosofía' }
      );
      assertCondition(
        parsedDefaultStatus.reportedStatus === 'no_verificado',
        `Si el modelo no declara verificationStatus explícito, debe ser 'no_verificado', obtuvo '${parsedDefaultStatus.reportedStatus}'`
      );

      // 3. Modalidad C (Grounding): fuentes encontradas pero NO respaldan la afirmación -> verificationStatus: 'no_verificado'
      const unverifiedGrounding = resolveVerifyGroundingOutcome({
        uniqueSources: extracted.uniqueSources,
        supportedSegments: [],
        reportedStatus: 'no_verificado',
        rawText: 'No se pudo verificar la afirmación específica con las fuentes recuperadas.',
        searchPerformed: true,
      });
      assertCondition(
        unverifiedGrounding.verificationStatus === 'no_verificado' &&
          unverifiedGrounding.queryStatus === 'contrastado_web',
        `Cuando las fuentes no respaldan la afirmación, verificationStatus debe ser 'no_verificado': ${JSON.stringify(unverifiedGrounding)}`
      );

      // 4. Modalidad C (Grounding): sin fuentes web reales -> nunca puede quedar 'verificado' aunque el modelo lo afirme
      const noSourcesGrounding = resolveVerifyGroundingOutcome({
        uniqueSources: [],
        supportedSegments: [],
        reportedStatus: 'verificado',
        rawText: 'Definición verificada.',
        searchPerformed: true,
      });
      assertCondition(
        noSourcesGrounding.verificationStatus === 'no_verificado' &&
          noSourcesGrounding.queryStatus === 'sin_verificar' &&
          noSourcesGrounding.groundingUsed === false,
        `Sin fuentes web reales nunca debe marcarse como verificado: ${JSON.stringify(noSourcesGrounding)}`
      );

      // 5. Modalidad C (Grounding): discrepancia entre fuentes -> 'discrepancia'
      const discrepancyGrounding = resolveVerifyGroundingOutcome({
        uniqueSources: extracted.uniqueSources,
        supportedSegments: extracted.supportedSegments,
        reportedStatus: 'discrepancia',
        rawText: 'Existen discrepancias teóricas entre los autores consultados.',
        searchPerformed: true,
      });
      assertCondition(
        discrepancyGrounding.verificationStatus === 'discrepancia' &&
          discrepancyGrounding.queryStatus === 'contrastado_web',
        'Debe reportar verificationStatus="discrepancia" cuando hay contradicción entre fuentes'
      );

      // 6. Modalidad C (Grounding): fuentes reales + confirmación explícita -> 'verificado'
      const verifiedGrounding = resolveVerifyGroundingOutcome({
        uniqueSources: extracted.uniqueSources,
        supportedSegments: extracted.supportedSegments,
        reportedStatus: 'verificado',
        rawText: 'Concepto respaldado por las fuentes académicas consultadas.',
        searchPerformed: true,
      });
      assertCondition(
        verifiedGrounding.verificationStatus === 'verificado' &&
          verifiedGrounding.queryStatus === 'contrastado_web' &&
          verifiedGrounding.groundingUsed === true,
        'Debe reportar verificationStatus="verificado" cuando hay fuentes reales y confirmación explícita'
      );
    }
  );

  // CD-14: Fase 4.3 Search/Grounding — Mensajes de error que reflejan la causa real y prompts sin metadiscurso
  await runTest(
    'CD-14',
    'classifySearchGroundingError distingue cuota (429), alta demanda (503), herramienta no disponible (404/tool) y solicitud inválida (400)',
    () => {
      const quotaErr = classifySearchGroundingError(
        Object.assign(new Error('429 RESOURCE_EXHAUSTED: Quota exceeded for googleSearch'), {
          status: 429,
        }),
        'grounding'
      );
      assertCondition(
        quotaErr.statusCode === 429 &&
          quotaErr.message.includes('429') &&
          quotaErr.retryable === true,
        `Un error 429 debe clasificarse con código 429 y mensaje de cuota: ${quotaErr.message}`
      );

      const demandErr = classifySearchGroundingError(
        Object.assign(new Error('503 Service Unavailable: high demand'), { status: 503 }),
        'google_search'
      );
      assertCondition(
        demandErr.statusCode === 503 &&
          demandErr.message.includes('503') &&
          !demandErr.message.includes('429'),
        `Un error 503 debe reflejar alta demanda (503) y nunca cuota 429: ${demandErr.message}`
      );

      const toolNotFoundErr = classifySearchGroundingError(
        Object.assign(new Error('404 Model or tool googleSearch is not found'), { status: 404 }),
        'grounding'
      );
      assertCondition(
        toolNotFoundErr.statusCode === 502 &&
          toolNotFoundErr.kind === 'PERMANENT_ERROR' &&
          !toolNotFoundErr.message.includes('429'),
        `Un error 404/herramienta no soportada no debe disfrazarse como 429: ${toolNotFoundErr.message}`
      );

      const searchPrompt = buildSearchSourcesPrompt({
        name: 'Inhibición',
        subject: 'Psicología Cognitiva',
      });
      const groundingPrompt = buildVerifyGroundingPrompt({
        name: 'Inhibición',
        subject: 'Psicología Cognitiva',
      });
      assertCondition(
        searchPrompt.includes('PROHIBIDO empezar con "Dado que el término carece de contexto..."') &&
          groundingPrompt.includes('DIFERENCIA ENTRE ENCONTRAR FUENTES Y VERIFICAR UNA AFIRMACIÓN'),
        'Los prompts de Search y Grounding deben incluir las reglas contra metadiscurso y la distinción entre encontrar fuentes y verificar afirmaciones'
      );
    }
  );

  // CD-15: 429 en modelo principal conmuta de inmediato al modelo alternativo (Stage B)
  await runTest(
    'CD-15',
    'Stage B: Ante 429 en modelo principal no repite de inmediato y conmuta al alternativo (exactamente 2 llamadas)',
    async () => {
      const calls: Array<{ model: string; attempt: number }> = [];

      const res = await generateContextualDefinitionWithResilience(
        {
          name: 'Atención selectiva',
          subject: 'Psicología Cognitiva',
        },
        async ({ model, attempt }) => {
          calls.push({ model, attempt });
          if (model === DEFINITION_PRIMARY_MODEL) {
            const err = new Error('429 RESOURCE_EXHAUSTED: Daily quota exceeded') as Error & {
              status?: number;
            };
            err.status = 429;
            throw err;
          }
          return JSON.stringify({
            academicDefinition:
              'Capacidad cognitiva para enfocar el procesamiento mental en un estímulo específico mientras se ignoran distractores ambientales.',
            plainExplanation:
              'Permite concentrarse en una sola conversación o tarea ignorando los ruidos o interrupciones de alrededor.',
            illustrativeExample:
              'El efecto fiesta de cóctel donde una persona puede seguir una conversación en una sala llena de ruido.',
            academicField: 'Psicología Cognitiva',
          });
        },
        { retryDelayMs: 0 }
      );

      assertCondition(
        calls.length === 2 &&
          calls[0].model === DEFINITION_PRIMARY_MODEL &&
          calls[1].model === DEFINITION_FALLBACK_MODEL &&
          res.modelUsed === DEFINITION_FALLBACK_MODEL &&
          res.definition.academicDefinition.includes('Capacidad cognitiva'),
        `Se esperaban exactamente 2 llamadas (1 en primario, 1 en alternativo); se hicieron ${calls.length}: ${JSON.stringify(calls)}`
      );
    }
  );

  // CD-16: 429 en modelo principal y 429 en modelo alternativo: detención inmediata sin llamadas redundantes
  await runTest(
    'CD-16',
    'Stage B: Ante 429 en ambos modelos se detienen de inmediato los reintentos (exactamente 2 llamadas totales)',
    async () => {
      const calls: Array<{ model: string; attempt: number }> = [];
      let caughtError: ConceptDefinitionError | null = null;

      try {
        await generateContextualDefinitionWithResilience(
          {
            name: 'Atención selectiva',
            subject: 'Psicología Cognitiva',
          },
          async ({ model, attempt }) => {
            calls.push({ model, attempt });
            const err = new Error('429 RESOURCE_EXHAUSTED: Rate limit exceeded') as Error & {
              status?: number;
            };
            err.status = 429;
            throw err;
          },
          { maxAttemptsPerModel: 2, retryDelayMs: 0 }
        );
      } catch (err) {
        if (err instanceof ConceptDefinitionError) {
          caughtError = err;
        }
      }

      assertCondition(
        calls.length === 2 &&
          calls[0].model === DEFINITION_PRIMARY_MODEL &&
          calls[1].model === DEFINITION_FALLBACK_MODEL &&
          caughtError !== null &&
          caughtError.statusCode === 429,
        `Ante 429 en ambos modelos deben realizarse exactamente 2 llamadas y detenerse; se hicieron ${calls.length}: ${JSON.stringify(calls)}`
      );
    }
  );

  // CD-17: Timeout y error 400 permanente en definiciones contextuales
  await runTest(
    'CD-17',
    'Stage B: 400 permanente falla de inmediato en 1 sola llamada y timeout se clasifica como 504 con category=timeout',
    async () => {
      let permanentCalls = 0;
      let caught400: ConceptDefinitionError | null = null;

      try {
        await generateContextualDefinitionWithResilience(
          {
            name: 'Memoria episódica',
            subject: 'Psicología',
          },
          async () => {
            permanentCalls++;
            const err = new Error('400 INVALID_ARGUMENT: Invalid parameter payload') as Error & {
              status?: number;
            };
            err.status = 400;
            throw err;
          },
          { retryDelayMs: 0 }
        );
      } catch (err) {
        if (err instanceof ConceptDefinitionError) {
          caught400 = err;
        }
      }

      assertCondition(
        permanentCalls === 1 &&
          caught400 !== null &&
          caught400.statusCode === 400 &&
          caught400.retryable === false,
        `Un error 400 debe fallar inmediatamente tras 1 intento; llamadas=${permanentCalls}`
      );

      // Verificación de timeout en classifyDefinitionError
      const timeoutErr = classifyDefinitionError(
        Object.assign(new Error('504 DEADLINE_EXCEEDED: Deadline exceeded'), { status: 504 })
      );
      assertCondition(
        timeoutErr.statusCode === 504 &&
          timeoutErr.category === 'timeout' &&
          timeoutErr.message.toLowerCase().includes('timeout'),
        `Timeout debe clasificarse con HTTP 504 y category=timeout: ${JSON.stringify(timeoutErr)}`
      );
    }
  );

  // CD-18: Search/Grounding: clasificación precisa de causas de cuota y no repetición de modelos agotados
  await runTest(
    'CD-18',
    'Search/Grounding: classifySearchGroundingError clasifica honestamente cuota agotada vs límite temporal vs 429 genérico',
    () => {
      // 1. Cuota agotada
      const quotaExhaustedErr = classifySearchGroundingError(
        Object.assign(new Error('429 RESOURCE_EXHAUSTED: quota exceeded for billing account (free tier)'), {
          status: 429,
        }),
        'google_search'
      );
      assertCondition(
        quotaExhaustedErr.category === 'quota_exhausted' &&
          quotaExhaustedErr.statusCode === 429 &&
          quotaExhaustedErr.message.toLowerCase().includes('cuota de uso'),
        `Debe clasificar cuota agotada: ${JSON.stringify(quotaExhaustedErr)}`
      );

      // 2. Límite temporal de solicitudes
      const rateLimitErr = classifySearchGroundingError(
        Object.assign(new Error('429 RESOURCE_EXHAUSTED: requests per minute rate limit exceeded'), {
          status: 429,
        }),
        'grounding'
      );
      assertCondition(
        rateLimitErr.category === 'rate_limit' &&
          rateLimitErr.statusCode === 429 &&
          rateLimitErr.message.toLowerCase().includes('límite temporal'),
        `Debe clasificar límite temporal de solicitudes: ${JSON.stringify(rateLimitErr)}`
      );

      // 3. 429 genérico
      const generic429Err = classifySearchGroundingError(
        Object.assign(new Error('429 RESOURCE_EXHAUSTED'), { status: 429 }),
        'google_search'
      );
      assertCondition(
        generic429Err.category === 'unspecified_429' &&
          generic429Err.statusCode === 429 &&
          generic429Err.message.includes('Límite de solicitudes o cuota'),
        `Debe clasificar 429 genérico sin afirmar causa desconocida: ${JSON.stringify(generic429Err)}`
      );
    }
  );

  // CD-19: 429 en modelo principal seguido de 503 en alternativo en definiciones contextuales (3 llamadas totales)
  await runTest(
    'CD-19',
    'Stage B: 429 en modelo principal seguido de 503 en el alternativo permite reintento en el alternativo y se recupera en 3 llamadas totales',
    async () => {
      const calls: Array<{ model: string; attempt: number }> = [];

      const res = await generateContextualDefinitionWithResilience(
        {
          name: 'Habituación',
          subject: 'Psicología',
        },
        async ({ model, attempt }) => {
          calls.push({ model, attempt });
          if (attempt === 1) {
            const err = new Error('429 RESOURCE_EXHAUSTED: daily limit') as Error & {
              status?: number;
            };
            err.status = 429;
            throw err;
          }
          if (attempt === 2) {
            const err = new Error('503 Service Unavailable: server overloaded') as Error & {
              status?: number;
            };
            err.status = 503;
            throw err;
          }
          return JSON.stringify({
            academicDefinition:
              'Forma no asociativa de aprendizaje consistente en la disminución de una respuesta innata tras la presentación repetida de un estímulo inocuo.',
            plainExplanation:
              'Ocurre cuando nos acostumbramos a un estímulo constante, como el tictac de un reloj, y dejamos de prestarle atención.',
            illustrativeExample:
              'Dejar de percibir el sonido del tráfico tras vivir varias semanas en una avenida concurrida.',
            academicField: 'Psicología',
          });
        },
        { retryDelayMs: 0 }
      );

      assertCondition(
        calls.length === 3 &&
          calls[0].model === DEFINITION_PRIMARY_MODEL &&
          calls[1].model === DEFINITION_FALLBACK_MODEL &&
          calls[2].model === DEFINITION_FALLBACK_MODEL &&
          res.modelUsed === DEFINITION_FALLBACK_MODEL &&
          res.definition.academicDefinition.includes('aprendizaje'),
        `Se esperaban exactamente 3 llamadas (1 en primario por 429, 2 en alternativo por 503 recuperado); llamadas=${JSON.stringify(calls)}`
      );
    }
  );

  return results;
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some((arg) => arg.replace(/\\/g, '/').endsWith('conceptDefiner.test.ts'));

if (isDirectExecution) {
  runConceptDefinerTestSuite().then((results) => {
    let failed = 0;
    console.log(
      '=== Nexo Notes: Suite de Pruebas de Definiciones Académicas (Fase 4.2) ==='
    );
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
