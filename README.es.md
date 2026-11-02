[English](README.md) | **Español**

![Gumball Chat: tu chat, una bolita a la vez](assets/covers/github-social-1280x640-es.png)

# Gumball Chat

**Tu chat de Twitch, una bolita a la vez.**

En los directos grandes siempre pasa lo mismo: el mejor mensaje del chat se pierde en dos segundos entre emotes y spam. Puede ser la pista que salva la partida, el reto que todos quieren ver o la predicción que se cumple.

**Gumball Chat atrapa esos mensajes y los convierte en un momento del directo.** Lee tu chat de Twitch en vivo y la IA conserva solo los mensajes útiles: pistas, retos, ánimos, predicciones y spoilers. Los traduce a tu idioma y deja caer cada uno en una máquina de bolitas de vidrio dentro de tu overlay. Cuando llega el momento, giras la manivela: la bolita sube por el tubo, se abre y muestra en pantalla el mensaje de ese espectador, con su nombre.

- **Los espectadores** tienen un motivo real para escribir algo bueno y la oportunidad de salir en el directo.
- **El streamer** mantiene el control: nada aparece en el stream hasta que tú decides.
- **Los spoilers** quedan sellados dentro de la máquina hasta la revelación final.

![Un mensaje de ánimo saliendo de la máquina en el directo](docs/media/overlay-reveal.jpg)

## Mira el pitch

[![Gumball Chat, pitch de 2 minutos (en inglés)](assets/covers/youtube-thumbnail-1280x720-en.png)](https://www.youtube.com/)

> Sustituye el enlace de arriba por la URL pública de YouTube del video de demo (en inglés). El guion está en [assets/video/SCRIPT.md](assets/video/SCRIPT.md).

| Enlaces | |
| --- | --- |
| Devpost | _añade el enlace del proyecto_ |
| Demo en vivo | <https://gumballchat.onrender.com> (ver [Pruébalo en vivo](#pruébalo-en-vivo)) |
| Panel del streamer (local) | <http://localhost:3000/> |
| Overlay de OBS (transparente) | <http://localhost:3000/overlay> |
| Instrucciones para el chat (transparente) | <http://localhost:3000/instructivos> |
| Recursos de marca | [assets/](assets/) |

## Qué lo hace diferente

| | |
| --- | --- |
| **Una máquina, no una lista** | Bolitas con física (Matter.js) que caen por un tubo de vidrio, se amontonan por color y salen disparadas en cada revelación. El chat se convierte en algo que se mira, no en algo que pasa de largo. |
| **IA que filtra antes de mostrar** | Gemini clasifica, traduce y revisa la seguridad de cada mensaje. El acoso, el spam y los intentos de prompt injection nunca llegan a la máquina. |
| **Hecho para el directo** | Si Gemini tarda, el clasificador local responde al instante. Si Twitch se corta, la conexión vuelve sola. La máquina nunca se congela en pleno directo. |
| **Chat global, un idioma** | Los mensajes en japonés, portugués, francés o inglés llegan traducidos al idioma del streamer, con el original a un clic. |
| **Prueba sin configurar nada** | Cualquiera puede escribir el nombre de su canal en el panel y ver su chat entrando en la máquina, sin tokens ni registrar ninguna app. |

## Míralo en acción

**1. El chat entra en la máquina.** Los mensajes nuevos caen por el tubo hasta la esfera, con un color por categoría.

![Bolitas cayendo en la máquina por el tubo de vidrio](docs/media/overlay-fill.jpg)

**2. Giras la manivela.** La bolita elegida sube disparada por el tubo y se abre en una tarjeta diseñada para su categoría.

![Tarjeta de reto en el overlay](docs/media/overlay-challenge.jpg)

**3. El panel es tu sala de control.** Conecta cualquier canal, mira el contador de mensajes en vivo, filtra por categoría y saca o quita bolitas.

![Panel del streamer conectado a un canal de Twitch](docs/media/panel.jpg)

**4. Cada mensaje se puede rastrear.** La consola en vivo sigue cada mensaje por todas sus etapas. En la imagen, un intento de prompt injection: se recibe, Gemini lo traduce y el filtro de seguridad lo bloquea.

![Consola de actividad siguiendo un mensaje](docs/media/console.jpg)

## Pruébalo en vivo

Hay una demo publicada en Render: **<https://gumballchat.onrender.com>**

| Página | URL | Acceso |
| --- | --- | --- |
| Panel del streamer | <https://gumballchat.onrender.com/> | Usuario `judge` · Contraseña `gumball-demo-2026` |
| Overlay de OBS | <https://gumballchat.onrender.com/overlay> | Libre (público, solo lectura) |
| Instrucciones para el chat | <https://gumballchat.onrender.com/instructivos> | Libre (público, solo lectura) |

1. Abre el overlay en una pestaña y el panel en otra, e inicia sesión en el panel.
2. Pulsa **50 bolitas** y luego **Sacar una bolita** para ver una revelación.
3. Para probar con chat real, escribe **tu propio** canal de Twitch en la barra de conexión, pulsa **Conectar** y escribe `&pista algo útil` en tu chat.

> La demo usa el plan gratuito de Render: tras 15 minutos sin visitas se duerme y la primera carga puede tardar unos 50 segundos. Estas credenciales de demostración son para la evaluación y se cambiarán después.

## Inicio rápido (2 minutos, sin credenciales)

Necesitas [Node.js](https://nodejs.org/) 24 o posterior.

```powershell
git clone https://github.com/JkalasG/GumballChat.git
cd GumballChat
npm.cmd install
npm.cmd start
```

En macOS o Linux usa `npm install` y `npm start`.

1. Abre el panel en <http://localhost:3000/>.
2. **Prueba el simulador:** pulsa **50 bolitas**, abre <http://localhost:3000/overlay> en otra pestaña y pulsa **Sacar una bolita** en el panel.
3. **Prueba con tu propio chat de Twitch:** escribe el nombre de tu canal en la barra de conexión de arriba (`tu_canal`, `@tu_canal` o el enlace `twitch.tv/tu_canal`) y pulsa **Conectar**. Escribe en tu chat, por ejemplo `&pista revisa detrás de la cascada`. No hace falta estar en directo.

Sin `GEMINI_API_KEY`, el clasificador local conserva los mensajes con etiqueta y bloquea los inseguros. Añade una clave para tener clasificación y traducción automáticas (ver [Configuración](#configuración)).

## Cómo usarlo en tu directo

### Antes de salir en vivo

1. Copia `.env.example` a `.env` y pon `CHAT_MODE=anonymous` y `TWITCH_CHANNEL_LOGIN=tu_canal`. El servidor se conectará a tu chat cada vez que arranque.
2. Opcional: añade una clave gratuita de [Google AI Studio](https://aistudio.google.com/) en `GEMINI_API_KEY`.
3. Ejecuta `npm.cmd start` y deja la terminal abierta mientras transmites.
4. En OBS, añade el overlay (ver [Configuración de OBS](#configuración-de-obs)).
5. En el panel, escribe el **Juego actual**: la IA lo usa para distinguir una pista de un spoiler.

### Durante el directo

- La barra de arriba se pone **verde**, con un contador de mensajes en vivo, cuando Twitch está conectado. Se pone **ámbar** mientras reconecta y **roja**, con el motivo exacto, si algo falla.
- La vista **Bolitas** lista cada mensaje aceptado con su categoría, autor e idioma original. Filtra con los botones de categoría y pulsa **Sacar una bolita** para una al azar, o **Sacar** en un mensaje concreto.
- **Quitar** saca un mensaje de la máquina. **Ver original** alterna entre la traducción y el texto original.
- **Actividad en vivo** muestra el recorrido completo de cada mensaje. Escribe `#gum-12`, `@usuario`, `nivel:warn` o `ayuda` en su línea de comandos para filtrar.

### Al terminar

Pulsa **Revelación final** para abrir todos los spoilers sellados a la vez.

### Para tus espectadores

Añade la página de instrucciones como segunda fuente de OBS, o sube los paneles de Twitch que ya están listos en [assets/twitch-panels/](assets/twitch-panels/). Las etiquetas son opcionales: sin ninguna, la IA elige la categoría.

![Overlay de instrucciones para el chat](docs/media/instructions.jpg)

| Español | Inglés | Categoría |
| --- | --- | --- |
| `&pista` | `&hint` | Pista · amarillo |
| `&reto` | `&challenge` | Reto · naranja |
| `&animo` | `&cheer` | Ánimo · rosa |
| `&prediccion` | `&prediction` | Predicción · morado |
| `&spoiler` | `&spoiler` | Spoiler · oscuro, sellado |

Una etiqueta sugiere la categoría; nunca se salta la IA ni los filtros de seguridad.

## Configuración de OBS

1. Añade una **Fuente de navegador** de **1920×1080** con la URL <http://localhost:3000/overlay>. El fondo es transparente.
2. Haz clic derecho en la fuente → **Transformar → Restablecer transformación**, para que nunca quede estirada ni borrosa.
3. Parámetros opcionales en la URL: `?pos=left|right` (lado de la máquina), `?scale=0.45`–`1.15` (tamaño de la máquina) y `?lang=en|es`. Ejemplo: `http://localhost:3000/overlay?pos=left&scale=0.8`.
4. Opcional: añade <http://localhost:3000/instructivos> como segunda fuente de navegador.

## Configuración

La página **Configuración** del panel controla todo lo que se ve en el directo, y los cambios se aplican al momento sin recargar OBS. Puedes ajustar:

- el idioma de la interfaz y el de traducción;
- el lado y la escala de la máquina;
- el texto de la tarjeta (traducción, original o ambos), y si muestra autor, idioma, sello e insignia;
- la posición, el tamaño, la animación, la duración y el límite de caracteres;
- qué categorías salen, con tus propios nombres y sellos.

![Página de configuración](docs/media/settings.jpg)

| Variable de `.env` | Para qué sirve |
| --- | --- |
| `CHAT_MODE` | `simulator` (predeterminado), `anonymous` (chat de Twitch de solo lectura, sin token) o `eventsub`. |
| `TWITCH_CHANNEL_LOGIN` | Canal predeterminado; se conecta al arrancar en `anonymous` y `eventsub`. |
| `TWITCH_AUTOCONNECT` | `true` (predeterminado) conecta al arrancar; con `false` espera a que pulses Conectar. |
| `TWITCH_CLIENT_ID`, `TWITCH_OAUTH_TOKEN`, `TWITCH_BOT_LOGIN` | Credenciales de EventSub (privadas). |
| `GEMINI_API_KEY` | Clave opcional de Google AI Studio. Nunca sale del servidor. |
| `GEMINI_MODEL` | Predeterminado `gemini-3-flash-preview` (unos 4–6 s por lote de 8 mensajes en nuestras pruebas). |
| `GEMINI_TIMEOUT_MS` | Cuánto esperar a Gemini antes de que responda el clasificador local (predeterminado `12000`). |
| `GEMINI_THINKING_LEVEL` | `minimal` (predeterminado), `low`, `high` o `default`. |
| `STREAMER_LANGUAGE` | Idioma al que se traducen los mensajes. |
| `UI_LANGUAGE` | Idioma inicial de la interfaz (`en` o `es`). |
| `PORT`, `HOST` | Predeterminados `3000` y `127.0.0.1` (solo este equipo). En Render, `HOST` pasa a `0.0.0.0`. |
| `PANEL_USER`, `PANEL_PASSWORD` | Inicio de sesión opcional para publicarlo en internet. Si defines `PANEL_PASSWORD`, el panel y la API exigen entrar por `/login` (`PANEL_USER` es `admin` por defecto). El overlay y la página de instrucciones siguen públicos para OBS y son de solo lectura. |

## Integración con Twitch

| Modo | Cómo lee el chat | Necesita |
| --- | --- | --- |
| `simulator` | Mensajes de ejemplo locales. Desde el panel se puede conectar igualmente cualquier canal público. | Nada |
| `anonymous` | IRC de Twitch por WebSocket con un usuario anónimo de solo lectura. | Nada |
| `eventsub` | Se suscribe a `channel.chat.message` por EventSub WebSocket para `TWITCH_CHANNEL_LOGIN`. Otros canales escritos en el panel usan el lector de solo lectura. | Client ID y un token de usuario con `user:read:chat` y `user:bot` |

Para usar EventSub:

1. Registra una app en la [consola de desarrolladores de Twitch](https://dev.twitch.tv/console/apps).
2. Genera un token con [Twitch CLI](https://dev.twitch.tv/docs/cli/): `twitch token -u -s "user:read:chat user:bot"`.
3. Completa los cuatro valores `TWITCH_*` en `.env`. `TWITCH_BOT_LOGIN` debe ser la cuenta dueña del token.

La app solo lee el chat; nunca publica en él. Los emotes del canal se eliminan usando las posiciones que Twitch envía con cada mensaje, así el spam de solo emotes nunca gasta una llamada a la IA.

## Cómo funciona

```text
Chat de Twitch ──► gestor de conexión ──► filtros rápidos ──► Gemini / clasificador local ──► máquina (WebSocket)
 IRC o EventSub     autoconexión, reintento  emotes, ruido,     categoría, traducción,          el streamer saca ──► tarjeta
                                             duplicados         seguridad, conservar/descartar
```

- **Servidor:** Node.js HTTP + WebSocket ([server/index.js](server/index.js)), con los adaptadores de chat en [server/chat/](server/chat/) y el clasificador en [server/ai/](server/ai/).
- **Lotes:** los mensajes se agrupan en lotes de hasta 10 por llamada a Gemini, con dos llamadas en paralelo. Si Gemini falla dos veces seguidas, un cortacircuitos lo pausa 60 s y el clasificador local se encarga de todo.
- **Overlay:** canvas con física Matter.js, sin CDN, así que funciona sin internet en OBS ([public/overlay/](public/overlay/)).
- **Panel:** HTML/CSS/JS sin frameworks, con diccionarios en inglés y español ([public/panel/](public/panel/), [public/shared/i18n.js](public/shared/i18n.js)).

## Solución de problemas

| Problema | Solución |
| --- | --- |
| La barra dice _No se pudo conectar: Twitch no respondió para ese canal_ | Revisa el usuario; puede que no exista o esté suspendido. |
| Llegan mensajes pero no entra nada en la máquina | Sin Gemini solo se conservan los mensajes con etiqueta. Añade una etiqueta (`&pista …`) o configura `GEMINI_API_KEY`. |
| El panel muestra _Clasificador local activo_ | Gemini tardó o falló y la máquina siguió funcionando con el clasificador local. Reintenta solo. |
| El overlay se ve borroso en OBS | Usa una fuente de navegador de 1920×1080 y **Restablecer transformación**. Cambia el tamaño de la máquina con `?scale=` en lugar de estirarla. |
| `EADDRINUSE` al arrancar | Otro programa usa el puerto 3000. Pon `PORT=3001` en `.env`. |
| EventSub dice _token no válido_ | Los tokens de usuario caducan en pocas horas. Genera uno nuevo y reinicia. |

## Pruebas

```powershell
npm.cmd run smoke                          # rutas, filtros, contrato Gemini (simulado), WebSocket, paridad i18n
node scripts/test-anonymous-irc.js CANAL   # prueba en vivo del lector de Twitch de solo lectura
```

## Cómo usamos Codex

Codex se usó para construir el núcleo del proyecto:

- el servidor Node y el flujo por WebSocket;
- el simulador local;
- los adaptadores de Twitch para EventSub e IRC;
- la clasificación con Gemini, los lotes y los filtros de seguridad;
- la máquina con Matter.js;
- el panel del streamer, las instrucciones para el chat, la configuración y el i18n.

Parte del rediseño visual posterior, el gestor de conexión con Twitch y los recursos de marca se hicieron con Claude Code. El ID de sesión de Codex está incluido en la entrega de Devpost.

## Estructura del proyecto

```text
.
├── assets/               # Logos, portadas, paneles de Twitch (SVG + PNG) y guion del video
├── docs/                 # Notas de diseño, plan e imágenes del README
├── public/
│   ├── brand/            # Logo y favicon para la web
│   ├── shared/           # Diccionarios i18n y tema
│   ├── panel/            # Panel, configuración, barra de Twitch, consola de actividad
│   ├── overlay/          # Máquina animada de OBS y tarjetas por categoría
│   ├── instructivos/     # Guía para el chat
│   └── vendor/           # Matter.js y fuentes (servidos localmente)
├── scripts/              # Smoke check y prueba de IRC
├── server/
│   ├── ai/               # Clasificador Gemini y respaldo local
│   ├── chat/             # Adaptadores EventSub, IRC y simulador
│   ├── index.js          # HTTP, WebSocket y gestor de conexión con Twitch
│   └── state.js          # Estado de mensajes en memoria
└── .env.example
```

## Privacidad y seguridad

- Los secretos solo están en `.env`, que git ignora; el panel y el overlay nunca reciben la clave de Gemini ni el token de Twitch.
- El servidor escucha en `127.0.0.1` por defecto. Si lo publicas en internet, define `PANEL_USER` y `PANEL_PASSWORD`: el panel y la API exigirán iniciar sesión (la sesión dura 12 h y los intentos fallidos repetidos se bloquean 10 minutos), y el overlay seguirá público y de solo lectura.
- El texto del chat se trata como dato no confiable: el prompt de la IA ignora las instrucciones que vengan dentro de los mensajes, y los filtros locales de seguridad se aplican antes de que algo llegue a la máquina.

## Créditos y licencia

- [Matter.js](https://brm.io/matter-js/): licencia MIT.
- Bagel Fat One y Bricolage Grotesque: SIL Open Font License (ver `public/vendor/fonts`).
- Gumball Chat: licencia MIT, ver [LICENSE](LICENSE).
