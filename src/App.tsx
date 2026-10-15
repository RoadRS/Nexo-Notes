/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { OneUIHeader } from './components/Header/OneUIHeader';
import { BottomNav } from './components/Navigation/BottomNav';
import { NotesList } from './components/Notes/NotesList';
import { NoteEditor } from './components/Notes/NoteEditor';
import { ConceptAnalysisModal } from './components/Analysis/ConceptAnalysisModal';
import { GlossaryView } from './components/Glossary/GlossaryView';
import { LibraryView } from './components/Library/LibraryView';
import { AnalyzeView } from './components/Analysis/AnalyzeView';
import { SettingsView } from './components/Settings/SettingsView';
import { AndroidArchitectureModal } from './components/Android/AndroidArchitectureModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { NoteEntity, DocumentEntity } from './types/models';
import { PsychologyLogo } from './components/Common/PsychologyLogo';
import { Sparkles, CheckCircle2, AlertCircle, Info, Download } from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { activeNote, setActiveNote, activeTab, notification, isLoading } = useApp();

  // State for active analysis modal
  const [analysisNote, setAnalysisNote] = useState<NoteEntity | null>(null);
  const [analysisCustomText, setAnalysisCustomText] = useState<string | null>(null);
  const [analysisDocSource, setAnalysisDocSource] = useState<{
    docId: string;
    docName: string;
    pageMap: Array<{ page: number; text: string }>;
  } | null>(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [isAndroidArchitectureOpen, setIsAndroidArchitectureOpen] = useState(false);

  const handleLaunchAnalysis = (note?: NoteEntity | null, customText?: string) => {
    setAnalysisNote(note || null);
    setAnalysisCustomText(customText || null);
    setAnalysisDocSource(null);
    setIsAnalysisModalOpen(true);
  };

  const handleAnalyzeDocument = (doc: DocumentEntity, pageRange?: number[]) => {
    const pagesToAnalyze = pageRange
      ? doc.pages.filter((p) => pageRange.includes(p.pageNumber))
      : doc.pages;
    const combinedText = pagesToAnalyze.map((p) => `[Página ${p.pageNumber}]\n${p.content}`).join('\n\n');
    setAnalysisNote({
      id: doc.id,
      title: doc.fileName,
      content: combinedText,
      subject: doc.subject,
      tags: ['Documento', doc.fileType.toUpperCase()],
      isPinned: false,
      createdAt: doc.createdAt,
      updatedAt: doc.createdAt,
      wordCount: combinedText.split(/\s+/).length,
      charCount: combinedText.length,
    });
    setAnalysisCustomText(combinedText);
    setAnalysisDocSource({
      docId: doc.id,
      docName: doc.fileName,
      pageMap: pagesToAnalyze.map((p) => ({ page: p.pageNumber, text: p.content })),
    });
    setIsAnalysisModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-zinc-200">
        <div className="mb-3 shadow-lg animate-pulse">
          <PsychologyLogo size={36} showBadge={true} className="w-14 h-14 rounded-2xl" />
        </div>
        <p className="text-sm font-bold tracking-tight">Cargando Nexo Notes...</p>
        <p className="text-xs text-slate-400 mt-1">Conectando base de datos local Room</p>
      </div>
    );
  }

  // If a note is currently open, show full-screen NoteEditor
  if (activeNote) {
    return (
      <>
        <NoteEditor
          note={activeNote}
          onBack={() => setActiveNote(null)}
          onAnalyze={(note, selectedText) => handleLaunchAnalysis(note, selectedText)}
        />

        {isAnalysisModalOpen && (
          <ConceptAnalysisModal
            note={analysisNote}
            initialText={analysisCustomText || undefined}
            sourceDocId={analysisDocSource?.docId}
            sourceDocName={analysisDocSource?.docName}
            sourcePageMap={analysisDocSource?.pageMap}
            onClose={() => setIsAnalysisModalOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex flex-col transition-colors selection:bg-indigo-500/20 selection:text-indigo-600">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-semibold backdrop-blur-md animate-fadeIn bg-slate-900/90 text-white dark:bg-white/90 dark:text-zinc-900 border border-slate-700/50">
          {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
          {notification.type === 'info' && <Info className="w-4 h-4 text-indigo-400" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Samsung One UI Header */}
      <OneUIHeader />

      {/* Main Body per Active Tab */}
      <main className="flex-1">
        {activeTab === 'notes' && (
          <NotesList onAnalyzeNote={(note) => handleLaunchAnalysis(note)} />
        )}
        {activeTab === 'analyze' && (
          <AnalyzeView onLaunchAnalysis={(note, text) => handleLaunchAnalysis(note, text)} />
        )}
        {activeTab === 'glossary' && <GlossaryView />}
        {activeTab === 'library' && (
          <LibraryView onAnalyzeDocument={handleAnalyzeDocument} />
        )}
        {activeTab === 'settings' && (
          <SettingsView
            onOpenAndroidArchitecture={() => setIsAndroidArchitectureOpen(true)}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Concept Analysis Modal */}
      {isAnalysisModalOpen && (
          <ConceptAnalysisModal
            note={analysisNote}
            initialText={analysisCustomText || undefined}
            sourceDocId={analysisDocSource?.docId}
            sourceDocName={analysisDocSource?.docName}
            sourcePageMap={analysisDocSource?.pageMap}
            onClose={() => setIsAnalysisModalOpen(false)}
          />
      )}

      {/* Android Native Architecture Modal */}
      {isAndroidArchitectureOpen && (
        <AndroidArchitectureModal
          onClose={() => setIsAndroidArchitectureOpen(false)}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}
