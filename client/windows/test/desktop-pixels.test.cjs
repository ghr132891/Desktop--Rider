'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspectDesktopText}=require('./desktop-pixels.cjs');
const image=(width,height)=>({width,height,data:Buffer.alloc(width*height*4)});
const paint=(img,x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=(yy*img.width+xx)*4;img.data.set([255,0,255,255],i);}};
function fixture(){
 const overlay=image(80,60),background=image(80,60),desktop=image(160,100);
 paint(overlay,10,15,20,20);
 return {overlay,background,desktop,monitor:{left:-80,top:20,width:80,height:60},capture:{left:-120,top:0,width:160,height:100}};
}
test('desktop text sampling maps negative monitor origins to physical capture pixels',()=>{
 const input=fixture();paint(input.desktop,50,35,20,20);
 const result=inspectDesktopText(input);assert.ok(result.samples>=100);assert.equal(result.ratio,1);assert.equal(result.backgroundMatches,0);
});
test('rendered overlay alone or text at the wrong desktop position cannot pass',()=>{
 const input=fixture();assert.equal(inspectDesktopText(input).ratio,0);
 paint(input.desktop,90,65,20,20);assert.equal(inspectDesktopText(input).ratio,0);
});
test('an obscured text marker fails the visibility threshold',()=>{
 const input=fixture();paint(input.desktop,50,35,7,20);
 assert.ok(inspectDesktopText(input).ratio<.8);
});
test('one pixel resampling remains visible, but a marker baked into wallpaper is detected',()=>{
 const input=fixture();paint(input.desktop,51,36,20,20);paint(input.background,10,15,20,20);
 const result=inspectDesktopText(input);assert.equal(result.ratio,1);assert.equal(result.backgroundMatches,result.samples);
});
test('DPI-scaled metadata and truncated captures are rejected rather than silently sampled',()=>{
 const input=fixture();assert.throws(()=>inspectDesktopText({...input,capture:{...input.capture,width:128}}),/metadata is not physical/);
 assert.throws(()=>inspectDesktopText({...input,monitor:{...input.monitor,left:.5}}),/coordinates are not physical/);
 assert.throws(()=>inspectDesktopText({...input,capture:{...input.capture,left:0}}),/does not contain/);
 assert.throws(()=>inspectDesktopText({...input,overlay:{...input.overlay,width:64}}),/Invalid BGRA/);
});
