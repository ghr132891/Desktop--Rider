'use strict';
// Reads Wallpaper Engine workshop folders the user picks (directory input).
// scene.pkg is parsed locally: PKGV entry table → TEXV textures → embedded
// PNG/JPEG or raw RGBA of the largest layers. Nothing leaves this machine.
const WallpaperEngine = (()=>{
 const decoder=new TextDecoder();
 function reader(buffer){
  const view=new DataView(buffer),bytes=new Uint8Array(buffer);let o=0;
  const need=n=>{if(n<0||o+n>bytes.length)throw new RangeError('truncated');};
  return {get offset(){return o;},
   i32(){need(4);const v=view.getInt32(o,true);o+=4;return v;},
   str(){const n=this.i32();need(n);const s=decoder.decode(bytes.subarray(o,o+n));o+=n;return s;},
   cstr(){let e=o;while(e<bytes.length&&bytes[e])e++;need(e-o+1);const s=decoder.decode(bytes.subarray(o,e));o=e+1;return s;},
   bytes(n){need(n);const b=bytes.subarray(o,o+n);o+=n;return b;}};
 }
 function lz4Block(src,size){
  const dst=new Uint8Array(size);let i=0,o=0;
  while(i<src.length){const token=src[i++];let lit=token>>4;if(lit===15){let b;do{b=src[i++];lit+=b;}while(b===255);}
   dst.set(src.subarray(i,i+lit),o);i+=lit;o+=lit;if(i>=src.length)break;
   const off=src[i]|src[i+1]<<8;i+=2;let len=token&15;if(len===15){let b;do{b=src[i++];len+=b;}while(b===255);}len+=4;
   if(!off||off>o)throw new Error('LZ4 数据损坏');for(let k=0;k<len;k++,o++)dst[o]=dst[o-off];}
  return dst;
 }
 const kinds={scene:'场景',video:'视频',web:'网页',application:'程序',image:'图片'};
 // Files from a File System Access directory handle, with paths relative to it.
 async function fromDirectoryHandle(handle,prefix=handle.name+'/',out=[]){
  for await(const [name,entry] of handle.entries()){if(entry.kind==='file')out.push({file:await entry.getFile(),path:prefix+name});else if(!name.startsWith('.'))await fromDirectoryHandle(entry,prefix+name+'/',out);}
  return out;
 }
 // Files from a drop: folders are walked through webkitGetAsEntry; plain files pass through.
 async function fromDataTransfer(dt){
  const entries=[...dt.items||[]].map(item=>item.webkitGetAsEntry?.()).filter(Boolean);if(!entries.length)return [...dt.files];
  const out=[];const walk=(entry,prefix)=>new Promise(resolve=>{
   if(entry.isFile)return entry.file(file=>{out.push({file,path:prefix+entry.name});resolve();},()=>resolve());
   const reader=entry.createReader(),batch=()=>reader.readEntries(async list=>{if(!list.length)return resolve();for(const e of list)await walk(e,prefix+entry.name+'/');batch();},()=>resolve());batch();});
  for(const entry of entries)await walk(entry,'');return out;
 }
 // Group picked files by the folders that contain a project.json. Accepts a FileList,
 // Files, or {file,path} entries from the helpers above.
 async function scan(fileList){
  const files=[...fileList].map(x=>x instanceof File?{file:x,path:x.webkitRelativePath||x.name}:x);
  const roots=new Set(files.filter(x=>x.path.split('/').pop().toLowerCase()==='project.json').map(x=>x.path.slice(0,-'project.json'.length)));
  if(!roots.size)return loose(files);
  const groups=new Map([...roots].map(r=>[r,new Map()]));
  for(const x of files){const parts=x.path.split('/');for(let k=parts.length-1;k>=0;k--){const prefix=parts.slice(0,k).join('/')+(k?'/':'');if(roots.has(prefix)){groups.get(prefix).set(parts.slice(k).join('/').toLowerCase(),x.file);break;}}}
  const items=[];
  for(const [root,map] of groups){
   try{const project=JSON.parse(await map.get('project.json').text());const type=String(project.type||'').toLowerCase();
    const pick=name=>typeof name==='string'?map.get(name.replace(/\\/g,'/').toLowerCase()):undefined;
    items.push({id:root.split('/').filter(Boolean).pop()||'wallpaper',title:String(project.title||'未命名壁纸').slice(0,80),type,kind:kinds[type]||type||'未知',files:map,
     main:pick(project.file),preview:pick(project.preview)||map.get('preview.jpg')||map.get('preview.gif')||map.get('preview.png')});
   }catch{}
  }
  return items.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
 }
 // No project.json among the picked files: treat them as one wallpaper, named after
 // its scene package, video or picture.
 function loose(files){
  const map=new Map(files.map(x=>[x.path.split('/').pop().toLowerCase(),x.file])),names=[...map.keys()];
  const pkg=names.find(n=>n.endsWith('.pkg')),video=[...map.values()].find(f=>/^video\//.test(f.type)||/\.(mp4|webm|mov|m4v)$/i.test(f.name)),image=[...map.values()].find(f=>/^image\//.test(f.type));
  if(pkg&&pkg!=='scene.pkg')map.set('scene.pkg',map.get(pkg));
  const type=pkg?'scene':video?'video':image?'image':'';if(!type)return [];
  const lead=pkg?map.get(pkg):video||image;
  return [{id:'picked',title:lead.name.replace(/\.[^.]+$/,'').slice(0,80)||'所选文件',type,kind:kinds[type],files:map,main:video,preview:image}];
 }
 async function pkgEntries(file){
  for(let size=Math.min(file.size,1<<16);;size=Math.min(file.size,size*4)){
   try{const r=reader(await file.slice(0,size).arrayBuffer());const magic=r.str();if(!magic.startsWith('PKGV'))throw new Error('不是 Wallpaper Engine 场景包');
    const count=r.i32();if(count<0||count>100000)throw new Error('场景包目录损坏');const entries=[];
    for(let i=0;i<count;i++)entries.push({name:r.str(),offset:r.i32(),length:r.i32()});
    return entries.map(e=>({...e,offset:e.offset+r.offset}));
   }catch(error){if(!(error instanceof RangeError)||size>=file.size)throw error;}
  }
 }
 function texHeader(r){
  if(!r.cstr().startsWith('TEXV'))throw new Error('不是纹理');r.cstr();
  const format=r.i32(),flags=r.i32();r.i32();r.i32();const width=r.i32(),height=r.i32();r.i32();
  const container=r.cstr(),images=r.i32();let fif=-1;if(container==='TEXB0003'||container==='TEXB0004')fif=r.i32();if(container==='TEXB0004')r.i32();
  return {format,flags,width,height,container,images,fif};
 }
 // Wallpaper Engine texture formats 4/6/7 = DXT5/DXT3/DXT1 (BC3/BC2/BC1), 4×4 blocks.
 const dxts={4:16,6:16,7:8};
 function dxt(data,w,h,format){
  const bw=Math.ceil(w/4),bh=Math.ceil(h/4),size=dxts[format];if(data.length<bw*bh*size)return null;
  const out=new Uint8ClampedArray(w*h*4),alpha=new Uint8Array(16).fill(255),pal=new Float32Array(8),col=new Float32Array(16);
  for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++){let o=(by*bw+bx)*size;
   if(format===6){for(let i=0;i<16;i++)alpha[i]=(data[o+(i>>1)]>>((i&1)*4)&15)*17;o+=8;}
   else if(format===4){const a0=data[o],a1=data[o+1];pal[0]=a0;pal[1]=a1;for(let i=2;i<8;i++)pal[i]=a0>a1?((8-i)*a0+(i-1)*a1)/7:i<6?((6-i)*a0+(i-1)*a1)/5:i===6?0:255;
    const lo=data[o+2]|data[o+3]<<8|data[o+4]<<16,hi=data[o+5]|data[o+6]<<8|data[o+7]<<16;for(let i=0;i<16;i++)alpha[i]=pal[(i<8?lo>>3*i:hi>>3*(i-8))&7];o+=8;}
   const c0=data[o]|data[o+1]<<8,c1=data[o+2]|data[o+3]<<8,bits=(data[o+4]|data[o+5]<<8|data[o+6]<<16|data[o+7]<<24)>>>0,four=format!==7||c0>c1;
   for(const [k,c] of [[0,c0],[1,c1]]){col[k*4]=(c>>11&31)*255/31;col[k*4+1]=(c>>5&63)*255/63;col[k*4+2]=(c&31)*255/31;col[k*4+3]=255;}
   for(let j=0;j<3;j++){col[8+j]=four?(2*col[j]+col[4+j])/3:(col[j]+col[4+j])/2;col[12+j]=four?(col[j]+2*col[4+j])/3:0;}col[11]=255;col[15]=four?255:0;
   for(let i=0;i<16;i++){const x=bx*4+(i&3),y=by*4+(i>>2);if(x>=w||y>=h)continue;const k=(bits>>>2*i&3)*4,p=(y*w+x)*4;
    out[p]=col[k];out[p+1]=col[k+1];out[p+2]=col[k+2];out[p+3]=format===7?col[k+3]:alpha[i];}
  }
  return out;
 }
 const sniff=b=>b[0]===0xff&&b[1]===0xd8?'image/jpeg':b[0]===0x89&&b[1]===0x50?'image/png':b[0]===0x47&&b[1]===0x49?'image/gif':b[0]===0x52&&b[8]===0x57?'image/webp':'';
 async function texImage(file,entry){
  const r=reader(await file.slice(entry.offset,entry.offset+entry.length).arrayBuffer()),head=texHeader(r);
  r.i32();const mw=r.i32(),mh=r.i32();let lz4=0,raw=0;if(head.container!=='TEXB0001'){lz4=r.i32();raw=r.i32();}
  let data=r.bytes(r.i32());if(lz4)data=lz4Block(data,raw);
  const type=sniff(data);if(type)return new Blob([data],{type});
  const rgba=head.format===0?(data.length>=mw*mh*4?new Uint8ClampedArray(data.buffer,data.byteOffset,mw*mh*4):null):dxts[head.format]?dxt(data,mw,mh,head.format):null;
  if(!rgba)return null; // RG88 / R8 masks are skipped
  const c=document.createElement('canvas');c.width=head.width;c.height=head.height;c.getContext('2d').putImageData(new ImageData(rgba,mw,mh),0,0);
  return new Promise(resolve=>c.toBlob(resolve,'image/png'));
 }
 // Large picture layers only: masks, effects, particles and sprite sheets are noise.
 async function sceneLayers(item,limit=6){
  const file=item.files.get('scene.pkg');if(!file)return [];
  const entries=(await pkgEntries(file)).filter(e=>/\.tex$/i.test(e.name)&&!/(^|\/)(masks|effects|particles?|workshop)\//i.test(e.name));
  const heads=[];
  for(const e of entries){try{const head=texHeader(reader(await file.slice(e.offset,e.offset+Math.min(e.length,256)).arrayBuffer()));if(!(head.flags&4)&&head.images>0)heads.push({entry:e,head,area:head.width*head.height});}catch{}}
  heads.sort((a,b)=>b.area-a.area);const largest=heads[0]?.area||0,layers=[];
  for(const {entry,head,area} of heads.filter(x=>x.area>=largest*.15&&x.area>=256*256).slice(0,limit)){
   try{const blob=await texImage(file,entry);if(blob)layers.push({name:entry.name.split('/').pop().replace(/\.tex$/i,''),width:head.width,height:head.height,blob});}catch{}
  }
  return layers;
 }
 // scene.json may embed scripts with raw control characters; strings in it are also
 // "x y z" vectors, numbers, or {user,value} property bindings.
 const lenient=text=>JSON.parse(text.replace(/[\u0000-\u001f]/g,' '));
 const vec=(v,n)=>typeof v==='string'?v.trim().split(/\s+/).map(Number):Array.isArray(v)?v:typeof v==='number'?Array(n).fill(v):null;
 const flag=v=>v&&typeof v==='object'?v.value!==false:v!==false;
 // Image objects in paint order with their textures and placement on the scene canvas.
 // Particles, text, sounds, effects and util compose layers are not pictures and are skipped.
 async function sceneObjects(item){
  const file=item.files.get('scene.pkg');if(!file)return null;
  const byName=new Map((await pkgEntries(file)).map(e=>[e.name.toLowerCase(),e]));
  const read=async name=>{const e=byName.get(name.toLowerCase());return e?lenient(decoder.decode(await file.slice(e.offset,e.offset+e.length).arrayBuffer())):null;};
  const scene=await read('scene.json');if(!scene)return null;
  const proj=scene.general?.orthogonalprojection||{},width=+proj.width||1920,height=+proj.height||1080,eye=vec(scene.camera?.eye,3)||[0,0,0],clear=vec(scene.general?.clearcolor,3)||[0,0,0],objects=[];
  for(const ob of scene.objects||[]){
   if(typeof ob.image!=='string'||!flag(ob.visible)||/^models\/util\//i.test(ob.image))continue;
   try{const model=await read(ob.image),material=model?.material&&await read(model.material),tex=material?.passes?.[0]?.textures?.find(t=>typeof t==='string'),entry=tex&&byName.get(('materials/'+tex+'.tex').toLowerCase());if(!entry)continue;
    const origin=vec(ob.origin,3)||[width/2,height/2,0],scale=vec(ob.scale,3)||[1,1,1],size=vec(ob.size,2),angles=vec(ob.angles,3)||[0,0,0];
    objects.push({entry,x:origin[0]-eye[0],y:height-(origin[1]-eye[1]),w:size&&size[0]*scale[0],h:size&&size[1]*scale[1],scale,angle:angles[2]||0,alpha:typeof ob.alpha==='number'?ob.alpha:1});
   }catch{}
  }
  return {width,height,clear,objects};
 }
 // Flat picture of the scene: every image object drawn at its place, static.
 async function composeScene(item,maxSide=4096){
  const info=await sceneObjects(item);if(!info||info.objects.length<2)return null;
  const k=Math.min(1,maxSide/Math.max(info.width,info.height)),c=document.createElement('canvas');c.width=Math.round(info.width*k);c.height=Math.round(info.height*k);
  const ctx=c.getContext('2d');ctx.fillStyle=`rgb(${info.clear.map(v=>Math.round(v*255)).join(',')})`;ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingQuality='high';
  const file=item.files.get('scene.pkg');let drawn=0,x0=c.width,y0=c.height,x1=0,y1=0;
  for(const o of info.objects){try{const blob=await texImage(file,o.entry);if(!blob)continue;const bmp=await createImageBitmap(blob);
   const w=(o.w??bmp.width*o.scale[0])*k,h=(o.h??bmp.height*o.scale[1])*k,cx=o.x*k,cy=o.y*k;ctx.save();ctx.globalAlpha=o.alpha;ctx.translate(cx,cy);ctx.rotate(-o.angle*Math.PI/180);ctx.drawImage(bmp,-w/2,-h/2,w,h);ctx.restore();bmp.close();drawn++;
   x0=Math.min(x0,cx-w/2);y0=Math.min(y0,cy-h/2);x1=Math.max(x1,cx+w/2);y1=Math.max(y1,cy+h/2);}catch{}}
  if(drawn<2)return null;
  // A panned camera can leave a sliver of clear colour along one edge; trim it when
  // the layers cover almost the whole canvas, otherwise keep the author's framing.
  x0=Math.max(0,Math.round(x0));y0=Math.max(0,Math.round(y0));x1=Math.min(c.width,Math.round(x1));y1=Math.min(c.height,Math.round(y1));
  let out=c;if((x1-x0)*(y1-y0)>=c.width*c.height*.95&&(x0||y0||x1<c.width||y1<c.height)){out=document.createElement('canvas');out.width=x1-x0;out.height=y1-y0;out.getContext('2d').drawImage(c,-x0,-y0);}
  return {blob:await new Promise(resolve=>out.toBlob(resolve,'image/jpeg',.95)),width:out.width,height:out.height,count:drawn};
 }
 return {scan,fromDirectoryHandle,fromDataTransfer,sceneLayers,sceneObjects,composeScene,lz4Block,dxt};
})();
