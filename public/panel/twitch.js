(() => {
  const t = (key, vars) => window.I18N.t(key, vars);
  const $ = id => document.getElementById(id);
  const bar = $('twitch-bar'), title = $('twitch-bar-title'), detail = $('twitch-bar-detail');
  const form = $('twitch-form'), input = $('twitch-channel-input'), connectButton = $('twitch-connect'), disconnectButton = $('twitch-disconnect');
  const chatLink = $('twitch-chat-link'), useDefault = $('twitch-use-default');
  const states = ['disconnected', 'connecting', 'connected', 'reconnecting', 'error'];
  let status = { state: 'disconnected', channel: null, defaultChannel: null };
  let initialized = false;
  let inputEdited = false;
  let busy = false;

  // Igual que en el servidor: acepta "canal", "#canal", "@canal" o un enlace de twitch.tv.
  function normalizeChannel(value) {
    const text = String(value || '').trim().replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//i, '').replace(/^(popout\/)?/, '').replace(/[/?#].*$/, '').replace(/^[#@]/, '').toLowerCase();
    return /^[a-z0-9_]{1,25}$/.test(text) ? text : null;
  }
  const reasonText = code => t(`twitch.errors.${code}`) === `twitch.errors.${code}` ? t('twitch.errors.unknown') : t(`twitch.errors.${code}`);
  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => node.classList.remove('show'), 4200);
  }

  function render(next, announce) {
    const previous = status.state;
    status = { ...status, ...next };
    const state = states.includes(status.state) ? status.state : 'disconnected';
    const channel = status.channel || '';
    const vars = { channel };
    for (const name of states) bar.classList.toggle(`is-${name}`, name === state);

    title.textContent = t(`twitch.title.${state}`, vars);
    if (state === 'connected') {
      const since = status.since ? new Date(status.since).toLocaleTimeString(window.I18N.current(), { hour: '2-digit', minute: '2-digit' }) : '—';
      detail.textContent = t('twitch.detail.connected', { n: status.messages || 0, transport: t(`twitch.transport.${status.transport || 'irc'}`), time: since });
    } else if (state === 'reconnecting') detail.textContent = t('twitch.detail.reconnecting', { s: Math.ceil((status.retryInMs || 0) / 1000) });
    else if (state === 'error') detail.textContent = reasonText(status.error);
    else detail.textContent = t(`twitch.detail.${state}`);
    detail.title = state === 'error' && status.detail ? String(status.detail) : '';

    if (!inputEdited && channel && document.activeElement !== input) input.value = channel;
    const typed = normalizeChannel(input.value);
    const live = state === 'connected' || state === 'connecting' || state === 'reconnecting';
    connectButton.textContent = state === 'error' && (!typed || typed === channel) ? t('twitch.retry') : live && typed && typed !== channel ? t('twitch.switch') : t('twitch.connect');
    connectButton.disabled = busy || state === 'connecting' || (state === 'connected' && (!typed || typed === channel));
    disconnectButton.disabled = busy || !live;

    const linkChannel = channel || typed;
    chatLink.hidden = !linkChannel;
    if (linkChannel) chatLink.href = `https://www.twitch.tv/popout/${encodeURIComponent(linkChannel)}/chat?popout=`;
    useDefault.hidden = !status.defaultChannel || status.defaultChannel === channel;
    if (status.defaultChannel) useDefault.textContent = t('twitch.useDefault', { channel: status.defaultChannel });

    // Indicadores secundarios: chip de la cabecera, barra lateral y tarjeta de configuración.
    const chipText = t(`twitch.chip.${state}`, vars);
    const chip = document.querySelector('.status-chip');
    if (chip) {
      chip.classList.toggle('is-connected', state === 'connected');
      chip.classList.toggle('is-connecting', state === 'connecting' || state === 'reconnecting');
      chip.classList.toggle('is-disconnected', state === 'disconnected' || state === 'error');
      chip.classList.toggle('is-error', state === 'error');
    }
    for (const id of ['connection-chip-label', 'connection-label']) if ($(id)) $(id).textContent = chipText;
    if ($('twitch-mode')) $('twitch-mode').textContent = `${status.mode || 'simulator'}${status.transport ? ` · ${t(`twitch.transport.${status.transport}`)}` : ''}`;
    if ($('twitch-channel')) $('twitch-channel').textContent = channel ? `#${channel}` : '—';
    if ($('twitch-connection-status')) $('twitch-connection-status').textContent = title.textContent;
    const settingsStatus = $('twitch-connection-status');
    if (settingsStatus) settingsStatus.dataset.state = state;

    if (announce && initialized && previous !== state) {
      if (state === 'connected') toast(t('twitch.toastConnected', vars));
      else if (state === 'error') toast(t('twitch.toastFailed', { channel, reason: reasonText(status.error) }));
      else if (state === 'reconnecting' && previous === 'connected') toast(t('twitch.toastReconnecting'));
      else if (state === 'disconnected') toast(t('twitch.toastDisconnected'));
    }
    initialized = true;
  }

  async function connect(channelValue) {
    const channel = normalizeChannel(channelValue);
    if (!channel) {
      render({ state: 'error', error: 'invalid_channel', detail: null, channel: String(channelValue || '').trim().slice(0, 25) || status.channel }, false);
      toast(reasonText('invalid_channel'));
      input.focus();
      return;
    }
    input.value = channel;
    inputEdited = false;
    busy = true;
    render({}, false);
    try {
      const response = await fetch('/api/twitch/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel }) });
      const result = await response.json().catch(() => ({}));
      // Los errores de arranque llegan también por WebSocket; este aviso cubre los rechazos que no se difunden.
      if (!response.ok && result.error === 'invalid_channel') { render({ state: 'error', error: result.error, channel }, false); toast(reasonText(result.error)); }
    } catch {
      render({ state: 'error', error: 'connection_error', channel }, false);
      toast(t('twitch.toastFailed', { channel, reason: reasonText('connection_error') }));
    } finally {
      busy = false;
      render({}, false);
    }
  }

  form.addEventListener('submit', event => { event.preventDefault(); void connect(input.value); });
  input.addEventListener('input', () => { inputEdited = true; render({}, false); });
  disconnectButton.addEventListener('click', async () => {
    busy = true;
    render({}, false);
    try { await fetch('/api/twitch/disconnect', { method: 'POST' }); }
    catch { toast(reasonText('connection_error')); }
    finally { busy = false; render({}, false); }
  });
  useDefault.addEventListener('click', () => { input.value = status.defaultChannel; void connect(status.defaultChannel); });
  if ($('connect-twitch-settings')) $('connect-twitch-settings').dataset.i18n = 'twitch.switch';
  $('connect-twitch-settings')?.addEventListener('click', () => { bar.scrollIntoView({ behavior: 'smooth', block: 'center' }); input.focus(); input.select(); });

  window.addEventListener('gumball-twitch-status', event => render(event.detail, true));
  window.addEventListener('gumball-ui-language', () => render({}, false));
  fetch('/api/twitch/status').then(response => response.json()).then(next => { if (!initialized) render(next, false); }).catch(() => render({ state: 'disconnected' }, false));
})();
