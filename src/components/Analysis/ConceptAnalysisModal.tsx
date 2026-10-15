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
  const { glossary, saveMultipleConcepts, showNotification, updateNote } = useApp();

  const textToAnalyze = initialText || note?.content || '';
  const noteSubject = note?.subject || 'General';
  const noteTitle = note?.title || 'Apunte académico';

  // Modal Stages: 'preview' -> 'detecting' -> 'review' -> 'verifying' -> 'results'
  const [stage, setStage] = useState<'preview' | 'detecting' | 'review' | 'verifying' | 'results'>('preview');
  const [extractedTerms, setExtractedTerms] = useState<ExtractedTerm[]>([]);
  const [verifiedResults, setVerifiedResults] = useState<VerifiedResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customTermInput, setCustomTermInput] = useState('');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

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

    setStage('detecting');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/analyze/extract-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToAnalyze,
          subject: noteSubject,
          noteTitle,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error en servidor: ${response.statusText}`);
      }

      const data = await response.json();
      const rawTerms: any[] = data.terms || [];

      // Check duplicates with local glossary and cache
      const existingGlossaryNames = new Set(glossary.map((g) => g.normalizedName));

      const processedTerms: ExtractedTerm[] = await Promise.all(
        rawTerms.map(async (t) => {
          const norm = (t.name || '').trim().toLowerCase();
          const inGlossary = existingGlossaryNames.has(norm);
          const cached = await localDB.getCachedAnalysis(norm);

          return {
            name: t.name,
            normalizedName: norm,
            academicField: t.academicField || noteSubject,
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
      setErrorMessage(err?.message || 'Error al conectar con el analizador de conceptos.');
      setStage('preview');
    }
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
    const inGlossary = glossary.some((g) => g.normalizedName === norm);
    const cached = await localDB.getCachedAnalysis(norm);

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
      if (
        termItem.cachedResult &&
        !termItem.forceReverify &&
        termItem.cachedResult.academicDefinition &&
        !termItem.cachedResult.academicDefinition.toLowerCase().includes('error al contactar') &&
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
              ? 'Contrastado con fuentes web vía Google Search Grounding'
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
            term: {
              name: termItem.name,
              context: termItem.contextSnippet,
              subject: termItem.academicField,
            },
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
          selectedForBatch: true,
        };

        // Cache in IndexedDB
        await localDB.saveCachedAnalysis({
          termKey: termItem.normalizedName,
          termName: resItem.termName,
          academicField: resItem.academicField,
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
        });

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
          accumulatedResults[existingIdx] = errorResult;
        } else {
          accumulatedResults.push(errorResult);
        }
        setVerifiedResults([...accumulatedResults]);
      }
    }

    setStage('results');

    if (note) {
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
          term: {
            name: target.termName,
            context: target.context,
            subject: target.academicField,
          },
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
        verificationStatus: resItem.verificationStatus || target.verificationStatus,
        queryStatus: resItem.queryStatus || (mode === 'google_search' ? 'fuentes_consultadas' : mode === 'grounding' ? 'contrastado_web' : 'sin_verificar'),
        queriesConsulted: resItem.queriesConsulted || target.queriesConsulted,
        consultedAt: resItem.consultedAt || new Date().toISOString(),
        notice: resItem.notice,
        groundingUsed: resItem.groundingUsed,
        quotaExceeded: resItem.quotaExceeded,
        isFromCache: false,
        isLoadingAction: false,
        hasError: false,
      };

      // Update in cache
      await localDB.saveCachedAnalysis({
        termKey: target.termName.trim().toLowerCase(),
        termName: target.termName,
        academicField: updated.academicField,
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
      });

      setVerifiedResults((prev) =>
        prev.map((r) => (r.termName === termName ? updated : r))
      );

      const msg =
        mode === 'google_search'
          ? `Fuentes de Google Search consultadas para "${termName}".`
          : mode === 'grounding'
          ? `Verificación con Google Grounding completada para "${termName}".`
          : `Definición contextual actualizada para "${termName}".`;
      showNotification(msg, 'success');
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

      return {
        id: `concept-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        termName: r.termName,
        normalizedName: r.termName.trim().toLowerCase(),
        academicField: r.academicField,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5">
      <div className="w-full max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-zinc-50 leading-tight">
                Análisis de Conceptos y Términos Técnicos
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {noteTitle} {note?.subject ? `· #${note.subject}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body with internal scrolling */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Ocurrió un error</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* STAGE: PREVIEW */}
          {stage === 'preview' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-950 dark:text-indigo-200 leading-relaxed">
                <p className="font-semibold mb-1.5 flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                  <Layers className="w-4 h-4" /> Niveles de consulta a tu elección
                </p>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">A. Contextual (Predeterminado):</span>
                    <span>Definiciones académicas por IA basadas en el texto sin búsquedas web automáticas.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">B. Buscar en Google:</span>
                    <span>Enlaces y referencias reales de publicaciones y literatura universitaria.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">C. Google Grounding:</span>
                    <span>Verificación estricta contrastando afirmaciones contra fuentes web.</span>
                  </div>
                </div>
              </div>

              {isAlreadyAnalyzed && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-200">
                  <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Este contenido fue analizado previamente. Puedes re-analizarlo o consultar nuevas fuentes si lo deseas.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Texto que será analizado ({textToAnalyze.length} caracteres)
                </label>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed font-sans">
                  {textToAnalyze.slice(0, 800)}
                  {textToAnalyze.length > 800 && (
                    <span className="text-slate-400 dark:text-zinc-500 italic">
                      ... (+{textToAnalyze.length - 800} caracteres adicionales)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-xl text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExtractTerms}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-sm active:scale-95"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Extraer términos técnicos</span>
                </button>
              </div>
            </div>
          )}

          {/* STAGE: DETECTING SPINNER */}
          {stage === 'detecting' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <p className="font-semibold text-sm text-slate-900 dark:text-zinc-100">
                Extrayendo términos técnicos y revisando caché local...
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-xs">
                Identificando conceptos compuestos en el texto sin llamadas externas a la web.
              </p>
            </div>
          )}

          {/* STAGE: REVIEW EXTRACTED TERMS */}
          {stage === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100">
                    Términos detectados ({extractedTerms.length})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Elige los conceptos y la modalidad deseada para continuar.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => handleSelectAll(true)}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    Todos
                  </button>
                  <span>·</span>
                  <button
                    onClick={() => handleSelectAll(false)}
                    className="text-slate-500 hover:underline"
                  >
                    Ninguno
                  </button>
                </div>
              </div>

              {/* Add custom term input */}
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700">
                <input
                  type="text"
                  value={customTermInput}
                  onChange={(e) => setCustomTermInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTerm()}
                  placeholder="Agregar término manualmente..."
                  className="flex-1 px-2.5 py-1 text-xs bg-transparent text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddCustomTerm}
                  className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-medium text-xs hover:bg-indigo-700 transition"
                >
                  Agregar
                </button>
              </div>

              {/* Terms Checklist */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {extractedTerms.length === 0 ? (
                  <p className="text-xs text-center py-6 text-slate-400 dark:text-zinc-500 italic">
                    No se detectaron términos específicos. Puedes agregar uno manualmente arriba.
                  </p>
                ) : (
                  extractedTerms.map((t, idx) => (
                    <div
                      key={idx}
                      onClick={() => toggleTermSelection(idx)}
                      className={`flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                        t.selected
                          ? 'bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800'
                          : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 opacity-60'
                      }`}
                    >
                      <button type="button" className="mt-0.5 text-indigo-600 dark:text-indigo-400">
                        {t.selected ? (
                          <CheckSquare className="w-4 h-4 fill-indigo-600 text-white" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0 text-xs">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-bold text-slate-900 dark:text-zinc-100 text-sm">
                            {t.name}
                          </span>

                          {t.isCompound && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-violet-100 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300">
                              Compuesto
                            </span>
                          )}

                          {t.cachedResult && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                              <Database className="w-3 h-3" /> En caché local
                            </span>
                          )}

                          {t.alreadyInGlossary && (
                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.2 rounded">
                              ✓ En glosario
                            </span>
                          )}

                          {t.academicField && (
                            <span className="text-[10px] font-medium text-slate-500 dark:text-zinc-400">
                              #{t.academicField}
                            </span>
                          )}
                        </div>

                        {t.contextSnippet && (
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400 italic line-clamp-2">
                            "{t.contextSnippet}"
                          </p>
                        )}

                        {t.cachedResult && (
                          <div className="mt-1 pt-1 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">
                              {getRelativeTime(t.cachedResult.analyzedAt)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleForceReverify(idx);
                              }}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded transition ${
                                t.forceReverify
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'text-indigo-600 hover:underline'
                              }`}
                            >
                              {t.forceReverify ? '✓ Forzará nueva consulta' : 'Forzar nueva consulta'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Action Buttons for the 3 Modalities */}
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 space-y-2">
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center justify-between">
                  <span>
                    Seleccionados: <strong>{extractedTerms.filter((t) => t.selected).length}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setStage('preview')}
                    className="text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:underline"
                  >
                    Atrás
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Modality A: Default Contextual Definition */}
                  <button
                    type="button"
                    onClick={() =>
                      executeBatchOperation(extractedTerms.filter((t) => t.selected), 'contextual')
                    }
                    disabled={extractedTerms.filter((t) => t.selected).length === 0}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition shadow-sm active:scale-95"
                    title="Definición contextual con IA sin búsquedas externas (modo predeterminado)"
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>Definición contextual (Predeterminado)</span>
                  </button>

                  {/* Modality B: Google Search */}
                  <button
                    type="button"
                    onClick={() =>
                      executeBatchOperation(extractedTerms.filter((t) => t.selected), 'google_search')
                    }
                    disabled={extractedTerms.filter((t) => t.selected).length === 0}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-50 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 transition active:scale-95"
                    title="Busca enlaces y referencias académicas en Google Search"
                  >
                    <Search className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Buscar fuentes en Google</span>
                  </button>

                  {/* Modality C: Google Grounding */}
                  <button
                    type="button"
                    onClick={() =>
                      executeBatchOperation(extractedTerms.filter((t) => t.selected), 'grounding')
                    }
                    disabled={extractedTerms.filter((t) => t.selected).length === 0}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-50 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 transition active:scale-95"
                    title="Verificación rigurosa con Google Search Grounding"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Verificar con Google Grounding</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STAGE: VERIFYING BATCH WITH PROGRESS & CANCELLATION */}
          {stage === 'verifying' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <RefreshCw className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-spin" />
                {batchProgress.mode === 'grounding' ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                ) : batchProgress.mode === 'google_search' ? (
                  <Search className="w-5 h-5 text-blue-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                ) : (
                  <Sparkles className="w-5 h-5 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                )}
              </div>

              <div className="space-y-1 max-w-sm">
                <h4 className="font-bold text-sm text-slate-900 dark:text-zinc-100">
                  {batchProgress.mode === 'grounding'
                    ? 'Verificando con Google Grounding'
                    : batchProgress.mode === 'google_search'
                    ? 'Buscando fuentes en Google Search'
                    : 'Generando definiciones contextuales'}{' '}
                  ({batchProgress.currentIndex} de {batchProgress.total})
                </h4>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold truncate">
                  «{batchProgress.currentTerm}»
                </p>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {batchProgress.mode === 'grounding'
                    ? 'Contrastando afirmaciones con fuentes web documentadas.'
                    : batchProgress.mode === 'google_search'
                    ? 'Extrayendo referencias y fragmentos verificables.'
                    : 'Estructurando definiciones y ejemplos según el contexto.'}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-xs bg-slate-100 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${batchProgress.percentage}%` }}
                />
              </div>

              {/* Cancel Button */}
              <button
                type="button"
                onClick={handleCancelAnalysis}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-semibold text-xs hover:bg-red-100 transition active:scale-95 mt-2"
              >
                <StopCircle className="w-4 h-4" />
                <span>Cancelar proceso</span>
              </button>
            </div>
          )}

          {/* STAGE: RESULTS */}
          {stage === 'results' && (
            <div className="space-y-4">
              {/* Results Header Toolbar */}
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100 dark:border-zinc-800">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100">
                    Conceptos analizados ({successfulCount} listos
                    {failedCount > 0 ? `, ${failedCount} fallidos` : ''})
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Elige el nivel de consulta para cada concepto o aplica una modalidad a los seleccionados.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {failedCount > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectiveRetry}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 font-semibold text-xs hover:bg-amber-100 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reintentar fallidos ({failedCount})</span>
                    </button>
                  )}

                  {successfulCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSaveToGlossary()}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 transition shadow-xs"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Guardar todo en Glosario</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Multi-selection Toolbar for Batch Operations in Results */}
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-800 text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectAllResults(selectedResultsCount < verifiedResults.length)}
                    className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-zinc-300 hover:text-indigo-600"
                  >
                    {selectedResultsCount === verifiedResults.length ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>
                      {selectedResultsCount > 0
                        ? `${selectedResultsCount} seleccionados`
                        : 'Seleccionar para lote'}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400">Aplicar a seleccionados:</span>
                  <button
                    type="button"
                    onClick={() => handleBatchActionInResults('google_search')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 font-medium text-[11px] hover:bg-blue-100 transition"
                  >
                    <Search className="w-3 h-3" />
                    <span>Buscar fuentes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchActionInResults('grounding')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 font-medium text-[11px] hover:bg-emerald-100 transition"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>Verificar Grounding</span>
                  </button>
                </div>
              </div>

              {/* Results Cards List */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {verifiedResults.map((r, i) => {
                  const isExpanded = expandedCard === r.termName;

                  if (r.hasError) {
                    return (
                      <div
                        key={i}
                        className="bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl p-3.5 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-red-900 dark:text-red-200">
                            {r.termName}
                          </span>
                          <span className="text-[10px] font-semibold text-red-700 bg-red-100 dark:bg-red-900/60 px-2 py-0.5 rounded-full">
                            Error en consulta
                          </span>
                        </div>
                        <p className="text-red-600 dark:text-red-400 text-[11px]">
                          {r.errorDetails || 'Problema de red o cuota al conectar con el servicio.'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={i}
                      className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl p-3.5 space-y-2.5 text-xs transition"
                    >
                      {/* Top bar with term name, checkbox, and status badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => toggleResultSelection(r.termName)}
                            className="mt-0.5 text-slate-400 hover:text-indigo-600"
                          >
                            {r.selectedForBatch ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600 fill-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </button>

                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900 dark:text-zinc-50">
                                {r.termName}
                              </span>

                              {/* Query Status Badge */}
                              {r.queryStatus === 'contrastado_web' ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                    r.verificationStatus === 'verificado'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : r.verificationStatus === 'discrepancia'
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                      : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                  }`}
                                  title="Contrastado mediante Google Search Grounding"
                                >
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>
                                    {r.verificationStatus === 'verificado'
                                      ? 'Contrastado con fuentes web'
                                      : r.verificationStatus === 'discrepancia'
                                      ? 'Discrepancia entre fuentes'
                                      : 'Sin respaldo suficiente'}
                                  </span>
                                </span>
                              ) : r.queryStatus === 'fuentes_consultadas' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" title="Fuentes consultadas en Google Search">
                                  <Search className="w-3 h-3" />
                                  <span>Fuentes consultadas ({r.sources.length})</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300" title="Definición contextual generada por IA sin búsqueda externa">
                                  <BookOpen className="w-3 h-3" />
                                  <span>Sin verificar (Contextual IA)</span>
                                </span>
                              )}

                              {r.isFromCache && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 flex items-center gap-1">
                                  <Database className="w-2.5 h-2.5" /> En caché
                                </span>
                              )}

                              <span className="text-slate-400 text-[11px]">#{r.academicField}</span>
                            </div>

                            <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Consulta: {formatDateTime(r.consultedAt || r.analyzedAt)}</span>
                            </p>
                          </div>
                        </div>

                        {/* Top Right: Save and Expand */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleSaveToGlossary(r)}
                            disabled={r.savedToGlossary}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                              r.savedToGlossary
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400 hover:bg-indigo-100'
                            }`}
                          >
                            {r.savedToGlossary ? 'Guardado ✓' : '+ Glosario'}
                          </button>
                          <button
                            onClick={() => setExpandedCard(isExpanded ? null : r.termName)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Modal Notice / Disclaimer Banner */}
                      {r.notice && (
                        <div
                          className={`p-2 rounded-xl text-[11px] leading-tight flex items-start justify-between gap-2 ${
                            r.quotaExceeded
                              ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200'
                              : 'bg-slate-100/80 dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <p>{r.notice}</p>
                            {r.quotaExceeded && (
                              <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                                Consulta fuentes externas directamente en la web académica:
                              </p>
                            )}
                          </div>
                          {r.quotaExceeded && (
                            <a
                              href={`https://scholar.google.com/scholar?q=${encodeURIComponent(r.termName)}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-900 dark:text-amber-100 font-semibold text-[10px] transition"
                            >
                              <span>Google Académico</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Academic definition */}
                      <div>
                        <p className="font-semibold text-slate-700 dark:text-zinc-300 text-[11px]">
                          Definición contextual:
                        </p>
                        <p className="text-slate-600 dark:text-zinc-400 leading-relaxed mt-0.5">
                          {r.academicDefinition}
                        </p>
                      </div>

                      {/* Plain Explanation */}
                      {r.plainExplanation && (
                        <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800">
                          <p className="font-semibold text-slate-700 dark:text-zinc-300 text-[11px]">
                            En lenguaje sencillo:
                          </p>
                          <p className="text-slate-600 dark:text-zinc-400 leading-relaxed mt-0.5">
                            {r.plainExplanation}
                          </p>
                        </div>
                      )}

                      {/* Illustrative Example (expandable) */}
                      {isExpanded && r.illustrativeExample && (
                        <div className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
                          <p className="font-semibold text-amber-900 dark:text-amber-300 text-[11px]">
                            Ejemplo ilustrativo:
                          </p>
                          <p className="text-slate-600 dark:text-zinc-400 leading-relaxed mt-0.5">
                            {r.illustrativeExample}
                          </p>
                        </div>
                      )}

                      {/* Grounding Supported Segments (Grounding mode) */}
                      {r.supportedSegments && r.supportedSegments.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 space-y-1">
                          <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-[10px] uppercase tracking-wider">
                            Afirmaciones respaldadas por fuentes web:
                          </p>
                          <ul className="list-disc pl-3.5 space-y-0.5 text-[11px] text-emerald-900 dark:text-emerald-200">
                            {r.supportedSegments.map((seg, sIdx) => (
                              <li key={sIdx}>{seg}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Authentic Sources Section (Search or Grounding) */}
                      {r.sources && r.sources.length > 0 && (
                        <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-800/60 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
                            <span>
                              {r.queryStatus === 'contrastado_web'
                                ? `Fuentes de verificación (${r.sources.length})`
                                : `Fuentes web en Google (${r.sources.length})`}
                            </span>
                          </div>

                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {r.sources.map((s, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/70 dark:border-zinc-800/70 space-y-1"
                              >
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="flex items-center justify-between text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  <span className="line-clamp-1">{s.title || s.url}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0 ml-1.5" />
                                </a>
                                {s.snippet && (
                                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 italic line-clamp-2">
                                    "{s.snippet}"
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Individual Action Buttons per Card */}
                      <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-800/60 flex items-center justify-between flex-wrap gap-2">
                        <span className="text-[10px] text-slate-400">
                          Acciones para este concepto:
                        </span>

                        <div className="flex items-center gap-1.5">
                          {/* Button: Buscar fuentes en Google */}
                          <button
                            type="button"
                            disabled={r.isLoadingAction}
                            onClick={() => handleSingleTermAction(r.termName, 'google_search')}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                              r.queryStatus === 'fuentes_consultadas'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700'
                            }`}
                            title="Buscar fuentes y referencias en Google Search"
                          >
                            {r.isLoadingAction ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                            ) : (
                              <Search className="w-3 h-3 text-blue-500" />
                            )}
                            <span>Buscar fuentes en Google</span>
                          </button>

                          {/* Button: Verificar con Google Grounding */}
                          <button
                            type="button"
                            disabled={r.isLoadingAction}
                            onClick={() => handleSingleTermAction(r.termName, 'grounding')}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                              r.queryStatus === 'contrastado_web'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700'
                            }`}
                            title="Verificación con Google Search Grounding"
                          >
                            {r.isLoadingAction ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-emerald-500" />
                            ) : (
                              <ShieldCheck className="w-3 h-3 text-emerald-500" />
                            )}
                            <span>Verificar con Google Grounding</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Finish and Close */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-xs">
                <span className="text-slate-400">
                  {successfulCount} de {verifiedResults.length} términos listos
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 font-semibold rounded-xl bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition active:scale-95"
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
