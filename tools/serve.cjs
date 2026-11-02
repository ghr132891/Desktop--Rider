'use strict';
// Dev server without Python: the same loopback static server the Windows client uses (client/windows/lib/server.js).
//   node tools/serve.cjs            → http://127.0.0.1:4173
const path=require('node:path');
const {start}=require(path.join(__dirname,'..','client','windows','lib','server.js'));
start(path.join(__dirname,'..'),{port:Number(process.env.PORT)||4173}).then(web=>console.log('Desktop Rider: '+web.url)).catch(e=>{console.error(e.message);process.exit(1);});
