'use strict';
// Observe real native menu updates before the application starts. Login-item changes are
// intercepted here because a temporary userData directory alone does not isolate OS startup settings.
const {app,Tray}=require('electron');
const probe=global.__smoke={menu:null,menuUpdates:0,loginSettings:[]};
app.setLoginItemSettings=settings=>{probe.loginSettings.push(structuredClone(settings));};
const setContextMenu=Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu=function(menu){
 const result=setContextMenu.call(this,menu);probe.menu=menu;probe.menuUpdates++;return result;
};
require('../main.js');
