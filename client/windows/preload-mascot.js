'use strict';
// Bridge for the mascot window (mascot.html): hover state for click-through toggling, interaction events out,
// commands / music / pause state in. Everything crosses validated IPC in main.js.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('mascotBridge',{
 hover:over=>ipcRenderer.send('mascot:hover',!!over),
 event:ev=>ipcRenderer.send('mascot:event',ev),
 onCommand:handler=>{ipcRenderer.on('mascot:command',(e,cmd,id)=>{let result;try{result=handler(cmd);}catch(error){result={ok:false,error:String(error?.message||error)};}ipcRenderer.send('mascot:result',id,result);});},
 onMusic:handler=>{ipcRenderer.on('mascot:music',(e,m)=>handler(m));},
 onPaused:handler=>{ipcRenderer.on('mascot:paused',(e,p)=>handler(!!p));}
});
