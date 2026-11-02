'use strict';
// Per-frame person extraction for a live wallpaper, shared with the Windows desktop layer (client/windows/layer.html
// loads it over the loopback server together with portrait.js). The algorithm is the one modules/live.js runs in the
// preview: one segmentation per frame (384 px copy, VIDEO mode, monotonic timestamps), temporal smoothing against
// the previous mask, three alpha maps from one confidence field — person (tight, moving copy), cover (wider, hides the
// rim at the original spot), exclusion (widest, keeps the person out of the learned background) — and a background
// plate that starts as the inpainted still and drifts towards the live video wherever no person is.
(function(){
 function create({video,box,keepOriginal=false,segment,plate=null}){
  const lp={video,box,keepOriginal,segment,plateImage:plate,win:null,ps:1,personCanvas:document.createElement('canvas'),patchCanvas:document.createElement('canvas'),plate:null,scratch:null,maps:null,smooth:null,
   personReady:false,patchReady:false,plateReady:false,plateFrames:0,masks:0,maskMs:0,error:'',active:false,pumping:false,paused:false};
  // Capture window: the still's cut-out box widened by half its size on every side, in video pixels (≤ 1280 px canvases).
  lp.size=()=>{const v=video,b=box,x0=Math.max(0,b.x-b.w*.5),y0=Math.max(0,b.y-b.h*.5),x1=Math.min(1,b.x+b.w*1.5),y1=Math.min(1,b.y+b.h*1.5);
   const W={x:Math.floor(x0*v.videoWidth),y:Math.floor(y0*v.videoHeight)};W.w=Math.ceil(x1*v.videoWidth)-W.x;W.h=Math.ceil(y1*v.videoHeight)-W.y;
   lp.ps=Math.min(1,1280/Math.max(W.w,W.h));const cw=Math.max(1,Math.round(W.w*lp.ps)),ch=Math.max(1,Math.round(W.h*lp.ps));
   for(const c of [lp.personCanvas,lp.patchCanvas])if(c.width!==cw||c.height!==ch){c.width=cw;c.height=ch;lp.personReady=lp.patchReady=lp.plateReady=false;}
   lp.win=W;return W;};
  lp.applyMask=({width:mw,height:mh,values},frame)=>{
   const n=values.length;if(!lp.smooth||lp.smooth.length!==n)lp.smooth=new Float32Array(values);else{const sm=lp.smooth;for(let i=0;i<n;i++)sm[i]=sm[i]*.3+values[i]*.7;}
   const maps=lp.maps??={person:document.createElement('canvas'),cover:document.createElement('canvas'),exclude:document.createElement('canvas')};
   if(maps.person.width!==mw||maps.person.height!==mh){for(const k in maps){maps[k].width=mw;maps[k].height=mh;const d=maps[k].getContext('2d').createImageData(mw,mh);for(let i=0;i<d.data.length;i+=4)d.data[i]=d.data[i+1]=d.data[i+2]=255;maps[k].img=d;}}
   const dp=maps.person.img.data,dq=maps.cover.img.data,dx=maps.exclude.img.data,sm=lp.smooth,curve=(c,lo,span)=>{const t=Math.max(0,Math.min(1,(c-lo)/span));return Math.round(t*t*(3-2*t)*255);};
   for(let i=0;i<n;i++){const c=sm[i];dp[i*4+3]=curve(c,.4,.3);dq[i*4+3]=curve(c,.12,.28);dx[i*4+3]=curve(c,.04,.16);}
   for(const k in maps)maps[k].getContext('2d').putImageData(maps[k].img,0,0);
   const W=lp.win,ps=lp.ps,vw=frame.width*ps,vh=frame.height*ps,ox=-W.x*ps,oy=-W.y*ps;
   const mask=(ctx,map,blur)=>{ctx.globalCompositeOperation='destination-in';ctx.imageSmoothingQuality='high';ctx.filter=`blur(${blur}px)`;ctx.drawImage(map,ox,oy,vw,vh);ctx.filter='none';ctx.globalCompositeOperation='source-over';};
   const pc=lp.personCanvas,px=pc.getContext('2d');px.globalCompositeOperation='source-over';px.clearRect(0,0,pc.width,pc.height);px.drawImage(frame,ox,oy,vw,vh);mask(px,maps.person,.6);lp.personReady=true;
   if(lp.keepOriginal)return;
   const plate=lp.plate??=document.createElement('canvas'),scratch=lp.scratch??=document.createElement('canvas');
   if(plate.width!==pc.width||plate.height!==pc.height||!lp.plateReady){plate.width=scratch.width=pc.width;plate.height=scratch.height=pc.height;const b=plate.getContext('2d');b.globalCompositeOperation='source-over';if(lp.plateImage&&lp.plateImage.naturalWidth)b.drawImage(lp.plateImage,ox,oy,vw,vh);else b.drawImage(frame,ox,oy,vw,vh);lp.plateReady=true;lp.plateFrames=0;}
   const sx=scratch.getContext('2d');sx.globalCompositeOperation='source-over';sx.clearRect(0,0,scratch.width,scratch.height);sx.drawImage(frame,ox,oy,vw,vh);sx.globalCompositeOperation='destination-out';sx.imageSmoothingQuality='high';sx.filter='blur(4px)';sx.drawImage(maps.exclude,ox,oy,vw,vh);sx.filter='none';sx.globalCompositeOperation='source-over';
   const bx=plate.getContext('2d');bx.globalAlpha=lp.plateFrames<8?.6:.25;bx.drawImage(scratch,0,0);bx.globalAlpha=1;lp.plateFrames++;
   const qc=lp.patchCanvas,qx=qc.getContext('2d');qx.globalCompositeOperation='source-over';qx.clearRect(0,0,qc.width,qc.height);qx.drawImage(plate,0,0);mask(qx,maps.cover,2);lp.patchReady=true;};
  // One frame: grab it at full size, segment a 384 px copy, composite onto the full frame.
  lp.step=async()=>{const v=video;if(v.readyState<2||v.paused||!v.videoWidth)return false;if(!lp.win)lp.size();const t0=performance.now();let frame=null;
   try{frame=await createImageBitmap(v);const small=await createImageBitmap(frame,{resizeWidth:Math.min(384,frame.width),resizeQuality:'low'});const result=await segment(small,Math.round(t0));lp.applyMask(result,frame);lp.masks++;lp.maskMs=performance.now()-t0;return true;}
   catch(error){lp.error=error.message||'人物识别失败';lp.active=false;return false;}
   finally{frame?.close();}};
  lp.pump=async()=>{if(lp.pumping)return;lp.pumping=true;lp.active=true;try{while(lp.active){if(lp.paused||video.paused||video.readyState<2){await new Promise(r=>setTimeout(r,120));continue;}await lp.step();await new Promise(r=>requestAnimationFrame(r));}}finally{lp.pumping=false;}};
  lp.stop=()=>{lp.active=false;};
  // Cover the original spot: the patch over the capture window, mapped into a piece placement {x,y,w,h} of the full frame.
  lp.drawCover=(ctx,p)=>{if(!lp.patchReady||lp.keepOriginal)return;const W=lp.win,vw=video.videoWidth,vh=video.videoHeight;ctx.drawImage(lp.patchCanvas,p.x+W.x/vw*p.w,p.y+W.y/vh*p.h,W.w/vw*p.w,W.h/vh*p.h);};
  // A moving copy: the person canvas mapped so the cut box lands on the copy frame {left,top,w,h}, with the copy's look.
  lp.drawCopy=(ctx,copy,{shadow=false,width=1600}={})=>{if(!lp.personReady)return;const W=lp.win,b=box,vw=video.videoWidth,vh=video.videoHeight,sx=copy.w/b.w,sy=copy.h/b.h;
   const left=copy.left+(W.x/vw-b.x)*sx,top=copy.top+(W.y/vh-b.y)*sy,w=W.w/vw*sx,h=W.h/vh*sy,cx=copy.left+copy.w/2,cy=copy.top+copy.h/2;
   ctx.save();ctx.globalAlpha=(copy.opacity??100)/100;const f=[];if(copy.filter&&copy.filter!=='none')f.push(copy.filter);if(shadow)f.push(`drop-shadow(0 ${width*.005}px ${width*.006}px #0b182c59)`);if(f.length)ctx.filter=f.join(' ');
   ctx.translate(cx,cy);ctx.rotate((copy.rotate||0)*Math.PI/180);if(copy.flip)ctx.scale(-1,1);ctx.drawImage(lp.personCanvas,left-cx,top-cy,w,h);ctx.restore();};
  return lp;}
 const LivePerson={create};
 if(typeof module!=='undefined'&&module.exports)module.exports=LivePerson;if(typeof window!=='undefined')window.LivePerson=LivePerson;
})();
