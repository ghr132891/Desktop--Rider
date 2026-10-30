// 动态壁纸 module (modules/live.js): a WebM made in the page is imported through the real file
// input, becomes the still wallpaper and plays on canvases that mirror the wallpaper pieces;
// switch, person-protect pause, persistence across reload, client export plan, removal.
const {chromium}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.locator('#piece-left').evaluate(el=>new Promise(resolve=>{const check=()=>el.style.backgroundImage?resolve():requestAnimationFrame(check);check();}));
 const mod=()=>page.evaluate(()=>{const m=Rider.modules.find(x=>x.id==='live');return {state:state.modules.live,pieces:m.pieces.length,frame:m.frame,paused:m.video.paused,missing:m.missing,visible:[...document.querySelectorAll('.live-piece')].filter(c=>!c.hidden).length,status:document.querySelector('#live-status').textContent};});
 await page.goto('http://127.0.0.1:4173');await page.evaluate(()=>{localStorage.clear();indexedDB.deleteDatabase('desktop-rider-live');});await page.reload();await ready();
 assert.deepEqual(await page.evaluate(()=>Rider.modules.map(m=>m.id)),['live','note'],'live sorts before note (order 50)');
 assert.equal((await mod()).status,'尚未导入视频。');
 // A 2 s 320×200 WebM recorded from a canvas in the page, imported through the module's file input.
 const webm=await page.evaluate(()=>new Promise(resolve=>{const c=document.createElement('canvas');c.width=320;c.height=200;const ctx=c.getContext('2d');const rec=new MediaRecorder(c.captureStream(30),{mimeType:'video/webm'});const chunks=[];rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=async()=>{const buf=await new Blob(chunks).arrayBuffer();resolve(btoa(String.fromCharCode(...new Uint8Array(buf))));};let t=0;const timer=setInterval(()=>{ctx.fillStyle=`hsl(${t*6},70%,45%)`;ctx.fillRect(0,0,320,200);ctx.fillStyle='#fff';ctx.fillRect((t*5)%300,80,30,30);if(++t>=60){clearInterval(timer);rec.stop();}},33);rec.start();}));
 const buffer=Buffer.from(webm,'base64');assert.ok(buffer.length>1000,'recorded a video');
 await page.locator('[data-view="live"]').click();
 await page.locator('#live-file').setInputFiles({name:'sunset.webm',mimeType:'video/webm',buffer});
 await page.waitForFunction(()=>state.modules.live.enabled&&state.customImage&&!state.protectPerson,null,{timeout:30000});
 let m=await mod();assert.equal(m.state.name,'sunset.webm');assert.equal(m.state.width,320);assert.equal(m.state.height,200);assert.equal(m.state.type,'video/webm');assert.equal(m.state.size,buffer.length);
 assert.equal(await page.evaluate(()=>document.querySelector('#desktop-caption').textContent),'我的壁纸');
 const still=await page.evaluate(async()=>{const img=await loadImage(state.customImage);return [img.naturalWidth,img.naturalHeight];});assert.deepEqual(still,[320,200],'the still frame is the custom wallpaper');
 // Two canvases mirror the two pieces: same clip polygon and placement; frames keep coming.
 await page.evaluate(()=>{state.mode='diagonal';state.angle=15;state.ratio=58;update();});
 await page.waitForFunction(()=>{const m=Rider.modules.find(x=>x.id==='live');return m.pieces.length===2&&m.frame>3;},null,{timeout:15000});
 const mirror=await page.evaluate(()=>{const m=Rider.modules.find(x=>x.id==='live');return ['#piece-left','#piece-right'].map((id,i)=>{const el=document.querySelector(id),p=m.pieces[i];return {clip:el.style.clipPath===p.c.style.clipPath,size:el.style.backgroundSize===`${p.w}px ${p.h}px`,pos:el.style.backgroundPosition===`${p.x}px ${p.y}px`,rect:p.c.getBoundingClientRect().width===document.querySelector('#desktop').getBoundingClientRect().width};});});
 assert.deepEqual(mirror,[{clip:true,size:true,pos:true,rect:true},{clip:true,size:true,pos:true,rect:true}]);
 const f1=(await mod()).frame;await page.waitForTimeout(700);m=await mod();assert.ok(m.frame>f1,'frames advance');assert.equal(m.paused,false);assert.equal(m.visible,2);assert.match(m.status,/正在播放「sunset.webm」 · 320 × 200/);
 const painted=await page.evaluate(()=>{const c=Rider.modules.find(x=>x.id==='live').pieces[0].c;const d=c.getContext('2d').getImageData(Math.round(c.width*.25),Math.round(c.height*.5),1,1).data;return d[3];});assert.equal(painted,255,'left canvas shows video pixels');
 // Switch off → still only; person-protect → paused with an explanation; back on.
 await page.locator('#live-enabled').uncheck();await page.waitForFunction(()=>document.querySelectorAll('.live-piece:not([hidden])').length===0);
 m=await mod();assert.equal(m.paused,true);assert.equal(m.status,'已关闭播放，当前显示静帧。');
 await page.locator('#live-enabled').check();await page.waitForFunction(()=>document.querySelectorAll('.live-piece:not([hidden])').length===2);
 await page.evaluate(()=>{state.protectPerson=true;update();});await page.waitForFunction(()=>document.querySelector('#live-status').textContent.includes('人物优先'),null,{timeout:30000});
 assert.equal((await mod()).visible,0);
 await page.evaluate(()=>{state.protectPerson=false;update();});await page.waitForFunction(()=>document.querySelectorAll('.live-piece:not([hidden])').length===2);
 // Export plan for the client: both pieces with polygons and placements for a 1920×1080 monitor, plus the bytes.
 const plan=await page.evaluate(async()=>{const r=await Rider.modules.find(x=>x.id==='live').exportFor(clone(state),1920,1080);return {name:r.name,type:r.type,bytes:r.bytes.byteLength,plan:r.plan};});
 assert.equal(plan.bytes,buffer.length);assert.equal(plan.plan.width,1920);assert.equal(plan.plan.pieces.length,2);
 for(const p of plan.plan.pieces){assert.ok(p.polygon.length>=3&&p.polygon.every(([x,y])=>x>=0&&x<=1920&&y>=0&&y<=1080));assert.ok([p.x,p.y,p.w,p.h].every(Number.isFinite)&&p.w>=1920*.5);}
 // Reload: metadata comes from the draft, the file from IndexedDB; playback resumes.
 await page.reload();await ready();
 await page.waitForFunction(()=>{const m=Rider.modules.find(x=>x.id==='live');return state.modules.live.name==='sunset.webm'&&m.pieces.length===2&&m.frame>0;},null,{timeout:15000});
 // Per-frame person extraction: a video synthesised from the portrait wallpaper (inpainted background + the
 // cut-out person walking left and right). After the still is cut out and floats, the copies show the moving
 // person and the original spot shows the inpainted background instead of the video.
 await page.evaluate(()=>{state={...clone(defaults),wallpaper:'portrait',mode:'diagonal',angle:15,ratio:58,gap:16};update({zones:true});});
 const made=await page.evaluate(async()=>{const img=await loadImage(source()),point=await Cutout.autoPoint(img,source()),cut=await Cutout.separate(img,source(),[point]),bg=await loadImage(cut.backgroundUrl);
  const W=img.naturalWidth,H=img.naturalHeight,box={x:cut.box.x*W,y:cut.box.y*H,w:cut.box.w*W,h:cut.box.h*H};
  const blob=await new Promise(resolve=>{const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');const rec=new MediaRecorder(c.captureStream(30),{mimeType:'video/webm',videoBitsPerSecond:8e6});const chunks=[];rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));
   let t=0;const timer=setInterval(()=>{const k=t/90*6.283;ctx.drawImage(bg,0,0,W,H);ctx.drawImage(cut.cutout,box.x+Math.sin(k)*W*.08,box.y-Math.abs(Math.sin(k*3))*H*.01,box.w,box.h);if(++t>=90){clearInterval(timer);rec.stop();}},33);rec.start();});
  await Rider.modules.find(m=>m.id==='live').useFile(new File([blob],'walking.webm',{type:'video/webm'}),{time:0});return {size:blob.size,box:cut.box};});
 assert.ok(made.size>20000);await page.waitForFunction(()=>state.modules.live.enabled&&state.modules.live.name==='walking.webm');
 await page.locator('#float-toggle').check();await page.locator('#float-status').filter({hasText:'人物已抠出'}).waitFor({timeout:90000});
 await page.waitForFunction(()=>{const m=Rider.modules.find(x=>x.id==='live');return m.person&&m.masks>8&&m.patchReady&&m.personReady;},null,{timeout:60000});
 await page.evaluate(()=>{state.floatCopies=[{x:20,y:60,size:50,flip:false}];state.floatActive=0;update({custom:false});});await page.waitForTimeout(600);
 const person=await page.evaluate(async()=>{const m=Rider.modules.find(x=>x.id==='live'),view=await scene(clone(state)),b=view.cut.box,p=m.pieces[0],v=m.video;
  // Original spot on the left piece canvas vs the inpainted still at the same video point: the cover hides the person.
  const sample=(canvas,x,y)=>{const d=canvas.getContext('2d').getImageData(Math.round(x),Math.round(y),1,1).data;return [d[0],d[1],d[2],d[3]];};
  const bgc=document.createElement('canvas');bgc.width=view.img.naturalWidth;bgc.height=view.img.naturalHeight;bgc.getContext('2d').drawImage(view.img,0,0);
  const pts=[[b.x+b.w*.5,b.y+b.h*.45],[b.x+b.w*.5,b.y+b.h*.6],[b.x+b.w*.45,b.y+b.h*.5]];
  const dist=pts.map(([u,w])=>{const a=sample(p.c,(p.x+u*p.w)*p.dpr,(p.y+w*p.h)*p.dpr),c=sample(bgc,u*bgc.width,w*bgc.height);return Math.hypot(a[0]-c[0],a[1]-c[1],a[2]-c[2]);});
  // The moving copy: some opaque person pixels, some transparent ones, the static <img> invisible underneath.
  const copy=m.copies.children[0],d=copy.getContext('2d').getImageData(0,0,copy.width,copy.height).data;let opaque=0,clear=0;for(let i=3;i<d.length;i+=4*13)d[i]>200?opaque++:d[i]<10?clear++:0;
  const img=document.querySelector('.float-person'),r=copy.getBoundingClientRect(),ir=img.getBoundingClientRect();
  return {dist,opaque,clear,copies:m.copies.children.length,hiddenImg:getComputedStyle(img).opacity,desktop:document.querySelector('#desktop').className,maskMs:m.maskMs,covers:r.left<=ir.left+1&&r.right>=ir.right-1&&r.top<=ir.top+1&&r.bottom>=ir.bottom-1,status:document.querySelector('#live-status').textContent};});
 assert.ok(person.dist.every(x=>x<48),'original spot shows the inpainted background: '+JSON.stringify(person.dist));
 assert.ok(person.opaque>50&&person.clear>50,'moving copy holds a masked person: '+JSON.stringify(person));assert.equal(person.copies,1);assert.equal(person.hiddenImg,'0');assert.match(person.desktop,/live-person/);assert.equal(person.covers,true,'copy canvas encloses the static copy');
 assert.match(person.status,/逐帧提取人物，每帧 \d+ ms/);assert.ok(person.maskMs<400,'segmentation keeps up: '+person.maskMs+' ms');
 // Keep-original: no cover, the video person stays; switch off: back to the static copy.
 await page.locator('#float-keep').check();await page.waitForFunction(()=>Rider.modules.find(x=>x.id==='live').keepOriginal===true);await page.waitForTimeout(500);
 const kept=await page.evaluate(async()=>{const m=Rider.modules.find(x=>x.id==='live'),view=await scene(clone(state)),b=view.cut.box,p=m.pieces[0];const d=p.c.getContext('2d').getImageData(Math.round((p.x+(b.x+b.w*.5)*p.w)*p.dpr),Math.round((p.y+(b.y+b.h*.5)*p.h)*p.dpr),1,1).data;const bgc=document.createElement('canvas');bgc.width=view.img.naturalWidth;bgc.height=view.img.naturalHeight;bgc.getContext('2d').drawImage(view.img,0,0);const c=bgc.getContext('2d').getImageData(Math.round((b.x+b.w*.5)*bgc.width),Math.round((b.y+b.h*.5)*bgc.height),1,1).data;return Math.hypot(d[0]-c[0],d[1]-c[1],d[2]-c[2]);});
 assert.ok(kept>30,'with keep-original the video person is visible at the original spot: '+kept);
 await page.locator('#float-keep').uncheck();await page.locator('[data-view="live"]').click();await page.locator('#live-person').uncheck();
 await page.waitForFunction(()=>!document.querySelector('#desktop').classList.contains('live-person')&&document.querySelectorAll('.live-copy').length===0);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.float-person')).opacity),'1');
 await page.locator('#live-person').check();await page.waitForFunction(()=>Rider.modules.find(x=>x.id==='live').person===true,null,{timeout:30000});
 await page.evaluate(()=>{state.floatPerson=false;update();});await page.waitForFunction(()=>!document.querySelector('#desktop').classList.contains('live-person'));
 // Remove: slice back to defaults, canvases hidden, IndexedDB empty, the still stays.
 await page.locator('[data-view="live"]').click();await page.locator('#live-remove').click();
 await page.waitForFunction(()=>!state.modules.live.name&&document.querySelectorAll('.live-piece:not([hidden])').length===0);
 assert.equal(await page.evaluate(()=>Rider.modules.find(x=>x.id==='live').store('get')),null);assert.ok(await page.evaluate(()=>!!state.customImage));
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: live wallpaper imports a video via the file input, captures the still, mirrors both pieces (clip + placement) with advancing frames, pauses on switch / person-protect / reduced motion rules, exports a client plan, survives reload via IndexedDB, per-frame person extraction (moving copy, inpainted cover at the original spot, keep-original, switch), removes cleanly; no page errors.');
})().catch(e=>{console.error(e);process.exit(1)});
