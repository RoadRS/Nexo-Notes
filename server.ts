import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

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
    const { text, subject, noteTitle } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Texto no proporcionado para análisis.' });
    }

    const cleanText = text.trim();
    const chunks = splitTextIntoChunks(cleanText, 3500, 250);

    // If Gemini is available, utilize prompt to identify technical, domain-specific and compound terms
    if (ai) {
      const detectedTermsMap = new Map<string, {
        name: string;
        normalizedName: string;
        contextSnippet: string;
        academicField: string;
        isCompound: boolean;
        confidence: number;
      }>();

      // Process all document chunks in sequential batches to cover every page (up to 30 chunks / 60+ pages)
      const maxChunksToProcess = Math.min(chunks.length, 30);
      for (let i = 0; i < maxChunksToProcess; i++) {
        const chunk = chunks[i];
        const prompt = `Analiza el siguiente texto académico/estudiantil (Materia: "${subject || 'General'}", Título de nota: "${noteTitle || 'Apunte'}").
Identifica términos técnicos, conceptos disciplinares y expresiones compuestas relevantes (por ejemplo: "disonancia cognitiva", "comparación social ascendente", "análisis sintáctico", "polimorfismo ad-hoc").
REGLAS ESTRICTAS:
1. No incluyas palabras comunes o coloquiales sin utilidad académica (ej: "tarea", "profesor", "clase", "ejemplo").
2. Detecta términos compuestos completos, no los separes si forman una unidad conceptual.
3. Para cada término, extrae la frase u oración exacta donde aparece como contexto.
4. Devuelve ÚNICAMENTE un JSON válido con el siguiente formato:
{
  "terms": [
    {
      "name": "nombre exacto del término",
      "academicField": "disciplina o campo académico (ej: Psicología Social, Informática, Derecho Civil)",
      "contextSnippet": "frase o fragmento de contexto del texto donde se menciona",
      "isCompound": true/false
    }
  ]
}

TEXTO:
"""
${chunk}
"""`;

        try {
          const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
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
                        name: { type: Type.STRING },
                        academicField: { type: Type.STRING },
                        contextSnippet: { type: Type.STRING },
                        isCompound: { type: Type.BOOLEAN },
                      },
                      required: ['name'],
                    },
                  },
                },
                required: ['terms'],
              },
              temperature: 0.2,
            },
          });

          const rawText = response.text || '{}';
          const parsed = JSON.parse(rawText);
          if (Array.isArray(parsed.terms)) {
            for (const t of parsed.terms) {
              if (t.name && typeof t.name === 'string') {
                const norm = t.name.trim().toLowerCase();
                if (!detectedTermsMap.has(norm)) {
                  detectedTermsMap.set(norm, {
                    name: t.name.trim(),
                    normalizedName: norm,
                    contextSnippet: t.contextSnippet || '',
                    academicField: t.academicField || subject || 'Académico',
                    isCompound: !!t.isCompound || t.name.trim().includes(' '),
                    confidence: 0.95,
                  });
                }
              }
            }
          }
        } catch (subErr) {
          console.error('Error procesando fragmento con Gemini:', subErr);
        }
      }

      const termsList = Array.from(detectedTermsMap.values());
      return res.json({
        terms: termsList,
        totalDetected: termsList.length,
        method: 'gemini-2.5-flash',
        chunkCount: chunks.length,
      });
    }

    // Heuristic fallback if Gemini API key is not configured
    // Detect multi-word capitalization, quotes, italics, academic markers
    const regexes = [
      /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)*\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/g,
      /«([^»]{3,40})»/g,
      /"([^"]{3,40})"/g,
      /“([^”]{3,40})”/g,
    ];

    const termsSet = new Set<string>();
    const results: Array<{
      name: string;
      normalizedName: string;
      contextSnippet: string;
      academicField: string;
      isCompound: boolean;
      confidence: number;
    }> = [];

    for (const re of regexes) {
      let match;
      while ((match = re.exec(cleanText)) !== null) {
        const found = match[1] ? match[1].trim() : match[0].trim();
        const norm = found.toLowerCase();
        if (found.length >= 3 && !termsSet.has(norm) && !/^(el|la|los|las|un|una|este|esta)\b/i.test(found)) {
          termsSet.add(norm);
          const start = Math.max(0, match.index - 50);
          const end = Math.min(cleanText.length, match.index + found.length + 50);
          results.push({
            name: found,
            normalizedName: norm,
            contextSnippet: cleanText.substring(start, end).replace(/\n+/g, ' ').trim(),
            academicField: subject || 'General',
            isCompound: found.includes(' '),
            confidence: 0.75,
          });
        }
      }
    }

    return res.json({
      terms: results,
      totalDetected: results.length,
      method: 'heuristic-local',
      chunkCount: chunks.length,
    });
  } catch (error: any) {
    console.error('Error en /api/analyze/extract-terms:', error);
    return res.status(500).json({
      error: 'Error interno al analizar el texto.',
      details: error?.message || String(error),
    });
  }
});

// Helper parser for structured model responses
function parseSectionsFromModelResponse(rawText: string, defaultSubject = 'General') {
  let academicDefinition = '';
  let plainExplanation = '';
  let illustrativeExample = '';
  let academicField = defaultSubject;
  let status: 'verificado' | 'discrepancia' | 'no_verificado' = 'verificado';

  const lines = rawText.split('\n');
  let currentSection = 'def';

  for (const rawLine of lines) {
    const l = rawLine.trim();
    if (!l) continue;

    // Check section headers (strip markdown asterisks, bullets, numbers and hashtags)
    const cleanHeader = l.replace(/^[-*#\d.\s]+/, '').replace(/\*\*/g, '').trim();

    if (/^(academicDefinition|d[eé]finici[oó]n\s+[aá]cad[eé]mic[aá]|d[eé]finici[oó]n)\b/i.test(cleanHeader)) {
      currentSection = 'def';
      const inlineVal = l.replace(/^[^:]*:\s*/, '').replace(/^\*+|\*+$/g, '').trim();
      if (inlineVal) academicDefinition += (academicDefinition ? '\n' : '') + inlineVal;
      continue;
    } else if (/^(plainExplanation|l[eé]ngu[aá]j[eé]\s+s[eé]ncillo|[eé]xplic[aá]ci[oó]n\s+s[eé]ncill[aá]|[eé]xplic[aá]ci[oó]n)\b/i.test(cleanHeader)) {
      currentSection = 'plain';
      const inlineVal = l.replace(/^[^:]*:\s*/, '').replace(/^\*+|\*+$/g, '').trim();
      if (inlineVal) plainExplanation += (plainExplanation ? '\n' : '') + inlineVal;
      continue;
    } else if (/^(illustrativeExample|[eé]j[eé]mplo\s+did[aá]ctico|[eé]j[eé]mplo\s+ilustr[aá]tivo|[eé]j[eé]mplo)\b/i.test(cleanHeader)) {
      currentSection = 'example';
      const inlineVal = l.replace(/^[^:]*:\s*/, '').replace(/^\*+|\*+$/g, '').trim();
      if (inlineVal) illustrativeExample += (illustrativeExample ? '\n' : '') + inlineVal;
      continue;
    } else if (/^(academicField|disciplin[aá]|c[aá]mpo\s+[aá]cad[eé]mico|c[aá]mpo)\b/i.test(cleanHeader)) {
      const fieldMatch = l.replace(/^[^:]*:\s*/, '').replace(/^\*+|\*+$/g, '').trim();
      if (fieldMatch) academicField = fieldMatch;
      continue;
    } else if (/^(verificationStatus|[eé]st[aá]do\s+d[eé]\s+v[eé]rific[aá]ci[oó]n)\b/i.test(cleanHeader)) {
      if (/discrepancia/i.test(l)) status = 'discrepancia';
      else if (/no_verificado|no verificado/i.test(l)) status = 'no_verificado';
      continue;
    }

    // Append body line to current section
    const cleanContent = l.replace(/^\*+|\*+$/g, '').trim();
    if (currentSection === 'def') academicDefinition += (academicDefinition ? '\n' : '') + cleanContent;
    else if (currentSection === 'plain') plainExplanation += (plainExplanation ? '\n' : '') + cleanContent;
    else if (currentSection === 'example') illustrativeExample += (illustrativeExample ? '\n' : '') + cleanContent;
  }

  if (!academicDefinition) academicDefinition = rawText.trim();
  if (!plainExplanation) plainExplanation = 'Explicación didáctica orientada al marco teórico del apunte.';
  if (!illustrativeExample) illustrativeExample = 'Aplicación práctica del concepto en contextos de estudio.';

  return {
    academicDefinition: academicDefinition.trim(),
    plainExplanation: plainExplanation.trim(),
    illustrativeExample: illustrativeExample.trim(),
    academicField: academicField.trim() || defaultSubject,
    status,
  };
}

// Resilient API caller with retry for 503 demand spikes and graceful fallback for 429 quota exhaustion
async function callGeminiWithResilience(options: {
  prompt: string;
  withSearch?: boolean;
  temperature?: number;
}): Promise<{
  text: string;
  candidate?: any;
  groundingMeta?: any;
  groundingUsed: boolean;
  quotaExceeded: boolean;
  modelUsed: string;
}> {
  if (!ai) {
    throw new Error('Servicio de IA no disponible en el servidor (GEMINI_API_KEY no configurada).');
  }

  const { prompt, withSearch = false, temperature = 0.2 } = options;

  // Single invocation with progressive delay retry for 503 demand spikes
  async function invokeWithRetry(model: string, config: any = {}, maxRetries = 3) {
    let lastErr: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await ai!.models.generateContent({
          model,
          contents: prompt,
          config,
        });
      } catch (err: any) {
        lastErr = err;
        const msg = err?.message || String(err);
        const is503 =
          err?.status === 503 ||
          msg.includes('503') ||
          msg.includes('high demand') ||
          msg.includes('UNAVAILABLE');

        if (is503 && attempt < maxRetries) {
          const delay = attempt * 1200;
          console.warn(`[Nexo Notes] 503 Spike en ${model} (intento ${attempt}/${maxRetries}). Reintentando en ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  // Branch A: Google Search / Grounding Requested
  if (withSearch) {
    try {
      const response = await invokeWithRetry(
        'gemini-3.8-flash',
        {
          tools: [{ googleSearch: {} }],
          temperature,
        },
        2
      );
      const candidate = response.candidates?.[0];
      const groundingMeta = candidate?.groundingMetadata;
      return {
        text: response.text || '',
        candidate,
        groundingMeta,
        groundingUsed: true,
        quotaExceeded: false,
        modelUsed: 'gemini-3.8-flash',
      };
    } catch (searchErr: any) {
      const msg = searchErr?.message || String(searchErr);
      const isQuota =
        searchErr?.status === 429 ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('quota');

      console.warn(`[Nexo Notes] Herramienta Google Search no disponible (${isQuota ? '429 Quota Exceeded' : searchErr?.status || 'Error'}). Generando análisis contextual sin herramientas externas.`);

      // Resilient text generation fallback without external tools (preserves complete educational content)
      try {
        const fallbackRes = await invokeWithRetry(
          'gemini-3.5-flash-lite',
          { temperature: 0.2 },
          3
        );
        return {
          text: fallbackRes.text || '',
          candidate: fallbackRes.candidates?.[0],
          groundingMeta: null,
          groundingUsed: false,
          quotaExceeded: isQuota,
          modelUsed: 'gemini-3.5-flash-lite',
        };
      } catch {
        const textRes = await invokeWithRetry('gemini-3.8-flash', { temperature: 0.2 }, 2);
        return {
          text: textRes.text || '',
          candidate: textRes.candidates?.[0],
          groundingMeta: null,
          groundingUsed: false,
          quotaExceeded: isQuota,
          modelUsed: 'gemini-3.8-flash',
        };
      }
    }
  }

  // Branch B: Pure Contextual Text Generation (Default mode, no external web tools)
  try {
    const response = await invokeWithRetry('gemini-3.8-flash', { temperature }, 2);
    return {
      text: response.text || '',
      candidate: response.candidates?.[0],
      groundingMeta: null,
      groundingUsed: false,
      quotaExceeded: false,
      modelUsed: 'gemini-3.8-flash',
    };
  } catch (primaryErr: any) {
    console.warn(`[Nexo Notes] gemini-3.8-flash temporalmente no disponible (${primaryErr?.status || primaryErr?.message}). Conmutando a gemini-3.5-flash-lite.`);
    const liteResponse = await invokeWithRetry('gemini-3.5-flash-lite', { temperature }, 3);
    return {
      text: liteResponse.text || '',
      candidate: liteResponse.candidates?.[0],
      groundingMeta: null,
      groundingUsed: false,
      quotaExceeded: false,
      modelUsed: 'gemini-3.5-flash-lite',
    };
  }
}

// Modalidad A: Definición contextual (modo predeterminado)
// NO activa Google Search Grounding ni búsquedas web externas.
async function defineContextualConcept(termItem: { name: string; context?: string; subject?: string }) {
  const termName = (termItem.name || '').replace(/^["'«“]+|["'»”]+$/g, '').trim();
  if (!termName) {
    throw new Error('Nombre del término requerido para definición contextual.');
  }

  const context = (termItem.context || '').trim();
  const subject = (termItem.subject || '').trim() || 'General';

  const prompt = `Analiza y define contextualmente el término técnico "${termName}".
Contexto de uso dentro del documento del estudiante: "${context || 'Contexto de estudio académico'}".
Materia o disciplina: "${subject}".

INSTRUCCIONES CLAVE:
1. Define el término teniendo estrictamente en cuenta el contexto del documento y la disciplina.
2. NO realices suposiciones sin sustento teórico.
3. Devuelve las secciones:
   - academicDefinition: Definición académica rigurosa en su marco teórico.
   - plainExplanation: Explicación clara en lenguaje sencillo y pedagógico.
   - illustrativeExample: Ejemplo didáctico de aplicación directa.
   - academicField: Disciplina o especialidad pertinente.

Estructura de respuesta:
academicDefinition: <definición>
plainExplanation: <explicación>
illustrativeExample: <ejemplo>
academicField: <disciplina>`;

  const { text, modelUsed } = await callGeminiWithResilience({
    prompt,
    withSearch: false,
    temperature: 0.2,
  });

  const parsed = parseSectionsFromModelResponse(text, subject);

  return {
    termName,
    academicField: parsed.academicField,
    context,
    academicDefinition: parsed.academicDefinition,
    plainExplanation: parsed.plainExplanation,
    illustrativeExample: parsed.illustrativeExample,
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
async function searchSourcesForConcept(termItem: { name: string; context?: string; subject?: string }) {
  const termName = (termItem.name || '').replace(/^["'«“]+|["'»”]+$/g, '').trim();
  if (!termName) {
    throw new Error('Nombre del término requerido para búsqueda de fuentes.');
  }

  const context = (termItem.context || '').trim();
  const subject = (termItem.subject || '').trim() || 'General';

  const prompt = `Realiza una búsqueda documental y bibliográfica en Google Search para el término académico "${termName}".
Materia o campo disciplinar: "${subject}".
Contexto académico de procedencia: "${context || 'Contexto de estudio académico'}".

INSTRUCCIONES:
1. Consulta fuentes documentales académicas, universitarias, repositorios o publicaciones especializadas mediante Google Search.
2. Presenta un resumen de los hallazgos en las fuentes encontradas.
3. NO inventes enlaces ni afirmaciones no presentes en los resultados de búsqueda.
4. Devuelve:
   - academicDefinition: Síntesis conceptual de lo documentado en las fuentes.
   - plainExplanation: Explicación didáctica sobre los hallazgos.
   - illustrativeExample: Ejemplo de aplicación según la bibliografía.
   - academicField: Disciplina confirmada.

Estructura de respuesta:
academicDefinition: <síntesis según fuentes>
plainExplanation: <explicación>
illustrativeExample: <ejemplo>
academicField: <disciplina>`;

  const { text, groundingMeta, quotaExceeded, modelUsed } = await callGeminiWithResilience({
    prompt,
    withSearch: true,
    temperature: 0.2,
  });

  const parsed = parseSectionsFromModelResponse(text, subject);

  // Extract authentic sources from groundingChunks and map to supporting segments
  const sources: Array<{ title: string; url: string; snippet?: string; accessedAt: string }> = [];
  const chunks = groundingMeta?.groundingChunks;
  const supports = groundingMeta?.groundingSupports;

  if (Array.isArray(chunks)) {
    chunks.forEach((chunk: any, index: number) => {
      if (chunk.web?.uri) {
        let snippet = '';
        if (Array.isArray(supports)) {
          const matchSup = supports.find((s: any) => Array.isArray(s.groundingChunkIndices) && s.groundingChunkIndices.includes(index));
          if (matchSup?.segment?.text) snippet = matchSup.segment.text.trim();
        }
        sources.push({
          title: chunk.web.title || 'Fuente consultada en Google Search',
          url: chunk.web.uri,
          snippet: snippet || undefined,
          accessedAt: new Date().toISOString(),
        });
      }
    });
  }

  const uniqueSources = sources.filter((s, idx, arr) => idx === arr.findIndex((x) => x.url === s.url));

  let notice = 'Fuentes consultadas en la web. No constituye verificación automática de afirmaciones.';
  let queryStatus: 'fuentes_consultadas' | 'sin_verificar' = 'fuentes_consultadas';

  if (quotaExceeded) {
    notice = 'Cuota de Google Search temporalmente agotada en la API (429 RESOURCE_EXHAUSTED). Se proporciona definición académica contextual sin fuentes externas.';
    queryStatus = 'sin_verificar';
  } else if (uniqueSources.length === 0) {
    notice = 'Búsqueda completada: no se encontraron fuentes específicas en el índice web para este término.';
    queryStatus = 'sin_verificar';
  }

  return {
    termName,
    academicField: parsed.academicField,
    context,
    academicDefinition: parsed.academicDefinition,
    plainExplanation: parsed.plainExplanation,
    illustrativeExample: parsed.illustrativeExample,
    sources: uniqueSources,
    supportedSegments: [],
    verificationStatus: uniqueSources.length > 0 ? ('verificado' as const) : ('no_verificado' as const),
    queryStatus,
    queriesConsulted: groundingMeta?.webSearchQueries || [termName],
    groundingUsed: false,
    quotaExceeded,
    modelUsed,
    analyzedAt: new Date().toISOString(),
    consultedAt: new Date().toISOString(),
    notice,
  };
}

// Modalidad C: Verificación rigurosa con Google Search Grounding
// Solo se ejecuta tras solicitud explícita del usuario.
// Distingue entre información respaldada por fuentes, inferencias y afirmaciones no verificadas.
async function verifyGroundingForConcept(termItem: { name: string; context?: string; subject?: string }) {
  const termName = (termItem.name || '').replace(/^["'«“]+|["'»”]+$/g, '').trim();
  if (!termName) {
    throw new Error('Nombre del término requerido para contrastación con Grounding.');
  }

  const context = (termItem.context || '').trim();
  const subject = (termItem.subject || '').trim() || 'General';

  const prompt = `Realiza una fundamentación y contrastación académica rigurosa del concepto "${termName}".
Contexto del apunte del estudiante: "${context || 'Contexto de estudio académico'}".
Materia o disciplina: "${subject}".

INSTRUCCIONES DE VERIFICACIÓN Y CONTRASTACIÓN:
1. Utiliza Google Search Grounding para contrastar afirmaciones con fuentes contrastables (diccionarios especializados, universidades, manuales, publicaciones indexadas).
2. DISTINGUE CLARAMENTE:
   - Afirmaciones respaldadas por fuentes contrastadas.
   - Inferencias o deducciones teóricas del modelo.
   - Aspectos que no se pudieron verificar por falta de fuentes suficientes.
3. Si el concepto carece de evidencia o es una invención/error, señala expresamente "No se pudo verificar este concepto".
4. Redacta:
   - academicDefinition: Definición académica precisa y respaldada.
   - plainExplanation: Explicación en lenguaje sencillo para un estudiante.
   - illustrativeExample: Ejemplo didáctico de aplicación práctica.
   - academicField: Disciplina o campo de aplicación principal.
   - verificationStatus: "verificado" (si existen fuentes sólidas), "discrepancia" (si existen posturas encontradas en la literatura), o "no_verificado" (si no hay suficiente respaldo).

Estructura de respuesta:
academicDefinition: <definición>
plainExplanation: <explicación>
illustrativeExample: <ejemplo>
academicField: <disciplina>
verificationStatus: <verificado | discrepancia | no_verificado>`;

  const { text, groundingMeta, groundingUsed, quotaExceeded, modelUsed } = await callGeminiWithResilience({
    prompt,
    withSearch: true,
    temperature: 0.15,
  });

  const parsed = parseSectionsFromModelResponse(text, subject);

  // Extract genuine web search sources and map to supporting segments
  const sources: Array<{ title: string; url: string; snippet?: string; accessedAt: string }> = [];
  const supportedSegments: string[] = [];
  const chunks = groundingMeta?.groundingChunks;
  const supports = groundingMeta?.groundingSupports;

  if (Array.isArray(chunks)) {
    chunks.forEach((chunk: any, index: number) => {
      if (chunk.web?.uri) {
        let snippet = '';
        if (Array.isArray(supports)) {
          const matchSup = supports.find((s: any) => Array.isArray(s.groundingChunkIndices) && s.groundingChunkIndices.includes(index));
          if (matchSup?.segment?.text) {
            snippet = matchSup.segment.text.trim();
            if (!supportedSegments.includes(snippet)) {
              supportedSegments.push(snippet);
            }
          }
        }
        sources.push({
          title: chunk.web.title || 'Fuente contrastada vía Google Search Grounding',
          url: chunk.web.uri,
          snippet: snippet || undefined,
          accessedAt: new Date().toISOString(),
        });
      }
    });
  }

  const uniqueSources = sources.filter((s, idx, arr) => idx === arr.findIndex((x) => x.url === s.url));

  let finalStatus = parsed.status;
  let notice = 'Contrastado con fuentes web vía Google Search Grounding';
  let queryStatus: 'contrastado_web' | 'sin_verificar' = 'contrastado_web';

  if (quotaExceeded || !groundingUsed) {
    finalStatus = 'no_verificado';
    queryStatus = 'sin_verificar';
    notice = 'Cuota de Google Search Grounding agotada en la API (429 RESOURCE_EXHAUSTED). Definición generada contextualmente sin contrastación web externa.';
  } else if (uniqueSources.length === 0) {
    finalStatus = 'no_verificado';
    notice = 'No se encontraron fuentes web suficientes para contrastar este concepto.';
  } else if (text.toLowerCase().includes('no se pudo verificar') || text.toLowerCase().includes('sin respaldo')) {
    finalStatus = 'no_verificado';
    notice = 'Información no contrastable: fuentes insuficientes o controvertidas.';
  } else if (text.toLowerCase().includes('discrepan') || text.toLowerCase().includes('discrepancia')) {
    finalStatus = 'discrepancia';
    notice = 'Contrastado: se detectaron discrepancias teóricas entre fuentes.';
  }

  return {
    termName,
    academicField: parsed.academicField,
    context,
    academicDefinition: parsed.academicDefinition,
    plainExplanation: parsed.plainExplanation,
    illustrativeExample: parsed.illustrativeExample,
    sources: uniqueSources,
    supportedSegments,
    verificationStatus: finalStatus,
    queryStatus,
    queriesConsulted: groundingMeta?.webSearchQueries || [termName],
    groundingUsed: groundingUsed && uniqueSources.length > 0,
    quotaExceeded,
    modelUsed,
    analyzedAt: new Date().toISOString(),
    consultedAt: new Date().toISOString(),
    notice,
  };
}

// Endpoint: Modality A - Contextual Definition (Default mode, no web tools)
app.post('/api/analyze/define-contextual', async (req: Request, res: Response) => {
  try {
    const { term } = req.body;
    if (!term || typeof term.name !== 'string' || !term.name.trim()) {
      return res.status(400).json({ error: 'Parámetro "term" con nombre válido requerido.' });
    }
    const result = await defineContextualConcept(term);
    return res.json({ result });
  } catch (error: any) {
    console.error('Error en /api/analyze/define-contextual:', error);
    const msg = error?.message || String(error);
    const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    const isDemand = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
    const status = isQuota ? 429 : isDemand ? 503 : 500;
    return res.status(status).json({
      error: 'Error al generar definición contextual.',
      details: msg,
      code: status,
    });
  }
});

// Endpoint: Modality B - Google Search Sources
app.post('/api/analyze/search-sources', async (req: Request, res: Response) => {
  try {
    const { term } = req.body;
    if (!term || typeof term.name !== 'string' || !term.name.trim()) {
      return res.status(400).json({ error: 'Parámetro "term" con nombre válido requerido.' });
    }
    const result = await searchSourcesForConcept(term);
    return res.json({ result });
  } catch (error: any) {
    console.error('Error en /api/analyze/search-sources:', error);
    const msg = error?.message || String(error);
    const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    const isDemand = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
    const status = isQuota ? 429 : isDemand ? 503 : 500;
    return res.status(status).json({
      error: 'Error al buscar fuentes en Google.',
      details: msg,
      code: status,
    });
  }
});

// Endpoint: Modality C - Google Search Grounding Verification
app.post('/api/analyze/verify-grounding', async (req: Request, res: Response) => {
  try {
    const { term } = req.body;
    if (!term || typeof term.name !== 'string' || !term.name.trim()) {
      return res.status(400).json({ error: 'Parámetro "term" con nombre válido requerido.' });
    }
    const result = await verifyGroundingForConcept(term);
    return res.json({ result });
  } catch (error: any) {
    console.error('Error en /api/analyze/verify-grounding:', error);
    const msg = error?.message || String(error);
    const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
    const isDemand = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
    const status = isQuota ? 429 : isDemand ? 503 : 500;
    return res.status(status).json({
      error: 'Error al contrastar con Google Grounding.',
      details: msg,
      code: status,
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
