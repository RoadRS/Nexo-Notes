import React from 'react';
import { useApp } from '../../context/AppContext';
import { NoteEntity } from '../../types/models';
import { Pin, Sparkles, Plus, Calendar, BookOpen, Trash2, Folder } from 'lucide-react';

export const NotesList: React.FC<{ onAnalyzeNote: (note: NoteEntity) => void }> = ({ onAnalyzeNote }) => {
  const {
    notes,
    folders,
    selectedFolderId,
    selectedSubject,
    searchQuery,
    setActiveNote,
    createNote,
    deleteNote,
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

  const getFolder = (folderId?: string) => {
    if (!folderId) return null;
    return folders.find((f) => f.id === folderId) || null;
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
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
    // Excerpt: strip markdown headers and symbols
    const excerpt = note.content
      .replace(/^[#*>\s-]+/gm, '')
      .replace(/\n+/g, ' ')
      .trim();

    return (
      <div
        key={note.id}
        onClick={() => setActiveNote(note)}
        className="group relative bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 hover:border-indigo-400 dark:hover:border-indigo-600 rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {folder && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-zinc-400">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: folder.color }}
                />
                {folder.name}
              </span>
            )}
            {note.subject && (
              <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                {note.subject}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePinNote(note.id);
              }}
              title={note.isPinned ? 'Desfijar' : 'Fijar arriba'}
              className={`p-1.5 rounded-lg transition ${
                note.isPinned
                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300'
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${note.isPinned ? 'fill-amber-500' : ''}`} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAnalyzeNote(note);
              }}
              title="Analizar conceptos técnicos"
              className="p-1.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <h3 className="font-semibold text-sm text-slate-900 dark:text-zinc-100 line-clamp-1 mb-1">
          {note.title || 'Nota sin título'}
        </h3>

        <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-3">
          {excerpt || <span className="italic text-slate-400 dark:text-zinc-500">Nota vacía. Toca para escribir...</span>}
        </p>

        <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500 pt-2 border-t border-slate-100 dark:border-zinc-800/60">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(note.updatedAt)}</span>
          </div>

          <div className="flex items-center gap-2">
            <span>{note.wordCount || 0} palabras</span>
            {note.tags && note.tags.length > 0 && (
              <span className="hidden sm:inline-block text-indigo-500 font-medium">
                #{note.tags[0]}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-xl mx-auto px-4 pb-28 pt-2">
      {/* Zero state if no notes found */}
      {filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-4">
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 shadow-inner">
            <BookOpen className="w-8 h-8 stroke-[1.7]" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
            {searchQuery ? 'No se encontraron resultados' : 'No hay apuntes todavía'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-xs mt-1.5 mb-6">
            {searchQuery
              ? `No hay coincidencias para "${searchQuery}". Intenta con otros términos.`
              : 'Empieza a tomar notas de clase, seminarios o lecturas para extraer conceptos técnicos.'}
          </p>
          <button
            onClick={() => createNote(selectedSubject || undefined, selectedFolderId || undefined)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-medium text-xs hover:bg-indigo-700 transition shadow-md shadow-indigo-600/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Crear primer apunte
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pinned section */}
          {pinnedNotes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2.5">
                <Pin className="w-3 h-3 text-amber-500 fill-amber-500" />
                <span>Fijados ({pinnedNotes.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            </div>
          )}

          {/* Regular section */}
          <div>
            {pinnedNotes.length > 0 && (
              <div className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mb-2.5">
                <span>Otros apuntes ({regularNotes.length})</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {regularNotes.map((note) => renderNoteCard(note))}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => createNote(selectedSubject || undefined, selectedFolderId || undefined)}
        className="fixed bottom-20 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-600/30 transition-transform active:scale-90 font-medium text-xs"
        aria-label="Nuevo apunte"
      >
        <Plus className="w-5 h-5 stroke-[2.2]" />
        <span className="font-semibold pr-1">Nuevo apunte</span>
      </button>
    </div>
  );
};
