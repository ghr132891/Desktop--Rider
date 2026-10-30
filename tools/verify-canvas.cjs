// Free-canvas controls: curved / wavy dividers, per-piece pictures with offset and zoom (panel, drag,
// wheel), person-copy look (rotate / colour / glow, outline handles) and the 图层 module (shape, image,
// transforms, blend, above/below the person, list, persistence). Runs in plain Chromium.
const {chromium}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.locator('#piece-left').evaluate(el=>new Promise(resolve=>{const check=()=>el.style.backgroundImage?resolve():requestAnimationFrame(check);check();}));
 const settled=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const sample=(s,x,y,width=400)=>page.evaluate(async({s,x,y,width})=>{const c=await wallpaperCanvas(s,width);const d=c.getContext('2d').getImageData(Math.round(x*c.width),Math.round(y*c.height),1,1).data;return [...d];},{s,x,y,width});
 await page.goto('http://127.0.0.1:4173');await page.evaluate(()=>{localStorage.clear();});await page.reload();await ready();
 const open=()=>page.evaluate(()=>document.querySelectorAll('#shape-options,#piece-options,#float-look').forEach(d=>d.open=true));await open();
 const solid=color=>page.evaluate(color=>{const c=document.createElement('canvas');c.width=64;c.height=40;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,64,40);return c.toDataURL('image/png');},color);
 const red=await solid('#ff0000'),blue=await solid('#0000ff');

 // 1. Divider shape: a bend pushes the left piece past the straight line; the wave adds points; both export like the preview.
 await page.evaluate(({red,blue})=>{state={...clone(defaults),mode:'vertical',ratio:50,gap:0,pieces:[{image:red,dx:0,dy:0,zoom:100},{image:blue,dx:0,dy:0,zoom:100}]};update();},{red,blue});await ready();await settled();
 assert.deepEqual((await sample(await page.evaluate(()=>clone(state)),.56,.5)).slice(0,3),[0,0,255],'straight: right of the line is the right piece');
 await page.locator('#bend').fill('40');await settled();
 const points=await page.evaluate(()=>document.querySelector('#piece-left').style.clipPath.split(',').length);assert.ok(points>=40,'curved clip has sampled points: '+points);
 assert.deepEqual((await sample(await page.evaluate(()=>clone(state)),.56,.5)).slice(0,3),[255,0,0],'bend +40: the bulge hands this spot to the left piece');
 assert.deepEqual((await sample(await page.evaluate(()=>clone(state)),.56,.03)).slice(0,3),[0,0,255],'…but not near the top where the arc meets the line');
 await page.locator('#wave').fill('3');await page.locator('#wave-amp').fill('12');await settled();
 assert.equal(await page.evaluate(()=>state.wave),3);assert.match(await page.locator('#wave-value').textContent(),/3 个/);
 await page.locator('#shape-reset').click();await settled();assert.deepEqual(await page.evaluate(()=>[state.bend,state.wave]),[0,0]);
 assert.equal(await page.evaluate(()=>document.querySelector('#piece-left').style.clipPath.split(',').length),4,'straight again');

 // 2. Per-piece pictures, offset and zoom: panel values, background placement, drag and wheel in the preview.
 const before=await page.evaluate(()=>({pos:document.querySelector('#piece-right').style.backgroundPosition,size:document.querySelector('#piece-right').style.backgroundSize,w:document.querySelector('#desktop').clientWidth}));
 assert.ok(await page.evaluate(()=>document.querySelector('#piece-right').style.backgroundImage.startsWith('url("data:image/png')),'right piece shows its own picture');
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.piece-card .piece-source')].map(e=>e.textContent).join('|')),'自己的图片|自己的图片');
 await page.locator('.piece-card[data-piece="1"] .piece-dx').fill('10');await settled();
 const after=await page.evaluate(()=>({pos:document.querySelector('#piece-right').style.backgroundPosition,size:document.querySelector('#piece-right').style.backgroundSize}));
 assert.ok(Math.abs(parseFloat(after.pos)-parseFloat(before.pos)-before.w*.1)<1,'dx 10% moves the picture by a tenth of the desktop');
 await page.locator('.piece-card[data-piece="1"] .piece-zoom').fill('150');await settled();
 assert.ok(Math.abs(parseFloat((await page.evaluate(()=>document.querySelector('#piece-right').style.backgroundSize)))-parseFloat(before.size)*1.5)<1,'zoom 150% scales the picture');
 const box=await page.locator('#desktop').boundingBox();
 // (20%, 30%) is bare wallpaper: the first zone starts at 48% height.
 await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.2-30,box.y+box.height*.3+20,{steps:5});await page.mouse.move(box.x+box.width*.2-60,box.y+box.height*.3+40,{steps:5});await page.mouse.up();await settled();
 // 不露白 (default): the linked left piece shows the picture's left half, so it may slide left (more picture there) but not down — that would bare the top.
 const dragged=await page.evaluate(()=>state.pieces[0]);assert.ok(Math.abs(dragged.dx+60/box.width*100)<.6&&dragged.dy===0,'dragging the covered left piece pans sideways only: '+JSON.stringify(dragged));
 assert.equal(await page.evaluate(()=>document.querySelector('#fill-left').hidden),true,'nothing bare, no fill canvas');
 await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3);await page.mouse.wheel(0,300);await settled();assert.equal(await page.evaluate(()=>state.pieces[0].zoom),100,'wheel cannot zoom a covered piece below the size that fills it');
 await page.mouse.wheel(0,-300);await settled();assert.ok((await page.evaluate(()=>state.pieces[0].zoom))>100,'wheel zooms the piece');
 // Cover off: the picture pans freely and the bare strip is filled — blur / mirror / 本机扩图 / gap colour, preview and export alike.
 const tone=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=40;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,32,40);x.fillStyle='#00ff00';x.fillRect(32,0,32,40);return c.toDataURL('image/png');});
 await page.evaluate(tone=>{Object.assign(state.pieces[0],{image:tone,dx:0,dy:0,zoom:100});update({custom:false});},tone);await settled();
 await page.locator('.piece-card[data-piece="0"] .piece-cover').uncheck();await settled();
 assert.equal(await page.evaluate(()=>document.querySelector('.piece-card[data-piece="0"] .piece-fill-mode').disabled),false,'the fill picker wakes up once cover is off');
 await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3+40,{steps:5});await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3+box.height*.3,{steps:5});await page.mouse.up();await settled();
 const free=await page.evaluate(()=>state.pieces[0]);assert.ok(Math.abs(free.dx)<.6&&Math.abs(free.dy-30)<.6,'uncovered piece pans freely: '+JSON.stringify(free));
 const fillPixel=()=>page.evaluate(()=>{const c=document.querySelector('#fill-left');if(c.hidden)return null;const d=c.getContext('2d').getImageData(Math.round(c.width*.45),Math.round(c.height*.1),1,1).data;return [...d];});
 // (.45w, .1h) lies in the bare strip above the picture (which spans the whole desktop width, red half left): the mirrored tile
 // above repeats the red half there, while the blurred backdrop — the picture cover-fitted to this half-width piece — shows its green half.
 const st=await page.evaluate(()=>clone(state));
 assert.deepEqual((await sample(st,.45,.1)).slice(0,3),[0,255,0],'blur backdrop is green at (.45,.1)');assert.deepEqual((await fillPixel()).slice(0,3),[0,255,0],'preview fill canvas matches');
 assert.deepEqual((await sample(st,.45,.5)).slice(0,3),[255,0,0],'the picture itself still shows below the strip');
 await page.locator('.piece-card[data-piece="0"] .piece-fill-mode').selectOption('mirror');await settled();
 assert.deepEqual((await sample(await page.evaluate(()=>clone(state)),.45,.1)).slice(0,3),[255,0,0],'mirror continues the red half upward');assert.deepEqual((await fillPixel()).slice(0,3),[255,0,0]);
 await page.locator('.piece-card[data-piece="0"] .piece-fill-mode').selectOption('gap');await settled();
 assert.deepEqual((await sample(await page.evaluate(()=>clone(state)),.45,.1)).slice(0,3),[233,239,244],'gap colour shows through');assert.equal(await fillPixel(),null,'no fill canvas for the gap colour');
 await page.locator('.piece-card[data-piece="0"] .piece-fill-mode').selectOption('extend');await settled();
 assert.equal(await page.locator('.piece-card[data-piece="0"] .piece-fill-status').textContent(),'正在本机扩图…');
 await page.waitForFunction(()=>[...extensions.values()].some(v=>v&&!v.then&&v.canvas),null,{timeout:90000});await settled();
 assert.equal(await page.locator('.piece-card[data-piece="0"] .piece-fill-status').textContent(),'');
 const ext=await sample(await page.evaluate(()=>clone(state)),.05,.1);assert.ok(ext[0]>200&&ext[1]<90&&ext[2]<90,'本机扩图 rebuilds the strip above the red half from red texture: '+ext);
 const extPreview=await fillPixel();assert.ok(extPreview&&extPreview[3]===255,'preview fill canvas is opaque where the picture is bare');
 assert.equal(await page.evaluate(()=>extensions.size),1,'the extension is computed once and reused by preview and export');
 await page.locator('.piece-card[data-piece="0"] .piece-cover').check();await settled();
 assert.deepEqual(await page.evaluate(()=>[state.pieces[0].dy,document.querySelector('#fill-left').hidden]),[0,true],'cover back on snaps the picture into the piece');
 await page.evaluate(red=>{Object.assign(state.pieces[0],{image:red,dx:0,dy:0,zoom:100,fill:'blur'});update({custom:false});},red);await settled();
 await page.mouse.move(box.x+box.width*.2,box.y+box.height*.3);await page.mouse.wheel(0,-300);await settled();assert.ok((await page.evaluate(()=>state.pieces[0].zoom))>100,'wheel zooms the piece');
 await page.locator('.piece-card[data-piece="0"] .piece-shared').click();await settled();assert.equal(await page.evaluate(()=>state.pieces[0].image),null);assert.ok(await page.evaluate(()=>document.querySelector('#piece-left').style.backgroundImage.includes('assets/')),'back to the shared wallpaper');
 await page.locator('.piece-card[data-piece="0"] .piece-reset').click();await settled();assert.deepEqual(await page.evaluate(()=>[state.pieces[0].dx,state.pieces[0].dy,state.pieces[0].zoom]),[0,0,100]);
 await page.waitForTimeout(400); // the draft is written 250 ms after the last change
 assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-rider-draft')).pieces[1].image.startsWith('data:image/png')),'per-piece pictures persist in the draft');

 // 3. Person copies: rotation, colour, glow and opacity in the preview and the export; outline handles.
 await page.evaluate(()=>{state={...clone(defaults),wallpaper:'portrait',mode:'vertical',ratio:50,gap:20};update({zones:true});});await ready();
 await page.locator('#float-toggle').check();await page.locator('#float-status').filter({hasText:'人物已抠出'}).waitFor({timeout:60000});await settled();await open();
 assert.equal(await page.locator('#float-outline').isVisible(),true,'the outline (with handles) shows for a single copy too');
 const plain=await page.evaluate(async()=>{const c=await wallpaperCanvas(clone(state),400);return [...c.getContext('2d').getImageData(0,0,400,250).data];});
 await page.locator('#float-rotate').fill('45');await page.locator('#float-hue').fill('90');await page.locator('#float-glow').fill('10');await page.locator('#float-opacity').fill('60');await settled();
 const look=await page.evaluate(()=>{const el=document.querySelector('.float-person'),c=state.floatCopies[0];return {transform:el.style.transform,filter:el.style.filter,opacity:el.style.opacity,outline:document.querySelector('#float-outline').style.transform,c:[c.rotate,c.hue,c.glow,c.opacity]};});
 assert.deepEqual(look.c,[45,90,10,60]);assert.match(look.transform,/rotate\(45deg\)/);assert.match(look.filter,/hue-rotate\(90deg\)/);assert.match(look.filter,/drop-shadow\(/);assert.equal(look.opacity,'0.6');assert.match(look.outline,/rotate\(45deg\)/);
 const styled=await page.evaluate(async()=>{const c=await wallpaperCanvas(clone(state),400);return [...c.getContext('2d').getImageData(0,0,400,250).data];});
 let diff=0;for(let i=0;i<plain.length;i+=4)if(Math.abs(plain[i]-styled[i])>8||Math.abs(plain[i+1]-styled[i+1])>8||Math.abs(plain[i+2]-styled[i+2])>8)diff++;assert.ok(diff>2000,'export reflects rotation / hue / glow / opacity: '+diff+' px changed');
 // Keep the knob clear of the top bar (z 20): a smaller copy lower on the desktop.
 await page.evaluate(()=>{Object.assign(state.floatCopies[0],{x:50,y:62,size:40,rotate:0});update({custom:false});});await settled();
 const knob=await page.locator('#float-outline .fo-rotate').boundingBox(),ob=await page.locator('#float-outline').boundingBox();
 await page.mouse.move(knob.x+knob.width/2,knob.y+knob.height/2);await page.mouse.down();await page.mouse.move(ob.x+ob.width+40,ob.y+ob.height/2,{steps:8});await page.mouse.up();await settled();
 const rot=await page.evaluate(()=>state.floatCopies[0].rotate);assert.ok(rot>45&&rot<135,'rotate knob turned the copy towards the right: '+rot);
 const size0=await page.evaluate(()=>state.floatCopies[0].size),corner=await page.locator('#float-outline .fo-handle[data-h="se"]').boundingBox();
 await page.mouse.move(corner.x+corner.width/2,corner.y+corner.height/2);await page.mouse.down();await page.mouse.move(corner.x+corner.width/2+40,corner.y+corner.height/2+40,{steps:6});await page.mouse.up();await settled();
 assert.ok((await page.evaluate(()=>state.floatCopies[0].size))>size0,'corner handle scales the copy');
 await page.locator('#float-duplicate').click();await settled();assert.equal(await page.evaluate(()=>state.floatCopies[1].hue),90,'duplicate keeps the look');
 await page.locator('#float-look-reset').click();await settled();assert.deepEqual(await page.evaluate(()=>{const c=state.floatCopies[1];return [c.rotate,c.hue,c.glow,c.opacity];}),[0,0,0,100]);

 // 4. 图层 module: shape, image, direct manipulation, blend, above/below, list, export, persistence.
 await page.evaluate(()=>{state={...clone(defaults),mode:'single',gapColor:'#ffffff'};update({zones:true});});await ready();
 assert.deepEqual(await page.evaluate(()=>Rider.modules.map(m=>m.id)),['live','layers','note','layers-top']);
 await page.locator('[data-view="layers"]').click();await page.locator('#layers-add-shape').click();await settled();
 let item=await page.evaluate(()=>state.modules.layers.items[0]);assert.equal(item.type,'shape');assert.equal(await page.evaluate(()=>state.modules.layers.active),item.id);
 await page.locator('#layers-fill').fill('#ff0000');await settled();
 assert.equal(await page.evaluate(()=>document.querySelector('.layer-item').parentElement.dataset.module),'layers','below the person by default');
 assert.deepEqual((await sample(await page.evaluate(()=>clone(state)),.5,.5)).slice(0,3),[255,0,0],'the shape exports at its position');
 const el=await page.locator('.layer-item').boundingBox();
 await page.mouse.move(el.x+el.width/2,el.y+el.height/2);await page.mouse.down();await page.mouse.move(el.x+el.width/2-40,el.y+el.height/2-30,{steps:6});await page.mouse.up();await settled();
 item=await page.evaluate(()=>state.modules.layers.items[0]);assert.ok(item.x<50&&item.y<50,'dragging moves the layer: '+item.x+','+item.y);
 await page.mouse.move(el.x+el.width/2-40,el.y+el.height/2-30);await page.mouse.wheel(0,-240);await settled();assert.ok((await page.evaluate(()=>state.modules.layers.items[0].w))>30,'wheel scales the layer');
 const w0=await page.evaluate(()=>state.modules.layers.items[0].w),h0=await page.evaluate(()=>state.modules.layers.items[0].h),east=await page.locator('.layer-box .lb-handle[data-h="e"]').boundingBox();
 await page.mouse.move(east.x+east.width/2,east.y+east.height/2);await page.mouse.down();await page.mouse.move(east.x+east.width/2+50,east.y+east.height/2,{steps:6});await page.mouse.up();await settled();
 const resized=await page.evaluate(()=>state.modules.layers.items[0]);assert.ok(resized.w>w0&&Math.abs(resized.h-h0)<.2,'east handle widens only: '+resized.w+'x'+resized.h);
 const rk=await page.locator('.layer-box .lb-rotate').boundingBox(),lb=await page.locator('.layer-box').boundingBox();
 await page.mouse.move(rk.x+rk.width/2,rk.y+rk.height/2);await page.mouse.down();await page.mouse.move(lb.x+lb.width+30,lb.y+lb.height/2,{steps:8});await page.mouse.up();await settled();
 assert.ok(Math.abs(await page.evaluate(()=>state.modules.layers.items[0].rotate))>30,'rotate knob rotates the layer');
 await page.locator('#layers-blend').selectOption('multiply');await page.locator('#layers-above').check();await settled();
 assert.equal(await page.evaluate(()=>document.querySelector('.layer-item').parentElement.dataset.module),'layers-top','moved above the person');
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.layer-item')).mixBlendMode),'multiply');
 const png=Buffer.from(blue.split(',')[1],'base64');await page.locator('#layers-image').setInputFiles({name:'sky.png',mimeType:'image/png',buffer:png});await settled();
 assert.equal(await page.evaluate(()=>state.modules.layers.items.length),2);assert.equal(await page.evaluate(()=>state.modules.layers.items[1].type),'image');assert.ok(await page.evaluate(()=>document.querySelectorAll('.layer-item img').length===1));
 assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.layer-row .layer-row-name')].map(e=>e.textContent).join('|')),'sky|形状','list shows the topmost first');
 await page.locator('#layers-down').click();await settled();assert.equal(await page.evaluate(()=>state.modules.layers.items[0].type),'image','moved down the stack');
 await page.locator('#layers-hidden').check();await settled();assert.equal(await page.evaluate(()=>document.querySelector('.layer-item[data-id="'+state.modules.layers.active+'"]').hidden),true);
 await page.waitForTimeout(400);await page.reload();await ready();await settled();
 assert.equal(await page.evaluate(()=>state.modules.layers.items.length),2,'layers persist in the draft');assert.equal(await page.evaluate(()=>document.querySelectorAll('.layer-item').length),2);
 await page.locator('[data-view="layers"]').click();await page.locator('.layer-row').first().click();await page.locator('#layers-delete').click();await page.locator('.layer-row').first().click();await page.locator('#layers-delete').click();await settled();
 assert.equal(await page.evaluate(()=>state.modules.layers.items.length),0);assert.equal(await page.evaluate(()=>document.querySelectorAll('.layer-item').length),0);
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: curved / wavy dividers export like the preview, per-piece pictures with offset + zoom (panel, drag, wheel, persistence), 不露白 clamp and bare-strip fills (blur / mirror / 本机扩图 / gap) in preview and export, person-copy rotation / hue / glow / opacity with outline handles and duplicate, 图层 module (shape + image, drag, wheel, edge + rotate handles, blend, above/below, list order, hide, persistence, delete); no page errors.');
})().catch(e=>{console.error(e);process.exit(1)});
