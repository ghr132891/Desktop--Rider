'use strict';
// Exemplar-based hole filling: multi-scale PatchMatch + weighted voting (Wexler et al.).
// Copies real texture from the rest of the picture instead of smearing colour into
// the hole. Coarse levels run full EM; large levels only refine the upsampled match.
const R=3,WORK=640*640;
let seed=1;const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
function down(l){
 const w=Math.ceil(l.w/2),h=Math.ceil(l.h/2),rgb=new Float32Array(w*h*3),hole=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let n=0,a=0,b=0,c=0,any=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const i=Math.min(l.h-1,y*2+dy)*l.w+Math.min(l.w-1,x*2+dx);if(l.hole[i]){any=1;continue;}a+=l.rgb[i*3];b+=l.rgb[i*3+1];c+=l.rgb[i*3+2];n++;}
  const j=y*w+x;hole[j]=any;if(n){rgb[j*3]=a/n;rgb[j*3+1]=b/n;rgb[j*3+2]=c/n;}}
 return {w,h,rgb,hole};
}
function boxSum(l){const {w,h,hole}=l,W=w+1,S=new Int32Array(W*(h+1));for(let y=0;y<h;y++)for(let x=0;x<w;x++)S[(y+1)*W+x+1]=hole[y*w+x]+S[y*W+x+1]+S[(y+1)*W+x]-S[y*W+x];
 return (x0,y0,x1,y1)=>{x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(w,x1);y1=Math.min(h,y1);return S[y1*W+x1]-S[y0*W+x1]-S[y1*W+x0]+S[y0*W+x0];};}
// Sources: whole patch inside the image and untouched by the hole. Targets: patches overlapping it.
function regions(l){
 const {w,h}=l,sum=boxSum(l),ok=new Uint8Array(w*h),src=[],targets=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=sum(x-R,y-R,x+R+1,y+R+1);if(n)targets.push(y*w+x);else if(x>=R&&y>=R&&x<w-R&&y<h-R){ok[y*w+x]=1;src.push(y*w+x);}}
 return {ok,src:Int32Array.from(src),targets:Int32Array.from(targets)};
}
function dist(l,rgb,px,py,s,best){
 const {w,h}=l,sx=s%w,sy=(s/w)|0;let d=0;
 for(let dy=-R;dy<=R;dy++){const ty=py+dy;if(ty<0||ty>=h)continue;const tr=ty*w,sr=(sy+dy)*w+sx;
  for(let dx=-R;dx<=R;dx++){const tx=px+dx;if(tx<0||tx>=w)continue;const a=(tr+tx)*3,b=(sr+dx)*3,e0=rgb[a]-rgb[b],e1=rgb[a+1]-rgb[b+1],e2=rgb[a+2]-rgb[b+2];d+=e0*e0+e1*e1+e2*e2;}
  if(d>=best)return d;}
 return d;
}
function patchmatch(l,rgb,reg,nnf,nd,iters,radius){
 const {w,h}=l,{ok,targets}=reg,n=w*h;
 for(const t of targets)nd[t]=dist(l,rgb,t%w,(t/w)|0,nnf[t],Infinity);
 for(let it=0;it<iters;it++){const step=it&1?-1:1;
  for(let k=step>0?0:targets.length-1;k>=0&&k<targets.length;k+=step){
   const t=targets[k],px=t%w,py=(t/w)|0;let best=nd[t],bs=nnf[t];
   const consider=s=>{if(s<0||s>=n||s===bs||!ok[s])return;const d=dist(l,rgb,px,py,s,best);if(d<best){best=d;bs=s;}};
   const nx=px-step;if(nx>=0&&nx<w&&nnf[t-step]>=0){const c=nnf[t-step]+step;if(((c/w)|0)===((nnf[t-step]/w)|0))consider(c);}
   const ny=py-step;if(ny>=0&&ny<h&&nnf[t-step*w]>=0)consider(nnf[t-step*w]+step*w);
   const sx=bs%w,sy=(bs/w)|0;for(let r=radius;r>=1;r>>=1){const x=sx+Math.round((rand()*2-1)*r),y=sy+Math.round((rand()*2-1)*r);if(x>=0&&y>=0&&x<w&&y<h)consider(y*w+x);}
   nnf[t]=bs;nd[t]=best;}
 }
}
// Each hole pixel averages what the patches covering it propose; good matches count more.
function vote(l,reg,nnf,nd,sharp){
 if(sharp){const {rgb,hole}=l;for(const t of reg.targets)if(hole[t]){const s=nnf[t];rgb[t*3]=rgb[s*3];rgb[t*3+1]=rgb[s*3+1];rgb[t*3+2]=rgb[s*3+2];}return;}
 const {w,h,rgb,hole}=l,{targets}=reg,acc=new Float32Array(w*h*4),sorted=Float32Array.from(targets,t=>nd[t]).sort(),sigma=2*(sorted[Math.floor(sorted.length*.5)]||1)+1e-6;
 for(const t of targets){const px=t%w,py=(t/w)|0,s=nnf[t],sx=s%w,sy=(s/w)|0,wt=Math.exp(-nd[t]/sigma)+1e-4;
  for(let dy=-R;dy<=R;dy++){const ty=py+dy;if(ty<0||ty>=h)continue;
   for(let dx=-R;dx<=R;dx++){const tx=px+dx;if(tx<0||tx>=w)continue;const q=ty*w+tx;if(!hole[q])continue;const b=((sy+dy)*w+sx+dx)*3;
    acc[q*4]+=rgb[b]*wt;acc[q*4+1]+=rgb[b+1]*wt;acc[q*4+2]+=rgb[b+2]*wt;acc[q*4+3]+=wt;}}}
 for(let q=0;q<w*h;q++){const a=acc[q*4+3];if(a){rgb[q*3]=acc[q*4]/a;rgb[q*3+1]=acc[q*4+1]/a;rgb[q*3+2]=acc[q*4+2]/a;}}
}
// Coarsest start: peel the hole from its border inwards with neighbour averages.
function diffuse(l){
 const {w,h,rgb,hole}=l,known=Uint8Array.from(hole,v=>v?0:1);let left=hole.reduce((a,v)=>a+v,0);
 while(left>0){const next=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(known[i])continue;let n=0,a=0,b=0,c=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=w||Y>=h)continue;const j=Y*w+X;if(!known[j])continue;a+=rgb[j*3];b+=rgb[j*3+1];c+=rgb[j*3+2];n++;}
   if(n)next.push(i,a/n,b/n,c/n);}
  if(!next.length)break;for(let k=0;k<next.length;k+=4){const i=next[k];rgb[i*3]=next[k+1];rgb[i*3+1]=next[k+2];rgb[i*3+2]=next[k+3];known[i]=1;left--;}}
}
function inpaint(pixels,alpha,w,h){
 seed=0x9e3779b9;
 const rgb=new Float32Array(w*h*3),hole=new Uint8Array(w*h);for(let i=0;i<w*h;i++){rgb[i*3]=pixels[i*4];rgb[i*3+1]=pixels[i*4+1];rgb[i*3+2]=pixels[i*4+2];hole[i]=alpha[i]?1:0;}
 const levels=[{w,h,rgb,hole}];while(Math.max(levels.at(-1).w,levels.at(-1).h)>48)levels.push(down(levels.at(-1)));
 const regs=levels.map(regions);let start=levels.length-1;while(start>0&&regs[start].src.length<64)start--;
 if(!regs[start].src.length){diffuse(levels[0]);return levels[0].rgb;}
 diffuse(levels[start]);let prev=null;
 for(let L=start;L>=0;L--){
  const l=levels[L],reg=regs[L],nnf=new Int32Array(l.w*l.h).fill(-1),nd=new Float32Array(l.w*l.h),{src,ok,targets}=reg;
  if(!targets.length)break;
  for(const t of targets){let s=-1;
   if(prev){const x=t%l.w,y=(t/l.w)|0,c=prev.nnf[Math.min(prev.l.h-1,y>>1)*prev.l.w+Math.min(prev.l.w-1,x>>1)];
    if(c>=0){const cs=Math.min(l.w-1,(c%prev.l.w)*2+(x&1)),ct=Math.min(l.h-1,((c/prev.l.w)|0)*2+(y&1)),u=ct*l.w+cs;if(ok[u])s=u;}}
   nnf[t]=s>=0?s:src[(rand()*src.length)|0];}
  // The hole starts as the upsampled coarse result, which is blurrier than real
  // texture. First match against equally blurred sources, then copy sharp pixels.
  let guide=l.rgb;
  if(prev){const p=prev.l;guide=new Float32Array(l.w*l.h*3);for(let q=0;q<l.w*l.h;q++){
   const fx=Math.min(p.w-1,Math.max(0,((q%l.w)+.5)/2-.5)),fy=Math.min(p.h-1,Math.max(0,(((q/l.w)|0)+.5)/2-.5)),x0=fx|0,y0=fy|0,x1=Math.min(p.w-1,x0+1),y1=Math.min(p.h-1,y0+1),ax=fx-x0,ay=fy-y0;
   for(let c=0;c<3;c++)guide[q*3+c]=(p.rgb[(y0*p.w+x0)*3+c]*(1-ax)+p.rgb[(y0*p.w+x1)*3+c]*ax)*(1-ay)+(p.rgb[(y1*p.w+x0)*3+c]*(1-ax)+p.rgb[(y1*p.w+x1)*3+c]*ax)*ay;
   if(l.hole[q])for(let c=0;c<3;c++)l.rgb[q*3+c]=guide[q*3+c];}}
  const small=l.w*l.h<=WORK,em=small?(L===start?6:4):2,radius=small?Math.max(l.w,l.h):8;
  for(let e=0;e<em;e++){patchmatch(l,e?l.rgb:guide,reg,nnf,nd,small?4:2,radius);vote(l,reg,nnf,nd,L===0&&e===em-1);}
  prev={l,nnf};
 }
 return levels[0].rgb;
}
self.onmessage=({data:{id,pixels,alpha,width,height}})=>{
 try{const rgb=inpaint(pixels,alpha,width,height);for(let i=0;i<width*height;i++)if(alpha[i]){pixels[i*4]=rgb[i*3];pixels[i*4+1]=rgb[i*3+1];pixels[i*4+2]=rgb[i*3+2];}
  self.postMessage({id,pixels},[pixels.buffer]);}
 catch(error){self.postMessage({id,error:String(error.message||error)});}
};
