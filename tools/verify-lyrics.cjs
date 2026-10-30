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
 const parsed=await page.evaluate(()=>{const l=LyricsView.parse('[ti:x]\n[00:01.50][00:03.25]同一句\n[00:02.000]第二句\n[00:10:12]冒号毫秒');const t=LyricsView.merge(l,LyricsView.parse('[00:02.00]second'));const q=LyricsView.parse('[1000,2000]晴(1000,500)天(1500,500)\n[4000,1000]第二句(4000,1000)'),y=LyricsView.parse('[11700,1410](11700,510,0)Let (12210,390,0)me');return {times:l.map(x=>x.t),texts:l.map(x=>x.text),ends:l.map(x=>x.end),trans:t.map(x=>x.trans||null),idx:[LyricsView.index(l,0),LyricsView.index(l,2.5),LyricsView.index(l,99)],kinds:[LyricsView.detect('[00:01.00]a'),LyricsView.detect('[1,2]a(1,2)'),LyricsView.detect('[1,2](1,2,0)a')],q:q.map(x=>[x.text,x.words?.length||0,x.end]),y:y[0].words.map(w=>w.text),p:[LyricsView.progress(q[0],1.5),LyricsView.wordProgress(q[0].words[1],1.75)]};});
 assert.deepEqual(parsed.times,[1.5,2,3.25,10.12]);assert.deepEqual(parsed.texts,['同一句','第二句','同一句','冒号毫秒']);assert.deepEqual(parsed.ends,[2,3.25,10.12,15.12]);assert.deepEqual(parsed.trans,[null,'second',null,null]);assert.deepEqual(parsed.idx,[-1,1,3]);assert.deepEqual(parsed.kinds,['lrc','qrc','yrc']);assert.deepEqual(parsed.q,[['晴天',2,3],['第二句',1,5]]);assert.deepEqual(parsed.y,['Let ','me']);assert.deepEqual(parsed.p,[.25,.5]);
 // Off by default: nothing on the desktop, nav entry exists.
 assert.equal(await page.evaluate(()=>document.querySelector('.lyrics-box').hidden),true);
 await page.locator('[data-view="lyrics"]').click();await page.waitForSelector('#module-lyrics #lyr-enabled');await page.evaluate(()=>document.querySelectorAll('#module-lyrics details').forEach(d=>d.open=true));
 // Editing mode: inside the 桌面歌词 view the lyrics layer is on top and other floating things are click-through.
 const editing=await page.evaluate(()=>{const d=document.querySelector('#desktop'),layer=document.querySelector('.module-layer[data-module="lyrics"]');return {cls:d.classList.contains('lyrics-editing'),z:getComputedStyle(layer).zIndex,dock:getComputedStyle(document.querySelector('.desktop-dock')).pointerEvents,zone:getComputedStyle(document.querySelector('.desktop-zone')).pointerEvents,piece:getComputedStyle(document.querySelector('#piece-left')).pointerEvents};});
 assert.deepEqual(editing,{cls:true,z:'34',dock:'none',zone:'none',piece:'none'},'editing mode: '+JSON.stringify(editing));
 // Manual LRC, demo clock on: the current line cycles through all three within a few seconds.
 await page.evaluate(()=>{Object.assign(state.modules.lyrics,{enabled:true,mode:'manual',display:'single',lrc:'[00:00.00]第一句\n[00:00.80]第二句\n[00:01.60]第三句',size:6,color:'#ff0000',transition:'slide',duration:.2,shadow:false});update({custom:false});});await settled();
 const seen=new Set(),pairs=new Set();for(let i=0;i<16;i++){const [cur,next]=await page.evaluate(()=>[document.querySelector('.lyrics-line.in')?.textContent,document.querySelector('.lyrics-next').textContent]);seen.add(cur);pairs.add(cur+'>'+next);await page.waitForTimeout(250);}
 assert.ok(['第一句','第二句','第三句'].every(t=>seen.has(t)),'demo clock cycles through the lines: '+[...seen].join('|'));assert.ok(pairs.has('第一句>第二句'),'the next line is previewed under the current one: '+[...pairs].join('|'));
 assert.equal(await page.locator('#lyr-status').textContent(),'已读取 3 行逐行歌词');
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
 // The box takes the pointer only in its own view; a click on it in the design view reaches what is beneath.
 const hit=await page.evaluate(()=>{const b=document.querySelector('.lyrics-box'),r=b.getBoundingClientRect();return {here:getComputedStyle(b).pointerEvents,over:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.lyrics-box')?'lyrics':'other'};});
 assert.deepEqual(hit,{here:'auto',over:'lyrics'});
 await page.locator('[data-view="design"]').click();await settled();
 const outside=await page.evaluate(()=>{const b=document.querySelector('.lyrics-box'),r=b.getBoundingClientRect();return {cls:document.querySelector('#desktop').classList.contains('lyrics-editing'),here:getComputedStyle(b).pointerEvents,over:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('.lyrics-box')?'lyrics':'other',dock:getComputedStyle(document.querySelector('.desktop-dock')).pointerEvents};});
 assert.deepEqual(outside,{cls:false,here:'none',over:'other',dock:'auto'},'design view: lyrics are click-through again: '+JSON.stringify(outside));
 await page.locator('[data-view="lyrics"]').click();await page.waitForSelector('#module-lyrics #lyr-enabled');await page.evaluate(()=>document.querySelectorAll('#module-lyrics details').forEach(d=>d.open=true));
 // Export paints the current line in the chosen colour; without the module the same pixels are wallpaper.
 await page.evaluate(()=>{Object.assign(state.modules.lyrics,{font:'system',stroke:false,demo:false,align:'center',x:50,y:50});update({custom:false});});await settled();
 const diff=await page.evaluate(async()=>{const s=clone(state);const a=await wallpaperCanvas(s,400);s.modules.lyrics.enabled=false;const b=await wallpaperCanvas(s,400);const da=a.getContext('2d').getImageData(0,0,400,250).data,db=b.getContext('2d').getImageData(0,0,400,250).data;let n=0,red=0;for(let i=0;i<da.length;i+=4){if(Math.abs(da[i]-db[i])>8||Math.abs(da[i+1]-db[i+1])>8||Math.abs(da[i+2]-db[i+2])>8)n++;if(da[i]>200&&da[i+1]<90&&da[i+2]<90)red++;}return {n,red};});
 assert.ok(diff.n>150&&diff.red>60,'export shows the red lyric line: '+JSON.stringify(diff));
 assert.equal(await page.evaluate(()=>document.querySelector('.lyrics-line.in')?.textContent),'第一句','demo off shows the first line');
 // Client payload: style in px for a 1920×1080 monitor plus the source.
 const payload=await page.evaluate(()=>Rider.modules.find(m=>m.id==='lyrics').exportLyrics({...clone(state),aspect:16/9},1920,1080));
 assert.ok(Math.abs(payload.style.size-1080*.06)<.01);assert.equal(payload.style.left,'960px');assert.equal(payload.style.width,'1536px');assert.equal(payload.style.display,'single');assert.equal(payload.style.highlight,'#ffd166');assert.equal(payload.style.color,'#ff0000');assert.equal(payload.style.transition,'blur');assert.equal(payload.source.mode,'manual');assert.ok(payload.source.lrc.includes('第二句'));assert.equal(payload.source.offset,0);
 assert.equal(await page.evaluate(()=>Rider.modules.find(m=>m.id==='lyrics').exportLyrics({...clone(state),modules:{...state.modules,lyrics:{...state.modules.lyrics,enabled:false}}},1920,1080)),null,'off → null');
 // Auto mode in the browser: hint, demo lyrics stand in; disabled hides the box.
 await page.locator('#lyr-mode').selectOption('auto');await settled();assert.match(await page.locator('#lyr-status').textContent(),/Windows 客户端/);assert.equal(await page.evaluate(()=>document.querySelector('.lyr-manual-only').hidden),true);
 assert.equal(await page.evaluate(()=>document.querySelector('.lyrics-line.in')?.textContent),'桌面上的一行字','demo lyrics stand in for the player');
 await page.locator('#lyr-enabled').uncheck();await settled();assert.equal(await page.evaluate(()=>document.querySelector('.lyrics-box').hidden),true);
 // Karaoke: QRC manual text with word timing; the active word's --p grows, finished words sit at 1, highlight colour applies.
 await page.evaluate(()=>{Object.assign(state.modules.lyrics,{enabled:true,mode:'manual',display:'karaoke',demo:true,highlight:'#00ff00',glow:60,lrc:'[0,2000]晴(0,1000)天(1000,1000)\n[2000,2000]第二句(2000,2000)\n[9000,1000]很久以后(9000,1000)',transition:'emerge',backdrop:40});update({custom:false});});await settled();await page.evaluate(()=>{Rider.modules.find(x=>x.id==='lyrics').start=performance.now();});
 assert.match(await page.locator('#lyr-status').textContent(),/QQ 逐字歌词，可逐字点亮/);
 let saw={active:false,done:false,dots:false};for(let i=0;i<30;i++){const r=await page.evaluate(()=>{const b=document.querySelector('.lyrics-box'),ws=[...b.querySelectorAll('.lyrics-line.in .lw')].map(s=>({p:Number(s.style.getPropertyValue('--p')),active:s.classList.contains('active')}));return {ws,dots:!b.querySelector('.lyrics-dots').hidden,display:b.dataset.display,hl:b.style.getPropertyValue('--lyr-hl'),backdrop:b.style.getPropertyValue('--lyr-backdrop'),tr:b.dataset.transition};});
  if(r.ws.some(w=>w.active&&w.p>0&&w.p<1))saw.active=true;if(r.ws.length>1&&r.ws[0].p===1&&r.ws[1].p<1)saw.done=true;if(r.dots)saw.dots=true;saw.last=r;await page.waitForTimeout(200);}
 assert.ok(saw.active,'a word is mid-fill at some point');assert.ok(saw.done,'finished words stay fully lit while the next fills');assert.ok(saw.dots,'interlude dots show during the 5 s gap');
 assert.equal(saw.last.display,'karaoke');assert.equal(saw.last.hl,'#00ff00');assert.equal(saw.last.backdrop,'0.4');assert.equal(saw.last.tr,'emerge');
 // Stage: rows around the current line, the current one marked; 5-line option.
 await page.locator('#lyr-display').selectOption('stage');await settled();await page.waitForTimeout(300);
 const stage=await page.evaluate(()=>{const b=document.querySelector('.lyrics-box');return {rows:b.querySelectorAll('.lyrics-row').length,current:b.querySelectorAll('.lyrics-row.current').length,display:b.dataset.display,stageHidden:getComputedStyle(b.querySelector('.lyrics-stage')).display,nextHidden:b.querySelector('.lyrics-next').hidden};});
 assert.equal(stage.display,'stage');assert.ok(stage.rows>=2&&stage.rows<=3,'3-line stage shows the neighbours: '+stage.rows);assert.equal(stage.current,1);assert.equal(stage.stageHidden,'none');assert.equal(stage.nextHidden,true);
 await page.locator('#lyr-stage-lines').selectOption('5');await settled();assert.equal(await page.evaluate(()=>document.querySelector('.lyrics-box').dataset.stage),'5');assert.equal(await page.evaluate(()=>state.modules.lyrics.stageLines),5);
 // Export in karaoke mode paints the sung part in the highlight colour.
 await page.evaluate(()=>{Object.assign(state.modules.lyrics,{display:'karaoke',demo:false,shadow:false,stroke:false,x:50,y:50,lrc:'[0,4000]很长很长的一句歌词(0,4000)'});update({custom:false});});await settled();
 const kar=await page.evaluate(async()=>{const s=clone(state);const m=Rider.modules.find(x=>x.id==='lyrics');const save=m.start;m.start=null;const c=await wallpaperCanvas(s,400);m.start=save;const d=c.getContext('2d').getImageData(0,0,400,250).data;let red=0;for(let i=0;i<d.length;i+=4){if(d[i]>d[i+1]+60&&d[i]>d[i+2]+60)red++;}return {red};});
 assert.ok(kar.red>30,'unsung part in the base colour (dimmed red): '+JSON.stringify(kar));
 await page.evaluate(()=>{state.modules.lyrics.enabled=false;update({custom:false});});await settled();
 // Normalising garbage and persistence.
 assert.deepEqual(await page.evaluate(()=>{const m=normalizeState({...state,modules:{...state.modules,lyrics:{enabled:'yes',mode:'x',provider:'spotify',size:99,font:'nope',weight:123,color:'red',transition:'zoom',align:'top',duration:9,offset:-99,display:'wall',highlight:'gold',glow:500,stageLines:7}}}).modules.lyrics;return [m.enabled,m.mode,m.provider,m.size,m.font,m.weight,m.color,m.transition,m.align,m.duration,m.offset,m.display,m.highlight,m.glow,m.stageLines];}),[false,'auto','auto',12,'system',600,'#ffffff','fade','center',2,-10,'karaoke','#ffd166',100,3]);
 await page.waitForTimeout(400);const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('desktop-rider-draft')).modules.lyrics);assert.equal(draft.font,'system');assert.equal(draft.customFont,'霞鹜文楷');assert.equal(draft.transition,'emerge');assert.equal(draft.display,'karaoke');assert.equal(draft.enabled,false);
 assert.deepEqual(errors,[]);await browser.close();
 console.log('PASS: 桌面歌词 — editing mode (layer on top, floats click-through, click-through outside the view), LRC/QRC/YRC parse, merge, index, progress, demo clock cycles lines with the transition, font/weight/stroke/align/duration/next controls, custom font, drag + arrow keys, export paints the line in colour, client payload in px, auto-mode hint with demo lyrics, karaoke word fill + interlude dots + backdrop + emerge, stage rows (3/5), karaoke export, normalising, persistence; no page errors.');
})().catch(e=>{console.error(e);process.exit(1)});
