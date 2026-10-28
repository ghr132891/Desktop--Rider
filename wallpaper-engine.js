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
 const kinds={scene:'场景',video:'视频',web:'网页',application:'程序'};
 // Group picked files by the folders that contain a project.json.
 async function scan(fileList){
  const files=[...fileList].map(file=>({file,path:file.webkitRelativePath||file.name}));
  const roots=new Set(files.filter(x=>x.path.split('/').pop().toLowerCase()==='project.json').map(x=>x.path.slice(0,-'project.json'.length)));
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
 const sniff=b=>b[0]===0xff&&b[1]===0xd8?'image/jpeg':b[0]===0x89&&b[1]===0x50?'image/png':b[0]===0x47&&b[1]===0x49?'image/gif':b[0]===0x52&&b[8]===0x57?'image/webp':'';
 async function texImage(file,entry){
  const r=reader(await file.slice(entry.offset,entry.offset+entry.length).arrayBuffer()),head=texHeader(r);
  r.i32();const mw=r.i32(),mh=r.i32();let lz4=0,raw=0;if(head.container!=='TEXB0001'){lz4=r.i32();raw=r.i32();}
  let data=r.bytes(r.i32());if(lz4)data=lz4Block(data,raw);
  const type=sniff(data);if(type)return new Blob([data],{type});
  if(head.format!==0||data.length<mw*mh*4)return null; // DXT and single-channel masks are skipped
  const c=document.createElement('canvas');c.width=head.width;c.height=head.height;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer,data.byteOffset,mw*mh*4),mw,mh),0,0);
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
 return {scan,sceneLayers,lz4Block};
})();
