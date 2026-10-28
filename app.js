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
const defaults = {floatPerson:false,floatPoints:[],floatX:null,floatY:null,floatSize:null,floatFlip:false,floatShadow:true,anchorY:50,sourceRatio:50,focusX:50,focusY:50,protectPerson:false,mode:'diagonal',angle:15,ratio:58,gap:16,gapColor:'#e9eff4',linked:true,aspect:1.6,wallpaper:'mountain',customImage:null,scale:100,showIcons:true,preset:'focus',zones:[{id:'work',name:'工作空间'},{id:'life',name:'日常灵感'}],items:[{id:'i1',name:'项目文件',kind:'folder',zone:'work'},{id:'i2',name:'设计稿',kind:'image',zone:'work'},{id:'i3',name:'开发工具',kind:'code',zone:'work'},{id:'i4',name:'灵感收藏',kind:'folder',zone:'life'},{id:'i5',name:'我的音乐',kind:'music',zone:'life'},{id:'i6',name:'旅行计划',kind:'file',zone:'life'}]};
const presets = [
 {id:'focus',name:'专注斜切',desc:'灵感与效率并行',mode:'diagonal',angle:15,ratio:58,gap:16,wallpaper:'mountain'},
 {id:'balance',name:'左右有序',desc:'工作生活，各得其所',mode:'vertical',angle:0,ratio:50,gap:22,wallpaper:'forest'},
 {id:'quiet',name:'纯粹留白',desc:'让注意力回到自己',mode:'single',angle:0,ratio:50,gap:0,wallpaper:'dusk'},
 {id:'freedom',name:'错落之间',desc:'不必循规蹈矩',mode:'diagonal',angle:-25,ratio:47,gap:38,wallpaper:'sand'}
];
function readStorage(key, fallback){try{return JSON.parse(localStorage.getItem(key)) || fallback;}catch{return fallback;}}
function validState(s){return s && ['single','vertical','diagonal'].includes(s.mode) && Array.isArray(s.zones) && s.zones.length>=1 && s.zones.length<=3 && Array.isArray(s.items) && s.items.length<=18 && [s.angle,s.ratio,s.gap,s.scale,s.aspect].every(Number.isFinite) && /^#[0-9a-f]{6}$/i.test(s.gapColor) && wallpapers.some(w=>w.id===s.wallpaper) && (s.customImage===null || /^data:image\/(jpeg|png|webp);base64,/.test(s.customImage));}
function normalizeState(input){const s={...clone(defaults),...input};
 const clamp=(value,min,max,fallback)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
 s.ratio=clamp(s.ratio,1,99,58);s.angle=clamp(s.angle,-80,80,15);s.anchorY=clamp(s.anchorY,1,99,50);s.sourceRatio=clamp(s.sourceRatio,5,95,50);s.focusX=clamp(s.focusX,0,100,50);s.focusY=clamp(s.focusY,0,100,50);s.gap=clamp(s.gap,0,60,16);s.scale=clamp(s.scale,100,160,100);
 s.protectPerson=typeof input.protectPerson==='boolean'?input.protectPerson:input.wallpaper==='portrait';
 s.floatPoints=Array.isArray(s.floatPoints)?s.floatPoints.filter(p=>p&&[p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)).slice(0,24).map(p=>({x:p.x,y:p.y,add:p.add!==false})):[];
 s.floatPerson=s.floatPerson===true&&s.floatPoints.length>0;s.floatFlip=s.floatFlip===true;s.floatShadow=s.floatShadow!==false;
 for(const [key,min,max] of [['floatX',-20,120],['floatY',-20,120],['floatSize',10,150]])s[key]=s[key]===null?null:clamp(s[key],min,max,null);return s;
}
let draft = readStorage('desktop-rider-draft',null);
let state = validState(draft) ? normalizeState(draft) : clone(defaults);
let saved = readStorage('desktop-rider-schemes',[]);
saved = Array.isArray(saved) ? saved.filter(s=>s && typeof s.id==='string' && typeof s.name==='string' && validState(s.state)) : [];
let pickingSplit=false;
let currentView='design', toastTimer, persistTimer, storageWarning=false;
const imageCache=new Map();
const noFloat={floatPerson:false,floatPoints:[],floatX:null,floatY:null,floatSize:null};
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
async function scene(s){const img=await loadImage(source(s));if(!floating(s))return {src:source(s),img,cut:null};const cut=await Cutout.separate(img,source(s),s.floatPoints);if(cut.empty)return {src:source(s),img,cut:null};return {src:cut.backgroundUrl,img:await loadImage(cut.backgroundUrl),cut,original:img};}
// Where the person sits in the uncut wallpaper: centre and height as % of the desktop.
function floatFrame(s,view,w,h){
 let {floatX:x,floatY:y,floatSize:size}=s;
 if(x===null||y===null||size===null){const p=Portrait.placement({...s,mode:'single'},view.original,w,h),b=view.cut.box;x??=(p.x+(b.x+b.w/2)*p.w)/w*100;y??=(p.y+(b.y+b.h/2)*p.h)/h*100;size??=Math.max(10,Math.min(150,b.h*p.h/h*100));}
 const fh=size/100*h,fw=fh*view.cut.cutout.width/view.cut.cutout.height;return {x,y,size,left:x/100*w-fw/2,top:y/100*h-fh/2,w:fw,h:fh};
}
function drawFloat(ctx,s,view,w,h){if(!view.cut)return;const f=floatFrame(s,view,w,h);ctx.save();if(s.floatShadow){ctx.shadowColor='#0b182c59';ctx.shadowBlur=w*.012;ctx.shadowOffsetY=w*.005;}ctx.translate(f.left+f.w/2,f.top+f.h/2);if(s.floatFlip)ctx.scale(-1,1);ctx.drawImage(view.cut.cutout,-f.w/2,-f.h/2,f.w,f.h);ctx.restore();}
function loadImage(src){if(imageCache.has(src))return imageCache.get(src);const p=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('壁纸读取失败，请重新导入图片'));img.src=src;});imageCache.set(src,p);return p;}
// Clip each rectangle against the split line; all dimensions are based on a 1600px canvas.
function geometry(s,w,h){
 const slope=Math.tan((s.mode==='diagonal'?s.angle:0)*Math.PI/180), normal=Math.hypot(1,slope), gap=s.gap*w/1600;
 const c=s.ratio/100*w+slope*(s.anchorY??50)/100*h;
 function polygon(bound,side){const points=[[0,0],[w,0],[w,h],[0,h]],out=[];
   for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4],da=side*(a[0]+slope*a[1]-bound),db=side*(b[0]+slope*b[1]-bound);if(da<=0)out.push(a);if((da<=0)!==(db<=0)){const t=da/(da-db);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}
   return out;
 }
 const endpoints=[];
 for(const p of [[c,0],[c-slope*h,h],...(Math.abs(slope)>1e-9?[[0,c/slope],[w,(c-w)/slope]]:[])])if(p[0]>=-1e-6&&p[0]<=w+1e-6&&p[1]>=-1e-6&&p[1]<=h+1e-6&&!endpoints.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.01))endpoints.push(p);
 endpoints.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 return {endpoints,polygons:s.mode==='single'?[[[0,0],[w,0],[w,h],[0,h]],[]]:[polygon(c-gap/2*normal,1),polygon(c+gap/2*normal,-1)]};
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
let renderSequence=0,portraitFrameSource=null,floatView=null;
function syncSplitGuide(s,w,h,geo){const line=$('#split-guide-line');$('#split-guide').setAttribute('viewBox',`0 0 ${w} ${h}`);if(geo.endpoints.length===2){const [a,b]=geo.endpoints;line.setAttribute('x1',a[0]);line.setAttribute('y1',a[1]);line.setAttribute('x2',b[0]);line.setAttribute('y2',b[1]);}$('#split-guide').hidden=s.mode==='single';}
// Positions the floating person from state alone, so dragging skips the wallpaper pipeline.
function placeFloat(){
 const el=$('#float-person'),desktop=$('#desktop'),w=desktop.clientWidth,h=desktop.clientHeight;
 if(!floatView?.cut||!floating(state)||floatView.key!==sceneKey(state)||!w){el.hidden=true;return null;}
 if(el.dataset.src!==floatView.cut.cutoutUrl){el.src=floatView.cut.cutoutUrl;el.dataset.src=floatView.cut.cutoutUrl;}
 const f=floatFrame(state,floatView,w,h);Object.assign(el.style,{left:f.left+'px',top:f.top+'px',width:f.w+'px',height:f.h+'px'});el.style.setProperty('--shadow-y',w*.005+'px');el.style.setProperty('--shadow-blur',w*.006+'px');
 el.classList.toggle('flip',state.floatFlip);el.classList.toggle('shadow',state.floatShadow);el.hidden=false;
 $('#float-size').value=f.size;$('#float-size-value').textContent=Math.round(f.size)+'%';$('#float-size').style.setProperty('--progress',(f.size-10)/140*100+'%');return f;
}
async function renderDesktop(){
 const seq=++renderSequence;const raw=clone(state),s={...raw,protectPerson:raw.protectPerson&&!floating(raw)},desktop=$('#desktop');desktop.style.aspectRatio=String(s.aspect);desktop.style.backgroundColor=s.gapColor;
 const w=desktop.clientWidth,h=desktop.clientHeight;if(!w||!h)return;
 const geo=geometry(s,w,h);syncSplitGuide(s,w,h,geo);
 ['#piece-left','#piece-right'].forEach((id,i)=>{const el=$(id),points=geo.polygons[i];el.style.display=points.length?'block':'none';el.style.clipPath='polygon('+points.map(p=>`${p[0]}px ${p[1]}px`).join(',')+')';});
 $('#split-handle').hidden=s.mode==='single';$('#split-handle').style.left=s.ratio+'%';$('#split-handle').style.top=(s.anchorY??50)+'%';
 ['#split-start','#split-end'].forEach((id,i)=>{const el=$(id),p=geo.endpoints[i];el.hidden=s.mode==='single'||!p;if(p){el.style.left=Math.max(8,Math.min(w-8,p[0]))+'px';el.style.top=Math.max(8,Math.min(h-8,p[1]))+'px';}});
 $('#desktop-zones').hidden=!s.showIcons;$('.desktop-dock').hidden=!s.showIcons;$('.desktop-greeting').hidden=s.protectPerson||floating(s)||!s.showIcons;
 $('#toggle-icons').textContent=s.showIcons?'隐藏桌面图标':'显示桌面图标';
 $('#desktop-caption').textContent=s.customImage?'我的壁纸':wallpapers.find(x=>x.id===s.wallpaper).name;
 $('#resolution-label').textContent=`1600 × ${Math.round(1600/s.aspect)}`;
 const portraitLayer=$('#portrait-layer'),key=sceneKey(s);
 const keepPortrait=s.protectPerson&&portraitFrameSource===key&&portraitLayer.width===w&&portraitLayer.height===h;
 portraitLayer.hidden=!keepPortrait;
 if(keepPortrait){$('#piece-left').style.display='none';$('#piece-right').style.display='none';}
 if(!floating(s))$('#float-person').hidden=true;else if(floatView?.key!==key)$('#float-status').textContent='正在本机抠出人物并补全背景…';
 try{const view=await scene(s);if(seq!==renderSequence)return;
 floatView=view.cut?{...view,key}:null;
 if(floating(s)){placeFloat();$('#float-status').textContent=view.cut?'人物已抠出 · 直接拖动画面中的人物，滚轮调整大小':'没有选中任何区域，请调整抠图范围';}
 ['#piece-left','#piece-right'].forEach((id,i)=>{const el=$(id),placement=s.protectPerson?Portrait.placement(s,view.img,w,h):wallpaperPlacement(s,view.img,w,h,geo.polygons[i],i);el.style.backgroundImage=`url("${view.src}")`;el.style.backgroundRepeat='no-repeat';el.style.backgroundSize=`${placement.w}px ${placement.h}px`;el.style.backgroundPosition=`${placement.x}px ${placement.y}px`;});
 if(s.protectPerson){
  // While recognition runs, keep the full original visible instead of cutting a face.
  if(!keepPortrait){$('#piece-left').style.clipPath='none';$('#piece-left').style.display='block';$('#piece-right').style.display='none';$('#person-status').textContent='正在本机识别人像…';}$('#retry-person').hidden=true;
  const result=await Portrait.render(s,view.img,w,h,geo,view.src);if(seq!==renderSequence)return;
  portraitFrameSource=key;portraitLayer.width=w;portraitLayer.height=h;portraitLayer.getContext('2d').drawImage(result.canvas,0,0);portraitLayer.hidden=false;
  $('#piece-left').style.display='none';$('#piece-right').style.display='none';
  $('#person-status').textContent=result.person.coverage>.005?'人物保护已就绪 · 分割缝从人物后方经过':'未检测到明显人物 · 仍按整图比例处理';
 }else{$('#person-status').textContent=floating(s)?'人物已悬浮，背景中不再需要人物保护':'在本机识别人像，不上传照片';$('#retry-person').hidden=true;}
 }catch(error){if(seq!==renderSequence)return;$('#person-status').textContent='人物识别失败，暂显示完整原图。可重试或关闭人物优先。';$('#retry-person').hidden=!s.protectPerson;if(floating(s))$('#float-status').textContent='抠图失败，可重试或调整抠图范围';toast(error.message);}
}

function updateControls(){
 ['angle','ratio','gap'].forEach(key=>{$('#'+key).value=state[key];$('#'+key+'-value').textContent=Math.round(state[key])+(key==='angle'?'°':key==='ratio'?'%':' px');});
 $('#angle').disabled=state.mode!=='diagonal';$('#ratio').disabled=state.mode==='single';$('#gap').disabled=state.mode==='single';$('#linked').disabled=state.mode==='single';
 $('#linked').checked=state.linked;
 for(const [id,key] of [['anchor-y','anchorY'],['source-cut','sourceRatio'],['focus-x','focusX'],['focus-y','focusY']]){$('#'+id).value=state[key];$('#'+id+'-value').textContent=Math.round(state[key]*10)/10+'%';}
 $('#split-handle').hidden=state.mode==='single';$('#split-start').hidden=state.mode==='single';$('#split-end').hidden=state.mode==='single';$('#anchor-y').disabled=state.mode==='single';$('#pick-split').disabled=state.mode==='single';$('#protect-person').checked=state.protectPerson;$('#linked').closest('.switch-row').querySelector('small').textContent=state.protectPerson?'拖动控制点，人物与画面一起移动':'左右画面随区域移动、缩放';
 $('#portrait-motion-hint').hidden=!state.protectPerson||!state.linked||state.mode==='single';
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
 $('#float-toggle').checked=state.floatPerson;$('#float-options').hidden=!state.floatPerson;$('#float-flip').checked=state.floatFlip;$('#float-shadow').checked=state.floatShadow;
 $('#protect-person').disabled=floating(state);if(!state.floatPerson)$('#float-status').textContent='打开后自动识别主体，也可以手动点选。';
}
let renderFrame;
function scheduleRender(){cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(()=>renderDesktop());}
function update({zones=false,custom=true}={}){if(custom)state.preset=null;updateControls();scheduleRender();if(zones)renderZones();persistDraft();}
function moveItem(itemId,zoneId){const item=state.items.find(x=>x.id===itemId);if(!item||!state.zones.some(z=>z.id===zoneId))return;const count=state.items.filter(x=>x.zone===zoneId).length;if(item.zone!==zoneId&&count>=6){toast('每个分区最多收纳 6 个快捷项');return;}item.zone=zoneId;update({zones:true,custom:false});}
function renderZones(){
 const root=$('#desktop-zones');root.replaceChildren();
 state.zones.forEach(zone=>{
 const box=document.createElement('section');box.className='desktop-zone';box.dataset.zone=zone.id;box.setAttribute('aria-label',zone.name+'收纳分区');
 const heading=document.createElement('div');heading.className='zone-heading';heading.append(icon('folder'));const title=document.createElement('span');title.textContent=zone.name;heading.append(title);
 const count=document.createElement('small');count.className='zone-count';count.textContent=state.items.filter(i=>i.zone===zone.id).length;heading.append(count);
 if(currentView==='manage'&&state.zones.length>1){const remove=document.createElement('button');remove.className='zone-delete';remove.textContent='×';remove.setAttribute('aria-label','删除'+zone.name+'分区');remove.addEventListener('click',()=>{const other=state.zones.find(z=>z.id!==zone.id);if(state.items.filter(i=>i.zone===zone.id||i.zone===other.id).length>6){toast('请先将部分快捷项移到其他分区，再删除此分区');return;}state.items.forEach(i=>{if(i.zone===zone.id)i.zone=other.id;});state.zones=state.zones.filter(z=>z.id!==zone.id);update({zones:true,custom:false});toast('分区已移除，快捷项已移至'+other.name);});heading.append(remove);}
 box.append(heading);const items=document.createElement('div');items.className='zone-items';
 state.items.filter(i=>i.zone===zone.id).forEach(item=>{const el=document.createElement('button');el.className='desktop-item';el.draggable=true;el.dataset.item=item.id;el.setAttribute('aria-label',item.name+'，按 Enter 移至下一个分区');el.title='拖动以整理；按 Enter 移至下一个分区';const art=document.createElement('span');art.className='item-art '+item.kind;art.append(icon(item.kind));const label=document.createElement('span');label.textContent=item.name;el.append(art,label);el.addEventListener('dragstart',event=>{event.dataTransfer.setData('text/plain',item.id);event.dataTransfer.effectAllowed='move';});el.addEventListener('click',()=>{const index=state.zones.findIndex(z=>z.id===item.zone);const next=state.zones[(index+1)%state.zones.length];moveItem(item.id,next.id);$(`[data-item="${item.id}"]`)?.focus();toast('已移至'+next.name);});items.append(el);});
 box.append(items);box.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';box.classList.add('drag-over');});box.addEventListener('dragleave',()=>box.classList.remove('drag-over'));box.addEventListener('drop',e=>{e.preventDefault();box.classList.remove('drag-over');moveItem(e.dataTransfer.getData('text/plain'),zone.id);});root.append(box);
 });
}
function renderPresets(){
 const root=$('#preset-grid');presets.forEach(p=>{const button=document.createElement('button');button.className='preset-card';button.dataset.preset=p.id;const thumb=document.createElement('div');thumb.className='preset-thumb';const a=document.createElement('div'),b=document.createElement('div');[a,b].forEach(el=>el.style.backgroundImage=`url("assets/${p.wallpaper}.svg")`);if(p.mode!=='single'){const tilt=p.mode==='diagonal'?p.angle*.7:0;const r=p.ratio;a.style.clipPath=`polygon(0 0,${r+tilt-1}% 0,${r-tilt-1}% 100%,0 100%)`;b.style.clipPath=`polygon(${r+tilt+1}% 0,100% 0,100% 100%,${r-tilt+1}% 100%)`;}else b.hidden=true;thumb.append(a,b);wallpaperCanvas({...clone(defaults),...p},480).then(canvas=>{a.style.backgroundImage=`url("${canvas.toDataURL('image/png')}")`;a.style.clipPath='none';b.hidden=true;}).catch(()=>{});const check=document.createElement('span');check.className='preset-check';check.append(icon('check'));thumb.append(check);const meta=document.createElement('div');meta.className='preset-meta';const name=document.createElement('strong');name.textContent=p.name;const desc=document.createElement('span');desc.textContent=p.desc;meta.append(name,desc);button.append(thumb,meta);button.addEventListener('click',()=>{Object.assign(state,{mode:p.mode,angle:p.angle,ratio:p.ratio,gap:p.gap,wallpaper:p.wallpaper,preset:p.id,customImage:null,scale:100,anchorY:50,sourceRatio:50,focusX:50,focusY:50,protectPerson:false,...noFloat});update({custom:false});toast('已载入「'+p.name+'」布局');});root.append(button);});
}
function renderWallpapers(){const root=$('#wallpaper-grid');wallpapers.forEach(w=>{const btn=document.createElement('button');btn.className='wallpaper-card';btn.dataset.wallpaper=w.id;const img=new Image();img.src=w.src;img.alt=w.name;const name=document.createElement('strong');name.textContent=w.name;const tone=document.createElement('small');tone.textContent=w.tone;btn.append(img,name,tone);btn.addEventListener('click',()=>{state.wallpaper=w.id;state.customImage=null;state.protectPerson=w.id==='portrait';Object.assign(state,noFloat);state.focusX=50;state.focusY=50;update();toast('已切换壁纸：'+w.name);});root.append(btn);});}
const viewCopy={design:['桌面设计','桌面，由你定义。','分开空间，连接灵感。创造一个刚刚好的桌面。','分裂设置'],wallpaper:['壁纸收藏','把喜欢，设为日常。','一片风景，一种心情。让壁纸成为你的灵感底色。','壁纸设置'],manage:['桌面管理','各就各位，井然有序。','给每一份工作与灵感，留一个专属的位置。','收纳设置'],saved:['我的方案','喜欢的桌面，随时回来。','收好每一次灵感，轻松切换你的桌面风格。','']};
function setView(view){pickingSplit=false;currentView=view;const c=viewCopy[view];$('#breadcrumb-current').textContent=c[0];$('#page-title').textContent=c[1];$('#page-description').textContent=c[2];$('#inspector-title').textContent=c[3];$$('[data-view]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.view===view);if(btn.dataset.view===view)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});$('#editor-view').hidden=view==='saved';$('#saved-view').hidden=view!=='saved';$('#design-controls').hidden=view!=='design';$('#wallpaper-controls').hidden=view!=='wallpaper';$('#manage-controls').hidden=view!=='manage';$('#presets-section').hidden=view==='wallpaper';$('#wallpapers-section').hidden=view!=='wallpaper';$('.inspector-tip').hidden=view!=='design';if(view==='saved')renderSaved();else{renderDesktop();renderZones();}updateControls();}
async function wallpaperCanvas(s,width=1600){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width/s.aspect);const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;ctx.fillStyle=s.gapColor;ctx.fillRect(0,0,w,h);const view=await scene(s),geo=geometry(s,w,h);
 if(s.protectPerson&&!view.cut)return (await Portrait.render(s,view.img,w,h,geo,view.src)).canvas;
 geo.polygons.forEach((points,i)=>{if(!points.length)return;ctx.save();ctx.beginPath();points.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();const placement=wallpaperPlacement(s,view.img,w,h,points,i);ctx.drawImage(view.img,placement.x,placement.y,placement.w,placement.h);ctx.restore();});
 drawFloat(ctx,s,view,w,h);return canvas;}
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function renderSaved(){const root=$('#saved-grid');root.replaceChildren();$('#empty-saved').hidden=saved.length>0;saved.forEach(entry=>{const card=document.createElement('article');card.className='saved-card';if(typeof entry.thumbnail==='string'&&entry.thumbnail.startsWith('data:image/')){const img=new Image();img.src=entry.thumbnail;img.alt=entry.name+'壁纸预览';card.append(img);}const content=document.createElement('div');content.className='saved-card-content';const heading=document.createElement('h3');heading.textContent=entry.name;const date=document.createElement('p');date.textContent='保存于 '+new Date(entry.createdAt).toLocaleDateString('zh-CN');const actions=document.createElement('div');actions.className='saved-card-actions';const load=document.createElement('button');load.className='button secondary';load.textContent='载入方案';load.addEventListener('click',()=>{state=normalizeState(entry.state);setView('design');update({zones:true,custom:false});toast('已载入「'+entry.name+'」');});const remove=document.createElement('button');remove.className='text-button';remove.textContent='删除';remove.addEventListener('click',()=>{const next=saved.filter(s=>s.id!==entry.id);try{localStorage.setItem('desktop-rider-schemes',JSON.stringify(next));saved=next;renderSaved();updateControls();toast('已删除方案「'+entry.name+'」');}catch{toast('删除未完成，无法写入浏览器存储');}});actions.append(load,remove);content.append(heading,date,actions);card.append(content);root.append(card);});}
$$('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
$('.brand').addEventListener('click',e=>{e.preventDefault();setView('design');});
$('#show-saved').addEventListener('click',()=>setView('saved'));$('#back-design').addEventListener('click',()=>setView('design'));
$$('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{state.mode=btn.dataset.mode;pickingSplit=false;update();}));
['angle','ratio','gap'].forEach(key=>$('#'+key).addEventListener('input',e=>{state[key]=Number(e.target.value);update();}));
for(const [id,key] of [['anchor-y','anchorY'],['source-cut','sourceRatio'],['focus-x','focusX'],['focus-y','focusY']])$('#'+id).addEventListener('input',e=>{state[key]=Number(e.target.value);update();});
$('#protect-person').addEventListener('change',e=>{state.protectPerson=e.target.checked;update();});
$('#retry-person').addEventListener('click',()=>renderDesktop());
$('#linked').addEventListener('change',e=>{state.linked=e.target.checked;update();});
$('#gap-color').addEventListener('input',e=>{state.gapColor=e.target.value;update();});
$('#aspect').addEventListener('change',e=>{state.aspect=Number(e.target.value);update();});
$('#wallpaper-scale').addEventListener('input',e=>{state.scale=Number(e.target.value);update();});
$('#toggle-icons').addEventListener('click',()=>{state.showIcons=!state.showIcons;update({custom:false});});
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
function useImage(picture,width,height,name){const max=2000,scale=Math.min(1,max/Math.max(width,height));const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(picture,0,0,canvas.width,canvas.height);state.customImage=canvas.toDataURL('image/jpeg',.88);state.scale=100;state.focusX=50;state.focusY=50;state.protectPerson=true;Object.assign(state,noFloat);update();toast('已导入「'+name+'」');}
$('#wallpaper-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('请选择 JPG、PNG 或 WebP 图片');e.target.value='';return;}if(file.size>20*1024*1024){toast('请选择小于 20 MB 的图片');e.target.value='';return;}const url=URL.createObjectURL(file);try{const img=await loadImage(url);useImage(img,img.naturalWidth,img.naturalHeight,file.name);}catch{toast('图片无法读取，请换一张图片重试');}finally{imageCache.delete(url);URL.revokeObjectURL(url);e.target.value='';}});
function addZone(){const name=$('#zone-name').value.trim();if(!name){toast('先给新分区起个名字');$('#zone-name').focus();return;}if(state.zones.length>=3){toast('当前布局最多支持 3 个收纳分区');return;}state.zones.push({id:crypto.randomUUID(),name});$('#zone-name').value='';state.showIcons=true;update({zones:true,custom:false});toast('已添加分区「'+name+'」');}
function addItem(){const name=$('#item-name').value.trim();if(!name){toast('请输入快捷项名称');$('#item-name').focus();return;}const zone=state.zones.find(z=>state.items.filter(i=>i.zone===z.id).length<6);if(!zone){toast('分区已满，请先新增收纳分区');return;}state.items.push({id:crypto.randomUUID(),name,kind:'file',zone:zone.id});$('#item-name').value='';state.showIcons=true;update({zones:true,custom:false});toast('已添加演示快捷项');}
$('#add-zone').addEventListener('click',addZone);$('#add-item').addEventListener('click',addItem);$('#zone-name').addEventListener('keydown',e=>{if(e.key==='Enter')addZone();});$('#item-name').addEventListener('keydown',e=>{if(e.key==='Enter')addItem();});
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
function pinFloat(){const f=placeFloat();if(f)Object.assign(state,{floatX:f.x,floatY:f.y,floatSize:f.size});return f;}
const clampFloat=v=>Math.max(-20,Math.min(120,Math.round(v*10)/10)),clampSize=v=>Math.max(10,Math.min(150,Math.round(v*10)/10));
$('#float-toggle').addEventListener('change',async e=>{
 if(!e.target.checked){state.floatPerson=false;update();return;}
 if(state.floatPoints.length){state.floatPerson=true;update();return;}
 e.target.disabled=true;$('#float-status').textContent='正在识别画面主体…';
 try{const img=await loadImage(source()),point=await Cutout.autoPoint(img,source());
  if(point){Object.assign(state,{...noFloat,floatPerson:true,floatPoints:[point]});update();}
  else{e.target.checked=false;$('#float-status').textContent='没有自动找到人物，请手动点选。';openCutout();}
 }catch(error){e.target.checked=false;$('#float-status').textContent='识别失败，可以手动点选人物。';toast(error.message);}finally{e.target.disabled=false;}
});
$('#float-size').addEventListener('input',e=>{pinFloat();state.floatSize=clampSize(Number(e.target.value));updateFloat();});
$('#float-flip').addEventListener('change',e=>{state.floatFlip=e.target.checked;updateFloat();});
$('#float-shadow').addEventListener('change',e=>{state.floatShadow=e.target.checked;updateFloat();});
$('#float-reset').addEventListener('click',()=>{Object.assign(state,{floatX:null,floatY:null,floatSize:null});updateFloat();toast('人物已放回原位置');});
$('#edit-cutout').addEventListener('click',()=>openCutout());
const floatEl=$('#float-person');let floatDrag=null;
floatEl.addEventListener('pointerdown',event=>{const f=pinFloat();if(!f)return;const b=$('#desktop').getBoundingClientRect();floatDrag={pointerId:event.pointerId,dx:event.clientX-b.left-f.x/100*b.width,dy:event.clientY-b.top-f.y/100*b.height};floatEl.setPointerCapture(event.pointerId);floatEl.classList.add('dragging');event.preventDefault();});
floatEl.addEventListener('pointermove',event=>{if(floatDrag?.pointerId!==event.pointerId)return;const b=$('#desktop').getBoundingClientRect();state.floatX=clampFloat((event.clientX-b.left-floatDrag.dx)/b.width*100);state.floatY=clampFloat((event.clientY-b.top-floatDrag.dy)/b.height*100);updateFloat();});
const endFloatDrag=()=>{floatDrag=null;floatEl.classList.remove('dragging');};
floatEl.addEventListener('pointerup',endFloatDrag);floatEl.addEventListener('pointercancel',endFloatDrag);floatEl.addEventListener('lostpointercapture',endFloatDrag);
floatEl.addEventListener('wheel',event=>{event.preventDefault();const f=pinFloat();if(!f)return;state.floatSize=clampSize(f.size*Math.exp(-event.deltaY*.0015));updateFloat();},{passive:false});
floatEl.addEventListener('keydown',event=>{const step=event.shiftKey?5:1,moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
 if(moves[event.key]){event.preventDefault();pinFloat();state.floatX=clampFloat(state.floatX+moves[event.key][0]);state.floatY=clampFloat(state.floatY+moves[event.key][1]);updateFloat();}
 else if(['+','=','-','_'].includes(event.key)){event.preventDefault();pinFloat();state.floatSize=clampSize(state.floatSize+(['+','='].includes(event.key)?step:-step));updateFloat();}
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
$('#cutout-apply').addEventListener('click',()=>{const points=cutDraft.points;if(!points.some(p=>p.add)){Object.assign(state,noFloat);}else{state.floatPoints=points;state.floatPerson=true;}$('#cutout-dialog').close();update();if(state.floatPerson)toast('人物已抠出，可在预览中直接拖动');});
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
 try{if(weChoice.kind==='video'){const video=$('#we-video');if(video.readyState<2)await new Promise((resolve,reject)=>{video.addEventListener('loadeddata',resolve,{once:true});video.addEventListener('error',()=>reject(new Error('视频无法解码')),{once:true});});if(video.seeking)await new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));useImage(video,video.videoWidth,video.videoHeight,weItem.title);}
  else if(weChoice.kind==='compose'){$('#we-status').textContent='正在合成图层…';const picture=await WallpaperEngine.composeScene(weItem);if(!picture)throw new Error('图层合成失败，可改选单个图层');const bitmap=await createImageBitmap(picture.blob);useImage(bitmap,bitmap.width,bitmap.height,weItem.title);bitmap.close();}
  else{const bitmap=await createImageBitmap(weChoice.blob);useImage(bitmap,bitmap.width,bitmap.height,weItem.title);bitmap.close();}
  $('#we-dialog').close();
 }catch(error){toast('导入失败：'+(error.message||'无法读取这张图片'));}finally{button.disabled=false;}
});
new ResizeObserver(()=>scheduleRender()).observe($('#desktop'));
function updateClock(){const now=new Date();$('#clock').textContent=now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});$('.desktop-top>span:last-child').firstChild.textContent=now.toLocaleDateString('zh-CN',{weekday:'short',month:'long',day:'numeric'})+' ';}
updateClock();setInterval(updateClock,60000);
renderPresets();renderWallpapers();updateControls();renderZones();renderDesktop();
