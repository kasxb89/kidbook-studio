import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PrintScaling, Duplex, rgb, type PDFFont } from "pdf-lib";
import { zipSync, strToU8 } from "fflate";
import type { CustomWorkbenchDraft, WorkbenchAsset } from "../custom-workbench";
import { spreadStart } from "../custom-workbench";
import { artworkMatchesText, artworkText } from "../custom-book/integrated";
import { wrapBookText } from "../custom-book/text-wrap";
import { PRINT_PPI, MM_TO_PT as MM, printGeometry, printLeaves, bookletPairs, printSettingsSchema, type PrintSettings, type PrintLeaf } from "../custom-book/print-settings";
import { readAsset, LocalError } from "./store";
import { BOOK_FONTS, effectiveTextBacking, type BookFont, type BookTypography } from "../custom-book/typography";
import { normalizeTextPlacement } from "../custom-book/text-position";
import { bookProductionText } from "../book-production";

export type PrintCheck = { page:number; upgradePage:number; label:string; pixels:string; ppi:number; requiredPpi:number; needsUpgrade:boolean; sourceId:string; };
export type PrintReport = { ready:boolean; settings:PrintSettings; totalPages:number; blankPages:number[]; checks:PrintCheck[]; errors:string[]; physicalPages:{physical:number;kind:string;sourcePage?:number}[]; };
type Rect={x:number;y:number;width:number;height:number};
type TextBlock={lines:string[];size:number;height:number;leading:number};
type Artwork={bytes:Buffer;width:number;height:number;sourceId:string;upgradePage:number};
const fontBytes=new Map<BookFont,Promise<Uint8Array>>();
const fontsByDocument=new WeakMap<PDFDocument,Map<BookFont,Promise<PDFFont>>>();
async function printFont(pdf:PDFDocument,family:BookFont="sans") {
  pdf.registerFontkit(fontkit);
  let fonts=fontsByDocument.get(pdf);
  if(!fonts){fonts=new Map();fontsByDocument.set(pdf,fonts);}
  if(fonts.has(family))return fonts.get(family)!;
  if(!fontBytes.has(family))fontBytes.set(family,fs.readFile(path.join(process.cwd(),"public/fonts/print",BOOK_FONTS[family].file)));
  // fontkit's CJK subset can omit visible glyphs even when ToUnicode is valid.
  const embedded=fontBytes.get(family)!.then(bytes=>pdf.embedFont(bytes,{subset:false}));
  fonts.set(family,embedded);return embedded;
}
function pageTypography(draft:CustomWorkbenchDraft,page:number):BookTypography {
  return {...draft.typography,...draft.studio?.pages?.[sourceForPrint(draft,page).upgradePage]?.typography};
}
function textColour(hex:string){return rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);}
export async function artworkBytes(asset:WorkbenchAsset) {
  if(asset.storagePath) return readAsset(asset.storagePath);
  if(asset.origin==="sample" && /^\/sample-books\/[a-zA-Z0-9_./-]+$/.test(asset.src) && !asset.src.includes(".."))
    return fs.readFile(path.join(process.cwd(),"public",asset.src));
  throw new LocalError("图片未保存在本机，请先上传或生成。",400);
}
export function sourceForPrint(draft:CustomWorkbenchDraft,page:number) {
  const shared=spreadStart(draft,page);
  return {asset:page===0?draft.cover:draft.pages[(shared||page)-1]?.asset,upgradePage:shared||page,shared};
}
async function artwork(draft:CustomWorkbenchDraft,page:number,render=true):Promise<Artwork> {
  const {asset,upgradePage,shared}=sourceForPrint(draft,page);
  if(!asset) throw new LocalError(`${page?`第 ${page} 页`:"封面"}缺少插图。`);
  if(asset.embeddedText && !artworkMatchesText(asset.embeddedText,artworkText(draft,page))) throw new LocalError(`${page?`第 ${page} 页`:"封面"}正文与图片内文字不一致。`);
  const bytes=await artworkBytes(asset);
  const meta=await sharp(bytes).metadata();
  if(!meta.width||!meta.height) throw new LocalError("无法读取插图尺寸。");
  if(asset.embeddedText) {
    if(shared) {
      const width=Math.floor(meta.width/2);
      const half=render?await sharp(bytes).extract({left:page>shared?width:0,top:0,width,height:meta.height}).jpeg({quality:98,chromaSubsampling:"4:4:4"}).toBuffer():bytes;
      return {bytes:half,width,height:meta.height,sourceId:asset.storagePath||asset.src,upgradePage};
    }
    return {bytes:render&&meta.format!=="jpeg"?await sharp(bytes).jpeg({quality:98,chromaSubsampling:"4:4:4"}).toBuffer():bytes,width:meta.width,height:meta.height,sourceId:asset.storagePath||asset.src,upgradePage};
  }
  const formatRatio=draft.format==="portrait"?.8:draft.format==="landscape"?4/3:1;
  const ratio=asset.ratio==="square"?1:asset.ratio==="portrait"?.8:asset.ratio==="landscape"?4/3:formatRatio*(shared?2:1);
  const baseWidth=Math.min(meta.width,meta.height*ratio);
  let width=Math.max(1,Math.floor(baseWidth/asset.crop.zoom));
  const height=Math.max(1,Math.floor(baseWidth/ratio/asset.crop.zoom));
  let left=Math.floor((meta.width-width)*asset.crop.x/100);
  const top=Math.floor((meta.height-height)*asset.crop.y/100);
  if(shared) {const half=Math.floor(width/2);if(page>shared)left+=half;width=half;}
  const unchangedJpeg=meta.format==="jpeg"&&left===0&&top===0&&width===meta.width&&height===meta.height;
  const cropped=render&&!unchangedJpeg?await sharp(bytes).extract({left,top,width,height}).jpeg({quality:98,chromaSubsampling:"4:4:4"}).toBuffer():bytes;
  return {bytes:cropped,width,height,sourceId:asset.storagePath||asset.src,upgradePage};
}
function block(text:string,size:number,width:number,font:PDFFont,lineHeight=1.55):TextBlock {
  const lines=text?wrapBookText(text,width,t=>font.widthOfTextAtSize(t,size)):[];
  return {lines,size,height:lines.length*size*lineHeight,leading:size*lineHeight};
}
function pagePlan(draft:CustomWorkbenchDraft,leaf:PrintLeaf,settings:PrintSettings,font:PDFFont,image:Artwork) {
  const geometry=printGeometry(settings,leaf.physical), safe=geometry.safe;
  const source=leaf.sourcePage!;
  const asset=sourceForPrint(draft,source).asset!;
  const design=pageTypography(draft,source);
  const placement=design.textBox?normalizeTextPlacement(design.textBox):undefined;
  const textRect=placement?{...safe,x:safe.x+placement.x/100*safe.width,width:placement.width/100*safe.width}:safe;
  const size=settings.bodyPt*design.size/28;
  const blocks=asset.embeddedText?[]:source===0
    ? [block(draft.title,34*design.size/28,textRect.width,font,design.lineHeight),block(draft.subtitle,18*design.size/28,textRect.width,font,design.lineHeight),block(draft.author?`作者 · ${draft.author}`:"",12,textRect.width,font,design.lineHeight)]
    : [block(draft.pages[source-1].text,size,textRect.width,font,design.lineHeight)];
  const textHeight=blocks.reduce((n,b)=>n+b.height+(b.lines.length?3*MM:0),0);
  if(textHeight>safe.height*.38) throw new LocalError(`${source?`第 ${source} 页`:"封面"}正文过长或字号过大，请缩小印刷字号或拆页。`);
  const footer=source?10*MM:0, gap=textHeight?8*MM:0;
  const topText=source>0&&design.position==="top";
  const textBottom=placement?Math.max(safe.y+footer,safe.y+safe.height*(1-placement.y/100)-textHeight):topText?safe.y+safe.height-textHeight:safe.y+footer;
  const imageWidth=Math.min(safe.width,settings.imageWidthMm*MM);
  const area={x:safe.x+(safe.width-imageWidth)/2,y:topText?safe.y+footer:safe.y+footer+textHeight+gap,width:imageWidth,height:safe.height-footer-textHeight-gap};
  const scale=Math.min(area.width/image.width,area.height/image.height);
  const imageRect={x:area.x+(area.width-image.width*scale)/2,y:area.y+(area.height-image.height*scale)/2,width:image.width*scale,height:image.height*scale};
  return {geometry,blocks,textBottom,textHeight,textRect,imageRect,design,ppi:Math.min(image.width/(imageRect.width/72),image.height/(imageRect.height/72))};
}
function label(page:number){return page?`正文第 ${page} 页`:"封面";}
async function scan(draft:CustomWorkbenchDraft,settings:PrintSettings,pdf:PDFDocument) {
  const leaves=printLeaves(draft.pageCount,settings.binding);
  const report:PrintReport={ready:false,settings,totalPages:leaves.length,blankPages:leaves.filter(p=>["inside-front","inside-back","padding"].includes(p.kind)).map(p=>p.physical),checks:[],errors:[],physicalPages:leaves};
  for(const leaf of leaves) if(leaf.sourcePage!==undefined) {
    try {
      const font=await printFont(pdf,pageTypography(draft,leaf.sourcePage).fontFamily);
      const charSet=new Set(font.getCharacterSet());
      const image=await artwork(draft,leaf.sourcePage,false), plan=pagePlan(draft,leaf,settings,font,image);
      const text=leaf.sourcePage===0?[draft.title,draft.subtitle,draft.author].join(""):draft.pages[leaf.sourcePage-1].text;
      const missing=[...new Set(Array.from(text).filter(c=>!/[\r\n\t]/.test(c)&&!charSet.has(c.codePointAt(0)!)))];
      if(missing.length)report.errors.push(`${label(leaf.sourcePage)}字体缺少字符：${missing.slice(0,12).join("")}`);
      report.checks.push({page:leaf.sourcePage,upgradePage:image.upgradePage,label:label(leaf.sourcePage),pixels:`${image.width} × ${image.height}`,ppi:Math.floor(plan.ppi+1e-6),requiredPpi:PRINT_PPI,needsUpgrade:plan.ppi<PRINT_PPI-1e-6,sourceId:image.sourceId});
    }catch(e){report.errors.push(e instanceof Error?e.message:"插图检查失败。");}
  }
  report.ready=!report.errors.length&&!report.checks.some(c=>c.needsUpgrade);
  return report;
}
export async function preflightPrint(draft:CustomWorkbenchDraft) {
  const pdf=await PDFDocument.create();
  return scan(draft,printSettingsSchema.parse(draft.print||{}),pdf);
}
function marks(page:import("pdf-lib").PDFPage,geometry:ReturnType<typeof printGeometry>,settings:PrintSettings) {
  if(settings.mode!=="press"||!settings.cropMarks)return;
  const r=geometry.trim,bleed=settings.bleedMm*MM;
  for(const x of [r.x,r.x+r.width])for(const y of [r.y,r.y+r.height]){
    const dx=x===r.x?-1:1,dy=y===r.y?-1:1;
    page.drawLine({start:{x:x+dx*(bleed+MM),y},end:{x:x+dx*(bleed+5*MM),y},thickness:.25,color:rgb(0,0,0)});
    page.drawLine({start:{x,y:y+dy*(bleed+MM)},end:{x,y:y+dy*(bleed+5*MM)},thickness:.25,color:rgb(0,0,0)});
  }
}
function drawBlocks(page:import("pdf-lib").PDFPage,font:PDFFont,blocks:TextBlock[],safe:Rect,bottom:number,height:number,align:"left"|"center"|"right"="left",colour=rgb(.07,.09,.11)) {
  let top=bottom+height;
  for(const b of blocks){
    for(const [i,line]of b.lines.entries()){
      const width=font.widthOfTextAtSize(line,b.size);
      page.drawText(line,{font,size:b.size,x:align==="center"?safe.x+(safe.width-width)/2:align==="right"?safe.x+safe.width-width:safe.x,y:top-b.size-i*b.leading,color:colour});
    }
    top-=b.height+(b.lines.length?3*MM:0);
  }
}
function drawTextBacking(page:import("pdf-lib").PDFPage,design:BookTypography,safe:Rect,bottom:number,height:number) {
  if(!height)return;
  const colour=textColour(design.backingColor||"#fffcf3"),opacity=design.backingOpacity??.92;
  const area={x:safe.x-2*MM,y:bottom-2*MM,width:safe.width+4*MM,height:height+4*MM};
  if(design.backingStyle==="solid"){page.drawRectangle({...area,color:colour,opacity});return;}
  for(let i=0;i<40;i++){
    const middle=(i+.5)/40,fade=Math.min(1,middle/.15,(1-middle)/.15);
    page.drawRectangle({x:area.x,y:area.y+area.height*i/40,width:area.width,height:area.height/40+.01,color:colour,opacity:opacity*fade});
  }
}
export async function exportPrintBook(draft:CustomWorkbenchDraft,includeBundle=true) {
  const settings=printSettingsSchema.parse(draft.print||{}),pdf=await PDFDocument.create(),font=await printFont(pdf,draft.typography.fontFamily);
  const report=await scan(draft,settings,pdf);
  if(!report.ready) throw new LocalError(report.errors[0]||`还有 ${report.checks.filter(c=>c.needsUpgrade).length} 页插图未达到 300 ppi，请先准备高清图。`,422);
  pdf.setTitle(`${draft.title} · A4 ${settings.mode==="press"?"印刷版":"办公打印版"}`);
  pdf.setAuthor(draft.author||"StoryBloom");pdf.setCreator("StoryBloom Local Print Studio");
  const viewer=pdf.catalog.getOrCreateViewerPreferences();viewer.setPrintScaling(PrintScaling.None);viewer.setDuplex(Duplex.DuplexFlipLongEdge);
  const leaves=printLeaves(draft.pageCount,settings.binding);
  const imageFiles:Record<string,Uint8Array>={};
  for(const leaf of leaves) {
    const geometry=printGeometry(settings,leaf.physical),{trim,safe,bleed}=geometry;
    const page=pdf.addPage([geometry.mediaWidth,geometry.mediaHeight]);
    page.setTrimBox(trim.x,trim.y,trim.width,trim.height);page.setBleedBox(bleed.x,bleed.y,bleed.width,bleed.height);page.setArtBox(safe.x,safe.y,safe.width,safe.height);
    page.drawRectangle({x:0,y:0,width:geometry.mediaWidth,height:geometry.mediaHeight,color:settings.mode==="office"?rgb(1,1,1):rgb(1,.992,.976)});
    if(leaf.sourcePage!==undefined) {
      const pageFont=await printFont(pdf,pageTypography(draft,leaf.sourcePage).fontFamily);
      const image=await artwork(draft,leaf.sourcePage),plan=pagePlan(draft,leaf,settings,pageFont,image);
      page.drawImage(await pdf.embedJpg(image.bytes),plan.imageRect);
      if(includeBundle)imageFiles[`05_高清插图/${String(leaf.sourcePage).padStart(3,"0")}_${leaf.sourcePage?"正文":"封面"}.jpg`]=image.bytes;
      if(effectiveTextBacking(draft,sourceForPrint(draft,leaf.sourcePage).upgradePage))drawTextBacking(page,plan.design,plan.textRect,plan.textBottom,plan.textHeight);
      drawBlocks(page,pageFont,plan.blocks,plan.textRect,plan.textBottom,plan.textHeight,plan.design.align,textColour(plan.design.color));
      if(leaf.sourcePage) {
        const number=String(leaf.sourcePage),width=font.widthOfTextAtSize(number,9);
        page.drawText(number,{font,size:9,x:safe.x+(safe.width-width)/2,y:safe.y,color:rgb(.3,.33,.35)});
      }
    } else if(leaf.kind==="back") {
      const blocks=[block(draft.title,28,safe.width,font),block(draft.subtitle||"献给每一个爱听故事的你",16,safe.width,font)];
      const height=blocks.reduce((n,b)=>n+b.height+3*MM,0);
      drawBlocks(page,font,blocks,safe,safe.y+(safe.height-height)/2,height,"center");
    }
    marks(page,geometry,settings);
  }
  const bytes=await pdf.save();
  if(!includeBundle)return {pdf:bytes,zip:new Uint8Array(0),report};
  async function extract(indices:number[]) {const doc=await PDFDocument.create();for(const p of await doc.copyPages(pdf,indices))doc.addPage(p);return doc.save();}
  const cover=await extract(leaves.filter(p=>["cover","inside-front","inside-back","back"].includes(p.kind)).map(p=>p.physical-1));
  const interior=await extract(leaves.filter(p=>p.kind==="story"||p.kind==="padding").map(p=>p.physical-1));
  const files:Record<string,Uint8Array>={"01_整本_A4.pdf":bytes,"02_内页_A4.pdf":interior,"03_封面四面_A4.pdf":cover,...imageFiles,"06_文稿与排版.json":strToU8(JSON.stringify({title:draft.title,subtitle:draft.subtitle,author:draft.author,print:settings,pages:draft.pages.slice(0,draft.pageCount).map((p,i)=>({page:i+1,text:p.text,scene:p.scene}))},null,2)),"印刷检查.json":strToU8(JSON.stringify(report,null,2))};
  if(settings.binding==="saddle"&&settings.mode==="office") {
    const imposed=await PDFDocument.create();
    imposed.catalog.getOrCreateViewerPreferences().setDuplex(Duplex.DuplexFlipShortEdge);
    imposed.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
    const embedded=await imposed.embedPdf(bytes,leaves.map((_,i)=>i));
    for(const [left,right]of bookletPairs(leaves.length)) {
      const p=imposed.addPage([420*MM,297*MM]);
      p.drawPage(embedded[left],{x:0,y:0,width:210*MM,height:297*MM});
      p.drawPage(embedded[right],{x:210*MM,y:0,width:210*MM,height:297*MM});
    }
    files["04_骑马订_A3双面拼版.pdf"]=await imposed.save();
  }
  const specs=[`书名：${draft.title}`,`正文：${draft.pageCount} 页；整本：${leaves.length} 面（封面、内封、封底和补白已列入）`,"成品尺寸：210 × 297 mm（A4竖版）",`模式：${settings.mode==="press"?`印厂版，四边 ${settings.bleedMm} mm 出血${settings.cropMarks?"，带裁切标记":"，裁切标记由印厂拼版时添加"}`:"办公版，A4纸，实际大小/100%，无出血裁切标记"}`,`装订：${settings.binding==="left"?"左侧装订，A4双面长边翻转":"骑马订；印厂版为阅读顺序，交由印厂拼版；办公版附A3纸短边翻转拼版，折后为A4"}`,`版心：内侧 ${settings.innerMm} mm、外侧 ${settings.outerMm} mm、上 ${settings.topMm} mm、下 ${settings.bottomMm} mm；奇偶页镜像`,"中文字体已嵌入，正文为可复制矢量文字；插图按有效300ppi检查，不插值冒充高清",`最低有效插图分辨率：${Math.min(...report.checks.map(c=>c.ppi))} ppi`,"图像保持RGB；需要特定CMYK/PDF-X或胶装书脊展开时，由制作人员按印厂ICC、纸厚与实际书脊宽另行处理。封面文件为四面单页。",`补白面：${report.blankPages.join("、")}；补白不印提示文字`,"全部PDF为单面阅读顺序，除明确命名的A3骑马订拼版外，不要重复拼版。",...leaves.map(p=>`${p.physical}: ${p.sourcePage===0?"封面":p.sourcePage?`正文${p.sourcePage}`:p.kind==="back"?"封底":"留白"}`)];
  files["制作说明.txt"]=strToU8(specs.join("\n"));
  files["编导稿.txt"]=strToU8("\uFEFF"+bookProductionText({result:draft,status:"complete"}));
  files["项目配置.json"]=strToU8(JSON.stringify(draft,null,2));
  return {pdf:bytes,zip:zipSync(files,{level:0}),report};
}
