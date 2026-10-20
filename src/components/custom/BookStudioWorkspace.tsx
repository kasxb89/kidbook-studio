"use client";
import { chineseProductionScene } from "@/lib/book-production";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { Image as ImageIcon } from "@phosphor-icons/react/dist/csr/Image";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { PaintBrush } from "@phosphor-icons/react/dist/csr/PaintBrush";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { TextT } from "@phosphor-icons/react/dist/csr/TextT";
import type {
  CustomWorkbenchDraft,
  WorkbenchAsset,
} from "@/lib/custom-workbench";
import { spreadStart } from "@/lib/custom-workbench";
import { assetForPage, type StudioPage } from "@/lib/book-studio";
import { BOOK_LAYOUTS, type BookLayout } from "@/lib/custom-book/layout";
import { applyBookTypography, effectiveTextBacking, pageTypography } from "@/lib/custom-book/typography";
import BookTextSettings from "./BookTextSettings";
import { placementFromRegion, type TextRegion } from "@/lib/custom-book/text-position";
import WorkbenchCanvas, { pageDimensions, drawWorkbench } from "./WorkbenchCanvas";
import { downloadBlob } from "@/lib/browser-download";
import s from "./BookStudioWorkspace.module.css";
type Draft = CustomWorkbenchDraft;
type Snapshot = {
  designPage: number;
  lettering?: Draft["pages"][number]["lettering"];
  asset?: WorkbenchAsset;
  design?: StudioPage["typography"];
  layout?: BookLayout;
  treatment?: Draft["pages"][number]["textTreatment"];
  allDesign?: {
    typography: Draft["typography"];
    pages: Record<string, StudioPage["typography"]>;
    treatments: Array<Draft["pages"][number]["textTreatment"]>;
  };
};
export default function BookStudioWorkspace({
  draft,
  page,
  mode,
  onEditPage,
  onNavigate,
  onUpdate,
  onUpload,
  disabled,
}: {
  draft: Draft;
  page: number;
  mode: "board" | "edit";
  onEditPage: () => void;
  onNavigate: (page: number) => void;
  onUpdate: (action: (draft: Draft) => Draft) => void;
  onUpload: (file: File, page: number) => void;
  disabled: boolean;
}) {
  const [inspectorTab, setInspectorTab] = useState<"content" | "history">("content");
  const [candidate, setCandidate] = useState("");
  const [undo, setUndo] = useState<Snapshot[]>([]);
  const [notice, setNotice] = useState("");
  const [canvasTool,setCanvasTool]=useState<"text"|"image">("text");
  const [textRegions,setTextRegions]=useState<TextRegion[]>([]);
  const [downloading,setDownloading]=useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    crop: WorkbenchAsset["crop"];
  } | null>(null);
  const target = spreadStart(draft, page) || page;
  const [pageWidth,pageHeight] = pageDimensions(draft.format);
  const paperRatio = pageWidth * (spreadStart(draft,page)?2:1) / pageHeight;
  const asset = assetForPage(draft, target);
  const entry = draft.studio?.pages?.[target] || {};
  const typography = pageTypography(draft, page);
  const versions = entry.versions || [];
  const compare = versions.find((v) => v.id === candidate);
  const comparing = mode==="edit" && inspectorTab==="history" && !!compare;
  const locked = disabled || !!asset?.embeddedText;
  useEffect(() => {
    setCandidate("");
    setUndo([]);
    setNotice("");
    setTextRegions([]);
  }, [page]);
  function snapshot(all = false, designPage = page) {
    setUndo((u) => [
      ...u.slice(-29),
      {
        designPage,
        lettering: designPage ? structuredClone(draft.pages[designPage - 1].lettering) : undefined,
        asset: asset && structuredClone(asset),
        design: draft.studio?.pages?.[designPage]?.typography && { ...draft.studio.pages[designPage].typography },
        layout: target ? draft.pages[target - 1].layout : undefined,
        treatment: designPage ? draft.pages[designPage - 1].textTreatment : undefined,
        ...(all ? { allDesign: {
          typography: { ...draft.typography },
          pages: structuredClone(Object.fromEntries(Object.entries(draft.studio?.pages || {}).map(([key, value])=>[key,value.typography]))),
          treatments: draft.pages.map(p=>p.textTreatment),
        } } : {}),
      },
    ]);
  }
  function composition(
    crop?: WorkbenchAsset["crop"],
    design?: StudioPage["typography"],
    layout?: BookLayout,
    designPage = page,
  ) {
    onUpdate((d) => ({
      ...d,
      ...(target === 0
        ? { cover: crop && d.cover ? { ...d.cover, crop } : d.cover }
        : {
            pages: d.pages.map((p, i) =>
              ({...p,...(i===target-1?{...(layout?{layout}:{}),asset:crop&&p.asset?{...p.asset,crop}:p.asset}:{}),...(i===designPage-1&&design&&"backing" in design?{textTreatment:undefined}:{})}),
            ),
          }),
      studio: {
        ...d.studio,
        pages: {
          ...d.studio?.pages,
          [designPage]: {
            ...d.studio?.pages?.[designPage],
            ...(design
              ? {
                  typography: {
                    ...d.studio?.pages?.[designPage]?.typography,
                    ...design,
                  },
                }
              : {}),
          },
        },
      },
    }));
  }
  function restore(version: WorkbenchAsset) {
    snapshot();
    setCandidate("");
    onUpdate((d) =>
      target === 0
        ? { ...d, cover: structuredClone(version) }
        : {
            ...d,
            pages: d.pages.map((p, i) =>
              i === target - 1 ? { ...p, asset: structuredClone(version) } : p,
            ),
          },
    );
  }
  function toggleReview() {
    onUpdate(d=>({...d,studio:{...d.studio,pages:{...d.studio?.pages,[page]:{...d.studio?.pages?.[page],review:d.studio?.pages?.[page]?.review==="approved"?"draft":"approved"}}}}));
  }
  async function downloadPage() {
    setDownloading(true);
    try {
      const canvas=document.createElement("canvas"),result=await drawWorkbench(canvas,draft,target,false,4);
      if(result.overflow||result.contentMismatch)throw new Error("请先处理本页文字超出画面或图文不一致的问题。");
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("图片编码失败，请重试。")),"image/png"));
      downloadBlob(blob,`${draft.title||"绘本"}_${target?`第${target}${spreadStart(draft,page)?`-${target+1}`:""}页`:"封面"}.png`);
      setNotice("本页PNG已开始下载，包含当前文字和背景样式。高分辨率原图也可在“文件与下载”中获取。");
    }catch(e){setNotice(`导出失败：${e instanceof Error?e.message:"请重试。"}`);}finally{setDownloading(false);}
  }
  return (
    <div className={s.studio} data-mode={mode}>
      <div className={s.toolbar}>
        <div className={s.boardInfo}><strong>{mode==="board"?"整本分镜板":"页面编辑"}</strong><span>{draft.pageCount} 页正文 ＋ 封面</span></div>
        <div className={s.pageNavigation}>
          {mode==="edit"&&<button className={s.downloadPage} disabled={downloading||!asset||disabled} onClick={()=>void downloadPage()}>{downloading?"正在导出…":"下载本页PNG"}</button>}
          <button aria-label="上一页" disabled={page===0} onClick={()=>onNavigate(page-1)}><ArrowLeft size={16} aria-hidden="true"/></button>
          <select aria-label="当前工作页" value={page} onChange={e=>onNavigate(Number(e.target.value))}>{Array.from({length:draft.pageCount+1},(_,n)=><option key={n} value={n}>{n?`第 ${n} 页`:"封面"}</option>)}</select>
          <button aria-label="下一页" disabled={page===draft.pageCount} onClick={()=>onNavigate(page+1)}><ArrowRight size={16} aria-hidden="true"/></button>
        </div>
      </div>
      <div className={mode==="board"?s.boardWorkspace:s.editWorkspace}>
      {mode === "board" ? (
        <div className={s.board} aria-label="整本故事分镜板">
          {Array.from({ length: draft.pageCount + 1 }, (_, n) => {
            const effective = spreadStart(draft, n) || n,
              a = assetForPage(draft, effective);
            const approved = draft.studio?.pages?.[n]?.review === "approved";
            return (
              <button
                key={n}
                aria-label={n ? `分镜第 ${n} 页` : "分镜封面"}
                aria-pressed={page === n}
                onClick={() => onNavigate(n)}
              >
                <div className={s.thumb}>
                  {a ? <img src={a.src} alt="" loading="lazy" decoding="async"/> : <span><ImageIcon size={26} aria-hidden="true"/>等待插图</span>}
                </div>
                <strong>
                  {n ? `第 ${n} 页` : "封面"}
                  <small data-approved={approved}>{approved ? "已审核" : a ? "待审核" : "待配图"}</small>
                </strong>
                <p>
                  {n
                    ? draft.pages[n - 1].text || "填写这一页的正文…"
                    : draft.title || "未命名绘本"}
                </p>
              </button>
            );
          })}
        </div>
      ) : <nav className={s.pageRail} aria-label="画布页面列表">{Array.from({length:draft.pageCount+1},(_,n)=>{const a=assetForPage(draft,spreadStart(draft,n)||n);return <button key={n} aria-label={n?`画布第 ${n} 页`:"画布封面"} aria-pressed={page===n} onClick={()=>onNavigate(n)}>{a?<img src={a.src} alt="" loading="lazy" decoding="async"/>:<ImageIcon size={22} aria-hidden="true"/>}<span>{n?`第 ${n} 页`:"封面"}</span></button>})}</nav>}
      <div className={s.workspace}>
        <div
          className={s.surface}
          aria-label="当前页面画布"
          style={{
            touchAction: mode==="edit" && canvasTool==="image" && !locked && !comparing ? "none" : "auto",
          }}
          onPointerDown={(e) => {
            if (mode!=="edit" || canvasTool!=="image" || locked || !asset || comparing || !(e.target as HTMLElement).closest("[data-book-paper]")) return;
            snapshot();
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              crop: { ...asset.crop },
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current || locked || comparing) return;
            const r = e.currentTarget.getBoundingClientRect();
            composition({
              ...drag.current.crop,
              x: Math.max(
                0,
                Math.min(
                  100,
                  drag.current.crop.x -
                    ((e.clientX - drag.current.x) / r.width) * 100,
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  100,
                  drag.current.crop.y -
                    ((e.clientY - drag.current.y) / r.height) * 100,
                ),
              ),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {mode==="edit"&&!asset?.embeddedText&&!comparing&&<div className={s.canvasTools} role="group" aria-label="画布移动工具">
            <button disabled={locked} aria-pressed={canvasTool==="text"} onClick={()=>setCanvasTool("text")}><TextT size={15} aria-hidden="true"/>移动文字</button>
            <button disabled={locked} aria-pressed={canvasTool==="image"} onClick={()=>setCanvasTool("image")}><ImageIcon size={15} aria-hidden="true"/>调整图片</button>
            <small>{canvasTool==="text"?"拖动文字框，方向键微调":"拖动画面调整取景"}</small>
          </div>}
          {mode==="edit"&&compare&&inspectorTab==="history" ? <div className={s.comparisonStage} aria-label="图片版本对比"><figure><figcaption>当前图片</figcaption>{asset&&<img src={asset.src} alt="当前图片"/>}</figure><figure><figcaption>历史版本 <small>{new Date(compare.createdAt).toLocaleDateString("zh-CN")}</small></figcaption><img src={compare.asset.src} alt="历史版本图片"/></figure></div> : mode==="board" ? <div className={s.selectedPreview}>{asset?<img src={asset.src} alt={page?`第 ${page} 页插图`:"封面插图"}/>:<div><ImageIcon size={36} aria-hidden="true"/><p>这页还没有插图</p></div>}</div> : (
            <div data-book-paper className={s.paper} style={{"--page-ratio":paperRatio,cursor:canvasTool==="image"?"grab":"default"} as CSSProperties}>
              <WorkbenchCanvas draft={draft} page={page} onTextRegions={setTextRegions}
                textEditing={!locked&&canvasTool==="text"?{onStart:designPage=>snapshot(false,designPage),onMove:(placement,designPage)=>composition(undefined,{textBox:placement},undefined,designPage)}:undefined}/>
            </div>
          )}
        </div>
        <aside className={s.inspector} aria-label="当前页面设置">
          <header className={s.inspectorHeading}><strong>{page?`第 ${page} 页`:"封面"}</strong><button disabled={disabled} className={s.reviewButton} aria-pressed={draft.studio?.pages?.[page]?.review==="approved"} onClick={toggleReview}><CheckCircle size={16} aria-hidden="true"/>{draft.studio?.pages?.[page]?.review==="approved"?"撤销审核":"标记已审核"}</button></header>
          {spreadStart(draft,page)&&<p className={s.spreadNote}>跨页 {target}–{target+1} 共用插图，两页文字分别排版。</p>}
          <div className={s.inspectorTabs} role="tablist" aria-label="页面设置面板" onKeyDown={e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const next=e.key==="Home"?"content":e.key==="End"?"history":inspectorTab==="content"?"history":"content";setInspectorTab(next);document.getElementById(next==="content"?"page-content-tab":"page-history-tab")?.focus();}}}><button role="tab" id="page-content-tab" tabIndex={inspectorTab==="content"?0:-1} aria-selected={inspectorTab==="content"} aria-controls="page-content-panel" onClick={()=>setInspectorTab("content")}><TextT size={16} aria-hidden="true"/>本页内容</button><button role="tab" id="page-history-tab" tabIndex={inspectorTab==="history"?0:-1} aria-selected={inspectorTab==="history"} aria-controls="page-history-panel" onClick={()=>setInspectorTab("history")}><ClockCounterClockwise size={16} aria-hidden="true"/>图片版本 <small>{versions.length}</small></button></div>
          <div role="tabpanel" id="page-content-panel" aria-labelledby="page-content-tab" hidden={inspectorTab!=="content"}>
          <fieldset className={s.controls} disabled={disabled}>
            <label>
              {page === 0 ? "书名" : "本页正文"}
              <textarea
                aria-label="画布正文"
                maxLength={page === 0 ? 100 : 2500}
                value={page === 0 ? draft.title : draft.pages[page - 1].text}
                onChange={(e) =>
                  onUpdate((d) =>
                    page === 0
                      ? { ...d, title: e.target.value }
                      : {
                          ...d,
                          pages: d.pages.map((p, i) =>
                            i === page - 1 ? { ...p, text: e.target.value } : p,
                          ),
                        },
                  )
                }
              />
            </label>
            {mode==="edit"&&<>
            {asset?.embeddedText&&<p className={s.spreadNote}>这页文字已绘入图片，字体和底色需重新生成图片后修改。</p>}
            <BookTextSettings typography={typography} backing={effectiveTextBacking(draft,page)} disabled={locked} page={page?draft.pages[page-1]:undefined} placement={textRegions[page>target?1:0]?placementFromRegion(textRegions[page>target?1:0],pageWidth,pageHeight):undefined}
              onLetteringChange={lettering=>{snapshot();onUpdate(d=>({...d,pages:d.pages.map((p,i)=>i===page-1?{...p,lettering}:p)}));setNotice("");}}
              onChange={design=>{snapshot();composition(undefined,design);setNotice("");}}
              onApplyAll={()=>{snapshot(true);onUpdate(d=>applyBookTypography(d,{...typography,backing:effectiveTextBacking(draft,page)}));setNotice(typography.preset==="storybook"?"已统一正文样式，各页位置与封面排版分别保留，并自动保存。":"已应用到整本的可编辑文字，并自动保存。");}}/>
            {notice&&<p role="status" className={s.spreadNote}>{notice}</p>}
            <details className={s.composition}>
              <summary>图片、取景与版式</summary>
            <label className={s.uploadField}>
              本页插图
              <span className={s.uploadButton}><ImageIcon size={17} aria-hidden="true"/>上传 / 替换图片</span>
              <input
                aria-label="上传本页图片"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUpload(file, target);
                  e.target.value = "";
                }}
              />
            </label>
            <p>
              {asset?.embeddedText
                ? "图文一体成品可切换版本；画面内文字和裁剪保持完整。"
                : "拖动画面调整取景；修改会自动保存。"}
            </p>
              <fieldset disabled={locked}>
              {(
                [
                  ["zoom", "缩放", 1, 2, 0.01],
                  ["x", "水平取景", 0, 100, 1],
                  ["y", "垂直取景", 0, 100, 1],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <label key={key}>
                  {label}{" "}
                  <output>
                    {asset?.crop[key] ?? (key === "zoom" ? 1 : 50)}
                  </output>
                  <input
                    aria-label={label}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={asset?.crop[key] ?? (key === "zoom" ? 1 : 50)}
                    disabled={!asset}
                    onPointerDown={()=>snapshot()}
                    onKeyDown={(e) => {
                      if (e.key.startsWith("Arrow")) snapshot();
                    }}
                    onChange={(e) =>
                      asset &&
                      composition({
                        ...asset.crop,
                        [key]: Number(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
              {target > 0 && (
                <label>
                  本页版式
                  <select
                    aria-label="本页版式"
                    value={draft.pages[target - 1].layout || "panorama"}
                    onChange={(e) => {
                      snapshot();
                      composition(
                        undefined,
                        undefined,
                        e.target.value as BookLayout,
                      );
                    }}
                  >
                    {Object.entries(BOOK_LAYOUTS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              </fieldset>
            </details>
            <button
              disabled={!undo.length}
              onClick={() => {
                const last = undo.at(-1)!;
                setUndo((u) => u.slice(0, -1));
                setNotice("");
                if(last.allDesign){
                  const saved=last.allDesign;
                  onUpdate(d=>({...d,typography:saved.typography,pages:d.pages.map((p,i)=>({...p,textTreatment:saved.treatments[i]})),studio:{...d.studio,pages:Object.fromEntries(Object.entries(d.studio?.pages||{}).map(([key,entry])=>[key,{...entry,typography:saved.pages[key]}]))}}));
                  return;
                }
                onUpdate((d) => ({
                  ...d,
                  ...(target === 0
                    ? { cover: last.asset }
                    : {
                        pages: d.pages.map((p,i)=>({...p,...(i===target-1?{asset:last.asset,layout:last.layout}:{}),...(i===last.designPage-1?{textTreatment:last.treatment,lettering:last.lettering}:{})})),
                      }),
                  studio: {
                    ...d.studio,
                    pages: {
                      ...d.studio?.pages,
                      [last.designPage]: {
                        ...d.studio?.pages?.[last.designPage],
                        typography: last.design,
                      },
                    },
                  },
                }));
              }}
            >
              撤销本次编辑
            </button>
            </>}
            {page > 0 && (
              <details className={s.composition}><summary>画面描述（可选修改）</summary>
              <label>
                场景描述
                <textarea
                  aria-label="画布场景描述"
                  maxLength={2500}
                  value={chineseProductionScene(draft.pages[page - 1])}
                  onChange={(e) =>
                    onUpdate((d) => ({
                      ...d,
                      pages: d.pages.map((p, i) =>
                        i === page - 1 ? { ...p, scene: e.target.value } : p,
                      ),
                    }))
                  }
                />
              </label>
              </details>
            )}
            {mode==="board"&&<button className={s.editPage} onClick={onEditPage}><PaintBrush size={17} aria-hidden="true"/>进入单页画布<ArrowRight size={15} aria-hidden="true"/></button>}
          </fieldset>
          </div>
          <div role="tabpanel" id="page-history-panel" aria-labelledby="page-history-tab" hidden={inspectorTab!=="history"}>
      <section className={s.history} aria-label="本页图片版本历史">
        <header>
          <strong>
            图片版本历史 <small>{versions.length} / 32</small>
          </strong>
          <span>最近 32 个版本保存在本机，可随时对比和恢复。</span>
        </header>
        {!versions.length && <p>上传或生成图片后，版本会自动保存在本机。</p>}
        <div className={s.versions}>
          {[...versions].reverse().map((v, i) => (
            <div key={v.id}>
              <img src={v.asset.src} alt={`图片版本 ${versions.length - i}`} loading="lazy" decoding="async"/>
              <strong>
                版本 {versions.length - i}
                {v.asset.storagePath === asset?.storagePath &&
                v.asset.src === asset?.src
                  ? " · 当前图片"
                  : ""}
              </strong>
              <small>{new Date(v.createdAt).toLocaleString("zh-CN")}</small>
              <div>
                <button
                  onClick={() => setCandidate(candidate === v.id ? "" : v.id)}
                >
                  {candidate === v.id ? "关闭对比" : "对比"}
                </button>
                <button disabled={disabled} onClick={() => restore(v.asset)}>
                  使用此版本
                </button>
              </div>
            </div>
          ))}
        </div>
        {compare && mode==="board" && (
          <div className={s.compare}>
            <figure>
              <figcaption>当前图片</figcaption>
              {asset && <img src={asset.src} alt="当前图片" />}
            </figure>
            <figure>
              <figcaption>
                历史版本 · {new Date(compare.createdAt).toLocaleString("zh-CN")}
              </figcaption>
              <img src={compare.asset.src} alt="历史版本图片" />
            </figure>
          </div>
        )}
      </section>
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}
