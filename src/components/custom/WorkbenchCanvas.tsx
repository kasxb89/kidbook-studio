"use client";
import { useEffect, useRef, useState } from "react";
import {
  spreadStart,
  type CustomWorkbenchDraft,
  type WorkbenchAsset,
} from "@/lib/custom-workbench";

import { artworkText, artworkMatchesText } from "@/lib/custom-book/integrated";
import { textArea, textRegion, placementFromRegion, normalizeTextPlacement, type TextPlacement, type TextRegion } from "@/lib/custom-book/text-position";
import { wrapBookText } from "@/lib/custom-book/text-wrap";
import { effectiveTextBacking, loadBookFont, pageTypography } from "@/lib/custom-book/typography";
import { storyTextPlan, layoutStoryText, bookPageDimensions } from "@/lib/custom-book/lettering";
import { canvasTextFont, drawCanvasText, rotatedTextBounds } from "@/lib/custom-book/text-canvas";
import "./book-fonts.css";
import s from "./WorkbenchCanvas.module.css";

export function pageDimensions(
  format: CustomWorkbenchDraft["format"],
): [number, number] {
  return bookPageDimensions(format);
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片无法读取，请替换图片后重试。"));
    img.src = src;
  });
}
export async function drawWorkbench(
  canvas: HTMLCanvasElement,
  draft: CustomWorkbenchDraft,
  page: number,
  hideText = false,
  pixelRatio = 1,
) {
  const studioPage = spreadStart(draft, page) || page;
  const baseDesign = pageTypography(draft, studioPage);
  await loadBookFont(baseDesign.fontFamily);
  const [pw, h] = pageDimensions(draft.format);
  const start = spreadStart(draft, page);
  const storyMode = baseDesign.preset === "storybook" || !!start && pageTypography(draft, start + 1).preset === "storybook";
  const w = start ? pw * 2 : pw;
  canvas.width = Math.round(w*pixelRatio);
  canvas.height = Math.round(h*pixelRatio);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器暂不支持画布。");
  ctx.scale(pixelRatio,pixelRatio);
  ctx.fillStyle = baseDesign.background;
  ctx.fillRect(0, 0, w, h);
  const asset: WorkbenchAsset | undefined =
    page === 0 ? draft.cover : draft.pages[(start || page) - 1]?.asset;
  const pageConfig = page === 0 ? undefined : draft.pages[(start || page) - 1];
  const layout = pageConfig?.layout || "panorama";
  if (asset) {
    const img = await loadImage(asset.src);
    if (asset.embeddedText) {
      const scale = Math.min(w / img.width, h / img.height);
      ctx.drawImage(
        img,
        (w - img.width * scale) / 2,
        (h - img.height * scale) / 2,
        img.width * scale,
        img.height * scale,
      );
      return {
        overflow: false,
        textRegions: [] as TextRegion[],
        contentMismatch: !artworkMatchesText(
          asset.embeddedText,
          artworkText(draft, page),
        ),
      };
    }
    const ratio =
      asset.ratio === "square"
        ? 1
        : asset.ratio === "portrait"
          ? 0.8
          : asset.ratio === "landscape"
            ? 4 / 3
            : w / h;
    const sw0 = Math.min(img.width, img.height * ratio);
    const sh0 = sw0 / ratio;
    const sw = sw0 / asset.crop.zoom,
      sh = sh0 / asset.crop.zoom;
    const sx = ((img.width - sw) * asset.crop.x) / 100,
      sy = ((img.height - sh) * asset.crop.y) / 100;
    const scale = Math.max(w / sw, h / sh);
    const dw = sw * scale,
      dh = sh * scale;
    ctx.save();
    if (layout === "minimal" && !storyMode) {
      const inset = pw * 0.09,
        panelHeight = h * 0.58;
      const scale = Math.min((w - inset * 2) / sw, panelHeight / sh);
      ctx.beginPath();
      ctx.rect(inset, inset, w - inset * 2, panelHeight);
      ctx.clip();
      ctx.drawImage(
        img,
        sx,
        sy,
        sw,
        sh,
        (w - sw * scale) / 2,
        inset + (panelHeight - sh * scale) / 2,
        sw * scale,
        sh * scale,
      );
    } else
      ctx.drawImage(img, sx, sy, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = "#e2e8d7";
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.4, h * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b2bea5";
    ctx.font = "24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("在这里放入你的故事画面", w / 2, h * 0.4);
  }
  if (layout === "sidebar" && !storyMode) {
    ctx.fillStyle = draft.typography.background;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.68);
    ctx.bezierCurveTo(w * 0.25, h * 0.81, w * 0.6, h * 0.58, w, h * 0.7);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }
  if (layout === "embrace" && !storyMode) {
    const mist = ctx.createLinearGradient(0, h * 0.48, 0, h);
    mist.addColorStop(0, draft.typography.background + "00");
    mist.addColorStop(0.55, draft.typography.background + "e6");
    mist.addColorStop(1, draft.typography.background);
    ctx.fillStyle = mist;
    ctx.fillRect(0, h * 0.48, w, h * 0.52);
  }
  if (layout === "minimal" && !storyMode) {
    ctx.strokeStyle = draft.typography.color + "55";
    ctx.lineWidth = 1;
    for (let side = 0; side < (start ? 2 : 1); side++) {
      ctx.beginPath();
      ctx.moveTo(side * pw + pw * 0.12, h * 0.7);
      ctx.lineTo(side * pw + pw * 0.23, h * 0.7);
      ctx.stroke();
    }
  }
  if (hideText) return { overflow: false, textRegions: [] as TextRegion[] };
  let overflow = false;
  const textRegions:TextRegion[]=[];
  const texts =
    page === 0
      ? [
          [
            draft.title || "未命名绘本",
            draft.subtitle,
            draft.author && `作者 · ${draft.author}`,
          ]
            .filter(Boolean)
            .join("\n"),
        ]
      : start
        ? [draft.pages[start - 1].text, draft.pages[start].text]
        : [draft.pages[page - 1].text];
  for (const [index, text] of texts.entries()) {
    const physicalPage = start ? start + index : page;
    const design = pageTypography(draft, physicalPage);
    await loadBookFont(design.fontFamily);
    const measure=(value:string,size:number)=>{ctx.font=canvasTextFont(design,size);return Array.from(value).reduce((width,c)=>width+ctx.measureText(c).width,0);};
    let region:TextRegion;
    if (physicalPage > 0 && design.preset === "storybook") {
      const plan=storyTextPlan(draft.pages[physicalPage-1],design,pw,h,index,measure);
      if(!text.trim())continue;
      region=plan.region;overflow ||= plan.overflow;
      drawCanvasText(ctx,design,region,plan.lettering.glyphs,effectiveTextBacking(draft,physicalPage));
    } else {
      const size=page===0?design.size*1.5:design.size,box=textArea(layout,pw,h,index,design.textBox);
      const spacing=design.letterSpacing??0;
      const lines=wrapBookText(text,box.width,value=>measure(value,size)+Math.max(0,Array.from(value).length-1)*size*spacing);
      if(!text.trim())continue;
      const lettering=layoutStoryText(text,{...design,size,letterSpacing:spacing},{lines},[],box.width,measure);
      region=textRegion(box,design,lettering.height+32,pw,h,index);
      overflow ||= lettering.height+32>box.height;
      drawCanvasText(ctx,design,region,lettering.glyphs.map(g=>({...g,baseline:g.baseline+16})),effectiveTextBacking(draft,physicalPage));
    }
    textRegions.push(region);
    const bounds=rotatedTextBounds(region,design.rotation);
    overflow ||= bounds.left<-.1||bounds.right>w+.1||bounds.top<-.1||bounds.bottom>h+.1;
  }

  return { overflow, textRegions };
}
export default function WorkbenchCanvas({
  draft,
  page,
  onStatus,
  hideText = false,
  textEditing,
  onTextRegions,
}: {
  draft: CustomWorkbenchDraft;
  page: number;
  hideText?: boolean;
  onStatus?: (error: string) => void;
  onTextRegions?: (regions:TextRegion[]) => void;
  textEditing?: { onStart:(page:number)=>void; onMove:(placement:TextPlacement, page:number)=>void };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const paintedKey=useRef("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(true);
  const [regions,setRegions]=useState<TextRegion[]>([]);
  const textDrag=useRef<{pointer:number;x:number;y:number;placement:TextPlacement;scaleX:number;scaleY:number}|null>(null);
  const [pageWidth, pageHeight] = pageDimensions(draft.format);
  const spread = spreadStart(draft, page);
  const width = spread ? pageWidth * 2 : pageWidth;
  const asset = page === 0 ? draft.cover : draft.pages[(spread || page) - 1]?.asset;
  const renderKey=`${page}:${draft.format}:${asset?.src||""}`;
  useEffect(()=>{setRegions([]);textDrag.current=null;},[page]);
  useEffect(() => {
    let active = true;
    setLoading(paintedKey.current!==renderKey);
    setWarning("");
    const buffer = document.createElement("canvas");
    drawWorkbench(buffer, draft, page, hideText)
      .then(({ overflow, contentMismatch, textRegions }) => {
        if (!active || !ref.current) return;
        ref.current.width = buffer.width;
        ref.current.height = buffer.height;
        ref.current.getContext("2d")?.drawImage(buffer, 0, 0);
        paintedKey.current=renderKey;
        setLoading(false);
        setRegions(textRegions);
        onTextRegions?.(textRegions);
        const message = contentMismatch
          ? "正文已修改，但图中文字尚未更新；请重新生成后导出。"
          : overflow
            ? "文字超出书页，请缩小字号或精简文案后再导出。"
            : "";
        setWarning(message);
        onStatus?.(message);
      })
      .catch((error) => {
        if (active) {
          setWarning(error.message);
          setLoading(false);
          onStatus?.(error.message);
        }
      });
    return () => {
      active = false;
    };
  }, [draft, page, onStatus, hideText, onTextRegions, renderKey]);
  return (
    <>
      <div style={{position:"relative",width:"100%",aspectRatio:`${width} / ${pageHeight}`}} aria-busy={loading}>
      <canvas
        ref={ref}
        width={width}
        height={pageHeight}
        data-render-state={loading?"loading":"ready"}
        role="img"
        aria-label={
          page === 0
            ? `封面：${draft.title}`
            : `第 ${page} 页：${draft.pages[page - 1]?.text}`
        }
        style={{ width: "100%", height: "auto", display: "block",opacity:loading?0:1 }}
      />
      {textEditing&&!asset?.embeddedText&&regions.map((region,index)=><button key={index} className={s.textHandle} type="button"
        aria-label={regions.length>1?`拖动${index===0?"左页":"右页"}文字位置`:"拖动文字位置"}
        title="拖动移动文字；方向键微调，Shift 加速"
        style={{left:`${region.x/width*100}%`,top:`${region.y/pageHeight*100}%`,width:`${region.width/width*100}%`,height:`${region.height/pageHeight*100}%`,transform:`rotate(${pageTypography(draft,(spread||page)+region.side).rotation||0}deg)`}}
        onPointerDown={e=>{e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});const r=ref.current!.getBoundingClientRect();textEditing.onStart((spread||page)+region.side);textDrag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,placement:placementFromRegion(region,pageWidth,pageHeight),scaleX:width/r.width/pageWidth*100,scaleY:100/r.height};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const drag=textDrag.current;if(!drag||drag.pointer!==e.pointerId)return;e.stopPropagation();textEditing.onMove(normalizeTextPlacement({...drag.placement,x:drag.placement.x+(e.clientX-drag.x)*drag.scaleX,y:drag.placement.y+(e.clientY-drag.y)*drag.scaleY}),(spread||page)+region.side);}}
        onPointerUp={e=>{e.stopPropagation();textDrag.current=null;}}
        onPointerCancel={()=>{textDrag.current=null;}}
        onKeyDown={e=>{if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key))return;e.preventDefault();e.stopPropagation();const p=placementFromRegion(region,pageWidth,pageHeight),step=e.altKey?.1:e.shiftKey?5:1;textEditing.onStart((spread||page)+region.side);textEditing.onMove(normalizeTextPlacement({...p,x:p.x+(e.key==="ArrowLeft"?-step:e.key==="ArrowRight"?step:0),y:p.y+(e.key==="ArrowUp"?-step:e.key==="ArrowDown"?step:0)}),(spread||page)+region.side);}}
      ><span>拖动文字</span></button>)}
      {loading&&<div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",background:draft.typography.background}}>{asset&&<img src={asset.src} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain"}}/>}<span role="status" style={{position:"absolute",bottom:12,padding:"5px 10px",borderRadius:5,background:"#ffffffed",color:"#294a35",fontSize:12}}>正在载入书页…</span></div>}
      </div>
      {warning && <p role="alert">{warning}</p>}
    </>
  );
}
