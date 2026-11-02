[English](README.md) | **Español**

# Gumball Chat

Gumball Chat convierte mensajes útiles del chat de Twitch en bolitas de colores que el streamer abre en vivo durante la transmisión.

## Vista previa y enlaces

- Captura del overlay: pendiente de una captura verificada en `docs/media/overlay.png`.
- Video de demostración (YouTube): pendiente de publicación.
- Devpost: pendiente de publicación.
- Panel: <http://localhost:3000/>
- Overlay de OBS: <http://localhost:3000/overlay>
- Instructivos para el chat: <http://localhost:3000/instructivos>
- Diseño: [docs/DISENO.md](docs/DISENO.md)
- Plan e integración con Twitch: [docs/PLAN.md](docs/PLAN.md)

## Funciones

- Los mensajes del chat se clasifican, traducen y filtran antes de entrar a la máquina.
- El streamer revisa las bolitas por color y elige cuándo sacar una; el overlay anima el mensaje seleccionado y muestra una tarjeta pública.
- Los spoilers permanecen sellados hasta la revelación final.
- Las etiquetas opcionales incluyen `&pista` / `&hint`, `&reto` / `&challenge`, `&animo` / `&cheer`, `&prediccion` / `&prediction` y `&spoiler`. Sin etiqueta, la clasificación es automática.
- La IA y los filtros locales siguen revisando mensajes etiquetados y sin etiqueta para detectar spam, contenido inseguro e intentos de inyección de instrucciones.
- Interfaz en español e inglés, traducción de mensajes, controles del overlay de OBS y tarjetas públicas configurables.
- El panel agrupa mensajes repetidos por frecuencia y autores. El simulador incluye un botón para llenar la máquina con 50 bolitas y revisar el diseño.

## Conexión con Twitch

El modo predeterminado `simulator` funciona sin credenciales. `eventsub` recibe `channel.chat.message` por WebSocket de Twitch EventSub y valida que el token del bot tenga los scopes `user:read:chat` y `user:bot`. El modo experimental `anonymous` intenta entrar a un canal público de IRC sin OAuth y Twitch puede rechazarlo. Actualmente la aplicación no responde en el chat; no usa `user:write:chat`.

## Inicio rápido

Se requiere Node.js 24 o posterior. No hacen falta credenciales de Twitch ni Gemini para probar el simulador local.

```powershell
npm.cmd install
npm.cmd start
```

Abre <http://localhost:3000/>, pulsa **50 bolitas** y luego **Sacar una bolita**. Sin `GEMINI_API_KEY`, los mensajes seguros pasan por el clasificador local. En macOS/Linux, usa `npm install` y `npm start`.

## Conectar un canal de Twitch

1. Registra una aplicación en la [consola de desarrolladores de Twitch](https://dev.twitch.tv/console/apps).
2. Revisa la documentación de [EventSub](https://dev.twitch.tv/docs/eventsub/) y de [autenticación y scopes de Twitch](https://dev.twitch.tv/docs/authentication/).
3. Crea un `.env` local a partir de `.env.example`. Para EventSub configura `CHAT_MODE=eventsub`, `TWITCH_CLIENT_ID`, `TWITCH_OAUTH_TOKEN`, `TWITCH_CHANNEL_LOGIN` y `TWITCH_BOT_LOGIN`. Usa un token que pertenezca a la cuenta del bot y tenga `user:read:chat` y `user:bot`.
4. Reinicia el servidor y pulsa **Conectar Twitch** en el panel.

Mantén `.env` privado. El modo IRC requiere `CHAT_MODE=anonymous` y `TWITCH_CHANNEL_LOGIN`, pero es experimental. Consulta [docs/PLAN.md](docs/PLAN.md) para el contexto de este proyecto.

## Configurar OBS

Agrega una fuente de navegador a 1920×1080 y conserva la proporción; no la estires. Usa la página transparente <http://localhost:3000/overlay>. Los ajustes del panel se aplican en vivo. Las URL de escenas existentes pueden anular la configuración guardada con `?pos=left` o `?pos=right`, `?scale=0.45` a `?scale=1.15` y `?lang=en` o `?lang=es`. Se recomienda el filtro Lanczos de OBS al cambiar el tamaño. La página <http://localhost:3000/instructivos> se puede agregar como una segunda fuente transparente.

## Configuración

| Ajuste del panel | Uso |
| --- | --- |
| Idioma de interfaz | Interfaz en inglés o español; inicia en inglés. `?lang=` lo puede anular por página. |
| Idioma del streamer | Idioma de destino para traducir mensajes del chat. |
| Lado, escala y estado del overlay | Ubica y escala la máquina, y muestra u oculta la pastilla de estado. |
| Texto y presentación de tarjetas | Traducción/original/ambos, autor, idioma de origen, sello, insignia, posición, tamaño, animación, duración y límite de caracteres. |
| Controles por categoría | Habilita u oculta cada categoría y personaliza su nombre y sello (hasta 24 caracteres). |

| Variable de `.env` | Uso |
| --- | --- |
| `CHAT_MODE` | `simulator`, `anonymous` o `eventsub`. |
| `TWITCH_CLIENT_ID` | ID de aplicación Twitch para EventSub. |
| `TWITCH_OAUTH_TOKEN` | Token OAuth privado del bot para EventSub. |
| `TWITCH_CHANNEL_LOGIN` | Nombre del canal para los modos de chat. |
| `TWITCH_BOT_LOGIN` | Usuario bot asociado al token de EventSub. |
| `GEMINI_API_KEY` | Clave opcional de Google AI Studio; permanece en el servidor. |
| `GEMINI_MODEL` | Nombre del modelo Gemini. |
| `STREAMER_LANGUAGE` | Idioma inicial para traducir antes de guardar ajustes desde el panel. |
| `UI_LANGUAGE` | Idioma inicial de interfaz (`en` o `es`). |
| `PORT` | Puerto HTTP (por defecto `3000`). |
| `HOST` | Dirección de escucha (por defecto `127.0.0.1`, solo el equipo local). |

Obtén una clave de Gemini en [Google AI Studio](https://aistudio.google.com/). Los ajustes se guardan localmente en `.gumball-settings.json`, que está excluido de Git.

## Etiquetas del chat

| Etiqueta en español | Etiqueta en inglés | Categoría / color |
| --- | --- | --- |
| `&pista` | `&hint` | Pista · amarillo |
| `&reto` | `&challenge` | Reto · rojo anaranjado |
| `&animo` | `&cheer` | Ánimo · rosa |
| `&prediccion` | `&prediction` | Predicción · morado |
| `&spoiler` | `&spoiler` | Spoiler · carbón |

La etiqueta sugiere la categoría; no evita el clasificador de IA ni los filtros de seguridad. Los mensajes sin etiqueta siguen clasificándose automáticamente.

## Cómo usamos Codex

El trabajo asistido por Codex en este repositorio cubrió el flujo de la aplicación, el simulador local, los adaptadores Twitch EventSub e IRC experimental, la clasificación y filtrado de mensajes, el procesamiento por lotes, la máquina animada con Matter.js, el panel, los instructivos y los ajustes/i18n descritos aquí. El repositorio no contiene un identificador público de esta sesión de Codex; si se publica el proyecto, agrega allí una referencia compartible. No afirmamos haber usado otra herramienta de programación.

## Pruebas

Ejecuta las verificaciones locales con:

```powershell
npm.cmd run smoke
```

La prueba de conexión IRC anónima es aparte y requiere el nombre de un canal público; se conecta a Twitch:

```powershell
node scripts/test-anonymous-irc.js NOMBRE_DEL_CANAL
```

## Estructura del proyecto

```text
.
├── docs/                 # Diseño, plan y notas (principalmente en español)
├── public/
│   ├── shared/           # i18n y tema común
│   ├── panel/            # Panel del streamer y configuración
│   ├── overlay/          # Máquina animada y tarjetas OBS
│   ├── instructivos/     # Guía de participación para el chat
│   └── vendor/           # Matter.js y fuentes locales
├── scripts/              # Smoke check y prueba IRC opcional
├── server/
│   ├── ai/               # Clasificador Gemini y respaldo local
│   ├── chat/             # Adaptadores EventSub, IRC y simulador
│   ├── index.js          # Servidor HTTP y WebSocket
│   └── state.js          # Estado de mensajes en memoria
├── .env.example
├── LICENSE
└── package.json
```

## Privacidad y seguridad

Guarda las claves en `.env`; el panel y el estado WebSocket no exponen la clave Gemini ni el token Twitch. Por defecto, el servidor escucha en `127.0.0.1`. El texto del chat se considera entrada no confiable: el prompt del clasificador lo trata como datos y los filtros locales se ejecutan antes de admitir mensajes. El panel local no tiene inicio de sesión; cambiar `HOST` puede exponerlo a otras interfaces de red, así que hazlo solo si lo necesitas.

## Créditos y licencia

Matter.js se distribuye bajo licencia MIT. Los archivos de Bagel Fat One y Bricolage Grotesque en `public/vendor/fonts` conservan sus avisos OFL. Gumball Chat se publica bajo licencia MIT; consulta [LICENSE](LICENSE).