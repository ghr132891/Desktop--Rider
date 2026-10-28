'use strict';
// Floating person: click-selected mask, a transparent cutout and a background with
// the person's hole filled. Local only; preview and export share these canvases.
const Cutout = (()=>{
 const pointMasks=new Map(),results=new Map();
 function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
 function toUrl(c,type){return new Promise((resolve,reject)=>c.toBlob(blob=>blob?resolve(URL.createObjectURL(blob)):reject(new Error('人物图层生成失败')),type,.92));}
 function pointMask(img,key,p){
  const id=key+'|'+p.x+','+p.y;if(pointMasks.has(id))return pointMasks.get(id);
  const task=Portrait.segmentAt(img,p.x,p.y).then(r=>{const c=canvas(r.width,r.height),ctx=c.getContext('2d'),px=ctx.createImageData(r.width,r.height);
   for(let i=0;i<r.values.length;i++){const t=Math.max(0,Math.min(1,(r.values[i]-.35)/.3));px.data[i*4]=px.data[i*4+1]=px.data[i*4+2]=255;px.data[i*4+3]=Math.round(t*t*(3-2*t)*255);}
   ctx.putImageData(px,0,0);return c;});
  pointMasks.set(id,task);task.catch(()=>pointMasks.delete(id));while(pointMasks.size>32)pointMasks.delete(pointMasks.keys().next().value);return task;
 }
 // Box filter via summed-area table; cost independent of the radius.
 function boxBlur(src,w,h,r){
  const S=new Float64Array((w+1)*(h+1)),out=new Float32Array(w*h),W=w+1;
  for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=src[y*w+x];S[(y+1)*W+x+1]=S[y*W+x+1]+row;}}
  for(let y=0;y<h;y++){const y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);for(let x=0;x<w;x++){const x0=Math.max(0,x-r),x1=Math.min(w,x+r+1);out[y*w+x]=(S[y1*W+x1]-S[y0*W+x1]-S[y1*W+x0]+S[y0*W+x0])/((x1-x0)*(y1-y0));}}
  return out;
 }
 // Guided filter (He et al.): the model mask is a few hundred pixels wide, so its
 // upsampled edge is a blurry band. Using the picture's luminance as guide, the
 // alpha inside that band snaps to the real contour; hair and folds come through.
 // Solved at 1/4 resolution, applied at full resolution; sure inside/outside
 // pixels keep their value.
 const settings={refine:true,radius:.005,eps:.01,band:[20,235],gain:3};
 function refine(img,mask){
  const w=img.naturalWidth,h=img.naturalHeight,r=Math.max(6,Math.round(Math.max(w,h)*settings.radius)),s=4,sw=Math.ceil(w/s),sh=Math.ceil(h/s),rs=Math.max(1,Math.round(r/s)),eps=settings.eps,[lo,hi]=settings.band,gain=settings.gain;
  const pic=canvas(w,h),pc=pic.getContext('2d',{willReadFrequently:true});pc.drawImage(img,0,0);const px=pc.getImageData(0,0,w,h).data;
  const mc=mask.getContext('2d',{willReadFrequently:true}),md=mc.getImageData(0,0,w,h),ma=md.data;
  const I=new Float32Array(w*h),P=new Float32Array(w*h);for(let i=0;i<w*h;i++){I[i]=(px[i*4]*.299+px[i*4+1]*.587+px[i*4+2]*.114)/255;P[i]=ma[i*4+3]/255;}
  const Is=new Float32Array(sw*sh),Ps=new Float32Array(sw*sh),n=new Float32Array(sw*sh);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=((y/s)|0)*sw+((x/s)|0),i=y*w+x;Is[j]+=I[i];Ps[j]+=P[i];n[j]++;}
  for(let j=0;j<sw*sh;j++){Is[j]/=n[j];Ps[j]/=n[j];}
  const II=new Float32Array(sw*sh),IP=new Float32Array(sw*sh);for(let j=0;j<sw*sh;j++){II[j]=Is[j]*Is[j];IP[j]=Is[j]*Ps[j];}
  const mI=boxBlur(Is,sw,sh,rs),mP=boxBlur(Ps,sw,sh,rs),mII=boxBlur(II,sw,sh,rs),mIP=boxBlur(IP,sw,sh,rs),a=new Float32Array(sw*sh),b=new Float32Array(sw*sh);
  for(let j=0;j<sw*sh;j++){const v=mII[j]-mI[j]*mI[j],c=mIP[j]-mI[j]*mP[j];a[j]=c/(v+eps);b[j]=mP[j]-a[j]*mI[j];}
  const ma2=boxBlur(a,sw,sh,rs),mb2=boxBlur(b,sw,sh,rs);
  // Sure regions from the blurred mask: deep inside stays 1, far outside stays 0.
  const trimap=canvas(w,h),tc=trimap.getContext('2d',{willReadFrequently:true});tc.filter=`blur(${r}px)`;tc.drawImage(mask,0,0);tc.filter='none';const td=tc.getImageData(0,0,w,h).data;
  for(let y=0;y<h;y++){const fy=Math.min(sh-1,Math.max(0,(y+.5)/s-.5)),y0=fy|0,y1=Math.min(sh-1,y0+1),ty=fy-y0;
   for(let x=0;x<w;x++){const i=y*w+x,t=td[i*4+3];let q;
    if(t>=hi)q=1;else if(t<=lo)q=0;else{const fx=Math.min(sw-1,Math.max(0,(x+.5)/s-.5)),x0=fx|0,x1=Math.min(sw-1,x0+1),tx=fx-x0;
     const A=(ma2[y0*sw+x0]*(1-tx)+ma2[y0*sw+x1]*tx)*(1-ty)+(ma2[y1*sw+x0]*(1-tx)+ma2[y1*sw+x1]*tx)*ty,B=(mb2[y0*sw+x0]*(1-tx)+mb2[y0*sw+x1]*tx)*(1-ty)+(mb2[y1*sw+x0]*(1-tx)+mb2[y1*sw+x1]*tx)*ty;
     q=Math.max(0,Math.min(1,(A*I[i]+B-.5)*gain+.5));} // gain squeezes the halo of half-alpha background back to 0/1, thin strands keep theirs
    ma[i*4+3]=Math.round(q*255);}}
  mc.putImageData(md,0,0);
 }
 // Added points are unioned, removed points are cut out afterwards.
 async function combine(img,key,points){
  const w=img.naturalWidth,h=img.naturalHeight,masks=[];for(const p of points)masks.push(await pointMask(img,key,p));
  const mask=canvas(w,h),ctx=mask.getContext('2d',{willReadFrequently:true});
  ctx.globalCompositeOperation='lighter';points.forEach((p,i)=>{if(p.add)ctx.drawImage(masks[i],0,0,w,h);});
  ctx.globalCompositeOperation='destination-out';points.forEach((p,i)=>{if(!p.add)ctx.drawImage(masks[i],0,0,w,h);});
  ctx.globalCompositeOperation='source-over';if(settings.refine&&points.some(p=>p.add))refine(img,mask);
  const alpha=ctx.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1,count=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(alpha[(y*w+x)*4+3]>12){count++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  return {mask,coverage:count/(w*h),box:x1<0?null:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}};
 }
 let worker,nextJob=0;const jobs=new Map();
 function inpaintWorker(){if(worker)return worker;worker=new Worker('inpaint-worker.js');
  worker.onmessage=({data})=>{const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);data.error?job.reject(new Error(data.error)):job.resolve(data.pixels);};
  worker.onerror=()=>{worker.terminate();worker=null;for(const job of jobs.values())job.reject(new Error('背景补全失败，请重试'));jobs.clear();};return worker;}
 // Hole = the person grown by a soft ring (shadows, hair halo). Inside it texture is
 // rebuilt from the rest of the picture in a worker; the ring blends back to the original.
 async function fill(img,mask){
  const w=img.naturalWidth,h=img.naturalHeight,r=Math.max(4,Math.round(Math.max(w,h)*.01));
  const hole=canvas(w,h),hc=hole.getContext('2d',{willReadFrequently:true});hc.filter=`blur(${r}px)`;hc.drawImage(mask,0,0);hc.filter='none';
  const grown=hc.getImageData(0,0,w,h).data,alpha=new Uint8Array(w*h);for(let i=0;i<alpha.length;i++)alpha[i]=Math.min(255,grown[i*4+3]*3);
  const out=canvas(w,h),oc=out.getContext('2d',{willReadFrequently:true});oc.drawImage(img,0,0);const original=oc.getImageData(0,0,w,h);
  const filled=await new Promise((resolve,reject)=>{const id=++nextJob,pixels=new Uint8ClampedArray(original.data);jobs.set(id,{resolve,reject});inpaintWorker().postMessage({id,pixels,alpha,width:w,height:h},[pixels.buffer]);});
  const d=original.data;for(let i=0;i<alpha.length;i++){const a=alpha[i]/255;if(a)for(let c=0;c<3;c++)d[i*4+c]=d[i*4+c]*(1-a)+filled[i*4+c]*a;}
  oc.putImageData(original,0,0);return out;
 }
 async function separate(img,key,points){
  const id=key+'|'+JSON.stringify(points);if(results.has(id))return results.get(id);
  const task=(async()=>{
   const {mask,box}=await combine(img,key,points);if(!box)return {empty:true};
   const cut=canvas(box.w,box.h),cc=cut.getContext('2d');cc.drawImage(img,-box.x,-box.y);cc.globalCompositeOperation='destination-in';cc.drawImage(mask,-box.x,-box.y);
   const background=await fill(img,mask),[cutoutUrl,backgroundUrl]=await Promise.all([toUrl(cut,'image/png'),toUrl(background,'image/jpeg')]);
   const w=img.naturalWidth,h=img.naturalHeight;
   return {empty:false,cutout:cut,cutoutUrl,backgroundUrl,box:{x:box.x/w,y:box.y/h,w:box.w/w,h:box.h/h}};
  })();
  results.set(id,task);task.catch(()=>results.delete(id));
  while(results.size>3){const old=results.keys().next().value;results.get(old).then(r=>{if(!r.empty){URL.revokeObjectURL(r.cutoutUrl);URL.revokeObjectURL(r.backgroundUrl);}}).catch(()=>{});results.delete(old);}
  return task;
 }
 // First guess: the most central confident pixel of the selfie model's person mask.
 async function autoPoint(img,key){
  const person=await Portrait.detect(img,key);if(person.coverage<.01)return null; // below 1% the selfie model fires on lily pads and arches
  const m=person.mask,d=m.getContext('2d').getImageData(0,0,m.width,m.height).data;let sx=0,sy=0,n=0;
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)if(d[(y*m.width+x)*4+3]>200){sx+=x;sy+=y;n++;}
  if(!n)return null;const cx=sx/n,cy=sy/n;let best=null,bd=Infinity;
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)if(d[(y*m.width+x)*4+3]>200){const dd=(x-cx)**2+(y-cy)**2;if(dd<bd){bd=dd;best=[x,y];}}
  return {x:Math.round((best[0]+.5)/m.width*1000)/1000,y:Math.round((best[1]+.5)/m.height*1000)/1000,add:true};
 }
 return {combine,separate,autoPoint,settings};
})();
