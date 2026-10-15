import React from 'react';

interface PsychologyLogoProps {
  className?: string;
  size?: number;
  showBadge?: boolean;
}

/**
 * Minimalist, professional psychology logo for Nexo Notes.
 * Combines cerebral silhouette, cognitive understanding axis (subtle Psi convergence)
 * and an illuminated insight/learning spark.
 */
export const PsychologyLogo: React.FC<PsychologyLogoProps> = ({
  className = '',
  size = 28,
  showBadge = true,
}) => {
  const content = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={showBadge ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}
      aria-label="Símbolo de Psicología Nexo Notes"
    >
      <defs>
        <linearGradient id="psychoGradient" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#312E81" />
        </linearGradient>
      </defs>

      {/* Left Cerebral Hemisphere */}
      <path
        d="M23 12C20.5 12 18.5 13.2 17.2 15C15.2 15.4 13.8 17 13.8 19.2C13.8 20.5 14.4 21.6 15.3 22.4C14.2 23.5 13.6 25 13.6 26.6C13.6 29 15.5 31 17.9 31.4C19 33.1 20.9 34.2 23 34.4V12Z"
        fill="currentColor"
        fillOpacity={showBadge ? '0.2' : '0.1'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Right Cerebral Hemisphere */}
      <path
        d="M25 12C27.5 12 29.5 13.2 30.8 15C32.8 15.4 34.2 17 34.2 19.2C34.2 20.5 33.6 21.6 32.7 22.4C33.8 23.5 34.4 25 34.4 26.6C34.4 29 32.5 31 30.1 31.4C29 33.1 27.1 34.2 25 34.4V12Z"
        fill="currentColor"
        fillOpacity={showBadge ? '0.2' : '0.1'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Internal Gyri / Neural Convolutions */}
      <path
        d="M18.8 17.5C18.2 18.6 18.4 20.1 19.7 20.8M16.9 23C18 23.6 19.5 23.2 20.2 24.7M19.1 28.9C20.2 29.8 21.7 29.6 22.6 29.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M29.2 17.5C29.8 18.6 29.6 20.1 28.3 20.8M31.1 23C30 23.6 28.5 23.2 27.8 24.7M28.9 28.9C27.8 29.8 26.3 29.6 25.4 29.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />

      {/* Central Cognitive Stem / Subtle Psi (Ψ) Core */}
      <line x1="24" y1="12" x2="24" y2="35.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M20.2 23.8C20.2 26.2 21.7 28 24 28C26.3 28 27.8 26.2 27.8 23.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* Prefrontal Insight Point / Focal Spark */}
      <circle cx="24" cy="16.5" r="1.8" fill="currentColor" />
      <circle cx="24" cy="16.5" r="3.2" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.7" />
    </svg>
  );

  if (showBadge) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 shadow-sm shrink-0 ${className}`}
        style={{ width: size + 10, height: size + 10 }}
      >
        {content}
      </div>
    );
  }

  return <div className={`inline-flex items-center justify-center shrink-0 ${className}`}>{content}</div>;
};
