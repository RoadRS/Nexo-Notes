# ==============================================================================
# GUÍA TÉCNICA: GENERACIÓN DE APK INSTALABLE PARA TELÉFONOS SAMSUNG GALAXY
# Proyecto: Nexo Notes
# ==============================================================================

Esta guía detalla los métodos oficiales y verificados para compilar y probar
el archivo APK en cualquier teléfono Samsung Galaxy (One UI / Android 10 a 14+).

---

## MÉTODO 1: Generación de APK Nativo con Android Studio (Kotlin + Jetpack Compose + Room)

Este método compila el código fuente nativo de Android que utiliza Room para persistencia
local y Jetpack Compose para la interfaz Material 3.

### 1.1 Requisitos Previos
1. Descargar e instalar **Android Studio** (versión Jellyfish 2024.1 o superior).
2. Tener instalado **JDK 17** o JDK 21.
3. Android SDK con Target API 34+ (Android 14).

### 1.2 Configuración del Archivo `build.gradle.kts` (Módulo :app)
```kotlin
plugins {
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

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }
}

dependencies {
    // Jetpack Compose & Material 3 (One UI Style)
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")

    // Room Database (Persistencia Local de Notas y Glosario)
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    kapt("androidx.room:room-compiler:$roomVersion")

    // SDK Oficial de Gemini para Android
    implementation("com.google.ai.client.generativeai:generativeai:0.9.0")

    // Coroutines & Storage Access Framework
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
    implementation("androidx.documentfile:documentfile:1.0.1")
}
```

### 1.3 Configuración de Permisos en `AndroidManifest.xml`
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Acceso a Internet opcional para el Grounding de Gemini con Google Search -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Lectura de documentos y diapositivas mediante Storage Access Framework -->
    <uses-permission android:name="android.permission.READ_MEDIA_DOCUMENTS" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="Nexo Notes"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.NexoNotes">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:windowSoftInputMode="adjustResize"
            android:theme="@style/Theme.NexoNotes">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

### 1.4 Pasos para Compilar el APK en Android Studio
1. Abre el proyecto en Android Studio.
2. Espera a que finalice la sincronización de Gradle (*Sync Project with Gradle Files*).
3. En el menú superior, selecciona:
   **Build > Build Bundle(s) / APK(s) > Build APK(s)**
4. Cuando finalice la compilación, aparecerá una notificación con el enlace **locate**.
   El archivo generado se ubicará en:
   `app/build/outputs/apk/debug/app-debug.apk`

---

## MÉTODO 2: Generar APK Directo con Bubblewrap CLI (Google TWA)

Permite empaquetar la aplicación PWA directamente en un archivo APK nativo firmado
sin necesidad de configurar Gradle manualmente.

1. Instalar la herramienta oficial de Google:
   ```bash
   npm install -g @bubblewrap/cli
   ```
2. Inicializar el paquete APK usando el manifest de la aplicación:
   ```bash
   bubblewrap init --manifest="https://<TU-URL-DE-LA-APP>/manifest.webmanifest"
   ```
3. Compilar el archivo APK:
   ```bash
   bubblewrap build
   ```
4. El archivo generado `app-release-signed.apk` está listo para ser instalado.

---

## MÉTODO 3: Instalación Inmediata WebAPK en Teléfonos Samsung Galaxy (Sin Cables ni PC)

El navegador Samsung Internet y Google Chrome en dispositivos Samsung disponen del
servicio nativo **WebAPK (Samsung Knox Compatible)**:

1. Abre la aplicación en el navegador de tu teléfono Samsung Galaxy.
2. Toca el botón **«Instalar en Android / Samsung»** situado en el banner superior,
   o pulsa el menú de opciones (tres puntos / líneas) > **«Añadir a pantalla de inicio»**.
3. El sistema operativo Android generará e instalará el paquete APK automáticamente
   en el cajón de aplicaciones de Samsung One UI con icono de alta resolución, soporte
   offline completo y ejecución independiente a pantalla completa.

---

## 4. Instalación del archivo APK en tu Teléfono Samsung

Si generaste el archivo `.apk` mediante el Método 1 o Método 2:

1. **Transferir el archivo al teléfono**:
   - Mediante cable USB copiándolo a la carpeta `Download`.
   - O enviándolo por **Quick Share**, Google Drive o Telegram.
2. **Habilitar orígenes desconocidos**:
   - En tu teléfono Samsung: entra en **Ajustes > Seguridad y privacidad > Instalar aplicaciones desconocidas**.
   - Habilita la aplicación que uses para abrir el archivo (por ejemplo, **Mis archivos** o **Chrome**).
3. **Instalar**:
   - Abre la aplicación **Mis archivos** de Samsung.
   - Ve a la sección **Archivos de instalación (APK)** o a **Descargas**.
   - Toca `app-debug.apk` y presiona **Instalar**.
4. ¡Listo! Nexo Notes se abrirá en tu pantalla con almacenamiento Room/local protegido.
