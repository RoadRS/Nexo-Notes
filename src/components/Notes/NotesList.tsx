import React from 'react';
import { useApp } from '../../context/AppContext';
import { NoteEntity } from '../../types/models';
import { Pin, Layers, Plus, Calendar, BookOpen, Clock, ArrowRight } from 'lucide-react';

export const NotesList: React.FC<{ onAnalyzeNote: (note: NoteEntity) => void }> = ({ onAnalyzeNote }) => {
  const {
    notes,
    folders,
    selectedFolderId,
    selectedSubject,
    searchQuery,
    setSearchQuery,
    setActiveNote,
    createNote,
    togglePinNote,
  } = useApp();

  // Filter notes based on active folder, subject, and search query
  const filteredNotes = notes.filter((note) => {
    if (selectedFolderId && note.folderId !== selectedFolderId) return false;
    if (selectedSubject && note.subject !== selectedSubject) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = note.title.toLowerCase().includes(q);
      const matchContent = note.content.toLowerCase().includes(q);
      const matchSubject = note.subject?.toLowerCase().includes(q);
      const matchTags = note.tags?.some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchContent && !matchSubject && !matchTags) return false;
    }
    return true;
  });

  const pinnedNotes = filteredNotes.filter((n) => n.isPinned);
  const regularNotes = filteredNotes.filter((n) => !n.isPinned);

  // Most recently updated note for quick study continuity
  const latestNote =
    filteredNotes.length > 0
      ? [...filteredNotes].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      : null;

  const getFolder = (folderId?: string) => {
    if (!folderId) return null;
    return folders.find((f) => f.id === folderId) || null;
  };

  const activeFolder = selectedFolderId ? getFolder(selectedFolderId) : null;

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return `Hoy, ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    }
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 3600 * 24));
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) {
      return d.toLocaleDateString('es-ES', { weekday: 'short' });
    }
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  const renderNoteCard = (note: NoteEntity) => {
    const folder = getFolder(note.folderId);
    const excerpt = note.content
      .replace(/^[#*>\s-]+/gm, '')
      .replace(/\n+/g, ' ')
      .trim();

    return (
      <article
        key={note.id}
        onClick={() => setActiveNote(note)}
        className="group relative bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 rounded-2xl p-4 sm:p-5 transition-colors cursor-pointer shadow-2xs flex flex-col justify-between"
      >
        <div>
          {/* Top Metadata & Card Actions */}
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 pt-0.5">
              {folder && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-400">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: folder.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate max-w-[140px]">{folder.name}</span>
                </span>
              )}
              {note.subject && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200/70 dark:border-stone-700/70 truncate max-w-[150px]">
                  {note.subject}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 -mr-1 -mt-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePinNote(note.id);
                }}
                aria-pressed={note.isPinned}
                aria-label={
                  note.isPinned
                    ? `Desfijar apunte ${note.title || 'sin título'}`
                    : `Fijar apunte ${note.title || 'sin título'}`
                }
                title={note.isPinned ? 'Desfijar apunte' : 'Fijar arriba'}
                className={`inline-flex items-center justify-center min-w-[36px] min-h-[36px] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                  note.isPinned
                    ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                    : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                <Pin className={`w-3.5 h-3.5 ${note.isPinned ? 'fill-current' : ''}`} />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAnalyzeNote(note);
                }}
                aria-label={`Extraer conceptos de ${note.title || 'este apunte'}`}
                title="Extraer y analizar conceptos de este apunte"
                className="inline-flex items-center gap-1 min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>Analizar</span>
              </button>
            </div>
          </div>

          {/* Note Title */}
          <h3 className="font-semibold text-base text-stone-900 dark:text-stone-100 line-clamp-1 mb-1.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveNote(note);
              }}
              className="text-left w-full truncate focus-visible:outline-none focus-visible:underline"
            >
              {note.title || 'Apunte sin título'}
            </button>
          </h3>

          {/* Excerpt */}
          <p className="text-sm text-stone-600 dark:text-stone-400 line-clamp-2 leading-relaxed mb-4">
            {excerpt || (
              <span className="italic text-stone-400 dark:text-stone-500">
                Apunte vacío. Toca para comenzar a escribir…
              </span>
            )}
          </p>
        </div>

        {/* Footer Metadata */}
        <div className="flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400 pt-2.5 border-t border-stone-100 dark:border-stone-800/80">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-stone-400 shrink-0" aria-hidden="true" />
            <span>{formatDate(note.updatedAt)}</span>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <span>{note.wordCount || 0} palabras</span>
            {note.tags && note.tags.length > 0 && (
              <span className="hidden sm:inline-block text-stone-600 dark:text-stone-300 font-medium truncate max-w-[100px]">
                #{note.tags[0]}
              </span>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-28 md:pb-16 pt-3">
      {/* Top workspace summary & Desktop Primary Action */}
      {filteredNotes.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3.5 border-b border-stone-200/80 dark:border-stone-800/80">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {activeFolder
                  ? `Cuaderno: ${activeFolder.name}`
                  : selectedSubject
                  ? `Materia: ${selectedSubject}`
                  : 'Espacio de estudio'}
              </h2>
              <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
                {filteredNotes.length}{' '}
                {filteredNotes.length === 1 ? 'apunte disponible' : 'apuntes disponibles'}
                {pinnedNotes.length > 0 ? ` · ${pinnedNotes.length} fijados` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {latestNote && !searchQuery && (
              <button
                type="button"
                onClick={() => setActiveNote(latestNote)}
                className="w-full sm:w-auto inline-flex items-center justify-between sm:justify-start gap-2 min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700 text-xs text-stone-700 dark:text-stone-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="text-stone-500 dark:text-stone-400 shrink-0">Continuar:</span>
                  <span className="font-semibold text-stone-900 dark:text-stone-100 truncate max-w-[160px] sm:max-w-[180px]">
                    {latestNote.title || 'Apunte reciente'}
                  </span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              </button>
            )}

            <button
              type="button"
              onClick={() => createNote(selectedSubject || undefined, selectedFolderId || undefined)}
              className="hidden sm:inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
            >
              <Plus className="w-4 h-4 stroke-[2.2]" />
              <span>Nuevo apunte</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty state if no notes found */}
      {filteredNotes.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto my-6">
          <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-300 mx-auto mb-4">
            <BookOpen className="w-6 h-6 stroke-[1.75]" />
          </div>
          <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
            {searchQuery ? 'Sin coincidencias en tus apuntes' : 'Aún no hay apuntes en este espacio'}
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-1.5 mb-6 leading-relaxed">
            {searchQuery
              ? `No encontramos apuntes que coincidan con "${searchQuery}". Prueba con otro término o limpia el filtro activo.`
              : 'Redacta apuntes de clase, resúmenes de lecturas o casos clínicos para estructurar tu estudio y extraer conceptos clave.'}
          </p>
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
            >
              Mostrar todos los apuntes
            </button>
          ) : (
            <button
              type="button"
              onClick={() => createNote(selectedSubject || undefined, selectedFolderId || undefined)}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
            >
              <Plus className="w-4 h-4 stroke-[2.2]" />
              <span>Crear primer apunte</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-7">
          {/* Pinned section */}
          {pinnedNotes.length > 0 && (
            <section aria-labelledby="pinned-notes-heading">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-stone-400 uppercase tracking-wider mb-3">
                <Pin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 fill-current" />
                <h3 id="pinned-notes-heading">Fijados ({pinnedNotes.length})</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                {pinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            </section>
          )}

          {/* Regular section */}
          {regularNotes.length > 0 && (
            <section aria-labelledby="regular-notes-heading">
              {pinnedNotes.length > 0 ? (
                <div className="text-xs font-semibold text-stone-600 dark:text-stone-400 uppercase tracking-wider mb-3">
                  <h3 id="regular-notes-heading">Todos los apuntes ({regularNotes.length})</h3>
                </div>
              ) : (
                <h3 id="regular-notes-heading" className="sr-only">
                  Lista de apuntes
                </h3>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                {regularNotes.map((note) => renderNoteCard(note))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Mobile Thumb-Zone Floating Action Button (FAB) — hidden on >=sm where top CTA is shown */}
      <button
        type="button"
        onClick={() => createNote(selectedSubject || undefined, selectedFolderId || undefined)}
        className="sm:hidden fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 min-h-[48px] px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-colors font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
        aria-label="Crear nuevo apunte"
      >
        <Plus className="w-5 h-5 stroke-[2.2]" />
        <span>Nuevo apunte</span>
      </button>
    </div>
  );
};
