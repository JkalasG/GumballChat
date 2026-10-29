const { spawn } = require('node:child_process');
const { WebSocket } = require('ws');
const { analyze, shouldDrop } = require('../server/ai/local-fallback');
const { samples } = require('../server/chat/simulator');

const port = 32000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), GEMINI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

const queue = [];
const waiters = [];
let socket;

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
    const results = input.messages.map(message => ({ id: message.id, keep: true, category: 'pista', sourceLanguage: 'en', translatedText: 'Pista traducida', highlight: false, safe: true }));
    if (input.messages[0]?.id === 'test-10') results[0].safe = 'yes';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ results }) }] } }] }), { status: 200 });
  };
  try {
    const input = Array.from({ length: 11 }, (_, index) => ({ id: `test-${index}`, text: `hint ${index}` }));
    const result = await classifyMessages(input, { gameTitle: 'Juego Smoke' });
    if (result.length !== 11 || result.slice(0, 10).some(item => !item.keep || item.category !== 'pista') || result[10].keep || result[10].category !== 'descartar') throw new Error('No validó/descartó el resultado simulado de Gemini.');
    if (calls !== 3 || batchSizes.join(',') !== '10,10,1') throw new Error(`Tamaño de lote/reintento inesperado: llamadas=${calls}, lotes=${batchSizes}.`);
    if (JSON.stringify(getStatus()).includes('smoke-secret-never-return-this')) throw new Error('El estado expone la clave Gemini.');
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = previousModel;
  }
}

async function run() {
  await waitUntilReady();
  const [panel, overlay, panelScript, overlayScript, panelCss, overlayCss, sharedTheme, matter, sampleList, aiStatus] = await Promise.all([
    request('/'), request('/overlay'), request('/panel/panel.js'), request('/overlay/overlay.js'),
    request('/panel/panel.css'), request('/overlay/overlay.css'), request('/shared/theme.css'),
    request('/vendor/matter.min.js'), request('/api/samples'), request('/api/ai/status')
  ]);
  if (!panel.includes('/panel/panel.js') || !panel.includes('id="game-title"') || !panel.includes('id="ai-status"')) throw new Error('El panel no contiene contexto de juego o estado de IA.');
  if (!overlay.includes('/vendor/matter.min.js') || !overlay.includes('/overlay/overlay.js')) throw new Error('El overlay no referencia Matter.js local o su script.');
  if (!matter.includes('Matter.Engine')) throw new Error('No se sirvió Matter.js local.');
  if (!panelScript.includes('original-toggle') || !panelScript.includes('escapeHtml') || !overlayScript.includes('Matter.Engine')) throw new Error('No se sirvieron scripts actualizados o seguros.');
  if (!panelCss.includes('.ai-indicator') || !overlayCss.includes('background:transparent')) throw new Error('No se sirvieron los estilos del frontend.');
  if (!sharedTheme.includes('--ink') || !Array.isArray(sampleList) || sampleList.length < 10) throw new Error('Faltan estilos comunes o fixtures del simulador.');
  if (aiStatus.state !== 'paused') throw new Error('El smoke check debe arrancar con Gemini deshabilitada y respaldo local activo.');
  console.log('✓ HTTP: panel, overlay, vendor, muestras y estado IA');

  const expected = {
    'hint-es': 'pista', 'hint-en': 'pista', 'spoiler-en': 'spoiler', 'spoiler-ja': 'spoiler',
    'prediction-pt': 'prediccion', 'prediction-es': 'prediccion', 'cheer-fr': 'animo', 'cheer-ja': 'animo',
    'challenge-ja': 'reto', 'challenge-fr': 'reto'
  };
  for (const sample of sampleList.filter(item => expected[item.id])) {
    const analysis = analyze(sample.text);
    if (!analysis.keep || analysis.category !== expected[sample.id] || analysis.sourceLanguage !== sample.language) {
      throw new Error(`Fallback clasificó mal ${sample.id}: ${JSON.stringify(analysis)}`);
    }
  }
  const offensive = analyze(sampleList.find(item => item.id === 'offensive').text);
  const injection = analyze(sampleList.find(item => item.id === 'prompt-injection').text);
  if (offensive.safe || offensive.keep || injection.safe || injection.keep) throw new Error('El fallback local dejó pasar un mensaje inseguro o prompt injection.');
  if (!shouldDrop(sampleList.find(item => item.id === 'noise').text)) throw new Error('El filtro local no eliminó ruido.');
  console.log('✓ Fallback local: cinco categorías, cinco idiomas, ruido, ofensa e inyección');
  await verifyGeminiRestContract();
  console.log('✓ Gemini REST simulado: modelo, clave privada, contexto, JSON, lotes de 10 y reintento 429');

  socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  socket.on('message', raw => { try { receive(JSON.parse(raw.toString())); } catch { /* ignore malformed event */ } });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  await waitFor(event => event.type === 'state');
  await waitFor(event => event.type === 'ai-status' && event.status.state === 'paused');
  const acceptedHint = await simulate('SmokeTester', 'Hint: the key is behind the door.');
  const acceptedSpoiler = await simulate('SmokeTester2', 'Spoiler: the final boss is the captain.');
  if (!acceptedHint.ok || !acceptedSpoiler.ok) throw new Error('El filtro local rechazó los mensajes de prueba válidos.');
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
  await waitFor(event => event.type === 'notice' && event.message.includes('no se puede abrir'));
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
  console.log('\nSmoke check completado.');
}

run().catch(error => {
  console.error(`\nSmoke check falló: ${error.message}`);
  process.exitCode = 1;
}).finally(() => {
  socket?.close();
  child.kill();
});
