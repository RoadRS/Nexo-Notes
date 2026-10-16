# Principios de diseño de Nexo Notes

Referencia para proponer o implementar cambios visuales. Los valores son puntos de partida: **prevalece lo que el proyecto ya usa** (tokens, escala, fuentes). Si algo no coincide, propónlo como propuesta; no lo apliques sin autorización.

## 1. Orden de prioridad cuando dos principios chocan

1. Accesibilidad y claridad de la tarea.
2. El contenido académico del estudiante.
3. Consistencia con el resto de la app.
4. Sobriedad visual.
5. Preferencia estética.

## 2. Principios

1. **Claridad antes que decoración.** Todo elemento visible debe ayudar a una tarea. Si quitarlo no hace perder nada, sobra. Esto aplica a decoración, nunca a funciones.
2. **El contenido académico es el protagonista.** Apuntes, definiciones y comparaciones ocupan el centro, con mayor tamaño y contraste. Controles y metadatos van en segundo plano.
3. **Español natural y directo.** Ver `nexo-ui-language.md`.
4. **Sobrio, cálido, editorial y moderno.** Pocos elementos, bien alineados, con aire.
5. **Índigo moderado.** Reservado para la acción principal, el elemento activo o seleccionado, los enlaces y el anillo de foco. No en fondos amplios ni en varios elementos compitiendo. Una acción principal por vista.
6. **La IA no es un reclamo.** No uses «IA», chispas, varitas, robots, «mágico» o «inteligente» como decoración ni como título de sección. Excepción útil: cuando algo es resultado de un análisis generado, distínguelo del texto del estudiante con una etiqueta funcional discreta (por ejemplo «Análisis de tus apuntes»), una vez por bloque y no en cada elemento. Así el estudiante puede juzgar qué viene de su material.
7. **Escritorio primero, móvil bien adaptado.** Mismas funciones en ambos; se adapta la disposición, no se recortan capacidades.
8. **Accesibilidad no negociable.** Ver sección 6.

## 3. Referencia visual (Tailwind)

- **Fondos:** neutro cálido (`stone-50` o blanco) y superficies blancas. En modo oscuro, `stone-900/950`, nunca negro puro.
- **Texto:** `stone-900/800` principal; `stone-600` secundario. No uses grises más claros para texto con significado.
- **Índigo:** tonos 600–700 en acciones y enlaces sobre fondo claro; 300–400 sobre fondo oscuro. Verifica el contraste: tonos 500 o más claros pueden no cumplir sobre blanco con texto pequeño.
- **Estados semánticos** (error, éxito, aviso): color + icono + texto, nunca solo color; tonos sobrios.
- **Tipografía:** usa la actual. Cuerpo de al menos 16 px; interlineado 1.6–1.75 en lectura larga (`leading-relaxed`); ancho de lectura de 60–75 caracteres (`max-w-prose`); 3–4 niveles de título claramente distintos por tamaño y peso. Opcional para tono editorial: una serif sobria en títulos de contenido académico. Propónla; no instales fuentes sin autorización.
- **Espaciado:** escala de Tailwind consistente. Más espacio entre secciones que dentro de ellas: la proximidad agrupa. Prefiere separar con espacio y filetes finos (`border-b`) antes que con cajas.
- **Tarjetas:** solo para una unidad independiente y accionable (por ejemplo, un documento en una lista). Nunca anidadas.
- **Bordes y sombras:** bordes finos (`border-stone-200`) antes que sombras. Sombra solo en capas flotantes (menús, diálogos). Radios moderados y uniformes.
- **Badges y chips:** solo si codifican un dato real con el que el estudiante decide o filtra. Si basta con texto, usa texto.
- **Iconos:** un solo conjunto (el existente), con texto salvo los universales (cerrar, buscar). Nunca decorativos.
- **Movimiento:** solo retroalimentación funcional, de 200 ms o menos. Sin animaciones de entrada decorativas. Respeta `motion-reduce:`.
- **Evita:** gradientes llamativos, resplandores, glassmorphism, neón, fondos animados, texto con degradado y cualquier estética «futurista».

## 4. Layout y navegación

**Escritorio**
- Navegación persistente y simple, organizada por tareas del estudiante y no por tecnología. Pocos destinos principales; la ubicación actual siempre visible.
- Contenido principal en una columna con ancho de lectura. Los paneles secundarios (índice, glosario, detalles) acompañan sin competir.
- Comparación de conceptos: columnas paralelas con los atributos alineados fila a fila.

**Móvil** (diseña para 360–390 px de ancho y comprueba 320 px)
- Una columna; acciones principales al alcance del pulgar; objetivos táctiles de al menos 44×44 px (`min-h-[44px]`).
- Tablas y comparaciones: apílalas (al comparar conceptos, agrupa por atributo) o contenlas en su propio contenedor con scroll horizontal. La página completa nunca hace scroll horizontal.
- Campos con fuente de al menos 16 px para evitar el zoom automático en iOS. Cuida las barras fijas inferiores cuando aparece el teclado.

## 5. Estados de interfaz

Toda vista que carga o produce datos define:

- **Vacío:** qué es esto, cómo empezar y una sola acción.
- **Cargando:** qué está ocurriendo, con indicador accesible. Sin porcentajes ni tiempos inventados.
- **Error:** qué pasó y qué puede hacer el estudiante, sin culparlo. Conserva su trabajo.
- **Éxito:** confirmación breve y no bloqueante.
- **Parcial:** si el resultado está incompleto, di qué falta.
- **Sin resultados:** sugiere un siguiente paso.
- **Límite de uso alcanzado** (si la app lo muestra): explicación simple y tranquila de qué puede hacer.

## 6. Accesibilidad mínima (referencia: WCAG 2.2 nivel AA)

- Contraste de texto normal de al menos 4.5:1; texto grande, iconos informativos y bordes de controles de al menos 3:1.
- Foco visible en todo elemento interactivo (por ejemplo `focus-visible:ring-2` en índigo con `ring-offset-2`). Nunca `outline-none` sin reemplazo.
- Todo operable con teclado, en orden lógico y sin trampas; los diálogos devuelven el foco al cerrarse.
- Semántica correcta: un `h1` por vista, títulos sin saltos de nivel, `button` para acciones, `a` para navegación, `label` asociado a cada campo, `lang="es"`.
- Estados dinámicos anunciados (`role="status"` o `aria-live`; `role="alert"` para errores).
- El color nunca es el único portador de significado.
- Movimiento reducido respetado; la página usable con zoom al 200 %.
- Imágenes informativas con `alt`; decorativas con `alt=""`.

## 7. Modo oscuro

Solo si ya existe: revisa `darkMode` en la configuración de Tailwind y el uso de `dark:` en el código. Si existe, cada cambio incluye variantes oscuras con el mismo mecanismo. Si no existe, no lo añadas ni lo propongas salvo que el usuario lo pida.

## 8. Anti-patrones

- Tarjetas dentro de tarjetas, o todo el contenido en cajas.
- Varios botones índigo rellenos en la misma vista.
- Chips, badges y etiquetas de colores sin función.
- Encabezados con «IA», destellos o lenguaje de marketing.
- Texto gris claro sobre fondo blanco.
- Modales para confirmar acciones triviales.
- Esquemas distintos de botones, títulos o espaciado entre pantallas.
- Ocultar funciones existentes para «limpiar» la interfaz.

## 9. Decisiones aprobadas

Esta sección la mantiene el usuario; la skill no edita su propia carpeta y solo propone entradas. Sirve para mantener coherencia entre pantallas y mejoras futuras. Revísala antes de proponer.

Formato: `- AAAA-MM-DD · Decisión · Motivo · Dónde aplica`

(Aún sin decisiones registradas.)
