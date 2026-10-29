# Gumball Chat

## Idea principal

Gumball Chat es una herramienta para streamers de Twitch que convierte los mensajes del chat en bolitas de colores dentro de una máquina de chicles que aparece en pantalla durante la transmisión.

Los espectadores escriben en el chat como siempre, sin comandos y en el idioma que quieran. Cada mensaje es analizado para entender qué intenta decir la persona luego si el mensaje aporta algo útil (una pista, un spoiler, una predicción o un mensaje de ánimo) este se convierte en una bolita del color correspondiente y cae dentro de la máquina, a la vista de todos debe ser posible clasificar las bolitas y en el momento de leerlas incluso poder filtrar cada categoria como retos y que solo se queden en la anfora las bolitas de retos.

Cada bolita guarda el mensaje **traducido al idioma del streamer**, el **nombre de quien lo escribió** y el **idioma original** en que fue escrito para a futuro ver su audiencia que tipo de idioma utiliza mas.

El streamer decide cuándo sacar una bolita y abrirla. Al hacerlo, el mensaje aparece en pantalla para que toda la comunidad lo vea.

## Cómo funciona

1. Un espectador escribe un mensaje en el chat.
2. El sistema entiende la intención del mensaje, sin importar el idioma.
3. Si el mensaje es útil, se traduce al idioma del streamer y se convierte en una bolita del color que le corresponde.
4. La bolita cae en la máquina de chicles que se ve en el stream.
5. Cuando el streamer quiere, saca una bolita, la abre y el mensaje se muestra en pantalla con el nombre de su autor.

Los mensajes comunes (saludos, risas, emotes, spam) no generan bolitas, y los mensajes ofensivos se descartan para que nunca aparezcan en pantalla.

## Tipos de bolitas

| Bolita | Tipo de mensaje | Qué pasa con ella |
|---|---|---|
| 🟡 **Amarilla** | Pistas y consejos sobre el juego | Se guardan. El streamer saca una solo cuando se atasca y necesita ayuda. |
| ⚫ **Negra** | Spoilers | Quedan selladas durante toda la partida y se abren todas juntas al terminar el juego, en una "gran revelación". |
| 🟣 **Morada** | Predicciones ("se va a morir en este jefe") | Se abren cuando ocurre el evento, para ver quién acertó. |
| 🩷 **Rosada** | Mensajes de ánimo y cariño | Se pueden leer en cualquier momento, por ejemplo al cerrar el stream. |
| ✨ **Dorada** | Mensajes excepcionales | Bolitas especiales y más llamativas para los mejores aportes. |

## Lo que puede hacer el streamer

- Ver la máquina llenándose de bolitas durante el stream.
- Sacar una bolita al azar.
- Sacar una bolita de un color específico (por ejemplo, solo una pista).
- Previsualizar el mensaje antes de mostrarlo en pantalla.
- Descartar un mensaje si no quiere mostrarlo.
- Abrir todas las bolitas de spoilers al terminar el juego.
- Ver el mensaje original si quiere saber cómo fue escrito.

## Lo que vive el espectador

- Escribe en el chat de forma natural, sin aprender comandos.
- Ve caer su bolita en la máquina en tiempo real.
- Cuando el streamer saca su bolita, ve su mensaje en pantalla con su nombre.
- Aunque escriba en otro idioma, el streamer lo entiende.

## Problemas que resuelve

- **Backseating:** los consejos no pedidos dejan de interrumpir al streamer y se convierten en pistas que puede usar cuando quiera.
- **Spoilers:** se ocultan sin borrar mensajes ni banear a nadie, y se transforman en un momento divertido al final.
- **Barrera de idioma:** los mensajes de espectadores de otros países llegan traducidos.
- **Chat saturado:** los mensajes valiosos no se pierden entre cientos de mensajes.
- **Espectadores que no se sienten escuchados:** su aporte queda guardado y puede aparecer en pantalla con su nombre.

## Principio del proyecto

La inteligencia artificial **solo ordena** los mensajes: no habla por el streamer ni lo reemplaza. **El streamer siempre decide** qué bolita sacar, cuándo abrirla y qué mostrar a su comunidad.
