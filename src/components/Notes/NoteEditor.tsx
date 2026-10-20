import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { AcademicAreaId, DisciplineEvidenceLevel, DisciplineMode, NoteEntity } from '../../types/models';
import {
  ACADEMIC_AREAS_LIST,
  getNoteAcademicSummary,
  isValidAcademicAreaId,
  setNoteAcademicMode,
  syncNoteAcademicContext,
} from '../../utils/academicContext';
import {
  ArrowLeft,
  Layers,
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
  BookOpen,
  GraduationCap,
  Plus,
  X,
} from 'lucide-react';

export const NoteEditor: React.FC<{
  note: NoteEntity;
  onBack: () => void;
  onAnalyze: (note: NoteEntity, selectedText?: string) => void;
}> = ({ note, onBack, onAnalyze }) => {
  const { folders, preferences, updateNote, deleteNote, togglePinNote, showNotification } = useApp();

  const initialSyncedNote = useMemo(() => {
    const folder = note.folderId ? folders.find((f) => f.id === note.folderId) || null : null;
    if (
      note.disciplineMode === 'manual' ||
      (note.detectedDiscipline !== undefined && note.detectedDisciplineConfidence !== undefined)
    ) {
      return note;
    }
    return syncNoteAcademicContext(note, { folder });
  }, [note.id]);

  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [folderId, setFolderId] = useState(note.folderId || '');
  const [subject, setSubject] = useState(note.subject || '');
  const [tags, setTags] = useState<string[]>(note.tags || []);
  const [disciplineMode, setDisciplineMode] = useState<DisciplineMode>(
    initialSyncedNote.disciplineMode === 'manual' && initialSyncedNote.manualDiscipline?.trim()
      ? 'manual'
      : 'auto'
  );
  const [manualDiscipline, setManualDiscipline] = useState<string>(
    initialSyncedNote.manualDiscipline || ''
  );
  const [detectedDiscipline, setDetectedDiscipline] = useState<AcademicAreaId | undefined>(
    initialSyncedNote.detectedDiscipline
  );
  const [detectedDisciplineConfidence, setDetectedDisciplineConfidence] = useState<
    DisciplineEvidenceLevel | undefined
  >(initialSyncedNote.detectedDisciplineConfidence);

  const [newTagInput, setNewTagInput] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [isSaved, setIsSaved] = useState(true);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDraftRef = useRef<NoteEntity | null>(null);

  const activeFolder = useMemo(
    () => (folderId ? folders.find((f) => f.id === folderId) || null : null),
    [folders, folderId]
  );

  // Memoized academic summary for UI display — uses persisted/state fields in O(1) without scanning content on every render
  const academicSummary = useMemo(
    () =>
      getNoteAcademicSummary(
        {
          title,
          folderId: folderId || undefined,
          subject,
          tags,
          disciplineMode,
          manualDiscipline: disciplineMode === 'manual' ? manualDiscipline : undefined,
          detectedDiscipline,
          detectedDisciplineConfidence,
        },
        {
          folder: activeFolder,
          academicProfile: preferences.academicProfile,
        }
      ),
    [
      title,
      folderId,
      subject,
      tags,
      disciplineMode,
      manualDiscipline,
      detectedDiscipline,
      detectedDisciplineConfidence,
      activeFolder,
      preferences.academicProfile,
    ]
  );

  // Flush any pending debounced auto-save on unmount or before switching note
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (pendingDraftRef.current) {
        const draftToFlush = pendingDraftRef.current;
        pendingDraftRef.current = null;
        void updateNote(draftToFlush);
      }
    };
  }, [note.id]);

  // Synchronize state if note prop changes
  useEffect(() => {
    const folder = note.folderId ? folders.find((f) => f.id === note.folderId) || null : null;
    const synced =
      note.disciplineMode === 'manual' ||
      (note.detectedDiscipline !== undefined && note.detectedDisciplineConfidence !== undefined)
        ? note
        : syncNoteAcademicContext(note, { folder });

    setTitle(note.title);
    setContent(note.content);
    setFolderId(note.folderId || '');
    setSubject(note.subject || '');
    setTags(note.tags || []);
    setDisciplineMode(
      synced.disciplineMode === 'manual' && synced.manualDiscipline?.trim() ? 'manual' : 'auto'
    );
    setManualDiscipline(synced.manualDiscipline || '');
    setDetectedDiscipline(synced.detectedDiscipline);
    setDetectedDisciplineConfidence(synced.detectedDisciplineConfidence);
    setIsSaved(true);
    pendingDraftRef.current = null;
  }, [note.id]);

  // Close delete confirmation on Escape
  useEffect(() => {
    if (!showConfirmDelete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowConfirmDelete(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmDelete]);

  // Debounced auto-save (Room persistent database)
  // Infers academic discipline when the debounce completes so typing does not recalculate on every keystroke
  const triggerAutoSave = (
    newTitle: string,
    newContent: string,
    newFolderId: string,
    newSubject: string,
    newTags: string[],
    newDisciplineMode: DisciplineMode = disciplineMode,
    newManualDiscipline: string = manualDiscipline,
    currentDetectedDiscipline: AcademicAreaId | undefined = detectedDiscipline,
    currentDetectedConfidence: DisciplineEvidenceLevel | undefined = detectedDisciplineConfidence
  ) => {
    setIsSaved(false);
    const rawDraft: NoteEntity = {
      ...note,
      title: newTitle,
      content: newContent,
      folderId: newFolderId || undefined,
      subject: newSubject,
      tags: newTags,
      disciplineMode: newDisciplineMode,
      manualDiscipline: newDisciplineMode === 'manual' ? newManualDiscipline : undefined,
      detectedDiscipline: currentDetectedDiscipline,
      detectedDisciplineConfidence: currentDetectedConfidence,
    };
    pendingDraftRef.current = rawDraft;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      saveTimeoutRef.current = null;
      pendingDraftRef.current = null;
      const targetFolder = newFolderId ? folders.find((f) => f.id === newFolderId) || null : null;
      const syncedDraft = syncNoteAcademicContext(rawDraft, { folder: targetFolder });
      setDetectedDiscipline(syncedDraft.detectedDiscipline);
      setDetectedDisciplineConfidence(syncedDraft.detectedDisciplineConfidence);
      await updateNote(syncedDraft);
      setIsSaved(true);
    }, 600);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    triggerAutoSave(val, content, folderId, subject, tags);
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    if (selectedText) {
      setSelectedText('');
    }
    triggerAutoSave(title, val, folderId, subject, tags);
  };

  const handleFolderChange = (val: string) => {
    setFolderId(val);
    const chosen = folders.find((f) => f.id === val) || null;
    const nextSub = chosen?.subject || subject;
    setSubject(nextSub);
    const synced = syncNoteAcademicContext(
      {
        ...note,
        title,
        content,
        folderId: val || undefined,
        subject: nextSub,
        tags,
        disciplineMode,
        manualDiscipline: disciplineMode === 'manual' ? manualDiscipline : undefined,
        detectedDiscipline,
        detectedDisciplineConfidence,
      },
      { folder: chosen }
    );
    setDetectedDiscipline(synced.detectedDiscipline);
    setDetectedDisciplineConfidence(synced.detectedDisciplineConfidence);
    triggerAutoSave(
      title,
      content,
      val,
      nextSub,
      tags,
      synced.disciplineMode || 'auto',
      synced.manualDiscipline || '',
      synced.detectedDiscipline,
      synced.detectedDisciplineConfidence
    );
  };

  const handleAcademicModeChange = (nextMode: DisciplineMode, explicitManualArea?: string) => {
    const updatedNote = setNoteAcademicMode(
      {
        ...note,
        title,
        content,
        folderId: folderId || undefined,
        subject,
        tags,
        disciplineMode,
        manualDiscipline: manualDiscipline || undefined,
        detectedDiscipline,
        detectedDisciplineConfidence,
      },
      nextMode,
      explicitManualArea,
      {
        folder: activeFolder,
        academicProfile: preferences.academicProfile,
      }
    );

    const resolvedMode = updatedNote.disciplineMode || 'auto';
    const resolvedManual = updatedNote.manualDiscipline || '';

    setDisciplineMode(resolvedMode);
    setManualDiscipline(resolvedManual);
    setDetectedDiscipline(updatedNote.detectedDiscipline);
    setDetectedDisciplineConfidence(updatedNote.detectedDisciplineConfidence);

    triggerAutoSave(
      title,
      content,
      folderId,
      subject,
      tags,
      resolvedMode,
      resolvedManual,
      updatedNote.detectedDiscipline,
      updatedNote.detectedDisciplineConfidence
    );
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

  const buildCurrentSyncedNote = (): NoteEntity => {
    return syncNoteAcademicContext(
      {
        ...note,
        title,
        content,
        folderId: folderId || undefined,
        subject,
        tags,
        disciplineMode,
        manualDiscipline: disciplineMode === 'manual' ? manualDiscipline : undefined,
        detectedDiscipline,
        detectedDisciplineConfidence,
      },
      { folder: activeFolder }
    );
  };

  const handleManualSave = async (notifyIfSaved: boolean = false): Promise<NoteEntity> => {
    const hadPendingChanges = Boolean(pendingDraftRef.current || !isSaved);
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingDraftRef.current = null;
    const syncedNote = buildCurrentSyncedNote();
    setDetectedDiscipline(syncedNote.detectedDiscipline);
    setDetectedDisciplineConfidence(syncedNote.detectedDisciplineConfidence);

    if (hadPendingChanges || notifyIfSaved) {
      try {
        await updateNote(syncedNote);
        setIsSaved(true);
        if (notifyIfSaved || hadPendingChanges) {
          showNotification('Apunte guardado localmente.', 'success');
        }
      } catch (err) {
        console.error('Error guardando apunte:', err);
        showNotification('No se pudo guardar el apunte localmente.', 'error');
      }
    }
    return syncedNote;
  };

  const wordsCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charsCount = content.length;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-24 transition-colors">
      {/* Sticky Top Action Bar */}
      <header className="sticky top-0 z-30 bg-stone-50/95 dark:bg-stone-950/95 backdrop-blur-md border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={async () => {
                await handleManualSave(false);
                onBack();
              }}
              aria-label="Volver a mis apuntes"
              className="inline-flex items-center gap-1.5 min-w-[44px] min-h-[44px] sm:min-h-[38px] px-2.5 rounded-xl text-stone-700 dark:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              title="Guardar y volver a apuntes"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2]" />
              <span className="hidden sm:inline text-xs font-medium">Apuntes</span>
            </button>

            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400 pl-1"
            >
              {isSaved ? (
                <span className="inline-flex items-center gap-1 text-stone-600 dark:text-stone-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="hidden xs:inline">Guardado</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <Save className="w-3.5 h-3.5 shrink-0" />
                  <span>Guardando…</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Pin toggle */}
            <button
              type="button"
              onClick={() => togglePinNote(note.id)}
              aria-pressed={note.isPinned}
              aria-label={note.isPinned ? 'Desfijar apunte' : 'Fijar apunte arriba'}
              className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                note.isPinned
                  ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                  : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/60 dark:hover:bg-stone-800'
              }`}
              title={note.isPinned ? 'Desfijar' : 'Fijar arriba'}
            >
              <Pin className={`w-4 h-4 ${note.isPinned ? 'fill-current' : ''}`} />
            </button>

            {/* Delete note */}
            <button
              type="button"
              onClick={() => setShowConfirmDelete(true)}
              aria-label="Eliminar apunte"
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] rounded-xl text-stone-600 dark:text-stone-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              title="Eliminar apunte"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Primary CTA: Analyze Full Note Concepts */}
            <button
              type="button"
              onClick={async () => {
                const syncedNote = await handleManualSave(false);
                onAnalyze(syncedNote);
              }}
              className="inline-flex items-center gap-1.5 min-h-[40px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
              title="Extraer y definir conceptos académicos de la nota completa"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>Extraer conceptos</span>
            </button>
          </div>
        </div>
      </header>

      {/* Editorial Reading & Writing Workspace */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 sm:pt-8 space-y-4">
        {/* 1. Note Title Input (Primary Hierarchy) */}
        <div>
          <label htmlFor="note-title-input" className="sr-only">
            Título del apunte
          </label>
          <input
            id="note-title-input"
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Título del apunte…"
            className="w-full text-2xl sm:text-3xl font-bold tracking-tight bg-transparent text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none pb-1"
          />
        </div>

        {/* 2. Compact Study Metadata Bar: Notebook, Subject, Tags */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-3 sm:p-3.5 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Folder / Notebook Selector */}
            <div className="relative flex items-center">
              <label htmlFor="note-folder-select" className="sr-only">
                Cuaderno o carpeta
              </label>
              <Folder className="w-4 h-4 text-stone-400 absolute left-3 pointer-events-none" />
              <select
                id="note-folder-select"
                value={folderId}
                onChange={(e) => handleFolderChange(e.target.value)}
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 text-base sm:text-xs rounded-xl bg-stone-50 dark:bg-stone-800/70 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="">Sin cuaderno asignado</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject Field */}
            <div className="relative flex items-center">
              <label htmlFor="note-subject-input" className="sr-only">
                Materia o asignatura
              </label>
              <BookOpen className="w-4 h-4 text-stone-400 absolute left-3 pointer-events-none" />
              <input
                id="note-subject-input"
                type="text"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  triggerAutoSave(title, content, folderId, e.target.value, tags);
                }}
                placeholder="Materia (ej. Psicopatología, Cognitiva)"
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 text-base sm:text-xs rounded-xl bg-stone-50 dark:bg-stone-800/70 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          {/* Academic Context Control (Auto vs Manual) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2.5 border-t border-stone-100 dark:border-stone-800">
            <div className="flex items-center justify-between sm:justify-start gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-400">
                <GraduationCap className="w-3.5 h-3.5 text-stone-400 shrink-0" aria-hidden="true" />
                <span>Contexto académico</span>
              </span>

              <div
                role="group"
                aria-label="Modo de contexto académico del apunte"
                className="inline-flex items-center p-0.5 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80"
              >
                <button
                  type="button"
                  onClick={() => handleAcademicModeChange('auto')}
                  aria-pressed={disciplineMode === 'auto'}
                  className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                    disciplineMode === 'auto'
                      ? 'bg-white dark:bg-stone-900 text-indigo-700 dark:text-indigo-300 shadow-2xs font-semibold'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                  title="Detectar automáticamente la disciplina según el contenido del apunte"
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => handleAcademicModeChange('manual')}
                  aria-pressed={disciplineMode === 'manual'}
                  className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                    disciplineMode === 'manual'
                      ? 'bg-white dark:bg-stone-900 text-indigo-700 dark:text-indigo-300 shadow-2xs font-semibold'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                  title="Fijar manualmente una disciplina para este apunte"
                >
                  Manual
                </button>
              </div>
            </div>

            {disciplineMode === 'auto' ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center justify-between sm:justify-end gap-2 min-w-0"
              >
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stone-50 dark:bg-stone-800/70 text-stone-800 dark:text-stone-200 text-xs font-medium border border-stone-200/80 dark:border-stone-700/80 truncate"
                  title={academicSummary.badgeTooltip}
                >
                  <span className="truncate">{academicSummary.disciplineLabel}</span>
                </span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {academicSummary.statusDescription}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
                <label htmlFor="note-manual-discipline-select" className="sr-only">
                  Disciplina académica manual del apunte
                </label>
                <select
                  id="note-manual-discipline-select"
                  value={manualDiscipline || academicSummary.areaId}
                  onChange={(e) => handleAcademicModeChange('manual', e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 text-base sm:text-xs rounded-xl bg-stone-50 dark:bg-stone-800/70 border border-indigo-300 dark:border-indigo-800 text-stone-900 dark:text-stone-100 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  {manualDiscipline && !isValidAcademicAreaId(manualDiscipline) && (
                    <option value={manualDiscipline}>{manualDiscipline}</option>
                  )}
                  {ACADEMIC_AREAS_LIST.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Tags list & add tag */}
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-stone-100 dark:border-stone-800">
            <Tag className="w-3.5 h-3.5 text-stone-400 shrink-0 mr-0.5" aria-hidden="true" />
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-medium"
              >
                <span>#{t}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(t)}
                  aria-label={`Quitar etiqueta ${t}`}
                  className="p-0.5 rounded hover:text-red-600 dark:hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}

            <div className="inline-flex items-center gap-1">
              <label htmlFor="note-new-tag-input" className="sr-only">
                Añadir etiqueta
              </label>
              <input
                id="note-new-tag-input"
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="+ Añadir etiqueta…"
                className="w-32 sm:w-28 px-2 py-1 text-base sm:text-xs bg-transparent border-b border-dashed border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 placeholder:text-stone-400 focus:outline-none focus:border-indigo-600"
              />
              {newTagInput.trim() && (
                <button
                  type="button"
                  onClick={handleAddTag}
                  aria-label="Confirmar etiqueta"
                  className="inline-flex items-center justify-center min-w-[28px] min-h-[28px] rounded-lg bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-indigo-600 hover:text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Contextual Selected Text Banner */}
        {selectedText && (
          <div
            role="region"
            aria-label="Acción sobre texto seleccionado"
            className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-xs text-stone-800 dark:text-stone-200"
          >
            <span className="line-clamp-1 italic text-stone-600 dark:text-stone-300">
              Selección: «{selectedText}»
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  const currentSelection = selectedText;
                  const syncedNote = await handleManualSave(false);
                  onAnalyze(syncedNote, currentSelection);
                }}
                className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 py-1 px-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Analizar fragmento</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedText('')}
                aria-label="Descartar selección de texto"
                title="Descartar selección"
                className="inline-flex items-center justify-center min-w-[28px] min-h-[28px] rounded-lg text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-indigo-100/80 dark:hover:bg-indigo-900/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Formatting Toolbar & Counter */}
        <div
          role="toolbar"
          aria-label="Formato de texto"
          className="flex items-center gap-1 py-1.5 px-1 text-stone-600 dark:text-stone-400 border-y border-stone-200 dark:border-stone-800 overflow-x-auto text-xs"
        >
          <button
            type="button"
            onClick={() => insertFormatting('**', '**')}
            aria-label="Negrita"
            title="Negrita (**texto**)"
            className="inline-flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] rounded-lg hover:bg-stone-200/70 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('## ')}
            aria-label="Encabezado de sección"
            title="Encabezado de sección (## )"
            className="inline-flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] rounded-lg hover:bg-stone-200/70 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('- ')}
            aria-label="Lista con viñetas"
            title="Lista con viñetas (- )"
            className="inline-flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] rounded-lg hover:bg-stone-200/70 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => insertFormatting('> ')}
            aria-label="Cita bibliográfica o textual"
            title="Cita (> )"
            className="inline-flex items-center justify-center min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] rounded-lg hover:bg-stone-200/70 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            <Quote className="w-4 h-4" />
          </button>

          <div className="ml-auto text-xs text-stone-500 dark:text-stone-400 tabular-nums pl-2 shrink-0">
            {wordsCount} {wordsCount === 1 ? 'palabra' : 'palabras'} · {charsCount} caract.
          </div>
        </div>

        {/* 3. Main Note Content Textarea */}
        <div>
          <label htmlFor="note-content-textarea" className="sr-only">
            Contenido del apunte
          </label>
          <textarea
            id="note-content-textarea"
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onSelect={handleSelectText}
            onMouseUp={handleSelectText}
            onKeyUp={handleSelectText}
            placeholder="Escribe tus apuntes de clase, definiciones de autores, observaciones clínicas o fragmentos de lectura. También puedes seleccionar un párrafo específico para extraer sus conceptos…"
            rows={20}
            className="w-full min-h-[55vh] bg-transparent text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 text-base leading-relaxed resize-y focus:outline-none focus:ring-0 font-sans"
          />
        </div>
      </div>

      {/* Confirm Delete AlertDialog */}
      {showConfirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setShowConfirmDelete(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-note-title"
            aria-describedby="delete-note-desc"
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-stone-900 border-t sm:border border-stone-200 dark:border-stone-800 p-5 sm:p-6 shadow-2xl safe-area-bottom"
          >
            <h2
              id="delete-note-title"
              className="text-base font-bold text-stone-900 dark:text-stone-100"
            >
              ¿Eliminar este apunte?
            </h2>
            <p
              id="delete-note-desc"
              className="text-sm text-stone-600 dark:text-stone-400 mt-2 mb-6 leading-relaxed"
            >
              Se eliminará permanentemente «{title || 'Apunte sin título'}» de este dispositivo. Los conceptos que ya hayas guardado en tu glosario se conservarán.
            </p>
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                className="min-h-[44px] px-4 py-2.5 text-sm font-medium rounded-xl text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowConfirmDelete(false);
                  await deleteNote(note.id);
                  onBack();
                }}
                className="min-h-[44px] px-4 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
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
