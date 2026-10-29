# Progreso de Gumball Chat

## Día 1 — flujo funcional y reorganización

### Hecho

- [x] Servidor local Node, panel y overlay OBS con física Matter.js local.
- [x] Fuentes de chat separadas para simulador, IRC experimental y EventSub.
- [x] Panel con inventario, filtros, sellado de spoilers y estadísticas en memoria.
- [x] Smoke check para rutas, simulación, WebSocket y acciones de bolitas.
- [x] Configuración `.env.example`, README y estructura del proyecto actualizados.

## Día 2 — Gemini y clasificación

### Hecho

- [x] Integración REST `generateContent` en `server/ai/classifier.js`; `GEMINI_API_KEY` se mantiene del lado del servidor y el modelo se configura con `GEMINI_MODEL`.
- [x] Instrucción del sistema trata el chat como datos no confiables y ordena ignorar cualquier comando que venga dentro de los mensajes.
- [x] Filtro local previo para texto vacío/corto/largo, emotes comunes, risas, spam y duplicados.
- [x] Cola por lotes cada 2,3 segundos con máximo 10 mensajes por llamada; envía el título del juego como contexto.
- [x] Esquema JSON estricto y validación de id, categoría, idioma, traducción, destaque y seguridad; entradas inválidas no llegan a la máquina.
- [x] Timeout de 12 segundos y hasta dos reintentos con espera para HTTP 429; ante fallos usa el clasificador local.
- [x] Fallback local descarta también contenido ofensivo, datos personales detectables y prompt injection conocido.
- [x] Panel muestra estado de Gemini/fallback/pausa, permite indicar el juego y alternar entre texto traducido y original.
- [x] Simulador incluye cinco idiomas y casos de pistas, spoilers, predicciones, ánimo, retos, ruido, ofensa y manipulación de instrucciones.
- [x] Smoke check valida las categorías e idiomas de ejemplo, descarte de casos inseguros, lotes máximos de 10, API REST simulada, JSON, clave en header, contexto del juego y retry 429.

### Pendiente

- [ ] Añadir tu clave de AI Studio en `.env` y probar una respuesta real de Gemini; el smoke check usa una respuesta simulada y no consume cuota.
- [ ] Validar aspecto y rendimiento en Browser Source de OBS.
- [ ] Ejecutar `node scripts/test-anonymous-irc.js NOMBRE_DEL_CANAL` con un canal en vivo; solo cambiar `CHAT_MODE` si la prueba confirma acceso anónimo.
- [ ] Probar EventSub real con credenciales Twitch si IRC anónimo no funciona.
- [ ] Grabar el video final y entregar el proyecto.

## Probar en Windows PowerShell

```powershell
npm.cmd install
npm.cmd run smoke
Copy-Item .env.example .env
```

Si ya existe `.env`, edítalo sin reemplazarlo. Añade tu clave en `GEMINI_API_KEY=`, revisa `GEMINI_MODEL=gemini-3.8-flash`, ejecuta `npm.cmd start` y abre `http://localhost:3000/`.
