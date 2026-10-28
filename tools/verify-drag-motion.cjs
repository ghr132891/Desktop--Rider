const {chromium}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');
  await page.evaluate(async()=>{state={...clone(defaults),wallpaper:'portrait',mode:'vertical',ratio:50,anchorY:50,gap:60,protectPerson:true,showIcons:false};updateControls();renderZones();await renderDesktop();});
  await page.locator('#person-status').filter({hasText:'人物保护已就绪'}).waitFor({timeout:45000});
  const initial=await page.locator('#portrait-layer').evaluate(c=>c.toDataURL());
  await page.screenshot({path:'artifacts/drag-motion-before.png',fullPage:true});
  const b=await page.locator('#desktop').boundingBox();const handle=await page.locator('#split-handle').boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width*.5,b.y+b.height*.75,{steps:4});
  // Vertical movement along a vertical line used to move only the handle.
  // Check rendered wallpaper while the pointer is STILL DOWN, not just state.
  await page.waitForFunction(before=>document.querySelector('#portrait-layer').toDataURL()!==before,initial);
  const during=await page.locator('#portrait-layer').evaluate(c=>c.toDataURL());
  assert.equal(await page.locator('#anchor-y').inputValue(),'75');assert.equal(await page.locator('#ratio').inputValue(),'50');
  assert.equal(await page.locator('#split-guide').evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.screenshot({path:'artifacts/drag-motion-during.png',fullPage:true});
  await page.mouse.move(b.x+b.width*.75,b.y+b.height*.75,{steps:4});
  await page.waitForFunction(before=>document.querySelector('#portrait-layer').toDataURL()!==before,during);await page.mouse.up();
  const metrics=await page.evaluate(async()=>{
   const img=await loadImage(source()),person=await Portrait.detect(img,source());
   async function sample(ratio,anchorY,linked){const s={...state,ratio,anchorY,linked};const result=await wallpaperCanvas(s,800);return {s,c:result,p:Portrait.placement(s,img,800,500)};}
   const a=await sample(50,50,true),b=await sample(75,75,true),offA=await sample(50,50,false),offB=await sample(75,75,false);
   // The person's transform must translate, never scale its two sides separately.
   const fixed={...state,mode:'vertical',ratio:50,anchorY:50,linked:false};const fixedY={...fixed,anchorY:75};
   return {dx:b.p.x-a.p.x,dy:b.p.y-a.p.y,scaleX:b.p.w/a.p.w,scaleY:b.p.h/a.p.h,offX:offB.p.x-offA.p.x,offY:offB.p.y-offA.p.y,offVerticalSame:(await wallpaperCanvas(fixed,800)).toDataURL()===(await wallpaperCanvas(fixedY,800)).toDataURL(),preview:document.querySelector('#portrait-layer').toDataURL(),exported:(await wallpaperCanvas(state,document.querySelector('#portrait-layer').width)).toDataURL()};
  });
  assert(metrics.dx>25&&metrics.dy>15,'Both axes must visibly move image content');assert.equal(metrics.scaleX,1);assert.equal(metrics.scaleY,1);assert.equal(metrics.offX,0);assert.equal(metrics.offY,0);assert(metrics.offVerticalSame);assert.equal(metrics.preview,metrics.exported);
  await page.reload();await page.locator('#person-status').filter({hasText:'人物保护已就绪'}).waitFor({timeout:45000});assert.equal(await page.locator('#anchor-y').inputValue(),'75');assert.equal(await page.locator('#ratio').inputValue(),'75');
  assert.deepEqual(errors,[]);console.log('PASS: wallpaper pixels move during held pointer drag in both axes; vertical-only motion changes image; guide visible; shared scale preserved; disabled linkage fixed; export and reload match.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
