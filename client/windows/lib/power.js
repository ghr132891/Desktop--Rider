'use strict';
// Power-saving policy for the desktop layer's videos (live wallpaper pieces and video layers).
// Pure: main.js feeds it what it knows and sends the decision to layer.html (window.__setPaused).
//   suspended / locked  always pause — nobody can see the desktop
//   covered             a visible, non-minimised top-level window hides the whole monitor (native/bridge.ps1 `watch`)
//   onBattery           laptop unplugged
// `powerSave` (settings.powerSave, default on) gates the covered and battery rules only.
const ORDER=['suspended','locked','covered','battery'];
function decide({suspended=false,locked=false,covered=false,onBattery=false,powerSave=true}={}){
 const reasons=[];if(suspended)reasons.push('suspended');if(locked)reasons.push('locked');
 if(powerSave!==false){if(covered)reasons.push('covered');if(onBattery)reasons.push('battery');}
 reasons.sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b));
 return {paused:reasons.length>0,reason:reasons[0]||'',reasons};
}
module.exports={decide};
