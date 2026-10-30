'use strict';
// 动态壁纸: a video as the wallpaper. One frame is captured as the still custom wallpaper, so
// splitting, person detection, floating cut-outs and the PNG export all keep working on it; the
// video itself plays where the wallpaper pieces are — in the preview on two canvases clipped by
// the same polygons and placed like #piece-left / #piece-right, and on the real desktop through
// the Windows client's layer window (modules/client.js calls exportFor()). The file lives in this
// browser's IndexedDB, not in the scheme; the scheme keeps only the switch and the metadata.
Rider.register({
 id:'live',name:'动态壁纸',order:50, // below the floating person: the video is the wallpaper
 defaults:{enabled:false,name:'',type:'',size:0,width:0,height:0,duration:0,time:0},
 normalize(m,{clamp}){return {enabled:m.enabled===true,name:typeof m.name==='string'?m.name.slice(0,120):'',type:typeof m.type==='string'?m.type.slice(0,60):'',size:clamp(m.size,0,1e10,0),width:clamp(m.width,0,16384,0),height:clamp(m.height,0,16384,0),duration:clamp(m.duration,0,1e6,0),time:clamp(m.time,0,1e6,0)};},
 view:{label:'动态壁纸',icon:'play',title:'让壁纸动起来。',description:'导入一段视频：取一帧作为静态壁纸参与分裂、人物识别与导出；预览和桌面上则按同样的分区几何实时播放。',inspectorTitle:'动态壁纸'},
 MAX:500*1024*1024,
 file:null,url:null,missing:false,pieces:[],frame:0,lastTime:-1,looping:false,
 mount({panel,layer,api}){
  this.api=api;
  panel.innerHTML=`<p class="inspector-description">导入 MP4 / WebM 视频（最大 500 MB）。视频只保存在这台浏览器里，方案里只记录开关与取帧位置；Wallpaper Engine 的视频壁纸导入后会自动成为动态壁纸。</p>
<input type="file" id="live-file" accept="video/mp4,video/webm,video/quicktime" hidden>
<button class="button secondary full-width" id="live-import"><svg><use href="#i-play"/></svg>导入视频</button>
<div class="control-section"><div class="switch-row"><div><label for="live-enabled">播放动态壁纸</label><small>关闭后只显示取出的静帧</small></div><input type="checkbox" id="live-enabled" class="switch"></div></div>
<div class="control-section sliders"><div class="slider-control"><div class="control-label"><label for="live-time">静帧位置</label><output id="live-time-value">0.0 s</output></div><input id="live-time" type="range" min="0" max="1000" value="0"><div class="range-labels"><span>开头</span><span>结尾</span></div></div><p class="field-hint">静帧用于人物识别、悬浮抠图与 PNG 导出；松开滑块后重新取帧。人物悬浮时视频里的人物仍在原位，相当于「保留原位人物」。</p></div>
<p id="live-status" class="field-hint" role="status" aria-live="polite"></p>
<button class="text-button" id="live-remove">移除视频</button>`;
  const $=q=>panel.querySelector(q);this.$=$;
  $('#live-import').addEventListener('click',()=>$('#live-file').click());
  $('#live-file').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{await this.useFile(file);api.toast('已导入动态壁纸「'+this.me().name+'」');}catch(error){api.toast(error.message);}});
  $('#live-enabled').addEventListener('change',e=>{this.me().enabled=e.target.checked;api.update({custom:false});});
  $('#live-time').addEventListener('input',e=>{$('#live-time-value').textContent=this.seconds(e.target.value/1000*this.me().duration);});
  $('#live-time').addEventListener('change',async e=>{const m=this.me();m.time=Math.round(e.target.value/1000*m.duration*10)/10;try{await this.capture(m.time);}catch(error){api.toast(error.message);}});
  $('#live-remove').addEventListener('click',async()=>{await this.remove();api.toast('已移除视频，静帧仍保留为壁纸');});
  this.canvases=[0,1].map(()=>{const c=document.createElement('canvas');c.className='live-piece';c.hidden=true;layer.append(c);return c;});
  this.video=Object.assign(document.createElement('video'),{muted:true,loop:true,playsInline:true,preload:'auto'});
  this.video.addEventListener('loadedmetadata',()=>api.scheduleRender());
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)');this.reduced.addEventListener?.('change',()=>api.scheduleRender());
  document.addEventListener('visibilitychange',()=>this.refresh());
  Rider.on('render',({s,w,h})=>this.syncPieces(s,w,h));
  // Wallpaper Engine video import (app.js) hands the file over; the frame is already the wallpaper.
  Rider.on('video',({file,time})=>this.useFile(file,{time,capture:false}).then(()=>api.toast('视频已作为动态壁纸导入')).catch(error=>api.toast(error.message)));
  this.restore();
 },
 me(){return this.api.state.modules.live;},
 seconds(v){return (Math.round((Number.isFinite(v)?v:0)*10)/10).toFixed(1)+' s';},
 // IndexedDB keeps the one current video of this browser.
 db(){return this._db??=new Promise((resolve,reject)=>{const r=indexedDB.open('desktop-rider-live',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
 async store(op,value){const db=await this.db();return new Promise((resolve,reject)=>{const st=db.transaction('files','readwrite').objectStore('files'),q=op==='get'?st.get('current'):op==='put'?st.put(value,'current'):st.delete('current');q.onsuccess=()=>resolve(q.result??null);q.onerror=()=>reject(q.error);});},
 async restore(){const m=this.me();if(!m.name)return;let blob=null;try{blob=await this.store('get');}catch{}if(!blob){this.missing=true;this.api.scheduleRender();return;}this.missing=false;this.attach(blob);},
 attach(file){if(this.url)URL.revokeObjectURL(this.url);this.file=file;this.url=URL.createObjectURL(file);this.video.src=this.url;this.lastTime=-1;},
 ready(){const v=this.video;return v.readyState>=1?Promise.resolve():new Promise((resolve,reject)=>{const ok=()=>{off();resolve();},bad=()=>{off();reject(new Error('视频无法解码，请换一个 MP4 / WebM 文件'));},off=()=>{v.removeEventListener('loadedmetadata',ok);v.removeEventListener('error',bad);};v.addEventListener('loadedmetadata',ok);v.addEventListener('error',bad);});},
 async useFile(file,{time,capture=true}={}){
  if(!file||!/^video\//.test(file.type||''))throw new Error('请选择 MP4 或 WebM 视频');
  if(file.size>this.MAX)throw new Error('视频需小于 500 MB');
  this.missing=false;this.attach(file);await this.ready();
  const v=this.video,duration=Number.isFinite(v.duration)?Math.round(v.duration*10)/10:0,m=this.me();
  Object.assign(m,{enabled:true,name:(file.name||'视频').slice(0,120),type:file.type,size:file.size,width:v.videoWidth,height:v.videoHeight,duration,time:Math.max(0,Math.min(duration||0,Number.isFinite(time)?time:Math.min(1,duration*.1)))});
  try{await this.store('put',file);}catch{this.api.toast('视频无法写入浏览器存储，刷新后需重新导入');}
  if(capture)await this.capture(m.time);else{this.api.state.protectPerson=false;this.api.update({custom:false});}
 },
 // The still frame at `time` becomes the custom wallpaper (same path as an imported picture).
 async capture(time){
  const v=this.video;await this.ready();
  if(Number.isFinite(v.duration)&&Math.abs(v.currentTime-time)>.05){await new Promise(resolve=>{const done=()=>{clearTimeout(timer);v.removeEventListener('seeked',done);resolve();},timer=setTimeout(done,2000);v.addEventListener('seeked',done);v.currentTime=time;});}
  if(v.readyState<2)await new Promise(resolve=>{const done=()=>{clearTimeout(timer);v.removeEventListener('loadeddata',done);resolve();},timer=setTimeout(done,3000);v.addEventListener('loadeddata',done);});
  if(v.readyState<2||!v.videoWidth)throw new Error('视频还没有可用画面');
  this.api.useImage(v,v.videoWidth,v.videoHeight,this.me().name);
  this.api.state.protectPerson=false; // the moving picture cannot be composed around a person; floating still works
  this.api.update({custom:false});
 },
 async remove(){try{await this.store('delete');}catch{}if(this.url)URL.revokeObjectURL(this.url);this.file=null;this.url=null;this.video.removeAttribute('src');this.video.load();Object.assign(this.me(),this.api.clone(this.defaults));this.api.update({custom:false});},
 playing(s){const m=s.modules.live;return m.enabled&&!!this.file&&!this.missing&&this.video.readyState>=1&&!(s.protectPerson&&!this.api.floating(s))&&!this.reduced.matches;},
 // After every desktop render, mirror the wallpaper pieces: same clip polygon, same placement.
 syncPieces(s,w,h){
  const live=this.playing(s),dpr=devicePixelRatio||1;
  this.pieces=['#piece-left','#piece-right'].map((id,i)=>{const el=document.querySelector(id),c=this.canvases[i],show=live&&el.style.display!=='none'&&!!el.style.backgroundImage;c.hidden=!show;if(!show)return null;
   const size=el.style.backgroundSize.split(' ').map(parseFloat),pos=el.style.backgroundPosition.split(' ').map(parseFloat);c.style.clipPath=el.style.clipPath||'none';
   const cw=Math.round(w*dpr),ch=Math.round(h*dpr);if(c.width!==cw||c.height!==ch){c.width=cw;c.height=ch;}c.style.width=w+'px';c.style.height=h+'px';
   return {c,x:pos[0],y:pos[1],w:size[0],h:size[1],dpr};}).filter(Boolean);
  this.lastTime=-1;this.refresh();this.status(s);
 },
 refresh(){const want=this.pieces.length>0&&!document.hidden;if(want){if(this.video.paused)this.video.play().catch(()=>{});if(!this.looping){this.looping=true;requestAnimationFrame(()=>this.tick());}}else if(!this.video.paused)this.video.pause();},
 tick(){if(!this.pieces.length||document.hidden){this.looping=false;return;}if(this.video.readyState>=2&&this.video.currentTime!==this.lastTime){this.lastTime=this.video.currentTime;for(const p of this.pieces){const ctx=p.c.getContext('2d');ctx.setTransform(p.dpr,0,0,p.dpr,0,0);ctx.clearRect(0,0,p.c.width,p.c.height);ctx.drawImage(this.video,p.x,p.y,p.w,p.h);}this.frame++;}requestAnimationFrame(()=>this.tick());},
 status(s){const m=s.modules.live,el=this.$('#live-status');
  el.textContent=!m.name?'尚未导入视频。':this.missing?`方案里的视频「${m.name}」不在这台浏览器中，请重新导入。`:!m.enabled?'已关闭播放，当前显示静帧。':this.reduced.matches?'系统设置了「减少动态效果」，预览中只显示静帧。':s.protectPerson&&!this.api.floating(s)?'人物优先模式下无法播放：关闭人物优先，或改用人物悬浮。':`正在播放「${m.name}」 · ${m.width} × ${m.height}${m.duration?' · '+this.seconds(m.duration):''}`;},
 sync({s,panel}){const m=s.modules.live,q=sel=>panel.querySelector(sel),has=!!m.name;q('#live-enabled').checked=m.enabled;q('#live-enabled').disabled=!has;q('#live-time').disabled=!has||!m.duration;q('#live-time').value=m.duration?Math.round(m.time/m.duration*1000):0;q('#live-time-value').textContent=this.seconds(m.time);q('#live-remove').hidden=!has;},
 // For the Windows client: the video bytes plus where each piece goes on a w × h desktop.
 async exportFor(s,w,h){
  const m=s.modules.live;if(!m.enabled||!this.file||this.missing||(s.protectPerson&&!this.api.floating(s)))return null;await this.ready();
  const geo=this.api.geometry(s,w,h),dims={naturalWidth:this.video.videoWidth,naturalHeight:this.video.videoHeight},round=v=>Math.round(v*100)/100;
  const pieces=geo.polygons.map((points,i)=>{if(!points.length)return null;const p=this.api.wallpaperPlacement(s,dims,w,h,points,i);return {polygon:points.map(([x,y])=>[round(x),round(y)]),x:round(p.x),y:round(p.y),w:round(p.w),h:round(p.h)};}).filter(Boolean);
  return {name:m.name,type:this.file.type||'video/mp4',bytes:await this.file.arrayBuffer(),plan:{width:w,height:h,gapColor:s.gapColor,pieces}};
 }
});
