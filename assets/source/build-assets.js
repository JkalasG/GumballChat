// Genera logotipos y portadas de Gumball Chat como SVG con fuentes incrustadas.
const fs = require('fs');
const ROOT = require('path').resolve(__dirname, '../..'), OUT = ROOT + '/assets';
const b64 = f => fs.readFileSync(ROOT + '/public/vendor/fonts/' + f).toString('base64');
const FONTS = `<style>@font-face{font-family:'Bagel Fat One';src:url(data:font/woff2;base64,${b64('BagelFatOne-latin.woff2')}) format('woff2')}@font-face{font-family:'Bricolage Grotesque';font-weight:100 900;src:url(data:font/woff2;base64,${b64('BricolageGrotesque-latin.woff2')}) format('woff2')}</style>`;
const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const COLORS = ['#FFD23F', '#FF5A36', '#FF6FB5', '#8A5CF6', '#3A3147'];
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function ballDefs(p) {
  return COLORS.map((c, i) => `<radialGradient id="${p}b${i}" cx=".36" cy=".3" r=".78"><stop offset="0" stop-color="${mix(c, '#ffffff', .6)}"/><stop offset=".42" stop-color="${c}"/><stop offset="1" stop-color="${mix(c, '#000000', .5)}"/></radialGradient>`).join('');
}
function ball(p, x, y, r, ci, opacity = 1) {
  return `<g opacity="${opacity}"><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${p}b${ci})"/><ellipse cx="${(x - r * .34).toFixed(1)}" cy="${(y - r * .4).toFixed(1)}" rx="${(r * .3).toFixed(1)}" ry="${(r * .17).toFixed(1)}" transform="rotate(-32 ${(x - r * .34).toFixed(1)} ${(y - r * .4).toFixed(1)})" fill="#fff" opacity=".78"/></g>`;
}

// Máquina en coordenadas locales: centro del globo en (0,0), radio 150. Ocupa x ±176, y -298..336.
function machine(p, seed = 7) {
  const rand = rng(seed);
  const defs = `${ballDefs(p)}
  <linearGradient id="${p}ch" x1="0" x2="1"><stop offset="0" stop-color="#6f837e"/><stop offset=".2" stop-color="#f5fbf9"/><stop offset=".45" stop-color="#bfcec9"/><stop offset=".72" stop-color="#eef6f3"/><stop offset="1" stop-color="#62756f"/></linearGradient>
  <linearGradient id="${p}jade" x1="0" x2="1"><stop offset="0" stop-color="#053d37"/><stop offset=".22" stop-color="#17a08b"/><stop offset=".5" stop-color="#0F7C6E"/><stop offset="1" stop-color="#043530"/></linearGradient>
  <linearGradient id="${p}shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
  <radialGradient id="${p}gback" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#1c6c60" stop-opacity=".18"/><stop offset="1" stop-color="#04302a" stop-opacity=".55"/></radialGradient>
  <radialGradient id="${p}gfront" cx=".36" cy=".3" r=".78"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset=".45" stop-color="#fff" stop-opacity=".03"/><stop offset=".82" stop-color="#cffff1" stop-opacity=".05"/><stop offset="1" stop-color="#d6fff3" stop-opacity=".38"/></radialGradient>
  <linearGradient id="${p}tube" x1="0" x2="1"><stop offset="0" stop-color="#0a322d" stop-opacity=".5"/><stop offset=".2" stop-color="#e6fff8" stop-opacity=".4"/><stop offset=".5" stop-color="#96d2c3" stop-opacity=".08"/><stop offset=".8" stop-color="#e6fff8" stop-opacity=".28"/><stop offset="1" stop-color="#0a322d" stop-opacity=".5"/></linearGradient>
  <clipPath id="${p}clip"><circle r="147"/></clipPath>`;
  const back = [], front = [];
  for (let k = 0; k < 5; k++) {
    const y = 118 - k * 46;
    for (let col = -3; col <= 3; col++) {
      const x = col * 54 + (k % 2 ? 27 : 0);
      if (Math.hypot(x, y) <= 121) front.push(ball(p, (x + (rand() - .5) * 6).toFixed(1), (y + (rand() - .5) * 5).toFixed(1), (26 + rand() * 3).toFixed(1), Math.floor(rand() * COLORS.length)));
      const bx = x + 27, by = y - 14;
      if (k < 4 && Math.hypot(bx, by) <= 124) back.push(ball(p, bx, by, 23, Math.floor(rand() * COLORS.length), .72));
    }
  }
  const body = `
  <ellipse cy="336" rx="178" ry="17" fill="#000" opacity=".3"/>
  <path d="M-92 150 L92 150 L124 302 Q126 316 112 316 L-112 316 Q-126 316 -124 302 Z" fill="url(#${p}jade)"/>
  <path d="M-92 150 L92 150 L124 302 Q126 316 112 316 L-112 316 Q-126 316 -124 302 Z" fill="url(#${p}shade)"/>
  <path d="M-97 178 L97 178" stroke="#F8B735" stroke-width="3" opacity=".85"/>
  <rect x="-142" y="312" width="284" height="20" rx="10" fill="url(#${p}ch)" stroke="#0b2a25" stroke-opacity=".35"/>
  <circle cy="234" r="35" fill="url(#${p}ch)" stroke="#022b26" stroke-opacity=".45" stroke-width="2"/>
  <circle cy="234" r="25" fill="#dbe6e2"/>
  <g transform="rotate(-28 0 234)"><rect x="-42" y="228" width="84" height="12" rx="6" fill="url(#${p}ch)" stroke="#022b26" stroke-opacity=".3"/><circle cx="-42" cy="234" r="10" fill="#FF5A36"/><circle cx="42" cy="234" r="10" fill="#FF5A36"/><circle cx="-45" cy="231" r="3" fill="#fff" opacity=".7"/><circle cx="39" cy="231" r="3" fill="#fff" opacity=".7"/></g>
  <circle cy="234" r="7" fill="#879c96"/>
  <path d="M-32 278 h64 v22 q0 9 -9 9 h-46 q-9 0 -9 -9z" fill="#03302a"/>
  ${ball(p, 0, 297, 10, 0)}
  <rect x="-98" y="136" width="196" height="20" rx="9" fill="url(#${p}ch)" stroke="#0b2a25" stroke-opacity=".35"/>
  <circle r="150" fill="url(#${p}gback)"/>
  <g clip-path="url(#${p}clip)">
    <rect x="-17" y="-150" width="34" height="56" fill="url(#${p}tube)"/>
    <ellipse cy="-95" rx="20" ry="5" fill="none" stroke="url(#${p}ch)" stroke-width="4"/>
    ${back.join('')}${front.join('')}
  </g>
  <circle r="150" fill="url(#${p}gfront)"/>
  <path d="M-116 -36 A 122 122 0 0 1 -34 -128" fill="none" stroke="#fff" stroke-opacity=".62" stroke-width="13" stroke-linecap="round"/>
  <path d="M-128 4 A 128 128 0 0 1 -126 -14" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="7" stroke-linecap="round"/>
  <path d="M120 70 A 138 138 0 0 1 78 118" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="5" stroke-linecap="round"/>
  <circle cx="-70" cy="-96" r="5" fill="#fff" opacity=".85"/>
  <circle r="150" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>
  <circle r="152.5" fill="none" stroke="#022b26" stroke-opacity=".55" stroke-width="3"/>
  <path d="M-64 -134 Q-62 -172 0 -174 Q62 -172 64 -134 Z" fill="url(#${p}ch)" stroke="#0b2a25" stroke-opacity=".35"/>
  <ellipse cy="-134" rx="66" ry="9" fill="url(#${p}ch)" stroke="#0b2a25" stroke-opacity=".35"/>
  <rect x="-17" y="-248" width="34" height="114" fill="#04302a" opacity=".35"/>
  ${ball(p, 0, -214, 14, 2)}
  <rect x="-17" y="-248" width="34" height="114" fill="url(#${p}tube)"/>
  <path d="M-17 -248 V-134 M17 -248 V-134" stroke="#ebfff9" stroke-opacity=".65" stroke-width="2"/>
  <path d="M-9 -240 V-150" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
  <rect x="-25" y="-186" width="50" height="13" rx="5" fill="url(#${p}ch)" stroke="#0b2a25" stroke-opacity=".35"/>
  <ellipse cy="-278" rx="41" ry="9" fill="#0a2420" stroke="#e8f1ee" stroke-width="2.5"/>
  ${ball(p, 4, -284, 14, 0)}
  <path d="M-41 -278 L-19 -248 L19 -248 L41 -278 A 41 9 0 0 1 -41 -278 Z" fill="url(#${p}ch)" stroke="#0b2a25" stroke-opacity=".35"/>
  <path d="M-39 -276 A 41 9 0 0 0 39 -276" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2"/>
  <ellipse cy="-247" rx="21" ry="4" fill="none" stroke="url(#${p}ch)" stroke-width="4"/>`;
  return { defs, body };
}

const svg = (w, h, defs, body, fonts = true) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${fonts ? FONTS : ''}<defs>${defs}</defs>${body}</svg>\n`;
const write = (name, content) => { fs.mkdirSync(require('path').dirname(OUT + '/' + name), { recursive: true }); fs.writeFileSync(OUT + '/' + name, content); };

// ---------- Logotipos ----------
{
  const m = machine('m');
  write('logo/gumball-chat-mark.svg', svg(400, 680, m.defs, `<g transform="translate(200 312)">${m.body}</g>`, false));
}
{
  const m = machine('i', 11);
  const defs = `${m.defs}<linearGradient id="ibg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#17a08b"/><stop offset="1" stop-color="#05443d"/></linearGradient>
  <pattern id="istripe" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="22" height="44" fill="#fff" opacity=".05"/></pattern>
  <radialGradient id="iglow" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="#9ff5dc" stop-opacity=".45"/><stop offset="1" stop-color="#9ff5dc" stop-opacity="0"/></radialGradient>`;
  write('logo/gumball-chat-icon.svg', svg(512, 512, defs, `<rect width="512" height="512" rx="112" fill="url(#ibg)"/><rect width="512" height="512" rx="112" fill="url(#istripe)"/><rect width="512" height="512" rx="112" fill="url(#iglow)"/><g transform="translate(256 262) scale(.62)">${m.body}</g>`, false));
  write('logo/gumball-chat-avatar.svg', svg(800, 800, defs.replace(/id="i(bg|stripe|glow)"/g, 'id="a$1"'), `<rect width="800" height="800" fill="url(#abg)"/><rect width="800" height="800" fill="url(#astripe)"/><rect width="800" height="800" fill="url(#aglow)"/><g transform="translate(400 420) scale(.95)">${m.body}</g>`, false));
}
for (const [variant, gum, chat, sub] of [['dark', '#FFF6D7', '#FFD23F', '#9fd6c6'], ['light', '#0F7C6E', '#FF5A36', '#5e7a72']]) {
  const m = machine('h' + variant);
  const shadow = variant === 'dark' ? `<text x="236" y="186" font-family="Bagel Fat One" font-size="132" fill="#022b26" opacity=".55">Gumball <tspan>Chat</tspan></text>` : '';
  write(`logo/gumball-chat-horizontal-${variant}.svg`, svg(1180, 300, m.defs, `<g transform="translate(110 150) scale(.42)">${m.body}</g>${shadow}<text x="236" y="178" font-family="Bagel Fat One" font-size="132" fill="${gum}">Gumball <tspan fill="${chat}">Chat</tspan></text><text x="242" y="238" font-family="Bricolage Grotesque" font-weight="700" font-size="30" letter-spacing="1" fill="${sub}">Your Twitch chat, one gumball at a time</text>`));
}

// ---------- Portadas ----------
const tags = { en: [['Hint', 0], ['Challenge', 1], ['Cheer', 2], ['Prediction', 3], ['Spoiler', 4]], es: [['Pista', 0], ['Reto', 1], ['Ánimo', 2], ['Predicción', 3], ['Spoiler', 4]] };
const copy = {
  en: { pill: 'FOR TWITCH STREAMERS', tag: 'Your chat, one gumball at a time.', sub: ['AI sorts, translates & filters your chat.', 'You open the best ones live.'], cat: 'Hint', lang: 'English', msg: ['Check the left wall,', 'there’s a secret door!'], author: '@PixelPal', stamp: 'Chat to the rescue!' },
  es: { pill: 'PARA STREAMERS DE TWITCH', tag: 'Tu chat, una bolita a la vez.', sub: ['La IA ordena, traduce y filtra tu chat.', 'Tú abres lo mejor en directo.'], cat: 'Pista', lang: 'Español', msg: ['Revisa la pared izquierda,', '¡hay una puerta secreta!'], author: '@PixelPal', stamp: '¡Ayuda del chat!' }
};
function chips(lang, x, y) {
  let cx = x, out = '';
  for (const [label, ci] of tags[lang]) {
    const w = 38 + label.length * 9.4;
    out += `<rect x="${cx}" y="${y}" width="${w}" height="40" rx="20" fill="#fff" fill-opacity=".09" stroke="#fff" stroke-opacity=".2"/><circle cx="${cx + 19}" cy="${y + 20}" r="8" fill="${COLORS[ci]}" stroke="#fff" stroke-opacity="${ci === 4 ? .7 : 0}"/><text x="${cx + 32}" y="${y + 27}" font-family="Bricolage Grotesque" font-weight="700" font-size="17" fill="#f3efe0">${label}</text>`;
    cx += w + 10;
  }
  return out;
}
function card(c) {
  return `<g transform="rotate(-4)">
  <rect x="6" y="14" width="360" height="176" rx="20" fill="#000" opacity=".35"/>
  <rect width="360" height="176" rx="20" fill="#FFFAE3" stroke="#B98A00" stroke-width="4"/>
  <path d="M2 50 V20 A18 18 0 0 1 20 2 H340 A18 18 0 0 1 358 20 V50 Z" fill="#FFD23F"/>
  <path d="M2 50 V20 A18 18 0 0 1 20 2 H340 A18 18 0 0 1 358 20 V50 Z" fill="url(#cstripe)"/>
  <path d="M2 50 H358" stroke="#B98A00" stroke-width="3"/>
  <text x="84" y="37" font-family="Bagel Fat One" font-size="24" fill="#3B2D00">${c.cat}</text>
  <rect x="262" y="12" width="84" height="28" rx="14" fill="#fff" opacity=".9"/><text x="304" y="31" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="13" fill="#25231f">${c.lang}</text>
  <text x="22" y="92" font-family="Bricolage Grotesque" font-weight="700" font-size="23" fill="#2F2400">${esc(c.msg[0])}</text>
  <text x="22" y="121" font-family="Bricolage Grotesque" font-weight="700" font-size="23" fill="#2F2400">${esc(c.msg[1])}</text>
  <rect x="18" y="138" width="130" height="28" rx="14" fill="#FFD23F"/><circle cx="33" cy="152" r="10" fill="#FFFAE3"/><text x="33" y="157" text-anchor="middle" font-family="Bagel Fat One" font-size="12" fill="#2F2400">P</text><text x="49" y="157" font-family="Bricolage Grotesque" font-weight="800" font-size="14" fill="#3B2D00">${c.author}</text>
  <g transform="rotate(-7 268 152)"><rect x="${268 - c.stamp.length * 4.6}" y="139" width="${c.stamp.length * 9.2}" height="26" rx="6" fill="none" stroke="#B98A00" stroke-width="2.5"/><text x="268" y="158" text-anchor="middle" font-family="Bagel Fat One" font-size="13" fill="#B98A00">${esc(c.stamp.toUpperCase())}</text></g>
  <circle cx="34" cy="10" r="40" fill="url(#cbadge)" stroke="#FFFAE3" stroke-width="4"/>
  <g transform="translate(16 -8) scale(1.5)" fill="none" stroke="#3B2D00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/></g>
  </g>`;
}
function cover(w, h, lang, name) {
  const c = copy[lang], k = Math.min(h / 720, w / 1280), oy = (h - 720 * k) / 2, pad = 0.05 * w;
  const m = machine('c', 3), rand = rng(42);
  const defs = `${m.defs}
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d6a5e"/><stop offset=".55" stop-color="#074c44"/><stop offset="1" stop-color="#042f2a"/></linearGradient>
  <radialGradient id="glow" cx="${(w - pad - 250 * k) / w}" cy=".46" r=".5"><stop offset="0" stop-color="#7ff0cf" stop-opacity=".42"/><stop offset="1" stop-color="#7ff0cf" stop-opacity="0"/></radialGradient>
  <pattern id="stripe" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="28" height="56" fill="#fff" opacity=".035"/></pattern>
  <pattern id="cstripe" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="12" height="24" fill="#fff" opacity=".38"/></pattern>
  <radialGradient id="cbadge" cx=".32" cy=".28" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".38" stop-color="#FFD23F"/><stop offset="1" stop-color="#B98A00"/></radialGradient>
  <filter id="blur"><feGaussianBlur stdDeviation="5"/></filter>`;
  let deco = '';
  for (let i = 0; i < 16; i++) {
    const x = rand() * w, y = rand() * h, r = (12 + rand() * 26) * k, ci = Math.floor(rand() * 5);
    deco += `<g opacity="${(.25 + rand() * .3).toFixed(2)}" ${r > 26 * k ? 'filter="url(#blur)"' : ''}>${ball('c', x.toFixed(0), y.toFixed(0), r.toFixed(1), ci)}</g>`;
  }
  const left = `<g transform="translate(${pad} ${oy}) scale(${k})">
    <rect x="0" y="112" width="${c.pill.length * 12.2 + 40}" height="40" rx="20" fill="#9146FF"/><circle cx="22" cy="132" r="6" fill="#fff"/><text x="36" y="139" font-family="Bricolage Grotesque" font-weight="800" font-size="18" letter-spacing="1.5" fill="#fff">${c.pill}</text>
    <text x="0" y="306" font-family="Bagel Fat One" font-size="150" fill="#022b26" opacity=".6">Gumball</text><text x="0" y="296" font-family="Bagel Fat One" font-size="150" fill="#FFF6D7">Gumball</text>
    <text x="0" y="446" font-family="Bagel Fat One" font-size="150" fill="#022b26" opacity=".6">Chat</text><text x="0" y="436" font-family="Bagel Fat One" font-size="150" fill="#FFD23F">Chat</text>
    <text x="4" y="508" font-family="Bricolage Grotesque" font-weight="800" font-size="34" fill="#FFF6D7">${esc(c.tag)}</text>
    <text x="4" y="548" font-family="Bricolage Grotesque" font-weight="500" font-size="21" fill="#b7ddd1">${esc(c.sub[0])}</text><text x="4" y="576" font-family="Bricolage Grotesque" font-weight="500" font-size="21" fill="#b7ddd1">${esc(c.sub[1])}</text>
    ${chips(lang, 0, 606)}
  </g>`;
  const right = `<g transform="translate(${w - pad - 250 * k} ${oy}) scale(${k})">
    <path d="M4 52 C -60 10, -150 120, -190 330" fill="none" stroke="#FFD23F" stroke-width="4" stroke-dasharray="2 14" stroke-linecap="round" opacity=".75"/>
    <g transform="translate(0 340) scale(.95)">${m.body}</g>
    <g transform="translate(-292 488) scale(.9)">${card(c)}</g>
  </g>`;
  write(`covers/${name}`, svg(w, h, defs, `<rect width="${w}" height="${h}" fill="url(#bg)"/><rect width="${w}" height="${h}" fill="url(#stripe)"/><rect width="${w}" height="${h}" fill="url(#glow)"/>${deco}${left}${right}`));
}
for (const lang of ['en', 'es']) {
  cover(1280, 720, lang, `youtube-thumbnail-1280x720-${lang}.svg`);
  cover(1500, 1000, lang, `devpost-cover-1500x1000-${lang}.svg`);
  cover(1280, 640, lang, `github-social-1280x640-${lang}.svg`);
  cover(1200, 480, lang, `twitch-banner-1200x480-${lang}.svg`);
}

// ---------- Paneles de Twitch ----------
const panelText = {
  en: { about: ['Gumball Chat', 'Your messages become gumballs.', 'I open the best ones live!'], tags: 'Chat tags', list: [['&hint', 'a tip for the game'], ['&challenge', 'dare me'], ['&cheer', 'good vibes'], ['&prediction', 'call it'], ['&spoiler', 'sealed till the end']] },
  es: { about: ['Gumball Chat', 'Tus mensajes se vuelven bolitas.', '¡Abro las mejores en directo!'], tags: 'Etiquetas', list: [['&pista', 'un consejo'], ['&reto', 'rétame'], ['&animo', 'buena onda'], ['&prediccion', 'adivina'], ['&spoiler', 'sellado hasta el final']] }
};
for (const lang of ['en', 'es']) {
  const t = panelText[lang], m = machine('p', 5);
  const bg = `<linearGradient id="pbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d6a5e"/><stop offset="1" stop-color="#042f2a"/></linearGradient><pattern id="pst" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="14" height="28" fill="#fff" opacity=".04"/></pattern>`;
  write(`twitch-panels/panel-about-${lang}.svg`, svg(320, 160, m.defs + bg, `<rect width="320" height="160" rx="14" fill="url(#pbg)"/><rect width="320" height="160" rx="14" fill="url(#pst)"/><g transform="translate(284 96) scale(.165)">${m.body}</g><text x="18" y="56" font-family="Bagel Fat One" font-size="30" fill="#FFF6D7">${t.about[0].split(' ')[0]} <tspan fill="#FFD23F">${t.about[0].split(' ')[1]}</tspan></text><text x="18" y="94" font-family="Bricolage Grotesque" font-weight="700" font-size="13" fill="#e6f2ec">${esc(t.about[1])}</text><text x="18" y="116" font-family="Bricolage Grotesque" font-weight="700" font-size="13" fill="#FFD23F">${esc(t.about[2])}</text>`));
  const rows = t.list.map(([tag, desc], i) => `${ball('p', 30, 70 + i * 26, 8, i)}<text x="46" y="${75 + i * 26}" font-family="Bricolage Grotesque" font-weight="800" font-size="15" fill="#FFF6D7">${esc(tag)}</text><text x="${56 + tag.length * 8.6}" y="${75 + i * 26}" font-family="Bricolage Grotesque" font-weight="500" font-size="13.5" fill="#a9d4c7">${esc(desc)}</text>`).join('');
  write(`twitch-panels/panel-tags-${lang}.svg`, svg(320, 200, ballDefs('p') + bg, `<rect width="320" height="200" rx="14" fill="url(#pbg)"/><rect width="320" height="200" rx="14" fill="url(#pst)"/><text x="18" y="42" font-family="Bagel Fat One" font-size="26" fill="#FFD23F">${t.tags}</text>${rows}`));
}
console.log('svg ok');
