import { canvasFontFamily } from "./typography";
import { textBackingRect, type BookTypography } from "./text-style";
import type { LetterGlyph } from "./lettering";

export function canvasTextFont(design:BookTypography,size:number) {
  return `${design.italic?"italic ":""}400 ${size}px ${canvasFontFamily(design.fontFamily)}`;
}
export function rotatedTextBounds(region:{x:number;y:number;width:number;height:number},rotation=0) {
  const cx=region.x+region.width/2,cy=region.y+region.height/2,a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const points=[[region.x,region.y],[region.x+region.width,region.y],[region.x+region.width,region.y+region.height],[region.x,region.y+region.height]].map(([x,y])=>({x:cx+(x-cx)*c-(y-cy)*s,y:cy+(x-cx)*s+(y-cy)*c}));
  return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
}
export function drawCanvasText(ctx:CanvasRenderingContext2D,design:BookTypography,region:{x:number;y:number;width:number;height:number},glyphs:LetterGlyph[],backing:boolean) {
  ctx.save();
  const cx=region.x+region.width/2,cy=region.y+region.height/2;
  ctx.translate(cx,cy);ctx.rotate((design.rotation??0)*Math.PI/180);ctx.translate(-cx,-cy);
  if(backing) {
    const frame=textBackingRect(design,region),opacity=design.backingOpacity??.92,colour=design.backingColor||"#fffcf3";
    ctx.save();ctx.beginPath();ctx.roundRect(frame.x,frame.y,frame.width,frame.height,frame.radius);ctx.clip();
    if(design.backingStyle==="solid") {ctx.globalAlpha=opacity;ctx.fillStyle=colour;}
    else {const alpha=Math.round(opacity*255).toString(16).padStart(2,"0"),g=ctx.createLinearGradient(0,frame.y,0,frame.y+frame.height);g.addColorStop(0,colour+"00");g.addColorStop(.15,colour+alpha);g.addColorStop(.85,colour+alpha);g.addColorStop(1,colour+"00");ctx.fillStyle=g;}
    ctx.fillRect(frame.x,frame.y,frame.width,frame.height);ctx.restore();
    if(design.backingBorderWidth) {ctx.beginPath();ctx.roundRect(frame.x,frame.y,frame.width,frame.height,frame.radius);ctx.globalAlpha=opacity;ctx.strokeStyle=design.backingBorderColor||"#53675b";ctx.lineWidth=design.backingBorderWidth;ctx.stroke();ctx.globalAlpha=1;}
  }
  ctx.textAlign="left";ctx.textBaseline="alphabetic";ctx.lineJoin="round";
  const opacity=design.opacity??1;
  for(const glyph of glyphs) {
    const x=region.x+glyph.x,y=region.y+glyph.baseline;
    ctx.font=canvasTextFont(design,glyph.size);
    if(design.shadow) {ctx.globalAlpha=opacity*(design.shadowOpacity??.45);ctx.fillStyle=design.shadowColor||"#17221c";ctx.fillText(glyph.text,x+(design.shadowX??2),y+(design.shadowY??3));}
    ctx.globalAlpha=opacity;
    if(design.strokeWidth) {ctx.strokeStyle=design.strokeColor||"#ffffff";ctx.lineWidth=design.strokeWidth*2;ctx.strokeText(glyph.text,x,y);}
    const ink=design.inkWeight??(design.preset==="storybook"?.02:0);
    if(ink) {ctx.strokeStyle=glyph.color;ctx.lineWidth=glyph.size*ink;ctx.strokeText(glyph.text,x,y);}
    ctx.fillStyle=glyph.color;ctx.fillText(glyph.text,x,y);
    if(design.underline) {ctx.strokeStyle=glyph.color;ctx.lineWidth=Math.max(.5,glyph.size*.04);ctx.beginPath();ctx.moveTo(x,y+glyph.size*.12);ctx.lineTo(x+ctx.measureText(glyph.text).width,y+glyph.size*.12);ctx.stroke();}
  }
  ctx.restore();
}
