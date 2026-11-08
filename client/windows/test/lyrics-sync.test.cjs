'use strict';
// Real main.js + layer.html + shared lyric parser/view in VMs. Only Electron, fetches, the clock and DOM layout
// are isolated; no native media sessions, network, app data, wallpaper or login settings are touched.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const main=path.join(__dirname,'../main.js'),localRequire=createRequire(main),mainSource=fs.readFileSync(main,'utf8');
const layerSource=fs.readFileSync(path.join(__dirname,'../layer.html'),'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const LV=localRequire(path.resolve(__dirname,'../../../lyrics-view.js')),realNative=localRequire('./lib/native');
const clone=x=>JSON.parse(JSON.stringify(x)),flush=()=>new Promise(resolve=>setImmediate(resolve));
const lines=name=>[{t:0,end:20,text:name,words:[{t:0,d:20,text:name}]}];
const track=(title,extra={})=>({sessions:1,status:'Playing',playing:true,title,artist:'fixture',position:2,duration:60,...extra});
const result=name=>({lines:lines(name),provider:'qq',words:true});

// Minimal DOM surface used by the real shared renderer's karaoke layout (no browser layout engine).
function node(){const classes=new Set(),props=new Map();return {hidden:false,dataset:{},children:[],_html:'',
 style:{setProperty:(k,v)=>props.set(k,v),getPropertyValue:k=>props.get(k)||''},
 classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle(x,on){if(on===undefined)on=!classes.has(x);if(on)classes.add(x);else classes.delete(x);}},
 get innerHTML(){return this._html;},set innerHTML(value){this._html=value;this.children=[...value.matchAll(/<span class="lw"[^>]*>([\s\S]*?)<\/span>/g)].map(m=>{const n=node();n.textContent=m[1];return n;});},
 get textContent(){return this._html.replace(/<[^>]*>/g,'');},set textContent(v){this._html=String(v);this.children=[];},
 replaceChildren(...xs){this._html='';this.children=xs;},append(...xs){this.children.push(...xs);},querySelectorAll(selector){return selector==='.lw'||selector==='i'?this.children:[];}};}
async function renderer(mode='auto',initial=[]){let clock=1000000,nextFrame=0;const raf=new Map(),box=node(),slots=[node(),node()],rows=node(),trans=node(),next=node(),dots=node();dots.children=[node(),node(),node()];
 box.querySelector=s=>({'.lyrics-rows':rows,'.lyrics-trans':trans,'.lyrics-next':next,'.lyrics-dots':dots}[s]);
 box.querySelectorAll=s=>s==='.lyrics-line'?slots:s==='.lyrics-line,.lyrics-trans,.lyrics-next'?[...slots,trans,next]:[];
 const cfg={mode,lines:initial,style:{display:'karaoke',offset:0,transition:'fade',size:20,weight:400,color:'#ffffff'}};
 const document={getElementById:id=>id==='lyrics'?box:node(),createElement:()=>node(),head:{append:n=>queueMicrotask(()=>n.onload?.())}};
 const context=vm.createContext({document,location:{search:'?lyrics='+encodeURIComponent(JSON.stringify(cfg))+'&lib=fixture'},URLSearchParams,Date:class extends Date{static now(){return clock;}},
 requestAnimationFrame:fn=>{raf.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>raf.delete(id),setTimeout,clearTimeout,console});
 context.window=context;context.LyricsView=LV;vm.runInContext(layerSource,context,{filename:'layer.html',timeout:1000});await flush();assert.equal(context.__lyrics.ready,true);
 const sets=[],set=context.__setLyrics;context.__setLyrics=x=>{sets.push(clone(x));return set(x);};
 return {context,box,sets,now:()=>clock,run:code=>vm.runInContext(code,context,{timeout:1000}),
  frame(ms){clock+=ms;const pending=[...raf.values()];raf.clear();pending.forEach(fn=>fn());},
  fill:()=>slots.find(x=>x.classList.contains('in'))?.children.map(x=>Number(x.style.getPropertyValue('--p')))||[],
  content:()=>[...slots,rows,trans,next].map(x=>x.textContent).join('')};
}
async function controller(){const view=await renderer(),requests=[],sent=[],wc=new EventEmitter();let loading=false,destroyed=false;
 const entry={lyrics:{source:{mode:'auto',provider:'auto',query:''}},window:{isDestroyed:()=>destroyed,webContents:wc}};
 Object.assign(wc,{isLoading:()=>loading,executeJavaScript:code=>{sent.push(code);view.run(code);return Promise.resolve();}});
 const app={isPackaged:false,commandLine:{appendSwitch(){}},getPath:()=>path.join(__dirname,'unused-isolated-profile'),requestSingleInstanceLock:()=>true,whenReady:()=>({then(){}}),on(){}};
 const customRequire=id=>{if(id==='electron')return {app,ipcMain:{on(){},handle(){}}};if(id==='node:fs')return {readFileSync(){throw new Error('no profile');},promises:{}};
  if(id==='./lib/native')return {...realNative,create:()=>({})};if(id==='./lib/server')return {};
  if(id==='./lib/lyrics')return {use:()=>({findLyrics:(want,{provider})=>new Promise((resolve,reject)=>requests.push({want,provider,resolve,reject}))})};
  return localRequire(id);};
 const context=vm.createContext({require:customRequire,__dirname:path.dirname(main),process:{platform:'test',argv:[],on(){}},Buffer,URL,setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout,console});
 vm.runInContext(mainSource+'\nglobalThis.operations={onMedia,lyricsEntry,layers,lyricCache};',context,{filename:main,timeout:1000});const api=context.operations;api.layers.set('test',entry);api.lyricsEntry(entry);
 return {view,requests,sent,entry,api,loading(value){loading=value;if(!value)wc.emit('did-finish-load');},destroy(){destroyed=true;}};
}

test('captured QQ Changing compatibility drives the real lyrics controller and renderer',async()=>{
 const h=await controller(),raw={sessions:1,status:'Changing',playing:false,app:'QQMusic.exe',title:'Captured QQ',artist:'fixture',position:145.26,duration:259.27,updated:h.view.now(),controls:{playEnabled:false,pauseEnabled:true}};
 const normalized=realNative.normalizeMedia(raw);assert.equal(normalized.playingInferred,true);h.api.onMedia(normalized);
 assert.equal(h.requests.length,1);assert.equal(h.entry.lyricsState.playing,true);
 h.requests[0].resolve({provider:'qq',words:true,lines:[{t:140,end:200,text:'fixture',words:[{t:140,d:60,text:'fixture'}]}]});await flush();
 assert.equal(h.view.box.hidden,false);const before=h.view.fill()[0];h.view.frame(500);assert.ok(h.view.fill()[0]>before,'inferred playback advances word highlighting');
 h.api.onMedia(realNative.normalizeMedia({...raw,status:'Paused',position:145.76,updated:h.view.now()}));const paused=h.view.fill();h.view.frame(1000);assert.deepEqual(h.view.fill(),paused);
 h.api.onMedia(realNative.normalizeMedia({...raw,status:'Opened',position:0,duration:0}));assert.equal(h.view.box.hidden,true);assert.equal(h.entry.lyricsState.track,null,'an idle player still does not drive automatic lyrics');
});

test('track change clears old controller and renderer lyrics before the new fetch; exit resets everything',async()=>{
 const h=await controller();h.api.onMedia(track('A'));h.requests[0].resolve(result('A words'));await flush();assert.equal(h.view.context.__lyrics.lines,1);
 h.entry.lyricsState.error='old error';h.api.onMedia(track('B',{position:4,updated:12345}));
 assert.equal(h.entry.lyricLines.length,0);assert.deepEqual(clone(h.entry.lyricsState),{track:{title:'B',artist:'fixture',album:'',app:''},playing:true,lines:0,source:'',words:false,error:'',key:'B\nfixture'});
 assert.equal(h.view.box.hidden,true);assert.equal(h.view.context.__lyrics.index,-1);assert.equal(h.view.content(),'');assert.equal(h.view.context.__lyrics.media.updated,12345);
 h.requests[1].resolve(result('B words'));await flush();assert.equal(h.view.context.__lyrics.line,'B words');
 h.api.onMedia({sessions:0,playing:false});assert.equal(h.entry.lyricLines.length,0);assert.equal(h.entry.lyricsState.words,false);assert.equal(h.view.context.__lyrics.index,-1);assert.equal(h.view.context.__lyrics.line,'');assert.equal(h.view.content(),'');assert.equal(h.view.box.hidden,true);
});

test('A to B to A accepts only the current request, including a reused pending cache promise',async()=>{
 const h=await controller();h.api.onMedia(track('A'));h.api.onMedia(track('B'));h.api.onMedia(track('A'));
 assert.equal(h.requests.length,2,'pending cache entries may be shared');h.requests[1].resolve(result('B words'));await flush();assert.equal(h.view.context.__lyrics.lines,0);
 h.requests[0].resolve(result('A words'));await flush();assert.equal(h.view.context.__lyrics.line,'A words');assert.equal(h.view.sets.filter(x=>x.lines?.length).length,1,'the original A continuation is obsolete');
});

test('a new track with the same position and no timestamp gets its own clock anchor',async()=>{
 const h=await controller();h.api.onMedia(track('A'));h.requests[0].resolve(result('A words'));await flush();h.view.frame(3000);assert.deepEqual(h.view.fill(),[.25]);
 h.api.onMedia(track('B'));h.requests[1].resolve(result('B words'));await flush();assert.deepEqual(h.view.fill(),[.1],'the new track starts from its own reported position');h.view.frame(500);assert.deepEqual(h.view.fill(),[.125]);
});

for(const staleResult of ['resolve','reject'])test('old '+staleResult+' cannot overwrite a new source on the same track',async()=>{
 const h=await controller();h.api.onMedia(track('A'));h.entry.lyrics={source:{mode:'auto',provider:'qq',query:'new query'}};h.api.lyricsEntry(h.entry);
 h.requests[1].resolve(result('new source'));await flush();h.requests[0][staleResult](staleResult==='resolve'?result('old source'):new Error('old failure'));await flush();
 assert.equal(h.view.context.__lyrics.line,'new source');assert.equal(h.entry.lyricLines[0].text,'new source');assert.equal(h.entry.lyricsState.error,'');
});

test('switching to manual or removing lyrics cancels pending automatic results',async()=>{
 const h=await controller();h.api.onMedia(track('A'));h.entry.lyrics={source:{mode:'manual',lrc:'[00:00]manual fixture'}};h.api.lyricsEntry(h.entry);
 h.requests[0].resolve(result('obsolete auto'));await flush();assert.equal(h.entry.lyricLines[0].text,'manual fixture');assert.equal(h.entry.lyricsState.source,'manual');assert.equal(h.view.sets.filter(x=>x.lines?.length).length,0);
 h.entry.lyrics=null;h.api.lyricsEntry(h.entry);assert.equal(h.entry.lyricLines.length,0);assert.equal(h.entry.lyricsState,null);
});

test('obsolete renderer messages queued during page loading are discarded',async()=>{
 const h=await controller();h.loading(true);h.api.onMedia(track('A'));h.requests[0].resolve(result('A words'));await flush();h.api.onMedia(track('B'));h.loading(false);
 assert.equal(h.view.box.hidden,true);assert.equal(h.view.sets.filter(x=>x.lines?.length).length,0);assert.equal(h.view.context.__lyrics.media.position,2);
 h.requests[1].resolve(result('B words'));await flush();assert.equal(h.view.context.__lyrics.line,'B words');
});

test('a removed window cannot receive a pending error',async()=>{
 const h=await controller();h.api.onMedia(track('A'));h.destroy();const sent=h.sent.length;h.requests[0].reject(new Error('late error'));await flush();assert.equal(h.sent.length,sent);assert.equal(h.entry.lyricsState.error,'');
});

test('clearing automatic lyrics resets hidden DOM and diagnostics even while power-paused',async()=>{
 const h=await renderer();h.context.__setMedia({position:3,playing:false});h.context.__setLyrics(result('fixture'));assert.ok(h.content());h.context.__setPaused(true,'covered');
 h.context.__setMedia(null);assert.equal(h.box.hidden,true);assert.equal(h.content(),'');assert.equal(h.context.__lyrics.index,-1);assert.equal(h.context.__lyrics.line,'');assert.equal(h.context.__lyrics.words,false);assert.equal(h.context.__lyrics.media,null);
 h.context.__setPaused(false,'');h.frame(1000);assert.equal(h.context.__lyrics.index,-1);assert.equal(h.box.hidden,true);
});

test('manual lyrics keep their local loop after the player exits',async()=>{
 const h=await renderer('manual',lines('manual fixture'));h.context.__setMedia({position:3,playing:false});assert.deepEqual(h.fill(),[.15]);h.frame(1000);assert.deepEqual(h.fill(),[.15]);
 h.context.__setMedia(null);const before=h.fill()[0];h.frame(1000);assert.ok(h.fill()[0]>before);assert.equal(h.box.hidden,false);assert.equal(h.context.__lyrics.line,'manual fixture');
});

test('playing uses a recent position timestamp and repeated samples retain the clock anchor',async()=>{
 const h=await renderer();h.context.__setLyrics(result('timed fixture'));const packet={position:2,playing:true,updated:h.now()-500};h.context.__setMedia(packet);assert.deepEqual(h.fill(),[.125]);
 h.frame(250);const first=h.fill();h.context.__setMedia(packet);assert.deepEqual(h.fill(),first);h.frame(250);assert.deepEqual(h.fill(),[.15]);
 h.context.__setMedia({position:3,playing:false,updated:h.now()-4000});assert.deepEqual(h.fill(),[.15]);h.frame(2000);assert.deepEqual(h.fill(),[.15],'Paused never extrapolates');
});

test('missing, invalid, future and stale timestamps use arrival time, not an unbounded correction',async()=>{
 for(const age of [null,NaN,Infinity,-1,5001]){const h=await renderer();h.context.__setLyrics(result('timed fixture'));const packet={position:2,playing:true};if(age!==null)packet.updated=h.now()-age;
  h.context.__setMedia(packet);assert.deepEqual(h.fill(),[.1],String(age));h.frame(500);h.context.__setMedia(packet);assert.deepEqual(h.fill(),[.125],'unchanged packet keeps arrival anchor: '+age);}
});

test('resume with an unchanged timeline never adds time spent paused',async()=>{
 for(const hasTimestamp of [true,false]){const h=await renderer();h.context.__setLyrics(result('timed fixture'));const sample={position:2};if(hasTimestamp)sample.updated=h.now();
  h.context.__setMedia({...sample,playing:true});h.frame(500);h.context.__setMedia({...sample,playing:false});h.frame(3000);assert.deepEqual(h.fill(),[.1]);
  const resumed={...sample,playing:true};h.context.__setMedia(resumed);assert.deepEqual(h.fill(),[.1],'resume starts at the frozen position');
  h.frame(500);h.context.__setMedia(resumed);assert.deepEqual(h.fill(),[.125],'repeated resumed samples retain the new anchor');
  h.context.__setMedia({position:3,playing:true,updated:h.now()-100});assert.deepEqual(h.fill(),[.155],'a genuinely new timeline can still be compensated');}
});
