import React from 'react';
import { useApp, AppTab } from '../../context/AppContext';
import { FileText, Sparkles, BookOpen, FolderArchive, Settings } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab, setActiveNote, notes, glossary } = useApp();

  const navItems: Array<{
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'notes', label: 'Apuntes', icon: FileText, badge: notes.length },
    { id: 'analyze', label: 'Analizar', icon: Sparkles },
    { id: 'glossary', label: 'Glosario', icon: BookOpen, badge: glossary.length },
    { id: 'library', label: 'Biblioteca', icon: FolderArchive },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-slate-200 dark:border-zinc-800 safe-area-bottom shadow-lg transition-colors">
      <div className="max-w-xl mx-auto flex items-center justify-around px-2 py-1.5">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveNote(null);
                setActiveTab(item.id);
              }}
              className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all duration-200 group ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-medium'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
            >
              <div
                className={`relative p-1.5 rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-100 dark:bg-indigo-950/80 scale-105'
                    : 'group-hover:bg-slate-100 dark:group-hover:bg-zinc-800/60'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-4 text-center border-2 border-white dark:border-zinc-900">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[11px] mt-0.5 tracking-tight ${isActive ? 'font-semibold' : 'font-normal'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
