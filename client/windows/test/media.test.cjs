'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const native=require('../lib/native');

// QQMusic 22.13 on Win11: the timeline advanced and Pause was available, but raw SMTC status was 2.
const qq={sessions:1,playing:false,status:'Changing',app:'QQMusic.exe',title:'测试歌曲',artist:'测试歌手',
 position:145.26,duration:259.27,updated:1794135578818,controls:{playEnabled:false,pauseEnabled:true,toggleEnabled:true}};

test('SMTC normalization recognizes the observed Changing/controls contradiction without losing raw observations',()=>{
 const before=structuredClone(qq),m=native.normalizeMedia(qq);
 assert.equal(m.playing,true);assert.equal(m.playingInferred,true);assert.equal(native.mediaActive(m),true);
 assert.equal(m.status,'Changing');assert.equal(m.position,qq.position);assert.equal(m.updated,qq.updated);
 assert.deepEqual(qq,before,'normalization must not mutate the raw observation');
 assert.deepEqual(native.normalizeMedia(m),m,'normalizing twice is harmless');
 for(const status of [2,'2'])assert.equal(native.normalizeMedia({...qq,status}).playing,true);
 for(const app of ['qqmusic.EXE','C:\\Program Files\\QQMusic\\QQMusic.exe','C:/Apps/qqmusic.EXE']){
  const observed=native.normalizeMedia({...qq,app});
  assert.equal(observed.playing,true,app);assert.equal(observed.playingInferred,true,app);assert.equal(native.mediaActive(observed),true,app);
 }
 assert.equal(native.normalizeMedia({...qq,position:0}).playing,true,'the first valid frame can start at zero');
});

test('idle, ambiguous and incomplete observations do not activate the Changing workaround',()=>{
 const patches=[
  {sessions:0},{sessions:-1},{controls:undefined},{controls:{}},
  ...[null,'','cloudmusic.exe','Spotify.exe','QQMusic','QQMusic.exe.other','Other.QQMusic.exe'].map(app=>({app})),
  {controls:{playEnabled:true,pauseEnabled:true}},{controls:{playEnabled:false,pauseEnabled:false}},
  {controls:{playEnabled:true,pauseEnabled:false}},{controls:{playEnabled:'false',pauseEnabled:'true'}},
  {title:''},{title:'   '},{title:null},{duration:0},{duration:NaN},{duration:Infinity},
  {position:undefined},{position:-1},{position:Infinity},{position:qq.duration+2},
  ...['Opened','Closed','Stopped',0,1,3,'unknown'].map(status=>({status}))
 ];
 for(const patch of patches){
  const raw={...qq,...patch},m=native.normalizeMedia(raw);
  assert.equal(m.playing,false,JSON.stringify(patch));assert.equal(m.playingInferred,false,JSON.stringify(patch));
  assert.equal(native.mediaActive(m),false,JSON.stringify(patch));
 }
 assert.equal(native.mediaActive({...qq,controls:null,playing:true,playingInferred:true}),false,'flags cannot bypass the control/timeline checks');
});

test('standard Playing and Paused states remain authoritative, including a seek while paused',()=>{
 for(const status of ['Playing',4,'4']){
  const m=native.normalizeMedia({...qq,status,controls:{playEnabled:true,pauseEnabled:false}});
  assert.equal(m.playing,true);assert.equal(m.playingInferred,false);assert.equal(native.mediaActive(m),true);
 }
 assert.equal(native.normalizeMedia({...qq,app:'cloudmusic.exe',status:'Playing'}).playing,true,'other players still use their authoritative standard status');
 for(const status of ['Paused',5,'5'])for(const position of [39.27,120.50,4.25]){
  const m=native.normalizeMedia({...qq,status,playing:true,position,controls:{playEnabled:true,pauseEnabled:false}});
  assert.equal(m.playing,false,'a position jump or stale boolean is not resume');
  assert.equal(m.playingInferred,false);assert.equal(native.mediaActive(m),true);
  assert.equal(m.position,position);assert.equal(m.updated,qq.updated);
 }
 assert.equal(native.normalizeMedia({...qq,status:'Paused',position:120.5}).playing,false,'even stale Pause-only controls cannot override an explicit Paused state');
 const idle=native.normalizeMedia({sessions:0,playing:false,error:'media service unavailable'});
 assert.equal(idle.playing,false);assert.equal(native.mediaActive(idle),false);assert.equal(idle.error,'media service unavailable');
 const legacy=native.normalizeMedia({sessions:1,playing:false,position:0});
 assert.equal(legacy.playing,false);assert.equal(native.mediaActive(legacy),true,'older bridge outputs retain their established contract');
 assert.equal(native.normalizeMedia(null),null);
});

test('one-shot media queries use the same normalization as the watcher',async()=>{
 const calls=[],api=native.create({platform:'win32',runner:async args=>{calls.push(args);return JSON.stringify(qq);}});
 assert.deepEqual(await api.media(),native.normalizeMedia(qq));
 assert.equal(calls.length,1);assert.equal(calls[0].at(-1),'media');
});

test('watchMedia normalizes state changes and preserves Chinese metadata split across pipe chunks',()=>{
 let killed=false,command;
 const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill(){killed=true;}});
 const seen=[],api=native.create({platform:'win32',spawner:args=>{command=args;return child;}});
 const watcher=api.watchMedia(m=>seen.push(m));assert.equal(command.at(-1),'watch-media');
 const bytes=Buffer.from(JSON.stringify(qq)+'\n'),split=bytes.indexOf(Buffer.from('测试歌曲'))+1;
 child.stdout.write(bytes.subarray(0,split));assert.deepEqual(seen,[],'an incomplete line is not emitted');
 child.stdout.write(bytes.subarray(split));
 child.stdout.write('not JSON\n');
 const paused={...qq,status:'Paused',position:39.27,controls:{playEnabled:true,pauseEnabled:false}};
 child.stdout.write(JSON.stringify(paused)+'\r\n');
 child.stdout.write(JSON.stringify({sessions:0,playing:false})+'\n');
 assert.deepEqual(seen,[qq,paused,{sessions:0,playing:false}].map(native.normalizeMedia));
 assert.equal(seen[0].title,qq.title);assert.equal(seen[0].playing,true);assert.equal(seen[1].playing,false);
 watcher.stop();assert.equal(killed,true);
 child.stdout.destroy();child.stderr.destroy();
});
