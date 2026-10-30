'use strict';
// Validates the live-wallpaper payload modules/live.js sends through IPC before main.js writes
// anything to disk: video bytes, container type and the per-piece geometry for one monitor.
// Live wallpaper payload from modules/live.js: the video bytes and where each piece goes, validated before anything is written.
function checkLive(live){
 if(!live||typeof live!=='object')throw new Error('动态壁纸数据无效');
 const b=live.bytes,bytes=Buffer.isBuffer(b)?b:ArrayBuffer.isView(b)?Buffer.from(b.buffer,b.byteOffset,b.byteLength):b instanceof ArrayBuffer?Buffer.from(b):null;
 if(!bytes||!bytes.length)throw new Error('动态壁纸缺少视频数据');if(bytes.length>600*1024*1024)throw new Error('视频过大（最大 500 MB）');
 const ext={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'}[live.type]||'mp4',plan=live.plan,num=v=>typeof v==='number'&&Number.isFinite(v);
 if(!plan||!Number.isInteger(plan.width)||!Number.isInteger(plan.height)||plan.width<1||plan.height<1||plan.width>16384||plan.height>16384)throw new Error('动态壁纸几何无效');
 if(!/^#[0-9a-f]{6}$/i.test(plan.gapColor||''))throw new Error('动态壁纸间隙颜色无效');
 if(!Array.isArray(plan.pieces)||plan.pieces.length<1||plan.pieces.length>2)throw new Error('动态壁纸分块无效');
 const pieces=plan.pieces.map(p=>{if(!p||!Array.isArray(p.polygon)||p.polygon.length<3||p.polygon.length>128||!p.polygon.every(q=>Array.isArray(q)&&q.length===2&&q.every(num))||![p.x,p.y,p.w,p.h].every(num)||p.w<=0||p.h<=0)throw new Error('动态壁纸分块无效');return {polygon:p.polygon.map(([x,y])=>[x,y]),x:p.x,y:p.y,w:p.w,h:p.h};});
 return {bytes,ext,plan:{width:plan.width,height:plan.height,gapColor:plan.gapColor,pieces}};
}
// Video layers from modules/layers.js: up to 6 files, each with the frame and look layer.html paints it with.
// Returns [{bytes,ext,item}] where item holds only the checked numeric / enum fields (no bytes, no file path yet).
const BLENDS=['normal','multiply','screen','overlay','soft-light','lighten','darken','difference'],FITS=['cover','contain','fill'];
function checkClips(clips){
 if(clips==null)return [];if(!Array.isArray(clips))throw new Error('图层视频数据无效');if(clips.length>6)throw new Error('最多同时播放 6 个图层视频');
 const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 return clips.map(c=>{if(!c||typeof c!=='object')throw new Error('图层视频数据无效');
  const b=c.bytes,bytes=Buffer.isBuffer(b)?b:ArrayBuffer.isView(b)?Buffer.from(b.buffer,b.byteOffset,b.byteLength):b instanceof ArrayBuffer?Buffer.from(b):null;
  if(!bytes||!bytes.length)throw new Error('图层视频缺少数据');if(bytes.length>600*1024*1024)throw new Error('图层视频过大（最大 500 MB）');
  if(![c.x,c.y].every(v=>num(v,-1e5,1e5))||![c.w,c.h].every(v=>num(v,0.01,1e5))||!num(c.rotate,-360,360)||!num(c.opacity,0,100)||!num(c.blur,0,1e4)||!num(c.hue,-360,360)||!num(c.saturate,0,1000)||!num(c.brightness,0,1000)||!num(c.radius,0,1e5))throw new Error('图层视频几何无效');
  if(!BLENDS.includes(c.blend)||!FITS.includes(c.fit))throw new Error('图层视频样式无效');
  const ext={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'}[c.type]||'mp4';
  return {bytes,ext,item:{name:String(c.name||'视频').slice(0,80),x:c.x,y:c.y,w:c.w,h:c.h,rotate:c.rotate,flipX:c.flipX===true,opacity:c.opacity,blur:c.blur,hue:c.hue,saturate:c.saturate,brightness:c.brightness,radius:c.radius,blend:c.blend,fit:c.fit,above:c.above===true}};});
}
module.exports={checkLive,checkClips};
