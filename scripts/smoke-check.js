const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const vm = require('node:vm');
const { WebSocket } = require('ws');
const { analyze, shouldDrop } = require('../server/ai/local-fallback');
const { samples } = require('../server/chat/simulator');
const { AnonymousIrcClient } = require('../server/chat/anonymous-irc');

const port = 32000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
const settingsFile = path.join(os.tmpdir(), `gumball-settings-smoke-${process.pid}.json`);
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', CHAT_MODE: 'simulator', GUMBALL_SETTINGS_PATH: settingsFile, GEMINI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

const queue = [];
const waiters = [];
let socket;
let overlaySocket;

function receive(data) {
  const index = waiters.findIndex(waiter => waiter.predicate(data));
  if (index >= 0) {
    const [waiter] = waiters.splice(index, 1);
    clearTimeout(waiter.timer);
    waiter.resolve(data);
  } else queue.push(data);
}

function waitFor(predicate, timeoutMs = 6000) {
  const index = queue.findIndex(predicate);
  if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve, reject };
    waiter.timer = setTimeout(() => {
      const position = waiters.indexOf(waiter);
      if (position >= 0) waiters.splice(position, 1);
      reject(new Error('Timeout esperando el evento WebSocket.'));
    }, timeoutMs);
    waiters.push(waiter);
  });
}

async function request(path, options) {
  const response = await fetch(`${base}${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function waitUntilReady() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { if ((await request('/health')).ok) return; } catch { /* still starting */ }
    if (child.exitCode !== null) throw new Error(`El servidor terminó al arrancar.\n${output}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`El servidor no respondió a tiempo.\n${output}`);
}

async function simulate(author, text) {
  return request('/api/simulate', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author, text, gameTitle: 'Smoke Test Game' })
  });
}

async function verifyGeminiRestContract() {
  const previousFetch = global.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_MODEL;
  const batchSizes = [];
  const trace = [];
  let calls = 0;
  process.env.GEMINI_API_KEY = 'smoke-secret-never-return-this';
  process.env.GEMINI_MODEL = 'smoke-model';
  const { classifyMessages, getStatus } = require('../server/ai/classifier');
  global.fetch = async (url, options) => {
    calls++;
    if (!String(url).endsWith('/smoke-model:generateContent')) throw new Error('No usó GEMINI_MODEL.');
    if (options.headers['x-goog-api-key'] !== process.env.GEMINI_API_KEY) throw new Error('No envió la clave en el header privado.');
    const payload = JSON.parse(options.body);
    if (payload.generationConfig.responseMimeType !== 'application/json' || payload.generationConfig.responseJsonSchema.properties.results.type !== 'array') throw new Error('Falta el contrato de JSON estructurado.');
    if (!payload.systemInstruction.parts[0].text.includes('datos no confiables')) throw new Error('Falta la instrucción contra prompt injection.');
    const input = JSON.parse(payload.contents[0].parts[0].text);
    if (input.gameTitle !== 'Juego Smoke') throw new Error('No se envió el contexto del juego.');
    batchSizes.push(input.messages.length);
    if (calls === 1) return new Response('', { status: 429, headers: { 'retry-after': '0.001' } });
    if (calls === 2) return new Response(JSON.stringify({ error: { message: 'temporary overload' } }), { status: 503 });
    const results = input.messages.map(message => ({ id: message.id, keep: true, category: 'pista', sourceLanguage: 'en', translatedText: 'Pista traducida', highlight: false, safe: true }));
    if (input.messages[0]?.id === 'test-10') results[0].safe = 'yes';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ results }) }] } }] }), { status: 200 });
  };
  try {
    const input = Array.from({ length: 11 }, (_, index) => ({ id: `test-${index}`, text: `hint ${index}` }));
    const result = await classifyMessages(input, { gameTitle: 'Juego Smoke', onLog: (stage, details) => trace.push({ stage, details }) });
    if (result.length !== 11 || result.slice(0, 10).some(item => !item.keep || item.category !== 'pista') || result[10].keep || result[10].category !== 'descartar') throw new Error('No validó/descartó el resultado simulado de Gemini.');
    if (calls !== 4 || batchSizes.slice().sort((a,b)=>a-b).join(',') !== '1,1,10,10') throw new Error('Lotes o reintentos inesperados: llamadas=' + calls + ', lotes=' + batchSizes);
    if (!trace.some(item => item.stage === 'gemini_retry' && item.details.status === 503)) throw new Error('No se reintentó el error temporal HTTP 503.');
    if (JSON.stringify(getStatus()).includes('smoke-secret-never-return-this')) throw new Error('El estado expone la clave Gemini.');
    if (!trace.some(item => item.stage === 'gemini_request') || !trace.some(item => item.stage === 'gemini_response') || !trace.some(item => item.stage === 'gemini_retry')) throw new Error('No se emitió la trazabilidad de solicitud, respuesta y reintento de Gemini.');
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = previousModel;
  }
}

async function verifyTwitchConnectionState() {
  const previousWebSocket = global.WebSocket;
  const previousChannel = process.env.TWITCH_CHANNEL_LOGIN;
  class FakeWebSocket {
    static OPEN = 1;
    constructor(url) { this.url=url; this.readyState=0; this.listeners={}; this.sent=[]; FakeWebSocket.last=this; }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    emit(type, data={}) { for(const callback of this.listeners[type]||[])callback(data); }
    send(value) { this.sent.push(value); }
    close() { this.readyState=3; this.emit('close'); }
  }
  global.WebSocket = FakeWebSocket;
  process.env.TWITCH_CHANNEL_LOGIN = 'configured_channel';
  const statuses=[];
  const client=new AnonymousIrcClient({acceptMessage(){},broadcast:event=>statuses.push(event)});
  try {
    const result=await client.connect('test_channel');
    if(!result.ok||client.status.connected||!client.status.connecting||client.status.channel!=='test_channel')throw new Error('La conexión IRC no usa el canal escrito o se marca conectada antes de tiempo.');
    const socket=FakeWebSocket.last;
    socket.readyState=FakeWebSocket.OPEN;socket.emit('open');
    if(!socket.sent.some(line=>line.includes('JOIN #test_channel')))throw new Error('El adaptador IRC no se unió al canal de prueba.');
    socket.emit('message',{data:':justinfan123!x@x.tmi.twitch.tv JOIN #test_channel\r\n'});
    if(!client.status.connected||client.status.connecting||!statuses.some(event=>event.connected&&event.channel==='test_channel'))throw new Error('El adaptador IRC no espera la confirmación del canal para marcar conexión.');
    client.disconnect();
    if(client.status.connected)throw new Error('El adaptador IRC no limpia su estado al desconectar.');
  } finally {
    global.WebSocket=previousWebSocket;
    if(previousChannel===undefined)delete process.env.TWITCH_CHANNEL_LOGIN;else process.env.TWITCH_CHANNEL_LOGIN=previousChannel;
  }
}

async function run() {
  await verifyTwitchConnectionState();
  console.log('✓ Twitch IRC: canal editable, confirmación real de unión y desconexión');
  await waitUntilReady();
  const [panel, overlay, panelScript, overlayScript, panelCss, overlayCss, sharedTheme, matter, font, sampleList, aiStatus, sharedI18n, settings, activityScript, panelConfig, twitchStatus] = await Promise.all([
    request('/'), request('/overlay'), request('/panel/panel.js'), request('/overlay/overlay.js'),
    request('/panel/panel.css'), request('/overlay/overlay.css'), request('/shared/theme.css'),
    request('/vendor/matter.min.js'), request('/vendor/fonts/BagelFatOne-latin.woff2'), request('/api/samples'), request('/api/ai/status'), request('/shared/i18n.js'), request('/api/settings'), request('/panel/activity.js'), request('/panel/twitch.js'), request('/api/twitch/status')
  ]);
  if (!panel.includes('id="view-activity"') || !panel.includes('data-nav-view="activity"') || !panel.includes('/panel/activity.js') || !activityScript.includes('gumball-message-log')) throw new Error('La vista de actividad en vivo no está conectada.');
  if (!panel.includes('id="connection-chip-label"') || !panel.includes('data-i18n="panel.twitchOffline"')) throw new Error('El panel no inicia con el estado Twitch desconectado y visible.');
  if (!panel.includes('/panel/panel.js') || !panel.includes('id="game-title"') || !panel.includes('id="ai-status"')) throw new Error('El panel no contiene contexto de juego o estado de IA.');
  if (!overlay.includes('/vendor/matter.min.js') || !overlay.includes('/shared/i18n.js') || !overlay.includes('/overlay/overlay.js')) throw new Error('El overlay no referencia Matter.js, i18n local o su script.');
  if (!settings.uiLanguage || !settings.card || !sharedI18n.includes('const DICTS = { en, es }')) throw new Error('Faltan los ajustes completos o el archivo i18n.');
  if (twitchStatus.connected || twitchStatus.mode !== 'simulator') throw new Error('El simulador reporta incorrectamente una conexión real a Twitch.');
  const invalidConnect = await fetch(`${base}/api/twitch/connect`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({channel:'no es un canal!'}) });
  if (invalidConnect.status !== 400 || (await invalidConnect.json()).error !== 'invalid_channel') throw new Error('La API no rechaza un nombre de canal inválido.');
  if (twitchStatus.state !== 'disconnected' || twitchStatus.defaultChannel === undefined) throw new Error('El estado de Twitch no informa el estado ni el canal predeterminado.');
  if (!panel.includes('id="twitch-bar"') || !panel.includes('twitch-channel-input') || !panel.includes('twitch-chat-link') || !panelConfig.includes('twitch.toastConnected') || !panelConfig.includes('twitch.toastFailed')) throw new Error('Falta el selector de canal, enlace de chat o confirmación visible de conexión Twitch.');
  const dictionaryWindow = {};
  vm.runInNewContext(sharedI18n, { window: dictionaryWindow });
  const dicts = dictionaryWindow.I18N.DICTS;
  const keys = value => Object.keys(value).sort().map(key => [key, value[key] && typeof value[key] === 'object' ? keys(value[key]) : null]);
  if (JSON.stringify(keys(dicts.en)) !== JSON.stringify(keys(dicts.es))) throw new Error(`Las claves de idioma inglés y español no coinciden: en-only=${JSON.stringify(Object.keys(dicts.en.panel).filter(key=>!Object.hasOwn(dicts.es.panel,key)))} es-only=${JSON.stringify(Object.keys(dicts.es.panel).filter(key=>!Object.hasOwn(dicts.en.panel,key)))}`);
  const invalidLanguage = await fetch(`${base}/api/settings`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({uiLanguage:'xx'}) });
  if (invalidLanguage.status !== 400) throw new Error('La API aceptó un idioma de interfaz no compatible.');
  const limited = await request('/api/settings', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({card:{durationSec:999}}) });
  if (limited.settings.card.durationSec !== 20) throw new Error('La duración de tarjeta no se limitó a 20 segundos.');
  const restored = await request('/api/settings', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({reset:true}) });
  if (restored.settings.card.durationSec !== 7.2) throw new Error('No se pudieron restablecer los valores iniciales.');
  if (!matter.includes('Matter.Engine')) throw new Error('No se sirvió Matter.js local.');
  if (!panelScript.includes('original-toggle') || !panelScript.includes('escapeHtml') || !overlayScript.includes('Engine.update(engine') || !overlayScript.includes('Bodies.rectangle')) throw new Error('No se sirvieron scripts actualizados o seguros.');
  if (!panelCss.includes('.ai-indicator') || !overlayCss.includes('background:transparent')) throw new Error('No se sirvieron los estilos del frontend.');
  if (!sharedTheme.includes('--ink') || !Array.isArray(sampleList) || sampleList.length < 10) throw new Error('Faltan estilos comunes o fixtures del simulador.');
  if (!font || !sharedTheme.includes('/vendor/fonts/BagelFatOne-latin.woff2')) throw new Error('No se sirvieron las fuentes locales.');
  if (aiStatus.state !== 'paused') throw new Error('El smoke check debe arrancar con Gemini deshabilitada y respaldo local activo.');
  console.log('✓ HTTP: panel, overlay, vendor, muestras y estado IA');

  const expected = {
    'hint-es': 'pista', 'hint-en': 'pista', 'spoiler-en': 'spoiler', 'spoiler-ja': 'spoiler',
    'prediction-pt': 'prediccion', 'prediction-es': 'prediccion', 'cheer-fr': 'animo', 'cheer-ja': 'animo',
    'challenge-ja': 'reto', 'challenge-fr': 'reto'
  };
  for (const sample of sampleList.filter(item => expected[item.id])) {
    const cleanText = sample.text.replace(/^&[\p{L}]+\s*/u, '');
    const analysis = analyze(cleanText);
    const tag = sample.text.match(/^&([\p{L}]+)/u)?.[1];
    const taggedCategory = ({ hint:'pista', pista:'pista', challenge:'reto', reto:'reto', cheer:'animo', animo:'animo', prediction:'prediccion', prediccion:'prediccion', spoiler:'spoiler' })[tag];
    if (taggedCategory && analysis.safe) { analysis.keep = true; analysis.category = taggedCategory; }
    if (!analysis.keep || analysis.category !== expected[sample.id] || analysis.sourceLanguage !== sample.language) {
      throw new Error(`Fallback clasificó mal ${sample.id}: ${JSON.stringify(analysis)}`);
    }
  }
  const offensive = analyze(sampleList.find(item => item.id === 'offensive').text);
  const injection = analyze(sampleList.find(item => item.id === 'prompt-injection').text);
  const englishChallenge = analyze('I dare you to use more diamonds');
  if (!englishChallenge.safe || !englishChallenge.keep || englishChallenge.category !== 'reto') throw new Error('El fallback no reconoce el reto en inglés.');
  if (offensive.safe || offensive.keep || injection.safe || injection.keep) throw new Error('El fallback local dejó pasar un mensaje inseguro o prompt injection.');
  if (!shouldDrop(sampleList.find(item => item.id === 'noise').text)) throw new Error('El filtro local no eliminó ruido.');
  console.log('✓ Fallback local: cinco categorías, cinco idiomas, ruido, ofensa e inyección');
  await verifyGeminiRestContract();
  console.log('✓ Gemini REST simulado: modelo, clave privada, contexto, JSON, lotes de 10 y reintento 429');

  socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket.on('message', raw => { try { receive(JSON.parse(raw.toString())); } catch { /* ignore malformed event */ } });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  const initialState = await waitFor(event => event.type === 'state');
  if (!initialState.data.settings?.uiLanguage || !initialState.data.settings?.card) throw new Error('El WebSocket inicial no incluyó la configuración.');
  await waitFor(event => event.type === 'ai-status' && event.status.state === 'paused');
  overlaySocket = new WebSocket(`ws://127.0.0.1:${port}/ws?client=overlay`);
  const overlayEvents = [];
  overlaySocket.on('message', raw => { try { overlayEvents.push(JSON.parse(raw.toString())); } catch { /* ignore malformed event */ } });
  await new Promise((resolve, reject) => { overlaySocket.once('open', resolve); overlaySocket.once('error', reject); });
  const previewCount = initialState.data.messages.length;
  socket.send(JSON.stringify({ type:'preview-card', category:'reto' }));
  const previewDeadline = Date.now() + 2000;
  while (Date.now() < previewDeadline && !overlayEvents.some(event => event.type === 'preview-card')) await new Promise(resolve => setTimeout(resolve, 20));
  const preview = overlayEvents.find(event => event.type === 'preview-card');
  if (!preview || preview.item.category !== 'reto' || preview.item.preview !== true) throw new Error('La vista previa no llegó al overlay.');
  if ((await request('/api/state')).messages.length !== previewCount) throw new Error('La vista previa modificó la cola de mensajes.');
  const acceptedHint = await simulate('SmokeTester', '&hint the key is behind the door.');
  const acceptedSpoiler = await simulate('SmokeTester2', '&spoiler the final boss is the captain.');
  const rejectedNoise = await simulate('SmokeNoise', 'wow wow wow wow');
  if (!acceptedHint.ok || !acceptedSpoiler.ok) throw new Error('El filtro local rechazó los mensajes de prueba válidos.');
  if (rejectedNoise.ok) throw new Error('El filtro aceptó un mensaje repetido.');
  const receivedLog = await waitFor(event => event.type === 'message-log' && event.entry.stage === 'recibido');
  const tagLog = await waitFor(event => event.type === 'message-log' && event.entry.stage === 'etiqueta_detectada');
  const rejectLog = await waitFor(event => event.type === 'message-log' && event.entry.stage === 'descartado');
  if (!receivedLog.entry.details.text || !tagLog.entry.details.etiqueta || !rejectLog.entry.details.motivo) throw new Error('La vista en vivo no entrega detalle de recepción, etiqueta o descarte.');
  const localLog = await waitFor(event => event.type === 'message-log' && event.entry.stage === 'local_result');
  if (!localLog.entry.details.category) throw new Error('No se publicó el resultado del clasificador local al panel.');
  const hintEvent = await waitFor(event => event.type === 'gum' && event.item.author === 'SmokeTester');
  const spoilerEvent = await waitFor(event => event.type === 'gum' && event.item.author === 'SmokeTester2');
  const hint = hintEvent.item;
  const spoiler = spoilerEvent.item;
  if (hint.category !== 'pista' || spoiler.category !== 'spoiler') throw new Error('La clasificación por lotes local cambió.');
  console.log('✓ Lote asíncrono usa fallback local y añade solo candidatos válidos');

  socket.send(JSON.stringify({ type: 'open-id', id: hint.id }));
  const opened = await waitFor(event => event.type === 'opened' && event.item.id === hint.id);
  if (opened.item.status !== 'opened') throw new Error('La pista no se abrió.');
  socket.send(JSON.stringify({ type: 'open-id', id: spoiler.id }));
  await waitFor(event => event.type === 'notice' && event.code === 'cannot_open');
  let state = await request('/api/state');
  if (state.messages.find(item => item.id === spoiler.id)?.status !== 'pending') throw new Error('El spoiler dejó de estar sellado.');
  socket.send(JSON.stringify({ type: 'reveal-spoilers' }));
  const reveal = await waitFor(event => event.type === 'reveal-spoilers');
  if (reveal.items.length !== 1 || reveal.items[0].id !== spoiler.id) throw new Error('La revelación final no devolvió el spoiler esperado.');
  socket.send(JSON.stringify({ type: 'filter', category: 'reto' }));
  await waitFor(event => event.type === 'state' && event.data.selectedFilter === 'reto');
  state = await request('/api/state');
  if (state.selectedFilter !== 'reto') throw new Error('El filtro por categoría no se guardó.');
  console.log('✓ WebSocket: abrir pista, sellar/revelar spoiler y filtrar categoría');
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const stage of ['recibido', 'descartado', 'etiqueta_detectada', 'en_cola_de_analisis', 'lote_iniciado', 'aceptado_en_maquina', 'abierto_en_stream', 'revelacion_final']) {
    if (!output.includes('[flujo-mensaje] ' + stage)) throw new Error('Falta el log de trazabilidad: ' + stage);
  }
  if (!output.includes('[ia-local_result]')) throw new Error('Faltan logs de clasificación IA.');
  console.log('Logs de trazabilidad verificados.');
  console.log('\nSmoke check completado.');
}

run().catch(error => {
  console.error(`\nSmoke check falló: ${error.message}`);
  process.exitCode = 1;
}).finally(() => {
  socket?.close();
  overlaySocket?.close();
  child.kill();
  try { fs.unlinkSync(settingsFile); } catch { /* no temporary settings were written */ }
});
