const {chromium}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
// Wallpaper Engine binary fixtures: length-prefixed strings for PKGV, C strings for TEXV.
const i32=v=>{const b=Buffer.alloc(4);b.writeInt32LE(v);return b;};
const pstr=s=>Buffer.concat([i32(Buffer.byteLength(s)),Buffer.from(s)]);
const cstr=s=>Buffer.from(s+'\0');
function tex({format=0,width,height,container,fif=-1,data,lz4=0,raw=0}){
 const head=[cstr('TEXV0005'),cstr('TEXI0001'),i32(format),i32(2),i32(width),i32(height),i32(width),i32(height),i32(0),cstr(container),i32(1)];
 if(container==='TEXB0003')head.push(i32(fif));
 return Buffer.concat([...head,i32(1),i32(width),i32(height),i32(lz4),i32(raw),i32(data.length),data]);
}
// Solid RGBA as one LZ4 block: 4 literals, an overlapping match, 5 trailing literals.
function lz4Solid(rgba,bytes){const ext=n=>{const out=[];n-=15;while(n>=255){out.push(255);n-=255;}out.push(n);return out;};const match=bytes-4-5-4;
 return Buffer.from([0x4f,...rgba,4,0,...ext(match),0x50,rgba[3],...rgba]);}
function pkg(files){const names=Object.keys(files);let offset=0;const table=[pstr('PKGV0024'),i32(names.length)];
 for(const n of names){table.push(pstr(n),i32(offset),i32(files[n].length));offset+=files[n].length;}return Buffer.concat([...table,...names.map(n=>files[n])]);}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-rider-we-'));
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173');await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.evaluate(()=>{state={...clone(defaults),wallpaper:'portrait',mode:'vertical',ratio:50,gap:20,showIcons:false};update({zones:true});});

  // 1. Auto cutout on the built-in portrait.
  await page.locator('#float-toggle').check();
  await page.locator('#float-status').filter({hasText:'人物已抠出'}).waitFor({timeout:60000});
  assert.equal(await page.locator('#float-person').isVisible(),true);
  assert.equal(await page.evaluate(()=>state.floatPoints.length),1);
  assert.equal(await page.locator('#protect-person').isDisabled(),true);

  // 2. Hole filled: the background no longer holds the person at the original spot.
  const fillCheck=await page.evaluate(async()=>{const img=await loadImage(source()),cut=await Cutout.separate(img,source(),state.floatPoints),bg=await loadImage(cut.backgroundUrl);
   const w=img.naturalWidth,h=img.naturalHeight,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});
   const sample=im=>{ctx.drawImage(im,0,0);const x=Math.round((cut.box.x+cut.box.w/2)*w),y=Math.round((cut.box.y+cut.box.h*.3)*h);return [...ctx.getImageData(x,y,1,1).data].slice(0,3);};
   return {orig:sample(img),bg:sample(bg),cutAlpha:cut.cutout.getContext('2d').getImageData(cut.cutout.width>>1,Math.round(cut.cutout.height*.3),1,1).data[3],box:cut.box};});
  assert.ok(fillCheck.cutAlpha>200,'cutout keeps the person opaque');
  assert.ok(fillCheck.orig.some((v,i)=>Math.abs(v-fillCheck.bg[i])>12),'background differs where the person was');

  // 3. Drag + wheel move only the layer; export draws it at the same place.
  const box=await page.locator('#float-person').boundingBox(),desk=await page.locator('#desktop').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-desk.width*.2,box.y+box.height/2,{steps:4});await page.mouse.up();
  const moved=await page.evaluate(()=>({x:state.floatX,y:state.floatY,size:state.floatSize}));
  assert.ok(Number.isFinite(moved.x)&&Number.isFinite(moved.size));
  await page.mouse.move(box.x+box.width/2-desk.width*.2,box.y+box.height/2);await page.mouse.wheel(0,300);
  const shrunk=await page.evaluate(()=>state.floatSize);assert.ok(shrunk<moved.size,'wheel down shrinks');
  await page.locator('#float-person').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>state.floatX),Math.round((moved.x+1)*10)/10);
  const exportCheck=await page.evaluate(async()=>{const s=clone(state),w=800,h=500,on=await wallpaperCanvas(s,w),off=await wallpaperCanvas({...s,floatPerson:false},w);
   const view=await scene(s),f=floatFrame(s,view,w,h),px=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];
   const cx=Math.round(f.left+f.w/2),cy=Math.round(f.top+f.h*.3);return {on:px(on,cx,cy),off:px(off,cx,cy),floatIn:f.w>10&&f.h>10};});
  assert.ok(exportCheck.floatIn);assert.notDeepEqual(exportCheck.on,exportCheck.off,'export contains floating person');

  // 4. Persistence and reset.
  await page.evaluate(()=>persistNow());await page.reload();
  await page.locator('#float-status').filter({hasText:'人物已抠出'}).waitFor({timeout:60000});
  assert.equal(await page.evaluate(()=>state.floatX),Math.round((moved.x+1)*10)/10);
  await page.locator('#float-reset').click();assert.equal(await page.evaluate(()=>state.floatX),null);

  // 5. Cutout dialog: removing a region shrinks the selection.
  await page.locator('#edit-cutout').click();await page.locator('#cutout-status').filter({hasText:'已选中'}).waitFor({timeout:30000});
  const before=Number((await page.locator('#cutout-status').textContent()).match(/(\d+)%/)[1]);
  const canvasBox=await page.locator('#cutout-canvas').boundingBox(),p=fillCheck.box;
  await page.mouse.click(canvasBox.x+(p.x+p.w/2)*canvasBox.width,canvasBox.y+(p.y+p.h*.9)*canvasBox.height,{button:'right'});
  await page.waitForFunction(b=>{const m=document.querySelector('#cutout-status').textContent.match(/(\d+)%/);return m&&Number(m[1])<b;},before,{timeout:30000});
  await page.locator('#cutout-undo').click();await page.locator('#cutout-status').filter({hasText:before+'%'}).waitFor({timeout:30000});
  await page.locator('#cutout-apply').click();
  await page.screenshot({path:'artifacts/float-person.png'});

  // 6. Wallpaper Engine folder: embedded PNG layer and LZ4 raw RGBA layer.
  const pngData=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=500;const x=c.getContext('2d');x.fillStyle='#3a7';x.fillRect(0,0,800,500);x.fillStyle='#e43';x.fillRect(250,125,300,250);return c.toDataURL('image/png').split(',')[1];});
  const png=Buffer.from(pngData,'base64'),rawBytes=512*512*4,raw=lz4Solid([10,20,200,255],rawBytes);
  const scene=pkg({'scene.json':Buffer.from('{}'),'materials/main.tex':tex({width:800,height:500,container:'TEXB0003',fif:13,data:png}),'materials/blue.tex':tex({width:512,height:512,container:'TEXB0002',data:raw,lz4:1,raw:rawBytes}),'materials/masks/m.tex':tex({format:9,width:512,height:512,container:'TEXB0003',data:Buffer.alloc(512*512)})});
  const root=path.join(fixture,'431960');for(const [id,project,files] of [['1001',{title:'测试场景',type:'scene',file:'scene.json',preview:'preview.png'},{'scene.pkg':scene,'preview.png':png}],['1002',{title:'测试网页',type:'web',file:'index.html',preview:'preview.png'},{'index.html':Buffer.from('<p>'),'preview.png':png}]]){
   const dir=path.join(root,id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(project));for(const [n,b] of Object.entries(files))fs.writeFileSync(path.join(dir,n),b);}
  await page.locator('[data-view=wallpaper]').click();await page.locator('#wallpaper-controls .we-trigger').click();
  await page.locator('#we-folder').setInputFiles(root);
  await page.locator('#we-summary').filter({hasText:'找到 2 个壁纸'}).waitFor();
  await page.locator('.we-item',{hasText:'测试场景'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.we-source').length===3);
  const labels=await page.locator('.we-source span').allTextContents();
  assert.match(labels[0],/main · 800×500/);assert.match(labels[1],/blue · 512×512/);assert.match(labels[2],/预览图/);
  await page.locator('.we-source').nth(1).click();await page.locator('#we-apply').click();await page.waitForFunction(()=>!document.querySelector('#we-dialog').open);
  const blue=await page.evaluate(async()=>{const i=await loadImage(state.customImage),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return [i.naturalWidth,[...x.getImageData(256,256,1,1).data]];});
  assert.equal(blue[0],512);assert.ok(Math.abs(blue[1][2]-200)<8&&blue[1][0]<20,'LZ4 RGBA layer decoded: '+blue[1]);
  await page.locator('#wallpaper-controls .we-trigger').click();await page.locator('.we-item',{hasText:'测试场景'}).click();await page.waitForFunction(()=>document.querySelectorAll('.we-source').length===3);
  await page.locator('#we-apply').click();await page.waitForFunction(()=>!document.querySelector('#we-dialog').open);
  const main=await page.evaluate(async()=>{const i=await loadImage(state.customImage),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return [i.naturalWidth,i.naturalHeight,[...x.getImageData(400,250,1,1).data]];});
  assert.deepEqual(main.slice(0,2),[800,500]);assert.ok(main[2][0]>200&&main[2][1]<90,'embedded PNG layer decoded');
  assert.equal(await page.evaluate(()=>state.floatPerson),false,'new wallpaper clears the cutout');
  await page.locator('#wallpaper-controls .we-trigger').click();await page.locator('.we-item',{hasText:'测试网页'}).click();
  assert.deepEqual(await page.locator('.we-source span').allTextContents(),['预览图（分辨率较低）']);
  assert.deepEqual(errors,[]);
  console.log('PASS: auto cutout, hole fill, drag/wheel/keyboard, export, persistence, add/remove points, Wallpaper Engine scan, PNG + LZ4 layers, web preview; no browser errors.');
 }finally{await browser.close();fs.rmSync(fixture,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
