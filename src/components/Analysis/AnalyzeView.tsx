import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { NoteEntity } from '../../types/models';
import { Layers, FileText, ArrowRight, BookMarked, AlignLeft } from 'lucide-react';

export const AnalyzeView: React.FC<{
  onLaunchAnalysis: (note?: NoteEntity | null, customText?: string) => void;
}> = ({ onLaunchAnalysis }) => {
  const { notes, glossary } = useApp();
  const [selectedNoteId, setSelectedNoteId] = useState<string>(notes[0]?.id || '');
  const [customText, setCustomText] = useState('');

  const selectedNote = notes.find((n) => n.id === selectedNoteId) || null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-28 md:pb-16 pt-3 space-y-5">
      {/* Sober Editorial Introduction */}
      <section
        aria-labelledby="analyze-intro-heading"
        className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Layers className="w-3.5 h-3.5" />
              <span>Extracción y fundamentación conceptual</span>
            </div>
            <h2
              id="analyze-intro-heading"
              className="text-lg sm:text-xl font-bold text-stone-900 dark:text-stone-100 tracking-tight"
            >
              Analiza la terminología de tus apuntes y lecturas
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              Localiza conceptos compuestos (como «disonancia cognitiva» o «condicionamiento operante»), obtén definiciones ajustadas al contexto de tu texto y contrástalas con fuentes académicas antes de guardarlas en tu glosario.
            </p>
          </div>

          <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-1 px-4 py-3 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200/80 dark:border-stone-800">
            <span className="text-xs text-stone-500 dark:text-stone-400 font-medium flex items-center gap-1.5">
              <BookMarked className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>En tu glosario</span>
            </span>
            <span className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 tabular-nums">
              {glossary.length} {glossary.length === 1 ? 'concepto' : 'conceptos'}
            </span>
          </div>
        </div>
      </section>

      {/* Dual Study Workflows: Responsive 2-column grid on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Option 1 (Primary): Analyze Existing Note */}
        <section
          aria-labelledby="analyze-existing-note-heading"
          className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xs flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3
                  id="analyze-existing-note-heading"
                  className="font-bold text-base text-stone-900 dark:text-stone-100"
                >
                  Desde un apunte guardado
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 leading-relaxed">
                  Elige uno de tus apuntes de clase o seminario para detectar sus términos clave.
                </p>
              </div>
            </div>

            {notes.length === 0 ? (
              <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400">
                Aún no tienes apuntes guardados. Crea un apunte en la sección «Apuntes» o utiliza el cuadro de texto libre.
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <div>
                  <label
                    htmlFor="analyze-note-select"
                    className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5"
                  >
                    Apunte a analizar
                  </label>
                  <select
                    id="analyze-note-select"
                    value={selectedNoteId}
                    onChange={(e) => setSelectedNoteId(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-300 dark:border-stone-700 text-base sm:text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    {notes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title || 'Apunte sin título'}
                        {n.subject ? ` — ${n.subject}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedNote && (
                  <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200/80 dark:border-stone-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
                      <span className="font-medium text-stone-700 dark:text-stone-300">
                        {selectedNote.subject || 'Sin materia'}
                      </span>
                      <span>{selectedNote.wordCount || 0} palabras</span>
                    </div>
                    <p className="text-xs text-stone-600 dark:text-stone-400 line-clamp-3 leading-relaxed italic">
                      «{selectedNote.content.slice(0, 240)}
                      {selectedNote.content.length > 240 ? '…' : ''}»
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onLaunchAnalysis(selectedNote)}
            disabled={!selectedNote}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold text-sm shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
          >
            <Layers className="w-4 h-4" />
            <span>Extraer conceptos del apunte</span>
          </button>
        </section>

        {/* Option 2 (Secondary): Paste Arbitrary Text */}
        <section
          aria-labelledby="analyze-free-text-heading"
          className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xs flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center text-stone-700 dark:text-stone-300 shrink-0 mt-0.5">
                <AlignLeft className="w-4 h-4" />
              </div>
              <div>
                <h3
                  id="analyze-free-text-heading"
                  className="font-bold text-base text-stone-900 dark:text-stone-100"
                >
                  Desde un fragmento de texto libre
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 leading-relaxed">
                  Pega un párrafo de un artículo, manual, transcripción de clase o guía de estudio sin necesidad de crear un apunte previo.
                </p>
              </div>
            </div>

            <div className="pt-1">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="analyze-custom-textarea"
                  className="block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  Texto o cita académica
                </label>
                {customText.trim() && (
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                    {customText.trim().split(/\s+/).length} palabras
                  </span>
                )}
              </div>
              <textarea
                id="analyze-custom-textarea"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Pega aquí el fragmento que deseas analizar…"
                rows={5}
                className="w-full p-3 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-300 dark:border-stone-700 text-base sm:text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-600 leading-relaxed font-sans resize-y"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => onLaunchAnalysis(null, customText)}
            disabled={!customText.trim()}
            className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-40 text-white dark:text-stone-900 font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
          >
            <span>Analizar fragmento pegado</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      </div>
    </div>
  );
};
