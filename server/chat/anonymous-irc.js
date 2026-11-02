const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
// Twitch confirma un canal existente en menos de un segundo; sin respuesta, el canal no existe o está suspendido.
const JOIN_TIMEOUT_MS = 8000;

// Lector de chat de solo lectura con usuario anónimo (justinfan). Informa su estado con eventos 'twitch-status'
// y códigos de error estables (channel_not_found, connection_error…) que el panel traduce.
// Quita los emotes que Twitch marca en el tag 'emotes' (id:inicio-fin,…/id:…), con posiciones en code points.
// Así 'axozerJaja axozerJaja' llega vacío y el filtro rápido lo descarta sin gastar IA.
function stripEmotes(text, emotesTag) {
  if (!emotesTag) return { text, emotesRemoved: 0 };
  const chars = Array.from(text);
  let emotesRemoved = 0;
  for (const group of emotesTag.split('/')) {
    for (const range of (group.split(':')[1] || '').split(',')) {
      const [start, end] = range.split('-').map(Number);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      for (let index = start; index <= end && index < chars.length; index++) chars[index] = '';
      emotesRemoved++;
    }
  }
  return { text: chars.join('').replace(/\s+/g, ' ').trim(), emotesRemoved };
}

class AnonymousIrcClient {
  constructor({ acceptMessage, broadcast }) {
    this.acceptMessage = acceptMessage;
    this.broadcast = broadcast;
    this.socket = null;
    this.connecting = false;
    this.joined = false;
    this.opened = false;
    this.channel = null;
    this.connectionTimer = null;
  }

  get status() {
    return {
      connected: this.joined,
      connecting: this.connecting,
      configured: Boolean(process.env.TWITCH_CHANNEL_LOGIN),
      mode: 'anonymous',
      channel: this.channel || process.env.TWITCH_CHANNEL_LOGIN || null,
      defaultChannel: process.env.TWITCH_CHANNEL_LOGIN || null
    };
  }

  emit(extra) {
    this.broadcast({ type: 'twitch-status', connected: this.joined, connecting: this.connecting, mode: 'anonymous', channel: this.channel, ...extra });
  }

  async connect(channelLogin) {
    if (this.connecting || this.status.connected) return { ok: false, error: 'already_connected' };
    const channel = String(channelLogin || process.env.TWITCH_CHANNEL_LOGIN || '').trim().replace(/^#/, '').toLowerCase();
    if (!/^[a-z0-9_]{1,25}$/.test(channel)) return { ok: false, error: 'invalid_channel' };
    if (typeof WebSocket === 'undefined') return { ok: false, error: 'websocket_unavailable' };

    this.connecting = true;
    this.joined = false;
    this.opened = false;
    this.channel = channel;
    try {
      const socket = new WebSocket(IRC_URL);
      this.socket = socket;
      this.connectionTimer = setTimeout(() => this.fail(socket, this.opened ? 'channel_not_found' : 'connection_timeout'), JOIN_TIMEOUT_MS);
      socket.addEventListener('open', () => {
        this.opened = true;
        const nick = `justinfan${Math.floor(10000 + Math.random() * 90000)}`;
        socket.send('PASS SCHMOOPIIE\r\n');
        socket.send(`NICK ${nick}\r\n`);
        socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
        socket.send(`JOIN #${channel}\r\n`);
        this.emit({});
      }, { once: true });
      socket.addEventListener('message', event => { if (socket === this.socket) this.handleMessage(String(event.data), channel); });
      socket.addEventListener('error', () => this.fail(socket, 'connection_error'));
      socket.addEventListener('close', () => {
        if (socket !== this.socket) return;
        clearTimeout(this.connectionTimer);
        this.connecting = false;
        this.joined = false;
        this.socket = null;
        this.emit({ closed: true });
      });
      return { ok: true, channel };
    } catch (error) {
      this.socket?.close();
      this.socket = null;
      this.connecting = false;
      return { ok: false, error: 'connection_error', detail: error.message };
    }
  }

  // Marca el error y cierra; el evento 'close' posterior se ignora porque this.socket ya no apunta a este socket.
  fail(socket, code) {
    if (socket !== this.socket) return;
    clearTimeout(this.connectionTimer);
    this.connecting = false;
    this.joined = false;
    this.socket = null;
    this.emit({ error: code });
    try { socket.close(); } catch { /* el socket ya estaba cerrado */ }
  }

  confirmJoin(channel) {
    if (this.joined) return;
    clearTimeout(this.connectionTimer);
    this.joined = true;
    this.connecting = false;
    this.emit({ joined: true, channel });
  }

  handleMessage(raw, channel) {
    for (let line of raw.split(/\r?\n/)) {
      if (!line) continue;
      // Con CAP twitch.tv/tags cada línea empieza por "@clave=valor;... "; se separan antes de leer el comando.
      let tags = {};
      if (line.startsWith('@')) {
        const space = line.indexOf(' ');
        tags = Object.fromEntries(line.slice(1, space).split(';').map(pair => pair.split('=')));
        line = line.slice(space + 1);
      }
      if (line.startsWith('PING ')) {
        this.socket?.send(`PONG ${line.slice(5)}\r\n`);
        continue;
      }
      // Twitch pide reconectar antes de un reinicio; al cerrar, el gestor del servidor vuelve a conectar.
      if (/^:tmi\.twitch\.tv RECONNECT/.test(line)) { this.socket?.close(); continue; }
      if (/\sNOTICE\s/.test(line)) {
        if (/login authentication failed|improperly formatted auth/i.test(line)) { this.fail(this.socket, 'anonymous_rejected'); continue; }
        if (/^msg_(channel_suspended|banned)$/.test(tags['msg-id'] || '')) { this.fail(this.socket, 'channel_suspended'); continue; }
      }
      const joined = line.match(/^:([^! ]+)!?[^ ]*\s+JOIN\s+#([^ ]+)/i);
      if (joined && joined[1].toLowerCase().startsWith('justinfan') && joined[2].toLowerCase() === channel) this.confirmJoin(channel);
      if (/^:tmi\.twitch\.tv ROOMSTATE #/.test(line) && line.toLowerCase().endsWith(`#${channel}`)) this.confirmJoin(channel);
      const message = line.match(/^:([^! ]+)!([^ ]+)\s+PRIVMSG\s+#([^ ]+)\s+:(.*)$/i);
      if (message && message[3].toLowerCase() === channel) {
        this.confirmJoin(channel);
        const { text, emotesRemoved } = stripEmotes(message[4], tags.emotes);
        this.acceptMessage({ author: tags['display-name'] || message[1], text, source: 'twitch', emotesRemoved });
      }
    }
  }

  disconnect() {
    clearTimeout(this.connectionTimer);
    this.connecting = false;
    this.joined = false;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

module.exports = { AnonymousIrcClient, stripEmotes };
