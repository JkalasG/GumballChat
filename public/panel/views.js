(() => {
  const views = ['queue', 'languages', 'settings', 'activity'];
  function activateView() {
    const requested = location.hash.slice(1);
    const active = views.includes(requested) ? requested : 'queue';
    document.querySelectorAll('[data-view]').forEach(view => {
      const selected = view.dataset.view === active;
      view.classList.toggle('is-active', selected);
      view.hidden = !selected;
    });
    document.querySelectorAll('[data-nav-view]').forEach(link => {
      const selected = link.dataset.navView === active;
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const title = document.getElementById('active-page-title');
    if (title) title.textContent = window.I18N.t('panel.' + active);
    document.body.dataset.activeView = active;
  }
  window.addEventListener('hashchange', activateView);
  window.addEventListener('gumball-ui-language', activateView);
  activateView();
})();