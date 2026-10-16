import React, { createContext, useContext, useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  NoteEntity,
  FolderEntity,
  ConceptEntity,
  DocumentEntity,
  AppPreferences,
  ThemePreference,
} from '../types/models';
import { localDB } from '../db/indexedDB';

export type AppTab = 'notes' | 'analyze' | 'glossary' | 'library' | 'settings';

interface AppContextType {
  notes: NoteEntity[];
  folders: FolderEntity[];
  glossary: ConceptEntity[];
  documents: DocumentEntity[];
  preferences: AppPreferences;
  activeNote: NoteEntity | null;
  activeTab: AppTab;
  searchQuery: string;
  selectedFolderId: string | null;
  selectedSubject: string | null;
  isOnline: boolean;
  aiAvailable: boolean;
  isLoading: boolean;
  notification: { message: string; type: 'info' | 'success' | 'error' } | null;

  // Actions
  setActiveTab: (tab: AppTab) => void;
  setActiveNote: (note: NoteEntity | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedFolderId: (id: string | null) => void;
  setSelectedSubject: (subject: string | null) => void;

  createNote: (subject?: string, folderId?: string) => Promise<NoteEntity>;
  updateNote: (note: NoteEntity) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  togglePinNote: (id: string) => Promise<void>;

  createFolder: (name: string, color: string, subject?: string) => Promise<FolderEntity>;
  deleteFolder: (id: string) => Promise<void>;

  saveConcept: (concept: ConceptEntity) => Promise<void>;
  saveMultipleConcepts: (concepts: ConceptEntity[]) => Promise<void>;
  deleteConcept: (id: string) => Promise<void>;
  toggleFavoriteConcept: (id: string) => Promise<void>;

  saveDocument: (doc: DocumentEntity) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;

  updatePreferences: (newPrefs: Partial<AppPreferences>) => Promise<void>;
  exportBackupFile: () => Promise<void>;
  importBackupFile: (file: File) => Promise<{ success: boolean; message: string }>;
  showNotification: (message: string, type?: 'info' | 'success' | 'error') => void;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notes, setNotes] = useState<NoteEntity[]>([]);
  const [folders, setFolders] = useState<FolderEntity[]>([]);
  const [glossary, setGlossary] = useState<ConceptEntity[]>([]);
  const [documents, setDocuments] = useState<DocumentEntity[]>([]);
  const [preferences, setPreferences] = useState<AppPreferences>({
    theme: (typeof window !== 'undefined' && (localStorage.getItem('nexo_theme') as ThemePreference)) || 'system',
    chunkSize: 2500,
    autoDetectOnSave: false,
    lastSubject: 'Psicología Cognitiva',
    showSourcesPreview: true,
    offlineOnlyMode: false,
  });

  const [activeNote, setActiveNote] = useState<NoteEntity | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('notes');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [aiAvailable, setAiAvailable] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotification = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    setNotification({ message, type });
    notificationTimeoutRef.current = setTimeout(() => {
      setNotification(null);
      notificationTimeoutRef.current = null;
    }, 3800);
  }, []);

  // Check online status and server AI availability
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        setAiAvailable(!!data.aiAvailable);
      })
      .catch(() => {
        setAiAvailable(false);
      });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  // Synchronize Theme (light, dark, system)
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (theme: ThemePreference) => {
      let isDark = false;
      if (theme === 'dark') {
        isDark = true;
      } else if (theme === 'light') {
        isDark = false;
      } else {
        // System preference
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
        root.style.colorScheme = 'light';
      }

      // Update mobile system bar theme-color
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#09090b' : '#f8fafc');
      }

      try {
        localStorage.setItem('nexo_theme', theme);
      } catch {
        // ignore storage errors
      }
    };

    applyTheme(preferences.theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      if (preferences.theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [preferences.theme]);

  // Load initial data from Room-like localDB
  const refreshData = async () => {
    try {
      const [allNotes, allFolders, allGlossary, allDocs, prefs] = await Promise.all([
        localDB.getAllNotes(),
        localDB.getAllFolders(),
        localDB.getAllConcepts(),
        localDB.getAllDocuments(),
        localDB.getPreferences(),
      ]);

      setNotes(allNotes);
      setFolders(allFolders);
      setGlossary(allGlossary);
      setDocuments(allDocs);
      setPreferences(prefs);
    } catch (err) {
      console.error('Error cargando base de datos local:', err);
      showNotification('Error al acceder a la base de datos local.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Notes actions
  const createNote = async (subject?: string, folderId?: string): Promise<NoteEntity> => {
    const defaultSub = subject || (folderId ? folders.find((f) => f.id === folderId)?.subject : '') || preferences.lastSubject || 'General';
    const newNote: NoteEntity = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: 'Nota sin título',
      content: '',
      folderId: folderId || undefined,
      subject: defaultSub,
      tags: [],
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      wordCount: 0,
      charCount: 0,
    };

    await localDB.saveNote(newNote);
    setNotes((prev) => [newNote, ...prev]);
    setActiveNote(newNote);
    return newNote;
  };

  const updateNote = async (updatedNote: NoteEntity) => {
    const trimmedTitle = updatedNote.title.trim() || 'Nota sin título';
    const words = updatedNote.content.trim() ? updatedNote.content.trim().split(/\s+/).length : 0;
    const chars = updatedNote.content.length;

    const noteToSave: NoteEntity = {
      ...updatedNote,
      title: trimmedTitle,
      updatedAt: Date.now(),
      wordCount: words,
      charCount: chars,
    };

    await localDB.saveNote(noteToSave);
    setNotes((prev) => {
      const filtered = prev.filter((n) => n.id !== noteToSave.id);
      const next = [noteToSave, ...filtered];
      next.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
      return next;
    });

    if (activeNote?.id === noteToSave.id) {
      setActiveNote(noteToSave);
    }
  };

  const deleteNote = async (id: string) => {
    await localDB.deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeNote?.id === id) {
      setActiveNote(null);
    }
    showNotification('Nota eliminada.', 'info');
  };

  const togglePinNote = async (id: string) => {
    const target = notes.find((n) => n.id === id);
    if (!target) return;
    const updated: NoteEntity = {
      ...target,
      isPinned: !target.isPinned,
      updatedAt: Date.now(),
    };
    await localDB.saveNote(updated);
    setNotes((prev) => {
      const updatedList = prev.map((n) => (n.id === id ? updated : n));
      updatedList.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
      return updatedList;
    });
  };

  // Folders actions
  const createFolder = async (name: string, color: string, subject?: string): Promise<FolderEntity> => {
    const newFolder: FolderEntity = {
      id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      color,
      subject: subject?.trim(),
      createdAt: Date.now(),
    };
    await localDB.saveFolder(newFolder);
    setFolders((prev) => [...prev, newFolder]);
    showNotification(`Carpeta "${name}" creada.`, 'success');
    return newFolder;
  };

  const deleteFolder = async (id: string) => {
    await localDB.deleteFolder(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setNotes((prev) => prev.map((n) => (n.folderId === id ? { ...n, folderId: undefined } : n)));
    setActiveNote((prev) => (prev && prev.folderId === id ? { ...prev, folderId: undefined } : prev));
    if (selectedFolderId === id) setSelectedFolderId(null);
    showNotification('Carpeta eliminada.', 'info');
  };

  // Glossary actions
  const saveConcept = async (concept: ConceptEntity) => {
    const saved = await localDB.saveConcept(concept);
    setGlossary((prev) => {
      const filtered = prev.filter((c) => c.id !== saved.id && c.normalizedName !== saved.normalizedName);
      const next = [saved, ...filtered];
      next.sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return a.termName.localeCompare(b.termName);
      });
      return next;
    });
    showNotification(`Concepto "${saved.termName}" guardado en el glosario.`, 'success');
  };

  const saveMultipleConcepts = async (newConcepts: ConceptEntity[]) => {
    await localDB.saveMultipleConcepts(newConcepts);
    const all = await localDB.getAllConcepts();
    setGlossary(all);
    showNotification(`${newConcepts.length} conceptos agregados al glosario.`, 'success');
  };

  const deleteConcept = async (id: string) => {
    await localDB.deleteConcept(id);
    setGlossary((prev) => prev.filter((c) => c.id !== id));
    showNotification('Concepto eliminado del glosario.', 'info');
  };

  const toggleFavoriteConcept = async (id: string) => {
    const target = glossary.find((c) => c.id === id);
    if (!target) return;
    const updated = { ...target, isFavorite: !target.isFavorite };
    const saved = await localDB.saveConcept(updated);
    setGlossary((prev) => {
      const updatedList = prev.map((c) => (c.id === id ? saved : c));
      updatedList.sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return a.termName.localeCompare(b.termName);
      });
      return updatedList;
    });
  };

  // Documents actions
  const saveDocument = async (doc: DocumentEntity) => {
    await localDB.saveDocument(doc);
    setDocuments((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)]);
    showNotification(`Documento "${doc.fileName}" guardado en biblioteca.`, 'success');
  };

  const deleteDocument = async (id: string) => {
    await localDB.deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    showNotification('Documento eliminado.', 'info');
  };

  // Preferences actions
  const updatePreferences = async (newPrefs: Partial<AppPreferences>) => {
    const updated = { ...preferences, ...newPrefs };
    setPreferences(updated);
    await localDB.savePreferences(updated);
    showNotification('Ajustes guardados.', 'success');
  };

  // Backup actions
  const exportBackupFile = async () => {
    try {
      const backup = await localDB.exportFullBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `nexo-notes-backup-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification('Copia de seguridad exportada con éxito.', 'success');
    } catch (err) {
      console.error('Error exportando respaldo:', err);
      showNotification('Error al generar la copia de seguridad.', 'error');
    }
  };

  const importBackupFile = async (file: File): Promise<{ success: boolean; message: string }> => {
    try {
      const text = await file.text();
      let parsedData;
      try {
        parsedData = JSON.parse(text);
      } catch {
        return { success: false, message: 'El archivo seleccionado no es un JSON válido.' };
      }

      // Check structure
      if (!parsedData || (!Array.isArray(parsedData.notes) && !Array.isArray(parsedData.glossary))) {
        return {
          success: false,
          message: 'El archivo no contiene la estructura requerida de Nexo Notes.',
        };
      }

      const result = await localDB.restoreFullBackup(parsedData);
      await refreshData();
      showNotification(`Respaldo restaurado: ${result.notesRestored} notas y ${result.conceptsRestored} conceptos.`, 'success');
      return {
        success: true,
        message: `Restaurado con éxito (${result.notesRestored} notas, ${result.conceptsRestored} conceptos).`,
      };
    } catch (err: any) {
      console.error('Error restaurando respaldo:', err);
      return { success: false, message: err?.message || 'Error al procesar el archivo de respaldo.' };
    }
  };

  const contextValue = useMemo<AppContextType>(
    () => ({
      notes,
      folders,
      glossary,
      documents,
      preferences,
      activeNote,
      activeTab,
      searchQuery,
      selectedFolderId,
      selectedSubject,
      isOnline,
      aiAvailable,
      isLoading,
      notification,

      setActiveTab,
      setActiveNote,
      setSearchQuery,
      setSelectedFolderId,
      setSelectedSubject,

      createNote,
      updateNote,
      deleteNote,
      togglePinNote,

      createFolder,
      deleteFolder,

      saveConcept,
      saveMultipleConcepts,
      deleteConcept,
      toggleFavoriteConcept,

      saveDocument,
      deleteDocument,

      updatePreferences,
      exportBackupFile,
      importBackupFile,
      showNotification,
      refreshData,
    }),
    [
      notes,
      folders,
      glossary,
      documents,
      preferences,
      activeNote,
      activeTab,
      searchQuery,
      selectedFolderId,
      selectedSubject,
      isOnline,
      aiAvailable,
      isLoading,
      notification,
      showNotification,
    ]
  );

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp debe ser utilizado dentro de un AppProvider');
  }
  return context;
};
