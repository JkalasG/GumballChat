const channelArg = process.argv[2];
const channel = String(channelArg || '').replace(/^#/, '').toLowerCase();

if (!channel || !/^[a-z0-9_]{1,25}$/.test(channel)) {
  console.error('Uso: node scripts/test-anonymous-irc.js NOMBRE_DEL_CANAL');
  process.exit(2);
}
if (typeof WebSocket === 'undefined') {
  console.error('ERROR: este script requiere WebSocket nativo (usa Node.js 22 o posterior).');
  process.exit(2);
}

const nick = `justinfan${Math.floor(10000 + Math.random() * 90000)}`;
const socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
let joined = false;
let received = 0;
let rejected = false;
let finished = false;
const timer = setTimeout(finish, 30000);

console.log(`Conectando a Twitch IRC como ${nick} sin token; canal #${channel}.`);
socket.addEventListener('open', () => {
  console.log('WebSocket abierto. Enviando PASS/NICK/JOIN y escuchando durante 30 segundos...');
  socket.send('PASS SCHMOOPIIE\r\n');
  socket.send(`NICK ${nick}\r\n`);
  socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
  socket.send(`JOIN #${channel}\r\n`);
});

socket.addEventListener('message', event => {
  const raw = String(event.data);
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('PING ')) {
      socket.send(`PONG ${line.slice(5)}\r\n`);
      continue;
    }
    if (/\sNOTICE\s/.test(line)) {
      console.log(`[IRC NOTICE] ${line}`);
      if (/login authentication failed|improperly formatted auth/i.test(line)) rejected = true;
    }
    const joinedLine = line.match(/^:([^! ]+)!?[^ ]*\s+JOIN\s+#([^ ]+)/i);
    if (joinedLine && joinedLine[1].toLowerCase() === nick && joinedLine[2].toLowerCase() === channel) {
      joined = true;
      console.log(`Unión confirmada a #${channel}.`);
    }
    const message = line.match(/^:([^! ]+)!([^ ]+)\s+PRIVMSG\s+#([^ ]+)\s+:(.*)$/i);
    if (message && message[3].toLowerCase() === channel) {
      joined = true;
      received++;
      console.log(`[${message[1]}] ${message[4]}`);
    }
  }
});

socket.addEventListener('error', () => console.error('Error del WebSocket al conectar con Twitch IRC.'));
socket.addEventListener('close', event => {
  if (!finished && event.code !== 1000) console.log(`Socket cerrado antes del final (código ${event.code}).`);
});

function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
  console.log('\n--- Resultado ---');
  if (joined || received > 0) {
    console.log(`ÉXITO: se pudo entrar en #${channel} sin OAuth.${received ? ` Mensajes recibidos: ${received}.` : ' No llegaron mensajes durante la prueba.'}`);
    process.exitCode = 0;
  } else {
    console.log(`NO FUNCIONÓ: no se confirmó la unión a #${channel} sin OAuth.${rejected ? ' Twitch rechazó explícitamente la autenticación anónima.' : ' Puede ser un bloqueo de red, canal offline/incorrecto o rechazo sin mensaje explícito.'}`);
    process.exitCode = 1;
  }
}
