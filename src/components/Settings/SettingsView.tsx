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
  Code2,
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-28 md:pb-16 pt-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Left Column: Appearance & Local Data Backup */}
        <div className="space-y-5">
          {/* Section: Apariencia */}
          <section
            aria-labelledby="settings-appearance-heading"
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xs"
          >
            <h2
              id="settings-appearance-heading"
              className="font-bold text-base text-stone-900 dark:text-stone-100 mb-1"
            >
              Apariencia y lectura
            </h2>
            <p className="text-xs text-stone-600 dark:text-stone-400 mb-4 leading-relaxed">
              Superficies cálidas de alto contraste pensadas para sesiones prolongadas de lectura y toma de apuntes.
            </p>

            <div
              role="group"
              aria-label="Seleccionar tema de color"
              className="grid grid-cols-3 gap-2.5"
            >
              {[
                { id: 'light' as ThemePreference, label: 'Claro', icon: Sun },
                { id: 'dark' as ThemePreference, label: 'Oscuro', icon: Moon },
                { id: 'system' as ThemePreference, label: 'Sistema', icon: Smartphone },
              ].map((item) => {
                const isSelected = preferences.theme === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleThemeChange(item.id)}
                    aria-pressed={isSelected}
                    className={`flex flex-col items-center justify-center min-h-[68px] py-3 px-2 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-indigo-300 font-semibold shadow-2xs'
                        : 'bg-stone-50 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 mb-1.5 ${
                        isSelected ? 'stroke-[2.2]' : 'stroke-[1.75]'
                      }`}
                    />
                    <span className="text-xs">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section: Almacenamiento Local & Copias de Seguridad */}
          <section
            aria-labelledby="settings-backup-heading"
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xs"
          >
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h2
                id="settings-backup-heading"
                className="font-bold text-base text-stone-900 dark:text-stone-100"
              >
                Almacenamiento local y respaldo
              </h2>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400 mb-4 leading-relaxed">
              Tus apuntes, cuadernos y glosario se guardan en la base de datos local de este navegador. Exporta una copia JSON periódicamente para conservar tu trabajo.
            </p>

            {/* Database summary grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center p-3.5 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs mb-4">
              <div className="p-1.5">
                <span className="block font-bold text-stone-900 dark:text-stone-100 text-lg tabular-nums">
                  {notes.length}
                </span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400">Apuntes</span>
              </div>
              <div className="p-1.5">
                <span className="block font-bold text-stone-900 dark:text-stone-100 text-lg tabular-nums">
                  {folders.length}
                </span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400">Cuadernos</span>
              </div>
              <div className="p-1.5">
                <span className="block font-bold text-stone-900 dark:text-stone-100 text-lg tabular-nums">
                  {glossary.length}
                </span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400">Conceptos</span>
              </div>
              <div className="p-1.5">
                <span className="block font-bold text-stone-900 dark:text-stone-100 text-lg tabular-nums">
                  {documents.length}
                </span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400">Documentos</span>
              </div>
            </div>

            {/* Export & Import actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={exportBackupFile}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Exportar copia JSON</span>
              </button>

              <label className="inline-flex items-center justify-center gap-2 min-h-[44px] py-2.5 px-4 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 font-semibold text-xs hover:bg-stone-200 dark:hover:bg-stone-700 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-indigo-600">
                <Upload className="w-4 h-4 shrink-0" />
                <span>{isImporting ? 'Validando archivo…' : 'Restaurar copia'}</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileImport}
                  disabled={isImporting}
                  className="sr-only"
                />
              </label>
            </div>
          </section>
        </div>

        {/* Right Column: Processing Parameters, Privacy & Native Reference */}
        <div className="space-y-5">
          {/* Section: Optimización de recursos y fragmentos */}
          <section
            aria-labelledby="settings-processing-heading"
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xs"
          >
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h2
                id="settings-processing-heading"
                className="font-bold text-base text-stone-900 dark:text-stone-100"
              >
                Parámetros de análisis académico
              </h2>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400 mb-4 leading-relaxed">
              Configuración activa para preservar términos compuestos y evitar reprocesamientos innecesarios.
            </p>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 space-y-1">
                <p className="font-semibold text-stone-800 dark:text-stone-200">
                  Segmentación con solapamiento contextual
                </p>
                <p className="text-stone-600 dark:text-stone-400 leading-relaxed">
                  Ventana de 2.500 caracteres con solapamiento de 250 caracteres para no cortar conceptos psicológicos compuestos entre párrafos.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 space-y-1">
                <p className="font-semibold text-stone-800 dark:text-stone-200">
                  Caché local y detección de duplicados
                </p>
                <p className="text-stone-600 dark:text-stone-400 leading-relaxed">
                  Los conceptos ya presentes en tu glosario se identifican automáticamente durante la extracción para evitar duplicar fichas de estudio.
                </p>
              </div>
            </div>
          </section>

          {/* Section: Privacidad y Soberanía de Datos */}
          <section
            aria-labelledby="settings-privacy-heading"
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-2"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h2
                id="settings-privacy-heading"
                className="font-bold text-base text-stone-900 dark:text-stone-100"
              >
                Privacidad de tus materiales de estudio
              </h2>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
              Nexo Notes funciona sin registro de cuentas ni telemetría. Tus archivos PDF y PPTX se procesan íntegramente en tu dispositivo; solo los fragmentos o conceptos que elijas analizar se consultan puntualmente para generar definiciones.
            </p>
          </section>

          {/* Section: Referencia Técnica Android (Subordinated Secondary Card) */}
          <section
            aria-labelledby="settings-android-arch-heading"
            className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 sm:p-6 shadow-2xs"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-stone-600 dark:text-stone-400 shrink-0" />
                  <h2
                    id="settings-android-arch-heading"
                    className="font-bold text-sm text-stone-900 dark:text-stone-100"
                  >
                    Especificación de arquitectura Android (Kotlin & Room)
                  </h2>
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                  Consulta los esquemas de entidades Room, DAOs y componentes Jetpack Compose de referencia del proyecto.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenAndroidArchitecture}
              className="mt-4 w-full min-h-[42px] py-2 px-4 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-semibold text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
            >
              Ver referencia técnica Kotlin & Compose
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
