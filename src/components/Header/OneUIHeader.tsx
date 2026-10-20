import React, { useState, useEffect, useRef } from 'react';
import { useApp, AppTab } from '../../context/AppContext';
import {
  Search,
  FolderPlus,
  X,
  Wifi,
  WifiOff,
  ArrowLeft,
  AlertTriangle,
  FileText,
  Layers,
  BookOpen,
  FolderArchive,
  Settings,
  Check,
} from 'lucide-react';
import { PsychologyLogo } from '../Common/PsychologyLogo';

export const OneUIHeader: React.FC = () => {
  const {
    notes,
    folders,
    glossary,
    documents,
    selectedFolderId,
    setSelectedFolderId,
    selectedSubject,
    setSelectedSubject,
    searchQuery,
    setSearchQuery,
    createFolder,
    isOnline,
    activeTab,
    setActiveTab,
    setActiveNote,
    showNotification,
  } = useApp();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#4F46E5');
  const [newFolderSubject, setNewFolderSubject] = useState('');

  // Extract unique subjects from notes and folders
  const allSubjects = Array.from(
    new Set([
      ...notes.map((n) => n.subject).filter(Boolean),
      ...(folders.map((f) => f.subject).filter(Boolean) as string[]),
    ])
  );

  const hasUnsavedChanges = newFolderName.trim().length > 0 || newFolderSubject.trim().length > 0;
  const historyPushedRef = useRef(false);

  // Open creation modal and push browser/Android navigation state
  const handleOpenFolderModal = () => {
    window.history.pushState({ modal: 'createNotebook' }, '');
    historyPushedRef.current = true;
    setShowFolderModal(true);
    setShowDiscardConfirm(false);
  };

  // Close creation modal cleanly and pop history state if it was pushed
  const handleForceCloseFolderModal = () => {
    setNewFolderName('');
    setNewFolderSubject('');
    setShowFolderModal(false);
    setShowDiscardConfirm(false);

    if (historyPushedRef.current) {
      historyPushedRef.current = false;
      if (window.history.state?.modal === 'createNotebook') {
        window.history.back();
      }
    }
  };

  // User requests back action (from visible back button, Cancel button, or ESC key)
  const handleRequestClose = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirm(true);
    } else {
      handleForceCloseFolderModal();
    }
  };

  // Android back button / popstate handling
  useEffect(() => {
    if (!showFolderModal) return;

    const handlePopState = () => {
      historyPushedRef.current = false;

      if (hasUnsavedChanges) {
        window.history.pushState({ modal: 'createNotebook' }, '');
        historyPushedRef.current = true;
        setShowDiscardConfirm(true);
      } else {
        setNewFolderName('');
        setNewFolderSubject('');
        setShowFolderModal(false);
        setShowDiscardConfirm(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleRequestClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showFolderModal, hasUnsavedChanges]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const folderName = newFolderName.trim();
    await createFolder(folderName, newFolderColor, newFolderSubject.trim() || undefined);

    setNewFolderName('');
    setNewFolderSubject('');
    setShowFolderModal(false);
    setShowDiscardConfirm(false);

    if (historyPushedRef.current) {
      historyPushedRef.current = false;
      if (window.history.state?.modal === 'createNotebook') {
        window.history.back();
      }
    }

    showNotification(`Cuaderno "${folderName}" guardado correctamente.`, 'success');
  };

  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'notes':
        return 'Mis apuntes';
      case 'analyze':
        return 'Análisis de conceptos';
      case 'glossary':
        return 'Glosario de psicología';
      case 'library':
        return 'Biblioteca de lecturas';
      case 'settings':
        return 'Ajustes y respaldo';
      default:
        return 'Nexo Notes';
    }
  };

  const getHeaderSubtitle = () => {
    switch (activeTab) {
      case 'notes': {
        const count = notes.length;
        return `${count} ${count === 1 ? 'apunte guardado' : 'apuntes guardados'} en este dispositivo`;
      }
      case 'analyze':
        return 'Extrae términos psicológicos de tus apuntes y contrástalos con fuentes académicas';
      case 'glossary':
        return `${glossary.length} ${glossary.length === 1 ? 'concepto registrado' : 'conceptos registrados'} para estudio y repaso`;
      case 'library':
        return `${documents.length} ${documents.length === 1 ? 'documento importado' : 'documentos importados'} (PDF, PPTX y lecturas)`;
      case 'settings':
        return 'Tema de lectura, copias de seguridad locales y privacidad';
      default:
        return 'Espacio académico de estudio';
    }
  };

  // Fase 3.1: Retirada temporal y reversible del acceso a Biblioteca / importación de documentos
  const SHOW_DOCUMENT_LIBRARY_TAB = false;

  const desktopTabs: Array<{
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }> = [
    { id: 'notes', label: 'Apuntes', icon: FileText, count: notes.length },
    { id: 'analyze', label: 'Analizar', icon: Layers },
    { id: 'glossary', label: 'Glosario', icon: BookOpen, count: glossary.length },
    ...(SHOW_DOCUMENT_LIBRARY_TAB
      ? [{ id: 'library' as AppTab, label: 'Biblioteca', icon: FolderArchive, count: documents.length }]
      : []),
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];

  const folderColors = [
    { hex: '#4F46E5', name: 'Índigo' },
    { hex: '#0D9488', name: 'Verde azulado' },
    { hex: '#2563EB', name: 'Azul' },
    { hex: '#D97706', name: 'Ámbar' },
    { hex: '#7C3AED', name: 'Violeta' },
    { hex: '#E11D48', name: 'Carmesí' },
    { hex: '#57534E', name: 'Piedra' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-stone-50/95 dark:bg-stone-950/95 backdrop-blur-sm border-b border-stone-200 dark:border-stone-800/80 transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-2.5">
        {/* Top Bar: Brand + Desktop Navigation + Contextual Controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <PsychologyLogo size={20} className="shrink-0" />
            <span className="font-bold text-base sm:text-lg tracking-tight text-stone-900 dark:text-stone-100 truncate">
              Nexo Notes
            </span>

            <span
              title={
                isOnline
                  ? 'Conectado: consultas externas disponibles'
                  : 'Sin conexión: tus apuntes y glosario local siguen disponibles'
              }
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium border ${
                isOnline
                  ? 'bg-stone-100 dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-800'
                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden xs:inline">En línea</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Sin conexión</span>
                </>
              )}
            </span>
          </div>

          {/* Desktop Navigation Tabs (visible on md and larger) */}
          <nav
            aria-label="Navegación principal de escritorio"
            className="hidden md:flex items-center gap-1 bg-stone-100 dark:bg-stone-900 p-1 rounded-xl border border-stone-200/80 dark:border-stone-800"
          >
            {desktopTabs.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setActiveNote(null);
                    setActiveTab(item.id);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                    isActive
                      ? 'bg-white dark:bg-stone-800 text-indigo-600 dark:text-indigo-400 font-semibold shadow-2xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  {typeof item.count === 'number' && item.count > 0 && (
                    <span
                      className={`text-[11px] px-1.5 py-0.2 rounded-md ${
                        isActive
                          ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300'
                          : 'text-stone-500 dark:text-stone-500'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Quick Actions (Notes search & new notebook) */}
          <div className="flex items-center gap-1">
            {activeTab === 'notes' && (
              <>
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(!isSearchOpen)}
                  aria-expanded={isSearchOpen}
                  aria-label={isSearchOpen ? 'Cerrar búsqueda de apuntes' : 'Buscar en mis apuntes'}
                  className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-h-[38px] sm:px-3 rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                    isSearchOpen || searchQuery
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60'
                      : 'text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1.5">Buscar</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenFolderModal}
                  aria-label="Crear cuaderno"
                  className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-h-[38px] sm:px-3 rounded-xl text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  title="Crear cuaderno o carpeta"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1.5">Nuevo cuaderno</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Page Title & Contextual Subtitle */}
        <div className="mt-2 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5">
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-50 tracking-tight">
            {getHeaderTitle()}
          </h1>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            {getHeaderSubtitle()}
          </p>
        </div>

        {/* Expandable Search Input for Notes */}
        {activeTab === 'notes' && (isSearchOpen || searchQuery.trim().length > 0) && (
          <div className="mt-3 relative">
            <label htmlFor="notes-global-search" className="sr-only">
              Buscar apuntes por título, materia o etiqueta
            </label>
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="notes-global-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por título, materia, concepto o etiqueta…"
              autoFocus={isSearchOpen}
              className="w-full min-h-[44px] pl-10 pr-10 py-2 text-base sm:text-sm rounded-xl bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Horizontal Filter Bar: Notebooks & Subjects (Notes tab only) */}
        {activeTab === 'notes' && (
          <div
            role="region"
            aria-label="Filtrar apuntes por cuaderno o materia"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2.5 pb-0.5 text-xs -mx-1 px-1"
          >
            <button
              type="button"
              onClick={() => {
                setSelectedFolderId(null);
                setSelectedSubject(null);
              }}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                selectedFolderId === null && selectedSubject === null
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              Todos ({notes.length})
            </button>

            {folders.map((f) => {
              const isSelected = selectedFolderId === f.id;
              const count = notes.filter((n) => n.folderId === f.id).length;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSelectedFolderId(isSelected ? null : f.id);
                  }}
                  className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isSelected ? '#ffffff' : f.color }}
                  />
                  <span>{f.name}</span>
                  <span className={`text-[11px] ${isSelected ? 'text-indigo-100' : 'text-stone-400 dark:text-stone-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}

            {allSubjects.map((sub) => {
              const isSelected = selectedSubject === sub;
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => {
                    setSelectedSubject(isSelected ? null : sub);
                    setSelectedFolderId(null);
                  }}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                    isSelected
                      ? 'bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold'
                      : 'bg-stone-100 dark:bg-stone-900 text-stone-600 dark:text-stone-400 border border-stone-200/70 dark:border-stone-800 hover:bg-stone-200/70 dark:hover:bg-stone-800'
                  }`}
                >
                  {sub}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* New Notebook / Folder Creation Modal */}
      {showFolderModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-folder-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-950/60 backdrop-blur-xs p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-stone-900 border-t sm:border border-stone-200 dark:border-stone-800 p-5 sm:p-6 shadow-xl relative safe-area-bottom">
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className="inline-flex items-center justify-center w-10 h-10 -ml-1.5 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  title="Volver"
                  aria-label="Volver"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 id="create-folder-title" className="text-base font-bold text-stone-900 dark:text-stone-100 leading-tight">
                    Nuevo cuaderno
                  </h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Agrupa tus apuntes por asignatura o seminario
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRequestClose}
                aria-label="Cerrar diálogo"
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label
                  htmlFor="folder-name-input"
                  className="block text-xs font-semibold text-stone-800 dark:text-stone-200 mb-1.5"
                >
                  Nombre del cuaderno
                </label>
                <input
                  id="folder-name-input"
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Ej. Psicología del Desarrollo"
                  autoFocus
                  className="w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                />
              </div>

              <div>
                <label
                  htmlFor="folder-subject-input"
                  className="block text-xs font-semibold text-stone-800 dark:text-stone-200 mb-1.5"
                >
                  Asignatura o área (opcional)
                </label>
                <input
                  id="folder-subject-input"
                  type="text"
                  value={newFolderSubject}
                  onChange={(e) => setNewFolderSubject(e.target.value)}
                  placeholder="Ej. Psicología Cognitiva"
                  className="w-full min-h-[44px] px-3.5 py-2 text-base sm:text-sm rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                />
              </div>

              <div>
                <span className="block text-xs font-semibold text-stone-800 dark:text-stone-200 mb-2">
                  Color de referencia
                </span>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {folderColors.map((c) => {
                    const isSelected = newFolderColor === c.hex;
                    return (
                      <button
                        type="button"
                        key={c.hex}
                        onClick={() => setNewFolderColor(c.hex)}
                        aria-label={`Color ${c.name}`}
                        aria-pressed={isSelected}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                          isSelected
                            ? 'ring-2 ring-stone-900 dark:ring-stone-100 ring-offset-2 dark:ring-offset-stone-900 scale-105'
                            : 'opacity-85 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {isSelected && <Check className="w-4 h-4 text-white stroke-[2.5]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Guardar cuaderno
                </button>
              </div>
            </form>

            {/* Sub-dialog: Discard unsaved changes confirmation */}
            {showDiscardConfirm && (
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="discard-folder-title"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-white/98 dark:bg-stone-900/98 rounded-t-2xl sm:rounded-2xl text-center"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center mb-3">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 id="discard-folder-title" className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-1">
                  ¿Descartar este cuaderno sin guardar?
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-400 mb-5 max-w-xs leading-relaxed">
                  Has escrito datos para el nuevo cuaderno. Si sales ahora, no se guardarán.
                </p>
                <div className="flex items-center gap-2.5 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(false)}
                    className="flex-1 min-h-[44px] py-2 px-3 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  >
                    Seguir editando
                  </button>
                  <button
                    type="button"
                    onClick={handleForceCloseFolderModal}
                    className="flex-1 min-h-[44px] py-2 px-3 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
