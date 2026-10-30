// Module framework (core.js): the sample 桌面文字 module end to end, late registration,
// draw order, a broken module staying isolated, state sanitising and persistence.
const {chromium}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.locator('#piece-left').evaluate(el=>new Promise(resolve=>{const check=()=>el.style.backgroundImage?resolve():requestAnimationFrame(check);check();}));
 await page.goto('http://127.0.0.1:4173');await ready();
 // Registration, nav entry, own view with the preview still visible.
 assert.deepEqual(await page.evaluate(()=>Rider.modules.map(m=>m.id)),['live','note']);
 assert.equal(await page.locator('nav [data-view="note"]').count(),1);
 await page.locator('[data-view="note"]').click();
 assert(await page.locator('#module-note').isVisible());assert(await page.locator('#design-controls').isHidden());assert(await page.locator('#editor-view').isVisible());assert(await page.locator('#presets-section').isHidden());
 assert.equal(await page.locator('#inspector-title').textContent(),'文字设置');
 // Text shows on the desktop layer and in the export.
 const blank=await page.evaluate(async()=>(await wallpaperCanvas(state)).toDataURL());
 await page.locator('#note-text').fill('桌面歌词示例');
 await page.waitForFunction(()=>document.querySelector('.note-text').textContent==='桌面歌词示例'&&!document.querySelector('.note-text').hidden);
 assert.equal(await page.evaluate(()=>state.modules.note.text),'桌面歌词示例');
 const withText=await page.evaluate(async()=>(await wallpaperCanvas(state)).toDataURL());assert.notEqual(withText,blank,'export changed by module draw');
 const diff=await page.evaluate(async()=>{const a=await wallpaperCanvas(state),b=await wallpaperCanvas({...state,modules:{...state.modules,note:{...state.modules.note,text:''}}});const A=a.getContext('2d').getImageData(0,0,a.width,a.height).data,B=b.getContext('2d').getImageData(0,0,b.width,b.height).data;let n=0;for(let i=0;i<A.length;i+=4)if(Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])>30)n++;return n;});
 assert(diff>300&&diff<200000,'text pixels in export: '+diff);
 // Drag and keyboard move the text; sliders and colour sync.
 const before=await page.evaluate(()=>({...state.modules.note}));const box=await page.locator('.note-text').boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-120,box.y+box.height/2-60,{steps:5});await page.mouse.up();
 const after=await page.evaluate(()=>({...state.modules.note}));assert(after.x<before.x-5&&after.y<before.y-3,'dragged');
 await page.locator('.note-text').focus();await page.keyboard.press('Shift+ArrowRight');assert.equal(await page.evaluate(()=>state.modules.note.x),Math.round((after.x+5)*10)/10);
 await page.locator('#note-size').evaluate(el=>{el.value='8';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.locator('#note-size-value').textContent(),'8%');
 await page.waitForFunction(()=>{const el=document.querySelector('.note-text');return Math.round(parseFloat(el.style.fontSize)/el.closest('#desktop').clientHeight*100)===8;});
 // Persists in the draft and in a saved scheme; reset restores module defaults.
 await page.reload();await ready();assert.equal(await page.evaluate(()=>state.modules.note.text),'桌面歌词示例');
 await page.locator('#save').click();await page.locator('#scheme-name').fill('模块方案');await page.locator('#save-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#save-dialog').open);
 await page.locator('#reset').click();assert.equal(await page.evaluate(()=>state.modules.note.text),'');await page.waitForFunction(()=>document.querySelector('.note-text').hidden);
 await page.locator('[data-view="saved"]').click();await page.getByRole('button',{name:'载入方案',exact:true}).click();assert.equal(await page.evaluate(()=>state.modules.note.text),'桌面歌词示例');assert.equal(await page.evaluate(()=>state.modules.note.size),8);
 // Sanitising: wrong types fall back, ranges clamp, unknown slices survive.
 assert.deepEqual(await page.evaluate(()=>normalizeState({...state,modules:{note:{text:123,x:999,y:-4,size:'a',color:'red'},future:{keep:1}}}).modules),{live:{enabled:false,person:true,name:'',type:'',size:0,width:0,height:0,duration:0,time:0},note:{text:'',x:100,y:0,size:4,color:'#ffffff',shadow:true},future:{keep:1}});
 // Late registration: mounted at once, below the person (order < 100), drawn under later modules.
 await page.evaluate(()=>{Rider.register({id:'probe',order:50,defaults:{on:true},mount({layer}){layer.dataset.mounted='1';},render({layer,s}){layer.dataset.ran=String(s.modules.probe.on);},draw({ctx,w,h}){ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,w,h*.1);}});});
 assert.deepEqual(await page.evaluate(()=>Rider.modules.map(m=>m.id)),['live','probe','note']);
 await page.waitForFunction(()=>document.querySelector('[data-module="probe"]')?.dataset.ran==='true');
 assert.equal(await page.locator('[data-module="probe"]').evaluate(el=>[el.dataset.mounted,el.style.zIndex].join()),'1,2');
 assert.equal(await page.locator('[data-module="note"]').evaluate(el=>el.style.zIndex),'18','modules above the person clear all twelve copies');
 assert.deepEqual(await page.evaluate(async()=>{const c=await wallpaperCanvas(state);return [...c.getContext('2d').getImageData(5,5,1,1).data];}),[255,0,255,255]);
 assert.equal(await page.evaluate(()=>state.modules.probe.on),true);
 // A module that throws in every hook does not break rendering, export or the page.
 await page.evaluate(()=>{Rider.register({id:'broken',normalize(){throw new Error('n');},mount(){throw new Error('m');},render(){throw new Error('r');},sync(){throw new Error('s');},draw(){throw new Error('d');}});});
 await page.locator('[data-view="design"]').click();await page.locator('[data-mode="vertical"]').click();assert.equal(await page.locator('#desktop-caption').textContent(),'山间来信');
 assert.equal(await page.evaluate(async()=>(await wallpaperCanvas(state)).width),1600);
 assert.equal(await page.evaluate(()=>JSON.stringify(normalizeState(state).modules.broken)),'{}');
 // Events and the api surface.
 assert.deepEqual(await page.evaluate(()=>{const seen=[];Rider.on('view',v=>seen.push('view:'+v));Rider.on('state',()=>seen.push('state'));setView('note');state.modules.note.text='x';update({custom:false});return seen;}),['view:note','state']);
 assert.deepEqual(await page.evaluate(()=>['state','view','update','toast','wallpaperCanvas','setView','createItem','desktop'].map(k=>typeof Rider.api[k])),['object','string','function','function','function','function','function','function']);
 assert.equal(await page.evaluate(()=>Rider.api.view),'note');
 // Module-private storage.
 assert.deepEqual(await page.evaluate(()=>{const s=Rider.storage('probe');s.set({a:1});const v=s.get();s.remove();return [v,s.get('none'),localStorage.getItem('desktop-rider:probe')];}),[{a:1},'none',null]);
 // Mobile: the extra nav entry does not overflow.
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
 // Clean up the stored scheme so other checks start empty.
 await page.evaluate(()=>{localStorage.removeItem('desktop-rider-schemes');localStorage.removeItem('desktop-rider-draft');});
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: module registry, sample 桌面文字 module (view, controls, drag, keyboard, export, persistence), sanitising, late registration and draw order, broken-module isolation, events, api, storage; no browser errors.');
})().catch(e=>{console.error(e);process.exit(1)});
