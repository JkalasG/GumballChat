const SUBSCRIBE_TIMEOUT_MS = 15000;

// Error con código estable para el panel (que lo traduce) y detalle técnico de Twitch para el registro.
const failure = (code, detail) => Object.assign(new Error(detail || code), { code, detail });

class EventSubClient {
  constructor({ acceptMessage, broadcast }) {
    this.acceptMessage = acceptMessage;
    this.broadcast = broadcast;
    this.socket = null;
    this.sessionId = null;
    this.connecting = false;
    this.connected = false;
    this.channelLogin = null;
    this.connectionTimer = null;
  }

  get status() {
    return {
      connected: this.connected,
      connecting: this.connecting,
      configured: Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_OAUTH_TOKEN && process.env.TWITCH_BOT_LOGIN),
      channel: this.channelLogin || process.env.TWITCH_CHANNEL_LOGIN || null,
      defaultChannel: process.env.TWITCH_CHANNEL_LOGIN || null,
      mode: 'eventsub'
    };
  }

  emit(extra) {
    this.broadcast({ type: 'twitch-status', connected: this.connected, connecting: this.connecting, mode: 'eventsub', channel: this.channelLogin, ...extra });
  }

  async connect(requestedChannel) {
    if (this.connecting || this.connected) return { ok: false, error: 'already_connected' };
    const { TWITCH_CLIENT_ID: clientId, TWITCH_OAUTH_TOKEN: token, TWITCH_BOT_LOGIN: botLogin } = process.env;
    const channelLogin = String(requestedChannel || process.env.TWITCH_CHANNEL_LOGIN || '').trim().replace(/^#/, '').toLowerCase();
    if (!/^[a-z0-9_]{1,25}$/.test(channelLogin)) return { ok: false, error: 'invalid_channel' };
    if (!clientId || !token || !botLogin) return { ok: false, error: 'eventsub_not_configured' };
    this.connecting = true;
    this.channelLogin = channelLogin;
    try {
      const auth = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` } });
      if (!auth.ok) throw failure('invalid_token', `validate ${auth.status}`);
      const authData = await auth.json();
      for (const scope of ['user:read:chat', 'user:bot']) if (!authData.scopes?.includes(scope)) throw failure('missing_scope', scope);

      const channels = await this.helix(`/users?login=${encodeURIComponent(channelLogin)}`, clientId, token);
      const bots = await this.helix(`/users?login=${encodeURIComponent(botLogin)}`, clientId, token);
      if (!channels.data?.[0]) throw failure('channel_not_found', channelLogin);
      if (!bots.data?.[0]) throw failure('channel_not_found', botLogin);
      const broadcasterId = channels.data[0].id;
      const botUserId = bots.data[0].id;
      if (authData.user_id !== botUserId) throw failure('token_user_mismatch', botLogin);

      const socket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
      this.socket = socket;
      this.connectionTimer = setTimeout(() => this.fail(socket, 'connection_timeout'), SUBSCRIBE_TIMEOUT_MS);
      socket.addEventListener('message', async event => {
        if (socket !== this.socket) return;
        const data = JSON.parse(event.data);
        const type = data.metadata?.message_type;
        if (type === 'session_welcome') {
          this.sessionId = data.payload.session.id;
          try {
            const sub = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Client-Id': clientId, 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: broadcasterId, user_id: botUserId }, transport: { method: 'websocket', session_id: this.sessionId } })
            });
            if (!sub.ok) throw failure('subscription_failed', `${sub.status}: ${(await sub.text()).slice(0, 200)}`);
            const result = await sub.json();
            clearTimeout(this.connectionTimer);
            this.connected = true;
            this.connecting = false;
            this.emit({ joined: true, subscriptionId: result.data?.[0]?.id });
          } catch (error) {
            this.fail(socket, error.code || 'subscription_failed', error.detail || error.message);
          }
        } else if (type === 'notification' && data.metadata.subscription_type === 'channel.chat.message') {
          const eventData = data.payload.event;
          // Los fragmentos de tipo 'emote' se descartan para que el filtro y la IA solo vean el texto escrito.
          const fragments = eventData.message.fragments || [{ type: 'text', text: eventData.message.text }];
          const emotesRemoved = fragments.filter(fragment => fragment.type === 'emote').length;
          const text = fragments.filter(fragment => fragment.type !== 'emote').map(fragment => fragment.text).join('').replace(/\s+/g, ' ').trim();
          this.acceptMessage({ author: eventData.chatter_user_name, text, source: 'twitch', emotesRemoved });
        }
      });
      socket.addEventListener('error', () => this.fail(socket, 'connection_error'));
      socket.addEventListener('close', () => {
        if (socket !== this.socket) return;
        clearTimeout(this.connectionTimer);
        this.reset();
        this.emit({ closed: true });
      });
      return { ok: true, channel: channelLogin };
    } catch (error) {
      this.reset();
      return { ok: false, error: error.code || 'connection_error', detail: error.detail || error.message };
    }
  }

  reset() {
    this.socket = null;
    this.sessionId = null;
    this.connected = false;
    this.connecting = false;
  }

  // Marca el error y cierra; el 'close' posterior se ignora porque this.socket ya no apunta a este socket.
  fail(socket, code, detail) {
    if (socket !== this.socket) return;
    clearTimeout(this.connectionTimer);
    this.reset();
    this.emit({ error: code, detail });
    try { socket.close(); } catch { /* el socket ya estaba cerrado */ }
  }

  disconnect() {
    clearTimeout(this.connectionTimer);
    const socket = this.socket;
    this.reset();
    socket?.close();
  }

  async helix(resource, clientId, token) {
    const response = await fetch(`https://api.twitch.tv/helix${resource}`, { headers: { Authorization: `Bearer ${token}`, 'Client-Id': clientId } });
    if (response.status === 401) throw failure('invalid_token', 'helix 401');
    if (!response.ok) throw failure('connection_error', `Twitch API ${response.status}: ${(await response.text()).slice(0, 180)}`);
    return response.json();
  }
}

module.exports = { EventSubClient };
