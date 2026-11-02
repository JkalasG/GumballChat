const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
loadEnv();

const { EventSubClient } = require('./chat/eventsub');
const { AnonymousIrcClient } = require('./chat/anonymous-irc');
const { createSimulator } = require('./chat/simulator');
const { GumballState } = require('./state');
const { shouldDrop, analyze } = require('./ai/local-fallback');
const { classifyMessages, getStatus: getAiStatus, MAX_BATCH } = require('./ai/classifier');

const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || '127.0.0.1');
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
const incomingMessages = [];
const recentMessages = new Map();
let batchTimer = null;
let processingBatch = false;
let lastQueueWarning = 0;
let currentGameTitle = '';

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
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
    const categories = Object.keys(samples);
    for (let index = 0; index < 50; index++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const choices = samples[category];
      const text = choices[Math.floor(Math.random() * choices.length)];
      const item = {
        id: store.nextId(), author: `Invitado${String(index + 1).padStart(2, '0')}`,
        text, translatedText: text,
        sourceLanguage: 'es', category, highlight: false, featured: false,
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
      } catch { json(res, 400, { ok: false, error: 'JSON inválido' }); }
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
      } catch { json(res, 400, { ok: false, error: 'JSON inválido' }); }
    });
    return;
  }
  if (url.pathname === '/api/twitch/connect' && req.method === 'POST') {
    if (!chatClient) return json(res, 400, { ok: false, error: 'CHAT_MODE=simulator está activo; selecciona anonymous o eventsub en .env para conectar Twitch.' });
    chatClient.connect().then(result => json(res, result.ok ? 200 : 400, result));
    return;
  }
  if (url.pathname === '/api/twitch/status') return json(res, 200, { mode: CHAT_MODE, channel: process.env.TWITCH_CHANNEL_LOGIN || null, ...(chatClient?.status || { connected: false, configured: true }) });
  serveStatic(url.pathname, res);
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
wss.on('connection', (socket, request) => {
  socket.clientType = new URL(request.url, 'http://localhost').searchParams.get('client') === 'overlay' ? 'overlay' : 'panel';
  clients.add(socket);
  socket.send(JSON.stringify({ type: 'state', data: state() }));
  socket.send(JSON.stringify({ type: 'ai-status', status: getAiStatus() }));
  socket.on('message', raw => {
    try { handleCommand(socket, JSON.parse(raw.toString())); }
    catch { socket.send(JSON.stringify({ type: 'error', message: 'Comando inválido' })); }
  });
  socket.on('close', () => clients.delete(socket));
});

const simulator = createSimulator(acceptMessage);
const eventSub = new EventSubClient({ acceptMessage, broadcast });
const anonymousIrc = new AnonymousIrcClient({ acceptMessage, broadcast });
const chatClient = CHAT_MODE === 'eventsub' ? eventSub : CHAT_MODE === 'anonymous' ? anonymousIrc : null;

httpServer.listen(PORT, HOST, () => {
  console.log(`Gumball Chat listo: http://localhost:${PORT}`);
  console.log(`Modo de chat: ${CHAT_MODE}. El simulador local sigue disponible.`);
});

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
    if (!item) return socket.send(JSON.stringify({ type: 'notice', message: 'No hay bolitas disponibles con ese filtro.' }));
    item.status = 'opened';
    broadcast({ type: 'opened', item });
    broadcast({ type: 'state', data: state() });
  } else if (command.type === 'open-id') {
    const item = messages.find(message => message.id === command.id && message.status === 'pending' && message.category !== 'spoiler');
    if (!item) return socket.send(JSON.stringify({ type: 'notice', message: 'Esa bolita no se puede abrir.' }));
    item.status = 'opened';
    broadcast({ type: 'opened', item });
    broadcast({ type: 'state', data: state() });
  } else if (command.type === 'reveal-spoilers') {
    const batch = messages.filter(message => message.status === 'pending' && message.category === 'spoiler');
    if (!batch.length) return socket.send(JSON.stringify({ type: 'notice', message: 'No hay spoilers sellados.' }));
    batch.forEach(item => { item.status = 'opened'; });
    broadcast({ type: 'reveal-spoilers', items: batch });
    broadcast({ type: 'state', data: state() });
  } else if (command.type === 'discard') {
    const item = messages.find(message => message.id === command.id);
    if (item) item.status = 'discarded';
    broadcast({ type: 'state', data: state() });
  } else if (command.type === 'filter') {
    store.setFilter(command.category);
    broadcast({ type: 'filter', category: store.selectedFilter });
    broadcast({ type: 'state', data: state() });
  }
}

function acceptMessage({ author, text, source = 'simulator' }) {
  const rawText = String(text || '').trim();
  author = String(author || 'Invitado').trim().slice(0, 28) || 'Invitado';
  if (process.env.GEMINI_API_KEY && (rawText.includes(process.env.GEMINI_API_KEY) || author.includes(process.env.GEMINI_API_KEY))) {
    return { accepted: false, reason: 'Mensaje descartado por contener un secreto del servidor.' };
  }
  if (shouldDrop(rawText)) return { accepted: false, reason: 'Mensaje vacío, demasiado corto, largo o ruido repetido.' };
  const tagged = parseCategoryTag(rawText);
  text = tagged.text;
  if (shouldDrop(text)) return { accepted: false, reason: 'La etiqueta necesita un mensaje de al menos 4 caracteres.' };
  const normalized = normalizeQuestion(text);
  const now = Date.now(), duplicateKey = `${author.toLowerCase()}\0${normalized}`, previous = recentMessages.get(duplicateKey);
  if (previous && now - previous < 20000) return { accepted: false, reason: 'Mensaje duplicado.' };
  if (incomingMessages.length >= MAX_PENDING_MESSAGES) {
    if (now - lastQueueWarning > 10000) {
      lastQueueWarning = now;
      broadcast({ type: 'notice', message: 'La cola de análisis está llena por una ráfaga; espera un momento y vuelve a enviar.' });
    }
    return { accepted: false, reason: 'La cola de análisis está temporalmente llena.' };
  }
  recentMessages.set(duplicateKey, now);
  if (recentMessages.size > 1000) for (const [key, timestamp] of recentMessages) if (now - timestamp > 20000) recentMessages.delete(key);
  incomingMessages.push({ id: store.nextId(), author, text, categoryHint: tagged.category, source, timestamp: now, gameTitle: currentGameTitle });
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
      let analyses;
      try {
        analyses = await classifyMessages(batch.map(({ id, text, categoryHint }) => ({ id, text, categoryHint })), {
          gameTitle: batchTitle,
          streamerLanguage,
          onStatus: status => broadcast({ type: 'ai-status', status })
        });
      } catch {
        analyses = batch.map(message => ({ id: message.id, ...analyze(message.text) }));
        broadcast({ type: 'ai-status', status: { ...getAiStatus(), state: 'fallback', message: 'Error del clasificador; usando respaldo local' } });
      }
      const resultsById = new Map(analyses.map(result => [result.id, result]));
      for (const message of batch) {
        const result = resultsById.get(message.id);
        if (!analyze(message.text).safe) continue;
        if (!result || !result.keep || !result.safe || result.category === 'descartar') continue;
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
  const target = path.resolve(PUBLIC, `.${decodeURIComponent(route)}`);
  if (!target.startsWith(PUBLIC + path.sep)) return json(res, 403, { error: 'Prohibido' });
  fs.readFile(target, (error, data) => {
    if (error) return json(res, 404, { error: 'No encontrado' });
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
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
