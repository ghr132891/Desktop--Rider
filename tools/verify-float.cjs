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
// DXT5: alpha endpoints 200/40 (index 0 → 200), colour endpoint 0 = pure green.
const dxt5Solid=(w,h)=>Buffer.concat(Array.from({length:(w/4)*(h/4)},()=>Buffer.from([200,40,0,0,0,0,0,0,0xe0,0x07,0,0,0,0,0,0])));
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
  assert.equal(await page.locator('.float-person').isVisible(),true);
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
  const box=await page.locator('.float-person').boundingBox(),desk=await page.locator('#desktop').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-desk.width*.2,box.y+box.height/2,{steps:4});await page.mouse.up();
  const moved=await page.evaluate(()=>({x:state.floatCopies[0].x,y:state.floatCopies[0].y,size:state.floatCopies[0].size}));
  assert.ok(Number.isFinite(moved.x)&&Number.isFinite(moved.size));
  await page.mouse.move(box.x+box.width/2-desk.width*.2,box.y+box.height/2);await page.mouse.wheel(0,300);
  await page.waitForFunction(v=>state.floatCopies[0].size<v,moved.size,{timeout:5000}).catch(()=>{}); // wheel events are delivered asynchronously
  const shrunk=await page.evaluate(()=>state.floatCopies[0].size);assert.ok(shrunk<moved.size,'wheel down shrinks');
  await page.locator('.float-person').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>state.floatCopies[0].x),Math.round((moved.x+1)*10)/10);
  const exportCheck=await page.evaluate(async()=>{const s=clone(state),w=800,h=500,on=await wallpaperCanvas(s,w),off=await wallpaperCanvas({...s,floatPerson:false},w);
   const view=await scene(s),f=floatFrame(s,view,w,h),px=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];
   const cx=Math.round(f.left+f.w/2),cy=Math.round(f.top+f.h*.3);return {on:px(on,cx,cy),off:px(off,cx,cy),floatIn:f.w>10&&f.h>10};});
  assert.ok(exportCheck.floatIn);assert.notDeepEqual(exportCheck.on,exportCheck.off,'export contains floating person');
  // Keep-original: the person stays at the source spot while the floating copy is still drawn.
  await page.locator('#float-keep').check();await page.locator('#float-status').filter({hasText:'人物已抠出'}).waitFor({timeout:60000});
  const keepCheck=await page.evaluate(async()=>{const s=clone(state),w=800,h=500,keep=await wallpaperCanvas(s,w),plain=await wallpaperCanvas({...s,floatPerson:false},w),filled=await wallpaperCanvas({...s,floatKeepOriginal:false},w);
   const view=await scene({...s,floatKeepOriginal:false}),img=view.original,b=view.cut.box,sx=Math.round((b.x+b.w/2)*w),sy=Math.round((b.y+b.h*.3)*h),px=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data].slice(0,3);
   const f=floatFrame(s,view,w,h),cx=Math.round(f.left+f.w/2),cy=Math.round(f.top+f.h*.3);return {keepSrc:px(keep,sx,sy),plainSrc:px(plain,sx,sy),filledSrc:px(filled,sx,sy),keepFloat:px(keep,cx,cy),plainFloat:px(plain,cx,cy)};});
  assert.deepEqual(keepCheck.keepSrc,keepCheck.plainSrc,'keep-original leaves the source spot untouched');
  assert.ok(keepCheck.filledSrc.some((v,i)=>Math.abs(v-keepCheck.keepSrc[i])>12),'fill changes the source spot when not keeping');
  assert.notDeepEqual(keepCheck.keepFloat,keepCheck.plainFloat,'floating copy still drawn');
  await page.locator('#float-keep').uncheck();await page.locator('#float-status').filter({hasText:'人物已抠出'}).waitFor({timeout:60000});

  // 4. Persistence and reset.
  await page.evaluate(()=>persistNow());await page.reload();
  await page.locator('#float-status').filter({hasText:'人物已抠出'}).waitFor({timeout:60000});
  assert.equal(await page.evaluate(()=>state.floatCopies[0].x),Math.round((moved.x+1)*10)/10);
  await page.locator('#float-reset').click();assert.equal(await page.evaluate(()=>state.floatCopies[0].x),null);
  // 4b. Copies: duplicate on top, move through the stack, export draws both, delete.
  await page.locator('#float-duplicate').click();await page.waitForFunction(()=>document.querySelectorAll('.float-person').length===2);
  const dup=await page.evaluate(()=>({n:state.floatCopies.length,active:state.floatActive,z:[...document.querySelectorAll('.float-person')].map(e=>e.style.zIndex),offset:state.floatCopies[1].x-state.floatCopies[0].x}));
  assert.deepEqual([dup.n,dup.active,dup.z],[2,1,['3','4']]);assert.ok(dup.offset>0,'duplicate is offset from its source');
  await page.locator('#float-down').click();assert.equal(await page.evaluate(()=>state.floatActive),0,'moving down swaps order and follows the copy');
  const both=await page.evaluate(async()=>{const s=clone(state),a=await wallpaperCanvas(s,800),b=await wallpaperCanvas({...s,floatCopies:[s.floatCopies[0]]},800),da=a.getContext('2d').getImageData(0,0,800,500).data,db=b.getContext('2d').getImageData(0,0,800,500).data;let diff=0;for(let i=0;i<da.length;i+=4)if(Math.abs(da[i]-db[i])>8)diff++;return diff;});
  assert.ok(both>500,'export draws the second copy: '+both);
  await page.evaluate(()=>{Object.assign(state.floatCopies[0],{x:-20,y:-20,size:10});placeFloat();});await page.locator('.float-person').nth(1).click();assert.equal(await page.evaluate(()=>state.floatActive),1,'clicking a copy makes it active');
  // Numbered selector reaches a copy hidden behind another one.
  await page.evaluate(()=>{Object.assign(state.floatCopies[0],{x:50,y:50,size:60});state.floatCopies[1]={...state.floatCopies[0]};placeFloat();});assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#float-copy-list button')].map(b=>[b.textContent,b.classList.contains('selected')])),[['1',false],['2',true]]);
  await page.locator('#float-copy-list button[data-copy="0"]').click();assert.deepEqual(await page.evaluate(()=>[state.floatActive,document.activeElement.className.includes('float-person'),document.querySelector('#float-copy-label').textContent.startsWith('第 1 / 2 份')]),[0,true,true]);
  assert(await page.locator('#float-outline').isVisible(),'selection outline shown above the copies');
  // Dragging where the selected copy is opaque moves it, even though copy 2 covers it. The point is the
  // first opaque pixel below the centre that is not under the split handle.
  const spot=await page.evaluate(()=>{const d=document.querySelector('#desktop'),b=d.getBoundingClientRect();for(let dy=0;dy<b.height/2;dy+=6){const x=b.width/2,y=b.height/2+dy;if(copyHit(state.floatCopies[0],x,y,b.width,b.height)&&document.elementFromPoint(b.left+x,b.top+y)?.classList.contains('float-person'))return {x:b.left+x,y:b.top+y};}return null;});
  assert(spot,'an opaque, reachable point on the covered copy');const prior=await page.evaluate(()=>clone(state.floatCopies));
  await page.mouse.move(spot.x,spot.y);await page.mouse.down();await page.mouse.move(spot.x-60,spot.y-40,{steps:4});await page.mouse.up();
  const dragged=await page.evaluate(()=>({active:state.floatActive,copies:clone(state.floatCopies)}));assert.equal(dragged.active,0,'selection sticks while dragging the covered copy');
  assert(dragged.copies[0].x<prior[0].x-2&&dragged.copies[1].x===prior[1].x,'only the selected copy moved');
  const spot2=await page.evaluate(()=>{Object.assign(state.floatCopies[0],{x:-20,y:-20,size:10});placeFloat();const b=document.querySelector('#desktop').getBoundingClientRect();for(let dy=0;dy<b.height/2;dy+=6){const x=b.width/2,y=b.height/2+dy;if(copyHit(state.floatCopies[1],x,y,b.width,b.height)&&document.elementFromPoint(b.left+x,b.top+y)?.classList.contains('float-person'))return {x:b.left+x,y:b.top+y};}return null;});
  assert(spot2);await page.mouse.click(spot2.x,spot2.y);assert.equal(await page.evaluate(()=>state.floatActive),1,'clicking where only the top copy is opaque selects it');
  await page.locator('#float-delete').click();await page.waitForFunction(()=>document.querySelectorAll('.float-person').length===1);assert.equal(await page.evaluate(()=>state.floatCopies.length),1);

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
  const sceneJson={general:{orthogonalprojection:{width:800,height:500},clearcolor:'0.5 0.5 0.5'},camera:{eye:'0 0 0'},objects:[{image:'models/main.json',origin:'400 250 0',size:'800 500'},{image:'models/blue.json',origin:'200 125 0',size:'512 512',scale:'0.5 0.5 1'},{name:'snow',particle:'particles/x.json'},{image:'models/util/composelayer.json',origin:'0 0 0'}]};
  const model=m=>Buffer.from(JSON.stringify({autosize:true,material:`materials/${m}.json`})),material=t=>Buffer.from(JSON.stringify({passes:[{textures:[t]}]}));
  const scene=pkg({'scene.json':Buffer.from(JSON.stringify(sceneJson).replace('"snow"','"sn\now"')),'models/main.json':model('main'),'models/blue.json':model('blue'),'materials/main.json':material('main'),'materials/blue.json':material('blue'),'materials/main.tex':tex({width:800,height:500,container:'TEXB0003',fif:13,data:png}),'materials/blue.tex':tex({width:512,height:512,container:'TEXB0002',data:raw,lz4:1,raw:rawBytes}),'materials/dxt.tex':tex({format:4,width:512,height:512,container:'TEXB0003',data:dxt5Solid(512,512)}),'materials/masks/m.tex':tex({format:9,width:512,height:512,container:'TEXB0003',data:Buffer.alloc(512*512)})});
  const root=path.join(fixture,'431960');for(const [id,project,files] of [['1001',{title:'测试场景',type:'scene',file:'scene.json',preview:'preview.png'},{'scene.pkg':scene,'preview.png':png}],['1002',{title:'测试网页',type:'web',file:'index.html',preview:'preview.png'},{'index.html':Buffer.from('<p>'),'preview.png':png}]]){
   const dir=path.join(root,id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(project));for(const [n,b] of Object.entries(files))fs.writeFileSync(path.join(dir,n),b);}
  await page.locator('[data-view=wallpaper]').click();await page.locator('#wallpaper-controls .we-trigger').click();
  await page.locator('#we-folder').setInputFiles(root);
  await page.locator('#we-summary').filter({hasText:'找到 2 个壁纸'}).waitFor();
  await page.locator('.we-item',{hasText:'测试场景'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.we-source').length===5);
  const labels=await page.locator('.we-source span').allTextContents();
  assert.match(labels[0],/合成画面 · 2 个图层 · 800×500/);assert.match(labels[1],/main · 800×500/);assert.match(labels[2],/blue · 512×512/);assert.match(labels[3],/dxt · 512×512/);assert.match(labels[4],/预览图/);
  await page.locator('.we-source').nth(2).click();await page.locator('#we-apply').click();await page.waitForFunction(()=>!document.querySelector('#we-dialog').open);
  const blue=await page.evaluate(async()=>{const i=await loadImage(state.customImage),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return [i.naturalWidth,[...x.getImageData(256,256,1,1).data]];});
  assert.equal(blue[0],512);assert.ok(Math.abs(blue[1][2]-200)<8&&blue[1][0]<20,'LZ4 RGBA layer decoded: '+blue[1]);
  await page.locator('#wallpaper-controls .we-trigger').click();await page.locator('.we-item',{hasText:'测试场景'}).click();await page.waitForFunction(()=>document.querySelectorAll('.we-source').length===5);
  await page.locator('.we-source').nth(3).click();await page.locator('#we-apply').click();await page.waitForFunction(()=>!document.querySelector('#we-dialog').open);
  const green=await page.evaluate(async()=>{const i=await loadImage(state.customImage),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(256,256,1,1).data];});
  assert.ok(green[1]>150&&green[0]<90&&green[2]<90,'DXT5 layer decoded: '+green);
  // DXT1 block, one index per row: 4-colour mode (c0>c1) and 3-colour mode with transparency.
  const block=await page.evaluate(()=>{const px=(d,i)=>[...d.slice(i*16,i*16+4)];const four=WallpaperEngine.dxt(new Uint8Array([0x00,0xf8,0x1f,0x00,0x00,0x55,0xaa,0xff]),4,4,7),three=WallpaperEngine.dxt(new Uint8Array([0x1f,0x00,0x00,0xf8,0x00,0x55,0xaa,0xff]),4,4,7);
   return {four:[0,1,2,3].map(r=>px(four,r)),three:[2,3].map(r=>px(three,r))};});
  assert.deepEqual(block.four,[[255,0,0,255],[0,0,255,255],[170,0,85,255],[85,0,170,255]]);assert.deepEqual(block.three,[[128,0,128,255],[0,0,0,0]]);
  await page.locator('#wallpaper-controls .we-trigger').click();await page.locator('.we-item',{hasText:'测试场景'}).click();await page.waitForFunction(()=>document.querySelectorAll('.we-source').length===5);
  await page.locator('#we-apply').click();await page.waitForFunction(()=>!document.querySelector('#we-dialog').open);
  const main=await page.evaluate(async()=>{const i=await loadImage(state.customImage),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return [i.naturalWidth,i.naturalHeight,[...x.getImageData(400,250,1,1).data],[...x.getImageData(150,420,1,1).data],[...x.getImageData(700,60,1,1).data]];});
  assert.deepEqual(main.slice(0,2),[800,500]);assert.ok(main[2][0]>200&&main[2][1]<90,'composite keeps the background red rect');assert.ok(main[3][2]>180&&main[3][0]<30,'composite places the blue object at its origin: '+main[3]);assert.ok(main[4][1]>120&&main[4][0]<90,'composite background outside objects: '+main[4]);
  assert.equal(await page.evaluate(()=>state.floatPerson),false,'new wallpaper clears the cutout');
  await page.locator('#wallpaper-controls .we-trigger').click();await page.locator('.we-item',{hasText:'测试网页'}).click();
  assert.deepEqual(await page.locator('.we-source span').allTextContents(),['预览图（分辨率较低）']);
  // 7. No directory chooser: picked files, a bare scene.pkg, and a drop of plain files all import.
  await page.locator('#we-files').setInputFiles(['project.json','scene.pkg','preview.png'].map(f=>path.join(root,'1001',f)));
  await page.locator('#we-summary').filter({hasText:'找到 1 个壁纸'}).waitFor();assert.match(await page.locator('.we-item').first().textContent(),/测试场景/);
  await page.locator('#we-files').setInputFiles([path.join(root,'1001','scene.pkg')]);
  await page.locator('#we-summary').filter({hasText:'找到 1 个壁纸'}).waitFor();await page.locator('.we-item',{hasText:'scene'}).click();await page.waitForFunction(()=>document.querySelectorAll('.we-source').length===4,null,{timeout:30000});
  await page.locator('#we-files').setInputFiles([path.join(root,'1001','preview.png')]);
  await page.locator('#we-summary').filter({hasText:'找到 1 个壁纸'}).waitFor();await page.locator('.we-item',{hasText:'preview'}).click();await page.waitForFunction(()=>document.querySelectorAll('.we-source').length===1);
  assert.deepEqual(await page.locator('.we-source span').allTextContents(),['图片 · 原始分辨率']);
  await page.evaluate(async files=>{const dt=new DataTransfer();for(const [name,b64] of files)dt.items.add(new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],name));
   document.querySelector('#we-dialog').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},[['project.json',fs.readFileSync(path.join(root,'1002','project.json')).toString('base64')],['index.html',Buffer.from('<p>').toString('base64')],['preview.png',png.toString('base64')]]);
  await page.locator('.we-item',{hasText:'测试网页'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: auto cutout, hole fill, keep-original, copies (duplicate / reorder / delete), drag/wheel/keyboard, export, persistence, add/remove points, Wallpaper Engine scan, scene composite, PNG + LZ4 + DXT layers, web preview, file picker / loose files / drop import; no browser errors.');
 }finally{await browser.close();fs.rmSync(fixture,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
