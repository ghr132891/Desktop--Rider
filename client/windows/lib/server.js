'use strict';
// Loopback static server for the web app. The page uses Workers and fetches WASM/model files,
// which Chromium refuses over file://, so the client serves the repo (or the packaged web/
// folder) exactly like tools/serve.py does for development.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.webm':'video/webm','.mp4':'video/mp4','.mov':'video/quicktime','.tflite':'application/octet-stream','.bin':'application/octet-stream','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
function resolveFile(root,urlPath){
 let p;try{p=decodeURIComponent(urlPath.split('?')[0]);}catch{return null;}
 if(p.endsWith('/'))p+='index.html';
 const file=path.normalize(path.join(root,p));
 if(file!==root&&!file.startsWith(root+path.sep))return null; // never leave the web root
 return file;
}
// `api(req,res)` may claim requests under /api/ (returns true when handled) — the mascot's external-AI endpoints (main.js).
// `routes` maps URL prefixes to other directories ({'/client/':…,'/data/':…}) so the layer window and its media are same-origin.
function start(root,{host='127.0.0.1',port=0,api=null,routes={}}={}){
 root=path.resolve(root);const extra=Object.entries(routes).map(([prefix,dir])=>[prefix,path.resolve(dir)]);
 const server=http.createServer((req,res)=>{
  if(api&&(req.url||'').startsWith('/api/')){try{if(api(req,res))return;}catch(error){res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({ok:false,error:String(error.message||error)}));return;}}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  const url=req.url||'/',route=extra.find(([prefix])=>url.startsWith(prefix));
  const file=route?resolveFile(route[1],'/'+url.slice(route[0].length)):resolveFile(root,url);
  if(!file){res.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{
   if(error||!stat.isFile()){res.writeHead(404).end();return;}
   // Range requests: <video> seeks and loops only when the server answers 206 for byte ranges.
   const type=types[path.extname(file).toLowerCase()]||'application/octet-stream',range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
   let start=0,end=stat.size-1,code=200;
   if(range&&stat.size){if(range[1]===''&&range[2]!==''){start=Math.max(0,stat.size-Number(range[2]));}else{start=Number(range[1]||0);if(range[2]!=='')end=Math.min(end,Number(range[2]));}
    if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});res.end();return;}code=206;}
   const headers={'Content-Type':type,'Content-Length':end-start+1,'Cache-Control':'no-cache','Accept-Ranges':'bytes'};if(code===206)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
   res.writeHead(code,headers);
   if(req.method==='HEAD'||stat.size===0){res.end();return;}
   fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
  });
 });
 return new Promise((resolve,reject)=>{server.on('error',reject);server.listen(port,host,()=>{const a=server.address();resolve({server,url:`http://${host}:${a.port}/`,port:a.port,close:()=>new Promise(r=>server.close(r))});});});
}
module.exports={start,resolveFile,types};
