// Undo / redo and scheme files: a slider change is one step, a whole drag is one step, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
// and the toolbar buttons, text fields keep the browser's own undo, loading a scheme is undoable, the stack is capped;
// export (all / current / one card) downloads the JSON format, import accepts it (and bare states), skips junk, makes
// thumbnails, warns about videos. Plain Chromium.
const {chromium}=require('./playwright.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:require('./playwright.cjs').channel});
 const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1,acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.locator('#piece-left').evaluate(el=>new Promise(resolve=>{const check=()=>el.style.backgroundImage?resolve():requestAnimationFrame(check);check();}));
 const settled=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const commit=()=>page.waitForTimeout(500); // history settles 400 ms after the last change
 await page.goto('http://127.0.0.1:4173');await page.evaluate(()=>{localStorage.clear();});await page.reload();await ready();
 const hist=()=>page.evaluate(()=>({past:history.past.length,future:history.future.length,undo:document.querySelector('#undo').disabled,redo:document.querySelector('#redo').disabled}));
 assert.deepEqual(await hist(),{past:0,future:0,undo:true,redo:true},'fresh page: nothing to undo');
 // 1. A slider change is one step; undo restores the value, redo re-applies; buttons follow.
 const ratio0=await page.evaluate(()=>state.ratio);await page.locator('#ratio').fill(String(ratio0+10));await commit();
 assert.deepEqual(await hist(),{past:1,future:0,undo:false,redo:true});
 await page.locator('#undo').click();await settled();assert.equal(await page.evaluate(()=>state.ratio),ratio0,'undo restores the ratio');assert.equal(await page.locator('#ratio').inputValue(),String(ratio0),'the slider follows');
 assert.deepEqual(await hist(),{past:0,future:1,undo:true,redo:false});
 await page.locator('#redo').click();await settled();assert.equal(await page.evaluate(()=>state.ratio),ratio0+10,'redo re-applies');
 // 2. A drag with many pointer moves is a single step.
 const box=await page.locator('#desktop').boundingBox();const handle=await page.locator('#split-handle').boundingBox();
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();for(let i=1;i<=8;i++)await page.mouse.move(handle.x+handle.width/2-i*12,handle.y+handle.height/2,{steps:2});await page.mouse.up();await commit();
 const dragged=await page.evaluate(()=>state.ratio);assert.ok(dragged<ratio0+10,'the divider moved left: '+dragged);assert.equal((await hist()).past,2,'the whole drag is one history step');
 await page.keyboard.press('Control+z');await settled();assert.equal(await page.evaluate(()=>state.ratio),ratio0+10,'Ctrl+Z undoes the drag in one go');
 await page.keyboard.press('Control+Shift+z');await settled();assert.equal(await page.evaluate(()=>state.ratio),dragged,'Ctrl+Shift+Z redoes');
 await page.keyboard.press('Control+z');await settled();await page.keyboard.press('Control+y');await settled();assert.equal(await page.evaluate(()=>state.ratio),dragged,'Ctrl+Y redoes too');
 // 3. Module changes and new changes after an undo drop the redo branch.
 await page.locator('[data-view="note"]').click();await page.locator('#note-text').fill('你好');await commit();assert.equal(await page.evaluate(()=>state.modules.note.text),'你好');
 await page.locator('#note-text').blur();await page.keyboard.press('Control+z');await settled();assert.equal(await page.evaluate(()=>state.modules.note.text),'','module state undoes');assert.equal((await hist()).future,1);
 await page.locator('[data-view="design"]').click();await page.locator('#gap').fill('30');await commit();assert.equal((await hist()).future,0,'a new change clears redo');
 // Typing in a text field: Ctrl+Z stays with the browser (the app state is untouched).
 await page.locator('[data-view="note"]').click();await page.locator('#note-text').fill('abc');await commit();const before=await hist();await page.locator('#note-text').focus();await page.keyboard.press('Control+z');await settled();
 assert.equal((await hist()).past,before.past,'Ctrl+Z inside a text field does not touch the app history');
 // 4. Loading a saved scheme is undoable.
 await page.locator('[data-view="design"]').click();await page.evaluate(()=>{state={...clone(defaults),wallpaper:'forest',mode:'vertical',ratio:40,gap:12};update({zones:true});});await commit();
 await page.evaluate(()=>{saved=[{id:'s1',name:'森林',createdAt:new Date().toISOString(),state:clone(state),thumbnail:null}];localStorage.setItem('desktop-rider-schemes',JSON.stringify(saved));});
 await page.evaluate(()=>{state={...clone(defaults),wallpaper:'dusk',mode:'single'};update({zones:true});});await commit();
 await page.locator('[data-view="saved"]').click();await page.locator('.saved-card .button').first().click();await commit();assert.equal(await page.evaluate(()=>state.wallpaper),'forest');
 await page.keyboard.press('Control+z');await settled();assert.equal(await page.evaluate(()=>state.wallpaper),'dusk','loading a scheme is one undoable step');
 // 5. Cap: more than MAX steps keep only the newest MAX.
 await page.evaluate(async()=>{for(let i=0;i<70;i++){state.gap=i%40;update();commitHistory();}});assert.equal((await hist()).past,60,'history is capped at 60 steps');
 // 6. Export all / current / one card download the JSON format.
 const dl=async(action)=>{const [d]=await Promise.all([page.waitForEvent('download'),action()]);const p=await d.path();return {name:d.suggestedFilename(),data:JSON.parse(fs.readFileSync(p,'utf8'))};};
 await page.locator('[data-view="saved"]').click();
 const all=await dl(()=>page.locator('#export-schemes').click());assert.equal(all.data.app,'desktop-rider');assert.equal(all.data.version,1);assert.equal(all.data.schemes.length,1);assert.equal(all.data.schemes[0].name,'森林');assert.match(all.name,/^Desktop-Rider-方案-\d{4}-\d{2}-\d{2}\.json$/);
 const cur=await dl(()=>page.locator('#export-current').click());assert.equal(cur.data.schemes[0].name,'当前设计');assert.equal(cur.data.schemes[0].state.wallpaper,'dusk');
 const one=await dl(()=>page.locator('.saved-card .text-button').first().click());assert.equal(one.data.schemes.length,1);assert.equal(one.name,'Desktop-Rider-森林.json');
 // 7. Import: the export format plus junk entries and a bare state; fresh ids, thumbnails rendered, video warning.
 const file=path.join(os.tmpdir(),'dr-import-'+Date.now()+'.json');
 fs.writeFileSync(file,JSON.stringify({app:'desktop-rider',version:1,schemes:[{id:'s1',name:'带视频',createdAt:'2026-01-02T03:04:05.000Z',state:{...all.data.schemes[0].state,modules:{...all.data.schemes[0].state.modules,live:{...all.data.schemes[0].state.modules.live,enabled:true}}}},{name:'坏的',state:{mode:'nope'}},{...cur.data.schemes[0].state,wallpaper:'sand'},42]}));
 const [toastText]=await Promise.all([page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已导入'),null,{timeout:60000}).then(()=>page.locator('#toast').textContent()),page.locator('#schemes-file').setInputFiles(file)]);
 assert.match(toastText,/已导入 2 个方案，跳过 2 个无效项；含视频的方案需要重新导入视频文件/,toastText);
 const imported=await page.evaluate(()=>saved.map(s=>({name:s.name,thumb:typeof s.thumbnail==='string'&&s.thumbnail.startsWith('data:image/jpeg'),created:s.createdAt,wall:s.state.wallpaper,id:s.id})));
 assert.equal(imported.length,3);assert.equal(imported[0].name,'带视频');assert.equal(imported[0].created,'2026-01-02T03:04:05.000Z');assert.equal(imported[1].name,'导入的方案');assert.equal(imported[1].wall,'sand');assert.ok(imported[0].thumb&&imported[1].thumb,'thumbnails rendered for imported schemes');assert.notEqual(imported[0].id,'s1','fresh id');
 assert.equal(await page.locator('.saved-card').count(),3);
 await page.evaluate(()=>Rider.api.importSchemes('{').catch(e=>e.message)).then(m=>assert.equal(m,'不是有效的 JSON 文件'));
 await page.evaluate(()=>Rider.api.importSchemes('[1,2]').catch(e=>e.message)).then(m=>assert.equal(m,'文件里没有可用的方案'));
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: undo/redo (slider step, one step per drag, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, buttons, module state, redo cleared by new changes, text fields untouched, scheme load undoable, 60-step cap) and scheme files (export all / current / card, import with junk skipped, fresh ids, thumbnails, video warning, error messages); no page errors.');
})().catch(e=>{console.error(e);process.exit(1)});
