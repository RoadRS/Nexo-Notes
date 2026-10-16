# Checklist de revisión UX de Nexo Notes

Úsala como guía interna. En modo A recorre las secciones 1–8 y reporta **solo lo que falla**, priorizado. En modo C aplica la sección 9 al terminar. No pegues esta lista completa en la respuesta.

## Severidad

- **Alta:** bloquea o confunde la tarea principal, o falla la accesibilidad básica (sin teclado, contraste insuficiente, sin foco visible).
- **Media:** genera esfuerzo, duda o inconsistencia, pero la tarea se puede completar.
- **Baja:** pulido: alineación, microcopy menor, detalles.

Cada hallazgo indica dónde (pantalla o componente), qué ocurre, por qué importa al estudiante y la base del análisis (código, captura o ejecución).

## 1. Tarea y flujo

- [ ] En pocos segundos se entiende para qué sirve la pantalla y cuál es la acción principal.
- [ ] El camino a la tarea principal tiene los pasos mínimos; ninguno existe solo por cómo está construida la app.
- [ ] Hay una única acción principal por vista, distinta de las secundarias.
- [ ] Las acciones que pueden perder trabajo se pueden cancelar o deshacer.
- [ ] Si la app guarda apuntes o análisis previos, el estudiante puede retomar donde lo dejó sin buscar.

## 2. Jerarquía y contenido

- [ ] El contenido académico es lo más prominente; controles y metadatos quedan en segundo plano.
- [ ] Hay 3–4 niveles tipográficos claros y el orden de lectura coincide con el orden de importancia.
- [ ] Lo relacionado está agrupado por proximidad; las secciones se separan con espacio antes que con cajas.
- [ ] Líneas de lectura de 60–75 caracteres aproximadamente.
- [ ] Sin ruido: tarjetas anidadas, badges sin función, sombras, color de acento en exceso, decoración que compite con el contenido.
- [ ] Lo que viene de los apuntes del estudiante se distingue de lo que generó el análisis.

## 3. Navegación y orientación

- [ ] La ubicación actual es evidente y se puede volver atrás sin perder lo hecho.
- [ ] Las etiquetas de navegación describen tareas del estudiante, no tecnología.
- [ ] Mismo patrón para lo mismo en todas las pantallas (botones, títulos, listas, espaciado).
- [ ] Ninguna función existente quedó más difícil de encontrar.

## 4. Lenguaje

- [ ] Español natural, tuteo, frases cortas (ver `nexo-ui-language.md`).
- [ ] Botones con verbo + objeto; un término por concepto en toda la app.
- [ ] Sin jerga de IA ni reclamos de marketing.
- [ ] Ninguna afirmación sobre privacidad, precisión o cifras sin verificar.

## 5. Estados

- [ ] Vacío, cargando, error, éxito, parcial y sin resultados están resueltos donde aplican.
- [ ] Los errores dicen qué pasó y qué hacer, sin códigos crudos ni culpar.
- [ ] Los límites de uso, si existen, se explican con calma y claridad.

## 6. Importación y formularios

- [ ] Los formatos y límites aceptados se ven antes de subir (si existen).
- [ ] Hay estado visible mientras se lee o analiza el documento.
- [ ] Si falla la lectura de un documento, el estudiante puede reintentar sin perder lo que ya había hecho.
- [ ] Cada campo tiene `label` visible; la ayuda está cerca y los errores aparecen junto al campo.

## 7. Responsive

- [ ] Revisado a 320–375 px, 768 px y 1280 px o más (en código: clases responsive coherentes; en ejecución: ancho real).
- [ ] La página no hace scroll horizontal; tablas y comparaciones se apilan o hacen scroll dentro de su contenedor.
- [ ] Objetivos táctiles de al menos 44×44 px; campos con fuente de al menos 16 px.
- [ ] Mismas funciones que en escritorio.
- [ ] Con zoom al 200 % el contenido sigue siendo usable.

## 8. Accesibilidad

- [ ] Contraste: texto normal 4.5:1 o más; texto grande e iconos informativos 3:1 o más.
- [ ] Foco visible en todo lo interactivo; nada queda sin `outline` visible de reemplazo.
- [ ] Todo se puede hacer con teclado, en orden lógico y sin trampas.
- [ ] Semántica: un `h1`, títulos sin saltos, `button`/`a` correctos, `label` asociados, `lang="es"`.
- [ ] Estados dinámicos anunciados con `role="status"`, `aria-live` o `role="alert"`.
- [ ] El color no es el único portador de significado.
- [ ] `motion-reduce` respetado.
- [ ] Imágenes informativas con `alt`; decorativas con `alt=""`.
- [ ] Modo oscuro coherente, solo si ya existe.

## 9. Verificación posterior a implementación (modo C)

1. **Alcance:** `git diff --stat`. Confirma que solo aparecen archivos del plan y ninguno de la zona protegida (ver `SKILL.md`). Si no hay git, contrasta con tu lista de archivos editados y repórtalo así.
2. **Contenido del diff:** revisa `git diff` y comprueba que no cambiaron hooks, estado, efectos, handlers, props, tipos ni importaciones de datos. Solo marcado, clases y textos autorizados.
3. **Textos:** busca (grep) cada cadena cambiada y confirma que no es clave, valor guardado, comparación ni parte de un test.
4. **Scripts reales:** lee `package.json` y ejecuta los scripts de tipos, lint, tests y build que existan. Anota cada comando y su resultado. No inventes scripts. Si algo falla, distingue si es causado por el cambio; compara con el estado previo solo si puedes hacerlo sin perder cambios; si no, repórtalo tal cual.
5. **Visual:** si no puedes abrir la app, escribe «no verificado visualmente» y da al usuario 3–5 flujos para revisar a mano, solo de funciones que existan. Por ejemplo: importar un documento, ver su análisis, consultar el glosario, recargar y comprobar que lo guardado sigue ahí, y ver la pantalla en ancho móvil.
6. **Informe:** completa el formato del modo C con lo que realmente ocurrió. Lo no probado va en «No verificado»; nunca lo declares como funcionando.
