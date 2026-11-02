(() => {
  const canvas = document.querySelector('#machine-canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const status = document.querySelector('#overlay-status');
  const card = document.querySelector('#open-card');
  const colors = { pista:'#FFD23F', spoiler:'#1E1B24', prediccion:'#8A5CF6', animo:'#FF6FB5', reto:'#FF5A36' };
  const balls = new Map();
  const arrivals = new Map();
  let nextArrivalAt=0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const query = new URLSearchParams(location.search);
  let machineSide = query.get('pos') === 'left' ? 'left' : 'right';
  document.body.classList.toggle('machine-left', machineSide === 'left');
  const requestedScale = Number(query.get('scale') || 0.8);
  let userScale = Number.isFinite(requestedScale) ? Math.max(0.45, Math.min(1.15, requestedScale)) : 0.8;
  let engine, socket, width=innerWidth, height=innerHeight, dpr=1, walls=[], filter='all', frame=0, running=false, activeCapsule=null, revealBusy=false, openQueue=[], arrivalPausedAt=0, sparkleTimer=null, sparkleStarted=0, sparkleUntil=0, previousFrame=0, accumulator=0, revealState=null, crankAngle=0, filterMix=new Map();
  let geometryCache;
  if (!window.Matter) { status.textContent=window.I18N.t('overlay.physics'); status.classList.add('warn'); return; }
  const { Engine, Bodies, Composite, Body, Sleeping } = Matter;
  engine = Engine.create({ enableSleeping: true });
  engine.world.gravity.y = 0.76;
  engine.positionIterations = 5;
  engine.velocityIterations = 4;
  resize();
  addEventListener('resize', resize);

  function geometry() {
    if (geometryCache) return geometryCache;
    const scale = Math.min(userScale, width / 650, height / 590);
    const r = Math.max(76, Math.min(width * .18, height * .22) * scale);
    const cx = machineSide === 'left' ? r + 36 * scale + 100 * scale : width - r - 36 * scale - 100 * scale;
    const cy = height - r - 184 * scale;
    // El tubo nace a media esfera, cruza la tapa (collarY) y sobresale hasta una boca en embudo (mouthY).
    const tube = { w:44*scale, bottom:cy+r*.08, collarY:cy-r-15*scale, mouthY:cy-r-112*scale, funnelH:17*scale };
    geometryCache = { cx, cy, r, scale, baseY:cy+r-5*scale, top:cy-r, tube };
    return geometryCache;
  }
  function resize() {
    width=innerWidth; height=innerHeight; geometryCache=null;
    dpr=Math.min(devicePixelRatio||1,1.75);
    canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(walls.length) Composite.remove(engine.world,walls);
    const g=geometry(), count=52;
    walls=[];
    for(let i=0;i<count;i++){
      const a=(i/count)*Math.PI*2;
      const x=g.cx+Math.cos(a)*(g.r-13*g.scale), y=g.cy+Math.sin(a)*(g.r-13*g.scale);
      const wall=Bodies.rectangle(x,y,2*Math.PI*g.r/count+12*g.scale,18*g.scale,{isStatic:true,angle:a+Math.PI/2,friction:.04,restitution:.18});
      walls.push(wall);
    }
    Composite.add(engine.world,walls);
    for(const body of balls.values()) { const p=body.plugin, fresh=spawnBody(p.item,p.r); Body.setPosition(fresh,body.position); Body.setVelocity(fresh,body.velocity); Composite.remove(engine.world,body); balls.set(p.item.id,fresh); }
    paint();
  }
  function spawnBody(item,r,position=null) {
    const g=geometry();
    const body=Bodies.circle(position?.x??g.cx,position?.y??g.cy-g.r+r+28*g.scale,r,{restitution:.18,friction:.055,frictionAir:.014,density:.0011,sleepThreshold:75});
    body.plugin={item,r,drawR:r,z:Math.random(),mark:Math.random()*Math.PI*2,arrivedAt:performance.now()}; Composite.add(engine.world,body);
    for(const other of balls.values()) Sleeping.set(other,false);
    return body;
  }
  function addBall(item, animateFill=false, position=null) {
    if(balls.has(item.id)||arrivals.has(item.id)) return;
    const g=geometry(), r=18*g.scale*(.94+Math.random()*.12), now=performance.now();
    if(!animateFill){
      const p=position||initialBallPosition(g,r,balls.size);
      balls.set(item.id,spawnBody(item,r,p));
      wake();return;
    }
    const launchAt=Math.max(arrivalPausedAt||now,nextArrivalAt);
    nextArrivalAt=launchAt+110;
    arrivals.set(item.id,{item,r,launchAt,started:0,duration:reducedMotion?40:820});
    if(item.highlight||item.featured) scheduleSparkle();
    wake();
  }
  function initialBallPosition(g,r,index){
    const inner=g.r-r-15*g.scale, rowGap=r*1.78, colGap=r*2.02;
    let remaining=index;
    for(let row=0;row<30;row++){
      const y=g.cy+inner-row*rowGap;
      if(y<g.cy-inner)break;
      const halfWidth=Math.sqrt(Math.max(0,inner*inner-(y-g.cy)*(y-g.cy)));
      const capacity=Math.max(1,Math.floor(2*halfWidth/colGap)+1);
      if(remaining<capacity){
        const x=(remaining-(capacity-1)/2)*colGap;
        return {x:g.cx+x,y};
      }
      remaining-=capacity;
    }
    return {x:g.cx,y:g.cy+inner*.45};
  }
  function connect(){
    socket=new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?client=overlay`);
    socket.onopen=()=>{status.textContent=window.I18N.t('overlay.ready');status.classList.remove('warn')};
    socket.onclose=()=>{status.textContent=window.I18N.t('overlay.reconnecting');status.classList.add('warn');setTimeout(connect,1400)};
    socket.onerror=()=>socket.close();
    socket.onmessage=event=>{const data=JSON.parse(event.data);
      if(data.type==='state'){
        if(data.data.settings)applySettings(data.data.settings);
        filter=data.data.selectedFilter||'all';
        const pending=data.data.messages.filter(m=>m.status==='pending');
        pending.forEach((item,index)=>addBall(item,false,initialBallPosition(geometry(),18*geometry().scale,index)));
        // Las descartadas desde el panel salen de la máquina; las que esperan revelación se quedan para su animación.
        const keep=new Set([...pending.map(m=>m.id),...openQueue.map(m=>m.id),revealState?.item.id]);
        for(const id of [...balls.keys()])if(!keep.has(id))removeBall(id);
        for(const id of [...arrivals.keys()])if(!keep.has(id))arrivals.delete(id);
        wake();
      }
      if(data.type==='settings')applySettings(data.settings);
      if(data.type==='preview-card')showMessageCard(data.item,true);
      if(data.type==='gum')addBall(data.item,true);
      if(data.type==='demo-gum')addBall(data.item,true);
      if(data.type==='filter'){filter=data.category;wake();}
      if(data.type==='opened'){openQueue.push(data.item);runQueue();}
      if(data.type==='reveal-spoilers'){openQueue.push(...data.items);runQueue();}
    };
  }
  function removeBall(id){const body=balls.get(id);if(body){Composite.remove(engine.world,body);balls.delete(id);}}
  function scheduleSparkle(){
    const featuredPresent=()=>[...balls.values()].some(body=>body.plugin.item.highlight||body.plugin.item.featured)||[...arrivals.values()].some(arrival=>arrival.item.highlight||arrival.item.featured);
    if(reducedMotion||sparkleTimer||!featuredPresent())return;
    sparkleTimer=setTimeout(()=>{sparkleTimer=null;if(!featuredPresent())return;sparkleStarted=performance.now();sparkleUntil=sparkleStarted+850;wake();scheduleSparkle();},5200+Math.random()*1800);
  }
  async function runQueue(){
    if(revealBusy)return;
    if(!openQueue.length){resumeArrivals();return;}
    if(!arrivalPausedAt)arrivalPausedAt=performance.now();
    const item=openQueue.shift();revealBusy=true;await reveal(item);revealBusy=false;setTimeout(runQueue,reducedMotion?80:330);
  }
  function resumeArrivals(){
    if(!arrivalPausedAt)return;
    const pausedFor=performance.now()-arrivalPausedAt;
    for(const arrival of arrivals.values()){
      arrival.launchAt+=pausedFor;
      if(arrival.started)arrival.started+=pausedFor;
    }
    if(nextArrivalAt)nextArrivalAt+=pausedFor;
    arrivalPausedAt=0;wake();
  }
  function reveal(item){
    return new Promise(resolve=>{
      const g=geometry(), color=colors[item.category]||'#FFD23F', side=machineSide==='right'?1:-1;
      let source=balls.get(item.id);
      const waiting=arrivals.get(item.id);
      if(!source&&waiting){
        arrivals.delete(item.id);
        source=spawnBody(item,waiting.r);
        balls.set(item.id,source);
      }
      revealState={item,color,side,g,source,started:performance.now(),phase:'crank',duration:reducedMotion?25:150,fromAngle:crankAngle,lastJolt:-85};
      activeCapsule=null;
      wake();
      const animate=now=>{
        const a=revealState, elapsed=now-a.started, t=Math.min(1,elapsed/a.duration), ease=t*t*(3-2*t);
        if(a.phase==='crank'){
          crankAngle=a.fromAngle-.18*Math.sin(Math.PI*t);
          if(t>=1){a.phase='turn';a.started=now;a.duration=reducedMotion?25:600;a.fromAngle=crankAngle;for(const body of balls.values())if(!body.isStatic&&body.isSleeping)Sleeping.set(body,false);}
        } else if(a.phase==='turn'){
          crankAngle=a.fromAngle+(Math.PI*2+.18)*ease;
          if(elapsed-a.lastJolt>=85){
            a.lastJolt=elapsed;
            const pulse=Math.sin((elapsed/a.duration)*Math.PI*3), phase=elapsed/a.duration*Math.PI*2;
            for(const body of balls.values())if(!body.isStatic){
              const offset=(body.position.x-g.cx)/g.r, vertical=(body.position.y-g.cy)/g.r;
              const gust=(.0012+.0011*(.5+.5*pulse))*Math.max(.18,1-Math.abs(offset)*.55);
              Body.applyForce(body,body.position,{x:(Math.sin(phase+vertical*2)*.0014-offset*.00038),y:-gust});
              if(body.isSleeping)Sleeping.set(body,false);
            }
          }
          if(t>=1){
            const start=a.source?{x:a.source.position.x,y:a.source.position.y}:{x:g.cx,y:g.cy};
            if(a.source){Composite.remove(engine.world,a.source);balls.delete(item.id);}
            activeCapsule={item,color,x:start.x,y:start.y,r:a.source?.plugin.r||18*g.scale,angle:a.source?.angle||0,split:0,visible:true};
            a.start=start;a.phase='select';a.started=now;a.duration=reducedMotion?20:200;
          }
        } else if(a.phase==='select'){
          const pulse=1+Math.sin(Math.PI*t)*.14;activeCapsule.r=(a.source?.plugin.r||18*g.scale)*pulse;activeCapsule.highlight=1;
          if(t>=1){a.phase='descent';a.started=now;a.duration=reducedMotion?20:520;}
        } else if(a.phase==='descent'){
          const p=Math.min(1,elapsed/a.duration), e=1-Math.pow(1-p,3), throatX=g.cx, throatY=g.cy+g.r*.08;
          const controlX=(a.start.x+throatX)/2, controlY=Math.max(a.start.y,throatY)+g.r*.14;
          activeCapsule.x=(1-e)*(1-e)*a.start.x+2*(1-e)*e*controlX+e*e*throatX;
          activeCapsule.y=(1-e)*(1-e)*a.start.y+2*(1-e)*e*controlY+e*e*throatY;
          if(p>=1){
            a.tubeBottom=g.tube.bottom;a.tubeTop=g.tube.mouthY;
            activeCapsule.x=g.cx;activeCapsule.y=a.tubeBottom;activeCapsule.visible=true;activeCapsule.angle=0;activeCapsule.inTube=true;
            a.phase='tube';a.started=now;a.duration=reducedMotion?35:950;
          }
        } else if(a.phase==='tube'){
          // Arranca lenta, acelera por el tramo de vidrio y llega disparada a la boca.
          const p=Math.min(1,elapsed/a.duration), e=p*p*(2.2-1.2*p);
          activeCapsule.x=g.cx+Math.sin(p*Math.PI*3)*1.2*g.scale;activeCapsule.y=a.tubeBottom+(a.tubeTop-a.tubeBottom)*e;activeCapsule.angle+=.12;
          if(p>=1){a.phase='launch';a.started=now;a.duration=reducedMotion?25:460;activeCapsule.launchT=0;activeCapsule.inTube=false;}
        } else if(a.phase==='launch'){
          // Sale por la boca hacia el centro de la pantalla, sube en arco y queda flotando para abrirse.
          const p=Math.min(1,elapsed/a.duration), e=1-Math.pow(1-p,3);
          activeCapsule.launchT=p;
          const startX=g.cx,startY=a.tubeTop,endX=g.cx-side*46*g.scale,endY=a.tubeTop-70*g.scale;
          activeCapsule.x=startX+(endX-startX)*e;
          activeCapsule.y=startY+(endY-startY)*e-Math.sin(Math.PI*p)*28*g.scale;
          activeCapsule.angle-=side*.24;
          if(p>=1){activeCapsule.x=endX;activeCapsule.y=endY;activeCapsule.launchT=1;a.phase='split';a.started=now;a.duration=reducedMotion?20:420;}
        } else if(a.phase==='split') {
          activeCapsule.split=Math.min(1,elapsed/a.duration);
          if(activeCapsule.split>=1){activeCapsule=null;revealState=null;showMessageCard(item);return resolve();}
        }
        wake();requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    });
  }
  const cardIcons = {
    pista:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    spoiler:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.8"/><path d="M12 15v2"/>',
    prediccion:'<circle cx="12" cy="10" r="6.5"/><path d="M6 21h12M8.5 17l-1.5 4M15.5 17l1.5 4M9.5 8.5a3 3 0 0 1 2.5-1.6"/>',
    animo:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    reto:'<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'
  };
  const cardStamps = { pista:'¡Ayuda del chat!', spoiler:'Revelado', prediccion:'¿Acertará?', animo:'Con cariño', reto:'¿Aceptas?' };
  let cardSettings={textMode:'translated',showAuthor:true,showLanguage:true,showStamp:true,showBadge:true,durationSec:7.2,position:'auto',size:'m',animation:'bounce',maxChars:200,categories:{}};
  let streamerLanguage='es';
  let lastMachinePosition=machineSide,lastMachineScale=userScale;
  function applySettings(value){
    if(!value)return;
    window.I18N.resolveLanguage(value.uiLanguage);
    window.I18N.applyI18n();
    streamerLanguage=value.streamerLanguage||streamerLanguage;
    cardSettings=value.card||cardSettings;
    const oldPosition=machineSide,oldScale=userScale;
    if(!query.has('pos'))machineSide=value.overlay?.position||'right';
    if(!query.has('scale'))userScale=value.overlay?.scale||.8;
    document.body.classList.toggle('machine-left',machineSide==='left');
    status.hidden=value.overlay?.showStatus===false;
    if(oldPosition!==machineSide||oldScale!==userScale){geometryCache=null;if(engine)resize();}
    if(!status.classList.contains('warn'))status.textContent=window.I18N.t('overlay.ready');
  }
  function showMessageCard(item,preview=false){
    const category=['pista','spoiler','prediccion','animo','reto'].includes(item.category)?item.category:'pista';
    const overrides=cardSettings.categories?.[category]||{};
    if(!preview&&overrides.enabled===false){card.classList.remove('show');return;}
    card.dataset.category=category;
    card.classList.toggle('featured',cardSettings.showBadge&&Boolean(item.highlight||item.featured));
    card.dataset.showAuthor=String(cardSettings.showAuthor);card.dataset.showLanguage=String(cardSettings.showLanguage);card.dataset.showStamp=String(cardSettings.showStamp);card.dataset.showBadge=String(cardSettings.showBadge);
    card.classList.remove('card-size-s','card-size-m','card-size-l','card-anim-bounce','card-anim-fade','card-anim-none','card-pos-auto','card-pos-top-left','card-pos-top-right','card-pos-bottom-left','card-pos-bottom-right','card-pos-center');
    card.classList.add(`card-size-${cardSettings.size||'m'}`,`card-anim-${cardSettings.animation||'bounce'}`,`card-pos-${cardSettings.position||'auto'}`);
    document.querySelector('#card-icon').textContent=({pista:'✦',spoiler:'◈',prediccion:'◉',animo:'♥',reto:'⚡'})[category];
    document.querySelector('#card-stamp').textContent=overrides.stamp||window.I18N.t(`card.stamp.${category}`);
    document.querySelector('#card-stamp').hidden=!cardSettings.showStamp;
    document.querySelector('#card-initial').textContent=String(item.author||'?').trim().charAt(0).toUpperCase()||'?';
    document.querySelector('#card-category').textContent=overrides.label||window.I18N.t(`card.category.${category}`);
    document.querySelector('#card-language').textContent=window.I18N.t(`lang.${item.sourceLanguage}`);
    const original=String(item.text||''),translated=String(item.translatedText||original),mode=cardSettings.textMode||'translated';
    const main=mode==='original'?original:translated;
    document.querySelector('#card-message').textContent=main.length>cardSettings.maxChars?main.slice(0,cardSettings.maxChars-3)+'...':main;
    const originalNode=document.querySelector('#card-original');
    const showOriginal=mode==='both'&&item.sourceLanguage!==streamerLanguage&&original!==translated;
    originalNode.hidden=!showOriginal;originalNode.textContent=original;
    document.querySelector('#card-author').textContent='@'+String(item.author||'chat');
    card.classList.remove('show');void card.offsetWidth;card.classList.add('show');
    clearTimeout(window.cardTimer);window.cardTimer=setTimeout(()=>card.classList.remove('show'),cardSettings.durationSec*1000);
  }  function wake(){if(running)return;running=true;frame=requestAnimationFrame(tick);}
  function tick(now){
    const dt=previousFrame?Math.min(now-previousFrame,100):1000/60;previousFrame=now;accumulator+=dt;
    while(accumulator>=1000/60){Engine.update(engine,1000/60);accumulator-=1000/60;}
    advanceArrivals(now);
    // Un frame con error no debe dejar `running` atascado en true: la máquina quedaría congelada.
    try{paint();}catch(error){console.error(error);ctx.reset?.();ctx.setTransform(dpr,0,0,dpr,0,0);}
    const currentTime=performance.now();
    const moving=arrivals.size>0||[...balls.values()].some(b=>!b.isSleeping||currentTime-b.plugin.arrivedAt<1450||Math.abs((filterMix.get(b.plugin.item.id)??(filter==='all'||b.plugin.item.category===filter?1:.22))-(filter==='all'||b.plugin.item.category===filter?1:.22))>.01)||Boolean(activeCapsule)||currentTime<sparkleUntil;
    if(moving){frame=requestAnimationFrame(tick);}else{running=false;frame=0;}
  }
  function paint(){ctx.clearRect(0,0,width,height);const g=geometry();drawMachineBack(g);drawGlassBack(g);drawTubeBack(g,'inner');if(revealState?.phase==='turn')drawAirflow(g,revealState);
    const now=performance.now();
    const sorted=[...balls.values()].sort((a,b)=>a.plugin.z-b.plugin.z);
    for(const body of sorted){
      const {item,r,drawR,arrivedAt,z,mark}=body.plugin, visible=filter==='all'||item.category===filter;
      const target=visible?1:.22, prior=filterMix.get(item.id)??target, alpha=prior+(target-prior)*.22;filterMix.set(item.id,alpha);
      const depthR=r*(.88+.12*z), atmospheric=z<.35;
      drawBall(body.position.x,body.position.y,depthR,colors[item.category]||'#FFD23F',alpha,item.highlight||item.featured,!visible,z,body.angle+mark,atmospheric);
      const age=performance.now()-arrivedAt, labelAlpha=Math.max(0,1-Math.max(0,age-900)/550);
      if(labelAlpha>0) drawAuthor(body.position.x,body.position.y-depthR-11*g.scale,item.author,g.scale,labelAlpha);
    }
    // Lo que viaja por el tubo se pinta dos veces con recortes: la parte bajo la tapa queda dentro del vidrio
    // y la parte por encima del collar va sobre la tapa, así parece que atraviesa la máquina.
    drawMovers(g,'inner');
    drawTubeFront(g,'inner');
    drawMachineFront(g);
    drawTubeBack(g,'outer');
    drawMovers(g,'outer');
    drawTubeFront(g,'outer');
  }
  function arrivalPose(g,arrival){
    const now=arrivalPausedAt||performance.now();
    if(!arrival.started||now<arrival.launchAt)return null;
    const t=Math.min(1,(now-arrival.started)/arrival.duration), e=t*(.5+.5*t), startY=g.tube.mouthY-74*g.scale, y=startY+(g.tube.bottom-startY)*e;
    return {x:g.cx,y,r:arrival.r*(y>g.tube.mouthY?.92:1),alpha:Math.min(1,t*7),angle:t*7};
  }
  function drawMovers(g,layer){
    ctx.save();ctx.beginPath();
    if(layer==='inner')ctx.rect(0,g.tube.collarY,width,height-g.tube.collarY);else ctx.rect(0,0,width,g.tube.collarY);
    ctx.clip();
    for(const arrival of arrivals.values()){
      const p=arrivalPose(g,arrival);
      if(p)drawBall(p.x,p.y,p.r,colors[arrival.item.category]||'#FFD23F',p.alpha,Boolean(arrival.item.highlight||arrival.item.featured),false,.9,p.angle,false);
    }
    if(activeCapsule?.visible)drawActiveCapsule(g);
    ctx.restore();
  }
  function drawActiveCapsule(g){
    if(activeCapsule.launchT!=null&&activeCapsule.launchT<.65){ctx.save();ctx.globalAlpha=1-activeCapsule.launchT*1.4;ctx.strokeStyle='rgba(255,230,158,.9)';ctx.lineWidth=Math.max(1,g.scale*2);for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(activeCapsule.x+i*4*g.scale,activeCapsule.y+activeCapsule.r*1.55);ctx.lineTo(activeCapsule.x+i*3*g.scale,activeCapsule.y+activeCapsule.r*.75);ctx.stroke();}ctx.restore();}
    const split=activeCapsule.split||0;drawBall(activeCapsule.x,activeCapsule.y,activeCapsule.r*(activeCapsule.inTube?.92:1)*(1+(activeCapsule.bounce||0)),activeCapsule.color,1,Boolean(activeCapsule.highlight),false,.8,activeCapsule.angle,false,split);
  }
  function advanceArrivals(now){
    if(arrivalPausedAt)return;
    for(const [id,arrival] of arrivals){
      if(now<arrival.launchAt)continue;
      if(!arrival.started)arrival.started=now;
      if(now-arrival.started>=arrival.duration){
        const g=geometry(), exit=spawnBody(arrival.item,arrival.r,{x:g.cx+(Math.random()-.5)*4*g.scale,y:g.tube.bottom+arrival.r*.6});
        Body.setVelocity(exit,{x:(Math.random()-.5)*1.6*g.scale,y:4*g.scale});
        arrivals.delete(id);balls.set(id,exit);
        const limit=Math.min(68,Math.max(12,Math.floor(.55*(g.r/(18*g.scale))**2)));
        while(balls.size>limit){const oldest=balls.keys().next().value;Composite.remove(engine.world,balls.get(oldest));balls.delete(oldest);}
      }
    }
  }
  // Base jade como cilindro fundido: pie cromado, cara superior elíptica, placa hundida y monedero central con manivela.
  function drawMachineBack(g){
    const {cx,r,scale:s,baseY:y}=g, baseH=145*s, topW=r*.8, botW=r*1.02, topY=y+10*s, botY=y+baseH-16*s;
    ctx.save();
    const floorY=botY+18*s, floor=ctx.createRadialGradient(cx,floorY,0,cx,floorY,botW*1.25);
    stops(floor,[[0,'rgba(0,0,0,.45)'],[.6,'rgba(0,0,0,.18)'],[1,'rgba(0,0,0,0)']]);
    ctx.save();ctx.translate(cx,floorY);ctx.scale(1,.14);ctx.beginPath();ctx.arc(0,0,botW*1.25,0,Math.PI*2);ctx.restore();ctx.fillStyle=floor;ctx.fill();
    ctx.beginPath();ctx.ellipse(cx,botY+5*s,botW+6*s,17*s,0,0,Math.PI*2);ctx.fillStyle=chromeH(cx-botW,cx+botW);ctx.fill();ctx.strokeStyle='rgba(12,32,28,.55)';ctx.lineWidth=s;ctx.stroke();
    const basePath=()=>{ctx.beginPath();ctx.moveTo(cx-topW,topY);ctx.quadraticCurveTo(cx-botW*1.01,y+baseH*.48,cx-botW,botY);ctx.ellipse(cx,botY,botW,13*s,0,Math.PI,0,true);ctx.quadraticCurveTo(cx+botW*1.01,y+baseH*.48,cx+topW,topY);ctx.ellipse(cx,topY,topW,12*s,0,0,Math.PI,true);ctx.closePath();};
    const body=ctx.createLinearGradient(cx-botW,0,cx+botW,0);
    stops(body,[[0,'#03342d'],[.09,'#08584d'],[.22,'#3aa98e'],[.3,'#169380'],[.58,'#0c6c5f'],[.86,'#064a41'],[1,'#022a24']]);
    basePath();ctx.fillStyle=body;ctx.fill();
    const shade=ctx.createLinearGradient(0,topY,0,botY+13*s);stops(shade,[[0,'rgba(255,255,255,.08)'],[.55,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.3)']]);
    basePath();ctx.fillStyle=shade;ctx.fill();
    const face=ctx.createLinearGradient(0,topY-12*s,0,topY+12*s);stops(face,[[0,'#2d8a76'],[1,'#0a5b50']]);
    ctx.beginPath();ctx.ellipse(cx,topY,topW,12*s,0,0,Math.PI*2);ctx.fillStyle=face;ctx.fill();
    ctx.beginPath();ctx.ellipse(cx,topY,topW,12*s,0,0,Math.PI);ctx.strokeStyle='rgba(190,240,222,.45)';ctx.lineWidth=1.2*s;ctx.stroke();
    ctx.beginPath();ctx.ellipse(cx,y+baseH*.8,botW*.985,12*s,0,.04,Math.PI-.04);ctx.strokeStyle='rgba(246,214,146,.75)';ctx.lineWidth=1.8*s;ctx.stroke();
    // Placa hundida: bisel cromado, fondo con sombra interior y letras con relieve.
    const pw=r*1.18, ph=40*s, px=cx-pw/2, py=y+26*s;
    roundRect(px-3*s,py-3*s,pw+6*s,ph+6*s,9*s,chromeV(py-3*s,py+ph+3*s),'rgba(30,50,45,.6)',s);
    const plate=ctx.createLinearGradient(0,py,0,py+ph);stops(plate,[[0,'#033a33'],[.25,'#0b5f54'],[1,'#0e6e61']]);
    roundRect(px,py,pw,ph,7*s,plate,null,s);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${Math.max(12,20*s)}px "Bagel Fat One",serif`;
    ctx.fillStyle='rgba(0,20,17,.55)';ctx.fillText('Gumball Chat',cx,py+ph/2+1.5*s);ctx.fillStyle='#FFF6D7';ctx.fillText('Gumball Chat',cx,py+ph/2);
    // Monedero con manivela giratoria (crankAngle lo anima la revelación).
    const mx=cx, my=y+baseH*.63, mr=25*s;
    ctx.beginPath();ctx.arc(mx+1.5*s,my+3*s,mr+2*s,0,Math.PI*2);ctx.fillStyle='rgba(0,22,19,.4)';ctx.fill();
    const disc=ctx.createRadialGradient(mx-mr*.4,my-mr*.45,mr*.05,mx,my,mr*1.05);stops(disc,[[0,'#ffffff'],[.35,'#dfe8e5'],[.78,'#8a9c96'],[1,'#566762']]);
    ctx.beginPath();ctx.arc(mx,my,mr,0,Math.PI*2);ctx.fillStyle=disc;ctx.fill();
    ctx.beginPath();ctx.arc(mx,my,mr*.78,0,Math.PI*2);ctx.strokeStyle='rgba(70,88,82,.55)';ctx.lineWidth=1.2*s;ctx.stroke();
    ctx.save();ctx.translate(mx,my);ctx.rotate(crankAngle);
    const bar=ctx.createLinearGradient(0,-6*s,0,6*s);stops(bar,[[0,'#ffffff'],[.4,'#c9d5d1'],[1,'#5f706b']]);
    ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=3*s;ctx.shadowOffsetY=2*s;
    ctx.beginPath();ctx.roundRect(-mr*1.32,-5.5*s,mr*2.64,11*s,5.5*s);ctx.fillStyle=bar;ctx.fill();
    ctx.shadowColor='transparent';
    for(const end of [-1,1]){const kx=end*mr*1.32, knob=ctx.createRadialGradient(kx-2.5*s,-3*s,.5,kx,0,8*s);stops(knob,[[0,'#ffffff'],[.5,'#c5d0cc'],[1,'#53645f']]);ctx.beginPath();ctx.arc(kx,0,8*s,0,Math.PI*2);ctx.fillStyle=knob;ctx.fill();}
    const hub=ctx.createRadialGradient(-2.5*s,-3*s,.5,0,0,9*s);stops(hub,[[0,'#ffffff'],[.55,'#b9c6c1'],[1,'#4f605b']]);
    ctx.beginPath();ctx.arc(0,0,9*s,0,Math.PI*2);ctx.fillStyle=hub;ctx.fill();
    ctx.restore();
    ctx.restore();
  }
  // Parte trasera del vidrio: da cuerpo a la esfera aunque OBS muestre un fondo oscuro detrás.
  function drawGlassBack(g){
    const {cx,cy,r}=g;
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
    const body=ctx.createRadialGradient(cx-r*.25,cy-r*.3,r*.08,cx,cy,r);
    stops(body,[[0,'rgba(225,252,245,.12)'],[.62,'rgba(140,200,186,.08)'],[1,'rgba(8,42,37,.42)']]);
    ctx.fillStyle=body;ctx.fillRect(cx-r,cy-r,2*r,2*r);
    ctx.restore();
  }
  // Tramo del tubo: 'inner' va dentro de la esfera, 'outer' sobresale desde la tapa hasta el embudo.
  function tubeSpan(g,layer){return layer==='inner'?{top:g.cy-g.r,bottom:g.tube.bottom}:{top:g.tube.mouthY+g.tube.funnelH,bottom:g.tube.collarY+2*g.scale};}
  function drawTubeBack(g,layer){
    const {cx,cy,r,scale:s,tube:t}=g, hw=t.w/2, {top,bottom}=tubeSpan(g,layer);
    ctx.save();
    if(layer==='inner'){ctx.beginPath();ctx.arc(cx,cy,r-3*s,0,Math.PI*2);ctx.clip();}
    const glass=ctx.createLinearGradient(cx-hw,0,cx+hw,0);
    stops(glass,[[0,'rgba(14,48,43,.34)'],[.18,'rgba(225,255,246,.2)'],[.5,'rgba(110,175,158,.07)'],[.82,'rgba(225,255,247,.14)'],[1,'rgba(12,46,41,.34)']]);
    ctx.fillStyle=glass;ctx.fillRect(cx-hw,top,t.w,bottom-top);
    if(layer==='outer'){
      // Interior del embudo: se ve por la boca y queda detrás de la bolita que entra o sale.
      const wt=hw+13*s, inside=ctx.createRadialGradient(cx,t.mouthY+2*s,1,cx,t.mouthY,wt);
      stops(inside,[[0,'#06110f'],[.55,'#1d2f2b'],[1,'#7d8f8a']]);
      ctx.beginPath();ctx.ellipse(cx,t.mouthY,wt,6.5*s,0,0,Math.PI*2);ctx.fillStyle=inside;ctx.fill();
      ctx.strokeStyle='rgba(225,235,232,.9)';ctx.lineWidth=1.6*s;ctx.stroke();
    }
    ctx.restore();
  }
  function drawTubeFront(g,layer){
    const {cx,cy,r,scale:s,tube:t}=g, hw=t.w/2, {top,bottom}=tubeSpan(g,layer);
    ctx.save();
    if(layer==='inner'){ctx.beginPath();ctx.arc(cx,cy,r-3*s,0,Math.PI*2);ctx.clip();}
    ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(cx-hw,top);ctx.lineTo(cx-hw,bottom);ctx.moveTo(cx+hw,top);ctx.lineTo(cx+hw,bottom);ctx.strokeStyle='rgba(235,255,249,.55)';ctx.lineWidth=1.4*s;ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx-hw*.58,top+7*s);ctx.lineTo(cx-hw*.58,bottom-7*s);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2.4*s;ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx+hw*.62,top+9*s);ctx.lineTo(cx+hw*.62,bottom-9*s);ctx.strokeStyle='rgba(255,255,255,.2)';ctx.lineWidth=1.2*s;ctx.stroke();
    if(layer==='inner'){
      // Aro cromado de la boca inferior, por donde caen las bolitas a la esfera.
      ctx.beginPath();ctx.ellipse(cx,t.bottom,hw+3*s,5*s,0,0,Math.PI*2);ctx.strokeStyle=chromeH(cx-hw-3*s,cx+hw+3*s);ctx.lineWidth=4*s;ctx.stroke();
    } else {
      // Collar donde el tubo atraviesa la tapa.
      const cw=hw+7*s, cy0=t.collarY-7*s, ch=9*s;
      ctx.beginPath();ctx.moveTo(cx-cw,cy0);ctx.lineTo(cx-cw,cy0+ch);ctx.ellipse(cx,cy0+ch,cw,4*s,0,Math.PI,0,true);ctx.lineTo(cx+cw,cy0);ctx.ellipse(cx,cy0,cw,4*s,0,0,Math.PI,true);ctx.closePath();
      ctx.fillStyle=chromeH(cx-cw,cx+cw);ctx.fill();ctx.strokeStyle='rgba(30,50,45,.55)';ctx.lineWidth=s;ctx.stroke();
      ctx.beginPath();ctx.ellipse(cx,cy0,cw,4*s,0,0,Math.PI);ctx.strokeStyle='rgba(255,255,255,.7)';ctx.lineWidth=1.1*s;ctx.stroke();
      // Embudo de entrada y salida: su cara delantera tapa la mitad inferior de la bolita que pasa por la boca.
      const wt=hw+13*s, wb=hw+2*s, fy=t.mouthY, fb=t.mouthY+t.funnelH;
      ctx.beginPath();ctx.moveTo(cx-wt,fy);ctx.lineTo(cx-wb,fb);ctx.ellipse(cx,fb,wb,3.5*s,0,Math.PI,0,true);ctx.lineTo(cx+wt,fy);ctx.ellipse(cx,fy,wt,6.5*s,0,0,Math.PI);ctx.closePath();
      ctx.fillStyle=chromeH(cx-wt,cx+wt);ctx.fill();ctx.strokeStyle='rgba(30,50,45,.55)';ctx.lineWidth=s;ctx.stroke();
      ctx.beginPath();ctx.ellipse(cx,fy,wt,6.5*s,0,.05,Math.PI-.05);ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=1.6*s;ctx.stroke();
      ctx.beginPath();ctx.ellipse(cx,fb+2*s,wb+2*s,4*s,0,0,Math.PI);ctx.strokeStyle=chromeH(cx-wb,cx+wb);ctx.lineWidth=3*s;ctx.stroke();
    }
    ctx.restore();
  }
  function drawAirflow(g,state){
    const {cx,cy,r,scale:s}=g, t=(performance.now()-state.started)/state.duration;
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,r-4*s,0,Math.PI*2);ctx.clip();
    for(let i=0;i<5;i++){
      const phase=(t*2.2+i*.21)%1, y=cy+r*.46-phase*r*1.05, x=cx+Math.sin(t*8+i*1.7)*r*.3;
      ctx.globalAlpha=(1-phase)*.3;ctx.strokeStyle=i%2?'#b8fff0':'#fff6d7';ctx.lineWidth=(1.2+(i%2))*s;
      ctx.beginPath();ctx.moveTo(x-r*.16,y+12*s);ctx.bezierCurveTo(x-r*.08,y+4*s,x+r*.08,y-5*s,x,y-17*s);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-3*s,y-13*s);ctx.lineTo(x,y-19*s);ctx.lineTo(x+3*s,y-13*s);ctx.stroke();
    }
    ctx.restore();
  }
  // Cara delantera del vidrio, aro donde se apoya la esfera y tapa cromada con la boca de salida.
  function drawMachineFront(g){
    const {cx,cy,r,scale:s}=g;
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
    const bounce=ctx.createLinearGradient(0,cy+r*.5,0,cy+r);stops(bounce,[[0,'rgba(40,170,145,0)'],[1,'rgba(60,190,160,.24)']]);
    ctx.fillStyle=bounce;ctx.fillRect(cx-r,cy+r*.5,2*r,r*.5);
    const fresnel=ctx.createRadialGradient(cx,cy,r*.72,cx,cy,r);stops(fresnel,[[0,'rgba(255,255,255,0)'],[.7,'rgba(225,255,246,.05)'],[1,'rgba(235,255,250,.36)']]);
    ctx.fillStyle=fresnel;ctx.fillRect(cx-r,cy-r,2*r,2*r);
    // Media luna afilada en ambos extremos: el ancho crece y decrece con sin(πt).
    ctx.beginPath();
    for(let i=0;i<=24;i++){const t=i/24,a=Math.PI*(1.04+.42*t);ctx.lineTo(cx+Math.cos(a)*r*.92,cy+Math.sin(a)*r*.92);}
    for(let i=24;i>=0;i--){const t=i/24,a=Math.PI*(1.04+.42*t),inner=r*(.92-.1*Math.pow(Math.sin(Math.PI*t),.85));ctx.lineTo(cx+Math.cos(a)*inner,cy+Math.sin(a)*inner);}
    ctx.closePath();
    const crescent=ctx.createLinearGradient(cx-r*.85,cy-r*.75,cx-r*.2,cy-r*.1);stops(crescent,[[0,'rgba(255,255,255,.7)'],[1,'rgba(255,255,255,.06)']]);
    ctx.fillStyle=crescent;ctx.fill();
    ctx.save();ctx.translate(cx-r*.36,cy-r*.56);ctx.rotate(-.6);
    ctx.beginPath();ctx.roundRect(-r*.15,-r*.035,r*.3,r*.07,r*.035);ctx.fillStyle='rgba(255,255,255,.78)';ctx.fill();
    ctx.beginPath();ctx.roundRect(-r*.1,r*.065,r*.2,r*.04,r*.02);ctx.fillStyle='rgba(255,255,255,.45)';ctx.fill();
    ctx.restore();
    ctx.beginPath();ctx.arc(cx,cy,r*.94,-Math.PI*.16,Math.PI*.14);ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=3*s;ctx.lineCap='round';ctx.stroke();
    ctx.beginPath();ctx.arc(cx+r*.56,cy-r*.6,2.6*s,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.9)';ctx.fill();
    ctx.restore();
    ctx.beginPath();ctx.arc(cx,cy,r+1.2*s,0,Math.PI*2);ctx.strokeStyle='rgba(3,28,24,.55)';ctx.lineWidth=2.2*s;ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,r-.8*s,0,Math.PI*2);ctx.strokeStyle='rgba(228,255,248,.6)';ctx.lineWidth=1.6*s;ctx.stroke();
    const cw=r*.68, ct=cy+r-15*s, ch=20*s;
    ctx.beginPath();ctx.moveTo(cx-cw,ct);ctx.lineTo(cx-cw,ct+ch);ctx.ellipse(cx,ct+ch,cw,9*s,0,Math.PI,0,true);ctx.lineTo(cx+cw,ct);ctx.ellipse(cx,ct,cw,9*s,0,0,Math.PI);ctx.closePath();
    ctx.fillStyle=chromeH(cx-cw,cx+cw);ctx.fill();ctx.strokeStyle='rgba(30,50,45,.5)';ctx.lineWidth=s;ctx.stroke();
    ctx.beginPath();ctx.ellipse(cx,ct,cw,9*s,0,.08,Math.PI-.08);ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1.3*s;ctx.stroke();
    ctx.beginPath();ctx.ellipse(cx,ct+ch*.55,cw,9*s,0,.05,Math.PI-.05);ctx.strokeStyle='rgba(60,78,72,.45)';ctx.lineWidth=1.2*s;ctx.stroke();
    const capY=cy-r, capW=r*.36;
    ctx.beginPath();ctx.moveTo(cx-capW,capY+9*s);ctx.bezierCurveTo(cx-capW,capY-24*s,cx+capW,capY-24*s,cx+capW,capY+9*s);ctx.ellipse(cx,capY+9*s,capW,7*s,0,0,Math.PI);ctx.closePath();
    ctx.fillStyle=chromeH(cx-capW,cx+capW);ctx.fill();
    const capShade=ctx.createLinearGradient(0,capY-16*s,0,capY+16*s);stops(capShade,[[0,'rgba(255,255,255,.35)'],[.6,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,.25)']]);ctx.fillStyle=capShade;ctx.fill();
    ctx.strokeStyle='rgba(30,50,45,.55)';ctx.lineWidth=s;ctx.stroke();
  }
  function stops(gradient,list){for(const [at,color] of list)gradient.addColorStop(at,color);return gradient;}
  // Los degradados se anclan a la pieza que pintan; uno fijo en y=0 dejaba el cromo gris plano.
  function chromeH(x0,x1){return stops(ctx.createLinearGradient(x0,0,x1,0),[[0,'#56665f'],[.12,'#a9b9b4'],[.27,'#ffffff'],[.4,'#d3dfdb'],[.63,'#879893'],[.86,'#e4ece9'],[1,'#56665f']]);}
  function chromeV(y0,y1){return stops(ctx.createLinearGradient(0,y0,0,y1),[[0,'#ffffff'],[.3,'#dce7e4'],[.6,'#87978f'],[.85,'#eff4f1'],[1,'#6f7f79']]);}
  function drawAuthor(x,y,name,s,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.font=`600 ${Math.max(10,11*s)}px "Bricolage Grotesque",sans-serif`;const label='@'+String(name||'chat').slice(0,20),w=ctx.measureText(label).width+14*s;ctx.fillStyle='rgba(17,42,37,.84)';ctx.beginPath();ctx.roundRect(x-w/2,y-9*s,w,18*s,8*s);ctx.fill();ctx.fillStyle='#fff6d7';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x,y);ctx.restore();}
  function drawBall(x,y,r,color,alpha,featured,muted,z=.8,angle=0,atmospheric=false,split=0){
    if(split>0){
      const amount=Math.min(1,split), drift=r*.9*amount;
      ctx.save();ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,r,Math.PI,Math.PI*2);ctx.closePath();ctx.clip();ctx.translate(-drift,-drift*.35);ctx.rotate(-amount*.55);drawBall(x,y,r,color,alpha*(1-amount*.55),featured,muted,z,angle,atmospheric,0);ctx.restore();
      ctx.save();ctx.beginPath();ctx.moveTo(x,y);ctx.arc(x,y,r,0,Math.PI);ctx.closePath();ctx.clip();ctx.translate(drift,drift*.35);ctx.rotate(amount*.55);drawBall(x,y,r,color,alpha*(1-amount*.55),featured,muted,z,angle,atmospheric,0);ctx.restore();
      if(amount<.92){ctx.save();ctx.translate(x,y-r*.15-amount*r*.3);ctx.rotate(-.08);ctx.globalAlpha=alpha*(.35+amount*.65);ctx.fillStyle='#FFF6D7';ctx.strokeStyle='#d7c89d';ctx.lineWidth=1;ctx.fillRect(-r*.5,-r*.08,r,r*.16);ctx.strokeRect(-r*.5,-r*.08,r,r*.16);ctx.restore();}
      return;
    }
    ctx.save();ctx.globalAlpha=alpha;
    if(muted){color=desaturate(color);}
    if(atmospheric) color=blend(color,'#9dbdb3',.2);
    if(featured){ctx.beginPath();ctx.arc(x,y,r+3,0,Math.PI*2);ctx.fillStyle='rgba(248,183,53,.22)';ctx.fill();}
    const grad=ctx.createRadialGradient(x-r*.37,y-r*.48,r*.03,x+r*.12,y+r*.13,r*1.18);grad.addColorStop(0,'#fffef5');grad.addColorStop(.13,blend('#ffffff',color,.22));grad.addColorStop(.4,color);grad.addColorStop(.78,blend('#17231f',color,.65));grad.addColorStop(1,blend('#101815',color,.35));
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=grad;ctx.fill();ctx.save();ctx.clip();const occlusion=ctx.createLinearGradient(x,y-r*.15,x,y+r);occlusion.addColorStop(0,'rgba(0,0,0,0)');occlusion.addColorStop(.72,'rgba(15,22,20,.04)');occlusion.addColorStop(1,'rgba(20,17,14,.34)');ctx.fillStyle=occlusion;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.beginPath();ctx.ellipse(x,y+r*.82,r*.63,r*.12,0,0,Math.PI*2);ctx.fillStyle='rgba(255,218,150,.24)';ctx.fill();ctx.restore();
    ctx.strokeStyle='rgba(255,255,255,.21)';ctx.lineWidth=Math.max(1,r*.045);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.ellipse(x-r*.34,y-r*.39,r*.28,r*.145,-.48,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.86)';ctx.fill();
    ctx.beginPath();ctx.ellipse(x-r*.03,y-r*.59,r*.08,r*.045,-.4,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.7)';ctx.fill();
    ctx.beginPath();ctx.ellipse(x-r*.33,y-r*.31,r*.34,r*.13,-.58,Math.PI*1.08,Math.PI*1.82);ctx.strokeStyle='rgba(255,255,255,.42)';ctx.lineWidth=Math.max(1,r*.045);ctx.stroke();
    ctx.beginPath();ctx.arc(x+r*.47,y+r*.38,Math.max(1,r*.045),0,Math.PI*2);ctx.fillStyle='rgba(255,239,190,.62)';ctx.fill();
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.ellipse(r*.35,r*.2,r*.14,r*.055,-.3,0,Math.PI*2);ctx.fillStyle=featured?'rgba(255,241,190,.8)':'rgba(255,255,255,.25)';ctx.fill();ctx.restore();
    if(featured){ctx.strokeStyle='#F8B735';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r+3,0,Math.PI*2);ctx.stroke();if(performance.now()<sparkleUntil){const t=(performance.now()-sparkleStarted)/850,gx=x+(-r+2*r*t),gy=y-r*.35+Math.sin(t*Math.PI*2)*r*.28;ctx.fillStyle='#fff9cf';ctx.beginPath();ctx.arc(gx,gy,Math.max(1.7,r*.1),0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(gx-r*.24,gy);ctx.lineTo(gx+r*.24,gy);ctx.moveTo(gx,gy-r*.24);ctx.lineTo(gx,gy+r*.24);ctx.strokeStyle='#fff9cf';ctx.lineWidth=1.4;ctx.stroke();}}
    ctx.restore();
  }
  // Devuelve hex para que blend() pueda mezclarlo; un rgb() rompía addColorStop y detenía el bucle.
  function desaturate(hex){const n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255,l=Math.round(r*.3+g*.59+b*.11);return '#'+l.toString(16).padStart(2,'0').repeat(3);}
  function blend(a,b,t){const p=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));const x=p(a),y=p(b);return '#'+x.map((v,i)=>Math.round(v*(1-t)+y[i]*t).toString(16).padStart(2,'0')).join('');}
  function roundRect(x,y,w,h,r,fill,stroke,s){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=Math.max(.8,s);ctx.stroke();}}
  connect();paint();
  fetch(`/api/settings`).then(response=>response.json()).then(applySettings).catch(()=>{window.I18N.resolveLanguage();window.I18N.applyI18n();});
})();
