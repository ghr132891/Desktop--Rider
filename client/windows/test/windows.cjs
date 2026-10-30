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
 await page.locator('#piece-left').evaluate(el=>new Promise(r=>{const c=()=>el.style.backgroundImage?r():requestAnimationFrame(c);c();}));
 return {app,page};
}
const rectOf=o=>({left:o.left,top:o.top,width:o.width,height:o.height});
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

  // 4. Restart: layers.json brings the layer back on its own, under the host again.
  await app.close();app=null;
  ({app,page}=await launch(userData));
  const restored=(await until(page,async()=>{const l=await desktopRider.layers();return l.length===1&&l[0].attached?l:null;},'the restored layer'))[0];log('restored layer',{restored});
  assert.equal(restored.monitorId,primary.id);assert.notEqual(restored.hwnd,layer.hwnd,'a new window after restart');
  const info2=await bridge.layerInfo(restored.hwnd);log('restored layer window',info2);
  assert.equal(info2.valid,true);assert.equal(info2.visible,true);assert.equal(info2.parentClass,restored.host==='workerw'?'WorkerW':'Progman');assert.deepEqual(rectOf(info2),rectOf(primary));
  assert.equal(await bridge.getWallpaper(primary.id),current,'Windows kept the wallpaper across the restart');
  await hideMain(app);await page.waitForTimeout(1500);await screenshot('3-restored.png');await showMain(app);

  // 5. Clearing destroys the window; Win32 no longer knows the handle.
  await page.evaluate(id=>desktopRider.clearLayer(id),primary.id);
  assert.deepEqual(await page.evaluate(()=>desktopRider.layers()),[]);
  const gone=await bridge.layerInfo(restored.hwnd);log('after clear',gone);assert.equal(gone.valid,false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData,'desktop','layers.json'),'utf8')),[]);
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
 const summary=`PASS: on ${os.release()} the bridge set the wallpaper per monitor at ${primary.width}×${primary.height}, parented the layer window under ${report.steps.find(s=>s.step==='layers').layers[0].host}, restored it after a restart and cleared it. Screenshots in ${OUT}`;
 console.log(summary);if(process.env.GITHUB_ACTIONS)console.log('::notice title=test/windows.cjs::'+summary);
})().catch(error=>{console.error(error);process.exit(1);});
