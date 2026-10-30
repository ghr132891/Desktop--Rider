// 桌面歌词 module: demo clock cycles the lines with the chosen transition, every DIY control reaches the preview
// (font, size, colour, stroke, align, position by drag), the export paints the current line with the same look,
// the client payload carries style in px + source, LRC parsing / merging, normalising, persistence. Plain Chromium.
const {chromium}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await (await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1})).newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.locator('#piece-left').evaluate(el=>new Promise(resolve=>{const check=()=>el.style.backgroundImage?resolve():requestAnimationFrame(check);check();}));
 const settled=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await page.goto('http://127.0.0.1:4173');await page.evaluate(()=>{localStorage.clear();});await page.reload();await ready();
 // LRC parsing: several stamps per line, hundredths and thousandths, metadata skipped, translation merge.
 const parsed=await page.evaluate(()=>{const l=LyricsLRC.parse('[ti:x]\n[00:01.50][00:03.25]同一句\n[00:02.000]第二句\n[00:10:12]冒号毫秒');const t=LyricsLRC.merge(l,LyricsLRC.parse('[00:02.00]second'));return {times:l.map(x=>x.t),texts:l.map(x=>x.text),trans:t.map(x=>x.trans||null),idx:[LyricsLRC.index(l,0),LyricsLRC.index(l,2.5),LyricsLRC.index(l,99)]};});
 assert.deepEqual(parsed.times,[1.5,2,3.25,10.12]);assert.deepEqual(parsed.texts,['同一句','第二句','同一句','冒号毫秒']);assert.deepEqual(parsed.trans,[null,'second',null,null]);assert.deepEqual(parsed.idx,[-1,1,3]);
 // Off by default: nothing on the desktop, nav entry exists.
 assert.equal(await page.evaluate(()=>document.querySelector('.lyrics-box').hidden),true);
 await page.locator('[data-view="lyrics"]').click();await page.waitForSelector('#module-lyrics #lyr-enabled');await page.evaluate(()=>document.querySelectorAll('#module-lyrics details').forEach(d=>d.open=true));
 // Manual LRC, demo clock on: the current line cycles through all three within a few seconds.
 await page.evaluate(()=>{Object.assign(state.modules.lyrics,{enabled:true,mode:'manual',lrc:'[00:00.00]第一句\n[00:00.80]第二句\n[00:01.60]第三句',size:6,color:'#ff0000',transition:'slide',duration:.2,shadow:false});update({custom:false});});await settled();
 const seen=new Set(),pairs=new Set();for(let i=0;i<16;i++){const [cur,next]=await page.evaluate(()=>[document.querySelector('.lyrics-line.in')?.textContent,document.querySelector('.lyrics-next').textContent]);seen.add(cur);pairs.add(cur+'>'+next);await page.waitForTimeout(250);}
 assert.ok(['第一句','第二句','第三句'].every(t=>seen.has(t)),'demo clock cycles through the lines: '+[...seen].join('|'));assert.ok(pairs.has('第一句>第二句'),'the next line is previewed under the current one: '+[...pairs].join('|'));
 assert.equal(await page.locator('#lyr-status').textContent(),'已读取 3 行歌词');
 const style=await page.evaluate(()=>{const b=document.querySelector('.lyrics-box'),cs=getComputedStyle(b);return {hidden:b.hidden,color:cs.color,fontSize:parseFloat(cs.fontSize),h:document.querySelector('#desktop').clientHeight,transition:b.dataset.transition,weight:cs.fontWeight,dur:b.style.getPropertyValue('--lyr-dur')};});
 assert.equal(style.hidden,false);assert.equal(style.color,'rgb(255, 0, 0)');assert.ok(Math.abs(style.fontSize-style.h*.06)<1,'size = 6% of the desktop height');assert.equal(style.transition,'slide');assert.equal(style.weight,'600');assert.equal(style.dur,'0.2s');
 // Panel controls reach the state and the preview.
 await page.locator('#lyr-font').selectOption('kai');await page.locator('#lyr-weight').selectOption('800');await page.locator('#lyr-stroke').check();await page.locator('#lyr-align').selectOption('left');await page.locator('#lyr-transition').selectOption('blur');await page.locator('#lyr-duration').fill('1');await page.locator('#lyr-next').uncheck();await settled();
 const after=await page.evaluate(()=>{const m=state.modules.lyrics,b=document.querySelector('.lyrics-box'),cs=getComputedStyle(b);return {m:[m.font,m.weight,m.stroke,m.align,m.transition,m.duration,m.next],family:cs.fontFamily,align:cs.textAlign,stroke:b.classList.contains('stroke'),transition:b.dataset.transition,nextHidden:b.querySelector('.lyrics-next').hidden,strokeHidden:document.querySelector('.lyr-stroke-only').hidden};});
 assert.deepEqual(after.m,['kai',800,true,'left','blur',1,false]);assert.match(after.family,/KaiTi/);assert.equal(after.align,'left');assert.equal(after.stroke,true);assert.equal(after.transition,'blur');assert.equal(after.nextHidden,true);assert.equal(after.strokeHidden,false);
 await page.locator('#lyr-font').selectOption('custom');await page.locator('#lyr-font-custom').fill('霞鹜文楷');await settled();
 assert.match(await page.evaluate(()=>getComputedStyle(document.querySelector('.lyrics-box')).fontFamily),/霞鹜文楷/);
 // Drag the box in the preview.
 const desk=await page.locator('#desktop').boundingBox(),before=await page.evaluate(()=>[state.modules.lyrics.x,state.modules.lyrics.y]);
 const bb=await page.locator('.lyrics-box').boundingBox();const cx=bb.x+bb.width/2,cy=bb.y+bb.height/2;
 await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+40,cy-30,{steps:6});await page.mouse.up();await settled();
 const moved=await page.evaluate(()=>[state.modules.lyrics.x,state.modules.lyrics.y]);
 assert.ok(Math.abs(moved[0]-before[0]-40/desk.width*100)<.6&&Math.abs(moved[1]-before[1]+30/desk.height*100)<.6,'drag moves the box: '+JSON.stringify({before,moved}));
 await page.locator('.lyrics-box').focus();await page.keyboard.press('ArrowRight');await settled();assert.ok(Math.abs((await page.evaluate(()=>state.modules.lyrics.x))-moved[0]-1)<.01,'arrow key nudges by 1%');
 // Export paints the current line in the chosen colour; without the module the same pixels are wallpaper.
 await page.evaluate(()=>{Object.assign(state.modules.lyrics,{font:'system',stroke:false,demo:false,align:'center',x:50,y:50});update({custom:false});});await settled();
 const diff=await page.evaluate(async()=>{const s=clone(state);const a=await wallpaperCanvas(s,400);s.modules.lyrics.enabled=false;const b=await wallpaperCanvas(s,400);const da=a.getContext('2d').getImageData(0,0,400,250).data,db=b.getContext('2d').getImageData(0,0,400,250).data;let n=0,red=0;for(let i=0;i<da.length;i+=4){if(Math.abs(da[i]-db[i])>8||Math.abs(da[i+1]-db[i+1])>8||Math.abs(da[i+2]-db[i+2])>8)n++;if(da[i]>200&&da[i+1]<90&&da[i+2]<90)red++;}return {n,red};});
 assert.ok(diff.n>150&&diff.red>60,'export shows the red lyric line: '+JSON.stringify(diff));
 assert.equal(await page.evaluate(()=>document.querySelector('.lyrics-line.in')?.textContent),'第一句','demo off shows the first line');
 // Client payload: style in px for a 1920×1080 monitor plus the source.
 const payload=await page.evaluate(()=>Rider.modules.find(m=>m.id==='lyrics').exportLyrics({...clone(state),aspect:16/9},1920,1080));
 assert.ok(Math.abs(payload.style.size-1080*.06)<.01&&Math.abs(payload.style.x-960)<.01&&Math.abs(payload.style.width-1920*.8)<.01);assert.equal(payload.style.color,'#ff0000');assert.equal(payload.style.transition,'blur');assert.equal(payload.source.mode,'manual');assert.ok(payload.source.lrc.includes('第二句'));assert.equal(payload.source.offset,0);
 assert.equal(await page.evaluate(()=>Rider.modules.find(m=>m.id==='lyrics').exportLyrics({...clone(state),modules:{...state.modules,lyrics:{...state.modules.lyrics,enabled:false}}},1920,1080)),null,'off → null');
 // Auto mode in the browser: hint, demo lyrics stand in; disabled hides the box.
 await page.locator('#lyr-mode').selectOption('auto');await settled();assert.match(await page.locator('#lyr-status').textContent(),/Windows 客户端/);assert.equal(await page.evaluate(()=>document.querySelector('.lyr-manual-only').hidden),true);
 assert.equal(await page.evaluate(()=>document.querySelector('.lyrics-line.in')?.textContent),'桌面上的一行字','demo lyrics stand in for the player');
 await page.locator('#lyr-enabled').uncheck();await settled();assert.equal(await page.evaluate(()=>document.querySelector('.lyrics-box').hidden),true);
 // Normalising garbage and persistence.
 assert.deepEqual(await page.evaluate(()=>{const m=normalizeState({...state,modules:{...state.modules,lyrics:{enabled:'yes',mode:'x',provider:'spotify',size:99,font:'nope',weight:123,color:'red',transition:'zoom',align:'top',duration:9,offset:-99}}}).modules.lyrics;return [m.enabled,m.mode,m.provider,m.size,m.font,m.weight,m.color,m.transition,m.align,m.duration,m.offset];}),[false,'auto','auto',12,'system',600,'#ffffff','fade','center',2,-10]);
 await page.waitForTimeout(400);const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-rider-draft')).modules.lyrics);assert.equal(draft.font,'system');assert.equal(draft.customFont,'霞鹜文楷');assert.equal(draft.transition,'blur');assert.equal(draft.enabled,false);
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: 桌面歌词 — LRC parse/merge/index, demo clock cycles lines with the transition, font/weight/stroke/align/duration/next controls, custom font, drag + arrow keys, export paints the line in colour, client payload in px, auto-mode hint with demo lyrics, normalising, persistence; no page errors.');
})().catch(e=>{console.error(e);process.exit(1)});
