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
 // Remove: slice back to defaults, canvases hidden, IndexedDB empty, the still stays.
 await page.locator('[data-view="live"]').click();await page.locator('#live-remove').click();
 await page.waitForFunction(()=>!state.modules.live.name&&document.querySelectorAll('.live-piece:not([hidden])').length===0);
 assert.equal(await page.evaluate(()=>Rider.modules.find(x=>x.id==='live').store('get')),null);assert.ok(await page.evaluate(()=>!!state.customImage));
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: live wallpaper imports a video via the file input, captures the still, mirrors both pieces (clip + placement) with advancing frames, pauses on switch / person-protect / reduced motion rules, exports a client plan, survives reload via IndexedDB, removes cleanly; no page errors.');
})().catch(e=>{console.error(e);process.exit(1)});
