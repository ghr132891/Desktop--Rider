'use strict';
// Desktop Rider Windows client (Electron). Hosts the web app from a loopback server, applies
// rendered wallpapers per monitor through native/bridge.ps1, keeps transparent "desktop layer"
// windows under the icons for the floating person, and lives in the tray with optional autostart.
const {app,BrowserWindow,Tray,Menu,ipcMain,nativeImage,screen,shell}=require('electron');
const path=require('node:path'),fs=require('node:fs'),fsp=fs.promises,crypto=require('node:crypto');
const server=require('./lib/server'),{create:createNative,hwndOf}=require('./lib/native'),native=createNative();
const WEB_ROOT=app.isPackaged?path.join(process.resourcesPath,'web'):path.join(__dirname,'..','..');
const DATA=path.join(app.getPath('userData'),'desktop'),SETTINGS=path.join(app.getPath('userData'),'settings.json'),LAYERS=path.join(DATA,'layers.json');
const startHidden=process.argv.includes('--hidden');
let mainWindow=null,tray=null,web=null,quitting=false;
const layers=new Map(); // monitorId -> {window,file,rect}
const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}};
const writeJson=(file,value)=>fsp.mkdir(path.dirname(file),{recursive:true}).then(()=>fsp.writeFile(file,JSON.stringify(value,null,1)));
let settings={openAtLogin:false,...readJson(SETTINGS,{})};
const status=message=>{mainWindow?.webContents.send('client:status',message);};
const keyOf=monitorId=>crypto.createHash('sha1').update(monitorId).digest('hex').slice(0,12);
const dataUrlToPng=url=>{const m=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(url||'');if(!m)throw new Error('需要 PNG 图片');const buf=Buffer.from(m[1],'base64');if(buf.length>96*1024*1024)throw new Error('图片过大');return buf;};

if(!app.requestSingleInstanceLock()){app.quit();}
else{
 app.on('second-instance',()=>showMain());
 app.whenReady().then(async()=>{
  web=await server.start(WEB_ROOT);
  createMain();createTray();applyLoginItem();
  await restoreLayers();
 });
}
app.on('before-quit',()=>{quitting=true;});
app.on('window-all-closed',()=>{}); // tray keeps us alive

function createMain(){
 mainWindow=new BrowserWindow({width:1440,height:960,minWidth:900,minHeight:640,show:!startHidden,title:'Desktop Rider',backgroundColor:'#f5f7fa',autoHideMenuBar:true,
  webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false,spellcheck:false}});
 mainWindow.loadURL(web.url);
 mainWindow.on('close',e=>{if(!quitting){e.preventDefault();mainWindow.hide();}}); // close = hide to tray
 mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https?:/.test(url))shell.openExternal(url);return {action:'deny'};});
}
function showMain(){if(!mainWindow)createMain();mainWindow.show();mainWindow.focus();}
function createTray(){
 const icon=nativeImage.createFromPath(path.join(__dirname,'assets','tray.png'));
 tray=new Tray(icon);tray.setToolTip('Desktop Rider');
 const rebuild=()=>tray.setContextMenu(Menu.buildFromTemplate([
  {label:'打开 Desktop Rider',click:showMain},
  {label:'隐藏桌面层',click:async()=>{for(const id of [...layers.keys()])await clearLayer(id);}},
  {type:'separator'},
  {label:'开机启动',type:'checkbox',checked:settings.openAtLogin,click:async item=>{await setSettings({openAtLogin:item.checked});rebuild();}},
  {type:'separator'},
  {label:'退出',click:()=>{quitting=true;app.quit();}}]));
 rebuild();tray.on('double-click',showMain);
}
function applyLoginItem(){if(process.platform==='win32'||process.platform==='darwin')app.setLoginItemSettings({openAtLogin:!!settings.openAtLogin,args:['--hidden']});}
async function setSettings(patch){if(patch&&typeof patch.openAtLogin==='boolean')settings.openAtLogin=patch.openAtLogin;await writeJson(SETTINGS,settings);applyLoginItem();return settings;}

// Monitors: the bridge on Windows (physical pixels, IDesktopWallpaper ids); Electron's displays elsewhere so the UI can be developed on any OS.
async function monitors(){
 if(process.platform==='win32')return native.monitors();
 return screen.getAllDisplays().map((d,i)=>({id:'electron:'+d.id,index:i,left:Math.round(d.bounds.x*d.scaleFactor),top:Math.round(d.bounds.y*d.scaleFactor),width:Math.round(d.bounds.width*d.scaleFactor),height:Math.round(d.bounds.height*d.scaleFactor),primary:d.id===screen.getPrimaryDisplay().id}));
}
async function apply({monitorId,background,overlay}={}){
 if(typeof monitorId!=='string'||!monitorId)throw new Error('缺少显示器');
 const list=await monitors(),monitor=list.find(m=>m.id===monitorId);if(!monitor)throw new Error('显示器已不存在，请刷新列表');
 await fsp.mkdir(DATA,{recursive:true});const key=keyOf(monitorId),stamp=Date.now();
 const file=path.join(DATA,`${key}-${stamp}.png`);await fsp.writeFile(file,dataUrlToPng(background));
 status('正在设置系统壁纸…');await native.setWallpaper(monitorId,file);
 for(const old of await fsp.readdir(DATA))if(old.startsWith(key+'-')&&old.endsWith('.png')&&!old.includes('overlay')&&old!==path.basename(file))fsp.unlink(path.join(DATA,old)).catch(()=>{});
 if(overlay){const ov=path.join(DATA,`${key}-overlay.png`);await fsp.writeFile(ov,dataUrlToPng(overlay));status('正在放置桌面层…');await showLayer(monitorId,monitor,ov,stamp);}
 else await clearLayer(monitorId);
 await saveLayers();status('已应用到显示器 '+(monitor.index+1));
 return {ok:true,file,layer:layers.has(monitorId)};
}
// A transparent, click-through window the size of the monitor, parented under the wallpaper host by the bridge.
async function showLayer(monitorId,monitor,file,stamp){
 let entry=layers.get(monitorId);
 if(!entry||entry.window.isDestroyed()){
  // Not resizable:false — Electron would pin the maximum size to the work area (monitor minus taskbar) and the bridge's SetWindowPos could never reach the full monitor height.
  const win=new BrowserWindow({x:0,y:0,width:monitor.width,height:monitor.height,frame:false,transparent:true,hasShadow:false,movable:false,minimizable:false,maximizable:false,skipTaskbar:true,focusable:false,show:false,title:'Desktop Rider Layer',
   webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setIgnoreMouseEvents(true);win.setMenuBarVisibility(false);
  entry={window:win,file,rect:{left:monitor.left,top:monitor.top,width:monitor.width,height:monitor.height},attached:false};layers.set(monitorId,entry);
  win.on('closed',()=>{if(layers.get(monitorId)===entry)layers.delete(monitorId);});
 }
 entry.file=file;entry.rect={left:monitor.left,top:monitor.top,width:monitor.width,height:monitor.height};
 const url='file://'+path.join(__dirname,'layer.html').replace(/\\/g,'/')+'?img='+encodeURIComponent('file://'+file.replace(/\\/g,'/'))+'&v='+stamp;
 await entry.window.loadURL(url);entry.window.showInactive();
 if(process.platform==='win32'){const result=await native.attachLayer(hwndOf(entry.window.getNativeWindowHandle()),entry.rect);entry.attached=true;entry.host=result.host;}
 else{entry.window.setBounds(screen.getAllDisplays()[monitor.index]?.bounds||{x:0,y:0,width:800,height:500});entry.window.setAlwaysOnTop(false);} // dev preview on other OSes: a plain window
}
async function clearLayer(monitorId){const entry=layers.get(monitorId);if(!entry)return;layers.delete(monitorId);
 if(process.platform==='win32'&&entry.attached&&!entry.window.isDestroyed()){try{await native.detachLayer(hwndOf(entry.window.getNativeWindowHandle()));}catch{}}
 if(!entry.window.isDestroyed())entry.window.destroy();await saveLayers();}
const saveLayers=()=>writeJson(LAYERS,[...layers].map(([monitorId,e])=>({monitorId,file:e.file,rect:e.rect})));
// Windows keeps the wallpaper itself; the layer windows are ours to bring back after a restart.
async function restoreLayers(){
 const saved=readJson(LAYERS,[]);if(!saved.length)return;
 let list=[];try{list=await monitors();}catch{return;}
 for(const item of saved){const monitor=list.find(m=>m.id===item.monitorId);if(!monitor||!fs.existsSync(item.file))continue;try{await showLayer(item.monitorId,monitor,item.file,Date.now());}catch(error){console.error('restore layer',error);}}
 await saveLayers();
}

ipcMain.on('client:version',e=>{e.returnValue=app.getVersion();});
ipcMain.handle('client:monitors',()=>monitors());
ipcMain.handle('client:apply',(e,request)=>apply(request));
ipcMain.handle('client:clear-layer',(e,monitorId)=>{if(typeof monitorId!=='string')throw new Error('缺少显示器');return clearLayer(monitorId);});
// One entry per live layer window; hwnd lets test/windows.cjs ask Win32 where the window ended up.
ipcMain.handle('client:layers',()=>[...layers].map(([monitorId,e])=>({monitorId,host:e.host||null,attached:!!e.attached,rect:e.rect,file:e.file,hwnd:process.platform==='win32'&&!e.window.isDestroyed()?hwndOf(e.window.getNativeWindowHandle()):null})));
ipcMain.handle('client:get-settings',()=>settings);
ipcMain.handle('client:set-settings',(e,patch)=>setSettings(patch));
process.on('unhandledRejection',error=>{console.error(error);if(mainWindow&&!mainWindow.isDestroyed())status('出错：'+(error?.message||error));});
