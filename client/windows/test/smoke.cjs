'use strict';
// Launches the real Electron app (any OS) with Playwright: the web app loads from the loopback
// server, the preload bridge is present, monitors come back, and applying on a non-Windows
// host fails with the expected message instead of crashing. Run: node test/smoke.cjs
const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
(async()=>{
 const userData=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-rider-smoke-'));
 const app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--user-data-dir='+userData],env:{...process.env,ELECTRON_ENABLE_LOGGING:'0'}});
 const errors=[];app.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await page.locator('#piece-left').evaluate(el=>new Promise(r=>{const c=()=>el.style.backgroundImage?r():requestAnimationFrame(c);c();}));
 assert.match(page.url(),/^http:\/\/127\.0\.0\.1:\d+\/$/,'served from the loopback server');
 assert.equal(await page.title(),'Desktop Rider · 桌面设计室');
 assert.deepEqual(await page.evaluate(()=>Object.keys(window.desktopRider).sort()),['applyWallpaper','clearLayer','getSettings','layers','mascotApi','mascots','monitors','onStatus','platform','setSettings','version']);
 // The client module registered and lists this machine's displays.
 assert.ok(await page.evaluate(()=>Rider.modules.some(m=>m.id==='client')));
 await page.locator('[data-view="client"]').click();await page.waitForFunction(()=>document.querySelectorAll('.client-monitor').length>0);
 const monitors=await page.evaluate(()=>desktopRider.monitors());assert.ok(monitors.length>=1&&monitors[0].width>0&&typeof monitors[0].id==='string');
 const settings=await page.evaluate(()=>desktopRider.setSettings({openAtLogin:false}));assert.equal(settings.openAtLogin,false);
 if(process.platform!=='win32'){
  await page.locator('.client-monitor').first().click();
  await page.waitForFunction(()=>document.querySelector('#client-status').textContent.includes('只支持 Windows'),null,{timeout:60000});
 }
 assert.deepEqual(errors.filter(e=>!/Autofill|DevTools|只支持 Windows/.test(e)),[]); // the rejected apply is logged by Electron's IPC layer
 await app.close();fs.rmSync(userData,{recursive:true,force:true});
 console.log('PASS: Electron boots, serves the web app over loopback, exposes the bridge, lists monitors, client module view works; non-Windows apply fails cleanly.');
})().catch(e=>{console.error(e);process.exit(1);});
