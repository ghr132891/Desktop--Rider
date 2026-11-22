'use strict';
// Native monitor rectangles and exported designs use physical pixels; Electron windows use DIP.
// A mixed-DPI desktop has different physical and DIP origins, so dividing the global origin by
// this monitor's scale is not a conversion (even a 100% secondary monitor can have another origin).
function monitorGeometry(monitor,screen){
 const displays=screen.getAllDisplays();let display,physicalCenter;
 if(String(monitor.id).startsWith('electron:'))display=displays.find(d=>'electron:'+d.id===monitor.id);
 else{
  physicalCenter={x:Math.round(monitor.left+monitor.width/2),y:Math.round(monitor.top+monitor.height/2)};
  display=screen.getDisplayNearestPoint(screen.screenToDipPoint(physicalCenter));
 }
 if(!display||!Number.isFinite(display.scaleFactor)||display.scaleFactor<=0)throw new Error('无法匹配显示器缩放信息');
 if(physicalCenter){
  // The native bridge and Electron can observe a hot-plug at different instants. "Nearest"
  // still returns an online display for an offline monitor, so require an actual rectangle match.
  // nativeOrigin is not consistently in physical pixels across Electron versions; round-trip
  // a point inside the candidate instead, allowing only the integer DIP/pixel rounding error.
  const {bounds,scaleFactor:scale}=display,tolerance=Math.max(2,scale);
  const center=screen.dipToScreenPoint({x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)});
  const agrees=(actual,expected)=>Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance;
  if(!displays.some(d=>d.id===display.id)||!agrees(center.x,physicalCenter.x)||!agrees(center.y,physicalCenter.y)||
   !agrees(bounds.width*scale,monitor.width)||!agrees(bounds.height*scale,monitor.height))throw new Error('显示器信息更新中，请稍后重试');
 }
 return {displayId:display.id,bounds:{...display.bounds},scaleFactor:display.scaleFactor};
}
const length=(value,extent)=>String(value).endsWith('%')?parseFloat(value)*extent/100:parseFloat(value);
function mascotBounds(monitor,style,geometry){
 const {bounds,scaleFactor:scale}=geometry,size=style.size/scale;
 // Keep room for speech bubbles in logical pixels, independently of the physical character size.
 // A saved physical position can fall outside the monitor after a resolution change. Contain
 // the whole host so Electron cannot choose a neighbour's DPI from an out-of-screen center.
 // Limit oversized hosts too; retain the saved style so restoring the old mode restores intent.
 const width=Math.min(bounds.width,Math.max(360,Math.round(size*2.2))),height=Math.min(bounds.height,Math.max(1,Math.round(size*1.75)));
 const x=Math.round(bounds.x+length(style.left,monitor.width)/scale-width/2),y=Math.round(bounds.y+length(style.top,monitor.height)/scale-height);
 return {x:Math.max(bounds.x,Math.min(bounds.x+bounds.width-width,x)),
  y:Math.max(bounds.y,Math.min(bounds.y+bounds.height-height,y)),width,height};
}
function mascotStyleFromBounds(monitor,windowBounds,geometry){
 const {bounds,scaleFactor:scale}=geometry;
 const px=n=>(Math.round(n*1000)/1000)+'px';
 return {left:px((windowBounds.x+windowBounds.width/2-bounds.x)*scale),
  top:px((windowBounds.y+windowBounds.height-bounds.y)*scale)};
}
function moveMascotWindow(m,point){
 if(!m.dragStart)return;
 const start=m.dragStart,next={...start.bounds,x:Math.round(start.bounds.x+point.x-start.point.x),y:Math.round(start.bounds.y+point.y-start.point.y)};
 if(['x','y','width','height'].every(k=>m.bounds[k]===next[k]))return;
 // Electron setPosition reads back a rounded-up DIP size and writes it again. At fractional
 // Windows scaling that makes a non-resizable window grow on every move. Keep the requested
 // rectangle as the source of truth, including across separate drags and persistence.
 m.window.setBounds(next);m.bounds=next;
}
module.exports={monitorGeometry,mascotBounds,mascotStyleFromBounds,moveMascotWindow};
