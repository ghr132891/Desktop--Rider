'use strict';
// 图层: free-canvas elements over the split wallpaper — pictures, videos and shapes, each with its own
// position, size, rotation, flip, opacity, blur / hue / saturation / brightness, blend mode, rounded
// corners and a place below or above the floating person. Items are dragged, scaled (wheel, handles)
// and rotated (knob) right in the preview; the panel lists them and edits the selected one. Pictures
// are stored in the scheme (≤1600px); videos live in this browser's IndexedDB like the live wallpaper.
// Two registrations share one state slice: `layers` (order 60, below the person) renders and draws the
// items with above=false, `layers-top` (order 260) those with above=true and hosts the selection box.
const LayersModule=Rider.register({
 id:'layers',name:'图层',order:60,
 defaults:{items:[],active:null},
 BLENDS:['normal','multiply','screen','overlay','soft-light','lighten','darken','difference'],
 normalize(m,{clamp}){
  const str=(v,max)=>typeof v==='string'?v.slice(0,max):'',color=(v,d)=>/^#[0-9a-f]{6}$/i.test(v||'')?v.toLowerCase():d;
  const items=(Array.isArray(m.items)?m.items:[]).filter(it=>it&&typeof it==='object'&&['image','video','shape'].includes(it.type)).slice(0,24).map(it=>({
   id:/^[a-z0-9-]{1,40}$/.test(it.id||'')?it.id:'l'+Math.random().toString(36).slice(2,10),type:it.type,name:str(it.name,40)||{image:'图片',video:'视频',shape:'形状'}[it.type],
   x:clamp(it.x,-50,150,50),y:clamp(it.y,-50,150,50),w:clamp(it.w,2,300,40),h:clamp(it.h,2,300,30),rotate:clamp(it.rotate,-180,180,0),opacity:clamp(it.opacity,0,100,100),
   blur:clamp(it.blur,0,10,0),hue:clamp(it.hue,-180,180,0),saturate:clamp(it.saturate,0,200,100),brightness:clamp(it.brightness,0,200,100),radius:clamp(it.radius,0,50,0),
   blend:this.BLENDS.includes(it.blend)?it.blend:'normal',flipX:it.flipX===true,above:it.above===true,hidden:it.hidden===true,locked:it.locked===true,
   fit:['cover','contain','fill'].includes(it.fit)?it.fit:'cover',shape:it.shape==='ellipse'?'ellipse':'rect',fill:color(it.fill,'#4278df'),fill2:/^#[0-9a-f]{6}$/i.test(it.fill2||'')?it.fill2.toLowerCase():null,
   src:it.type==='image'&&typeof it.src==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(it.src)?it.src:null,
   video:it.type==='video'&&it.video&&typeof it.video==='object'?{name:str(it.video.name,80),width:clamp(it.video.width,0,16384,0),height:clamp(it.video.height,0,16384,0)}:null}));
  return {items,active:items.some(it=>it.id===m.active)?m.active:null};
 },
 view:{label:'图层',icon:'layers',title:'自由叠放图片、视频与形状。',description:'每一层都能在预览里直接拖动、缩放、旋转；右侧调整透明度、模糊、色调、混合模式，并决定放在人物之下还是之上。',inspectorTitle:'图层'},
 els:new Map(),videos:new Map(),urls:new Map(),box:null,drag:null,
 mount({panel,layer,api}){
  this.api=api;this.layerBelow=layer;
  panel.innerHTML=`<p class="inspector-description">图片保存在方案里（最长边 1600px），视频只保存在这台浏览器。图层随方案保存，导出 PNG 时按同样的变换与滤镜画出。</p>
<div class="layers-add"><button class="button secondary" id="layers-add-image"><svg><use href="#i-image"/></svg>图片</button><button class="button secondary" id="layers-add-video"><svg><use href="#i-play"/></svg>视频</button><button class="button secondary" id="layers-add-shape"><svg><use href="#i-grid"/></svg>形状</button></div>
<input type="file" id="layers-image" accept="image/png,image/jpeg,image/webp" hidden><input type="file" id="layers-video" accept="video/mp4,video/webm,video/quicktime" hidden>
<div id="layers-list" class="layers-list" role="listbox" aria-label="图层列表"></div><p id="layers-empty" class="field-hint">还没有图层。添加图片、视频或形状后，在预览里直接拖动它们。</p>
<div id="layers-props" hidden>
<div class="layers-name"><input id="layers-name" maxlength="40" aria-label="图层名称"><div class="layers-tools"><button class="text-button" id="layers-dup">复制</button><button class="text-button" id="layers-down">下移</button><button class="text-button" id="layers-up">上移</button><button class="text-button" id="layers-delete">删除</button></div></div>
<div class="control-section"><div class="switch-row"><div><label for="layers-above">放在人物之上</label><small>关闭则在壁纸与人物之间</small></div><input type="checkbox" id="layers-above" class="switch"></div><div class="switch-row"><label for="layers-hidden">隐藏</label><input type="checkbox" id="layers-hidden" class="switch"></div><div class="switch-row"><label for="layers-locked">锁定位置</label><input type="checkbox" id="layers-locked" class="switch"></div><div class="switch-row"><label for="layers-flip">水平翻转</label><input type="checkbox" id="layers-flip" class="switch"></div></div>
<div class="control-section layers-shape-only"><div class="layers-row"><label for="layers-shape">形状</label><select id="layers-shape"><option value="rect">矩形</option><option value="ellipse">椭圆</option></select></div><div class="color-row"><label for="layers-fill">填充颜色</label><div class="color-input"><input type="color" id="layers-fill" value="#4278df"></div></div><div class="color-row"><label for="layers-fill2">渐变到</label><div class="color-input"><input type="color" id="layers-fill2" value="#ffffff"><button class="text-button" id="layers-fill2-off">取消渐变</button></div></div></div>
<div class="control-section layers-image-only"><div class="layers-row"><label for="layers-fit">填充方式</label><select id="layers-fit"><option value="cover">铺满裁切</option><option value="contain">完整显示</option><option value="fill">拉伸</option></select></div></div>
<div class="control-section sliders">${[['x','横向位置',-50,150,'%'],['y','纵向位置',-50,150,'%'],['w','宽度',2,300,'%'],['h','高度',2,300,'%'],['rotate','旋转',-180,180,'°'],['opacity','不透明度',0,100,'%'],['blur','模糊',0,10,''],['hue','色相',-180,180,'°'],['saturate','饱和度',0,200,'%'],['brightness','亮度',0,200,'%'],['radius','圆角',0,50,'%']].map(([k,n,a,b])=>`<div class="slider-control"><div class="control-label"><label for="layers-${k}">${n}</label><output id="layers-${k}-value"></output></div><input id="layers-${k}" data-key="${k}" type="range" min="${a}" max="${b}" step="${k==='blur'?.1:1}"></div>`).join('')}</div>
<div class="layers-row"><label for="layers-blend">混合模式</label><select id="layers-blend">${this.BLENDS.map(b=>`<option value="${b}">${{normal:'正常',multiply:'正片叠底',screen:'滤色',overlay:'叠加','soft-light':'柔光',lighten:'变亮',darken:'变暗',difference:'差值'}[b]}</option>`).join('')}</select></div>
<p class="field-hint">预览里：拖动移动，滚轮缩放，四角等比缩放，边中点改宽高，上方圆点旋转（Shift 吸附 15°）；方向键微调，Delete 删除。</p></div>`;
  const $=q=>panel.querySelector(q);this.$=$;
  $('#layers-add-image').addEventListener('click',()=>$('#layers-image').click());$('#layers-add-video').addEventListener('click',()=>$('#layers-video').click());
  $('#layers-add-shape').addEventListener('click',()=>this.add({type:'shape',name:'形状',w:30,h:30}));
  $('#layers-image').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{await this.addImage(file);}catch(error){api.toast(error.message);}});
  $('#layers-video').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{await this.addVideo(file);}catch(error){api.toast(error.message);}});
  $('#layers-list').addEventListener('click',e=>{const row=e.target.closest('[data-id]');if(!row)return;const it=this.byId(row.dataset.id);if(!it)return;const act=e.target.closest('button')?.dataset.act;
   if(act==='eye'){it.hidden=!it.hidden;}else if(act==='lock'){it.locked=!it.locked;}this.me().active=it.id;this.changed();});
  $('#layers-name').addEventListener('input',e=>{const it=this.active();if(it){it.name=e.target.value.slice(0,40);this.changed(false);}});
  for(const [id,key] of [['layers-above','above'],['layers-hidden','hidden'],['layers-locked','locked'],['layers-flip','flipX']])$('#'+id).addEventListener('change',e=>{const it=this.active();if(it){it[key]=e.target.checked;this.changed();}});
  for(const [id,key] of [['layers-shape','shape'],['layers-fit','fit'],['layers-blend','blend']])$('#'+id).addEventListener('change',e=>{const it=this.active();if(it){it[key]=e.target.value;this.changed();}});
  $('#layers-fill').addEventListener('input',e=>{const it=this.active();if(it){it.fill=e.target.value;this.changed();}});$('#layers-fill2').addEventListener('input',e=>{const it=this.active();if(it){it.fill2=e.target.value;this.changed();}});$('#layers-fill2-off').addEventListener('click',()=>{const it=this.active();if(it){it.fill2=null;this.changed();}});
  panel.querySelectorAll('input[data-key]').forEach(el=>el.addEventListener('input',e=>{const it=this.active();if(it){it[e.target.dataset.key]=Number(e.target.value);this.changed();}}));
  $('#layers-dup').addEventListener('click',()=>{const it=this.active();if(!it||this.me().items.length>=24)return;const copy={...it,id:this.newId(),name:it.name+' 副本',x:Math.min(150,it.x+4),y:Math.min(150,it.y+4)};if(it.type==='video'){const blob=this.videos.get(it.id)?.blob;if(blob)this.keepVideo(copy.id,blob);}this.me().items.push(copy);this.me().active=copy.id;this.changed();});
  $('#layers-up').addEventListener('click',()=>this.move(1));$('#layers-down').addEventListener('click',()=>this.move(-1));$('#layers-delete').addEventListener('click',()=>this.remove(this.active()));
  this.box=document.createElement('div');this.box.className='layer-box';this.box.hidden=true;this.box.innerHTML=['nw','n','ne','e','se','s','sw','w'].map(h=>`<b class="lb-handle" data-h="${h}"></b>`).join('')+'<b class="lb-handle lb-rotate" data-h="rot" title="拖动旋转，按住 Shift 吸附 15°"></b>';
  this.box.addEventListener('pointerdown',e=>this.handleDown(e));this.box.addEventListener('pointermove',e=>this.pointerMove(e));this.box.addEventListener('pointerup',e=>this.pointerUp(e));this.box.addEventListener('pointercancel',e=>this.pointerUp(e));
  document.addEventListener('keydown',e=>this.keydown(e));
  this.restoreVideos();
 },
 me(){return this.api.state.modules.layers;},byId(id){return this.me().items.find(it=>it.id===id);},active(){return this.byId(this.me().active);},newId(){return 'l'+Math.random().toString(36).slice(2,10);},
 changed(render=true){this.api.update({custom:false});if(!render)this.sync({s:this.api.state,panel:this.$('#layers-list').parentElement});},
 add(fields){const m=this.me();if(m.items.length>=24)throw new Error('最多 24 个图层');const it=this.normalize({items:[{id:this.newId(),x:50,y:50,...fields}]},{clamp:(v,a,b,d)=>Number.isFinite(v)?Math.max(a,Math.min(b,v)):d}).items[0];m.items.push(it);m.active=it.id;this.changed();this.api.setView('layers');return it;},
 async addImage(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片');if(file.size>20*1024*1024)throw new Error('请选择小于 20 MB 的图片');
  const url=URL.createObjectURL(file);try{const img=await this.api.loadImage(url),k=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
   const w=40,h=Math.min(300,w*this.api.state.aspect*img.naturalHeight/img.naturalWidth);this.add({type:'image',name:file.name.replace(/\.[^.]+$/,'').slice(0,40)||'图片',w,h,src:c.toDataURL(file.type==='image/png'?'image/png':'image/jpeg',.88)});this.api.toast('已添加图层「'+file.name+'」');}
  finally{URL.revokeObjectURL(url);}
 },
 // Videos: blob in IndexedDB under the item id, an object URL for the <video> in the preview.
 db(){return this._db??=new Promise((resolve,reject)=>{const r=indexedDB.open('desktop-rider-layers',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
 async store(op,key,value){const db=await this.db();return new Promise((resolve,reject)=>{const st=db.transaction('files','readwrite').objectStore('files'),q=op==='get'?st.get(key):op==='put'?st.put(value,key):st.delete(key);q.onsuccess=()=>resolve(q.result??null);q.onerror=()=>reject(q.error);});},
 keepVideo(id,blob){const url=URL.createObjectURL(blob),video=Object.assign(document.createElement('video'),{muted:true,loop:true,playsInline:true,preload:'auto',src:url});video.className='layer-video';this.videos.set(id,{blob,url,video});this.store('put',id,blob).catch(()=>this.api.toast('视频无法写入浏览器存储，刷新后需重新添加'));video.play().catch(()=>{});return video;},
 async addVideo(file){
  if(!/^video\//.test(file.type||''))throw new Error('请选择 MP4 或 WebM 视频');if(file.size>300*1024*1024)throw new Error('视频需小于 300 MB');
  const id=this.newId(),video=this.keepVideo(id,file);await new Promise((resolve,reject)=>{video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',()=>reject(new Error('视频无法解码')),{once:true});});
  const w=40,h=Math.min(300,w*this.api.state.aspect*video.videoHeight/video.videoWidth);const m=this.me();if(m.items.length>=24){this.videos.delete(id);throw new Error('最多 24 个图层');}
  const it={id,type:'video',name:file.name.replace(/\.[^.]+$/,'').slice(0,40)||'视频',x:50,y:50,w,h,rotate:0,opacity:100,blur:0,hue:0,saturate:100,brightness:100,radius:0,blend:'normal',flipX:false,above:false,hidden:false,locked:false,fit:'cover',shape:'rect',fill:'#4278df',fill2:null,src:null,video:{name:file.name.slice(0,80),width:video.videoWidth,height:video.videoHeight}};
  m.items.push(it);m.active=id;this.changed();this.api.setView('layers');this.api.toast('已添加视频图层「'+file.name+'」');
 },
 async restoreVideos(){for(const it of this.me().items)if(it.type==='video'&&!this.videos.has(it.id)){try{const blob=await this.store('get',it.id);if(blob){const url=URL.createObjectURL(blob),video=Object.assign(document.createElement('video'),{muted:true,loop:true,playsInline:true,preload:'auto',src:url});video.className='layer-video';this.videos.set(it.id,{blob,url,video});video.play().catch(()=>{});}}catch{}}this.api.scheduleRender();},
 move(dir){const m=this.me(),i=m.items.findIndex(it=>it.id===m.active),j=i+dir;if(i<0||j<0||j>=m.items.length)return;[m.items[i],m.items[j]]=[m.items[j],m.items[i]];this.changed();},
 remove(it){if(!it)return;const m=this.me();m.items=m.items.filter(x=>x!==it);if(m.active===it.id)m.active=null;if(it.type==='video'){const v=this.videos.get(it.id);if(v){URL.revokeObjectURL(v.url);v.video.pause();this.videos.delete(it.id);}this.store('delete',it.id).catch(()=>{});}this.changed();},
 // Geometry in desktop pixels: the box is centred on (x,y) with w/h in % of the desktop.
 frame(it,w,h){const bw=it.w/100*w,bh=it.h/100*h;return {left:it.x/100*w-bw/2,top:it.y/100*h-bh/2,w:bw,h:bh,cx:it.x/100*w,cy:it.y/100*h};},
 filter(it,w){const f=[];if(it.blur)f.push(`blur(${it.blur/100*w}px)`);if(it.hue)f.push(`hue-rotate(${it.hue}deg)`);if(it.saturate!==100)f.push(`saturate(${it.saturate/100})`);if(it.brightness!==100)f.push(`brightness(${it.brightness/100})`);return f.join(' ')||'none';},
 background(it){return it.fill2?`linear-gradient(135deg,${it.fill},${it.fill2})`:it.fill;},
 // ---- preview ----
 render({s,w,h,layer}){this.renderItems(s,w,h,layer,false);},
 renderItems(s,w,h,layer,above){
  const m=s.modules.layers,wanted=new Set();
  for(const it of m.items){if(it.above!==above)continue;wanted.add(it.id);let el=this.els.get(it.id);
   if(!el||el.parentElement!==layer){el?.remove();el=document.createElement('div');el.className='layer-item';el.dataset.id=it.id;el.tabIndex=0;el.addEventListener('pointerdown',e=>this.itemDown(e,it.id));el.addEventListener('pointermove',e=>this.pointerMove(e));el.addEventListener('pointerup',e=>this.pointerUp(e));el.addEventListener('pointercancel',e=>this.pointerUp(e));el.addEventListener('wheel',e=>this.wheel(e,it.id),{passive:false});el.addEventListener('focus',()=>{if(this.me().active!==it.id){this.me().active=it.id;this.changed();}});layer.append(el);this.els.set(it.id,el);}
   const f=this.frame(it,w,h);el.hidden=it.hidden;el.classList.toggle('locked',it.locked);el.classList.toggle('active',m.active===it.id);el.setAttribute('aria-label',it.name);
   Object.assign(el.style,{left:f.left+'px',top:f.top+'px',width:f.w+'px',height:f.h+'px',transform:`rotate(${it.rotate}deg) scaleX(${it.flipX?-1:1})`,opacity:it.opacity/100,filter:this.filter(it,w),mixBlendMode:it.blend,borderRadius:it.shape==='ellipse'&&it.type==='shape'?'50%':it.radius/100*Math.min(f.w,f.h)+'px'});
   let inner=el.firstElementChild;const kind=it.type==='video'?'video':it.type==='image'?'img':'div';
   if(it.type==='video'){const v=this.videos.get(it.id)?.video;if(v){if(inner!==v){el.replaceChildren(v);}if(v.paused)v.play().catch(()=>{});}else if(!inner||inner.tagName!=='DIV'){el.replaceChildren(Object.assign(document.createElement('div'),{className:'layer-missing',textContent:'视频不在这台浏览器中'}));}}
   else{if(!inner||inner.tagName.toLowerCase()!==kind){inner=document.createElement(kind);el.replaceChildren(inner);}if(it.type==='image'){if(inner.dataset.src!==it.src){inner.src=it.src||'';inner.dataset.src=it.src||'';}inner.style.objectFit=it.fit;}else inner.style.background=this.background(it);}
   const media=el.firstElementChild;if(media&&media.tagName==='VIDEO')media.style.objectFit=it.fit;
  }
  for(const [id,el] of this.els)if(!wanted.has(id)&&el.parentElement===layer){el.remove();this.els.delete(id);}
  if(above){const it=this.active(),box=this.box;if(box.parentElement!==layer)layer.append(box);box.hidden=!it||it.hidden;if(it&&!it.hidden){const f=this.frame(it,w,h);Object.assign(box.style,{left:f.left+'px',top:f.top+'px',width:f.w+'px',height:f.h+'px',transform:`rotate(${it.rotate}deg)`});box.classList.toggle('locked',it.locked);}}
 },
 // ---- direct manipulation ----
 desktopPoint(e){const b=this.api.desktop().getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top,w:b.width,h:b.height};},
 itemDown(e,id){if(e.button!==0)return;const it=this.byId(id);if(!it)return;if(this.me().active!==id){this.me().active=id;this.changed();}if(it.locked)return;const p=this.desktopPoint(e);this.drag={id:e.pointerId,item:it,mode:'move',x0:p.x,y0:p.y,ix:it.x,iy:it.y};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();},
 handleDown(e){const hd=e.target.closest('.lb-handle'),it=this.active();if(!hd||!it||it.locked)return;const p=this.desktopPoint(e),f=this.frame(it,p.w,p.h);
  this.drag={id:e.pointerId,item:it,mode:hd.dataset.h==='rot'?'rotate':'resize',h:hd.dataset.h,cx:f.cx,cy:f.cy,x0:p.x,y0:p.y,iw:it.w,ih:it.h,ix:it.x,iy:it.y,rot0:it.rotate,a0:Math.atan2(p.y-f.cy,p.x-f.cx),d0:Math.max(4,Math.hypot(p.x-f.cx,p.y-f.cy))};hd.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();},
 pointerMove(e){const d=this.drag;if(!d||d.id!==e.pointerId)return;const p=this.desktopPoint(e),it=d.item,cl=(v,a,b)=>Math.max(a,Math.min(b,Math.round(v*10)/10));
  if(d.mode==='move'){it.x=cl(d.ix+(p.x-d.x0)/p.w*100,-50,150);it.y=cl(d.iy+(p.y-d.y0)/p.h*100,-50,150);}
  else if(d.mode==='rotate'){let r=d.rot0+(Math.atan2(p.y-d.cy,p.x-d.cx)-d.a0)*180/Math.PI;r=((r+180)%360+360)%360-180;if(e.shiftKey)r=Math.round(r/15)*15;it.rotate=Math.round(r);}
  else{const k=Math.hypot(p.x-d.cx,p.y-d.cy)/d.d0;if(d.h.length===2){it.w=cl(d.iw*k,2,300);it.h=cl(d.ih*k,2,300);} // corners: uniform
   else{const a=-it.rotate*Math.PI/180,dx=p.x-d.x0,dy=p.y-d.y0,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a); // edges: one axis, in the item's own frame
    if(d.h==='e'||d.h==='w')it.w=cl(d.iw+(d.h==='e'?lx:-lx)*2/p.w*100,2,300);else it.h=cl(d.ih+(d.h==='s'?ly:-ly)*2/p.h*100,2,300);}}
  this.api.update({custom:false});},
 pointerUp(e){if(this.drag?.id===e.pointerId)this.drag=null;},
 wheel(e,id){const it=this.byId(id);if(!it||it.locked)return;e.preventDefault();const k=Math.exp(-e.deltaY*.0015);it.w=Math.max(2,Math.min(300,Math.round(it.w*k*10)/10));it.h=Math.max(2,Math.min(300,Math.round(it.h*k*10)/10));if(this.me().active!==id)this.me().active=id;this.api.update({custom:false});},
 keydown(e){const it=this.active();if(!it||this.api.view!=='layers'&&!e.target.closest?.('.layer-item'))return;if(e.target.matches('input,select,textarea'))return;
  const step=e.shiftKey?5:1,moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
  if(moves[e.key]&&!it.locked){e.preventDefault();it.x=Math.max(-50,Math.min(150,it.x+moves[e.key][0]));it.y=Math.max(-50,Math.min(150,it.y+moves[e.key][1]));this.changed();}
  else if((e.key==='Delete'||e.key==='Backspace')&&e.target.closest?.('.layer-item,#module-layers')){e.preventDefault();this.remove(it);}
  else if(e.key==='Escape'){this.me().active=null;this.changed();}},
 // ---- panel ----
 sync({s,panel}){
  const m=s.modules.layers,q=sel=>panel.querySelector(sel),list=q('#layers-list');q('#layers-empty').hidden=m.items.length>0;
  list.replaceChildren(...[...m.items].reverse().map(it=>{const row=document.createElement('div');row.className='layer-row'+(it.id===m.active?' active':'');row.dataset.id=it.id;row.setAttribute('role','option');row.setAttribute('aria-selected',String(it.id===m.active));
   const sw=document.createElement('span');sw.className='layer-swatch';if(it.type==='shape')sw.style.background=this.background(it);else if(it.type==='image'&&it.src){const im=new Image();im.src=it.src;im.alt='';sw.append(im);}else sw.textContent='▶';
   const name=document.createElement('span');name.className='layer-row-name';name.textContent=it.name;const tag=document.createElement('small');tag.textContent=(it.above?'人物之上':'人物之下')+(it.hidden?' · 隐藏':'');
   const eye=document.createElement('button');eye.type='button';eye.dataset.act='eye';eye.className='text-button';eye.textContent=it.hidden?'显示':'隐藏';eye.setAttribute('aria-label',(it.hidden?'显示':'隐藏')+it.name);
   const lock=document.createElement('button');lock.type='button';lock.dataset.act='lock';lock.className='text-button';lock.textContent=it.locked?'解锁':'锁定';row.append(sw,name,tag,eye,lock);return row;}));
  const it=this.active();q('#layers-props').hidden=!it;if(!it)return;
  if(document.activeElement!==q('#layers-name'))q('#layers-name').value=it.name;
  q('#layers-above').checked=it.above;q('#layers-hidden').checked=it.hidden;q('#layers-locked').checked=it.locked;q('#layers-flip').checked=it.flipX;
  q('.layers-shape-only').hidden=it.type!=='shape';q('.layers-image-only').hidden=it.type==='shape';q('#layers-shape').value=it.shape;q('#layers-fill').value=it.fill;q('#layers-fill2').value=it.fill2||'#ffffff';q('#layers-fill2-off').hidden=!it.fill2;q('#layers-fit').value=it.fit;q('#layers-blend').value=it.blend;
  for(const el of panel.querySelectorAll('input[data-key]')){const k=el.dataset.key;el.value=it[k];q('#layers-'+k+'-value').textContent=(k==='blur'?it[k].toFixed(1):Math.round(it[k]))+({rotate:'°',hue:'°',blur:''}[k]??'%');}
  q('#layers-up').disabled=m.items[m.items.length-1]===it;q('#layers-down').disabled=m.items[0]===it;
 },
 // ---- export ----
 // Video layers for the Windows client's layer window (modules/client.js): the file plus everything layer.html needs to
 // paint it per frame at this monitor's size — frame in px, look values, blend, fit and whether it sits above the person.
 async exportClips(s,w,h){const out=[];
  for(const it of s.modules.layers.items){if(it.type!=='video'||it.hidden)continue;const v=this.videos.get(it.id);if(!v?.blob)continue;const f=this.frame(it,w,h);
   out.push({name:it.name,type:v.blob.type||'video/webm',bytes:await v.blob.arrayBuffer(),x:f.cx,y:f.cy,w:f.w,h:f.h,rotate:it.rotate,flipX:it.flipX,opacity:it.opacity,blur:it.blur/100*w,hue:it.hue,saturate:it.saturate,brightness:it.brightness,radius:Math.min(f.w,f.h)*it.radius/100,blend:it.blend,fit:it.fit,above:it.above});}
  return out;},
 draw({ctx,s,w,h}){return this.drawItems(ctx,s,w,h,false);},
 async drawItems(ctx,s,w,h,above){
  const blends={normal:'source-over',multiply:'multiply',screen:'screen',overlay:'overlay','soft-light':'soft-light',lighten:'lighten',darken:'darken',difference:'difference'};
  for(const it of s.modules.layers.items){if(it.above!==above||it.hidden)continue;const f=this.frame(it,w,h);ctx.save();
   ctx.globalAlpha=it.opacity/100;ctx.globalCompositeOperation=blends[it.blend]||'source-over';const filter=this.filter(it,w);if(filter!=='none')ctx.filter=filter;
   ctx.translate(f.cx,f.cy);ctx.rotate(it.rotate*Math.PI/180);if(it.flipX)ctx.scale(-1,1);
   ctx.beginPath();if(it.type==='shape'&&it.shape==='ellipse')ctx.ellipse(0,0,f.w/2,f.h/2,0,0,Math.PI*2);else{const r=Math.min(f.w,f.h)*it.radius/100;ctx.roundRect(-f.w/2,-f.h/2,f.w,f.h,r);}ctx.clip();
   if(it.type==='shape'){if(it.fill2){const g=ctx.createLinearGradient(-f.w/2,-f.h/2,f.w/2,f.h/2);g.addColorStop(0,it.fill);g.addColorStop(1,it.fill2);ctx.fillStyle=g;}else ctx.fillStyle=it.fill;ctx.fillRect(-f.w/2,-f.h/2,f.w,f.h);}
   else{let media=null,mw=0,mh=0;if(it.type==='image'&&it.src){try{media=await this.api.loadImage(it.src);mw=media.naturalWidth;mh=media.naturalHeight;}catch{}}else if(it.type==='video'){const v=this.videos.get(it.id)?.video;if(v&&v.readyState>=2){media=v;mw=v.videoWidth;mh=v.videoHeight;}}
    if(media&&mw&&mh){let dw=f.w,dh=f.h,sx=0,sy=0,sw=mw,sh=mh;if(it.fit==='cover'){const k=Math.max(f.w/mw,f.h/mh);sw=f.w/k;sh=f.h/k;sx=(mw-sw)/2;sy=(mh-sh)/2;}else if(it.fit==='contain'){const k=Math.min(f.w/mw,f.h/mh);dw=mw*k;dh=mh*k;}ctx.drawImage(media,sx,sy,sw,sh,-dw/2,-dh/2,dw,dh);}}
   ctx.restore();}
 }
});
// Items placed above the floating person render and export through this companion (order 260); it also hosts the selection box.
Rider.register({id:'layers-top',name:'图层（人物之上）',order:260,panelView:'none',defaults:{},
 render({s,w,h,layer}){LayersModule.renderItems(s,w,h,layer,true);},
 draw({ctx,s,w,h}){return LayersModule.drawItems(ctx,s,w,h,true);}});
