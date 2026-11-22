'use strict';
// Encode test files in a separate software-rendered Electron process. Some Windows GPU
// drivers return an empty canvas recording even when the product page is visible. The
// product process keeps its normal GPU settings and still imports/decodes/renders the file.
const assert=require('node:assert/strict'),path=require('node:path');

async function recordVideoFixture(plan={kind:'cycle'}){
 const fs=require('node:fs'),os=require('node:os'),{_electron}=require('playwright-core');
 assert.ok(plan.kind==='cycle'||plan.kind==='person','unknown video fixture');
 if(plan.kind==='person'){
  assert.ok(Number.isInteger(plan.width)&&plan.width>0&&Number.isInteger(plan.height)&&plan.height>0,'person fixture dimensions');
  assert.ok(/^data:image\/png;base64,/.test(plan.background)&&/^data:image\/png;base64,/.test(plan.cutout),'person fixture PNG inputs');
  assert.ok(plan.box&&['x','y','w','h'].every(k=>Number.isFinite(plan.box[k]))&&plan.box.w>0&&plan.box.h>0,'person fixture box');
 }
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-rider-video-fixture-'));let app,deadline;
 try{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({executablePath:require('electron'),args:[__filename,'--user-data-dir='+profile,'--disable-gpu'],env,timeout:30000});
  const page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');
  const encoded=await Promise.race([
   page.evaluate(async plan=>{
    const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('fixture PNG decode failed'));img.src=src;});
    const background=plan.kind==='person'?await load(plan.background):null,cutout=plan.kind==='person'?await load(plan.cutout):null;
    const width=plan.kind==='cycle'?160:plan.width,height=plan.kind==='cycle'?160:plan.height;
    return new Promise((resolve,reject)=>{
     const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
     Object.assign(canvas.style,{display:'block',width:'160px',height:'auto'});document.body.append(canvas);
     const ctx=canvas.getContext('2d'),draw=frame=>{
      if(plan.kind==='cycle'){ctx.fillStyle=`hsl(${frame*6},90%,50%)`;ctx.fillRect(0,0,width,height);}
      else{const k=frame/60*Math.PI*2,b=plan.box;ctx.drawImage(background,0,0,width,height);ctx.drawImage(cutout,b.x+Math.sin(k)*width*.06,b.y-Math.abs(Math.sin(k*3))*height*.01,b.w,b.h);}
     };
     draw(0);
     const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0],chunks=[];
     let recorder,interval,limit,tail,frames=0,settled=false;
     const cleanup=()=>{clearInterval(interval);clearTimeout(limit);clearTimeout(tail);stream.getTracks().forEach(t=>t.stop());canvas.remove();};
     const fail=error=>{if(settled)return;settled=true;if(recorder&&recorder.state!=='inactive')recorder.stop();cleanup();reject(error);};
     try{recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:plan.kind==='person'?6e6:5e5});}
     catch(error){fail(error);return;}
     recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
     recorder.onerror=e=>fail(e.error||new Error('fixture recording failed'));
     recorder.onstop=()=>{
      cleanup();if(settled)return;
      const blob=new Blob(chunks,{type:'video/webm'});
      if(blob.size<500){fail(new Error('fixture produced insufficient WebM data: '+JSON.stringify({bytes:blob.size,frames,codec:recorder.mimeType,visibility:document.visibilityState})));return;}
      const reader=new FileReader();reader.onerror=()=>fail(reader.error||new Error('fixture bytes could not be read'));
      reader.onload=()=>{if(settled)return;settled=true;resolve({base64:reader.result.split(',')[1],mimeType:recorder.mimeType,width,height,frames});};reader.readAsDataURL(blob);
     };
     limit=setTimeout(()=>fail(new Error('fixture recording timed out after '+frames+' requested frames')),15000);
     try{recorder.start(250);interval=setInterval(()=>{
      try{draw(frames);track.requestFrame();if(++frames>=60){clearInterval(interval);tail=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},100);}}
      catch(error){fail(error);}
     },33);}catch(error){fail(error);}
    });
   },plan),
   new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('video fixture host timed out')),45000);})
  ]);
  const bytes=Buffer.from(encoded.base64,'base64');assert.ok(bytes.length>=500,'a nonempty video fixture is required');
  assert.deepEqual([...bytes.subarray(0,4)],[0x1a,0x45,0xdf,0xa3],'fixture is an EBML/WebM file');
  return {bytes,mimeType:encoded.mimeType,width:encoded.width,height:encoded.height,frames:encoded.frames};
 }finally{
  clearTimeout(deadline);
  try{if(app)await app.close();}finally{
   assert.equal(path.dirname(path.resolve(profile)),path.resolve(os.tmpdir()),'fixture cleanup stays in the temporary directory');
   fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
 }
}
module.exports={recordVideoFixture};

if(process.versions.electron){
 const {app,BrowserWindow}=require('electron');app.disableHardwareAcceleration();
 app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:320,height:240,show:false,skipTaskbar:true,title:'Desktop Rider video fixture',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  await win.loadURL('data:text/html,<meta charset="utf-8"><style>html,body{margin:0;background:white}</style>');
 });
}else if(require.main===module){
 (async()=>{
  const fs=require('node:fs'),fixture=await recordVideoFixture({kind:'cycle'}),out=process.env.DESKTOP_RIDER_OUT||path.join(__dirname,'out');
  fs.mkdirSync(out,{recursive:true});const file=path.join(out,'video-fixture-cycle.webm');fs.writeFileSync(file,fixture.bytes);
  const result={file,bytes:fixture.bytes.length,mimeType:fixture.mimeType,width:fixture.width,height:fixture.height,frames:fixture.frames};
  fs.writeFileSync(path.join(out,'video-fixture-report.json'),JSON.stringify(result,null,2));console.log('PASS: '+JSON.stringify(result));
 })().catch(error=>{console.error(error);process.exitCode=1;});
}
