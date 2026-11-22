'use strict';
// Exercise the real desktop renderer with a small deterministic rig. This validates renderer
// lifecycle events, not native movement: main-process cursor tests cover the host's DIP motion.
// No display settings are changed.
const {chromium,channel}=require('./playwright.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4l8AAAAASUVORK5CYII=';
const cfg={rig:{width:100,height:200,head:{url:png,x:0,y:0,w:100,h:110,pivot:{x:50,y:100}},body:{url:png,x:20,y:100,w:60,h:100},face:{eyes:[{x:.35,y:.4},{x:.65,y:.4}],mouth:{x:.5,y:.7},blush:[{x:.2,y:.6},{x:.8,y:.6}],size:.15}},style:{size:200,left:'500px',top:'600px'}};
const url=pathToFileURL(path.resolve(__dirname,'../client/windows/mascot.html'));
url.searchParams.set('cfg',JSON.stringify(cfg));url.searchParams.set('lib',pathToFileURL(path.resolve(__dirname,'../mascot-view.js')).href);url.searchParams.set('css',pathToFileURL(path.resolve(__dirname,'../mascot-view.css')).href);
(async()=>{
 const browser=await chromium.launch({headless:true,channel});
 try{
  const context=await browser.newContext({viewport:{width:400,height:500},deviceScaleFactor:1.5}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__seen=[];window.mascotBridge={hover:value=>__seen.push({type:'hover',value}),event:value=>__seen.push(value),onCommand:fn=>window.__command=fn,onMusic(){},onPaused(){}};
   window.addEventListener('pointerdown',e=>window.__press={clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,pointerId:e.pointerId});
  });
  await page.goto(url.href);await page.waitForFunction(()=>window.__mascot?.ready);
  const physicalHeight=()=>page.locator('#mascot .m-stage').evaluate(el=>parseFloat(getComputedStyle(el).height)*devicePixelRatio);
  assert.ok(Math.abs(await physicalHeight()-200)<.1,'150% renderer retains 200 physical pixel character height');
  await page.evaluate(()=>window.__command({type:'style',patch:{size:300}}));assert.ok(Math.abs(await physicalHeight()-300)<.1,'style command also uses physical pixels');
  const session=await context.newCDPSession(page);await session.send('Emulation.setDeviceMetricsOverride',{width:402,height:500,deviceScaleFactor:2,mobile:false});
  await page.waitForFunction(()=>devicePixelRatio===2&&window.__mascot.state().size===150);
  assert.ok(Math.abs(await physicalHeight()-300)<.1,'DPI change updates CSS size without changing saved physical size');
  const body=await page.locator('#mascot .m-body').boundingBox();await page.mouse.move(body.x+body.width/2,body.y+body.height/2);await page.mouse.down();
  const result=await page.evaluate(()=>{
   const root=document.getElementById('mascot'),p=window.__press;
   const move=(sx,sy,cx,cy)=>root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:p.pointerId,buttons:1,clientX:p.clientX+cx,clientY:p.clientY+cy,screenX:p.screenX+sx,screenY:p.screenY+sy}));
   move(40,30,40,30);move(80,60,40,30); // host moved 40,30 after the first event
   window.dispatchEvent(new MouseEvent('mousemove',{clientX:-500,clientY:-500}));window.dispatchEvent(new MouseEvent('mouseleave'));
   const held=window.__mascot.hover;
   root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:p.pointerId,clientX:-500,clientY:-500}));
   return {held,after:window.__mascot.hover,lifecycle:__seen.filter(e=>['drag-origin','drag','dragging','drop','drag-end'].includes(e.type)).map(e=>e.type)};
  });
  await page.mouse.up();assert.equal(result.held,true,'moving native window must not become click-through during capture');assert.equal(result.after,false,'release outside restores click-through');
  assert.deepEqual(result.lifecycle,['drag-origin','drag','dragging','dragging','drop','drag-end'],'native origin precedes movement; cleanup follows drop');
  assert.equal(await page.evaluate(()=>__seen.filter(e=>e.type==='drag-end').length),1,'implicit capture loss does not send duplicate cleanup');
  // A press that never crosses the drag threshold still releases the host's cursor origin.
  for(const terminal of ['pointerup','pointercancel','lostpointercapture']){
   const b=await page.locator('#mascot .m-body').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.evaluate(()=>__seen=[]);await page.mouse.down();
   await page.evaluate(type=>{const p=__press;document.getElementById('mascot').dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:p.pointerId,clientX:-500,clientY:-500}));},terminal);
   await page.mouse.up();
   assert.deepEqual(await page.evaluate(()=>__seen.filter(e=>['drag-origin','drag','drop','drag-end'].includes(e.type)).map(e=>e.type)),['drag-origin','drag-end'],terminal+' clears a press without moving the host');
  }
  // The same renderer in web preview must continue using local motion, regardless of screenX/Y.
  await page.evaluate(cfg=>{const root=document.createElement('div');root.id='preview';document.body.append(root);const view=MascotView.create(root);view.setStyle({size:160,left:'50%',top:'70%',interactive:true,externalDrag:false});view.setRig(cfg.rig);window.__preview=[];view.on(e=>__preview.push(e));},cfg);
  const preview=await page.locator('#preview .m-body').boundingBox();await page.mouse.move(preview.x+preview.width/2,preview.y+preview.height/2);await page.mouse.down();
  const moves=await page.evaluate(()=>{const p=__press,root=document.getElementById('preview');root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:p.pointerId,buttons:1,clientX:p.clientX+20,clientY:p.clientY-15,screenX:p.screenX+500,screenY:p.screenY+500}));root.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:p.pointerId}));return __preview.filter(e=>e.type==='dragging').map(e=>[e.dx,e.dy]);});
  await page.mouse.up();assert.deepEqual(moves,[[20,-15]],'web drag remains local');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
 console.log('PASS: desktop mascot physical sizing at 150%/200%, style resize, ordered native-drag lifecycle/cleanup, capture-safe hit testing, preview local dragging');
})().catch(e=>{console.error(e);process.exitCode=1;});
