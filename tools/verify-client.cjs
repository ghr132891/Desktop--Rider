// Client module (modules/client.js) against a fake window.desktopRider bridge, plus the
// wallpaperCanvas layer split the Windows client relies on. Runs in plain Chromium.
const {chromium}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 await context.addInitScript(()=>{window.__calls=[];window.desktopRider={platform:'win32',version:'0.1.0-test',
  monitors:async()=>[{id:'\\\\?\\DISPLAY#A',index:0,left:0,top:0,width:1280,height:800,primary:true},{id:'\\\\?\\DISPLAY#B',index:1,left:1280,top:0,width:1080,height:1920,primary:false}],
  applyWallpaper:async r=>{window.__calls.push(r);return {ok:true,layer:!!r.overlay};},clearLayer:async id=>{window.__calls.push({clear:id});},layers:async()=>[],
  getSettings:async()=>({openAtLogin:true}),setSettings:async p=>{window.__calls.push({settings:p});return p;},onStatus:fn=>{window.__status=fn;return()=>{};}};});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
 await page.goto('http://127.0.0.1:4173');await page.locator('#piece-left').evaluate(el=>new Promise(resolve=>{const check=()=>el.style.backgroundImage?resolve():requestAnimationFrame(check);check();}));
 // Registered only because the bridge exists; its view lists both monitors with real sizes.
 assert.ok(await page.evaluate(()=>Rider.modules.some(m=>m.id==='client')));
 await page.locator('[data-view="client"]').click();await page.waitForFunction(()=>document.querySelectorAll('.client-monitor').length===2);
 assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.client-monitor')].map(b=>b.textContent)),['显示器 1 · 主显示器1280 × 800','显示器 21080 × 1920']);
 assert.equal(await page.locator('#client-autostart').isChecked(),true);
 // Applying renders background + overlay at the monitor's resolution; with nothing floating there is no overlay.
 await page.locator('.client-monitor').nth(1).click();await page.waitForFunction(()=>window.__calls.length===1,null,{timeout:60000});
 const first=await page.evaluate(async()=>{const c=window.__calls[0];const img=new Image();img.src=c.background;await img.decode();return {monitorId:c.monitorId,w:img.naturalWidth,h:img.naturalHeight,overlay:c.overlay,clips:c.clips};});
 assert.deepEqual(first,{monitorId:'\\\\?\\DISPLAY#B',w:1080,h:1920,overlay:null,clips:[]},'no video layers → an empty clip list');
 assert.match(await page.locator('#client-status').textContent(),/已应用到显示器 2/);
 // Desktop text (an above-person module) makes an overlay; the background stays free of it.
 await page.evaluate(()=>{state.modules.note.text='客户端测试';update({custom:false});});
 await page.locator('.client-monitor').nth(0).click();await page.waitForFunction(()=>window.__calls.length===2,null,{timeout:60000});
 const second=await page.evaluate(async()=>{const c=window.__calls[1];const load=async src=>{const img=new Image();img.src=src;await img.decode();const cv=document.createElement('canvas');cv.width=img.naturalWidth;cv.height=img.naturalHeight;cv.getContext('2d').drawImage(img,0,0);return cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;};
  const ov=await load(c.overlay),bg=await load(c.background);let opaque=0,transparent=0;for(let i=3;i<ov.length;i+=4)ov[i]>0?opaque++:transparent++;let bgTransparent=0;for(let i=3;i<bg.length;i+=4)if(bg[i]<255)bgTransparent++;
  return {w:Math.sqrt(ov.length/4*1280/800)|0,opaque,transparent,bgTransparent};});
 assert.equal(second.w,1280);assert.ok(second.opaque>200&&second.transparent>second.opaque*20,'overlay holds only the text: '+JSON.stringify(second));assert.equal(second.bgTransparent,0,'background is fully opaque');
 // The layer split in wallpaperCanvas itself: background + overlay == all, pixel for pixel where either draws.
 const split=await page.evaluate(async()=>{const s=clone(state);const all=await wallpaperCanvas(s,400),bg=await wallpaperCanvas(s,400,{layers:'background'}),ov=await wallpaperCanvas(s,400,{layers:'overlay'});
  const cv=document.createElement('canvas');cv.width=bg.width;cv.height=bg.height;const ctx=cv.getContext('2d');ctx.drawImage(bg,0,0);ctx.drawImage(ov,0,0);
  const a=all.getContext('2d').getImageData(0,0,400,250).data,b=ctx.getImageData(0,0,400,250).data;let diff=0;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>2)diff++;return diff;});
 assert.equal(split,0,'background + overlay recomposes the full export');
 // Settings and clearing layers go through the bridge.
 await page.locator('#client-autostart').uncheck();await page.locator('#client-clear').click();await page.waitForFunction(()=>window.__calls.length===5);
 assert.deepEqual(await page.evaluate(()=>window.__calls.slice(2)),[{settings:{openAtLogin:false}},{clear:'\\\\?\\DISPLAY#A'},{clear:'\\\\?\\DISPLAY#B'}]);
 await page.evaluate(()=>{window.__status('来自客户端的状态');});assert.equal(await page.locator('#client-status').textContent(),'来自客户端的状态');
 await page.evaluate(()=>{state.modules.note.text='';update({custom:false});});
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: client module registers with the bridge, lists monitors, renders background/overlay at monitor resolution, overlay only when needed, layer split recomposes the export, settings and layer clearing; no browser errors.');
})().catch(e=>{console.error(e);process.exit(1)});
