import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Code2 } from 'lucide-react';

export const AndroidArchitectureModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [selectedFile, setSelectedFile] = useState<string>('NoteEntity.kt');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const codeFiles: Record<string, { title: string; category: string; code: string }> = {
    'NoteEntity.kt': {
      title: 'NoteEntity.kt (Room Entity)',
      category: 'Base de Datos (Room)',
      code: `package com.nexonotes.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Index

@Entity(
    tableName = "notes",
    indices = [
        Index(value = ["folderId"]),
        Index(value = ["subject"]),
        Index(value = ["updatedAt"])
    ]
)
data class NoteEntity(
    @PrimaryKey val id: String,
    val title: String,
    val content: String,
    val folderId: String? = null,
    val subject: String,
    val tagsJson: String = "[]",
    val isPinned: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val lastAnalyzedAt: Long? = null,
    val wordCount: Int = 0,
    val charCount: Int = 0
)`,
    },
    'ConceptEntity.kt': {
      title: 'ConceptEntity.kt (Room Entity)',
      category: 'Base de Datos (Room)',
      code: `package com.nexonotes.app.data.local.entities

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Index

@Entity(
    tableName = "concepts",
    indices = [
        Index(value = ["normalizedName"], unique = true),
        Index(value = ["academicField"]),
        Index(value = ["noteId"])
    ]
)
data class ConceptEntity(
    @PrimaryKey val id: String,
    val termName: String,
    val normalizedName: String,
    val academicField: String,
    val contextSnippet: String,
    val academicDefinition: String,
    val plainExplanation: String,
    val illustrativeExample: String,
    val verificationStatus: String, // "verificado", "discrepancia", "no_verificado"
    val sourcesJson: String = "[]",
    val noteId: String? = null,
    val documentId: String? = null,
    val pageOrSlide: Int? = null,
    val isFavorite: Boolean = false,
    val userNotes: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val lastCheckedAt: Long? = null
)`,
    },
    'NotesDao.kt': {
      title: 'NotesDao.kt (Room DAO)',
      category: 'DAOs (Room)',
      code: `package com.nexonotes.app.data.local.dao

import androidx.room.*
import com.nexonotes.app.data.local.entities.NoteEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface NotesDao {
    @Query("SELECT * FROM notes ORDER BY isPinned DESC, updatedAt DESC")
    fun getAllNotes(): Flow<List<NoteEntity>>

    @Query("SELECT * FROM notes WHERE folderId = :folderId ORDER BY updatedAt DESC")
    fun getNotesByFolder(folderId: String): Flow<List<NoteEntity>>

    @Query("SELECT * FROM notes WHERE id = :id LIMIT 1")
    suspend fun getNoteById(id: String): NoteEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(note: NoteEntity)

    @Delete
    suspend fun delete(note: NoteEntity)

    @Query("DELETE FROM notes WHERE id = :id")
    suspend fun deleteById(id: String)
}`,
    },
    'ConceptsDao.kt': {
      title: 'ConceptsDao.kt (Room DAO)',
      category: 'DAOs (Room)',
      code: `package com.nexonotes.app.data.local.dao

import androidx.room.*
import com.nexonotes.app.data.local.entities.ConceptEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ConceptsDao {
    @Query("SELECT * FROM concepts ORDER BY isFavorite DESC, termName ASC")
    fun getAllConcepts(): Flow<List<ConceptEntity>>

    @Query("SELECT * FROM concepts WHERE verificationStatus = :status")
    fun getConceptsByStatus(status: String): Flow<List<ConceptEntity>>

    @Query("SELECT * FROM concepts WHERE normalizedName = :normalizedName LIMIT 1")
    suspend fun findByNormalizedName(normalizedName: String): ConceptEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(concepts: List<ConceptEntity>)

    @Query("UPDATE concepts SET isFavorite = NOT isFavorite WHERE id = :id")
    suspend fun toggleFavorite(id: String)

    @Query("DELETE FROM concepts WHERE id = :id")
    suspend fun deleteById(id: String)
}`,
    },
    'AppDatabase.kt': {
      title: 'AppDatabase.kt (Room Database)',
      category: 'Room Config',
      code: `package com.nexonotes.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.nexonotes.app.data.local.entities.NoteEntity
import com.nexonotes.app.data.local.entities.ConceptEntity
import com.nexonotes.app.data.local.dao.NotesDao
import com.nexonotes.app.data.local.dao.ConceptsDao

@Database(
    entities = [NoteEntity::class, ConceptEntity::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun notesDao(): NotesDao
    abstract fun conceptsDao(): ConceptsDao
}`,
    },
    'GeminiGroundingService.kt': {
      title: 'GeminiGroundingService.kt (IA Grounding)',
      category: 'Servicio Gemini IA',
      code: `package com.nexonotes.app.data.remote

import com.google.ai.client.generativeai.GenerativeModel
import com.google.ai.client.generativeai.type.tool
import com.nexonotes.app.data.model.VerifiedResult

class GeminiGroundingService(
    private val apiKey: String
) {
    // Configuración segura del modelo Gemini 3.8 Flash con Google Search Grounding
    private val model = GenerativeModel(
        modelName = "gemini-3.8-flash",
        apiKey = apiKey
    )

    suspend fun verifyTermWithGoogleSearch(
        term: String,
        context: String,
        subject: String
    ): Result<VerifiedResult> = runCatching {
        val prompt = """
            Fundamenta el concepto académico "$term".
            Contexto del apunte: "$context".
            Disciplina: "$subject".
            Genera definición rigurosa, lenguaje sencillo, ejemplo didáctico y cita las fuentes verificadas.
        """.trimIndent()

        val response = model.generateContent(prompt)
        // Extraer citas reales de candidate.groundingMetadata
        VerifiedResult.fromResponse(term, response)
    }
}`,
    },
    'NexoNotesComposeUI.kt': {
      title: 'NexoNotesComposeUI.kt (Jetpack Compose)',
      category: 'UI Material 3 / One UI',
      code: `package com.nexonotes.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nexonotes.app.data.local.entities.NoteEntity

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(
    notes: List<NoteEntity>,
    onNoteClick: (NoteEntity) -> Unit,
    onAnalyzeClick: (NoteEntity) -> Unit,
    onNewNoteClick: () -> Unit
) {
    Scaffold(
        topBar = {
            LargeTopAppBar(
                title = {
                    Column {
                        Text("Nexo Notes", style = MaterialTheme.typography.headlineMedium)
                        Text(
                            "\${notes.size} apuntes guardados",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onNewNoteClick,
                icon = { Icon(Icons.Default.Add, "Nuevo") },
                text = { Text("Nuevo apunte") }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(notes, key = { it.id }) { note ->
                NoteCard(note = note, onClick = { onNoteClick(note) })
            }
        }
    }
}`,
    },
    'CreateNotebookScreen.kt': {
      title: 'CreateNotebookScreen.kt (BackHandler & Dialog)',
      category: 'Navegación Jetpack Compose',
      code: `package com.nexonotes.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateNotebookScreen(
    onNavigateBack: () -> Unit,
    onSaveNotebook: (name: String, color: String, subject: String?) -> Unit
) {
    var notebookName by remember { mutableStateOf("") }
    var notebookSubject by remember { mutableStateOf("") }
    var selectedColor by remember { mutableStateOf("#6366F1") }
    var showDiscardDialog by remember { mutableStateOf(false) }

    val hasUnsavedChanges = notebookName.isNotBlank() || notebookSubject.isNotBlank()

    // Manejador del botón Atrás de Android (gesto o botón físico)
    BackHandler(enabled = true) {
        if (hasUnsavedChanges) {
            showDiscardDialog = true
        } else {
            onNavigateBack()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Crear cuaderno") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (hasUnsavedChanges) {
                            showDiscardDialog = true
                        } else {
                            onNavigateBack()
                        }
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Regresar")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = notebookName,
                onValueChange = { notebookName = it },
                label = { Text("Nombre del cuaderno") },
                modifier = Modifier.fillMaxWidth()
            )

            Button(
                onClick = {
                    if (notebookName.isNotBlank()) {
                        onSaveNotebook(notebookName.trim(), selectedColor, notebookSubject.trim().ifEmpty { null })
                        onNavigateBack()
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = notebookName.isNotBlank()
            ) {
                Text("Guardar cuaderno")
            }
        }

        if (showDiscardDialog) {
            AlertDialog(
                onDismissRequest = { showDiscardDialog = false },
                title = { Text("¿Descartar cambios?") },
                text = { Text("Tienes cambios sin guardar en el cuaderno. ¿Deseas descartarlos?") },
                confirmButton = {
                    TextButton(onClick = {
                        showDiscardDialog = false
                        onNavigateBack()
                    }) {
                        Text("Descartar y salir")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showDiscardDialog = false }) {
                        Text("Seguir editando")
                    }
                }
            )
        }
    }
}`,
    },
    'build.gradle.kts': {
      title: 'build.gradle.kts (Gradle Config)',
      category: 'Configuración Android',
      code: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    id("kotlin-kapt")
}

android {
    namespace = "com.nexonotes.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.nexonotes.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }
}

dependencies {
    implementation("androidx.compose.material3:material3:1.2.1")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")
    implementation("com.google.ai.client.generativeai:generativeai:0.9.0")
}`,
    },
    'AndroidManifest.xml': {
      title: 'AndroidManifest.xml (Permisos y Actividades)',
      category: 'Manifiesto Android',
      code: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.READ_MEDIA_DOCUMENTS" />

    <application
        android:allowBackup="true"
        android:label="Nexo Notes"
        android:theme="@style/Theme.NexoNotes">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`,
    },
    'Guia_APK_Samsung.md': {
      title: 'Pasos exactos para compilar y probar APK en Samsung',
      category: 'Generación de APK',
      code: `PASOS EXACTOS PARA COMPILAR Y PROBAR EL APK EN TU SAMSUNG GALAXY:

1. MÉTODO ANDROID STUDIO:
   - Abre el proyecto en Android Studio (versión 2024.1+ con JDK 17).
   - Ve a: Build > Build Bundle(s) / APK(s) > Build APK(s).
   - El archivo se genera en: app/build/outputs/apk/debug/app-debug.apk.
   - Conecta tu Samsung Galaxy por USB y transfiere app-debug.apk a la carpeta Download.
   - En tu Samsung: Abre la app "Mis archivos" > "Descargas" > toca "app-debug.apk" > "Instalar".

2. MÉTODO DIRECTO PWA / WebAPK (Recomendado sin cables):
   - Abre esta aplicación en Samsung Internet o Google Chrome en tu teléfono Samsung.
   - Toca el botón "Instalar en Android / Samsung" en la parte superior.
   - One UI / Android instalará automáticamente el APK firmado en tu cajón de aplicaciones.`,
    },
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(codeFiles[selectedFile].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="android-arch-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-white dark:bg-stone-900 border-t sm:border border-stone-200 dark:border-stone-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden safe-area-bottom"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-stone-200/80 dark:bg-stone-800 text-stone-700 dark:text-stone-300 shrink-0">
              <Code2 className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="min-w-0">
              <h2
                id="android-arch-modal-title"
                className="font-bold text-sm sm:text-base text-stone-900 dark:text-stone-100 leading-tight truncate"
              >
                Referencia Android (Kotlin · Jetpack Compose · Room)
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate mt-0.5">
                Entidades, DAOs y componentes equivalentes para Android Studio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar especificación técnica"
            className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-xl text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File selector tabs */}
        <div
          role="tablist"
          aria-label="Archivos de referencia Kotlin"
          className="flex items-center gap-1.5 px-5 py-2.5 bg-stone-100/80 dark:bg-stone-950/60 border-b border-stone-200 dark:border-stone-800 overflow-x-auto no-scrollbar text-xs shrink-0"
        >
          {Object.keys(codeFiles).map((fileName) => {
            const isSelected = selectedFile === fileName;
            return (
              <button
                key={fileName}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedFile(fileName)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl whitespace-nowrap font-mono transition-colors text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                  isSelected
                    ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                    : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800'
                }`}
              >
                {fileName}
              </button>
            );
          })}
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-y-auto p-5 relative bg-stone-950 text-stone-100 font-mono text-xs leading-relaxed">
          <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-stone-800">
            <span className="text-xs text-stone-400">
              {codeFiles[selectedFile].category} · {codeFiles[selectedFile].title}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar código</span>
                </>
              )}
            </button>
          </div>

          <pre className="overflow-x-auto whitespace-pre font-mono">
            {codeFiles[selectedFile].code}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/50 flex items-center justify-between gap-3 text-xs text-stone-500 dark:text-stone-400 shrink-0">
          <span>Target SDK 34+ · Material 3 · Coroutines & Flow</span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-semibold text-xs hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
