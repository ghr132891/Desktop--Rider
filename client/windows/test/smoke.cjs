'use strict';
// Launches the real Electron app (any OS) with Playwright: the web app loads from the loopback
// server, the preload bridge is present, monitors come back, and panel settings update the real
// tray menu. Non-Windows apply fails with the expected message. Run: node test/smoke.cjs
const {_electron:electron}=require('playwright-core');
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os'),fs=require('node:fs');
(async()=>{
 const userData=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-rider-smoke-'));
 let app;
 try{
 app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'smoke-main.cjs'),'--user-data-dir='+userData],env:{...process.env,ELECTRON_ENABLE_LOGGING:'0'},timeout:30000});
 const errors=[];app.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
 await page.waitForFunction(()=>document.querySelector('#piece-left')?.style.backgroundImage,null,{timeout:30000});
 assert.match(page.url(),/^http:\/\/127\.0\.0\.1:\d+\/$/,'served from the loopback server');
 assert.equal(await page.title(),'Desktop Rider · 桌面设计室');
 assert.deepEqual(await page.evaluate(()=>Object.keys(window.desktopRider).sort()),['applyWallpaper','clearLayer','getSettings','layers','mascotApi','mascots','monitors','onStatus','platform','setSettings','version']);
 // The client module registered and lists this machine's displays.
 assert.ok(await page.evaluate(()=>Rider.modules.some(m=>m.id==='client')));
 await page.locator('[data-view="client"]').click();await page.waitForFunction(()=>document.querySelectorAll('.client-monitor').length>0);
 const monitors=await page.evaluate(()=>desktopRider.monitors());assert.ok(monitors.length>=1&&monitors[0].width>0&&typeof monitors[0].id==='string');
 assert.equal(fs.realpathSync(await app.evaluate(({app})=>app.getPath('userData'))),fs.realpathSync(userData)); // macOS: /var is a symlink to /private/var
 const trayState=()=>app.evaluate(()=>({
  updates:global.__smoke.menuUpdates,
  checks:global.__smoke.menu.items.filter(item=>item.type==='checkbox').map(item=>({label:item.label,checked:item.checked})),
  login:global.__smoke.loginSettings.at(-1)
 }));
 const checkSettings=async(expected,{persisted=true}={})=>{
  assert.deepEqual(await page.evaluate(()=>desktopRider.getSettings()),expected,'IPC returns the saved settings');
  if(persisted)assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData,'settings.json'),'utf8')),expected,'settings persist in the isolated profile');
  const tray=await trayState();
  assert.deepEqual(tray.checks,[{label:'开机启动',checked:expected.openAtLogin},{label:'节能：桌面被遮住或用电池时暂停视频',checked:expected.powerSave}],'native tray checkmarks agree with panel settings');
  if(process.platform==='win32'||process.platform==='darwin')assert.deepEqual(tray.login,{openAtLogin:expected.openAtLogin,args:['--hidden']},'login settings reach the intercepted OS call');
  return tray.updates;
 };
 let updates=await checkSettings({openAtLogin:false,powerSave:true},{persisted:false});
 // Use the actual checkboxes and wait for the IPC-backed success message, not only DOM state.
 for(let repeat=0;repeat<2;repeat++)for(const [selector,checked,expected,message] of [
  ['#client-autostart',true,{openAtLogin:true,powerSave:true},'已设置开机启动'],
  ['#client-powersave',false,{openAtLogin:true,powerSave:false},'已关闭节能暂停'],
  ['#client-autostart',false,{openAtLogin:false,powerSave:false},'已取消开机启动'],
  ['#client-powersave',true,{openAtLogin:false,powerSave:true},'已开启节能暂停']
 ]){
  await page.locator(selector).setChecked(checked);
  await page.waitForFunction(message=>document.querySelector('#client-status').textContent===message,message);
  const next=await checkSettings(expected);assert.ok(next>updates,'panel change refreshes the menu handed to the native tray');updates=next;
 }
 // Exercise the real MenuItem callback too; Electron itself toggles the checkbox before the handler.
 for(const [label,expected] of [
  ['开机启动',{openAtLogin:true,powerSave:true}],
  ['节能：桌面被遮住或用电池时暂停视频',{openAtLogin:true,powerSave:false}],
  ['开机启动',{openAtLogin:false,powerSave:false}],
  ['节能：桌面被遮住或用电池时暂停视频',{openAtLogin:false,powerSave:true}]
 ]){
  await app.evaluate(async(_,{label,updates})=>{
   global.__smoke.menu.items.find(item=>item.label===label).click();
   const deadline=Date.now()+5000;
   while(global.__smoke.menuUpdates<=updates){if(Date.now()>deadline)throw new Error('tray click did not refresh its menu');await new Promise(resolve=>setTimeout(resolve,10));}
  },{label,updates});
  updates=await checkSettings(expected);
 }
 if(process.platform!=='win32'){
  await page.locator('.client-monitor').first().click();
  await page.waitForFunction(()=>document.querySelector('#client-status').textContent.includes('只支持 Windows'),null,{timeout:60000});
 }
 assert.deepEqual(errors.filter(e=>!/Autofill|DevTools|只支持 Windows/.test(e)),[]); // the rejected apply is logged by Electron's IPC layer
 }finally{
  try{if(app)await app.close();}finally{fs.rmSync(userData,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
 }
 console.log('PASS: Electron boots, loopback/preload/monitors/client view work; panel settings refresh native tray checkmarks, persist, and preserve the other option; tray clicks still work; non-Windows apply fails cleanly.');
})().catch(e=>{console.error(e);process.exit(1);});
