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
 // Added points are unioned, removed points are cut out afterwards.
 async function combine(img,key,points){
  const w=img.naturalWidth,h=img.naturalHeight,masks=[];for(const p of points)masks.push(await pointMask(img,key,p));
  const mask=canvas(w,h),ctx=mask.getContext('2d',{willReadFrequently:true});
  ctx.globalCompositeOperation='lighter';points.forEach((p,i)=>{if(p.add)ctx.drawImage(masks[i],0,0,w,h);});
  ctx.globalCompositeOperation='destination-out';points.forEach((p,i)=>{if(!p.add)ctx.drawImage(masks[i],0,0,w,h);});
  const alpha=ctx.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1,count=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(alpha[(y*w+x)*4+3]>12){count++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  return {mask,coverage:count/(w*h),box:x1<0?null:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}};
 }
 // Push-pull fill: halve the holed image until it is tiny (canvas averages with
 // premultiplied alpha, so holes don't darken), then paint each coarser level
 // behind the finer one. Smooth, plausible colour; not texture synthesis.
 function fill(img,mask){
  const w=img.naturalWidth,h=img.naturalHeight,r=Math.max(4,Math.round(Math.max(w,h)*.014));
  const hole=canvas(w,h),hc=hole.getContext('2d',{willReadFrequently:true});hc.filter=`blur(${r}px)`;hc.drawImage(mask,0,0);hc.filter='none';
  const grown=hc.getImageData(0,0,w,h);for(let i=3;i<grown.data.length;i+=4)grown.data[i]=Math.min(255,grown.data[i]*3);hc.putImageData(grown,0,0);
  const base=canvas(w,h),bc=base.getContext('2d',{willReadFrequently:true});bc.drawImage(img,0,0);bc.globalCompositeOperation='destination-out';bc.drawImage(hole,0,0);
  const levels=[base];
  while(levels.at(-1).width>2||levels.at(-1).height>2){const p=levels.at(-1),c=canvas(Math.ceil(p.width/2),Math.ceil(p.height/2)),ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';ctx.drawImage(p,0,0,c.width,c.height);levels.push(c);}
  for(let i=levels.length-1;i>=1;i--){
   const c=levels[i],ctx=c.getContext('2d',{willReadFrequently:true}),d=ctx.getImageData(0,0,c.width,c.height);
   // Faint pixels carry badly quantised colour; let the coarser level supply them.
   for(let j=3;j<d.data.length;j+=4){if(d.data[j]>=32)d.data[j]=255;else if(i===levels.length-1){d.data[j-3]=d.data[j-2]=d.data[j-1]=128;d.data[j]=255;}else d.data[j]=0;}
   ctx.putImageData(d,0,0);if(i<levels.length-1){ctx.globalCompositeOperation='destination-over';ctx.drawImage(levels[i+1],0,0,c.width,c.height);}
  }
  // Blend the fill over a ring wider than the hole and add faint grain, so the
  // flat patch fades into the surrounding texture instead of showing a silhouette.
  const edge=canvas(w,h),ec=edge.getContext('2d',{willReadFrequently:true});ec.filter=`blur(${r*2}px)`;ec.drawImage(hole,0,0);ec.filter='none';
  const weight=ec.getImageData(0,0,w,h);for(let i=3;i<weight.data.length;i+=4)weight.data[i]=Math.min(255,weight.data[i]*2);ec.putImageData(weight,0,0);
  const patch=canvas(w,h),pc=patch.getContext('2d');pc.imageSmoothingQuality='high';pc.drawImage(levels[1]||base,0,0,w,h);pc.globalCompositeOperation='destination-in';pc.drawImage(edge,0,0);
  const out=canvas(w,h),oc=out.getContext('2d',{willReadFrequently:true});oc.drawImage(img,0,0);oc.drawImage(patch,0,0);
  const d=oc.getImageData(0,0,w,h);for(let i=0;i<d.data.length;i+=4){const a=weight.data[i+3];if(a){let x=(i>>2)+1;x^=x<<13;x^=x>>>17;x^=x<<5;const n=((x>>>0)%1024/1023-.5)*12*a/255;d.data[i]+=n;d.data[i+1]+=n;d.data[i+2]+=n;}}
  oc.putImageData(d,0,0);return out;
 }
 async function separate(img,key,points){
  const id=key+'|'+JSON.stringify(points);if(results.has(id))return results.get(id);
  const task=(async()=>{
   const {mask,box}=await combine(img,key,points);if(!box)return {empty:true};
   const cut=canvas(box.w,box.h),cc=cut.getContext('2d');cc.drawImage(img,-box.x,-box.y);cc.globalCompositeOperation='destination-in';cc.drawImage(mask,-box.x,-box.y);
   const background=fill(img,mask),[cutoutUrl,backgroundUrl]=await Promise.all([toUrl(cut,'image/png'),toUrl(background,'image/jpeg')]);
   const w=img.naturalWidth,h=img.naturalHeight;
   return {empty:false,cutout:cut,cutoutUrl,backgroundUrl,box:{x:box.x/w,y:box.y/h,w:box.w/w,h:box.h/h}};
  })();
  results.set(id,task);task.catch(()=>results.delete(id));
  while(results.size>3){const old=results.keys().next().value;results.get(old).then(r=>{if(!r.empty){URL.revokeObjectURL(r.cutoutUrl);URL.revokeObjectURL(r.backgroundUrl);}}).catch(()=>{});results.delete(old);}
  return task;
 }
 // First guess: the most central confident pixel of the selfie model's person mask.
 async function autoPoint(img,key){
  const person=await Portrait.detect(img,key);if(person.coverage<.005)return null;
  const m=person.mask,d=m.getContext('2d').getImageData(0,0,m.width,m.height).data;let sx=0,sy=0,n=0;
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)if(d[(y*m.width+x)*4+3]>200){sx+=x;sy+=y;n++;}
  if(!n)return null;const cx=sx/n,cy=sy/n;let best=null,bd=Infinity;
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)if(d[(y*m.width+x)*4+3]>200){const dd=(x-cx)**2+(y-cy)**2;if(dd<bd){bd=dd;best=[x,y];}}
  return {x:Math.round((best[0]+.5)/m.width*1000)/1000,y:Math.round((best[1]+.5)/m.height*1000)/1000,add:true};
 }
 return {combine,separate,autoPoint};
})();
