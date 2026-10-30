'use strict';
// 萌版人物: the person cut out of the wallpaper, rebuilt as a big-headed little character that lives above the
// desktop. Rig and behaviour come from the shared renderer mascot-view.js (face found with MediaPipe BlazeFace for
// sticker placement); this module owns the state, the panel, the preview (draggable in its own view) and the payload
// the Windows client turns into an always-on-top mascot window. It reacts to the 桌面歌词 clock (sways to the beat,
// sings the line) and exposes Rider.api.mascot — the in-page half of the external-AI hook (docs/mascot-api.md).
const MascotModule={
 id:'mascot',name:'萌版人物',order:240,
 defaults:{enabled:false,x:84,y:92,size:30,headScale:1.7,bodyScale:.78,bodySquash:.72,flip:false,shadow:true,blush:true,eyes:false,mouth:false,mouthX:0,mouthY:0,reactMusic:true,singBubble:true,idle:true,onTop:true},
 normalize(m,{clamp,defaults:d}){return {enabled:m.enabled===true,x:clamp(m.x,0,100,d.x),y:clamp(m.y,0,100,d.y),size:clamp(m.size,8,80,d.size),headScale:clamp(m.headScale,1,2.6,d.headScale),bodyScale:clamp(m.bodyScale,.4,1.2,d.bodyScale),bodySquash:clamp(m.bodySquash,.4,1,d.bodySquash),
  flip:m.flip===true,shadow:m.shadow!==false,blush:m.blush!==false,eyes:m.eyes===true,mouth:m.mouth===true,mouthX:clamp(m.mouthX,-.3,.3,0),mouthY:clamp(m.mouthY,-.3,.3,0),reactMusic:m.reactMusic!==false,singBubble:m.singBubble!==false,idle:m.idle!==false,onTop:m.onTop!==false};},
 view:{label:'萌版人物',icon:'face',title:'把壁纸里的人物变成桌面上的小伙伴。',description:'用抠出来的人物做一个大头小身的萌版角色，悬浮在桌面上：会呼吸、眨眼、发呆、睡着；戳一下开心、连戳会生气、按住摸头会害羞；听到歌词会跟着节奏摇摆、唱出当前句。外部 AI 可以通过接口精细控制它。',inspectorTitle:'人物设置'},
 rigKey:'',rig:null,rigError:'',building:false,face:null,log:[],
 mount({panel,layer,api}){this.api=api;
  panel.innerHTML=`<p class="inspector-description">需要先有抠出来的人物（人物悬浮里选过的区域，或自动识别）。小人物在预览里可以拖动，桌面上则由客户端做成置顶的小窗口。</p>
<div class="control-section"><div class="switch-row"><div><label for="mc-enabled">显示萌版人物</label><small>关闭后预览与桌面都不显示</small></div><input type="checkbox" id="mc-enabled" class="switch"></div><p id="mc-status" class="field-hint" role="status"></p></div>
<details class="shape-options" id="mc-shape" open><summary>体型</summary>
<div class="slider-control"><div class="control-label"><label for="mc-size">大小</label><output id="mc-size-value">30%</output></div><input id="mc-size" type="range" min="8" max="80" step="1" value="30"><div class="range-labels"><span>画面高度 8%</span><span>80%</span></div></div>
<div class="slider-control"><div class="control-label"><label for="mc-head">头的比例</label><output id="mc-head-value">1.7×</output></div><input id="mc-head" type="range" min="1" max="2.6" step=".05" value="1.7"></div>
<div class="slider-control"><div class="control-label"><label for="mc-body">身体大小</label><output id="mc-body-value">0.78×</output></div><input id="mc-body" type="range" min=".4" max="1.2" step=".02" value=".78"></div>
<div class="slider-control"><div class="control-label"><label for="mc-squash">身体压扁</label><output id="mc-squash-value">0.72×</output></div><input id="mc-squash" type="range" min=".4" max="1" step=".02" value=".72"></div>
<div class="switch-row"><div><label for="mc-flip">左右翻转</label></div><input type="checkbox" id="mc-flip" class="switch"></div>
<div class="switch-row"><div><label for="mc-shadow">脚下阴影</label></div><input type="checkbox" id="mc-shadow" class="switch" checked></div></details>
<details class="shape-options" id="mc-face" open><summary>表情贴纸</summary>
<div class="switch-row"><div><label for="mc-blush">腮红</label><small>害羞、被摸头时会更红</small></div><input type="checkbox" id="mc-blush" class="switch" checked></div>
<div class="switch-row"><div><label for="mc-eyes">卡通眼睛</label><small>会眨眼、睡觉时闭上；需要识别到脸才贴得准</small></div><input type="checkbox" id="mc-eyes" class="switch"></div>
<div class="switch-row"><div><label for="mc-mouth">嘴型</label><small>唱歌时跟着张合</small></div><input type="checkbox" id="mc-mouth" class="switch"></div>
<div class="slider-control mc-mouth-only"><div class="control-label"><label for="mc-mouth-x">嘴左右</label><output id="mc-mouth-x-value">0</output></div><input id="mc-mouth-x" type="range" min="-.3" max=".3" step=".01" value="0"></div>
<div class="slider-control mc-mouth-only"><div class="control-label"><label for="mc-mouth-y">嘴上下</label><output id="mc-mouth-y-value">0</output></div><input id="mc-mouth-y" type="range" min="-.3" max=".3" step=".01" value="0"></div></details>
<details class="shape-options" id="mc-behave" open><summary>行为</summary>
<div class="switch-row"><div><label for="mc-music">跟着音乐动</label><small>有歌词在播时摇摆、唱出当前句；越快的歌摇得越欢</small></div><input type="checkbox" id="mc-music" class="switch" checked></div>
<div class="switch-row"><div><label for="mc-sing">唱歌气泡</label><small>把当前句显示在头顶的气泡里</small></div><input type="checkbox" id="mc-sing" class="switch" checked></div>
<div class="switch-row"><div><label for="mc-idle">发呆与睡觉</label><small>没人理时偶尔想事情、伸懒腰，久了就睡着</small></div><input type="checkbox" id="mc-idle" class="switch" checked></div>
<div class="switch-row"><div><label for="mc-top">桌面上置顶</label><small>客户端里小人物窗口浮在所有窗口之上</small></div><input type="checkbox" id="mc-top" class="switch" checked></div>
<p class="field-hint">试试：</p><div class="mc-try">${['happy:开心','love:摸头','angry:生气','cheer:欢呼','surprise:惊讶','shy:害羞','dance:跳舞','sleep:睡觉','wake:醒来','think:思考'].map(x=>{const [k,l]=x.split(':');return `<button class="text-button" data-emote="${k}">${l}</button>`;}).join('')}</div>
<div class="inline-form"><input id="mc-say" maxlength="80" placeholder="让它说一句话…"><button class="button secondary" id="mc-say-go">说</button></div>
<p class="field-hint">在预览里：点一下开心，双击欢呼，按住头 0.5 秒摸头，连戳四下生气，拖着走会晃。外部 AI 接口见 docs/mascot-api.md。</p>
<pre id="mc-log" class="mc-log" aria-live="polite"></pre></details>`;
  const $=q=>panel.querySelector(q),me=()=>api.state.modules.mascot,changed=()=>api.update({custom:false});
  const bind=(id,key,read)=>{const el=$(id);el.addEventListener(el.type==='checkbox'?'change':'input',e=>{me()[key]=read?read(e.target):Number(e.target.value);changed();});};
  bind('#mc-enabled','enabled',t=>t.checked);bind('#mc-size','size');bind('#mc-head','headScale');bind('#mc-body','bodyScale');bind('#mc-squash','bodySquash');bind('#mc-flip','flip',t=>t.checked);bind('#mc-shadow','shadow',t=>t.checked);
  bind('#mc-blush','blush',t=>t.checked);bind('#mc-eyes','eyes',t=>t.checked);bind('#mc-mouth','mouth',t=>t.checked);bind('#mc-mouth-x','mouthX');bind('#mc-mouth-y','mouthY');bind('#mc-music','reactMusic',t=>t.checked);bind('#mc-sing','singBubble',t=>t.checked);bind('#mc-idle','idle',t=>t.checked);bind('#mc-top','onTop',t=>t.checked);
  panel.querySelector('.mc-try').addEventListener('click',e=>{const b=e.target.closest('[data-emote]');if(!b)return;this.command(b.dataset.emote==='wake'?{type:'wake'}:{type:'emote',name:b.dataset.emote});});
  $('#mc-say-go').addEventListener('click',()=>{const t=$('#mc-say').value.trim();if(t){this.command({type:'say',text:t});$('#mc-say').value='';}});
  $('#mc-say').addEventListener('keydown',e=>{if(e.key==='Enter')$('#mc-say-go').click();});
  const root=document.createElement('div');root.hidden=true;layer.append(root);this.root=root;this.layer=layer;this.mv=MascotView.create(root);
  this.mv.on(ev=>{this.log.unshift(`${new Date().toLocaleTimeString('zh-CN',{hour12:false})} ${ev.type}${ev.name?' '+ev.name:''}${ev.act?' '+ev.act:''}`);this.log=this.log.slice(0,6);const el=panel.querySelector('#mc-log');if(el)el.textContent=this.log.join('\n');
   if(ev.type==='drop'){const b=api.desktop().getBoundingClientRect(),m=me();m.x=Math.max(0,Math.min(100,Math.round((m.x+ev.dx/b.width*100)*10)/10));m.y=Math.max(0,Math.min(100,Math.round((m.y+ev.dy/b.height*100)*10)/10));changed();}
   for(const fn of this.listeners)try{fn(ev);}catch{}});
  // 桌面歌词 clock → music reaction (modules/lyrics.js emits this every frame while it plays).
  Rider.on('lyrics',info=>{const m=me();if(!m.enabled||!m.reactMusic)return;this.mv.setMusic({playing:!!info.playing,energy:info.energy??0,line:info.line||'',progress:info.progress??0});});
  // In-page external hook.
  this.listeners=[];api.mascot={command:cmd=>this.command(cmd),on:fn=>{this.listeners.push(fn);return()=>{this.listeners=this.listeners.filter(f=>f!==fn);};},state:()=>this.mv.state(),rig:()=>this.rig};
  this.onView({view:api.view,api});
 },
 command(cmd){return this.mv.command(cmd);},
 clientInfo:null,setClientInfo(info){this.clientInfo=info&&info.url?info:null;const panel=document.querySelector('#module-mascot');if(panel&&this.api)this.sync({s:this.api.state,panel});},
 onView({view,api}){const editing=view==='mascot';api.desktop().classList.toggle('mascot-editing',editing);if(this.layer)this.layer.style.zIndex=editing?'35':'18';this.mv.setStyle({interactive:editing});},
 sync({s,panel}){const m=s.modules.mascot,q=sel=>panel.querySelector(sel),set=(sel,v)=>{const el=q(sel);if(document.activeElement!==el)el.value=v;};
  q('#mc-enabled').checked=m.enabled;set('#mc-size',m.size);q('#mc-size-value').textContent=m.size+'%';set('#mc-head',m.headScale);q('#mc-head-value').textContent=m.headScale.toFixed(2).replace(/0$/,'')+'×';set('#mc-body',m.bodyScale);q('#mc-body-value').textContent=m.bodyScale.toFixed(2)+'×';set('#mc-squash',m.bodySquash);q('#mc-squash-value').textContent=m.bodySquash.toFixed(2)+'×';
  q('#mc-flip').checked=m.flip;q('#mc-shadow').checked=m.shadow;q('#mc-blush').checked=m.blush;q('#mc-eyes').checked=m.eyes;q('#mc-mouth').checked=m.mouth;panel.querySelectorAll('.mc-mouth-only').forEach(el=>el.hidden=!m.mouth);set('#mc-mouth-x',m.mouthX);q('#mc-mouth-x-value').textContent=m.mouthX.toFixed(2);set('#mc-mouth-y',m.mouthY);q('#mc-mouth-y-value').textContent=m.mouthY.toFixed(2);
  q('#mc-music').checked=m.reactMusic;q('#mc-sing').checked=m.singBubble;q('#mc-idle').checked=m.idle;q('#mc-top').checked=m.onTop;
  q('#mc-status').textContent=(this.rigError?this.rigError:this.building?'正在抠出人物并识别面部…':this.rig?(this.rig.face.detected?'已生成萌版人物，识别到面部，贴纸按五官位置摆放':'已生成萌版人物；没识别到面部，贴纸按估计位置摆放'):m.enabled?'等待人物…':'打开后会用壁纸里的人物生成')+(this.clientInfo?` · 外部 AI 接口：${this.clientInfo.url}/api/mascot/… 令牌 ${this.clientInfo.token}`:'');},
 // ---- rig from the cut-out person (cached by picture + points + proportions) ----
 async ensureRig(s){const m=s.modules.mascot,src=this.api.source(s),key=[src.length,src.slice(-64),JSON.stringify(s.floatPoints||[]),m.headScale,m.bodyScale,m.bodySquash].join('|');if(key===this.rigKey)return;this.rigKey=key;this.rig=null;this.rigError='';this.building=true;this.api.update({custom:false});
  try{const img=await this.api.loadImage(src);let points=Array.isArray(s.floatPoints)&&s.floatPoints.length?s.floatPoints:null;if(!points){const p=await Cutout.autoPoint(img);points=p?[p]:[];}
   const cut=await Cutout.separate(img,src,points);if(cut.empty)throw new Error('没有抠出人物：先在「人物悬浮」里选一下人物');
   let face=null;try{const faces=await Portrait.detectFace(await createImageBitmap(cut.cutout));face=(Array.isArray(faces)?faces:faces?.faces||[]).sort((a,b)=>(b.score||0)-(a.score||0))[0]||null;}catch{}
   const rig=MascotView.buildRig(cut.cutout,{face,headScale:m.headScale,bodyScale:m.bodyScale,bodySquash:m.bodySquash});if(!rig)throw new Error('人物太小，无法生成');
   if(this.rigKey!==key)return;this.rig=rig;this.face=face;}
  catch(error){if(this.rigKey!==key)return;this.rigError=error.message||'生成失败';}
  finally{if(this.rigKey===key){this.building=false;this.api.scheduleRender();this.api.update({custom:false});}}},
 viewStyle(m,w,h,px){return {left:px?m.x/100*w+'px':m.x+'%',top:px?m.y/100*h+'px':m.y+'%',size:m.size/100*h,flip:m.flip,shadow:m.shadow,stickers:{blush:m.blush,eyes:m.eyes,mouth:m.mouth},mouthOffset:{x:m.mouthX,y:m.mouthY},singBubble:m.singBubble,idle:m.idle,reactMusic:m.reactMusic,onTop:m.onTop};},
 render({s,w,h}){const m=s.modules.mascot;this.root.hidden=!m.enabled;if(!m.enabled)return;this.ensureRig(s);
  this.mv.setStyle(this.viewStyle(m,w,h,false));if(this.mv.rig!==this.rig)this.mv.setRig(this.rig);this.mv.idleEnabled=m.idle;if(!m.idle)this.mv.idleAt=Infinity;else if(this.mv.idleAt===Infinity)this.mv.idleAt=performance.now()/1000+8;},
 // ---- export: the character in its resting pose on the overlay PNG ----
 async draw({ctx,s,w,h}){const m=s.modules.mascot;if(!m.enabled||!this.rig)return;const rig=this.rig,k=m.size/100*h/rig.height,x0=m.x/100*w-rig.width*k/2,y0=m.y/100*h-m.size/100*h;
  const img=src=>new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src;});const [head,body]=await Promise.all([img(rig.head.url),img(rig.body.url)]);
  ctx.save();if(m.flip){ctx.translate(x0*2+rig.width*k,0);ctx.scale(-1,1);}
  if(m.shadow){ctx.save();ctx.globalAlpha=.3;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(x0+rig.width*k/2,y0+m.size/100*h,rig.body.w*k*.45,rig.body.w*k*.06,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  if(body)ctx.drawImage(body,x0+rig.body.x*k,y0+rig.body.y*k,rig.body.w*k,rig.body.h*k);if(head)ctx.drawImage(head,x0+rig.head.x*k,y0+rig.head.y*k,rig.head.w*k,rig.head.h*k);
  if(m.blush){const f=rig.face,fs=f.size*rig.head.w*k;ctx.fillStyle='rgba(255,120,140,.3)';for(const b of f.blush){ctx.beginPath();ctx.ellipse(x0+rig.head.x*k+b.x*rig.head.w*k,y0+rig.head.y*k+b.y*rig.head.h*k,fs*.45,fs*.28,0,0,Math.PI*2);ctx.fill();}}
  ctx.restore();},
 // ---- Windows client payload: rig + style in px; the client opens an always-on-top mascot window ----
 exportMascot(s,w,h){const m=s.modules.mascot;if(!m.enabled||!this.rig)return null;return {rig:this.rig,style:this.viewStyle(m,w,h,true),phrases:this.mv.phrases};}
};
Rider.register(MascotModule);
