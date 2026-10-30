'use strict';
// Unit tests for the OS-independent parts of the client: PowerShell argument building,
// handle conversion, JSON parsing and the loopback static server. Runs on any OS.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),http=require('node:http');
const native=require('../lib/native'),server=require('../lib/server');
const get=url=>new Promise((resolve,reject)=>http.get(url,res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));}).on('error',reject));

test('bridge arguments are passed as parameters, never interpolated',()=>{
 const a=native.args('set-wallpaper',{monitorId:'\\\\?\\DISPLAY#ABC#1&2&3',path:'C:\\Users\\x\\a b.png'});
 assert.deepEqual(a.slice(0,6),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',native.SCRIPT]);
 assert.deepEqual(a.slice(6),['-Command','set-wallpaper','-MonitorId','\\\\?\\DISPLAY#ABC#1&2&3','-Path','C:\\Users\\x\\a b.png']);
 assert.deepEqual(native.args('attach-layer',{hwnd:123456,left:-1920,top:0,width:1920,height:1080}).slice(8),['-Hwnd','123456','-Left','-1920','-Top','0','-Width','1920','-Height','1080']);
 assert.throws(()=>native.args('set-wallpaper',{monitorId:'bad\nid'}),/invalid monitor id/);
 assert.throws(()=>native.args('attach-layer',{hwnd:1.5}),/invalid hwnd/);
});
test('window handle buffers convert to numbers',()=>{
 const b8=Buffer.alloc(8);b8.writeBigUInt64LE(0x1234567n);assert.equal(native.hwndOf(b8),0x1234567);
 const b4=Buffer.alloc(4);b4.writeUInt32LE(0xabcd);assert.equal(native.hwndOf(b4),0xabcd);
 assert.throws(()=>native.hwndOf(Buffer.alloc(3)),/bad window handle/);
});
test('bridge output parsing and the runner contract',async()=>{
 assert.deepEqual(native.parse(' [{"id":"a"}]\r\n'),[{id:'a'}]);assert.throws(()=>native.parse(''),/nothing/);assert.throws(()=>native.parse('oops'),/invalid JSON/);
 const calls=[];const api=native.create({platform:'win32',runner:async list=>{calls.push(list);return list.includes('monitors')?'[{"id":"m1","index":0,"left":0,"top":0,"width":2560,"height":1440,"primary":true}]':'{"ok":true,"host":"workerw"}';}});
 assert.deepEqual(await api.monitors(),[{id:'m1',index:0,left:0,top:0,width:2560,height:1440,primary:true}]);
 assert.deepEqual(await api.attachLayer(77,{left:0,top:0,width:2560,height:1440}),{ok:true,host:'workerw'});
 assert.equal(calls.length,2);assert.ok(calls[1].includes('-Hwnd')&&calls[1].includes('77'));
 const mac=native.create({platform:'darwin',runner:async()=>'[]'});await assert.rejects(mac.monitors(),/只支持 Windows/);
});
test('static server serves the web root only',async()=>{
 const root=path.join(__dirname,'..','..','..');const s=await server.start(root);
 try{
  const index=await get(s.url);assert.equal(index.status,200);assert.match(index.headers['content-type'],/text\/html/);assert.ok(index.body.includes('Desktop Rider'));
  const js=await get(s.url+'core.js');assert.equal(js.status,200);assert.match(js.headers['content-type'],/javascript/);
  // The person worker does import('./vendor/mediapipe/vision_bundle.mjs'): modules need a JavaScript MIME type, WASM needs application/wasm.
  const mjs=await get(s.url+'vendor/mediapipe/vision_bundle.mjs');assert.equal(mjs.status,200);assert.match(mjs.headers['content-type'],/^text\/javascript/);
  assert.equal(server.types['.wasm'],'application/wasm');assert.equal(server.types['.tflite'],'application/octet-stream');
  assert.equal((await get(s.url+'missing.file')).status,404);
  assert.equal((await get(s.url+'..%2F..%2Fetc%2Fpasswd')).status,403);
  assert.equal(server.resolveFile(root,'/../package.json'),null);assert.equal(server.resolveFile(root,'/%ZZ'),null);
  assert.equal(server.resolveFile(root,'/'),path.join(root,'index.html'));
 }finally{await s.close();}
});
test('live wallpaper payload is validated before anything is written',()=>{
 const {checkLive}=require('../lib/live');
 const plan={width:1920,height:1080,gapColor:'#e9eff4',pieces:[{polygon:[[0,0],[1100,0],[900,1080],[0,1080]],x:-10,y:0,w:1940,h:1091},{polygon:[[1120,0],[1920,0],[1920,1080],[920,1080]],x:0,y:0,w:1920,h:1080}]};
 const ok=checkLive({type:'video/webm',bytes:new Uint8Array([1,2,3]).buffer,plan});
 assert.equal(ok.ext,'webm');assert.deepEqual([...ok.bytes],[1,2,3]);assert.deepEqual(ok.plan,plan);assert.notEqual(ok.plan.pieces,plan.pieces,'copied, not aliased');
 assert.equal(checkLive({type:'video/x-matroska',bytes:Buffer.from([1]),plan}).ext,'mp4','unknown container falls back to mp4');
 assert.throws(()=>checkLive({type:'video/mp4',bytes:new ArrayBuffer(0),plan}),/缺少视频/);
 assert.throws(()=>checkLive({type:'video/mp4',bytes:Buffer.from([1]),plan:{...plan,gapColor:'red'}}),/间隙颜色/);
 assert.throws(()=>checkLive({type:'video/mp4',bytes:Buffer.from([1]),plan:{...plan,pieces:[]}}),/分块/);
 assert.throws(()=>checkLive({type:'video/mp4',bytes:Buffer.from([1]),plan:{...plan,pieces:[{polygon:[[0,0],[1,0]],x:0,y:0,w:1,h:1}]}}),/分块/);
 assert.throws(()=>checkLive({type:'video/mp4',bytes:Buffer.from([1]),plan:{...plan,pieces:[{polygon:[[0,0],[1,0],[1,1]],x:0,y:0,w:0,h:1}]}}),/分块/);
 assert.throws(()=>checkLive({type:'video/mp4',bytes:Buffer.from([1]),plan:{...plan,width:1.5}}),/几何/);
 assert.throws(()=>checkLive(null),/无效/);
});
