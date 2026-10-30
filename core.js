'use strict';
// Extension core. A module owns state.modules[id] and may add a sidebar view, an
// inspector panel, a desktop layer and an export step; see docs/modules.md.
// Modules register before app.js runs (script order in index.html); app.js mounts
// them at start-up. A module registered later is mounted at once.
const Rider=(()=>{
 const modules=[],handlers=new Map();let mounter=null;
 const clone=o=>JSON.parse(JSON.stringify(o));
 function register(mod){
  if(!mod||!/^[a-z][a-z0-9-]*$/.test(mod.id||''))throw new Error('模块需要小写字母开头的 id');
  if(modules.some(m=>m.id===mod.id))throw new Error('模块 id 重复：'+mod.id);
  mod={order:200,...mod};modules.push(mod);modules.sort((a,b)=>a.order-b.order);
  if(mounter)mounter(mod);return mod;
 }
 function on(event,fn){if(!handlers.has(event))handlers.set(event,new Set());handlers.get(event).add(fn);return()=>handlers.get(event).delete(fn);}
 function emit(event,payload){for(const fn of handlers.get(event)||[])try{fn(payload);}catch(error){console.error(`[${event}]`,error);}}
 // One module's error never stops the core or the other modules.
 function call(mod,hook,ctx){const fn=mod[hook];if(typeof fn!=='function')return;try{const out=fn.call(mod,ctx);if(out&&typeof out.then==='function')return out.catch(error=>console.error(`[module ${mod.id}] ${hook}`,error));return out;}catch(error){console.error(`[module ${mod.id}] ${hook}`,error);}}
 function moduleDefaults(){return Object.fromEntries(modules.map(m=>[m.id,clone(m.defaults||{})]));}
 // Each module sanitises its own slice; unknown slices are kept so a module that is
 // temporarily not loaded does not lose its data.
 function normalizeModules(input,clamp){
  const given=input&&typeof input==='object'?input:{},out={};
  for(const m of modules){const base=clone(m.defaults||{});let v={...base,...(given[m.id]&&typeof given[m.id]==='object'?given[m.id]:{})};
   if(m.normalize){try{v=m.normalize(v,{clamp,defaults:base})??v;}catch(error){console.error(`[module ${m.id}] normalize`,error);v=base;}}out[m.id]=v;}
  for(const id in given)if(!(id in out)&&given[id]&&typeof given[id]==='object')out[id]=given[id];
  return out;
 }
 // Private localStorage slot for data that does not belong in a scheme (caches, indexes).
 function storage(id){const key='desktop-rider:'+id;return {
  get(fallback=null){try{const v=JSON.parse(localStorage.getItem(key));return v===null?fallback:v;}catch{return fallback;}},
  set(value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}},
  remove(){localStorage.removeItem(key);}};}
 return {version:1,modules,register,on,emit,call,moduleDefaults,normalizeModules,storage,api:{},mount(fn){mounter=fn;modules.forEach(fn);}};
})();
