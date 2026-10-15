import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ConceptEntity, VerificationStatus } from '../../types/models';
import {
  BookOpen,
  Search,
  Star,
  ExternalLink,
  Trash2,
  Edit3,
  Calendar,
  FileText,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  FolderArchive,
} from 'lucide-react';

export const GlossaryView: React.FC = () => {
  const {
    glossary,
    notes,
    saveConcept,
    deleteConcept,
    toggleFavoriteConcept,
    showNotification,
  } = useApp();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedConcept, setSelectedConcept] = useState<ConceptEntity | null>(null);
  const [userNoteText, setUserNoteText] = useState('');
  const [isEditingUserNotes, setIsEditingUserNotes] = useState(false);

  // Filter glossary concepts
  const filteredConcepts = glossary.filter((c) => {
    if (filterStatus === 'fav' && !c.isFavorite) return false;
    if (filterStatus === 'verificado' && c.verificationStatus !== 'verificado') return false;
    if (filterStatus === 'discrepancia' && c.verificationStatus !== 'discrepancia') return false;
    if (filterStatus === 'no_verificado' && c.verificationStatus !== 'no_verificado') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = c.termName.toLowerCase().includes(q);
      const matchField = c.academicField?.toLowerCase().includes(q);
      const matchDef = c.academicDefinition.toLowerCase().includes(q);
      const matchPlain = c.plainExplanation.toLowerCase().includes(q);
      if (!matchName && !matchField && !matchDef && !matchPlain) return false;
    }
    return true;
  });

  const getSourceNoteTitle = (noteId?: string) => {
    if (!noteId) return null;
    return notes.find((n) => n.id === noteId)?.title || 'Apunte asociado';
  };

  const handleOpenConcept = (concept: ConceptEntity) => {
    setSelectedConcept(concept);
    setUserNoteText(concept.userNotes || '');
    setIsEditingUserNotes(false);
  };

  const handleSaveUserNotes = async () => {
    if (!selectedConcept) return;
    const updated: ConceptEntity = {
      ...selectedConcept,
      userNotes: userNoteText.trim(),
      updatedAt: Date.now(),
    };
    await saveConcept(updated);
    setSelectedConcept(updated);
    setIsEditingUserNotes(false);
    showNotification('Notas personales guardadas.', 'success');
  };

  return (
    <div className="max-w-xl mx-auto px-4 pb-28 pt-2">
      {/* Search & Filter Bar */}
      <div className="space-y-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conceptos, definiciones o materias..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>

        {/* Status filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 text-xs">
          {[
            { id: 'all', label: `Todos (${glossary.length})` },
            { id: 'fav', label: `⭐ Favoritos (${glossary.filter((c) => c.isFavorite).length})` },
            { id: 'verificado', label: '✓ Verificados' },
            { id: 'discrepancia', label: '⚠️ Discrepancias' },
            { id: 'no_verificado', label: '✕ Sin verificar' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition ${
                filterStatus === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Concepts list */}
      {filteredConcepts.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3 shadow-inner">
            <BookOpen className="w-7 h-7 stroke-[1.8]" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
            {search ? 'Sin resultados para la búsqueda' : 'Glosario vacío'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-xs mt-1">
            {search
              ? 'Prueba con otra palabra clave o restablece los filtros.'
              : 'Analiza tus notas o documentos con la herramienta de conceptos para incorporar términos académicos.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredConcepts.map((concept) => {
            const sourceNote = getSourceNoteTitle(concept.noteId);
            return (
              <div
                key={concept.id}
                onClick={() => handleOpenConcept(concept)}
                className="group relative bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 hover:border-indigo-400 dark:hover:border-indigo-600 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-50">
                      {concept.termName}
                    </h3>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        concept.verificationStatus === 'verificado'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : concept.verificationStatus === 'discrepancia'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}
                    >
                      {concept.verificationStatus === 'verificado'
                        ? '✓ Verificado'
                        : concept.verificationStatus === 'discrepancia'
                        ? '⚠️ Discrepancia'
                        : '✕ No verificado'}
                    </span>
                    {concept.academicField && (
                      <span className="text-[10px] uppercase font-semibold text-slate-400">
                        #{concept.academicField}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavoriteConcept(concept.id);
                    }}
                    className={`p-1 rounded-lg transition ${
                      concept.isFavorite
                        ? 'text-amber-500 fill-amber-500'
                        : 'text-slate-300 hover:text-slate-500 dark:text-zinc-600 dark:hover:text-zinc-400'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${concept.isFavorite ? 'fill-amber-500' : ''}`} />
                  </button>
                </div>

                <p className="text-xs text-slate-600 dark:text-zinc-300 line-clamp-2 leading-relaxed mb-2.5">
                  {concept.academicDefinition}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500 pt-2 border-t border-slate-100 dark:border-zinc-800/60">
                  <div className="flex items-center gap-1.5 line-clamp-1">
                    {concept.documentName ? (
                      <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium">
                        <FolderArchive className="w-3 h-3 shrink-0" />
                        <span className="truncate">{concept.documentName}</span>
                        {concept.pageOrSlide && (
                          <span className="text-[10px] text-slate-500 dark:text-zinc-400 shrink-0">
                            (Pág./Diap. {concept.pageOrSlide})
                          </span>
                        )}
                      </span>
                    ) : sourceNote ? (
                      <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium">
                        <FileText className="w-3 h-3" /> {sourceNote}
                      </span>
                    ) : (
                      <span>Glosario general</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {concept.sources && concept.sources.length > 0 && (
                      <span className="text-[10px] font-semibold text-slate-500">
                        {concept.sources.length} {concept.sources.length === 1 ? 'fuente' : 'fuentes'}
                      </span>
                    )}
                    {concept.userNotes && (
                      <span className="text-indigo-500 font-medium">Con notas</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detailed Concept Modal Sheet */}
      {selectedConcept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
            {/* Sheet Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleFavoriteConcept(selectedConcept.id)}
                  className="p-1 rounded-lg text-amber-500"
                >
                  <Star className={`w-5 h-5 ${selectedConcept.isFavorite ? 'fill-amber-500' : ''}`} />
                </button>
                <div>
                  <h2 className="font-bold text-base text-slate-900 dark:text-zinc-50 leading-tight">
                    {selectedConcept.termName}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    {selectedConcept.academicField}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    deleteConcept(selectedConcept.id);
                    setSelectedConcept(null);
                  }}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-red-500 transition"
                  title="Eliminar del glosario"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedConcept(null)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Sheet Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Verification & Query Status badge */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                <div>
                  <span className="font-bold text-slate-700 dark:text-zinc-300 text-[11px]">
                    Modalidad y Estado de Consulta
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {selectedConcept.queryStatus === 'contrastado_web' ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Contrastado con fuentes web (Google Grounding)
                      </span>
                    ) : selectedConcept.queryStatus === 'fuentes_consultadas' ? (
                      <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                        <Search className="w-3.5 h-3.5" /> Fuentes consultadas en Google Search
                      </span>
                    ) : selectedConcept.verificationStatus === 'verificado' ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verificado académicamente
                      </span>
                    ) : (
                      <span className="text-slate-600 dark:text-zinc-400 font-semibold flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" /> Sin verificar (Definición contextual IA)
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">
                    {selectedConcept.consultedAt
                      ? new Date(selectedConcept.consultedAt).toLocaleDateString('es-ES')
                      : selectedConcept.lastCheckedAt
                      ? new Date(selectedConcept.lastCheckedAt).toLocaleDateString('es-ES')
                      : 'Reciente'}
                  </span>
                </div>
              </div>

              {/* Document or Note Origin Provenance */}
              {(selectedConcept.documentName || selectedConcept.noteId) && (
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50">
                  <div className="flex items-center gap-2">
                    {selectedConcept.documentName ? (
                      <FolderArchive className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-800 dark:text-zinc-200 text-xs">
                      {selectedConcept.documentName
                        ? `Documento: ${selectedConcept.documentName}`
                        : `Apunte: ${getSourceNoteTitle(selectedConcept.noteId)}`}
                    </span>
                  </div>
                  {selectedConcept.pageOrSlide && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-white dark:bg-zinc-800 text-indigo-700 dark:text-indigo-300 shadow-2xs">
                      Pág./Diap. {selectedConcept.pageOrSlide}
                    </span>
                  )}
                </div>
              )}

              {/* Context of origin */}
              {selectedConcept.context && (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800">
                  <p className="font-bold text-slate-800 dark:text-zinc-200 text-[11px] mb-1">
                    Oración de procedencia:
                  </p>
                  <p className="text-slate-600 dark:text-zinc-400 italic leading-relaxed">
                    "{selectedConcept.context}"
                  </p>
                </div>
              )}

              {/* Academic definition */}
              <div>
                <h4 className="font-bold text-slate-900 dark:text-zinc-100 text-xs mb-1">
                  Definición académica respaldada
                </h4>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                  {selectedConcept.academicDefinition}
                </div>
              </div>

              {/* Plain explanation */}
              {selectedConcept.plainExplanation && (
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-zinc-100 text-xs mb-1">
                    Explicación en lenguaje sencillo
                  </h4>
                  <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 leading-relaxed">
                    {selectedConcept.plainExplanation}
                  </div>
                </div>
              )}

              {/* Illustrative example */}
              {selectedConcept.illustrativeExample && (
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-zinc-100 text-xs mb-1">
                    Ejemplo ilustrativo
                  </h4>
                  <div className="p-3.5 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-slate-700 dark:text-zinc-300 leading-relaxed">
                    {selectedConcept.illustrativeExample}
                  </div>
                </div>
              )}

              {/* Verified Sources */}
              {selectedConcept.sources && selectedConcept.sources.length > 0 && (
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-zinc-100 text-xs mb-1">
                    Fuentes y referencias verificadas ({selectedConcept.sources.length})
                  </h4>
                  <div className="space-y-1.5">
                    {selectedConcept.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-indigo-600 dark:text-indigo-400 transition"
                      >
                        <span className="font-medium line-clamp-1">{s.title || s.url}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0 ml-2" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Personal Notes (Editable by student without altering verified reference) */}
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="font-bold text-slate-900 dark:text-zinc-100 text-xs flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-indigo-500" /> Notas personales del estudiante
                  </h4>
                  {!isEditingUserNotes && (
                    <button
                      onClick={() => setIsEditingUserNotes(true)}
                      className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline text-[11px]"
                    >
                      Editar nota
                    </button>
                  )}
                </div>

                {isEditingUserNotes ? (
                  <div className="space-y-2">
                    <textarea
                      value={userNoteText}
                      onChange={(e) => setUserNoteText(e.target.value)}
                      placeholder="Escribe tus propios apuntes sobre cómo aplicar o recordar este concepto..."
                      rows={3}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setIsEditingUserNotes(false)}
                        className="px-3 py-1 text-slate-500 hover:text-slate-700"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveUserNotes}
                        className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 italic">
                    {selectedConcept.userNotes || 'Sin notas personales añadidas. Toca "Editar nota" para agregar tus comentarios de clase.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
