import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Search, FolderPlus, X, Filter, Wifi, WifiOff, Sparkles, ArrowLeft, AlertTriangle } from 'lucide-react';
import { PsychologyLogo } from '../Common/PsychologyLogo';

export const OneUIHeader: React.FC = () => {
  const {
    notes,
    folders,
    selectedFolderId,
    setSelectedFolderId,
    selectedSubject,
    setSelectedSubject,
    searchQuery,
    setSearchQuery,
    createFolder,
    isOnline,
    aiAvailable,
    activeTab,
    showNotification,
  } = useApp();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#6366F1');
  const [newFolderSubject, setNewFolderSubject] = useState('');

  // Extract unique subjects from notes and folders
  const allSubjects = Array.from(
    new Set([
      ...notes.map((n) => n.subject).filter(Boolean),
      ...folders.map((f) => f.subject).filter(Boolean) as string[],
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

    const handlePopState = (e: PopStateEvent) => {
      // Android Back Button / Gesture was pressed
      historyPushedRef.current = false;

      if (hasUnsavedChanges) {
        // Prevent leaving accidentally: re-push modal state and show confirmation
        window.history.pushState({ modal: 'createNotebook' }, '');
        historyPushedRef.current = true;
        setShowDiscardConfirm(true);
      } else {
        // No unsaved changes -> exit immediately back to previous screen
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
        return 'Todos los apuntes';
      case 'analyze':
        return 'Análisis conceptual';
      case 'glossary':
        return 'Glosario académico';
      case 'library':
        return 'Biblioteca documental';
      case 'settings':
        return 'Ajustes y privacidad';
      default:
        return 'Nexo Notes';
    }
  };

  const getHeaderSubtitle = () => {
    switch (activeTab) {
      case 'notes': {
        const count = notes.length;
        return `${count} ${count === 1 ? 'apunte' : 'apuntes'} · Guardado local seguro`;
      }
      case 'analyze':
        return 'Detección técnica & Verificación con Google Search';
      case 'glossary':
        return 'Términos fundamentados con fuentes verificables';
      case 'library':
        return 'PDFs, diapositivas y extracción OCR';
      case 'settings':
        return 'Preferencias, temas y copias de seguridad';
      default:
        return 'Cuaderno inteligente';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-50/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-slate-200/60 dark:border-zinc-800/60 pt-3 pb-2 transition-colors">
      <div className="max-w-xl mx-auto px-4">
        {/* Top Reachability Bar */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5">
            {/* Psychology Logo Badge */}
            <PsychologyLogo size={22} className="shadow-xs" />

            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400 bg-clip-text text-transparent">
              Nexo Notes
            </span>

            <div className="flex items-center gap-1.5 ml-1">
              {isOnline ? (
                <span
                  title="Conexión en línea activa"
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium"
                >
                  <Wifi className="w-3 h-3" /> Online
                </span>
              ) : (
                <span
                  title="Modo sin conexión: base de datos local 100% operativa"
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-medium"
                >
                  <WifiOff className="w-3 h-3" /> Local
                </span>
              )}
              {aiAvailable && (
                <span
                  title="Grounding con Gemini & Google Search disponible"
                  className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300"
                >
                  <Sparkles className="w-3 h-3 text-indigo-500" /> Grounding IA
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="p-2 rounded-full text-slate-600 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition"
              aria-label="Buscar"
            >
              <Search className="w-4.5 h-4.5" />
            </button>
            {activeTab === 'notes' && (
              <button
                onClick={handleOpenFolderModal}
                className="p-2 rounded-full text-slate-600 dark:text-zinc-300 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition"
                title="Crear nuevo cuaderno"
              >
                <FolderPlus className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
        </div>

        {/* Large One UI Header Title */}
        <div className="py-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight">
            {getHeaderTitle()}
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {getHeaderSubtitle()}
          </p>
        </div>

        {/* Expandable Search Input */}
        {isSearchOpen && (
          <div className="mt-2.5 mb-1 relative animate-scaleIn">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por término, materia o concepto..."
              autoFocus
              className="w-full pl-10 pr-10 py-2 text-xs rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Horizontal Chips: Folders and Subjects (Only on Notes tab) */}
        {activeTab === 'notes' && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2 text-xs -mx-1 px-1">
            <button
              onClick={() => {
                setSelectedFolderId(null);
                setSelectedSubject(null);
              }}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition ${
                selectedFolderId === null && selectedSubject === null
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-zinc-800/70 text-slate-600 dark:text-zinc-400 border border-transparent hover:border-slate-300 dark:hover:border-zinc-700'
              }`}
            >
              Todos los apuntes
            </button>

            {folders.map((f) => {
              const isSelected = selectedFolderId === f.id;
              const count = notes.filter((n) => n.folderId === f.id).length;
              return (
                <button
                  key={f.id}
                  onClick={() => {
                    setSelectedFolderId(isSelected ? null : f.id);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-zinc-800/70 text-slate-600 dark:text-zinc-400 border border-transparent hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: f.color }}
                  />
                  <span>{f.name}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}

            {allSubjects.map((sub) => {
              const isSelected = selectedSubject === sub;
              return (
                <button
                  key={sub}
                  onClick={() => {
                    setSelectedSubject(isSelected ? null : sub);
                    setSelectedFolderId(null);
                  }}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition ${
                    isSelected
                      ? 'bg-slate-800 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm'
                      : 'bg-slate-100 dark:bg-zinc-800/70 text-slate-600 dark:text-zinc-400 border border-transparent hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  #{sub}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* New Notebook / Folder Creation Screen */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-6 shadow-2xl relative animate-scaleIn">
            {/* Modal Header with Android Back Button */}
            <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className="p-1.5 -ml-1 rounded-xl text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                  title="Regresar a la pantalla anterior"
                  aria-label="Atrás"
                >
                  <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
                </button>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100 leading-tight">
                    Crear cuaderno
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Organización académica
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRequestClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Nombre del cuaderno o carpeta
                </label>
                <input
                  type="text"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Ej. Psicología Social"
                  autoFocus
                  className="w-full px-3.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Materia o disciplina (opcional)
                </label>
                <input
                  type="text"
                  value={newFolderSubject}
                  onChange={(e) => setNewFolderSubject(e.target.value)}
                  placeholder="Ej. Psicología Cognitiva"
                  className="w-full px-3.5 py-2 text-sm rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                  Color distintivo
                </label>
                <div className="flex items-center gap-2">
                  {['#6366F1', '#EC4899', '#06B6D4', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444'].map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setNewFolderColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        newFolderColor === c
                          ? 'scale-125 ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-zinc-900'
                          : 'opacity-80'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Atrás</span>
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-sm active:scale-95"
                >
                  Guardar cuaderno
                </button>
              </div>
            </form>

            {/* Sub-dialog: Discard unsaved changes confirmation */}
            {showDiscardConfirm && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs rounded-3xl animate-scaleIn text-center">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                  <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-zinc-100 mb-1">
                  ¿Descartar cambios del cuaderno?
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4 max-w-xs leading-relaxed">
                  Has ingresado datos que no se han guardado. Si sales ahora, se perderán las modificaciones.
                </p>
                <div className="flex items-center gap-2 w-full justify-center">
                  <button
                    type="button"
                    onClick={() => setShowDiscardConfirm(false)}
                    className="flex-1 py-2 px-3 text-xs font-medium rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                  >
                    Seguir editando
                  </button>
                  <button
                    type="button"
                    onClick={handleForceCloseFolderModal}
                    className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition shadow-xs"
                  >
                    Descartar y salir
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
