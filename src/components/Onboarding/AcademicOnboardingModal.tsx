import React, { useState } from 'react';
import { GraduationCap, Check, ArrowRight } from 'lucide-react';
import { AcademicAreaId } from '../../types/models';
import { ACADEMIC_AREAS_LIST } from '../../utils/academicContext';
import { useApp } from '../../context/AppContext';

export const AcademicOnboardingModal: React.FC = () => {
  const { saveAcademicProfile, skipAcademicOnboarding } = useApp();

  const [selectedArea, setSelectedArea] = useState<AcademicAreaId | null>(null);
  const [career, setCareer] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArea || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await saveAcademicProfile({
        primaryArea: selectedArea,
        career: career.trim() || undefined,
        specialty: specialty.trim() || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await skipAcademicOnboarding();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-950/60 backdrop-blur-xs p-0 sm:p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="academic-onboarding-title"
      aria-describedby="academic-onboarding-desc"
    >
      <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-stone-900 border-t sm:border border-stone-200 dark:border-stone-800 rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6 border-b border-stone-200 dark:border-stone-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/70 dark:border-indigo-800/70 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="academic-onboarding-title"
                className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-snug"
              >
                Configura tu contexto académico
              </h2>
              <p
                id="academic-onboarding-desc"
                className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed"
              >
                Elige tu área principal de estudio para orientar las definiciones cuando un apunte sea breve. Si tomas notas de otra materia, Nexo Notes se adaptará automáticamente a ese tema.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-5">
          {/* 9 Academic Areas Grid */}
          <div>
            <label className="block text-xs font-semibold text-stone-800 dark:text-stone-200 mb-2.5">
              Área académica principal <span className="text-indigo-600 dark:text-indigo-400">*</span>
            </label>
            <div
              role="radiogroup"
              aria-label="Área académica principal"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              {ACADEMIC_AREAS_LIST.map((area) => {
                const isSelected = selectedArea === area.id;
                return (
                  <button
                    key={area.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedArea(area.id)}
                    className={`text-left p-3 rounded-xl border transition-colors flex items-start justify-between gap-2.5 min-h-[60px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                      isSelected
                        ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-600 dark:border-indigo-400 text-stone-900 dark:text-stone-100 shadow-2xs'
                        : 'bg-stone-50/70 dark:bg-stone-800/40 border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span
                        className={`block text-xs font-semibold leading-snug ${
                          isSelected
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-stone-900 dark:text-stone-100'
                        }`}
                      >
                        {area.label}
                      </span>
                      <span className="block text-[11px] text-stone-600 dark:text-stone-400 mt-0.5 leading-snug line-clamp-2">
                        {area.description}
                      </span>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-stone-300 dark:border-stone-600'
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Career & Specialty Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label
                htmlFor="onboarding-career-input"
                className="block text-xs font-semibold text-stone-800 dark:text-stone-200 mb-1.5"
              >
                Carrera o grado <span className="font-normal text-stone-500 dark:text-stone-400">(opcional)</span>
              </label>
              <input
                id="onboarding-career-input"
                type="text"
                value={career}
                onChange={(e) => setCareer(e.target.value)}
                maxLength={120}
                placeholder="Ej. Licenciatura en Psicología"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl text-xs bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>

            <div>
              <label
                htmlFor="onboarding-specialty-input"
                className="block text-xs font-semibold text-stone-800 dark:text-stone-200 mb-1.5"
              >
                Especialidad o enfoque <span className="font-normal text-stone-500 dark:text-stone-400">(opcional)</span>
              </label>
              <input
                id="onboarding-specialty-input"
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                maxLength={120}
                placeholder="Ej. Neuropsicología clínica"
                className="w-full min-h-[42px] px-3 py-2 rounded-xl text-xs bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <button
              type="button"
              onClick={handleSkip}
              disabled={isSubmitting}
              className="min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
            >
              Omitir por ahora y configurar en Ajustes
            </button>

            <button
              type="submit"
              disabled={!selectedArea || isSubmitting}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none text-white text-xs font-semibold transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
            >
              <span>{isSubmitting ? 'Guardando…' : 'Guardar perfil académico'}</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
