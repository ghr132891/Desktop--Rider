'use strict';
// 桌面歌词: the current line of the song that is playing, on the desktop. The web preview cannot see other
// programs, so it animates a demo (or the user's own LRC) with its own clock to tune the look; the Windows
// client (modules/client.js → client/windows) reads the playing track from the system media session (SMTC:
// QQ音乐、网易云音乐 and anything else that publishes "now playing"), fetches the words from 网易云 / QQ音乐
// and paints them in the layer window with exactly these styles. Everything DIY lives in this state slice:
// font, size, weight, colour, stroke, shadow, alignment, box position / width, transition and its length,
// next-line preview and translation.
const LyricsLRC={
 // "[mm:ss.xx]text" lines (several stamps per line allowed) → [{t,text}] sorted by time; metadata tags skipped.
 parse(text){const out=[];for(const raw of String(text||'').split(/\r?\n/)){const stamps=[...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];if(!stamps.length)continue;const words=raw.replace(/\[[^\]]*\]/g,'').trim();
   for(const m of stamps){const frac=m[3]?Number(('0.'+m[3]).slice(0,5)):0;out.push({t:Number(m[1])*60+Number(m[2])+frac,text:words});}}
  out.sort((a,b)=>a.t-b.t);return out;},
 // Translation lines attach to the original with the same stamp (±0.3 s).
 merge(lines,trans){if(!trans?.length)return lines;return lines.map(l=>{const hit=trans.find(x=>Math.abs(x.t-l.t)<.3&&x.text);return hit?{...l,trans:hit.text}:l;});},
 index(lines,t){let i=-1;for(let k=0;k<lines.length;k++){if(lines[k].t<=t)i=k;else break;}return i;}
};
window.LyricsLRC=LyricsLRC;
const LYRICS_FONTS={system:{label:'系统默认',family:'"Avenir Next","PingFang SC","Microsoft YaHei",sans-serif'},yahei:{label:'微软雅黑',family:'"Microsoft YaHei","PingFang SC",sans-serif'},hei:{label:'思源黑体',family:'"Source Han Sans SC","Noto Sans SC","Microsoft YaHei",sans-serif'},kai:{label:'楷体',family:'"LXGW WenKai",KaiTi,STKaiti,"Kaiti SC",serif'},song:{label:'宋体 / 衬线',family:'"Noto Serif SC","Source Han Serif SC","Songti SC",SimSun,serif'},deng:{label:'等线',family:'DengXian,"PingFang SC",sans-serif'},mono:{label:'等宽',family:'"Cascadia Code",Consolas,"JetBrains Mono",monospace'},custom:{label:'自定义…',family:''}};
const LYRICS_DEMO=`[00:00.00]桌面上的一行字
[00:02.40]跟着节拍慢慢亮起来
[00:04.80]换一种字体 换一种颜色
[00:07.20]这一句是你的
[00:09.60]下一句也是
[00:12.00]`;
const LyricsModule={
 id:'lyrics',name:'桌面歌词',order:210,
 TRANSITIONS:['fade','slide','blur','none'],ALIGNS:['left','center','right'],WEIGHTS:[400,500,600,700,800],
 defaults:{enabled:false,mode:'auto',provider:'auto',query:'',lrc:'',offset:0,demo:true,
  x:50,y:78,width:80,size:4.5,font:'system',customFont:'',weight:600,color:'#ffffff',stroke:false,strokeColor:'#1b2a3f',shadow:true,align:'center',
  transition:'fade',duration:.5,next:true,nextOpacity:55,trans:true},
 normalize(m,{clamp,defaults:d}){const str=(v,n)=>typeof v==='string'?v.slice(0,n):'',color=(v,f)=>/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():f;
  return {enabled:m.enabled===true,mode:m.mode==='manual'?'manual':'auto',provider:['netease','qq'].includes(m.provider)?m.provider:'auto',query:str(m.query,120),lrc:str(m.lrc,20000),offset:clamp(m.offset,-10,10,0),demo:m.demo!==false,
   x:clamp(m.x,0,100,d.x),y:clamp(m.y,0,100,d.y),width:clamp(m.width,20,100,d.width),size:clamp(m.size,1.5,12,d.size),font:Object.hasOwn(LYRICS_FONTS,m.font)?m.font:'system',customFont:str(m.customFont,80),
   weight:this.WEIGHTS.includes(Number(m.weight))?Number(m.weight):d.weight,color:color(m.color,d.color),stroke:m.stroke===true,strokeColor:color(m.strokeColor,d.strokeColor),shadow:m.shadow!==false,align:this.ALIGNS.includes(m.align)?m.align:'center',
   transition:this.TRANSITIONS.includes(m.transition)?m.transition:'fade',duration:clamp(m.duration,0,2,d.duration),next:m.next!==false,nextOpacity:clamp(m.nextOpacity,0,100,d.nextOpacity),trans:m.trans!==false};},
 view:{label:'桌面歌词',icon:'music',title:'正在播放的歌，留一句在桌面。',description:'跟随 QQ音乐 / 网易云音乐正在播放的歌曲显示歌词（Windows 客户端）；字体、大小、颜色、描边、位置与淡入淡出都能自己定。预览里用示例歌词展示效果。',inspectorTitle:'歌词设置'},
 family(m){return m.font==='custom'?(m.customFont?`"${m.customFont.replace(/"/g,'')}",`:'')+LYRICS_FONTS.system.family:LYRICS_FONTS[m.font].family;},
 lines(m){const own=LyricsLRC.parse(m.mode==='manual'?m.lrc:'');return own.length?own:LyricsLRC.parse(LYRICS_DEMO);},
 // ---- panel ----
 mount({panel,layer,api}){this.api=api;
  const fonts=Object.entries(LYRICS_FONTS).map(([k,f])=>`<option value="${k}">${f.label}</option>`).join('');
  panel.innerHTML=`<p class="inspector-description">在 Windows 客户端里，歌词跟随系统「正在播放」的歌曲（QQ音乐、网易云音乐等）自动出现在桌面；这里用示例歌词调样式。</p>
<div class="control-section"><div class="switch-row"><div><label for="lyr-enabled">显示歌词</label><small>关闭后预览与桌面都不显示</small></div><input type="checkbox" id="lyr-enabled" class="switch"></div></div>
<details class="shape-options" id="lyr-source" open><summary>歌词来源</summary>
<div class="layers-row"><label for="lyr-mode">来源</label><select id="lyr-mode"><option value="auto">跟随正在播放（客户端）</option><option value="manual">手动 LRC</option></select></div>
<div class="lyr-auto-only"><div class="layers-row"><label for="lyr-provider">歌词站</label><select id="lyr-provider"><option value="auto">自动（先网易云，再 QQ音乐）</option><option value="netease">网易云音乐</option><option value="qq">QQ音乐</option></select></div>
<label class="field-label" for="lyr-query">指定歌曲（可选）</label><div class="inline-form"><input id="lyr-query" maxlength="120" placeholder="歌名 歌手，留空则按正在播放的曲目搜索"></div></div>
<div class="lyr-manual-only"><label class="field-label" for="lyr-lrc">LRC 歌词</label><textarea id="lyr-lrc" rows="6" placeholder="[00:12.00]第一句&#10;[00:15.50]第二句"></textarea></div>
<div class="slider-control"><div class="control-label"><label for="lyr-offset">时间微调</label><output id="lyr-offset-value">0.0 s</output></div><input id="lyr-offset" type="range" min="-5" max="5" step=".1" value="0"><div class="range-labels"><span>歌词提前</span><span>歌词延后</span></div></div>
<div class="switch-row"><div><label for="lyr-demo">预览演示播放</label><small>用示例或上面的 LRC 循环播放，方便调样式</small></div><input type="checkbox" id="lyr-demo" class="switch" checked></div>
<p id="lyr-status" class="field-hint" role="status"></p></details>
<details class="shape-options" id="lyr-look" open><summary>字体与颜色</summary>
<div class="layers-row"><label for="lyr-font">字体</label><select id="lyr-font">${fonts}</select></div>
<div class="inline-form lyr-font-custom"><input id="lyr-font-custom" maxlength="80" placeholder="已安装的字体名，如 霞鹜文楷"></div>
<div class="layers-row"><label for="lyr-weight">字重</label><select id="lyr-weight">${this.WEIGHTS.map(w=>`<option value="${w}">${w}</option>`).join('')}</select></div>
<div class="slider-control"><div class="control-label"><label for="lyr-size">文字大小</label><output id="lyr-size-value">4.5%</output></div><input id="lyr-size" type="range" min="1.5" max="12" step=".1" value="4.5"><div class="range-labels"><span>画面高度 1.5%</span><span>12%</span></div></div>
<div class="color-row"><label for="lyr-color">文字颜色</label><div class="color-input"><input type="color" id="lyr-color" value="#ffffff"><span id="lyr-color-value">#FFFFFF</span></div></div>
<div class="switch-row"><div><label for="lyr-shadow">文字投影</label><small>浅色壁纸上更清楚</small></div><input type="checkbox" id="lyr-shadow" class="switch" checked></div>
<div class="switch-row"><div><label for="lyr-stroke">描边</label><small>卡拉 OK 风格的轮廓</small></div><input type="checkbox" id="lyr-stroke" class="switch"></div>
<div class="color-row lyr-stroke-only"><label for="lyr-stroke-color">描边颜色</label><div class="color-input"><input type="color" id="lyr-stroke-color" value="#1b2a3f"><span id="lyr-stroke-color-value">#1B2A3F</span></div></div></details>
<details class="shape-options" id="lyr-layout"><summary>位置与排版</summary>
<div class="layers-row"><label for="lyr-align">对齐</label><select id="lyr-align"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></div>
<div class="slider-control"><div class="control-label"><label for="lyr-width">歌词区宽度</label><output id="lyr-width-value">80%</output></div><input id="lyr-width" type="range" min="20" max="100" step="1" value="80"></div>
<div class="slider-control"><div class="control-label"><label for="lyr-x">横向位置</label><output id="lyr-x-value">50%</output></div><input id="lyr-x" type="range" min="0" max="100" step=".5" value="50"></div>
<div class="slider-control"><div class="control-label"><label for="lyr-y">纵向位置</label><output id="lyr-y-value">78%</output></div><input id="lyr-y" type="range" min="0" max="100" step=".5" value="78"></div>
<p class="field-hint">在预览里直接拖动歌词；方向键微调，Shift 加速。</p></details>
<details class="shape-options" id="lyr-motion" open><summary>切换效果</summary>
<div class="layers-row"><label for="lyr-transition">切换方式</label><select id="lyr-transition"><option value="fade">淡入淡出</option><option value="slide">上滑淡入</option><option value="blur">模糊聚焦</option><option value="none">直接切换</option></select></div>
<div class="slider-control"><div class="control-label"><label for="lyr-duration">过渡时长</label><output id="lyr-duration-value">0.5 s</output></div><input id="lyr-duration" type="range" min="0" max="2" step=".05" value=".5"></div>
<div class="switch-row"><div><label for="lyr-next">显示下一句</label><small>当前句下方淡淡地预告</small></div><input type="checkbox" id="lyr-next" class="switch" checked></div>
<div class="slider-control lyr-next-only"><div class="control-label"><label for="lyr-next-opacity">下一句透明度</label><output id="lyr-next-opacity-value">55%</output></div><input id="lyr-next-opacity" type="range" min="0" max="100" step="1" value="55"></div>
<div class="switch-row"><div><label for="lyr-trans">显示翻译</label><small>歌词站提供翻译时显示在下方</small></div><input type="checkbox" id="lyr-trans" class="switch" checked></div></details>`;
  const $=q=>panel.querySelector(q),me=()=>api.state.modules.lyrics,changed=()=>api.update({custom:false});
  const bind=(id,key,read)=>$(id).addEventListener(id.includes('select')||$(id).tagName==='SELECT'||$(id).type==='checkbox'?'change':'input',e=>{me()[key]=read?read(e.target):e.target.value;changed();});
  bind('#lyr-enabled','enabled',t=>t.checked);bind('#lyr-mode','mode');bind('#lyr-provider','provider');bind('#lyr-query','query',t=>t.value.slice(0,120));bind('#lyr-lrc','lrc',t=>t.value.slice(0,20000));
  bind('#lyr-offset','offset',t=>Number(t.value));bind('#lyr-demo','demo',t=>t.checked);bind('#lyr-font','font');bind('#lyr-font-custom','customFont',t=>t.value.slice(0,80));bind('#lyr-weight','weight',t=>Number(t.value));
  bind('#lyr-size','size',t=>Number(t.value));bind('#lyr-color','color');bind('#lyr-shadow','shadow',t=>t.checked);bind('#lyr-stroke','stroke',t=>t.checked);bind('#lyr-stroke-color','strokeColor');
  bind('#lyr-align','align');bind('#lyr-width','width',t=>Number(t.value));bind('#lyr-x','x',t=>Number(t.value));bind('#lyr-y','y',t=>Number(t.value));
  bind('#lyr-transition','transition');bind('#lyr-duration','duration',t=>Number(t.value));bind('#lyr-next','next',t=>t.checked);bind('#lyr-next-opacity','nextOpacity',t=>Number(t.value));bind('#lyr-trans','trans',t=>t.checked);
  // Preview element: a box with two alternating line slots (cross-fade), a next-line slot and a translation slot.
  const box=document.createElement('div');box.className='lyrics-box';box.tabIndex=0;box.hidden=true;box.title='拖动移动；方向键微调';box.setAttribute('aria-label','桌面歌词，可拖动');
  box.innerHTML='<div class="lyrics-stage"><div class="lyrics-line" data-slot="0"></div><div class="lyrics-line" data-slot="1"></div></div><div class="lyrics-trans"></div><div class="lyrics-next"></div>';
  layer.append(box);this.box=box;this.slot=0;this.shown=-1;this.shownKey='';
  const clampPct=v=>Math.max(0,Math.min(100,Math.round(v*10)/10));let drag=null;
  box.addEventListener('pointerdown',e=>{const b=api.desktop().getBoundingClientRect(),m=me();drag={id:e.pointerId,dx:e.clientX-b.left-m.x/100*b.width,dy:e.clientY-b.top-m.y/100*b.height};box.setPointerCapture(e.pointerId);box.classList.add('dragging');e.preventDefault();});
  box.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;const b=api.desktop().getBoundingClientRect(),m=me();m.x=clampPct((e.clientX-b.left-drag.dx)/b.width*100);m.y=clampPct((e.clientY-b.top-drag.dy)/b.height*100);changed();});
  const end=()=>{box.classList.remove('dragging');drag=null;};box.addEventListener('pointerup',end);box.addEventListener('pointercancel',end);box.addEventListener('lostpointercapture',end);
  box.addEventListener('keydown',e=>{const step=e.shiftKey?5:1,moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};if(!moves[e.key])return;e.preventDefault();const m=me();m.x=clampPct(m.x+moves[e.key][0]);m.y=clampPct(m.y+moves[e.key][1]);changed();});
  this.start=performance.now();const tick=()=>{this.tick();requestAnimationFrame(tick);};requestAnimationFrame(tick);
 },
 sync({s,panel}){const m=s.modules.lyrics,q=sel=>panel.querySelector(sel),set=(sel,v)=>{const el=q(sel);if(document.activeElement!==el)el.value=v;};
  q('#lyr-enabled').checked=m.enabled;set('#lyr-mode',m.mode);set('#lyr-provider',m.provider);set('#lyr-query',m.query);set('#lyr-lrc',m.lrc);set('#lyr-offset',m.offset);q('#lyr-offset-value').textContent=(m.offset>0?'+':'')+m.offset.toFixed(1)+' s';q('#lyr-demo').checked=m.demo;
  set('#lyr-font',m.font);set('#lyr-font-custom',m.customFont);q('.lyr-font-custom').hidden=m.font!=='custom';set('#lyr-weight',m.weight);set('#lyr-size',m.size);q('#lyr-size-value').textContent=m.size+'%';set('#lyr-color',m.color);q('#lyr-color-value').textContent=m.color.toUpperCase();
  q('#lyr-shadow').checked=m.shadow;q('#lyr-stroke').checked=m.stroke;q('.lyr-stroke-only').hidden=!m.stroke;set('#lyr-stroke-color',m.strokeColor);q('#lyr-stroke-color-value').textContent=m.strokeColor.toUpperCase();
  set('#lyr-align',m.align);set('#lyr-width',m.width);q('#lyr-width-value').textContent=m.width+'%';set('#lyr-x',m.x);q('#lyr-x-value').textContent=m.x+'%';set('#lyr-y',m.y);q('#lyr-y-value').textContent=m.y+'%';
  set('#lyr-transition',m.transition);set('#lyr-duration',m.duration);q('#lyr-duration-value').textContent=m.duration.toFixed(2).replace(/0$/,'')+' s';q('#lyr-next').checked=m.next;q('.lyr-next-only').hidden=!m.next;set('#lyr-next-opacity',m.nextOpacity);q('#lyr-next-opacity-value').textContent=m.nextOpacity+'%';q('#lyr-trans').checked=m.trans;
  q('.lyr-auto-only').hidden=m.mode!=='auto';q('.lyr-manual-only').hidden=m.mode!=='manual';
  const client=this.clientState;q('#lyr-status').textContent=client?.track?`客户端：正在播放「${client.track.title}」${client.track.artist?' · '+client.track.artist:''}${client.provider?' · 歌词来自'+({netease:'网易云音乐',qq:'QQ音乐',manual:'手动 LRC'}[client.provider]||client.provider):''}${client.error?' · '+client.error:''}`:m.mode==='auto'?(window.desktopRider?'客户端未检测到正在播放的歌曲；预览用示例歌词。':'跟随播放只在 Windows 客户端里生效；预览用示例歌词展示样式。'):(LyricsLRC.parse(m.lrc).length?`已读取 ${LyricsLRC.parse(m.lrc).length} 行歌词`:'粘贴 LRC 后预览会循环播放它');},
 // ---- preview ----
 // Where the demo clock stands: loops over the lines plus a short tail.
 now(m,lines){if(!lines.length)return 0;const span=lines[lines.length-1].t+3;return (((performance.now()-this.start)/1000)%span)+m.offset;},
 render({s,w,h}){const m=s.modules.lyrics,box=this.box;this.w=w;this.h=h;box.hidden=!m.enabled;if(!m.enabled)return;
  const px=m.size/100*h;Object.assign(box.style,{left:m.x+'%',top:m.y+'%',width:m.width+'%',fontSize:px+'px',fontFamily:this.family(m),fontWeight:m.weight,color:m.color,textAlign:m.align});box.style.setProperty('--lyr-dur',m.duration+'s');box.style.setProperty('--lyr-next',String(m.nextOpacity/100));box.style.setProperty('--lyr-stroke',m.stroke?m.strokeColor:'transparent');
  box.classList.toggle('shadow',m.shadow);box.classList.toggle('stroke',m.stroke);box.dataset.transition=m.transition;box.querySelector('.lyrics-next').hidden=!m.next;box.querySelector('.lyrics-trans').hidden=!m.trans;
  this.cur=m;this.curLines=this.lines(m);if(!m.demo){this.show(0,true);}},
 // Demo clock → current line; swapping slots re-runs the CSS transition.
 tick(){const m=this.cur;if(!m||!m.enabled||!m.demo||this.box.hidden)return;const lines=this.curLines,i=LyricsLRC.index(lines,this.now(m,lines));this.show(Math.max(0,i));},
 show(i,force=false){const lines=this.curLines||[],line=lines[i],key=(line?.text||'')+'|'+i;if(!force&&key===this.shownKey)return;this.shownKey=key;this.shown=i;
  const slots=this.box.querySelectorAll('.lyrics-line'),nextSlot=slots[this.slot^=1],prev=slots[this.slot^1];
  nextSlot.textContent=line?.text||'';nextSlot.classList.remove('out');nextSlot.classList.remove('in');void nextSlot.offsetWidth;nextSlot.classList.add('in');
  prev.classList.remove('in');prev.classList.add('out');
  this.box.querySelector('.lyrics-trans').textContent=line?.trans||'';const next=lines[i+1];this.box.querySelector('.lyrics-next').textContent=next?.text||'';},
 // ---- export: the line showing right now, with the same font, colour, stroke and shadow ----
 draw({ctx,s,w,h}){const m=s.modules.lyrics;if(!m.enabled)return;const lines=this.lines(m),i=Math.max(0,LyricsLRC.index(lines,this.start?this.now(m,lines):0)),line=lines[i];if(!line)return;
  const px=m.size/100*h,x=m.x/100*w,y=m.y/100*h,maxW=m.width/100*w,family=this.family(m);
  const put=(text,size,alpha,dy)=>{if(!text)return;ctx.save();ctx.globalAlpha=alpha;ctx.font=`${m.weight} ${size}px ${family}`;ctx.textAlign=m.align;ctx.textBaseline='middle';const tx=m.align==='left'?x-maxW/2:m.align==='right'?x+maxW/2:x;
   if(m.shadow){ctx.shadowColor='#0b182c80';ctx.shadowBlur=size*.3;ctx.shadowOffsetY=size*.1;}
   if(m.stroke){ctx.lineJoin='round';ctx.lineWidth=Math.max(1,size*.08);ctx.strokeStyle=m.strokeColor;ctx.strokeText(text,tx,y+dy,maxW);ctx.shadowColor='transparent';}
   ctx.fillStyle=m.color;ctx.fillText(text,tx,y+dy,maxW);ctx.restore();};
  put(line.text,px,1,0);let dy=px*.85;if(m.trans&&line.trans){put(line.trans,px*.6,.85,dy);dy+=px*.65;}if(m.next&&lines[i+1]){put(lines[i+1].text,px*.7,m.nextOpacity/100,dy);}},
 // ---- Windows client payload: style in px for this monitor + how to find the words ----
 exportLyrics(s,w,h){const m=s.modules.lyrics;if(!m.enabled)return null;
  return {source:{mode:m.mode,provider:m.provider,query:m.query,lrc:m.mode==='manual'?m.lrc:'',offset:m.offset},
   style:{x:m.x/100*w,y:m.y/100*h,width:m.width/100*w,size:m.size/100*h,font:this.family(m),weight:m.weight,color:m.color,stroke:m.stroke,strokeColor:m.strokeColor,shadow:m.shadow,align:m.align,transition:m.transition,duration:m.duration,next:m.next,nextOpacity:m.nextOpacity,trans:m.trans}};},
 // The client module polls desktopRider.layers() and hands us the lyrics state for the status line.
 clientState:null,setClientState(state){this.clientState=state||null;const panel=document.querySelector('#module-lyrics');if(panel&&this.api)this.sync({s:this.api.state,panel});}
};
Rider.register(LyricsModule);
