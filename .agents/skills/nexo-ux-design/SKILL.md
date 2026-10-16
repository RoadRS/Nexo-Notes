---
name: nexo-ux-design
description: "Mejora la experiencia de usuario y el diseño visual de Nexo Notes, una app web de estudio para estudiantes universitarios de psicología (React, TypeScript, Vite, Tailwind). Úsala cuando se pida revisar, criticar, rediseñar, ordenar o mejorar cualquier pantalla, flujo, navegación, jerarquía visual, textos de interfaz (microcopy), accesibilidad, versión móvil o consistencia visual de Nexo Notes, o implementar cambios de UI/UX en sus componentes existentes. No la uses para cambiar lógica, backend, almacenamiento ni la integración con modelos."
---

# nexo-ux-design

Mejora la experiencia de usuario y el diseño visual de **Nexo Notes** sin romper lo que ya funciona. Responde siempre en español claro y breve.

## Contexto del producto

Nexo Notes es una herramienta gratuita para estudiantes universitarios de psicología. Les ayuda a comprender, diferenciar y relacionar conceptos psicológicos a partir de sus apuntes, PDF y materiales de clase. Está hecha con React, TypeScript, Vite y Tailwind CSS. Ya tiene importación de documentos, análisis conceptual, glosario y almacenamiento local. Su identidad actual es índigo.

Debe sentirse como un espacio personal de estudio: claro, cálido, académico y fácil de usar. No debe parecer un chatbot genérico ni una demo futurista de IA.

## Criterio de diseño en cinco líneas

- Claridad antes que decoración; el contenido académico es el protagonista.
- Sobrio, cálido, editorial y moderno: fondos neutros, buena tipografía, espacio en blanco, componentes simples.
- Índigo moderado: acción principal, elemento activo, enlaces y foco. No como fondo ni adorno.
- Sin gradientes llamativos, resplandores, estética futurista, exceso de tarjetas, badges, chips, sombras ni animaciones.
- «IA» no es un reclamo visual. Escritorio primero, móvil bien adaptado, accesibilidad siempre.

## Referencias (léelas solo cuando apliquen)

Las rutas son relativas a esta carpeta.

| Archivo | Léelo cuando… |
|---|---|
| `references/design-principles.md` | propongas o implementes cambios visuales, de layout, navegación, estados o responsive |
| `references/nexo-ui-language.md` | escribas o cambies textos de interfaz (botones, etiquetas, vacíos, errores) |
| `references/ux-review-checklist.md` | hagas una crítica UX o verifiques una implementación |

## Paso 0: clasifica la solicitud

| Modo | Se activa con… | Qué haces | Qué no haces |
|---|---|---|---|
| **A. Crítica UX** | «revisa», «qué problemas tiene», «critica», «analiza esta pantalla» | Inspeccionar y entregar hallazgos priorizados con recomendaciones | Editar o crear archivos |
| **B. Propuesta visual** | «propón», «diseña», «rediseña», «cómo debería verse», «maqueta» | Describir la pantalla: estructura, componentes, textos, estados, móvil | Tocar lógica; crear archivos dentro de `src/` |
| **C. Implementación** | «implementa», «aplica», «hazlo», «adelante», referido a una propuesta o a un cambio concreto | Cambiar los componentes existentes necesarios | Ampliar el alcance más allá de lo autorizado |

Reglas de selección:

- Si dudas entre modos, usa el menos invasivo (A o B) y cierra preguntando si quiere pasar a implementación. Una petición vaga como «mejora esta pantalla» es modo B.
- Nunca subas de modo por tu cuenta. Pasar a C exige una petición o aprobación explícita del usuario.
- Si la petición mezcla diseño con cambios de lógica, datos o backend, haz solo la parte de diseño y deja lo demás señalado como pendiente de autorización explícita.
- Si la tarea no tiene componente de interfaz (por ejemplo, un fallo en la importación), dilo y no uses esta skill.
- En modo B, si el usuario pide una maqueta navegable, créala como archivo independiente fuera de `src/` (por ejemplo `docs/propuestas/`), sin importarla desde la app, y avisa dónde quedó.

## Reglas que aplican en los tres modos

Existen porque Nexo Notes ya funciona: un rediseño no debe costarle al estudiante ninguna capacidad ni sus datos.

1. **No reconstruyas la app.** Evoluciona los componentes existentes; no los reemplaces por versiones nuevas desde cero.
2. **No cambies el stack.** React, TypeScript, Vite y Tailwind se quedan. No añadas dependencias, plugins, paquetes de fuentes ni librerías de componentes sin autorización explícita.
3. **No toques la lógica** durante un rediseño visual (ver zona protegida), salvo autorización explícita para ese cambio concreto.
4. **No elimines funciones** para simplificar. Si algo confunde, reubícalo, hazlo secundario o replantea su etiqueta. Si crees que una función sobra, plantéalo como pregunta al usuario.
5. **No inventes** pantallas, funciones, datos, estadísticas, fuentes, cifras ni capacidades. Si propones algo que la app hoy no hace, márcalo como «requiere desarrollo nuevo» y déjalo fuera del diseño base.
6. **Declara la base de tu análisis:** código, captura, descripción del usuario o app en ejecución. No afirmes cómo «se ve» algo que solo has leído en el código.
7. **Cambios pequeños y verificables.** Prefiere varios pasos acotados a un cambio masivo.
8. **Informa con exactitud.** Lista los archivos que modificaste y las pruebas que realmente ejecutaste. Lo que no ejecutaste se reporta como «no verificado».

### Zona protegida

Identifícala en el repositorio (no asumas rutas) y no la modifiques:

- Llamadas y configuración del modelo de Gemini, prompts del análisis, backend o funciones de servidor.
- Cuotas y límites de uso; claves API, `.env` y secretos.
- IndexedDB y cualquier almacenamiento local: esquemas, claves, migraciones.
- Importación y lectura de documentos (parsers, extracción de texto).
- Tipos, interfaces, esquemas y contratos de datos entre capas.
- Hooks, estado, efectos, handlers y props de los componentes: cambia marcado, clases y textos, no comportamiento.
- Configuración de Vite, TypeScript, ESLint, `package.json` y lockfiles.
- Tests existentes: no los borres ni los debilites para que pasen.
- `tailwind.config.*` y CSS global: solo con autorización explícita, porque afectan a todas las pantallas.

Antes de editar un texto visible, comprueba que no se use como clave, valor guardado, comparación o dentro de tests. Si se usa así, no lo cambies y propón separar etiqueta visible e identificador como cambio aparte.

## Flujo de trabajo

### 1. Identifica la tarea principal del estudiante

Redáctala en una frase: «Un estudiante de psicología quiere [hacer X] para [lograr Y]». Dedúcela de la petición y del código. Si la pantalla sirve a varias tareas, elige la principal y nombra las secundarias. Haz como máximo una pregunta y solo si no puedes avanzar sin la respuesta; si no preguntas, declara tu suposición.

### 2. Inspecciona antes de opinar

- Lee el componente de la pantalla, los componentes compartidos que usa y cómo se llega a ella.
- Revisa los colores, espaciado y tipografía que ya se usan, y si existe modo oscuro.
- Busca cómo resuelve la app el mismo patrón en otras pantallas; reutilízalo. Si propones un patrón nuevo, indica dónde más debería aplicarse.
- Si hay capturas, úsalas. Si no, no presentes el aspecto visual como un hecho.
- Si vas a implementar, ejecuta `git status`. Si hay cambios sin guardar, avisa y recomienda un commit o una rama antes de seguir. Si el proyecto no usa git, dilo: tendrás que llevar tú la lista exacta de archivos que editas.

### 3. Detecta fricciones

Guíate por `references/ux-review-checklist.md`. Clasifica por severidad (Alta, Media, Baja) y reporta como máximo los 5–7 hallazgos más importantes, cada uno con evidencia: dónde está, qué ocurre y por qué importa a la tarea del estudiante. No entregues listas exhaustivas.

### 4. Propón (modos B y C)

Define jerarquía visual, navegación, etiquetas, componentes y estados (vacío, cargando, error, éxito, parcial), además del comportamiento en móvil y la accesibilidad. Reutiliza componentes existentes antes de crear nuevos. Una sola acción principal por vista. Apóyate en `references/design-principles.md` y `references/nexo-ui-language.md`.

### 5. Explica por qué

En 2–4 frases y sin jerga de diseño, di cómo la propuesta facilita la tarea del estudiante.

### 6. Puerta de aprobación

- **Modos A y B terminan aquí.** Cierra con el siguiente paso posible y pregunta si quiere implementarlo.
- **Modo C:** antes de editar, presenta un plan breve con los archivos a tocar, el cambio en cada uno y los riesgos. Después:
  - *Cambio acotado* (hasta 3 archivos, solo marcado, clases o textos estáticos, sin componentes compartidos ni estilos globales, y el usuario pidió implementar de forma explícita): puedes continuar justo después de mostrar el plan.
  - *Cambio amplio* (más de 3 archivos, o componentes usados en varias pantallas, o estilos globales, tokens o configuración de Tailwind, o cambios de navegación o de nombres en varias pantallas): detente y espera aprobación explícita del plan.

### 7. Implementa y verifica (solo modo C)

- Modifica únicamente los archivos del plan, en pasos pequeños. Si hace falta tocar otro archivo o la zona protegida, detente y pide autorización.
- Al terminar, aplica la sección «Verificación posterior a implementación» de `references/ux-review-checklist.md`.
- Entrega el informe con el formato de abajo.

## Formatos de respuesta

**Modo A: crítica UX**

```
Tarea principal: …
Base del análisis: código / captura / app en ejecución / descripción
Lo que ya funciona: (1–2 puntos)
Hallazgos, por prioridad:
1. [Alta] Qué ocurre → por qué importa → recomendación
2. [Media] …
No se modificó ningún archivo.
Siguiente paso sugerido: …
```

**Modo B: propuesta visual**

```
Tarea principal: …
Estructura de la pantalla: (esquema en texto, en orden de lectura; qué es primario y qué secundario)
Componentes y textos: …
Estados: vacío / cargando / error / éxito / parcial
Móvil: …
Accesibilidad: …
Por qué facilita el uso: …
Impacto estimado en el código: archivos probables; sin cambios de lógica
¿Quieres que lo implemente?
```

**Modo C: informe final**

```
Archivos modificados: lista
Qué cambió en cada uno: …
Zona protegida: sin cambios (comprobado con git diff --stat) / nota si hubo excepción autorizada
Pruebas ejecutadas: comando → resultado (solo las que realmente corriste)
No verificado: p. ej. revisión visual en navegador, móvil, modo oscuro
Qué revisar a mano: 3–5 flujos concretos que existan en la app
Decisiones de diseño a registrar: 1–3 líneas candidatas para «Decisiones aprobadas» en design-principles.md (el usuario decide si las añade; esta skill no edita su propia carpeta)
```

## Antes de entregar

- ¿Respeté la tarea principal y las reglas de los tres modos? ¿Se modificó solo lo autorizado?
- ¿El contenido académico sigue siendo el protagonista, con índigo moderado y sin decoración que compita?
- ¿Los textos están en español natural y son coherentes con `references/nexo-ui-language.md`?
- ¿Funciona en móvil y con teclado, con contraste suficiente?
- ¿Afirmé algo que no verifiqué o inventé algo que la app no tiene?
