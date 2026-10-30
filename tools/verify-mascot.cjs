// 萌版人物 module: rig from the cut-out person (face found → stickers placed), chibi proportions follow the sliders,
// idle motion runs, emotes / say / mood / pose commands work and report events, interactions (tap, double tap,
// hold = pat, rapid taps = angry, drag = carried + position saved), music reaction from the 桌面歌词 clock, editing
// mode (pointer only in its own view, floats click-through), export paints the character, client payload, normalising.
const {chromium}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await (await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1})).newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.locator('#piece-left').evaluate(el=>new Promise(resolve=>{const check=()=>el.style.backgroundImage?resolve():requestAnimationFrame(check);check();}));
 const settled=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const mod=()=>page.evaluate(()=>{const m=Rider.modules.find(x=>x.id==='mascot');return {rig:!!m.rig,face:m.rig?.face.detected,error:m.rigError,building:m.building,w:m.rig&&Math.round(m.rig.width),h:m.rig&&Math.round(m.rig.height),head:m.rig&&Math.round(m.rig.head.h),body:m.rig&&Math.round(m.rig.body.h),state:m.mv.state()};});
 await page.goto('http://127.0.0.1:4173');await page.evaluate(()=>{localStorage.clear();});await page.reload();await ready();
 // Rig pieces in isolation: a synthetic figure (round head on a narrower body) splits at the neck without a face box.
 const rig=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=400;const x=c.getContext('2d');x.fillStyle='#c96';x.beginPath();x.arc(100,70,60,0,Math.PI*2);x.fill();x.fillRect(85,120,30,30);x.fillStyle='#36c';x.fillRect(50,150,100,230);
  const r=MascotView.buildRig(c,{headScale:2,bodyScale:.5,bodySquash:.5});return r&&{headH:Math.round(r.head.h),bodyH:Math.round(r.body.h),w:Math.round(r.width),h:Math.round(r.height),face:r.face.detected,pivot:r.head.pivot,bodyBelowHead:r.body.y>r.head.y};});
 assert.ok(rig,'rig built');assert.equal(rig.face,false);assert.ok(rig.headH>rig.bodyH,'chibi: the head is taller than the squashed body: '+JSON.stringify(rig));assert.ok(rig.bodyBelowHead);
 // Module: the portrait wallpaper's person becomes the character; BlazeFace finds the face.
 await page.evaluate(()=>{state={...clone(defaults),wallpaper:'portrait',mode:'single'};update({zones:true});});await ready();
 await page.locator('[data-view="mascot"]').click();await page.waitForSelector('#module-mascot #mc-enabled');await page.evaluate(()=>document.querySelectorAll('#module-mascot details').forEach(d=>d.open=true));
 await page.locator('#mc-enabled').check();await page.waitForFunction(()=>{const m=Rider.modules.find(x=>x.id==='mascot');return m.rig||m.rigError;},null,{timeout:120000});
 let m=await mod();assert.equal(m.error,'',m.error);assert.ok(m.rig);assert.equal(m.face,true,'face detected on the portrait');assert.ok(m.head>m.body*.8,'big head: '+JSON.stringify(m));
 assert.match(await page.locator('#mc-status').textContent(),/识别到面部/);
 const editing=await page.evaluate(()=>({cls:document.querySelector('#desktop').classList.contains('mascot-editing'),z:document.querySelector('.module-layer[data-module="mascot"]').style.zIndex,dock:getComputedStyle(document.querySelector('.desktop-dock')).pointerEvents,interactive:document.querySelector('.mascot').classList.contains('interactive'),hidden:document.querySelector('.mascot').hidden}));
 assert.deepEqual(editing,{cls:true,z:'35',dock:'none',interactive:true,hidden:false});
 // Proportions follow the sliders (the rig is rebuilt).
 const before=m;await page.locator('#mc-head').fill('2.4');await page.waitForFunction(h=>{const m=Rider.modules.find(x=>x.id==='mascot');return m.rig&&Math.round(m.rig.head.h)!==h;},before.head,{timeout:60000});m=await mod();assert.ok(m.head>before.head,'head scale grows the head');
 assert.equal(await page.evaluate(()=>state.modules.mascot.headScale),2.4);
 // Idle motion: transforms change over time.
 const tf=()=>page.evaluate(()=>document.querySelector('.m-headwrap').style.transform);const t1=await tf();await page.waitForTimeout(400);const t2=await tf();assert.notEqual(t1,t2,'the head moves on its own');
 // Commands and events.
 const events=await page.evaluate(async()=>{const seen=[];const off=Rider.api.mascot.on(e=>seen.push(e.type+(e.name?':'+e.name:'')));
  const r1=Rider.api.mascot.command({type:'emote',name:'happy'}),r2=Rider.api.mascot.command({type:'say',text:'你好呀'}),r3=Rider.api.mascot.command({type:'mood',happy:.9}),r4=Rider.api.mascot.command({type:'pose',head:{rot:30},ms:500}),bad=Rider.api.mascot.command({type:'nope'});
  await new Promise(r=>setTimeout(r,120));const root=document.querySelector('.mascot');const out={r1,r2,r3:r3.mood.happy,r4,bad,emote:root.dataset.emote,bubble:root.querySelector('.m-bubble').textContent,bubbleShown:!root.querySelector('.m-bubble').hidden,particles:root.querySelectorAll('.m-p').length,headTf:document.querySelector('.m-headwrap').style.transform,seen};off();return out;});
 assert.equal(events.r1.ok,true);assert.equal(events.r2.ok,true);assert.ok(Math.abs(events.r3-.9)<.01);assert.equal(events.bad.ok,false);assert.equal(events.emote,'happy');assert.equal(events.bubble,'你好呀');assert.equal(events.bubbleShown,true);assert.ok(events.particles>0,'sparkles');assert.match(events.headTf,/rotate\(30deg\)/,'pose overrides the head rotation');assert.deepEqual(events.seen,['emote:happy']);
 // Interactions in the preview: tap → happy, hold on the head → pat, four quick taps → angry, drag → position saved.
 const box=async sel=>{const b=await page.locator(sel).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,b};};
 const log=()=>page.evaluate(()=>Rider.modules.find(x=>x.id==='mascot').log.slice());
 await page.waitForTimeout(1000);let h=await box('.m-headwrap');await page.mouse.click(h.x,h.y);await page.waitForTimeout(150);assert.match((await log())[0],/tap/,'tap logged');assert.equal(await page.evaluate(()=>document.querySelector('.mascot').dataset.emote),'happy');
 await page.waitForTimeout(1200);h=await box('.m-headwrap');await page.mouse.move(h.x,h.y);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();await page.waitForTimeout(100);
 assert.ok((await log()).slice(0,3).some(l=>/pat/.test(l)),'hold on the head = pat: '+JSON.stringify(await log()));assert.equal(await page.evaluate(()=>document.querySelector('.mascot').dataset.emote),'love');
 await page.waitForTimeout(1700);h=await box('.m-headwrap');for(let i=0;i<4;i++){await page.mouse.click(h.x,h.y);await page.waitForTimeout(120);}await page.waitForTimeout(150);
 assert.ok((await log()).slice(0,3).some(l=>/angry/.test(l)),'four quick taps = angry: '+JSON.stringify(await log()));
 await page.waitForTimeout(1500);const pos0=await page.evaluate(()=>[state.modules.mascot.x,state.modules.mascot.y]),desk=await page.locator('#desktop').boundingBox();h=await box('.m-body');
 await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x-30,h.y-20,{steps:5});await page.mouse.move(h.x-60,h.y-40,{steps:5});
 assert.equal(await page.evaluate(()=>document.querySelector('.mascot').dataset.emote),'carried');await page.mouse.up();await settled();
 const pos1=await page.evaluate(()=>[state.modules.mascot.x,state.modules.mascot.y]);assert.ok(Math.abs(pos1[0]-pos0[0]+60/desk.width*100)<.6&&Math.abs(pos1[1]-pos0[1]+40/desk.height*100)<.6,'drag moves the character and saves the spot: '+JSON.stringify({pos0,pos1}));
 // Music reaction: the 桌面歌词 demo clock drives sway and the sung line; energy comes from how fast the words come.
 await page.evaluate(()=>{Object.assign(state.modules.lyrics,{enabled:true,mode:'manual',demo:true,lrc:'[0,1500]啦(0,150)啦(150,150)啦(300,150)啦(450,150)啦(600,150)啦(750,150)啦(900,150)啦(1050,150)啦(1200,150)啦(1350,150)\n[1500,1500]慢慢唱(1500,1500)'});update({custom:false});});await page.waitForTimeout(400);await page.evaluate(()=>{Rider.modules.find(x=>x.id==='lyrics').start=performance.now();});
 const music={playing:true,maxEnergy:0,minEnergy:1,lines:new Set(),bubbles:new Set()};for(let i=0;i<10;i++){const r=await page.evaluate(()=>{const s=Rider.api.mascot.state();return {playing:s.music.playing,energy:s.music.energy,line:s.music.line,bubble:document.querySelector('.mascot .m-bubble').textContent};});music.playing=music.playing&&r.playing;music.maxEnergy=Math.max(music.maxEnergy,r.energy);music.minEnergy=Math.min(music.minEnergy,r.energy);music.lines.add(r.line);music.bubbles.add(r.bubble);await page.waitForTimeout(250);}
 assert.equal(music.playing,true);assert.ok(music.maxEnergy>.6&&music.minEnergy<.2,'ten fast 啦 → high energy, the slow line → low: '+JSON.stringify({...music,lines:[...music.lines],bubbles:[...music.bubbles]}));assert.ok(music.lines.has('啦啦啦啦啦啦啦啦啦啦')&&music.lines.has('慢慢唱'));assert.ok(music.bubbles.has('啦啦啦啦啦啦啦啦啦啦')||music.bubbles.has('慢慢唱'),'sings the line in the bubble: '+[...music.bubbles]);
 await page.locator('#mc-music').uncheck();await page.evaluate(()=>{state.modules.lyrics.enabled=false;update({custom:false});});await page.waitForTimeout(300);
 // Leaving the view: no pointer, other floats back.
 await page.locator('[data-view="design"]').click();await settled();
 const outside=await page.evaluate(()=>({cls:document.querySelector('#desktop').classList.contains('mascot-editing'),interactive:document.querySelector('.mascot').classList.contains('interactive'),cursor:getComputedStyle(document.querySelector('.mascot')).cursor,dock:getComputedStyle(document.querySelector('.desktop-dock')).pointerEvents}));
 assert.deepEqual(outside,{cls:false,interactive:false,cursor:'auto',dock:'auto'});
 // Export paints the character where it stands; the client payload carries rig + style in px.
 const painted=await page.evaluate(async()=>{const s=clone(state);const a=await wallpaperCanvas(s,400);s.modules.mascot.enabled=false;const b=await wallpaperCanvas(s,400);const da=a.getContext('2d').getImageData(0,0,400,250).data,db=b.getContext('2d').getImageData(0,0,400,250).data;let n=0;for(let i=0;i<da.length;i+=4)if(Math.abs(da[i]-db[i])>8||Math.abs(da[i+1]-db[i+1])>8||Math.abs(da[i+2]-db[i+2])>8)n++;return n;});
 assert.ok(painted>300,'export shows the character: '+painted+' px');
 const payload=await page.evaluate(()=>Rider.modules.find(x=>x.id==='mascot').exportMascot({...clone(state),aspect:16/9},1920,1080));
 assert.ok(payload.rig.head.url.startsWith('data:image/png'));assert.ok(Math.abs(payload.style.size-1080*(await page.evaluate(()=>state.modules.mascot.size))/100)<.01);
 assert.ok(/px$/.test(payload.style.left)&&/px$/.test(payload.style.top));assert.equal(payload.style.onTop,true);assert.ok(payload.phrases.tap.length>0);
 assert.deepEqual(await page.evaluate(()=>{const m=normalizeState({...state,modules:{...state.modules,mascot:{enabled:'y',size:999,headScale:0,mouthX:5,onTop:'no'}}}).modules.mascot;return [m.enabled,m.size,m.headScale,m.mouthX,m.onTop];}),[false,80,1,.3,true]);
 await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-rider-draft')).modules.mascot.headScale),2.4);
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: 萌版人物 — rig from a synthetic figure and from the portrait (face found, stickers placed), chibi sliders rebuild the rig, idle motion, commands (emote/say/mood/pose) + events, tap / hold-pat / rapid-taps-angry / drag-saves-position, music reaction from the 桌面歌词 clock, editing mode in/out, export paints the character, client payload, normalising, persistence; no page errors.');
})().catch(e=>{console.error(e);process.exit(1)});
