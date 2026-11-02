GUMBALL CHAT - INSTRUCCIONES PASO A PASO
Idioma de la interfaz, configuracion de tarjetas, panel de configuracion y README bilingue
=========================================================================================

Orden recomendado (deadline del hackathon: hoy 18:00 GMT-4):
  Parte 0  Guardar lo actual en GitHub ............................ 5 min
  Parte A  Idioma de la interfaz (ingles / espanol / otros) ......... 60-75 min
  Parte B  Configuracion de las tarjetas publicas ................... 45-60 min
  Parte C  Seccion "Configuracion" en el panel administrativo ....... 45 min
  Parte D  Verificacion ............................................. 20 min
  Parte E  README.md (ingles, por defecto) y README.es.md (espanol) . 30-40 min

Regla general: haz commit al terminar cada parte. Si se acaba el tiempo,
siempre tendras una version entregable en GitHub.


-----------------------------------------------------------------------------------------
PARTE 0 - GUARDAR LO ACTUAL
-----------------------------------------------------------------------------------------
0.1  git add -A
0.2  git commit -m "Tubo, animaciones de entrada/salida y tarjetas por categoria"
0.3  git push origin main
0.4  Comprueba en github.com/JkalasG/GumballChat que NO aparezcan .env ni
     .gumball-settings.json (ya estan en .gitignore).


-----------------------------------------------------------------------------------------
PARTE A - IDIOMA DE LA INTERFAZ (EN / ES / OTROS)
-----------------------------------------------------------------------------------------
Hoy hay un solo ajuste, "streamerLanguage", que sirve para TRADUCIR los mensajes del
chat. Todos los textos de la interfaz estan escritos en espanol directamente en el HTML
y el JS. Hay que separar dos conceptos:

  uiLanguage        idioma de los textos de la app: panel, overlay, tarjetas e instructivos
  streamerLanguage  idioma al que la IA traduce los mensajes del chat (ya existe)

Por defecto: uiLanguage = "en" (los jueces y TwitchCon son en ingles).

A.1  Crear public/shared/i18n.js (un solo archivo, sin dependencias)
     - Objeto DICTS = { en:{...}, es:{...} }. Opcional: pt, fr, de, ja, ko.
     - Claves con puntos agrupadas por pantalla, por ejemplo:
         panel.title, panel.drawButton, panel.filters.all, panel.stats.total,
         overlay.status.ready, overlay.status.reconnecting,
         card.category.pista, card.stamp.reto, card.featured,
         lang.es, lang.en, lang.ja ...
         instructivos.step1 ...
         errors.unsupportedLanguage ...
     - Funcion t(key, vars): busca en el idioma actual, si falta usa "en" y,
       si tampoco existe, devuelve la clave. Permite variables: t('panel.visible',{n:5}).
     - Funcion applyI18n(root=document):
         recorre [data-i18n]             -> textContent
         [data-i18n-placeholder]         -> placeholder
         [data-i18n-title]               -> title
         [data-i18n-aria]                -> aria-label
       y pone document.documentElement.lang = idioma actual.
     - Funcion resolveLanguage(serverValue), con esta prioridad:
         1) ?lang=xx en la URL (util para OBS: /overlay?lang=en)
         2) uiLanguage guardado en el servidor
         3) navigator.language (solo los 2 primeros caracteres)
         4) "en"
     - Exponer window.I18N = { t, applyI18n, setLanguage, current, available }.
     - IMPORTANTE: los nombres de idiomas en el selector se escriben en su propio
       idioma (English, Espanol, Portugues...), no traducidos.

A.2  Servidor (server/index.js)
     - Crear UI_LANGUAGES = new Set(['en','es', ...los que tengan diccionario]).
     - Cambiar la carga y el guardado de .gumball-settings.json para manejar un objeto
       completo: { uiLanguage, streamerLanguage, overlay:{...}, card:{...} }.
       OJO: hoy el POST sobrescribe el archivo solo con streamerLanguage. Hay que
       leer, fusionar y luego escribir, o se perderan los demas ajustes.
     - Crear una funcion normalizeSettings(input, current) que valide cada campo,
       aplique los valores por defecto y limite rangos. Nunca guardes lo que llega
       sin validar.
     - GET /api/settings  -> devuelve el objeto completo.
     - POST /api/settings -> acepta cambios parciales, valida, fusiona, guarda y
       hace broadcast({ type:'settings', settings }).
     - Incluir settings en el mensaje 'state' inicial del WebSocket, para que el
       overlay los tenga al conectarse.
     - Variables nuevas en .env.example: UI_LANGUAGE=en (valor inicial).
     - Los errores de la API deben devolver un codigo, no texto en espanol
       (por ejemplo { ok:false, error:'unsupported_language' }). El panel lo
       traduce con t('errors.unsupported_language').

A.3  Panel (public/panel/index.html y panel.js)
     - Cargar /shared/i18n.js ANTES que panel.js.
     - Sustituir cada texto fijo por un atributo data-i18n. Ejemplo:
         <h1 data-i18n="panel.heading">La maquina de hoy</h1>
       (el texto que queda dentro es solo de respaldo).
     - En panel.js, todo texto generado dinamicamente (toasts, contadores,
       estados vacios, "Ver original", estados de Gemini y Twitch, etiquetas de
       categoria, nombres de idioma en las barras) pasa por t().
     - Al iniciar: fetch('/api/settings') -> I18N.setLanguage(...) -> applyI18n().
     - Al recibir {type:'settings'} por WebSocket: si cambio uiLanguage, volver a
       aplicar los textos y repintar la lista. No hace falta recargar la pagina.

A.4  Overlay (public/overlay/overlay.js)
     - Cargar /shared/i18n.js antes que overlay.js. El smoke check exige que
       sigan cargandose /vendor/matter.min.js y /overlay/overlay.js.
     - Reemplazar las constantes fijas por t():
         labels      -> t('card.category.'+cat)
         cardStamps  -> t('card.stamp.'+cat)
         languages   -> t('lang.'+code)
         "Maquina lista", "Reconectando...", "Conectando con la maquina",
         "No se pudo cargar la fisica..." -> t('overlay.status.*')
         "Destacada" de la tarjeta -> data-i18n="card.featured"
     - El nombre de la placa dibujada en el canvas ("Gumball Chat") es una marca:
       no se traduce.
     - ?lang=en en la URL tiene prioridad sobre el ajuste del servidor.

A.5  Instructivos (public/instructivos/index.html): misma tecnica con data-i18n.

A.6  Etiquetas del chat en varios idiomas (server/index.js, parseo de &etiqueta)
     - Las claves internas siguen siendo pista/reto/animo/prediccion/spoiler.
       NO cambiarlas, porque las usan los colores, el CSS y el smoke check.
     - Aceptar alias:
         &hint        -> pista
         &challenge   -> reto
         &cheer       -> animo
         &prediction  -> prediccion
         &spoiler     -> spoiler
     - Los instructivos muestran las etiquetas del idioma activo.


-----------------------------------------------------------------------------------------
PARTE B - CONFIGURACION DE COMO SE MUESTRAN LAS TARJETAS AL PUBLICO
-----------------------------------------------------------------------------------------
Todo se guarda en settings.card y settings.overlay (Parte A.2) y se aplica en vivo
por WebSocket, sin recargar OBS.

B.1  Campos de settings.card (valor por defecto entre corchetes)
     textMode        "translated" | "original" | "both"        ["translated"]
                     both = traduccion grande y original pequeno debajo,
                     solo si el idioma de origen es distinto.
     showAuthor      true/false                                 [true]
     showLanguage    true/false                                 [true]
     showStamp       true/false                                 [true]
     showBadge       true/false                                 [true]
     durationSec     4 a 20                                     [7.2]
     position        "auto" | "top-left" | "top-right" |
                     "bottom-left" | "bottom-right" | "center"  ["auto"]
                     auto = lado contrario a la maquina (comportamiento actual)
     size            "s" | "m" | "l"                            ["m"]
                     (ancho 420 / 540 / 680 px y fuente proporcional)
     animation       "bounce" | "fade" | "none"                 ["bounce"]
     maxChars        60 a 260; recorta con "..."                [200]
     categories      por categoria: { enabled, label, stamp }
                     enabled=false -> esa categoria no se abre en el stream
                     label/stamp vacios -> texto traducido por defecto
                     (maximo 24 caracteres; se valida en el servidor)

B.2  Campos de settings.overlay
     position        "right" | "left"                           ["right"]
     scale           0.45 a 1.15                                [0.8]
     showStatus      true/false; oculta la pastilla "Maquina lista"   [true]
     Prioridad: los parametros ?pos= y ?scale= de la URL ganan sobre el ajuste
     guardado (asi no se rompen las escenas de OBS que ya existan).

B.3  Overlay (overlay.js y overlay.css)
     - Guardar los settings recibidos en una variable y llamar applySettings():
         * clases en <body>: card-pos-top-left, card-size-l, card-anim-fade,
           hide-status, etc.
         * data-show-author="false" (y demas) en #open-card, ocultando con CSS.
     - showMessageCard(item):
         * texto principal segun textMode; para "both" anadir un <p id="card-original">
           pequeno y en cursiva debajo (ya existe item.text = original y
           item.translatedText = traduccion).
         * recortar a maxChars.
         * usar categories[cat].label/stamp si tienen texto; si no, t().
         * el temporizador de ocultar usa durationSec*1000.
         * si la categoria esta desactivada, no mostrar la tarjeta (la bolita sale igual).
     - Cambio de posicion o escala de la maquina: volver a calcular geometry()
       (borrar geometryCache), reconstruir las paredes y llamar a wake().
     - CSS: una regla por posicion, por tamano y por animacion. Mantener el
       "transform-origin" coherente con la posicion. No usar color-mix ni :has
       (el Chromium de OBS es antiguo).
     - Usar siempre textContent, nunca innerHTML, con cualquier texto configurable
       o del chat.

B.4  Boton "Probar tarjeta"
     - Nuevo comando WebSocket {type:'preview-card', category}: el servidor reenvia
       una tarjeta de ejemplo SOLO al overlay. No toca la cola ni las estadisticas.
     - El overlay la muestra sin la animacion de la bolita, para revisar el diseno rapido.


-----------------------------------------------------------------------------------------
PARTE C - SECCION "CONFIGURACION" EN EL PANEL ADMINISTRATIVO
-----------------------------------------------------------------------------------------
C.1  Navegacion: en la barra lateral, anadir el enlace "Configuracion" (#settings)
     debajo de "Idiomas". Puede ser una seccion de la misma pagina que se muestra u
     oculta, o una vista con pestanas. Lo mas rapido es una seccion en la misma pagina.

C.2  Bloques de la seccion (cada uno es una .panel-card, igual que el resto)

     1) General
        - Idioma de la interfaz (uiLanguage): English, Espanol, ...
        - Idioma del streamer / traduccion (streamerLanguage): mover aqui el
          selector que hoy esta en la barra "Juego actual".
        - Juego actual (puede quedarse donde esta; opcional moverlo).

     2) Conexion con Twitch (solo lectura y accion)
        - Modo actual (simulator / anonymous / eventsub), canal y estado.
        - Boton "Conectar Twitch" (el mismo de la barra superior).
        - Nota: las claves se configuran en .env y nunca se muestran en el panel.

     3) Overlay en OBS
        - Lado de la maquina (derecha/izquierda) y escala (slider de 0.45 a 1.15).
        - Mostrar la pastilla de estado (si/no).
        - URL lista para copiar, con boton "Copiar":
            http://localhost:3000/overlay      (y la de /instructivos)
          Texto de ayuda: "Browser Source 1920x1080, sin estirar".

     4) Tarjetas publicas
        - Todos los campos de B.1 con controles simples:
          radios para textMode y animation, selector para position y size,
          slider para durationSec y maxChars, casillas para los show*.
        - Vista previa en miniatura DENTRO del panel, que reutiliza las clases de
          overlay.css. Opcional: con el boton "Probar tarjeta" basta.

     5) Categorias
        - Una fila por categoria: punto de color, casilla "Mostrar en stream",
          campo "Nombre" y campo "Sello" (placeholder = valor por defecto traducido).

     Pie de la seccion: botones "Guardar", "Restablecer valores" y "Probar tarjeta".
       - Guardar   -> POST /api/settings con el objeto completo -> toast "Guardado".
       - Restablecer -> POST con {reset:true}; el servidor vuelve a los defaults.
       - Mostrar los errores de validacion junto al campo, traducidos con t().

C.3  Accesibilidad y estilo: cada control tiene su <label>, el foco es visible
     (como el resto del panel) y se usan las mismas variables de theme.css.

C.4  Seguridad minima: el panel no tiene login. En server/index.js, escuchar en
     127.0.0.1 por defecto (variable HOST para cambiarlo), para que nadie de la
     red local cambie la configuracion. Indicarlo en el README.


-----------------------------------------------------------------------------------------
PARTE D - VERIFICACION
-----------------------------------------------------------------------------------------
D.1  npm.cmd run smoke debe seguir pasando. Anadir comprobaciones:
     - GET /api/settings devuelve uiLanguage y card.
     - POST /api/settings con uiLanguage "xx" -> 400.
     - POST con durationSec 999 se limita a 20.
     - /shared/i18n.js responde 200 y contiene las claves "en" y "es".
     - Las claves de "es" y "en" son las mismas (que no falte ninguna traduccion).
D.2  Prueba manual:
     - Cambiar el idioma en el panel -> panel, overlay e instructivos cambian sin recargar.
     - /overlay?lang=es ignora el ajuste guardado.
     - Probar las 5 categorias con "Probar tarjeta" en cada posicion y tamano.
     - textMode "both" con un mensaje en japones del simulador.
     - Reiniciar el servidor -> la configuracion se conserva.
     - Abrir con Chrome/Edge a 1920x1080 y comprobar que nada se corta en ingles
       (los textos en ingles suelen ser mas cortos y en aleman mas largos).
D.3  Commit: "i18n + configuracion de tarjetas y overlay" -> push.


-----------------------------------------------------------------------------------------
PARTE E - README BILINGUE
-----------------------------------------------------------------------------------------
Dos archivos en la raiz:
  README.md     ingles (GitHub lo muestra por defecto)
  README.es.md  espanol (contenido equivalente, misma estructura y orden)

E.1  Primera linea de cada uno, con el selector de idioma:
       README.md:     **English** | [Español](README.es.md)
       README.es.md:  [English](README.md) | **Español**

E.2  Estructura (los mismos encabezados en ambos idiomas)
     1. Titulo + una frase: "Gumball Chat turns useful Twitch chat messages into
        gumballs the streamer opens live on stream."
     2. Captura o GIF del overlay (guardar en docs/media/overlay.png o .gif) y
        enlace al video de demo en YouTube.
     3. Enlaces rapidos (seccion "Links"):
          - Demo video (YouTube): <URL publica>
          - Devpost: <URL del proyecto>
          - Panel:        http://localhost:3000/
          - Overlay OBS:  http://localhost:3000/overlay
          - Instructivos: http://localhost:3000/instructivos
          - Diseno: docs/DISENO.md | Plan e integracion Twitch: docs/PLAN.md
            (si estan solo en espanol, indicarlo: "(Spanish)")
     4. Features: lista corta (chat -> IA clasifica, traduce y filtra -> bolitas
        por color -> el streamer elige -> animacion -> tarjeta; spoilers sellados;
        etiquetas &hint/&pista; multilingue; configuracion de tarjetas).
     5. How it connects to Twitch: EventSub channel.chat.message (WebSocket), IRC
        anonimo experimental, simulador. Scopes: user:read:chat, user:bot
        (+ user:write:chat si se anade el bot que responde en el chat).
     6. Quick start (probar en 2 minutos SIN claves):
          npm install / npm start / abrir el panel / "50 bolitas" / "Sacar una bolita".
        Explicar que sin GEMINI_API_KEY funciona el clasificador local.
     7. Connect your Twitch channel: pasos con enlaces a
          https://dev.twitch.tv/console/apps            (registrar la app)
          https://dev.twitch.tv/docs/eventsub/          (EventSub)
          https://dev.twitch.tv/docs/authentication/    (tokens y scopes)
        y que valores van en .env.
     8. OBS setup: Browser Source 1920x1080, no estirar, parametros
        ?pos=left|right  ?scale=0.45..1.15  ?lang=en|es; filtro de escala Lanczos.
     9. Configuration: tabla con los ajustes del panel (Parte B/C) y tabla de las
        variables de .env (CHAT_MODE, TWITCH_*, GEMINI_API_KEY, GEMINI_MODEL,
        STREAMER_LANGUAGE, UI_LANGUAGE, PORT, HOST). Enlace a Google AI Studio
        para la clave: https://aistudio.google.com/
    10. Chat tags: tabla de etiquetas en ingles y espanol con su color.
    11. How we used Codex: describir con honestidad que se construyo en el hilo de
        Codex (arquitectura, integracion EventSub, clasificador, overlay...) y,
        si se uso otra herramienta para alguna parte, decirlo. Poner aqui el
        Codex Session ID o indicar que esta en Devpost.
    12. Tests: npm run smoke y node scripts/test-anonymous-irc.js CANAL.
    13. Project structure (el arbol actual + shared/i18n.js).
    14. Privacy & security: las claves solo en .env, el panel escucha en 127.0.0.1,
        los mensajes del chat se tratan como datos no confiables (anti prompt injection).
    15. Credits & license: Matter.js (MIT), fuentes Bagel Fat One y Bricolage
        Grotesque (OFL, ver public/vendor/fonts) y licencia del proyecto
        (crear un archivo LICENSE, por ejemplo MIT).

E.3  Reglas de redaccion
     - Comandos para Windows con npm.cmd, y para macOS/Linux con npm.
     - Todos los enlaces internos son relativos (docs/PLAN.md, no rutas C:\...).
     - Las URL de localhost en formato <http://localhost:3000/> para que sean clicables.
     - Nada de claves, tokens ni el nombre de usuario real del bot en el README.
     - Comprueba en GitHub que ambos archivos muestran bien las tildes (UTF-8).
     - Cuando tengas el video y Devpost, sustituye los <URL> por los enlaces reales en
       LOS DOS archivos.

E.4  Commit: "README en ingles y espanol" -> push. Revisa la portada del repo en
     GitHub: debe salir el ingles con el enlace a Espanol arriba.

