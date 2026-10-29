class EventSubClient {
  constructor({ acceptMessage, broadcast }) {
    this.acceptMessage = acceptMessage;
    this.broadcast = broadcast;
    this.socket = null;
    this.sessionId = null;
    this.connecting = false;
  }

  get status() {
    return {
      connected: Boolean(this.socket && this.socket.readyState === WebSocket.OPEN),
      configured: Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_OAUTH_TOKEN && process.env.TWITCH_CHANNEL_LOGIN && process.env.TWITCH_BOT_LOGIN)
    };
  }

  async connect() {
    if (this.connecting) return { ok: false, error: 'Conexión en progreso.' };
    const { TWITCH_CLIENT_ID: clientId, TWITCH_OAUTH_TOKEN: token, TWITCH_CHANNEL_LOGIN: channelLogin, TWITCH_BOT_LOGIN: botLogin } = process.env;
    if (!clientId || !token || !channelLogin || !botLogin) return { ok: false, error: 'Configura TWITCH_CLIENT_ID, TWITCH_OAUTH_TOKEN, TWITCH_CHANNEL_LOGIN y TWITCH_BOT_LOGIN en .env.' };
    this.connecting = true;
    try {
      const auth = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${token}` } });
      if (!auth.ok) throw new Error(`Token inválido (${auth.status}).`);
      const authData = await auth.json();
      if (!authData.scopes?.includes('user:read:chat')) throw new Error('Falta el scope user:read:chat.');
      if (!authData.scopes?.includes('user:bot')) throw new Error('Falta el scope user:bot para el bot de EventSub.');

      const channels = await this.helix(`/users?login=${encodeURIComponent(channelLogin)}`, clientId, token);
      const bots = await this.helix(`/users?login=${encodeURIComponent(botLogin)}`, clientId, token);
      if (!channels.data?.[0] || !bots.data?.[0]) throw new Error('No encontré el canal o la cuenta bot en Twitch.');
      const broadcasterId = channels.data[0].id;
      const botUserId = bots.data[0].id;
      if (authData.user_id !== botUserId) throw new Error('El token no pertenece al usuario de TWITCH_BOT_LOGIN.');

      this.socket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
      this.socket.addEventListener('message', async event => {
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
            if (!sub.ok) throw new Error(`EventSub respondió ${sub.status}: ${(await sub.text()).slice(0, 200)}`);
            const result = await sub.json();
            this.broadcast({ type: 'twitch-status', connected: true, subscriptionId: result.data?.[0]?.id });
          } catch (error) {
            this.broadcast({ type: 'twitch-status', connected: false, error: error.message });
          }
        } else if (type === 'notification' && data.metadata.subscription_type === 'channel.chat.message') {
          const eventData = data.payload.event;
          this.acceptMessage({ author: eventData.chatter_user_name, text: eventData.message.text, source: 'twitch' });
        }
      });
      this.socket.addEventListener('error', () => this.broadcast({ type: 'twitch-status', connected: false, error: 'Error en WebSocket EventSub.' }));
      this.socket.addEventListener('close', () => {
        this.sessionId = null;
        this.broadcast({ type: 'twitch-status', connected: false });
      });
      return { ok: true, message: 'Abriendo EventSub. Se confirmará cuando la suscripción esté lista.' };
    } catch (error) {
      this.socket?.close();
      this.socket = null;
      return { ok: false, error: error.message };
    } finally {
      this.connecting = false;
    }
  }

  async helix(resource, clientId, token) {
    const response = await fetch(`https://api.twitch.tv/helix${resource}`, { headers: { Authorization: `Bearer ${token}`, 'Client-Id': clientId } });
    if (!response.ok) throw new Error(`Twitch API ${response.status}: ${(await response.text()).slice(0, 180)}`);
    return response.json();
  }
}

module.exports = { EventSubClient };
