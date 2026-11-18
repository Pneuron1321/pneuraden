'use strict';
/* ═══════════════════════════════════════════════════════════════════
   PNEURADEN LITE — логика.
   U (утилиты) · OVP (Overpass) · SND (звук и голос) · GEO (GPS) · COMP (компас)
   SUN (день/ночь) · WAKE (экран не гаснет) · ROUTER (маршрут) · CAMS (камеры)
   LIMIT (знак ограничения) · TRIP (итоги) · NAV (ведение) · RADAR · MAPV · APP
   Все внешние сервисы бесплатные и без ключей: OSM-тайлы CARTO, OSRM,
   FOSSGIS-маршрутизатор (пешком), Overpass (камеры, лимиты), Nominatim/Photon.
   ═══════════════════════════════════════════════════════════════════ */
const $=id=>document.getElementById(id);
const ROVINJ={lat:45.0811,lng:13.6387};

const U={
  R:Math.PI/180,
  get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},
  set(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v));}catch(e){}},
  dist(a,b){const R=U.R,x=(b.lng-a.lng)*R*Math.cos((a.lat+b.lat)*R/2),y=(b.lat-a.lat)*R;return Math.hypot(x,y)*6371000;},
  brg(a,b){const R=U.R,y=Math.sin((b.lng-a.lng)*R)*Math.cos(b.lat*R),
    x=Math.cos(a.lat*R)*Math.sin(b.lat*R)-Math.sin(a.lat*R)*Math.cos(b.lat*R)*Math.cos((b.lng-a.lng)*R);
    return (Math.atan2(y,x)/R+360)%360;},
  ang(a,b){return ((a-b+540)%360)-180;},
  clamp(x,a,b){return Math.max(a,Math.min(b,x));},
  fmtD(m){m=Math.max(0,m);if(m<1000)return (m<100?Math.round(m/5)*5:Math.round(m/10)*10)+' м';
    return (m/1000).toFixed(m<10000?1:0).replace('.',',')+' км';},
  fmtT(s){const m=Math.max(1,Math.round(s/60));return m<60?m+' мин':Math.floor(m/60)+' ч '+String(m%60).padStart(2,'0')+' мин';},
  hm(t){const d=new Date(t);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');},
  esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  cap(s){return s?s[0].toUpperCase()+s.slice(1):s;},
  low(s){return s?s[0].toLowerCase()+s.slice(1):s;},
  toast(msg,ms){const box=$('toast');if(!box)return;const d=document.createElement('div');d.textContent=msg;box.appendChild(d);
    while(box.children.length>3)box.firstChild.remove();setTimeout(()=>d.remove(),ms||2600);},
  // для голоса: «300 метров», «1,5 километра», «12 километров»
  sayD(m){if(m<1000){const r=m<100?Math.max(10,Math.round(m/10)*10):Math.round(m/50)*50;return r+' метров';}
    const k=m/1000;if(k<10&&Math.abs(k-Math.round(k))>0.05)return k.toFixed(1).replace('.',',')+' километра';
    const n=Math.round(k),a=n%10,b=n%100;return n+' '+(a===1&&b!==11?'километр':a>=2&&a<=4&&(b<12||b>14)?'километра':'километров');},
  sayT(s){const m=Math.max(1,Math.round(s/60));if(m<60)return m+' '+U._pl(m,'минута','минуты','минут');
    const h=Math.floor(m/60),mm=m%60;return h+' '+U._pl(h,'час','часа','часов')+(mm?' '+mm+' '+U._pl(mm,'минута','минуты','минут'):'');},
  _pl(n,one,few,many){const a=n%10,b=n%100;return a===1&&b!==11?one:a>=2&&a<=4&&(b<12||b>14)?few:many;},
  // проекция точки на ломаную маршрута: {d — до линии, along — пройдено вдоль, i — сегмент}
  proj(route,p,i0,i1){const P=route.pts,C=route.cum;let best={d:1e12,along:0,i:0};
    const a0=Math.max(0,i0==null?0:i0),a1=Math.min(P.length-1,i1==null?P.length-1:i1);
    for(let i=a0;i<a1;i++){const a=P[i],b=P[i+1],kx=Math.cos(a[0]*U.R)*111320,ky=110540;
      const bx=(b[1]-a[1])*kx,by=(b[0]-a[0])*ky,px=(p.lng-a[1])*kx,py=(p.lat-a[0])*ky,L2=bx*bx+by*by;
      const t=L2?U.clamp((px*bx+py*by)/L2,0,1):0,d=Math.hypot(px-t*bx,py-t*by);
      if(d<best.d)best={d,along:C[i]+t*(C[i+1]-C[i]),i};}
    return best;}
};

/* ── Overpass: три зеркала по очереди (основное часто перегружено) ── */
const OVP={EPS:['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'],
  q(query,ms){return new Promise((res,rej)=>{const go=k=>{if(k>=this.EPS.length){rej(new Error('overpass'));return;}
    const ac=new AbortController(),tm=setTimeout(()=>ac.abort(),ms||25000);
    fetch(this.EPS[k],{method:'POST',body:'data='+encodeURIComponent(query),signal:ac.signal})
      .then(r=>{if(!r.ok)throw 0;return r.json();}).then(d=>{clearTimeout(tm);res(d);})
      .catch(()=>{clearTimeout(tm);go(k+1);});};go(0);});}
};

/* ═══ ЗВУК: аркадные сигналы (синтез WebAudio, без файлов) + голос по-русски ═══ */
const SND={on:U.get('lite-snd',true),ctx:null,_bus:null,_voice:null,
  unlock(){
    if(!this.ctx){const A=window.AudioContext||window.webkitAudioContext;if(A)try{this.ctx=new A();}catch(e){}}
    if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume();
    if(window.speechSynthesis){const pick=()=>{const v=speechSynthesis.getVoices();
        this._voice=v.find(x=>/^ru/i.test(x.lang)&&/female|milena|irina|google/i.test(x.name))||v.find(x=>/^ru/i.test(x.lang))||null;};
      pick();speechSynthesis.onvoiceschanged=pick;
      try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u);}catch(e){} } // iOS: «разбудить» речь касанием
  },
  toggle(){this.on=!this.on;U.set('lite-snd',this.on);this.ui();
    if(this.on){this.unlock();this.play('ui');U.toast('🔊 Звук включён');}
    else{try{speechSynthesis.cancel();}catch(e){}U.toast('🔇 Звук выключен');}},
  ui(){const e=$('snd-e');if(e)e.textContent=this.on?'🔊':'🔇';const b=$('b-snd');if(b)b.classList.toggle('off',!this.on);},
  _out(){if(!this._bus){this._bus=this.ctx.createDynamicsCompressor();this._bus.connect(this.ctx.destination);}return this._bus;},
  _t(o){const c=this.ctx,t0=c.currentTime+(o.at||0),os=c.createOscillator(),g=c.createGain();
    os.type=o.w||'square';os.frequency.setValueAtTime(o.f,t0);if(o.to)os.frequency.exponentialRampToValueAtTime(o.to,t0+o.d);
    g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(o.v||.06,t0+.01);g.gain.exponentialRampToValueAtTime(0.0001,t0+o.d);
    os.connect(g).connect(this._out());os.start(t0);os.stop(t0+o.d+.03);},
  play(k,p){
    if(!this.on||!this.ctx)return;if(this.ctx.state==='suspended')this.ctx.resume();
    try{switch(k){
      case 'ui':this._t({f:660,to:990,d:.07,v:.04});break;
      case 'start':this._t({f:220,to:880,d:.3,v:.05});this._t({f:1320,d:.12,v:.05,at:.28,w:'triangle'});break;
      case 'cam':[0,.16].forEach(a=>{this._t({f:988,d:.09,v:.07,at:a});this._t({f:1319,d:.09,v:.07,at:a+.08});});break;
      case 'beep':this._t({f:p&&p.f||900,d:.09,v:p&&p.v||.06,w:'square'});break;
      case 'over':this._t({f:240,d:.18,v:.09,w:'sawtooth'});this._t({f:190,d:.18,v:.09,w:'sawtooth',at:.2});break;
      case 'coin':this._t({f:988,d:.07,v:.06});this._t({f:1319,d:.22,v:.06,at:.07});break;   // камера пройдена без превышения
      case 'turn':this._t({f:784,d:.12,v:.05,w:'triangle'});this._t({f:1175,d:.18,v:.05,w:'triangle',at:.1});break;
      case 'reroute':this._t({f:880,to:440,d:.25,v:.05});break;
      case 'arrive':[523,659,784,1047].forEach((f,i)=>this._t({f,d:i===3?.5:.14,v:.06,at:i*.13}));break;
    }}catch(e){}
  },
  say(text,urgent){
    if(!this.on||!window.speechSynthesis||!text)return;
    try{if(urgent)speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ru-RU';
      if(this._voice)u.voice=this._voice;u.rate=1.05;speechSynthesis.speak(u);}catch(e){}
  },
  vib(p){try{if(navigator.vibrate)navigator.vibrate(p);}catch(e){}}
};

/* ═══ GPS: одна подписка, честная скорость (вето покоя глушит «6 км/ч» в комнате) ═══ */
const GEO={last:null,spd:0,head:null,subs:[],w:null,_prev:null,_anchor:null,_still:false,_vb:[],
  start(){
    if(!navigator.geolocation){this._noGps();return;}
    this.w=navigator.geolocation.watchPosition(p=>this.onFix({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy,
        spd:p.coords.speed,head:p.coords.heading,t:p.timestamp||Date.now()}),
      e=>{if(e.code===1)U.toast('Разреши геолокацию — без неё нет радара');this._noGps();},
      {enableHighAccuracy:true,maximumAge:1000,timeout:20000});
    setTimeout(()=>{if(!this.last)this._noGps();},12000);
  },
  _noGps(){if(this.last)return;this.onFix({...ROVINJ,acc:9999,spd:0,head:null,t:Date.now(),fake:true});},
  onFix(f){
    const t=f.t||Date.now();
    // якорь покоя: пока фиксы внутри пузыря точности > 15 с — стоим
    if(!this._anchor)this._anchor={...f,t};
    const dA=U.dist(this._anchor,f),gate=Math.max(10,f.acc||30);
    if(dA>gate){this._anchor={...f,t};this._still=false;}else if(t-this._anchor.t>15000)this._still=true;
    let v=(f.spd!=null&&isFinite(f.spd)&&f.spd>=0)?f.spd:null;
    if(v==null&&this._prev){const dt=(t-this._prev.t)/1000,d=U.dist(this._prev,f);
      if(dt>0.5&&dt<30)v=d>Math.max(8,f.acc||20)*0.6?Math.min(d/dt,90):0;}
    if(this._still)v=0;
    if(v!=null){this._vb.push(v);if(this._vb.length>3)this._vb.shift();
      const m=[...this._vb].sort((a,b)=>a-b)[this._vb.length>>1];this.spd=this.spd*.4+m*.6;if(this.spd<0.7)this.spd=0;}
    // курс: GPS-курс в движении, иначе по смещению
    if(this.spd>2.5){if(f.head!=null&&isFinite(f.head)&&f.head>=0)this.head=f.head;
      else if(this._prev&&U.dist(this._prev,f)>6)this.head=U.brg(this._prev,f);}
    this._prev={lat:f.lat,lng:f.lng,t};
    this.last=f;
    const g=$('gps');if(g){g.className='pill '+(f.fake?'bad':f.acc<35?'ok':'');
      g.textContent=f.fake?'НЕТ GPS · Ровинь':'GPS ±'+Math.round(f.acc)+' м';}
    this.subs.forEach(fn=>{try{fn(f);}catch(e){console.error(e);}});
  }
};

/* ═══ КОМПАС: курс в покое (в движении главнее GPS-курс). iOS — разрешение по касанию ═══ */
const COMP={head:null,
  request(){
    const D=window.DeviceOrientationEvent;if(!D)return;
    const bind=()=>{const ev='ondeviceorientationabsolute' in window?'deviceorientationabsolute':'deviceorientation';
      window.addEventListener(ev,e=>this._h(e),{passive:true});};
    if(typeof D.requestPermission==='function')D.requestPermission().then(s=>{if(s==='granted')bind();}).catch(()=>{});
    else bind();
  },
  _h(e){let h=null;
    if(e.webkitCompassHeading!=null)h=e.webkitCompassHeading;
    else if(e.absolute!==false&&e.alpha!=null)h=(360-e.alpha)%360;
    if(h==null)return;const so=(screen.orientation&&screen.orientation.angle)||window.orientation||0;h=(h+so+360)%360;
    this.head=this.head==null?h:(this.head+U.ang(h,this.head)*0.2+360)%360;RADAR.dirty=true;}
};

/* ═══ ДЕНЬ/НОЧЬ по настоящему Солнцу: ночью — тёмная «игровая» карта ═══ */
const SUN={night:null,
  alt(d,lat,lng){const days=(d.getTime()-946728000000)/864e5,g=(357.529+.98560028*days)*U.R;
    const L=(280.459+.98564736*days+1.915*Math.sin(g)+.02*Math.sin(2*g))*U.R,sD=Math.sin(.40928)*Math.sin(L);
    const st=Date.UTC(d.getUTCFullYear(),0,1),B=2*Math.PI*((d.getTime()-st)/864e5)/365.2422;
    const eot=229.18*(.000075+.001868*Math.cos(B)-.032077*Math.sin(B)-.014615*Math.cos(2*B)-.040849*Math.sin(2*B));
    const ha=((d.getUTCHours()+d.getUTCMinutes()/60+eot/60+lng/15-12)*15)*U.R,lR=lat*U.R;
    return Math.asin(Math.sin(lR)*sD+Math.cos(lR)*Math.sqrt(1-sD*sD)*Math.cos(ha))/U.R;},
  update(){const p=GEO.last||ROVINJ,n=this.alt(new Date(),p.lat,p.lng)<-4;
    if(n===this.night)return;this.night=n;document.body.dataset.night=n?'1':'0';RADAR.setTiles();MAPV.setTiles();},
  tiles(){return 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';}  // фирменная тёмная карта
};

/* ═══ Экран не гаснет, пока ведём по маршруту ═══ */
const WAKE={lock:null,want:false,
  async on(){this.want=true;try{if('wakeLock' in navigator&&!this.lock){this.lock=await navigator.wakeLock.request('screen');
    this.lock.addEventListener('release',()=>{this.lock=null;});}}catch(e){}},
  off(){this.want=false;try{this.lock&&this.lock.release();}catch(e){}this.lock=null;}
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&WAKE.want)WAKE.on();});

/* ═══ МАРШРУТ: OSRM (машина), FOSSGIS (пешком); шаги → русские подсказки ═══ */
const ROUTER={
  MODS:{left:'налево','slight left':'плавно налево','sharp left':'резко налево',right:'направо',
    'slight right':'плавно направо','sharp right':'резко направо',straight:'прямо',uturn:'разворот'},
  urls(mode,a,b){const c=a.lng.toFixed(6)+','+a.lat.toFixed(6)+';'+b.lng.toFixed(6)+','+b.lat.toFixed(6);
    const q='?overview=full&geometries=geojson&steps=true&alternatives=false';
    return mode==='foot'?['https://routing.openstreetmap.de/routed-foot/route/v1/driving/'+c+q]
      :['https://router.project-osrm.org/route/v1/driving/'+c+q,'https://routing.openstreetmap.de/routed-car/route/v1/driving/'+c+q];},
  get(mode,a,b){
    const urls=this.urls(mode,a,b);
    const go=k=>{if(k>=urls.length)return Promise.resolve(this.straight(mode,a,b));
      const ac=new AbortController(),tm=setTimeout(()=>ac.abort(),12000);
      return fetch(urls[k],{signal:ac.signal}).then(r=>r.json()).then(d=>{clearTimeout(tm);
        if(!d||d.code!=='Ok'||!d.routes||!d.routes.length)throw 0;return this.build(d.routes[0],mode);})
        .catch(()=>{clearTimeout(tm);return go(k+1);});};
    return go(0);
  },
  _cum(pts){const c=[0];for(let i=1;i<pts.length;i++)c.push(c[i-1]+U.dist({lat:pts[i-1][0],lng:pts[i-1][1]},{lat:pts[i][0],lng:pts[i][1]}));return c;},
  build(r,mode){
    const pts=r.geometry.coordinates.map(c=>[c[1],c[0]]),cum=this._cum(pts),total=cum[cum.length-1]||r.distance;
    const raw=(r.legs&&r.legs[0]&&r.legs[0].steps)||[];const sum=raw.reduce((s,x)=>s+x.distance,0)||1,k=total/sum;
    let acc=0;const steps=raw.map((st,i)=>{const m=st.maneuver||{};
      const s={k:i,type:m.type,mod:m.modifier,exit:m.exit,name:st.name||st.ref||'',along:acc*k};acc+=st.distance;
      s.text=this.text(s);s.silent=s.type==='depart'||((s.type==='new name'||s.type==='continue'||s.type==='notification')&&(!s.mod||s.mod==='straight'));
      return s;});
    if(!steps.length||steps[steps.length-1].type!=='arrive')steps.push({k:steps.length,type:'arrive',along:total,text:'Финиш',name:''});
    return{mode,pts,cum,total,dur:r.duration,steps,cams:[],approx:false};
  },
  straight(mode,a,b){const pts=[[a.lat,a.lng],[b.lat,b.lng]],cum=this._cum(pts);
    return{mode,pts,cum,total:cum[1],dur:cum[1]/(mode==='foot'?1.3:12),approx:true,cams:[],
      steps:[{k:0,type:'arrive',along:cum[1],text:'По прямой к цели',name:''}]};},
  text(s){const on=s.name?' на '+s.name:'',M=this.MODS[s.mod]||'',side=s.mod&&s.mod.indexOf('left')>=0?'левее':'правее';
    switch(s.type){
      case 'depart':return 'Начинаем'+(s.name?' по '+s.name:'');
      case 'arrive':return 'Финиш';
      case 'roundabout':case 'rotary':case 'roundabout turn':return 'На круге — '+(s.exit?s.exit+'-й съезд':'съезд')+on;
      case 'exit roundabout':case 'exit rotary':return 'Съезд с круга'+on;
      case 'fork':return 'Держитесь '+side+on;
      case 'merge':return 'Перестройтесь '+side+on;
      case 'on ramp':return 'Заезд на трассу'+on;
      case 'off ramp':return 'Съезд '+side+on;
      case 'end of road':return 'В конце дороги '+(M||'поверните')+on;
      case 'continue':case 'new name':return (s.mod&&s.mod!=='straight'?U.cap(M):'Прямо')+on;
      default:return (s.mod==='straight'?'Прямо':s.mod==='uturn'?'Разворот':'Поверните '+M)+on;}
  }
};

/* ═══ КАМЕРЫ СКОРОСТИ: радиус 21 км вокруг тебя + вдоль всего маршрута ═══
   Данные OSM (highway=speed_camera). Кэш на телефоне 7 дней: камеры не бегают.
   Тревога: впереди по маршруту (или по курсу ±35° без маршрута), с 600 м;
   «парктроник» с 400 м; превышение — красная тревога; пройдена честно — монетка. */
const CAMS={on:U.get('lite-cam',true),list:new Map(),anchor:null,_busy:false,alert:null,n21:0,_said:{},_next:0,passed:new Set(),
  R:21000,
  init(){
    const c=U.get('lite-cams',null);
    if(c&&Date.now()-c.t<7*864e5){(c.cams||[]).forEach(a=>this.list.set(a[0],{id:a[0],lat:a[1],lng:a[2],lim:a[3]||null}));this.anchor=c.a;}
    this.ui();
  },
  toggle(){this.on=!this.on;U.set('lite-cam',this.on);this.ui();SND.play('ui');
    if(this.on){U.toast('📸 Камеры: предупреждаю за 600 м');if(GEO.last)this.ensure(GEO.last);}
    else{this._hide();U.toast('📸 Камеры выключены');}
    RADAR.dirty=true;MAPV.drawCams();},
  ui(){const b=$('b-cam');if(b)b.classList.toggle('off',!this.on);
    const n=$('cam-n');if(n){n.textContent=this.n21>99?'99+':this.n21;n.classList.toggle('hidden',!this.on||!this.n21);}},
  _lim(t){if(!t)return null;const s=t['maxspeed']||t['maxspeed:forward']||t['maxspeed:backward'];return s?LIMIT.parse(s):null;},
  _add(els){let n=0;(els||[]).forEach(e=>{const la=e.lat!=null?e.lat:e.center&&e.center.lat,lo=e.lon!=null?e.lon:e.center&&e.center.lon;
    if(la==null)return;if(!this.list.has(e.id))n++;this.list.set(e.id,{id:e.id,lat:la,lng:lo,lim:this._lim(e.tags)});});return n;},
  _save(){const a=this.anchor||GEO.last||ROVINJ;
    const arr=[...this.list.values()].sort((x,y)=>U.dist(a,x)-U.dist(a,y)).slice(0,3000).map(c=>[c.id,+c.lat.toFixed(6),+c.lng.toFixed(6),c.lim]);
    U.set('lite-cams',{t:Date.now(),a:this.anchor,cams:arr});},
  ensure(f){
    if(!this.on||this._busy||f.fake)return;
    if(this.anchor&&U.dist(this.anchor,f)<7000)return;     // зона уже покрыта — Overpass не дёргаем
    this._busy=true;
    OVP.q('[out:json][timeout:25];nwr["highway"="speed_camera"](around:'+this.R+','+f.lat.toFixed(5)+','+f.lng.toFixed(5)+');out center 900;')
      .then(d=>{this._add(d.elements);this.anchor={lat:f.lat,lng:f.lng};this._save();this.onFix(f,true);MAPV.drawCams();RADAR.dirty=true;})
      .catch(()=>{}).finally(()=>{this._busy=false;});
  },
  // камеры вдоль всего маршрута (даже дальше 21 км): запрос «вокруг ломаной», потом точный отбор ≤ 45 м
  forRoute(route){
    if(!route||route.approx||route.mode!=='car')return Promise.resolve(0);
    const step=Math.max(150,route.total/220),rad=Math.round(U.clamp(step*.35,60,600)),pts=[];let last=-1e9;
    route.pts.forEach((p,i)=>{if(route.cum[i]-last>=step||i===route.pts.length-1){pts.push(p[0].toFixed(5)+','+p[1].toFixed(5));last=route.cum[i];}});
    const tag=()=>{route.cams=[];this.list.forEach(c=>{const pr=U.proj(route,c);if(pr.d<=45)route.cams.push({...c,along:pr.along});});
      route.cams.sort((a,b)=>a.along-b.along);RADAR.dirty=true;MAPV.drawCams();return route.cams.length;};
    tag();
    return OVP.q('[out:json][timeout:25];nwr["highway"="speed_camera"](around:'+rad+','+pts.join(',')+');out center 900;')
      .then(d=>{this._add(d.elements);this._save();return tag();}).catch(()=>tag());
  },
  onFix(f,quiet){
    if(!quiet)this.ensure(f);
    let n=0;this.list.forEach(c=>{if(U.dist(f,c)<=this.R)n++;});this.n21=n;this.ui();
    if(!quiet)this.check(f);
  },
  check(f){
    if(!this.on||f.fake){this._hide();return;}
    const v=GEO.spd,kmh=v*3.6;let tg=null;
    if(NAV.on&&NAV.route&&NAV.route.mode==='car'){
      for(const c of NAV.route.cams){const ah=c.along-NAV.along;if(ah>-15&&ah<=1500){tg={c,d:Math.max(0,ah)};break;}}
    } else if(v>3.5){
      const H=APP.heading();let bd=1e9;
      this.list.forEach(c=>{const d=U.dist(f,c);if(d>800||d>=bd)return;
        if(H!=null&&d>40&&Math.abs(U.ang(U.brg(f,c),H))>35)return;bd=d;tg={c,d};});
    }
    // камера пройдена? (была впереди, а теперь < 25 м или исчезла сзади)
    const prev=this.alert;
    if(prev&&!this.passed.has(prev.c.id)&&(!tg||tg.c.id!==prev.c.id||tg.d<25)&&prev.d<120){
      this.passed.add(prev.c.id);const over=prev.c.lim&&prev.maxKmh>prev.c.lim+3;
      TRIP.camPass(!!over);if(!over){SND.play('coin');U.toast('⭐ Камера пройдена без превышения');}}
    if(!tg||tg.d>600||this.passed.has(tg.c.id)){this._hide();return;}
    const c=tg.c,over=c.lim&&kmh>c.lim+3;
    this.alert={c,d:tg.d,maxKmh:Math.max(prev&&prev.c.id===c.id?prev.maxKmh:0,tg.d<120?kmh:0)};
    const box=$('cam-alert');box.classList.remove('hidden');box.classList.toggle('over',!!over);
    $('ca-d').textContent=U.fmtD(tg.d);$('ca-t').textContent=over?'СБАВЬ СКОРОСТЬ!':'камера впереди';
    $('ca-lim').textContent=c.lim||'?';
    document.body.classList.toggle('over',!!over);
    // голос: на входе в зону и на 250 м
    const say=(key,txt)=>{if(this._said[key])return;this._said[key]=1;SND.play('cam');SND.vib([60,60,60]);SND.say(txt,true);};
    if(tg.d<=600)say(c.id+'@600','Камера через '+U.sayD(Math.round(tg.d/50)*50)+(c.lim?', ограничение '+c.lim:''));
    if(tg.d<=250)say(c.id+'@250',over?'Сбавь скорость! Ограничение '+c.lim:'Камера через '+U.sayD(tg.d));
    // парктроник: чаще и выше по мере приближения; превышение — тревога
    const now=Date.now();
    if(v>2&&tg.d<=400&&now>=this._next){const k=1-tg.d/400;
      this._next=now+Math.max(130,1000-860*k*k)*(over?.6:1);
      if(over)SND.play('over');else SND.play('beep',{f:760+520*k,v:.04+.08*k});}
    if(over&&!this._said[c.id+'@over']){this._said[c.id+'@over']=1;SND.vib([200,100,200]);}
  },
  _hide(){this.alert=null;const b=$('cam-alert');if(b)b.classList.add('hidden');document.body.classList.remove('over');}
};

/* ═══ ЗНАК ОГРАНИЧЕНИЯ: камера впереди → её лимит; иначе лимит дороги (OSM maxspeed) ═══ */
const LIMIT={val:null,_t:0,_cache:new Map(),
  ZONES:{'RU:urban':60,'RU:rural':90,'RU:motorway':110,'HR:urban':50,'HR:rural':90,'HR:motorway':130,'SI:urban':50,'SI:rural':90,
    'IT:urban':50,'IT:rural':90,'AT:urban':50,'AT:rural':100,'DE:urban':50,'DE:rural':100,'UA:urban':50,'UA:rural':90},
  parse(s){s=String(s).trim();if(/mph/i.test(s))return Math.round(parseFloat(s)*1.609)||null;const n=parseInt(s,10);
    return n>0&&n<200?n:(this.ZONES[s]||null);},
  onFix(f){
    if(f.fake)return;
    const a=CAMS.alert;if(a&&a.c.lim){this.set(a.c.lim);return;}
    if(GEO.spd<3)return;                                     // в покое Overpass не дёргаем
    const key=f.lat.toFixed(3)+','+f.lng.toFixed(3);
    if(this._cache.has(key)){this.set(this._cache.get(key));return;}
    if(Date.now()-this._t<12000)return;this._t=Date.now();
    OVP.q('[out:json][timeout:8];way(around:25,'+f.lat.toFixed(5)+','+f.lng.toFixed(5)+')["highway"]["maxspeed"];out tags 3;',9000)
      .then(d=>{const w=(d.elements||[]).find(e=>e.tags&&e.tags.maxspeed);const v=w?this.parse(w.tags.maxspeed):null;
        this._cache.set(key,v);if(this._cache.size>500)this._cache.delete(this._cache.keys().next().value);this.set(v);}).catch(()=>{});
  },
  set(v){this.val=v||null;const e=$('lim');if(e){e.textContent=v||'–';e.style.opacity=v?1:.45;}}
};

/* ═══ ИТОГИ ПОЕЗДКИ (для экрана «ФИНИШ!») ═══ */
const TRIP={on:false,t0:0,dist:0,max:0,cams:0,over:0,overT:0,_last:null,_lt:0,
  start(){Object.assign(this,{on:true,t0:Date.now(),dist:0,max:0,cams:0,over:0,overT:0,_last:null,_lt:Date.now()});},
  fix(f){if(!this.on||f.fake)return;const now=Date.now();
    if(this._last&&(f.acc||99)<60){const d=U.dist(this._last,f),dt=Math.max(.5,((f.t||now)-(this._last.t||now))/1000);
      if(d/dt<70)this.dist+=d;}   // скачки GPS (>250 км/ч) в путь не идут
    this._last=f;const kmh=GEO.spd*3.6;this.max=Math.max(this.max,kmh);
    if(LIMIT.val&&kmh>LIMIT.val+5)this.overT+=(now-this._lt)/1000;this._lt=now;},
  camPass(over){if(!this.on)return;this.cams++;if(over)this.over++;},
  finish(){this.on=false;const t=(Date.now()-this.t0)/1000;
    const stars=this.over===0&&this.overT<15?3:this.over<=1&&this.overT<90?2:1;
    return{dist:this.dist,time:t,avg:this.dist/Math.max(1,t)*3.6,max:this.max,cams:this.cams,over:this.over,stars};}
};

/* ═══ ВЕДЕНИЕ ПО МАРШРУТУ: прогресс по линии, подсказки, голос, перестроение, финиш ═══ */
const NAV={on:false,mode:'car',dest:null,route:null,along:0,_i:0,_off:0,_lastRe:0,_said:{},
  start(){
    const d=MAPV.dest,r=MAPV.route;if(!d){U.toast('Сначала выбери точку на карте');return;}
    if(!r){U.toast('Маршрут ещё строится…');return;}
    Object.assign(this,{on:true,dest:d,mode:r.mode,route:r,along:0,_i:0,_off:0,_said:{}});
    U.set('lite-nav',{dest:d,mode:r.mode,t:Date.now()});
    document.body.classList.add('nav');APP.closeMap();WAKE.on();TRIP.start();
    SND.play('start');SND.say((r.mode==='foot'?'Идём! ':'Поехали! ')+U.sayD(r.total)+', примерно '+U.sayT(r.dur),true);
    if(r.mode==='car'&&!r.cams.length)CAMS.forRoute(r);
    RADAR.drawRoute();APP.ui();if(GEO.last)this.update(GEO.last);
  },
  stop(quiet){
    this.on=false;this.route=null;this.dest=null;U.set('lite-nav',null);document.body.classList.remove('nav');WAKE.off();
    $('maneuver').classList.add('hidden');$('trip').classList.add('hidden');CAMS._hide();
    MAPV.clearDest(true);RADAR.drawRoute();APP.ui();if(!quiet){SND.play('ui');U.toast('Маршрут остановлен');}
  },
  update(f){
    if(!this.on||!this.route||f.fake)return;
    const R=this.route,pr=U.proj(R,f,this._i-3,this._i+80),p2=pr.d>60?U.proj(R,f):pr;
    this._i=p2.i;this.along=Math.max(this.along-30,p2.along);   // назад не прыгаем от шума
    // сход с маршрута: 2 фикса подряд дальше 55 м (пешком 35 м) при нормальной точности
    const lim=this.mode==='foot'?35:55;
    if(p2.d>lim&&(f.acc||99)<50)this._off++;else this._off=0;
    if(this._off>=2&&Date.now()-this._lastRe>10000&&!R.approx){this.reroute(f);return;}
    const rem=Math.max(0,R.total-this.along);
    if(rem<(this.mode==='foot'?15:30)||U.dist(f,this.dest)<(this.mode==='foot'?12:25)){this.arrive();return;}
    const st=this.next();this.hud(st,rem);this.voice(st);
  },
  next(){const S=this.route.steps;for(const s of S)if(s.along>this.along+3&&!s.silent)return s;return S[S.length-1];},
  hud(st,rem){
    const d=Math.max(0,st.along-this.along);
    const m=$('maneuver');m.classList.remove('hidden');m.classList.toggle('foot',this.mode==='foot');
    $('m-dist').textContent=U.fmtD(d);$('m-txt').textContent=st.text;$('m-ico').innerHTML=APP.arrow(st);
    const t=$('trip');t.classList.remove('hidden');
    const left=this.route.dur*(rem/Math.max(1,this.route.total));
    $('t-rem').textContent=U.fmtD(rem);$('t-eta').textContent=U.fmtT(left)+' · '+U.hm(Date.now()+left*1000);
  },
  voice(st){
    const d=st.along-this.along,th=this.mode==='foot'?[90,20]:[800,300,60];
    for(const t of th){const key=st.k+'@'+t;
      if(d<=t&&d>t*.35&&!this._said[key]){this._said[key]=1;
        th.forEach(x=>{if(x>t)this._said[st.k+'@'+x]=1;});   // дальние пороги уже не нужны
        const txt=t===th[th.length-1]?U.cap(st.text):'Через '+U.sayD(d)+' '+U.low(st.text);
        SND.play('turn');SND.vib(30);SND.say(txt);break;}}
  },
  repeat(){if(!this.on)return;const st=this.next();SND.say('Через '+U.sayD(st.along-this.along)+' '+U.low(st.text),true);},
  reroute(f){
    this._lastRe=Date.now();this._off=0;SND.play('reroute');U.toast('🔄 Перестраиваю маршрут');
    ROUTER.get(this.mode,f,this.dest).then(r=>{if(!this.on)return;
      Object.assign(this,{route:r,along:0,_i:0,_said:{}});MAPV.route=r;
      if(r.mode==='car')CAMS.forRoute(r);RADAR.drawRoute();MAPV.drawRoute();SND.say('Маршрут перестроен');});
  },
  arrive(){
    const s=TRIP.finish(),mode=this.mode;this.stop(true);
    SND.play('arrive');SND.vib([80,60,80,60,160]);SND.say(mode==='foot'?'Вы пришли!':'Вы на месте!',true);
    APP.showFinish(s,mode);
  }
};

/* ═══ РАДАР: круглая миникарта как в GTA — крутится по курсу, маршрут, камеры, финиш,
   указатели по кромке на то, что за краем. Рисуем только когда что-то изменилось, ≤ 30 к/с ═══ */
const RADAR={map:null,tile:null,line:null,glow:null,cv:null,cx:null,dirty:true,hd:0,_last:0,
  init(){
    this.map=L.map('mini',{zoomControl:false,attributionControl:false,dragging:false,touchZoom:false,doubleClickZoom:false,
      scrollWheelZoom:false,boxZoom:false,keyboard:false,tap:false,zoomAnimation:false,fadeAnimation:false,inertia:false,zoomSnap:.5})
      .setView([ROVINJ.lat,ROVINJ.lng],16);
    this.setTiles();
    this.cv=$('rc');this.cx=this.cv.getContext('2d');this._size();window.addEventListener('resize',()=>{this._size();this.map.invalidateSize();});
    GEO.subs.push(f=>this.onFix(f));
    const loop=now=>{requestAnimationFrame(loop);this.frame(now);};requestAnimationFrame(loop);
  },
  setTiles(){if(!this.map)return;if(this.tile)this.map.removeLayer(this.tile);
    this.tile=L.tileLayer(SUN.tiles(),{subdomains:'abcd',maxZoom:20,keepBuffer:1}).addTo(this.map);},
  _size(){const r=this.cv.getBoundingClientRect(),k=Math.min(2,window.devicePixelRatio||1);
    this.cv.width=Math.round(r.width*k);this.cv.height=Math.round(r.height*k);this._k=k;this.dirty=true;},
  zoom(){const v=GEO.spd;if(NAV.on&&NAV.mode==='foot')return 17.5;return v<4?17:v<12?16:v<22?15.5:15;},
  onFix(f){const z=this.zoom();this.map.setView([f.lat,f.lng],z,{animate:false});this.dirty=true;},
  drawRoute(){
    [this.glow,this.line].forEach(l=>{if(l)this.map.removeLayer(l);});this.glow=this.line=null;
    if(NAV.on&&NAV.route){const c=NAV.mode==='foot'?'#22d3ee':'#FFD60A';
      this.glow=L.polyline(NAV.route.pts,{color:'#1a1205',weight:14,opacity:.6,lineCap:'round',lineJoin:'round',interactive:false}).addTo(this.map);
      this.line=L.polyline(NAV.route.pts,{color:c,weight:7,opacity:.97,lineCap:'round',lineJoin:'round',interactive:false}).addTo(this.map);}
    this.dirty=true;
  },
  frame(now){
    if(document.hidden||document.body.dataset.view!=='radar')return;
    if(now-this._last<33)return;this._last=now;
    const H=APP.heading(),t=H==null?0:H,d=U.ang(t,this.hd);
    if(Math.abs(d)>.3){this.hd=(this.hd+d*.25+360)%360;this.dirty=true;}
    const blink=!!CAMS.alert;
    if(!this.dirty&&!blink)return;this.dirty=false;
    $('mini').style.transform='rotate('+(-this.hd).toFixed(2)+'deg)';
    this.draw(now);
  },
  // экранная точка (от центра круга, px) для координаты на миникарте с учётом поворота
  _scr(lat,lng){const p=this.map.latLngToContainerPoint([lat,lng]),s=this.map.getSize(),x=p.x-s.x/2,y=p.y-s.y/2,h=this.hd*U.R;
    return{x:Math.cos(h)*x+Math.sin(h)*y,y:-Math.sin(h)*x+Math.cos(h)*y};},
  draw(now){
    const c=this.cx,k=this._k,W=this.cv.width,Hh=this.cv.height;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,W,Hh);
    c.setTransform(k,0,0,k,W/2,Hh/2);
    const rr=W/k/2-14-2,edge=rr-18;   // радиус кольца и кромка для указателей
    // кольца дальности и перекрестие — неоново-зелёные, как у радара полной версии
    c.lineWidth=1;[.33,.66].forEach((f,i)=>{c.beginPath();c.arc(0,0,rr*f,0,7);c.strokeStyle='rgba(0,255,80,'+(.10+i*.06)+')';c.stroke();});
    // вращающаяся шкала компаса: штрих каждые 5°, крупный — на сторонах света
    c.save();c.rotate(-this.hd*U.R);
    for(let d=0;d<360;d+=5){const r=d*U.R,ic=d%90===0,is=d%45===0,tl=ic?13:is?8:4;
      c.beginPath();c.moveTo(Math.sin(r)*(rr-tl),-Math.cos(r)*(rr-tl));c.lineTo(Math.sin(r)*rr,-Math.cos(r)*rr);
      c.strokeStyle='rgba(0,255,80,'+(ic?.9:is?.55:.25)+')';c.lineWidth=ic?2.5:1;c.stroke();}
    c.font="900 15px 'Orbitron',ui-monospace,monospace";c.textAlign='center';c.textBaseline='middle';
    ['N','E','S','W'].forEach((l,i)=>{const r=i*Math.PI/2,x=Math.sin(r)*(rr-26),y=-Math.cos(r)*(rr-26);
      c.save();c.translate(x,y);c.rotate(this.hd*U.R);   // буквы стоят ровно при любом повороте
      c.fillStyle=l==='N'?'rgba(255,55,55,.98)':'rgba(0,255,80,.92)';c.shadowColor=l==='N'?'rgba(255,50,50,.8)':'rgba(0,255,80,.5)';c.shadowBlur=10;
      c.fillText(l,0,1);c.restore();});
    c.restore();
    const me=GEO.last;
    // камеры
    if(CAMS.on&&me){const al=CAMS.alert&&CAMS.alert.c.id,route=NAV.on&&NAV.route?new Set(NAV.route.cams.map(x=>x.id)):null;
      CAMS.list.forEach(cm=>{if(U.dist(me,cm)>3000&&cm.id!==al)return;const s=this._scr(cm.lat,cm.lng),r=Math.hypot(s.x,s.y);
        if(r<=edge)this._cam(s.x,s.y,cm.id===al,route&&route.has(cm.id),now);
        else if(cm.id===al)this._ptr(s,edge,'#fbbf24','📸',U.fmtD(CAMS.alert.d));});}
    // финиш
    if(NAV.on&&NAV.dest){const s=this._scr(NAV.dest.lat,NAV.dest.lng),r=Math.hypot(s.x,s.y);
      if(r<=edge){c.font='24px serif';c.textAlign='center';c.textBaseline='bottom';c.shadowColor='rgba(255,214,10,.9)';c.shadowBlur=10;
        c.fillText('📍',s.x,s.y+3);c.shadowBlur=0;}
      else this._ptr(s,edge,NAV.mode==='foot'?'#22d3ee':'#ec4899','📍',U.fmtD(Math.max(0,NAV.route.total-NAV.along)));}
    // ты: красная стрелка с подсветкой, как стрелка пользователя в полной версии
    c.beginPath();c.moveTo(0,-16);c.lineTo(12,12);c.lineTo(0,5);c.lineTo(-12,12);c.closePath();c.lineJoin='round';
    c.shadowColor='rgba(255,0,51,.9)';c.shadowBlur=14;c.fillStyle='#ff0033';c.fill();c.shadowBlur=0;
    c.lineWidth=1.5;c.strokeStyle='#ff6680';c.stroke();
  },
  _cam(x,y,hot,onRoute,now){const c=this.cx,s=hot?1+.12*Math.sin(now/90):1;
    c.save();c.translate(x,y);c.scale(s,s);c.beginPath();c.arc(0,0,12,0,7);
    c.fillStyle=hot?'rgba(244,63,94,.85)':'rgba(10,15,30,.9)';c.fill();
    c.shadowColor=hot?'rgba(244,63,94,1)':onRoute?'rgba(251,191,36,.9)':'rgba(244,63,94,.7)';c.shadowBlur=10;
    c.lineWidth=1.8;c.strokeStyle=onRoute&&!hot?'#fbbf24':'rgba(244,63,94,.9)';c.stroke();c.shadowBlur=0;
    c.font='13px serif';c.textAlign='center';c.textBaseline='middle';c.fillText('📸',0,1);c.restore();},
  _ptr(s,edge,col,ico,label){const c=this.cx,a=Math.atan2(s.y,s.x),x=Math.cos(a)*edge,y=Math.sin(a)*edge;
    c.save();c.translate(x,y);c.rotate(a);c.beginPath();c.moveTo(14,0);c.lineTo(-6,-11);c.lineTo(-6,11);c.closePath();
    c.shadowColor=col;c.shadowBlur=12;c.fillStyle=col;c.fill();c.restore();
    const lx=Math.cos(a)*(edge-30),ly=Math.sin(a)*(edge-30);
    c.font="700 11px 'Orbitron',ui-monospace,monospace";c.textAlign='center';c.textBaseline='middle';
    c.shadowColor='rgba(0,0,0,.9)';c.shadowBlur=6;c.fillStyle=col;c.fillText(ico+' '+label,lx,ly);c.shadowBlur=0;}
};

/* ═══ КАРТА: тап — точка, поиск, «ехать / идти», предпросмотр маршрута и камер на нём ═══ */
const MAPV={map:null,tile:null,me:null,dest:null,destMk:null,ringMk:null,route:null,mode:U.get('lite-mode','car'),
  glow:null,line:null,camLayer:null,_rid:0,_opened:false,_st:null,
  init(){
    this.map=L.map('map',{zoomControl:false,attributionControl:true,zoomSnap:.5}).setView([ROVINJ.lat,ROVINJ.lng],14);
    this.map.attributionControl.setPrefix('');this.setTiles();
    this.map.on('click',e=>{if(NAV.on){U.toast('Сначала останови маршрут');return;}
      this.setDest({lat:e.latlng.lat,lng:e.latlng.lng,name:'Точка на карте'},true);});
    this.me=L.marker([ROVINJ.lat,ROVINJ.lng],{interactive:false,zIndexOffset:1000,icon:L.divIcon({className:'',iconSize:[38,38],iconAnchor:[19,19],
      html:'<div class="mk-me"><svg viewBox="-20 -20 40 40"><path d="M0 -15L12 12L0 5L-12 12Z" fill="#ff0033" stroke="#ff5577" stroke-width="1.5" stroke-linejoin="round"/></svg></div>'})}).addTo(this.map);
    GEO.subs.push(f=>{this.me.setLatLng([f.lat,f.lng]);const h=APP.heading(),el=this.me.getElement();
      if(el){const s=el.querySelector('svg');if(s)s.style.transform='rotate('+(h||0)+'deg)';}});
    this._search();this.ui();
  },
  setTiles(){if(!this.map)return;if(this.tile)this.map.removeLayer(this.tile);
    this.tile=L.tileLayer(SUN.tiles(),{subdomains:'abcd',maxZoom:20,
      attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>'}).addTo(this.map);},
  open(){setTimeout(()=>{this.map.invalidateSize();
    if(!this._opened){this._opened=true;const p=GEO.last||ROVINJ;this.map.setView([p.lat,p.lng],15);}
    if(NAV.on&&this.route)this.drawRoute();this.drawCams();this.ui();},30);},
  recenter(){const p=GEO.last||ROVINJ;this.map.setView([p.lat,p.lng],Math.max(15,this.map.getZoom()));SND.play('ui');},
  setDest(d,reverse,noPlan){
    this.dest=d;SND.play('ui');
    [this.destMk,this.ringMk].forEach(m=>{if(m)this.map.removeLayer(m);});
    this.ringMk=L.marker([d.lat,d.lng],{interactive:false,icon:L.divIcon({className:'',iconSize:[46,46],iconAnchor:[23,23],html:'<div class="mk-ring"></div>'})}).addTo(this.map);
    this.destMk=L.marker([d.lat,d.lng],{interactive:false,icon:L.divIcon({className:'',iconSize:[36,36],iconAnchor:[8,34],html:'<div class="mk-dest">🏁</div>'})}).addTo(this.map);
    this.ui();
    if(reverse)this._reverse(d);
    if(!noPlan)this.plan();
  },
  setMode(m){this.mode=m;U.set('lite-mode',m);SND.play('ui');this.ui();if(this.dest&&!NAV.on)this.plan();},
  plan(after){
    if(!this.dest)return;const id=++this._rid,from=GEO.last||ROVINJ;this.route=null;
    $('p-sum').textContent='Строю маршрут…';$('b-start').disabled=true;
    ROUTER.get(this.mode,from,this.dest).then(r=>{if(id!==this._rid)return;this.route=r;this.drawRoute(true);
      const arr=U.hm(Date.now()+r.dur*1000);
      const base=(r.approx?'≈ по прямой · ':'')+'<b>'+U.fmtD(r.total)+'</b> · '+U.fmtT(r.dur)+' · прибытие '+arr;
      $('p-sum').innerHTML=base+(r.mode==='car'?' · 📸 …':'');$('b-start').disabled=false;
      if(r.mode==='car')CAMS.forRoute(r).then(n=>{if(id===this._rid)$('p-sum').innerHTML=base+' · 📸 <b>'+n+'</b> на пути';});
      if(after)after();});
  },
  drawRoute(fit){
    [this.glow,this.line].forEach(l=>{if(l)this.map.removeLayer(l);});this.glow=this.line=null;
    const r=NAV.on?NAV.route:this.route;if(!r)return;const c=r.mode==='foot'?'#22d3ee':'#FFD60A';
    this.glow=L.polyline(r.pts,{color:'#1a1205',weight:11,opacity:.55,lineCap:'round',lineJoin:'round',interactive:false}).addTo(this.map);
    this.line=L.polyline(r.pts,{color:c,weight:5.5,opacity:.95,lineCap:'round',lineJoin:'round',dashArray:r.approx?'4 12':null,interactive:false}).addTo(this.map);
    if(fit)this.map.fitBounds(this.line.getBounds(),{paddingTopLeft:[30,90],paddingBottomRight:[30,250]});
    this.drawCams();
  },
  clearDest(keep){
    if(NAV.on&&!keep){NAV.stop();return;}
    this.dest=null;this.route=null;this._rid++;
    [this.destMk,this.ringMk,this.glow,this.line].forEach(m=>{if(m&&this.map)this.map.removeLayer(m);});
    this.destMk=this.ringMk=this.glow=this.line=null;this.ui();this.drawCams();
  },
  // камеры на карте: в радиусе 21 км (до 400 ближайших) + все на маршруте
  drawCams(){
    if(!this.map)return;if(this.camLayer){this.map.removeLayer(this.camLayer);this.camLayer=null;}
    if(!CAMS.on)return;const me=GEO.last||ROVINJ,r=NAV.on?NAV.route:this.route;
    const onR=new Map(((r&&r.cams)||[]).map(c=>[c.id,c]));
    const near=[...CAMS.list.values()].map(c=>({c,d:U.dist(me,c)})).filter(x=>x.d<=CAMS.R||onR.has(x.c.id))
      .sort((a,b)=>a.d-b.d).slice(0,400);
    this.camLayer=L.layerGroup(near.map(({c})=>L.marker([c.lat,c.lng],{interactive:false,icon:L.divIcon({className:'',iconSize:[30,30],iconAnchor:[15,15],
      html:'<div class="mk-cam'+(onR.has(c.id)?' route':'')+'">📸'+(c.lim?'<i class="sign sm" style="position:absolute;top:-12px;right:-14px;width:20px;height:20px;font-size:.5rem;border-width:2.5px;font-style:normal">'+c.lim+'</i>':'')+'</div>'})}))).addTo(this.map);
  },
  ui(){
    const plan=$('plan'),hint=$('map-hint');if(!plan)return;
    const show=!!this.dest||NAV.on;plan.classList.toggle('hidden',!show);hint.classList.toggle('hidden',show);
    $('m-car').classList.toggle('on',this.mode==='car');$('m-foot').classList.toggle('on',this.mode==='foot');
    $('m-car').disabled=$('m-foot').disabled=NAV.on;
    const b=$('b-start');
    if(NAV.on){$('p-name').textContent=(NAV.mode==='foot'?'🚶 ':'🚗 ')+(NAV.dest&&NAV.dest.name||'В пути');
      $('p-sum').innerHTML='Осталось <b>'+U.fmtD(Math.max(0,NAV.route.total-NAV.along))+'</b>';b.textContent='◀ К РАДАРУ';b.disabled=false;b.onclick=()=>APP.closeMap();}
    else{$('p-name').textContent=this.dest?this.dest.name:'—';b.textContent=this.mode==='foot'?'▶ ИДЁМ!':'▶ ПОЕХАЛИ!';b.onclick=()=>NAV.start();}
  },
  _reverse(d){
    fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=ru&zoom=17&lat='+d.lat.toFixed(6)+'&lon='+d.lng.toFixed(6))
      .then(r=>r.json()).then(j=>{if(this.dest!==d||!j)return;const a=j.address||{};
        d.name=j.name||[a.road,a.house_number].filter(Boolean).join(', ')||a.suburb||a.town||a.city||d.name;this.ui();}).catch(()=>{});
  },
  // поиск: Nominatim (сначала рядом с тобой), запасной — Photon
  _search(){
    const q=$('q'),box=$('sres');let tm=null;
    const run=s=>{if(s.length<2){box.classList.add('hidden');return;}
      const c=GEO.last||ROVINJ,dLat=1.1,dLng=1.1/Math.max(.2,Math.cos(c.lat*U.R));
      const vb=(c.lng-dLng).toFixed(3)+','+(c.lat+dLat).toFixed(3)+','+(c.lng+dLng).toFixed(3)+','+(c.lat-dLat).toFixed(3);
      const show=arr=>{if(!arr.length){box.innerHTML='<div>Ничего не нашлось<small>Попробуй город, улицу или ориентир</small></div>';box.classList.remove('hidden');return;}
        arr.sort((a,b)=>U.dist(c,a)-U.dist(c,b));
        box.innerHTML=arr.slice(0,7).map((r,i)=>'<div data-i="'+i+'">'+U.esc(r.name)+'<small>'+U.esc(r.sub)+' · '+U.fmtD(U.dist(c,r))+'</small></div>').join('');
        box.classList.remove('hidden');
        box.querySelectorAll('[data-i]').forEach(el=>el.onclick=()=>{const r=arr[+el.dataset.i];box.classList.add('hidden');q.value=r.name;q.blur();
          if(NAV.on){U.toast('Сначала останови маршрут');return;}
          this.setDest({lat:r.lat,lng:r.lng,name:r.name},false);});};
      fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=ru&limit=10&viewbox='+vb+'&bounded=0&q='+encodeURIComponent(s))
        .then(r=>r.json()).then(a=>{if(!Array.isArray(a)||!a.length)throw 0;
          show(a.map(o=>{const p=(o.display_name||'').split(', ');return{lat:+o.lat,lng:+o.lon,name:o.name||p[0],sub:p.slice(1,3).join(', ')};}));})
        .catch(()=>fetch('https://photon.komoot.io/api/?limit=8&lang=default&lat='+c.lat.toFixed(3)+'&lon='+c.lng.toFixed(3)+'&q='+encodeURIComponent(s))
          .then(r=>r.json()).then(d=>show((d.features||[]).map(f=>{const p=f.properties||{};
            return{lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0],name:p.name||p.street||'—',sub:[p.city,p.country].filter(Boolean).join(', ')};})))
          .catch(()=>show([])));};
    q.addEventListener('input',()=>{clearTimeout(tm);tm=setTimeout(()=>run(q.value.trim()),400);});
    q.addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(tm);run(q.value.trim());}});
  }
};

/* ═══ ПРИЛОЖЕНИЕ ═══ */
const APP={started:false,
  init(){
    RADAR.init();MAPV.init();CAMS.init();SND.ui();SUN.update();setInterval(()=>SUN.update(),300000);
    // порядок важен: сначала прогресс по маршруту, потом камеры (им нужен свежий along), потом лимит
    GEO.subs.push(f=>{NAV.update(f);CAMS.onFix(f);LIMIT.onFix(f);TRIP.fix(f);this.dash(f);if(document.body.dataset.view==='map'&&NAV.on)MAPV.ui();});
    this.ui();
    if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
  },
  start(){
    if(this.started)return;this.started=true;$('start').classList.add('hidden');
    SND.unlock();COMP.request();GEO.start();SND.play('start');
    // маршрут, прерванный закрытием страницы, продолжаем (до 6 часов)
    const sv=U.get('lite-nav',null);
    if(sv&&sv.dest&&Date.now()-sv.t<6*36e5){
      const go=()=>{MAPV.mode=sv.mode||'car';MAPV.setDest(sv.dest,false,true);MAPV.plan(()=>{NAV.start();U.toast('▶ Продолжаю маршрут');});};
      if(GEO.last)go();else{const once=()=>{GEO.subs.splice(GEO.subs.indexOf(once),1);go();};GEO.subs.push(once);}
    }
  },
  heading(){return GEO.spd>2.5&&GEO.head!=null?GEO.head:(COMP.head!=null?COMP.head:GEO.head);},
  openMap(){document.body.dataset.view='map';MAPV.open();SND.play('ui');},
  closeMap(){document.body.dataset.view='radar';$('sres').classList.add('hidden');
    setTimeout(()=>{RADAR.map.invalidateSize();RADAR._size();RADAR.dirty=true;},30);},
  ui(){const b=$('b-go');if(!b)return;
    if(NAV.on){b.className='gbtn red';b.innerHTML='<span class="e">✕</span>СТОП';b.onclick=()=>NAV.stop();}
    else{b.className='gbtn yel';b.innerHTML='<span class="e">🗺️</span>КУДА?';b.onclick=()=>APP.openMap();}
    const h=$('radar-hint');if(h)h.textContent=NAV.on?'нажми · карта маршрута':'нажми · открыть карту';},
  // спидометр: дуга до 160 км/ч (пешком — до 20), цвет по лимиту
  dash(f){
    const kmh=Math.round(GEO.spd*3.6),e=$('spd');if(e)e.textContent=f.fake?'–':kmh;
    const max=NAV.on&&NAV.mode==='foot'?20:160,arc=$('sp-arc');
    if(arc){arc.setAttribute('stroke-dasharray',U.clamp(kmh/max*100,0,100).toFixed(1)+' 100');
      const L=LIMIT.val,col=!L||kmh<=L?'#34d399':kmh<=L+10?'#fbbf24':'#f43f5e';arc.setAttribute('stroke',col);arc.setAttribute('color',col);}
  },
  // иконка манёвра: стрелка, повёрнутая по типу поворота; круг; финиш
  arrow(st){
    const A={straight:0,'slight right':45,right:90,'sharp right':135,uturn:200,'slight left':-45,left:-90,'sharp left':-135};
    if(st.type==='arrive')return '<text x="0" y="16" font-size="54" text-anchor="middle">🏁</text>';
    if(/roundabout|rotary/.test(st.type)&&st.type.indexOf('exit')<0)
      return '<circle r="24" fill="none" stroke="currentColor" stroke-width="7" style="color:var(--nm)"/>'
        +'<text x="0" y="10" font-size="26" font-family="Orbitron,monospace" font-weight="900" text-anchor="middle" fill="#e2e8f0">'+(st.exit||'')+'</text>';
    let a=A[st.mod];if(a==null)a=/fork|ramp|merge/.test(st.type)?(st.mod&&st.mod.indexOf('left')>=0?-30:30):0;
    const col=NAV.mode==='foot'?'#22d3ee':'#34d399';
    return '<g transform="rotate('+a+')"><path d="M0 -40L26 -8H10V38H-10V-8H-26Z" fill="'+col+'" stroke="#0a0f1e" stroke-width="3" stroke-linejoin="round"/></g>';
  },
  showFinish(s,mode){
    $('f-title').textContent=mode==='foot'?'НА МЕСТЕ':'ФИНИШ';
    $('f-stars').innerHTML=[1,2,3].map(i=>'<span'+(i>s.stars?' class="dim"':'')+'>⭐</span>').join('');
    $('f-note').textContent=s.stars===3?'Чистый заезд — ни одного превышения!':s.stars===2?'Почти идеально':'Камеры видели превышение';
    const st=[['Путь',U.fmtD(s.dist)],['Время',U.fmtT(s.time)],['Средняя',Math.round(s.avg)+' км/ч'],['Макс',Math.round(s.max)+' км/ч']];
    if(mode!=='foot')st.push(['Камер',s.cams],['Превышений',s.over]);
    $('f-stats').innerHTML=st.map(x=>'<div><b>'+U.esc(x[1])+'</b><span>'+x[0]+'</span></div>').join('');
    $('finish').classList.remove('hidden');
    const cols=['#a855f7','#ec4899','#22d3ee','#34d399','#fbbf24'];
    for(let i=0;i<36;i++){const c=document.createElement('div');c.className='confetti';
      c.style.cssText='left:'+Math.random()*100+'vw;background:'+cols[i%5]+';color:'+cols[i%5]+';animation-duration:'+(1.8+Math.random()*1.6)+'s;animation-delay:'+Math.random()*.5+'s';
      document.body.appendChild(c);setTimeout(()=>c.remove(),4200);}
  },
  closeFinish(){$('finish').classList.add('hidden');SND.play('ui');}
};

APP.init();
