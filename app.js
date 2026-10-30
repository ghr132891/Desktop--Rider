'use strict';
const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const clone = obj => JSON.parse(JSON.stringify(obj));
const wallpapers = [
  {id:'mountain',name:'山间来信',tone:'雾蓝',src:'assets/mountain.svg'},
  {id:'dusk',name:'日落之后',tone:'暮紫',src:'assets/dusk.svg'},
  {id:'forest',name:'林间慢调',tone:'苔绿',src:'assets/forest.svg'},
  {id:'sand',name:'旷野回声',tone:'沙岩',src:'assets/sand.svg'},
  {id:'portrait',name:'林间人像',tone:'人像实拍',src:'assets/portrait-wallpaper.jpg'}
];
const defaults = {bend:0,wave:0,waveAmp:8,pieces:[{image:null,dx:0,dy:0,zoom:100},{image:null,dx:0,dy:0,zoom:100}],floatPerson:false,floatPoints:[],floatCopies:[copyDefaults()],floatActive:0,floatShadow:true,floatKeepOriginal:false,anchorY:50,sourceRatio:50,focusX:50,focusY:50,protectPerson:false,mode:'diagonal',angle:15,ratio:58,gap:16,gapColor:'#e9eff4',linked:true,aspect:1.6,wallpaper:'mountain',customImage:null,scale:100,showIcons:true,preset:'focus',zones:[{id:'work',name:'工作空间',x:6.5,y:48},{id:'life',name:'日常灵感',x:66,y:24}],items:[{id:'i1',name:'项目文件',kind:'folder',zone:'work'},{id:'i2',name:'设计稿',kind:'image',zone:'work'},{id:'i3',name:'开发工具',kind:'code',zone:'work'},{id:'i4',name:'灵感收藏',kind:'folder',zone:'life'},{id:'i5',name:'我的音乐',kind:'music',zone:'life'},{id:'i6',name:'旅行计划',kind:'file',zone:'life'}]};
defaults.modules=Rider.moduleDefaults(); // one slice per registered module (core.js)
const presets = [
 {id:'focus',name:'专注斜切',desc:'灵感与效率并行',mode:'diagonal',angle:15,ratio:58,gap:16,wallpaper:'mountain'},
 {id:'balance',name:'左右有序',desc:'工作生活，各得其所',mode:'vertical',angle:0,ratio:50,gap:22,wallpaper:'forest'},
 {id:'quiet',name:'纯粹留白',desc:'让注意力回到自己',mode:'single',angle:0,ratio:50,gap:0,wallpaper:'dusk'},
 {id:'freedom',name:'错落之间',desc:'不必循规蹈矩',mode:'diagonal',angle:-25,ratio:47,gap:38,wallpaper:'sand'}
];
const zoneSlot=i=>[[6.5,48],[66,24],[66,56]][i]||[35,35]; // default spot for the i-th zone
function readStorage(key, fallback){try{return JSON.parse(localStorage.getItem(key)) || fallback;}catch{return fallback;}}
function validState(s){return s && ['single','vertical','diagonal'].includes(s.mode) && Array.isArray(s.zones) && s.zones.length>=1 && s.zones.length<=3 && Array.isArray(s.items) && s.items.length<=18 && [s.angle,s.ratio,s.gap,s.scale,s.aspect].every(Number.isFinite) && /^#[0-9a-f]{6}$/i.test(s.gapColor) && wallpapers.some(w=>w.id===s.wallpaper) && (s.customImage===null || /^data:image\/(jpeg|png|webp);base64,/.test(s.customImage));}
function normalizeState(input){const s={...clone(defaults),...input};
 const clamp=(value,min,max,fallback)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
 s.ratio=clamp(s.ratio,1,99,58);s.angle=clamp(s.angle,-80,80,15);s.anchorY=clamp(s.anchorY,1,99,50);s.sourceRatio=clamp(s.sourceRatio,5,95,50);s.focusX=clamp(s.focusX,0,100,50);s.focusY=clamp(s.focusY,0,100,50);s.gap=clamp(s.gap,0,60,16);s.scale=clamp(s.scale,100,160,100);s.bend=clamp(s.bend,-60,60,0);s.wave=Math.round(clamp(s.wave,0,6,0));s.waveAmp=clamp(s.waveAmp,0,20,8);
 // Per-piece picture: its own image (or null = the shared wallpaper), an offset in % of the desktop and an extra zoom.
 const image=v=>typeof v==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(v)?v:null;
 s.pieces=[0,1].map(i=>{const q=Array.isArray(s.pieces)&&s.pieces[i]&&typeof s.pieces[i]==='object'?s.pieces[i]:{};return {image:image(q.image),dx:clamp(q.dx,-100,100,0),dy:clamp(q.dy,-100,100,0),zoom:clamp(q.zoom,50,300,100)};});
 s.protectPerson=typeof input.protectPerson==='boolean'?input.protectPerson:input.wallpaper==='portrait';
 // Zones carry their own desktop position (% of the desktop, top-left corner).
 s.zones=s.zones.map((z,i)=>({id:z.id,name:z.name,x:clamp(z.x,0,71,zoneSlot(i)[0]),y:clamp(z.y,0,92,zoneSlot(i)[1])}));
 s.floatPoints=Array.isArray(s.floatPoints)?s.floatPoints.filter(p=>p&&[p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)).slice(0,24).map(p=>({x:p.x,y:p.y,add:p.add!==false})):[];
 s.floatPerson=s.floatPerson===true&&s.floatPoints.length>0;s.floatShadow=s.floatShadow!==false;s.floatKeepOriginal=s.floatKeepOriginal===true;
 // Copies of the cutout in z-order (last on top); drafts from before copies existed carry one in floatX/Y/Size/Flip.
 const legacy=[{x:s.floatX??null,y:s.floatY??null,size:s.floatSize??null,flip:s.floatFlip===true}],num=(v,min,max)=>v===null||v===undefined?null:clamp(v,min,max,null);
 s.floatCopies=(Array.isArray(s.floatCopies)&&s.floatCopies.length?s.floatCopies:legacy).slice(0,12).filter(c=>c&&typeof c==='object').map(c=>({x:num(c.x,-20,120),y:num(c.y,-20,120),size:num(c.size,10,150),flip:c.flip===true,rotate:clamp(c.rotate,-180,180,0),opacity:clamp(c.opacity,10,100,100),hue:clamp(c.hue,-180,180,0),saturate:clamp(c.saturate,0,200,100),brightness:clamp(c.brightness,50,150,100),glow:clamp(c.glow,0,40,0),glowColor:/^#[0-9a-f]{6}$/i.test(c.glowColor)?c.glowColor.toLowerCase():'#ffffff'}));
 if(!s.floatCopies.length)s.floatCopies=[copyDefaults()];s.floatActive=Number.isInteger(s.floatActive)?Math.max(0,Math.min(s.floatCopies.length-1,s.floatActive)):0;
 delete s.floatX;delete s.floatY;delete s.floatSize;delete s.floatFlip;
 s.modules=Rider.normalizeModules(input.modules,clamp);return s;
}
let draft = readStorage('desktop-rider-draft',null);
let state = validState(draft) ? normalizeState(draft) : clone(defaults);
let saved = readStorage('desktop-rider-schemes',[]);
saved = Array.isArray(saved) ? saved.filter(s=>s && typeof s.id==='string' && typeof s.name==='string' && validState(s.state)) : [];
let pickingSplit=false;
let currentView='design', toastTimer, persistTimer, storageWarning=false;
const imageCache=new Map();
// One floating copy: position / size (null = where the person is in the picture), then its look.
function copyDefaults(){return {x:null,y:null,size:null,flip:false,rotate:0,opacity:100,hue:0,saturate:100,brightness:100,glow:0,glowColor:'#ffffff'};}
const copyTransform=c=>`rotate(${c.rotate||0}deg) scaleX(${c.flip?-1:1})`;
function copyFilter(c,w,shadow){const f=[];if(c.hue)f.push(`hue-rotate(${c.hue}deg)`);if(c.saturate!==100)f.push(`saturate(${c.saturate/100})`);if(c.brightness!==100)f.push(`brightness(${c.brightness/100})`);if(c.glow)f.push(`drop-shadow(0 0 ${c.glow/100*w*.25}px ${c.glowColor})`);if(shadow)f.push(`drop-shadow(0 ${w*.005}px ${w*.006}px #0b182c59)`);return f.join(' ')||'none';}
const noFloat=()=>({floatPerson:false,floatPoints:[],floatCopies:[copyDefaults()],floatActive:0});
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-'+name);svg.append(use);return svg;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function persistNow(){clearTimeout(persistTimer);try{localStorage.setItem('desktop-rider-draft',JSON.stringify(state));}catch{if(!storageWarning){toast('浏览器存储已满，当前修改暂未自动保存');storageWarning=true;}}}
function persistDraft(){clearTimeout(persistTimer);persistTimer=setTimeout(persistNow,250);}
window.addEventListener('pagehide',persistNow);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistNow();});
function source(s=state){return s.customImage || wallpapers.find(w=>w.id===s.wallpaper).src;}
// With the person floating, the wallpaper itself is the hole-filled background.
function floating(s){return s.floatPerson&&s.floatPoints.length>0;}
function sceneKey(s){return floating(s)?source(s)+'#'+JSON.stringify(s.floatPoints):source(s);}
async function scene(s){const img=await loadImage(source(s));if(!floating(s))return {src:source(s),img,cut:null};const cut=await Cutout.separate(img,source(s),s.floatPoints);if(cut.empty)return {src:source(s),img,cut:null};
 // Keep-original: the person stays in the picture and the floating copy is a duplicate, so no fill is shown.
 if(s.floatKeepOriginal)return {src:source(s),img,cut,original:img};return {src:cut.backgroundUrl,img:await loadImage(cut.backgroundUrl),cut,original:img};}
// Where the person sits in the uncut wallpaper: centre and height as % of the desktop.
function activeCopy(s){return s.floatCopies[Math.min(s.floatActive,s.floatCopies.length-1)];}
function floatFrame(s,view,w,h,copy=activeCopy(s)){
 let {x,y,size}=copy;
 if(x===null||y===null||size===null){const p=Portrait.placement({...s,mode:'single'},view.original,w,h),b=view.cut.box;x??=(p.x+(b.x+b.w/2)*p.w)/w*100;y??=(p.y+(b.y+b.h/2)*p.h)/h*100;size??=Math.max(10,Math.min(150,b.h*p.h/h*100));}
 const fh=size/100*h,fw=fh*view.cut.cutout.width/view.cut.cutout.height;return {x,y,size,flip:copy.flip,left:x/100*w-fw/2,top:y/100*h-fh/2,w:fw,h:fh};
}
function drawFloat(ctx,s,view,w,h){if(!view.cut)return;for(const copy of s.floatCopies){const f=floatFrame(s,view,w,h,copy);ctx.save();ctx.globalAlpha=(copy.opacity??100)/100;const filter=copyFilter(copy,w,false);if(filter!=='none')ctx.filter=filter;if(s.floatShadow){ctx.shadowColor='#0b182c59';ctx.shadowBlur=w*.012;ctx.shadowOffsetY=w*.005;}ctx.translate(f.left+f.w/2,f.top+f.h/2);ctx.rotate((copy.rotate||0)*Math.PI/180);if(copy.flip)ctx.scale(-1,1);ctx.drawImage(view.cut.cutout,-f.w/2,-f.h/2,f.w,f.h);ctx.restore();}}
function loadImage(src){if(imageCache.has(src))return imageCache.get(src);const p=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('壁纸读取失败，请重新导入图片'));img.src=src;});imageCache.set(src,p);return p;}
// Clip each rectangle against the split line; all dimensions are based on a 1600px canvas.
function geometry(s,w,h){
 const slope=Math.tan((s.mode==='diagonal'?s.angle:0)*Math.PI/180), normal=Math.hypot(1,slope), gap=s.gap*w/1600;
 const c=s.ratio/100*w+slope*(s.anchorY??50)/100*h;
 function polygon(bound,side){const points=[[0,0],[w,0],[w,h],[0,h]],out=[];
   for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4],da=side*(a[0]+slope*a[1]-bound),db=side*(b[0]+slope*b[1]-bound);if(da<=0)out.push(a);if((da<=0)!==(db<=0)){const t=da/(da-db);const cut=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];cut.cut=true;out.push(cut);}}
   return out;
 }
 const endpoints=[];
 for(const p of [[c,0],[c-slope*h,h],...(Math.abs(slope)>1e-9?[[0,c/slope],[w,(c-w)/slope]]:[])])if(p[0]>=-1e-6&&p[0]<=w+1e-6&&p[1]>=-1e-6&&p[1]<=h+1e-6&&!endpoints.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.01))endpoints.push(p);
 endpoints.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 if(s.mode==='single')return {endpoints,polygons:[[[0,0],[w,0],[w,h],[0,h]],[]]};
 const polygons=[polygon(c-gap/2*normal,1),polygon(c+gap/2*normal,-1)];
 // Curved divider: an arc (bend) and/or a wave replace the straight edge between the two cut points. Points are
 // sampled along the base line and pushed along its normal, so clip-path, canvas clip and the client plan all agree.
 const amp=(s.bend||0)/100*w*.5,wav=(s.wave||0)>0?(s.waveAmp||0)/100*w*.5:0;
 if((amp||wav)&&endpoints.length>=2){
  const [E0,E1]=endpoints,len=Math.hypot(E1[0]-E0[0],E1[1]-E0[1])||1,d=[(E1[0]-E0[0])/len,(E1[1]-E0[1])/len],g=[1/normal,slope/normal];
  const f=t=>amp*Math.sin(Math.PI*t)+wav*Math.sin(2*Math.PI*s.wave*t),proj=p=>((p[0]-E0[0])*d[0]+(p[1]-E0[1])*d[1])/len;
  polygons.forEach((out,i)=>{const cuts=out.map((p,k)=>p.cut?k:-1).filter(k=>k>=0);if(cuts.length!==2)return;
   const adjacent=cuts[1]===cuts[0]+1,first=adjacent?cuts[0]:cuts[1],second=adjacent?cuts[1]:cuts[0],tA=proj(out[first]),tB=proj(out[second]),side=i===0?-gap/2:gap/2,samples=[];
   for(let k=1;k<48;k++){const t=tA+(tB-tA)*k/48,off=f(t)+side;samples.push([Math.max(0,Math.min(w,E0[0]+(E1[0]-E0[0])*t+g[0]*off)),Math.max(0,Math.min(h,E0[1]+(E1[1]-E0[1])*t+g[1]*off))]);}
   if(adjacent)out.splice(first+1,0,...samples);else out.push(...samples);});
 }
 return {endpoints,polygons:polygons.map(poly=>poly.map(p=>[p[0],p[1]]))};
}
// The original desktop crop is split into two source halves. Each half keeps its
// aspect ratio while covering its own polygon. Preview and PNG use this mapping.
function wallpaperPlacement(s,img,w,h,points,index){
 const baseScale=Math.max(w/img.naturalWidth,h/img.naturalHeight)*(s.scale/100);
 const iw=img.naturalWidth*baseScale,ih=img.naturalHeight*baseScale;
 const baseX=(w-iw)*(s.focusX??50)/100,baseY=(h-ih)*(s.focusY??50)/100;
 if(!s.linked||s.mode==='single'||!points.length)return {x:baseX,y:baseY,w:iw,h:ih};
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
 const cut=(s.sourceRatio??50)/100;
 const sourceWidth=w*(index===0?cut:1-cut);
 const fit=Math.max((right-left)/sourceWidth,(bottom-top)/h);
 const sourceCenterX=w*(index===0?cut/2:(1+cut)/2);
 return {x:(left+right)/2+(baseX-sourceCenterX)*fit,
   y:(top+bottom)/2+(baseY-h/2)*fit,w:iw*fit,h:ih*fit};
}
// Per-piece adjustments on top of the shared placement: extra zoom about the centre, then an offset in % of the desktop.
function adjustPiece(p,q,w,h){const z=(q?.zoom??100)/100;return {x:p.x+p.w*(1-z)/2+(q?.dx??0)/100*w,y:p.y+p.h*(1-z)/2+(q?.dy??0)/100*h,w:p.w*z,h:p.h*z};}
function piecePlacement(s,img,w,h,points,index){return adjustPiece(wallpaperPlacement(s,img,w,h,points,index),s.pieces?.[index],w,h);}
// A piece may show its own picture instead of the shared wallpaper (decorative: person detection stays on the shared one).
function pieceImages(s){return Promise.all((s.pieces||[]).map(q=>q.image?loadImage(q.image).catch(()=>null):null));}
let renderSequence=0,portraitFrameSource=null,floatView=null;
function syncSplitGuide(s,w,h,geo){const line=$('#split-guide-line');$('#split-guide').setAttribute('viewBox',`0 0 ${w} ${h}`);if(geo.endpoints.length===2){const [a,b]=geo.endpoints;line.setAttribute('x1',a[0]);line.setAttribute('y1',a[1]);line.setAttribute('x2',b[0]);line.setAttribute('y2',b[1]);}$('#split-guide').hidden=s.mode==='single';}
// Positions every copy from state alone, so dragging skips the wallpaper pipeline.
function placeFloat(){
 const root=$('#float-layers'),desktop=$('#desktop'),w=desktop.clientWidth,h=desktop.clientHeight;
 if(!floatView?.cut||!floating(state)||floatView.key!==sceneKey(state)||!w){root.replaceChildren();$('#float-outline').hidden=true;return null;}
 while(root.children.length>state.floatCopies.length)root.lastElementChild.remove();
 while(root.children.length<state.floatCopies.length){const el=document.createElement('img');el.className='float-person';el.alt='悬浮人物，可拖动；方向键移动，加减号缩放';el.title='拖动移动；滚轮或 +/− 调整大小';el.draggable=false;el.tabIndex=0;root.append(el);}
 let active=null;
 state.floatCopies.forEach((copy,i)=>{const el=root.children[i];if(el.dataset.src!==floatView.cut.cutoutUrl){el.src=floatView.cut.cutoutUrl;el.dataset.src=floatView.cut.cutoutUrl;}el.dataset.index=i;
  const f=floatFrame(state,floatView,w,h,copy);Object.assign(el.style,{left:f.left+'px',top:f.top+'px',width:f.w+'px',height:f.h+'px',zIndex:3+i});el.style.setProperty('--shadow-y',w*.005+'px');el.style.setProperty('--shadow-blur',w*.006+'px');
  el.classList.toggle('flip',copy.flip);el.classList.toggle('shadow',state.floatShadow);el.classList.toggle('active',i===state.floatActive&&state.floatCopies.length>1);el.style.transform=copyTransform(copy);el.style.filter=copyFilter(copy,w,state.floatShadow);el.style.opacity=(copy.opacity??100)/100;if(i===state.floatActive)active=f;});
 const f=active||floatFrame(state,floatView,w,h),n=state.floatCopies.length;
 // Selection outline sits above every copy, so the selected one shows through the ones covering it.
 const outline=$('#float-outline');outline.hidden=false;outline.classList.toggle('single',n<2);Object.assign(outline.style,{left:f.left+'px',top:f.top+'px',width:f.w+'px',height:f.h+'px',transform:`rotate(${activeCopy(state).rotate||0}deg)`});
 $('#float-size').value=f.size;$('#float-size-value').textContent=Math.round(f.size)+'%';$('#float-size').style.setProperty('--progress',(f.size-10)/140*100+'%');
 $('#float-copy-label').textContent=n>1?`第 ${state.floatActive+1} / ${n} 份 · 按序号或点击画面中的人物切换`:'1 份';
 // Numbered buttons reach a copy even when another one covers it in the preview.
 const list=$('#float-copy-list');list.hidden=n<2;while(list.children.length>n)list.lastElementChild.remove();while(list.children.length<n){const b=document.createElement('button');b.type='button';b.dataset.copy=list.children.length;b.textContent=list.children.length+1;b.title='选中第 '+(list.children.length+1)+' 份';list.append(b);}
 [...list.children].forEach((b,i)=>{b.classList.toggle('selected',i===state.floatActive);b.setAttribute('aria-pressed',String(i===state.floatActive));});$('#float-delete').disabled=n<2;$('#float-up').disabled=state.floatActive>=n-1;$('#float-down').disabled=state.floatActive<=0;$('#float-duplicate').disabled=n>=12;return f;
}
async function renderDesktop(){
 const seq=++renderSequence;const raw=clone(state),s={...raw,protectPerson:raw.protectPerson&&!floating(raw)},desktop=$('#desktop');desktop.style.aspectRatio=String(s.aspect);desktop.style.backgroundColor=s.gapColor;
 const w=desktop.clientWidth,h=desktop.clientHeight;if(!w||!h)return;
 const geo=geometry(s,w,h);syncSplitGuide(s,w,h,geo);
 ['#piece-left','#piece-right'].forEach((id,i)=>{const el=$(id),points=geo.polygons[i];el.style.display=points.length?'block':'none';el.style.clipPath='polygon('+points.map(p=>`${p[0]}px ${p[1]}px`).join(',')+')';});
 $('#split-handle').hidden=s.mode==='single';$('#split-handle').style.left=s.ratio+'%';$('#split-handle').style.top=(s.anchorY??50)+'%';
 ['#split-start','#split-end'].forEach((id,i)=>{const el=$(id),p=geo.endpoints[i];el.hidden=s.mode==='single'||!p;if(p){el.style.left=Math.max(8,Math.min(w-8,p[0]))+'px';el.style.top=Math.max(8,Math.min(h-8,p[1]))+'px';}});
 // Clean desktop: everything that is not wallpaper (zones, dock, top bar, greeting, caption) flies off; see styles.css.
 desktop.classList.toggle('clean',!s.showIcons);$('.desktop-greeting').hidden=s.protectPerson||floating(s);
 $('#toggle-icons').textContent=s.showIcons?'隐藏桌面，只看壁纸':'显示桌面';
 $('#desktop-caption').textContent=s.customImage?'我的壁纸':wallpapers.find(x=>x.id===s.wallpaper).name;
 $('#resolution-label').textContent=`1600 × ${Math.round(1600/s.aspect)}`;
 for(const m of Rider.modules)Rider.call(m,'render',{s,w,h,layer:m.layer,api:Rider.api});
 const portraitLayer=$('#portrait-layer'),key=sceneKey(s);
 const keepPortrait=s.protectPerson&&portraitFrameSource===key&&portraitLayer.width===w&&portraitLayer.height===h;
 portraitLayer.hidden=!keepPortrait;
 if(keepPortrait){$('#piece-left').style.display='none';$('#piece-right').style.display='none';}
 if(!floating(s)){$('#float-layers').replaceChildren();$('#float-outline').hidden=true;}else if(floatView?.key!==key)$('#float-status').textContent='正在本机抠出人物并补全背景…';
 try{const [view,own]=await Promise.all([scene(s),pieceImages(s)]);if(seq!==renderSequence)return;
 floatView=view.cut?{...view,key}:null;
 if(floating(s)){placeFloat();$('#float-status').textContent=view.cut?'人物已抠出 · 直接拖动画面中的人物，滚轮调整大小':'没有选中任何区域，请调整抠图范围';}
 ['#piece-left','#piece-right'].forEach((id,i)=>{const el=$(id),img=own[i]||view.img,placement=s.protectPerson?Portrait.placement(s,view.img,w,h):piecePlacement(s,img,w,h,geo.polygons[i],i);el.dataset.own=own[i]?'1':'';el.style.backgroundImage=`url("${own[i]?s.pieces[i].image:view.src}")`;el.style.backgroundRepeat='no-repeat';el.style.backgroundSize=`${placement.w}px ${placement.h}px`;el.style.backgroundPosition=`${placement.x}px ${placement.y}px`;});
 if(s.protectPerson){
  // While recognition runs, keep the full original visible instead of cutting a face.
  if(!keepPortrait){$('#piece-left').style.clipPath='none';$('#piece-left').style.display='block';$('#piece-right').style.display='none';$('#person-status').textContent='正在本机识别人像…';}$('#retry-person').hidden=true;
  const result=await Portrait.render(s,view.img,w,h,geo,view.src);if(seq!==renderSequence)return;
  portraitFrameSource=key;portraitLayer.width=w;portraitLayer.height=h;portraitLayer.getContext('2d').drawImage(result.canvas,0,0);portraitLayer.hidden=false;
  $('#piece-left').style.display='none';$('#piece-right').style.display='none';
  $('#person-status').textContent=result.person.coverage>.005?'人物保护已就绪 · 分割缝从人物后方经过':'未检测到明显人物 · 仍按整图比例处理';
 }else{$('#person-status').textContent=floating(s)?'人物已悬浮，背景中不再需要人物保护':'在本机识别人像，不上传照片';$('#retry-person').hidden=true;}
 }catch(error){if(seq!==renderSequence)return;$('#person-status').textContent='人物识别失败，暂显示完整原图。可重试或关闭人物优先。';$('#retry-person').hidden=!s.protectPerson;if(floating(s))$('#float-status').textContent='抠图失败，可重试或调整抠图范围';toast(error.message);}
 Rider.emit('render',{s,w,h});
}

function updateControls(){
 ['angle','ratio','gap'].forEach(key=>{$('#'+key).value=state[key];$('#'+key+'-value').textContent=Math.round(state[key])+(key==='angle'?'°':key==='ratio'?'%':' px');});
 $('#bend').value=state.bend;$('#bend-value').textContent=(state.bend>0?'+':'')+Math.round(state.bend);$('#wave').value=state.wave;$('#wave-value').textContent=state.wave?state.wave+' 个':'无';$('#wave-amp').value=state.waveAmp;$('#wave-amp-value').textContent=Math.round(state.waveAmp);$('#wave-amp').disabled=state.mode==='single'||!state.wave;$('#bend').disabled=state.mode==='single';$('#wave').disabled=state.mode==='single';$('#shape-options').hidden=state.mode==='single';
 $('#angle').disabled=state.mode!=='diagonal';$('#ratio').disabled=state.mode==='single';$('#gap').disabled=state.mode==='single';$('#linked').disabled=state.mode==='single';
 $('#linked').checked=state.linked;
 for(const [id,key] of [['anchor-y','anchorY'],['source-cut','sourceRatio'],['focus-x','focusX'],['focus-y','focusY']]){$('#'+id).value=state[key];$('#'+id+'-value').textContent=Math.round(state[key]*10)/10+'%';}
 $('#split-handle').hidden=state.mode==='single';$('#split-start').hidden=state.mode==='single';$('#split-end').hidden=state.mode==='single';$('#anchor-y').disabled=state.mode==='single';$('#pick-split').disabled=state.mode==='single';$('#protect-person').checked=state.protectPerson;$('#linked').closest('.switch-row').querySelector('small').textContent=state.protectPerson?'拖动控制点，人物与画面一起移动':'左右画面随区域移动、缩放';
 $('#portrait-motion-hint').hidden=!state.protectPerson||!state.linked||state.mode==='single';
 $('#piece-options').hidden=state.protectPerson;$$('.piece-card').forEach((card,i)=>{const q=state.pieces[i];card.hidden=i===1&&state.mode==='single';card.querySelector('.piece-source').textContent=q.image?'自己的图片':'共享壁纸';card.querySelector('.piece-shared').hidden=!q.image;card.querySelector('.piece-dx').value=q.dx;card.querySelector('.piece-dx-value').textContent=Math.round(q.dx)+'%';card.querySelector('.piece-dy').value=q.dy;card.querySelector('.piece-dy-value').textContent=Math.round(q.dy)+'%';card.querySelector('.piece-zoom').value=q.zoom;card.querySelector('.piece-zoom-value').textContent=Math.round(q.zoom)+'%';});
 $('#source-options').hidden=state.protectPerson||!state.linked||state.mode==='single';$('#source-preview').style.backgroundImage=`url("${source()}")`;$('#source-cut-marker').style.left=state.sourceRatio+'%';
 const polygons=geometry({...state,gap:0},1600,1600/state.aspect).polygons;
 const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
 const left=state.mode==='single'?100:Math.round(area(polygons[0])/(1600*1600/state.aspect)*100);$('#area-summary').textContent=`实际区域面积：左 ${left}% / 右 ${100-left}%`;
 $('#split-picker').hidden=!pickingSplit;$('#pick-hint').hidden=!pickingSplit;$('#pick-split').textContent=pickingSplit?'取消选择位置':'在画面上选分割位置';$('#gap-color').value=state.gapColor;$('#color-value').textContent=state.gapColor.toUpperCase();$('#aspect').value=String(state.aspect);$('#wallpaper-scale').value=state.scale;$('#wallpaper-scale-value').textContent=state.scale+'%';
 $$('input[type=range]').forEach(el=>el.style.setProperty('--progress',((Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100)+'%'));
 $$('[data-mode]').forEach(btn=>{btn.classList.toggle('selected',btn.dataset.mode===state.mode);btn.setAttribute('aria-pressed',String(btn.dataset.mode===state.mode));});
 $$('.preset-card').forEach(btn=>{btn.classList.toggle('selected',btn.dataset.preset===state.preset);btn.setAttribute('aria-pressed',String(btn.dataset.preset===state.preset));});
 $$('.wallpaper-card').forEach(btn=>btn.classList.toggle('selected',btn.dataset.wallpaper===state.wallpaper&&!state.customImage));
 $('.saved-count').textContent=String(saved.length);
 const look=activeCopy(state);for(const [id,key,unit] of [['float-rotate','rotate','°'],['float-opacity','opacity','%'],['float-hue','hue','°'],['float-saturate','saturate','%'],['float-brightness','brightness','%'],['float-glow','glow','']]){$('#'+id).value=look[key];$('#'+id+'-value').textContent=Math.round(look[key])+unit;}$('#float-glow-color').value=look.glowColor;$('#float-toggle').checked=state.floatPerson;$('#float-options').hidden=!state.floatPerson;$('#float-flip').checked=activeCopy(state).flip;$('#float-shadow').checked=state.floatShadow;$('#float-keep').checked=state.floatKeepOriginal;
 $('#protect-person').disabled=floating(state);if(!state.floatPerson)$('#float-status').textContent='打开后自动识别主体，也可以手动点选。';
 for(const m of Rider.modules)Rider.call(m,'sync',{s:state,panel:m.panel,api:Rider.api});
 $$('input[type=range]',$('#module-controls')).forEach(el=>el.style.setProperty('--progress',((Number(el.value)-Number(el.min))/(Number(el.max)-Number(el.min))*100)+'%'));
}
let renderFrame;
function scheduleRender(){cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(()=>renderDesktop());}
function update({zones=false,custom=true}={}){if(custom)state.preset=null;updateControls();scheduleRender();if(zones)renderZones();persistDraft();Rider.emit('state',state);}
const clampZone=(v,max)=>Math.max(0,Math.min(max,Math.round(v*10)/10));
function moveItem(itemId,zoneId){const item=state.items.find(x=>x.id===itemId);if(!item||!state.zones.some(z=>z.id===zoneId))return;const count=state.items.filter(x=>x.zone===zoneId).length;if(item.zone!==zoneId&&count>=6){toast('每个分区最多收纳 6 个快捷项');return;}item.zone=zoneId;update({zones:true,custom:false});}
function renderZones(){
 const root=$('#desktop-zones');root.replaceChildren();
 state.zones.forEach(zone=>{
 const box=document.createElement('section');box.className='desktop-zone';box.dataset.zone=zone.id;box.setAttribute('aria-label',zone.name+'收纳分区');box.style.left=zone.x+'%';box.style.top=zone.y+'%';box.style.setProperty('--fly',zone.x<50?-1:1); // flies toward its nearer edge when the desktop is hidden
 const heading=document.createElement('div');heading.className='zone-heading';heading.append(icon('folder'));const title=document.createElement('span');title.textContent=zone.name;heading.append(title);
 const count=document.createElement('small');count.className='zone-count';count.textContent=state.items.filter(i=>i.zone===zone.id).length;heading.append(count);
 // The heading is the handle: drag to move the zone; a plain click (or Enter) hides the whole desktop, like macOS.
 heading.tabIndex=0;heading.setAttribute('role','button');heading.title='拖动移动分区；点击隐藏桌面，只看壁纸';
 const place=()=>{box.style.left=zone.x+'%';box.style.top=zone.y+'%';};let zd=null;
 heading.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;const b=$('#desktop').getBoundingClientRect();zd={id:e.pointerId,sx:e.clientX,sy:e.clientY,x:zone.x,y:zone.y,w:b.width,h:b.height,moved:false};heading.setPointerCapture(e.pointerId);e.preventDefault();});
 heading.addEventListener('pointermove',e=>{if(zd?.id!==e.pointerId)return;const dx=e.clientX-zd.sx,dy=e.clientY-zd.sy;if(!zd.moved&&Math.hypot(dx,dy)<4)return;zd.moved=true;box.classList.add('dragging');zone.x=clampZone(zd.x+dx/zd.w*100,71);zone.y=clampZone(zd.y+dy/zd.h*100,92);place();});
 const endZone=e=>{if(zd?.id!==e.pointerId)return;const moved=zd.moved;zd=null;box.classList.remove('dragging');if(moved)persistDraft();else hideDesktop();};
 heading.addEventListener('pointerup',endZone);heading.addEventListener('pointercancel',endZone);heading.addEventListener('lostpointercapture',()=>{zd=null;box.classList.remove('dragging');});
 heading.addEventListener('keydown',e=>{const step=e.shiftKey?5:1,moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
  if(moves[e.key]){e.preventDefault();zone.x=clampZone(zone.x+moves[e.key][0],71);zone.y=clampZone(zone.y+moves[e.key][1],92);place();persistDraft();}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();hideDesktop();}});
 if(currentView==='manage'&&state.zones.length>1){const remove=document.createElement('button');remove.className='zone-delete';remove.textContent='×';remove.setAttribute('aria-label','删除'+zone.name+'分区');remove.addEventListener('click',()=>{const other=state.zones.find(z=>z.id!==zone.id);if(state.items.filter(i=>i.zone===zone.id||i.zone===other.id).length>6){toast('请先将部分快捷项移到其他分区，再删除此分区');return;}state.items.forEach(i=>{if(i.zone===zone.id)i.zone=other.id;});state.zones=state.zones.filter(z=>z.id!==zone.id);update({zones:true,custom:false});toast('分区已移除，快捷项已移至'+other.name);});heading.append(remove);}
 box.append(heading);const items=document.createElement('div');items.className='zone-items';
 state.items.filter(i=>i.zone===zone.id).forEach(item=>{const el=document.createElement('button');el.className='desktop-item';el.draggable=true;el.dataset.item=item.id;el.setAttribute('aria-label',item.name+'，按 Enter 移至下一个分区');el.title='拖动以整理；按 Enter 移至下一个分区';const art=document.createElement('span');art.className='item-art '+item.kind;art.append(icon(item.kind));const label=document.createElement('span');label.textContent=item.name;el.append(art,label);el.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',item.id);event.dataTransfer.effectAllowed='move';});el.addEventListener('click',()=>{const index=state.zones.findIndex(z=>z.id===item.zone);const next=state.zones[(index+1)%state.zones.length];moveItem(item.id,next.id);$(`[data-item="${item.id}"]`)?.focus();toast('已移至'+next.name);});items.append(el);});
 box.append(items);box.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';box.classList.add('drag-over');});box.addEventListener('dragleave',()=>box.classList.remove('drag-over'));box.addEventListener('drop',e=>{e.preventDefault();box.classList.remove('drag-over');moveItem(e.dataTransfer.getData('text/plain'),zone.id);});root.append(box);
 });
}
function renderPresets(){
 const root=$('#preset-grid');presets.forEach(p=>{const button=document.createElement('button');button.className='preset-card';button.dataset.preset=p.id;const thumb=document.createElement('div');thumb.className='preset-thumb';const a=document.createElement('div'),b=document.createElement('div');[a,b].forEach(el=>el.style.backgroundImage=`url("assets/${p.wallpaper}.svg")`);if(p.mode!=='single'){const tilt=p.mode==='diagonal'?p.angle*.7:0;const r=p.ratio;a.style.clipPath=`polygon(0 0,${r+tilt-1}% 0,${r-tilt-1}% 100%,0 100%)`;b.style.clipPath=`polygon(${r+tilt+1}% 0,100% 0,100% 100%,${r-tilt+1}% 100%)`;}else b.hidden=true;thumb.append(a,b);wallpaperCanvas({...clone(defaults),...p},480).then(canvas=>{a.style.backgroundImage=`url("${canvas.toDataURL('image/png')}")`;a.style.clipPath='none';b.hidden=true;}).catch(()=>{});const check=document.createElement('span');check.className='preset-check';check.append(icon('check'));thumb.append(check);const meta=document.createElement('div');meta.className='preset-meta';const name=document.createElement('strong');name.textContent=p.name;const desc=document.createElement('span');desc.textContent=p.desc;meta.append(name,desc);button.append(thumb,meta);button.addEventListener('click',()=>{Object.assign(state,{mode:p.mode,angle:p.angle,ratio:p.ratio,gap:p.gap,wallpaper:p.wallpaper,preset:p.id,customImage:null,scale:100,anchorY:50,sourceRatio:50,focusX:50,focusY:50,protectPerson:false,...noFloat()});update({custom:false});toast('已载入「'+p.name+'」布局');});root.append(button);});
}
function renderWallpapers(){const root=$('#wallpaper-grid');wallpapers.forEach(w=>{const btn=document.createElement('button');btn.className='wallpaper-card';btn.dataset.wallpaper=w.id;const img=new Image();img.src=w.src;img.alt=w.name;const name=document.createElement('strong');name.textContent=w.name;const tone=document.createElement('small');tone.textContent=w.tone;btn.append(img,name,tone);btn.addEventListener('click',()=>{state.wallpaper=w.id;state.customImage=null;state.protectPerson=w.id==='portrait';Object.assign(state,noFloat());state.focusX=50;state.focusY=50;update();toast('已切换壁纸：'+w.name);});root.append(btn);});}
// Views: the four built-in ones plus one per module that declares `view` (added in mountModule).
const views={design:{crumb:'桌面设计',title:'桌面，由你定义。',description:'分开空间，连接灵感。创造一个刚刚好的桌面。',inspector:'分裂设置',panel:'#design-controls'},wallpaper:{crumb:'壁纸收藏',title:'把喜欢，设为日常。',description:'一片风景，一种心情。让壁纸成为你的灵感底色。',inspector:'壁纸设置',panel:'#wallpaper-controls'},manage:{crumb:'桌面管理',title:'各就各位，井然有序。',description:'给每一份工作与灵感，留一个专属的位置。',inspector:'收纳设置',panel:'#manage-controls'},saved:{crumb:'我的方案',title:'喜欢的桌面，随时回来。',description:'收好每一次灵感，轻松切换你的桌面风格。',inspector:''}};
function setView(view){if(!views[view])view='design';pickingSplit=false;currentView=view;const v=views[view];$('#breadcrumb-current').textContent=v.crumb;$('#page-title').textContent=v.title;$('#page-description').textContent=v.description;$('#inspector-title').textContent=v.inspector;$$('[data-view]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.view===view);if(btn.dataset.view===view)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});$('#editor-view').hidden=view==='saved';$('#saved-view').hidden=view!=='saved';
 ['#design-controls','#wallpaper-controls','#manage-controls'].forEach(id=>{$(id).hidden=v.panel!==id;});
 for(const m of Rider.modules){m.panel.hidden=!(m.view?view===m.id:(m.panelView||'design')===view);if(m.page)m.page.hidden=view!==m.id;}
 $('#presets-section').hidden=view==='wallpaper'||!!v.module;$('#wallpapers-section').hidden=view!=='wallpaper';$('.inspector-tip').hidden=view!=='design';if(view==='saved')renderSaved();else{renderDesktop();renderZones();}updateControls();
 for(const m of Rider.modules)Rider.call(m,'onView',{view,api:Rider.api});Rider.emit('view',view);}
// Export order: wallpaper, modules with order < 100, the floating person, the remaining modules.
async function drawModules(ctx,s,w,h,view,pick){for(const m of Rider.modules){if(!pick(m)||typeof m.draw!=='function')continue;ctx.save();try{await m.draw({ctx,s,w,h,view,api:Rider.api});}catch(error){console.error(`[module ${m.id}] draw`,error);}ctx.restore();}}
// layers: 'all' (the PNG export), 'background' (wallpaper + modules below the person; what the
// client sets as the system wallpaper) or 'overlay' (transparent: person copies + modules above;
// what the client shows in its desktop-layer window).
async function wallpaperCanvas(s,width=1600,{layers='all'}={}){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width/s.aspect);const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height,bg=layers!=='overlay',fg=layers!=='background';if(bg){ctx.fillStyle=s.gapColor;ctx.fillRect(0,0,w,h);}const [view,own]=await Promise.all([scene(s),pieceImages(s)]),geo=geometry(s,w,h),below=m=>m.order<100;
 if(s.protectPerson&&!view.cut){const out=bg?(await Portrait.render(s,view.img,w,h,geo,view.src)).canvas:canvas,octx=out.getContext('2d');if(bg)await drawModules(octx,s,w,h,view,below);if(fg)await drawModules(octx,s,w,h,view,m=>!below(m));return out;}
 if(bg){geo.polygons.forEach((points,i)=>{if(!points.length)return;ctx.save();ctx.beginPath();points.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();const img=own[i]||view.img,placement=piecePlacement(s,img,w,h,points,i);ctx.drawImage(img,placement.x,placement.y,placement.w,placement.h);ctx.restore();});await drawModules(ctx,s,w,h,view,below);}
 if(fg){drawFloat(ctx,s,view,w,h);await drawModules(ctx,s,w,h,view,m=>!below(m));}return canvas;}
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderSaved(){const root=$('#saved-grid');root.replaceChildren();$('#empty-saved').hidden=saved.length>0;saved.forEach(entry=>{const card=document.createElement('article');card.className='saved-card';if(typeof entry.thumbnail==='string'&&entry.thumbnail.startsWith('data:image/')){const img=new Image();img.src=entry.thumbnail;img.alt=entry.name+'壁纸预览';card.append(img);}const content=document.createElement('div');content.className='saved-card-content';const heading=document.createElement('h3');heading.textContent=entry.name;const date=document.createElement('p');date.textContent='保存于 '+new Date(entry.createdAt).toLocaleDateString('zh-CN');const actions=document.createElement('div');actions.className='saved-card-actions';const load=document.createElement('button');load.className='button secondary';load.textContent='载入方案';load.addEventListener('click',()=>{state=normalizeState(entry.state);setView('design');update({zones:true,custom:false});toast('已载入「'+entry.name+'」');});const remove=document.createElement('button');remove.className='text-button';remove.textContent='删除';remove.addEventListener('click',()=>{const next=saved.filter(s=>s.id!==entry.id);try{localStorage.setItem('desktop-rider-schemes',JSON.stringify(next));saved=next;renderSaved();updateControls();toast('已删除方案「'+entry.name+'」');}catch{toast('删除未完成，无法写入浏览器存储');}});actions.append(load,remove);content.append(heading,date,actions);card.append(content);root.append(card);});}
$$('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
$('.brand').addEventListener('click',e=>{e.preventDefault();setView('design');});
$('#show-saved').addEventListener('click',()=>setView('saved'));$('#back-design').addEventListener('click',()=>setView('design'));
$$('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{state.mode=btn.dataset.mode;pickingSplit=false;update();}));
['angle','ratio','gap','bend','wave'].forEach(key=>$('#'+key).addEventListener('input',e=>{state[key]=Number(e.target.value);update();}));$('#wave-amp').addEventListener('input',e=>{state.waveAmp=Number(e.target.value);update();});$('#shape-reset').addEventListener('click',()=>{Object.assign(state,{bend:0,wave:0,waveAmp:8});update();});
for(const [id,key] of [['anchor-y','anchorY'],['source-cut','sourceRatio'],['focus-x','focusX'],['focus-y','focusY']])$('#'+id).addEventListener('input',e=>{state[key]=Number(e.target.value);update();});
$('#protect-person').addEventListener('change',e=>{state.protectPerson=e.target.checked;update();});
$('#retry-person').addEventListener('click',()=>renderDesktop());
$('#linked').addEventListener('change',e=>{state.linked=e.target.checked;update();});
$('#gap-color').addEventListener('input',e=>{state.gapColor=e.target.value;update();});
// Per-piece picture: own image, offset and zoom — from the cards, or by dragging / scrolling a piece in the preview.
const pieceOf=el=>Number(el.closest('.piece-card').dataset.piece);
$('#piece-options').addEventListener('input',e=>{const cls=e.target.classList,q=state.pieces[pieceOf(e.target)];if(cls.contains('piece-dx'))q.dx=Number(e.target.value);else if(cls.contains('piece-dy'))q.dy=Number(e.target.value);else if(cls.contains('piece-zoom'))q.zoom=Number(e.target.value);else return;update({custom:false});});
$('#piece-options').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const i=pieceOf(b),q=state.pieces[i];
 if(b.classList.contains('piece-pick')){$('#piece-file').dataset.piece=i;$('#piece-file').click();}
 else if(b.classList.contains('piece-shared')){q.image=null;update({custom:false});toast((i?'右侧':'左侧')+'画面已改回共享壁纸');}
 else if(b.classList.contains('piece-reset')){Object.assign(q,{dx:0,dy:0,zoom:100});update({custom:false});}});
$('#piece-file').addEventListener('change',async e=>{const file=e.target.files[0],i=Number(e.target.dataset.piece)||0;e.target.value='';if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('请选择 JPG、PNG 或 WebP 图片');return;}if(file.size>20*1024*1024){toast('请选择小于 20 MB 的图片');return;}
 const url=URL.createObjectURL(file);try{const img=await loadImage(url),max=1600,k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);state.pieces[i].image=c.toDataURL('image/jpeg',.88);Object.assign(state.pieces[i],{dx:0,dy:0,zoom:100});update({custom:false});toast((i?'右侧':'左侧')+'画面已换成「'+file.name+'」');}catch{toast('图片无法读取，请换一张图片重试');}finally{imageCache.delete(url);URL.revokeObjectURL(url);}});
let pieceDrag=null;const pieceAt=e=>{const el=e.target.closest('.wallpaper-piece');return el&&!pickingSplit&&!state.protectPerson?Number(el.id==='piece-right'):null;};
$('#desktop').addEventListener('pointerdown',e=>{const i=pieceAt(e);if(i===null||e.button!==0)return;const q=state.pieces[i];pieceDrag={id:e.pointerId,i,x:e.clientX,y:e.clientY,dx:q.dx,dy:q.dy,moved:false};e.target.setPointerCapture(e.pointerId);});
$('#desktop').addEventListener('pointermove',e=>{if(pieceDrag?.id!==e.pointerId)return;const b=$('#desktop').getBoundingClientRect(),mx=e.clientX-pieceDrag.x,my=e.clientY-pieceDrag.y;if(!pieceDrag.moved&&Math.hypot(mx,my)<4)return;pieceDrag.moved=true;const q=state.pieces[pieceDrag.i];q.dx=Math.max(-100,Math.min(100,pieceDrag.dx+mx/b.width*100));q.dy=Math.max(-100,Math.min(100,pieceDrag.dy+my/b.height*100));update({custom:false});});
const endPieceDrag=e=>{if(pieceDrag?.id===e.pointerId)pieceDrag=null;};$('#desktop').addEventListener('pointerup',endPieceDrag);$('#desktop').addEventListener('pointercancel',endPieceDrag);
$('#desktop').addEventListener('wheel',e=>{const i=pieceAt(e);if(i===null)return;e.preventDefault();const q=state.pieces[i];q.zoom=Math.max(50,Math.min(300,q.zoom*Math.exp(-e.deltaY*.0015)));update({custom:false});},{passive:false});
$('#aspect').addEventListener('change',e=>{state.aspect=Number(e.target.value);update();});
$('#wallpaper-scale').addEventListener('input',e=>{state.scale=Number(e.target.value);update();});
// Clean desktop, like macOS: hide everything but the wallpaper (footer button, a click on any zone
// heading, or a double-click on the bare wallpaper); one click on the wallpaper brings it all back.
let desktopShownAt=0;
function hideDesktop(){if(!state.showIcons)return;state.showIcons=false;update({custom:false});toast('桌面元素已隐藏，点一下壁纸即可恢复');}
function showDesktop(){if(state.showIcons)return;state.showIcons=true;desktopShownAt=Date.now();update({custom:false});}
$('#toggle-icons').addEventListener('click',()=>state.showIcons?hideDesktop():showDesktop());
const bareWallpaper=e=>!pickingSplit&&!e.target.closest('.float-person,.split-handle,.split-endpoint,.module-layer,#float-outline,.desktop-zone,.desktop-dock,.desktop-top');
$('#desktop').addEventListener('click',e=>{if(!state.showIcons&&bareWallpaper(e))showDesktop();});
$('#desktop').addEventListener('dblclick',e=>{if(state.showIcons&&Date.now()-desktopShownAt>600&&bareWallpaper(e))hideDesktop();}); // not the double-click that just restored it
$('#reset').addEventListener('click',()=>{state=clone(defaults);update({zones:true,custom:false});toast('已恢复初始桌面');});
$('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#preview-stage').requestFullscreen();}catch{toast('当前浏览器不支持全屏预览');}});
$('#help').addEventListener('click',()=>$('#help-dialog').showModal());
$$('[data-close]').forEach(btn=>btn.addEventListener('click',()=>$('#'+btn.dataset.close).close()));
$('#save').addEventListener('click',()=>{$('#scheme-name').value='我的桌面 '+(saved.length+1);$('#save-dialog').showModal();$('#scheme-name').select();});
$('#save-form').addEventListener('submit',async e=>{e.preventDefault();const name=$('#scheme-name').value.trim();if(!name){$('#scheme-name').setCustomValidity('请输入方案名称');$('#scheme-name').reportValidity();return;}const button=$('#save-form button[type=submit]');button.disabled=true;try{const snapshot=clone(state);const canvas=await wallpaperCanvas(snapshot,480);const entry={id:crypto.randomUUID(),name,createdAt:new Date().toISOString(),state:snapshot,thumbnail:canvas.toDataURL('image/jpeg',.82)};const next=[entry,...saved];localStorage.setItem('desktop-rider-schemes',JSON.stringify(next));saved=next;$('#save-dialog').close();updateControls();if(currentView==='saved')renderSaved();toast('方案「'+name+'」已保存');}catch{toast('保存失败：存储空间不足或壁纸无法读取，请删除旧方案后重试');}finally{button.disabled=false;}});
$('#scheme-name').addEventListener('input',e=>e.target.setCustomValidity(''));
$('#export').addEventListener('click',async()=>{const button=$('#export');button.disabled=true;try{const canvas=await wallpaperCanvas(clone(state));const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error();download(blob,'Desktop-Rider-'+Date.now()+'.png');toast('分裂壁纸已导出为 PNG，可在系统设置中应用');}catch{toast('壁纸导出失败，请重新导入图片后重试');}finally{button.disabled=false;}});
$$('.upload-trigger').forEach(btn=>btn.addEventListener('click',()=>$('#wallpaper-file').click()));
// Imports any drawable (image, bitmap, video frame) as the custom wallpaper.
function useImage(picture,width,height,name){const max=2000,scale=Math.min(1,max/Math.max(width,height));const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(picture,0,0,canvas.width,canvas.height);state.customImage=canvas.toDataURL('image/jpeg',.88);state.scale=100;state.focusX=50;state.focusY=50;state.protectPerson=true;Object.assign(state,noFloat());update();toast('已导入「'+name+'」');}
$('#wallpaper-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('请选择 JPG、PNG 或 WebP 图片');e.target.value='';return;}if(file.size>20*1024*1024){toast('请选择小于 20 MB 的图片');e.target.value='';return;}const url=URL.createObjectURL(file);try{const img=await loadImage(url);useImage(img,img.naturalWidth,img.naturalHeight,file.name);}catch{toast('图片无法读取，请换一张图片重试');}finally{imageCache.delete(url);URL.revokeObjectURL(url);e.target.value='';}});
function addZone(){const name=$('#zone-name').value.trim();if(!name){toast('先给新分区起个名字');$('#zone-name').focus();return;}if(state.zones.length>=3){toast('当前布局最多支持 3 个收纳分区');return;}const [x,y]=zoneSlot(state.zones.length);state.zones.push({id:crypto.randomUUID(),name,x,y});$('#zone-name').value='';state.showIcons=true;update({zones:true,custom:false});toast('已添加分区「'+name+'」');}
// Item kinds with an icon and colour: file, folder, image, code, music. Returns null when every zone is full.
function createItem(name,kind='file'){const zone=state.zones.find(z=>state.items.filter(i=>i.zone===z.id).length<6);if(!zone||state.items.length>=18)return null;const item={id:crypto.randomUUID(),name,kind,zone:zone.id};state.items.push(item);state.showIcons=true;update({zones:true,custom:false});return item;}
function addItem(){const name=$('#item-name').value.trim();if(!name){toast('请输入快捷项名称');$('#item-name').focus();return;}if(!createItem(name)){toast('分区已满，请先新增收纳分区');return;}$('#item-name').value='';toast('已添加演示快捷项');}
$('#add-zone').addEventListener('click',addZone);$('#add-item').addEventListener('click',addItem);$('#zone-name').addEventListener('keydown',e=>{if(e.key==='Enter')addZone();});$('#item-name').addEventListener('keydown',e=>{if(e.key==='Enter')addItem();});
$('#zone-layout-reset').addEventListener('click',()=>{state.zones.forEach((z,i)=>{[z.x,z.y]=zoneSlot(i);});update({zones:true,custom:false});toast('分区已回到默认位置');});
$('#organize').addEventListener('click',()=>{state.items.sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name,'zh-CN'));state.items.forEach((item,i)=>{item.zone=state.zones[Math.floor(i/6)]?.id||state.zones[0].id;});state.showIcons=true;update({zones:true,custom:false});toast('已按类型整理快捷项');});
const handle=$('#split-handle');
const clampPercent=v=>Math.max(1,Math.min(99,v));
function pointAt(event){const b=$('#desktop').getBoundingClientRect();return {x:Math.max(0,Math.min(b.width,event.clientX-b.left)),y:Math.max(0,Math.min(b.height,event.clientY-b.top)),w:b.width,h:b.height};}
$('#pick-split').addEventListener('click',()=>{pickingSplit=!pickingSplit;updateControls();if(pickingSplit)$('#split-picker').focus();});
$('#split-picker').addEventListener('click',event=>{if(event.detail===0){toast('可使用横向、纵向位置滑块精确设置');return;}const p=pointAt(event);state.ratio=clampPercent(Math.round(p.x/p.w*100));state.anchorY=clampPercent(Math.round(p.y/p.h*100));pickingSplit=false;update();handle.focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&pickingSplit){pickingSplit=false;updateControls();$('#pick-split').focus();}});
let move=null;
function endDrag(event){if(move?.pointerId===event.pointerId){move=null;$('#desktop').classList.remove('dragging-split');}}
for(const [id,index] of [['split-handle',-1],['split-start',0],['split-end',1]]){
 const element=$('#'+id);
 element.addEventListener('pointerdown',event=>{const p=pointAt(event),g=geometry(state,p.w,p.h);move={pointerId:event.pointerId,index,opposite:index<0?null:g.endpoints[1-index],offsetX:p.x-state.ratio/100*p.w,offsetY:p.y-state.anchorY/100*p.h};$('#desktop').classList.add('dragging-split');element.setPointerCapture(event.pointerId);event.preventDefault();});
 element.addEventListener('pointermove',event=>{if(!move||move.pointerId!==event.pointerId)return;const p=pointAt(event);
  if(move.index===-1){state.ratio=clampPercent(Math.round((p.x-move.offsetX)/p.w*100));state.anchorY=clampPercent(Math.round((p.y-move.offsetY)/p.h*100));}
  else if(move.opposite){let a=move.index===0?[p.x,p.y]:move.opposite,b=move.index===0?move.opposite:[p.x,p.y];if(a[1]>b[1])[a,b]=[b,a];if(Math.hypot(b[0]-a[0],b[1]-a[1])<20)return;state.angle=Math.max(-80,Math.min(80,Math.round(Math.atan2(a[0]-b[0],b[1]-a[1])*180/Math.PI)));state.ratio=clampPercent(Math.round((a[0]+b[0])/2/p.w*1000)/10);state.anchorY=clampPercent(Math.round((a[1]+b[1])/2/p.h*1000)/10);state.mode='diagonal';}
  update();
 });
 element.addEventListener('pointerup',endDrag);element.addEventListener('pointercancel',endDrag);element.addEventListener('lostpointercapture',()=>{move=null;$('#desktop').classList.remove('dragging-split');});
 element.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const step=event.shiftKey?5:1;
  if(index===-1){const key=['ArrowLeft','ArrowRight'].includes(event.key)?'ratio':'anchorY';state[key]=clampPercent(state[key]+(['ArrowRight','ArrowDown'].includes(event.key)?step:-step));}
  else{state.mode='diagonal';state.angle=Math.max(-80,Math.min(80,state.angle+(['ArrowRight','ArrowDown'].includes(event.key)?step:-step)));}update();
 });
}
// Floating person: drag, wheel and keyboard only move the layer, not the wallpaper.
function updateFloat(){state.preset=null;placeFloat();updateControls();persistDraft();}
function pinFloat(){const f=placeFloat();if(f)Object.assign(activeCopy(state),{x:f.x,y:f.y,size:f.size});return f;}
const clampFloat=v=>Math.max(-20,Math.min(120,Math.round(v*10)/10)),clampSize=v=>Math.max(10,Math.min(150,Math.round(v*10)/10));
$('#float-toggle').addEventListener('change',async e=>{
 if(!e.target.checked){state.floatPerson=false;update();return;}
 if(state.floatPoints.length){state.floatPerson=true;update();return;}
 e.target.disabled=true;$('#float-status').textContent='正在识别画面主体…';
 try{const img=await loadImage(source()),point=await Cutout.autoPoint(img,source());
  if(point){Object.assign(state,{...noFloat(),floatPerson:true,floatPoints:[point]});update();}
  else{e.target.checked=false;$('#float-status').textContent='没有自动找到人物，请手动点选。';openCutout();}
 }catch(error){e.target.checked=false;$('#float-status').textContent='识别失败，可以手动点选人物。';toast(error.message);}finally{e.target.disabled=false;}
});
$('#float-size').addEventListener('input',e=>{pinFloat();activeCopy(state).size=clampSize(Number(e.target.value));updateFloat();});
$('#float-flip').addEventListener('change',e=>{activeCopy(state).flip=e.target.checked;updateFloat();});
for(const [id,key] of [['float-rotate','rotate'],['float-opacity','opacity'],['float-hue','hue'],['float-saturate','saturate'],['float-brightness','brightness'],['float-glow','glow']])$('#'+id).addEventListener('input',e=>{pinFloat();activeCopy(state)[key]=Number(e.target.value);updateFloat();});
$('#float-glow-color').addEventListener('input',e=>{activeCopy(state).glowColor=e.target.value;updateFloat();});
$('#float-look-reset').addEventListener('click',()=>{const d=copyDefaults();for(const k of ['rotate','opacity','hue','saturate','brightness','glow','glowColor'])activeCopy(state)[k]=d[k];updateFloat();toast('已恢复这份人物的外观');});
// Handles on the selection outline: corners scale the active copy about its centre, the knob above rotates it (Shift snaps to 15°).
let handleDrag=null;const outlineEl=$('#float-outline');
outlineEl.addEventListener('pointerdown',e=>{const hd=e.target.closest('.fo-handle');if(!hd)return;const f=pinFloat();if(!f)return;const b=$('#desktop').getBoundingClientRect(),cx=f.left+f.w/2,cy=f.top+f.h/2,px=e.clientX-b.left,py=e.clientY-b.top;handleDrag={id:e.pointerId,mode:hd.dataset.h==='rot'?'rotate':'scale',cx,cy,size:f.size,d0:Math.max(4,Math.hypot(px-cx,py-cy)),rotate0:activeCopy(state).rotate||0,a0:Math.atan2(py-cy,px-cx)};hd.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();});
outlineEl.addEventListener('pointermove',e=>{if(handleDrag?.id!==e.pointerId)return;const b=$('#desktop').getBoundingClientRect(),px=e.clientX-b.left,py=e.clientY-b.top,c=activeCopy(state);if(handleDrag.mode==='scale')c.size=clampSize(handleDrag.size*Math.hypot(px-handleDrag.cx,py-handleDrag.cy)/handleDrag.d0);else{let r=handleDrag.rotate0+(Math.atan2(py-handleDrag.cy,px-handleDrag.cx)-handleDrag.a0)*180/Math.PI;r=((r+180)%360+360)%360-180;if(e.shiftKey)r=Math.round(r/15)*15;c.rotate=Math.round(r);}updateFloat();});
const endHandle=e=>{if(handleDrag?.id===e.pointerId)handleDrag=null;};outlineEl.addEventListener('pointerup',endHandle);outlineEl.addEventListener('pointercancel',endHandle);
$('#float-shadow').addEventListener('change',e=>{state.floatShadow=e.target.checked;updateFloat();});
$('#float-keep').addEventListener('change',e=>{state.floatKeepOriginal=e.target.checked;update();});
$('#float-reset').addEventListener('click',()=>{Object.assign(activeCopy(state),{x:null,y:null,size:null});updateFloat();toast('人物已放回原位置');});
// Copies: duplicate the active one a little offset, delete it, or move it through the stack.
$('#float-duplicate').addEventListener('click',()=>{const f=pinFloat();if(!f||state.floatCopies.length>=12)return;state.floatCopies.push({...activeCopy(state),x:clampFloat(f.x+6),y:clampFloat(f.y+6),size:f.size,flip:f.flip});state.floatActive=state.floatCopies.length-1;updateFloat();toast('已复制一份人物，拖动可分开摆放');});
$('#float-delete').addEventListener('click',()=>{if(state.floatCopies.length<2)return;state.floatCopies.splice(state.floatActive,1);state.floatActive=Math.min(state.floatActive,state.floatCopies.length-1);updateFloat();});
const moveCopy=dir=>{const i=state.floatActive,j=i+dir;if(j<0||j>=state.floatCopies.length)return;[state.floatCopies[i],state.floatCopies[j]]=[state.floatCopies[j],state.floatCopies[i]];state.floatActive=j;updateFloat();};
$('#float-up').addEventListener('click',()=>moveCopy(1));$('#float-down').addEventListener('click',()=>moveCopy(-1));
$('#float-copy-list').addEventListener('click',event=>{const b=event.target.closest('button[data-copy]');if(!b)return;state.floatActive=Number(b.dataset.copy);placeFloat();updateControls();persistDraft();$$('.float-person')[state.floatActive]?.focus({preventScroll:true});});
$('#edit-cutout').addEventListener('click',()=>openCutout());
const floatRoot=$('#float-layers');let floatDrag=null;
// Opaque pixel of this copy under the pointer? Transparent parts of the cutout do not count.
function copyHit(copy,x,y,w,h){const f=floatFrame(state,floatView,w,h,copy);if(x<f.left||y<f.top||x>f.left+f.w||y>f.top+f.h)return false;const c=floatView.cut.cutout;let px=(x-f.left)/f.w;if(copy.flip)px=1-px;const py=(y-f.top)/f.h;return c.getContext('2d').getImageData(Math.min(c.width-1,px*c.width|0),Math.min(c.height-1,py*c.height|0),1,1).data[3]>24;}
// The selected copy keeps the pointer where it is opaque, even under another copy; otherwise the
// topmost opaque copy under the pointer; otherwise the element itself (fully transparent spot).
const pickCopy=event=>{const el=event.target.closest('.float-person');if(!el)return null;let i=Number(el.dataset.index);
 if(floatView?.cut){const b=$('#desktop').getBoundingClientRect(),x=event.clientX-b.left,y=event.clientY-b.top,copies=state.floatCopies;
  if(copyHit(copies[state.floatActive],x,y,b.width,b.height))i=state.floatActive;else for(let k=copies.length-1;k>=0;k--)if(copyHit(copies[k],x,y,b.width,b.height)){i=k;break;}}
 if(state.floatActive!==i){state.floatActive=i;placeFloat();updateControls();}return $$('.float-person')[i]||el;};
floatRoot.addEventListener('pointerdown',event=>{const el=pickCopy(event);if(!el)return;const f=pinFloat();if(!f)return;const b=$('#desktop').getBoundingClientRect();floatDrag={pointerId:event.pointerId,el,dx:event.clientX-b.left-f.x/100*b.width,dy:event.clientY-b.top-f.y/100*b.height};el.setPointerCapture(event.pointerId);el.classList.add('dragging');event.preventDefault();});
floatRoot.addEventListener('pointermove',event=>{if(floatDrag?.pointerId!==event.pointerId)return;const b=$('#desktop').getBoundingClientRect(),c=activeCopy(state);c.x=clampFloat((event.clientX-b.left-floatDrag.dx)/b.width*100);c.y=clampFloat((event.clientY-b.top-floatDrag.dy)/b.height*100);updateFloat();});
const endFloatDrag=()=>{floatDrag?.el.classList.remove('dragging');floatDrag=null;};
floatRoot.addEventListener('pointerup',endFloatDrag);floatRoot.addEventListener('pointercancel',endFloatDrag);floatRoot.addEventListener('lostpointercapture',endFloatDrag);
floatRoot.addEventListener('wheel',event=>{if(!pickCopy(event))return;event.preventDefault();const f=pinFloat();if(!f)return;activeCopy(state).size=clampSize(f.size*Math.exp(-event.deltaY*.0015));updateFloat();},{passive:false});
floatRoot.addEventListener('keydown',event=>{if(!pickCopy(event))return;const step=event.shiftKey?5:1,moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
 if(moves[event.key]){event.preventDefault();pinFloat();const c=activeCopy(state);c.x=clampFloat(c.x+moves[event.key][0]);c.y=clampFloat(c.y+moves[event.key][1]);updateFloat();}
 else if(['+','=','-','_'].includes(event.key)){event.preventDefault();pinFloat();const c=activeCopy(state);c.size=clampSize(c.size+(['+','='].includes(event.key)?step:-step));updateFloat();}
});
// Cutout dialog: points are stored normalised to the original wallpaper.
let cutDraft=null,cutSeq=0;
function setCutMode(add){cutDraft.add=add;$('#cutout-add').classList.toggle('selected',add);$('#cutout-remove').classList.toggle('selected',!add);$('#cutout-add').setAttribute('aria-pressed',String(add));$('#cutout-remove').setAttribute('aria-pressed',String(!add));$('#cutout-dialog').classList.toggle('removing',!add);}
async function openCutout(){
 try{const img=await loadImage(source()),c=$('#cutout-canvas'),scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
  cutDraft={img,key:source(),points:clone(state.floatPoints),add:true,mask:null};c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);setCutMode(true);
  if(!$('#cutout-dialog').open)$('#cutout-dialog').showModal();await drawCutout();
 }catch(error){toast(error.message);}
}
async function drawCutout(){
 const seq=++cutSeq,{img,key,points}=cutDraft,c=$('#cutout-canvas'),ctx=c.getContext('2d');
 const paint=mask=>{ctx.drawImage(img,0,0,c.width,c.height);
  if(mask){const dim=document.createElement('canvas');dim.width=c.width;dim.height=c.height;const d=dim.getContext('2d');d.fillStyle='#0f1b2da8';d.fillRect(0,0,c.width,c.height);d.globalCompositeOperation='destination-out';d.drawImage(mask,0,0,c.width,c.height);ctx.drawImage(dim,0,0);}
  const r=Math.max(7,c.width/100);points.forEach(p=>{const x=p.x*c.width,y=p.y*c.height;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=p.add?'#3f7be6':'#e0525a';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#fff';ctx.stroke();ctx.beginPath();ctx.moveTo(x-r*.5,y);ctx.lineTo(x+r*.5,y);if(p.add){ctx.moveTo(x,y-r*.5);ctx.lineTo(x,y+r*.5);}ctx.stroke();});};
 paint(cutDraft.mask);
 if(!points.length){cutDraft.mask=null;paint(null);$('#cutout-status').textContent='点击人物身上任意位置开始选择。';return;}
 $('#cutout-status').textContent='正在识别所点选的区域…';$('#cutout-apply').disabled=true;
 try{const result=await Cutout.combine(img,key,points);if(seq!==cutSeq)return;cutDraft.mask=result.mask;paint(result.mask);
  $('#cutout-status').textContent=result.box?`已选中画面的 ${Math.max(1,Math.round(result.coverage*100))}% · 继续点击可添加或去除`:'当前没有选中区域，请点击人物。';
 }catch(error){if(seq===cutSeq)$('#cutout-status').textContent='识别失败：'+error.message;}
 finally{if(seq===cutSeq)$('#cutout-apply').disabled=false;}
}
function addCutPoint(event,add){if(!cutDraft)return;const b=event.currentTarget.getBoundingClientRect(),x=Math.round((event.clientX-b.left)/b.width*1000)/1000,y=Math.round((event.clientY-b.top)/b.height*1000)/1000;if(x<0||x>1||y<0||y>1)return;if(cutDraft.points.length>=24){toast('最多点选 24 次，可先撤销或清空');return;}cutDraft.points.push({x,y,add});drawCutout();}
$('#cutout-canvas').addEventListener('click',event=>addCutPoint(event,cutDraft.add));
$('#cutout-canvas').addEventListener('contextmenu',event=>{event.preventDefault();addCutPoint(event,false);});
$('#cutout-add').addEventListener('click',()=>setCutMode(true));$('#cutout-remove').addEventListener('click',()=>setCutMode(false));
$('#cutout-undo').addEventListener('click',()=>{cutDraft.points.pop();drawCutout();});
$('#cutout-clear').addEventListener('click',()=>{cutDraft.points=[];drawCutout();});
$('#cutout-auto').addEventListener('click',async()=>{$('#cutout-status').textContent='正在识别画面主体…';try{const point=await Cutout.autoPoint(cutDraft.img,cutDraft.key);if(point){cutDraft.points=[point];drawCutout();}else $('#cutout-status').textContent='没有自动找到人物，请直接点击人物。';}catch(error){$('#cutout-status').textContent='自动识别失败：'+error.message;}});
$('#cutout-apply').addEventListener('click',()=>{const points=cutDraft.points;if(!points.some(p=>p.add)){Object.assign(state,noFloat());}else{state.floatPoints=points;state.floatPerson=true;}$('#cutout-dialog').close();update();if(state.floatPerson)toast('人物已抠出，可在预览中直接拖动');});
// Wallpaper Engine import: list workshop items, then pick a layer, video frame or preview.
let weItems=[],weUrls=[],weItem=null,weChoice=null;
function weUrl(blob){const url=URL.createObjectURL(blob);weUrls.push(url);return url;}
$$('.we-trigger').forEach(btn=>btn.addEventListener('click',()=>$('#we-dialog').showModal()));
// Native directory picker where available; embedded browsers often lack it, so the
// classic chooser, a plain multi-file chooser and drag-and-drop are all accepted.
async function loadWe(list){weUrls.forEach(url=>URL.revokeObjectURL(url));weUrls=[];$('#we-summary').textContent='正在读取壁纸列表…';try{weItems=await WallpaperEngine.scan(list);}catch{weItems=[];}renderWeList();}
$('#we-pick').addEventListener('click',async()=>{
 if(window.showDirectoryPicker){try{const handle=await showDirectoryPicker({id:'wallpaper-engine',mode:'read'});$('#we-summary').textContent='正在读取壁纸列表…';return loadWe(await WallpaperEngine.fromDirectoryHandle(handle));}catch(error){if(error?.name==='AbortError')return;}}
 $('#we-folder').click();});
$('#we-pick-files').addEventListener('click',()=>$('#we-files').click());
$('#we-files').addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';if(files.length)loadWe(files);});
for(const type of ['dragenter','dragover'])$('#we-dialog').addEventListener(type,e=>{e.preventDefault();$('#we-dialog').classList.add('dragging');});
$('#we-dialog').addEventListener('dragleave',e=>{if(!$('#we-dialog').contains(e.relatedTarget))$('#we-dialog').classList.remove('dragging');});
$('#we-dialog').addEventListener('drop',async e=>{e.preventDefault();$('#we-dialog').classList.remove('dragging');const list=await WallpaperEngine.fromDataTransfer(e.dataTransfer);if(list.length)loadWe(list);else toast('没有可读取的文件');});
$('#we-copy-path').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#we-path').textContent);toast('路径已复制');}catch{toast('无法写入剪贴板，请手动复制路径');}});
$('#we-folder').addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';if(files.length)loadWe(files);});
function renderWeList(){
 const root=$('#we-list');root.replaceChildren();$('#we-detail').hidden=true;weItem=weChoice=null;$('#we-apply').disabled=true;
 $('#we-summary').textContent=weItems.length?`找到 ${weItems.length} 个壁纸，选择一个查看可用画面。`:'这里没有能读取的壁纸：需要包含 project.json 的壁纸文件夹，或 scene.pkg / 视频 / 图片文件。';
 weItems.forEach(item=>{const btn=document.createElement('button');btn.type='button';btn.className='we-item';const img=new Image();img.alt='';if(item.preview)img.src=weUrl(item.preview);const name=document.createElement('strong');name.textContent=item.title;const tag=document.createElement('small');tag.textContent=item.kind;btn.append(img,name,tag);btn.addEventListener('click',()=>{$$('.we-item').forEach(x=>x.classList.toggle('selected',x===btn));openWeItem(item);});root.append(btn);});
}
async function openWeItem(item){
 weItem=item;weChoice=null;$('#we-apply').disabled=true;$('#we-detail').hidden=false;$('#we-detail-title').textContent=item.title;$('#we-video-tools').hidden=true;$('#we-video').removeAttribute('src');
 const root=$('#we-sources'),options=[];root.replaceChildren();
 const add=(label,option)=>{const btn=document.createElement('button');btn.type='button';btn.className='we-source';const img=new Image();img.alt='';if(option.thumb)img.src=option.thumb;const span=document.createElement('span');span.textContent=label;btn.append(img,span);btn.addEventListener('click',()=>chooseWe(btn,option));root.append(btn);options.push([btn,option]);};
 if(item.type==='video'&&item.main)add('视频画面 · 拖动下方滑块选择',{kind:'video',file:item.main,thumb:item.preview&&weUrl(item.preview)});
 if(item.type==='scene'&&item.files.has('scene.pkg')){$('#we-status').textContent='正在解析场景图层…';
  try{const info=await WallpaperEngine.sceneObjects(item);if(weItem!==item)return;if(info&&info.objects.length>=2)add(`合成画面 · ${info.objects.length} 个图层 · ${info.width}×${info.height}`,{kind:'compose',thumb:item.preview&&weUrl(item.preview)});}catch{if(weItem!==item)return;}
  try{const layers=await WallpaperEngine.sceneLayers(item);if(weItem!==item)return;layers.forEach(layer=>add(`图层 · ${layer.name} · ${layer.width}×${layer.height}`,{kind:'blob',blob:layer.blob,thumb:weUrl(layer.blob)}));}catch{if(weItem!==item)return;}}
 if(item.preview)add(item.type==='image'?'图片 · 原始分辨率':'预览图（分辨率较低）',{kind:'blob',blob:item.preview,thumb:weUrl(item.preview)});
 $('#we-status').textContent=!options.length?'这个壁纸没有可导入的画面。':item.type==='scene'?'「合成画面」把场景里的图片图层按顺序叠成一张静态图；也可以只取其中一个图层。粒子、动效、文字和脚本不会导入。':item.type==='video'?'视频壁纸导入的是其中一帧静态画面。':'';
 if(options.length)chooseWe(...options[0]);
}
function chooseWe(btn,option){
 $$('.we-source').forEach(x=>x.classList.toggle('selected',x===btn));weChoice=option;$('#we-apply').disabled=false;$('#we-video-tools').hidden=option.kind!=='video';
 if(option.kind==='video'){const video=$('#we-video');option.url??=weUrl(option.file);if(video.getAttribute('src')!==option.url){video.onloadedmetadata=()=>{video.currentTime=video.duration*$('#we-video-time').value/1000;};video.onerror=()=>{if(weChoice===option){$('#we-status').textContent='浏览器无法解码这个视频，可改用预览图。';$('#we-apply').disabled=true;}};video.src=option.url;}}
}
$('#we-video-time').addEventListener('input',e=>{const video=$('#we-video');if(Number.isFinite(video.duration))video.currentTime=video.duration*e.target.value/1000;});
$('#we-apply').addEventListener('click',async()=>{
 if(!weChoice)return;const button=$('#we-apply');button.disabled=true;
 try{if(weChoice.kind==='video'){const video=$('#we-video');if(video.readyState<2)await new Promise((resolve,reject)=>{video.addEventListener('loadeddata',resolve,{once:true});video.addEventListener('error',()=>reject(new Error('视频无法解码')),{once:true});});if(video.seeking)await new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));useImage(video,video.videoWidth,video.videoHeight,weItem.title);Rider.emit('video',{file:weChoice.file,time:video.currentTime,name:weItem.title});} // modules/live.js keeps the video playing
  else if(weChoice.kind==='compose'){$('#we-status').textContent='正在合成图层…';const picture=await WallpaperEngine.composeScene(weItem);if(!picture)throw new Error('图层合成失败，可改选单个图层');const bitmap=await createImageBitmap(picture.blob);useImage(bitmap,bitmap.width,bitmap.height,weItem.title);bitmap.close();}
  else{const bitmap=await createImageBitmap(weChoice.blob);useImage(bitmap,bitmap.width,bitmap.height,weItem.title);bitmap.close();}
  $('#we-dialog').close();
 }catch(error){toast('导入失败：'+(error.message||'无法读取这张图片'));}finally{button.disabled=false;}
});
new ResizeObserver(()=>scheduleRender()).observe($('#desktop'));
function updateClock(){const now=new Date();$('#clock').textContent=now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});$('.desktop-top>span:last-child').firstChild.textContent=now.toLocaleDateString('zh-CN',{weekday:'short',month:'long',day:'numeric'})+' ';Rider.emit('tick',now);}
updateClock();setInterval(updateClock,60000);
// Modules (core.js): what a module may use of the app. Getters read live values.
Object.defineProperties(Rider.api,Object.getOwnPropertyDescriptors({get state(){return state;},get view(){return currentView;},get saved(){return saved;},update,toast,loadImage,source,scene,floating,geometry,wallpaperPlacement,piecePlacement,useImage,scheduleRender,renderDesktop,wallpaperCanvas,setView,download,icon,clone,$,$$,persist:persistDraft,desktop:()=>$('#desktop'),createItem,moveItem,normalizeState}));
let booted=false;
function mountModule(mod){
 mod.panel=document.createElement('div');mod.panel.className='module-panel';mod.panel.id='module-'+mod.id;mod.panel.hidden=true;$('#module-controls').append(mod.panel);
 mod.layer=document.createElement('div');mod.layer.className='module-layer';mod.layer.dataset.module=mod.id;mod.layer.style.zIndex=mod.order<100?2:18;$('#module-layers').append(mod.layer);
 if(mod.view){const btn=document.createElement('button');btn.className='nav-item';btn.dataset.view=mod.id;btn.append(icon(mod.view.icon||'grid'),document.createTextNode(mod.view.label||mod.name));btn.addEventListener('click',()=>setView(mod.id));$('#module-nav').append(btn);
  if(mod.view.page){mod.page=document.createElement('section');mod.page.className='module-page';mod.page.hidden=true;$('#module-pages').append(mod.page);}
  views[mod.id]={crumb:mod.view.label||mod.name,title:mod.view.title||mod.name,description:mod.view.description||'',inspector:mod.view.inspectorTitle||mod.name,module:mod};}
 defaults.modules[mod.id]??=clone(mod.defaults||{});state.modules[mod.id]??=clone(mod.defaults||{}); // registered after boot
 Rider.call(mod,'mount',{panel:mod.panel,layer:mod.layer,page:mod.page,api:Rider.api});
 if(booted){updateControls();scheduleRender();}
}
Rider.mount(mountModule);
renderPresets();renderWallpapers();updateControls();renderZones();renderDesktop();booted=true;
