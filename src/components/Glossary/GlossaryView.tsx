import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ConceptEntity } from '../../types/models';
import {
  BookOpen,
  Search,
  Star,
  ExternalLink,
  Trash2,
  Edit3,
  FileText,
  CheckCircle2,
  AlertTriangle,
  FolderArchive,
  X,
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

  // Keep selectedConcept reactive with global glossary updates (e.g. favorite toggle)
  const activeConcept = selectedConcept
    ? glossary.find((c) => c.id === selectedConcept.id) || selectedConcept
    : null;

  // Close concept detail sheet on Escape
  useEffect(() => {
    if (!selectedConcept) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditingUserNotes) {
          setIsEditingUserNotes(false);
        } else {
          setSelectedConcept(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedConcept, isEditingUserNotes]);

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
    if (!activeConcept) return;
    const updated: ConceptEntity = {
      ...activeConcept,
      userNotes: userNoteText.trim(),
      updatedAt: Date.now(),
    };
    await saveConcept(updated);
    setSelectedConcept(updated);
    setIsEditingUserNotes(false);
    showNotification('Notas personales guardadas.', 'success');
  };

  const favCount = glossary.filter((c) => c.isFavorite).length;
  const verifiedCount = glossary.filter((c) => c.verificationStatus === 'verificado').length;
  const discrepancyCount = glossary.filter((c) => c.verificationStatus === 'discrepancia').length;
  const unverifiedCount = glossary.filter((c) => c.verificationStatus === 'no_verificado').length;

  const filterTabs = [
    { id: 'all', label: `Todos (${glossary.length})`, icon: null },
    { id: 'fav', label: `Favoritos (${favCount})`, icon: Star },
    { id: 'verificado', label: `Verificados (${verifiedCount})`, icon: CheckCircle2 },
    ...(discrepancyCount > 0
      ? [{ id: 'discrepancia', label: `Discrepancias (${discrepancyCount})`, icon: AlertTriangle }]
      : []),
    { id: 'no_verificado', label: `Contextuales (${unverifiedCount})`, icon: BookOpen },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-28 md:pb-16 pt-3">
      {/* Search & Filter Controls */}
      <div className="space-y-3 mb-5">
        <div className="relative">
          <label htmlFor="glossary-search-input" className="sr-only">
            Buscar conceptos en el glosario
          </label>
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            id="glossary-search-input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar término, definición, autor o área de psicología…"
            className="w-full min-h-[44px] pl-10 pr-10 py-2 text-base sm:text-sm rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda del glosario"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status filters */}
        <div
          role="region"
          aria-label="Filtrar glosario por estado"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs"
        >
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = filterStatus === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                  isActive
                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                    : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Concepts list */}
      {filteredConcepts.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto my-6">
          <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-300 mx-auto mb-4">
            <BookOpen className="w-6 h-6 stroke-[1.75]" />
          </div>
          <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
            {search || filterStatus !== 'all'
              ? 'No se encontraron conceptos con este filtro'
              : 'Tu glosario académico está vacío'}
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-1.5 leading-relaxed">
            {search || filterStatus !== 'all'
              ? 'Prueba con otra palabra clave o restablece los filtros para ver todos los términos guardados.'
              : 'Cuando extraigas conceptos desde tus apuntes o documentos PDF/PPTX y los guardes, aparecerán aquí organizados para tu estudio.'}
          </p>
          {(search || filterStatus !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilterStatus('all');
              }}
              className="mt-5 inline-flex items-center justify-center min-h-[42px] px-4 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-xs font-semibold text-stone-800 dark:text-stone-200 transition-colors"
            >
              Restablecer filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
          {filteredConcepts.map((concept) => {
            const sourceNote = getSourceNoteTitle(concept.noteId);
            return (
              <article
                key={concept.id}
                onClick={() => handleOpenConcept(concept)}
                className="group relative bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 rounded-2xl p-4 sm:p-5 transition-colors cursor-pointer shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenConcept(concept);
                          }}
                          className="text-left focus-visible:outline-none focus-visible:underline"
                        >
                          {concept.termName}
                        </button>
                      </h3>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {concept.verificationStatus === 'verificado' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>Verificado</span>
                          </span>
                        ) : concept.verificationStatus === 'discrepancia' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>Discrepancia</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                            <BookOpen className="w-3 h-3 shrink-0" />
                            <span>Contextual</span>
                          </span>
                        )}

                        {concept.academicField && (
                          <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                            · {concept.academicField}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteConcept(concept.id);
                      }}
                      aria-pressed={concept.isFavorite}
                      aria-label={
                        concept.isFavorite
                          ? `Quitar ${concept.termName} de favoritos`
                          : `Marcar ${concept.termName} como favorito`
                      }
                      className={`inline-flex items-center justify-center min-w-[38px] min-h-[38px] -mr-1 -mt-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                        concept.isFavorite
                          ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                          : 'text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${concept.isFavorite ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  <p className="text-sm text-stone-600 dark:text-stone-300 line-clamp-2 leading-relaxed mb-3.5">
                    {concept.academicDefinition}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400 pt-2.5 border-t border-stone-100 dark:border-stone-800/80">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {concept.documentName ? (
                      <span className="inline-flex items-center gap-1.5 text-stone-700 dark:text-stone-300 font-medium truncate">
                        <FolderArchive className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="truncate">{concept.documentName}</span>
                        {concept.pageOrSlide && (
                          <span className="text-stone-500 dark:text-stone-400 shrink-0">
                            (p. {concept.pageOrSlide})
                          </span>
                        )}
                      </span>
                    ) : sourceNote ? (
                      <span className="inline-flex items-center gap-1.5 text-stone-700 dark:text-stone-300 font-medium truncate">
                        <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="truncate">{sourceNote}</span>
                      </span>
                    ) : (
                      <span>Glosario general</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {concept.sources && concept.sources.length > 0 && (
                      <span className="font-medium text-stone-600 dark:text-stone-400">
                        {concept.sources.length}{' '}
                        {concept.sources.length === 1 ? 'fuente' : 'fuentes'}
                      </span>
                    )}
                    {concept.userNotes && (
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium">
                        Con nota
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Detailed Concept Modal / Bottom Sheet */}
      {activeConcept && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setSelectedConcept(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="glossary-concept-dialog-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-white dark:bg-stone-900 border-t sm:border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden safe-area-bottom"
          >
            {/* Sheet Header */}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/50 shrink-0">
              <div className="flex items-start gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => toggleFavoriteConcept(activeConcept.id)}
                  aria-pressed={activeConcept.isFavorite}
                  aria-label={
                    activeConcept.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'
                  }
                  className={`inline-flex items-center justify-center min-w-[40px] min-h-[40px] -ml-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                    activeConcept.isFavorite
                      ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                      : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
                  }`}
                >
                  <Star className={`w-5 h-5 ${activeConcept.isFavorite ? 'fill-current' : ''}`} />
                </button>
                <div className="min-w-0 pt-0.5">
                  <h2
                    id="glossary-concept-dialog-title"
                    className="font-bold text-lg text-stone-900 dark:text-stone-100 leading-snug"
                  >
                    {activeConcept.termName}
                  </h2>
                  {activeConcept.academicField && (
                    <p className="text-xs font-medium text-stone-500 dark:text-stone-400 mt-0.5">
                      {activeConcept.academicField}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    deleteConcept(activeConcept.id);
                    setSelectedConcept(null);
                  }}
                  aria-label="Eliminar término del glosario"
                  className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-xl text-stone-500 dark:text-stone-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  title="Eliminar del glosario"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedConcept(null)}
                  className="inline-flex items-center justify-center min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Sheet Content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-sm">
              {/* Verification & Origin Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs">
                <div className="flex items-center gap-2">
                  {activeConcept.queryStatus === 'contrastado_web' ||
                  activeConcept.verificationStatus === 'verificado' ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {activeConcept.queryStatus === 'contrastado_web'
                          ? 'Contrastado con fuentes académicas web'
                          : 'Verificado académicamente'}
                      </span>
                    </span>
                  ) : activeConcept.queryStatus === 'fuentes_consultadas' ? (
                    <span className="text-indigo-700 dark:text-indigo-300 font-semibold inline-flex items-center gap-1.5">
                      <Search className="w-4 h-4 shrink-0" />
                      <span>Fuentes externas consultadas</span>
                    </span>
                  ) : (
                    <span className="text-stone-700 dark:text-stone-300 font-semibold inline-flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 shrink-0 text-stone-500" />
                      <span>Definición contextual del apunte</span>
                    </span>
                  )}
                </div>

                <span className="text-stone-500 dark:text-stone-400">
                  {activeConcept.consultedAt
                    ? new Date(activeConcept.consultedAt).toLocaleDateString('es-ES')
                    : activeConcept.lastCheckedAt
                    ? new Date(activeConcept.lastCheckedAt).toLocaleDateString('es-ES')
                    : 'Guardado recientemente'}
                </span>
              </div>

              {/* Document or Note Origin Provenance */}
              {(activeConcept.documentName || activeConcept.noteId) && (
                <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-stone-100/70 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-800 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {activeConcept.documentName ? (
                      <FolderArchive className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    )}
                    <span className="font-medium text-stone-800 dark:text-stone-200 truncate">
                      {activeConcept.documentName
                        ? `Fuente: ${activeConcept.documentName}`
                        : `Apunte: ${getSourceNoteTitle(activeConcept.noteId)}`}
                    </span>
                  </div>
                  {activeConcept.pageOrSlide && (
                    <span className="font-semibold px-2 py-0.5 rounded-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 shrink-0">
                      Pág. / Diap. {activeConcept.pageOrSlide}
                    </span>
                  )}
                </div>
              )}

              {/* Academic definition (Primary Hierarchy) */}
              <section aria-labelledby="concept-academic-def-heading">
                <h3
                  id="concept-academic-def-heading"
                  className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2"
                >
                  Definición académica
                </h3>
                <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 leading-relaxed whitespace-pre-line max-w-prose">
                  {activeConcept.academicDefinition}
                </div>
              </section>

              {/* Plain explanation */}
              {activeConcept.plainExplanation && (
                <section aria-labelledby="concept-plain-exp-heading">
                  <h3
                    id="concept-plain-exp-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2"
                  >
                    Explicación sencilla para estudio
                  </h3>
                  <div className="p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 leading-relaxed max-w-prose">
                    {activeConcept.plainExplanation}
                  </div>
                </section>
              )}

              {/* Illustrative example */}
              {activeConcept.illustrativeExample && (
                <section aria-labelledby="concept-example-heading">
                  <h3
                    id="concept-example-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2"
                  >
                    Ejemplo aplicado o clínico
                  </h3>
                  <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-950 border-l-4 border-l-indigo-500 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 leading-relaxed max-w-prose">
                    {activeConcept.illustrativeExample}
                  </div>
                </section>
              )}

              {/* Context of origin */}
              {activeConcept.context && (
                <section aria-labelledby="concept-context-heading">
                  <h3
                    id="concept-context-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1.5"
                  >
                    Cita en el texto original
                  </h3>
                  <blockquote className="px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200/80 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400 italic leading-relaxed">
                    «{activeConcept.context}»
                  </blockquote>
                </section>
              )}

              {/* Verified Sources */}
              {activeConcept.sources && activeConcept.sources.length > 0 && (
                <section aria-labelledby="concept-sources-heading">
                  <h3
                    id="concept-sources-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2"
                  >
                    Referencias consultadas ({activeConcept.sources.length})
                  </h3>
                  <div className="space-y-1.5">
                    {activeConcept.sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-center justify-between gap-2 min-h-[42px] px-3.5 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs text-indigo-600 dark:text-indigo-400 font-medium transition-colors"
                      >
                        <span className="truncate">{s.title || s.url}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Personal Notes (Editable by student) */}
              <section
                aria-labelledby="concept-personal-notes-heading"
                className="pt-4 border-t border-stone-200 dark:border-stone-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3
                    id="concept-personal-notes-heading"
                    className="text-xs font-semibold uppercase tracking-wider text-stone-700 dark:text-stone-300 flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Mis anotaciones de estudio</span>
                  </h3>
                  {!isEditingUserNotes && (
                    <button
                      type="button"
                      onClick={() => setIsEditingUserNotes(true)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-xs transition-colors"
                    >
                      {activeConcept.userNotes ? 'Editar anotación' : '+ Añadir anotación'}
                    </button>
                  )}
                </div>

                {isEditingUserNotes ? (
                  <div className="space-y-2.5">
                    <label htmlFor="concept-user-notes-textarea" className="sr-only">
                      Anotaciones personales sobre {activeConcept.termName}
                    </label>
                    <textarea
                      id="concept-user-notes-textarea"
                      value={userNoteText}
                      onChange={(e) => setUserNoteText(e.target.value)}
                      placeholder="Añade reglas mnemotécnicas, ejemplos vistos en clase o relaciones con otros autores…"
                      rows={3}
                      autoFocus
                      className="w-full p-3 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-base sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingUserNotes(false)}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveUserNotes}
                        className="min-h-[40px] px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                      >
                        Guardar anotación
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                    {activeConcept.userNotes ? (
                      <p className="text-stone-800 dark:text-stone-200 whitespace-pre-line">
                        {activeConcept.userNotes}
                      </p>
                    ) : (
                      <p className="italic">
                        Sin anotaciones personales. Puedes agregar recordatorios de examen o relaciones con otros conceptos sin modificar la definición original.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
