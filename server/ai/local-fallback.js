const CATEGORIES = new Set(['pista', 'spoiler', 'prediccion', 'animo', 'reto', 'descartar']);

function shouldDrop(text) {
  const value = String(text || '').trim();
  if (!value || value.length < 4 || value.length > 260) return true;
  if (/^(\s|\p{Extended_Pictographic})+$/u.test(value)) return true;
  if (/^(.)\1{5,}$/u.test(value)) return true;
  if (/^(pogchamp|lul|omegalul|kreygasm|monkas|pepega|sadge|4head|catjam|peepo|copium|kekw|kappa|pog)(?:\s+\1)*$/iu.test(value)) return true;
  if (/^(\w+)(?:\s+\1){3,}$/iu.test(value)) return true;
  if (/^(lol|lmao|(?:ja){3,}|(?:je){3,}|(?:ha){3,}|(?:xd){2,}|k{4,}|(?:rs){2,}|www+|pog+|kappa+)$/iu.test(value)) return true;
  return false;
}

function isSafe(text) {
  const value = String(text || '');
  const hasPersonalData = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(value) || /(?:\+?\d[\d\s().-]{8,}\d)/.test(value);
  const hasAbuse = /\b(fuck(?:ing)?|shit|bitch|cunt|nigger|faggot|retard|idiot|moron|stupid|loser|worthless|shut up|kill yourself|go die|puta|puto|mierda|cabron|cabr[oó]n|imb[eé]cil|idiota|in[uú]til|est[uú]pido|c[aá]llate|filho da puta|vai se ferrar|seu lixo|merda|putain|connard|salope|ta gueule)\b/i.test(value);
  const hasSexualContent = /\b(sex|porn|nude|nudes|naked|rape|sexo|porno|desnuda|desnudo|violaci[oó]n|estupro|n[uú]e)\b/i.test(value);
  const isPromptInjection = /(?:ignore|olvida|ignora).{0,35}(?:instrucciones|instructions|prompt|system)|(?:revela|muestra|reveal|show).{0,30}(?:clave|key|token|secret)|(?:api.?key|clave api)/i.test(value);
  return !(hasPersonalData || hasAbuse || hasSexualContent || isPromptInjection);
}

function classify(text) {
  const t = String(text).toLowerCase();
  if (/ネタバレ|最後のボス/u.test(t)) return 'spoiler';
  if (/予言|きっと|賭け/u.test(t)) return 'prediccion';
  if (/チャレンジ|ジャンプせず/u.test(t)) return 'reto';
  if (/\b(spoiler|final boss|plot twist|muere al final|se muere|el asesino es|ending|secret ending|o chefe final|chef[aã]o final|spoiler|le boss final|spoiler)\b/i.test(t)) return 'spoiler';
  if (/\b(predigo|predicci[oó]n|apuesto que|seguro que|va a morir|you will die|i predict|bet you|je pr[eé]dis|je parie|eu prevejo|aposto que|予言|きっと)\b/i.test(t)) return 'prediccion';
  if (/défi/i.test(t)) return 'reto';
  if (/\b(reto|challenge|desaf[ií]o|défi|tente|try to|sem pular|sin saltar|no uses|hazlo con|do it without|sans sauter|挑戦)\b/i.test(t)) return 'reto';
  if (/\b(ánimo|animo|tú puedes|tu puedes|vamos|you got this|good luck|te queremos|great job|eres genial|força|voc[eê] consegue|bonne chance|tu peux le faire)\b/i.test(t) || /頑張って|あなたならできる/u.test(t)) return 'animo';
  if (/\b(pista|consejo|usa|ve a|busca|llave|puerta|hint|tip|go to|look for|try|behind|debajo|izquierda|derecha|chave|porta|procure|dica|indice|cl[eé]|derri[eè]re)\b/i.test(t)) return 'pista';
  return 'descartar';
}

function detectLanguage(text) {
  if (/[ぁ-ヿ一-龯]/u.test(text)) return 'ja';
  if (/você|voce|aposto|nao|não|obrigado|dica|chave|porta|força/i.test(text)) return 'pt';
  if (/\b(le|une|pour|avec|bonjour|je|pr[eé]dis|derri[eè]re|bonne)\b|défi|salle|sauter/i.test(text)) return 'fr';
  if (/[¿¡ñáéíóúü]/i.test(text) || /\b(el|la|que|por|puedes|mira|pista|ánimo|animo|reto|llave)\b|predigo|vas a|jefe|intento/i.test(text)) return 'es';
  return 'en';
}

function analyze(text) {
  const safe = isSafe(text);
  const category = safe ? classify(text) : 'descartar';
  return {
    keep: safe && category !== 'descartar',
    category: CATEGORIES.has(category) ? category : 'descartar',
    sourceLanguage: detectLanguage(text),
    translatedText: String(text),
    highlight: false,
    safe
  };
}

module.exports = { shouldDrop, isSafe, analyze, CATEGORIES };
