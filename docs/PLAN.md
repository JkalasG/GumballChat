# Gumball Chat — planteamiento técnico y factibilidad

> **Decisiones actualizadas por el usuario (29 oct 2026):** este apartado prevalece donde contradiga el análisis preliminar más abajo.

## Decisiones confirmadas para el MVP

- **Chat:** se comprobó la guía oficial de IRC y la guía oficial de chatbot. La documentación actual de IRC exige token OAuth con `chat:read`; el ejemplo de chatbot usa EventSub WebSocket con OAuth (`user:bot`, `user:read:chat` y `user:write:chat` porque también envía una respuesta). Se intentó una conexión real anónima a `wss://irc-ws.chat.twitch.tv:443` y el socket cerró con error de red antes de abrir; eso no es evidencia concluyente de rechazo del servidor. Como el método anónimo no está documentado como acceso soportado y la guía IRC requiere autenticación, el MVP usa EventSub autenticado. La fuente de chat queda detrás de un adaptador para sustituirla más adelante. El simulador siempre está disponible.
- **Node/WebSocket:** Node 24.19.0 tiene `WebSocket` nativo como cliente (útil para EventSub), pero no proporciona un servidor WebSocket para el navegador. Se usará una única dependencia pequeña (`ws`) para el servidor local; no hay compilación.
- **IA:** Gemini API con clave privada en `.env`, nombre del modelo configurable. Filtro local primero, lotes de hasta 10 mensajes cada 2–3 segundos y JSON validado; si falla, clasificador local mantiene la demo en marcha.
- **Categorías:** `pista` (amarilla), `spoiler` (negra sellada), `prediccion` (morada), `animo` (rosada), `reto` (roja) y `descartar`. `destacada` es un booleano opcional, no categoría.
- **Controles/datos:** filtro de categoría en la máquina, conteo de idiomas originales en memoria, idioma predeterminado español configurable. El spoiler requiere acción explícita “Revelación final”.
- **Frontend:** HTML/CSS/JS puro, sin React ni bundler; Matter.js desde CDN para física 2D en Canvas; overlay transparente pensado para OBS. Esfera falsa 3D y máquina de vidrio dibujadas en Canvas/CSS, sin Three.js.
- **Entorno:** Windows 11, Node v24.19.0, VS Code, OBS disponible. Simulador en varios idiomas para pruebas inmediatas.

### Resultado de verificación de acceso anónimo

El navegador Node pudo crear el objeto WebSocket, pero el intento saliente a IRC falló antes del evento `open` (código de cierre 1006). La ejecución se reintentó fuera del sandbox y el resultado fue igual; por tanto, la prueba de red desde este entorno no permite afirmar que Twitch rechazó específicamente `justinfan`. La documentación oficial sí es clara: IRC requiere autenticación y token con `chat:read`; la guía de chatbot vigente describe EventSub con OAuth y los scopes indicados. Decisión: usar EventSub oficial para el modo real, dejando el simulador como primera ruta y reportando el fallo de prueba con transparencia.

### Configuración necesaria para conectar Twitch (modo EventSub)

1. En [Twitch Developer Console](https://dev.twitch.tv/console/apps), registrar una aplicación y copiar `Client ID` y `Client Secret`; para usar el token CLI, registrar exactamente el OAuth Redirect URL `http://localhost:3000`.
2. Instalar Twitch CLI desde la [guía oficial](https://dev.twitch.tv/docs/cli/), abrir PowerShell y ejecutar `twitch configure`; introducir el Client ID y Secret de la aplicación.
3. **Antes de iniciar Gumball Chat**, generar token con `twitch token --user-token --scopes "user:bot user:read:chat"`. Se abrirá Twitch en navegador para consentir los scopes. Copiar el valor “User Access Token”; no copiar el refresh token como si fuera access token. El CLI usa su callback local en `localhost:3000`, por eso conviene generar el token antes de arrancar Gumball Chat. No pedir `user:write:chat` mientras el producto solo lee.
4. El token debe pertenecer al usuario que se configuró como `TWITCH_BOT_LOGIN`. Para la prueba individual más sencilla, usar la misma cuenta propia como canal y como usuario que lee el chat. Copiar token, Client ID, login del canal y login del usuario del token al `.env` local (nunca al repositorio). La app valida token y scopes, consulta IDs por Helix, abre `wss://eventsub.wss.twitch.tv/ws`, recibe la sesión y crea `channel.chat.message` por Helix.
5. Pulsar **Conectar Twitch** en el panel y verificar el estado conectado; enviar un mensaje desde otra cuenta al canal. Si Twitch deniega la suscripción, revisar el mensaje de error, los scopes y si el bot tiene autorización/moderación correspondiente. No se necesita webhook ni publicar el servidor: EventSub WebSocket es una conexión saliente.

Para iniciar sin registrar la aplicación ni generar token, usar el **simulador**. Los nombres exactos de scopes y condiciones deben verificarse de nuevo al configurar la app, porque Twitch puede actualizar requisitos.

## 1. Entendimiento de la idea

Gumball Chat convierte mensajes útiles de Twitch en bolitas animadas dentro de una máquina de chicles para el overlay del stream. La IA detecta idioma e intención, descarta ruido y contenido que no convenga mostrar, y traduce los aportes al idioma del streamer. El streamer conserva el control: filtra por categoría, previsualiza, descarta y decide cuándo abrir cada bolita. Los spoilers se reservan para el final.

La gracia no es que la IA responda por el streamer, sino que haga visible y manejable el aporte de la comunidad sin interrumpir el juego.

## 2. Validación del problema

Hay problemas reales detrás de la propuesta: el backseating puede interrumpir a quien juega; los spoilers y los buenos consejos se mezclan con el flujo del chat; la velocidad del chat hace que mensajes valiosos se pierdan; y las comunidades multilingües crean fricción. El formato de máquina puede convertir esa moderación en una actividad compartida y entretenida.

La oportunidad más clara para el MVP es juegos narrativos o difíciles, comunidades medianas y streamers que quieren recibir consejos de forma voluntaria. La traducción y la visualización de aportes de espectadores pueden ampliar el atractivo.

Debilidades a validar con streamers:

- Algunos streamers prefieren bloquear spoilers por completo; guardarlos para el final todavía puede arruinar la experiencia si se revelan accidentalmente.
- Etiquetar “pista”, “spoiler” y “predicción” depende del contexto del juego y no siempre se puede inferir del mensaje aislado.
- La clasificación automática puede guardar mensajes irrelevantes y descartar mensajes valiosos. El panel de revisión humana es parte esencial del producto.
- Una espera por IA puede ser más lenta que la vida del chat; demasiado volumen visual también puede tapar el juego.
- El concepto tiene componentes familiares (traducción, moderación, highlights); su diferenciación debe venir de la mecánica de la máquina, los controles de apertura y una buena experiencia comunitaria.
- Las categorías propuestas se pueden simplificar para la demo. “Dorada/excepcional” se presta a arbitrariedad y no es necesaria para demostrar el valor.

Validación práctica recomendada: probar el flujo con mensajes preparados y preguntar a 2–3 streamers si revisarían una cola así durante una partida y qué categorías les sirven. No hace falta construir una integración completa para obtener esta primera señal.

## 3. Factibilidad honesta

**Sí es construible como demo individual de hackathon en tres días**, siempre que el alcance sea un overlay web, un panel simple, un simulador reproducible y una conexión real opcional o acotada. No es realista prometer en ese plazo una app pública multiusuario, integración anónima, moderación perfecta, estadísticas históricas y una máquina física sofisticada.

### Fácil

- Interfaz de máquina/bolitas y tarjetas de mensajes con HTML/CSS/JS.
- Panel del streamer en una página separada, con filtros, abrir, previsualizar y descartar.
- Simulador con mensajes multilingües predefinidos y un botón para ejecutar una secuencia de demo.
- Clasificación y traducción mediante una sola petición estructurada al modelo por mensaje candidato, con salida JSON.
- Comunicación local entre panel y overlay mediante WebSocket o, para una primera versión, eventos del mismo servidor.

### Difícil

- Autenticación OAuth de Twitch, recuperación de identidad del canal y conexión robusta al chat.
- Distinguir categorías sutiles con poco contexto, manteniendo latencia y coste bajos.
- Hacer que el overlay se entienda sobre distintos juegos, resoluciones y tamaños de OBS.
- Asegurar una demo fiable con red, credenciales y cuotas externas.

### Riesgoso / supuesto que hay que corregir

- **Lectura anónima sin token:** no debe ser un requisito del MVP. La guía actual de Twitch exige `chat:read` para IRC. EventSub para leer `channel.chat.message` requiere autorización y scopes de usuario; las opciones de chatbot instalado/cloud tienen requisitos adicionales. La demo debe ofrecer simulador y dejar Twitch real como conexión autenticada optativa.
- Una API gratuita no es una garantía de disponibilidad, cuota o latencia para un stream concurrido. Las cuotas dependen del modelo/proyecto y cambian; revisar AI Studio antes de grabar.
- No se puede garantizar que “los mensajes ofensivos nunca aparezcan” solo con IA. Las decisiones de seguridad deben ser conservadoras, con aprobación del streamer antes de mostrar texto y controles de pausa/limpieza.
- Nunca poner una clave de Gemini/Twitch en el navegador ni en el overlay que OBS carga. Mantenerlas en el servidor local y en `.env` ignorado por Git.

## 4. Arquitectura propuesta

```text
Chat de Twitch ─┐
                ├─> Adaptador de entrada ─> Cola de mensajes ─> Clasificador/traductor IA
Simulador ──────┘                                      │
                                                       v
                                             Almacén temporal en memoria
                                                │                 │
                                      Panel del streamer       Overlay OBS
                                      (revisar/filtrar)       (bolitas/abrir)
```

1. **Entrada:** dos fuentes intercambiables: simulador (siempre disponible) y Twitch autenticado (cuando se configure). Ambas producen el mismo formato interno: autor, texto, idioma/canal, hora e identificador.
2. **Cola y límites:** limitar longitud y frecuencia, deduplicar y mantener una cola pequeña. Procesar primero mensajes recientes; descartar mensajes viejos cuando la cola supera el límite.
3. **Procesador IA:** filtro local primero; cada 2–3 segundos enviar hasta 10 candidatos por llamada y pedir una sola respuesta JSON con una entrada validable por mensaje: `keep`, `category`, `translatedText`, `sourceLanguage`, `confidence`, `featured`. Si hay error o respuesta inválida, el fallback local clasifica y conserva el flujo. No permitir que la respuesta del modelo controle herramientas ni se interprete como HTML.
4. **Almacén:** estado temporal en memoria durante la demo. No persistir mensajes ni nombres tras cerrar la sesión. Esto simplifica privacidad y manejo de datos.
5. **Panel streamer:** elegir idioma, canal/fuente, iniciar/parar, filtros, conteos, cola de revisión, vista previa, descartar, abrir una bolita al azar o por categoría, y abrir spoilers en lote solo con confirmación explícita.
6. **Overlay:** página local independiente para OBS Browser Source. Muestra la máquina, color/categoría y animación; solo revela texto después de una acción del panel. Mantener el overlay sin controles críticos.
7. **Transporte:** un servidor local Node.js sirve las páginas, recibe chat, consulta IA y distribuye eventos por WebSocket. El panel y overlay se conectan al mismo proceso.

## 5. Opciones técnicas y recomendación

| Componente | Opciones | Ventajas / desventajas | Recomendación |
|---|---|---|---|
| Chat Twitch | EventSub WebSocket; IRC; simulador | EventSub es la vía recomendada y requiere OAuth/scopes. IRC es legacy y también requiere `chat:read`. Simulador no prueba Twitch real. | Simulador garantizado + adaptador EventSub oficial en el Día 1. No asumir acceso anónimo. |
| Backend | Node.js + Express/Fastify; Python + FastAPI | Node comparte lenguaje con overlay y tiene ecosistema WebSocket/Twitch; Python es cómodo para IA, pero añade dos lenguajes si frontend JS. | Node.js, proceso local, una app y configuración simple para Windows. |
| IA | Gemini API; OpenAI API; reglas locales | Gemini tiene tier gratuito para ciertos modelos, pero cuotas/eligibilidad varían. OpenAI ofrece calidad y salida estructurada, pero normalmente requiere presupuesto. Reglas son baratas y rápidas, pero pobres para intención/traducción multilingüe. | Gemini con nombre de modelo configurable en `.env`; filtro local primero, lotes de hasta 10 mensajes cada 2–3 segundos, JSON por mensaje y fallback local. |
| Clasificación/idioma | Un prompt de salida JSON por lote; pasos separados; reglas + modelo | Un lote reduce llamadas; reglas detectan ruido obvio pero no contexto. | Filtro local barato, lote de hasta 10 cada 2–3 segundos, validar esquema/correspondencia y fallback local ante error. |
| Overlay | HTML/CSS/JS en OBS Browser Source; React/Vite; Extension | HTML/CSS simple carga fácil y no requiere Extension; React facilita UI pero añade compilación; Extension implica revisión y más trabajo. | HTML/CSS/JS servido localmente y agregado como Browser Source en OBS. Animación 2D CSS/SVG, no 3D/physics. |
| Panel | Página web local; overlay con controles; Twitch Extension | Página separada es fácil de probar y no requiere aprobación; controles en overlay pueden estorbar; Extension requiere más requisitos y pruebas. | Página local separada para el streamer; OBS carga la ruta de solo visualización. |
| Estado/transporte | Memoria + WebSocket; SQLite; cloud | Memoria reduce instalación y privacidad; SQLite añade durabilidad; cloud despliega más y exige hosting. | Estado en memoria + WebSocket. No usar base de datos en el MVP. |
| Pruebas de demo | mensajes escritos en UI; script/fixture; chat real | Mensajes manuales ayudan, fixtures dan repetibilidad, Twitch real da autenticidad pero puede fallar. | Fixture reproducible que dispara mensajes en varios idiomas, ruido, consejo, spoiler y mensaje bloqueado; demostrar Twitch real solo si ya está estable. |

**Uso de Codex:** el requisito del evento pide que el proyecto esté construido con Codex. Trabajar en una única sesión principal de Codex para crear, depurar y documentar el proyecto; conservar el Session ID para Devpost. En el video mostrar una tarea concreta resuelta con Codex y explicar qué partes se construyeron con él. Codex no sustituye la conexión Twitch: ambos requisitos deben quedar demostrados.

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación para el MVP |
|---|---|
| Token OAuth / acceso a chat no disponible | Simulador es una ruta completa de demo; instrucción de configuración opcional para Twitch. No incrustar tokens; no afirmar lectura anónima. |
| 429/cuota, latencia o caída de Gemini | Limitar velocidad y concurrencia, cola acotada, timeout, retry limitado; mostrar estado “IA pausada”; fallback de mensajes preparados/reglas. Verificar cuota el día de grabación. |
| Mala categoría o traducción | Confianza mínima; incierto = revisión/descartar; panel siempre previsualiza; texto original accesible; el streamer controla apertura. |
| Contenido ofensivo en overlay | Filtrado local conservador adicional, ocultar por defecto antes de aprobación, botones descartar/pausa/limpiar, escapado de HTML, longitud máxima. Nunca prometer filtro perfecto. |
| Prompt injection en el chat | Tratar cada mensaje como dato no confiable; instrucción fija; salida JSON estricta; ignorar instrucciones que aparezcan en mensajes; no conceder herramientas al modelo. |
| Muchos mensajes / caída de rendimiento | Reglas locales primero, cola y límite por usuario, concurrencia de IA 1–3, agrupar candidatos si el formato lo permite, descartar backlog y mostrar conteo de ignorados. |
| Overlay roto en OBS | Probar la URL local en OBS con una escena de prueba; resolución base fija, escala responsive, modo sin transparencia de fondo configurable; controlar reconexión WebSocket y estado vacío. |
| Spoiler revelado antes de tiempo | Mantener categoría bloqueada y fuera del botón aleatorio; vista previa con aviso; apertura en lote requiere botón separado y confirmación. |
| Datos/credenciales expuestos | `.env` ignorado; archivo `.env.example` sin secretos; no registrar texto completo por defecto; limpiar memoria al cerrar; repositorio sin tokens. |
| Demo difícil de reproducir por jurado | README con pasos Windows/VS Code, dependencias y URLs; comandos de arranque sencillos; fixtures y modo simulación sin claves externas. |

## 7. MVP y mejoras priorizadas

### MVP mínimo entregable (siempre presentable)

- Arranque local en Windows con un comando claro.
- Simulador que entrega una secuencia repetible de mensajes en al menos dos idiomas.
- Categorías `pista`, `spoiler`, `prediccion`, `animo`, `reto` y `descartar`; `featured` opcional activa brillo dorado sin crear una categoría. Traducción al español configurado.
- Panel local con cola, filtros por categoría, previsualización, descartar y abrir una bolita.
- Overlay Browser Source con máquina y animación legible; mensaje revelado con autor y traducción, además del original bajo demanda.
- Spoilers no se muestran por selección aleatoria; botón separado de revelación final.
- Política conservadora de contenido, límites de longitud y controles de pausa/limpieza.
- README, `.env.example`, sin secretos y video demo de máximo 3 minutos que muestre el producto, su uso en Twitch/overlay, y cómo se usó Codex.

**Criterio de corte:** si OAuth o modelo remoto consumen más de medio día, dejar Twitch real o IA real como modo opcional y grabar el recorrido garantizado con simulador. Para cumplir el objetivo Twitch, intentar mostrar el overlay asociado a una escena de OBS y, si se logra, una entrada real del chat; documentar claramente qué modo se usó.

### Mejoras opcionales (ordenadas por prioridad)

1. Conectar chat real autenticado con IRC/EventSub y mostrar estado de conexión.
2. Ajuste por idioma, categorías habilitadas, confianza mínima y comportamiento de spoilers.
3. Cola visual comunitaria más rica: quien envió cada bola ve una señal de que fue guardada; animación/sonido opcional y accesible.
4. Estadística de idioma/categoría agregada durante la sesión, sin historial personal.
5. Guardado/exportación local de resumen con consentimiento del streamer.
6. OAuth pulido, instalación para otros canales, reconexión y despliegue público.
7. Twitch Extension, moderación ampliada, persistencia e historial multi-stream.

## 8. Plan por días (máximo 3 días)

Reserva explícitamente las últimas 3–4 horas del día 3 para estabilizar, grabar y entregar. No añadas funciones después de iniciar la grabación.

### Día 1 — flujo funcional y demo garantizada (en curso)

- Definir esquema de mensajes y categorías; crear estructura mínima de app local.
- Construir backend local, WebSocket, adaptador EventSub autenticado y modo simulador.
- Construir panel básico y overlay con máquina/bolitas Matter.js.
- Al final del día, un mensaje simulado debe recorrer entrada → panel → overlay y abrirse manualmente.

### Día 2 — IA y experiencia del streamer

- Añadir clasificación/traducción con proveedor elegido, validación de JSON, límites y fallback.
- Filtros, vista previa, descarte, control de spoilers y pausa/limpieza.
- Ajustar apariencia para OBS y revisar flujos con fixtures multilingües/ruidosos.
- Conectar Twitch real si las credenciales están disponibles; si no, dejar el modo autenticado preparado y seguir con simulador.

### Día 3 — Twitch, robustez y entrega

- Probar conexión Twitch autenticada y overlay en OBS; mantener simulador listo.
- Revisar fallos, reconexión, datos secretos, README e instrucciones de ejecución en Windows.
- Congelar funciones; preparar escena/guion, grabar video de hasta 3 minutos, comprobar audio/visibilidad/enlace público.
- Entregar Devpost: descripción, repositorio, video, Session ID de Codex y capturas si ayudan.

## 9. Decisiones y datos de configuración pendientes

Las decisiones de producto ya están respondidas: EventSub autenticado; idioma español; Gemini AI Studio con respaldo local; OBS disponible; spoilers con acción explícita; Windows 11 y Node v24.19.0. Antes de probar Twitch real solo hacen falta `Client ID`, token OAuth con scopes y los logins del canal/usuario autorizado, guardados en `.env`. El Día 2 hará falta la clave gratuita de Gemini y el nombre del modelo (`GEMINI_MODEL`).

## Fuentes consultadas (verificadas el 29 de octubre de 2026)

- [Hackathon Codex x TwitchCon en Devpost](https://twitchcon-codex.devpost.com/): requisitos, entrega y criterios de evaluación.
- [Twitch Chat & Chatbots](https://dev.twitch.tv/docs/chat): interfaces actuales y recomendación de EventSub.
- [Autenticación de chat/EventSub](https://dev.twitch.tv/docs/chat/authenticating): permisos para leer mensajes.
- [Guía oficial de ejemplo chatbot](https://dev.twitch.tv/docs/chat/chatbot-guide/): patrón EventSub WebSocket y OAuth para un bot local.
- [Twitch CLI: obtener token](https://dev.twitch.tv/docs/cli/token-command/): `twitch token -u`, scopes y redirect `http://localhost:3000`.
- [Conceptos de Twitch IRC](https://dev.twitch.tv/docs/chat/irc/): IRC requiere autenticación con `chat:read`.
- [Scopes de Twitch](https://dev.twitch.tv/docs/authentication/scopes/): alcance de `user:read:chat`, `user:bot` y `channel:bot`.
- [Cuotas de Gemini API](https://ai.google.dev/gemini-api/docs/rate-limits): límites variables por proyecto/modelo/plan.
- [Facturación de Gemini API](https://ai.google.dev/gemini-api/docs/billing): acceso gratuito sujeto a modelos y límites disponibles.
- [Filtros de seguridad Gemini](https://ai.google.dev/gemini-api/docs/safety-settings): filtros configurables, pero sin garantía de moderación perfecta.
