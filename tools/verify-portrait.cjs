const {chromium}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1150}});const errors=[];const externalRequests=[];page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173')&&!request.url().startsWith('data:')&&!request.url().startsWith('blob:'))externalRequests.push(request.url());});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')console.log('browser:',msg.text());});
 await page.goto('http://127.0.0.1:4173');
 await page.locator('[data-view="wallpaper"]').click();await page.locator('[data-wallpaper="portrait"]').click();await page.locator('[data-view="design"]').click();
 await page.locator('#person-status').filter({hasText:'人物保护已就绪'}).waitFor({timeout:45000});
 console.log('Segmentation:',await page.locator('#person-status').textContent());
 const mask=await page.evaluate(async()=>{const result=await Portrait.detect(await loadImage(source()),source());return {coverage:result.coverage,width:result.mask.width,height:result.mask.height};});
 console.log(mask);assert(mask.coverage>.05&&mask.coverage<.85,'Model must find a plausible person mask');
 await page.evaluate(async()=>{state.angle=40;state.ratio=50;state.gap=38;state.showIcons=false;updateControls();renderZones();await renderDesktop();});
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'artifacts/portrait-protected.png',fullPage:true});
 const parity=await page.evaluate(async()=>{const c=document.querySelector('#portrait-layer');return c.toDataURL()===(await wallpaperCanvas(state,c.width)).toDataURL();});assert(parity,'Portrait preview must match exported PNG at the same resolution');
 const exportCheck=await page.evaluate(async()=>{
  const img=await loadImage(source()),person=await Portrait.detect(img,source());const c=await wallpaperCanvas(state),w=c.width,h=c.height;
  const original=document.createElement('canvas');original.width=w;original.height=h;original.getContext('2d',{willReadFrequently:true}).drawImage(img,-w*.09,-h*.09,w*1.18,h*1.18);
  const mask=document.createElement('canvas');mask.width=w;mask.height=h;mask.getContext('2d',{willReadFrequently:true}).drawImage(person.mask,-w*.09,-h*.09,w*1.18,h*1.18);
  const a=c.getContext('2d').getImageData(0,0,w,h).data,b=original.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,m=mask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
  let checked=0,maxError=0,worst=null;for(let i=0;i<m.length;i+=4){if(m[i+3]!==255)continue;checked++;for(let k=0;k<3;k++){const err=Math.abs(a[i+k]-b[i+k]);if(err>maxError){maxError=err;worst={x:(i/4)%w,y:Math.floor(i/4/w),a:[...a.slice(i,i+4)],b:[...b.slice(i,i+4)]};}}}
  return {checked,maxError,worst,placement:Portrait.placement(state,img,w,h),png:c.toDataURL()};
 });
 console.log('Uniformly positioned subject pixels preserved:',exportCheck.checked,'max channel error:',exportCheck.maxError,'diagnostic:',exportCheck.worst,exportCheck.placement);assert(exportCheck.checked>10000);assert(exportCheck.maxError<=1);
 fs.writeFileSync('artifacts/portrait-protected-wallpaper.png',Buffer.from(exportCheck.png.split(',')[1],'base64'));
 // Position picking must work away from the middle, in both axes.
 await page.locator('#pick-split').click();const box=await page.locator('#desktop').boundingBox();
 await page.mouse.click(box.x+box.width*.2,box.y+box.height*.3);
 assert.equal(await page.locator('#ratio').inputValue(),'20');assert.equal(await page.locator('#anchor-y').inputValue(),'30');
 await page.locator('#split-handle').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Shift+ArrowLeft');
 assert.equal(await page.locator('#ratio').inputValue(),'15');assert.equal(await page.locator('#anchor-y').inputValue(),'29');
 await page.waitForFunction(()=>document.querySelector('#split-handle').style.left===state.ratio+'%'); // the handle moves on the next render frame
 const hb=await page.locator('#split-handle').boundingBox();await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.7);await page.mouse.up();
 assert.equal(await page.locator('#ratio').inputValue(),'80');assert.equal(await page.locator('#anchor-y').inputValue(),'70');
 const end=await page.locator('#split-start').boundingBox(),oldAngle=await page.locator('#angle').inputValue();await page.mouse.move(end.x+end.width/2,end.y+end.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.05);await page.mouse.up();assert.notEqual(await page.locator('#angle').inputValue(),oldAngle);
 await page.locator('#pick-split').click();await page.keyboard.press('Escape');assert(await page.locator('#split-picker').isHidden());
 // Persistence includes the non-central anchor and portrait mode.
 const before=await page.evaluate(()=>({x:state.ratio,y:state.anchorY,angle:state.angle}));await page.reload();const after=await page.evaluate(()=>({x:state.ratio,y:state.anchorY,angle:state.angle}));assert.deepEqual(after,before);assert(await page.locator('#protect-person').isChecked());
 await page.locator('#person-status').filter({hasText:'人物保护已就绪'}).waitFor({timeout:45000});
 // Ordinary split can choose an arbitrary source cut, independently of output size.
 await page.locator('#protect-person').uncheck();await page.locator('#source-options summary').click();await page.locator('#source-cut').fill('30');assert.equal(await page.locator('#source-cut-value').textContent(),'30%');
 await page.locator('#protect-person').check();await page.locator('#person-status').filter({hasText:'人物保护已就绪'}).waitFor();
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/portrait-mobile.png',fullPage:true});
 // Restore a legacy scheme and verify new fields are migrated, not left undefined.
 const migration=await page.evaluate(()=>{const old=clone(defaults);for(const key of ['anchorY','sourceRatio','focusX','focusY','protectPerson'])delete old[key];old.wallpaper='portrait';const result=normalizeState(old);return {anchorY:result.anchorY,sourceRatio:result.sourceRatio,protect:result.protectPerson};});assert.deepEqual(migration,{anchorY:50,sourceRatio:50,protect:true});
 assert.deepEqual(externalRequests,[],'Runtime must not request any external URL');
 // Simulate a missing model, ensure the original stays visible, then retry.
 const failure=await browser.newPage();await failure.route('**/selfie_segmenter.tflite',route=>route.abort());await failure.goto('http://127.0.0.1:4173');
 await failure.locator('[data-view="wallpaper"]').click();await failure.locator('[data-wallpaper="portrait"]').click();await failure.locator('[data-view="design"]').click();
 await failure.locator('#person-status').filter({hasText:'人物识别失败'}).waitFor({timeout:45000});assert(await failure.locator('#portrait-layer').isHidden());assert.equal(await failure.locator('#piece-left').evaluate(e=>e.style.clipPath),'none');
 await failure.unroute('**/selfie_segmenter.tflite');await failure.locator('#retry-person').click();await failure.locator('#person-status').filter({hasText:'人物保护已就绪'}).waitFor({timeout:45000});await failure.close();
 assert.deepEqual(errors,[]);console.log('PASS: real local segmentation, person pixels unchanged, arbitrary pick / two-axis drag / endpoint drag / keyboard / persistence / source cut / mobile.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
