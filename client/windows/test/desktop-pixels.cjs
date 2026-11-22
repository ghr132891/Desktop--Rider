'use strict';
// Verify the composited desktop, not Chromium's offscreen surface. All image bytes are BGRA
// from Electron nativeImage; there is no PNG decoder or runtime dependency to ship.
function inspectDesktopText({overlay,background,desktop,monitor,capture}){
 for(const image of [overlay,background,desktop])if(!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<=0||image.height<=0||image.data.length!==image.width*image.height*4)throw new Error('Invalid BGRA image');
 if(overlay.width!==monitor.width||overlay.height!==monitor.height||background.width!==monitor.width||background.height!==monitor.height)throw new Error('Fixture does not match the physical monitor');
 if(desktop.width!==capture.width||desktop.height!==capture.height||!Number.isInteger(capture.left)||!Number.isInteger(capture.top))throw new Error('Screenshot metadata is not physical');
 const dx=monitor.left-capture.left,dy=monitor.top-capture.top;
 if(!Number.isInteger(dx)||!Number.isInteger(dy))throw new Error('Monitor coordinates are not physical');
 if(dx<0||dy<0||dx+monitor.width>desktop.width||dy+monitor.height>desktop.height)throw new Error('Screenshot does not contain the monitor');
 const magenta=(image,x,y,tolerance)=>{if(x<0||y<0||x>=image.width||y>=image.height)return false;const i=(y*image.width+x)*4,b=image.data;return b[i]>=255-tolerance&&b[i+1]<=tolerance&&b[i+2]>=255-tolerance&&b[i+3]>=250;};
 const candidates=[];
 // Ignore antialiased glyph edges; a one-pixel neighbourhood also tolerates fractional-DPI
 // sampling without accepting a misplaced text block or unrelated pixels elsewhere on screen.
 for(let y=1;y<overlay.height-1;y++)for(let x=1;x<overlay.width-1;x++)if(magenta(overlay,x,y,8)&&magenta(overlay,x-1,y,8)&&magenta(overlay,x+1,y,8)&&magenta(overlay,x,y-1,8)&&magenta(overlay,x,y+1,8))candidates.push([x,y]);
 let matched=0,backgroundMatches=0,samples=0;const stride=Math.max(1,Math.ceil(candidates.length/512));
 for(let i=0;i<candidates.length;i+=stride){const [x,y]=candidates[i];samples++;if(magenta(background,x,y,24))backgroundMatches++;
  let found=false;for(let oy=-1;oy<=1&&!found;oy++)for(let ox=-1;ox<=1&&!found;ox++)found=magenta(desktop,x+dx+ox,y+dy+oy,24);
  if(found)matched++;
 }
 return {candidates:candidates.length,samples,matched,backgroundMatches,ratio:samples?matched/samples:0};
}
module.exports={inspectDesktopText};
