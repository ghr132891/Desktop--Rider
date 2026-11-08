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
async function boot(profile,online,{beforeWrite,beforeLoad,duringStart}={}){
 const windows=[],errors=[],handlers=new Map();let startup,windowId=0;
 const guard=file=>{const absolute=path.resolve(file);assert.ok(absolute===profile||absolute.startsWith(profile+path.sep),'file access stays in the isolated profile: '+absolute);return absolute;};
 const isolatedFs={readFileSync:(file,...args)=>fs.readFileSync(guard(file),...args),existsSync:file=>fs.existsSync(guard(file)),promises:{
  // Resolve mkdir immediately so write-queue assertions can drain microtasks without timing sleeps.
  mkdir:async(dir,...args)=>fs.mkdirSync(guard(dir),...args),writeFile:async(file,...args)=>{guard(file);await beforeWrite?.(file);return fs.promises.writeFile(file,...args);}
 }};
 class Window extends EventEmitter{
  constructor(options){super();this.id=++windowId;this.options=options;this.bounds={x:options.x||0,y:options.y||0,width:options.width,height:options.height};this.destroyed=false;
   this.webContents=Object.assign(new EventEmitter(),{send(){},setWindowOpenHandler(){},isLoading:()=>false,executeJavaScript:async()=>null});windows.push(this);}
  async loadURL(url){this.url=url;await beforeLoad?.(this);} isDestroyed(){return this.destroyed;} setIgnoreMouseEvents(){} setMenuBarVisibility(){} setAlwaysOnTop(){} showInactive(){} show(){} hide(){} focus(){}
  setBounds(bounds){this.bounds={...bounds};} getBounds(){return {...this.bounds};} setPosition(x,y){Object.assign(this.bounds,{x,y});}
  getNativeWindowHandle(){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(this.id));return b;} destroy(){this.destroyed=true;this.emit('closed');}
 }
 class Tray extends EventEmitter{setToolTip(){} setContextMenu(){} isDestroyed(){return false;}}
 const app=Object.assign(new EventEmitter(),{isPackaged:false,commandLine:{appendSwitch(){}},getPath:()=>profile,getVersion:()=> 'test',requestSingleInstanceLock:()=>true,quit(){},setLoginItemSettings(){},whenReady:()=>({then:fn=>(startup=Promise.resolve().then(fn))})});
 const ipcMain=Object.assign(new EventEmitter(),{handle:(name,fn)=>handlers.set(name,fn)});
 const electron={app,BrowserWindow:Window,Tray,Menu:{buildFromTemplate:x=>x},ipcMain,nativeImage:{createFromPath:()=>null},screen:{},shell:{},powerMonitor:Object.assign(new EventEmitter(),{isOnBatteryPower:()=>false})};
 const native={monitors:async()=>online,attachLayer:async()=>({host:'test-host'}),detachLayer:async()=>{},watchCovering:()=>({stop(){}}),watchMedia:()=>({stop(){}}),setWallpaper(){throw new Error('Unexpected wallpaper operation');}};
 const customRequire=id=>{
  if(id==='electron')return electron;if(id==='node:fs')return isolatedFs;
  if(id==='./lib/native')return {...realNative,create:()=>native};
  if(id==='./lib/server')return {start:async()=>({url:'http://127.0.0.1:1/'})};
  if(['node:path','node:crypto','node:url','./lib/live','./lib/lyrics','./lib/power',path.resolve(__dirname,'../../../lyrics-view.js')].includes(id))return localRequire(id);
  throw new Error('Unexpected require: '+id);
 };
 const context=vm.createContext({require:customRequire,__dirname:path.dirname(main),process:{platform:'win32',argv:[],on(){}},Buffer,URL,setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout,
  console:{log(){},warn(){},error:(...args)=>errors.push(args.map(x=>x?.stack||String(x)).join(' '))}});
 // Expose operations only in this VM; no product hooks or assumptions about its internal maps.
 vm.runInContext(source+'\nglobalThis.operations={showLayer,showMascot,clearLayer,closeMascot,saveLayers,saveMascots};',context,{filename:main,timeout:1000});
 assert.ok(startup,'startup callback was scheduled');await duringStart?.(context.operations);await startup;assert.deepEqual(errors,[],'restore has no swallowed errors');
 return {operations:context.operations,active:kind=>clone(handlers.get('client:'+kind)()),dropMascot(id,x,y){
  const entry=handlers.get('client:mascots')().find(item=>item.monitorId===id),win=windows.find(item=>item.id===entry.hwnd);
  win.setPosition(x,y);ipcMain.emit('mascot:event',{sender:win.webContents},{type:'drop'});
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
