(() => {
  // Textos en inglés o español según ?lang= o el idioma del navegador.
  const params = new URLSearchParams(location.search);
  const lang = (params.get('lang') || navigator.language || 'en').slice(0, 2) === 'es' ? 'es' : 'en';
  const texts = {
    en: { subtitle: 'Streamer panel', user: 'Username', password: 'Password', submit: 'Log in', note: 'The OBS overlay needs no login:', error: 'Wrong username or password.', locked: 'Too many attempts. Wait 10 minutes and try again.' },
    es: { subtitle: 'Panel del streamer', user: 'Usuario', password: 'Contraseña', submit: 'Entrar', note: 'El overlay de OBS no necesita iniciar sesión:', error: 'Usuario o contraseña incorrectos.', locked: 'Demasiados intentos. Espera 10 minutos y vuelve a intentarlo.' }
  }[lang];
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach(node => { node.textContent = texts[node.dataset.t]; });
  document.title = `Gumball Chat · ${texts.submit}`;
  const error = params.get('error');
  if (error) {
    const box = document.getElementById('login-error');
    box.textContent = error === 'locked' ? texts.locked : texts.error;
    box.hidden = false;
  }
  // El formulario vuelve a la página que se pidió antes de iniciar sesión.
  document.getElementById('login-form').action = `/login?next=${encodeURIComponent(params.get('next') || '/')}`;
})();
