'use strict';
// Exercise real decoding and storage in an isolated browser profile. Track URLs and media elements
// as well as visible layers: a rejected import must not leave resources behind the empty UI.
const {chromium,channel}=require('./playwright.cjs');
const assert=require('node:assert/strict');
(async()=>{
 // Software rendering avoids empty canvas recordings on Windows GPU drivers in headless mode.
 const browser=await chromium.launch({headless:true,channel,args:['--disable-gpu']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  await context.addInitScript(()=>{
   const t=window.layerVideoTest={createdUrls:[],activeUrls:new Set(),videos:[]};
   const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
   URL.createObjectURL=blob=>{const url=createURL(blob);if(/^video\//.test(blob.type||'')){t.createdUrls.push(url);t.activeUrls.add(url);}return url;};
   URL.revokeObjectURL=url=>{t.activeUrls.delete(url);return revokeURL(url);};
   const createElement=document.createElement.bind(document);
   document.createElement=(name,...args)=>{const el=createElement(name,...args);if(String(name).toLowerCase()==='video')t.videos.push(el);return el;};
   t.module=()=>Rider.modules.find(m=>m.id==='layers');
   t.snapshot=async()=>{
    const m=t.module(),db=await m.db();
    const keys=await new Promise((resolve,reject)=>{
     const tx=db.transaction('files','readonly'),q=tx.objectStore('files').getAllKeys();
     tx.oncomplete=()=>resolve(q.result.sort());tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
    });
    return {state:structuredClone(m.me()),videos:[...m.videos.keys()].sort(),urls:[...t.activeUrls].sort(),keys};
   };
   t.resources=from=>t.videos.slice(from).map(v=>({paused:v.paused,src:v.getAttribute('src'),readyState:v.readyState}));
   t.importResult=async file=>{
    let timer;
    try{await Promise.race([t.module().addVideo(file),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('import timed out')),10000);})]);return null;}
    catch(error){return error.message;}finally{clearTimeout(timer);}
   };
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready=()=>page.waitForFunction(()=>typeof Rider!=='undefined'&&Rider.api.state&&document.querySelector('#piece-left').style.backgroundImage);
  const snapshot=()=>page.evaluate(()=>layerVideoTest.snapshot());
  const playing=()=>page.waitForFunction(()=>{
   const m=layerVideoTest.module();return m.me().items.filter(it=>it.type==='video').every(it=>{const v=m.videos.get(it.id)?.video;return v&&!v.paused&&v.readyState>=2&&v.currentTime>0;});
  },null,{timeout:15000});
  await page.goto('http://127.0.0.1:4173');await ready();

  // Generate a valid file locally, without codecs, fixture downloads or changes to user data.
  const bytes=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;
   // Keep the fixture in the rendered page so Windows Chrome actually captures canvas frames.
   Object.assign(canvas.style,{position:'fixed',top:'0',left:'0',pointerEvents:'none'});document.body.append(canvas);
   const ctx=canvas.getContext('2d');ctx.fillStyle='#2468ac';ctx.fillRect(0,0,160,100);
   const stream=canvas.captureStream(0),chunks=[];
   const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});let frame=0,timer,deadline;
   const cleanup=()=>{clearInterval(timer);clearTimeout(deadline);stream.getTracks().forEach(t=>t.stop());canvas.remove();};
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   rec.onerror=e=>{cleanup();reject(e.error||new Error('recording failed'));};
   rec.onstop=async()=>{cleanup();const file=new File(chunks,'layer-test.webm',{type:'video/webm'});layerVideoTest.file=file;resolve([...new Uint8Array(await file.arrayBuffer())]);};
   rec.start();
   timer=setInterval(()=>{ctx.fillStyle=`hsl(${frame*17},80%,50%)`;ctx.fillRect(0,0,160,100);ctx.fillStyle='#fff';ctx.fillRect((frame*5)%140,20,20,20);stream.getVideoTracks()[0].requestFrame();if(++frame===60)rec.stop();},33);
   deadline=setTimeout(()=>{cleanup();if(rec.state!=='inactive')rec.stop();reject(new Error('recording timed out'));},10000);
  }));
  assert.ok(bytes.length>500,'recorded a nonempty WebM: '+bytes.length+' bytes');
  await page.locator('[data-view="layers"]').click();
  await page.locator('#layers-video').setInputFiles({name:'layer-test.webm',mimeType:'video/webm',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>layerVideoTest.module().me().items.length===1);await playing();
  const original=await snapshot(),id=original.state.items[0].id;
  assert.deepEqual(original.state.items[0].video,{name:'layer-test.webm',width:160,height:100});
  assert.deepEqual(original.videos,[id]);assert.deepEqual(original.keys,[id]);assert.equal(original.urls.length,1);
  const firstTime=await page.evaluate(id=>layerVideoTest.module().videos.get(id).video.currentTime,id);
  await page.waitForFunction(({id,time})=>Math.abs(layerVideoTest.module().videos.get(id).video.currentTime-time)>.05,{id,time:firstTime});
  assert.equal(await page.evaluate(id=>layerVideoTest.module().store('get',id).then(blob=>blob.size),id),bytes.length,'the stored file has all bytes');

  // Repeated invalid files used to accumulate both map entries and persistent blobs.
  for(let attempt=0;attempt<3;attempt++){
   const result=await page.evaluate(async()=>{
    const t=layerVideoTest,from=t.videos.length,beforeURLs=t.createdUrls.length;
    const error=await t.importResult(new File(['invalid video bytes'],'broken.webm',{type:'video/webm'}));
    return {error,resources:t.resources(from),created:t.createdUrls.length-beforeURLs};
   });
   assert.equal(result.error,'视频无法解码');assert.equal(result.created,1);
   assert.deepEqual(result.resources,[{paused:true,src:null,readyState:0}],'failed video stops decoding and releases its source');
   assert.deepEqual(await snapshot(),original,'a failed import leaves the existing video and saved file untouched');
  }

  // Metadata alone is not proof of a video track. An audio-only WebM with a misleading MIME type
  // decodes successfully but has no picture; reject it without saving invalid layer dimensions.
  const audioOnly=await page.evaluate(async()=>{
   const audio=new AudioContext(),source=audio.createOscillator(),sink=audio.createMediaStreamDestination();
   source.connect(sink);source.start();await audio.resume();
   let chunks;
   try{chunks=await new Promise((resolve,reject)=>{
    const rec=new MediaRecorder(sink.stream,{mimeType:'audio/webm;codecs=opus'}),parts=[];
    const timer=setTimeout(()=>rec.stop(),500);
    rec.ondataavailable=e=>parts.push(e.data);rec.onstop=()=>{clearTimeout(timer);resolve(parts);};
    rec.onerror=e=>{clearTimeout(timer);reject(e.error);};rec.start();
   });}finally{source.stop();sink.stream.getTracks().forEach(t=>t.stop());await audio.close();}
   const t=layerVideoTest,from=t.videos.length,pending=t.importResult(new File(chunks,'audio-only.webm',{type:'video/webm'}));
   let metadata=false;t.videos[from].addEventListener('loadedmetadata',()=>{metadata=true;},{once:true,capture:true});
   const error=await pending;return {error,metadata,resources:t.resources(from)};
  });
  assert.equal(audioOnly.metadata,true,'the audio-only fixture reaches metadata validation: '+JSON.stringify(audioOnly));
  assert.equal(audioOnly.error,'视频无法解码');
  assert.deepEqual(audioOnly.resources,[{paused:true,src:null,readyState:0}]);
  assert.deepEqual(await snapshot(),original,'an audio-only import leaves no resources');

  // Reject a full canvas before allocating a URL or starting a decoder.
  await page.evaluate(()=>{const m=layerVideoTest.module();while(m.me().items.length<24)m.add({type:'shape',name:'capacity test'});});
  const full=await snapshot();
  const rejectedFull=await page.evaluate(async()=>{
   const t=layerVideoTest,from=t.videos.length,urls=t.createdUrls.length,error=await t.importResult(t.file);
   return {error,createdVideos:t.videos.length-from,createdURLs:t.createdUrls.length-urls};
  });
  assert.deepEqual(rejectedFull,{error:'最多 24 个图层',createdVideos:0,createdURLs:0});
  assert.deepEqual(await snapshot(),full);

  // Capacity can change while the real decoder is loading. Fill the last slot synchronously
  // after starting an import so the outcome does not depend on machine speed.
  const raced=await page.evaluate(async()=>{
   const t=layerVideoTest,m=t.module();m.remove(m.me().items.at(-1));
   const from=t.videos.length,urls=t.createdUrls.length,pending=t.importResult(t.file);
   m.add({type:'shape',name:'last slot'});
   const error=await pending;
   return {error,resources:t.resources(from),created:t.createdUrls.length-urls};
  });
  assert.equal(raced.error,'最多 24 个图层');assert.equal(raced.created,1);
  assert.deepEqual(raced.resources,[{paused:true,src:null,readyState:0}]);
  const afterRace=await snapshot();assert.equal(afterRace.state.items.length,24);
  assert.deepEqual(afterRace.videos,original.videos);assert.deepEqual(afterRace.urls,original.urls);assert.deepEqual(afterRace.keys,original.keys);
  await page.evaluate(()=>{const m=layerVideoTest.module();for(const it of [...m.me().items])if(it.type==='shape')m.remove(it);});

  // Reload uses the real saved draft and IndexedDB file. Wait for automatic saving, not a test-only save.
  await page.waitForFunction(id=>{const draft=JSON.parse(localStorage.getItem('desktop-rider-draft'));return draft?.modules.layers.items.length===1&&draft.modules.layers.items[0].id===id;},id);
  await page.reload();await ready();await playing();
  const restored=await snapshot();assert.deepEqual(restored.state.items,original.state.items);
  assert.deepEqual(restored.keys,[id]);assert.deepEqual(restored.videos,[id]);assert.equal(restored.urls.length,1);
  await page.locator('[data-view="layers"]').click();
  await page.evaluate(id=>{const m=layerVideoTest.module();m.me().active=id;m.changed();},id);
  await page.locator('#layers-dup').click();await playing();
  const duplicated=await snapshot(),copy=duplicated.state.items.find(it=>it.id!==id).id;
  assert.deepEqual(duplicated.keys,[id,copy].sort());assert.equal(duplicated.videos.length,2);assert.equal(duplicated.urls.length,2);
  await page.evaluate(copy=>{layerVideoTest.deleted=layerVideoTest.module().videos.get(copy).video;},copy);
  await page.locator('#layers-delete').click();
  const remaining=await snapshot();assert.deepEqual(remaining.state.items,original.state.items);
  assert.deepEqual(remaining.keys,[id]);assert.deepEqual(remaining.videos,[id]);assert.deepEqual(remaining.urls,restored.urls);await playing();
  assert.deepEqual(await page.evaluate(()=>({paused:layerVideoTest.deleted.paused,src:layerVideoTest.deleted.getAttribute('src'),readyState:layerVideoTest.deleted.readyState})),{paused:true,src:null,readyState:0},'deleting a copy releases only its decoder');
  await page.evaluate(id=>{const m=layerVideoTest.module();layerVideoTest.deleted=m.videos.get(id).video;m.me().active=id;m.changed();},id);
  await page.locator('#layers-delete').click();
  const empty=await snapshot();assert.deepEqual(empty,{state:{items:[],active:null},videos:[],urls:[],keys:[]});
  assert.deepEqual(await page.evaluate(()=>({paused:layerVideoTest.deleted.paused,src:layerVideoTest.deleted.getAttribute('src'),readyState:layerVideoTest.deleted.readyState})),{paused:true,src:null,readyState:0});
  assert.deepEqual(errors,[],'no uncaught browser errors');
  console.log('PASS layer video: corrupt/repeated and audio-only imports, capacity/race cleanup, playback, persistence, copy and deletion');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
