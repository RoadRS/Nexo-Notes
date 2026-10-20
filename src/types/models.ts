/**
 * Nexo Notes - Data Models & Contracts
 * Mirrors Android Room Entities & Value Objects
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export type VerificationStatus = 'verificado' | 'discrepancia' | 'no_verificado' | 'pendiente';

export type AcademicAreaId =
  | 'psicologia'
  | 'salud_vida'
  | 'ciencias_naturales'
  | 'humanidades_filosofia'
  | 'ciencias_sociales'
  | 'ingenieria_tecnologia'
  | 'economia_negocios_derecho'
  | 'educacion'
  | 'general';

export type DisciplineMode = 'auto' | 'manual';

export type DisciplineEvidenceLevel = 'high' | 'medium' | 'low';

export type ContextResolutionSource =
  | 'query_override'
  | 'note_manual'
  | 'note_auto'
  | 'global_profile'
  | 'multidisciplinary_ambiguous';

export interface AcademicProfile {
  primaryArea: AcademicAreaId;
  career?: string;
  specialty?: string;
  updatedAt: number;
}

export interface ResolvedAcademicContext {
  areaId: AcademicAreaId;
  disciplineLabel: string;
  specificSubject?: string;
  career?: string;
  specialty?: string;
  queryInstruction?: string;
  source: ContextResolutionSource;
  confidence: DisciplineEvidenceLevel;
  isAmbiguous: boolean;
  evidenceTerms?: string[];
  rationale?: string;
}

export interface SourceReference {
  title: string;
  url: string;
  snippet?: string;
  accessedAt?: string;
}

export interface NoteEntity {
  id: string;
  title: string;
  content: string;
  folderId?: string;
  subject: string;
  tags: string[];
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  lastAnalyzedAt?: number;
  wordCount: number;
  charCount: number;
  disciplineMode?: DisciplineMode;
  manualDiscipline?: AcademicAreaId | string;
  detectedDiscipline?: AcademicAreaId;
  detectedDisciplineConfidence?: DisciplineEvidenceLevel;
}

export interface FolderEntity {
  id: string;
  name: string;
  color: string;
  subject?: string;
  createdAt: number;
}

export type TermQueryStatus = 'sin_verificar' | 'fuentes_consultadas' | 'contrastado_web';

export interface ConceptEntity {
  id: string;
  termName: string;
  normalizedName: string;
  academicField: string;
  academicAreaId?: AcademicAreaId;
  context: string;
  academicDefinition: string;
  plainExplanation: string;
  illustrativeExample: string;
  verificationStatus: VerificationStatus;
  queryStatus?: TermQueryStatus;
  supportedSegments?: string[];
  sources: SourceReference[];
  noteId?: string;
  documentId?: string;
  documentName?: string;
  pageOrSlide?: number;
  isFavorite: boolean;
  userNotes?: string;
  createdAt: number;
  updatedAt: number;
  lastCheckedAt?: number;
  consultedAt?: string;
}

export interface DocumentPage {
  pageNumber: number;
  content: string;
  hasOCR: boolean;
  analyzedTermsCount?: number;
}

export interface DocumentEntity {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'pptx' | 'ppt' | 'txt' | 'doc';
  fileSize: number;
  pageCount: number;
  subject: string;
  status: 'cargado' | 'extrayendo' | 'listo' | 'analizado' | 'error';
  pages: DocumentPage[];
  createdAt: number;
}

export interface AnalysisSessionLog {
  id: string;
  sourceType: 'note' | 'document';
  sourceId: string;
  sourceTitle: string;
  termsCount: number;
  verifiedCount: number;
  timestamp: number;
  status: 'completado' | 'cancelado' | 'error';
}

export interface AppPreferences {
  theme: ThemePreference;
  chunkSize: number;
  autoDetectOnSave: boolean;
  lastSubject: string;
  showSourcesPreview: boolean;
  offlineOnlyMode: boolean;
  academicProfile?: AcademicProfile;
  onboardingCompleted?: boolean;
}

export interface CachedAnalysisEntity {
  termKey: string; // normalized term name or contextual cache key
  termName: string;
  academicField: string;
  academicAreaId?: AcademicAreaId;
  academicDefinition: string;
  plainExplanation: string;
  illustrativeExample: string;
  sources: SourceReference[];
  verificationStatus: VerificationStatus;
  queryStatus?: TermQueryStatus;
  supportedSegments?: string[];
  queriesConsulted: string[];
  groundingUsed: boolean;
  analyzedAt: number;
  consultedAt?: string;
  academicContextKey?: string;
}

export interface BackupPayload {
  version: string;
  appName: string;
  exportedAt: string;
  notes: NoteEntity[];
  folders: FolderEntity[];
  glossary: ConceptEntity[];
  documents: DocumentEntity[];
  cache?: CachedAnalysisEntity[];
  preferences: AppPreferences;
}

