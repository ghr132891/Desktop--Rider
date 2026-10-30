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

test('video layer payload is validated before anything is written',()=>{
 const {checkClips}=require('../lib/live');
 const clip={name:'c',type:'video/webm',bytes:new Uint8Array([1,2]).buffer,x:100,y:50,w:200,h:100,rotate:10,flipX:true,opacity:80,blur:2,hue:0,saturate:100,brightness:100,radius:5,blend:'multiply',fit:'cover',above:true};
 assert.deepEqual(checkClips(undefined),[]);assert.deepEqual(checkClips([]),[]);
 const [ok]=checkClips([clip]);assert.equal(ok.ext,'webm');assert.equal(ok.bytes.length,2);assert.equal(ok.item.blend,'multiply');assert.equal(ok.item.above,true);assert.equal(ok.item.flipX,true);assert.equal('bytes' in ok.item,false);
 assert.throws(()=>checkClips([{...clip,bytes:new ArrayBuffer(0)}]),/缺少数据/);
 assert.throws(()=>checkClips([{...clip,w:0}]),/几何/);
 assert.throws(()=>checkClips([{...clip,blend:'hue'}]),/样式/);
 assert.throws(()=>checkClips([{...clip,fit:'stretch'}]),/样式/);
 assert.throws(()=>checkClips(Array.from({length:7},()=>clip)),/最多/);
 assert.throws(()=>checkClips('x'),/无效/);
});

test('power policy: lock and suspend always pause, cover and battery only with power saving on',()=>{
 const {decide}=require('../lib/power');
 assert.deepEqual(decide({}),{paused:false,reason:'',reasons:[]});
 assert.equal(decide({covered:true}).reason,'covered');assert.equal(decide({onBattery:true}).reason,'battery');
 assert.deepEqual(decide({covered:true,onBattery:true,powerSave:false}),{paused:false,reason:'',reasons:[]});
 assert.equal(decide({locked:true,powerSave:false}).reason,'locked');assert.equal(decide({suspended:true,covered:true}).reason,'suspended');
 assert.deepEqual(decide({locked:true,covered:true,onBattery:true}).reasons,['locked','covered','battery']);
});
test('covering watcher: bridge arguments and line parsing',()=>{
 const native=require('../lib/native');
 const list=native.args('watch',{hwnd:42,left:0,top:0,width:1024,height:768});
 assert.deepEqual(list.slice(-12),['-Command','watch','-Hwnd','42','-Left','0','-Top','0','-Width','1024','-Height','768']);
 const seen=[];const feed=native.lineReader(l=>seen.push(l));feed('{"covered":false}\n{"cov');feed('ered":true,"class":"Chrome_WidgetWin_1"}\r\n\n');
 assert.deepEqual(seen,['{"covered":false}','{"covered":true,"class":"Chrome_WidgetWin_1"}']);
 const states=[];const {EventEmitter}=require('node:events');let killed=false;
 const child=Object.assign(new EventEmitter(),{stdout:new EventEmitter(),stderr:new EventEmitter(),kill(){killed=true;}});
 const api=native.create({platform:'win32',spawner:()=>child});const w=api.watchCovering(7,{left:0,top:0,width:10,height:10},s=>states.push(s));
 child.stdout.emit('data','{"covered":true,"zoomed":true}\nnot json\n{"covered":false}\n');w.stop();
 assert.deepEqual(states,[{covered:true,zoomed:true},{covered:false}]);assert.equal(killed,true);
 assert.deepEqual(native.create({platform:'darwin'}).watchCovering(1,{left:0,top:0,width:1,height:1},()=>{}).stop(),undefined);
});

test('lyrics: LRC parsing, matching and the two providers through a fake fetch',async()=>{
 const L=require('../lib/lyrics');
 assert.deepEqual(L.parseLRC('[ti:x]\n[00:01.50][00:03.25]同一句\n[00:02.000]第二句').map(l=>[l.t,l.text]),[[1.5,'同一句'],[2,'第二句'],[3.25,'同一句']]);
 assert.deepEqual(L.mergeTrans([{t:2,text:'a'}],[{t:2.1,text:'A'}]),[{t:2,text:'a',trans:'A'}]);
 assert.equal(L.clean('晴天 (Live) - Remix【官方】'),'晴天');
 const cands=[{id:'1',title:'晴天',artist:'周杰伦',duration:269},{id:'2',title:'晴天 (钢琴版)',artist:'某某',duration:200},{id:'3',title:'阴天',artist:'周杰伦'}];
 assert.equal(L.pickBest(cands,{title:'晴天',artist:'周杰伦',duration:270}).id,'1');assert.equal(L.pickBest(cands,{title:'阴天',artist:'莫文蔚'}).id,'3');assert.equal(L.pickBest(cands,{title:'夜曲',artist:'周杰伦'}),null);
 const b64=s=>Buffer.from(s,'utf8').toString('base64');const calls=[];
 const fetch=async(url)=>{calls.push(url);const body=url.includes('music.163.com/api/search')?{result:{songs:[{id:9,name:'晴天',artists:[{name:'周杰伦'}],duration:269000}]}}
  :url.includes('music.163.com/api/song/lyric')?{lrc:{lyric:'[00:01.00]故事的小黄花\n[00:04.00]从出生那年就飘着'},tlyric:{lyric:'[00:01.00]little flower'}}
  :url.includes('client_search_cp')?'MusicJsonCallback({"data":{"song":{"list":[{"mid":"m1","name":"晴天","singer":[{"name":"周杰伦"}],"interval":269}]}}})'
  :url.includes('fcg_query_lyric_new')?{lyric:b64('[00:02.00]QQ 第一句'),trans:b64('[00:02.00]first')}:null;
  return {json:async()=>body,text:async()=>typeof body==='string'?body:JSON.stringify(body)};};
 const ne=await L.findLyrics({title:'晴天',artist:'周杰伦',duration:269},{fetch});
 assert.equal(ne.provider,'netease');assert.equal(ne.id,'9');assert.deepEqual(ne.lines[0],{t:1,text:'故事的小黄花',trans:'little flower'});assert.equal(ne.lines.length,2);
 const qq=await L.findLyrics({title:'晴天',artist:'周杰伦'},{fetch,provider:'qq'});assert.equal(qq.provider,'qq');assert.deepEqual(qq.lines,[{t:2,text:'QQ 第一句',trans:'first'}]);
 // auto: 网易云 has nothing → QQ音乐 answers; an explicit query takes the first hit.
 const empty=async(url)=>url.includes('music.163.com')?{json:async()=>({result:{songs:[]}}),text:async()=>'{}'}:fetch(url);
 assert.equal((await L.findLyrics({title:'晴天',artist:'周杰伦'},{fetch:empty})).provider,'qq');
 assert.equal((await L.findLyrics({title:'x',artist:'y',query:'晴天 周杰伦'},{fetch,provider:'netease'})).id,'9');
 await assert.rejects(L.findLyrics({title:'夜曲',artist:'周杰伦'},{fetch,provider:'netease'}),/没有匹配/);
 await assert.rejects(L.findLyrics({title:'',artist:''},{fetch}),/没有可搜索/);
 assert.deepEqual(L.jsonp('cb({"a":1});'),{a:1});
});

test('lyrics payload is validated before it reaches the layer window',()=>{
 const {checkLyrics}=require('../lib/live');
 const style={x:960,y:840,width:1536,size:64.8,font:'"Microsoft YaHei"',weight:600,color:'#FFFFFF',stroke:true,strokeColor:'#1b2a3f',shadow:true,align:'center',transition:'fade',duration:.5,next:true,nextOpacity:55,trans:true};
 assert.equal(checkLyrics(null),null);assert.equal(checkLyrics(undefined),null);
 const ok=checkLyrics({source:{mode:'manual',provider:'qq',lrc:'[00:01.00]a',offset:.5},style});
 assert.equal(ok.source.mode,'manual');assert.equal(ok.source.provider,'qq');assert.equal(ok.style.color,'#ffffff');assert.equal(ok.style.offset,.5);assert.equal(ok.style.stroke,true);
 assert.equal(checkLyrics({style}).source.mode,'auto');
 assert.throws(()=>checkLyrics({style:{...style,transition:'zoom'}}),/样式/);assert.throws(()=>checkLyrics({style:{...style,size:0}}),/样式/);assert.throws(()=>checkLyrics({style:{...style,color:'red'}}),/样式/);assert.throws(()=>checkLyrics('x'),/无效/);
});
