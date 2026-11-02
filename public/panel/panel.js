const categoryLabels = Object.fromEntries(['pista','spoiler','prediccion','animo','reto'].map(key => [key, window.I18N.t('card.category.' + key)]));
const t = (key, vars) => window.I18N.t(key, vars);
const state = { messages: [], languageCounts: {}, filter: 'all' };
const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
let settings = null;
let gameSaveTimer;
let editingGameTitle = false;
const languageNames = Object.fromEntries(['es','en','pt','fr','ja','de','ko'].map(key => [key, window.I18N.t('lang.' + key)]));

socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (data.type === 'message-log') window.dispatchEvent(new CustomEvent('gumball-message-log', { detail: data.entry }));
  if (data.type === 'state') render(data.data);
  if (data.type === 'notice') toast(data.code ? t('notice.' + data.code) : data.message);
  if (data.type === 'opened') toast(t('panel.drawOpened'));
  if (data.type === 'twitch-status') window.dispatchEvent(new CustomEvent('gumball-twitch-status', { detail: data }));
  if (data.type === 'ai-status') renderAiStatus(data.status);
  if (data.type === 'game-context' && !editingGameTitle) document.querySelector('#game-title').value = data.gameTitle || '';
  if (data.type === 'streamer-settings') updateStreamerLanguage(data.streamerLanguage);
});
window.addEventListener('gumball-ui-language', () => render({ messages: state.messages, languageCounts: state.languageCounts, selectedFilter: state.filter }));

function send(command) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
  else toast(t('panel.reconnecting'));
}

function render(next) {
  state.messages = next.messages || [];
  state.languageCounts = next.languageCounts || {};
  state.filter = next.selectedFilter || 'all';
  if (typeof next.gameTitle === 'string' && !editingGameTitle) document.querySelector('#game-title').value = next.gameTitle;
  if (next.streamerLanguage) updateStreamerLanguage(next.streamerLanguage);
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
  document.querySelector('#visible-total').textContent = t(visible.length === 1 ? 'panel.visibleSingular' : 'panel.visiblePlural', { n: visible.length });
  document.querySelectorAll('.filter-chip').forEach(element => element.classList.toggle('selected', element.dataset.filter === state.filter));
  const list = document.querySelector('#message-list');
  list.innerHTML = visible.length ? visible.slice().reverse().map(message => {
    const category = Object.hasOwn(categoryLabels, message.category) ? message.category : 'pista';
    return `<div class="message-row"><i class="gum-dot ${category}"></i><div class="msg-main"><span class="msg-text">${escapeHtml(message.translatedText)}</span><span class="msg-original" hidden>${escapeHtml(message.text)}</span><div class="msg-meta"><span>@${escapeHtml(message.author)}</span><span>·</span><span>${flag(message.sourceLanguage)} ${escapeHtml(t('lang.' + message.sourceLanguage))}</span><span class="msg-tag">${t('card.category.' + category)}${message.highlight ? ' ✦' : ''}</span></div></div><div class="msg-actions"><button class="mini-action original-toggle" data-id="${escapeHtml(message.id)}">${t('panel.original')}</button>${category === 'spoiler' ? `<span class="mini-action" title="${t('panel.locked')}">${t('panel.locked')}</span>` : `<button class="mini-action open-item" data-id="${escapeHtml(message.id)}">${t('panel.take')}</button>`}<button class="mini-action discard" data-id="${escapeHtml(message.id)}" title="${t('panel.remove')}">${t('panel.remove')}</button></div></div>`;
  }).join('') : `<div class="empty-state">${t('panel.emptyMessage')}<br>${t('panel.emptyHint')}</div>`;
  list.querySelectorAll('.open-item').forEach(button => button.addEventListener('click', () => send({ type: 'open-id', id: button.dataset.id })));
  list.querySelectorAll('.discard').forEach(button => button.addEventListener('click', () => send({ type: 'discard', id: button.dataset.id })));
  list.querySelectorAll('.original-toggle').forEach(button => button.addEventListener('click', () => {
    const original = button.closest('.message-row').querySelector('.msg-original');
    original.hidden = !original.hidden;
    button.textContent = original.hidden ? t('panel.original') : t('panel.translation');
  }));
  const langs = Object.entries(state.languageCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, ...langs.map(([, count]) => count));
  document.querySelector('#language-bars').innerHTML = langs.length ? langs.map(([lang, count]) => `<div class="lang-row"><span>${flag(lang)} ${escapeHtml(t('lang.' + lang))}</span><div class="lang-track"><i style="width:${Math.max(8, count / maxCount * 100)}%"></i></div><b>${count}</b></div>`).join('') : `<div class="empty-language">${t('panel.loadedLanguages')}</div>`;
  renderRepeatedMessages(state.messages);
  window.dispatchEvent(new CustomEvent('gumball-state', { detail: next }));
}

function renderRepeatedMessages(messages) {
  const groups = new Map();
  for (const message of messages) {
    if (message.status === 'discarded') continue;
    const text = String(message.text || '').replace(/^\s*&(?:hint|pista|challenge|reto|cheer|animo|prediction|prediccion|spoiler)\b\s*:?\s*/i, '');
    const key = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (key.length < 5) continue;
    const group = groups.get(key) || { text: message.translatedText || text, authors: new Set(), count: 0 };
    group.count++;
    group.authors.add(message.author || 'Invitado');
    groups.set(key, group);
  }
  const popular = [...groups.values()].filter(group => group.count > 1).sort((a, b) => b.count - a.count).slice(0, 5);
  document.querySelector('#repeat-list').innerHTML = popular.length ? popular.map(group => {
    const authors = [...group.authors], shown = authors.slice(0, 8).map(author => `@${escapeHtml(author)}`);
    if (authors.length > shown.length) shown.push(t('panel.moreAuthors', { n: authors.length - shown.length }));
    return `<article class="repeat-item"><strong>${group.count}×</strong><div><span>${escapeHtml(group.text)}</span><small>${shown.join(' · ')}</small></div></article>`;
  }).join('') : `<div class="empty-language">${t('panel.noRepeats')}</div>`;
}

let lastAiStatus = null;
window.addEventListener('gumball-ui-language', () => renderAiStatus(lastAiStatus));
function renderAiStatus(status) {
  lastAiStatus = status;
  const indicator = document.querySelector('#ai-status');
  const states = {
    active: ['active', t('panel.aiActive')],
    fallback: ['fallback', t('panel.aiFallback')],
    paused: ['paused', t('panel.aiPaused')]
  };
  const [className, label] = states[status?.state] || states.paused;
  indicator.className = `ai-indicator ${className}`;
  indicator.textContent = label;
  indicator.title = status?.lastError || status?.message || '';
}

function updateStreamerLanguage(language) {
  const select = document.querySelector('#streamer-language');
  if (!languageNames[language]) return;
  select.value = language;
  document.querySelector('#profile-language').textContent = `${t('panel.streamerLanguage')} · ${t(`lang.${language}`)}`;
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
  if (!result.ok) toast(t('ui.rejected', { reason: t('reason.' + (result.reason || result.error || 'noise')) }));
  else toast(t('ui.sentToAnalysis'));
}

async function loadSamples() {
  const select = document.querySelector('#sample-select');
  try {
    const response = await fetch('/api/samples');
    const samples = await response.json();
    select.replaceChildren(new Option(t('ui.chooseSample'), ''));
    for (const sample of samples) select.add(new Option(`${flag(sample.language)} ${window.I18N.current() === 'es' && sample.labelEs || sample.label}`, sample.id));
  } catch { select.replaceChildren(new Option(t('ui.samplesFailed'), '')); }
}

document.querySelector('#filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (button) send({ type: 'filter', category: button.dataset.filter });
});
document.querySelector('#draw-button').addEventListener('click', () => send({ type: 'draw', category: state.filter }));
document.querySelector('#reveal-button').addEventListener('click', () => {
  if (confirm(t('ui.revealConfirm'))) send({ type: 'reveal-spoilers' });
});
document.querySelector('#send-sample').addEventListener('click', () => {
  const sampleId = document.querySelector('#sample-select').value;
  if (!sampleId) return toast(t('ui.pickSample'));
  fetch('/api/samples').then(response => response.json()).then(samples => {
    const sample = samples.find(item => item.id === sampleId);
    if (sample) return simulate(document.querySelector('#author-input').value || sample.author, sample.text);
  });
});
document.querySelector('#send-custom').addEventListener('click', sendCustom);
document.querySelector('#fill-machine').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const response = await fetch('/api/demo/fill', { method: 'POST' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `Error ${response.status}`);
    toast(t('ui.filled', { n: result.added }));
  } catch (error) { toast(t('ui.fillFailed', { error: error.message || 'network' })); }
  finally { button.disabled = false; }
});
document.querySelector('#custom-message').addEventListener('keydown', event => { if (event.key === 'Enter') sendCustom(); });
function sendCustom() {
  const input = document.querySelector('#custom-message');
  if (!input.value.trim()) return;
  simulate(document.querySelector('#author-input').value || 'ViajeroEstelar', input.value);
  input.value = '';
}
document.querySelector('#refresh').addEventListener('click', () => fetch('/api/state').then(response => response.json()).then(render));
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
window.addEventListener('gumball-ui-language', loadSamples);
fetch('/api/ai/status').then(response => response.json()).then(renderAiStatus).catch(() => {});
fetch('/api/game-context').then(response => response.json()).then(data => { document.querySelector('#game-title').value = data.gameTitle || ''; }).catch(() => {});
fetch('/api/settings').then(response => response.json()).then(data => updateStreamerLanguage(data.streamerLanguage)).catch(() => {});

// El enlace para cerrar sesión solo se muestra cuando el panel está protegido con PANEL_PASSWORD.
fetch('/api/session').then(response => response.json()).then(session => { document.querySelector('#logout-link').hidden = !session.loginEnabled; }).catch(() => {});
