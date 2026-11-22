'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {monitorGeometry,mascotBounds,mascotStyleFromBounds}=require('../lib/display-geometry');
const a={id:'native-A',index:0,left:-1600,top:0,width:1600,height:1024};
const b={id:'native-B',index:1,left:0,top:0,width:1920,height:1080};
const styleA={size:133.12,left:'1040px',top:'737.28px'};
const styleB={size:140.4,left:'1248px',top:'777.6px'};
function near(actual,expected,tolerance=1.5){assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} should be within ${tolerance} of ${expected}`);}
function physicalAnchor(monitor,window,geometry){return {x:monitor.left+(window.x+window.width/2-geometry.bounds.x)*geometry.scaleFactor,y:monitor.top+(window.y+window.height-geometry.bounds.y)*geometry.scaleFactor};}

test('mixed-DPI physical center selects the display without assuming enumeration order',()=>{
 const high={id:22,bounds:{x:-1067,y:0,width:1067,height:683},scaleFactor:1.5};
 const low={id:11,bounds:{x:0,y:0,width:1920,height:1080},scaleFactor:1};let point;
 const screen={getAllDisplays:()=>[low,high],screenToDipPoint:p=>{assert.deepEqual(p,{x:-800,y:512});return {x:-533,y:341};},getDisplayNearestPoint:p=>{point=p;return high;},
  dipToScreenPoint:p=>{assert.deepEqual(p,{x:-533,y:342});return {x:-799,y:513};}};
 assert.deepEqual(monitorGeometry(a,screen),{displayId:22,bounds:high.bounds,scaleFactor:1.5});assert.deepEqual(point,{x:-533,y:341});
});

test('native enumeration must not attach offline B to the nearest remaining A',()=>{
 const remaining={id:11,bounds:{x:0,y:0,width:1920,height:1080},scaleFactor:1};
 const screen={getAllDisplays:()=>[remaining],screenToDipPoint:p=>p,getDisplayNearestPoint:()=>remaining,dipToScreenPoint:p=>p};
 assert.throws(()=>monitorGeometry({...b,left:1920},screen),/显示器信息更新中/);
 assert.deepEqual(monitorGeometry({...a,left:0,width:1920,height:1080},screen),{displayId:11,bounds:remaining.bounds,scaleFactor:1});
});

test('a stale display size rejects the mapping even if its center still agrees',()=>{
 const stale={id:22,bounds:{x:0,y:0,width:1280,height:720},scaleFactor:1.25};
 const monitor={...a,left:0,width:1920,height:1080};
 const screen={getAllDisplays:()=>[stale],screenToDipPoint:p=>p,getDisplayNearestPoint:()=>stale,dipToScreenPoint:()=>({x:960,y:540})};
 assert.throws(()=>monitorGeometry(monitor,screen),/显示器信息更新中/);
});

test('actual 125% topology validates through conversion without trusting nativeOrigin',()=>{
 const monitor={...a,left:-1920,width:1920,height:1080};
 const display={id:2256992338,bounds:{x:-1536,y:216,width:1536,height:864},nativeOrigin:{x:-1536,y:0},scaleFactor:1.25};
 const screen={getAllDisplays:()=>[display],screenToDipPoint:p=>({x:display.bounds.x+(p.x-monitor.left)/1.25,y:display.bounds.y+p.y/1.25}),getDisplayNearestPoint:()=>display,
  dipToScreenPoint:p=>({x:monitor.left+(p.x-display.bounds.x)*1.25,y:(p.y-display.bounds.y)*1.25})};
 assert.deepEqual(monitorGeometry(monitor,screen),{displayId:2256992338,bounds:display.bounds,scaleFactor:1.25});
});

test('150% display left of primary preserves the physical character anchor',()=>{
 const geometry={bounds:{x:-1067,y:0,width:1067,height:683},scaleFactor:1.5};
 const window=mascotBounds(a,styleA,geometry),anchor=physicalAnchor(a,window,geometry);
 near(anchor.x,-560);near(anchor.y,737.28);assert.equal(window.width,360,'logical bubble room is independent of character scale');
 near(window.height*1.5,133.12*1.75);
});

test('100% secondary uses its own DIP origin after a 150% screen becomes primary',()=>{
 const monitor={...b,left:1600},geometry={bounds:{x:1067,y:0,width:1920,height:1080},scaleFactor:1};
 const window=mascotBounds(monitor,styleB,geometry),anchor=physicalAnchor(monitor,window,geometry);
 near(anchor.x,2848,.5);near(anchor.y,777.6,.5);
 assert.equal(window.x,2135,'using the physical origin here would place it 533 px too far right');
});

test('negative vertical DIP origin and a drag round-trip retain local physical coordinates',()=>{
 const monitor={...a,left:-1920,top:-1080,width:1920,height:1080},geometry={bounds:{x:-1536,y:-864,width:1536,height:864},scaleFactor:1.25};
 const start={size:250,left:'960px',top:'900px'},window=mascotBounds(monitor,start,geometry);
 window.x+=80;window.y+=40;
 const moved=mascotStyleFromBounds(monitor,window,geometry);
 assert.deepEqual(moved,{left:'1060px',top:'950px'});
 assert.deepEqual(mascotBounds(monitor,{...start,...moved},geometry),window);
});

test('relative positions follow resolution changes without mutating saved design',()=>{
 const monitor={...a,left:0,width:1920,height:1080},geometry={bounds:{x:0,y:0,width:1280,height:720},scaleFactor:1.5};
 const style={size:300,left:'50%',top:'90%'},window=mascotBounds(monitor,style,geometry);
 const anchor=physicalAnchor(monitor,window,geometry);near(anchor.x,960);near(anchor.y,972);
 assert.deepEqual(style,{size:300,left:'50%',top:'90%'});
});

test('repeated physical-position persistence preserves the requested rectangle at 125% DPI',()=>{
 const monitor={...a,left:-1920,width:1920,height:1080},geometry={bounds:{x:-1536,y:216,width:1536,height:864},scaleFactor:1.25};
 let style={size:140.4,left:'1248px',top:'777.6px'};
 const initial=mascotBounds(monitor,style,geometry);
 for(let i=0;i<100;i++){
  style={...style,...mascotStyleFromBounds(monitor,initial,geometry)};
  assert.deepEqual(mascotBounds(monitor,style,geometry),initial,'saving rounded physical anchors does not enlarge or move the window');
 }
 assert.equal(style.size,140.4,'only the saved position is converted');
});

test('non-Windows monitor identity matches Electron id, not list index',()=>{
 const display={id:73,bounds:{x:1024,y:0,width:1024,height:768},scaleFactor:2};
 const screen={getAllDisplays:()=>[{id:1,bounds:{x:0,y:0,width:1024,height:768},scaleFactor:1},display]};
 assert.deepEqual(monitorGeometry({id:'electron:73',index:0},screen),{displayId:73,bounds:display.bounds,scaleFactor:2});
 assert.throws(()=>monitorGeometry({id:'electron:74'},screen),/无法匹配/);
});

test('lower resolution restores an out-of-range saved mascot inside its assigned monitor',()=>{
 const monitor={...a,left:0},geometry={bounds:{x:0,y:0,width:1067,height:683},scaleFactor:1.5};
 const style={size:140.4,left:'1603.75px',top:'850px'},before={...style};
 const window=mascotBounds(monitor,style,geometry);
 assert.equal(window.x+window.width,1067,'whole window fits before the adjacent 100% display begins');
 assert.ok(window.x+window.width/2<1067,'window center selects the assigned 150% display');
 assert.ok(window.y>=0&&window.y+window.height<=683);assert.deepEqual(style,before,'temporary containment does not overwrite saved position');
 const restored=mascotBounds({...monitor,width:1920,height:1080},style,{bounds:{x:0,y:0,width:1920,height:1080},scaleFactor:1});
 near(restored.x+restored.width/2,1603.75,.5);near(restored.y+restored.height,850,.5);
});

test('out-of-range positions on negative-origin displays stay inside all four edges',()=>{
 const monitor={...a,left:-1600,top:-1024},geometry={bounds:{x:-1067,y:-683,width:1067,height:683},scaleFactor:1.5};
 for(const position of [{left:'-50px',top:'-100px'},{left:'3000px',top:'3000px'},{left:'0%',top:'0%'},{left:'100%',top:'100%'}]){
  const window=mascotBounds(monitor,{size:300,...position},geometry);
  assert.ok(window.x>=-1067&&window.y>=-683,'top and left stay in the assigned display');
  assert.ok(window.x+window.width<=0&&window.y+window.height<=0,'bottom and right stay in the assigned display');
 }
});

test('a host larger than its display is contained without changing the character design',()=>{
 const monitor={...a,left:-800,width:800,height:600},geometry={bounds:{x:-400,y:30,width:400,height:300},scaleFactor:2};
 const style={size:4000,left:'3000px',top:'3000px'},before={...style};
 assert.deepEqual(mascotBounds(monitor,style,geometry),geometry.bounds,'oversized host is limited to the assigned display');
 assert.deepEqual(style,before,'saved size and off-screen position remain available for a larger display mode');
 const tiny={bounds:{x:-100,y:40,width:200,height:100},scaleFactor:2};
 assert.deepEqual(mascotBounds(monitor,{size:10,left:'3000px',top:'3000px'},tiny),{x:-100,y:131,width:200,height:9},'minimum bubble room must not extend beyond a small display');
});
