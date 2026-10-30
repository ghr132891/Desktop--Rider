'use strict';
// 桌面歌词 renderer shared by the web preview (modules/lyrics.js) and the Windows desktop layer
// (client/windows/layer.html loads it by file URL). No dependencies, no globals except window.LyricsView.
//
// Parsing: LRC (line times), QRC (QQ音乐 逐字: "[start,dur]词(start,dur)…"), YRC (网易云 逐字:
// "[start,dur](start,dur,0)词…"), auto-detected; translations merge by time.
// Display modes — what the reference players do, distilled:
//   single   one line, cross-faded with the chosen transition (fade / slide / blur / emerge / none)
//   karaoke  the line fills word by word in the highlight colour (Apple Music / QQ音乐 style); lines without
//            word timing fill linearly over their duration, so LRC sources get the same look
//   stage    several lines; the current one large and bright, neighbours smaller, dimmer and progressively
//            blurred, sliding into place with a springy ease (applemusic-like-lyrics / Lyricify)
// Extras: next-line preview, translation, interlude dots that fill during gaps ≥ 5 s, a soft backdrop pill,
// glow on the active word. Every value comes from the style object; px or any CSS length for position.
(function(){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 // ---- parsing ----
 function parseLRC(text){const out=[];for(const raw of String(text||'').split(/\r?\n/)){const stamps=[...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];if(!stamps.length)continue;const words=raw.replace(/\[[^\]]*\]/g,'').trim();
   for(const m of stamps){const frac=m[3]?Number(('0.'+m[3]).slice(0,5)):0;out.push({t:Number(m[1])*60+Number(m[2])+frac,text:words});}}
  return finish(out);}
 // QRC: "[start,dur]word(start,dur)word(start,dur)…" (ms); metadata "[ti:…]" lines skipped.
 function parseQRC(text){const out=[];for(const raw of String(text||'').split(/\r?\n/)){const m=/^\[(\d+),(\d+)\](.*)$/.exec(raw.trim());if(!m)continue;const words=[];let line='';
   for(const w of m[3].matchAll(/([^()]*?)\((\d+),(\d+)\)/g)){if(!w[1]&&!w[2])continue;words.push({t:Number(w[2])/1000,d:Number(w[3])/1000,text:w[1]});line+=w[1];}
   if(!words.length)line=m[3].replace(/\(\d+,\d+\)/g,'');out.push({t:Number(m[1])/1000,d:Number(m[2])/1000,text:line.trim(),words:words.length?words:null});}
  return finish(out);}
 // YRC: "[start,dur](start,dur,0)word(start,dur,0)word…"; JSON credit lines skipped.
 function parseYRC(text){const out=[];for(const raw of String(text||'').split(/\r?\n/)){const m=/^\[(\d+),(\d+)\](.*)$/.exec(raw.trim());if(!m)continue;const words=[];let line='';
   for(const w of m[3].matchAll(/\((\d+),(\d+),\d+\)([^(]*)/g)){words.push({t:Number(w[1])/1000,d:Number(w[2])/1000,text:w[3]});line+=w[3];}
   if(!words.length)line=m[3];out.push({t:Number(m[1])/1000,d:Number(m[2])/1000,text:line.trim(),words:words.length?words:null});}
  return finish(out);}
 function detect(text){const s=String(text||'');if(/^\[\d+,\d+\]/m.test(s)){return /\(\d+,\d+,\d+\)/.test(s)?'yrc':'qrc';}return 'lrc';}
 function parse(text){const kind=detect(text);return kind==='yrc'?parseYRC(text):kind==='qrc'?parseQRC(text):parseLRC(text);}
 // Sort, drop empty-text duplicates at the same time, and give every line an end (its own duration or the next start).
 function finish(lines){lines.sort((a,b)=>a.t-b.t);const out=lines.filter(l=>l.text||l.words);
  for(let i=0;i<out.length;i++){const l=out[i],next=out[i+1];l.end=l.d?l.t+l.d:next?Math.min(next.t,l.t+8):l.t+5;if(l.words)for(const w of l.words)if(!w.d)w.d=.3;}return out;}
 function merge(lines,trans){if(!trans||!trans.length)return lines;return lines.map(l=>{const hit=trans.find(x=>Math.abs(x.t-l.t)<.3&&x.text);return hit?{...l,trans:hit.text}:l;});}
 function index(lines,t){let i=-1;for(let k=0;k<lines.length;k++){if(lines[k].t<=t)i=k;else break;}return i;}
 // Fraction of a line sung at time t: by word timing when present, else linearly over the line's span.
 function progress(line,t){if(!line)return 0;if(line.words&&line.words.length){const last=line.words[line.words.length-1];if(t>=last.t+last.d)return 1;}return clamp((t-line.t)/Math.max(.2,line.end-line.t),0,1);}
 function wordProgress(w,t){return clamp((w.t<=t?(t-w.t)/Math.max(.05,w.d):0),0,1);}
 // ---- view ----
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 function wordsHTML(line){const words=line.words&&line.words.length?line.words:[{t:line.t,d:line.end-line.t,text:line.text}];
  return words.map((w,i)=>`<span class="lw" style="--p:0;--i:${i}">${esc(w.text).replace(/ /g,'&nbsp;')}</span>`).join('');}
 function create(root){
  root.classList.add('lyrics-box');root.innerHTML='<div class="lyrics-backdrop"></div><div class="lyrics-stage"><div class="lyrics-line" data-slot="0"></div><div class="lyrics-line" data-slot="1"></div></div><div class="lyrics-rows"></div><div class="lyrics-trans"></div><div class="lyrics-next"></div><div class="lyrics-dots"><i></i><i></i><i></i></div>';
  const q=s=>root.querySelector(s),slots=root.querySelectorAll('.lyrics-line'),rows=q('.lyrics-rows'),trans=q('.lyrics-trans'),next=q('.lyrics-next'),dots=q('.lyrics-dots');
  const view={lines:[],style:null,shownKey:'',slot:0,current:-1,rowEls:new Map()};
  view.setStyle=st=>{view.style=st;Object.assign(root.style,{left:st.left,top:st.top,width:st.width,fontSize:st.size+'px',fontFamily:st.font,fontWeight:st.weight,color:st.color,textAlign:st.align});
   root.style.setProperty('--lyr-dur',(st.duration??.5)+'s');root.style.setProperty('--lyr-next',String((st.nextOpacity??55)/100));root.style.setProperty('--lyr-stroke',st.stroke?st.strokeColor:'transparent');
   root.style.setProperty('--lyr-hl',st.highlight||st.color);root.style.setProperty('--lyr-glow',String((st.glow??0)/100));root.style.setProperty('--lyr-backdrop',String((st.backdrop??0)/100));root.style.setProperty('--lyr-backdrop-blur',(st.backdropBlur??12)+'px');
   root.classList.toggle('shadow',!!st.shadow);root.classList.toggle('stroke',!!st.stroke);root.dataset.transition=st.transition||'fade';root.dataset.display=st.display||'single';root.dataset.stage=String(st.stageLines||3);
   next.hidden=!st.next||st.display==='stage';trans.hidden=!st.trans;view.shownKey='';view.rowEls.clear();rows.replaceChildren();view.render(view.lastT??0,true);};
  view.setLines=lines=>{view.lines=Array.isArray(lines)?lines:[];view.shownKey='';view.rowEls.clear();rows.replaceChildren();view.current=-1;view.render(view.lastT??0,true);};
  // Called every frame with the song position in seconds (already offset by the host).
  view.render=(t,force)=>{view.lastT=t;const st=view.style,lines=view.lines;if(!st)return;root.hidden=!lines.length;if(!lines.length)return;
   const i=Math.max(0,index(lines,t)),line=lines[i],display=st.display||'single';
   // Interlude dots: a gap of ≥ 5 s after the current line's end (or before the first line) fills three dots.
   const gapStart=i===0&&t<line.t?0:line.end,gapEnd=i===0&&t<line.t?line.t:lines[i+1]?lines[i+1].t:Infinity,inGap=st.interlude!==false&&t>=gapStart&&gapEnd-gapStart>=5&&t<gapEnd&&(i>0||t<line.t||t>=line.end);
   dots.hidden=!inGap;if(inGap){const p=clamp((t-gapStart)/(gapEnd-gapStart),0,1);dots.querySelectorAll('i').forEach((el,k)=>{el.style.setProperty('--p',String(clamp(p*3-k,0,1)));});}
   if(display==='stage')return view.renderStage(t,i,force);
   const key=i+'|'+lines.length+'|'+display;
   if(force||key!==view.shownKey){view.shownKey=key;view.current=i;const slotEl=slots[view.slot^=1],prev=slots[view.slot^1];
    slotEl.innerHTML=display==='karaoke'||st.transition==='emerge'?wordsHTML(line):esc(line.text);slotEl.classList.remove('out','in');void slotEl.offsetWidth;slotEl.classList.add('in');prev.classList.remove('in');prev.classList.add('out');
    trans.textContent=line.trans||'';next.textContent=lines[i+1]?.text||'';}
   if(display==='karaoke')view.paintWords(slots[view.slot],line,t);};
  // Word fill: completed words 1, the active word its fraction, the rest 0; the active word carries the glow.
  view.paintWords=(el,line,t)=>{const words=line.words&&line.words.length?line.words:[{t:line.t,d:line.end-line.t,text:line.text}];const spans=el.querySelectorAll('.lw');
   spans.forEach((s,k)=>{const w=words[k];if(!w)return;const p=wordProgress(w,t);s.style.setProperty('--p',p.toFixed(3));s.classList.toggle('active',p>0&&p<1);});};
  // Stage: rows for current-2 … current+2 (or ±1), positioned relative to the current one; the current row is word-painted.
  view.renderStage=(t,i,force)=>{const lines=view.lines,n=Number(view.style.stageLines)||3,half=(n-1)/2,wanted=new Set();
   for(let k=i-half;k<=i+half;k++){const line=lines[k];if(!line)continue;wanted.add(k);let el=view.rowEls.get(k);
    if(!el){el=document.createElement('div');el.className='lyrics-row enter';el.innerHTML=wordsHTML(line)+(line.trans?`<small>${esc(line.trans)}</small>`:'');rows.append(el);view.rowEls.set(k,el);requestAnimationFrame(()=>el.classList.remove('enter'));}
    const d=k-i;el.style.setProperty('--d',String(d));el.style.setProperty('--ad',String(Math.abs(d)));el.classList.toggle('current',d===0);el.classList.toggle('past',d<0);
    if(d===0)view.paintWords(el,line,t);else el.querySelectorAll('.lw').forEach(s=>{s.style.setProperty('--p',d<0?'1':'0');s.classList.remove('active');});}
   for(const [k,el] of view.rowEls)if(!wanted.has(k)){el.remove();view.rowEls.delete(k);}
   if(force||view.current!==i){view.current=i;trans.textContent='';}};
  view.destroy=()=>{root.replaceChildren();};
  return view;}
 const LyricsView={parseLRC,parseQRC,parseYRC,parse,detect,merge,index,progress,wordProgress,create};
 if(typeof module!=='undefined'&&module.exports)module.exports=LyricsView;if(typeof window!=='undefined')window.LyricsView=LyricsView;
})();
