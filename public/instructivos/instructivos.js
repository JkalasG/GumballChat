(() => {
  const aliases={en:{pista:'hint',reto:'challenge',animo:'cheer',prediccion:'prediction',spoiler:'spoiler'},es:{pista:'pista',reto:'reto',animo:'animo',prediccion:'prediccion',spoiler:'spoiler'}};
  const examples={en:'Finish the room without jumping',es:'Termina la sala sin saltar'};
  function apply(language){
    window.I18N.resolveLanguage(language);
    window.I18N.applyI18n();
    const active=window.I18N.current();
    for(const [category,tag] of Object.entries(aliases[active]))document.getElementById(`tag-${category}`).textContent=`&${tag}`;
    document.getElementById('example-tag').textContent=`&${aliases[active].reto}`;
    document.getElementById('example-text').textContent=examples[active];
    document.documentElement.lang=active;
  }
  fetch('/api/settings').then(response=>response.json()).then(settings=>apply(settings.uiLanguage)).catch(()=>apply());
  const socket=new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?client=viewer`);
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='settings')apply(data.settings.uiLanguage);if(data.type==='state'&&data.data.settings)apply(data.data.settings.uiLanguage);});
})();
