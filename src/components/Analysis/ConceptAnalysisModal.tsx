import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  NoteEntity,
  ConceptEntity,
  VerificationStatus,
  TermQueryStatus,
  SourceReference,
  CachedAnalysisEntity,
} from '../../types/models';
import { localDB } from '../../db/indexedDB';
import {
  buildExtractionRequestPayload,
  createExtractionConcurrencyGuard,
} from '../../utils/conceptExtractor';
import {
  buildContextualDefinitionTermPayload,
  isPlaceholderContextSnippet,
} from '../../utils/conceptDefiner';
import {
  isCacheEntryCompatibleWithContext,
  isSameGlossaryConceptIdentity,
  isTermInGlossaryForContext,
  mergeGlossaryConceptOnSave,
  resolveContextualCacheKey,
  resolveSpecificAcademicAreaId,
} from '../../utils/cacheIntegrity';
import {
  Sparkles,
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  BookOpen,
  RefreshCw,
  X,
  CheckSquare,
  Square,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Database,
  RotateCcw,
  StopCircle,
  Clock,
  Globe,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface ExtractedTerm {
  name: string;
  normalizedName: string;
  academicField: string;
  contextSnippet: string;
  isCompound: boolean;
  selected: boolean;
  alreadyInGlossary: boolean;
  cachedResult?: CachedAnalysisEntity | null;
  forceReverify?: boolean;
}

interface VerifiedResult {
  termName: string;
  academicField: string;
  context: string;
  academicDefinition: string;
  plainExplanation: string;
  illustrativeExample: string;
  sources: SourceReference[];
  supportedSegments?: string[];
  verificationStatus: VerificationStatus;
  queryStatus: TermQueryStatus; // 'sin_verificar' | 'fuentes_consultadas' | 'contrastado_web'
  queriesConsulted: string[];
  analyzedAt: string;
  consultedAt?: string;
  notice?: string;
  groundingUsed?: boolean;
  quotaExceeded?: boolean;
  isFromCache?: boolean;
  savedToGlossary?: boolean;
  hasError?: boolean;
  errorDetails?: string;
  isLoadingAction?: boolean;
  selectedForBatch?: boolean;
}

export const ConceptAnalysisModal: React.FC<{
  note?: NoteEntity | null;
  initialText?: string;
  sourceDocId?: string;
  sourceDocName?: string;
  sourcePageMap?: Array<{ page: number; text: string }>;
  onClose: () => void;
}> = ({ note, initialText, sourceDocId, sourceDocName, sourcePageMap, onClose }) => {
  const { glossary, folders, preferences, saveMultipleConcepts, showNotification, updateNote } =
    useApp();

  const textToAnalyze = initialText || note?.content || '';
  const extractionPayload = buildExtractionRequestPayload({
    text: textToAnalyze,
    title: note?.title || 'Apunte académico',
    defaultSubject: note?.subject,
    note,
    folders,
    academicProfile: preferences.academicProfile,
  });
  const noteSubject = extractionPayload.subject;
  const noteTitle = extractionPayload.title;
  const noteAreaId = extractionPayload.academicContext.areaId;

  const buildTermContext = (academicField?: string) => {
    const fieldArea = resolveSpecificAcademicAreaId(academicField);
    return {
      areaId: fieldArea || (noteAreaId !== 'general' ? noteAreaId : undefined),
      academicField: academicField || noteSubject,
    };
  };

  // Modal Stages: 'preview' -> 'detecting' -> 'review' -> 'verifying' -> 'results'
  const [stage, setStage] = useState<'preview' | 'detecting' | 'review' | 'verifying' | 'results'>('preview');
  const [extractedTerms, setExtractedTerms] = useState<ExtractedTerm[]>([]);
  const [verifiedResults, setVerifiedResults] = useState<VerifiedResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [customTermInput, setCustomTermInput] = useState('');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const extractionGuardRef = useRef(createExtractionConcurrencyGuard());

  // Batch progress and cancellation
  const [batchProgress, setBatchProgress] = useState<{
    currentIndex: number;
    total: number;
    currentTerm: string;
    percentage: number;
    mode: 'contextual' | 'google_search' | 'grounding';
  }>({ currentIndex: 0, total: 0, currentTerm: '', percentage: 0, mode: 'contextual' });
  const abortControllerRef = useRef<AbortController | null>(null);

  // Check if note was already analyzed recently
  const isAlreadyAnalyzed =
    note && note.lastAnalyzedAt && note.lastAnalyzedAt >= note.updatedAt;

  // Step 1: Detect terms (Stage A - local/server without external web searches)
  const handleExtractTerms = async () => {
    if (!textToAnalyze.trim()) {
      showNotification('No hay texto para analizar.', 'error');
      return;
    }

    if (extractionGuardRef.current.isBusy()) {
      return;
    }

    const hadPreviousTerms = extractedTerms.length > 0;

    await extractionGuardRef.current.run(async () => {
      setIsExtracting(true);
      setStage('detecting');
      setErrorMessage(null);

      try {
        const response = await fetch('/api/analyze/extract-terms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(extractionPayload),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(
            errBody?.error ||
              `El servicio de análisis no pudo extraer los conceptos (código ${response.status}).`
          );
        }

        const data = await response.json();
        if (!data || !Array.isArray(data.terms)) {
          throw new Error('La respuesta del servidor no contiene un listado válido de conceptos.');
        }

        const rawTerms: any[] = data.terms;

        const processedTerms: ExtractedTerm[] = await Promise.all(
          rawTerms.map(async (t) => {
            const norm = (t.name || '').trim().toLowerCase();
            const effectiveField = t.academicField || noteSubject;
            const termContext = buildTermContext(effectiveField);
            const inGlossary = isTermInGlossaryForContext(glossary, norm, termContext);
            const cached = await localDB.getCachedAnalysis(norm, termContext);

            return {
              name: t.name,
              normalizedName: norm,
              academicField: effectiveField,
              contextSnippet: t.contextSnippet || '',
              isCompound: !!t.isCompound || t.name.includes(' '),
              selected: !inGlossary, // Check by default for contextual review
              alreadyInGlossary: inGlossary,
              cachedResult: cached,
              forceReverify: false,
            };
          })
        );

        setExtractedTerms(processedTerms);
        setStage('review');
      } catch (err: any) {
        console.error('Error detectando términos:', err);
        setErrorMessage(
          err?.message ||
            'No se pudo completar la extracción de conceptos. Puedes reintentar sin cerrar esta ventana.'
        );
        // Preserve previously extracted terms if the user was already on the review screen
        setStage(hadPreviousTerms ? 'review' : 'preview');
      } finally {
        setIsExtracting(false);
      }
    });
  };

  // Term selection toggles in review stage
  const toggleTermSelection = (index: number) => {
    setExtractedTerms((prev) =>
      prev.map((t, i) => (i === index ? { ...t, selected: !t.selected } : t))
    );
  };

  const toggleForceReverify = (index: number) => {
    setExtractedTerms((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, forceReverify: !t.forceReverify, selected: true } : t
      )
    );
  };

  const handleSelectAll = (select: boolean) => {
    setExtractedTerms((prev) => prev.map((t) => ({ ...t, selected: select })));
  };

  const handleAddCustomTerm = async () => {
    const val = customTermInput.trim();
    if (!val) return;
    const norm = val.toLowerCase();
    const termContext = buildTermContext(noteSubject);
    const inGlossary = isTermInGlossaryForContext(glossary, norm, termContext);
    const cached = await localDB.getCachedAnalysis(norm, termContext);

    setExtractedTerms((prev) => [
      ...prev,
      {
        name: val,
        normalizedName: norm,
        academicField: noteSubject,
        contextSnippet: 'Término añadido manualmente por el estudiante.',
        isCompound: val.includes(' '),
        selected: true,
        alreadyInGlossary: inGlossary,
        cachedResult: cached,
        forceReverify: false,
      },
    ]);
    setCustomTermInput('');
  };

  // Helper: Format readable date
  const formatDateTime = (isoOrTimestamp?: string | number) => {
    if (!isoOrTimestamp) return 'Reciente';
    try {
      const d = new Date(isoOrTimestamp);
      return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return String(isoOrTimestamp);
    }
  };

  // Helper: format relative time
  const getRelativeTime = (timestamp: number) => {
    const diffMin = Math.round((Date.now() - timestamp) / (1000 * 60));
    if (diffMin < 1) return 'Hace un momento';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    const diffDays = Math.round(diffHours / 24);
    return `Hace ${diffDays} d`;
  };

  // Universal Batch Processor for any modality ('contextual' | 'google_search' | 'grounding')
  const executeBatchOperation = async (
    termsToProcess: ExtractedTerm[],
    mode: 'contextual' | 'google_search' | 'grounding' = 'contextual'
  ) => {
    if (termsToProcess.length === 0) {
      showNotification('Selecciona al menos un término para procesar.', 'info');
      return;
    }

    setStage('verifying');
    setErrorMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const accumulatedResults: VerifiedResult[] = [...verifiedResults];
    const totalCount = termsToProcess.length;

    for (let i = 0; i < totalCount; i++) {
      if (abortController.signal.aborted) {
        break;
      }

      const termItem = termsToProcess[i];
      setBatchProgress({
        currentIndex: i + 1,
        total: totalCount,
        currentTerm: termItem.name,
        percentage: Math.round(((i + 1) / totalCount) * 100),
        mode,
      });

      // Check persistent cache: If mode is contextual or cached matches requested mode and user didn't force
      const termContext = buildTermContext(termItem.academicField);
      if (
        termItem.cachedResult &&
        !termItem.forceReverify &&
        isCacheEntryCompatibleWithContext(termItem.cachedResult, termContext) &&
        (mode === 'contextual' ||
          (mode === 'google_search' && termItem.cachedResult.queryStatus === 'fuentes_consultadas') ||
          (mode === 'grounding' && termItem.cachedResult.queryStatus === 'contrastado_web'))
      ) {
        const cached = termItem.cachedResult;
        const resultFromCache: VerifiedResult = {
          termName: cached.termName,
          academicField: cached.academicField,
          context: termItem.contextSnippet || '',
          academicDefinition: cached.academicDefinition,
          plainExplanation: cached.plainExplanation,
          illustrativeExample: cached.illustrativeExample,
          sources: cached.sources || [],
          supportedSegments: cached.supportedSegments || [],
          verificationStatus: cached.verificationStatus,
          queryStatus: cached.queryStatus || (cached.sources?.length > 0 ? 'fuentes_consultadas' : 'sin_verificar'),
          queriesConsulted: cached.queriesConsulted || [cached.termName],
          analyzedAt: new Date(cached.analyzedAt).toISOString(),
          consultedAt: cached.consultedAt || new Date(cached.analyzedAt).toISOString(),
          notice:
            cached.queryStatus === 'contrastado_web'
              ? cached.verificationStatus === 'verificado'
                ? 'Contrastado con fuentes web vía Google Search Grounding'
                : cached.verificationStatus === 'discrepancia'
                ? 'Contrastado con fuentes web: se detectaron discrepancias entre fuentes'
                : 'Se consultaron fuentes web, pero no aportan respaldo suficiente para verificar la afirmación'
              : cached.queryStatus === 'fuentes_consultadas'
              ? 'Fuentes consultadas en la web. No constituye verificación automática de afirmaciones.'
              : 'Definición contextual generada por IA (no verificada externamente)',
          groundingUsed: cached.groundingUsed,
          isFromCache: true,
          savedToGlossary: false,
          selectedForBatch: true,
        };

        const existingIdx = accumulatedResults.findIndex(
          (r) => r.termName.toLowerCase() === termItem.normalizedName
        );
        if (existingIdx >= 0) {
          accumulatedResults[existingIdx] = resultFromCache;
        } else {
          accumulatedResults.push(resultFromCache);
        }
        setVerifiedResults([...accumulatedResults]);
        continue;
      }

      // Execute live endpoint with appropriate mode
      try {
        let endpoint = '/api/analyze/define-contextual';
        if (mode === 'google_search') {
          endpoint = '/api/analyze/search-sources';
        } else if (mode === 'grounding') {
          endpoint = '/api/analyze/verify-grounding';
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            term: buildContextualDefinitionTermPayload({
              name: termItem.name,
              contextSnippet: termItem.contextSnippet,
              academicField: termItem.academicField,
              noteTitle,
              noteText: textToAnalyze,
              academicContext: extractionPayload.academicContext,
            }),
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const resItem = data.result;

        const newResult: VerifiedResult = {
          termName: resItem.termName,
          academicField: resItem.academicField,
          context: resItem.context || termItem.contextSnippet,
          academicDefinition: resItem.academicDefinition,
          plainExplanation: resItem.plainExplanation,
          illustrativeExample: resItem.illustrativeExample,
          sources: resItem.sources || [],
          supportedSegments: resItem.supportedSegments || [],
          verificationStatus: resItem.verificationStatus,
          queryStatus: resItem.queryStatus || (mode === 'google_search' ? 'fuentes_consultadas' : mode === 'grounding' ? 'contrastado_web' : 'sin_verificar'),
          queriesConsulted: resItem.queriesConsulted || [resItem.termName],
          analyzedAt: resItem.analyzedAt,
          consultedAt: resItem.consultedAt || resItem.analyzedAt,
          notice: resItem.notice,
          groundingUsed: resItem.groundingUsed,
          quotaExceeded: resItem.quotaExceeded,
          isFromCache: false,
          savedToGlossary: false,
          hasError: false,
          errorDetails: undefined,
          selectedForBatch: true,
        };

        // Cache in IndexedDB with contextual key
        const saveContext = buildTermContext(resItem.academicField || termItem.academicField);
        const contextualKey = resolveContextualCacheKey(resItem.termName || termItem.name, saveContext);
        await localDB.saveCachedAnalysis(
          {
            termKey: contextualKey,
            termName: resItem.termName,
            academicField: resItem.academicField,
            academicAreaId: resolveSpecificAcademicAreaId(saveContext) ?? undefined,
            academicContextKey: contextualKey,
            academicDefinition: resItem.academicDefinition,
            plainExplanation: resItem.plainExplanation,
            illustrativeExample: resItem.illustrativeExample,
            sources: resItem.sources || [],
            supportedSegments: resItem.supportedSegments || [],
            verificationStatus: resItem.verificationStatus,
            queryStatus: newResult.queryStatus,
            queriesConsulted: resItem.queriesConsulted || [resItem.termName],
            groundingUsed: !!resItem.groundingUsed,
            analyzedAt: Date.now(),
            consultedAt: newResult.consultedAt,
          },
          saveContext
        );

        const existingIdx = accumulatedResults.findIndex(
          (r) => r.termName.toLowerCase() === termItem.normalizedName
        );
        if (existingIdx >= 0) {
          accumulatedResults[existingIdx] = newResult;
        } else {
          accumulatedResults.push(newResult);
        }
        setVerifiedResults([...accumulatedResults]);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          break;
        }

        console.error(`Error procesando término ${termItem.name}:`, err);
        const errorResult: VerifiedResult = {
          termName: termItem.name,
          academicField: termItem.academicField,
          context: termItem.contextSnippet,
          academicDefinition: 'No se pudo completar la operación para este término.',
          plainExplanation: 'Error de conexión o cuota al consultar el servicio.',
          illustrativeExample: '',
          sources: [],
          supportedSegments: [],
          verificationStatus: 'no_verificado',
          queryStatus: 'sin_verificar',
          queriesConsulted: [],
          analyzedAt: new Date().toISOString(),
          consultedAt: new Date().toISOString(),
          hasError: true,
          errorDetails: err?.message || String(err),
          savedToGlossary: false,
          selectedForBatch: false,
        };

        const existingIdx = accumulatedResults.findIndex(
          (r) => r.termName.toLowerCase() === termItem.normalizedName
        );
        if (existingIdx >= 0) {
          const prevResult = accumulatedResults[existingIdx];
          if (!prevResult.hasError && prevResult.academicDefinition) {
            accumulatedResults[existingIdx] = {
              ...prevResult,
              isLoadingAction: false,
              errorDetails: err?.message || String(err),
            };
          } else {
            accumulatedResults[existingIdx] = errorResult;
          }
        } else {
          accumulatedResults.push(errorResult);
        }
        setVerifiedResults([...accumulatedResults]);
      }
    }

    setStage('results');

    if (note && !sourceDocId) {
      await updateNote({
        ...note,
        lastAnalyzedAt: Date.now(),
      });
    }
  };

  // Perform an individual action on a specific term directly from the results card
  const handleSingleTermAction = async (
    termName: string,
    mode: 'google_search' | 'grounding' | 'contextual'
  ) => {
    const target = verifiedResults.find((r) => r.termName === termName);
    if (!target) return;

    // Set loading indicator on this specific card
    setVerifiedResults((prev) =>
      prev.map((r) => (r.termName === termName ? { ...r, isLoadingAction: true } : r))
    );

    try {
      let endpoint = '/api/analyze/define-contextual';
      if (mode === 'google_search') {
        endpoint = '/api/analyze/search-sources';
      } else if (mode === 'grounding') {
        endpoint = '/api/analyze/verify-grounding';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: buildContextualDefinitionTermPayload({
            name: target.termName,
            contextSnippet: target.context,
            academicField: target.academicField,
            noteTitle,
            noteText: textToAnalyze,
            academicContext: extractionPayload.academicContext,
          }),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${response.status}`);
      }

      const data = await response.json();
      const resItem = data.result;

      const updated: VerifiedResult = {
        ...target,
        academicDefinition: resItem.academicDefinition || target.academicDefinition,
        plainExplanation: resItem.plainExplanation || target.plainExplanation,
        illustrativeExample: resItem.illustrativeExample || target.illustrativeExample,
        academicField: resItem.academicField || target.academicField,
        sources: resItem.sources || [],
        supportedSegments: resItem.supportedSegments || [],
        verificationStatus:
          resItem.verificationStatus ||
          (mode === 'contextual' ? 'no_verificado' : target.verificationStatus),
        queryStatus: resItem.queryStatus || (mode === 'google_search' ? 'fuentes_consultadas' : mode === 'grounding' ? 'contrastado_web' : 'sin_verificar'),
        queriesConsulted: resItem.queriesConsulted || target.queriesConsulted,
        consultedAt: resItem.consultedAt || new Date().toISOString(),
        notice: resItem.notice,
        groundingUsed: mode === 'contextual' ? false : resItem.groundingUsed,
        quotaExceeded: resItem.quotaExceeded,
        isFromCache: false,
        isLoadingAction: false,
        hasError: false,
        errorDetails: undefined,
      };

      // Update in cache with contextual key
      const saveContext = buildTermContext(updated.academicField);
      const contextualKey = resolveContextualCacheKey(target.termName, saveContext);
      await localDB.saveCachedAnalysis(
        {
          termKey: contextualKey,
          termName: target.termName,
          academicField: updated.academicField,
          academicAreaId: resolveSpecificAcademicAreaId(saveContext) ?? undefined,
          academicContextKey: contextualKey,
          academicDefinition: updated.academicDefinition,
          plainExplanation: updated.plainExplanation,
          illustrativeExample: updated.illustrativeExample,
          sources: updated.sources,
          supportedSegments: updated.supportedSegments,
          verificationStatus: updated.verificationStatus,
          queryStatus: updated.queryStatus,
          queriesConsulted: updated.queriesConsulted,
          groundingUsed: !!updated.groundingUsed,
          analyzedAt: Date.now(),
          consultedAt: updated.consultedAt,
        },
        saveContext
      );

      setVerifiedResults((prev) =>
        prev.map((r) => (r.termName === termName ? updated : r))
      );

      let msg = `Definición contextual actualizada para "${termName}".`;
      let toastType: 'success' | 'info' = 'success';
      if (mode === 'google_search') {
        if (updated.sources.length > 0) {
          msg = `Se encontraron ${updated.sources.length} fuente(s) web para "${termName}" (consulta de referencias, sin verificación automática).`;
          toastType = 'success';
        } else {
          msg = `Búsqueda completada para "${termName}": no se encontraron fuentes web específicas.`;
          toastType = 'info';
        }
      } else if (mode === 'grounding') {
        if (updated.verificationStatus === 'verificado') {
          msg = `Afirmación contrastada y respaldada con fuentes web para "${termName}".`;
          toastType = 'success';
        } else if (updated.verificationStatus === 'discrepancia') {
          msg = `Contrastación completada para "${termName}": se detectaron discrepancias entre fuentes.`;
          toastType = 'info';
        } else {
          msg = `Contrastación completada para "${termName}": sin respaldo suficiente en fuentes web.`;
          toastType = 'info';
        }
      }
      showNotification(msg, toastType);
    } catch (err: any) {
      console.error(`Error en acción para ${termName}:`, err);
      setVerifiedResults((prev) =>
        prev.map((r) =>
          r.termName === termName
            ? { ...r, isLoadingAction: false, errorDetails: err?.message || 'Error al conectar' }
            : r
        )
      );
      showNotification(`Error: ${err?.message || 'Fallo en la consulta'}`, 'error');
    }
  };

  // Batch action in results: apply chosen mode to all items marked as selectedForBatch
  const handleBatchActionInResults = (mode: 'google_search' | 'grounding' | 'contextual') => {
    const selectedItems = verifiedResults.filter((r) => r.selectedForBatch && !r.hasError);
    const targets = selectedItems.length > 0 ? selectedItems : verifiedResults.filter((r) => !r.hasError);

    if (targets.length === 0) {
      showNotification('No hay términos seleccionados para esta acción.', 'info');
      return;
    }

    const termsToProcess: ExtractedTerm[] = targets.map((t) => ({
      name: t.termName,
      normalizedName: t.termName.trim().toLowerCase(),
      academicField: t.academicField,
      contextSnippet: t.context,
      isCompound: t.termName.includes(' '),
      selected: true,
      alreadyInGlossary: false,
      forceReverify: true, // Force live fetch for the requested mode
    }));

    executeBatchOperation(termsToProcess, mode);
  };

  // Toggle selection checkbox in results
  const toggleResultSelection = (termName: string) => {
    setVerifiedResults((prev) =>
      prev.map((r) => (r.termName === termName ? { ...r, selectedForBatch: !r.selectedForBatch } : r))
    );
  };

  const handleSelectAllResults = (select: boolean) => {
    setVerifiedResults((prev) => prev.map((r) => ({ ...r, selectedForBatch: select })));
  };

  // Cancel ongoing batch process
  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      showNotification('Operación cancelada. Mostrando términos procesados hasta el momento.', 'info');
      setStage('results');
    }
  };

  // Selective retry for failed items
  const handleSelectiveRetry = () => {
    const failedItems = verifiedResults.filter((r) => r.hasError);
    if (failedItems.length === 0) return;

    const termsToRetry: ExtractedTerm[] = failedItems.map((f) => ({
      name: f.termName,
      normalizedName: f.termName.trim().toLowerCase(),
      academicField: f.academicField,
      contextSnippet: f.context,
      isCompound: f.termName.includes(' '),
      selected: true,
      alreadyInGlossary: false,
      forceReverify: true,
    }));

    setVerifiedResults((prev) => prev.filter((r) => !r.hasError));
    executeBatchOperation(termsToRetry, 'contextual');
  };

  // Save to Glossary
  const handleSaveToGlossary = async (itemToSave?: VerifiedResult) => {
    const targets = itemToSave ? [itemToSave] : verifiedResults.filter((r) => !r.savedToGlossary && !r.hasError);
    if (targets.length === 0) return;

    const newConcepts: ConceptEntity[] = targets.map((r) => {
      let matchedPage: number | undefined = undefined;
      if (sourcePageMap && sourcePageMap.length > 0) {
        const found = sourcePageMap.find(
          (p) =>
            p.text.toLowerCase().includes(r.termName.toLowerCase()) ||
            (r.context && p.text.toLowerCase().includes(r.context.slice(0, 30).toLowerCase()))
        );
        if (found) matchedPage = found.page;
        else matchedPage = sourcePageMap[0].page;
      }

      const termContext = buildTermContext(r.academicField);
      const draftConcept: ConceptEntity = {
        id: `concept-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        termName: r.termName,
        normalizedName: r.termName.trim().toLowerCase(),
        academicField: r.academicField,
        academicAreaId: resolveSpecificAcademicAreaId(termContext) ?? undefined,
        context: r.context,
        academicDefinition: r.academicDefinition,
        plainExplanation: r.plainExplanation,
        illustrativeExample: r.illustrativeExample,
        verificationStatus: r.verificationStatus,
        queryStatus: r.queryStatus,
        supportedSegments: r.supportedSegments,
        sources: r.sources,
        noteId: note?.id,
        documentId: sourceDocId,
        documentName: sourceDocName,
        pageOrSlide: matchedPage,
        isFavorite: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastCheckedAt: Date.now(),
        consultedAt: r.consultedAt,
      };

      const existingMatch = glossary.find((g) => isSameGlossaryConceptIdentity(g, draftConcept));
      return mergeGlossaryConceptOnSave(existingMatch, draftConcept);
    });

    await saveMultipleConcepts(newConcepts);

    setVerifiedResults((prev) =>
      prev.map((r) =>
        targets.some((t) => t.termName === r.termName) ? { ...r, savedToGlossary: true } : r
      )
    );
    showNotification(`${targets.length} concepto(s) guardado(s) en el glosario.`, 'success');
  };

  const failedCount = verifiedResults.filter((r) => r.hasError).length;
  const successfulCount = verifiedResults.filter((r) => !r.hasError).length;
  const selectedResultsCount = verifiedResults.filter((r) => r.selectedForBatch && !r.hasError).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-950/60 p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="concept-analysis-modal-title"
        aria-describedby="concept-analysis-modal-subtitle"
        className="w-full max-w-2xl max-h-[94vh] sm:max-h-[90vh] flex flex-col bg-stone-50 dark:bg-stone-950 border-t sm:border border-stone-200 dark:border-stone-800 rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-indigo-700 dark:text-indigo-300 border border-stone-200/80 dark:border-stone-700 shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="concept-analysis-modal-title"
                className="font-bold text-base sm:text-lg text-stone-900 dark:text-stone-100 leading-tight truncate"
              >
                Análisis de conceptos
              </h2>
              <p
                id="concept-analysis-modal-subtitle"
                className="text-xs text-stone-600 dark:text-stone-400 truncate mt-0.5"
              >
                {noteTitle} {noteSubject ? `· ${noteSubject}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar análisis de conceptos"
            className="min-h-[44px] min-w-[44px] -mr-1 inline-flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body with internal scrolling */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {errorMessage && (
            <div
              role="alert"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs sm:text-sm text-red-800 dark:text-red-200"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                <div className="space-y-0.5">
                  <p className="font-semibold">No se pudo completar la extracción</p>
                  <p className="text-red-700 dark:text-red-300 leading-relaxed">{errorMessage}</p>
                </div>
              </div>
              {(stage === 'preview' || stage === 'review') && (
                <button
                  type="button"
                  onClick={handleExtractTerms}
                  disabled={isExtracting}
                  className="shrink-0 min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-900/60 dark:hover:bg-red-900 text-red-900 dark:text-red-100 font-semibold text-xs border border-red-300 dark:border-red-800 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Reintentar extracción</span>
                </button>
              )}
            </div>
          )}

          {/* STAGE: PREVIEW */}
          {stage === 'preview' && (
            <div className="space-y-4">
              {isAlreadyAnalyzed && (
                <div
                  role="status"
                  className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 leading-relaxed"
                >
                  <CheckCircle2 className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Este apunte ya fue analizado recientemente. Puedes revisar de nuevo sus conceptos o actualizar las fuentes cuando lo necesites.
                  </span>
                </div>
              )}

              <div>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                    Fragmento de tus apuntes a analizar
                  </span>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400">
                    {textToAnalyze.length} caracteres
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs sm:text-sm text-stone-800 dark:text-stone-200 max-h-52 overflow-y-auto whitespace-pre-wrap leading-relaxed font-sans">
                  {textToAnalyze.slice(0, 800)}
                  {textToAnalyze.length > 800 && (
                    <span className="text-stone-500 dark:text-stone-400 italic">
                      ... (+{textToAnalyze.length - 800} caracteres adicionales)
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs text-stone-700 dark:text-stone-300 space-y-2 leading-relaxed">
                <p className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Modalidades de estudio disponibles en el siguiente paso</span>
                </p>
                <ul className="space-y-1.5 text-stone-600 dark:text-stone-400 pl-1">
                  <li>
                    <strong className="text-stone-800 dark:text-stone-200">Definición contextual (recomendado):</strong>{' '}
                    explica cada concepto según el contexto de tus apuntes, sin realizar búsquedas en internet.
                  </li>
                  <li>
                    <strong className="text-stone-800 dark:text-stone-200">Buscar fuentes en Google:</strong>{' '}
                    consulta enlaces y referencias bibliográficas abiertas en la web.
                  </li>
                  <li>
                    <strong className="text-stone-800 dark:text-stone-200">Contrastar con Google Grounding:</strong>{' '}
                    verifica afirmaciones puntuales frente a literatura y fuentes académicas indexadas.
                  </li>
                </ul>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-2 border-t border-stone-200 dark:border-stone-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2.5 text-xs font-medium rounded-xl text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExtractTerms}
                  disabled={isExtracting}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
                >
                  <Search className="w-4 h-4 shrink-0" />
                  <span>Extraer conceptos del apunte</span>
                </button>
              </div>
            </div>
          )}

          {/* STAGE: DETECTING SPINNER */}
          {stage === 'detecting' && (
            <div
              role="status"
              aria-live="polite"
              className="py-14 flex flex-col items-center justify-center text-center space-y-3"
            >
              <RefreshCw className="w-7 h-7 text-indigo-600 dark:text-indigo-400 animate-spin motion-reduce:animate-none" />
              <p className="font-semibold text-sm sm:text-base text-stone-900 dark:text-stone-100">
                Leyendo tus apuntes y detectando conceptos…
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-400 max-w-sm leading-relaxed">
                Identificando términos simples y compuestos en tu texto y comprobando tu caché local sin búsquedas externas.
              </p>
            </div>
          )}

          {/* STAGE: REVIEW EXTRACTED TERMS */}
          {stage === 'review' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100">
                    Conceptos detectados ({extractedTerms.length})
                  </h3>
                  <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
                    Marca los términos que deseas estudiar y elige cómo consultarlos.
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSelectAll(true)}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  >
                    Seleccionar todos
                  </button>
                  <span className="text-stone-300 dark:text-stone-700" aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(false)}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              {/* Add custom term input */}
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                <label htmlFor="custom-term-input" className="sr-only">
                  Añadir concepto manualmente
                </label>
                <input
                  id="custom-term-input"
                  type="text"
                  value={customTermInput}
                  onChange={(e) => setCustomTermInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTerm()}
                  placeholder="Añadir otro concepto manualmente…"
                  className="flex-1 min-h-[40px] px-3 py-1.5 text-base sm:text-xs bg-transparent text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddCustomTerm}
                  disabled={!customTermInput.trim()}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 disabled:opacity-50 text-stone-800 dark:text-stone-200 font-semibold text-xs border border-stone-300 dark:border-stone-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                  Añadir
                </button>
              </div>

              {/* Terms Checklist */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {extractedTerms.length === 0 ? (
                  <div className="text-center py-8 px-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-2">
                    <p className="text-xs sm:text-sm font-medium text-stone-700 dark:text-stone-300">
                      El texto se procesó correctamente, pero no se identificaron conceptos técnicos en este fragmento.
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      Escribe un término en el campo superior para añadirlo manualmente o vuelve a ejecutar la extracción.
                    </p>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={handleExtractTerms}
                        disabled={isExtracting}
                        className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Volver a extraer conceptos</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  extractedTerms.map((t, idx) => (
                    <div
                      key={idx}
                      onClick={() => toggleTermSelection(idx)}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors cursor-pointer ${
                        t.selected
                          ? 'bg-white dark:bg-stone-900 border-indigo-400 dark:border-indigo-700'
                          : 'bg-stone-100/60 dark:bg-stone-900/40 border-stone-200 dark:border-stone-800 opacity-75'
                      }`}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={t.selected}
                        aria-label={`Seleccionar ${t.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTermSelection(idx);
                        }}
                        className="mt-0.5 min-h-[36px] min-w-[36px] -m-1.5 inline-flex items-center justify-center rounded-lg text-indigo-600 dark:text-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 shrink-0"
                      >
                        {t.selected ? (
                          <CheckSquare className="w-4 h-4 fill-indigo-600 text-white dark:fill-indigo-500 dark:text-stone-950" />
                        ) : (
                          <Square className="w-4 h-4 text-stone-400 dark:text-stone-500" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0 text-xs">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-stone-900 dark:text-stone-100 text-sm">
                            {t.name}
                          </span>

                          {t.academicField && (
                            <span className="text-xs text-stone-500 dark:text-stone-400">
                              · {t.academicField}
                            </span>
                          )}

                          {t.alreadyInGlossary && (
                            <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-md">
                              En tu glosario
                            </span>
                          )}

                          {t.cachedResult && (
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 inline-flex items-center gap-1">
                              <Database className="w-3 h-3" /> En caché local
                            </span>
                          )}
                        </div>

                        {t.contextSnippet && !isPlaceholderContextSnippet(t.contextSnippet) && (
                          <p className="text-xs text-stone-600 dark:text-stone-400 italic line-clamp-2 leading-relaxed">
                            "{t.contextSnippet}"
                          </p>
                        )}

                        {t.cachedResult && (
                          <div className="mt-2 pt-1.5 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-stone-500 dark:text-stone-400">
                              Consultado {getRelativeTime(t.cachedResult.analyzedAt).toLowerCase()}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleForceReverify(idx);
                              }}
                              className={`min-h-[28px] text-[11px] font-medium px-2.5 py-0.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                                t.forceReverify
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
                                  : 'text-indigo-700 dark:text-indigo-300 hover:underline'
                              }`}
                            >
                              {t.forceReverify ? '✓ Se actualizará la consulta' : 'Actualizar consulta'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Action Hierarchy for the 3 Modalities */}
              <div className="pt-3 border-t border-stone-200 dark:border-stone-800 space-y-3">
                <div className="text-xs text-stone-600 dark:text-stone-400 flex items-center justify-between">
                  <span>
                    Conceptos seleccionados:{' '}
                    <strong className="text-stone-900 dark:text-stone-100">
                      {extractedTerms.filter((t) => t.selected).length}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setStage('preview')}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  >
                    Volver a la vista previa
                  </button>
                </div>

                {/* Primary Action: Contextual Definition */}
                <button
                  type="button"
                  onClick={() =>
                    executeBatchOperation(extractedTerms.filter((t) => t.selected), 'contextual')
                  }
                  disabled={extractedTerms.filter((t) => t.selected).length === 0}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
                >
                  <BookOpen className="w-4 h-4 shrink-0" />
                  <span>
                    Generar definiciones contextuales ({extractedTerms.filter((t) => t.selected).length} seleccionados)
                  </span>
                </button>

                {/* Secondary Actions: External Web Search & Grounding */}
                <div className="pt-1 space-y-1.5">
                  <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                    O consultar directamente con fuentes externas:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        executeBatchOperation(extractedTerms.filter((t) => t.selected), 'google_search')
                      }
                      disabled={extractedTerms.filter((t) => t.selected).length === 0}
                      className="min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium rounded-xl bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50 disabled:pointer-events-none text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
                    >
                      <Search className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                      <span>Buscar fuentes en Google</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        executeBatchOperation(extractedTerms.filter((t) => t.selected), 'grounding')
                      }
                      disabled={extractedTerms.filter((t) => t.selected).length === 0}
                      className="min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium rounded-xl bg-white dark:bg-stone-900 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50 disabled:pointer-events-none text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                      <span>Contrastar con Google Grounding</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STAGE: VERIFYING BATCH WITH PROGRESS & CANCELLATION */}
          {stage === 'verifying' && (
            <div
              role="status"
              aria-live="polite"
              className="py-10 flex flex-col items-center justify-center text-center space-y-4"
            >
              <div className="relative flex items-center justify-center">
                <RefreshCw className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-spin motion-reduce:animate-none" />
              </div>

              <div className="space-y-1.5 max-w-sm">
                <h3 className="font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100">
                  {batchProgress.mode === 'grounding'
                    ? 'Contrastando con Google Grounding'
                    : batchProgress.mode === 'google_search'
                    ? 'Buscando fuentes en Google'
                    : 'Generando definiciones contextuales'}{' '}
                  ({batchProgress.currentIndex} de {batchProgress.total})
                </h3>
                <p className="text-xs sm:text-sm text-indigo-700 dark:text-indigo-300 font-semibold truncate">
                  «{batchProgress.currentTerm}»
                </p>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                  {batchProgress.mode === 'grounding'
                    ? 'Contrastando afirmaciones con fuentes académicas documentadas.'
                    : batchProgress.mode === 'google_search'
                    ? 'Localizando referencias bibliográficas y enlaces web.'
                    : 'Redactando definición académica, explicación sencilla y ejemplo según tus apuntes.'}
                </p>
              </div>

              {/* Progress bar */}
              <div
                role="progressbar"
                aria-valuenow={batchProgress.percentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso del análisis de conceptos"
                className="w-full max-w-xs bg-stone-200 dark:bg-stone-800 rounded-full h-2 overflow-hidden"
              >
                <div
                  className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full transition-all duration-200"
                  style={{ width: `${batchProgress.percentage}%` }}
                />
              </div>

              {/* Cancel Button */}
              <button
                type="button"
                onClick={handleCancelAnalysis}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 font-medium text-xs hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 mt-2"
              >
                <StopCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <span>Detener y ver resultados actuales</span>
              </button>
            </div>
          )}

          {/* STAGE: RESULTS */}
          {stage === 'results' && (
            <div className="space-y-5">
              {/* Results Header Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-stone-800">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100">
                    Conceptos analizados ({successfulCount} listos
                    {failedCount > 0 ? `, ${failedCount} con error` : ''})
                  </h3>
                  <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
                    Revisa las definiciones, profundiza en fuentes externas si lo necesitas o guárdalas en tu glosario.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {failedCount > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectiveRetry}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-semibold text-xs hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                      <span>Reintentar fallidos ({failedCount})</span>
                    </button>
                  )}

                  {successfulCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSaveToGlossary()}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span>Guardar todos en el glosario</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Multi-selection Toolbar for Batch Operations in Results */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-xs gap-2.5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selectedResultsCount === verifiedResults.length && verifiedResults.length > 0}
                    onClick={() => handleSelectAllResults(selectedResultsCount < verifiedResults.length)}
                    className="min-h-[36px] inline-flex items-center gap-2 font-medium text-stone-700 dark:text-stone-300 hover:text-indigo-700 dark:hover:text-indigo-300 rounded-lg px-1.5 py-1 -ml-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  >
                    {selectedResultsCount === verifiedResults.length && verifiedResults.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600 fill-indigo-600 dark:fill-indigo-500 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-stone-400 dark:text-stone-500 shrink-0" />
                    )}
                    <span>
                      {selectedResultsCount > 0
                        ? `${selectedResultsCount} seleccionados para consulta en lote`
                        : 'Seleccionar conceptos para consulta en lote'}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                    En lote:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleBatchActionInResults('google_search')}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  >
                    <Search className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                    <span>Buscar fuentes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchActionInResults('grounding')}
                    className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                    <span>Contrastar Grounding</span>
                  </button>
                </div>
              </div>

              {/* Results Cards List */}
              <div className="space-y-4">
                {verifiedResults.map((r, i) => {
                  const isExpanded = expandedCard === r.termName;

                  if (r.hasError) {
                    return (
                      <div
                        key={i}
                        role="alert"
                        className="bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl p-4 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-red-900 dark:text-red-200">
                            {r.termName}
                          </span>
                          <span className="text-[11px] font-semibold text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/60 px-2.5 py-0.5 rounded-md">
                            No completado
                          </span>
                        </div>
                        <p className="text-red-700 dark:text-red-300 text-xs leading-relaxed">
                          {r.errorDetails || 'No pudimos completar la consulta por un problema de conexión o límite de uso. Puedes reintentarlo arriba.'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <article
                      key={i}
                      className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4 sm:p-5 space-y-4 text-xs"
                    >
                      {/* Simplified Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={!!r.selectedForBatch}
                            aria-label={`Seleccionar ${r.termName} para operación en lote`}
                            onClick={() => toggleResultSelection(r.termName)}
                            className="mt-0.5 min-h-[36px] min-w-[36px] -m-1.5 inline-flex items-center justify-center rounded-lg text-stone-400 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 shrink-0"
                          >
                            {r.selectedForBatch ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600 fill-indigo-600 dark:fill-indigo-500 dark:text-stone-950" />
                            ) : (
                              <Square className="w-4 h-4 text-stone-400 dark:text-stone-500" />
                            )}
                          </button>

                          <div className="min-w-0 space-y-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <h4 className="font-bold text-base text-stone-900 dark:text-stone-100 leading-snug">
                                {r.termName}
                              </h4>
                              {r.academicField && (
                                <span className="text-xs text-stone-500 dark:text-stone-400">
                                  · {r.academicField}
                                </span>
                              )}
                            </div>

                            {/* Single clear status line */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {r.queryStatus === 'contrastado_web' ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${
                                    r.verificationStatus === 'verificado'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70'
                                      : r.verificationStatus === 'discrepancia'
                                      ? 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70'
                                      : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/70'
                                  }`}
                                >
                                  <ShieldCheck className="w-3 h-3 shrink-0" />
                                  <span>
                                    {r.verificationStatus === 'verificado'
                                      ? 'Contrastado con fuentes web'
                                      : r.verificationStatus === 'discrepancia'
                                      ? 'Discrepancia entre fuentes'
                                      : 'Sin respaldo suficiente en fuentes'}
                                  </span>
                                </span>
                              ) : r.queryStatus === 'fuentes_consultadas' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 border border-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:border-stone-700">
                                  <Search className="w-3 h-3 shrink-0" />
                                  <span>Fuentes web consultadas ({r.sources.length})</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 dark:text-stone-400">
                                  <BookOpen className="w-3 h-3 shrink-0" />
                                  <span>Análisis de tus apuntes (sin verificar en web)</span>
                                </span>
                              )}

                              {r.isFromCache && (
                                <span className="text-[11px] text-stone-500 dark:text-stone-400 inline-flex items-center gap-1">
                                  <Database className="w-3 h-3 shrink-0" />
                                  <span>En caché</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Top Right: Unmistakable Glossary Save Button */}
                        <div className="shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSaveToGlossary(r)}
                            disabled={r.savedToGlossary}
                            aria-label={
                              r.savedToGlossary
                                ? `${r.termName} ya está guardado en el glosario`
                                : `Guardar ${r.termName} en el glosario`
                            }
                            className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                              r.savedToGlossary
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70 cursor-default'
                                : 'bg-stone-100 hover:bg-indigo-50 text-stone-800 hover:text-indigo-700 border border-stone-300 hover:border-indigo-300 dark:bg-stone-800 dark:hover:bg-indigo-950/60 dark:text-stone-200 dark:hover:text-indigo-300 dark:border-stone-700'
                            }`}
                          >
                            {r.savedToGlossary ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>Guardado</span>
                              </>
                            ) : (
                              <>
                                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                                <span>+ Glosario</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Action Error Banner when preserving a previous valid definition */}
                      {r.errorDetails && (
                        <div
                          role="alert"
                          className="p-3 rounded-xl bg-red-50/80 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-200 leading-relaxed flex items-start gap-2"
                        >
                          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                          <span>
                            {r.errorDetails} Se conserva la definición válida anterior.
                          </span>
                        </div>
                      )}

                      {/* Notice / Quota Banner */}
                      {r.notice && (
                        <div
                          className={`p-3 rounded-xl text-xs leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                            r.quotaExceeded
                              ? 'bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
                              : 'bg-stone-100/70 dark:bg-stone-950/60 border border-stone-200/80 dark:border-stone-800 text-stone-600 dark:text-stone-400'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <p>{r.notice}</p>
                            {r.quotaExceeded && (
                              <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                                Puedes consultar bibliografía directamente en Google Académico:
                              </p>
                            )}
                          </div>
                          {r.quotaExceeded && (
                            <a
                              href={`https://scholar.google.com/scholar?q=${encodeURIComponent(r.termName)}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="min-h-[36px] shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-950 dark:text-amber-100 font-semibold text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                            >
                              <span>Google Académico</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Primary Content: Academic Definition */}
                      <div className="space-y-1">
                        <p className="font-semibold text-stone-500 dark:text-stone-400 text-[11px] uppercase tracking-wider">
                          Definición académica
                        </p>
                        <p className="text-sm sm:text-[15px] text-stone-900 dark:text-stone-100 leading-relaxed whitespace-pre-line max-w-prose">
                          {r.academicDefinition}
                        </p>
                      </div>

                      {/* Visual Support: Plain Explanation */}
                      {r.plainExplanation && (
                        <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-950/70 border border-stone-200/80 dark:border-stone-800 space-y-1">
                          <p className="font-semibold text-stone-700 dark:text-stone-300 text-xs">
                            En lenguaje sencillo
                          </p>
                          <p className="text-xs sm:text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-line max-w-prose">
                            {r.plainExplanation}
                          </p>
                        </div>
                      )}

                      {/* Expandable Didactic Example */}
                      {r.illustrativeExample && (
                        <div>
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedCard(isExpanded ? null : r.termName)}
                            className="min-h-[36px] inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200 rounded-lg px-2 py-1 -ml-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-4 h-4 shrink-0" />
                                <span>Ocultar ejemplo práctico</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-4 h-4 shrink-0" />
                                <span>Ver ejemplo práctico</span>
                              </>
                            )}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 p-3.5 rounded-xl bg-stone-50 dark:bg-stone-950/50 border-l-2 border-indigo-600 dark:border-indigo-400 space-y-1">
                              <p className="font-semibold text-stone-800 dark:text-stone-200 text-xs">
                                Ejemplo práctico
                              </p>
                              <p className="text-xs sm:text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-line max-w-prose">
                                {r.illustrativeExample}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Grounding Supported Segments (Grounding mode) */}
                      {r.supportedSegments && r.supportedSegments.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/25 border border-emerald-200/70 dark:border-emerald-800/40 space-y-1.5">
                          <p className="font-semibold text-emerald-900 dark:text-emerald-300 text-xs">
                            Afirmaciones respaldadas por fuentes web
                          </p>
                          <ul className="list-disc pl-4 space-y-1 text-xs text-emerald-950 dark:text-emerald-200 leading-relaxed">
                            {r.supportedSegments.map((seg, sIdx) => (
                              <li key={sIdx}>{seg}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Authentic Sources Section (Search or Grounding) */}
                      {r.sources && r.sources.length > 0 && (
                        <div className="pt-3 border-t border-stone-200/80 dark:border-stone-800 space-y-2">
                          <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                            {r.queryStatus === 'contrastado_web'
                              ? `Fuentes de verificación (${r.sources.length})`
                              : `Fuentes web consultadas (${r.sources.length})`}
                          </p>

                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {r.sources.map((s, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-950/60 border border-stone-200/80 dark:border-stone-800 space-y-1"
                              >
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="inline-flex items-center justify-between gap-2 w-full text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded"
                                >
                                  <span className="line-clamp-1">{s.title || s.url}</span>
                                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                                </a>
                                {s.snippet && (
                                  <p className="text-xs text-stone-600 dark:text-stone-400 italic line-clamp-2 leading-relaxed">
                                    "{s.snippet}"
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Subordinated Individual Deepening Actions */}
                      <div className="pt-3 border-t border-stone-200/70 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-3 flex-wrap text-[11px] text-stone-500 dark:text-stone-400">
                          <span className="font-medium text-stone-600 dark:text-stone-400">
                            Profundizar este concepto:
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>{formatDateTime(r.consultedAt || r.analyzedAt)}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Button: Buscar fuentes en Google */}
                          <button
                            type="button"
                            disabled={r.isLoadingAction}
                            onClick={() => handleSingleTermAction(r.termName, 'google_search')}
                            className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                              r.queryStatus === 'fuentes_consultadas'
                                ? 'bg-stone-200/80 text-stone-900 border-stone-400 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600'
                                : 'bg-stone-50 hover:bg-stone-100 dark:bg-stone-950 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700'
                            }`}
                          >
                            {r.isLoadingAction ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none text-stone-500 shrink-0" />
                            ) : (
                              <Search className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                            )}
                            <span>Buscar fuentes en Google</span>
                          </button>

                          {/* Button: Contrastar con Google Grounding */}
                          <button
                            type="button"
                            disabled={r.isLoadingAction}
                            onClick={() => handleSingleTermAction(r.termName, 'grounding')}
                            className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                              r.queryStatus === 'contrastado_web'
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800'
                                : 'bg-stone-50 hover:bg-stone-100 dark:bg-stone-950 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700'
                            }`}
                          >
                            {r.isLoadingAction ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none text-stone-500 shrink-0" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 shrink-0" />
                            )}
                            <span>Contrastar con Grounding</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Bottom Finish and Close */}
              <div className="flex items-center justify-between pt-3 border-t border-stone-200 dark:border-stone-800 text-xs">
                <span className="text-stone-600 dark:text-stone-400">
                  {successfulCount} de {verifiedResults.length} conceptos listos
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-5 py-2.5 font-semibold rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
                >
                  Finalizar y cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
