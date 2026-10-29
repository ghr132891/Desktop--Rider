'use strict';
// Sample module: one line of text on the desktop. It exercises the whole module
// contract from docs/modules.md — its own state slice, a sidebar view, inspector
// controls, a draggable preview layer and an export step. A desktop-lyrics module
// starts from this file: same layer and draw, text driven by a player instead.
Rider.register({
 id:'note',name:'桌面文字',order:200,
 defaults:{text:'',x:50,y:84,size:4,color:'#ffffff',shadow:true},
 normalize(m,{clamp,defaults}){return {text:typeof m.text==='string'?m.text.slice(0,80):'',x:clamp(m.x,0,100,defaults.x),y:clamp(m.y,0,100,defaults.y),size:clamp(m.size,1.5,12,defaults.size),color:/^#[0-9a-f]{6}$/i.test(m.color)?m.color.toLowerCase():defaults.color,shadow:m.shadow!==false};},
 view:{label:'桌面文字',icon:'text',title:'写一句话，留在桌面。',description:'示例模块：一行文字，拖到任意位置，随方案保存并导出。',inspectorTitle:'文字设置'},
 font:'"Avenir Next","PingFang SC","Microsoft YaHei",sans-serif',
 mount({panel,layer,api}){
  panel.innerHTML=`<p class="inspector-description">这是模块机制的示例：文字和位置保存在方案里，导出 PNG 时一起画出。</p>
<label class="field-label" for="note-text">文字内容</label><div class="inline-form"><input id="note-text" maxlength="80" placeholder="例如：今天也要好好的"></div>
<div class="control-section sliders"><div class="slider-control"><div class="control-label"><label for="note-size">文字大小</label><output id="note-size-value">4%</output></div><input id="note-size" type="range" min="1.5" max="12" step=".5" value="4"><div class="range-labels"><span>画面高度 1.5%</span><span>12%</span></div></div></div>
<div class="control-section"><div class="switch-row"><div><label for="note-shadow">文字投影</label><small>深色底时可关闭</small></div><input type="checkbox" id="note-shadow" class="switch" checked></div><div class="color-row"><label for="note-color">文字颜色</label><div class="color-input"><input type="color" id="note-color" value="#ffffff"><span id="note-color-value">#FFFFFF</span></div></div></div>
<p class="field-hint">在预览中直接拖动文字；方向键微调，Shift 加速。</p><button class="text-button" id="note-clear">清除文字</button>`;
  const $=q=>panel.querySelector(q),me=()=>api.state.modules.note,changed=()=>api.update({custom:false});
  $('#note-text').addEventListener('input',e=>{me().text=e.target.value.slice(0,80);changed();});
  $('#note-size').addEventListener('input',e=>{me().size=Number(e.target.value);changed();});
  $('#note-shadow').addEventListener('change',e=>{me().shadow=e.target.checked;changed();});
  $('#note-color').addEventListener('input',e=>{me().color=e.target.value;changed();});
  $('#note-clear').addEventListener('click',()=>{me().text='';changed();api.toast('已清除桌面文字');});
  const el=document.createElement('div');el.className='note-text';el.tabIndex=0;el.title='拖动移动；方向键微调';el.setAttribute('aria-label','桌面文字，可拖动');layer.append(el);this.el=el;
  const clampPct=v=>Math.max(0,Math.min(100,Math.round(v*10)/10));let drag=null;
  el.addEventListener('pointerdown',e=>{const b=api.desktop().getBoundingClientRect(),m=me();drag={id:e.pointerId,dx:e.clientX-b.left-m.x/100*b.width,dy:e.clientY-b.top-m.y/100*b.height};el.setPointerCapture(e.pointerId);el.classList.add('dragging');e.preventDefault();});
  el.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;const b=api.desktop().getBoundingClientRect(),m=me();m.x=clampPct((e.clientX-b.left-drag.dx)/b.width*100);m.y=clampPct((e.clientY-b.top-drag.dy)/b.height*100);changed();});
  const end=()=>{el.classList.remove('dragging');drag=null;};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);
  el.addEventListener('keydown',e=>{const step=e.shiftKey?5:1,moves={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};if(!moves[e.key])return;e.preventDefault();const m=me();m.x=clampPct(m.x+moves[e.key][0]);m.y=clampPct(m.y+moves[e.key][1]);changed();});
 },
 sync({s,panel}){const m=s.modules.note,q=sel=>panel.querySelector(sel);if(document.activeElement!==q('#note-text'))q('#note-text').value=m.text;q('#note-size').value=m.size;q('#note-size-value').textContent=m.size+'%';q('#note-shadow').checked=m.shadow;q('#note-color').value=m.color;q('#note-color-value').textContent=m.color.toUpperCase();},
 render({s,w,h}){const m=s.modules.note,el=this.el;el.hidden=!m.text;if(!m.text)return;el.textContent=m.text;Object.assign(el.style,{left:m.x+'%',top:m.y+'%',fontSize:m.size/100*h+'px',color:m.color,fontFamily:this.font});el.classList.toggle('shadow',m.shadow);},
 draw({ctx,s,w,h}){const m=s.modules.note;if(!m.text)return;ctx.font=`500 ${m.size/100*h}px ${this.font}`;ctx.textAlign='center';ctx.textBaseline='middle';if(m.shadow){ctx.shadowColor='#0b182c80';ctx.shadowBlur=h*m.size/100*.3;ctx.shadowOffsetY=h*m.size/100*.1;}ctx.fillStyle=m.color;ctx.fillText(m.text,m.x/100*w,m.y/100*h,w*.96);}
});
