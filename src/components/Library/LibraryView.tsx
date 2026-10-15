import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DocumentEntity, DocumentPage } from '../../types/models';
import { processDocumentFile } from '../../utils/documentExtractor';
import {
  FolderArchive,
  UploadCloud,
  FileText,
  Trash2,
  Sparkles,
  Calendar,
  Layers,
  ChevronRight,
  Eye,
  CheckCircle2,
  Scan,
  Filter,
  Check,
  AlertCircle,
  FileSpreadsheet,
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

  // Handle native file selection for PDF, PPTX, PPT, TXT, MD
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsProcessing(true);
    setProcessingStatus(`Analizando ${file.name}...`);

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
    <div className="max-w-xl mx-auto px-4 pb-28 pt-2 space-y-5">
      {/* Upload Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 text-white p-5 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[11px] uppercase font-bold tracking-wider text-indigo-200">
                Almacenamiento Local Seguro
              </span>
            </div>
            <h3 className="text-base font-bold tracking-tight">
              Biblioteca de PDFs y Presentaciones PPTX
            </h3>
            <p className="text-xs text-indigo-100/90 mt-1 max-w-sm leading-relaxed">
              Extracción local de páginas, diapositivas, textos escaneados con OCR y vinculación de conceptos a la página de origen.
            </p>
          </div>
          <div className="p-2.5 rounded-2xl bg-white/10 backdrop-blur-xs shrink-0">
            <FolderArchive className="w-6 h-6 text-white" />
          </div>
        </div>

        {/* File Input */}
        <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-indigo-700 font-bold text-xs cursor-pointer hover:bg-indigo-50 transition shadow-sm active:scale-95">
            <UploadCloud className="w-4 h-4" />
            <span>{isProcessing ? processingStatus || 'Extrayendo...' : 'Importar PDF / PPTX'}</span>
            <input
              type="file"
              accept=".pdf,.pptx,.ppt,.txt,.md"
              onChange={handleFileUpload}
              disabled={isProcessing}
              className="hidden"
            />
          </label>

          <span className="text-[11px] text-indigo-200">
            Los archivos permanecen en el teléfono
          </span>
        </div>
      </div>

      {/* Document List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-bold text-xs text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
            Documentos en dispositivo ({documents.length})
          </h4>
        </div>

        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-14 px-4 bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3 shadow-inner">
              <FolderArchive className="w-7 h-7 stroke-[1.8]" />
            </div>
            <h5 className="font-bold text-sm text-slate-900 dark:text-zinc-100">
              No hay lecturas ni diapositivas importadas
            </h5>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-xs mt-1 mb-4">
              Usa el botón de arriba para importar un archivo PDF o una presentación PPTX del curso.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => {
              const conceptsCount = countConceptsForDoc(doc.id);
              const isPPT = doc.fileType === 'pptx' || doc.fileType === 'ppt';
              const hasOCR = doc.pages.some((p) => p.hasOCR);

              return (
                <div
                  key={doc.id}
                  onClick={() => handleOpenDoc(doc)}
                  className="group flex items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 hover:border-indigo-400 dark:hover:border-indigo-600 cursor-pointer transition shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center font-bold text-[10px] shrink-0 uppercase shadow-xs ${
                        isPPT
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                          : doc.fileType === 'pdf'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300'
                          : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300'
                      }`}
                    >
                      <span>{doc.fileType}</span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h5 className="font-bold text-sm text-slate-900 dark:text-zinc-100 line-clamp-1">
                          {doc.fileName}
                        </h5>
                        {hasOCR && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 flex items-center gap-0.5">
                            <Scan className="w-2.5 h-2.5" /> OCR
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                        <span>
                          {doc.pageCount} {isPPT ? 'diapositivas' : 'páginas'}
                        </span>
                        <span>·</span>
                        <span>{formatFileSize(doc.fileSize)}</span>
                        <span>·</span>
                        <span>{new Date(doc.createdAt).toLocaleDateString('es-ES')}</span>
                        {conceptsCount > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                              {conceptsCount} conceptos
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDoc(doc);
                      }}
                      className="p-2 rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition"
                      title="Abrir y seleccionar páginas"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDocument(doc.id);
                      }}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-500 transition"
                      title="Eliminar documento"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Document Reader & Interval Selection Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5">
          <div className="w-full max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden animate-scaleIn">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 shrink-0">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                    {selectedDoc.fileType}
                  </span>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100 truncate">
                    {selectedDoc.fileName}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  Total: {selectedDoc.pageCount} {selectedDoc.fileType === 'pptx' ? 'diapositivas' : 'páginas'} · Seleccionadas: {selectedPages.length}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    onAnalyzeDocument(selectedDoc, selectedPages);
                    setSelectedDoc(null);
                  }}
                  disabled={selectedPages.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs transition shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Analizar ({selectedPages.length})</span>
                </button>
                <button
                  onClick={() => setSelectedDoc(null)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Range Configuration Panel */}
            <div className="px-5 py-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/50 text-xs flex items-center justify-between flex-wrap gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600 dark:text-zinc-400">
                  Intervalo:
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={selectedDoc.pageCount}
                    value={rangeStart}
                    onChange={(e) => setRangeStart(parseInt(e.target.value) || 1)}
                    className="w-12 px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-center font-bold"
                  />
                  <span className="text-slate-400">a</span>
                  <input
                    type="number"
                    min={1}
                    max={selectedDoc.pageCount}
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(parseInt(e.target.value) || selectedDoc.pageCount)}
                    className="w-12 px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-center font-bold"
                  />
                </div>
                <button
                  onClick={applyRangeFilter}
                  className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-zinc-800 font-semibold text-[11px] hover:bg-slate-300 transition"
                >
                  Aplicar
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => setSelectedPages(selectedDoc.pages.map((p) => p.pageNumber))}
                  className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                >
                  Todas ({selectedDoc.pageCount})
                </button>
                <span>·</span>
                <button
                  onClick={() => setSelectedPages([])}
                  className="text-slate-500 hover:underline"
                >
                  Ninguna
                </button>
              </div>
            </div>

            {/* Pages / Slides Scrollable List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {selectedDoc.pages.map((p) => {
                const isSelected = selectedPages.includes(p.pageNumber);
                const isPPT = selectedDoc.fileType === 'pptx' || selectedDoc.fileType === 'ppt';

                return (
                  <div
                    key={p.pageNumber}
                    onClick={() => togglePageSelection(p.pageNumber)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800'
                        : 'bg-slate-50/50 dark:bg-zinc-950/50 border-slate-200 dark:border-zinc-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-zinc-100">
                          {isPPT ? 'Diapositiva' : 'Página'} {p.pageNumber}
                        </span>
                        {p.hasOCR && (
                          <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 flex items-center gap-1">
                            <Scan className="w-3 h-3" /> OCR local
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {p.content.length} caracteres
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-3 leading-relaxed font-sans">
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
