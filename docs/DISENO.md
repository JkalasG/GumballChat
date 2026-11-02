# Diseño visual — Gumball Chat

## Idea

Una máquina de dulcería de barrio, recién pulida y llena de caramelos que vienen del chat. La esfera de vidrio y el papel de la fortuna son los protagonistas; la interfaz del streamer funciona como una caja registradora clara y discreta.

## Paleta

| Uso | Color |
|---|---|
| Jade de la máquina | `#0F7C6E` |
| Jade en sombra | `#07564E` |
| Jade iluminado | `#53AA91` |
| Cromo | `#DCE7E4` |
| Papel cálido | `#FFF6D7` |
| Tinta | `#25231F` |
| Pista limón | `#FFD23F` |
| Spoiler regaliz sellado | `#1E1B24` |
| Predicción uva | `#8A5CF6` |
| Ánimo chicle | `#FF6FB5` |
| Reto mandarina | `#FF5A36` |
| Destacada dorada | `#F8B735` |

## Tipografía

- **Bagel Fat One**, local: nombre de la máquina y titulares breves con carácter de cartel pintado.
- **Bricolage Grotesque**, local: controles, mensajes, autores y texto de lectura. Su peso regular mantiene legible la interfaz en directo.

## Bocetos

```text
OVERLAY OBS (transparente; máquina anclada a una esquina)
+-------------------------------------------------------+
|                                                       |
|                                  .----------------.   |
|                                 /   vidrio curvo   \  |
|                                |   ● ● ● ● ● ●     | |
|                                |    ● ● ● ●        | |
|                                 \_________________/  |
|                                  [Gumball Chat]       |
|                               jade / manivela / rampa  |
|                                      papel abierto     |
+-------------------------------------------------------+

PANEL (papel claro; acciones a mano y cola fácil de leer)
+-------------------------------------------------------+
| Gumball Chat       Sesión y conexión                  |
| Bolitas: todas | pista | spoiler | predicción | ...  |
| @autor  texto traducido                 Ver original  |
| [máquina de mensajes]       [Sacar una bolita]        |
| idiomas de esta sesión       [Revelación final]       |
+-------------------------------------------------------+
```

## Principios

- La máquina debe leerse como una esfera real sobre una pieza de metal fundido, no como un panel con una ilustración dentro.
- El jade y el cromo forman una silueta reconocible; el color de cada caramelo comunica su categoría sin depender solo del texto.
- La revelación tiene una secuencia corta y legible: giro, salida, apertura y papel. El papel permanece el tiempo suficiente para leerlo.
- El overlay deja el centro del juego despejado y no pinta un fondo opaco sobre OBS.
- El movimiento ocurre al llegar, filtrar o abrir mensajes. En reposo la máquina queda quieta; se respeta la preferencia de movimiento reducido.
- El panel prioriza la cola, el filtro y la acción. Usa frases directas, contraste alto, estados que indican cómo continuar y foco de teclado visible.

## Dirección de luz, capas y movimiento

- La luz principal llega desde arriba a la izquierda, aproximadamente a 45 grados. Los brillos del vidrio y de las bolitas siguen esa dirección; el sombreado inferior y la luz cálida rebotada mantienen el volumen.
- Orden de dibujo: sombra del suelo y cuerpo trasero; tinte interior del vidrio; bolitas ordenadas del fondo al frente; reflejos y borde delantero del vidrio; aro cromado y boca de entrada. La transparencia de OBS se conserva fuera de la máquina.
- Las bolitas varían sutilmente en tamaño y profundidad. Las del fondo tienen menos contraste; sus marcas superficiales rotan con la física para que el giro se perciba.
- La física avanza con pasos fijos de 1/60 s y acumulador. Las llegadas despiertan el conjunto para que las bolitas asentadas reaccionen.

### Secuencia de llenado

1. La carga inicial (al abrir el overlay) coloca las bolitas pendientes directamente dentro de la esfera, sin animación.
2. Cada mensaje nuevo del chat y el botón «50 bolitas» usan la cola de entrada: las bolitas aparecen sobre el embudo del tubo, que sobresale por encima de la tapa, con 110 ms de separación.
3. Cada una cae por el embudo y baja por todo el tubo durante 820 ms; sale por la boca inferior, a media esfera, y se incorpora a la física.
4. Si comienza una extracción, la cola de llenado se congela hasta que termina la secuencia de aperturas.

### Secuencia de revelación

1. Anticipación de manivela: 150 ms.
2. Giro de manivela: 600 ms; pulsos de aire levantan y dispersan las bolitas con turbulencia lateral controlada.
3. Destello de selección: 200 ms.
4. Selección y descenso desde la posición real hasta la boca inferior del tubo, a media altura de la esfera: 520 ms.
5. La misma bolita asciende por todo el tubo, atraviesa la tapa y llega al embudo: 950 ms, acelerando; sale disparada en arco hacia el centro de la pantalla: 460 ms; se abre: 420 ms.
6. La tarjeta del mensaje aparece con rebote y queda visible 7,2 s.

### Tarjetas por categoría

Cada categoría tiene su tarjeta: cabecera a rayas de su color, una bolita-insignia con icono, papel teñido y un sello. Pista (limón, bombilla, «¡Ayuda del chat!»), Predicción (uva, bola de cristal, «¿Acertará?»), Ánimo (chicle, corazón, «Con cariño»), Reto (mandarina, rayo, «¿Aceptas?») y Spoiler (regaliz oscuro, candado abierto, «Revelado»). Las destacadas añaden borde y etiqueta dorados. El idioma se muestra por su nombre porque Windows no dibuja banderas emoji.

Mientras se revela una bolita, la cola de entradas queda congelada en su posición y continúa al terminar toda la cola de aperturas. Si se abre una bolita que aún estaba entrando, se incorpora al interior antes de iniciar la extracción.

La secuencia se sincroniza con `requestAnimationFrame`. El giro usa suavizado de entrada y salida, y el recorrido una salida cúbica. Con movimiento reducido, las fases se acortan y el mensaje aparece con una transición mínima.

### Clasificación y configuración de idioma

- Las etiquetas `&pista`, `&reto`, `&animo`, `&prediccion` y `&spoiler` son opcionales. Sin una etiqueta, Gemini o el clasificador local determina la categoría automáticamente.
- La etiqueta orienta la categoría, pero no omite el análisis de seguridad, spam, utilidad ni la decisión de conservar el mensaje.
- El idioma del streamer se selecciona desde el panel y se guarda en `.gumball-settings.json`; `STREAMER_LANGUAGE` define el idioma inicial.
- Las entradas del simulador usan etiquetas para que las muestras válidas también tengan categoría en el clasificador local; las muestras de ruido, abuso e inyección siguen sirviendo para comprobar el filtrado.
- Las ráfagas se agrupan en ciclos de hasta 40 mensajes; Gemini procesa como máximo dos lotes de 10 a la vez. La cola espera hasta 500 mensajes y reporta saturación.
