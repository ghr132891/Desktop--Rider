'use strict';
// 萌版人物 (desktop mascot) shared by the web preview (modules/mascot.js) and the Windows client's mascot window
// (client/windows/mascot.html). No dependencies; exposes window.MascotView (and module.exports in Node for tests).
//
// buildRig(cutout, opts)  — turns the person cut out of the wallpaper into a two-part paper doll: head (with hair)
//                            and body, split at the neck (face box from MediaPipe when given, alpha-profile heuristic
//                            otherwise), then recomposed with chibi proportions: big head, small squashed body.
// create(root)            — the live character: idle breathing / bobbing, blink + blush + mouth stickers placed from the
//                            face keypoints, moods, emotes (happy, love/pat, angry, cheer, surprise, shy, sleep, dizzy,
//                            dance, sing), particles, a speech bubble, pointer interactions (tap, double tap, hold = pat,
//                            drag = carried, rapid taps = angry) and music reaction (sway to the beat, sing the lyric).
// Every behaviour is also reachable as a JSON command — view.command({type:'emote',name:'happy'}) — and every
// interaction is reported through view.on(cb), which is the hook for an external AI (docs/mascot-api.md).
(function(){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
 const nowS=()=>performance.now()/1000;
 // ---- rig ----
 function alphaRows(ctx,w,h){const d=ctx.getImageData(0,0,w,h).data,rows=[];let top=-1,bottom=-1,left=w,right=-1;
  for(let y=0;y<h;y++){let n=0,l=w,r=-1;for(let x=0;x<w;x++){if(d[(y*w+x)*4+3]>40){n++;if(x<l)l=x;if(x>r)r=x;}}rows.push({n,l,r});if(n){if(top<0)top=y;bottom=y;if(l<left)left=l;if(r>right)right=r;}}
  return {rows,top,bottom,left,right};}
 // Where the head ends: the chin from the face box when we have one, else the narrowest row (neck) under the first
 // width peak (the head) in the upper part of the figure.
 function headBottom(prof,h,face){if(face&&face.box){return clamp(Math.round((face.box.y+face.box.h*1.22)*h),prof.top+8,prof.bottom-8);}
  const {rows,top,bottom}=prof,span=bottom-top;let peak=top,peakW=0;for(let y=top;y<top+span*.4;y++)if(rows[y].n>peakW){peakW=rows[y].n;peak=y;}
  let neck=-1,neckW=Infinity;for(let y=peak;y<Math.min(bottom,peak+span*.3);y++){if(rows[y].n<neckW){neckW=rows[y].n;neck=y;}}
  if(neck>0&&neckW<peakW*.82)return neck;return Math.round(top+span*.27);}
 function part(src,x0,y0,x1,y1){const c=document.createElement('canvas');c.width=Math.max(1,x1-x0);c.height=Math.max(1,y1-y0);c.getContext('2d').drawImage(src,x0,y0,c.width,c.height,0,0,c.width,c.height);return c;}
 // cutout: canvas/image with alpha. opts: {face:{box:{x,y,w,h},keypoints:[{x,y}…]} normalised to the cutout, headScale, bodyScale, bodySquash}
 function buildRig(cutout,{face=null,headScale=1.7,bodyScale=.78,bodySquash=.72}={}){
  const w=cutout.width||cutout.naturalWidth,h=cutout.height||cutout.naturalHeight,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(cutout,0,0);
  const prof=alphaRows(ctx,w,h);if(prof.top<0)return null;
  const hb=headBottom(prof,h,face),overlap=Math.round((prof.bottom-prof.top)*.03);
  let hl=w,hr=-1;for(let y=prof.top;y<=hb;y++){const r=prof.rows[y];if(r.n){if(r.l<hl)hl=r.l;if(r.r>hr)hr=r.r;}}
  let bl=w,br=-1;for(let y=hb;y<=prof.bottom;y++){const r=prof.rows[y];if(r.n){if(r.l<bl)bl=r.l;if(r.r>br)br=r.r;}}
  if(hr<0||br<0)return null;
  const neckRow=prof.rows[hb],neckX=neckRow.n?(neckRow.l+neckRow.r)/2:(hl+hr)/2;
  const headC=part(c,hl,prof.top,hr+1,hb+overlap),bodyC=part(c,bl,hb-overlap,br+1,prof.bottom+1);
  // Composite: body neck at the origin, head hanging from the same point, then shift to positive coordinates.
  const hs=headScale,bs=bodyScale,sq=bodySquash;
  const head={w:headC.width*hs,h:headC.height*hs,x:-(neckX-hl)*hs,y:-(headC.height-overlap)*hs},body={w:bodyC.width*bs,h:bodyC.height*bs*sq,x:-(neckX-bl)*bs,y:-overlap*bs*sq};
  const minX=Math.min(head.x,body.x),minY=Math.min(head.y,body.y);for(const p of [head,body]){p.x-=minX;p.y-=minY;}
  const width=Math.max(head.x+head.w,body.x+body.w),height=Math.max(head.y+head.h,body.y+body.h);
  // Face landmarks relative to the head part (fractions), for stickers; defaults when no face was found.
  let f={eyes:[{x:.36,y:.52},{x:.64,y:.52}],mouth:{x:.5,y:.74},blush:[{x:.27,y:.64},{x:.73,y:.64}],size:.18,detected:false};
  if(face&&face.keypoints&&face.keypoints.length>=4){const k=face.keypoints.map(p=>({x:(p.x*w-hl)/headC.width,y:(p.y*h-prof.top)/headC.height})),eyeW=Math.hypot(k[1].x-k[0].x,k[1].y-k[0].y);
   f={eyes:[k[0],k[1]],mouth:k[3],blush:[{x:k[0].x-eyeW*.15,y:k[0].y+eyeW*.55},{x:k[1].x+eyeW*.15,y:k[1].y+eyeW*.55}],size:clamp(eyeW*.9,.08,.35),detected:true};}
  return {head:{url:headC.toDataURL('image/png'),...head,pivot:{x:(neckX-hl)*hs,y:(headC.height-overlap)*hs}},body:{url:bodyC.toDataURL('image/png'),...body},width,height,face:f,params:{headScale:hs,bodyScale:bs,bodySquash:sq}};}
 // ---- phrases (overridable through command {type:'phrases'}) ----
 const PHRASES={tap:['嘿！','在呢~','嗯？','戳我干嘛呀'],pat:['好舒服…','再摸摸~','嘿嘿'],angry:['别戳啦！','生气了哦！','哼！'],cheer:['耶——！','太棒了！'],surprise:['哇！','诶？'],shy:['别看我啦…','讨厌~'],sleep:['Zz…','呼…呼…'],wake:['醒啦！','嗯…早'],drag:['哇哇哇——','放我下来~'],drop:['呼——','头好晕'],dance:['这首我会！','一起摇~'],idle:['今天也要加油哦','在想什么呢？','要不要听首歌？','……']};
 const FX={heart:'❤',note:'♪',note2:'♫',spark:'✦',anger:'💢',zz:'z',sweat:'💧',ex:'!',q:'?'};
 // ---- view ----
 function create(root){
  root.classList.add('mascot');root.innerHTML='<div class="m-shadow"></div><div class="m-stage"><img class="m-body" alt="" draggable="false"><div class="m-headwrap"><img class="m-head" alt="" draggable="false"><div class="m-face"><i class="m-eye l"></i><i class="m-eye r"></i><i class="m-blush l"></i><i class="m-blush r"></i><i class="m-mouth"></i></div></div><div class="m-fx"></div></div><div class="m-bubble" hidden></div>';
  const q=s=>root.querySelector(s),stage=q('.m-stage'),bodyEl=q('.m-body'),headWrap=q('.m-headwrap'),headEl=q('.m-head'),faceEl=q('.m-face'),fx=q('.m-fx'),bubble=q('.m-bubble'),shadow=q('.m-shadow');
  const view={rig:null,style:{size:220,left:'50%',top:'60%',flip:false,shadow:true,stickers:{blush:true,eyes:false,mouth:false},mouthOffset:{x:0,y:0},interactive:false,bubbleFont:''},
   mood:{happy:.5,energy:.3},emote:null,music:{playing:false,energy:0,line:'',progress:0,word:0},phrases:JSON.parse(JSON.stringify(PHRASES)),listeners:[],lastActive:nowS(),asleep:false,pose:null,
   taps:[],blinkAt:nowS()+rnd(2,5),blink:0,look:{x:0,y:0},drag:null,t0:nowS(),raf:0,idleAt:nowS()+rnd(6,12),beat:0,lastBeat:0};
  const emit=e=>{for(const fn of view.listeners)try{fn(e);}catch{}};
  view.on=fn=>{view.listeners.push(fn);return()=>{view.listeners=view.listeners.filter(f=>f!==fn);};};
  view.setRig=rig=>{view.rig=rig;if(!rig){root.hidden=true;return;}root.hidden=false;bodyEl.src=rig.body.url;headEl.src=rig.head.url;view.layout();};
  view.setStyle=st=>{Object.assign(view.style,st);if(st.stickers)view.style.stickers={...view.style.stickers,...st.stickers};view.layout();};
  view.layout=()=>{const st=view.style,rig=view.rig;Object.assign(root.style,{left:st.left,top:st.top});root.classList.toggle('shadow',st.shadow!==false);root.classList.toggle('interactive',!!st.interactive);root.style.setProperty('--m-font',st.bubbleFont||'inherit');
   if(!rig)return;const k=st.size/rig.height;stage.style.width=rig.width*k+'px';stage.style.height=st.size+'px';stage.style.setProperty('--flip',st.flip?-1:1);
   Object.assign(bodyEl.style,{left:rig.body.x*k+'px',top:rig.body.y*k+'px',width:rig.body.w*k+'px',height:rig.body.h*k+'px'});
   Object.assign(headWrap.style,{left:rig.head.x*k+'px',top:rig.head.y*k+'px',width:rig.head.w*k+'px',height:rig.head.h*k+'px',transformOrigin:`${rig.head.pivot.x*k}px ${rig.head.pivot.y*k}px`});
   const f=rig.face,fs=f.size*rig.head.w*k,m=st.mouthOffset||{x:0,y:0};faceEl.style.setProperty('--fs',fs+'px');
   [['.m-eye.l',f.eyes[0]],['.m-eye.r',f.eyes[1]],['.m-blush.l',f.blush[0]],['.m-blush.r',f.blush[1]]].forEach(([sel,p])=>{const el=q(sel);el.style.left=p.x*100+'%';el.style.top=p.y*100+'%';});
   const mo=q('.m-mouth');mo.style.left=(f.mouth.x+m.x)*100+'%';mo.style.top=(f.mouth.y+m.y)*100+'%';
   faceEl.classList.toggle('eyes',!!st.stickers.eyes);faceEl.classList.toggle('blush',!!st.stickers.blush);faceEl.classList.toggle('mouth',!!st.stickers.mouth);shadow.style.width=rig.body.w*k*.9+'px';};
  // ---- speech ----
  let sayTimer=0;view.say=(text,ms=2600)=>{clearTimeout(sayTimer);if(!text){bubble.hidden=true;return;}bubble.textContent=text;bubble.hidden=false;bubble.classList.remove('pop');void bubble.offsetWidth;bubble.classList.add('pop');sayTimer=setTimeout(()=>{bubble.hidden=true;},ms);};
  const phrase=key=>{const list=view.phrases[key];return list&&list.length?pick(list):'';};
  // ---- particles ----
  view.spawn=(kind,n=1,opts={})=>{for(let i=0;i<n;i++){const el=document.createElement('span');el.className='m-p '+kind;el.textContent=FX[kind]||'';el.style.left=(opts.x??rnd(25,75))+'%';el.style.top=(opts.y??rnd(5,40))+'%';el.style.setProperty('--dx',rnd(-40,40)+'px');el.style.setProperty('--dur',rnd(.9,1.6)+'s');el.style.animationDelay=(i*.08)+'s';fx.append(el);setTimeout(()=>el.remove(),2200);}};
  // ---- emotes: name → duration and what starts with it ----
  const EMOTES={happy:{ms:900,fx:['spark',3]},love:{ms:1600,fx:['heart',4]},angry:{ms:1400,fx:['anger',2]},cheer:{ms:1500,fx:['spark',5]},surprise:{ms:900,fx:['ex',1]},shy:{ms:1500,fx:['heart',1]},sleep:{ms:1e9,fx:['zz',1]},dizzy:{ms:1800,fx:['sweat',2]},dance:{ms:6000,fx:['note',3]},sing:{ms:1200,fx:['note2',1]},wave:{ms:1200},think:{ms:1800,fx:['q',1]},stretch:{ms:1400}};
  view.doEmote=(name,ms,{silent=false}={})=>{const def=EMOTES[name];if(!def)return false;if(name!=='sleep'&&view.asleep)view.wake();view.emote={name,t0:nowS(),until:nowS()+(ms??def.ms)/1000};root.dataset.emote=name;
   if(def.fx)view.spawn(def.fx[0],def.fx[1]);if(!silent){const text=phrase(name==='love'?'pat':name);if(text)view.say(text);}if(name==='sleep')view.asleep=true;emit({type:'emote',name});return true;};
  view.wake=()=>{if(!view.asleep)return;view.asleep=false;view.emote=null;delete root.dataset.emote;view.say(phrase('wake'));emit({type:'wake'});};
  view.setMood=({happy,energy}={})=>{if(typeof happy==='number')view.mood.happy=clamp(happy,0,1);if(typeof energy==='number')view.mood.energy=clamp(energy,0,1);root.style.setProperty('--happy',view.mood.happy.toFixed(2));};
  // Music from the lyrics clock: {playing, energy 0–1, line, progress 0–1 of the line, word index}
  view.setMusic=m=>{const was=view.music.playing;Object.assign(view.music,m||{});if(view.music.playing&&!was){view.lastActive=nowS();if(view.asleep)view.wake();if(view.music.energy>.5)view.doEmote('dance',4000);emit({type:'music',playing:true});}if(!view.music.playing&&was)emit({type:'music',playing:false});
   if(m&&typeof m.line==='string'&&m.line&&m.line!==view.lastLine){view.lastLine=m.line;if(view.music.playing&&view.style.singBubble!==false)view.say(m.line,3200);}};
  // Fine-grained pose for an external driver: {head:{rot,y},body:{rot,x},ms} overrides the idle motion for `ms`.
  view.setPose=p=>{view.pose=p?{...p,until:nowS()+(p.ms??1500)/1000}:null;};
  // ---- JSON commands (the external AI hook) ----
  view.command=cmd=>{if(!cmd||typeof cmd!=='object')return {ok:false,error:'command must be an object'};
   switch(cmd.type){
    case 'emote':return {ok:view.doEmote(String(cmd.name||''),cmd.ms,{silent:cmd.silent===true})};
    case 'say':view.say(String(cmd.text||'').slice(0,80),cmd.ms);return {ok:true};
    case 'mood':view.setMood(cmd);return {ok:true,mood:view.mood};
    case 'music':view.setMusic(cmd);return {ok:true};
    case 'pose':view.setPose(cmd);return {ok:true};
    case 'move':if(cmd.left!==undefined)view.style.left=typeof cmd.left==='number'?cmd.left+'px':String(cmd.left);if(cmd.top!==undefined)view.style.top=typeof cmd.top==='number'?cmd.top+'px':String(cmd.top);view.layout();return {ok:true};
    case 'style':view.setStyle(cmd.patch||{});return {ok:true};
    case 'phrases':for(const [k,v] of Object.entries(cmd.phrases||{}))if(Array.isArray(v))view.phrases[k]=v.map(String).slice(0,20);return {ok:true};
    case 'wake':view.wake();return {ok:true};
    case 'state':return {ok:true,state:view.state()};
    default:return {ok:false,error:'unknown command type: '+cmd.type};}};
  view.state=()=>({mood:{...view.mood},emote:view.emote?.name||null,asleep:view.asleep,music:{...view.music},size:view.style.size,left:view.style.left,top:view.style.top,rig:!!view.rig,face:view.rig?view.rig.face.detected:false});
  // ---- interaction ----
  const onHead=e=>{const r=headWrap.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;};
  let press=null,pressTimer=0;
  root.addEventListener('pointerdown',e=>{if(!view.style.interactive||e.button!==0)return;e.preventDefault();root.setPointerCapture(e.pointerId);view.lastActive=nowS();if(view.asleep)view.wake();
   press={id:e.pointerId,x:e.clientX,y:e.clientY,head:onHead(e),moved:false,t:nowS()};clearTimeout(pressTimer);
   pressTimer=setTimeout(()=>{if(press&&!press.moved&&press.head){press.pat=true;view.doEmote('love');emit({type:'pat'});}},550);});
  root.addEventListener('pointermove',e=>{if(view.style.interactive){const r=headWrap.getBoundingClientRect();if(r.width){view.look.x=clamp((e.clientX-(r.left+r.width/2))/r.width,-1,1);view.look.y=clamp((e.clientY-(r.top+r.height/2))/r.height,-1,1);view.lookUntil=nowS()+1.5;}}
   if(press?.id!==e.pointerId)return;const dx=e.clientX-press.x,dy=e.clientY-press.y;if(!press.moved&&Math.hypot(dx,dy)<6)return;
   if(!press.moved){press.moved=true;clearTimeout(pressTimer);view.drag={x0:press.x,y0:press.y,sx:0,sy:0,vx:0};root.dataset.emote='carried';view.say(phrase('drag'),1500);emit({type:'drag'});}
   const now=nowS();view.drag.vx=lerp(view.drag.vx,(dx-view.drag.sx)/Math.max(.016,now-(view.drag.t||now)),.4);view.drag.t=now;view.drag.sx=dx;view.drag.sy=dy;emit({type:'dragging',dx,dy});});
  const release=e=>{if(press?.id!==e.pointerId)return;clearTimeout(pressTimer);const p=press;press=null;
   if(view.drag){const d=view.drag;view.drag=null;delete root.dataset.emote;emit({type:'drop',dx:d.sx,dy:d.sy});if(Math.abs(d.vx)>900)view.doEmote('dizzy');else view.say(phrase('drop'),1200);return;}
   if(p.pat)return;const t=nowS();view.taps=view.taps.filter(x=>t-x<1.6);view.taps.push(t);
   if(view.taps.length>=4){view.taps=[];view.setMood({happy:view.mood.happy-.25});view.doEmote('angry');emit({type:'angry'});return;}
   view.setMood({happy:view.mood.happy+.08});view.doEmote(p.head?'happy':'surprise');emit({type:'tap',head:p.head});
   // Two taps and then quiet = a double tap (cheer); more taps keep counting towards angry.
   if(view.taps.length===2&&t-view.taps[0]<.4)setTimeout(()=>{if(view.taps.length===2&&nowS()-view.taps[1]>=.35){view.taps=[];view.doEmote('cheer');emit({type:'doubletap'});}},380);};
  root.addEventListener('pointerup',release);root.addEventListener('pointercancel',release);
  // ---- animation loop ----
  const tick=()=>{view.raf=requestAnimationFrame(tick);if(!view.rig||root.hidden)return;const t=nowS()-view.t0,now=nowS(),st=view.style,k=st.size/view.rig.height,mood=view.mood,music=view.music;
   if(view.emote&&now>view.emote.until&&view.emote.name!=='sleep'){view.emote=null;delete root.dataset.emote;}
   if(view.pose&&now>view.pose.until)view.pose=null;
   // Idle behaviour: little acts now and then; a long quiet spell → sleep.
   if(!view.emote&&!view.drag&&!music.playing&&now>view.idleAt){view.idleAt=now+rnd(7,16);if(!view.asleep){if(now-view.lastActive>90)view.doEmote('sleep');else{const act=pick(['think','stretch','wave','say','say']);if(act==='say')view.say(phrase('idle'));else view.doEmote(act,undefined,{silent:true});emit({type:'idle',act});}}}
   if(now>view.blinkAt){view.blink=1;view.blinkAt=now+rnd(2.5,6);}if(view.blink>0)view.blink=Math.max(0,view.blink-.12);
   // Base motion
   const energy=music.playing?clamp(music.energy,0,1):0,bps=music.playing?lerp(.9,2.6,energy):0;
   let bodySY=1+.018*Math.sin(t*2*Math.PI/3.4),bodyRot=0,bodyX=0,stageY=0,stageX=0,headY=.02*Math.sin(t*2*Math.PI/2.6),headRot=1.5*Math.sin(t*2*Math.PI/3.1+1),headSX=1,headSY=1,mouth=0,tint=0,eyesClosed=view.asleep?1:view.blink>.5?1:0;
   if(music.playing){const ph=t*bps*Math.PI;bodyRot=(4+10*energy)*Math.sin(ph);bodyX=(3+6*energy)*Math.sin(ph)*k;headRot+=(6+10*energy)*Math.sin(ph+.6);headY+=.04*(1+energy)*Math.abs(Math.sin(ph));stageY=-(.02+.05*energy)*Math.abs(Math.sin(ph))*st.size;
    const beat=Math.floor(t*bps);if(beat!==view.lastBeat){view.lastBeat=beat;if(energy>.35&&Math.random()<.5)view.spawn(Math.random()<.5?'note':'note2',1,{x:rnd(60,95),y:rnd(0,30)});}
    if(music.line){mouth=.35+.65*Math.abs(Math.sin(t*Math.PI*4.5));}}
   const e=view.emote,et=e?now-e.t0:0;
   if(e)switch(e.name){
    case 'happy':{const u=clamp(et/.9,0,1);stageY-=Math.sin(u*Math.PI)*st.size*.14;headSY=1+.08*Math.sin(u*Math.PI*2);break;}
    case 'cheer':{const u=(et%.75)/.75;stageY-=Math.sin(u*Math.PI)*st.size*.18;headRot+=10*Math.sin(et*9);break;}
    case 'love':{headSY=.9+.03*Math.sin(et*12);headSX=1.06;headRot+=5*Math.sin(et*3);eyesClosed=1;tint=.4;break;}
    case 'angry':{stageX=Math.sin(et*55)*st.size*.03;headRot+=4*Math.sin(et*40);tint=-.6;bodySY=1.03;break;}
    case 'surprise':{headSY=1.1-et*.1;stageY-=Math.max(0,.08-et*.1)*st.size;break;}
    case 'shy':{headRot+=18*Math.sin(Math.min(et*3,Math.PI/2));tint=.5;bodyRot+=6;break;}
    case 'sleep':{bodySY=1+.03*Math.sin(t*2*Math.PI/4.5);headRot+=12;headY+=.06;if(Math.random()<.01)view.spawn('zz',1,{x:70,y:10});break;}
    case 'dizzy':{headRot+=25*Math.sin(et*7)*Math.max(0,1-et/1.8);headY+=.03;break;}
    case 'dance':{const ph=et*Math.PI*2.2;bodyRot+=12*Math.sin(ph);bodyX+=8*Math.sin(ph)*k;stageY-=.05*Math.abs(Math.sin(ph))*st.size;headRot+=12*Math.sin(ph+.5);break;}
    case 'sing':{mouth=.4+.6*Math.abs(Math.sin(et*14));headRot+=4*Math.sin(et*5);break;}
    case 'wave':{bodyRot+=6*Math.sin(et*8);headRot+=8*Math.sin(et*8+1);break;}
    case 'think':{headRot+=14;headY-=.02;break;}
    case 'stretch':{bodySY=1+.1*Math.sin(Math.min(et*2.5,Math.PI));headY-=.05*Math.sin(Math.min(et*2.5,Math.PI));break;}
   }
   if(view.drag){const d=view.drag;if(!st.externalDrag){stageX=d.sx;stageY=d.sy;}bodyRot+=clamp(-d.vx/60,-25,25);headRot+=clamp(-d.vx/90,-15,15);root.dataset.emote='carried';} // externalDrag: the host moves its window instead
   else if(view.lookUntil&&now<view.lookUntil&&!e){headRot+=view.look.x*6;headY+=view.look.y*.02;}
   if(view.pose){const p=view.pose;if(p.head){headRot=p.head.rot??headRot;headY=p.head.y??headY;}if(p.body){bodyRot=p.body.rot??bodyRot;bodyX=p.body.x??bodyX;}}
   stage.style.transform=`translate(${stageX}px,${stageY}px) scaleX(var(--flip,1))`;
   bodyEl.style.transform=`translateX(${bodyX}px) rotate(${bodyRot*.4}deg) scaleY(${bodySY})`;
   headWrap.style.transform=`translate(${bodyX*.6}px,${headY*st.size}px) rotate(${headRot}deg) scale(${headSX},${headSY})`;
   root.style.setProperty('--mouth',mouth.toFixed(2));root.style.setProperty('--eyes',eyesClosed?'1':'0');root.style.setProperty('--tint',tint.toFixed(2));root.style.setProperty('--happy',mood.happy.toFixed(2));
   shadow.style.transform=`translateX(-50%) scale(${1-Math.min(.4,-stageY/st.size)})`;shadow.style.opacity=String(.35-Math.min(.25,-stageY/st.size));
   // Moods drift back to neutral.
   mood.happy=lerp(mood.happy,.5,.0008);mood.energy=lerp(mood.energy,music.playing?energy:.3,.01);};
  view.raf=requestAnimationFrame(tick);
  view.destroy=()=>{cancelAnimationFrame(view.raf);clearTimeout(sayTimer);clearTimeout(pressTimer);root.replaceChildren();};
  return view;}
 const MascotView={buildRig,create,PHRASES,FX};
 if(typeof module!=='undefined'&&module.exports)module.exports=MascotView;if(typeof window!=='undefined')window.MascotView=MascotView;
})();
