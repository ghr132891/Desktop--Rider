'use strict';
// Where the browser regressions find Playwright, in this order:
//   1. PLAYWRIGHT_PATH   — any directory or module path (e.g. a global install), for other machines / Codex / CI
//   2. a project or global `playwright` package resolvable from here (npm i -D playwright, or npm i -g playwright + NODE_PATH)
//   3. the Codex runtime copy on the original development Mac
// The tests also need a Chrome install (they launch channel 'chrome'); set PLAYWRIGHT_CHANNEL to pick another channel.
const candidates=[process.env.PLAYWRIGHT_PATH,'playwright','/Users/tu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].filter(Boolean);
let mod=null,tried=[];
for(const c of candidates){try{mod=require(c);break;}catch(error){tried.push(c+' ('+(error.code||error.message)+')');}}
if(!mod)throw new Error('Playwright not found. Set PLAYWRIGHT_PATH or run `npm i -D playwright`. Tried: '+tried.join(', '));
// pngjs (tools/verify-wallpaper.cjs): PNGJS_PATH, a resolvable `pngjs`, or the copy next to the Playwright install.
function pngjs(){const list=[process.env.PNGJS_PATH,'pngjs',...candidates.filter(c=>c!=='playwright').map(c=>c.replace(/[\\/]playwright[\\/]?$/,'')+'/pngjs')].filter(Boolean);for(const c of list){try{return require(c);}catch{}}throw new Error('pngjs not found. Set PNGJS_PATH or run `npm i -D pngjs`.');}
module.exports={...mod,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',get pngjs(){return pngjs();}};
