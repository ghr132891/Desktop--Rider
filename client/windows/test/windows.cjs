'use strict';
// Windows-only integration test: the real bridge against the real desktop (CI runs it on the
// GitHub Windows runners, see .github/workflows/windows.yml). Launches the Electron client,
// applies the design to the primary monitor with a floating person and desktop text, then asks
// Windows itself — IDesktopWallpaper and Win32 — whether the wallpaper changed and the layer
// window sits under the wallpaper host at the monitor's rectangle. Restarts the app to see the
// layer come back from layers.json, clears it, and puts the previous wallpaper back.
// Screenshots of the whole desktop plus report.json go to test/out (or $DESKTOP_RIDER_OUT).
// Run on Windows: node test/windows.cjs
const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{execFile}=require('node:child_process');
const native=require('../lib/native'),bridge=native.create();
const OUT=process.env.DESKTOP_RIDER_OUT||path.join(__dirname,'out');fs.mkdirSync(OUT,{recursive:true});
const report={platform:process.platform,release:os.release(),startedAt:new Date().toISOString(),steps:[]};
const log=(step,data)=>{report.steps.push({step,...(data||{})});console.log('·',step,data?JSON.stringify(data):'');};
const ps=(file,list)=>new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,...list],{windowsHide:true,timeout:60000},(error,stdout,stderr)=>error?reject(new Error(String(stderr||error.message).trim())):resolve(stdout)));
const screenshot=name=>ps(path.join(__dirname,'screenshot.ps1'),['-Path',path.join(OUT,name)]).then(out=>log('screenshot',{name,...JSON.parse(out)})).catch(error=>log('screenshot failed',{name,error:error.message}));
const pngSize=file=>{const b=fs.readFileSync(file);assert.equal(b.toString('latin1',1,4),'PNG',file+' is a PNG');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};};
const realLower=p=>fs.realpathSync.native(p).toLowerCase();
const mainWindows=app=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>/^http:/.test(w.webContents.getURL())));
const hideMain=app=>app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())if(/^http:/.test(w.webContents.getURL()))w.hide();});
const showMain=app=>app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())if(/^http:/.test(w.webContents.getURL()))w.show();});
async function launch(userData){
 const app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--user-data-dir='+userData],env:{...process.env,ELECTRON_ENABLE_LOGGING:'0'}});
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 // The default 1440×960 main window would hide the whole 1024×768 runner desktop — and the power policy would then
 // rightly pause the layer videos. Keep it a normal window that leaves desktop visible.
 await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())if(/^http:/.test(w.webContents.getURL())){w.unmaximize();w.setBounds({x:60,y:40,width:900,height:640});}});
 await page.locator('#piece-left').evaluate(el=>new Promise(r=>{const c=()=>el.style.backgroundImage?r():requestAnimationFrame(c);c();}));
 return {app,page};
}
const rectOf=o=>({left:o.left,top:o.top,width:o.width,height:o.height});
// The layer window is a BrowserWindow too, so Playwright can ask layer.html whether the video paints.
async function untilPlaying(app,timeout=30000){const t0=Date.now();let last={frames:0,paused:true};while(Date.now()-t0<timeout){const win=app.windows().find(w=>w.url().includes('layer.html'));if(win){last=await win.evaluate(()=>({frames:window.__frames,paused:!window.__video||window.__video.paused,readyState:window.__video?.readyState,error:window.__video?.error?.code||null})).catch(()=>last);if(last.frames>5&&!last.paused)return last;}await new Promise(r=>setTimeout(r,500));}return last;}
// Poll from Node: restoreLayers() runs after the page is up (bridge compile + monitors + attach), and
// Playwright's waitForFunction does not await a promise-returning predicate.
async function until(page,fn,what,timeout=90000){const t0=Date.now();let last;while(Date.now()-t0<timeout){last=await page.evaluate(fn);if(last)return last;await page.waitForTimeout(500);}throw new Error('timed out waiting for '+what+'; last value '+JSON.stringify(last));}

(async()=>{
 assert.equal(process.platform,'win32','test/windows.cjs needs Windows; the other OSes run test/smoke.cjs');
 const userData=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-rider-win-'));
 const monitors=await bridge.monitors();log('monitors',{monitors});
 assert.ok(monitors.length>=1,'at least one monitor');const primary=monitors.find(m=>m.primary)||monitors[0];
 assert.ok(primary.width>0&&primary.height>0&&typeof primary.id==='string');
 const original=await bridge.getWallpaper(primary.id).catch(error=>{log('get-wallpaper failed',{error:error.message});return '';});log('original wallpaper',{original});
 await screenshot('1-before.png');
 let app=null,page=null;
 try{
  ({app,page}=await launch(userData));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Floating person (auto cutout of the built-in portrait) plus desktop text → the overlay has content.
  await page.evaluate(()=>{state={...clone(defaults),wallpaper:'portrait',mode:'vertical',ratio:50,gap:20};state.modules.note.text='Desktop Rider CI';update({zones:true});});
  await page.locator('#float-toggle').check();
  await page.locator('#float-status').filter({hasText:'人物已抠出'}).waitFor({timeout:180000});log('person cut out');
  await page.locator('[data-view="client"]').click();await page.waitForFunction(()=>document.querySelectorAll('.client-monitor').length>0);
  const listed=await page.evaluate(()=>[...document.querySelectorAll('.client-monitor')].map(b=>b.textContent));log('listed monitors',{listed});
  assert.equal(listed.length,monitors.length,'the view lists every monitor the bridge reports');
  assert.equal(listed[primary.index],`显示器 ${primary.index+1}${primary.primary?' · 主显示器':''}${primary.width} × ${primary.height}`);

  // 1. Apply to the primary monitor; the client reports wallpaper + layer.
  await page.locator('.client-monitor').nth(primary.index).click();
  await page.waitForFunction(()=>/^(已应用到显示器 \d+（含桌面层）|应用失败：.*)$/.test(document.querySelector('#client-status').textContent),null,{timeout:180000});
  const status=await page.locator('#client-status').textContent();log('apply status',{status});
  assert.match(status,/^已应用到显示器 \d+（含桌面层）$/);

  // 2. Windows reports our file as that monitor's wallpaper, at the monitor's physical resolution.
  const current=await bridge.getWallpaper(primary.id);log('wallpaper after apply',{current});
  assert.ok(current&&fs.existsSync(current),'wallpaper file exists');
  assert.equal(realLower(path.dirname(current)),realLower(path.join(userData,'desktop')),'wallpaper points at the file the client wrote');
  assert.match(path.basename(current),/^[0-9a-f]{12}-\d+\.png$/);
  assert.deepEqual(pngSize(current),{width:primary.width,height:primary.height},'rendered at the monitor resolution');
  const overlayFile=path.join(path.dirname(current),path.basename(current).slice(0,12)+'-overlay.png');
  assert.ok(fs.existsSync(overlayFile),'overlay PNG written');assert.deepEqual(pngSize(overlayFile),{width:primary.width,height:primary.height});

  // 3. The layer window is a child of the wallpaper host (WorkerW, or Progman on 24H2), visible, covering the monitor.
  const layers=await page.evaluate(()=>desktopRider.layers());log('layers',{layers});
  assert.equal(layers.length,1);const layer=layers[0];
  assert.equal(layer.monitorId,primary.id);assert.ok(['workerw','progman'].includes(layer.host),'host is workerw or progman: '+layer.host);assert.ok(Number.isInteger(layer.hwnd)&&layer.hwnd>0);
  const info=await bridge.layerInfo(layer.hwnd);log('layer window',info);
  assert.equal(info.valid,true);assert.equal(info.parentClass,layer.host==='workerw'?'WorkerW':'Progman');assert.equal(info.visible,true);
  assert.deepEqual(rectOf(info),rectOf(primary),'layer covers the monitor exactly');
  assert.equal((await mainWindows(app)).length,1);
  await hideMain(app);await page.waitForTimeout(1500);await screenshot('2-applied.png');await showMain(app);
  await page.screenshot({path:path.join(OUT,'2-client-view.png')});
  assert.deepEqual(errors,[],'no page errors');

  // 3b. 分区画面露白 on the real desktop: the left piece pushed right bares a strip at the left edge. fill=gap → the
  //     PNG Windows shows carries the gap colour there; fill=extend → 本机扩图 rebuilds the strip from the picture (the
  //     export awaits the inpaint worker at the monitor's aspect); cover back on → the clamp keeps the picture over it.
  const GAP=[233,239,244],isGap=p=>p[0]===GAP[0]&&p[1]===GAP[1]&&p[2]===GAP[2];
  const strip=file=>app.evaluate(({nativeImage},file)=>{const img=nativeImage.createFromPath(file),{width,height}=img.getSize(),b=img.toBitmap();return [.2,.5,.8].map(f=>{const i=(Math.round(height*f)*width+Math.round(width*.03))*4;return [b[i+2],b[i+1],b[i],b[i+3]];});},file);
  const applyPiece=async patch=>{await page.evaluate(patch=>{Object.assign(state.pieces[0],patch);update({custom:false});document.querySelector('#client-status').textContent='';},patch);
   await page.locator('.client-monitor').nth(primary.index).click();await page.waitForFunction(()=>/^(已应用到显示器 \d+（含桌面层）|应用失败：.*)$/.test(document.querySelector('#client-status').textContent),null,{timeout:180000});
   const st=await page.locator('#client-status').textContent();assert.match(st,/^已应用到/,st);const file=await bridge.getWallpaper(primary.id);return {file:path.basename(file),pixels:await strip(file),piece:await page.evaluate(()=>({cover:state.pieces[0].cover,dx:state.pieces[0].dx,fill:state.pieces[0].fill}))};};
  // The shared picture is cover-fitted to the monitor, so how far it must move right before the piece's left edge is bare
  // depends on the monitor's aspect: compute the offset that leaves a 15 %-wide strip at this monitor's size.
  const push=await page.evaluate(async({w,h})=>{const s={...clone(state),aspect:w/h};s.pieces[0]={...s.pieces[0],cover:false,dx:0,dy:0,zoom:100};const img=await loadImage(source(s)),p=piecePlacement(s,img,w,h,geometry(s,w,h).polygons[0],0);return Math.round((w*.15-p.x)/w*1000)/10;},{w:primary.width,h:primary.height});
  log('push for a 15% bare strip',{push});assert.ok(push>0&&push<=100,'the strip is reachable within the offset range: '+push);
  const bare=await applyPiece({cover:false,dx:push,dy:0,zoom:100,fill:'gap'});log('bare strip · gap colour',bare);
  assert.ok(bare.pixels.every(isGap),'cover off + fill=gap: the left strip of the wallpaper Windows shows is the gap colour');
  const extended=await applyPiece({fill:'extend'});log('bare strip · 本机扩图',extended);
  assert.ok(extended.pixels.every(p=>p[3]===255&&!isGap(p)),'fill=extend: the strip is rebuilt from picture texture');
  await hideMain(app);await page.waitForTimeout(1500);await screenshot('2b-extended.png');await showMain(app);
  const covered=await applyPiece({cover:true});log('不露白 back on',covered);
  assert.ok(covered.pixels.every(p=>p[3]===255&&!isGap(p)),'cover on: the picture covers the strip again');
  // The snap happens in the 16:10 preview, whose clamp may leave a hair of slack (the picture overhangs the piece a little there).
  assert.ok(Math.abs(covered.piece.dx)<2,'the offset snaps back to what the clamp allows (from '+push+'): '+covered.piece.dx);
  assert.deepEqual(errors,[],'no page errors after the fill steps');

  // 3c. A video layer (modules/layers.js) plays in the layer window with its own frame and look: a 2 s WebM whose colour
  //     cycles becomes a layer above the person at a known spot (rotated, rounded); after applying, the layer window's
  //     canvas changes at the clip's centre between two reads while the wallpaper beside it stays put.
  await page.evaluate(()=>new Promise((resolve,reject)=>{const c=document.createElement('canvas');c.width=160;c.height=160;const ctx=c.getContext('2d');const rec=new MediaRecorder(c.captureStream(30),{mimeType:'video/webm'});const chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
   rec.onstop=()=>Rider.modules.find(m=>m.id==='layers').addVideo(new File([new Blob(chunks)],'cycle.webm',{type:'video/webm'})).then(resolve,reject);
   let t=0;const timer=setInterval(()=>{ctx.fillStyle=`hsl(${t*6},90%,50%)`;ctx.fillRect(0,0,160,160);if(++t>=60){clearInterval(timer);rec.stop();}},33);rec.start();}));
  await page.evaluate(()=>{const m=Rider.modules.find(x=>x.id==='layers'),it=m.me().items.at(-1);Object.assign(it,{x:75,y:25,w:20,h:24,above:true,rotate:15,radius:20,blend:'normal',opacity:100});m.changed();});
  await page.waitForFunction(()=>document.querySelectorAll('.layer-item video').length===1&&!document.querySelector('.layer-item video').paused,null,{timeout:30000});log('video layer added',{item:await page.evaluate(()=>({...state.modules.layers.items.at(-1)}))});
  // Adding a layer switches the sidebar to the 图层 view; go back to the client view before applying.
  await page.locator('[data-view="client"]').click();await page.evaluate(()=>{document.querySelector('#client-status').textContent='';});await page.locator('.client-monitor').nth(primary.index).click();
  await page.waitForFunction(()=>/^(已应用到显示器 \d+（含动态图层）|应用失败：.*)$/.test(document.querySelector('#client-status').textContent),null,{timeout:180000});
  const clipStatus=await page.locator('#client-status').textContent();log('clip apply status',{status:clipStatus});assert.match(clipStatus,/（含动态图层）$/);
  const clipLayers=await page.evaluate(()=>desktopRider.layers());log('clip layers',{layers:clipLayers});assert.equal(clipLayers.length,1);assert.equal(clipLayers[0].clips,1);assert.equal(clipLayers[0].live,false);
  const clipPlaying=await untilPlaying(app);log('clip layer playing',clipPlaying);assert.ok(clipPlaying.frames>5&&!clipPlaying.paused,'the layer window decodes and paints the clip');
  const layerWin=()=>app.windows().find(w=>w.url().includes('layer.html'));
  const readCanvas=()=>layerWin().evaluate(()=>{const c=document.getElementById('live'),x=c.getContext('2d'),px=(fx,fy)=>[...x.getImageData(Math.round(c.width*fx),Math.round(c.height*fy),1,1).data];return {clip:px(.75,.25),beside:px(.6,.25),clips:window.__clips.length,playing:window.__clips.every(v=>!v.paused&&v.readyState>=2),size:[c.width,c.height]};});
  const readA=await readCanvas();await page.waitForTimeout(900);const readB=await readCanvas();log('clip canvas reads',{readA,readB});
  assert.deepEqual(readA.size,[primary.width,primary.height]);assert.equal(readA.clips,1);assert.ok(readA.playing,'clip video is playing in the layer window');
  assert.ok(readA.clip[3]===255&&readB.clip[3]===255&&readA.clip.slice(0,3).some((v,i)=>Math.abs(v-readB.clip[i])>24),'the clip\'s centre changes between frames: '+JSON.stringify([readA.clip,readB.clip]));
  assert.deepEqual(readA.beside,readB.beside,'the wallpaper beside the clip is still');
  await hideMain(app);await page.waitForTimeout(1500);await screenshot('2c-clip.png');await showMain(app);
  // Power saving: maximising the main window hides the desktop → the bridge watcher reports it → the clip pauses and the
  // canvas stops redrawing; restoring the window resumes playback. (Lock screen / battery use the same path via powerMonitor.)
  const mainWin=fn=>app.evaluate(({BrowserWindow},fn)=>{const w=BrowserWindow.getAllWindows().find(w=>/^http:/.test(w.webContents.getURL()));return eval(fn)(w);},fn.toString());
  await mainWin(w=>{w.show();w.maximize();});
  const pausedLayer=await until(page,async()=>{const l=await desktopRider.layers();return l[0]&&l[0].paused?l[0]:null;},'the layer pausing behind a maximised window',20000);log('paused behind maximised window',{layer:pausedLayer});
  assert.equal(pausedLayer.pauseReason,'covered');assert.ok(pausedLayer.covering&&pausedLayer.covering.zoomed,'the covering window is the maximised one: '+JSON.stringify(pausedLayer.covering));
  const pausedA=await layerWin().evaluate(()=>({paused:window.__paused,reason:window.__pauseReason,all:window.__clips.every(v=>v.paused),frames:window.__frames}));await page.waitForTimeout(1000);const pausedB=await layerWin().evaluate(()=>window.__frames);log('paused reads',{pausedA,framesLater:pausedB});
  assert.ok(pausedA.paused&&pausedA.all&&pausedA.reason==='covered','every clip video is paused in the layer window');assert.ok(pausedB-pausedA.frames<=2,'no redraws while paused: '+(pausedB-pausedA.frames));
  await mainWin(w=>{w.unmaximize();w.setBounds({x:60,y:40,width:900,height:640});});
  const resumedLayer=await until(page,async()=>{const l=await desktopRider.layers();return l[0]&&!l[0].paused?l[0]:null;},'the layer resuming',20000);log('resumed',{layer:resumedLayer});
  let resumed=null;for(const t0=Date.now();Date.now()-t0<20000;){resumed=await layerWin().evaluate(()=>({frames:window.__frames,paused:window.__paused||window.__clips.some(v=>v.paused)}));if(!resumed.paused&&resumed.frames>pausedB+3)break;await page.waitForTimeout(400);}
  log('resumed reads',resumed);assert.ok(resumed&&!resumed.paused&&resumed.frames>pausedB+3,'clips play again after the window is restored');
  await page.evaluate(()=>{const m=Rider.modules.find(x=>x.id==='layers');m.remove(m.me().items.at(-1));});await page.waitForFunction(()=>state.modules.layers.items.length===0);
  assert.deepEqual(errors,[],'no page errors after the clip step');

  // 3d. 桌面歌词 (modules/lyrics.js): manual LRC with three lines, green 5 % text, fade. The runner has no media session,
  //     so the layer window runs its own clock: the shown line cycles through all three; style arrives in px.
  await page.evaluate(()=>{Object.assign(state.modules.lyrics,{enabled:true,mode:'manual',lrc:'[00:00.00]第一句歌词\n[00:01.50]第二句歌词\n[00:03.00]第三句歌词',size:5,color:'#00ff00',transition:'fade',duration:.3,y:30});update({custom:false});document.querySelector('#client-status').textContent='';});
  await page.locator('.client-monitor').nth(primary.index).click();
  await page.waitForFunction(()=>/^(已应用到显示器 \d+（含桌面层）|应用失败：.*)$/.test(document.querySelector('#client-status').textContent),null,{timeout:180000});
  const lyricsStatus=await page.locator('#client-status').textContent();log('lyrics apply status',{status:lyricsStatus});assert.match(lyricsStatus,/（含桌面层）$/);
  const lyricsLayers=await page.evaluate(()=>desktopRider.layers());log('lyrics layers',{layers:lyricsLayers});assert.equal(lyricsLayers[0].lyrics?.mode,'manual');assert.equal(lyricsLayers[0].lyrics?.lines,3);
  const lyricSeen=new Set();let lyricStyle=null;for(let i=0;i<20;i++){const r=await layerWin().evaluate(()=>{const b=document.getElementById('lyrics'),cs=getComputedStyle(b);return {line:b.querySelector('.lyrics-line.in')?.textContent||'',hidden:b.hidden,fontSize:parseFloat(cs.fontSize),color:cs.color,transition:b.dataset.transition,media:window.__lyrics.media,ticks:window.__lyrics.ticks};});lyricStyle=r;if(r.line)lyricSeen.add(r.line);await page.waitForTimeout(300);}
  log('lyrics in the layer window',{seen:[...lyricSeen],style:lyricStyle});
  assert.ok(['第一句歌词','第二句歌词','第三句歌词'].every(t=>lyricSeen.has(t)),'the layer window cycles through the lines on its own clock: '+[...lyricSeen].join('|'));
  assert.equal(lyricStyle.hidden,false);assert.ok(Math.abs(lyricStyle.fontSize-primary.height*.05)<1,'5 % of the monitor height in px: '+lyricStyle.fontSize);assert.equal(lyricStyle.color,'rgb(0, 255, 0)');assert.equal(lyricStyle.transition,'fade');assert.equal(lyricStyle.media,null,'no media session on the runner → own clock');
  await hideMain(app);await page.waitForTimeout(1500);await screenshot('2d-lyrics.png');await showMain(app);

  // 4. Live wallpaper: a 2 s WebM recorded in the page becomes the wallpaper; the layer window plays it clipped to the pieces.
  await page.evaluate(()=>new Promise((resolve,reject)=>{const c=document.createElement('canvas');c.width=320;c.height=200;const ctx=c.getContext('2d');const rec=new MediaRecorder(c.captureStream(30),{mimeType:'video/webm'});const chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
   rec.onstop=()=>Rider.modules.find(m=>m.id==='live').useFile(new File([new Blob(chunks)],'ci.webm',{type:'video/webm'})).then(resolve,reject);
   let t=0;const timer=setInterval(()=>{ctx.fillStyle=`hsl(${t*6},70%,45%)`;ctx.fillRect(0,0,320,200);ctx.fillStyle='#fff';ctx.fillRect((t*5)%300,80,30,30);if(++t>=60){clearInterval(timer);rec.stop();}},33);rec.start();}));
  await page.waitForFunction(()=>state.modules.live.enabled&&document.querySelectorAll('.live-piece:not([hidden])').length>0,null,{timeout:30000});log('live video imported',{live:await page.evaluate(()=>state.modules.live)});
  await page.locator('.client-monitor').nth(primary.index).click();
  await page.waitForFunction(()=>/^(已应用到显示器 \d+（动态壁纸）|应用失败：.*)$/.test(document.querySelector('#client-status').textContent),null,{timeout:180000});
  const liveStatus=await page.locator('#client-status').textContent();log('live apply status',{status:liveStatus});assert.match(liveStatus,/（动态壁纸）$/);
  const liveLayers=await page.evaluate(()=>desktopRider.layers());log('live layers',{layers:liveLayers});
  assert.equal(liveLayers.length,1);assert.equal(liveLayers[0].live,true);assert.equal(liveLayers[0].monitorId,primary.id);
  const liveInfo=await bridge.layerInfo(liveLayers[0].hwnd);log('live layer window',liveInfo);assert.equal(liveInfo.visible,true);assert.deepEqual(rectOf(liveInfo),rectOf(primary));
  const playing=await untilPlaying(app);log('live layer playing',playing);assert.ok(playing.frames>5&&!playing.paused,'the layer window decodes and paints frames');
  await hideMain(app);await page.waitForTimeout(1500);await screenshot('3-live.png');await showMain(app);

  // 5. Restart: layers.json brings the live layer back on its own, under the host again and playing.
  await app.close();app=null;
  ({app,page}=await launch(userData));
  const restored=(await until(page,async()=>{const l=await desktopRider.layers();return l.length===1&&l[0].attached?l:null;},'the restored layer'))[0];log('restored layer',{restored});
  assert.equal(restored.monitorId,primary.id);assert.notEqual(restored.hwnd,liveLayers[0].hwnd,'a new window after restart');assert.equal(restored.live,true);assert.equal(restored.lyrics?.lines,3,'the manual lyrics came back with the layer');
  const info2=await bridge.layerInfo(restored.hwnd);log('restored layer window',info2);
  assert.equal(info2.valid,true);assert.equal(info2.visible,true);assert.equal(info2.parentClass,restored.host==='workerw'?'WorkerW':'Progman');assert.deepEqual(rectOf(info2),rectOf(primary));
  const kept=await bridge.getWallpaper(primary.id);assert.ok(kept&&fs.existsSync(kept)&&path.basename(kept).startsWith(path.basename(current).slice(0,12)),'Windows kept our wallpaper across the restart');
  const playing2=await untilPlaying(app);log('restored layer playing',playing2);assert.ok(playing2.frames>5&&!playing2.paused,'the restored layer plays');
  await hideMain(app);await page.waitForTimeout(1500);await screenshot('4-restored.png');await showMain(app);

  // 6. Clearing destroys the window; Win32 no longer knows the handle.
  await page.evaluate(id=>desktopRider.clearLayer(id),primary.id);
  assert.deepEqual(await page.evaluate(()=>desktopRider.layers()),[]);
  const gone=await bridge.layerInfo(restored.hwnd);log('after clear',gone);assert.equal(gone.valid,false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData,"desktop","layers.json"),"utf8")),[]);
  report.result='pass';
 }catch(error){
  report.result='fail';report.error=error.stack||String(error);await screenshot('failure.png');
  // GitHub Actions annotation: readable on the public run page without signing in to see logs.
  if(process.env.GITHUB_ACTIONS)console.log('::error title=test/windows.cjs::'+String(error.message||error).replace(/\r?\n/g,'%0A')+'%0Asteps: '+JSON.stringify(report.steps).replace(/\r?\n/g,' ').slice(0,3000));
  throw error;
 }finally{
  if(app)await app.close().catch(()=>{});
  if(original&&fs.existsSync(original))await bridge.setWallpaper(primary.id,original).then(()=>log('original wallpaper restored')).catch(error=>log('restore wallpaper failed',{error:error.message}));
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,1));
  fs.rmSync(userData,{recursive:true,force:true});
 }
 const summary=`PASS: on ${os.release()} the bridge set the wallpaper per monitor at ${primary.width}×${primary.height}, parented the layer window under ${report.steps.find(s=>s.step==='layers').layers[0].host}, rendered a bare piece strip as gap colour / 本机扩图 / covered, played a video layer above the person in the layer window (paused behind a maximised window, resumed after), showed cycling 桌面歌词 lines, restored the live layer after a restart and cleared it. Screenshots in ${OUT}`;
 console.log(summary);if(process.env.GITHUB_ACTIONS)console.log('::notice title=test/windows.cjs::'+summary);
})().catch(error=>{console.error(error);process.exit(1);});
