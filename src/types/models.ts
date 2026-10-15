/**
 * Nexo Notes - Data Models & Contracts
 * Mirrors Android Room Entities & Value Objects
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export type VerificationStatus = 'verificado' | 'discrepancia' | 'no_verificado' | 'pendiente';

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
}

export interface CachedAnalysisEntity {
  termKey: string; // normalized term name
  termName: string;
  academicField: string;
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

