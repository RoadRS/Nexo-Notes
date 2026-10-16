import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { DocumentEntity } from '../../types/models';
import { processDocumentFile } from '../../utils/documentExtractor';
import {
  FolderArchive,
  UploadCloud,
  Trash2,
  Layers,
  Scan,
  Check,
  Loader2,
} from 'lucide-react';

export const LibraryView: React.FC<{
  onAnalyzeDocument: (doc: DocumentEntity, pageRange?: number[]) => void;
}> = ({ onAnalyzeDocument }) => {
  const { documents, saveDocument, deleteDocument, glossary, showNotification } = useApp();

  const [selectedDoc, setSelectedDoc] = useState<DocumentEntity | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // Close document modal on Escape
  useEffect(() => {
    if (!selectedDoc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDoc(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDoc]);

  // Handle native file selection for PDF, PPTX, PPT, TXT, MD
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsProcessing(true);
    setProcessingStatus(`Procesando ${file.name}…`);

    try {
      // Process file 100% locally on the device (no remote upload)
      const extraction = await processDocumentFile(file, (p) => {
        setProcessingStatus(p.message);
      });

      const newDoc: DocumentEntity = {
        id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        fileName: extraction.fileName,
        fileType: extraction.fileType,
        fileSize: file.size,
        pageCount: extraction.pageCount,
        subject: 'Lectura Universitaria',
        status: extraction.hasScannedPages ? 'cargado' : 'listo',
        pages: extraction.pages,
        createdAt: Date.now(),
      };

      await saveDocument(newDoc);
      showNotification(
        `"${extraction.fileName}" importado con éxito: ${extraction.pageCount} ${
          extraction.fileType === 'pptx' ? 'diapositivas' : 'páginas'
        } procesadas.${extraction.hasScannedPages ? ' (OCR aplicado en páginas escaneadas)' : ''}`,
        'success'
      );

      // Automatically open the imported document for range review
      setSelectedDoc(newDoc);
      setSelectedPages(newDoc.pages.map((p) => p.pageNumber));
      setRangeStart(1);
      setRangeEnd(newDoc.pageCount);
    } catch (err: any) {
      console.error('Error importando documento:', err);
      showNotification(
        `Error al extraer texto de ${file.name}: ${err?.message || 'Formato no soportado'}`,
        'error'
      );
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
      e.target.value = '';
    }
  };

  const handleOpenDoc = (doc: DocumentEntity) => {
    setSelectedDoc(doc);
    setSelectedPages(doc.pages.map((p) => p.pageNumber));
    setRangeStart(1);
    setRangeEnd(doc.pageCount);
  };

  const togglePageSelection = (num: number) => {
    if (selectedPages.includes(num)) {
      setSelectedPages(selectedPages.filter((p) => p !== num));
    } else {
      setSelectedPages([...selectedPages, num].sort((a, b) => a - b));
    }
  };

  const applyRangeFilter = () => {
    if (!selectedDoc) return;
    const start = Math.max(1, Math.min(rangeStart, selectedDoc.pageCount));
    const end = Math.max(start, Math.min(rangeEnd, selectedDoc.pageCount));

    const range: number[] = [];
    for (let i = start; i <= end; i++) {
      range.push(i);
    }
    setSelectedPages(range);
    showNotification(`Seleccionado intervalo: Páginas ${start} a ${end} (${range.length}).`, 'info');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const countConceptsForDoc = (docId: string) => {
    return glossary.filter((c) => c.documentId === docId).length;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-28 md:pb-16 pt-3 space-y-6">
      {/* Editorial Document Import Card */}
      <section
        aria-labelledby="library-import-heading"
        className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xs"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <FolderArchive className="w-3.5 h-3.5" />
              <span>Procesamiento 100 % en el dispositivo</span>
            </div>
            <h2
              id="library-import-heading"
              className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-100 tracking-tight"
            >
              Biblioteca de lecturas PDF y presentaciones PPTX
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              Importa capítulos de libros, artículos o diapositivas de clase. El texto se extrae localmente (con reconocimiento óptico OCR en páginas escaneadas) y cada concepto queda vinculado a su página o diapositiva de origen.
            </p>
          </div>

          <div className="shrink-0 flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end gap-2">
            <label
              className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors shadow-2xs focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 ${
                isProcessing
                  ? 'bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 cursor-wait'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
              }`}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <UploadCloud className="w-4 h-4 shrink-0" />
              )}
              <span>{isProcessing ? 'Procesando archivo…' : 'Importar documento'}</span>
              <input
                type="file"
                accept=".pdf,.pptx,.ppt,.txt,.md"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="sr-only"
              />
            </label>
            <span className="text-[11px] text-stone-500 dark:text-stone-400 text-center md:text-right">
              Formatos admitidos: PDF, PPTX, TXT, MD
            </span>
          </div>
        </div>

        {isProcessing && processingStatus && (
          <div
            role="status"
            aria-live="polite"
            className="mt-4 pt-3.5 border-t border-stone-200 dark:border-stone-800 flex items-center gap-2.5 text-xs font-medium text-indigo-600 dark:text-indigo-400"
          >
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>{processingStatus}</span>
          </div>
        )}
      </section>

      {/* Document List */}
      <section aria-labelledby="library-documents-heading">
        <div className="flex items-center justify-between mb-3.5">
          <h3
            id="library-documents-heading"
            className="font-semibold text-xs text-stone-600 dark:text-stone-400 uppercase tracking-wider"
          >
            Documentos guardados ({documents.length})
          </h3>
        </div>

        {documents.length === 0 ? (
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto my-4">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-300 mx-auto mb-4">
              <FolderArchive className="w-6 h-6 stroke-[1.75]" />
            </div>
            <h4 className="font-bold text-base text-stone-900 dark:text-stone-100">
              Aún no has importado lecturas ni presentaciones
            </h4>
            <p className="text-sm text-stone-600 dark:text-stone-400 mt-1.5 leading-relaxed">
              Usa el botón «Importar documento» de arriba para cargar archivos PDF o PPTX de tus asignaturas y analizar sus páginas por intervalos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
            {documents.map((doc) => {
              const conceptsCount = countConceptsForDoc(doc.id);
              const isPPT = doc.fileType === 'pptx' || doc.fileType === 'ppt';
              const hasOCR = doc.pages.some((p) => p.hasOCR);

              return (
                <article
                  key={doc.id}
                  onClick={() => handleOpenDoc(doc)}
                  className="group flex flex-col justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 cursor-pointer transition-colors shadow-2xs"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-[11px] shrink-0 uppercase border ${
                        isPPT
                          ? 'bg-amber-50 text-amber-800 border-amber-200/70 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50'
                          : doc.fileType === 'pdf'
                          ? 'bg-red-50 text-red-800 border-red-200/70 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/50'
                          : 'bg-stone-100 text-stone-800 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700'
                      }`}
                    >
                      <span>{doc.fileType}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-base text-stone-900 dark:text-stone-100 line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDoc(doc);
                            }}
                            className="text-left truncate max-w-full focus-visible:outline-none focus-visible:underline"
                          >
                            {doc.fileName}
                          </button>
                        </h4>
                        {hasOCR && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 inline-flex items-center gap-1">
                            <Scan className="w-3 h-3" />
                            <span>OCR</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap text-xs text-stone-500 dark:text-stone-400 mt-1">
                        <span>
                          {doc.pageCount} {isPPT ? 'diapositivas' : 'páginas'}
                        </span>
                        <span>·</span>
                        <span>{formatFileSize(doc.fileSize)}</span>
                        <span>·</span>
                        <span>{new Date(doc.createdAt).toLocaleDateString('es-ES')}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-stone-100 dark:border-stone-800/80">
                    <span className="text-xs font-medium text-stone-600 dark:text-stone-400">
                      {conceptsCount > 0
                        ? `${conceptsCount} ${
                            conceptsCount === 1 ? 'concepto en glosario' : 'conceptos en glosario'
                          }`
                        : 'Sin conceptos extraídos aún'}
                    </span>

                    <div className="flex items-center gap-1 shrink-0 -mr-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDocument(doc.id);
                        }}
                        aria-label={`Eliminar documento ${doc.fileName}`}
                        className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] rounded-lg text-stone-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                        title="Eliminar documento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDoc(doc);
                        }}
                        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Seleccionar páginas</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Document Reader & Interval Selection Modal / Bottom Sheet */}
      {selectedDoc && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setSelectedDoc(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="doc-reader-dialog-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-white dark:bg-stone-900 border-t sm:border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden safe-area-bottom"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/50 shrink-0">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase font-bold px-2 py-0.5 rounded-md bg-stone-200/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                    {selectedDoc.fileType}
                  </span>
                  <h3
                    id="doc-reader-dialog-title"
                    className="font-bold text-base text-stone-900 dark:text-stone-100 truncate"
                  >
                    {selectedDoc.fileName}
                  </h3>
                </div>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                  Total: {selectedDoc.pageCount}{' '}
                  {selectedDoc.fileType === 'pptx' ? 'diapositivas' : 'páginas'} · Seleccionadas para análisis:{' '}
                  <strong className="text-stone-800 dark:text-stone-200">
                    {selectedPages.length}
                  </strong>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedDoc(null)}
                  className="min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAnalyzeDocument(selectedDoc, selectedPages);
                    setSelectedDoc(null);
                  }}
                  disabled={selectedPages.length === 0}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold text-xs transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Analizar ({selectedPages.length})</span>
                </button>
              </div>
            </div>

            {/* Range Configuration Panel */}
            <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/60 text-xs flex items-center justify-between flex-wrap gap-3 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <label
                  htmlFor="doc-range-start"
                  className="font-semibold text-stone-700 dark:text-stone-300"
                >
                  Intervalo:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="doc-range-start"
                    type="number"
                    min={1}
                    max={selectedDoc.pageCount}
                    value={rangeStart}
                    onChange={(e) => setRangeStart(parseInt(e.target.value) || 1)}
                    aria-label="Página inicial"
                    className="w-16 min-h-[36px] px-2 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-center text-base sm:text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  <span className="text-stone-500">a</span>
                  <input
                    id="doc-range-end"
                    type="number"
                    min={1}
                    max={selectedDoc.pageCount}
                    value={rangeEnd}
                    onChange={(e) =>
                      setRangeEnd(parseInt(e.target.value) || selectedDoc.pageCount)
                    }
                    aria-label="Página final"
                    className="w-16 min-h-[36px] px-2 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-center text-base sm:text-xs font-semibold text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyRangeFilter}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-semibold text-xs transition-colors"
                >
                  Aplicar rango
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedPages(selectedDoc.pages.map((p) => p.pageNumber))}
                  className="min-h-[34px] px-2 text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  Todas ({selectedDoc.pageCount})
                </button>
                <span className="text-stone-300 dark:text-stone-700">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedPages([])}
                  className="min-h-[34px] px-2 text-stone-600 dark:text-stone-400 font-medium hover:underline"
                >
                  Ninguna
                </button>
              </div>
            </div>

            {/* Pages / Slides Scrollable List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {selectedDoc.pages.map((p) => {
                const isSelected = selectedPages.includes(p.pageNumber);
                const isPPT = selectedDoc.fileType === 'pptx' || selectedDoc.fileType === 'ppt';

                return (
                  <div
                    key={p.pageNumber}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() => togglePageSelection(p.pageNumber)}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        togglePageSelection(p.pageNumber);
                      }
                    }}
                    className={`p-4 rounded-xl border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                      isSelected
                        ? 'bg-indigo-50/40 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800'
                        : 'bg-stone-50/60 dark:bg-stone-950/50 border-stone-200 dark:border-stone-800 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white dark:bg-stone-900 border-stone-300 dark:border-stone-700'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                        </span>
                        <span className="font-bold text-xs text-stone-900 dark:text-stone-100">
                          {isPPT ? 'Diapositiva' : 'Página'} {p.pageNumber}
                        </span>
                        {p.hasOCR && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-stone-200/80 text-stone-800 dark:bg-stone-800 dark:text-stone-300 inline-flex items-center gap-1">
                            <Scan className="w-3 h-3" />
                            <span>OCR local</span>
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
                        {p.content.length} caract.
                      </span>
                    </div>

                    <p className="text-xs text-stone-600 dark:text-stone-400 line-clamp-3 leading-relaxed font-sans pl-7">
                      {p.content}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
