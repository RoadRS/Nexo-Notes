import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ThemePreference } from '../../types/models';
import {
  Sun,
  Moon,
  Smartphone,
  ShieldCheck,
  Download,
  Upload,
  Database,
  Cpu,
  Layers,
  Code2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

export const SettingsView: React.FC<{ onOpenAndroidArchitecture: () => void }> = ({
  onOpenAndroidArchitecture,
}) => {
  const {
    preferences,
    updatePreferences,
    notes,
    folders,
    glossary,
    documents,
    exportBackupFile,
    importBackupFile,
    showNotification,
  } = useApp();

  const [isImporting, setIsImporting] = useState(false);

  const handleThemeChange = (newTheme: ThemePreference) => {
    updatePreferences({ theme: newTheme });
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    setIsImporting(true);
    const result = await importBackupFile(file);
    setIsImporting(false);

    if (!result.success) {
      showNotification(result.message, 'error');
    }
    e.target.value = '';
  };

  return (
    <div className="max-w-xl mx-auto px-4 pb-28 pt-2 space-y-6">
      {/* Section: Apariencia */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-5 shadow-xs">
        <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100 mb-1">
          Apariencia y tema visual
        </h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">
          Inspirado en la simplicidad de Samsung One UI con alto contraste.
        </p>

        <div className="grid grid-cols-3 gap-2.5">
          {[
            { id: 'light' as ThemePreference, label: 'Claro', icon: Sun },
            { id: 'dark' as ThemePreference, label: 'Oscuro', icon: Moon },
            { id: 'system' as ThemePreference, label: 'Automático', icon: Smartphone },
          ].map((item) => {
            const isSelected = preferences.theme === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleThemeChange(item.id)}
                className={`flex flex-col items-center justify-center py-3.5 px-2 rounded-2xl border transition-all ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-bold shadow-xs'
                    : 'bg-slate-50 dark:bg-zinc-800/60 border-slate-200 dark:border-zinc-700/60 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                <Icon className={`w-5 h-5 mb-1.5 ${isSelected ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section: Almacenamiento Local Room & Copias de Seguridad */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100">
            Base de datos local y copias de seguridad
          </h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">
          Tus notas y glosarios se guardan exclusivamente en el almacenamiento protegido del dispositivo.
        </p>

        {/* Database summary badge */}
        <div className="grid grid-cols-4 gap-2 text-center p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs mb-4">
          <div>
            <span className="block font-bold text-slate-900 dark:text-zinc-100 text-base">
              {notes.length}
            </span>
            <span className="text-[10px] text-slate-500">Notas</span>
          </div>
          <div>
            <span className="block font-bold text-slate-900 dark:text-zinc-100 text-base">
              {folders.length}
            </span>
            <span className="text-[10px] text-slate-500">Carpetas</span>
          </div>
          <div>
            <span className="block font-bold text-slate-900 dark:text-zinc-100 text-base">
              {glossary.length}
            </span>
            <span className="text-[10px] text-slate-500">Conceptos</span>
          </div>
          <div>
            <span className="block font-bold text-slate-900 dark:text-zinc-100 text-base">
              {documents.length}
            </span>
            <span className="text-[10px] text-slate-500">Documentos</span>
          </div>
        </div>

        {/* Export & Import actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            onClick={exportBackupFile}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-950 transition active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Exportar copia JSON</span>
          </button>

          <label className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-zinc-700 cursor-pointer transition active:scale-95">
            <Upload className="w-4 h-4" />
            <span>{isImporting ? 'Validando...' : 'Restaurar copia'}</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileImport}
              disabled={isImporting}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Section: Optimización de recursos y fragmentos */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100">
            Control de consumo y optimización IA
          </h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">
          Estrategias implementadas para evitar llamadas innecesarias y maximizar la precisión académica.
        </p>

        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-1">
            <p className="font-semibold text-slate-800 dark:text-zinc-200">
              Tamaño de fragmento configurado
            </p>
            <p className="text-slate-500 text-[11px]">
              Ventana de 2.500 caracteres con solapamiento seguro de 250 caracteres para preservar expresiones compuestas ("disonancia cognitiva", "reactancia psicológica").
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-1">
            <p className="font-semibold text-slate-800 dark:text-zinc-200">
              Caché inteligente y no reprocesamiento
            </p>
            <p className="text-slate-500 text-[11px]">
              Si una nota no ha cambiado desde el último análisis, el sistema avisa y evita gastar cuotas o tiempo de procesamiento. Los términos ya presentes en el glosario se desmarcan automáticamente.
            </p>
          </div>
        </div>
      </div>

      {/* Section: Privacidad y Soberanía de Datos */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl p-5 shadow-xs space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-zinc-100">
            Compromiso de privacidad
          </h3>
        </div>
        <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
          Nexo Notes opera de forma autónoma sin cuenta de usuario ni sincronización remota no autorizada. Tus documentos y apuntes nunca se envían íntegros a servicios externos; únicamente los términos y oraciones que decidas verificar explícitamente se consultan mediante la API de Gemini con Google Search.
        </p>
      </div>

      {/* Section: Arquitectura Android Nativa */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 dark:from-zinc-900 dark:to-indigo-950 text-white rounded-3xl p-5 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Code2 className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-sm">Arquitectura Android Nativa</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Consulta las entidades Room, DAOs, Repositorios y pantallas Jetpack Compose listas para compilar en Android Studio para teléfonos Samsung.
            </p>
          </div>
        </div>

        <button
          onClick={onOpenAndroidArchitecture}
          className="mt-4 w-full py-2.5 rounded-xl bg-white text-indigo-900 font-bold text-xs hover:bg-slate-100 transition shadow-sm"
        >
          Ver arquitectura Kotlin & Compose
        </button>
      </div>
    </div>
  );
};
