'use strict';
// The only bridge between the page and the OS. modules/client.js in the web app checks
// window.desktopRider to know it runs inside the client; every call goes through validated IPC.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktopRider',{
 platform:process.platform,
 version:ipcRenderer.sendSync('client:version'),
 monitors:()=>ipcRenderer.invoke('client:monitors'),
 // {monitorId, background: PNG data URL, overlay: PNG data URL | null}
 applyWallpaper:request=>ipcRenderer.invoke('client:apply',request),
 clearLayer:monitorId=>ipcRenderer.invoke('client:clear-layer',monitorId),
 layers:()=>ipcRenderer.invoke('client:layers'), // [{monitorId, host, attached, rect, file, hwnd}]
 getSettings:()=>ipcRenderer.invoke('client:get-settings'),
 setSettings:patch=>ipcRenderer.invoke('client:set-settings',patch),
 onStatus:handler=>{const fn=(_,msg)=>handler(msg);ipcRenderer.on('client:status',fn);return()=>ipcRenderer.removeListener('client:status',fn);}
});
