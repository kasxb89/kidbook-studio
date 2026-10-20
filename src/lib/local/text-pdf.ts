import "server-only";
import { rgb, degrees, type PDFPage, type PDFFont, pushGraphicsState, popGraphicsState, concatTransformationMatrix, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath, beginText, endText, setTextRenderingMode, TextRenderingMode, setLineWidth, setStrokingColor, setLineJoin, LineJoinStyle } from "pdf-lib";
import type { LetterGlyph } from "../custom-book/lettering";
import { textBackingRect, type BookTypography } from "../custom-book/text-style";
import { fontForCharacter, measurePrintText } from "./book-fonts";

export const pdfColour=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
type Region={x:number;y:number;width:number;height:number};
function roundedPath(page:PDFPage,x:number,y:number,w:number,h:number,r:number) {
  const k=.5522847498,c=r*k;
  page.pushOperators(moveTo(x+r,y),lineTo(x+w-r,y),appendBezierCurve(x+w-r+c,y,x+w,y+r-c,x+w,y+r),lineTo(x+w,y+h-r),appendBezierCurve(x+w,y+h-r+c,x+w-r+c,y+h,x+w-r,y+h),lineTo(x+r,y+h),appendBezierCurve(x+r-c,y+h,x,y+h-r+c,x,y+h-r),lineTo(x,y+r),appendBezierCurve(x,y+r-c,x+r-c,y,x+r,y),closePath());
}
/** Vector text and vector effects. Origin is the top-left of the illustration. */
export function drawPdfText(page:PDFPage,font:PDFFont,design:BookTypography,region:Region,glyphs:LetterGlyph[],backing:boolean,origin:{x:number;y:number;scale:number}) {
  const {scale}=origin,cx=origin.x+(region.x+region.width/2)*scale,cy=origin.y-(region.y+region.height/2)*scale,a=-(design.rotation??0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  page.pushOperators(pushGraphicsState(),concatTransformationMatrix(c,s,-s,c,cx-c*cx+s*cy,cy-s*cx-c*cy),setLineJoin(LineJoinStyle.Round));
  if(backing) {
    const r=textBackingRect(design,region),x=origin.x+r.x*scale,y=origin.y-(r.y+r.height)*scale,w=r.width*scale,h=r.height*scale,radius=r.radius*scale,opacity=design.backingOpacity??.92;
    page.pushOperators(pushGraphicsState());roundedPath(page,x,y,w,h,radius);page.pushOperators(clip(),endPath());
    if(design.backingStyle==="solid")page.drawRectangle({x,y,width:w,height:h,color:pdfColour(design.backingColor||"#fffcf3"),opacity});
    else for(let i=0;i<48;i++){const t=(i+.5)/48;page.drawRectangle({x,y:y+h*i/48,width:w,height:h/48+.02,color:pdfColour(design.backingColor||"#fffcf3"),opacity:opacity*Math.min(1,t/.15,(1-t)/.15)});}
    page.pushOperators(popGraphicsState());
    if(design.backingBorderWidth) {
      const p=`M ${radius} 0 H ${w-radius} Q ${w} 0 ${w} ${radius} V ${h-radius} Q ${w} ${h} ${w-radius} ${h} H ${radius} Q 0 ${h} 0 ${h-radius} V ${radius} Q 0 0 ${radius} 0 Z`;
      page.drawSvgPath(p,{x,y:y+h,borderColor:pdfColour(design.backingBorderColor||"#53675b"),borderWidth:design.backingBorderWidth*scale,borderOpacity:opacity});
    }
  }
  const opacity=design.opacity??1,ink=design.inkWeight??(design.preset==="storybook"?.02:0);
  function mode(value:TextRenderingMode){page.pushOperators(beginText(),setTextRenderingMode(value),endText());}
  for(const glyph of glyphs) {
    const face=fontForCharacter(font,glyph.text),x=origin.x+(region.x+glyph.x)*scale,y=origin.y-(region.y+glyph.baseline)*scale;
    const options={font:face,size:glyph.size*scale,x,y,opacity,xSkew:degrees(design.italic?12:0)};
    mode(TextRenderingMode.Fill);
    if(design.shadow)page.drawText(glyph.text,{...options,x:x+(design.shadowX??2)*scale,y:y-(design.shadowY??3)*scale,color:pdfColour(design.shadowColor||"#17221c"),opacity:opacity*(design.shadowOpacity??.45)});
    if(design.strokeWidth){mode(TextRenderingMode.Outline);page.pushOperators(setLineWidth(design.strokeWidth*2*scale),setStrokingColor(pdfColour(design.strokeColor||"#ffffff")));page.drawText(glyph.text,{...options,color:pdfColour(glyph.color)});}
    if(ink){mode(TextRenderingMode.Outline);page.pushOperators(setLineWidth(glyph.size*ink*scale),setStrokingColor(pdfColour(glyph.color)));page.drawText(glyph.text,{...options,color:pdfColour(glyph.color)});}
    mode(TextRenderingMode.Fill);page.drawText(glyph.text,{...options,color:pdfColour(glyph.color)});
    if(design.underline)page.drawLine({start:{x,y:y-glyph.size*.12*scale},end:{x:x+measurePrintText(face,glyph.text,glyph.size)*scale,y:y-glyph.size*.12*scale},thickness:Math.max(.5,glyph.size*.04)*scale,color:pdfColour(glyph.color),opacity});
  }
  page.pushOperators(popGraphicsState());
}
