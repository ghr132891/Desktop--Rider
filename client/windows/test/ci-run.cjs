'use strict';
// Runs a command for CI and, when it fails, repeats the last lines of its output as a GitHub error annotation,
// so a failing step is readable on the public run page (logs need a login). Usage: node test/ci-run.cjs <title> <cmd...>
const {spawnSync}=require('node:child_process');
const [title,...cmd]=process.argv.slice(2);
const r=spawnSync(cmd.join(' '),{shell:true,encoding:'utf8',maxBuffer:64<<20,stdio:['ignore','pipe','pipe']});
process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
if(r.status!==0){const tail=((r.stdout||'')+'\n'+(r.stderr||'')).trim().split(/\r?\n/).slice(-40).join('%0A');
 if(process.env.GITHUB_ACTIONS)console.log(`::error title=${title}::exit ${r.status}%0A${tail}`);process.exit(r.status||1);}
