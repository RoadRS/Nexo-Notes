import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { NoteEntity } from '../../types/models';
import {
  ArrowLeft,
  Sparkles,
  Pin,
  Trash2,
  Folder,
  Tag,
  Bold,
  Heading2,
  List,
  Quote,
  CheckCircle2,
  Save,
} from 'lucide-react';

export const NoteEditor: React.FC<{
  note: NoteEntity;
  onBack: () => void;
  onAnalyze: (note: NoteEntity, selectedText?: string) => void;
}> = ({ note, onBack, onAnalyze }) => {
  const { folders, updateNote, deleteNote, togglePinNote, showNotification } = useApp();

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [folderId, setFolderId] = useState(note.folderId || '');
  const [subject, setSubject] = useState(note.subject || '');
  const [tags, setTags] = useState<string[]>(note.tags || []);
  const [newTagInput, setNewTagInput] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [isSaved, setIsSaved] = useState(true);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronize state if note prop changes
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setFolderId(note.folderId || '');
    setSubject(note.subject || '');
    setTags(note.tags || []);
    setIsSaved(true);
  }, [note.id]);

  // Debounced auto-save (Room persistent database)
  const triggerAutoSave = (
    newTitle: string,
    newContent: string,
    newFolderId: string,
    newSubject: string,
    newTags: string[]
  ) => {
    setIsSaved(false);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      await updateNote({
        ...note,
        title: newTitle,
        content: newContent,
        folderId: newFolderId || undefined,
        subject: newSubject,
        tags: newTags,
      });
      setIsSaved(true);
    }, 600);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    triggerAutoSave(val, content, folderId, subject, tags);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    triggerAutoSave(title, val, folderId, subject, tags);
  };

  const handleFolderChange = (val: string) => {
    setFolderId(val);
    const chosen = folders.find((f) => f.id === val);
    const nextSub = chosen?.subject || subject;
    setSubject(nextSub);
    triggerAutoSave(title, content, val, nextSub, tags);
  };

  const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const tag = newTagInput.trim().replace(/^#/, '');
    if (tag && !tags.includes(tag)) {
      const nextTags = [...tags, tag];
      setTags(nextTags);
      setNewTagInput('');
      triggerAutoSave(title, content, folderId, subject, nextTags);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const nextTags = tags.filter((t) => t !== tagToRemove);
    setTags(nextTags);
    triggerAutoSave(title, content, folderId, subject, nextTags);
  };

  // Detect text selection for targeted concept analysis
  const handleSelectText = () => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      if (end > start) {
        const sel = content.substring(start, end).trim();
        setSelectedText(sel.length >= 10 ? sel : '');
      } else {
        setSelectedText('');
      }
    }
  };

  // Markdown format buttons
  const insertFormatting = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selection = text.substring(start, end) || 'texto';
    const replacement = `${prefix}${selection}${suffix}`;
    const newContent = text.substring(0, start) + replacement + text.substring(end);
    setContent(newContent);
    triggerAutoSave(title, newContent, folderId, subject, tags);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selection.length);
    }, 0);
  };

  const handleManualSave = async () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    await updateNote({
      ...note,
      title,
      content,
      folderId: folderId || undefined,
      subject,
      tags,
    });
    setIsSaved(true);
    showNotification('Nota guardada localmente.', 'success');
  };

  const wordsCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charsCount = content.length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 pb-20 transition-colors">
      {/* Top action header */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 px-4 py-2.5 flex items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              handleManualSave();
              onBack();
            }}
            className="p-2 -ml-1 rounded-xl text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            title="Volver"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
          </button>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
            {isSaved ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Guardado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-500 animate-pulse font-medium">
                <Save className="w-3.5 h-3.5" /> Guardando...
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Analyze Concept CTA */}
          <button
            onClick={() => {
              handleManualSave();
              onAnalyze(
                { ...note, title, content, folderId: folderId || undefined, subject, tags },
                selectedText || undefined
              );
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition active:scale-95"
            title="Analizar términos técnicos en esta nota"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{selectedText ? 'Analizar selección' : 'Analizar conceptos'}</span>
          </button>

          {/* Pin toggle */}
          <button
            onClick={() => togglePinNote(note.id)}
            className={`p-2 rounded-xl transition ${
              note.isPinned
                ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50'
                : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
            title={note.isPinned ? 'Desfijar' : 'Fijar arriba'}
          >
            <Pin className={`w-4 h-4 ${note.isPinned ? 'fill-amber-500' : ''}`} />
          </button>

          {/* Delete note */}
          <button
            onClick={() => setShowConfirmDelete(true)}
            className="p-2 rounded-xl text-slate-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
            title="Eliminar apunte"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main editor container */}
      <div className="max-w-xl mx-auto px-4 pt-4 space-y-4">
        {/* Note Metadata: Folder, Subject, Tags */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl p-3.5 space-y-3 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {/* Folder Selector */}
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={folderId}
                onChange={(e) => handleFolderChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/80 rounded-xl px-2.5 py-1.5 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Sin carpeta</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    📁 {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject Field */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold shrink-0">#</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  triggerAutoSave(title, content, folderId, e.target.value, tags);
                }}
                placeholder="Materia o asignatura (ej: Psicología)"
                className="w-full bg-slate-50 dark:bg-zinc-800/70 border border-slate-200 dark:border-zinc-700/80 rounded-xl px-2.5 py-1.5 text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Tags list & add tag */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-100 dark:border-zinc-800 text-xs">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-medium"
              >
                #{t}
                <button
                  onClick={() => handleRemoveTag(t)}
                  className="hover:text-red-500 ml-0.5 text-xs"
                >
                  ×
                </button>
              </span>
            ))}
            <div className="inline-flex items-center">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="+ Etiqueta"
                className="w-20 px-2 py-0.5 text-xs bg-transparent border-b border-dashed border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Selected text prompt indicator */}
        {selectedText && (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 text-xs text-indigo-900 dark:text-indigo-200 animate-fadeIn">
            <span className="line-clamp-1 italic">
              Fragmento seleccionado: "{selectedText}"
            </span>
            <button
              onClick={() => onAnalyze({ ...note, title, content, folderId, subject, tags }, selectedText)}
              className="shrink-0 font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" /> Analizar
            </button>
          </div>
        )}

        {/* Note Title Input */}
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Título del apunte"
          className="w-full text-2xl font-bold bg-transparent text-slate-900 dark:text-zinc-50 placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none border-b border-transparent focus:border-slate-200 dark:focus:border-zinc-800 pb-1"
        />

        {/* Formatting toolbar */}
        <div className="flex items-center gap-1 py-1 px-1 text-slate-600 dark:text-zinc-400 border-y border-slate-200/60 dark:border-zinc-800/60 overflow-x-auto text-xs">
          <button
            onClick={() => insertFormatting('**', '**')}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 transition"
            title="Negrita"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertFormatting('## ')}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 transition"
            title="Título sección"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertFormatting('- ')}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 transition"
            title="Lista con viñetas"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => insertFormatting('> ')}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 transition"
            title="Cita"
          >
            <Quote className="w-4 h-4" />
          </button>
          <div className="ml-auto text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
            {wordsCount} palabras · {charsCount} caracteres
          </div>
        </div>

        {/* Note Content Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          onSelect={handleSelectText}
          onMouseUp={handleSelectText}
          onKeyUp={handleSelectText}
          placeholder="Escribe aquí tus apuntes académicos, ideas de clase, conceptos teóricos o fragmentos de lectura..."
          rows={18}
          className="w-full bg-transparent text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-600 text-sm leading-relaxed resize-none focus:outline-none focus:ring-0 font-sans"
        />
      </div>

      {/* Confirm Delete Dialog */}
      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
              ¿Eliminar este apunte?
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2 mb-5">
              Esta acción eliminará permanentemente la nota "{title}" de la base de datos local. Los conceptos guardados en el glosario se conservarán.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setShowConfirmDelete(false);
                  await deleteNote(note.id);
                  onBack();
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition"
              >
                Eliminar apunte
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
