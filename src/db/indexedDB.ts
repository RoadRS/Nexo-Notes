/**
 * IndexedDB Local Database Engine
 * Implements Room-like DAOs and asynchronous transactional persistence
 */

import {
  NoteEntity,
  FolderEntity,
  ConceptEntity,
  DocumentEntity,
  AppPreferences,
  BackupPayload,
  CachedAnalysisEntity,
} from '../types/models';
import { sanitizeAppPreferences } from '../utils/academicContext';
import {
  AcademicContextInput,
  isSameGlossaryConceptIdentity,
  mergeGlossaryConceptOnSave,
  normalizeConceptTermName,
  prepareSafeCacheEntryToSave,
  reconcileGlossaryConceptBatch,
  resolveContextualCacheKey,
  SaveConceptMergeOptions,
  selectCompatibleCachedAnalysis,
} from '../utils/cacheIntegrity';

const DB_NAME = 'NexoNotes_RoomDB';
const DB_VERSION = 2;

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'system',
  chunkSize: 2500,
  autoDetectOnSave: false,
  lastSubject: 'Psicología Cognitiva',
  showSourcesPreview: true,
  offlineOnlyMode: false,
  academicProfile: undefined,
  onboardingCompleted: false,
};

const INITIAL_FOLDERS: FolderEntity[] = [
  {
    id: 'folder-1',
    name: 'Psicología y Neurociencia',
    color: '#6366F1',
    subject: 'Psicología Cognitiva',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
  },
  {
    id: 'folder-2',
    name: 'Arquitectura de Software',
    color: '#06B6D4',
    subject: 'Informática',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
  },
  {
    id: 'folder-3',
    name: 'Metodología de Investigación',
    color: '#10B981',
    subject: 'Epistemología',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
  },
];

const INITIAL_NOTES: NoteEntity[] = [
  {
    id: 'note-sample-1',
    title: 'Tema 4: Sesgos Cognitivos y Disonancia',
    content: `# Tema 4: Sesgos Cognitivos y Disonancia

Durante el seminario de psicología cognitiva analizamos cómo la **disonancia cognitiva** surge cuando un individuo sostiene simultáneamente dos cogniciones incompatibles o realiza una acción contradictoria con sus creencias.

Festinger postuló que este estado produce una tensión motivacional aversiva que impulsa a la reducción del malestar, a menudo mediante la reinterpretación de hechos o la adopción de racionalizaciones defensivas.

Otro fenómeno crucial abordado fue la **comparación social ascendente**, en la que las personas se contrastan con referentes percibidos como superiores, lo que puede provocar tanto emulación positiva como desmoralización o resentimiento según la autoeficacia percibida.

Puntos clave:
1. La disonancia cognitiva como mecanismo motivacional intrínseco.
2. Comparación social ascendente y su impacto en la autoestima académica.
3. El papel de la reactancia psicológica ante restricciones de libertad personal.`,
    folderId: 'folder-1',
    subject: 'Psicología Cognitiva',
    tags: ['Seminario', 'Cognición', 'ExamenFinal'],
    isPinned: true,
    createdAt: Date.now() - 1000 * 60 * 60 * 48,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
    wordCount: 135,
    charCount: 940,
  },
  {
    id: 'note-sample-2',
    title: 'Patrones Arquitectónicos y Polimorfismo',
    content: `# Patrones Arquitectónicos y Polimorfismo

En sistemas de software distribuidos, el **polimorfismo ad-hoc** permite que una función se aplique a argumentos de diferentes tipos que pueden comportarse de manera distinta según el tipo de argumento proporcionado, usualmente implementado a través de sobrecarga de funciones o typeclasses.

Adicionalmente, el desacoplamiento mediante **inversión de dependencias** establece que los módulos de alto nivel no deben depender de módulos de bajo nivel; ambos deben depender de abstracciones. Esto es fundamental para garantizar la testabilidad con dobles de prueba y la modularidad a largo plazo.`,
    folderId: 'folder-2',
    subject: 'Informática',
    tags: ['Arquitectura', 'SOLID'],
    isPinned: false,
    createdAt: Date.now() - 1000 * 60 * 60 * 36,
    updatedAt: Date.now() - 1000 * 60 * 60 * 12,
    wordCount: 98,
    charCount: 650,
  },
];

const INITIAL_CONCEPTS: ConceptEntity[] = [
  {
    id: 'concept-1',
    termName: 'Disonancia cognitiva',
    normalizedName: 'disonancia cognitiva',
    academicField: 'Psicología Cognitiva y Social',
    context: 'La disonancia cognitiva surge cuando un individuo sostiene simultáneamente dos cogniciones incompatibles.',
    academicDefinition:
      'Estado de malestar psicológico y tensión motivacional que experimenta un sujeto al albergar simultáneamente dos cogniciones, actitudes o conductas incompatibles entre sí (Festinger, 1957).',
    plainExplanation:
      'La incomodidad mental que sentimos cuando lo que creemos y lo que hacemos no encajan, forzándonos a cambiar nuestra forma de pensar o a justificar la acción para sentirnos en calma.',
    illustrativeExample:
      'Un estudiante que sabe que debe estudiar para un examen decisivo al día siguiente pero decide salir de fiesta toda la noche, justificándose con la idea de que "descansar la mente también es estudiar".',
    verificationStatus: 'verificado',
    sources: [
      {
        title: 'Stanford Encyclopedia of Philosophy - Cognitive Dissonance',
        url: 'https://plato.stanford.edu/entries/cognitive-dissonance/',
      },
      {
        title: 'American Psychological Association (APA) Dictionary',
        url: 'https://dictionary.apa.org/cognitive-dissonance',
      },
    ],
    noteId: 'note-sample-1',
    isFavorite: true,
    userNotes: 'Pregunta recurrente en el examen final del Dr. Navarro.',
    createdAt: Date.now() - 1000 * 60 * 60 * 20,
    updatedAt: Date.now() - 1000 * 60 * 60 * 20,
    lastCheckedAt: Date.now() - 1000 * 60 * 60 * 20,
  },
  {
    id: 'concept-2',
    termName: 'Comparación social ascendente',
    normalizedName: 'comparación social ascendente',
    academicField: 'Psicología Social',
    context: 'En la que las personas se contrastan con referentes percibidos como superiores.',
    academicDefinition:
      'Proceso evaluativo en el que un individuo compara sus propias habilidades, rasgos o estatus con los de personas que percibe en una posición superior o más ventajosa (Festinger, 1954; Wills, 1981).',
    plainExplanation:
      'Compararse con alguien a quien consideramos mejor o con más éxito que nosotros en algún ámbito.',
    illustrativeExample:
      'Un estudiante de primer año que compara su técnica de redacción con la de un investigador de posgrado premiado.',
    verificationStatus: 'verificado',
    sources: [
      {
        title: 'APA PsycNet - Upward Social Comparison Processes',
        url: 'https://psycnet.apa.org/record/1991-23456-001',
      },
    ],
    noteId: 'note-sample-1',
    isFavorite: false,
    createdAt: Date.now() - 1000 * 60 * 60 * 18,
    updatedAt: Date.now() - 1000 * 60 * 60 * 18,
    lastCheckedAt: Date.now() - 1000 * 60 * 60 * 18,
  },
];

const INITIAL_DOCUMENTS: DocumentEntity[] = [
  {
    id: 'doc-seed-1',
    fileName: 'Seminario_Psicologia_Cognitiva.pptx',
    fileType: 'pptx',
    fileSize: 45200,
    pageCount: 3,
    subject: 'Psicología Cognitiva',
    status: 'listo',
    pages: [
      {
        pageNumber: 1,
        content: 'Diapositiva 1: Introducción a la cognición social y modelos de procesamiento de la información. Análisis de esquemas mentales y heurísticos de juicio.',
        hasOCR: false,
      },
      {
        pageNumber: 2,
        content: 'Diapositiva 2: Teoría de la disonancia cognitiva (Festinger, 1957). Mecanismos de reducción del malestar aversivo y autojustificación en la toma de decisiones.',
        hasOCR: false,
      },
      {
        pageNumber: 3,
        content: 'Diapositiva 3: Comparación social ascendente y descendente. Reactancia psicológica ante la pérdida de alternativas conductuales percibidas.',
        hasOCR: false,
      },
    ],
    createdAt: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    id: 'doc-seed-2',
    fileName: 'Lectura_Arquitectura_Software.pdf',
    fileType: 'pdf',
    fileSize: 89400,
    pageCount: 2,
    subject: 'Informática',
    status: 'listo',
    pages: [
      {
        pageNumber: 1,
        content: 'Página 1: Principios SOLID y modularidad en sistemas desacoplados. La inversión de dependencias y el polimorfismo ad-hoc como pilares de extensibilidad.',
        hasOCR: false,
      },
      {
        pageNumber: 2,
        content: 'Página 2 (Documento escaneado de apuntes de laboratorio con OCR local):\nPruebas automatizadas con dobles de prueba, stubs y mocks en arquitecturas hexagonales.',
        hasOCR: true,
      },
    ],
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
];

class NexoNotesDatabase {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, DB_VERSION);

          request.onerror = () => {
            console.error('Error abriendo IndexedDB:', request.error);
            reject(request.error);
          };

          request.onsuccess = () => {
            resolve(request.result);
          };

          request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            // Notes Store
            if (!db.objectStoreNames.contains('notes')) {
              const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
              notesStore.createIndex('folderId', 'folderId', { unique: false });
              notesStore.createIndex('subject', 'subject', { unique: false });
              notesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
              notesStore.createIndex('isPinned', 'isPinned', { unique: false });
            }

            // Folders Store
            if (!db.objectStoreNames.contains('folders')) {
              const foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
              foldersStore.createIndex('subject', 'subject', { unique: false });
            }

            // Glossary Store
            if (!db.objectStoreNames.contains('glossary')) {
              const glossaryStore = db.createObjectStore('glossary', { keyPath: 'id' });
              glossaryStore.createIndex('normalizedName', 'normalizedName', { unique: false });
              glossaryStore.createIndex('academicField', 'academicField', { unique: false });
              glossaryStore.createIndex('noteId', 'noteId', { unique: false });
              glossaryStore.createIndex('isFavorite', 'isFavorite', { unique: false });
            }

            // Documents Store
            if (!db.objectStoreNames.contains('documents')) {
              const docsStore = db.createObjectStore('documents', { keyPath: 'id' });
              docsStore.createIndex('fileType', 'fileType', { unique: false });
              docsStore.createIndex('createdAt', 'createdAt', { unique: false });
            }

            // Preferences Store
            if (!db.objectStoreNames.contains('preferences')) {
              db.createObjectStore('preferences', { keyPath: 'key' });
            }

            // Analysis Cache Store
            if (!db.objectStoreNames.contains('analysisCache')) {
              const cacheStore = db.createObjectStore('analysisCache', { keyPath: 'termKey' });
              cacheStore.createIndex('analyzedAt', 'analyzedAt', { unique: false });
            }
          };
        });

        await this.seedDefaultsIfEmpty(database);
        this.db = database;
        return database;
      } catch (err) {
        this.initPromise = null;
        throw err;
      }
    })();

    return this.initPromise;
  }

  private seedDefaultsIfEmpty(db: IDBDatabase): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['notes', 'folders', 'glossary', 'documents', 'preferences'], 'readwrite');
      const notesStore = tx.objectStore('notes');
      const foldersStore = tx.objectStore('folders');
      const glossaryStore = tx.objectStore('glossary');
      const docsStore = tx.objectStore('documents');
      const prefStore = tx.objectStore('preferences');

      const countReq = notesStore.count();
      countReq.onsuccess = () => {
        if (countReq.result === 0) {
          INITIAL_FOLDERS.forEach((f) => foldersStore.put(f));
          INITIAL_NOTES.forEach((n) => notesStore.put(n));
          INITIAL_CONCEPTS.forEach((c) => glossaryStore.put(c));
          INITIAL_DOCUMENTS.forEach((d) => docsStore.put(d));
          prefStore.put({ key: 'appPreferences', value: DEFAULT_PREFERENCES });
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // === NOTES DAO ===
  async getAllNotes(): Promise<NoteEntity[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const request = store.getAll();
      request.onsuccess = () => {
        const notes = (request.result as NoteEntity[]) || [];
        // Sort: pinned first, then by updatedAt descending
        notes.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.updatedAt - a.updatedAt;
        });
        resolve(notes);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getNoteById(id: string): Promise<NoteEntity | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveNote(note: NoteEntity): Promise<NoteEntity> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      const request = store.put(note);
      request.onsuccess = () => resolve(note);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteNote(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // === FOLDERS DAO ===
  async getAllFolders(): Promise<FolderEntity[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('folders', 'readonly');
      const store = tx.objectStore('folders');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveFolder(folder: FolderEntity): Promise<FolderEntity> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('folders', 'readwrite');
      const store = tx.objectStore('folders');
      const request = store.put(folder);
      request.onsuccess = () => resolve(folder);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['folders', 'notes'], 'readwrite');
      const foldersStore = tx.objectStore('folders');
      const notesStore = tx.objectStore('notes');

      foldersStore.delete(id);

      const folderIdx = notesStore.index('folderId');
      const getNotesReq = folderIdx.getAll(id);
      getNotesReq.onsuccess = () => {
        const affectedNotes = (getNotesReq.result as NoteEntity[]) || [];
        affectedNotes.forEach((n) => {
          notesStore.put({ ...n, folderId: undefined });
        });
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // === GLOSSARY DAO ===
  async getAllConcepts(): Promise<ConceptEntity[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('glossary', 'readonly');
      const store = tx.objectStore('glossary');
      const request = store.getAll();
      request.onsuccess = () => {
        const concepts = (request.result as ConceptEntity[]) || [];
        concepts.sort((a, b) => {
          if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
          return a.termName.localeCompare(b.termName);
        });
        resolve(concepts);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveConcept(
    concept: ConceptEntity,
    options?: SaveConceptMergeOptions
  ): Promise<ConceptEntity> {
    const db = await this.getDB();
    const normalized = normalizeConceptTermName(concept.normalizedName || concept.termName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction('glossary', 'readwrite');
      const store = tx.objectStore('glossary');
      const idx = store.index('normalizedName');
      const matchReq = idx.getAll(normalized);

      let mergedConcept: ConceptEntity = mergeGlossaryConceptOnSave(null, concept, options);

      matchReq.onsuccess = () => {
        const matches = (matchReq.result as ConceptEntity[]) || [];
        const sameIdentityMatches = matches.filter(
          (c) => c.id === concept.id || isSameGlossaryConceptIdentity(c, concept)
        );
        const existing =
          sameIdentityMatches.find((c) => c.id === concept.id) || sameIdentityMatches[0];

        if (existing) {
          mergedConcept = mergeGlossaryConceptOnSave(existing, concept, options);
          sameIdentityMatches.forEach((m) => {
            if (m.id !== existing.id) {
              store.delete(m.id);
            }
          });
        }
        store.put(mergedConcept);
      };

      tx.oncomplete = () => resolve(mergedConcept);
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveMultipleConcepts(
    concepts: ConceptEntity[],
    options?: SaveConceptMergeOptions
  ): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('glossary', 'readwrite');
      const store = tx.objectStore('glossary');
      const allReq = store.getAll();

      allReq.onsuccess = () => {
        const existingList = (allReq.result as ConceptEntity[]) || [];
        const { updatedToPersist } = reconcileGlossaryConceptBatch(existingList, concepts, options);
        updatedToPersist.forEach((merged) => {
          store.put(merged);
        });
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteConcept(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('glossary', 'readwrite');
      const store = tx.objectStore('glossary');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // === DOCUMENTS DAO ===
  async getAllDocuments(): Promise<DocumentEntity[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const store = tx.objectStore('documents');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveDocument(doc: DocumentEntity): Promise<DocumentEntity> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const request = store.put(doc);
      request.onsuccess = () => resolve(doc);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteDocument(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // === PREFERENCES DAO ===
  async getPreferences(): Promise<AppPreferences> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('preferences', 'readonly');
      const store = tx.objectStore('preferences');
      const request = store.get('appPreferences');
      request.onsuccess = () => {
        if (request.result?.value) {
          resolve(sanitizeAppPreferences(request.result.value, DEFAULT_PREFERENCES));
        } else {
          resolve({ ...DEFAULT_PREFERENCES });
        }
      };
      request.onerror = () => resolve({ ...DEFAULT_PREFERENCES });
    });
  }

  async savePreferences(preferences: AppPreferences): Promise<void> {
    const db = await this.getDB();
    const sanitized = sanitizeAppPreferences(preferences, DEFAULT_PREFERENCES);
    return new Promise((resolve, reject) => {
      const tx = db.transaction('preferences', 'readwrite');
      const store = tx.objectStore('preferences');
      const request = store.put({ key: 'appPreferences', value: sanitized });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // === ANALYSIS CACHE DAO ===
  async getCachedAnalysis(
    termName: string,
    contextOrArea?: AcademicContextInput
  ): Promise<CachedAnalysisEntity | null> {
    const db = await this.getDB();
    const trimmed = (termName || '').trim();
    if (!trimmed) return null;

    const isAlreadyContextualKey = trimmed.includes('::') && !contextOrArea;
    const contextualKey = isAlreadyContextualKey
      ? trimmed
      : resolveContextualCacheKey(trimmed, contextOrArea);
    const legacyKey = normalizeConceptTermName(
      isAlreadyContextualKey ? trimmed.split('::')[0] : trimmed
    );
    const effectiveContext: AcademicContextInput = isAlreadyContextualKey
      ? { areaId: trimmed.split('::')[1] }
      : contextOrArea;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('analysisCache', 'readonly');
        const store = tx.objectStore('analysisCache');
        const contextualReq = store.get(contextualKey);

        contextualReq.onsuccess = () => {
          const contextualMatch = (contextualReq.result as CachedAnalysisEntity) || null;
          const compatibleContextual = selectCompatibleCachedAnalysis({
            contextualMatch,
            targetContext: effectiveContext,
          });

          if (compatibleContextual || legacyKey === contextualKey) {
            resolve(compatibleContextual);
            return;
          }

          const legacyReq = store.get(legacyKey);
          legacyReq.onsuccess = () => {
            const legacyMatch = (legacyReq.result as CachedAnalysisEntity) || null;
            resolve(
              selectCompatibleCachedAnalysis({
                contextualMatch: null,
                legacyMatch,
                targetContext: effectiveContext,
              })
            );
          };
          legacyReq.onerror = () => resolve(null);
        };

        contextualReq.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async saveCachedAnalysis(
    entry: CachedAnalysisEntity,
    contextOrArea?: AcademicContextInput
  ): Promise<void> {
    const effectiveContext: AcademicContextInput = contextOrArea ?? {
      academicAreaId: entry?.academicAreaId,
      academicField: entry?.academicField,
    };

    const previewSafeEntry = prepareSafeCacheEntryToSave(null, entry, effectiveContext);
    if (!previewSafeEntry) {
      return;
    }

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('analysisCache', 'readwrite');
        const store = tx.objectStore('analysisCache');
        const getReq = store.get(previewSafeEntry.termKey);

        getReq.onsuccess = () => {
          const existing = getReq.result as CachedAnalysisEntity | undefined;
          const entryToSave = prepareSafeCacheEntryToSave(existing, entry, effectiveContext);
          if (!entryToSave) {
            resolve();
            return;
          }

          const putReq = store.put(entryToSave);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };

        getReq.onerror = () => {
          const putReq = store.put(previewSafeEntry);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  async getAllCachedAnalyses(): Promise<CachedAnalysisEntity[]> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('analysisCache', 'readonly');
        const store = tx.objectStore('analysisCache');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async clearAnalysisCache(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('analysisCache', 'readwrite');
        const store = tx.objectStore('analysisCache');
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  // === EXPORT & IMPORT BACKUP ===
  async exportFullBackup(): Promise<BackupPayload> {
    const notes = await this.getAllNotes();
    const folders = await this.getAllFolders();
    const glossary = await this.getAllConcepts();
    const documents = await this.getAllDocuments();
    const preferences = await this.getPreferences();
    const cache = await this.getAllCachedAnalyses();

    return {
      version: '1.0.0',
      appName: 'Nexo Notes',
      exportedAt: new Date().toISOString(),
      notes,
      folders,
      glossary,
      documents,
      cache,
      preferences,
    };
  }

  async restoreFullBackup(data: BackupPayload): Promise<{ notesRestored: number; conceptsRestored: number }> {
    if (!data || typeof data !== 'object') {
      throw new Error('Estructura de respaldo inválida.');
    }

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['notes', 'folders', 'glossary', 'documents', 'preferences', 'analysisCache'], 'readwrite');

      const notesStore = tx.objectStore('notes');
      const foldersStore = tx.objectStore('folders');
      const glossaryStore = tx.objectStore('glossary');
      const docsStore = tx.objectStore('documents');
      const prefStore = tx.objectStore('preferences');
      const cacheStore = tx.objectStore('analysisCache');

      // Clear existing records safely
      notesStore.clear();
      foldersStore.clear();
      glossaryStore.clear();
      docsStore.clear();
      cacheStore.clear();

      let notesCount = 0;
      let conceptsCount = 0;

      if (Array.isArray(data.folders)) {
        data.folders.forEach((f) => foldersStore.put(f));
      }

      if (Array.isArray(data.notes)) {
        data.notes.forEach((n) => {
          notesStore.put(n);
          notesCount++;
        });
      }

      if (Array.isArray(data.glossary)) {
        data.glossary.forEach((c) => {
          glossaryStore.put(c);
          conceptsCount++;
        });
      }

      if (Array.isArray(data.documents)) {
        data.documents.forEach((d) => docsStore.put(d));
      }

      if (Array.isArray(data.cache)) {
        data.cache.forEach((item) => cacheStore.put(item));
      }

      if (data.preferences) {
        prefStore.put({
          key: 'appPreferences',
          value: sanitizeAppPreferences(data.preferences, DEFAULT_PREFERENCES),
        });
      }

      tx.oncomplete = () => {
        resolve({ notesRestored: notesCount, conceptsRestored: conceptsCount });
      };

      tx.onerror = () => reject(tx.error);
    });
  }
}

export const localDB = new NexoNotesDatabase();
