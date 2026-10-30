'use strict';
// Shared preview/export renderer. No remote requests and no uploaded image data.
const Portrait = (()=>{
 let worker,nextId=0;const pending=new Map(),cache=new Map(),prepared=new Map();
 function stop(error){worker?.terminate();worker=null;for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}pending.clear();cache.clear();}
 function getWorker(){if(worker)return worker;worker=new Worker('person-worker.js');worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;pending.delete(data.id);clearTimeout(job.timer);data.error?job.reject(new Error(data.error)):job.resolve(data);};worker.onerror=()=>stop(new Error('人物识别暂不可用，请重试'));return worker;}
 async function ask(img,point){const bitmap=await createImageBitmap(img);return new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>stop(new Error('人物识别超时，请重试')),30000);pending.set(id,{resolve,reject,timer});getWorker().postMessage({id,bitmap,point},[bitmap]);});}
 // Confidence mask of the object under a normalized point (0–1), at model output size.
 function segmentAt(img,x,y){return ask(img,{x,y});}
 // One video frame (an ImageBitmap, transferred) through the tracker; resolves {width,height,values}.
 function segmentVideo(bitmap,timestamp){return new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>stop(new Error('人物识别超时，请重试')),30000);pending.set(id,{resolve,reject,timer});getWorker().postMessage({id,bitmap,video:true,timestamp},[bitmap]);});}
 // BlazeFace on a bitmap (any size): [{score,box:{x,y,w,h} normalised,keypoints:[rightEye,leftEye,nose,mouth,rightEar,leftEar]}] — for the 萌版人物 rig.
 function detectFace(bitmap){return new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>stop(new Error('人物识别超时，请重试')),30000);pending.set(id,{resolve,reject,timer});getWorker().postMessage({id,bitmap,face:true},[bitmap]);});}
 async function detect(img,key){
  if(cache.has(key))return cache.get(key);
  const task=(async()=>{const result=await ask(img);
   const c=document.createElement('canvas');c.width=result.width;c.height=result.height;const ctx=c.getContext('2d'),pixels=ctx.createImageData(c.width,c.height);let count=0;
   for(let i=0;i<result.values.length;i++){const confidence=result.values[i];const t=Math.max(0,Math.min(1,(confidence-.25)/.5));pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=255;pixels.data[i*4+3]=Math.round(t*t*(3-2*t)*255);if(confidence>.6)count++;}
   ctx.putImageData(pixels,0,0);return {mask:c,coverage:count/result.values.length};
  })();cache.set(key,task);try{const value=await task;while(cache.size>4)cache.delete(cache.keys().next().value);return value;}catch(error){cache.delete(key);throw error;}
 }
 function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 // One uniform crop for the image and the mask. Overscan provides room for
 // two-axis movement without stretching faces, reflecting edges or adding holes.
 function placement(s,img,w,h){
  const follows=s.linked&&s.mode!=='single';
  const factor=Math.max(w/img.naturalWidth,h/img.naturalHeight)*s.scale/100*(follows?1.18:1);
  const iw=img.naturalWidth*factor,ih=img.naturalHeight*factor;
  const panX=follows?(s.ratio-50)/100:0,panY=follows?((s.anchorY??50)-50)/100:0;
  const x=Math.max(w-iw,Math.min(0,(w-iw)*(s.focusX??50)/100+panX*(iw-w)));
  const y=Math.max(h-ih,Math.min(0,(h-ih)*(s.focusY??50)/100+panY*(ih-h)));
  return {x,y,w:iw,h:ih};
 }
 function prepare(s,img,person,w,h,key){
  const id=JSON.stringify([key,w,h,s.scale,s.focusX,s.focusY,s.gap,s.linked,s.mode,s.ratio,s.anchorY]);if(prepared.has(id))return prepared.get(id);
  const base=canvas(w,h),ctx=base.getContext('2d',{willReadFrequently:true});
  const crop=placement(s,img,w,h),{w:iw,h:ih}=crop;
  ctx.drawImage(img,crop.x,crop.y,iw,ih);
  const mask=canvas(w,h),mc=mask.getContext('2d',{willReadFrequently:true});mc.drawImage(person.mask,crop.x,crop.y,iw,ih);
  const maskData=mc.getImageData(0,0,w,h).data;
  // Distance field protects an expanded neighbourhood, preventing shifted copies
  // of the person from leaking into the background. Smooth blend outside it.
  const mw=Math.min(400,w),mh=Math.max(1,Math.round(h*mw/w)),small=canvas(mw,mh),sc=small.getContext('2d',{willReadFrequently:true});sc.drawImage(mask,0,0,mw,mh);const alpha=sc.getImageData(0,0,mw,mh).data,dist=new Float32Array(mw*mh);
  for(let i=0;i<dist.length;i++)dist[i]=alpha[i*4+3]>20?0:1e6;
  for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){const i=y*mw+x;let d=dist[i];if(x)d=Math.min(d,dist[i-1]+1);if(y)d=Math.min(d,dist[i-mw]+1);if(x&&y)d=Math.min(d,dist[i-mw-1]+1.4142);if(x+1<mw&&y)d=Math.min(d,dist[i-mw+1]+1.4142);dist[i]=d;}
  for(let y=mh-1;y>=0;y--)for(let x=mw-1;x>=0;x--){const i=y*mw+x;let d=dist[i];if(x+1<mw)d=Math.min(d,dist[i+1]+1);if(y+1<mh)d=Math.min(d,dist[i+mw]+1);if(x+1<mw&&y+1<mh)d=Math.min(d,dist[i+mw+1]+1.4142);if(x&&y+1<mh)d=Math.min(d,dist[i+mw-1]+1.4142);dist[i]=d;}
  const shieldPixels=sc.createImageData(mw,mh),margin=(s.gap/3200+12/1600)*mw,feather=28/1600*mw;
  for(let i=0;i<dist.length;i++){const t=Math.max(0,Math.min(1,(dist[i]-margin)/feather));shieldPixels.data[i*4+3]=Math.round((1-t*t*(3-2*t))*255);}
  sc.putImageData(shieldPixels,0,0);const shield=canvas(w,h),sh=shield.getContext('2d',{willReadFrequently:true});sh.drawImage(small,0,0,w,h);
  const value={base,pixels:ctx.getImageData(0,0,w,h).data,mask:maskData,shield:sh.getImageData(0,0,w,h).data};prepared.set(id,value);while(prepared.size>3)prepared.delete(prepared.keys().next().value);return value;
 }
 function drawReflected(ctx,base,dx,dy){const w=base.width,h=base.height;for(let ty=-1;ty<=1;ty++)for(let tx=-1;tx<=1;tx++){ctx.save();ctx.translate(dx+tx*w+(tx%2?w:0),dy+ty*h+(ty%2?h:0));ctx.scale(tx%2?-1:1,ty%2?-1:1);ctx.drawImage(base,0,0);ctx.restore();}}
 async function render(s,img,w,h,geo,key){
  const person=await detect(img,key),data=prepare(s,img,person,w,h,key),out=canvas(w,h),ctx=out.getContext('2d',{willReadFrequently:true});
  if(s.mode==='single'){ctx.drawImage(data.base,0,0);return {canvas:out,person};}
  const slope=Math.tan((s.mode==='diagonal'?s.angle:0)*Math.PI/180),normal=Math.hypot(1,slope),gap=s.gap*w/1600;
  ctx.fillStyle=s.gapColor;ctx.fillRect(0,0,w,h);
  geo.polygons.forEach((points,index)=>{if(!points.length)return;ctx.save();ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();const sign=index===0?-1:1;const shift=s.linked?gap/2*sign:0;drawReflected(ctx,data.base,shift/normal,shift*slope/normal);ctx.restore();});
  const pixels=ctx.getImageData(0,0,w,h),dst=pixels.data;const line=s.ratio/100*w+slope*(s.anchorY??50)/100*h;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;const distance=Math.abs(x+.5+slope*(y+.5)-line)/normal;
   // In the seam only the person is restored; outside it a wider feathered
   // neighbourhood prevents duplicates and hard joins around the subject.
   const seam=Math.max(0,Math.min(1,gap/2+.5-distance));const a=(Math.max(data.shield[i+3],data.mask[i+3])*(1-seam)+data.mask[i+3]*seam)/255;
   if(a>0){for(let c=0;c<3;c++)dst[i+c]=dst[i+c]*(1-a)+data.pixels[i+c]*a;}dst[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);return {canvas:out,person};
 }
 return {detect,segmentAt,segmentVideo,detectFace,render,placement,clear(){prepared.clear();}};
})();
