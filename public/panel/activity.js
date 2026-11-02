(() => {
  const limit = 300;
  const entries = [];
  const stream = document.getElementById('activity-stream');
  const search = document.getElementById('activity-search');
  const count = document.getElementById('activity-count');
  const levelBar = document.getElementById('activity-levels');
  const chipBar = document.getElementById('activity-chips');
  const followButton = document.getElementById('activity-follow');
  const stageNames = {
    recibido: ['Message received', 'Mensaje recibido'],
    descartado: ['Discarded', 'Descartado'],
    etiqueta_detectada: ['Tag recognized', 'Etiqueta reconocida'],
    etiqueta_ignorada: ['Unknown tag ignored', 'Etiqueta desconocida ignorada'],
    en_cola_de_analisis: ['Queued for analysis', 'En cola de análisis'],
    lote_iniciado: ['Analysis batch started', 'Lote de análisis iniciado'],
    gemini_request: ['Sent to Gemini', 'Enviado a Gemini'],
    gemini_response: ['Gemini response', 'Respuesta de Gemini'],
    gemini_error: ['Gemini error', 'Error de Gemini'],
    gemini_retry: ['Gemini retry', 'Reintento de Gemini'],
    gemini_skipped: ['Gemini paused · local classifier', 'Gemini en pausa · clasificador local'],
    gemini_paused: ['Gemini paused after repeated failures', 'Gemini en pausa por fallos repetidos'],
    ai_status: ['AI status', 'Estado de IA'],
    local_result: ['Local filter result', 'Resultado del filtro local'],
    aceptado_en_maquina: ['Accepted into machine', 'Aceptado en la máquina'],
    abierto_en_stream: ['Opened on stream', 'Abierto en el stream'],
    revelacion_final: ['Final spoiler reveal', 'Revelación final de spoilers'],
    retirado_por_streamer: ['Removed by streamer', 'Retirado por el streamer'],
    twitch_conectado: ['Twitch connected', 'Twitch conectado'],
    twitch_desconectado: ['Twitch disconnected', 'Twitch desconectado'],
    twitch_reconectando: ['Twitch reconnecting', 'Twitch reconectando'],
    twitch_error: ['Twitch connection error', 'Error de conexión con Twitch']
  };
  // Nivel de cada etapa: decide color de la línea y el filtro por nivel.
  const stageLevels = {
    gemini_error: 'error', twitch_error: 'error',
    twitch_desconectado: 'warn', twitch_reconectando: 'warn', twitch_conectado: 'ok',
    descartado: 'warn', etiqueta_ignorada: 'warn', gemini_retry: 'warn', gemini_skipped: 'warn', gemini_paused: 'warn',
    aceptado_en_maquina: 'ok', abierto_en_stream: 'ok', revelacion_final: 'ok',
    lote_iniciado: 'ai', gemini_request: 'ai', gemini_response: 'ai', ai_status: 'ai', local_result: 'ai'
  };
  const levels = [['all', 'ALL', 'TODO'], ['info', 'INFO', 'INFO'], ['ai', 'AI', 'IA'], ['ok', 'OK', 'OK'], ['warn', 'WARN', 'AVISO'], ['error', 'ERROR', 'ERROR']];
  const filters = { level: 'all', id: '', author: '', stage: '' };
  let follow = true;

  const english = () => window.I18N.current() === 'en';
  const say = (en, es) => english() ? en : es;
  const t = key => window.I18N.t('panel.' + key);
  const levelOf = entry => stageLevels[entry.stage] || 'info';
  const idsOf = details => [details.id, ...(Array.isArray(details.ids) ? details.ids : [])].filter(Boolean).map(String);

  function stageName(stage) {
    const names = stageNames[stage];
    return names ? names[english() ? 0 : 1] : String(stage || 'event');
  }

  function span(className, text) {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = text;
    return node;
  }

  // Botón dentro de la línea que fija un filtro: así se sigue un mensaje por todas sus etapas.
  function filterToken(className, text, key, value) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `term-token ${className}`;
    button.textContent = text;
    button.title = say(`Filter by ${text}`, `Filtrar por ${text}`);
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); filters[key] = value; render(); });
    return button;
  }

  // El servidor guarda motivos en español y un código estable; con el código se muestra en el idioma del panel.
  function reasonOf(entry, details) {
    const code = details.code;
    if (code && String(entry.stage).startsWith('twitch')) { const text = window.I18N.t(`twitch.errors.${code}`); return text.startsWith('twitch.') ? code : text; }
    if (code) { const text = window.I18N.t(`reason.${code}`); if (!text.startsWith('reason.')) return english() ? text : [details.etapa, text].filter(Boolean).join(' · '); }
    if (details.channel) return `#${details.channel}${details.retryInMs ? ` · ${Math.ceil(details.retryInMs / 1000)} s` : ''}`;
    return [details.etapa, details.reason || details.motivo].filter(Boolean).join(' · ');
  }

  function makeEntry(entry) {
    const details = entry.details || {};
    const level = levelOf(entry);
    const line = document.createElement('details');
    line.className = `term-line lvl-${level}`;
    const summary = document.createElement('summary');
    const date = new Date(entry.timestamp);
    summary.append(
      span('term-time', Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString('en-GB', { hour12: false })),
      span('term-level', levels.find(item => item[0] === level)[english() ? 1 : 2].padEnd(5, ' ')),
      filterToken('term-stage', stageName(entry.stage), 'stage', entry.stage)
    );
    for (const id of idsOf(details).slice(0, 6)) summary.append(filterToken('term-id', `#${id}`, 'id', id));
    if (details.author) summary.append(filterToken('term-author', `@${details.author}`, 'author', String(details.author)));
    if (details.category) summary.append(span(`term-cat cat-${details.category}`, details.category));
    const messageText = details.text || details.texto || details.translatedText;
    if (messageText) summary.append(span('term-text', `"${messageText}"`));
    if (details.translatedText && details.text && details.translatedText !== details.text) summary.append(span('term-translation', `→ "${details.translatedText}"`));
    const reason = reasonOf(entry, details);
    if (reason) summary.append(span('term-reason', `↳ ${reason}`));
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(details, null, 2);
    line.append(summary, pre);
    return line;
  }

  function systemLine(text) {
    const line = document.createElement('div');
    line.className = 'term-line term-system';
    line.textContent = text;
    return line;
  }

  // La barra de comandos admite texto libre y filtros: id:gum-3, #gum-3, @usuario, user:x, stage:descartado, level:warn.
  function parseQuery() {
    const query = { text: [], id: '', author: '', stage: '', level: '' };
    for (const token of search.value.trim().split(/\s+/).filter(Boolean)) {
      const match = token.match(/^(id|user|usuario|stage|etapa|level|nivel):(.+)$/i);
      if (match) {
        const key = match[1].toLowerCase();
        if (key === 'id') query.id = match[2];
        else if (key === 'user' || key === 'usuario') query.author = match[2].replace(/^@/, '');
        else if (key === 'stage' || key === 'etapa') query.stage = match[2];
        else query.level = match[2].toLowerCase();
      } else if (/^#\S+/.test(token)) query.id = token.slice(1);
      else if (/^@\S+/.test(token)) query.author = token.slice(1);
      else query.text.push(token.toLocaleLowerCase());
    }
    return query;
  }

  function matches(entry, query) {
    const details = entry.details || {};
    const level = query.level || filters.level;
    if (level !== 'all' && levelOf(entry) !== level) return false;
    const id = (query.id || filters.id).toLowerCase();
    if (id && !idsOf(details).some(value => value.toLowerCase() === id)) return false;
    const author = (query.author || filters.author).toLowerCase();
    if (author && String(details.author || '').toLowerCase() !== author) return false;
    const stage = (query.stage || filters.stage).toLowerCase();
    if (stage && !String(entry.stage).toLowerCase().includes(stage) && !stageName(entry.stage).toLowerCase().includes(stage)) return false;
    if (query.text.length) {
      const haystack = `${stageName(entry.stage)} ${JSON.stringify(entry)}`.toLocaleLowerCase();
      if (!query.text.every(word => haystack.includes(word))) return false;
    }
    return true;
  }

  function renderLevels() {
    const totals = { all: entries.length };
    for (const entry of entries) totals[levelOf(entry)] = (totals[levelOf(entry)] || 0) + 1;
    levelBar.replaceChildren(...levels.map(([key, en, es]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `term-level-btn lvl-${key}`;
      button.setAttribute('aria-pressed', String(filters.level === key));
      button.textContent = `${english() ? en : es} ${totals[key] || 0}`;
      button.addEventListener('click', () => { filters.level = key; render(); });
      return button;
    }));
  }

  function renderChips() {
    const active = [['id', '#'], ['author', '@'], ['stage', '']].filter(([key]) => filters[key]);
    chipBar.hidden = !active.length;
    chipBar.replaceChildren(...active.map(([key, prefix]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'term-chip';
      chip.textContent = `${prefix}${key === 'stage' ? stageName(filters.stage) : filters[key]}  ✕`;
      chip.title = say('Remove filter', 'Quitar filtro');
      chip.addEventListener('click', () => { filters[key] = ''; render(); });
      return chip;
    }));
  }

  function scrollToEnd() { if (follow) stream.scrollTop = stream.scrollHeight; }

  function render() {
    const query = parseQuery();
    const visible = entries.filter(entry => matches(entry, query));
    count.textContent = `${visible.length}/${entries.length}`;
    renderLevels();
    renderChips();
    stream.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'activity-empty';
      empty.textContent = entries.length ? say('No lines match the filter.', 'Ninguna línea coincide con el filtro.') : t('activityEmpty');
      stream.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const entry of visible) fragment.append(makeEntry(entry));
    stream.append(fragment);
    scrollToEnd();
  }

  function setFollow(value) {
    follow = value;
    followButton.setAttribute('aria-pressed', String(follow));
    if (follow) scrollToEnd();
  }

  function clearAll() {
    entries.length = 0;
    Object.assign(filters, { level: 'all', id: '', author: '', stage: '' });
    search.value = '';
    render();
  }

  // El registro se lee como una terminal: lo más reciente abajo y desplazamiento automático.
  window.addEventListener('gumball-message-log', event => {
    if (!event.detail) return;
    entries.push(event.detail);
    if (entries.length > limit) entries.shift();
    if (!matches(event.detail, parseQuery())) { count.textContent = `${stream.querySelectorAll('.term-line').length}/${entries.length}`; renderLevels(); return; }
    stream.querySelector('.activity-empty')?.remove();
    stream.append(makeEntry(event.detail));
    while (stream.querySelectorAll('.term-line').length > limit) stream.firstElementChild.remove();
    count.textContent = `${stream.querySelectorAll('.term-line').length}/${entries.length}`;
    renderLevels();
    scrollToEnd();
  });
  stream.addEventListener('scroll', () => {
    const atEnd = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 24;
    if (atEnd !== follow) setFollow(atEnd);
  });
  followButton.addEventListener('click', () => setFollow(!follow));
  window.addEventListener('gumball-ui-language', render);
  search.addEventListener('input', render);
  search.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const command = search.value.trim().toLowerCase();
    if (command === 'clear' || command === 'limpiar') { clearAll(); return; }
    if (command === 'help' || command === 'ayuda') {
      search.value = '';
      render();
      for (const text of [
        say('Commands:', 'Comandos:'),
        say('  text            search any field', '  texto           busca en cualquier campo'),
        say('  #gum-3 / id:x   follow one message through every stage', '  #gum-3 / id:x   sigue un mensaje por todas sus etapas'),
        say('  @user / user:x  lines from one author', '  @usuario        líneas de un autor'),
        say('  stage:x         by stage (e.g. stage:descartado)', '  etapa:x         por etapa (ej. etapa:descartado)'),
        say('  level:warn      info | ai | ok | warn | error', '  nivel:warn      info | ai | ok | warn | error'),
        say('  clear           empty the log', '  limpiar         vacía el registro'),
        say('Tip: click an #id, @user or stage in any line to filter by it.', 'Truco: pulsa un #id, @usuario o etapa en cualquier línea para filtrar por él.')
      ]) stream.append(systemLine(text));
      setFollow(true);
    }
  });
  document.getElementById('activity-clear').addEventListener('click', clearAll);
  render();
})();
