'use strict';
// Loopback static server for the web app. The page uses Workers and fetches WASM/model files,
// which Chromium refuses over file://, so the client serves the repo (or the packaged web/
// folder) exactly like tools/serve.py does for development.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.tflite':'application/octet-stream','.bin':'application/octet-stream','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
function resolveFile(root,urlPath){
 let p;try{p=decodeURIComponent(urlPath.split('?')[0]);}catch{return null;}
 if(p.endsWith('/'))p+='index.html';
 const file=path.normalize(path.join(root,p));
 if(file!==root&&!file.startsWith(root+path.sep))return null; // never leave the web root
 return file;
}
function start(root,{host='127.0.0.1',port=0}={}){
 root=path.resolve(root);
 const server=http.createServer((req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  const file=resolveFile(root,req.url||'/');
  if(!file){res.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{
   if(error||!stat.isFile()){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});
   if(req.method==='HEAD'){res.end();return;}
   fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  });
 });
 return new Promise((resolve,reject)=>{server.on('error',reject);server.listen(port,host,()=>{const a=server.address();resolve({server,url:`http://${host}:${a.port}/`,port:a.port,close:()=>new Promise(r=>server.close(r))});});});
}
module.exports={start,resolveFile,types};
