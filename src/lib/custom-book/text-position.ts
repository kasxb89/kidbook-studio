import { layoutTextBox, type BookLayout } from "./layout";
import type { BookTypography } from "./typography";

export type TextPlacement = { x:number; y:number; width:number };
export type TextRegion = { x:number; y:number; width:number; height:number; side:number };
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
// Percentages are relative to ONE physical page, including when editing a spread.
export function normalizeTextPlacement(value:TextPlacement):TextPlacement {
  const width=clamp(value.width,5,100);
  return {x:clamp(value.x,0,100-width),y:clamp(value.y,0,100),width};
}
export function textArea(layout:BookLayout,pageWidth:number,height:number,side:number,placement?:TextPlacement|null) {
  if(!placement)return layoutTextBox(layout,pageWidth,height,side);
  const p=normalizeTextPlacement(placement);
  return {x:side*pageWidth+p.x*pageWidth/100,y:p.y*height/100,width:p.width*pageWidth/100,height:height*.92};
}
export function textRegion(area:{x:number;y:number;width:number;height:number},design:BookTypography,contentHeight:number,pageWidth:number,height:number,side:number):TextRegion {
  const y=design.textBox
    ? clamp(area.y,0,Math.max(0,height-contentHeight))
    : design.position==="top"?area.y:design.position==="middle"?area.y+(area.height-contentHeight)/2:area.y+area.height-contentHeight;
  return {...area,y,height:contentHeight,side};
}
export function placementFromRegion(region:TextRegion,pageWidth:number,height:number):TextPlacement {
  return normalizeTextPlacement({x:(region.x-region.side*pageWidth)/pageWidth*100,y:region.y/height*100,width:region.width/pageWidth*100});
}
