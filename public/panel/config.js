(() => {
  const { t, setLanguage, applyI18n } = window.I18N;
  const categories = ['pista','reto','animo','prediccion','spoiler'];
  const ids = ['card-text-mode','card-show-author','card-show-language','card-show-stamp','card-show-badge','card-duration','card-position','card-size','card-animation','card-max-chars','overlay-position','overlay-scale','overlay-show-status'];
  const fixedTexts=[
    ['.channel-card small','panel.status'],['.channel-card strong','panel.ready'],['.sidebar .side-note','panel.choose'],['.welcome-row h1','panel.heading'],['.welcome-row .subtitle','panel.subtitle'],
    ['.stat-card:nth-child(1) small','panel.total'],['.stat-card:nth-child(1) .stat-foot','panel.session'],['.stat-card:nth-child(2) small','panel.pending'],['.stat-card:nth-child(2) .stat-foot','panel.waiting'],['.stat-card:nth-child(3) small','panel.chatLanguages'],['.stat-card:nth-child(3) .stat-foot','panel.community'],
    ['.inventory-panel h2','panel.messages'],['.inventory-panel .section-heading p','panel.categories'],['#refresh span','panel.refresh'],['.inventory-footer span:last-child','panel.sealedNote'],
    ['.draw-card .eyebrow','panel.openMessage'],['.draw-card h2','panel.whatToday'],['.draw-card>p','panel.showStream'],['#draw-button','panel.draw'],['.draw-meta span','panel.yourMoment'],['.sealed-title small','panel.sealed'],['.sealed-title h3','panel.spoilersTitle'],['.sealed-card>p','panel.revealWhenDone'],['#reveal-button','panel.finalReveal'],['.language-card h3','panel.languages'],['.language-card>p','panel.sessionCount'],
    ['.repeat-metrics h2','panel.repeated'],['.repeat-metrics .section-heading p','panel.repeatDescription'],['.demo-heading h3','panel.tests'],['.demo-heading p','panel.testDescription'],['.demo-badge','panel.simulator'],['#send-sample','panel.sendSample'],['#send-custom','panel.sendMessage'],['#fill-machine','panel.fill50'],['.page-footer span:last-child','panel.localSimulator']
  ];
  fixedTexts.forEach(([selector,key])=>{const element=document.querySelector(selector);if(element)element.dataset.i18n=key;});

  document.getElementById('custom-message').dataset.i18nPlaceholder='panel.customPlaceholder';
  const configSocket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  let currentSettings;
  function set(id, value) { const el=document.getElementById(id); if(el) el.value=value; }
  function checked(id, value) { document.getElementById(id).checked=Boolean(value); }
  function paint(settings) {
    if(!settings)return;
    currentSettings=settings;
    window.I18N.resolveLanguage(settings.uiLanguage);
    applyI18n();
    window.dispatchEvent(new CustomEvent('gumball-ui-language'));
    set('ui-language',settings.uiLanguage);set('streamer-language',settings.streamerLanguage);
    set('overlay-position',settings.overlay.position);set('overlay-scale',settings.overlay.scale);checked('overlay-show-status',settings.overlay.showStatus);
    const card=settings.card;
    set('card-text-mode',card.textMode);set('card-duration',card.durationSec);set('card-position',card.position);set('card-size',card.size);set('card-animation',card.animation);set('card-max-chars',card.maxChars);
    checked('card-show-author',card.showAuthor);checked('card-show-language',card.showLanguage);checked('card-show-stamp',card.showStamp);checked('card-show-badge',card.showBadge);
    document.getElementById('overlay-scale-value').textContent=Number(settings.overlay.scale).toFixed(2);
    document.getElementById('card-duration-value').textContent=settings.card.durationSec;
    document.getElementById('card-max-chars-value').textContent=settings.card.maxChars;
    document.getElementById('overlay-url').value=`${location.origin}/overlay`;
    document.getElementById('instructions-url').value=`${location.origin}/instructivos`;
    renderCategories(card.categories);
    const preview=document.getElementById('preview-category');for(const option of preview.options)option.textContent=t('card.category.'+option.value);
    
    if(!document.querySelector('#profile-language'))return;
    document.querySelector('#profile-language').textContent=`${t('panel.streamerLanguage')} · ${t(`lang.${settings.streamerLanguage}`)}`;
  }
  function renderCategories(values={}) {
    const host=document.getElementById('category-settings');host.replaceChildren();
    for(const category of categories){
      const value=values[category]||{enabled:true,label:'',stamp:''};
      const row=document.createElement('div');row.className='category-setting-row';
      const dot=document.createElement('i');dot.className=`gum-dot ${category}`;row.append(dot);
      const visible=document.createElement('label');visible.className='category-enabled';
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.dataset.category=category;toggle.checked=value.enabled;
      const visibleText=document.createElement('span');visibleText.textContent=t('panel.showOnStream');visible.append(toggle,visibleText);row.append(visible);
      for(const field of ['label','stamp']){
        const label=document.createElement('label');label.textContent=field==='label'?t('panel.name'):t(`card.stamp.${category}`);
        const input=document.createElement('input');input.type='text';input.maxLength=24;input.dataset.category=category;input.dataset.field=field;input.value=value[field]||'';input.placeholder=field==='label'?t(`card.category.${category}`):t(`card.stamp.${category}`);label.append(input);row.append(label);
      }
      host.append(row);
    }
  }
  function collect() {
    const card={textMode:document.getElementById('card-text-mode').value,showAuthor:document.getElementById('card-show-author').checked,showLanguage:document.getElementById('card-show-language').checked,showStamp:document.getElementById('card-show-stamp').checked,showBadge:document.getElementById('card-show-badge').checked,durationSec:Number(document.getElementById('card-duration').value),position:document.getElementById('card-position').value,size:document.getElementById('card-size').value,animation:document.getElementById('card-animation').value,maxChars:Number(document.getElementById('card-max-chars').value),categories:{}};
    for(const category of categories){const toggle=document.querySelector(`[data-category="${category}"][type="checkbox"]`);card.categories[category]={enabled:toggle.checked,label:document.querySelector(`[data-category="${category}"][data-field="label"]`).value,stamp:document.querySelector(`[data-category="${category}"][data-field="stamp"]`).value};}
    return {uiLanguage:document.getElementById('ui-language').value,streamerLanguage:document.getElementById('streamer-language').value,overlay:{position:document.getElementById('overlay-position').value,scale:Number(document.getElementById('overlay-scale').value),showStatus:document.getElementById('overlay-show-status').checked},card};
  }
  async function save(value=collect()) {
    const response=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
    const result=await response.json();
    if(!response.ok||!result.ok)throw new Error(t(`errors.${result.error||'save_failed'}`));
    paint(result.settings);return result.settings;
  }
  function toast(message){const node=document.getElementById('toast');node.textContent=message;node.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>node.classList.remove('show'),2600);}
  fetch('/api/settings').then(r=>r.json()).then(paint).catch(()=>{setLanguage(window.I18N.resolveLanguage());applyI18n();});
  configSocket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='settings')paint(data.settings);});
  document.getElementById('ui-language').addEventListener('change',async e=>{setLanguage(e.target.value);applyI18n();if(currentSettings)currentSettings.uiLanguage=e.target.value;try{await save({uiLanguage:e.target.value});}catch(error){toast(error.message);}});
  document.getElementById('settings-save').addEventListener('click',async()=>{try{await save();toast(t('panel.saved'));}catch(error){toast(error.message);}});
  document.getElementById('settings-reset').addEventListener('click',async()=>{try{const response=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reset:true})});const result=await response.json();if(!response.ok)throw new Error(t(`errors.${result.error||'invalid_settings'}`));paint(result.settings);toast(t('panel.resetDone'));}catch(error){toast(error.message);}});
  document.getElementById('settings-preview').addEventListener('click',async()=>{try{await save();if(configSocket.readyState===WebSocket.OPEN)configSocket.send(JSON.stringify({type:'preview-card',category:document.getElementById('preview-category').value}));}catch(error){toast(error.message);}});
  document.getElementById('streamer-language').addEventListener('change',async e=>{try{await save({streamerLanguage:e.target.value});}catch(error){toast(error.message);}});
  document.querySelectorAll('.copy-url').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).value);toast(t('panel.copied'));}catch{toast(t('panel.copyFailed'));}}));
  for(const [id,out] of [['overlay-scale','overlay-scale-value'],['card-duration','card-duration-value'],['card-max-chars','card-max-chars-value']])document.getElementById(id).addEventListener('input',e=>document.getElementById(out).textContent=e.target.value);
})();
