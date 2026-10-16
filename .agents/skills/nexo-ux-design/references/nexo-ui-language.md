# Lenguaje de interfaz de Nexo Notes

Cubre los textos visibles de la interfaz: botones, etiquetas, títulos, ayudas, estados vacíos, errores, confirmaciones y `aria-label`. No cubre el contenido que genera el análisis.

## 1. Voz

- Tuteo («tus apuntes», «puedes»). Sin voseo ni regionalismos marcados.
- Cercano y académico: claro como un buen compañero de estudio, sin infantilizar ni sonar pomposo.
- Frases cortas, un verbo concreto al inicio de las acciones, una idea por frase.
- Sin emojis, sin exclamaciones salvo énfasis excepcional, sin humor forzado ni «¡Ups!».
- Lenguaje inclusivo sin símbolos (@, x, e): usa términos neutros como «estudiantes» o «quien estudia».
- Sin jerga de IA en la interfaz: evita «modelo», «prompt», «token», «LLM», «algoritmo» y «inteligencia artificial» como reclamo. Si la transparencia lo pide, describe por función: «generado a partir de tus apuntes».

## 2. Consistencia terminológica

Una palabra por concepto en toda la app. Antes de proponer o cambiar términos, busca en el código cómo los llama la app hoy. **Si la app ya usa un término claro y consistente, gana el de la app.** No renombres funciones existentes salvo que la etiqueta actual cause confusión demostrable; si renombras, hazlo en toda la app y propónlo antes.

Tabla de partida:

| Concepto | Preferido | Evitar |
|---|---|---|
| Material que sube el estudiante | apuntes | «inputs», «corpus», «datos» |
| Resultado del análisis | análisis | «output», «generación», «respuesta de la IA» |
| Idea psicológica | concepto | «entidad», «nodo», «tag» |
| Vínculo entre conceptos | relación | «link», «edge» |
| Lo que distingue dos conceptos | diferencia | «delta» |

## 3. Patrones por componente

- **Botones:** verbo + objeto, específico («Importar apuntes», «Guardar concepto»). Evita «Aceptar», «Enviar», «OK» y «Procesar». Una acción principal por vista.
- **Títulos:** nombran el contenido o la tarea, no la tecnología.
- **Ayudas:** solo lo que el estudiante necesita en ese momento, junto al campo. Nada de manuales.
- **Estados vacíos:** tres partes: qué es esto, cómo empezar, una acción.
- **Carga:** di qué ocurre en lenguaje del estudiante («Leyendo tus apuntes…»). No inventes porcentajes ni tiempos.
- **Errores:** qué pasó + qué puede hacer. Sin culpar («No pudimos leer este archivo», no «Archivo inválido»). Sin códigos ni trazas en la vista principal; el detalle técnico, si hace falta, en un «Ver detalles» opcional. Di que su trabajo está a salvo solo si es cierto.
- **Éxito:** breve y no bloqueante.
- **Confirmaciones destructivas:** nombra qué se elimina; el botón repite la acción («Eliminar apuntes») y cancelar es la opción por defecto. Nada de «¿Estás seguro?» genérico.
- **Límites de uso o cuota:** explica el límite en términos simples y qué puede hacer el estudiante. Sin dramatizar. Menciona cuándo se restablece solo si la app lo sabe.
- **Accesibilidad:** los `aria-label` usan el mismo vocabulario que el texto visible; los enlaces son descriptivos (nunca «haz clic aquí»).

## 4. Ejemplos (ilustrativos)

Adáptalos a lo que la pantalla realmente hace; no implican que esas funciones existan.

| Antes | Después |
|---|---|
| «Procesar con IA» | «Analizar apuntes» |
| «Error: parse failed (500)» | «No pudimos leer este PDF. Prueba con otro archivo.» |
| «No data» | «Aún no hay conceptos. Importa tus apuntes para empezar.» |
| «¿Estás seguro?» · Sí / No | «¿Eliminar estos apuntes?» · Eliminar apuntes / Cancelar |
| «✨ Potenciado por IA» | (quitar el reclamo) |

## 5. Contenido académico

- Respeta los términos técnicos, nombres de autores y teorías tal como aparecen en los apuntes o el glosario. No los «simplifiques» si eso cambia el sentido.
- Distingue en la interfaz lo que viene de los apuntes del estudiante de lo que genera el análisis (etiqueta funcional discreta, una vez por bloque).
- No presentes el análisis como verdad definitiva; invita a contrastarlo con los apuntes cuando aporte valor, sin avisos repetidos en cada pantalla.
- Si una fuente o referencia no existe en los datos, no la muestres ni la insinúes.

## 6. Afirmaciones que no puedes escribir sin verificarlas en el código o con el usuario

- **Privacidad y almacenamiento** («tus datos nunca salen de tu dispositivo», «no guardamos nada»). La app usa almacenamiento local, pero el análisis puede enviar contenido a un servicio externo: verifícalo antes de prometer nada.
- **Precisión o fiabilidad** («100 % preciso», «sin errores»).
- **Cifras**: estadísticas, número de usuarios, universidades, testimonios.
- **Disponibilidad o límites exactos**, o que será gratis para siempre.
- **Capacidades** que la app no tiene.

## 7. Cadenas de texto en el código

- Cambia solo el texto visible; antes, busca (grep) que no sea clave, valor guardado, comparación o parte de un test.
- Mantén los identificadores y nombres de variables en el idioma que ya usa el código.
- Si el proyecto ya tiene un archivo de textos o de i18n, úsalo. Si no, no introduzcas uno.
