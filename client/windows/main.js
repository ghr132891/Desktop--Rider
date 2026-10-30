'use strict';
// Desktop Rider Windows client (Electron). Hosts the web app from a loopback server, applies
// rendered wallpapers per monitor through native/bridge.ps1, keeps transparent "desktop layer"
// windows under the icons for the floating person, and lives in the tray with optional autostart.
const {app,BrowserWindow,Tray,Menu,ipcMain,nativeImage,screen,shell,powerMonitor}=require('electron');
const path=require('node:path'),fs=require('node:fs'),fsp=fs.promises,crypto=require('node:crypto');
const server=require('./lib/server'),{create:createNative,hwndOf}=require('./lib/native'),native=createNative();
const WEB_ROOT=app.isPackaged?path.join(process.resourcesPath,'web'):path.join(__dirname,'..','..');
const DATA=path.join(app.getPath('userData'),'desktop'),SETTINGS=path.join(app.getPath('userData'),'settings.json'),LAYERS=path.join(DATA,'layers.json'),MASCOTS=path.join(DATA,'mascots.json'),MASCOT_API=path.join(app.getPath('userData'),'mascot-api.json');
const startHidden=process.argv.includes('--hidden');
let mainWindow=null,tray=null,web=null,quitting=false;
const layers=new Map(); // monitorId -> {window,file,rect}
const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}};
const writeJson=(file,value)=>fsp.mkdir(path.dirname(file),{recursive:true}).then(()=>fsp.writeFile(file,JSON.stringify(value,null,1)));
let settings={openAtLogin:false,powerSave:true,...readJson(SETTINGS,{})};
const status=message=>{mainWindow?.webContents.send('client:status',message);};
const keyOf=monitorId=>crypto.createHash('sha1').update(monitorId).digest('hex').slice(0,12);
const dataUrlToPng=url=>{const m=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url||'');if(!m)throw new Error('需要 PNG 图片');const buf=Buffer.from(m[1],'base64');if(buf.length>96*1024*1024)throw new Error('图片过大');return buf;};
// Layer windows sit behind the desktop icons. Without these switches Chromium would treat them as occluded or
// backgrounded and stop painting the live wallpaper.
app.commandLine.appendSwitch('disable-renderer-backgrounding');app.commandLine.appendSwitch('disable-background-timer-throttling');app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
const fileUrl=p=>require('node:url').pathToFileURL(p).href;
const {checkLive,checkClips,checkLyrics,checkMascot}=require('./lib/live');
const LyricsView=require(path.join(WEB_ROOT,'lyrics-view.js')),Lyrics=require('./lib/lyrics').use(LyricsView); // shared parser/renderer from the web root
const {decide:decidePower}=require('./lib/power');

if(!app.requestSingleInstanceLock()){app.quit();}
else{
 app.on('second-instance',()=>showMain());
 app.whenReady().then(async()=>{
  web=await server.start(WEB_ROOT,{api:mascotApi});
  await writeJson(MASCOT_API,{url:web.url.replace(/\/$/,''),token:mascotToken}).catch(()=>{});
  createMain();createTray();applyLoginItem();watchPower();
  await restoreLayers();await restoreMascots();
 });
}
app.on('before-quit',()=>{quitting=true;});
app.on('window-all-closed',()=>{}); // tray keeps us alive

function createMain(){
 mainWindow=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:640,show:!startHidden,title:'Desktop Rider',backgroundColor:'#f5f7fa',autoHideMenuBar:true,
  webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false,spellcheck:false}});
 mainWindow.loadURL(web.url);
 mainWindow.on('close',e=>{if(!quitting){e.preventDefault();mainWindow.hide();}}); // close = hide to tray
 mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))shell.openExternal(url);return {action:'deny'};});
}
function showMain(){if(!mainWindow)createMain();mainWindow.show();mainWindow.focus();}
function createTray(){
 const icon=nativeImage.createFromPath(path.join(__dirname,'assets','tray.png'));
 tray=new Tray(icon);tray.setToolTip('Desktop Rider');
 const rebuild=()=>tray.setContextMenu(Menu.buildFromTemplate([
  {label:'打开 Desktop Rider',click:showMain},
  {label:'隐藏桌面层',click:async()=>{for(const id of [...layers.keys()])await clearLayer(id);}},
  {type:'separator'},
  {label:'开机启动',type:'checkbox',checked:settings.openAtLogin,click:async item=>{await setSettings({openAtLogin:item.checked});rebuild();}},
  {label:'节能：桌面被遮住或用电池时暂停视频',type:'checkbox',checked:settings.powerSave!==false,click:async item=>{await setSettings({powerSave:item.checked});rebuild();}},
  {type:'separator'},
  {label:'退出',click:()=>{quitting=true;app.quit();}}]));
 rebuild();tray.on('double-click',showMain);
}
function applyLoginItem(){if(process.platform==='win32'||process.platform==='darwin')app.setLoginItemSettings({openAtLogin:!!settings.openAtLogin,args:['--hidden']});}
async function setSettings(patch){if(patch&&typeof patch.openAtLogin==='boolean')settings.openAtLogin=patch.openAtLogin;if(patch&&typeof patch.powerSave==='boolean')settings.powerSave=patch.powerSave;await writeJson(SETTINGS,settings);applyLoginItem();powerAll();return settings;}
// ---- power saving for the layer videos (lib/power.js decides; layer.html pauses) ----
const power={locked:false,onBattery:false,suspended:false};
const hasVideo=e=>!!(e.live||(e.clips&&e.clips.length)||e.lyrics); // anything that moves on its own → power rules apply
function applyPower(entry){const d=decidePower({suspended:power.suspended,locked:power.locked,covered:!!entry.covered,onBattery:power.onBattery,powerSave:settings.powerSave!==false});
 const paused=hasVideo(entry)&&d.paused,reason=paused?d.reason:'';if(entry.paused===paused&&entry.pauseReason===reason)return;entry.paused=paused;entry.pauseReason=reason;
 if(entry.window.isDestroyed())return;const wc=entry.window.webContents,send=()=>wc.executeJavaScript(`window.__setPaused&&window.__setPaused(${paused},${JSON.stringify(reason)})`).catch(()=>{});
 if(wc.isLoading())wc.once('did-finish-load',send);else send();}
function powerAll(){for(const e of layers.values())applyPower(e);for(const m of mascots.values())if(!m.window.isDestroyed())m.window.webContents.send('mascot:paused',power.locked||power.suspended);}
// One bridge watcher per layer window with video: is a window hiding this monitor's desktop?
function watchEntry(entry){entry.watcher?.stop();entry.watcher=null;entry.covered=false;entry.covering=null;
 if(hasVideo(entry)&&!entry.window.isDestroyed()&&process.platform==='win32')entry.watcher=native.watchCovering(hwndOf(entry.window.getNativeWindowHandle()),entry.rect,state=>{entry.covered=!!state.covered;entry.covering=state.covered?{class:state.class,zoomed:!!state.zoomed,hwnd:state.hwnd}:null;applyPower(entry);});
 applyPower(entry);}
// ---- 桌面歌词: one system-media watcher for all layers; words per track from 网易云 / QQ音乐 (lib/lyrics.js) ----
const mediaState={watcher:null,last:null};const lyricCache=new Map();
const inLayer=(entry,code)=>{if(entry.window.isDestroyed())return;const wc=entry.window.webContents,send=()=>wc.executeJavaScript(code).catch(()=>{});if(wc.isLoading())wc.once('did-finish-load',send);else send();};
const trackKey=m=>m&&m.sessions>0&&(m.title||m.artist)?`${m.title}\n${m.artist}`:'';
function lyricsEntry(entry){if(!entry.lyrics){entry.lyricsState=null;mediaWatchSync();return;}
 const src=entry.lyrics.source,manual=src.mode==='manual'?LyricsView.parse(src.lrc):[];entry.lyricLines=manual;entry.lyricsState={track:null,playing:false,lines:manual.length,source:src.mode==='manual'?'manual':'',words:manual.some(l=>l.words),error:'',key:''};
 mediaWatchSync();if(mediaState.last)onMedia(mediaState.last);}
function mediaWatchSync(){const need=[...layers.values()].some(e=>e.lyrics);
 if(need&&!mediaState.watcher&&process.platform==='win32')mediaState.watcher=native.watchMedia(onMedia);
 if(!need&&mediaState.watcher){mediaState.watcher.stop();mediaState.watcher=null;mediaState.last=null;}}
function onMedia(m){mediaState.last=m;mediaState.at=Date.now();const key=trackKey(m);
 for(const entry of layers.values()){if(!entry.lyrics||entry.window.isDestroyed())continue;const st=entry.lyricsState,src=entry.lyrics.source;
  st.track=key?{title:m.title||'',artist:m.artist||'',album:m.album||'',app:m.app||''}:null;st.playing=!!m.playing;
  // Position goes to the layer whenever a session exists (manual LRC syncs to the player too); none → own clock.
  inLayer(entry,`window.__setMedia&&window.__setMedia(${JSON.stringify(key?{position:m.position,playing:!!m.playing}:null)})`);
  if(src.mode!=='auto')continue;
  if(st.key!==key){st.key=key;if(!key){st.lines=0;st.source='';st.error='';inLayer(entry,'window.__setLyrics&&window.__setLyrics({lines:[]})');continue;}
   fetchLyrics(entry,key,{title:m.title||'',artist:m.artist||'',duration:m.duration||0,query:src.query},src.provider);}}}
async function fetchLyrics(entry,key,want,provider){const st=entry.lyricsState,cacheKey=provider+'|'+(want.query||key);
 try{let hit=lyricCache.get(cacheKey);if(!hit){hit=Lyrics.findLyrics(want,{provider});lyricCache.set(cacheKey,hit);if(lyricCache.size>40)lyricCache.delete(lyricCache.keys().next().value);}
  const found=await hit;if(st.key!==key||entry.window.isDestroyed())return;st.lines=found.lines.length;st.source=found.provider;st.words=!!found.words;st.error='';entry.lyricLines=found.lines;
  inLayer(entry,`window.__setLyrics&&window.__setLyrics(${JSON.stringify({lines:found.lines,source:found.provider,words:!!found.words})})`);}
 catch(error){lyricCache.delete(cacheKey);if(st.key!==key)return;st.lines=0;st.source='';st.words=false;st.error=error.message||'歌词获取失败';inLayer(entry,`window.__setLyrics&&window.__setLyrics(${JSON.stringify({lines:[],error:st.error})})`);}}
// ---- 萌版人物: one always-on-top transparent window per monitor, click-through except over the character ----
// The character itself (rig, animation, moods) lives in mascot.html via the shared mascot-view.js; this side owns the
// window, the hit-test toggling, dragging the window, the music feed from the lyrics clock and the external-AI HTTP API.
const mascots=new Map(); // monitorId -> {window,cfg,monitor,hover,dragStart,pending:Map,nextId}
const mascotToken=crypto.randomBytes(18).toString('base64url');const sseClients=new Set();
function mascotBounds(monitor,style){const size=style.size,w=Math.max(360,Math.round(size*2.2)),h=Math.round(size*1.75);return {x:Math.round(monitor.left+parseFloat(style.left)-w/2),y:Math.round(monitor.top+parseFloat(style.top)-h),width:w,height:h};}
async function showMascot(monitorId,monitor,cfg){let m=mascots.get(monitorId);
 if(!m||m.window.isDestroyed()){const win=new BrowserWindow({...mascotBounds(monitor,cfg.style),frame:false,transparent:true,hasShadow:false,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,focusable:false,show:false,alwaysOnTop:cfg.style.onTop!==false,title:'Desktop Rider Mascot',
   webPreferences:{preload:path.join(__dirname,'preload-mascot.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.setMenuBarVisibility(false);win.setIgnoreMouseEvents(true,{forward:true});m={window:win,cfg,monitor,hover:false,dragStart:null,pending:new Map(),nextId:0};mascots.set(monitorId,m);
  win.on('closed',()=>{if(mascots.get(monitorId)===m)mascots.delete(monitorId);});}
 m.cfg=cfg;m.monitor=monitor;m.window.setBounds(mascotBounds(monitor,cfg.style));m.window.setAlwaysOnTop(cfg.style.onTop!==false,'screen-saver');
 const url=fileUrl(path.join(__dirname,'mascot.html'))+'?cfg='+encodeURIComponent(JSON.stringify(cfg))+'&lib='+encodeURIComponent(fileUrl(path.join(WEB_ROOT,'mascot-view.js')))+'&css='+encodeURIComponent(fileUrl(path.join(WEB_ROOT,'mascot-view.css')));
 await m.window.loadURL(url);m.window.showInactive();await saveMascots();}
async function closeMascot(monitorId){const m=mascots.get(monitorId);if(!m)return;mascots.delete(monitorId);if(!m.window.isDestroyed())m.window.destroy();await saveMascots();}
const saveMascots=()=>writeJson(MASCOTS,[...mascots].map(([monitorId,m])=>({monitorId,cfg:m.cfg})));
async function restoreMascots(){const saved=readJson(MASCOTS,[]);if(!Array.isArray(saved)||!saved.length)return;let list=[];try{list=await monitors();}catch{return;}
 for(const item of saved){const monitor=list.find(x=>x.id===item.monitorId);let cfg=null;try{cfg=checkMascot(item.cfg);}catch{}if(!monitor||!cfg)continue;try{await showMascot(item.monitorId,monitor,cfg);}catch(error){console.error('restore mascot',error);}}}
const mascotOf=sender=>[...mascots.values()].find(m=>!m.window.isDestroyed()&&m.window.webContents===sender)||null;
ipcMain.on('mascot:hover',(e,over)=>{const m=mascotOf(e.sender);if(!m)return;m.hover=!!over;m.window.setIgnoreMouseEvents(!over,{forward:true});});
ipcMain.on('mascot:event',(e,ev)=>{const m=mascotOf(e.sender);if(!m||!ev||typeof ev!=='object')return;
 if(ev.type==='drag')m.dragStart=m.window.getBounds();
 else if(ev.type==='dragging'&&m.dragStart){m.window.setPosition(Math.round(m.dragStart.x+(Number(ev.dx)||0)),Math.round(m.dragStart.y+(Number(ev.dy)||0)));}
 else if(ev.type==='drop'){m.dragStart=null;const b=m.window.getBounds();m.cfg.style.left=(b.x+b.width/2-m.monitor.left)+'px';m.cfg.style.top=(b.y+b.height-m.monitor.top)+'px';saveMascots();}
 broadcastMascot({...ev,monitorId:[...mascots].find(([,x])=>x===m)?.[0]});});
ipcMain.on('mascot:result',(e,id,result)=>{const m=mascotOf(e.sender);const p=m?.pending.get(id);if(p){m.pending.delete(id);p(result);}});
function mascotCommand(cmd){return Promise.all([...mascots.values()].filter(m=>!m.window.isDestroyed()).map(m=>new Promise(resolve=>{const id=++m.nextId;const timer=setTimeout(()=>{m.pending.delete(id);resolve({ok:false,error:'timeout'});},3000);m.pending.set(id,r=>{clearTimeout(timer);resolve(r);});m.window.webContents.send('mascot:command',cmd,id);})));}
function broadcastMascot(ev){const line='data: '+JSON.stringify(ev)+'\n\n';for(const res of sseClients){try{res.write(line);}catch{sseClients.delete(res);}}}
// Music for the character: from the lyrics controller's media + lines, 2–3 times a second while something plays.
let mascotMusicTimer=0;function mascotMusicTick(){if(!mascots.size)return;const m=mediaState.last,playing=!!(m&&m.playing);let payload={playing:false};
 if(playing){const entry=[...layers.values()].find(e=>e.lyrics&&e.lyricLines&&e.lyricLines.length),t=m.position+(Date.now()-(mediaState.at||Date.now()))/1000;
  if(entry){const lines=entry.lyricLines,i=LyricsView.index(lines,t),line=lines[i];if(line){const n=line.words?line.words.length:Math.max(1,line.text.replace(/\s/g,'').length),span=Math.max(.5,line.end-line.t);payload={playing:true,line:line.text,progress:LyricsView.progress(line,t),energy:Math.max(0,Math.min(1,(n/span-1)/5))};}else payload={playing:true,line:'',progress:0,energy:.3};}
  else payload={playing:true,line:'',progress:0,energy:.4};}
 for(const x of mascots.values())if(!x.window.isDestroyed()&&x.cfg.style.reactMusic!==false)x.window.webContents.send('mascot:music',payload);}
setInterval(()=>{try{mascotMusicTick();}catch{}},400);
// HTTP API on the loopback server (lib/server.js `api` hook): docs/mascot-api.md.
function mascotApi(req,res){const u=new URL(req.url,'http://127.0.0.1');if(!u.pathname.startsWith('/api/mascot/'))return false;
 const json=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(body));return true;};
 const auth=(req.headers.authorization||'').replace(/^Bearer\s+/i,'')||u.searchParams.get('token')||'';if(auth!==mascotToken)return json(401,{ok:false,error:'bad token'});
 const states=()=>Promise.all([...mascots.values()].filter(m=>!m.window.isDestroyed()).map(m=>m.window.webContents.executeJavaScript('window.__mascot&&window.__mascot.state&&window.__mascot.state()').catch(()=>null)));
 if(u.pathname==='/api/mascot/state'&&req.method==='GET'){states().then(list=>json(200,{ok:true,mascots:list.map((state,i)=>({monitorId:[...mascots.keys()][i],state}))}));return true;}
 if(u.pathname==='/api/mascot/rig'&&req.method==='GET'){return json(200,{ok:true,rigs:[...mascots].map(([monitorId,m])=>({monitorId,rig:m.cfg.rig,style:m.cfg.style}))});}
 if(u.pathname==='/api/mascot/events'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive','Access-Control-Allow-Origin':'*'});res.write(': connected\n\n');sseClients.add(res);const hb=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},25000);req.on('close',()=>{clearInterval(hb);sseClients.delete(res);});return true;}
 if(u.pathname==='/api/mascot/command'&&req.method==='POST'){let body='';req.on('data',c=>{body+=c;if(body.length>64*1024)req.destroy();});req.on('end',async()=>{let cmd;try{cmd=JSON.parse(body||'null');}catch{return json(400,{ok:false,error:'invalid JSON'});}
   const list=Array.isArray(cmd)?cmd:[cmd];if(!list.length||list.length>20||!list.every(c=>c&&typeof c==='object'&&typeof c.type==='string'))return json(400,{ok:false,error:'expected a command or an array of commands'});
   const results=[];for(const c of list)results.push(await mascotCommand(c));json(200,{ok:true,results});});return true;}
 return json(404,{ok:false,error:'unknown endpoint'});}
function watchPower(){power.onBattery=powerMonitor.isOnBatteryPower();
 powerMonitor.on('lock-screen',()=>{power.locked=true;powerAll();});powerMonitor.on('unlock-screen',()=>{power.locked=false;powerAll();});
 powerMonitor.on('on-battery',()=>{power.onBattery=true;powerAll();});powerMonitor.on('on-ac',()=>{power.onBattery=false;powerAll();});
 powerMonitor.on('suspend',()=>{power.suspended=true;powerAll();});powerMonitor.on('resume',()=>{power.suspended=false;powerAll();});}

// Monitors: the bridge on Windows (physical pixels, IDesktopWallpaper ids); Electron's displays elsewhere so the UI can be developed on any OS.
async function monitors(){
 if(process.platform==='win32')return native.monitors();
 return screen.getAllDisplays().map((d,i)=>({id:'electron:'+d.id,index:i,left:Math.round(d.bounds.x*d.scaleFactor),top:Math.round(d.bounds.y*d.scaleFactor),width:Math.round(d.bounds.width*d.scaleFactor),height:Math.round(d.bounds.height*d.scaleFactor),primary:d.id===screen.getPrimaryDisplay().id}));
}
// background: PNG for the system wallpaper (also the still fallback under a live layer);
// overlay: transparent PNG for the layer window; live: {name,type,bytes,plan} video that the layer plays;
// clips: video layers from modules/layers.js, each {name,type,bytes,x,y,w,h,rotate,flipX,opacity,blur,hue,saturate,brightness,radius,blend,fit,above}.
async function apply({monitorId,background,overlay,live,clips,lyrics,mascot}={}){
 if(typeof monitorId!=='string'||!monitorId)throw new Error('缺少显示器');
 const list=await monitors(),monitor=list.find(m=>m.id===monitorId);if(!monitor)throw new Error('显示器已不存在，请刷新列表');
 const checked=live?checkLive(live):null,clipList=checkClips(clips),lyricsCfg=checkLyrics(lyrics),mascotCfg=checkMascot(mascot);
 await fsp.mkdir(DATA,{recursive:true});const key=keyOf(monitorId),stamp=Date.now();
 const file=path.join(DATA,`${key}-${stamp}.png`);await fsp.writeFile(file,dataUrlToPng(background));
 status('正在设置系统壁纸…');await native.setWallpaper(monitorId,file);
 for(const old of await fsp.readdir(DATA))if(old.startsWith(key+'-')&&old.endsWith('.png')&&!old.includes('overlay')&&old!==path.basename(file))fsp.unlink(path.join(DATA,old)).catch(()=>{});
 const content={overlay:null,live:null,clips:[],lyrics:lyricsCfg};
 if(overlay){content.overlay=path.join(DATA,`${key}-overlay.png`);await fsp.writeFile(content.overlay,dataUrlToPng(overlay));}
 if(checked){status('正在写入视频…');const video=path.join(DATA,`${key}-live-${stamp}.${checked.ext}`);await fsp.writeFile(video,checked.bytes);content.live={video,plan:checked.plan,still:file};}
 for(const old of await fsp.readdir(DATA))if(old.startsWith(key+'-live-')&&(!content.live||old!==path.basename(content.live.video)))fsp.unlink(path.join(DATA,old)).catch(()=>{});
 if(clipList.length){status('正在写入图层视频…');content.clips=[];for(const [i,c] of clipList.entries()){const video=path.join(DATA,`${key}-clip-${i}-${stamp}.${c.ext}`);await fsp.writeFile(video,c.bytes);content.clips.push({...c.item,video});}}
 const keepClips=new Set(content.clips.map(c=>path.basename(c.video)));for(const old of await fsp.readdir(DATA))if(old.startsWith(key+'-clip-')&&!keepClips.has(old))fsp.unlink(path.join(DATA,old)).catch(()=>{});
 if(content.clips.length)content.still=file;
 if(content.overlay||content.live||content.clips.length||content.lyrics){status('正在放置桌面层…');await showLayer(monitorId,monitor,content,stamp);}
 else await clearLayer(monitorId);
 if(mascotCfg){status('正在放置萌版人物…');await showMascot(monitorId,monitor,mascotCfg);}else await closeMascot(monitorId);
 await saveLayers();status('已应用到显示器 '+(monitor.index+1)+(content.live?'（动态壁纸）':content.clips.length?'（含动态图层）':''));
 return {ok:true,file,layer:layers.has(monitorId),live:!!content.live,clips:content.clips.length,lyrics:!!content.lyrics,mascot:!!mascotCfg};
}
// A transparent, click-through window the size of the monitor, parented under the wallpaper host by the bridge.
// content = {overlay: PNG path | null, live: {video, plan, still} | null, clips: [{video,…look}], still}; layer.html paints the video
// pieces and the clips below the person, then the overlay, then the clips above it — all on one canvas when any video plays.
async function showLayer(monitorId,monitor,content,stamp){
 let entry=layers.get(monitorId);
 if(!entry||entry.window.isDestroyed()){
  // Not resizable:false — Electron would pin the maximum size to the work area (monitor minus taskbar) and the bridge's SetWindowPos could never reach the full monitor height.
  const win=new BrowserWindow({x:0,y:0,width:monitor.width,height:monitor.height,frame:false,transparent:true,hasShadow:false,movable:false,minimizable:false,maximizable:false,skipTaskbar:true,focusable:false,show:false,title:'Desktop Rider Layer',
   webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
  win.setIgnoreMouseEvents(true);win.setMenuBarVisibility(false);
  entry={window:win,overlay:null,live:null,clips:[],still:null,lyrics:null,lyricsState:null,paused:false,pauseReason:'',covered:false,watcher:null,rect:{left:monitor.left,top:monitor.top,width:monitor.width,height:monitor.height},attached:false};layers.set(monitorId,entry);
  win.on('closed',()=>{entry.watcher?.stop();entry.watcher=null;if(layers.get(monitorId)===entry)layers.delete(monitorId);});
 }
 entry.overlay=content.overlay||null;entry.live=content.live||null;entry.clips=Array.isArray(content.clips)?content.clips:[];entry.lyrics=content.lyrics||null;entry.lyricsState=null;entry.still=content.still||content.live?.still||null;entry.rect={left:monitor.left,top:monitor.top,width:monitor.width,height:monitor.height};
 let url=fileUrl(path.join(__dirname,'layer.html'))+'?v='+stamp;
 if(entry.overlay)url+='&img='+encodeURIComponent(fileUrl(entry.overlay));
 if(entry.live)url+='&live='+encodeURIComponent(JSON.stringify({video:fileUrl(entry.live.video),still:entry.live.still?fileUrl(entry.live.still):null,plan:entry.live.plan}));
 if(entry.clips.length)url+='&clips='+encodeURIComponent(JSON.stringify({width:monitor.width,height:monitor.height,still:entry.still?fileUrl(entry.still):null,items:entry.clips.map(c=>({...c,video:fileUrl(c.video)}))}));
 if(entry.lyrics)url+='&lyrics='+encodeURIComponent(JSON.stringify({style:entry.lyrics.style,lines:entry.lyrics.source.mode==='manual'?LyricsView.parse(entry.lyrics.source.lrc):[]}))+'&lib='+encodeURIComponent(fileUrl(path.join(WEB_ROOT,'lyrics-view.js')))+'&css='+encodeURIComponent(fileUrl(path.join(WEB_ROOT,'lyrics-view.css')));
 await entry.window.loadURL(url);entry.window.showInactive();
 if(process.platform==='win32'){const result=await native.attachLayer(hwndOf(entry.window.getNativeWindowHandle()),entry.rect);entry.attached=true;entry.host=result.host;}
 else{entry.window.setBounds(screen.getAllDisplays()[monitor.index]?.bounds||{x:0,y:0,width:800,height:500});entry.window.setAlwaysOnTop(false);} // dev preview on other OSes: a plain window
 entry.paused=undefined;entry.pauseReason=undefined;watchEntry(entry); // a fresh page starts playing: re-evaluate and resend the decision
 lyricsEntry(entry);
}
async function clearLayer(monitorId){const entry=layers.get(monitorId);if(!entry)return;layers.delete(monitorId);entry.watcher?.stop();entry.watcher=null;mediaWatchSync();
 if(process.platform==='win32'&&entry.attached&&!entry.window.isDestroyed()){try{await native.detachLayer(hwndOf(entry.window.getNativeWindowHandle()));}catch{}}
 if(!entry.window.isDestroyed())entry.window.destroy();await saveLayers();}
const saveLayers=()=>writeJson(LAYERS,[...layers].map(([monitorId,e])=>({monitorId,overlay:e.overlay,live:e.live,clips:e.clips,still:e.still,lyrics:e.lyrics,rect:e.rect})));
// Windows keeps the wallpaper itself; the layer windows are ours to bring back after a restart.
async function restoreLayers(){
 const saved=readJson(LAYERS,[]);if(!Array.isArray(saved)||!saved.length)return;
 let list=[];try{list=await monitors();}catch{return;}
 for(const item of saved){
  const monitor=list.find(m=>m.id===item.monitorId),overlay=item.overlay||item.file||null,live=item.live&&item.live.video&&item.live.plan?item.live:null; // `file` = pre-live layers.json
  const clips=(Array.isArray(item.clips)?item.clips:[]).filter(c=>c&&typeof c.video==='string'&&fs.existsSync(c.video)),still=item.still&&fs.existsSync(item.still)?item.still:null;
  let lyrics=null;try{lyrics=checkLyrics(item.lyrics);}catch{}
  if(!monitor||(overlay&&!fs.existsSync(overlay))||(live&&!fs.existsSync(live.video))||(!overlay&&!live&&!clips.length&&!lyrics))continue;
  try{await showLayer(item.monitorId,monitor,{overlay,live,clips,still,lyrics},Date.now());}catch(error){console.error('restore layer',error);}
 }
 await saveLayers();
}

ipcMain.on('client:version',e=>{e.returnValue=app.getVersion();});
ipcMain.handle('client:monitors',()=>monitors());
ipcMain.handle('client:apply',(e,request)=>apply(request));
ipcMain.handle('client:clear-layer',(e,monitorId)=>{if(typeof monitorId!=='string')throw new Error('缺少显示器');return clearLayer(monitorId);});
// One entry per live layer window; hwnd lets test/windows.cjs ask Win32 where the window ended up.
ipcMain.handle('client:layers',()=>[...layers].map(([monitorId,e])=>({monitorId,host:e.host||null,attached:!!e.attached,rect:e.rect,overlay:e.overlay,live:!!e.live,clips:e.clips?e.clips.length:0,video:hasVideo(e),paused:!!e.paused,pauseReason:e.pauseReason||'',covering:e.covering||null,lyrics:e.lyrics?{mode:e.lyrics.source.mode,provider:e.lyrics.source.provider,...(e.lyricsState||{track:null,playing:false,lines:e.lyrics.source.mode==='manual'?LyricsView.parse(e.lyrics.source.lrc).length:0,source:'',words:false,error:''})}:null,hwnd:process.platform==='win32'&&!e.window.isDestroyed()?hwndOf(e.window.getNativeWindowHandle()):null})));
ipcMain.handle('client:mascots',()=>[...mascots].map(([monitorId,m])=>({monitorId,hwnd:process.platform==='win32'&&!m.window.isDestroyed()?hwndOf(m.window.getNativeWindowHandle()):null,bounds:m.window.isDestroyed()?null:m.window.getBounds(),onTop:!!m.cfg.style.onTop,hover:!!m.hover})));
ipcMain.handle('client:mascot-api',()=>({url:web?web.url.replace(/\/$/,''):null,token:mascotToken}));
ipcMain.handle('client:get-settings',()=>settings);
ipcMain.handle('client:set-settings',(e,patch)=>setSettings(patch));
process.on('unhandledRejection',error=>{console.error(error);if(mainWindow&&!mainWindow.isDestroyed())status('出错：'+(error?.message||error));});
