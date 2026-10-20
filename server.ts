import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import {
  ConceptExtractionError,
  classifyExtractionError,
  extractTermsFromChunksWithResilience,
} from './src/utils/conceptExtractor';
import {
  buildSearchSourcesPrompt,
  buildVerifyGroundingPrompt,
  ConceptDefinitionError,
  ContextualDefinitionTermInput,
  classifyDefinitionError,
  classifySearchGroundingError,
  DEFINITION_FALLBACK_MODEL,
  DEFINITION_PRIMARY_MODEL,
  extractGroundingSourcesAndSegments,
  generateContextualDefinitionWithResilience,
  parseAndValidateSearchGroundingResponse,
  resolveDefinitionPromptContext,
  resolveSearchSourcesOutcome,
  resolveVerifyGroundingOutcome,
} from './src/utils/conceptDefiner';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json({ limit: '25mb' }));

// Initialize GoogleGenAI server-side with required headers
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health and AI status endpoint
app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    aiAvailable: !!geminiApiKey,
    model: 'gemini-3.8-flash',
    features: ['local-room-db', 'grounded-search', 'term-extraction', 'backup-export'],
  });
});

// Helper: split text into bounded chunks with overlapping windows
function splitTextIntoChunks(text: string, chunkSize = 2500, overlap = 300): string[] {
  if (!text || text.length <= chunkSize) return [text || ''];
  const chunks: string[] = [];
  let startIndex = 0;
  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;
    if (endIndex < text.length) {
      // Find sentence or paragraph break
      const slice = text.substring(startIndex, endIndex);
      const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
      if (lastBreak > chunkSize * 0.6) {
        endIndex = startIndex + lastBreak + 1;
      }
    } else {
      endIndex = text.length;
    }
    chunks.push(text.substring(startIndex, endIndex).trim());
    if (endIndex >= text.length) break;
    startIndex = Math.max(endIndex - overlap, startIndex + 1);
  }
  return chunks;
}

// Stage A: Detect & extract technical terms from text (Without external web searches)
app.post('/api/analyze/extract-terms', async (req: Request, res: Response) => {
  try {
    const { text, subject, title, noteTitle, academicContext } = req.body ?? {};
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Se requiere un texto válido para extraer conceptos.',
        errorKind: 'INVALID_REQUEST',
        retryable: false,
      });
    }

    if (!ai) {
      return res.status(503).json({
        error: 'El servicio de inteligencia artificial no está disponible en el servidor.',
        errorKind: 'TRANSIENT_ERROR',
        retryable: true,
      });
    }

    const cleanText = text.trim();
    const effectiveTitle = (noteTitle || title || 'Apunte').trim();
    const effectiveSubject = (subject || 'General').trim();
    const allChunks = splitTextIntoChunks(cleanText, 3500, 250);
    const maxChunksToProcess = Math.min(allChunks.length, 30);
    const chunksToProcess = allChunks.slice(0, maxChunksToProcess);

    const extractionResult = await extractTermsFromChunksWithResilience(
      chunksToProcess,
      {
        subject: effectiveSubject,
        title: effectiveTitle,
        academicContext: academicContext ?? null,
      },
      async ({ model, prompt, chunkIndex, attempt }) => {
        if (attempt > 1) {
          console.warn(
            `[Nexo Notes] Reintentando extracción de conceptos (fragmento ${chunkIndex + 1}/${maxChunksToProcess}, intento ${attempt}, modelo ${model})...`
          );
        }
        const response = await ai!.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                terms: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: {
                        type: Type.STRING,
                        description:
                          'Nombre canónico del concepto académico o técnico (1 a 4 palabras), sin incluir su definición ni verbos explicativos.',
                      },
                      academicField: {
                        type: Type.STRING,
                        description: 'Disciplina o campo académico específico.',
                      },
                      contextSnippet: {
                        type: Type.STRING,
                        description:
                          'Fragmento breve (máximo 140 caracteres) donde aparece el término en el apunte.',
                      },
                      isCompound: {
                        type: Type.BOOLEAN,
                        description: 'True si el concepto consta de dos o más palabras.',
                      },
                    },
                    required: ['name', 'academicField', 'contextSnippet', 'isCompound'],
                  },
                },
              },
              required: ['terms'],
            },
            temperature: 0.1,
          },
        });
        return response.text ?? '';
      }
    );

    const termsList = extractionResult.terms.map((t) => ({
      name: t.name,
      normalizedName: t.name.trim().toLowerCase(),
      contextSnippet: t.contextSnippet,
      academicField: t.academicField || effectiveSubject,
      isCompound: t.isCompound,
      confidence: 0.95,
    }));

    return res.json({
      terms: termsList,
      totalDetected: termsList.length,
      method: extractionResult.method,
      attemptsUsed: extractionResult.attemptsUsed,
      chunkCount: maxChunksToProcess,
    });
  } catch (error: unknown) {
    const classified: ConceptExtractionError = classifyExtractionError(error);
    console.error(
      `[Nexo Notes] Error en /api/analyze/extract-terms (${classified.kind}, HTTP ${classified.statusCode}):`,
      classified.details || classified.message
    );
    return res.status(classified.statusCode).json({
      error: classified.message,
      errorKind: classified.kind,
      retryable: classified.retryable,
      details: classified.details || classified.message,
    });
  }
});

// Helper: execute Google Search / Grounding with model resilience and strict response validation
async function executeSearchOrGroundingWithResilience(
  termItem: ContextualDefinitionTermInput,
  modality: 'google_search' | 'grounding'
) {
  if (!ai) {
    throw new ConceptDefinitionError(
      'TRANSIENT_ERROR',
      'Servicio de IA no disponible en el servidor (GEMINI_API_KEY no configurada).',
      503,
      true,
      undefined,
      'model_invocation'
    );
  }

  const resolvedContext = resolveDefinitionPromptContext(termItem);
  if (!resolvedContext.termName) {
    throw new ConceptDefinitionError(
      'INVALID_REQUEST',
      modality === 'grounding'
        ? 'Nombre del término requerido para contrastación con Grounding.'
        : 'Nombre del término requerido para búsqueda de fuentes.',
      400,
      false,
      'Missing termName in request',
      'request_validation'
    );
  }

  const prompt =
    modality === 'grounding'
      ? buildVerifyGroundingPrompt(termItem)
      : buildSearchSourcesPrompt(termItem);

  const models = [DEFINITION_PRIMARY_MODEL, DEFINITION_FALLBACK_MODEL];
  let currentModelIndex = 0;
  let attemptCountForCurrentModel = 0;
  let totalAttempts = 0;
  let switchedDueTo429 = false;
  let lastError: ConceptDefinitionError | null = null;
  const maxAttemptsPerModel = 2;
  const baseDelayMs = 700;

  while (currentModelIndex < models.length) {
    const model = models[currentModelIndex];
    totalAttempts++;
    attemptCountForCurrentModel++;

    try {
      if (totalAttempts > 1) {
        console.warn(
          `[Nexo Notes] Reintentando ${modality} para "${resolvedContext.termName}" (intento ${totalAttempts}, modelo ${model})...`
        );
      }

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: modality === 'grounding' ? 0.15 : 0.2,
        },
      });

      const rawText = response.text ?? '';
      const candidate = response.candidates?.[0];
      const groundingMeta = candidate?.groundingMetadata;

      const validated = parseAndValidateSearchGroundingResponse(rawText, {
        termName: resolvedContext.termName,
        defaultAcademicField: resolvedContext.effectiveSubject,
        hasSpecificDiscipline: resolvedContext.hasSpecificDiscipline,
        hasContextualEvidence: resolvedContext.hasContextualEvidence,
      });

      return {
        validated,
        rawText,
        groundingMeta,
        modelUsed: model,
        resolvedContext,
      };
    } catch (err: unknown) {
      const classified = classifySearchGroundingError(err, modality, 'model_invocation');
      lastError = classified;
      console.warn(
        `[Nexo Notes][${modality}][diag] attempt=${totalAttempts} model=${model} areaId=${resolvedContext.areaId} stage=${classified.stage} kind=${classified.kind} status=${classified.statusCode} reason="${classified.details || classified.message}"`
      );

      // 1. Error permanente (400, credenciales inválidas, etc.): no reintentar
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
        // detener de inmediato los reintentos
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

      // 3. Errores transitorios (503 alta demanda, timeout 504, etc.):
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
      `No se pudo completar la consulta externa para "${resolvedContext.termName}".`,
      503,
      true,
      'All search/grounding attempts exhausted',
      'model_invocation'
    )
  );
}

// Modalidad A: Definición contextual (modo predeterminado)
// NO activa Google Search Grounding ni búsquedas web externas.
async function defineContextualConcept(termItem: ContextualDefinitionTermInput) {
  if (!ai) {
    throw new ConceptDefinitionError(
      'TRANSIENT_ERROR',
      'Servicio de IA no disponible en el servidor (GEMINI_API_KEY no configurada).',
      503,
      true,
      undefined,
      'model_invocation'
    );
  }

  const { definition, modelUsed, resolvedContext } =
    await generateContextualDefinitionWithResilience(
      termItem,
      async ({ model, prompt, attempt, termName }) => {
        if (attempt > 1) {
          console.warn(
            `[Nexo Notes] Reintentando definición contextual de "${termName}" (intento ${attempt}, modelo ${model})...`
          );
        }
        const response = await ai!.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                academicDefinition: {
                  type: Type.STRING,
                  description:
                    'Definición académica rigurosa que comienza directamente explicando qué es el concepto, su significado o su mecanismo (sin preámbulos metadiscursivos como "Dado que el término carece de contexto...").',
                },
                plainExplanation: {
                  type: Type.STRING,
                  description:
                    'Explicación pedagógica en lenguaje natural mediante oraciones completas con verbo principal (sin iniciar con "Para un estudiante universitario, entender...").',
                },
                illustrativeExample: {
                  type: Type.STRING,
                  description:
                    'Ejemplo concreto, completo y aplicado del concepto (en la disciplina correspondiente o comparando brevemente sus usos si el contexto es general o ambiguo).',
                },
                academicField: {
                  type: Type.STRING,
                  description:
                    'Disciplina o subdisciplina académica aplicable según la evidencia disponible, o "General o multidisciplinario" cuando el contexto sea general o insuficiente para fijar una única disciplina.',
                },
              },
              required: [
                'academicDefinition',
                'plainExplanation',
                'illustrativeExample',
                'academicField',
              ],
            },
            temperature: 0.2,
          },
        });
        return response.text ?? '';
      },
      {
        onDiagnostic: (diag) => {
          console.warn(
            `[Nexo Notes][define-contextual][diag] attempt=${diag.attempt} model=${diag.model} areaId=${diag.areaId} stage=${diag.stage} kind=${diag.errorKind} retryable=${diag.retryable} reason="${diag.reason}"`
          );
        },
      }
    );

  return {
    termName: resolvedContext.termName,
    academicField: definition.academicField,
    context: resolvedContext.contextSnippet || (termItem.context || '').trim(),
    academicDefinition: definition.academicDefinition,
    plainExplanation: definition.plainExplanation,
    illustrativeExample: definition.illustrativeExample,
    sources: [],
    supportedSegments: [],
    verificationStatus: 'no_verificado' as const,
    queryStatus: 'sin_verificar' as const,
    queriesConsulted: [],
    groundingUsed: false,
    quotaExceeded: false,
    modelUsed,
    analyzedAt: new Date().toISOString(),
    consultedAt: new Date().toISOString(),
    notice: 'Definición contextual generada por IA (no verificada externamente)',
  };
}

// Modalidad B: Búsqueda de fuentes en Google Search
// Realiza una búsqueda web relacionada con el término y su contexto académico.
// Muestra enlaces reales, títulos y fragmentos relevantes sin atribuir verificación automática.
async function searchSourcesForConcept(termItem: ContextualDefinitionTermInput) {
  const { validated, groundingMeta, modelUsed, resolvedContext } =
    await executeSearchOrGroundingWithResilience(termItem, 'google_search');

  const { uniqueSources, queriesConsulted } = extractGroundingSourcesAndSegments(
    groundingMeta,
    'Fuente consultada en Google Search'
  );

  const outcome = resolveSearchSourcesOutcome({
    uniqueSources,
    searchPerformed: true,
  });

  return {
    termName: resolvedContext.termName,
    academicField: validated.academicField,
    context: resolvedContext.contextSnippet || (termItem.context || '').trim(),
    academicDefinition: validated.academicDefinition,
    plainExplanation: validated.plainExplanation,
    illustrativeExample: validated.illustrativeExample,
    sources: uniqueSources,
    supportedSegments: [],
    verificationStatus: outcome.verificationStatus,
    queryStatus: outcome.queryStatus,
    queriesConsulted: queriesConsulted.length > 0 ? queriesConsulted : [resolvedContext.termName],
    groundingUsed: outcome.groundingUsed,
    quotaExceeded: false,
    modelUsed,
    analyzedAt: new Date().toISOString(),
    consultedAt: new Date().toISOString(),
    notice: outcome.notice,
  };
}

// Modalidad C: Verificación rigurosa con Google Search Grounding
// Solo se ejecuta tras solicitud explícita del usuario.
// Distingue entre encontrar fuentes y verificar una afirmación respaldada.
async function verifyGroundingForConcept(termItem: ContextualDefinitionTermInput) {
  const { validated, rawText, groundingMeta, modelUsed, resolvedContext } =
    await executeSearchOrGroundingWithResilience(termItem, 'grounding');

  const { uniqueSources, supportedSegments, queriesConsulted } =
    extractGroundingSourcesAndSegments(
      groundingMeta,
      'Fuente contrastada vía Google Search Grounding'
    );

  const outcome = resolveVerifyGroundingOutcome({
    uniqueSources,
    supportedSegments,
    reportedStatus: validated.reportedStatus,
    rawText,
    searchPerformed: true,
  });

  return {
    termName: resolvedContext.termName,
    academicField: validated.academicField,
    context: resolvedContext.contextSnippet || (termItem.context || '').trim(),
    academicDefinition: validated.academicDefinition,
    plainExplanation: validated.plainExplanation,
    illustrativeExample: validated.illustrativeExample,
    sources: uniqueSources,
    supportedSegments,
    verificationStatus: outcome.verificationStatus,
    queryStatus: outcome.queryStatus,
    queriesConsulted: queriesConsulted.length > 0 ? queriesConsulted : [resolvedContext.termName],
    groundingUsed: outcome.groundingUsed,
    quotaExceeded: false,
    modelUsed,
    analyzedAt: new Date().toISOString(),
    consultedAt: new Date().toISOString(),
    notice: outcome.notice,
  };
}

// Endpoint: Modality A - Contextual Definition (Default mode, no web tools)
app.post('/api/analyze/define-contextual', async (req: Request, res: Response) => {
  try {
    const { term } = req.body;
    if (!term || typeof term.name !== 'string' || !term.name.trim()) {
      return res.status(400).json({
        error: 'Parámetro "term" con nombre válido requerido.',
        stage: 'request_validation',
        errorKind: 'INVALID_REQUEST',
      });
    }
    const result = await defineContextualConcept(term);
    return res.json({ result });
  } catch (error: unknown) {
    const classified = classifyDefinitionError(error);
    console.error(
      `[Nexo Notes][define-contextual][error] stage=${classified.stage} kind=${classified.kind} status=${classified.statusCode} retryable=${classified.retryable} reason="${classified.details || classified.message}"`
    );
    return res.status(classified.statusCode).json({
      error: classified.message,
      details: classified.details || classified.message,
      errorKind: classified.kind,
      stage: classified.stage,
      retryable: classified.retryable,
      code: classified.statusCode,
    });
  }
});

// Endpoint: Modality B - Google Search Sources
app.post('/api/analyze/search-sources', async (req: Request, res: Response) => {
  try {
    const { term } = req.body;
    if (!term || typeof term.name !== 'string' || !term.name.trim()) {
      return res.status(400).json({
        error: 'Parámetro "term" con nombre válido requerido.',
        stage: 'request_validation',
        errorKind: 'INVALID_REQUEST',
      });
    }
    const result = await searchSourcesForConcept(term);
    return res.json({ result });
  } catch (error: unknown) {
    const classified = classifySearchGroundingError(error, 'google_search');
    console.error(
      `[Nexo Notes][search-sources][error] stage=${classified.stage} kind=${classified.kind} status=${classified.statusCode} retryable=${classified.retryable} reason="${classified.details || classified.message}"`
    );
    return res.status(classified.statusCode).json({
      error: classified.message,
      details: classified.details || classified.message,
      errorKind: classified.kind,
      stage: classified.stage,
      retryable: classified.retryable,
      code: classified.statusCode,
    });
  }
});

// Endpoint: Modality C - Google Search Grounding Verification
app.post('/api/analyze/verify-grounding', async (req: Request, res: Response) => {
  try {
    const { term } = req.body;
    if (!term || typeof term.name !== 'string' || !term.name.trim()) {
      return res.status(400).json({
        error: 'Parámetro "term" con nombre válido requerido.',
        stage: 'request_validation',
        errorKind: 'INVALID_REQUEST',
      });
    }
    const result = await verifyGroundingForConcept(term);
    return res.json({ result });
  } catch (error: unknown) {
    const classified = classifySearchGroundingError(error, 'grounding');
    console.error(
      `[Nexo Notes][verify-grounding][error] stage=${classified.stage} kind=${classified.kind} status=${classified.statusCode} retryable=${classified.retryable} reason="${classified.details || classified.message}"`
    );
    return res.status(classified.statusCode).json({
      error: classified.message,
      details: classified.details || classified.message,
      errorKind: classified.kind,
      stage: classified.stage,
      retryable: classified.retryable,
      code: classified.statusCode,
    });
  }
});

// Universal Single Term Verification (Supports mode: 'contextual' | 'google_search' | 'grounding')
app.post('/api/analyze/verify-term', async (req: Request, res: Response) => {
  try {
    const { term, mode = 'contextual' } = req.body;
    if (!term || typeof term.name !== 'string' || !term.name.trim()) {
      return res.status(400).json({ error: 'Parámetro "term" con nombre válido requerido.' });
    }

    let verified;
    if (mode === 'google_search') {
      verified = await searchSourcesForConcept(term);
    } else if (mode === 'grounding') {
      verified = await verifyGroundingForConcept(term);
    } else {
      verified = await defineContextualConcept(term);
    }

    return res.json({ result: verified });
  } catch (error: any) {
    console.error('Error en /api/analyze/verify-term:', error);
    const msg = error?.message || String(error);
    const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    const isDemand = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
    const status = isQuota ? 429 : isDemand ? 503 : 500;
    return res.status(status).json({
      error: isQuota ? 'Límite de cuota alcanzado en la API de Gemini.' : 'Error al procesar término.',
      details: msg,
      isQuota,
      code: status,
    });
  }
});

// Universal Batch Processing Endpoint
app.post('/api/analyze/verify-terms', async (req: Request, res: Response) => {
  try {
    const { terms, mode = 'contextual' } = req.body;
    if (!Array.isArray(terms) || terms.length === 0) {
      return res.status(400).json({ error: 'Lista de términos requerida.' });
    }

    const verifiedResults = [];
    const errors = [];

    for (const termItem of terms) {
      try {
        let result;
        if (mode === 'google_search') {
          result = await searchSourcesForConcept(termItem);
        } else if (mode === 'grounding') {
          result = await verifyGroundingForConcept(termItem);
        } else {
          result = await defineContextualConcept(termItem);
        }
        verifiedResults.push(result);
      } catch (termErr: any) {
        console.error(`Error procesando término ${termItem.name} en modo ${mode}:`, termErr);
        errors.push({ termName: termItem.name, error: termErr?.message || String(termErr) });
        verifiedResults.push({
          termName: termItem.name,
          academicField: termItem.subject || 'General',
          context: termItem.context || '',
          academicDefinition: 'No se pudo completar la operación debido a un error de conexión o cuota.',
          plainExplanation: 'Error al contactar con el servicio de análisis.',
          illustrativeExample: '',
          sources: [],
          supportedSegments: [],
          verificationStatus: 'no_verificado' as const,
          queryStatus: 'sin_verificar' as const,
          queriesConsulted: [],
          groundingUsed: false,
          analyzedAt: new Date().toISOString(),
          consultedAt: new Date().toISOString(),
          errorDetails: termErr?.message || String(termErr),
          hasError: true,
        });
      }
    }

    return res.json({
      results: verifiedResults,
      count: verifiedResults.length,
      errorsCount: errors.length,
      mode,
    });
  } catch (error: any) {
    console.error('Error en /api/analyze/verify-terms:', error);
    return res.status(500).json({
      error: 'Error en el procesamiento de términos.',
      details: error?.message || String(error),
    });
  }
});

// Backup validator endpoint
app.post('/api/backup/validate', (req: Request, res: Response) => {
  const { data } = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ valid: false, message: 'Estructura de copia de seguridad no válida.' });
  }

  const hasNotes = Array.isArray(data.notes);
  const hasFolders = Array.isArray(data.folders);
  const hasGlossary = Array.isArray(data.glossary);

  if (!hasNotes && !hasFolders && !hasGlossary) {
    return res.status(400).json({
      valid: false,
      message: 'El archivo no contiene colecciones reconocibles de Nexo Notes (notes, folders o glossary).',
    });
  }

  return res.json({
    valid: true,
    summary: {
      version: data.version || '1.0',
      exportedAt: data.exportedAt || null,
      notesCount: (data.notes || []).length,
      foldersCount: (data.folders || []).length,
      glossaryCount: (data.glossary || []).length,
      documentsCount: (data.documents || []).length,
    },
  });
});

// Vite middleware mounting in development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Nexo Notes] Servidor activo en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error iniciando servidor Nexo Notes:', err);
  process.exit(1);
});
