'use strict';
// Runs every browser regression in sequence against the dev server on 127.0.0.1:4173 and prints a summary.
//   node tools/verify-all.cjs [names…]      e.g. node tools/verify-all.cjs lyrics mascot
const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
const all=fs.readdirSync(__dirname).filter(f=>/^verify(-[\w-]+)?\.cjs$/.test(f)&&f!=='verify-all.cjs').sort();
const wanted=process.argv.slice(2);const list=wanted.length?all.filter(f=>wanted.some(w=>f.includes(w))):all;
const results=[];for(const f of list){const t0=Date.now();const r=spawnSync(process.execPath,[path.join(__dirname,f)],{encoding:'utf8',maxBuffer:64<<20});const ok=r.status===0;const last=((r.stdout||'')+(r.stderr||'')).trim().split(/\r?\n/).filter(Boolean).pop()||'';results.push({f,ok,ms:Date.now()-t0,last});console.log((ok?'PASS':'FAIL')+' '+f+' ('+Math.round((Date.now()-t0)/1000)+'s)'+(ok?'':'\n  '+last.slice(0,300)));}
const failed=results.filter(r=>!r.ok);console.log(`\n${results.length-failed.length}/${results.length} passed`+(failed.length?': '+failed.map(r=>r.f).join(', '):''));process.exit(failed.length?1:0);
