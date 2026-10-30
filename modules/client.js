'use strict';
// Desktop client module: present only inside the Windows client (client/windows), where
// preload.js exposes window.desktopRider. Lists the monitors, renders the current design at
// each monitor's real resolution — background for the system wallpaper, transparent overlay
// for the desktop-layer window — and hands both to the client. Nothing is stored in the scheme.
if(window.desktopRider)Rider.register({
 id:'client',name:'应用到桌面',order:300,
 view:{label:'应用到桌面',icon:'screen',title:'把设计放到真正的桌面上。',description:'按每台显示器的真实分辨率渲染，设为系统壁纸；悬浮人物与桌面文字作为桌面层显示在图标下方。',inspectorTitle:'显示器'},
 monitors:[],busy:false,
 mount({panel,api}){
  this.api=api;
  panel.innerHTML=`<p class="inspector-description">Desktop Rider 客户端 <span id="client-version"></span> · 点击某台显示器，当前设计会按它的分辨率渲染并应用。</p>
<div id="client-monitors" class="client-monitors"></div>
<button class="button primary full-width" id="client-apply-all">应用到所有显示器</button>
<div class="switch-row"><div><label for="client-autostart">开机启动</label><small>登录后在托盘运行，并恢复桌面层</small></div><input type="checkbox" id="client-autostart" class="switch"></div><div class="switch-row"><div><label for="client-powersave">节能暂停</label><small>桌面被全屏 / 最大化窗口遮住或用电池时暂停桌面层视频，锁屏始终暂停</small></div><input type="checkbox" id="client-powersave" class="switch" checked></div>
<p id="client-status" class="field-hint" role="status" aria-live="polite"></p>
<button class="text-button" id="client-refresh"><svg><use href="#i-reset"/></svg>刷新显示器列表</button> <button class="text-button" id="client-clear">移除全部桌面层</button>`;
  const $=q=>panel.querySelector(q);this.$=$;
  $('#client-version').textContent='v'+(desktopRider.version||'');
  $('#client-refresh').addEventListener('click',()=>this.refresh());
  $('#client-apply-all').addEventListener('click',()=>this.applyAll());
  $('#client-clear').addEventListener('click',async()=>{for(const m of this.monitors)await desktopRider.clearLayer(m.id).catch(()=>{});this.say('已移除全部桌面层');});
  $('#client-autostart').addEventListener('change',async e=>{try{await desktopRider.setSettings({openAtLogin:e.target.checked});this.say(e.target.checked?'已设置开机启动':'已取消开机启动');}catch(error){this.say('设置失败：'+this.reason(error));}});
  desktopRider.onStatus(msg=>this.say(msg));
  desktopRider.mascotApi?.().then(info=>Rider.modules.find(x=>x.id==='mascot')?.setClientInfo?.(info)).catch(()=>{});
  // 桌面歌词 status line: what the layer window is playing / where the words came from, every 2 s while that view or this one is open.
  setInterval(async()=>{const lyr=Rider.modules.find(x=>x.id==='lyrics');if(!lyr||typeof lyr.setClientState!=='function'||!['lyrics','client'].includes(api.view))return;try{const l=await desktopRider.layers();lyr.setClientState(l.find(x=>x.lyrics)?.lyrics||null);}catch{}},2000);
  $('#client-powersave').addEventListener('change',async e=>{try{await desktopRider.setSettings({powerSave:e.target.checked});this.say(e.target.checked?'已开启节能暂停':'已关闭节能暂停');}catch(error){this.say('设置失败：'+this.reason(error));}});
  desktopRider.getSettings().then(s=>{$('#client-autostart').checked=!!s.openAtLogin;$('#client-powersave').checked=s.powerSave!==false;}).catch(()=>{});
  this.refresh();
 },
 say(text){this.$('#client-status').textContent=text;},
 // Electron wraps rejected IPC errors in "Error invoking remote method 'x': Error: …"; show only our message.
 reason(error){return String(error&&error.message||error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');},
 async refresh(){
  const root=this.$('#client-monitors');root.textContent='正在读取显示器…';
  try{this.monitors=await desktopRider.monitors();}catch(error){this.monitors=[];root.textContent='';this.say('读取显示器失败：'+this.reason(error));return;}
  root.replaceChildren();
  if(!this.monitors.length)root.textContent='没有找到显示器。';
  this.monitors.forEach(m=>{const btn=document.createElement('button');btn.type='button';btn.className='client-monitor';btn.dataset.monitor=m.id;
   const name=document.createElement('strong');name.textContent=`显示器 ${m.index+1}${m.primary?' · 主显示器':''}`;const size=document.createElement('span');size.textContent=`${m.width} × ${m.height}`;
   btn.append(name,size);btn.addEventListener('click',()=>this.apply(m));root.append(btn);});
 },
 // Overlay only when something is drawn on it: sample the alpha channel on a coarse grid.
 hasPixels(canvas){const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=3;i<d.length;i+=4*7)if(d[i])return true;return false;},
 // Live wallpaper (modules/live.js): the video plus where each piece goes on this monitor; null when not playing.
 async renderFor(m){const api=this.api,s={...api.clone(api.state),aspect:m.width/m.height};const background=await api.wallpaperCanvas(s,m.width,{layers:'background'}),overlay=await api.wallpaperCanvas(s,m.width,{layers:'overlay'});
  const liveModule=Rider.modules.find(x=>x.id==='live'),live=liveModule&&typeof liveModule.exportFor==='function'?await liveModule.exportFor(s,m.width,m.height):null;
  // Video layers (modules/layers.js) play in the layer window too: the files plus their frames / looks at this monitor's size.
  const layersModule=Rider.modules.find(x=>x.id==='layers'),clips=layersModule&&typeof layersModule.exportClips==='function'?await layersModule.exportClips(s,m.width,m.height):[];
  // 桌面歌词 (modules/lyrics.js): style in px for this monitor plus how to find the words; null when off.
  const lyricsModule=Rider.modules.find(x=>x.id==='lyrics'),lyrics=lyricsModule&&typeof lyricsModule.exportLyrics==='function'?lyricsModule.exportLyrics(s,m.width,m.height):null;
  // 萌版人物 (modules/mascot.js): rig + style for an always-on-top mascot window; null when off.
  const mascotModule=Rider.modules.find(x=>x.id==='mascot'),mascot=mascotModule&&typeof mascotModule.exportMascot==='function'?mascotModule.exportMascot(s,m.width,m.height):null;
  return {monitorId:m.id,background:background.toDataURL('image/png'),overlay:this.hasPixels(overlay)?overlay.toDataURL('image/png'):null,live,clips,lyrics,mascot};},
 async apply(m){if(this.busy)return;this.busy=true;this.$('#client-monitors').classList.add('busy');
  try{this.say(`正在按 ${m.width} × ${m.height} 渲染…`);const result=await desktopRider.applyWallpaper(await this.renderFor(m));this.say(`已应用到显示器 ${m.index+1}${result.live?'（动态壁纸）':result.clips?'（含动态图层）':result.layer?'（含桌面层）':''}`);this.api.toast('壁纸已应用到显示器 '+(m.index+1));}
  catch(error){const why=this.reason(error);this.say('应用失败：'+why);this.api.toast('应用失败：'+why);}
  finally{this.busy=false;this.$('#client-monitors').classList.remove('busy');}},
 async applyAll(){for(const m of this.monitors)await this.apply(m);}
});
