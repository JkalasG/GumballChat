const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
loadEnv();

const { EventSubClient } = require('./chat/eventsub');
const { AnonymousIrcClient } = require('./chat/anonymous-irc');
const { createSimulator } = require('./chat/simulator');
const { GumballState } = require('./state');
const { dropReason, analyze } = require('./ai/local-fallback');
const { classifyMessages, getStatus: getAiStatus, MAX_BATCH } = require('./ai/classifier');

const PORT = Number(process.env.PORT || 3000);
// En local solo escucha este equipo; en Render (que define RENDER) escucha todas las interfaces.
const HOST = String(process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1'));
const SETTINGS_PATH = process.env.GUMBALL_SETTINGS_PATH || path.join(ROOT, '.gumball-settings.json');
const MAX_PENDING_MESSAGES = 500;
const MAX_FLUSH_BATCH = MAX_BATCH * 4;
const LANGUAGE_OPTIONS = new Set(['es', 'en', 'pt', 'fr', 'ja', 'de', 'ko']);
const UI_LANGUAGES = new Set(['en', 'es']);
const DEFAULT_SETTINGS = {
  uiLanguage: UI_LANGUAGES.has(String(process.env.UI_LANGUAGE || 'en').toLowerCase()) ? String(process.env.UI_LANGUAGE || 'en').toLowerCase() : 'en',
  streamerLanguage: loadStreamerLanguage(),
  overlay: { position: 'right', scale: 0.8, showStatus: true },
  card: { textMode: 'translated', showAuthor: true, showLanguage: true, showStamp: true, showBadge: true, durationSec: 7.2, position: 'auto', size: 'm', animation: 'bounce', maxChars: 200, categories: Object.fromEntries(['pista','reto','animo','prediccion','spoiler'].map(key => [key,{enabled:true,label:'',stamp:''}])) }
};
let settings = loadSettings();
let streamerLanguage = settings.streamerLanguage;
const CHAT_MODE = ['anonymous', 'eventsub', 'simulator'].includes((process.env.CHAT_MODE || '').toLowerCase())
  ? (process.env.CHAT_MODE || '').toLowerCase()
  : 'simulator';

const store = new GumballState();
const messages = store.messages;
const clients = new Set();
const flowLogHistory = [];
const incomingMessages = [];
const recentMessages = new Map();
let batchTimer = null;
let processingBatch = false;
let lastQueueWarning = 0;
let currentGameTitle = '';

// Con PANEL_PASSWORD, el panel y la API exigen iniciar sesión en /login (cookie de sesión). El overlay, los
// instructivos y sus recursos siguen públicos para que OBS pueda cargarlos, y sus WebSockets son de solo lectura.
const PANEL_USER = String(process.env.PANEL_USER || 'admin');
const PANEL_PASSWORD = String(process.env.PANEL_PASSWORD || '');
const PUBLIC_PATHS = /^\/(overlay|instructivos|login)(\/|$)|^\/(vendor|shared|brand)\/|^\/health$/;
const SESSION_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();
const loginFailures = new Map();
const sameSecret = (given, expected) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(given)).digest(), crypto.createHash('sha256').update(expected).digest());
function sessionToken(req) {
  const match = String(req.headers.cookie || '').match(/(?:^|;\s*)gc_session=([a-f0-9]{64})/);
  return match ? match[1] : null;
}
function authorized(req) {
  if (!PANEL_PASSWORD) return true;
  const token = sessionToken(req), expires = token && sessions.get(token);
  if (expires && expires > Date.now()) return true;
  if (token) sessions.delete(token);
  // Las herramientas de línea de comandos pueden seguir usando HTTP Basic con las mismas credenciales.
  const [scheme, encoded] = String(req.headers.authorization || '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const [user, ...rest] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
  return sameSecret(user, PANEL_USER) && sameSecret(rest.join(':'), PANEL_PASSWORD);
}
function handleLogin(req, res, url) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const failures = (loginFailures.get(ip) || []).filter(at => Date.now() - at < 10 * 60 * 1000);
  const next = /^\/(?!\/)[\w\-/#?=&.]*$/.test(url.searchParams.get('next') || '') ? url.searchParams.get('next') : '/';
  if (failures.length >= 8) { res.writeHead(303, { Location: `/login?error=locked&next=${encodeURIComponent(next)}` }); return res.end(); }
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 2000) req.destroy(); });
  req.on('end', () => {
    const form = new URLSearchParams(body);
    if (!sameSecret(form.get('user') || '', PANEL_USER) || !sameSecret(form.get('password') || '', PANEL_PASSWORD)) {
      loginFailures.set(ip, [...failures, Date.now()]);
      res.writeHead(303, { Location: `/login?error=1&next=${encodeURIComponent(next)}` });
      return res.end();
    }
    loginFailures.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_MS);
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.writeHead(303, { Location: next, 'Set-Cookie': `gc_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}${secure}` });
    res.end();
  });
}

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/login' && req.method === 'POST') return handleLogin(req, res, url);
  if (url.pathname === '/logout') {
    const token = sessionToken(req); if (token) sessions.delete(token);
    res.writeHead(303, { Location: PANEL_PASSWORD ? '/login' : '/', 'Set-Cookie': 'gc_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    return res.end();
  }
  if (url.pathname === '/login' && !PANEL_PASSWORD) { res.writeHead(303, { Location: '/' }); return res.end(); }
  if (!PUBLIC_PATHS.test(url.pathname) && !authorized(req)) {
    // Las páginas redirigen al inicio de sesión; la API responde 401.
    if (url.pathname.startsWith('/api/')) return json(res, 401, { ok: false, error: 'login_required' });
    res.writeHead(303, { Location: `/login?next=${encodeURIComponent(url.pathname + url.search)}` });
    return res.end();
  }
  if (url.pathname === '/api/session') return json(res, 200, { loginEnabled: Boolean(PANEL_PASSWORD), user: PANEL_PASSWORD ? PANEL_USER : null });
  if (url.pathname === '/health') return json(res, 200, { ok: true, mode: CHAT_MODE, messages: messages.length, queued: incomingMessages.length, processing: processingBatch });
  if (url.pathname === '/api/state') return json(res, 200, state());
  if (url.pathname === '/api/ai/status') return json(res, 200, getAiStatus());
  if (url.pathname === '/api/settings' && req.method === 'GET') return json(res, 200, settings);
  if (url.pathname === '/api/settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 12000) req.destroy(); });
    req.on('end', () => {
      try {
        const next = normalizeSettings(JSON.parse(body || '{}'), settings);
        fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2), error => {
          if (error) return json(res, 500, { ok: false, error: 'save_failed' });
          settings = next;
          streamerLanguage = settings.streamerLanguage;
          broadcast({ type: 'settings', settings });
          json(res, 200, { ok: true, settings });
        });
      } catch (error) { json(res, 400, { ok: false, error: error.code || 'invalid_settings' }); }
    });
    return;
  }  if (url.pathname === '/api/samples') return json(res, 200, simulator.samples);
  if (url.pathname === '/api/demo/fill' && req.method === 'POST') {
    const samples = {
      pista: ['Busca detrás de la puerta antigua.', 'La llave abre la sala del jardín.', 'Prueba el camino de la izquierda.', 'Mira debajo de la plataforma.'],
      prediccion: ['Creo que el jefe cambiará de fase.', 'Apuesto a que la salida está arriba.', 'Seguro que esa estatua se mueve.', 'Predigo otra ronda de enemigos.'],
      animo: ['¡Tú puedes, ya casi lo logras!', 'Vamos, esa partida es tuya.', '¡Gran intento, sigue así!', 'Te está saliendo genial.'],
      reto: ['Termina esta sala sin saltar.', 'Cruza el puente sin recibir daño.', 'Intenta vencerlo usando solo magia.', 'Haz el siguiente tramo hacia atrás.'],
      spoiler: ['El guardián final aparece tras la cascada.', 'La aliada era quien abrió la puerta.', 'Hay un final secreto después del jefe.', 'El mapa revela quién traicionó al grupo.']
    };
    const samplesEn = {
      pista: ['Look behind the old door.', 'The key opens the garden room.', 'Try the path on the left.', 'Check under the platform.'],
      prediccion: ['I bet the boss changes phase.', 'The exit is up top for sure.', 'That statue is going to move.', 'Another wave of enemies is coming.'],
      animo: ['You got this, almost there!', 'Come on, this run is yours.', 'Great try, keep going!', 'You are doing amazing.'],
      reto: ['Finish this room without jumping.', 'Cross the bridge without taking damage.', 'Beat it using only magic.', 'Do the next part backwards.'],
      spoiler: ['The final guardian shows up behind the waterfall.', 'Your ally opened the door all along.', 'There is a secret ending after the boss.', 'The map reveals who betrayed the team.']
    };
    const english = settings.uiLanguage === 'en';
    if (english) Object.assign(samples, samplesEn);
    const categories = Object.keys(samples);
    for (let index = 0; index < 50; index++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const choices = samples[category];
      const text = choices[Math.floor(Math.random() * choices.length)];
      const item = {
        id: store.nextId(), author: `${english ? 'Guest' : 'Invitado'}${String(index + 1).padStart(2, '0')}`,
        text, translatedText: text,
        sourceLanguage: english ? 'en' : 'es', category, highlight: false, featured: false,
        status: 'pending', timestamp: Date.now() + index, source: 'demo'
      };
      store.add(item);
      broadcast({ type: 'demo-gum', item });
    }
    broadcast({ type: 'state', data: state() });
    return json(res, 200, { ok: true, added: 50 });
  }
  if (url.pathname === '/api/game-context' && req.method === 'GET') return json(res, 200, { gameTitle: currentGameTitle });
  if (url.pathname === '/api/game-context' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2000) req.destroy(); });
    req.on('end', () => {
      try {
        const input = JSON.parse(body || '{}');
        currentGameTitle = String(input.gameTitle || '').trim().slice(0, 100);
        broadcast({ type: 'game-context', gameTitle: currentGameTitle });
        json(res, 200, { ok: true, gameTitle: currentGameTitle });
      } catch { json(res, 400, { ok: false, error: 'invalid_request' }); }
    });
    return;
  }
  if (url.pathname === '/api/simulate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 5000) req.destroy(); });
    req.on('end', () => {
      try {
        const input = JSON.parse(body || '{}');
        if (Object.hasOwn(input, 'gameTitle')) currentGameTitle = String(input.gameTitle || '').trim().slice(0, 100);
        const result = simulator.submit({ author: input.author || 'Invitado', text: input.text || '' });
        json(res, 200, { ok: result.accepted, queued: result.accepted, reason: result.accepted ? null : result.reason });
      } catch { json(res, 400, { ok: false, error: 'invalid_request' }); }
    });
    return;
  }
  if (url.pathname === '/api/twitch/connect' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2000) req.destroy(); });
    req.on('end', async () => {
      let input;
      try { input = JSON.parse(body || '{}'); } catch { return json(res, 400, { ok: false, error: 'invalid_request' }); }
      const channel = normalizeChannel(input.channel || DEFAULT_CHANNEL);
      if (!channel) return json(res, 400, { ok: false, error: 'invalid_channel' });
      try {
        const result = await connectTwitch(channel);
        json(res, result.ok ? 200 : 400, result);
      } catch { json(res, 500, { ok: false, error: 'connection_error' }); }
    });
    return;
  }
  if (url.pathname === '/api/twitch/disconnect' && req.method === 'POST') {
    disconnectTwitch();
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/twitch/status') return json(res, 200, twitchSnapshot());
  serveStatic(url.pathname, res);
});

const READ_ONLY_CLIENTS = new Set(['overlay', 'viewer']);
const wss = new WebSocketServer({
  server: httpServer, path: '/ws',
  verifyClient: ({ req }) => READ_ONLY_CLIENTS.has(new URL(req.url, 'http://localhost').searchParams.get('client')) || authorized(req)
});
wss.on('connection', (socket, request) => {
  const client = new URL(request.url, 'http://localhost').searchParams.get('client');
  socket.clientType = READ_ONLY_CLIENTS.has(client) ? client : 'panel';
  clients.add(socket);
  socket.send(JSON.stringify({ type: 'state', data: state() }));
  socket.send(JSON.stringify({ type: 'ai-status', status: getAiStatus() }));
  if (socket.clientType === 'panel') socket.send(JSON.stringify({ type: 'twitch-status', ...twitchSnapshot() }));
  if (socket.clientType === 'panel') for (const entry of flowLogHistory) socket.send(JSON.stringify({ type: 'message-log', entry }));
  socket.on('message', raw => {
    if (socket.clientType !== 'panel') return;
    try { handleCommand(socket, JSON.parse(raw.toString())); }
    catch { socket.send(JSON.stringify({ type: 'notice', code: 'invalid_command' })); }
  });
  socket.on('close', () => clients.delete(socket));
});

const simulator = createSimulator(acceptMessage);
const eventSub = new EventSubClient({ acceptMessage: acceptTwitchMessage, broadcast: event => onClientStatus(eventSub, event) });
const anonymousIrc = new AnonymousIrcClient({ acceptMessage: acceptTwitchMessage, broadcast: event => onClientStatus(anonymousIrc, event) });

// Conexión con Twitch: un único canal activo. EventSub se usa para el canal configurado cuando CHAT_MODE=eventsub;
// cualquier otro canal (o los modos anonymous/simulator) se lee con IRC anónimo de solo lectura.
const DEFAULT_CHANNEL = normalizeChannel(process.env.TWITCH_CHANNEL_LOGIN);
const twitch = { state: 'disconnected', channel: DEFAULT_CHANNEL, transport: null, error: null, detail: null, since: null, messages: 0, lastMessageAt: null, retryInMs: null };
let activeChatClient = null;
let twitchWanted = false;
let twitchRetries = 0;
let twitchRetryTimer = null;
let twitchStatusTimer = null;

httpServer.listen(PORT, HOST, () => {
  console.log(`Gumball Chat listo: http://localhost:${PORT}`);
  console.log(`Modo de chat: ${CHAT_MODE}. El simulador local sigue disponible.`);
  if (DEFAULT_CHANNEL && CHAT_MODE !== 'simulator' && process.env.TWITCH_AUTOCONNECT !== 'false') {
    console.log(`Conectando automáticamente con #${DEFAULT_CHANNEL}…`);
    void connectTwitch(DEFAULT_CHANNEL);
  }
});

function normalizeChannel(value) {
  // Acepta "canal", "#canal", "@canal" o la URL del canal y devuelve el login en minúsculas.
  const text = String(value || '').trim().replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//i, '').replace(/^(popout\/)?/, '').replace(/[/?#].*$/, '').replace(/^[#@]/, '').toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(text) ? text : null;
}

function twitchSnapshot() {
  return { mode: CHAT_MODE, defaultChannel: DEFAULT_CHANNEL, ...twitch, connected: twitch.state === 'connected', connecting: twitch.state === 'connecting' || twitch.state === 'reconnecting', configured: Boolean(DEFAULT_CHANNEL) };
}

function setTwitch(patch) {
  Object.assign(twitch, patch);
  clearTimeout(twitchStatusTimer);
  twitchStatusTimer = null;
  broadcast({ type: 'twitch-status', ...twitchSnapshot() });
}

async function connectTwitch(channel) {
  clearTimeout(twitchRetryTimer);
  twitchRetryTimer = null;
  const previous = activeChatClient;
  activeChatClient = null;
  previous?.disconnect();
  const client = CHAT_MODE === 'eventsub' && channel === DEFAULT_CHANNEL ? eventSub : anonymousIrc;
  twitchWanted = true;
  twitchRetries = 0;
  setTwitch({ state: 'connecting', channel, transport: client === eventSub ? 'eventsub' : 'irc', error: null, detail: null, since: null, retryInMs: null, ...(channel !== twitch.channel ? { messages: 0, lastMessageAt: null } : {}) });
  return startChatClient(client, channel);
}

async function startChatClient(client, channel) {
  activeChatClient = client;
  const result = await client.connect(channel);
  if (!result.ok && activeChatClient === client) {
    activeChatClient = null;
    twitchWanted = false;
    logFlow('twitch_error', { channel, code: result.error, detail: result.detail || null });
    setTwitch({ state: 'error', error: result.error, detail: result.detail || null });
  }
  return result.ok ? { ok: true, channel, transport: twitch.transport } : result;
}

function disconnectTwitch() {
  twitchWanted = false;
  clearTimeout(twitchRetryTimer);
  twitchRetryTimer = null;
  const client = activeChatClient;
  activeChatClient = null;
  client?.disconnect();
  if (twitch.state !== 'disconnected') logFlow('twitch_desconectado', { channel: twitch.channel });
  setTwitch({ state: 'disconnected', error: null, detail: null, since: null, retryInMs: null });
}

// Los adaptadores informan conectado, error o cierre; aquí se decide el estado visible y si se reintenta.
function onClientStatus(client, event) {
  if (client !== activeChatClient) return;
  const wasLive = twitch.state === 'connected' || twitch.state === 'reconnecting';
  if (event.connected) {
    twitchRetries = 0;
    logFlow('twitch_conectado', { channel: twitch.channel, transport: twitch.transport });
    setTwitch({ state: 'connected', error: null, detail: null, since: Date.now(), retryInMs: null });
  } else if (event.error || event.closed) {
    if (twitch.state === 'error') return;
    const retryable = !event.error || ['connection_error', 'connection_timeout'].includes(event.error);
    if (twitchWanted && wasLive && retryable) return scheduleTwitchRetry();
    activeChatClient = null;
    twitchWanted = false;
    logFlow('twitch_error', { channel: twitch.channel, code: event.error || 'connection_lost', detail: event.detail || null });
    setTwitch({ state: 'error', error: event.error || 'connection_lost', detail: event.detail || null, since: null, retryInMs: null });
  }
}

function scheduleTwitchRetry() {
  if (twitchRetryTimer) return;
  const client = activeChatClient;
  const delay = Math.min(30000, 2000 * 2 ** twitchRetries++);
  logFlow('twitch_reconectando', { channel: twitch.channel, retryInMs: delay, attempt: twitchRetries });
  setTwitch({ state: 'reconnecting', error: null, detail: null, retryInMs: delay });
  twitchRetryTimer = setTimeout(() => {
    twitchRetryTimer = null;
    if (twitchWanted && activeChatClient === client) void startChatClient(client, twitch.channel);
  }, delay);
}

function acceptTwitchMessage(message) {
  twitch.messages++;
  twitch.lastMessageAt = Date.now();
  // El contador del panel se actualiza como máximo una vez por segundo aunque el chat vaya rápido.
  if (!twitchStatusTimer) twitchStatusTimer = setTimeout(() => { twitchStatusTimer = null; broadcast({ type: 'twitch-status', ...twitchSnapshot() }); }, 1000);
  return acceptMessage(message);
}

function handleCommand(socket, command) {
  if (command.type === 'preview-card') {
    const categories = ['pista', 'reto', 'animo', 'prediccion', 'spoiler'];
    if (!categories.includes(command.category)) return socket.send(JSON.stringify({ type: 'notice', code: 'unsupported_category' }));
    const examples = {
      en: { pista:'The key is behind the old door.', reto:'Finish this room without jumping.', animo:'You are doing great. Keep going!', prediccion:'The boss will change its attack next.', spoiler:'The guide opens the hidden final path.' },
      es: { pista:'La llave está detrás de la puerta antigua.', reto:'Termina esta sala sin saltar.', animo:'¡Vas muy bien, sigue así!', prediccion:'El jefe cambiará su ataque enseguida.', spoiler:'La guía abre el camino final oculto.' }
    };
    const text = examples[settings.uiLanguage][command.category];
    broadcastToOverlays({ type: 'preview-card', item: { id:`preview-${Date.now()}`, author:'GumballPreview', text, translatedText:text, sourceLanguage:settings.uiLanguage, category:command.category, highlight:true, featured:true, status:'opened', preview:true } });
    return;
  }
  if (command.type === 'draw') {
    const choices = messages.filter(message => message.status === 'pending' && message.category !== 'spoiler' && (command.category === 'all' || message.category === command.category));
    const item = choices[Math.floor(Math.random() * choices.length)];
    if (!item) return socket.send(JSON.stringify({ type: 'notice', code: 'no_gumballs' }));
    item.status = 'opened';
    logFlow('abierto_en_stream', { id: item.id, author: item.author, category: item.category });
    broadcast({ type: 'opened', item });
    broadcast({ type: 'state', data: state() });
  } else if (command.type === 'open-id') {
    const item = messages.find(message => message.id === command.id && message.status === 'pending' && message.category !== 'spoiler');
    if (!item) return socket.send(JSON.stringify({ type: 'notice', code: 'cannot_open' }));
    item.status = 'opened';
    logFlow('abierto_en_stream', { id: item.id, author: item.author, category: item.category });
    broadcast({ type: 'opened', item });
    broadcast({ type: 'state', data: state() });
  } else if (command.type === 'reveal-spoilers') {
    const batch = messages.filter(message => message.status === 'pending' && message.category === 'spoiler');
    if (!batch.length) return socket.send(JSON.stringify({ type: 'notice', code: 'no_spoilers' }));
    batch.forEach(item => { item.status = 'opened'; });
    logFlow('revelacion_final', { cantidad: batch.length, ids: batch.map(item => item.id) });
    broadcast({ type: 'reveal-spoilers', items: batch });
    broadcast({ type: 'state', data: state() });
  } else if (command.type === 'discard') {
    const item = messages.find(message => message.id === command.id);
    if (item) { item.status = 'discarded'; logFlow('retirado_por_streamer', { id: item.id, author: item.author, category: item.category }); }
    broadcast({ type: 'state', data: state() });
  } else if (command.type === 'filter') {
    store.setFilter(command.category);
    broadcast({ type: 'filter', category: store.selectedFilter });
    broadcast({ type: 'state', data: state() });
  }
}

function acceptMessage({ author, text, source = 'simulator', emotesRemoved = 0 }) {
  const rawText = String(text || '').trim();
  author = String(author || 'Invitado').trim().slice(0, 28) || 'Invitado';
  const id = store.nextId();
  logFlow('recibido', { id, source, author, text: rawText, ...(emotesRemoved ? { emotesRemoved } : {}) });
  if (process.env.GEMINI_API_KEY && (rawText.includes(process.env.GEMINI_API_KEY) || author.includes(process.env.GEMINI_API_KEY))) {
    logFlow('descartado', { id, code: 'secret', etapa: 'protección de secretos', motivo: 'el contenido coincide con una clave configurada' });
    return { accepted: false, reason: 'secret' };
  }
  const rawDropReason = dropReason(rawText);
  if (rawDropReason) {
    logFlow('descartado', { id, code: 'noise', etapa: 'filtro rápido', motivo: rawDropReason });
    return { accepted: false, reason: 'noise' };
  }
  const tagged = parseCategoryTag(rawText);
  text = tagged.text;
  if (tagged.category) logFlow('etiqueta_detectada', { id, etiqueta: tagged.category, texto: text });
  else if (/^\s*&[\p{L}]+(?:\s|:|$)/u.test(rawText)) logFlow('etiqueta_ignorada', { id, motivo: 'etiqueta no reconocida; se clasificará automáticamente' });
  const taggedDropReason = dropReason(text);
  if (taggedDropReason) {
    logFlow('descartado', { id, code: 'tag_too_short', etapa: 'validación tras etiqueta', motivo: taggedDropReason });
    return { accepted: false, reason: 'tag_too_short' };
  }
  const normalized = normalizeQuestion(text);
  const now = Date.now(), duplicateKey = `${author.toLowerCase()}\0${normalized}`, previous = recentMessages.get(duplicateKey);
  if (previous && now - previous < 20000) {
    logFlow('descartado', { id, code: 'duplicate', etapa: 'filtro de duplicados', motivo: 'mismo autor y texto dentro de 20 segundos' });
    return { accepted: false, reason: 'duplicate' };
  }
  if (incomingMessages.length >= MAX_PENDING_MESSAGES) {
    if (now - lastQueueWarning > 10000) {
      lastQueueWarning = now;
      broadcast({ type: 'notice', code: 'queue_full' });
    }
    logFlow('descartado', { id, code: 'queue_full', etapa: 'cola de ráfaga', motivo: 'cola llena', pendientes: incomingMessages.length });
    return { accepted: false, reason: 'queue_full' };
  }
  recentMessages.set(duplicateKey, now);
  if (recentMessages.size > 1000) for (const [key, timestamp] of recentMessages) if (now - timestamp > 20000) recentMessages.delete(key);
  incomingMessages.push({ id, author, text, categoryHint: tagged.category, source, timestamp: now, gameTitle: currentGameTitle });
  logFlow('en_cola_de_analisis', { id, pendientes: incomingMessages.length, etiqueta: tagged.category || null, juego: currentGameTitle || null });
  if (incomingMessages.length >= MAX_BATCH) {
    clearTimeout(batchTimer);
    batchTimer = null;
    void flushIncomingMessages();
  } else if (!batchTimer) batchTimer = setTimeout(() => { batchTimer = null; void flushIncomingMessages(); }, 2300);
  return { accepted: true };
}

async function flushIncomingMessages() {
  if (processingBatch) return;
  processingBatch = true;
  clearTimeout(batchTimer);
  batchTimer = null;
  try {
    while (incomingMessages.length) {
      const batchTitle = incomingMessages[0].gameTitle;
      const batch = [];
      for (let index = 0; index < incomingMessages.length && batch.length < MAX_FLUSH_BATCH;) {
        if (incomingMessages[index].gameTitle === batchTitle) batch.push(...incomingMessages.splice(index, 1));
        else index++;
      }
      logFlow('lote_iniciado', { cantidad: batch.length, ids: batch.map(message => message.id), juego: batchTitle || null });
      let analyses;
      try {
        analyses = await classifyMessages(batch.map(({ id, text, categoryHint }) => ({ id, text, categoryHint })), {
          gameTitle: batchTitle,
          streamerLanguage,
          onStatus: status => broadcast({ type: 'ai-status', status }),
          onLog: logFlow
        });
      } catch {
        analyses = batch.map(message => ({ id: message.id, ...analyze(message.text) }));
        logFlow('gemini_error', { cantidad: batch.length, accion: 'se usará el clasificador local' });
        broadcast({ type: 'ai-status', status: { ...getAiStatus(), state: 'fallback', message: 'Error del clasificador; usando respaldo local' } });
      }
      const resultsById = new Map(analyses.map(result => [result.id, result]));
      for (const message of batch) {
        const result = resultsById.get(message.id);
        const localSafety = analyze(message.text).safe;
        if (!localSafety) {
          logFlow('descartado', { id: message.id, code: 'unsafe_local', etapa: 'filtro local de seguridad', motivo: 'detectó posible abuso, contenido sexual, datos personales o prompt injection', resultadoIA: result || null });
          continue;
        }
        if (!result || !result.keep || !result.safe || result.category === 'descartar') {
          const reason = !result ? 'sin resultado del clasificador' : !result.safe ? 'Gemini marcó el mensaje como no seguro' : !result.keep ? 'Gemini decidió no conservarlo' : 'categoría descartar';
          const code = !result ? 'ai_no_result' : !result.safe ? 'ai_unsafe' : !result.keep ? 'ai_not_kept' : 'ai_discard';
          logFlow('descartado', { id: message.id, code, etapa: 'decisión del clasificador', motivo: reason, resultadoIA: result || null });
          continue;
        }
        const item = {
          id: message.id,
          author: message.author,
          text: message.text,
          translatedText: result.translatedText,
          sourceLanguage: result.sourceLanguage,
          category: result.category,
          highlight: result.highlight,
          featured: result.highlight,
          status: 'pending',
          timestamp: message.timestamp,
          source: message.source
        };
        store.add(item);
        logFlow('aceptado_en_maquina', { id: item.id, author: item.author, category: item.category, sourceLanguage: item.sourceLanguage, translatedText: item.translatedText, highlight: item.highlight });
        broadcast({ type: 'gum', item });
      }
      broadcast({ type: 'state', data: state() });
    }
  } finally {
    processingBatch = false;
    if (incomingMessages.length && !batchTimer) batchTimer = setTimeout(() => { batchTimer = null; void flushIncomingMessages(); }, incomingMessages.length >= MAX_BATCH ? 0 : 2300);
  }
}

function state() {
  return { ...store.snapshot(streamerLanguage), gameTitle: currentGameTitle, settings };
}

function normalizeSettings(input, current) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error(), { code: 'invalid_settings' });
  const next = structuredClone(input.reset === true ? DEFAULT_SETTINGS : current);
  const fail = code => { throw Object.assign(new Error(), { code }); };
  const bool = value => { if (typeof value !== 'boolean') fail('invalid_settings'); return value; };
  if (Object.hasOwn(input, 'uiLanguage')) { const value=String(input.uiLanguage).toLowerCase(); if(!UI_LANGUAGES.has(value))fail('unsupported_language'); next.uiLanguage=value; }
  if (Object.hasOwn(input, 'streamerLanguage')) { const value=String(input.streamerLanguage).toLowerCase(); if(!LANGUAGE_OPTIONS.has(value))fail('unsupported_language'); next.streamerLanguage=value; }
  if (input.overlay !== undefined) {
    if(!input.overlay||typeof input.overlay!=='object'||Array.isArray(input.overlay))fail('invalid_settings');
    if(Object.hasOwn(input.overlay,'position')){if(!['left','right'].includes(input.overlay.position))fail('invalid_settings');next.overlay.position=input.overlay.position;}
    if(Object.hasOwn(input.overlay,'scale')){const n=Number(input.overlay.scale);if(!Number.isFinite(n))fail('invalid_settings');next.overlay.scale=Math.max(.45,Math.min(1.15,n));}
    if(Object.hasOwn(input.overlay,'showStatus'))next.overlay.showStatus=bool(input.overlay.showStatus);
  }
  if (input.card !== undefined) {
    const card=input.card;if(!card||typeof card!=='object'||Array.isArray(card))fail('invalid_settings');
    for(const [key,values] of Object.entries({textMode:['translated','original','both'],position:['auto','top-left','top-right','bottom-left','bottom-right','center'],size:['s','m','l'],animation:['bounce','fade','none']})){if(Object.hasOwn(card,key)){if(!values.includes(card[key]))fail('invalid_settings');next.card[key]=card[key];}}
    for(const key of ['showAuthor','showLanguage','showStamp','showBadge'])if(Object.hasOwn(card,key))next.card[key]=bool(card[key]);
    for(const [key,min,max] of [['durationSec',4,20],['maxChars',60,260]])if(Object.hasOwn(card,key)){const n=Number(card[key]);if(!Number.isFinite(n))fail('invalid_settings');next.card[key]=Math.round(Math.max(min,Math.min(max,n))*(key==='durationSec'?10:1))/(key==='durationSec'?10:1);}
    if(card.categories!==undefined){if(!card.categories||typeof card.categories!=='object'||Array.isArray(card.categories))fail('invalid_settings');for(const [name,value] of Object.entries(card.categories)){if(!Object.hasOwn(next.card.categories,name)||!value||typeof value!=='object')fail('unsupported_category');const category=next.card.categories[name];if(Object.hasOwn(value,'enabled'))category.enabled=bool(value.enabled);for(const field of ['label','stamp'])if(Object.hasOwn(value,field)){if(typeof value[field]!=='string')fail('invalid_settings');category[field]=value[field].trim().slice(0,24);}}}
  }
  return next;
}

function loadSettings() {
  try { return normalizeSettings(JSON.parse(fs.readFileSync(SETTINGS_PATH,'utf8')), DEFAULT_SETTINGS); }
  catch { return structuredClone(DEFAULT_SETTINGS); }
}

function loadStreamerLanguage() {
  try {
    const saved = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    if (LANGUAGE_OPTIONS.has(saved.streamerLanguage)) return saved.streamerLanguage;
  } catch { /* Use the environment default when no local setting exists. */ }
  const configured = String(process.env.STREAMER_LANGUAGE || 'es').toLowerCase();
  return LANGUAGE_OPTIONS.has(configured) ? configured : 'es';
}

function parseCategoryTag(rawText) {
  const match = String(rawText).match(/^\s*&([\p{L}]+)(?:\s*:\s*|\s+|$)/u);
  if (!match) return { category: null, text: String(rawText).trim() };
  const tag = match[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const categories = { pista: 'pista', hint:'pista', reto: 'reto', challenge:'reto', animo: 'animo', cheer:'animo', prediccion: 'prediccion', prediction:'prediccion', spoiler: 'spoiler' };
  const category = categories[tag];
  return category ? { category, text: String(rawText).slice(match[0].length).trim() } : { category: null, text: String(rawText).trim() };
}

function normalizeQuestion(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of clients) if (client.readyState === 1) client.send(payload);
}

function logFlow(stage, details = {}) {
  const secret = process.env.GEMINI_API_KEY;
  function sanitize(value) {
    if (typeof value === 'string') {
      let text = value.replace(/[\r\n\u0000-\u001f]/g, ' ');
      if (secret) text = text.split(secret).join('[clave omitida]');
      return text.length > 500 ? `${text.slice(0, 500)}…[truncado]` : text;
    }
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
    return value;
  }
  const entry = { timestamp: new Date().toISOString(), stage, details: sanitize(details) };
  console.log(`[flujo-mensaje] ${stage} ${JSON.stringify(entry.details)}`);
  flowLogHistory.push(entry);
  if (flowLogHistory.length > 300) flowLogHistory.shift();
  const payload = JSON.stringify({ type: 'message-log', entry });
  for (const client of clients) if (client.clientType === 'panel' && client.readyState === 1) client.send(payload);
}

function broadcastToOverlays(data) {
  const payload=JSON.stringify(data);
  for(const client of clients)if(client.clientType==='overlay'&&client.readyState===1)client.send(payload);
}

function serveStatic(urlPath, res) {
  let route = urlPath;
  if (route === '/') route = '/panel/index.html';
  else if (route === '/panel') route = '/panel/index.html';
  else if (route === '/overlay') route = '/overlay/index.html';
  else if (route === '/instructivos') route = '/instructivos/index.html';
  else if (route === '/login') route = '/login/index.html';
  const target = path.resolve(PUBLIC, `.${decodeURIComponent(route)}`);
  if (!target.startsWith(PUBLIC + path.sep)) return json(res, 403, { error: 'Prohibido' });
  fs.readFile(target, (error, data) => {
    if (error) return json(res, 404, { error: 'No encontrado' });
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': `http://localhost:${PORT}`
  });
  res.end(JSON.stringify(data));
}

function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* .env is optional */ }
}
