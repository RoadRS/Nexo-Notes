import React from 'react';
import { useApp, AppTab } from '../../context/AppContext';
import { FileText, Layers, BookOpen, FolderArchive, Settings } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, setActiveNote, notes, glossary } = useApp();

  // Fase 3.1: Retirada temporal y reversible del acceso a Biblioteca / importación de documentos
  const SHOW_DOCUMENT_LIBRARY_TAB = false;

  const navItems: Array<{
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'notes', label: 'Apuntes', icon: FileText, badge: notes.length },
    { id: 'analyze', label: 'Analizar', icon: Layers },
    { id: 'glossary', label: 'Glosario', icon: BookOpen, badge: glossary.length },
    ...(SHOW_DOCUMENT_LIBRARY_TAB
      ? [{ id: 'library' as AppTab, label: 'Biblioteca', icon: FolderArchive }]
      : []),
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];

  return (
    <nav
      aria-label="Navegación principal móvil"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm border-t border-stone-200 dark:border-stone-800 safe-area-bottom transition-colors"
    >
      <div
        className={`max-w-lg mx-auto grid ${
          navItems.length === 4 ? 'grid-cols-4' : 'grid-cols-5'
        } px-1.5 pt-1 pb-0.5`}
      >
        {navItems.map((item) => {
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
              className={`relative flex flex-col items-center justify-center min-h-[48px] py-1 px-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 active:bg-stone-100 dark:active:bg-stone-800/60'
              }`}
            >
              <div
                className={`relative flex items-center justify-center px-3 py-1 rounded-full transition-colors ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/70'
                    : ''
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.2]' : 'stroke-[1.75]'}`} />
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    aria-label={`${item.badge} elementos`}
                    className={`ml-1 text-[10px] font-semibold leading-none ${
                      isActive
                        ? 'text-indigo-700 dark:text-indigo-300'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[11px] mt-0.5 leading-tight tracking-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
