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
import { AcademicOnboardingModal } from './components/Onboarding/AcademicOnboardingModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { NoteEntity, DocumentEntity } from './types/models';
import { PsychologyLogo } from './components/Common/PsychologyLogo';
import { buildInitialNoteEntity, shouldShowAcademicOnboarding } from './utils/academicContext';
import { Sparkles, CheckCircle2, AlertCircle, Info, Download } from 'lucide-react';

// Fase 3.1: Retirada temporal y reversible de la vista Biblioteca / flujo de documentos
const ENABLE_DOCUMENT_LIBRARY_VIEW = false;

const MainAppContent: React.FC = () => {
  const { activeNote, setActiveNote, activeTab, notification, isLoading, preferences } = useApp();
  const showOnboarding = shouldShowAcademicOnboarding(preferences, isLoading);

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
    setAnalysisNote(
      buildInitialNoteEntity({
        id: doc.id,
        title: doc.fileName,
        content: combinedText,
        subject: doc.subject,
        tags: ['Documento', doc.fileType.toUpperCase()],
        isPinned: false,
        preferences,
        now: doc.createdAt,
      })
    );
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
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen flex flex-col items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-800 dark:text-stone-200 px-4"
      >
        <div className="mb-3">
          <PsychologyLogo size={32} showBadge={true} className="w-12 h-12 rounded-xl" />
        </div>
        <p className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          Abriendo tu espacio de estudio…
        </p>
        <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
          Cargando apuntes y glosario guardados en este dispositivo
        </p>
      </div>
    );
  }

  // If a note is currently open, show full-screen NoteEditor
  if (activeNote) {
    return (
      <>
        {notification && (
          <div
            role={notification.type === 'error' ? 'alert' : 'status'}
            aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-md text-xs font-medium animate-fadeIn bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 border border-stone-700 dark:border-stone-300 max-w-[92vw]"
          >
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 dark:text-red-600 shrink-0" />}
            {notification.type === 'info' && <Info className="w-4 h-4 text-indigo-400 dark:text-indigo-600 shrink-0" />}
            <span className="leading-snug">{notification.message}</span>
          </div>
        )}

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
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col transition-colors selection:bg-indigo-600/15 selection:text-indigo-700 dark:selection:bg-indigo-400/20 dark:selection:text-indigo-200">
      {/* Toast Notification */}
      {notification && (
        <div
          role={notification.type === 'error' ? 'alert' : 'status'}
          aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-md text-xs font-medium animate-fadeIn bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 border border-stone-700 dark:border-stone-300 max-w-[92vw]"
        >
          {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />}
          {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 dark:text-red-600 shrink-0" />}
          {notification.type === 'info' && <Info className="w-4 h-4 text-indigo-400 dark:text-indigo-600 shrink-0" />}
          <span className="leading-snug">{notification.message}</span>
        </div>
      )}

      {/* Top Header & Navigation */}
      <OneUIHeader />

      {/* Main Body per Active Tab */}
      <main className="flex-1 w-full">
        {(activeTab === 'notes' || (!ENABLE_DOCUMENT_LIBRARY_VIEW && activeTab === 'library')) && (
          <NotesList onAnalyzeNote={(note) => handleLaunchAnalysis(note)} />
        )}
        {activeTab === 'analyze' && (
          <AnalyzeView onLaunchAnalysis={(note, text) => handleLaunchAnalysis(note, text)} />
        )}
        {activeTab === 'glossary' && <GlossaryView />}
        {ENABLE_DOCUMENT_LIBRARY_VIEW && activeTab === 'library' && (
          <LibraryView onAnalyzeDocument={handleAnalyzeDocument} />
        )}
        {activeTab === 'settings' && (
          <SettingsView
            onOpenAndroidArchitecture={() => setIsAndroidArchitectureOpen(true)}
          />
        )}
      </main>

      {/* Bottom Navigation (Mobile-first) */}
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

      {/* Initial Academic Context Onboarding Modal */}
      {showOnboarding && <AcademicOnboardingModal />}
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
