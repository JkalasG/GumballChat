(() => {
  const canvas = document.querySelector('#machine-canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const status = document.querySelector('#overlay-status');
  const card = document.querySelector('#open-card');
  const colors = { pista:'#FFD23F', spoiler:'#1E1B24', prediccion:'#8A5CF6', animo:'#FF6FB5', reto:'#FF5A36' };
  const labels = { pista:'Pista', spoiler:'Spoiler', prediccion:'Predicción', animo:'Ánimo', reto:'Reto' };
  const flags = { es:'🇪🇸', en:'🇺🇸', ja:'🇯🇵', fr:'🇫🇷', pt:'🇧🇷', de:'🇩🇪', ko:'🇰🇷' };
  const balls = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const query = new URLSearchParams(location.search);
  const machineSide = query.get('pos') === 'left' ? 'left' : 'right';
  document.body.classList.toggle('machine-left', machineSide === 'left');
  const requestedScale = Number(query.get('scale') || 0.8);
  const userScale = Number.isFinite(requestedScale) ? Math.max(0.45, Math.min(1.15, requestedScale)) : 0.8;
  let engine, socket, width=innerWidth, height=innerHeight, walls=[], filter='all', frame=0, running=false, activeCapsule=null, openQueue=[], sparkleTimer=null, sparkleStarted=0, sparkleUntil=0;
  let geometryCache;
  if (!window.Matter) { status.textContent='No se pudo cargar la física de la máquina'; status.classList.add('warn'); return; }
  const { Engine, Bodies, Composite, Body } = Matter;
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
    const cx = machineSide === 'left' ? r + 36 * scale : width - r - 36 * scale;
    const cy = height - r - 184 * scale;
    geometryCache = { cx, cy, r, scale, baseY:cy+r-5*scale, top:cy-r };
    return geometryCache;
  }
  function resize() {
    width=innerWidth; height=innerHeight; geometryCache=null;
    const dpr=Math.min(devicePixelRatio||1,1.75);
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
    for(const body of balls.values()) { const p=body.plugin, fresh=spawnBody(p.item,p.r); Composite.remove(engine.world,body); balls.set(p.item.id,fresh); }
    paint();
  }
  function spawnBody(item,r) {
    const g=geometry();
    const body=Bodies.circle(g.cx+(Math.random()-.5)*g.r*.85,g.top-2*g.scale,r,{restitution:.3,friction:.045,frictionAir:.008,density:.0011,sleepThreshold:38});
    body.plugin={item,r,arrivedAt:performance.now()}; Composite.add(engine.world,body); return body;
  }
  function addBall(item) {
    if(balls.has(item.id)) return;
    const g=geometry(), r=18*g.scale;
    balls.set(item.id,spawnBody(item,r));
    while(balls.size>68){const id=balls.keys().next().value;Composite.remove(engine.world,balls.get(id));balls.delete(id);}
    if(item.highlight||item.featured) scheduleSparkle();
    wake();
  }
  function connect(){
    socket=new WebSocket(`ws://${location.host}/ws`);
    socket.onopen=()=>{status.textContent='Máquina lista';status.classList.remove('warn')};
    socket.onclose=()=>{status.textContent='Reconectando…';status.classList.add('warn');setTimeout(connect,1400)};
    socket.onerror=()=>socket.close();
    socket.onmessage=event=>{const data=JSON.parse(event.data);
      if(data.type==='state'){filter=data.data.selectedFilter||'all';data.data.messages.filter(m=>m.status==='pending').forEach(addBall);}
      if(data.type==='gum')addBall(data.item);
      if(data.type==='filter')filter=data.category;
      if(data.type==='opened'){removeBall(data.item.id);openQueue.push(data.item);runQueue();}
      if(data.type==='reveal-spoilers'){data.items.forEach(removeItem=>removeBall(removeItem.id));openQueue.push(...data.items);runQueue();}
    };
  }
  function removeBall(id){const body=balls.get(id);if(body){Composite.remove(engine.world,body);balls.delete(id);}}
  function scheduleSparkle(){
    if(reducedMotion||sparkleTimer||![...balls.values()].some(body=>body.plugin.item.highlight||body.plugin.item.featured))return;
    sparkleTimer=setTimeout(()=>{sparkleTimer=null;if(![...balls.values()].some(body=>body.plugin.item.highlight||body.plugin.item.featured))return;sparkleStarted=performance.now();sparkleUntil=sparkleStarted+850;wake();scheduleSparkle();},5200+Math.random()*1800);
  }
  async function runQueue(){if(activeCapsule||!openQueue.length)return;const item=openQueue.shift();activeCapsule=true;await reveal(item);activeCapsule=false;setTimeout(runQueue,reducedMotion?80:330);}
  function reveal(item){
    return new Promise(resolve=>{
      const g=geometry(), color=colors[item.category]||'#FFD23F', side=machineSide==='right'?1:-1;
      const roller=Bodies.circle(g.cx+side*g.r*.7,g.cy+g.r*.73,13*g.scale,{restitution:.25,friction:.02,frictionAir:.018,density:.002});
      roller.plugin={item,r:13*g.scale,featured:false,exit:true}; Body.setVelocity(roller,{x:side*5*g.scale,y:-5*g.scale}); Composite.add(engine.world,roller);
      activeCapsule={body:roller,item,color,started:performance.now(),side,g}; wake();
      const finish=()=>{
        Composite.remove(engine.world,roller);activeCapsule=null;
        playCapsule(item,color,side,g);
        document.querySelector('#card-gum').style.background=color;
        document.querySelector('#card-category').textContent=labels[item.category]||'Mensaje';
        document.querySelector('#card-language').textContent=`${flags[item.sourceLanguage]||'🌐'} ${String(item.sourceLanguage||'').toUpperCase()}`;
        document.querySelector('#card-message').textContent=item.translatedText||item.text;
        document.querySelector('#card-author').textContent='@'+item.author;
        card.classList.remove('show');void card.offsetWidth;card.classList.add('show');
        clearTimeout(window.cardTimer);window.cardTimer=setTimeout(()=>card.classList.remove('show'),7200);
        wake();setTimeout(resolve,reducedMotion?30:1050);
      };
      setTimeout(finish,reducedMotion?30:1050);
    });
  }
  function playCapsule(item,color,side,g){
    const layer=document.querySelector('#capsule-layer'), wrap=document.createElement('div');
    wrap.className='capsule-pop';wrap.style.setProperty('--gum-color',color);
    wrap.style.left=`${g.cx+side*g.r*.86}px`;wrap.style.top=`${g.baseY+31*g.scale}px`;
    wrap.innerHTML='<i class="capsule-half top"></i><i class="capsule-half bottom"></i><i class="fortune-slip"></i>';
    layer.append(wrap);setTimeout(()=>wrap.remove(),reducedMotion?70:900);
  }
  function wake(){if(running)return;running=true;frame=requestAnimationFrame(tick);}
  function tick(){
    Engine.update(engine,1000/60);paint();
    const moving=[...balls.values()].some(b=>!b.isSleeping)||Boolean(activeCapsule)||performance.now()<sparkleUntil;
    if(moving){frame=requestAnimationFrame(tick);}else{running=false;frame=0;}
  }
  function paint(){ctx.clearRect(0,0,width,height);const g=geometry();drawMachine(g);
    for(const body of balls.values()){
      const {item,r,arrivedAt}=body.plugin, visible=filter==='all'||item.category===filter;
      drawBall(body.position.x,body.position.y,r,colors[item.category]||'#FFD23F',visible?1:.22,item.highlight||item.featured, !visible);
      if(performance.now()-arrivedAt<1700) drawAuthor(body.position.x,body.position.y-r-11*g.scale,item.author,g.scale);
    }
    if(activeCapsule){const b=activeCapsule.body;drawBall(b.position.x,b.position.y,activeCapsule.body.plugin.r,activeCapsule.color,1,false,false);}
  }
  function drawMachine(g){
    const {cx,cy,r,scale:s,baseY}=g, w=r*1.52, baseH=145*s, baseW=2*r*1.02;
    ctx.save();ctx.globalAlpha=.28;ctx.fillStyle='#071b18';ctx.beginPath();ctx.ellipse(cx,baseY+baseH+9*s,baseW*.61,13*s,0,0,Math.PI*2);ctx.fill();ctx.restore();
    // Redonda esfera de vidrio, con los caramelos contenidos por el mismo aro circular en Matter.js.
    const glass=ctx.createRadialGradient(cx-r*.37,cy-r*.51,2*s,cx,cy,r*1.15);
    glass.addColorStop(0,'rgba(255,255,255,.14)');glass.addColorStop(.32,'rgba(192,238,226,.035)');glass.addColorStop(.78,'rgba(89,167,150,.07)');glass.addColorStop(1,'rgba(210,248,239,.19)');
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=glass;ctx.fill();
    ctx.lineWidth=5*s;ctx.strokeStyle='#DCE7E4';ctx.stroke();ctx.lineWidth=1.3*s;ctx.strokeStyle='rgba(255,255,255,.8)';ctx.stroke();
    // Reflejos amplios y curvos, con poco blur para sostener el rendimiento de OBS.
    ctx.beginPath();ctx.ellipse(cx-r*.42,cy-r*.02,r*.115,r*.54,-.17,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.25)';ctx.fill();
    ctx.beginPath();ctx.ellipse(cx-r*.39,cy-r*.5,r*.22,r*.11,-.42,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.72)';ctx.fill();
    ctx.beginPath();ctx.arc(cx+r*.62,cy-r*.46,3*s,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
    // Cuello cromado y cuerpo fundido jade.
    roundRect(cx-w*.55,cy+r-9*s,w*1.1,18*s,7*s,chrome(s),'#81938e',s);
    const y=baseY, grad=ctx.createLinearGradient(cx-baseW/2,y,cx+baseW/2,y+baseH);
    grad.addColorStop(0,'#53AA91');grad.addColorStop(.18,'#0F7C6E');grad.addColorStop(.72,'#0B655B');grad.addColorStop(1,'#07564E');
    roundRect(cx-baseW/2,y,baseW,baseH,18*s,grad,'#AFC6B9',s);
    ctx.beginPath();ctx.moveTo(cx-baseW*.43,y+11*s);ctx.quadraticCurveTo(cx-baseW*.48,y+baseH*.45,cx-baseW*.4,y+baseH-13*s);ctx.strokeStyle='rgba(255,255,255,.19)';ctx.lineWidth=4*s;ctx.stroke();
    roundRect(cx-baseW*.33,y+18*s,baseW*.66,43*s,7*s,chrome(s),'#76837e',s);
    roundRect(cx-baseW*.31,y+20*s,baseW*.62,39*s,5*s,'#0D675C','#B5D2C3',s);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#FFF6D7';ctx.font=`${Math.max(12,19*s)}px "Bagel Fat One",serif`;ctx.fillText('Gumball Chat',cx,y+39*s);
    // Moneda, manivela y pequeña rampa/tapita de salida.
    const hx=cx+baseW*.51,hy=y+82*s;ctx.beginPath();ctx.arc(hx,hy,21*s,0,Math.PI*2);ctx.fillStyle=chrome(s);ctx.fill();ctx.strokeStyle='#73837e';ctx.lineWidth=2*s;ctx.stroke();
    ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+19*s,hy);ctx.lineTo(hx+25*s,hy+19*s);ctx.strokeStyle='#EFF4F1';ctx.lineWidth=5*s;ctx.lineCap='round';ctx.stroke();
    const knob=ctx.createRadialGradient(hx+23*s,hy+14*s,1,hx+25*s,hy+19*s,9*s);knob.addColorStop(0,'#fff');knob.addColorStop(.45,'#C5D0CC');knob.addColorStop(1,'#64746F');ctx.beginPath();ctx.arc(hx+25*s,hy+19*s,9*s,0,Math.PI*2);ctx.fillStyle=knob;ctx.fill();
    const side=machineSide==='right'?1:-1, exitX=cx+side*(baseW*.49), exitY=y+baseH-20*s;
    ctx.beginPath();ctx.moveTo(exitX,exitY);ctx.lineTo(exitX+side*37*s,exitY-3*s);ctx.lineTo(exitX+side*57*s,exitY+15*s);ctx.lineTo(exitX+side*51*s,exitY+22*s);ctx.lineTo(exitX+side*29*s,exitY+5*s);ctx.lineTo(exitX,exitY+9*s);ctx.closePath();ctx.fillStyle=chrome(s);ctx.fill();ctx.strokeStyle='#687a74';ctx.lineWidth=1*s;ctx.stroke();
    ctx.beginPath();ctx.moveTo(exitX+side*45*s,exitY+9*s);ctx.lineTo(exitX+side*54*s,exitY+15*s);ctx.strokeStyle='#0b655b';ctx.lineWidth=4*s;ctx.stroke();
    ctx.restore();
  }
  function chrome(s){const c=ctx.createLinearGradient(0,0,0,28*s);c.addColorStop(0,'#fff');c.addColorStop(.28,'#DCE7E4');c.addColorStop(.58,'#879791');c.addColorStop(.82,'#EFF4F1');c.addColorStop(1,'#71817b');return c;}
  function drawAuthor(x,y,name,s){ctx.save();ctx.font=`600 ${Math.max(10,11*s)}px "Bricolage Grotesque",sans-serif`;const label='@'+String(name||'chat').slice(0,20),w=ctx.measureText(label).width+14*s;ctx.fillStyle='rgba(17,42,37,.84)';ctx.beginPath();ctx.roundRect(x-w/2,y-9*s,w,18*s,8*s);ctx.fill();ctx.fillStyle='#fff6d7';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x,y);ctx.restore();}
  function drawBall(x,y,r,color,alpha,featured,muted){
    ctx.save();ctx.globalAlpha=alpha;
    if(muted){color=desaturate(color);}
    if(featured){ctx.beginPath();ctx.arc(x,y,r+3,0,Math.PI*2);ctx.fillStyle='rgba(248,183,53,.22)';ctx.fill();}
    ctx.fillStyle='rgba(4,28,24,.27)';ctx.beginPath();ctx.ellipse(x+2,y+r*.75,r*.82,r*.22,0,0,Math.PI*2);ctx.fill();
    const grad=ctx.createRadialGradient(x-r*.37,y-r*.48,r*.03,x+r*.12,y+r*.13,r*1.18);grad.addColorStop(0,'#fffef5');grad.addColorStop(.13,blend('#ffffff',color,.22));grad.addColorStop(.4,color);grad.addColorStop(.78,blend('#17231f',color,.65));grad.addColorStop(1,blend('#101815',color,.35));
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle='rgba(255,255,255,.21)';ctx.lineWidth=Math.max(1,r*.045);ctx.stroke();
    ctx.beginPath();ctx.ellipse(x-r*.34,y-r*.39,r*.28,r*.145,-.48,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.86)';ctx.fill();
    ctx.beginPath();ctx.ellipse(x-r*.03,y-r*.59,r*.08,r*.045,-.4,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.7)';ctx.fill();
    if(featured){ctx.strokeStyle='#F8B735';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r+3,0,Math.PI*2);ctx.stroke();if(performance.now()<sparkleUntil){const t=(performance.now()-sparkleStarted)/850,gx=x+(-r+2*r*t),gy=y-r*.35+Math.sin(t*Math.PI*2)*r*.28;ctx.fillStyle='#fff9cf';ctx.beginPath();ctx.arc(gx,gy,Math.max(1.7,r*.1),0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(gx-r*.24,gy);ctx.lineTo(gx+r*.24,gy);ctx.moveTo(gx,gy-r*.24);ctx.lineTo(gx,gy+r*.24);ctx.strokeStyle='#fff9cf';ctx.lineWidth=1.4;ctx.stroke();}}
    ctx.restore();
  }
  function desaturate(hex){const n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255,l=Math.round(r*.3+g*.59+b*.11);return `rgb(${l},${l},${l})`;}
  function blend(a,b,t){const p=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));const x=p(a),y=p(b);return '#'+x.map((v,i)=>Math.round(v*(1-t)+y[i]*t).toString(16).padStart(2,'0')).join('');}
  function roundRect(x,y,w,h,r,fill,stroke,s){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=Math.max(.8,s);ctx.stroke();}}
  connect();paint();
})();
