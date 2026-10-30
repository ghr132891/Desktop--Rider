'use strict';
// Lyrics for the desktop layer: LRC parsing (same rules as modules/lyrics.js) and the two lyric sites the user
// can pick — 网易云音乐 and QQ音乐 — through their public web endpoints (unofficial, no login; they may change).
// `fetch` is injectable so the matching and parsing are unit-tested without the network.
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
function parseLRC(text){const out=[];for(const raw of String(text||'').split(/\r?\n/)){const stamps=[...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];if(!stamps.length)continue;const words=raw.replace(/\[[^\]]*\]/g,'').trim();
  for(const m of stamps){const frac=m[3]?Number(('0.'+m[3]).slice(0,5)):0;out.push({t:Number(m[1])*60+Number(m[2])+frac,text:words});}}
 out.sort((a,b)=>a.t-b.t);return out;}
function mergeTrans(lines,trans){if(!trans?.length)return lines;return lines.map(l=>{const hit=trans.find(x=>Math.abs(x.t-l.t)<.3&&x.text);return hit?{...l,trans:hit.text}:l;});}
// "歌名 (feat. X) - Live【版本】" → "歌名": the parts players add that search engines trip over.
const clean=s=>String(s||'').replace(/[\(（\[【][^\)）\]】]*[\)）\]】]/g,' ').replace(/\s*[-–—]\s*(live|remix|acoustic|version|ver\.?|cover|instrumental|demo).*$/i,' ').replace(/\s+/g,' ').trim().toLowerCase();
const artists=s=>clean(s).split(/[\/,&、;；\s]+/).filter(Boolean);
// Higher is better: exact title, then artist overlap, then duration closeness; a title that does not even contain the other scores nothing.
function score(cand,want){const ct=clean(cand.title),wt=clean(want.title);if(!ct||!wt)return 0;let s=ct===wt?60:ct.includes(wt)||wt.includes(ct)?30:0;if(!s)return 0;
 const ca=artists(cand.artist),wa=artists(want.artist);if(wa.length){const hit=wa.filter(a=>ca.some(c=>c===a||c.includes(a)||a.includes(c))).length;s+=hit?25+hit*5:-15;}
 if(want.duration&&cand.duration){const d=Math.abs(want.duration-cand.duration);s+=d<3?15:d<10?5:-10;}return s;}
function pickBest(cands,want){let best=null,bs=0;for(const c of cands){const sc=score(c,want);if(sc>bs){bs=sc;best=c;}}return best;}
const providers={
 netease:{name:'网易云音乐',
  async search(q,fetch,signal){const r=await fetch('https://music.163.com/api/search/get/web?s='+encodeURIComponent(q)+'&type=1&offset=0&limit=8',{headers:{Referer:'https://music.163.com/','User-Agent':UA},signal});const j=await r.json();
   return (j?.result?.songs||[]).map(s=>({id:String(s.id),title:s.name||'',artist:(s.artists||s.ar||[]).map(a=>a.name).join('/'),album:s.album?.name||s.al?.name||'',duration:(s.duration||s.dt||0)/1000}));},
  async lyric(id,fetch,signal){const r=await fetch(`https://music.163.com/api/song/lyric?id=${encodeURIComponent(id)}&lv=1&tv=1`,{headers:{Referer:'https://music.163.com/','User-Agent':UA},signal});const j=await r.json();return {lrc:j?.lrc?.lyric||'',tlyric:j?.tlyric?.lyric||''};}},
 qq:{name:'QQ音乐',
  async search(q,fetch,signal){const r=await fetch('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w='+encodeURIComponent(q)+'&format=json&n=8&p=1&t=0&cr=1&new_json=1',{headers:{Referer:'https://y.qq.com/','User-Agent':UA},signal});const j=jsonp(await r.text());
   return (j?.data?.song?.list||[]).map(s=>({id:s.mid||s.songmid||'',title:s.name||s.songname||'',artist:(s.singer||[]).map(x=>x.name).join('/'),album:s.album?.name||s.albumname||'',duration:s.interval||0}));},
  async lyric(mid,fetch,signal){const r=await fetch(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(mid)}&format=json&nobase64=0&g_tk=5381`,{headers:{Referer:'https://y.qq.com/','User-Agent':UA},signal});const j=jsonp(await r.text());
   const b64=s=>s?Buffer.from(String(s),'base64').toString('utf8'):'';return {lrc:b64(j?.lyric),tlyric:b64(j?.trans)};}}
};
// QQ's endpoints sometimes wrap the JSON in a callback: MusicJsonCallback({...})
function jsonp(text){const t=String(text||'').trim();const m=/^[\w.$]+\((.*)\)\s*;?$/s.exec(t);return JSON.parse(m?m[1]:t);}
// want = {title, artist, duration?, query?}; provider 'auto' tries 网易云 then QQ音乐. Resolves {provider,id,title,artist,lines} or throws.
async function findLyrics(want,{provider='auto',fetch=globalThis.fetch,timeout=8000}={}){
 const order=provider==='qq'?['qq']:provider==='netease'?['netease']:['netease','qq'];const q=(want.query||'').trim()||[want.title,want.artist].filter(Boolean).join(' ').trim();
 if(!q)throw new Error('没有可搜索的歌名');let lastError=null;
 for(const key of order){const p=providers[key],ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
  try{const cands=await p.search(q,fetch,ctl.signal);const best=want.query?cands[0]||null:pickBest(cands,want);if(!best)throw new Error(p.name+'没有匹配的歌曲');
   const {lrc,tlyric}=await p.lyric(best.id,fetch,ctl.signal);const lines=mergeTrans(parseLRC(lrc),parseLRC(tlyric));if(!lines.length)throw new Error(p.name+'没有这首歌的歌词');
   return {provider:key,id:best.id,title:best.title,artist:best.artist,lines};}
  catch(error){lastError=error;}finally{clearTimeout(timer);}}
 throw lastError||new Error('没有找到歌词');
}
module.exports={parseLRC,mergeTrans,clean,score,pickBest,findLyrics,providers,jsonp};
