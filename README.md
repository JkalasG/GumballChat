# Gumball Chat

Gumball Chat convierte mensajes útiles de Twitch en bolitas de colores. El streamer revisa el inventario y decide qué abrir en el overlay de OBS. La demo funciona con simulador; para chat real están disponibles IRC anónimo experimental y Twitch EventSub autenticado.

## Requisitos

- Windows 11 (PowerShell o terminal integrada de VS Code)
- Node.js 24 o posterior
- Matter.js 0.20.0 incluido localmente; se requiere internet para las fuentes web y los servicios externos configurados

## Ejecutar

Desde la raíz del proyecto:

```powershell
npm.cmd install
npm.cmd start
```

Abre el panel en <http://localhost:3000/>. Abre <http://localhost:3000/overlay> como vista previa o como OBS Browser Source (1920 × 1080, fondo transparente). La máquina queda anclada a la derecha por defecto; usa `?pos=left&scale=0.8` para ponerla a la izquierda. `scale` admite valores entre 0.45 y 1.15. Las fuentes y Matter.js se sirven desde `public/vendor/`, así el overlay no necesita CDN. Para detener el servidor, vuelve a la terminal y pulsa `Ctrl+C`.

## Elegir y probar la fuente de chat

Configura `CHAT_MODE` en `.env`: `simulator`, `anonymous` o `eventsub`. El modo predeterminado es `simulator` hasta confirmar IRC anónimo desde tu red. Para probar con un canal público **en vivo**, ejecuta:

```powershell
node scripts/test-anonymous-irc.js NOMBRE_DEL_CANAL
```

El script usa `justinfan` sin token, responde PING y escucha durante 30 segundos. Al final indica claramente si Twitch confirmó la unión al canal y muestra los mensajes recibidos. Si funciona, configura `CHAT_MODE=anonymous` y `TWITCH_CHANNEL_LOGIN=NOMBRE_DEL_CANAL` en `.env`, reinicia con `npm.cmd start` y pulsa **Conectar Twitch** en el panel.

IRC anónimo es experimental: Twitch documenta actualmente IRC autenticado con OAuth y el scope `chat:read`. Si Twitch rechaza el acceso, usa `CHAT_MODE=eventsub` y las credenciales descritas en [docs/PLAN.md](docs/PLAN.md). El simulador sigue disponible como fuente local de mensajes de prueba.

## Smoke check

El smoke check inicia una instancia temporal y verifica rutas y muestras multilingües, filtro/fallback local, el contrato REST Gemini (sin llamar a Google ni usar tu cuota), el flujo WebSocket, apertura de bolitas y sellado/revelación de spoilers:

```powershell
npm.cmd run smoke
```

## Estructura

```text
.
├── docs/                 # Plan e idea original
├── public/
│   ├── panel/            # Panel del streamer
│   ├── overlay/          # Máquina y overlay OBS
│   ├── shared/           # Tema y estilos comunes
│   └── vendor/            # Matter.js y fuentes servidos localmente
├── scripts/              # Smoke check y prueba IRC anónima
├── server/
│   ├── ai/               # Clasificador y fallback local
│   ├── chat/             # IRC, EventSub y simulador
│   ├── index.js          # Arranque HTTP/WebSocket
│   └── state.js          # Estado en memoria
├── .env.example
├── PROGRESO.md
└── package.json
```

## Gemini: clave y configuración

En la raíz del proyecto, crea `.env` copiando `.env.example` y pega tu clave de Google AI Studio en `GEMINI_API_KEY=`. Configura el modelo en `GEMINI_MODEL` (predeterminado `gemini-3.8-flash`) y el idioma destino en `STREAMER_LANGUAGE=es`. La clave solo la lee el servidor; no se incluye en las rutas HTTP ni en los mensajes WebSocket enviados al panel o al overlay.

Después, ejecuta `npm.cmd start`, abre el panel y envía ejemplos del simulador. Escribe el título del juego en **Juego actual**; el servidor lo conserva en memoria y lo envía como contexto en cada lote. La clasificación agrupa hasta 10 mensajes cada 2,3 segundos. El indicador del panel muestra Gemini activa, en respaldo local o pausada. Sin clave, los mensajes seguros se procesan con el clasificador local.

El simulador tiene muestras en español, inglés, portugués, francés y japonés para pistas, spoilers, predicciones, ánimo, retos, ruido, contenido ofensivo e intento de prompt injection. Usa **Ver original** en una bolita para alternar entre el texto original y la traducción.

## Twitch y claves

El simulador y el modo IRC experimental no requieren claves. Para EventSub, registra una aplicación de Twitch, genera un token con los scopes indicados en [docs/PLAN.md](docs/PLAN.md) y copia los datos privados a `.env` a partir de `.env.example`. Nunca subas `.env` al repositorio.

Gemini usa la API REST `generateContent` con salida JSON estructurada. Las entradas que no cumplen el esquema se descartan; los fallos de llamada, timeout o cuota pasan automáticamente al respaldo local.
