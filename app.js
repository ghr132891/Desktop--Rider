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
const defaults = {anchorY:50,sourceRatio:50,focusX:50,focusY:50,protectPerson:false,mode:'diagonal',angle:15,ratio:58,gap:16,gapColor:'#e9eff4',linked:true,aspect:1.6,wallpaper:'mountain',customImage:null,scale:100,showIcons:true,preset:'focus',zones:[{id:'work',name:'工作空间'},{id:'life',name:'日常灵感'}],items:[{id:'i1',name:'项目文件',kind:'folder',zone:'work'},{id:'i2',name:'设计稿',kind:'image',zone:'work'},{id:'i3',name:'开发工具',kind:'code',zone:'work'},{id:'i4',name:'灵感收藏',kind:'folder',zone:'life'},{id:'i5',name:'我的音乐',kind:'music',zone:'life'},{id:'i6',name:'旅行计划',kind:'file',zone:'life'}]};
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
 s.protectPerson=typeof input.protectPerson==='boolean'?input.protectPerson:input.wallpaper==='portrait';return s;
}
let draft = readStorage('desktop-rider-draft',null);
let state = validState(draft) ? normalizeState(draft) : clone(defaults);
let saved = readStorage('desktop-rider-schemes',[]);
saved = Array.isArray(saved) ? saved.filter(s=>s && typeof s.id==='string' && typeof s.name==='string' && validState(s.state)) : [];
let pickingSplit=false;
let currentView='design', toastTimer, persistTimer, storageWarning=false;
const imageCache=new Map();
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-'+name);svg.append(use);return svg;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function persistNow(){clearTimeout(persistTimer);try{localStorage.setItem('desktop-rider-draft',JSON.stringify(state));}catch{if(!storageWarning){toast('浏览器存储已满，当前修改暂未自动保存');storageWarning=true;}}}
function persistDraft(){clearTimeout(persistTimer);persistTimer=setTimeout(persistNow,250);}
window.addEventListener('pagehide',persistNow);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistNow();});
function source(s=state){return s.customImage || wallpapers.find(w=>w.id===s.wallpaper).src;}
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
let renderSequence=0,portraitFrameSource=null;
function syncSplitGuide(s,w,h,geo){const line=$('#split-guide-line');$('#split-guide').setAttribute('viewBox',`0 0 ${w} ${h}`);if(geo.endpoints.length===2){const [a,b]=geo.endpoints;line.setAttribute('x1',a[0]);line.setAttribute('y1',a[1]);line.setAttribute('x2',b[0]);line.setAttribute('y2',b[1]);}$('#split-guide').hidden=s.mode==='single';}
async function renderDesktop(){
 const seq=++renderSequence;const s=clone(state),desktop=$('#desktop');desktop.style.aspectRatio=String(s.aspect);desktop.style.backgroundColor=s.gapColor;
 const w=desktop.clientWidth,h=desktop.clientHeight;if(!w||!h)return;
 const geo=geometry(s,w,h);syncSplitGuide(s,w,h,geo);
 ['#piece-left','#piece-right'].forEach((id,i)=>{const el=$(id),points=geo.polygons[i];el.style.display=points.length?'block':'none';el.style.clipPath='polygon('+points.map(p=>`${p[0]}px ${p[1]}px`).join(',')+')';});
 $('#split-handle').hidden=s.mode==='single';$('#split-handle').style.left=s.ratio+'%';$('#split-handle').style.top=(s.anchorY??50)+'%';
 ['#split-start','#split-end'].forEach((id,i)=>{const el=$(id),p=geo.endpoints[i];el.hidden=s.mode==='single'||!p;if(p){el.style.left=Math.max(8,Math.min(w-8,p[0]))+'px';el.style.top=Math.max(8,Math.min(h-8,p[1]))+'px';}});
 $('#desktop-zones').hidden=!s.showIcons;$('.desktop-dock').hidden=!s.showIcons;$('.desktop-greeting').hidden=s.protectPerson||!s.showIcons;
 $('#toggle-icons').textContent=s.showIcons?'隐藏桌面图标':'显示桌面图标';
 $('#desktop-caption').textContent=s.customImage?'我的壁纸':wallpapers.find(x=>x.id===s.wallpaper).name;
 $('#resolution-label').textContent=`1600 × ${Math.round(1600/s.aspect)}`;
 const portraitLayer=$('#portrait-layer');
 const keepPortrait=s.protectPerson&&portraitFrameSource===source(s)&&portraitLayer.width===w&&portraitLayer.height===h;
 portraitLayer.hidden=!keepPortrait;
 if(keepPortrait){$('#piece-left').style.display='none';$('#piece-right').style.display='none';}
 try{const img=await loadImage(source(s));if(seq!==renderSequence)return;
 ['#piece-left','#piece-right'].forEach((id,i)=>{const el=$(id),placement=s.protectPerson?Portrait.placement(s,img,w,h):wallpaperPlacement(s,img,w,h,geo.polygons[i],i);el.style.backgroundImage=`url("${source(s)}")`;el.style.backgroundRepeat='no-repeat';el.style.backgroundSize=`${placement.w}px ${placement.h}px`;el.style.backgroundPosition=`${placement.x}px ${placement.y}px`;});
 if(s.protectPerson){
  // While recognition runs, keep the full original visible instead of cutting a face.
  if(!keepPortrait){$('#piece-left').style.clipPath='none';$('#piece-left').style.display='block';$('#piece-right').style.display='none';$('#person-status').textContent='正在本机识别人像…';}$('#retry-person').hidden=true;
  const result=await Portrait.render(s,img,w,h,geo,source(s));if(seq!==renderSequence)return;
  portraitFrameSource=source(s);portraitLayer.width=w;portraitLayer.height=h;portraitLayer.getContext('2d').drawImage(result.canvas,0,0);portraitLayer.hidden=false;
  $('#piece-left').style.display='none';$('#piece-right').style.display='none';
  $('#person-status').textContent=result.person.coverage>.005?'人物保护已就绪 · 分割缝从人物后方经过':'未检测到明显人物 · 仍按整图比例处理';
 }else{$('#person-status').textContent='在本机识别人像，不上传照片';$('#retry-person').hidden=true;}
 }catch(error){if(seq!==renderSequence)return;$('#person-status').textContent='人物识别失败，暂显示完整原图。可重试或关闭人物优先。';$('#retry-person').hidden=!s.protectPerson;toast(error.message);}
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
 const root=$('#preset-grid');presets.forEach(p=>{const button=document.createElement('button');button.className='preset-card';button.dataset.preset=p.id;const thumb=document.createElement('div');thumb.className='preset-thumb';const a=document.createElement('div'),b=document.createElement('div');[a,b].forEach(el=>el.style.backgroundImage=`url("assets/${p.wallpaper}.svg")`);if(p.mode!=='single'){const tilt=p.mode==='diagonal'?p.angle*.7:0;const r=p.ratio;a.style.clipPath=`polygon(0 0,${r+tilt-1}% 0,${r-tilt-1}% 100%,0 100%)`;b.style.clipPath=`polygon(${r+tilt+1}% 0,100% 0,100% 100%,${r-tilt+1}% 100%)`;}else b.hidden=true;thumb.append(a,b);wallpaperCanvas({...clone(defaults),...p},480).then(canvas=>{a.style.backgroundImage=`url("${canvas.toDataURL('image/png')}")`;a.style.clipPath='none';b.hidden=true;}).catch(()=>{});const check=document.createElement('span');check.className='preset-check';check.append(icon('check'));thumb.append(check);const meta=document.createElement('div');meta.className='preset-meta';const name=document.createElement('strong');name.textContent=p.name;const desc=document.createElement('span');desc.textContent=p.desc;meta.append(name,desc);button.append(thumb,meta);button.addEventListener('click',()=>{Object.assign(state,{mode:p.mode,angle:p.angle,ratio:p.ratio,gap:p.gap,wallpaper:p.wallpaper,preset:p.id,customImage:null,scale:100,anchorY:50,sourceRatio:50,focusX:50,focusY:50,protectPerson:false});update({custom:false});toast('已载入「'+p.name+'」布局');});root.append(button);});
}
function renderWallpapers(){const root=$('#wallpaper-grid');wallpapers.forEach(w=>{const btn=document.createElement('button');btn.className='wallpaper-card';btn.dataset.wallpaper=w.id;const img=new Image();img.src=w.src;img.alt=w.name;const name=document.createElement('strong');name.textContent=w.name;const tone=document.createElement('small');tone.textContent=w.tone;btn.append(img,name,tone);btn.addEventListener('click',()=>{state.wallpaper=w.id;state.customImage=null;state.protectPerson=w.id==='portrait';state.focusX=50;state.focusY=50;update();toast('已切换壁纸：'+w.name);});root.append(btn);});}
const viewCopy={design:['桌面设计','桌面，由你定义。','分开空间，连接灵感。创造一个刚刚好的桌面。','分裂设置'],wallpaper:['壁纸收藏','把喜欢，设为日常。','一片风景，一种心情。让壁纸成为你的灵感底色。','壁纸设置'],manage:['桌面管理','各就各位，井然有序。','给每一份工作与灵感，留一个专属的位置。','收纳设置'],saved:['我的方案','喜欢的桌面，随时回来。','收好每一次灵感，轻松切换你的桌面风格。','']};
function setView(view){pickingSplit=false;currentView=view;const c=viewCopy[view];$('#breadcrumb-current').textContent=c[0];$('#page-title').textContent=c[1];$('#page-description').textContent=c[2];$('#inspector-title').textContent=c[3];$$('[data-view]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.view===view);if(btn.dataset.view===view)btn.setAttribute('aria-current','page');else btn.removeAttribute('aria-current');});$('#editor-view').hidden=view==='saved';$('#saved-view').hidden=view!=='saved';$('#design-controls').hidden=view!=='design';$('#wallpaper-controls').hidden=view!=='wallpaper';$('#manage-controls').hidden=view!=='manage';$('#presets-section').hidden=view==='wallpaper';$('#wallpapers-section').hidden=view!=='wallpaper';$('.inspector-tip').hidden=view!=='design';if(view==='saved')renderSaved();else{renderDesktop();renderZones();}updateControls();}
async function wallpaperCanvas(s,width=1600){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width/s.aspect);const ctx=canvas.getContext('2d');const w=canvas.width,h=canvas.height;ctx.fillStyle=s.gapColor;ctx.fillRect(0,0,w,h);const img=await loadImage(source(s));const geo=geometry(s,w,h);if(s.protectPerson)return (await Portrait.render(s,img,w,h,geo,source(s))).canvas;geo.polygons.forEach((points,i)=>{if(!points.length)return;ctx.save();ctx.beginPath();points.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();const placement=wallpaperPlacement(s,img,w,h,points,i);ctx.drawImage(img,placement.x,placement.y,placement.w,placement.h);ctx.restore();});return canvas;}
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
$('#wallpaper-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('请选择 JPG、PNG 或 WebP 图片');e.target.value='';return;}if(file.size>20*1024*1024){toast('请选择小于 20 MB 的图片');e.target.value='';return;}const url=URL.createObjectURL(file);try{const img=await loadImage(url);const max=2000,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);state.customImage=canvas.toDataURL('image/jpeg',.88);state.scale=100;state.focusX=50;state.focusY=50;state.protectPerson=true;update();toast('已导入「'+file.name+'」');}catch{toast('图片无法读取，请换一张图片重试');}finally{imageCache.delete(url);URL.revokeObjectURL(url);e.target.value='';}});
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
new ResizeObserver(()=>scheduleRender()).observe($('#desktop'));
function updateClock(){const now=new Date();$('#clock').textContent=now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});$('.desktop-top>span:last-child').firstChild.textContent=now.toLocaleDateString('zh-CN',{weekday:'short',month:'long',day:'numeric'})+' ';}
updateClock();setInterval(updateClock,60000);
renderPresets();renderWallpapers();updateControls();renderZones();renderDesktop();
