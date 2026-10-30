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
// 桌面歌词 payload from modules/lyrics.js: lyrics-view.js style in px for the monitor plus the source; null when off.
const TRANSITIONS=['fade','slide','blur','emerge','none'],ALIGNS=['left','center','right'],PROVIDERS=['auto','netease','qq'],DISPLAYS=['single','karaoke','stage'];
function checkLyrics(l){
 if(l==null)return null;if(typeof l!=='object'||!l.style||typeof l.style!=='object')throw new Error('歌词数据无效');
 const st=l.style,src=l.source&&typeof l.source==='object'?l.source:{},num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,str=(v,n)=>typeof v==='string'?v.slice(0,n):'',len=v=>typeof v==='string'&&/^-?\d+(\.\d+)?(px|%)$/.test(v),hex=v=>/^#[0-9a-f]{6}$/i.test(v||'');
 if(![st.left,st.top,st.width].every(len)||!num(st.size,1,5000)||!num(st.weight,100,900)||!num(st.duration,0,10)||!num(st.nextOpacity,0,100)||!num(st.glow??0,0,100)||!num(st.backdrop??0,0,100)||!num(st.backdropBlur??12,0,100))throw new Error('歌词样式无效');
 if(!hex(st.color)||!hex(st.highlight||st.color)||!hex(st.strokeColor||'#000000')||!TRANSITIONS.includes(st.transition)||!ALIGNS.includes(st.align)||!DISPLAYS.includes(st.display||'single'))throw new Error('歌词样式无效');
 const offset=num(src.offset,-30,30)?src.offset:0;
 return {source:{mode:src.mode==='manual'?'manual':'auto',provider:PROVIDERS.includes(src.provider)?src.provider:'auto',query:str(src.query,120),lrc:str(src.lrc,60000),offset},
  style:{left:st.left,top:st.top,width:st.width,size:st.size,font:str(st.font,300)||'sans-serif',weight:st.weight,color:st.color.toLowerCase(),highlight:(st.highlight||st.color).toLowerCase(),glow:st.glow??0,stroke:st.stroke===true,strokeColor:(st.strokeColor||'#000000').toLowerCase(),shadow:st.shadow!==false,backdrop:st.backdrop??0,backdropBlur:st.backdropBlur??12,align:st.align,display:st.display||'single',stageLines:Number(st.stageLines)===5?5:3,transition:st.transition,duration:st.duration,next:st.next!==false,nextOpacity:st.nextOpacity,trans:st.trans!==false,interlude:st.interlude!==false,offset}};
}
// 萌版人物 payload from modules/mascot.js: rig (head / body PNG data URLs + geometry + face spots) and style in px.
function checkMascot(m){
 if(m==null)return null;if(typeof m!=='object'||!m.rig||typeof m.rig!=='object'||!m.style||typeof m.style!=='object')throw new Error('萌版人物数据无效');
 const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,png=v=>typeof v==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v)&&v.length<12*1024*1024,pt=p=>p&&num(p.x,-5,5)&&num(p.y,-5,5),len=v=>typeof v==='string'&&/^-?\d+(\.\d+)?(px|%)$/.test(v);
 const part=(p,pivot)=>{if(!p||!png(p.url)||![p.x,p.y,p.w,p.h].every(v=>num(v,-1e5,1e5))||p.w<=0||p.h<=0||(pivot&&!(p.pivot&&num(p.pivot.x,-1e5,1e5)&&num(p.pivot.y,-1e5,1e5))))throw new Error('萌版人物骨架无效');return {url:p.url,x:p.x,y:p.y,w:p.w,h:p.h,...(pivot?{pivot:{x:p.pivot.x,y:p.pivot.y}}:{})};};
 const r=m.rig,f=r.face||{};if(!num(r.width,1,1e5)||!num(r.height,1,1e5))throw new Error('萌版人物骨架无效');
 const face={eyes:Array.isArray(f.eyes)&&f.eyes.length===2&&f.eyes.every(pt)?f.eyes.map(p=>({x:p.x,y:p.y})):[{x:.36,y:.52},{x:.64,y:.52}],mouth:pt(f.mouth)?{x:f.mouth.x,y:f.mouth.y}:{x:.5,y:.74},blush:Array.isArray(f.blush)&&f.blush.length===2&&f.blush.every(pt)?f.blush.map(p=>({x:p.x,y:p.y})):[{x:.27,y:.64},{x:.73,y:.64}],size:num(f.size,.02,1)?f.size:.18,detected:f.detected===true};
 const st=m.style;if(!len(st.left)||!len(st.top)||!num(st.size,10,4000))throw new Error('萌版人物样式无效');
 const stickers=st.stickers&&typeof st.stickers==='object'?st.stickers:{},mo=st.mouthOffset&&typeof st.mouthOffset==='object'?st.mouthOffset:{};
 const phrases={};if(m.phrases&&typeof m.phrases==='object')for(const [k,v] of Object.entries(m.phrases))if(/^[a-z]{1,16}$/.test(k)&&Array.isArray(v))phrases[k]=v.filter(x=>typeof x==='string').map(x=>x.slice(0,80)).slice(0,20);
 return {rig:{head:part(r.head,true),body:part(r.body,false),width:r.width,height:r.height,face,params:r.params&&typeof r.params==='object'?{headScale:Number(r.params.headScale)||1.7,bodyScale:Number(r.params.bodyScale)||.78,bodySquash:Number(r.params.bodySquash)||.72}:{}},
  style:{left:st.left,top:st.top,size:st.size,flip:st.flip===true,shadow:st.shadow!==false,stickers:{blush:stickers.blush!==false,eyes:stickers.eyes===true,mouth:stickers.mouth===true},mouthOffset:{x:num(mo.x,-1,1)?mo.x:0,y:num(mo.y,-1,1)?mo.y:0},singBubble:st.singBubble!==false,idle:st.idle!==false,reactMusic:st.reactMusic!==false,onTop:st.onTop!==false},phrases};
}
module.exports={checkLive,checkClips,checkLyrics,checkMascot};
