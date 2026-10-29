const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';

class AnonymousIrcClient {
  constructor({ acceptMessage, broadcast }) {
    this.acceptMessage = acceptMessage;
    this.broadcast = broadcast;
    this.socket = null;
    this.connecting = false;
    this.joined = false;
  }

  get status() {
    return {
      connected: Boolean(this.socket && this.socket.readyState === WebSocket.OPEN),
      configured: Boolean(process.env.TWITCH_CHANNEL_LOGIN),
      mode: 'anonymous',
      channel: process.env.TWITCH_CHANNEL_LOGIN || null
    };
  }

  async connect() {
    if (this.connecting || this.status.connected) return { ok: false, error: 'IRC ya está conectado o conectando.' };
    const channel = String(process.env.TWITCH_CHANNEL_LOGIN || '').trim().replace(/^#/, '').toLowerCase();
    if (!/^[a-z0-9_]{1,25}$/.test(channel)) return { ok: false, error: 'Configura un TWITCH_CHANNEL_LOGIN válido en .env.' };
    if (typeof WebSocket === 'undefined') return { ok: false, error: 'Este modo requiere Node.js con WebSocket nativo (Node 22 o posterior).' };

    this.connecting = true;
    this.joined = false;
    try {
      const socket = new WebSocket(IRC_URL);
      this.socket = socket;
      socket.addEventListener('open', () => {
        const nick = `justinfan${Math.floor(10000 + Math.random() * 90000)}`;
        socket.send('PASS SCHMOOPIIE\r\n');
        socket.send(`NICK ${nick}\r\n`);
        socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
        socket.send(`JOIN #${channel}\r\n`);
        this.connecting = false;
        this.broadcast({ type: 'twitch-status', connected: true, mode: 'anonymous', message: `Conectado a IRC; esperando confirmación de #${channel}.` });
      }, { once: true });
      socket.addEventListener('message', event => this.handleMessage(String(event.data), channel));
      socket.addEventListener('error', () => {
        this.connecting = false;
        this.broadcast({ type: 'twitch-status', connected: false, mode: 'anonymous', error: 'Error en la conexión WebSocket de IRC.' });
      });
      socket.addEventListener('close', () => {
        this.connecting = false;
        this.joined = false;
        this.socket = null;
        this.broadcast({ type: 'twitch-status', connected: false, mode: 'anonymous' });
      });
      return { ok: true, message: `Abriendo IRC anónimo para #${channel}; Twitch puede rechazar el acceso sin OAuth.` };
    } catch (error) {
      this.socket?.close();
      this.socket = null;
      this.connecting = false;
      return { ok: false, error: error.message };
    }
  }

  handleMessage(raw, channel) {
    for (const line of raw.split(/\r?\n/)) {
      if (!line) continue;
      if (line.startsWith('PING ')) {
        this.socket?.send(`PONG ${line.slice(5)}\r\n`);
        continue;
      }
      if (/\sNOTICE\s/.test(line) && /login authentication failed|improperly formatted auth/i.test(line)) {
        this.broadcast({ type: 'twitch-status', connected: false, mode: 'anonymous', error: 'Twitch rechazó el inicio de sesión IRC anónimo; usa EventSub con OAuth.' });
        this.socket?.close();
        continue;
      }
      const joined = line.match(/^:([^! ]+)!?[^ ]*\s+JOIN\s+#([^ ]+)/i);
      if (joined && joined[1].toLowerCase().startsWith('justinfan') && joined[2].toLowerCase() === channel) {
        this.joined = true;
        this.broadcast({ type: 'twitch-status', connected: true, mode: 'anonymous', joined: true, channel });
      }
      const message = line.match(/^:([^! ]+)!([^ ]+)\s+PRIVMSG\s+#([^ ]+)\s+:(.*)$/i);
      if (message && message[3].toLowerCase() === channel) {
        this.joined = true;
        this.acceptMessage({ author: message[1], text: message[4], source: 'twitch' });
      }
    }
  }

  disconnect() {
    this.socket?.close();
  }
}

module.exports = { AnonymousIrcClient };
