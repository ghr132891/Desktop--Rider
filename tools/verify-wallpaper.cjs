const {chromium}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {PNG}=require('/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');
 const results=await page.evaluate(async()=>{
  // A coordinate-coded image exposes movement of the picture, not just its mask.
  const fixture=document.createElement('canvas');fixture.width=1600;fixture.height=1000;
  const cx=fixture.getContext('2d');const pixels=cx.createImageData(1600,1000);
  for(let y=0;y<1000;y++)for(let x=0;x<1600;x++){const i=(y*1600+x)*4;pixels.data[i]=x/1600*220;pixels.data[i+1]=y/1000*220;pixels.data[i+2]=80;pixels.data[i+3]=255;}cx.putImageData(pixels,0,0);
  const s={...clone(defaults),customImage:fixture.toDataURL(),mode:'vertical',ratio:50,gap:0};
  const at=(c,x,y)=>[...c.getContext('2d').getImageData(x,y,1,1).data];
  async function compare(linked){s.linked=linked;s.ratio=35;const a=await wallpaperCanvas(s);s.ratio=65;const b=await wallpaperCanvas(s);return {left:[at(a,100,500),at(b,100,500)],right:[at(a,1500,500),at(b,1500,500)]};}
  const follows=await compare(true),fixed=await compare(false);
  s.ratio=50;s.linked=true;const joined=(await wallpaperCanvas(s)).toDataURL();s.linked=false;const original=(await wallpaperCanvas(s)).toDataURL();
  let holes=0;
  for(const aspect of [1.6,16/9,4/3])for(const angle of [-40,40])for(const ratio of [25,75])for(const gap of [0,60]){
   Object.assign(s,{aspect,angle,ratio,gap,linked:true,mode:'diagonal',gapColor:'#ff00ff'});
   const c=await wallpaperCanvas(s,320),ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height).data;
   const slope=Math.tan(angle*Math.PI/180),normal=Math.hypot(1,slope);
   for(let y=2;y<c.height-2;y+=5)for(let x=2;x<c.width-2;x+=5){
    const distance=Math.abs((x+.5)-ratio/100*c.width+slope*(y+.5-c.height/2))/normal;
    if(distance<gap*c.width/1600/2+2)continue;
    const k=(y*c.width+x)*4;if(data[k]===255&&data[k+1]===0&&data[k+2]===255)holes++;
   }
  }
  state={...clone(defaults),customImage:fixture.toDataURL(),angle:-30,ratio:65,gap:45,showIcons:false};updateControls();renderZones();await renderDesktop();
  return {follows,fixed,joins:joined===original,holes};
 });
 for(const side of ['left','right']){
  assert.notDeepEqual(results.follows[side][0],results.follows[side][1],side+' wallpaper must move when the divider moves');
  assert.deepEqual(results.fixed[side][0],results.fixed[side][1],side+' wallpaper must stay fixed when unlinked');
 }
 assert(results.joins,'Equal halves with no gap must reconstruct the original picture');assert.equal(results.holes,0,'No uncovered wallpaper inside extreme-angle panes');
 await page.addStyleTag({content:'.desktop-top,.desktop-greeting,.desktop-zones,.desktop-dock,.desktop-caption,.split-handle{visibility:hidden!important}'});
 const preview=PNG.sync.read(await page.locator('#desktop').screenshot());
 const exported=await page.evaluate(async()=>{const w=document.querySelector('#desktop').clientWidth;return (await wallpaperCanvas(state,w)).toDataURL();});
 const png=PNG.sync.read(Buffer.from(exported.split(',')[1],'base64'));
 // Compare interior landmarks to exclude the preview's rounded border and subpixel seam.
 for(const [u,v] of [[.1,.2],[.2,.8],[.85,.2],[.9,.8]]){
  const x=Math.floor(u*png.width),y=Math.floor(v*png.height);
  for(let channel=0;channel<3;channel++)assert(Math.abs(preview.data[(y*preview.width+x)*4+channel]-png.data[(y*png.width+x)*4+channel])<=3,'Preview / PNG differ at '+u+','+v);
 }
 await page.reload();
 await page.evaluate(async()=>{state={...clone(defaults),angle:25,ratio:65,gap:45};updateControls();renderZones();await renderDesktop();});
 await page.screenshot({path:'artifacts/wallpaper-linked.png',fullPage:true});
 await page.evaluate(async()=>{state.linked=false;updateControls();await renderDesktop();});
 await page.screenshot({path:'artifacts/wallpaper-unlinked.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: both wallpaper halves follow resizing; unlinked image stays fixed; zero-gap reconstruction; 24 extreme layouts without holes; preview matches exported PNG.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
