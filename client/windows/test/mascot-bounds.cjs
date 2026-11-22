'use strict';
// Real Windows/Electron regression: transparent non-resizable windows must not grow while
// being moved. The VM restore tests cannot detect Electron's native DPI rounding feedback.
// Reusable from windows.cjs, or standalone: node test/mascot-bounds.cjs.
const assert=require('node:assert/strict'),path=require('node:path');
async function verifyMascotBounds(app,{bridge=require('../lib/native').create(),log=()=>{}}={}){
 assert.equal(process.platform,'win32','mascot bounds verification needs Windows');
 // Playwright's main-process evaluation context does not expose CommonJS require/mainModule.
 // Execute the exact pure product helper, as windows.cjs does for desktop-pixel assertions.
 const moveSource=require('../lib/display-geometry').moveMascotWindow.toString();
 const displays=await app.evaluate(({screen})=>screen.getAllDisplays().map(d=>({id:d.id,bounds:d.bounds,scaleFactor:d.scaleFactor})));
 assert.ok(displays.length,'at least one real display is required');
 const scales=[...new Set(displays.map(d=>d.scaleFactor))],coverage={displays:displays.length,scales,mixedDpi:scales.length>1,scaledDisplay:scales.some(s=>s!==1)};
 log('mascot move coverage',coverage);
 if(!coverage.mixedDpi)log('mascot move coverage limitation',{message:'Mixed-DPI displays unavailable; testing all current displays without claiming mixed-DPI coverage.'});
 const results=[];
 for(const display of displays){
  assert.ok(display.bounds.width>=440&&display.bounds.height>=277,'display must fit the movement fixture');
  let created=null,failed=false;
  try{
   created=await app.evaluate(async({BrowserWindow},{display,moveSource})=>{
    if(globalThis.__desktopRiderBoundsTest)throw new Error('A mascot bounds test is already active');
    const move=eval('('+moveSource+')');
    const requested={x:display.bounds.x+40,y:display.bounds.y+40,width:360,height:197};
    const win=new BrowserWindow({...requested,frame:false,transparent:true,hasShadow:false,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,focusable:false,show:false,alwaysOnTop:true,
     title:'Desktop Rider 人物移动回归',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    const state=globalThis.__desktopRiderBoundsTest={window:win,bounds:{...requested},requested,dragStart:{bounds:{...requested},point:{x:0,y:0}},move};
    win.setIgnoreMouseEvents(true,{forward:true});
    await win.loadURL('data:text/html,<style>html,body{margin:0;background:transparent;overflow:hidden}</style><div style="width:24px;height:24px;background:%2348c9ff"></div>');
    win.showInactive();await new Promise(r=>setTimeout(r,150));
    // Product showMascot pins the intended size after construction. Do not use getBounds()
    // as the intended size: constructor DPI rounding can already have added a pixel.
    win.setBounds(requested);await new Promise(r=>setTimeout(r,50));
    state.bounds={...requested};
    const handle=win.getNativeWindowHandle(),hwnd=handle.length===8?Number(handle.readBigUInt64LE(0)):handle.readUInt32LE(0);
    return {hwnd,requested,actual:win.getBounds(),minimum:win.getMinimumSize(),maximum:win.getMaximumSize()};
   },{display,moveSource});
   const before=await bridge.layerInfo(created.hwnd);assert.equal(before.valid,true);assert.equal(before.visible,true);
   const phases=[];
   for(const phase of ['stationary','round-trip']){
    const result=await app.evaluate(async(_electron,{phase,scale})=>{
     const m=globalThis.__desktopRiderBoundsTest,w=m.window,requested=m.requested,iterations=phase==='stationary'?100:120;
     const range={minWidth:Infinity,maxWidth:0,minHeight:Infinity,maxHeight:0};let last;
     for(let i=0;i<iterations;i++){
      const point=phase==='stationary'?{x:24,y:16}:i%2===0?{x:24,y:16}:{x:0,y:0};
      m.move(m,point);await new Promise(r=>setTimeout(r,16));
      const b=w.getBounds(),target={...requested,x:requested.x+point.x,y:requested.y+point.y};
      for(const key of ['x','y','width','height'])if(Math.abs(b[key]-target[key])>2)throw new Error('Mascot native bounds drift: '+JSON.stringify({phase,i,scale,target,actual:b,minimum:w.getMinimumSize(),maximum:w.getMaximumSize()}));
      range.minWidth=Math.min(range.minWidth,b.width);range.maxWidth=Math.max(range.maxWidth,b.width);range.minHeight=Math.min(range.minHeight,b.height);range.maxHeight=Math.max(range.maxHeight,b.height);last=b;
     }
     return {phase,iterations,range,last,minimum:w.getMinimumSize(),maximum:w.getMaximumSize()};
    },{phase,scale:display.scaleFactor});
    assert.ok(result.range.maxWidth-result.range.minWidth<=2&&result.range.maxHeight-result.range.minHeight<=2,'rounding must stay bounded across repeated native moves');phases.push(result);
   }
   const after=await bridge.layerInfo(created.hwnd);assert.equal(after.valid,true);
   for(const key of ['width','height']){
    assert.ok(Math.abs(after[key]-before[key])<=2,'physical '+key+' must not accumulate growth');
    assert.ok(Math.abs(after[key]-created.requested[key]*display.scaleFactor)<=Math.ceil(2*display.scaleFactor),'physical '+key+' matches requested DIP size');
   }
   const renderer=await app.evaluate(()=>globalThis.__desktopRiderBoundsTest.window.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})'));
   assert.equal(renderer.dpr,display.scaleFactor,'the fixture remains on its intended display');
   const result={display,created,before,phases,after,renderer};results.push(result);log('mascot native movement stable',result);
  }catch(error){
   failed=true;
   const native=created?await bridge.layerInfo(created.hwnd).catch(()=>null):null;log('mascot native movement failed',{display,message:error.message,native});throw error;
  }finally{
   try{await app.evaluate(()=>{const m=globalThis.__desktopRiderBoundsTest;delete globalThis.__desktopRiderBoundsTest;if(m&&!m.window.isDestroyed())m.window.destroy();});}
   catch(error){if(!failed)throw error;} // Preserve the original failure if Electron has already exited.
  }
 }
 return {coverage,results};
}
module.exports={verifyMascotBounds};

if(process.versions.electron){
  // Minimal standalone host: no product profile, wallpaper or login settings are touched.
  // Playwright loads the entry without setting process.mainModule/require.main.
  const {app}=require('electron');app.on('window-all-closed',()=>{});
}else if(require.main===module){
  const fs=require('node:fs'),os=require('node:os'),{_electron}=require('playwright-core');
  (async()=>{
   assert.equal(process.platform,'win32','test/mascot-bounds.cjs needs Windows');
   const profile=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-rider-bounds-')),out=process.env.DESKTOP_RIDER_OUT||path.join(__dirname,'out');
   const report={startedAt:new Date().toISOString(),result:'fail',steps:[]};let app;
   try{
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    app=await _electron.launch({executablePath:require('electron'),args:[__filename,'--user-data-dir='+profile],env,timeout:30000});
    report.versions=await app.evaluate(()=>process.versions);
    report.details=await verifyMascotBounds(app,{log:(step,data)=>{report.steps.push({step,...data});console.log('·',step,JSON.stringify(data));}});report.result='pass';
   }catch(error){report.error=error.stack||String(error);throw error;}
   finally{
    try{if(app)await app.close();}finally{
     fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'mascot-bounds-report.json'),JSON.stringify(report,null,2));
     assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()),'cleanup stays in the temporary directory');fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
    }
   }
   console.log('PASS: real Electron mascot moves retain their intended size on every connected display.');
  })().catch(error=>{console.error(error);process.exitCode=1;});
}
