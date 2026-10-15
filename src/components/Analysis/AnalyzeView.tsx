import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { NoteEntity } from '../../types/models';
import { Sparkles, FileText, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const AnalyzeView: React.FC<{
  onLaunchAnalysis: (note?: NoteEntity | null, customText?: string) => void;
}> = ({ onLaunchAnalysis }) => {
  const { notes, glossary } = useApp();
  const [selectedNoteId, setSelectedNoteId] = useState<string>(notes[0]?.id || '');
  const [customText, setCustomText] = useState('');
  const [subject, setSubject] = useState('Psicología y Ciencias');

  const selectedNote = notes.find((n) => n.id === selectedNoteId) || null;

  return (
    <div className="max-w-xl mx-auto px-4 pb-28 pt-2 space-y-5">
      {/* Hero Banner */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 text-white shadow-lg space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-2xl bg-white/15 backdrop-blur-xs">
            <Sparkles className="w-5 h-5 text-indigo-100" />
          </div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-indigo-200">
            Detección & Fundamentación
          </span>
        </div>

        <h2 className="text-lg font-bold leading-snug">
          Extracción inteligente de términos académicos
        </h2>

        <p className="text-xs text-indigo-100/90 leading-relaxed">
          Segmenta apuntes extensos en bloques de 2.500 caracteres, localiza términos compuestos ("disonancia cognitiva", "reactancia psicológica") y fundamenta con Google Search.
        </p>
      </div>

      {/* Option 1: Analyze Existing Note */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-5 shadow-xs space-y-3">
        <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100 flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Analizar un apunte existente</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Selecciona una de tus notas guardadas para detectar conceptos técnicos.
        </p>

        {notes.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No tienes apuntes guardados aún.</p>
        ) : (
          <div className="space-y-3">
            <select
              value={selectedNoteId}
              onChange={(e) => setSelectedNoteId(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {notes.map((n) => (
                <option key={n.id} value={n.id}>
                  📝 {n.title} ({n.subject})
                </option>
              ))}
            </select>

            {selectedNote && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400 line-clamp-3 italic">
                "{selectedNote.content.slice(0, 200)}..."
              </div>
            )}

            <button
              onClick={() => onLaunchAnalysis(selectedNote)}
              disabled={!selectedNote}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>Analizar apunte seleccionado</span>
            </button>
          </div>
        )}
      </div>

      {/* Option 2: Paste Arbitrary Text */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-5 shadow-xs space-y-3">
        <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100">
          O pegar fragmento de texto libre
        </h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Pega un fragmento de lectura, transcripción de clase o temario de examen.
        </p>

        <textarea
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          placeholder="Pega aquí el texto académico para extraer conceptos..."
          rows={4}
          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans"
        />

        <button
          onClick={() => onLaunchAnalysis(null, customText)}
          disabled={!customText.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 dark:bg-zinc-100 hover:opacity-90 disabled:opacity-50 text-white dark:text-zinc-900 font-semibold text-xs shadow-sm transition"
        >
          <ArrowRight className="w-4 h-4" />
          <span>Analizar fragmento pegado</span>
        </button>
      </div>

      {/* Quick stats */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs">
        <span className="text-slate-600 dark:text-zinc-400 font-medium">
          Términos en glosario:
        </span>
        <span className="font-bold text-indigo-600 dark:text-indigo-400">
          {glossary.length} conceptos verificados
        </span>
      </div>
    </div>
  );
};
