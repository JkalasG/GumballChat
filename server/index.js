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
const STREAMER_LANGUAGE = process.env.STREAMER_LANGUAGE || 'es';
const CHAT_MODE = ['anonymous', 'eventsub', 'simulator'].includes((process.env.CHAT_MODE || '').toLowerCase())
  ? (process.env.CHAT_MODE || '').toLowerCase()
  : 'simulator';

const store = new GumballState();
const messages = store.messages;
const clients = new Set();
const incomingMessages = [];
let batchTimer = null;
let processingBatch = false;
let currentGameTitle = '';

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health') return json(res, 200, { ok: true, mode: CHAT_MODE, messages: messages.length });
  if (url.pathname === '/api/state') return json(res, 200, state());
  if (url.pathname === '/api/ai/status') return json(res, 200, getAiStatus());
  if (url.pathname === '/api/samples') return json(res, 200, simulator.samples);
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
  if (url.pathname === '/api/twitch/status') return json(res, 200, chatClient?.status || { connected: false, configured: true, mode: 'simulator' });
  serveStatic(url.pathname, res);
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
wss.on('connection', socket => {
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

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`Gumball Chat listo: http://localhost:${PORT}`);
  console.log(`Modo de chat: ${CHAT_MODE}. El simulador local sigue disponible.`);
});

function handleCommand(socket, command) {
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
  text = String(text || '').trim();
  author = String(author || 'Invitado').trim().slice(0, 28) || 'Invitado';
  if (process.env.GEMINI_API_KEY && (text.includes(process.env.GEMINI_API_KEY) || author.includes(process.env.GEMINI_API_KEY))) {
    return { accepted: false, reason: 'Mensaje descartado por contener un secreto del servidor.' };
  }
  if (shouldDrop(text)) return { accepted: false, reason: 'Mensaje vacío, demasiado corto, largo o ruido repetido.' };
  const duplicate = message => message.author.toLowerCase() === author.toLowerCase() && message.text.toLowerCase() === text.toLowerCase() && Date.now() - message.timestamp < 20000;
  if (incomingMessages.some(duplicate) || messages.some(duplicate)) return { accepted: false, reason: 'Mensaje duplicado.' };
  incomingMessages.push({ id: store.nextId(), author, text, source, timestamp: Date.now(), gameTitle: currentGameTitle });
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
      for (let index = 0; index < incomingMessages.length && batch.length < MAX_BATCH;) {
        if (incomingMessages[index].gameTitle === batchTitle) batch.push(...incomingMessages.splice(index, 1));
        else index++;
      }
      let analyses;
      try {
        analyses = await classifyMessages(batch.map(({ id, text }) => ({ id, text })), {
          gameTitle: batchTitle,
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
  return { ...store.snapshot(STREAMER_LANGUAGE), gameTitle: currentGameTitle };
}

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of clients) if (client.readyState === 1) client.send(payload);
}

function serveStatic(urlPath, res) {
  let route = urlPath;
  if (route === '/') route = '/panel/index.html';
  else if (route === '/panel') route = '/panel/index.html';
  else if (route === '/overlay') route = '/overlay/index.html';
  const target = path.resolve(PUBLIC, `.${decodeURIComponent(route)}`);
  if (!target.startsWith(PUBLIC + path.sep)) return json(res, 403, { error: 'Prohibido' });
  fs.readFile(target, (error, data) => {
    if (error) return json(res, 404, { error: 'No encontrado' });
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
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
