'use strict';
// Runs native/bridge.ps1 (Windows PowerShell 5.1) and parses its JSON. Everything here is
// plain Node so it can be unit-tested on any OS with an injected runner.
const path=require('node:path'),{execFile}=require('node:child_process');
const SCRIPT=path.join(__dirname,'..','native','bridge.ps1');
const ID=/^[\x20-\x7e]{1,512}$/; // IDesktopWallpaper monitor ids are printable ASCII device paths
function args(command,params={}){
 const out=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',SCRIPT,'-Command',command];
 const add=(flag,value)=>{if(value!==undefined&&value!==null)out.push(flag,String(value));};
 if(params.monitorId!==undefined){if(!ID.test(params.monitorId))throw new Error('invalid monitor id');add('-MonitorId',params.monitorId);}
 if(params.path!==undefined)add('-Path',params.path);
 for(const k of ['hwnd','left','top','width','height'])if(params[k]!==undefined){if(!Number.isInteger(params[k]))throw new Error('invalid '+k);add('-'+k[0].toUpperCase()+k.slice(1),params[k]);}
 return out;
}
// Electron's getNativeWindowHandle() gives the HWND as a little-endian buffer.
function hwndOf(buffer){if(!Buffer.isBuffer(buffer)||!(buffer.length===8||buffer.length===4))throw new Error('bad window handle');return buffer.length===8?Number(buffer.readBigUInt64LE(0)):buffer.readUInt32LE(0);}
function parse(stdout){const text=String(stdout).trim();if(!text)throw new Error('bridge returned nothing');try{return JSON.parse(text);}catch{throw new Error('bridge returned invalid JSON: '+text.slice(0,200));}}
function defaultRunner(list){return new Promise((resolve,reject)=>{execFile('powershell.exe',list,{windowsHide:true,timeout:30000,maxBuffer:1<<20},(error,stdout,stderr)=>{if(error)reject(new Error((stderr||error.message).toString().trim().split('\n').slice(-3).join(' ')));else resolve(stdout);});});}
function create({runner=defaultRunner,platform=process.platform}={}){
 const run=async(command,params)=>{if(platform!=='win32')throw new Error('系统壁纸与桌面层目前只支持 Windows');return parse(await runner(args(command,params)));};
 return {
  monitors:()=>run('monitors').then(list=>Array.isArray(list)?list:[]),
  setWallpaper:(monitorId,file)=>run('set-wallpaper',{monitorId,path:file}),
  attachLayer:(hwnd,rect)=>run('attach-layer',{hwnd,left:rect.left,top:rect.top,width:rect.width,height:rect.height}),
  detachLayer:hwnd=>run('detach-layer',{hwnd})
 };
}
module.exports={create,args,parse,hwndOf,SCRIPT};
