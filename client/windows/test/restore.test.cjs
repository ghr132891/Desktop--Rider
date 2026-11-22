'use strict';
// Exercise the real main-process restore/save paths with simulated monitors and windows.
// Files are real but confined to temporary profiles; no native bridge or system settings run.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {EventEmitter}=require('node:events'),{createRequire}=require('node:module');
const main=path.join(__dirname,'..','main.js'),localRequire=createRequire(main),source=fs.readFileSync(main,'utf8');
const realNative=localRequire('./lib/native'),{checkMascot}=localRequire('./lib/live');
const displays=[{id:'A',index:0,left:0,top:0,width:1920,height:1080,primary:true},{id:'B',index:1,left:1920,top:0,width:1920,height:1080,primary:false}];
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4l8AAAAASUVORK5CYII=';
const cfg=checkMascot({rig:{head:{url:png,x:0,y:0,w:100,h:120,pivot:{x:50,y:110}},body:{url:png,x:20,y:100,w:60,h:80},width:100,height:180},style:{left:'960px',top:'1000px',size:300}});
const clone=value=>JSON.parse(JSON.stringify(value));
const saved=(profile,kind)=>JSON.parse(fs.readFileSync(path.join(profile,'desktop',kind+'.json'),'utf8'));
const ids=items=>items.map(item=>item.monitorId).sort();
function barrier(){let entered,release;const reached=new Promise(r=>{entered=r;}),waiting=new Promise(r=>{release=r;});return {reached,release,wait(){entered();return waiting;}};}
function seed(t){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-rider-restore-')),desktop=path.join(profile,'desktop');fs.mkdirSync(desktop);
 t.after(()=>{assert.equal(path.dirname(profile),path.resolve(os.tmpdir()),'cleanup stays in the temporary directory');fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
 const layers=displays.map(m=>{const overlay=path.join(desktop,m.id+'.png');fs.writeFileSync(overlay,Buffer.from(png.split(',')[1],'base64'));return {monitorId:m.id,overlay,live:null,clips:[],still:null,lyrics:null,rect:{left:m.left,top:m.top,width:m.width,height:m.height}};});
 fs.writeFileSync(path.join(desktop,'layers.json'),JSON.stringify(layers));
 fs.writeFileSync(path.join(desktop,'mascots.json'),JSON.stringify(displays.map(m=>({monitorId:m.id,cfg}))));return profile;
}
const defaultScreens=monitors=>monitors.map(m=>({id:m.id,bounds:{x:m.left,y:m.top,width:m.width,height:m.height},scaleFactor:1,rotation:0}));
const contains=(rect,point)=>point.x>=rect.x&&point.y>=rect.y&&point.x<rect.x+rect.width&&point.y<rect.y+rect.height;
async function boot(profile,online,{beforeWrite,beforeLoad,beforeAttach,duringStart,readBounds=b=>b,screens=defaultScreens(online)}={}){
 const windows=[],errors=[],handlers=new Map(),timers=new Map(),attachments=[];let startup,windowId=0,timerId=0,enumerationError=null,cursor={x:0,y:0};
 const guard=file=>{const absolute=path.resolve(file);assert.ok(absolute===profile||absolute.startsWith(profile+path.sep),'file access stays in the isolated profile: '+absolute);return absolute;};
 const isolatedFs={readFileSync:(file,...args)=>fs.readFileSync(guard(file),...args),existsSync:file=>fs.existsSync(guard(file)),promises:{
  // Resolve mkdir immediately so write-queue assertions can drain microtasks without timing sleeps.
  mkdir:async(dir,...args)=>fs.mkdirSync(guard(dir),...args),writeFile:async(file,...args)=>{guard(file);await beforeWrite?.(file);return fs.promises.writeFile(file,...args);}
 }};
 class Window extends EventEmitter{
  constructor(options){super();this.id=++windowId;this.options=options;this.bounds={x:options.x||0,y:options.y||0,width:options.width,height:options.height};this.boundsCalls=[];this.destroyed=false;
   this.webContents=Object.assign(new EventEmitter(),{send(){},setWindowOpenHandler(){},isLoading:()=>false,executeJavaScript:async()=>null});windows.push(this);}
  async loadURL(url){this.url=url;await beforeLoad?.(this);} isDestroyed(){return this.destroyed;} setIgnoreMouseEvents(){} setMenuBarVisibility(){} setAlwaysOnTop(){} showInactive(){} show(){} hide(){} focus(){}
  setBounds(bounds){this.bounds={...bounds};this.boundsCalls.push({...bounds});} getBounds(){return readBounds({...this.bounds},this);}
  // Electron's setPosition reads back its current size before applying a complete rectangle.
  // A fractional-DPI enclosing rectangle can be one DIP larger than the requested rectangle.
  setPosition(x,y){const {width,height}=this.getBounds();this.setBounds({x,y,width,height});}
  getNativeWindowHandle(){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(this.id));return b;} destroy(){this.destroyed=true;this.emit('closed');}
 }
 class Tray extends EventEmitter{setToolTip(){} setContextMenu(){} isDestroyed(){return false;}}
 const app=Object.assign(new EventEmitter(),{isPackaged:false,commandLine:{appendSwitch(){}},getPath:()=>profile,getVersion:()=> 'test',requestSingleInstanceLock:()=>true,quit(){},setLoginItemSettings(){},whenReady:()=>({then:fn=>(startup=Promise.resolve().then(fn))})});
 const ipcMain=Object.assign(new EventEmitter(),{handle:(name,fn)=>handlers.set(name,fn)});
 const screen=Object.assign(new EventEmitter(),{
  getAllDisplays:()=>screens,
  getCursorScreenPoint:()=>({...cursor}),
  getPrimaryDisplay:()=>screens.find(d=>online.find(m=>m.id===d.id)?.primary)||screens[0],
  getDisplayNearestPoint(point){return screens.find(d=>contains(d.bounds,point))||[...screens].sort((a,b)=>Math.hypot(a.bounds.x+a.bounds.width/2-point.x,a.bounds.y+a.bounds.height/2-point.y)-Math.hypot(b.bounds.x+b.bounds.width/2-point.x,b.bounds.y+b.bounds.height/2-point.y))[0];},
  screenToDipPoint(point){
   const m=online.find(m=>contains({x:m.left,y:m.top,width:m.width,height:m.height},point));assert.ok(m,'physical point belongs to a connected fixture display');
   const d=screens.find(d=>d.id===m.id);assert.ok(d,'fixture has an Electron display');
   return {x:Math.round(d.bounds.x+(point.x-m.left)/d.scaleFactor),y:Math.round(d.bounds.y+(point.y-m.top)/d.scaleFactor)};
  },
  dipToScreenPoint(point){
   const d=screens.find(d=>contains(d.bounds,point));assert.ok(d,'DIP point belongs to a connected fixture display');
   const m=online.find(m=>m.id===d.id);assert.ok(m,'fixture has a native monitor');
   return {x:Math.round(m.left+(point.x-d.bounds.x)*d.scaleFactor),y:Math.round(m.top+(point.y-d.bounds.y)*d.scaleFactor)};
  }
 });
 const electron={app,BrowserWindow:Window,Tray,Menu:{buildFromTemplate:x=>x},ipcMain,nativeImage:{createFromPath:()=>null},screen,shell:{},powerMonitor:Object.assign(new EventEmitter(),{isOnBatteryPower:()=>false})};
 const native={monitors:async()=>{if(enumerationError)throw enumerationError;return online;},attachLayer:async(hwnd,rect)=>{await beforeAttach?.(hwnd,rect);attachments.push({hwnd,rect:clone(rect)});return {host:'test-host'};},detachLayer:async()=>{},watchCovering:()=>({stop(){}}),watchMedia:()=>({stop(){}}),setWallpaper(){throw new Error('Unexpected wallpaper operation');}};
 const customRequire=id=>{
  if(id==='electron')return electron;if(id==='node:fs')return isolatedFs;
  if(id==='./lib/native')return {...realNative,create:()=>native};
  if(id==='./lib/server')return {start:async()=>({url:'http://127.0.0.1:1/'})};
  if(['node:path','node:crypto','node:url','./lib/live','./lib/lyrics','./lib/power','./lib/display-geometry',path.resolve(__dirname,'../../../lyrics-view.js')].includes(id))return localRequire(id);
  throw new Error('Unexpected require: '+id);
 };
 const context=vm.createContext({require:customRequire,__dirname:path.dirname(main),process:{platform:'win32',argv:[],on(){}},Buffer,URL,setInterval:()=>0,clearInterval(){},
  setTimeout:(callback,delay)=>{const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),
  console:{log(){},warn(){},error:(...args)=>errors.push(args.map(x=>x?.stack||String(x)).join(' '))}});
 // Expose operations only in this VM; no product hooks or assumptions about its internal maps.
 vm.runInContext(source+'\nglobalThis.operations={showLayer,showMascot,clearLayer,closeMascot,saveLayers,saveMascots,reconcileDisplays,desktopTask};',context,{filename:main,timeout:1000});
 assert.ok(startup,'startup callback was scheduled');await duringStart?.(context.operations);await startup;assert.deepEqual(errors,[],'restore has no swallowed errors');
 return {operations:context.operations,active:kind=>clone(handlers.get('client:'+kind)()),windows,attachments,errors,screen,
  setTopology(monitors,displays=defaultScreens(monitors)){online=monitors;screens=displays;},
  setCursor(point){cursor={...point};},
  mascotEvent(id,event){const entry=handlers.get('client:mascots')().find(item=>item.monitorId===id),win=windows.find(item=>item.id===entry.hwnd);ipcMain.emit('mascot:event',{sender:win.webContents},event);},
  failEnumeration(error){enumerationError=error;},
  reconcile:()=>context.operations.desktopTask(context.operations.reconcileDisplays),
  invoke:(name,...args)=>handlers.get(name)({},...args),
  async flushDisplayEvents(){const pending=[...timers].filter(([,timer])=>timer.delay===300);assert.equal(pending.length,1,'display-event burst is debounced');for(const [id,timer] of pending){timers.delete(id);timer.callback();}await context.operations.desktopTask(async()=>{});},
  async flushRetry(){const pending=[...timers].filter(([,timer])=>timer.delay===1000);assert.equal(pending.length,1,'a failed update schedules one retry');for(const [id,timer] of pending){timers.delete(id);timer.callback();}await context.operations.desktopTask(async()=>{});},
  pendingRetry:()=>[...timers.values()].filter(timer=>timer.delay===1000).length,
  dropMascot(id,x,y){
  const entry=handlers.get('client:mascots')().find(item=>item.monitorId===id),win=windows.find(item=>item.id===entry.hwnd);
  const start={...win.bounds},event=value=>ipcMain.emit('mascot:event',{sender:win.webContents},value);
  cursor={x:0,y:0};event({type:'drag-origin'});event({type:'drag'});cursor={x:x-start.x,y:y-start.y};event({type:'dragging'});event({type:'drop'});event({type:'drag-end'});
 }};
}
function check(profile,runtime,onlineIds){for(const kind of ['layers','mascots']){
 assert.deepEqual(ids(runtime.active(kind)),onlineIds,kind+' opens only connected monitors');
 assert.deepEqual(ids(saved(profile,kind)),['A','B'],kind+' keeps disconnected monitors on disk');
}}

test('restoring one connected monitor preserves the other for the next restart',{timeout:10000},async t=>{
 const profile=seed(t);let runtime=await boot(profile,displays);check(profile,runtime,['A','B']);
 runtime=await boot(profile,[displays[0]]);check(profile,runtime,['A']);
 runtime=await boot(profile,displays);check(profile,runtime,['A','B']);
});

test('restoring with no connected monitors preserves both records',{timeout:10000},async t=>{
 const profile=seed(t);let runtime=await boot(profile,[]);check(profile,runtime,[]);
 runtime=await boot(profile,displays);check(profile,runtime,['A','B']);
});

test('updating A and saving or dragging its mascot leaves offline B unchanged',{timeout:10000},async t=>{
 const profile=seed(t);await boot(profile,displays);
 const before=Object.fromEntries(['layers','mascots'].map(kind=>[kind,saved(profile,kind).find(item=>item.monitorId==='B')]));
 const runtime=await boot(profile,[displays[0]]),overlay=path.join(profile,'desktop','A-new.png');fs.writeFileSync(overlay,Buffer.from(png.split(',')[1],'base64'));
 await runtime.operations.showLayer('A',displays[0],{overlay},Date.now());await runtime.operations.saveLayers('A');
 const changed=clone(cfg);changed.style.size=400;await runtime.operations.showMascot('A',displays[0],changed);
 runtime.dropMascot('A',100,200);await runtime.operations.saveMascots();
 // Repeat saves to check that the parked entry survives later snapshots, not just initial restore.
 await runtime.operations.saveLayers();await runtime.operations.saveMascots();
 for(const kind of ['layers','mascots'])assert.deepEqual(saved(profile,kind).find(item=>item.monitorId==='B'),before[kind],kind+' preserves the full offline payload');
 assert.equal(saved(profile,'layers').find(item=>item.monitorId==='A').overlay,overlay);
 const moved=saved(profile,'mascots').find(item=>item.monitorId==='A').cfg.style;
 assert.equal(moved.size,400);assert.equal(moved.left,'540px');assert.equal(moved.top,'900px');
 const restarted=await boot(profile,displays);check(profile,restarted,['A','B']);
 assert.equal(restarted.active('layers').find(item=>item.monitorId==='A').overlay,overlay);
});

for(const online of [displays,[displays[1]],[]])test('explicit deletion does not resurrect A; connected: '+online.map(item=>item.id).join(','),{timeout:10000},async t=>{
 const profile=seed(t),runtime=await boot(profile,online);
 for(const kind of ['layers','mascots'])assert.deepEqual(ids(saved(profile,kind)),['A','B'],kind+' has both records before the explicit deletion');
 await runtime.operations.clearLayer('A');await runtime.operations.closeMascot('A');
 for(const kind of ['layers','mascots'])assert.deepEqual(ids(saved(profile,kind)),['B'],kind+' deletes A even when it has no window');
 const restarted=await boot(profile,displays);
 for(const kind of ['layers','mascots'])assert.deepEqual(ids(restarted.active(kind)),['B'],kind+' must not restore an explicitly removed record');
});

for(const [kind,save,remove,title] of [['layers','saveLayers','clearLayer','Desktop Rider Layer'],['mascots','saveMascots','closeMascot','Desktop Rider Mascot']]){
 test(kind+': a delayed older save cannot resurrect a subsequent deletion',{timeout:10000},async t=>{
  const profile=seed(t),blocked=barrier();let observe=false,started=0;
  const runtime=await boot(profile,displays,{beforeWrite:file=>{if(observe&&path.basename(file)===kind+'.json'&&++started===1)return blocked.wait();}});
  observe=true;const older=runtime.operations[save]();await blocked.reached;
  const deletion=runtime.operations[remove]('A');
  try{await new Promise(resolve=>setImmediate(resolve));assert.equal(started,1,'newer write waits for the older write');}
  finally{blocked.release();await Promise.all([older,deletion]);}
  assert.deepEqual(ids(saved(profile,kind)),['B']);
  const restarted=await boot(profile,displays);assert.deepEqual(ids(restarted.active(kind)),['B']);
 });
 test(kind+': deleting B while A is loading cancels B in the restore snapshot',{timeout:10000},async t=>{
  const profile=seed(t),blocked=barrier();let held=false;
  const runtime=await boot(profile,displays,{
   beforeLoad:win=>{if(!held&&win.options.title===title){held=true;return blocked.wait();}},
   duringStart:async operations=>{await blocked.reached;try{await operations[remove]('B');}finally{blocked.release();}}
  });
  assert.deepEqual(ids(runtime.active(kind)),['A']);assert.deepEqual(ids(saved(profile,kind)),['A']);
  const restarted=await boot(profile,displays);assert.deepEqual(ids(restarted.active(kind)),['A']);
 });
}

// Recorded mixed-DPI topologies use deliberately different native/Electron origins.
// The Electron list is reversed so pairing by display index cannot accidentally pass.
const mixedMonitors=[
 {id:'A',index:0,left:-1600,top:0,width:1600,height:1024,primary:false},
 {id:'B',index:1,left:0,top:0,width:1920,height:1080,primary:true}
];
const mixedScreens=[
 {id:'B',bounds:{x:0,y:0,width:1920,height:1080},scaleFactor:1,rotation:0},
 {id:'A',bounds:{x:-1067,y:397,width:1067,height:683},scaleFactor:1.5,rotation:0}
];
const handles=runtime=>Object.fromEntries(['layers','mascots'].map(kind=>[kind,Object.fromEntries(runtime.active(kind).map(item=>[item.monitorId,item.hwnd]))]));
const records=profile=>Object.fromEntries(['layers','mascots'].map(kind=>[kind,saved(profile,kind)]));
function checkGeometry(runtime,monitors,screens){
 for(const m of monitors){
  const d=screens.find(d=>d.id===m.id),layer=runtime.active('layers').find(item=>item.monitorId===m.id),mascot=runtime.active('mascots').find(item=>item.monitorId===m.id);
  const w=runtime.windows.find(w=>w.id===layer.hwnd),rect={left:m.left,top:m.top,width:m.width,height:m.height};
  assert.deepEqual(clone(w.getBounds()),d.bounds,m.id+' layer is created in this display\'s DIP bounds');
  assert.deepEqual(layer.rect,rect,m.id+' attachment keeps physical bounds');
  assert.deepEqual(runtime.attachments.findLast(item=>item.hwnd===layer.hwnd).rect,rect);
  const center={x:mascot.bounds.x+mascot.bounds.width/2,y:mascot.bounds.y+mascot.bounds.height};
  assert.ok(Math.abs(center.x-(d.bounds.x+960/d.scaleFactor))<=1,m.id+' mascot horizontal anchor converts relative physical pixels to DIP');
  assert.ok(Math.abs(center.y-(d.bounds.y+1000/d.scaleFactor))<=1,m.id+' mascot bottom anchor converts relative physical pixels to DIP');
 }
}

test('live unplug/replug rebuilds only affected windows and preserves every saved payload',{timeout:10000},async t=>{
 const profile=seed(t),before=records(profile),runtime=await boot(profile,mixedMonitors,{screens:mixedScreens}),initial=handles(runtime);
 checkGeometry(runtime,mixedMonitors,mixedScreens);
 const single=[{...mixedMonitors[0],left:0,width:1920,height:1080,primary:true}],singleScreens=[{id:'A',bounds:{x:0,y:0,width:1280,height:720},scaleFactor:1.5,rotation:0}];
 runtime.setTopology(single,singleScreens);await runtime.reconcile();check(profile,runtime,['A']);checkGeometry(runtime,single,singleScreens);
 for(const kind of ['layers','mascots'])for(const id of ['A','B'])assert.equal(runtime.windows.find(w=>w.id===initial[kind][id]).destroyed,true,kind+' old '+id+' window is destroyed');
 assert.deepEqual(records(profile),before,'unplug does not rewrite the saved geometry or content');
 const unplugged=handles(runtime);runtime.setTopology(mixedMonitors,mixedScreens);await runtime.reconcile();check(profile,runtime,['A','B']);checkGeometry(runtime,mixedMonitors,mixedScreens);
 for(const kind of ['layers','mascots'])assert.notEqual(handles(runtime)[kind].A,unplugged[kind].A,kind+' reconnected topology gets a fresh DPI surface');
 await runtime.operations.saveLayers();await runtime.operations.saveMascots();assert.deepEqual(records(profile),before,'later saves retain complete records after reconnect');
 assert.deepEqual(runtime.errors,[]);
});

test('primary switch refreshes physical origins, DIP bounds and both mascot anchors',{timeout:10000},async t=>{
 const profile=seed(t),before=records(profile),runtime=await boot(profile,mixedMonitors,{screens:mixedScreens}),initial=handles(runtime);
 const primaryA=[{...mixedMonitors[0],left:0,primary:true},{...mixedMonitors[1],left:1600,primary:false}],screens=[
  {id:'B',bounds:{x:1067,y:0,width:1920,height:1080},scaleFactor:1,rotation:0},
  {id:'A',bounds:{x:0,y:0,width:1067,height:683},scaleFactor:1.5,rotation:0}
 ];
 runtime.setTopology(primaryA,screens);await runtime.reconcile();checkGeometry(runtime,primaryA,screens);
 for(const kind of ['layers','mascots'])for(const id of ['A','B'])assert.notEqual(handles(runtime)[kind][id],initial[kind][id],kind+' '+id+' is rebuilt after the primary switch');
 assert.deepEqual(records(profile),before);
});

test('a mixed-DPI mascot drop saves physical local coordinates and restores the same DIP position',{timeout:10000},async t=>{
 const profile=seed(t),runtime=await boot(profile,mixedMonitors,{screens:mixedScreens}),other=saved(profile,'mascots').find(item=>item.monitorId==='B');
 runtime.dropMascot('A',-900,400);await runtime.operations.saveMascots();
 const moved=saved(profile,'mascots').find(item=>item.monitorId==='A').cfg.style;
 assert.equal(moved.left,'580.5px');assert.equal(moved.top,'529.5px');assert.equal(moved.size,300,'the saved character size stays in physical pixels');
 assert.deepEqual(saved(profile,'mascots').find(item=>item.monitorId==='B'),other);
 const restarted=await boot(profile,mixedMonitors,{screens:mixedScreens}),bounds=restarted.active('mascots').find(item=>item.monitorId==='A').bounds;
 assert.equal(bounds.x,-900);assert.equal(bounds.y,400,'DPI conversion is reversible across restart');
});

test('mascot dragging follows the absolute cursor and ignores drifting renderer coordinates',{timeout:10000},async t=>{
 const profile=seed(t),runtime=await boot(profile,mixedMonitors,{screens:mixedScreens}),other=saved(profile,'mascots').find(item=>item.monitorId==='B');
 const bounds=()=>runtime.active('mascots').find(item=>item.monitorId==='A').bounds,initial=bounds(),press={x:-420,y:900};
 runtime.setCursor(press);runtime.mascotEvent('A',{type:'drag-origin'});
 // Movement between pointerdown and the renderer's drag threshold must not be lost.
 runtime.setCursor({x:press.x+12,y:press.y+12});runtime.mascotEvent('A',{type:'drag'});
 runtime.mascotEvent('A',{type:'dragging',dx:900,dy:800});
 assert.deepEqual(bounds(),{...initial,x:initial.x+12,y:initial.y+12});
 for(let i=1;i<=5;i++)runtime.mascotEvent('A',{type:'dragging',dx:900+i*100,dy:800+i*100});
 assert.deepEqual(bounds(),{...initial,x:initial.x+12,y:initial.y+12},'holding the pointer still cannot cause a feedback drift');
 // Cross into the adjacent 100% screen; global DIP displacement is authoritative.
 runtime.setCursor({x:30,y:930});runtime.mascotEvent('A',{type:'dragging',dx:-600,dy:-500});
 assert.deepEqual(bounds(),{...initial,x:initial.x+450,y:initial.y+30});
 runtime.setCursor({x:press.x+60,y:press.y-30});runtime.mascotEvent('A',{type:'dragging',dx:5000,dy:5000});
 const dropped=bounds();runtime.mascotEvent('A',{type:'drop'});await runtime.operations.saveMascots();
 assert.deepEqual(dropped,{...initial,x:initial.x+60,y:initial.y-30});
 const moved=saved(profile,'mascots').find(item=>item.monitorId==='A').cfg.style;
 assert.equal(moved.left,'1050px');assert.equal(moved.top,'955.5px');assert.equal(moved.size,300);
 assert.deepEqual(saved(profile,'mascots').find(item=>item.monitorId==='B'),other);
 runtime.setCursor({x:900,y:900});runtime.mascotEvent('A',{type:'dragging',dx:9999,dy:9999});assert.deepEqual(bounds(),dropped,'drop ends the drag');
 const restarted=await boot(profile,mixedMonitors,{screens:mixedScreens});
 assert.deepEqual(restarted.active('mascots').find(item=>item.monitorId==='A').bounds,dropped,'mixed-DPI drop survives restart without an extra scale');
});

test('ending an unstarted mascot drag clears its origin before a fallback drag',{timeout:10000},async t=>{
 const profile=seed(t),runtime=await boot(profile,mixedMonitors,{screens:mixedScreens}),bounds=()=>runtime.active('mascots').find(item=>item.monitorId==='A').bounds,initial=bounds();
 runtime.setCursor({x:-400,y:900});runtime.mascotEvent('A',{type:'drag-origin'});runtime.mascotEvent('A',{type:'drag-end'});
 runtime.setCursor({x:-200,y:800});runtime.mascotEvent('A',{type:'drag'});
 runtime.mascotEvent('A',{type:'dragging',dx:500,dy:500});assert.deepEqual(bounds(),initial,'a drag without pointerdown starts at the current cursor');
 runtime.setCursor({x:-180,y:790});runtime.mascotEvent('A',{type:'dragging',dx:500,dy:500});
 assert.deepEqual(bounds(),{...initial,x:initial.x+20,y:initial.y-10});
 runtime.mascotEvent('A',{type:'drop'});await runtime.operations.saveMascots();
});

test('fractional-DPI bounds readback cannot accumulate size or position over repeated drags',{timeout:10000},async t=>{
 const profile=seed(t),screens=[mixedScreens[0],{...mixedScreens[1],bounds:{x:-1280,y:261,width:1280,height:819},scaleFactor:1.25}];
 const readBounds=(b,w)=>w.options.title==='Desktop Rider Mascot'?{...b,x:b.x+1,y:b.y-1,width:b.width+1,height:b.height+1}:b;
 const runtime=await boot(profile,mixedMonitors,{screens,readBounds}),other=saved(profile,'mascots').find(item=>item.monitorId==='B');
 const active=runtime.active('mascots').find(item=>item.monitorId==='A'),win=runtime.windows.find(w=>w.id===active.hwnd),initial=clone(win.bounds);
 assert.notDeepEqual(win.getBounds(),initial,'fixture exposes enclosing-rectangle rounding like Windows at 125%');
 for(let gesture=1;gesture<=20;gesture++){
  const press={x:-500,y:700},start=clone(win.bounds);runtime.setCursor(press);runtime.mascotEvent('A',{type:'drag-origin'});runtime.mascotEvent('A',{type:'drag'});
  for(let step=1;step<=10;step++){
   runtime.setCursor({x:press.x+step,y:press.y-step});runtime.mascotEvent('A',{type:'dragging',dx:step*1000,dy:step*1000});
   assert.deepEqual(win.bounds,{...initial,x:start.x+step,y:start.y-step},'only absolute cursor displacement changes the requested rectangle');
  }
  const calls=win.boundsCalls.length;
  for(let repeat=0;repeat<30;repeat++)runtime.mascotEvent('A',{type:'dragging',dx:repeat*3000,dy:repeat*3000});
  assert.equal(win.boundsCalls.length,calls,'a stationary cursor causes no native resize/move calls');
  runtime.mascotEvent('A',{type:'drop'});runtime.mascotEvent('A',{type:'drag-end'});await runtime.operations.saveMascots();
  assert.deepEqual(win.bounds,{...initial,x:initial.x+gesture*10,y:initial.y-gesture*10},'new presses do not inherit the rounded readback origin');
 }
 for(const b of win.boundsCalls){assert.equal(b.width,initial.width);assert.equal(b.height,initial.height);}
 const moved=saved(profile,'mascots').find(item=>item.monitorId==='A').cfg.style;
 assert.equal(moved.left,'1210px');assert.equal(moved.top,'750px');assert.equal(moved.size,300);
 assert.deepEqual(saved(profile,'mascots').find(item=>item.monitorId==='B'),other,'other monitor remains untouched');
 const restarted=await boot(profile,mixedMonitors,{screens,readBounds});
 const restoredEntry=restarted.active('mascots').find(item=>item.monitorId==='A'),restoredWindow=restarted.windows.find(w=>w.id===restoredEntry.hwnd);
 assert.deepEqual(restoredWindow.bounds,win.bounds,'saved requested coordinates restore without accumulating readback error');
});

test('resolution shrink contains restored windows without overwriting saved mascot position',{timeout:10000},async t=>{
 const originalMonitors=[{...displays[0],left:-1920,primary:false},{...displays[1],left:0,primary:true}];
 const originalScreens=[{id:'A',bounds:{x:-1536,y:216,width:1536,height:864},scaleFactor:1.25,rotation:0},
  {id:'B',bounds:{x:0,y:0,width:1920,height:1080},scaleFactor:1,rotation:0}];
 const profile=seed(t),runtime=await boot(profile,originalMonitors,{screens:originalScreens}),desired=clone(cfg);
 Object.assign(desired.style,{left:'1603.75px',top:'850px',size:140.4});
 await runtime.operations.showMascot('A',originalMonitors[0],desired);
 const before=records(profile),original=runtime.active('mascots').find(item=>item.monitorId==='A').bounds;
 const smallerMonitors=[{...originalMonitors[0],left:0,width:1600,height:1024,primary:true},{...originalMonitors[1],left:1600,primary:false}];
 const smallerScreens=[{id:'A',bounds:{x:0,y:0,width:1067,height:683},scaleFactor:1.5,rotation:0},
  {id:'B',bounds:{x:1067,y:0,width:1920,height:1080},scaleFactor:1,rotation:0}];
 runtime.setTopology(smallerMonitors,smallerScreens);runtime.screen.emit('display-metrics-changed',{},smallerScreens[0],['bounds','scaleFactor']);await runtime.flushDisplayEvents();
 const contained=runtime.active('mascots').find(item=>item.monitorId==='A').bounds;
 assert.ok(contained.x>=0&&contained.y>=0&&contained.x+contained.width<=1067&&contained.y+contained.height<=683,'restored host fits the smaller assigned display');
 assert.deepEqual(records(profile),before,'temporary containment must not rewrite either monitor\'s desired design');
 await runtime.operations.saveMascots();assert.deepEqual(records(profile),before,'unrelated saves do not persist the temporary correction');
 runtime.setTopology(originalMonitors,originalScreens);runtime.screen.emit('display-metrics-changed',{},originalScreens[0],['bounds','scaleFactor']);await runtime.flushDisplayEvents();
 assert.deepEqual(runtime.active('mascots').find(item=>item.monitorId==='A').bounds,original,'larger mode recovers the original desired position');
 assert.deepEqual(records(profile),before);assert.deepEqual(runtime.errors,[]);
});

test('DPI-only change rebuilds that display; duplicate events keep all current windows',{timeout:10000},async t=>{
 const profile=seed(t),before=records(profile),runtime=await boot(profile,mixedMonitors,{screens:mixedScreens}),initial=handles(runtime);
 const screens=[mixedScreens[0],{...mixedScreens[1],bounds:{x:-1280,y:261,width:1280,height:819},scaleFactor:1.25}];
 runtime.setTopology(mixedMonitors,screens);
 runtime.screen.emit('display-metrics-changed',{},screens[1],['scaleFactor','bounds']);
 runtime.screen.emit('display-metrics-changed',{},screens[1],['workArea']);
 await runtime.flushDisplayEvents();checkGeometry(runtime,mixedMonitors,screens);
 const changed=handles(runtime);for(const kind of ['layers','mascots']){
  assert.notEqual(changed[kind].A,initial[kind].A,kind+' A is rebuilt for new DPI');
  assert.equal(changed[kind].B,initial[kind].B,kind+' unchanged B remains alive');
 }
 runtime.screen.emit('display-added',{},screens[1]);runtime.screen.emit('display-removed',{},screens[1]);runtime.screen.emit('display-metrics-changed',{},screens[1],['bounds']);
 await runtime.flushDisplayEvents();assert.deepEqual(handles(runtime),changed,'a redundant event burst does not reload or recreate windows');
 assert.deepEqual(records(profile),before);assert.deepEqual(runtime.errors,[]);
});

test('failed display enumeration leaves windows and records intact; next update can recover',{timeout:10000},async t=>{
 const profile=seed(t),before=records(profile),runtime=await boot(profile,mixedMonitors,{screens:mixedScreens}),initial=handles(runtime);
 runtime.failEnumeration(new Error('bridge unavailable'));await assert.rejects(runtime.reconcile(),/bridge unavailable/);
 assert.deepEqual(handles(runtime),initial);assert.deepEqual(records(profile),before);
 runtime.failEnumeration(null);runtime.setTopology([],[]);await runtime.reconcile();
 for(const kind of ['layers','mascots'])assert.deepEqual(runtime.active(kind),[],kind+' closes when successful enumeration says all displays are gone');
 assert.deepEqual(records(profile),before);
 runtime.setTopology(mixedMonitors,mixedScreens);await runtime.reconcile();check(profile,runtime,['A','B']);checkGeometry(runtime,mixedMonitors,mixedScreens);
});

test('explicitly cleared offline records do not return on live reconnect',{timeout:10000},async t=>{
 const profile=seed(t),runtime=await boot(profile,mixedMonitors,{screens:mixedScreens});
 runtime.setTopology([mixedMonitors[0]],[mixedScreens[1]]);await runtime.reconcile();
 await runtime.invoke('client:clear-layer','B');await runtime.operations.desktopTask(()=>runtime.operations.closeMascot('B'));
 runtime.setTopology(mixedMonitors,mixedScreens);await runtime.reconcile();
 for(const kind of ['layers','mascots']){assert.deepEqual(ids(runtime.active(kind)),['A']);assert.deepEqual(ids(saved(profile,kind)),['A']);}
});

test('a clear queued during display restoration wins after the rebuild and stays deleted',{timeout:10000},async t=>{
 const profile=seed(t),blocked=barrier();let hold=false,held=false;
 const runtime=await boot(profile,mixedMonitors,{screens:mixedScreens,beforeLoad:win=>{
  if(hold&&!held&&win.options.title==='Desktop Rider Layer'){held=true;return blocked.wait();}
 }});
 const changedScreens=mixedScreens.map(d=>({...d,bounds:{...d.bounds,y:d.bounds.y+40}}));runtime.setTopology(mixedMonitors,changedScreens);hold=true;
 const restoring=runtime.reconcile();await blocked.reached;
 let cleared=false;const clearing=runtime.invoke('client:clear-layer','B').then(()=>{cleared=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(cleared,false,'explicit clear waits for the active rebuild');
 blocked.release();await Promise.all([restoring,clearing]);await runtime.reconcile();
 assert.deepEqual(ids(runtime.active('layers')),['A']);assert.deepEqual(ids(saved(profile,'layers')),['A']);
 assert.deepEqual(ids(runtime.active('mascots')),['A','B'],'clearing a layer does not delete its independently saved mascot');
 assert.deepEqual(runtime.errors,[]);
});

for(const failure of ['layer-load','layer-attach','mascot-load'])test(failure+': failed live restoration destroys the partial window and can retry',{timeout:10000},async t=>{
 const profile=seed(t),before=records(profile);let enabled=false,failedWindow=null,failed=false,runtime;
 runtime=await boot(profile,mixedMonitors,{screens:mixedScreens,
  beforeLoad:win=>{
   if(enabled&&!failed&&win.options.title===(failure==='mascot-load'?'Desktop Rider Mascot':'Desktop Rider Layer')&&failure!=='layer-attach'){
    failed=true;failedWindow=win;throw new Error('one-shot '+failure);
   }
  },
  beforeAttach:hwnd=>{if(enabled&&!failed&&failure==='layer-attach'){failed=true;failedWindow=runtime.windows.find(w=>w.id===hwnd);throw new Error('one-shot '+failure);}}
 });
 enabled=true;const screens=mixedScreens.map(d=>({...d,bounds:{...d.bounds,y:d.bounds.y+40}}));runtime.setTopology(mixedMonitors,screens);
 await assert.rejects(runtime.reconcile(),new RegExp('one-shot '+failure));
 assert.ok(failedWindow,'fault was injected into a new window');assert.equal(failedWindow.destroyed,true,'failed creation must not occupy the active map');
 const kind=failure==='mascot-load'?'mascots':'layers';assert.deepEqual(ids(runtime.active(kind)),['B'],'the other display still restores after A fails');
 assert.deepEqual(records(profile),before,'failed creation must not delete desired content');
 await runtime.reconcile();check(profile,runtime,['A','B']);checkGeometry(runtime,mixedMonitors,screens);assert.deepEqual(records(profile),before);
});

test('a transient enumeration failure retries without waiting for another display event',{timeout:10000},async t=>{
 const profile=seed(t),before=records(profile),runtime=await boot(profile,mixedMonitors,{screens:mixedScreens}),initial=handles(runtime);
 runtime.failEnumeration(new Error('temporary bridge failure'));runtime.screen.emit('display-removed',{},mixedScreens[0]);await runtime.flushDisplayEvents();
 assert.deepEqual(handles(runtime),initial);assert.deepEqual(records(profile),before);
 runtime.failEnumeration(null);runtime.setTopology([mixedMonitors[0]],[mixedScreens[1]]);await runtime.flushRetry();
 check(profile,runtime,['A']);assert.deepEqual(records(profile),before);assert.equal(runtime.pendingRetry(),0,'successful retry stops the retry cycle');
});

test('persistent display failures stop retrying after two attempts',{timeout:10000},async t=>{
 const profile=seed(t),runtime=await boot(profile,mixedMonitors,{screens:mixedScreens}),initial=handles(runtime);
 runtime.failEnumeration(new Error('persistent bridge failure'));runtime.screen.emit('display-metrics-changed',{},mixedScreens[0],['bounds']);await runtime.flushDisplayEvents();
 await runtime.flushRetry();await runtime.flushRetry();assert.equal(runtime.pendingRetry(),0,'a disconnected bridge does not create an unbounded retry loop');
 assert.deepEqual(handles(runtime),initial);
});
