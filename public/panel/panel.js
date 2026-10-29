const categoryLabels = { pista: 'Pista', spoiler: 'Spoiler', prediccion: 'Predicción', animo: 'Ánimo', reto: 'Reto' };
const state = { messages: [], languageCounts: {}, filter: 'all' };
const socket = new WebSocket(`ws://${location.host}/ws`);
let gameSaveTimer;
let editingGameTitle = false;

socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.type === 'state') render(data.data);
  if (data.type === 'notice') toast(data.message);
  if (data.type === 'opened') toast('Bolita abierta en el stream');
  if (data.type === 'twitch-status') document.querySelector('#connection-label').textContent = data.connected ? 'Twitch conectado' : (data.error || 'Simulador conectado');
  if (data.type === 'ai-status') renderAiStatus(data.status);
  if (data.type === 'game-context' && !editingGameTitle) document.querySelector('#game-title').value = data.gameTitle || '';
});
socket.addEventListener('open', () => document.querySelector('#connection-label').textContent = 'Simulador conectado');

function send(command) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
  else toast('Conectando con la máquina…');
}

function render(next) {
  state.messages = next.messages || [];
  state.languageCounts = next.languageCounts || {};
  state.filter = next.selectedFilter || 'all';
  if (typeof next.gameTitle === 'string' && !editingGameTitle) document.querySelector('#game-title').value = next.gameTitle;
  const pending = state.messages.filter(message => message.status === 'pending');
  const counts = Object.fromEntries(Object.keys(categoryLabels).map(key => [key, pending.filter(message => message.category === key).length]));
  document.querySelector('#nav-count').textContent = pending.length;
  document.querySelector('#total-count').textContent = String(state.messages.filter(message => message.status !== 'discarded').length).padStart(2, '0');
  document.querySelector('#pending-count').textContent = String(pending.filter(message => message.category !== 'spoiler').length).padStart(2, '0');
  document.querySelector('#sealed-count').textContent = counts.spoiler;
  document.querySelector('#language-total').textContent = String(Object.keys(state.languageCounts).length).padStart(2, '0');
  document.querySelector('#count-all').textContent = pending.length;
  for (const [key, value] of Object.entries(counts)) document.querySelector(`#count-${key}`).textContent = value;
  const visible = pending.filter(message => state.filter === 'all' || message.category === state.filter);
  document.querySelector('#visible-total').textContent = `${visible.length} ${visible.length === 1 ? 'bolita' : 'bolitas'}`;
  document.querySelectorAll('.filter-chip').forEach(element => element.classList.toggle('selected', element.dataset.filter === state.filter));
  const list = document.querySelector('#message-list');
  list.innerHTML = visible.length ? visible.slice().reverse().map(message => {
    const category = Object.hasOwn(categoryLabels, message.category) ? message.category : 'pista';
    return `<div class="message-row"><i class="gum-dot ${category}"></i><div class="msg-main"><span class="msg-text">${escapeHtml(message.translatedText)}</span><span class="msg-original" hidden>${escapeHtml(message.text)}</span><div class="msg-meta"><span>@${escapeHtml(message.author)}</span><span>·</span><span>${flag(message.sourceLanguage)} ${escapeHtml(message.sourceLanguage)}</span><span class="msg-tag">${categoryLabels[category]}${message.highlight ? ' ✦' : ''}</span></div></div><div class="msg-actions"><button class="mini-action original-toggle" data-id="${escapeHtml(message.id)}">Ver original</button>${category === 'spoiler' ? '<span class="mini-action" title="Sellado">Sellado</span>' : `<button class="mini-action open-item" data-id="${escapeHtml(message.id)}">Sacar</button>`}<button class="mini-action discard" data-id="${escapeHtml(message.id)}" title="Descartar">Quitar</button></div></div>`;
  }).join('') : '<div class="empty-state">No hay bolitas con este filtro.<br>Elige otra categoría o envía un mensaje de prueba.</div>';
  list.querySelectorAll('.open-item').forEach(button => button.addEventListener('click', () => send({ type: 'open-id', id: button.dataset.id })));
  list.querySelectorAll('.discard').forEach(button => button.addEventListener('click', () => send({ type: 'discard', id: button.dataset.id })));
  list.querySelectorAll('.original-toggle').forEach(button => button.addEventListener('click', () => {
    const original = button.closest('.message-row').querySelector('.msg-original');
    original.hidden = !original.hidden;
    button.textContent = original.hidden ? 'Ver original' : 'Ver traducción';
  }));
  const langs = Object.entries(state.languageCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, ...langs.map(([, count]) => count));
  document.querySelector('#language-bars').innerHTML = langs.length ? langs.map(([lang, count]) => `<div class="lang-row"><span>${flag(lang)} ${escapeHtml(lang.toUpperCase())}</span><div class="lang-track"><i style="width:${Math.max(8, count / maxCount * 100)}%"></i></div><b>${count}</b></div>`).join('') : '<div class="empty-language">Los idiomas aparecerán cuando llegue el primer mensaje.</div>';
  window.dispatchEvent(new CustomEvent('gumball-state', { detail: next }));
}

function renderAiStatus(status) {
  const indicator = document.querySelector('#ai-status');
  const states = {
    active: ['active', 'Gemini activa'],
    fallback: ['fallback', 'Clasificador local activo'],
    paused: ['paused', 'Respaldo local activo']
  };
  const [className, label] = states[status?.state] || states.paused;
  indicator.className = `ai-indicator ${className}`;
  indicator.textContent = label;
  indicator.title = status?.lastError || status?.message || '';
}

function flag(language) {
  return ({ es: '🇪🇸', en: '🇺🇸', ja: '🇯🇵', fr: '🇫🇷', pt: '🇧🇷', de: '🇩🇪', ko: '🇰🇷' })[language] || '🌐';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function simulate(author, text) {
  const response = await fetch('/api/simulate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author, text, gameTitle: document.querySelector('#game-title').value })
  });
  const result = await response.json();
  if (!result.ok) toast(result.reason || result.error || 'El mensaje se descartó en el filtro local.');
  else toast('Mensaje en análisis; la IA lo procesa en un lote breve.');
}

async function loadSamples() {
  const select = document.querySelector('#sample-select');
  try {
    const response = await fetch('/api/samples');
    const samples = await response.json();
    select.replaceChildren(new Option('Elige un caso de prueba…', ''));
    for (const sample of samples) select.add(new Option(`${flag(sample.language)} ${sample.label}`, sample.id));
  } catch { select.replaceChildren(new Option('No se cargaron los ejemplos', '')); }
}

document.querySelector('#filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (button) send({ type: 'filter', category: button.dataset.filter });
});
document.querySelector('#draw-button').addEventListener('click', () => send({ type: 'draw', category: state.filter }));
document.querySelector('#reveal-button').addEventListener('click', () => {
  if (confirm('¿Abrir ahora todos los spoilers sellados en el overlay?')) send({ type: 'reveal-spoilers' });
});
document.querySelector('#send-sample').addEventListener('click', () => {
  const sampleId = document.querySelector('#sample-select').value;
  if (!sampleId) return toast('Elige un mensaje de prueba.');
  fetch('/api/samples').then(response => response.json()).then(samples => {
    const sample = samples.find(item => item.id === sampleId);
    if (sample) return simulate(document.querySelector('#author-input').value || sample.author, sample.text);
  });
});
document.querySelector('#send-custom').addEventListener('click', sendCustom);
document.querySelector('#custom-message').addEventListener('keydown', event => { if (event.key === 'Enter') sendCustom(); });
function sendCustom() {
  const input = document.querySelector('#custom-message');
  if (!input.value.trim()) return;
  simulate(document.querySelector('#author-input').value || 'ViajeroEstelar', input.value);
  input.value = '';
}
document.querySelector('#refresh').addEventListener('click', () => fetch('/api/state').then(response => response.json()).then(render));
document.querySelector('#connect-twitch').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/twitch/connect', { method: 'POST' });
    const data = await response.json();
    toast(data.message || data.error);
    if (data.ok) document.querySelector('#connection-label').textContent = 'Conectando con Twitch…';
  } catch { toast('No se pudo iniciar la conexión con Twitch.'); }
});
function saveGameContext() {
  clearTimeout(gameSaveTimer);
  return fetch('/api/game-context', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameTitle: document.querySelector('#game-title').value })
  });
}
document.querySelector('#game-title').addEventListener('focus', () => { editingGameTitle = true; });
document.querySelector('#game-title').addEventListener('blur', () => { editingGameTitle = false; void saveGameContext(); });
document.querySelector('#game-title').addEventListener('input', () => {
  clearTimeout(gameSaveTimer);
  gameSaveTimer = setTimeout(() => { void saveGameContext(); }, 300);
});

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}

loadSamples();
fetch('/api/ai/status').then(response => response.json()).then(renderAiStatus).catch(() => {});
fetch('/api/game-context').then(response => response.json()).then(data => { document.querySelector('#game-title').value = data.gameTitle || ''; }).catch(() => {});
