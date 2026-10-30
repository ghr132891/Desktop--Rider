'use strict';
// Lyrics for the desktop layer: track matching and the two lyric sites the user can pick — QQ音乐 (逐字 QRC via the
// musicu endpoint, decrypted by lib/qrc.js, with the base64 LRC endpoint as fallback) and 网易云音乐 (line LRC +
// translation) — through their public web endpoints (unofficial, no login; they may change). Parsing is the shared
// renderer's (lyrics-view.js, injected with use()), so the layer shows exactly what was parsed. `fetch` is
// injectable so matching and parsing are unit-tested without the network.
const {decryptQRC,lyricContent}=require('./qrc');
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
let View=null;function use(view){View=view;return module.exports;}
const view=()=>{if(!View)throw new Error('lyrics-view.js not loaded: call use(LyricsView) first');return View;};
const parseLRC=text=>view().parseLRC(text),parseAny=text=>view().parse(text),mergeTrans=(lines,trans)=>view().merge(lines,trans);
// "歌名 (feat. X) - Live【版本】" → "歌名": the parts players add that search engines trip over.
const clean=s=>String(s||'').replace(/[\(（\[【][^\)）\]】]*[\)）\]】]/g,' ').replace(/\s*[-–—]\s*(live|remix|acoustic|version|ver\.?|cover|instrumental|demo).*$/i,' ').replace(/\s+/g,' ').trim().toLowerCase();
const artists=s=>clean(s).split(/[\/,&、;；\s]+/).filter(Boolean);
// Higher is better: exact title, then artist overlap, then duration closeness; a title that does not even contain the other scores nothing.
function score(cand,want){const ct=clean(cand.title),wt=clean(want.title);if(!ct||!wt)return 0;let s=ct===wt?60:ct.includes(wt)||wt.includes(ct)?30:0;if(!s)return 0;
 const ca=artists(cand.artist),wa=artists(want.artist);if(wa.length){const hit=wa.filter(a=>ca.some(c=>c===a||c.includes(a)||a.includes(c))).length;s+=hit?25+hit*5:-15;}
 if(want.duration&&cand.duration){const d=Math.abs(want.duration-cand.duration);s+=d<3?15:d<10?5:-10;}return s;}
function pickBest(cands,want){let best=null,bs=0;for(const c of cands){const sc=score(c,want);if(sc>bs){bs=sc;best=c;}}return best;}
// QQ's endpoints sometimes wrap the JSON in a callback: MusicJsonCallback({...})
function jsonp(text){const t=String(text||'').trim();const m=/^[\w.$]+\((.*)\)\s*;?$/s.exec(t);return JSON.parse(m?m[1]:t);}
const QQ_HEADERS={Referer:'https://y.qq.com/','User-Agent':UA},NE_HEADERS={Referer:'https://music.163.com/','User-Agent':UA};
const providers={
 netease:{name:'网易云音乐',
  async search(q,fetch,signal){const r=await fetch('https://music.163.com/api/search/get/web?s='+encodeURIComponent(q)+'&type=1&offset=0&limit=8',{headers:NE_HEADERS,signal});const j=await r.json();
   return (j?.result?.songs||[]).map(s=>({id:String(s.id),title:s.name||'',artist:(s.artists||s.ar||[]).map(a=>a.name).join('/'),album:s.album?.name||s.al?.name||'',duration:(s.duration||s.dt||0)/1000}));},
  // Line lyrics + translation. (网易云's word-level YRC only comes through its encrypted eapi; not used here.)
  async lyric(cand,fetch,signal){const r=await fetch(`https://music.163.com/api/song/lyric?id=${encodeURIComponent(cand.id)}&lv=1&tv=1`,{headers:NE_HEADERS,signal});const j=await r.json();return {lrc:j?.lrc?.lyric||'',tlyric:j?.tlyric?.lyric||''};}},
 qq:{name:'QQ音乐',
  async search(q,fetch,signal){const r=await fetch('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w='+encodeURIComponent(q)+'&format=json&n=8&p=1&t=0&cr=1&new_json=1',{headers:QQ_HEADERS,signal});const j=jsonp(await r.text());
   return (j?.data?.song?.list||[]).map(s=>({id:s.mid||s.songmid||'',songId:Number(s.id||s.songid)||0,title:s.name||s.songname||'',artist:(s.singer||[]).map(x=>x.name).join('/'),album:s.album?.name||s.albumname||'',duration:s.interval||0}));},
  // 逐字 (QRC, encrypted hex) through musicu GetPlayLyricInfo; falls back to the base64 LRC endpoint.
  async lyric(cand,fetch,signal){
   if(cand.songId){try{const body={comm:{ct:'19',cv:'1859',uin:'0'},req:{method:'GetPlayLyricInfo',module:'music.musichallSong.PlayLyricInfo',param:{trans_t:0,roma_t:0,crypt:1,lrc_t:0,interval:0,trans:1,ct:6,singerName:'',type:0,qrc_t:0,cv:80600,roma:0,songID:cand.songId,qrc:1,albumName:'',songName:''}}};
     const r=await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg',{method:'POST',headers:{...QQ_HEADERS,'Content-Type':'application/json'},body:JSON.stringify(body),signal});const j=jsonp(await r.text()),d=j?.req?.data;
     if(d&&typeof d.lyric==='string'&&d.lyric){const dec=s=>s?(d.crypt?lyricContent(decryptQRC(s)):Buffer.from(s,'base64').toString('utf8')):'';return {lrc:dec(d.lyric),tlyric:dec(d.trans)};}}catch{/* fall through to the LRC endpoint */}}
   const r=await fetch(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(cand.id)}&format=json&nobase64=0&g_tk=5381`,{headers:QQ_HEADERS,signal});const j=jsonp(await r.text());
   const b64=s=>s?Buffer.from(String(s),'base64').toString('utf8'):'';return {lrc:b64(j?.lyric),tlyric:b64(j?.trans)};}}
};
// want = {title, artist, duration?, query?}; provider 'auto' tries QQ音乐 (逐字) then 网易云. Resolves {provider,id,title,artist,lines,words} or throws.
async function findLyrics(want,{provider='auto',fetch=globalThis.fetch,timeout=8000}={}){
 const order=provider==='qq'?['qq']:provider==='netease'?['netease']:['qq','netease'];const q=(want.query||'').trim()||[want.title,want.artist].filter(Boolean).join(' ').trim();
 if(!q)throw new Error('没有可搜索的歌名');let lastError=null;
 for(const key of order){const p=providers[key],ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
  try{const cands=await p.search(q,fetch,ctl.signal);const best=want.query?cands[0]||null:pickBest(cands,want);if(!best)throw new Error(p.name+'没有匹配的歌曲');
   const {lrc,tlyric}=await p.lyric(best,fetch,ctl.signal);const lines=mergeTrans(parseAny(lrc),parseAny(tlyric));if(!lines.length)throw new Error(p.name+'没有这首歌的歌词');
   return {provider:key,id:best.id,title:best.title,artist:best.artist,lines,words:lines.some(l=>l.words&&l.words.length)};}
  catch(error){lastError=error;}finally{clearTimeout(timer);}}
 throw lastError||new Error('没有找到歌词');
}
module.exports={use,parseLRC,parseAny,mergeTrans,clean,score,pickBest,findLyrics,providers,jsonp};
