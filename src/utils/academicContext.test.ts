/**
 * Pruebas unitarias deterministas del Motor de Contexto Académico (Fase 1 + Correcciones de Auditoría H-01 a H-06)
 * Ejecutable directamente con `bun run src/utils/academicContext.test.ts`
 * y compatible con `bun run lint` (`tsc --noEmit`) sin dependencias adicionales.
 */

import { AcademicProfile, AppPreferences, NoteEntity } from '../types/models';
import {
  ACADEMIC_AREA_CATALOG,
  ACADEMIC_AREAS_LIST,
  buildAnalysisCacheKey,
  buildInitialNoteEntity,
  buildUpdatedPreferencesOnSkipOnboarding,
  buildUpdatedPreferencesWithProfile,
  getNoteAcademicSummary,
  inferNoteDiscipline,
  parseAcademicAreaId,
  resolveAcademicContext,
  sanitizeAppPreferences,
  setNoteAcademicMode,
  shouldShowAcademicOnboarding,
  syncNoteAcademicContext,
} from './academicContext';

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

export function runAcademicContextUnitTests(): TestResult[] {
  const results: TestResult[] = [];

  const runCase = (id: string, name: string, fn: () => string) => {
    try {
      const details = fn();
      results.push({ id, name, passed: true, details });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id, name, passed: false, details: msg });
    }
  };

  // Caso 0: Verificación de catálogo de 9 áreas y limpieza de espacios (H-06)
  runCase('0', 'Catálogo incluye las 9 áreas oficiales sin espacios residuales en términos (H-06)', () => {
    assertCondition(ACADEMIC_AREAS_LIST.length === 9, `Se esperaban 9 áreas, se encontraron ${ACADEMIC_AREAS_LIST.length}`);
    for (const area of ACADEMIC_AREAS_LIST) {
      for (const term of [...area.anchorTerms, ...area.contextualTerms, ...area.aliases]) {
        assertCondition(
          term === term.trim(),
          `El término "${term}" en ${area.id} contiene espacios iniciales o finales`
        );
      }
    }
    return `9 áreas verificadas y 0 términos con espacios residuales`;
  });

  // Caso 1: Contenido claramente psicológico se detecta como Psicología
  runCase('1', 'Apunte con contenido claramente psicológico se detecta como Psicología', () => {
    const inference = inferNoteDiscipline({
      title: 'Procesos de memoria de trabajo y terapia cognitivo conductual',
      content:
        'En la evaluación neuropsicológica se analizan las funciones ejecutivas, la disonancia cognitiva y el condicionamiento operante según Beck y Skinner.',
      subject: 'Psicología Cognitiva',
      tags: ['psicoterapia', 'cognición'],
    });

    assertCondition(inference.detectedArea === 'psicologia', `Detectado: ${inference.detectedArea}`);
    assertCondition(inference.confidence === 'high', `Evidencia esperada 'high', obtenida: ${inference.confidence}`);
    assertCondition(!inference.isAmbiguous, 'No debería marcarse como ambiguo');
    return `detectedArea=${inference.detectedArea}, confidence=${inference.confidence}, matchedTerms=${inference.matchedTerms.length}`;
  });

  // Caso 2: Microservicios, APIs y arquitectura de software -> Ingeniería y tecnología, aunque perfil global sea Psicología
  runCase(
    '2',
    'Apunte sobre microservicios, APIs y arquitectura de software se detecta como Ingeniería y tecnología aunque el perfil global sea Psicología',
    () => {
      const psychologyProfile: AcademicProfile = {
        primaryArea: 'psicologia',
        career: 'Licenciatura en Psicología',
        specialty: 'Psicología Clínica',
        updatedAt: Date.now(),
      };

      const softwareNote: Partial<NoteEntity> = {
        title: 'Diseño de microservicios y arquitectura de software distribuida',
        content:
          'La comunicación entre microservicios mediante REST API, endpoints HTTP, contenedores Docker y balanceadores de carga mejora la escalabilidad del backend.',
        subject: 'Psicología Cognitiva',
        disciplineMode: 'auto',
      };

      const resolved = resolveAcademicContext({
        note: softwareNote,
        academicProfile: psychologyProfile,
      });

      assertCondition(
        resolved.areaId === 'ingenieria_tecnologia',
        `Se esperaba 'ingenieria_tecnologia', se obtuvo '${resolved.areaId}'`
      );
      assertCondition(resolved.source === 'note_auto', `Origen esperado 'note_auto', obtenido '${resolved.source}'`);
      assertCondition(
        resolved.confidence === 'high',
        `Evidencia esperada 'high', obtenida '${resolved.confidence}'`
      );
      return `areaId=${resolved.areaId} (${resolved.disciplineLabel}), source=${resolved.source}, confidence=${resolved.confidence}`;
    }
  );

  // Caso 3: Kant, epistemología y metafísica -> Humanidades y filosofía
  runCase('3', 'Apunte sobre Kant, epistemología y metafísica se detecta como Humanidades y filosofía', () => {
    const inference = inferNoteDiscipline({
      title: 'Crítica de la razón pura y el giro copernicano en Kant',
      content:
        'Análisis de la epistemología moderna, la metafísica, el idealismo trascendental y el imperativo categórico dentro de la ética deontológica.',
    });

    assertCondition(
      inference.detectedArea === 'humanidades_filosofia',
      `Se esperaba 'humanidades_filosofia', se obtuvo '${inference.detectedArea}'`
    );
    assertCondition(inference.confidence === 'high', `Evidencia esperada 'high', obtenida '${inference.confidence}'`);
    return `detectedArea=${inference.detectedArea} (${inference.disciplineLabel}), confidence=${inference.confidence}`;
  });

  // Caso 4: Un texto demasiado breve no recibe una clasificación de alta confianza
  runCase('4', 'Un texto demasiado breve no recibe una clasificación de alta confianza', () => {
    const briefInference = inferNoteDiscipline({
      title: 'Kant',
      content: 'Epistemología básica.',
    });

    assertCondition(
      briefInference.confidence !== 'high',
      `Un texto de 3 palabras no debe recibir 'high', obtuvo '${briefInference.confidence}'`
    );
    return `Texto breve (3 palabras) -> confidence=${briefInference.confidence}, detectedArea=${briefInference.detectedArea}`;
  });

  // Caso 5: El contexto explícito de una consulta de una sola disciplina prevalece sobre la disciplina fijada en la nota
  runCase(
    '5',
    'El contexto explícito de una consulta de una sola disciplina prevalece sobre la disciplina manual de la nota sin mutarla',
    () => {
      const note: Partial<NoteEntity> = {
        title: 'Terapia centrada en el cliente de Carl Rogers',
        content:
          'El enfoque de la psicología humanista y la autorrealización de Abraham Maslow dentro de la psicoterapia clínica.',
        disciplineMode: 'manual',
        manualDiscipline: 'psicologia',
      };

      const resolved = resolveAcademicContext({
        queryOverride: {
          instruction: 'Explícalo desde la filosofía renacentista',
        },
        note,
        academicProfile: {
          primaryArea: 'psicologia',
          updatedAt: Date.now(),
        },
      });

      assertCondition(
        resolved.source === 'query_override',
        `Origen esperado 'query_override', obtenido '${resolved.source}'`
      );
      assertCondition(
        resolved.areaId === 'humanidades_filosofia',
        `Área esperada 'humanidades_filosofia', obtenida '${resolved.areaId}'`
      );
      assertCondition(resolved.confidence === 'high', `Confianza esperada 'high', obtenida '${resolved.confidence}'`);
      assertCondition(resolved.isAmbiguous === false, 'No debe ser ambiguo para una disciplina única explícita');
      assertCondition(
        note.manualDiscipline === 'psicologia',
        'La nota original no debe mutarse al aplicar un override temporal'
      );
      return `source=${resolved.source}, areaId=${resolved.areaId}, queryInstruction="${resolved.queryInstruction}"`;
    }
  );

  // Caso 6: La disciplina manual prevalece sobre la detección automática
  runCase('6', 'La disciplina manual prevalece sobre la detección automática', () => {
    const note: Partial<NoteEntity> = {
      title: 'Algoritmos, estructuras de datos y servidores backend',
      content:
        'Implementación de microservicios con Docker, Kubernetes y bases de datos distribuidas en ingeniería de software.',
      disciplineMode: 'manual',
      manualDiscipline: 'economia_negocios_derecho',
    };

    const resolved = resolveAcademicContext({
      note,
      academicProfile: { primaryArea: 'psicologia', updatedAt: Date.now() },
    });

    assertCondition(resolved.source === 'note_manual', `Origen esperado 'note_manual', obtenido '${resolved.source}'`);
    assertCondition(
      resolved.areaId === 'economia_negocios_derecho',
      `Área esperada 'economia_negocios_derecho', obtenida '${resolved.areaId}'`
    );
    assertCondition(resolved.confidence === 'high', `Confianza esperada 'high', obtenida '${resolved.confidence}'`);
    return `source=${resolved.source}, areaId=${resolved.areaId} (${resolved.disciplineLabel}) prevalece sobre contenido de ingeniería`;
  });

  // Caso 7: Una nota automática cambia de disciplina al cambiar sustancialmente su contenido
  runCase('7', 'Una nota en modo automático cambia de disciplina al cambiar sustancialmente su contenido', () => {
    const editableNote: Partial<NoteEntity> = {
      title: 'Condicionamiento operante y psicopatología',
      content:
        'Estudio de la terapia cognitivo conductual, mecanismos de defensa, neuropsicología y funciones ejecutivas.',
      disciplineMode: 'auto',
    };

    const firstResolution = resolveAcademicContext({ note: editableNote });
    assertCondition(
      firstResolution.areaId === 'psicologia',
      `Primera resolución esperaba 'psicologia', obtuvo '${firstResolution.areaId}'`
    );

    editableNote.title = 'Derecho constitucional, jurisprudencia y política monetaria';
    editableNote.content =
      'Análisis del debido proceso, la tutela jurisdiccional, normas jurídicas, inflación y producto interno bruto según Keynes y Kelsen.';

    const secondResolution = resolveAcademicContext({ note: editableNote });
    assertCondition(
      secondResolution.areaId === 'economia_negocios_derecho',
      `Segunda resolución esperaba 'economia_negocios_derecho', obtuvo '${secondResolution.areaId}'`
    );
    assertCondition(secondResolution.source === 'note_auto', 'El origen debe seguir siendo note_auto');
    return `Transición verificada: ${firstResolution.areaId} -> ${secondResolution.areaId} (${secondResolution.confidence})`;
  });

  // Caso 8: El perfil general o multidisciplinario no impone una disciplina concreta
  runCase('8', 'El perfil general o multidisciplinario no impone una disciplina concreta', () => {
    const generalProfile: AcademicProfile = {
      primaryArea: 'general',
      updatedAt: Date.now(),
    };

    const ambiguousNote: Partial<NoteEntity> = {
      title: 'Notas de lectura introductoria',
      content: 'Resumen general de conceptos vistos durante la primera sesión del semestre.',
      disciplineMode: 'auto',
    };

    const resolved = resolveAcademicContext({
      note: ambiguousNote,
      academicProfile: generalProfile,
    });

    assertCondition(resolved.areaId === 'general', `Se esperaba 'general', se obtuvo '${resolved.areaId}'`);
    assertCondition(
      resolved.source === 'multidisciplinary_ambiguous',
      `Se esperaba 'multidisciplinary_ambiguous', se obtuvo '${resolved.source}'`
    );
    assertCondition(resolved.isAmbiguous === true, 'Debe marcarse como ambiguo (isAmbiguous=true)');
    return `areaId=${resolved.areaId}, source=${resolved.source}, isAmbiguous=${resolved.isAmbiguous}`;
  });

  // Caso 9: «Humanismo» no se clasifica con alta confianza únicamente por la palabra aislada
  runCase('9', '«Humanismo» no se clasifica con alta confianza únicamente por la palabra aislada', () => {
    const isolatedHumanism = inferNoteDiscipline({
      title: 'Humanismo',
      content: 'Definición y concepto de humanismo.',
    });

    assertCondition(
      isolatedHumanism.confidence === 'low',
      `Se esperaba confianza 'low' para «Humanismo» aislado, se obtuvo '${isolatedHumanism.confidence}'`
    );
    assertCondition(
      isolatedHumanism.detectedArea === 'general',
      `Se esperaba área 'general' para «Humanismo» aislado, se obtuvo '${isolatedHumanism.detectedArea}'`
    );
    assertCondition(
      isolatedHumanism.isAmbiguous === true,
      '«Humanismo» aislado debe marcarse como ambiguo (isAmbiguous=true)'
    );
    return `detectedArea=${isolatedHumanism.detectedArea}, confidence=${isolatedHumanism.confidence}, isAmbiguous=${isolatedHumanism.isAmbiguous}`;
  });

  // Caso 10: La clave de caché diferencia disciplinas, colapsa prefijos conversacionales redundantes y conserva matices (H-05)
  runCase(
    '10',
    'La clave de caché diferencia disciplinas, colapsa prefijos redundantes y conserva matices adicionales (H-05)',
    () => {
      const keyPsych = buildAnalysisCacheKey('Humanismo', { areaId: 'psicologia' });
      const keyPhilDirect = buildAnalysisCacheKey('Humanismo', { areaId: 'humanidades_filosofia' });
      const keyPhilConversational1 = buildAnalysisCacheKey('Humanismo', {
        areaId: 'psicologia',
        queryInstruction: 'Explícalo desde la filosofía',
      });
      const keyPhilConversational2 = buildAnalysisCacheKey('Humanismo', {
        areaId: 'psicologia',
        queryInstruction: 'Desde la perspectiva de la filosofía.',
      });
      const keyPhilWithNuance = buildAnalysisCacheKey('Humanismo', {
        areaId: 'psicologia',
        queryInstruction: 'Explícalo desde la filosofía renacentista',
      });

      assertCondition(keyPsych !== keyPhilDirect, `Las disciplinas distintas no deben colisionar: ${keyPsych} vs ${keyPhilDirect}`);
      assertCondition(
        keyPhilDirect === keyPhilConversational1 && keyPhilDirect === keyPhilConversational2,
        `Prefijos conversacionales sin matiz adicional deben colapsar a la misma clave canónica: ${keyPhilDirect} vs ${keyPhilConversational1} vs ${keyPhilConversational2}`
      );
      assertCondition(
        keyPhilWithNuance !== keyPhilDirect && keyPhilWithNuance === 'humanismo::humanidades_filosofia::q_renacentista',
        `Instrucción con matiz adicional debe conservar el matiz: obtenida "${keyPhilWithNuance}"`
      );

      return `keyPsych="${keyPsych}", keyPhilCanonical="${keyPhilConversational1}", keyWithNuance="${keyPhilWithNuance}"`;
    }
  );

  // Caso 11 (H-01): Un único término compuesto no duplica ni triplica señales por sus palabras internas
  runCase(
    '11 (H-01)',
    'Un único término compuesto («ingeniería de software») cuenta como 1 sola señal y no declara confianza alta',
    () => {
      const singleCompound = inferNoteDiscipline({
        title: 'Apunte introductorio general sobre ingenieria de software',
      });

      assertCondition(
        singleCompound.matchedTerms.length === 1 && singleCompound.matchedTerms[0] === 'ingenieria de software',
        `Se esperaba 1 sola señal ['ingenieria de software'], se obtuvo: [${singleCompound.matchedTerms.join(', ')}]`
      );
      assertCondition(
        singleCompound.confidence === 'low',
        `No debe declarar 'high' ni 'medium' con 1 sola señal; obtuvo '${singleCompound.confidence}'`
      );
      return `matchedTerms=[${singleCompound.matchedTerms.join(', ')}], confidence=${singleCompound.confidence}, score=${singleCompound.scoresByArea.ingenieria_tecnologia}`;
    }
  );

  // Caso 12 (H-02): Instrucciones con negación y solicitudes comparativas entre disciplinas
  runCase(
    '12 (H-02)',
    'Instrucciones con negación resuelven a la disciplina afirmativa y solicitudes comparativas habilitan contexto multidisciplinario',
    () => {
      const negatedArea = parseAcademicAreaId('No lo expliques desde la psicología, explícalo desde la filosofía');
      assertCondition(
        negatedArea === 'humanidades_filosofia',
        `Ante negación de psicología y afirmación de filosofía se esperaba 'humanidades_filosofia', se obtuvo '${negatedArea}'`
      );

      const comparativeResolved = resolveAcademicContext({
        queryOverride: 'Compáralo entre la psicología y la filosofía',
        note: {
          title: 'Humanismo',
          disciplineMode: 'manual',
          manualDiscipline: 'psicologia',
        },
      });

      assertCondition(
        comparativeResolved.areaId === 'general' && comparativeResolved.isAmbiguous === true,
        `Solicitud comparativa debe resolver a areaId='general' e isAmbiguous=true; obtuvo areaId='${comparativeResolved.areaId}', isAmbiguous=${comparativeResolved.isAmbiguous}`
      );
      return `negated="${negatedArea}", comparative={areaId:${comparativeResolved.areaId}, isAmbiguous:${comparativeResolved.isAmbiguous}}`;
    }
  );

  // Caso 13 (H-03): Materia heredada 'Psicología Cognitiva' en subject y folderSubject sobre nota neutra
  runCase(
    '13 (H-03)',
    'subject y folderSubject heredados con «Psicología Cognitiva» no producen confianza alta ni sesgan una nota de contenido neutro',
    () => {
      const neutralWithLegacyDefaults = inferNoteDiscipline({
        title: 'Introducción general',
        content: 'Notas de la sesión inaugural del semestre académico sobre metodología.',
        subject: 'Psicología Cognitiva',
        folderSubject: 'Psicología Cognitiva',
      });

      assertCondition(
        neutralWithLegacyDefaults.detectedArea === 'general',
        `Se esperaba 'general' en nota neutra con subject heredado, se obtuvo '${neutralWithLegacyDefaults.detectedArea}'`
      );
      assertCondition(
        neutralWithLegacyDefaults.confidence === 'low',
        `Se esperaba confianza 'low', se obtuvo '${neutralWithLegacyDefaults.confidence}'`
      );
      assertCondition(
        neutralWithLegacyDefaults.scoresByArea.psicologia === 0,
        `La puntuación de psicología debía ser 0 en contenido neutro, fue ${neutralWithLegacyDefaults.scoresByArea.psicologia}`
      );
      return `detectedArea=${neutralWithLegacyDefaults.detectedArea}, confidence=${neutralWithLegacyDefaults.confidence}, scorePsicologia=${neutralWithLegacyDefaults.scoresByArea.psicologia}`;
    }
  );

  // Caso 14 (H-04): Disciplina manual personalizada fuera del catálogo se respeta sin ambigüedad
  runCase(
    '14 (H-04)',
    'Una disciplina manual personalizada fuera del catálogo («Criminología Forense») se respeta con confianza alta y sin ambigüedad',
    () => {
      const customManual = resolveAcademicContext({
        note: {
          title: 'Análisis de indicios periciales',
          disciplineMode: 'manual',
          manualDiscipline: 'Criminología Forense',
        },
      });

      assertCondition(customManual.source === 'note_manual', `Origen esperado 'note_manual', obtenido '${customManual.source}'`);
      assertCondition(
        customManual.disciplineLabel === 'Criminología Forense',
        `Etiqueta esperada 'Criminología Forense', obtenida '${customManual.disciplineLabel}'`
      );
      assertCondition(
        customManual.confidence === 'high' && customManual.isAmbiguous === false,
        `Debe tener confidence='high' e isAmbiguous=false; obtuvo confidence='${customManual.confidence}', isAmbiguous=${customManual.isAmbiguous}`
      );

      const explicitGeneralManual = resolveAcademicContext({
        note: {
          title: 'Apunte abierto',
          disciplineMode: 'manual',
          manualDiscipline: 'General o multidisciplinario',
        },
      });
      assertCondition(
        explicitGeneralManual.areaId === 'general' &&
          explicitGeneralManual.confidence === 'low' &&
          explicitGeneralManual.isAmbiguous === true,
        'El modo manual General o multidisciplinario debe conservar confidence=low e isAmbiguous=true'
      );

      return `customManual={label:"${customManual.disciplineLabel}", confidence:${customManual.confidence}, isAmbiguous:${customManual.isAmbiguous}}, generalManual={isAmbiguous:${explicitGeneralManual.isAmbiguous}}`;
    }
  );

  const defaultPrefsFixture: AppPreferences = {
    theme: 'system',
    chunkSize: 2500,
    autoDetectOnSave: false,
    lastSubject: 'Psicología Cognitiva',
    showSourcesPreview: true,
    offlineOnlyMode: false,
    academicProfile: undefined,
    onboardingCompleted: false,
  };

  // Caso 15 (Fase 2): Primer inicio sin perfil muestra el onboarding (una vez terminada la carga)
  runCase(
    '15 (Fase 2)',
    'Primer inicio sin perfil muestra el onboarding únicamente tras finalizar la carga inicial',
    () => {
      const freshPrefs = sanitizeAppPreferences(undefined, defaultPrefsFixture);
      const whileLoading = shouldShowAcademicOnboarding(freshPrefs, true);
      const afterLoading = shouldShowAcademicOnboarding(freshPrefs, false);

      assertCondition(whileLoading === false, 'No debe mostrarse mientras isLoading=true');
      assertCondition(afterLoading === true, 'Debe mostrarse en el primer inicio sin perfil cuando isLoading=false');
      return `whileLoading=${whileLoading}, afterLoading=${afterLoading}`;
    }
  );

  // Caso 16 (Fase 2): Guardar perfil en onboarding y simular reinicio de la aplicación
  runCase(
    '16 (Fase 2)',
    'Guardar el perfil académico persiste área, carrera y especialidad y no vuelve a mostrar el onboarding al reiniciar',
    () => {
      const savedPrefs = buildUpdatedPreferencesWithProfile(defaultPrefsFixture, {
        primaryArea: 'psicologia',
        career: 'Licenciatura en Psicología',
        specialty: 'Neuropsicología clínica',
      });

      // Simular serialización y lectura posterior desde IndexedDB al reiniciar la app
      const reloadedPrefs = sanitizeAppPreferences(
        JSON.parse(JSON.stringify(savedPrefs)),
        defaultPrefsFixture
      );

      assertCondition(
        shouldShowAcademicOnboarding(reloadedPrefs, false) === false,
        'No debe volver a mostrar el onboarding tras haber guardado el perfil'
      );
      assertCondition(
        reloadedPrefs.academicProfile?.primaryArea === 'psicologia' &&
          reloadedPrefs.academicProfile?.career === 'Licenciatura en Psicología' &&
          reloadedPrefs.academicProfile?.specialty === 'Neuropsicología clínica',
        'Los datos del perfil deben persistir tras reiniciar'
      );
      return `onboardingShown=${shouldShowAcademicOnboarding(reloadedPrefs, false)}, area=${reloadedPrefs.academicProfile?.primaryArea}, career="${reloadedPrefs.academicProfile?.career}"`;
    }
  );

  // Caso 17 (Fase 2): Modificar el perfil desde Ajustes (incluyendo elegir «General o multidisciplinario»)
  runCase(
    '17 (Fase 2)',
    'Modificar el perfil desde Ajustes persiste los cambios y permite elegir «General o multidisciplinario» sin imponer disciplina',
    () => {
      const initialPrefs = buildUpdatedPreferencesWithProfile(defaultPrefsFixture, {
        primaryArea: 'psicologia',
        career: 'Psicología',
      });

      const modifiedToGeneral = buildUpdatedPreferencesWithProfile(initialPrefs, {
        primaryArea: 'general',
        career: '',
        specialty: '',
      });

      const reloaded = sanitizeAppPreferences(
        JSON.parse(JSON.stringify(modifiedToGeneral)),
        defaultPrefsFixture
      );

      assertCondition(
        reloaded.academicProfile?.primaryArea === 'general',
        `Se esperaba primaryArea='general', se obtuvo '${reloaded.academicProfile?.primaryArea}'`
      );
      assertCondition(
        reloaded.academicProfile?.career === undefined,
        'La carrera vacía debe limpiarse a undefined'
      );

      const resolvedWithGeneral = resolveAcademicContext({
        note: { title: 'Apunte breve', content: 'Concepto de estructura.', disciplineMode: 'auto' },
        academicProfile: reloaded.academicProfile,
      });

      assertCondition(
        resolvedWithGeneral.areaId === 'general' && resolvedWithGeneral.isAmbiguous === true,
        'Elegir General o multidisciplinario en Ajustes no debe imponer una disciplina concreta'
      );
      return `updatedArea=${reloaded.academicProfile?.primaryArea}, resolvedSource=${resolvedWithGeneral.source}, isAmbiguous=${resolvedWithGeneral.isAmbiguous}`;
    }
  );

  // Caso 18 (Fase 2): Omitir el onboarding y completarlo posteriormente desde Ajustes
  runCase(
    '18 (Fase 2)',
    'Omitir el onboarding evita que reaparezca en cada inicio sin crear un perfil falso, y permite completarlo después en Ajustes',
    () => {
      const skippedPrefs = buildUpdatedPreferencesOnSkipOnboarding(defaultPrefsFixture);
      const reloadedAfterSkip = sanitizeAppPreferences(
        JSON.parse(JSON.stringify(skippedPrefs)),
        defaultPrefsFixture
      );

      assertCondition(
        reloadedAfterSkip.academicProfile === undefined,
        'Al omitir no debe guardarse un objeto academicProfile falso o incompleto'
      );
      assertCondition(
        reloadedAfterSkip.onboardingCompleted === true &&
          shouldShowAcademicOnboarding(reloadedAfterSkip, false) === false,
        'Tras omitir expresamente, no debe volver a mostrarse el onboarding en cada inicio'
      );

      // Posteriormente el usuario entra a Ajustes y configura Ingeniería y tecnología
      const completedInSettings = buildUpdatedPreferencesWithProfile(reloadedAfterSkip, {
        primaryArea: 'ingenieria_tecnologia',
        career: 'Ingeniería de Software',
      });
      const reloadedAfterSettings = sanitizeAppPreferences(
        JSON.parse(JSON.stringify(completedInSettings)),
        defaultPrefsFixture
      );

      assertCondition(
        reloadedAfterSettings.academicProfile?.primaryArea === 'ingenieria_tecnologia' &&
          reloadedAfterSettings.academicProfile?.career === 'Ingeniería de Software',
        'El perfil completado posteriormente en Ajustes debe persistir correctamente'
      );
      return `afterSkip={profile:${String(reloadedAfterSkip.academicProfile)}, showModal:${shouldShowAcademicOnboarding(reloadedAfterSkip, false)}} -> afterSettings={area:${reloadedAfterSettings.academicProfile?.primaryArea}}`;
    }
  );

  // Caso 19 (Fase 2): Compatibilidad con preferencias antiguas y rechazo de perfiles incompletos/corruptos
  runCase(
    '19 (Fase 2)',
    'Preferencias antiguas se cargan sin perder ajustes y un perfil incompleto sin primaryArea no da por completado el onboarding',
    () => {
      // Simular preferencias guardadas por una versión anterior de Nexo Notes
      const legacyStoredPrefs: Partial<AppPreferences> = {
        theme: 'dark',
        chunkSize: 2500,
        autoDetectOnSave: true,
        lastSubject: 'Psicología Cognitiva',
        showSourcesPreview: false,
        offlineOnlyMode: true,
      };

      const migratedLegacy = sanitizeAppPreferences(legacyStoredPrefs, defaultPrefsFixture);
      assertCondition(
        migratedLegacy.theme === 'dark' &&
          migratedLegacy.offlineOnlyMode === true &&
          migratedLegacy.showSourcesPreview === false,
        'Debe conservar intactas todas las preferencias antiguas del usuario'
      );
      assertCondition(
        shouldShowAcademicOnboarding(migratedLegacy, false) === true,
        'Una instalación antigua sin perfil configurado debe mostrar el onboarding inicial una vez'
      );

      // Simular un perfil incompleto/corrupto (sin primaryArea válida)
      const corruptedPrefs = {
        ...legacyStoredPrefs,
        academicProfile: { career: 'Medicina' } as unknown as AcademicProfile,
        onboardingCompleted: true,
      };
      const sanitizedCorrupted = sanitizeAppPreferences(corruptedPrefs, defaultPrefsFixture);
      assertCondition(
        sanitizedCorrupted.academicProfile === undefined &&
          shouldShowAcademicOnboarding(sanitizedCorrupted, false) === true,
        'Un perfil incompleto sin primaryArea válida no debe tratarse como onboarding terminado'
      );

      return `legacyPreserved={theme:${migratedLegacy.theme}, showOnboarding:${shouldShowAcademicOnboarding(migratedLegacy, false)}}, incompleteProfileRejected=${sanitizedCorrupted.academicProfile === undefined}`;
    }
  );

  // Caso 20 (Fase 3): Creación de nota y actualización dinámica en modo Auto al cambiar contenido
  runCase(
    '20 (Fase 3)',
    'En modo Auto la nota inicia con valores coherentes y actualiza su disciplina detectada al cambiar sustancialmente el título o el contenido',
    () => {
      const psychPrefs = buildUpdatedPreferencesWithProfile(defaultPrefsFixture, {
        primaryArea: 'psicologia',
        career: 'Licenciatura en Psicología',
      });

      const initialNote = buildInitialNoteEntity({
        id: 'note-phase3-auto',
        preferences: psychPrefs,
      });

      assertCondition(
        initialNote.disciplineMode === 'auto' && initialNote.manualDiscipline === undefined,
        'La nota nueva debe iniciar en modo auto sin disciplina manual fijada'
      );
      assertCondition(
        initialNote.detectedDiscipline === 'general' && initialNote.detectedDisciplineConfidence === 'low',
        'Una nota vacía inicia con detección intrínseca general/low'
      );

      // El resumen inicial usa el perfil global de respaldo mientras no hay contenido específico
      const initialSummary = getNoteAcademicSummary(initialNote, {
        academicProfile: psychPrefs.academicProfile,
      });
      assertCondition(
        initialSummary.areaId === 'psicologia' && initialSummary.source === 'global_profile',
        `Se esperaba respaldo del perfil global 'psicologia', se obtuvo '${initialSummary.areaId}' (${initialSummary.source})`
      );

      // Escribir contenido claramente psicológico
      const psychUpdated = syncNoteAcademicContext({
        ...initialNote,
        title: 'Trastornos de ansiedad y reestructuración cognitiva',
        content:
          'En psicoterapia cognitivo-conductual evaluamos la disonancia cognitiva, los esquemas desadaptativos, el condicionamiento operante y la regulación emocional en pacientes clínicos.',
      });

      assertCondition(
        psychUpdated.detectedDiscipline === 'psicologia' &&
          psychUpdated.detectedDisciplineConfidence === 'high',
        `Se esperaba detección 'psicologia' (high), se obtuvo '${psychUpdated.detectedDiscipline}' (${psychUpdated.detectedDisciplineConfidence})`
      );

      // Cambiar sustancialmente el título y contenido a Ingeniería de Software
      const engUpdated = syncNoteAcademicContext({
        ...psychUpdated,
        title: 'Arquitectura de microservicios e inversión de dependencias',
        content:
          'En ingeniería de software diseñamos microservicios desacoplados mediante inversión de dependencias, polimorfismo ad-hoc, compiladores, estructuras de datos y pruebas unitarias automatizadas.',
      });

      assertCondition(
        engUpdated.disciplineMode === 'auto' &&
          engUpdated.detectedDiscipline === 'ingenieria_tecnologia' &&
          engUpdated.detectedDisciplineConfidence === 'high',
        `Al cambiar el contenido a ingeniería debía actualizarse a 'ingenieria_tecnologia' (high), se obtuvo '${engUpdated.detectedDiscipline}' (${engUpdated.detectedDisciplineConfidence})`
      );

      const engSummary = getNoteAcademicSummary(engUpdated, {
        academicProfile: psychPrefs.academicProfile,
      });
      assertCondition(
        engSummary.areaId === 'ingenieria_tecnologia' &&
          engSummary.source === 'note_auto' &&
          engSummary.badgeText === 'Auto · Ingeniería y tecnología',
        `El indicador de la nota debía mostrar 'Auto · Ingeniería y tecnología', obtuvo '${engSummary.badgeText}'`
      );

      return `initial=${initialSummary.source}:${initialSummary.areaId} -> psych=${psychUpdated.detectedDiscipline} -> eng=${engUpdated.detectedDiscipline} (${engSummary.badgeText})`;
    }
  );

  // Caso 21 (Fase 3): Modo Manual conserva la disciplina elegida aunque cambie el contenido
  runCase(
    '21 (Fase 3)',
    'Cambiar de Auto a Manual conserva la disciplina fijada aunque cambien el título y el contenido de la nota',
    () => {
      const baseNote = buildInitialNoteEntity({
        id: 'note-phase3-manual',
        title: 'Apuntes sobre el concepto de Humanismo',
        content: 'Reflexiones sobre el ser humano, la ética y el pensamiento clásico.',
      });

      // Fijar manualmente Humanidades y filosofía
      const manualNote = setNoteAcademicMode(baseNote, 'manual', 'humanidades_filosofia');
      assertCondition(
        manualNote.disciplineMode === 'manual' &&
          manualNote.manualDiscipline === 'humanidades_filosofia',
        `Se esperaba modo manual con 'humanidades_filosofia', se obtuvo mode=${manualNote.disciplineMode}, manual=${manualNote.manualDiscipline}`
      );

      // Editar el contenido introduciendo vocabulario intensivo de otra disciplina (Ingeniería)
      const editedWhileManual = syncNoteAcademicContext({
        ...manualNote,
        title: 'Sistemas distribuidos, compiladores y algoritmos',
        content:
          'Implementación de microservicios, contenedores, inversión de dependencias, estructuras de datos, árboles binarios y polimorfismo en ingeniería de software.',
      });

      assertCondition(
        editedWhileManual.disciplineMode === 'manual' &&
          editedWhileManual.manualDiscipline === 'humanidades_filosofia',
        'En modo manual la disciplina elegida no debe sobrescribirse al editar el contenido'
      );

      const manualSummary = getNoteAcademicSummary(editedWhileManual);
      assertCondition(
        manualSummary.mode === 'manual' &&
          manualSummary.areaId === 'humanidades_filosofia' &&
          manualSummary.source === 'note_manual' &&
          manualSummary.badgeText === 'Manual · Humanidades y filosofía',
        `El resumen debía mantenerse en 'Manual · Humanidades y filosofía', se obtuvo '${manualSummary.badgeText}'`
      );

      return `mode=${editedWhileManual.disciplineMode}, manualDiscipline=${editedWhileManual.manualDiscipline}, badge="${manualSummary.badgeText}"`;
    }
  );

  // Caso 22 (Fase 3): Retorno explícito de Manual a Auto reanuda la detección automática
  runCase(
    '22 (Fase 3)',
    'Volver explícitamente de Manual a Auto limpia la fijación manual y reanuda la detección automática sobre el contenido actual',
    () => {
      const manualPhilosophyNote: NoteEntity = setNoteAcademicMode(
        buildInitialNoteEntity({
          id: 'note-phase3-return-auto',
          title: 'Arquitectura de software, microservicios y compiladores',
          content:
            'Diseño de sistemas distribuidos con inversión de dependencias, polimorfismo ad-hoc, algoritmos de grafos, estructuras de datos y bases de datos relacionales.',
        }),
        'manual',
        'humanidades_filosofia'
      );

      assertCondition(
        manualPhilosophyNote.disciplineMode === 'manual' &&
          manualPhilosophyNote.manualDiscipline === 'humanidades_filosofia',
        'Precondición: la nota debe estar fijada manualmente en filosofía'
      );

      // El usuario vuelve explícitamente al modo automático
      const returnedToAuto = setNoteAcademicMode(manualPhilosophyNote, 'auto');

      assertCondition(
        returnedToAuto.disciplineMode === 'auto' && returnedToAuto.manualDiscipline === undefined,
        'Al volver a Auto debe establecerse disciplineMode="auto" y limpiarse manualDiscipline'
      );
      assertCondition(
        returnedToAuto.detectedDiscipline === 'ingenieria_tecnologia' &&
          returnedToAuto.detectedDisciplineConfidence === 'high',
        `Al reanudar la detección automática debía detectar 'ingenieria_tecnologia' (high), obtuvo '${returnedToAuto.detectedDiscipline}' (${returnedToAuto.detectedDisciplineConfidence})`
      );

      const autoSummary = getNoteAcademicSummary(returnedToAuto);
      assertCondition(
        autoSummary.mode === 'auto' &&
          autoSummary.areaId === 'ingenieria_tecnologia' &&
          autoSummary.source === 'note_auto',
        `El resumen tras volver a Auto debía resolver a 'ingenieria_tecnologia' (note_auto), obtuvo '${autoSummary.areaId}' (${autoSummary.source})`
      );

      return `before=${manualPhilosophyNote.manualDiscipline} (manual) -> after=${returnedToAuto.detectedDiscipline} (${returnedToAuto.disciplineMode}, confidence=${returnedToAuto.detectedDisciplineConfidence})`;
    }
  );

  // Caso 23 (Fase 3): Persistencia (round-trip JSON/IndexedDB) y no-recálculo con campos persistidos
  runCase(
    '23 (Fase 3)',
    'La persistencia conserva disciplineMode, manualDiscipline y detectedDiscipline, y getNoteAcademicSummary reutiliza los valores persistidos',
    () => {
      const savedAutoNote = syncNoteAcademicContext(
        buildInitialNoteEntity({
          id: 'note-persisted-auto',
          title: 'Derecho civil, contratos y jurisprudencia constitucional',
          content:
            'Análisis de obligaciones contractuales, jurisprudencia, derecho mercantil, política monetaria, inflación y macroeconomía.',
        })
      );

      const savedManualNote = setNoteAcademicMode(
        buildInitialNoteEntity({
          id: 'note-persisted-manual',
          title: 'Apunte interdisciplinario',
          content: 'Texto breve.',
        }),
        'manual',
        'salud_vida'
      );

      // Simular almacenamiento y lectura desde IndexedDB
      const reloadedAuto: NoteEntity = JSON.parse(JSON.stringify(savedAutoNote));
      const reloadedManual: NoteEntity = JSON.parse(JSON.stringify(savedManualNote));

      assertCondition(
        reloadedAuto.disciplineMode === 'auto' &&
          reloadedAuto.detectedDiscipline === 'economia_negocios_derecho' &&
          reloadedAuto.detectedDisciplineConfidence === 'high',
        'La nota automática recargada debe conservar detectedDiscipline y detectedDisciplineConfidence'
      );
      assertCondition(
        reloadedManual.disciplineMode === 'manual' &&
          reloadedManual.manualDiscipline === 'salud_vida',
        'La nota manual recargada debe conservar disciplineMode="manual" y manualDiscipline="salud_vida"'
      );

      // Verificar que getNoteAcademicSummary usa los campos persistidos sin necesitar escanear content
      const strippedContentAuto: Partial<NoteEntity> = {
        ...reloadedAuto,
        title: '',
        content: '',
      };
      const fastSummary = getNoteAcademicSummary(strippedContentAuto);
      assertCondition(
        fastSummary.areaId === 'economia_negocios_derecho' &&
          fastSummary.source === 'note_auto' &&
          fastSummary.badgeText === 'Auto · Economía y derecho',
        `getNoteAcademicSummary debe usar los campos persistidos en O(1); obtuvo '${fastSummary.badgeText}'`
      );

      return `reloadedAuto=${reloadedAuto.detectedDiscipline} ("${fastSummary.badgeText}"), reloadedManual=${reloadedManual.manualDiscipline}`;
    }
  );

  // Caso 24 (Fase 3): Compatibilidad con notas antiguas sin campos académicos
  runCase(
    '24 (Fase 3)',
    'Las notas antiguas sin disciplineMode ni detectedDiscipline siguen funcionando en listado y editor sin migraciones destructivas',
    () => {
      const legacyNote: NoteEntity = {
        id: 'legacy-note-1',
        title: 'Tema 4: Sesgos Cognitivos y Disonancia',
        content:
          'Durante el seminario de psicología cognitiva analizamos la disonancia cognitiva, la comparación social ascendente, la reactancia psicológica y los procesos mentales.',
        folderId: 'folder-1',
        subject: 'Psicología Cognitiva',
        tags: ['Seminario', 'Cognición'],
        isPinned: true,
        createdAt: 1700000000000,
        updatedAt: 1700000050000,
        wordCount: 24,
        charCount: 175,
        // Sin disciplineMode, manualDiscipline, detectedDiscipline ni detectedDisciplineConfidence
      };

      const legacySummary = getNoteAcademicSummary(legacyNote);
      assertCondition(
        legacySummary.mode === 'auto' &&
          legacySummary.areaId === 'psicologia' &&
          legacySummary.source === 'note_auto' &&
          legacySummary.badgeText === 'Auto · Psicología',
        `Una nota antigua de psicología sin campos nuevos debe resumirse como 'Auto · Psicología', obtuvo '${legacySummary.badgeText}'`
      );

      const syncedLegacy = syncNoteAcademicContext(legacyNote);
      assertCondition(
        syncedLegacy.id === legacyNote.id &&
          syncedLegacy.isPinned === true &&
          syncedLegacy.disciplineMode === 'auto' &&
          syncedLegacy.detectedDiscipline === 'psicologia' &&
          (syncedLegacy.detectedDisciplineConfidence === 'high' ||
            syncedLegacy.detectedDisciplineConfidence === 'medium'),
        'Al sincronizar una nota antigua en el editor se completan sus campos académicos sin perder sus datos previos'
      );

      return `legacyBadge="${legacySummary.badgeText}", syncedDetected=${syncedLegacy.detectedDiscipline} (${syncedLegacy.detectedDisciplineConfidence})`;
    }
  );

  return results;
}

// Ejecutar automáticamente si se invoca como script directo
const suiteResults = runAcademicContextUnitTests();
const failed = suiteResults.filter((r) => !r.passed);

for (const res of suiteResults) {
  const badge = res.passed ? 'PASS' : 'FAIL';
  console.log(`[${badge}] Caso ${res.id}: ${res.name}\n       -> ${res.details}`);
}

if (failed.length > 0) {
  console.error(`\nFallaron ${failed.length} de ${suiteResults.length} pruebas.`);
  throw new Error(`Fallaron ${failed.length} pruebas unitarias.`);
} else {
  console.log(`\nTodas las ${suiteResults.length} pruebas unitarias pasaron exitosamente.`);
}
