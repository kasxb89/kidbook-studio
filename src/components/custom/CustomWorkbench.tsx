"use client";
import { visualStyleFor } from "@/lib/custom-book/visual-style";
import Link from "next/link";
import { BookOpen } from "@phosphor-icons/react/dist/csr/BookOpen";
import { SquaresFour } from "@phosphor-icons/react/dist/csr/SquaresFour";
import { PaintBrush } from "@phosphor-icons/react/dist/csr/PaintBrush";
import { Printer } from "@phosphor-icons/react/dist/csr/Printer";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { FloppyDisk } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { HardDrives } from "@phosphor-icons/react/dist/csr/HardDrives";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import integratedSample from "../../../public/sample-books/integrated-garden/draft.json";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  createWorkbenchDraft,
  makeAsset,
  serializeWorkbench,
  setWorkbenchPageCount,
  spreadStart,
  toggleWorkbenchSpread,
  type CustomWorkbenchDraft,
  type WorkbenchAsset,
  type WorkbenchCharacter,
} from "@/lib/custom-workbench";
import { normalizeFamilyImageCrop } from "@/lib/family-image-crop";
import WorkbenchCanvas from "./WorkbenchCanvas";
import { ImmersiveWorkbenchReader } from "./WorkbenchBook";
import { useLocalWorkbench } from "@/hooks/useLocalWorkbench";
import BookStudioWorkspace from "./BookStudioWorkspace";
import ManualBookSetup from "./ManualBookSetup";
import AutomaticBookCreator from "./AutomaticBookCreator";
import LocalSaveLocation from "./LocalSaveLocation";
import { automaticBookDraft,recoverAutomaticBook } from "@/lib/automatic-book";
import { chineseProductionScene,type ProductionEdit } from "@/lib/book-production";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import PrintExportPanel from "./PrintExportPanel";
import PageCountField from "./PageCountField";
import DomainBriefFields from "./DomainBriefFields";
import { briefErrors } from "@/lib/book-domain";
import { useCustomBook } from "@/hooks/useCustomBook";
import { exportCustomBookPdf } from "@/lib/custom-book/pdf";
import s from "./CustomWorkbench.module.css";
import { BOOK_LAYOUTS, type BookLayout } from "@/lib/custom-book/layout";

const steps = ["基础信息", "人物与素材", "故事分镜", "画风排版", "确认生成"];
const workspacePanels = [
  { id: "ai", label: "AI 一键成书", icon: Sparkle, description: "填好参数、上传照片，自动完成设定、分镜和整本配图。" },
  { id: "create", label: "创作设定", icon: BookOpen, description: "手动调整当前项目的人物、故事和排版。" },
  { id: "board", label: "故事分镜", icon: SquaresFour, description: "从封面到最后一页，检查整本故事的节奏。" },
  { id: "canvas", label: "单页画布", icon: PaintBrush, description: "专注一页，调整画面、正文与图片版本。" },
  { id: "print", label: "印刷交付", icon: Printer, description: "检查清晰度，选择装订，导出 A4 成册文件。" },
] as const;
type WorkspacePanel = typeof workspacePanels[number]["id"];
const styles = {
  watercolor: "温柔水彩",
  cartoon: "趣味卡通",
  fairytale: "梦幻童话",
};
type AssetTarget =
  | { kind: "cover" }
  | { kind: "page"; index: number }
  | { kind: "character"; id: string };
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  let bound = false;
  const fields = Children.map(children, (child) => {
    if (
      !bound &&
      isValidElement(child) &&
      ["input", "select", "textarea"].includes(String(child.type))
    ) {
      bound = true;
      return cloneElement(child as ReactElement<{ id?: string }>, { id });
    }
    return child;
  });
  return (
    <div className={s.field}>
      {bound ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}
      {fields}
    </div>
  );
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={s.dialog}
      onCancel={onClose}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button onClick={onClose} aria-label="关闭弹窗">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
export default function CustomWorkbench() {
  const local = useLocalWorkbench();
  const projectIdRef = useRef(local.projectId);
  projectIdRef.current = local.projectId;
  const { draft, setDraft } = local;
  const [step, setStep] = useState(0);
  const [manual, setManual] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const page = Math.min(draft.pageCount, draft.studio?.selectedPage || 0);
  function setPage(value: number | ((page: number) => number)) {
    if (!local.ready || printBusy) return;
    setDraft(d => ({ ...d, studio: { ...d.studio, selectedPage: Math.max(0, Math.min(d.pageCount, typeof value === "function" ? value(d.studio?.selectedPage || 0) : value)) } }));
  }
  const [modal, setModal] = useState<"read" | "reset" | null>(null);
  const [editing, setEditing] = useState<{
    target: AssetTarget;
    asset: WorkbenchAsset;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [proofread, setProofread] = useState(false);
  const proofreadContent = JSON.stringify({title:draft.title,subtitle:draft.subtitle,cover:draft.cover,pages:draft.pages.slice(0,draft.pageCount),format:draft.format,typography:draft.typography,spreads:draft.spreads,design:Object.fromEntries(Object.entries(draft.studio?.pages||{}).map(([key,value])=>[key,value.typography]))});
  useEffect(() => setProofread(false), [proofreadContent]);
  const activePanel: WorkspacePanel = draft.studio?.activePanel || (draft.studio?.workspace === "edit" ? "canvas" : draft.cover ? "board" : "create");
  const panel = workspacePanels.find(item => item.id === activePanel)!;
  function goToPanel(next: WorkspacePanel) {
    if (!local.ready || printBusy || preparing) return;
    setDraft(d => ({...d,studio:{...d.studio,activePanel:next,...(next === "board" ? {workspace:"board" as const} : next === "canvas" ? {workspace:"edit" as const,view:"canvas" as const} : {})}}));
  }
  const hasEmbeddedArtwork =
    !!draft.cover?.embeddedText ||
    draft.pages.slice(0, draft.pageCount).some((p) => p.asset?.embeddedText);


  const live = useCustomBook((result,job) => {
    setDraft(d => job.automatic&&job.status==="complete"?recoverAutomaticBook(d,result,job.id):({ ...result, studio: {...result.studio,...d.studio} }));
  }, setMessage, local.projectId);
  const currentJob = (live.job?.projectId===local.projectId?live.job:null) || live.jobs.find(j => j.projectId===local.projectId&&!["complete", "failed"].includes(j.status)) || live.jobs.find(j=>j.projectId===local.projectId) || null;
  const activeJob = !!currentJob && !["complete", "failed"].includes(currentJob.status);
  useEffect(()=>{
    if(!local.ready||live.busy)return;
    const finished=live.jobs.find(j=>j.projectId===local.projectId&&j.automatic&&j.status==="complete");
    if(finished&&draft.studio?.completedAutomaticJob!==finished.id)setDraft(d=>recoverAutomaticBook(d,finished.result,finished.id));
  },[local.ready,local.projectId,live.busy,live.jobs,draft.studio?.completedAutomaticJob,setDraft]);
  useEffect(() => {
    if (live.job?.status === "review") setStep(2);
  }, [live.job?.status]);
  async function startAutomaticBook(source:CustomWorkbenchDraft) {
    if(!local.ready||live.busy||preparing||printBusy||activeJob)throw new Error("请先完成或结束当前制作任务。");
    setPreparing(true);
    try {
      await local.flush();
      const input=automaticBookDraft(source),body=JSON.stringify(input);
      const key="storybloom.local.pending-automatic";
      let pending:{id:string;body:string}|null=null;
      try{pending=JSON.parse(localStorage.getItem(key)||"null");}catch{}
      const id=pending?.body===body?pending.id:crypto.randomUUID();
      localStorage.setItem(key,JSON.stringify({id,body}));
      const response=await fetch("/api/local/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"automatic",id,draft:input})});
      const job=await response.json();if(!response.ok)throw new Error(job.error||"一键制作启动失败，参数已保留。");
      await local.selectProject(job.projectId);
      localStorage.removeItem(key);setManual(false);setMessage("已创建独立新项目，AI 将自动完成整本制作。");
    }finally{setPreparing(false);}
  }
  async function saveProduction(edit:ProductionEdit,expectedUpdatedAt:string) {
    if(!currentJob||live.busy||!local.ready||printBusy)throw new Error("请等待当前步骤保存后再修改。");
    const id=currentJob.id,projectId=local.projectId;
    await local.flush();
    const saved=await live.saveProduction(id,edit,expectedUpdatedAt,local.savedRevision());
    if(projectIdRef.current!==projectId)throw new Error("修改已保存，请重新打开刚才的项目。");
    local.acceptServerProject(saved.project);setMessage("编导修改已保存。已生成的画面可在单页画布中重新生成。");
  }
  function update(fn: (d: CustomWorkbenchDraft) => CustomWorkbenchDraft) {
    if (!local.ready || preparing || printBusy) return;
    if (live.busy || (activeJob && currentJob?.status !== "review")) {
      setMessage("生成期间配置已锁定；完成后可以继续调整文字与排版。");
      return;
    }
    setDraft(fn);
  }
  function patch(value: Partial<CustomWorkbenchDraft>) {
    update((d) => ({ ...d, ...value }));
  }
  async function openOutlineReview() {
    try {
      await local.flush();
      if (currentJob && live.job?.id !== currentJob.id) await live.resume(currentJob.id, draft);
      goToPanel("board");
    } catch (e) { setMessage(e instanceof Error ? e.message : "分镜读取失败，请重试。"); }
  }
  function characterPatch(id: string, value: Partial<WorkbenchCharacter>) {
    update((d) => ({
      ...d,
      characters: d.characters.map((c) =>
        c.id === id ? { ...c, ...value } : c,
      ),
    }));
  }
  function pagePatch(
    index: number,
    value: Partial<CustomWorkbenchDraft["pages"][number]>,
  ) {
    update((d) => ({
      ...d,
      pages: d.pages.map((p, i) => (i === index ? { ...p, ...value } : p)),
    }));
  }
  function saveAsset(target: AssetTarget, asset?: WorkbenchAsset) {
    if (target.kind === "cover") patch({ cover: asset });
    else if (target.kind === "character") characterPatch(target.id, { asset });
    else pagePatch(target.index, { asset });
  }
  async function upload(file: File | undefined, target: AssetTarget) {
    if (!file || uploading) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 15 * 1024 * 1024
    ) {
      setMessage("请选择 15 MB 以内的 JPG、PNG 或 WebP 图片。");
      return;
    }
    const uploadProjectId=local.projectId;
    setUploading(true);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/local/assets", {method:"POST",body:form});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "图片保存失败");
      if(projectIdRef.current!==uploadProjectId)return;
      saveAsset(target,{...makeAsset(result.src,file.name,target.kind),storagePath:result.storagePath,origin:"uploaded"});
      setMessage("图片已保存到本机。需要裁剪时可在图片设置中调整。");
    } catch(e) {if(projectIdRef.current===uploadProjectId)setMessage(e instanceof Error ? e.message : "图片保存失败，请重试。");}
    finally {setUploading(false);}
  }

  function assetControl(target: AssetTarget, asset?: WorkbenchAsset) {
    return (
      <fieldset className={s.assetRow} disabled={activeJob || live.busy || printBusy}>
        {asset ? (
          <img src={asset.src} alt={asset.name} />
        ) : (
          <span className={s.uploadIllustration} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="8" cy="8" r="1.5" />
              <path d="m3 17 5-5 4 4 4-6 5 7" />
            </svg>
          </span>
        )}
        <div className={s.assetContent}>
          <strong className={s.assetTitle}>
            {target.kind === "character"
              ? "人物参考照片"
              : target.kind === "cover"
                ? "封面插画"
                : "内页插画"}
          </strong>
          <div className={s.assetActions}>
            <label className={s.upload}>
              <span aria-hidden="true">＋</span>{" "}
              {asset ? "更换图片" : "选择图片"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={`${target.kind === "character" ? "人物参考" : target.kind === "cover" ? "封面" : "内页"}图片`}
                onChange={(e) => {
                  void upload(e.target.files?.[0], target);
                  e.target.value = "";
                }}
              />
            </label>
            {asset && (
              <>
                <button
                  disabled={!!asset.embeddedText}
                  title={
                    asset.embeddedText
                      ? "图文一体成品保留完整画面，修改需要重新生成"
                      : undefined
                  }
                  onClick={() =>
                    setEditing({ target, asset: structuredClone(asset) })
                  }
                >
                  处理 / 裁剪
                </button>
                <button onClick={() => saveAsset(target)}>移除</button>
              </>
            )}
          </div>
          <small>{asset ? asset.name : "JPG / PNG / WebP · 最大 15 MB"}</small>
        </div>
      </fieldset>
    );
  }
  const activePage = Math.max(1, page);
  const current = draft.pages[activePage - 1];
  const spread = spreadStart(draft, page);
  const imageIndex = (spread || activePage) - 1;
  function navigate(next: number) {
    setPage(Math.min(draft.pageCount, Math.max(0, next)));
  }
  async function exportPdf() {
    if (hasEmbeddedArtwork && !proofread) {
      setMessage("请先逐页核对图中文字和人物，再确认校对并下载。");
      return;
    }
    setExporting(true);
    try {
      await local.flush();const exportProjectId=local.projectId,revision=local.savedRevision();
      const blob = await exportCustomBookPdf(draft, setMessage);
      const response=await fetch(`/api/local/projects/${exportProjectId}/preview`,{method:"POST",headers:{"Content-Type":"application/pdf","X-Project-Revision":String(revision)},body:blob});
      if(!response.ok){const result=await response.json();throw new Error(result.error||"PDF 归档失败，请重试。");}
      download(blob, `${draft.title || "我的绘本"}.pdf`);
      setMessage("整本 PDF 已保存到本书文件夹的“成品PDF”，同时已下载。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF 导出失败");
    } finally {
      setExporting(false);
    }
  }
  return (
    <main className={s.workbench} data-local-workbench>
      <aside className={s.sidebar}>
        <Link href="/custom" className={s.brand}>
          <BookOpen size={25} weight="duotone" aria-hidden="true" />
          <span>StoryBloom<small>绘本创作工作室</small></span>
        </Link>
        <div className={s.projectPicker}>
          <label htmlFor="local-project">当前项目</label>
          <select id="local-project" aria-label="本机项目" value={local.projectId} disabled={!local.ready || live.busy || preparing || printBusy || !!(activeJob&&currentJob?.status!=="paused")} onChange={e=>{setManual(false);void local.selectProject(e.target.value).catch(e=>setMessage(e.message));}}>
            {local.projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button disabled={!local.ready || live.busy || preparing || printBusy || activeJob} onClick={() => setModal("reset")}><Plus size={17} aria-hidden="true" />新建 / 载入示例</button>
        </div>
        <button className={s.aiSidebarButton} aria-label="AI 一键成书" aria-current={activePanel==="ai"?"page":undefined} disabled={!local.ready||printBusy||preparing} onClick={()=>goToPanel("ai")}><Sparkle size={19} aria-hidden="true"/><span>AI 一键成书</span></button>
        <nav className={s.workspaceNav} aria-label="工作区导航">
          <span className={s.navLabel}>手动制作与成品编辑</span>
          {workspacePanels.filter(item=>item.id!=="ai").map(({id,label,icon:Icon},index)=><button key={id} aria-label={label} aria-current={activePanel===id?"page":undefined} disabled={!local.ready||printBusy||preparing} onClick={()=>goToPanel(id)}><Icon size={20} aria-hidden="true"/><span>{label}</span><small aria-hidden="true">0{index+1}</small></button>)}
        </nav>

        <div className={s.sidebarFooter}>
          <div><HardDrives size={18} aria-hidden="true"/><span>本机工作空间<small>自动保存 · 刷新可恢复</small></span></div>
          <button disabled={!local.ready} onClick={() => {download(new Blob([serializeWorkbench(draft)], {type:"application/json"}),"绘本配置.json");setMessage("已导出配置。跨电脑迁移时请一并备份本机 .local-data 数据目录。");}}><ArrowSquareOut size={16} aria-hidden="true"/>导出项目配置</button>
        </div>
      </aside>
      <div className={s.mainArea}>
      <header className={s.topbar}>
        <div className={s.projectHeading}><span>{activePanel==="ai"?"独立 AI 制作":"我的绘本"} <CaretRight size={13} aria-hidden="true" /></span><strong>{activePanel==="ai"?(currentJob?.automatic?currentJob.result.title||"AI 正在制作新绘本":"新建一本绘本"):draft.title || "未命名绘本"}</strong></div>
        <div className={s.topActions}>
          <span className={s.quota} data-saved={local.status==="已保存到本机"}>{local.status==="已保存到本机"?<CheckCircle size={16} aria-hidden="true"/>:<FloppyDisk size={16} aria-hidden="true"/>}<small role="status">{local.status}</small></span>
          <LocalSaveLocation key={local.projectId} projectId={local.projectId} saved={local.status} onFlush={local.flush}/>
          <button hidden={activePanel==="ai"} disabled={!local.ready || live.busy || printBusy} onClick={()=>void local.flush().catch(e=>setMessage(e.message))}><FloppyDisk size={16} aria-hidden="true"/>立即保存</button>
          <button hidden={activePanel==="ai"} disabled={!local.ready} onClick={()=>setModal("read")}><BookOpen size={17} aria-hidden="true"/>整本阅读</button>
        </div>
      </header>
      <div className={s.content}>
      <section className={s.heading}>
        <div>
          <span className={s.eyebrow}>本地绘本工作台</span>
          <h1>{panel.label}</h1>
          <p>{panel.description}</p>
        </div>
        <div className={s.bookMeta} hidden={activePanel==="ai"}><span>{{habits:"养成好习惯",memories:"真实经历",learning:"认知启蒙"}[draft.brief?.domain||"habits"]}</span><span>{draft.pageCount} 页正文</span></div>
      </section>
      {local.error && <div role="alert" className={s.note}>{local.error}<button onClick={()=>{if(!local.ready)local.reload();else void local.flush().catch(e=>setMessage(e.message));}}>{local.ready?"重试保存":"重新读取"}</button></div>}
      {!local.ready && <p role="status">正在读取本机数据。读取完成后即可编辑。</p>}
      <div className={s.workspace} data-panel={activePanel}>
        <div className={s.automaticWorkspace} hidden={activePanel!=="ai"}>
          <AutomaticBookCreator onStart={startAutomaticBook} job={currentJob?.automatic?(["complete","failed"].includes(currentJob.status)&&draft.localJobId===currentJob.id?{...currentJob,result:draft}:currentJob):null} busy={live.busy} disabled={!local.ready||preparing||printBusy||!!(activeJob&&!currentJob?.automatic)} configured={live.configured} error={live.error} onPause={async()=>{if(currentJob)await live.pause(currentJob.id);}} onSaveProduction={saveProduction} onResume={()=>{if(currentJob)void local.flush().then(()=>live.resume(currentJob.id,draft)).catch(e=>setMessage(e.message));}} onRead={()=>setModal("read")} onEdit={()=>goToPanel("canvas")} onPrint={()=>goToPanel("print")}/>
        </div>
        <section
          className={s.editor}
          hidden={activePanel!=="create"}
          aria-label="绘本配置"
        >
          <ManualBookSetup draft={draft} onChange={next=>update(()=>next)} onUpload={file=>void upload(file,{kind:"character",id:draft.characters[0].id})} onAutomatic={()=>goToPanel("ai")} disabled={!local.ready||live.busy||preparing||printBusy||uploading||activeJob}/>
          <button className={s.advancedToggle} onClick={()=>setManual(!manual)} aria-expanded={manual}>{manual?"收起高级设置":"更多设置 · 人物细节与分镜"}</button>
          {manual && <>
          {manual && <nav className={s.steps} aria-label="定制步骤">
            {steps.map((label, i) => (
              <button
                key={label}
                aria-current={step === i ? "step" : undefined}
                onClick={() => {
                  setStep(i);
                  if (i === 2 && page === 0) setPage(1);
                }}
              >
                <b>{i + 1}</b>
                <span>{label}</span>
              </button>
            ))}
          </nav>}
          <div className={s.panel} id="story-detail-panel">
            <div className={s.panelTitle}>
              <span>STEP 0{step + 1}</span>
              <h2>{steps[step]}</h2>
              <p>
                {
                  [
                    "先给这本书一个名字，故事就从这里开始。",
                    "让孩子、家人，或一只小猫成为故事主角。",
                    "把故事拆成一页一页，留下你想说的话。",
                    "让画面与文字，一起讲述你的故事。",
                    "检查创作设定，再开始这一趟旅程。",
                  ][step]
                }
              </p>
            </div>
            <fieldset
              className={s.controls}
              disabled={
                !local.ready || preparing || printBusy || live.busy ||
                !!(activeJob && (currentJob?.status !== "review" || step !== 2))
              }
            >
              {step === 0 && (
                <>
                  <DomainBriefFields draft={draft} onChange={brief=>patch({brief})} />
                  <Field label="绘本标题">
                    <input
                      value={draft.title}
                      placeholder="给你的绘本起个名字"
                      onChange={(e) => patch({ title: e.target.value })}
                    />
                  </Field>
                  <Field label="故事主题">
                    <div className={s.chips}>
                      {[
                        "勇气与成长",
                        "亲情与陪伴",
                        "友谊与分享",
                        "自然与探索",
                      ].map((t) => (
                        <button
                          key={t}
                          aria-pressed={draft.theme === t}
                          onClick={() => patch({ theme: t })}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <input
                      aria-label="自定义主题"
                      value={draft.theme}
                      onChange={(e) => patch({ theme: e.target.value })}
                      placeholder="也可以输入自己的主题"
                    />
                  </Field>
                  <div className={s.two}>
                    <Field label="适读年龄">
                      <select
                        value={draft.age}
                        onChange={(e) => patch({ age: e.target.value })}
                      >
                        {["2–3 岁", "4–5 岁", "6–8 岁"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="故事语言">
                      <select
                        value={draft.language}
                        onChange={(e) => patch({ language: e.target.value })}
                      >
                        {["中文", "英文", "中英双语"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label={`正文页数 · ${draft.pageCount} 页`}>
                    <PageCountField
                      value={draft.pageCount}
                      onChange={(count) => {
                        update((d) => setWorkbenchPageCount(d, count));
                        setPage((p) => Math.min(p, count));
                      }}
                    />
                    <div className={s.rangeLabels}>
                      <span>1–200 页自定义</span>
                      <span>封面另外计算</span>
                    </div>
                  </Field>
                  <p className={s.hint}>
                    封面单独计算。减少页数会暂时收起内容，恢复页数即可找回。
                  </p>
                  <Field label="封面副标题">
                    <input
                      value={draft.subtitle}
                      onChange={(e) => patch({ subtitle: e.target.value })}
                    />
                  </Field>
                  <Field label="作者 / 署名">
                    <input
                      value={draft.author}
                      placeholder="例如：小满和妈妈"
                      onChange={(e) => patch({ author: e.target.value })}
                    />
                  </Field>
                  {assetControl({ kind: "cover" }, draft.cover)}
                </>
              )}
              {step === 1 && (
                <>
                  <div className={s.note}>
                    图片先在本地预览；提交生成时私密上传。动漫化、拟人化和修图会在生成步骤中由
                    GPT 处理。
                  </div>
                  {draft.characters.map((c, index) => (
                    <article className={s.character} key={c.id}>
                      <header>
                        <strong>
                          角色 {String(index + 1).padStart(2, "0")}
                        </strong>
                        {index > 0 && (
                          <button
                            onClick={() =>
                              update((d) => ({
                                ...d,
                                characters: d.characters.filter(
                                  (v) => v.id !== c.id,
                                ),
                                pages: d.pages.map((p) => ({
                                  ...p,
                                  characters: p.characters.filter(
                                    (id) => id !== c.id,
                                  ),
                                })),
                              }))
                            }
                          >
                            删除角色
                          </button>
                        )}
                      </header>
                      <div className={s.two}>
                        <Field label="名字">
                          <input
                            value={c.name}
                            onChange={(e) =>
                              characterPatch(c.id, { name: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="身份">
                          <input
                            value={c.role}
                            onChange={(e) =>
                              characterPatch(c.id, { role: e.target.value })
                            }
                          />
                        </Field>
                      </div>
                      {(["appearance", "personality", "outfit"] as const).map(
                        (key, i) => (
                          <Field
                            key={key}
                            label={["外貌特征", "性格", "服装"][i]}
                          >
                            <input
                              value={c[key]}
                              onChange={(e) =>
                                characterPatch(c.id, { [key]: e.target.value })
                              }
                            />
                          </Field>
                        ),
                      )}
                      {assetControl({ kind: "character", id: c.id }, c.asset)}
                    </article>
                  ))}
                  <button
                    className={s.add}
                    onClick={() =>
                      patch({
                        characters: [
                          ...draft.characters,
                          {
                            id: crypto.randomUUID(),
                            name: "",
                            role: "配角",
                            appearance: "",
                            personality: "",
                            outfit: "",
                          },
                        ],
                      })
                    }
                  >
                    ＋ 添加家人、朋友或宠物
                  </button>
                </>
              )}
              {step === 2 && (
                <>
                  {live.job?.status === "review" && (
                    <div className={s.note}>
                      <strong>分镜已生成，请逐页检查</strong>
                      <p>
                        确认文案和画面描述后开始生成插图；角色、页数和画风已按本次任务锁定。
                      </p>
                      <button
                        className={s.primary}
                        disabled={live.busy || printBusy}
                        onClick={() => {
                          setStep(4);
                          void local.flush().then(() => live.confirm(draft)).catch(e => setMessage(e.message));
                        }}
                      >
                        确认分镜，生成插图
                      </button>
                    </div>
                  )}
                  <Field label="整体故事 / 故事梗概">
                    <textarea
                      rows={5}
                      value={draft.story}
                      placeholder="写下一次冒险，或者一件发生过的小事……"
                      onChange={(e) => patch({ story: e.target.value })}
                    />
                  </Field>
                  <p className={s.hint}>
                    这里保存故事设定，不会自动改写已编辑分镜。可载入示例后手动逐页编辑。
                  </p>
                  <button
                    disabled={activeJob}
                    onClick={() => setModal("reset")}
                  >
                    载入示例分镜
                  </button>
                  <div className={s.pageSelect}>
                    <strong>当前编辑</strong>
                    <select
                      aria-label="编辑内页"
                      value={activePage}
                      onChange={(e) => navigate(Number(e.target.value))}
                    >
                      {Array.from({ length: draft.pageCount }, (_, i) => (
                        <option value={i + 1} key={i}>
                          第 {i + 1} 页
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field label={`第 ${activePage} 页正文`}>
                    <textarea
                      rows={4}
                      value={current.text}
                      onChange={(e) => {
                        if (!page) setPage(1);
                        pagePatch(activePage - 1, { text: e.target.value });
                      }}
                    />
                  </Field>
                  <Field label="画面描述">
                    <textarea
                      rows={3}
                      value={chineseProductionScene(current)}
                      onChange={(e) =>
                        pagePatch(activePage - 1, { scene: e.target.value })
                      }
                    />
                  </Field>
                  <div className={s.field}>
                    <span>出场人物</span>
                    <div className={s.chips}>
                      {draft.characters.map((c) => (
                        <button
                          key={c.id}
                          aria-pressed={current.characters.includes(c.id)}
                          onClick={() =>
                            pagePatch(activePage - 1, {
                              characters: current.characters.includes(c.id)
                                ? current.characters.filter((id) => id !== c.id)
                                : [...current.characters, c.id],
                            })
                          }
                        >
                          {c.name || "未命名角色"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {draft.renderingMode === "integrated" && (
                    <Field label="本页图文构图与断行要求">
                      <textarea
                        value={current.artDirection || ""}
                        placeholder="例如：文字放在左上天空，分成三行；人物在右下，不加字幕条。留空时由分镜模型设计。"
                        onChange={(e) =>
                          pagePatch(activePage - 1, {
                            artDirection: e.target.value,
                          })
                        }
                      />
                    </Field>
                  )}
                  <p className={s.hint}>
                    {spread
                      ? `第 ${spread}–${spread + 1} 页共用左页插图，正文分别编辑。`
                      : "上传已有插图，立即查看图文排版。"}
                  </p>
                  {assetControl(
                    { kind: "page", index: imageIndex },
                    draft.pages[imageIndex].asset,
                  )}
                  <Field label="跨页画面">
                    <div className={s.chips}>
                      {Array.from(
                        { length: Math.floor((draft.pageCount - 1) / 2) },
                        (_, i) => (i + 1) * 2,
                      ).map((n) => (
                        <button
                          key={n}
                          aria-pressed={draft.spreads.includes(n)}
                          disabled={activeJob}
                          onClick={() => {
                            update((d) => toggleWorkbenchSpread(d, n));
                            navigate(n);
                          }}
                        >
                          {n}–{n + 1} 页{" "}
                          {draft.spreads.includes(n) ? "✓" : "＋"}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <p className={s.hint}>
                    第 1
                    页独立；跨页使用左页图片，原右页图片仍保留。取消跨页后恢复。
                  </p>
                </>
              )}
              {step === 3 && (
                <>
                  <Field label="成书方式">
                    <select
                      value={draft.renderingMode || "editable"}
                      disabled={
                        !!live.job &&
                        live.job.status !== "complete" &&
                        live.job.status !== "failed"
                      }
                      onChange={(e) =>
                        patch({
                          renderingMode: e.target.value as
                            | "integrated"
                            | "editable",
                        })
                      }
                    >
                      <option value="integrated">
                        精品图文一体 · 插画与文字共同设计
                      </option>
                      <option value="editable">
                        可编辑文字 · 插画与文字分别排版
                      </option>
                    </select>
                  </Field>
                  {draft.renderingMode === "integrated" && (
                    <div className={s.note}>
                      <strong>以《把夏天装进口袋》为设计方向</strong>
                      <p>
                        先确认正文与每页构图，再生成封面和内页。文字直接融入天空、路径等自然留白；不套文字框。已有图片仅作配置预览，新生成后才能看到图文一体效果。
                      </p>
                      <p>
                        成品需要逐页核对错字、漏字和人物一致性；正文、版式和断行的成品修改需要重新生成。
                      </p>
                    </div>
                  )}
                  <Field label="当前排版页面">
                    <select
                      value={spread || page}
                      onChange={(e) => navigate(Number(e.target.value))}
                    >
                      <option value={0}>封面（独立排版）</option>
                      {Array.from({ length: draft.pageCount }, (_, i) => i + 1)
                        .filter((n) => spreadStart(draft, n) !== n - 1)
                        .map((n) => (
                          <option key={n} value={n}>
                            {spreadStart(draft, n)
                              ? `第 ${n}–${n + 1} 页 · 跨页`
                              : `第 ${n} 页`}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {page > 0 && draft.renderingMode !== "integrated" && (
                    <>
                      <Field label="构图版式">
                        <div className={s.layoutCards}>
                          {(Object.keys(BOOK_LAYOUTS) as BookLayout[]).map(
                            (layout) => (
                              <button
                                key={layout}
                                aria-pressed={
                                  (draft.pages[imageIndex].layout ||
                                    "panorama") === layout
                                }
                                onClick={() => {
                                  pagePatch(imageIndex, { layout });
                                  setMessage(
                                    "版式已更新。当前使用已有插图排版；自然留白与人物构图需在新的生成操作中完成。",
                                  );
                                }}
                              >
                                <span
                                  className={`${s.layoutSketch} ${s[layout]}`}
                                  aria-hidden="true"
                                >
                                  <i />
                                  <b />
                                </span>
                                <strong>{BOOK_LAYOUTS[layout].name}</strong>
                                <small>
                                  {BOOK_LAYOUTS[layout].description}
                                </small>
                              </button>
                            ),
                          )}
                        </div>
                      </Field>
                      <Field label="文字融入方式">
                        <select
                          value={
                            draft.pages[imageIndex].textTreatment ||
                            (draft.typography.backing ? "soft" : "natural")
                          }
                          onChange={(e) =>
                            pagePatch(imageIndex, {
                              textTreatment: e.target.value as
                                | "natural"
                                | "soft",
                            })
                          }
                        >
                          <option value="natural">
                            自然留白 · 直接排入画面
                          </option>
                          <option value="soft">
                            柔和衬底 · 局部渐变保护文字
                          </option>
                        </select>
                      </Field>
                      <p className={s.hint}>
                        跨页共用版式，左右正文独立。文字区域避开中缝；过长正文会提示溢出。已有图片的版式预览包含裁切，不代表已重新构图。
                      </p>
                    </>
                  )}
                  {draft.renderingMode !== "integrated" && (
                    <>
                      <button
                        className={s.add}
                        onClick={() => {
                          update((d) => ({
                            ...d,
                            pages: d.pages.map((p, i) =>
                              i >= d.pageCount
                                ? p
                                : {
                                    ...p,
                                    layout:
                                      i === d.pageCount - 1
                                        ? "minimal"
                                        : p.text.length > 65
                                          ? "panorama"
                                          : (
                                              [
                                                "embrace",
                                                "panorama",
                                                "panorama",
                                                "sidebar",
                                              ] as BookLayout[]
                                            )[i % 4],
                                  },
                            ),
                          }));
                          setMessage(
                            "已按正文长度和页序编排四种版式，可逐页修改。已有插图尚未重新生成，请检查裁切与文字溢出。",
                          );
                        }}
                      >
                        自动编排整本版式
                      </button>
                      <p className={s.hint}>
                        按正文长度与页序搭配版式，结尾保留留白；点击会替换当前内页版式，不修改文案和图片。
                      </p>
                    </>
                  )}
                  <p className={s.hint}>人物写实或动漫，在上方“生成风格”中统一选择。</p>
                  <Field label="画幅">
                    <select
                      value={draft.format}
                      onChange={(e) =>
                        patch({
                          format: e.target
                            .value as CustomWorkbenchDraft["format"],
                        })
                      }
                    >
                      <option value="square">方形 · 1:1</option>
                      <option value="portrait">竖版 · 4:5</option>
                      <option value="landscape">横版 · 4:3</option>
                    </select>
                  </Field>
                  <p className={s.hint}>字体、文字颜色和底色请在单页画布中调整，可一键应用到整本。</p>
                  <button onClick={()=>goToPanel("canvas")}>前往单页画布调整文字</button>
                </>
              )}
            </fieldset>
            {step === 4 && (
              <>
                <div className={s.summary}>
                  <h3>{draft.title || "未命名绘本"}</h3>
                  <p>
                    {draft.theme} · {draft.age} · {draft.language}
                  </p>
                  <p>
                    {draft.pageCount} 页正文 ＋ 封面 · {visualStyleFor(draft)==="realistic"?"真人写实":styles[draft.style]}
                  </p>
                  <p>
                    人物：
                    {draft.characters.map((c) => c.name || "未命名").join("、")}
                  </p>
                  <p>
                    成书方式：
                    {draft.renderingMode === "integrated"
                      ? "精品图文一体（需逐页校对）"
                      : "可编辑文字"}
                  </p>
                  <p>
                    生图模型：
                    {live.job?.model || live.configured.model}
                  </p>
                </div>
                <div className={s.note}>
                  <strong>本机保存，确认后生成</strong>
                  <p>项目与照片保存在这台电脑，不需要登录，没有生成次数限制。模型调用仍由你的接口计费。</p>
                  <p>先审核故事分镜，再生成插图。未配置模型时，可以填写创作内容、手动编辑分镜、上传已有插画和导出预览。</p>
                  <p>模型状态：故事模型{live.configured.text ? "已配置" : "未配置"} · 生图模型{live.configured.image ? "已配置" : "未配置"}。调用时会发送相关文字与参考图片。</p>
                </div>
                {briefErrors(draft.brief).map(issue=><p className={s.hint} key={issue}>{issue}</p>)}
                {live.error && <p role="alert" className={s.hint}>{live.error}</p>}
                {!activeJob && <button className={s.primary} disabled={!local.ready || live.busy || printBusy || !live.configured.text || briefErrors(draft.brief).length>0}
                  onClick={()=>void local.flush().then(()=>live.start(draft)).catch(e=>setMessage(e.message))}>
                  {live.busy ? "正在提交…" : live.configured.text ? "生成故事分镜 →" : "等待配置故事模型"}
                </button>}
                {live.job && (
                  <div className={s.summary} aria-live="polite">
                    <strong>
                      {
                        (
                          {
                            preparing: "正在整理创作设定",
                            outline: "正在生成故事分镜",
                            review: "故事分镜待确认",
                            images: "正在生成绘本插图",
                            retryable: "生成中断，可继续恢复",
                            paused: "已暂停，可修改编导",
                            complete: "绘本生成完成",
                            failed: "任务已结束",
                          } as const
                        )[live.job.status]
                      }
                    </strong>
                    <p>
                      插图进度：{live.job.cursor} / {live.job.totalUnits}
                      （含人物参考图和封面）
                    </p>
                    {live.job.error && <p>{live.job.error}</p>}
                    {live.job.status === "review" && (
                      <button
                        className={s.primary}
                        disabled={live.busy || printBusy || !live.configured.image}
                        onClick={() => void local.flush().then(()=>live.confirm(draft)).catch(e=>setMessage(e.message))}
                      >
                        确认分镜，生成插图
                      </button>
                    )}
                    {activeJob && live.job.status !== "review" && (
                      <button
                        disabled={live.busy || printBusy}
                        onClick={() => void live.retry()}
                      >
                        {live.busy
                          ? "正在生成，请稍候…"
                          : "继续任务 / 重试当前步骤"}
                      </button>
                    )}
                    {activeJob && (
                      <button
                        disabled={live.busy || printBusy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "取消任务？已完成内容仍保存在本机。",
                            )
                          )
                            void live.cancel();
                        }}
                      >
                        取消任务
                      </button>
                    )}
                  </div>
                )}
                {!!live.jobs.length && (
                  <details className={s.demo}>
                    <summary>本项目生成任务 · 载入结果 / 继续处理</summary>
                    {live.jobs.map((j) => (
                      <button
                        key={j.id}
                        disabled={live.busy || printBusy}
                        onClick={() => void local.flush().then(()=>live.resume(j.id,draft)).catch(e=>setMessage(e.message))}
                      >
                        {new Date(j.updatedAt).toLocaleDateString("zh-CN")} ·{" "}
                        {
                          (
                            {
                              preparing: "自动准备",
                              outline: "分镜生成",
                              review: "待确认",
                              images: "插图生成",
                              retryable: "可重试",
                              paused: "已暂停",
                              complete: "已完成",
                              failed: "已结束",
                            } as const
                          )[j.status]
                        }{" "}
                        · 打开
                      </button>
                    ))}
                  </details>
                )}
              </>
            )}
            {manual && <div className={s.stepFooter}>
              <span>0{step + 1} / 05</span>
              <button
                className={s.primary}
                onClick={() => {
                  if (step < 4) {
                    setStep(step + 1);
                    if (step === 1 && page === 0) setPage(1);
                  } else setModal("read");
                }}
              >
                {step < 4 ? `下一步：${steps[step + 1]} →` : "查看整本绘本 →"}
              </button>
            </div>}
          </div>
          </>}
        </section>
        <aside className={s.bookSummary} hidden={activePanel!=="create"} aria-label="当前绘本概况">
          <div className={s.summaryCover}>{draft.cover?<img src={draft.cover.src} alt="当前绘本封面"/>:<BookOpen size={48} weight="light" aria-hidden="true"/>}</div>
          <div className={s.summaryBody}>
            <span className={s.eyebrow}>当前绘本</span>
            <h2>{draft.title||"你的下一本绘本"}</h2>
            <p>{draft.theme||"从孩子的一个小故事开始。"}</p>
            <dl><div><dt>适读年龄</dt><dd>{draft.age}</dd></div><div><dt>插图进度</dt><dd>{draft.pages.slice(0,draft.pageCount).filter(p=>p.asset).length} / {draft.pageCount} 页</dd></div><div><dt>创作场景</dt><dd>{draft.brief?.scenario||"AI 帮你推荐"}</dd></div></dl>
            <button className={s.primary} disabled={!local.ready||printBusy||preparing} onClick={()=>goToPanel("board")}>前往故事分镜<ArrowRight size={16} aria-hidden="true"/></button>
          </div>
          <ol className={s.workflowGuide}>
            <li><b>1</b><span>说说孩子的故事<small>选领域，写经历，AI 起草设定</small></span></li>
            <li><b>2</b><span>确认分镜与画面<small>逐页编辑，保留每次图片版本</small></span></li>
            <li><b>3</b><span>校对后印刷成册<small>A4 排版，自选装订与交付方式</small></span></li>
          </ol>
        </aside>
        <section
          className={s.preview}
          hidden={activePanel!=="board"&&activePanel!=="canvas"}
          aria-label="实时绘本预览"
        >
          {currentJob?.status==="review"&&<div className={s.reviewBanner}><div><strong>故事分镜已就绪</strong><p>逐页检查正文和画面描述，确认后开始绘制插图。</p></div><button className={s.primary} disabled={live.busy||printBusy} onClick={()=>{if(live.job?.id!==currentJob.id)void openOutlineReview();else void local.flush().then(()=>live.confirm(draft)).catch(e=>setMessage(e.message));}}>{live.job?.id===currentJob.id?"确认分镜，生成插图":"载入待确认分镜"}</button></div>}
          <fieldset className={s.studioWrapper} disabled={printBusy}>
          <BookStudioWorkspace key={local.projectId} draft={draft} page={page} mode={activePanel==="canvas"?"edit":"board"} onEditPage={()=>goToPanel("canvas")} onNavigate={navigate} onUpdate={update} onUpload={(file, target) => void upload(file, target === 0 ? {kind:"cover"} : {kind:"page",index:target-1})} disabled={!local.ready || live.busy || preparing || printBusy || !!(activeJob&&(currentJob?.status!=="review"||live.job?.id!==currentJob?.id))} />
          </fieldset>
        </section>
        <section className={s.printWorkspace} hidden={activePanel!=="print"} aria-label="印刷交付工作区">
          <div className={s.printMain}>
          <div className={s.printIntro}><Printer size={24} aria-hidden="true"/><div><h2>准备交给制作人员</h2><p>先完成逐页校对，再检查清晰度并导出文件。</p></div></div>
          {hasEmbeddedArtwork && (
            <label className={s.proofread}>
              <input
                type="checkbox"
                checked={proofread}
                disabled={printBusy}
                onChange={(e) => setProofread(e.target.checked)}
              />
              我已逐页核对错字、漏字、人物和中缝。此为人工校对确认。
            </label>
          )}
          <details className={s.previewExport}><summary>下载快速预览文件</summary><footer className={s.previewFooter}>
            <span>
              {draft.pageCount} 页正文 ＋ 封面
              <small>{draft.renderingMode === "integrated" ? "图文一体" : "可编辑图文"} · 预览 PDF 下载</small>
            </span>
            <button
              onClick={() => void exportPdf()}
              disabled={exporting || live.busy || printBusy || !!activeJob}
            >
              {exporting ? "正在排版…" : "下载预览 PDF"}
            </button>
          </footer></details>
          <PrintExportPanel key={local.projectId} draft={draft} projectId={local.projectId} disabled={!local.ready || live.busy || preparing || activeJob} proofread={proofread} onChange={print=>patch({print})} onFlush={local.flush} onProject={local.acceptServerProject} onBusy={setPrintBusy}/>
          </div>
          <aside className={s.deliveryGuide}><span className={s.eyebrow}>交付清单</span><h2>一本书，一份完整交付</h2><ul><li><CheckCircle size={17} aria-hidden="true"/>A4 整本 PDF 与封面、内页文件</li><li><CheckCircle size={17} aria-hidden="true"/>高清插图与可编辑文稿</li><li><CheckCircle size={17} aria-hidden="true"/>清晰度报告与装订制作说明</li></ul><p>装订方式在左侧选择，出血和内侧留白随设置处理。骑马订可导出双面拼版。</p><button onClick={()=>goToPanel("board")}>返回分镜检查<ArrowRight size={16} aria-hidden="true"/></button></aside>
        </section>
      </div>
      </div>
      </div>
      {message && (
        <div className={s.message} role="status">
          <span>{message}</span>
          <button aria-label="关闭提示" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
      {editing && (
        <Modal title="图片处理" onClose={() => setEditing(null)}>
          <div className={s.cropPreview}>
            <WorkbenchCanvas
              hideText
              draft={{
                ...draft,
                cover: editing.asset,
                pages: draft.pages.map((p, i) =>
                  editing.target.kind === "page" && i === editing.target.index
                    ? { ...p, asset: editing.asset }
                    : p,
                ),
                spreads: draft.spreads,
              }}
              page={
                editing.target.kind === "page" ? editing.target.index + 1 : 0
              }
            />
          </div>
          <p className={s.hint}>
            保留原图。裁剪立即预览；AI 处理在正式生成时执行。
          </p>
          <Field label="裁剪比例">
            <select
              value={editing.asset.ratio}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  asset: {
                    ...editing.asset,
                    ratio: e.target.value as WorkbenchAsset["ratio"],
                  },
                })
              }
            >
              <option value="page">跟随书页</option>
              <option value="square">方形</option>
              <option value="portrait">竖版 4:5</option>
              <option value="landscape">横版 4:3</option>
            </select>
          </Field>
          {(["zoom", "x", "y"] as const).map((key, i) => (
            <Field key={key} label={["缩放", "水平位置", "垂直位置"][i]}>
              <input
                type="range"
                min={key === "zoom" ? 1 : 0}
                max={key === "zoom" ? 2 : 100}
                step={key === "zoom" ? 0.01 : 1}
                value={editing.asset.crop[key]}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    asset: {
                      ...editing.asset,
                      crop: normalizeFamilyImageCrop({
                        ...editing.asset.crop,
                        [key]: Number(e.target.value),
                      }),
                    },
                  })
                }
              />
            </Field>
          ))}
          <button
            onClick={() =>
              setEditing({
                ...editing,
                asset: {
                  ...editing.asset,
                  ratio: "page",
                  crop: normalizeFamilyImageCrop(null),
                },
              })
            }
          >
            恢复原图裁剪
          </button>
          <p className={s.hint}>真人或动漫请在创作设定的“生成风格”中统一选择。</p>
          <label className={s.check}>
            <input
              type="checkbox"
              checked={editing.asset.anthropomorphic}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  asset: {
                    ...editing.asset,
                    anthropomorphic: e.target.checked,
                  },
                })
              }
            />
            拟人化 · 适合动物或物品角色
          </label>
          <div className={s.chips}>
            {["去背景", "去除杂物", "调整明暗", "修复瑕疵"].map((v) => (
              <button
                key={v}
                aria-pressed={editing.asset.retouch.includes(v)}
                onClick={() =>
                  setEditing({
                    ...editing,
                    asset: {
                      ...editing.asset,
                      retouch: editing.asset.retouch.includes(v)
                        ? editing.asset.retouch.filter((x) => x !== v)
                        : [...editing.asset.retouch, v],
                    },
                  })
                }
              >
                {v}
              </button>
            ))}
          </div>
          <Field label="补充修图要求">
            <textarea
              value={editing.asset.instructions}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  asset: { ...editing.asset, instructions: e.target.value },
                })
              }
            />
          </Field>
          <div className={s.modalActions}>
            <button onClick={() => setEditing(null)}>取消</button>
            <button
              className={s.primary}
              onClick={() => {
                saveAsset(editing.target, editing.asset);
                setEditing(null);
                setMessage("已保存裁剪与修图要求，将在生成时处理。");
              }}
            >
              确认使用
            </button>
          </div>
        </Modal>
      )}
      {modal === "read" && (
        <ImmersiveWorkbenchReader
          draft={draft}
          page={page}
          onNavigate={navigate}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "reset" && (
        <Modal title="从这里，开始一本书" onClose={() => setModal(null)}>
          <p className={s.startIntro}>
            先翻翻一本成品，或把自己的故事写进空白页。
          </p>
          <div className={s.resetOptions}>
            <button
              className={s.featuredSample}
              aria-label="载入精品样书：雨后的小小花园"
              onClick={() => {
                live.clearJob();
                void local.createProject(structuredClone(integratedSample) as CustomWorkbenchDraft).catch(e=>setMessage(e.message));
                setPage(0);
                setStep(3);
                setModal(null);
                setMessage(
                  "已载入真实 GPT 图文一体样书：封面＋4页正文，包含2–3页跨页。可翻阅、校对并导出 PDF。",
                );
              }}
            >
              <span className={s.sampleCover}>
                <img src="/sample-books/integrated-garden/cover.jpg" alt="" />
              </span>
              <span className={s.sampleDescription}>
                <span className={s.sampleBadge}>先体验一本完整绘本</span>
                <strong>雨后的小小花园</strong>
                <span className={s.sampleBlurb}>
                  跟着小禾走进雨后的花园，
                  <br />
                  看看文字如何长进画面里。
                </span>
                <span className={s.sampleMeta}>
                  4 页正文 · 连续跨页 · 可下载 PDF
                </span>
                <span className={s.sampleCta}>
                  载入精品样书 <span aria-hidden="true">↗</span>
                </span>
              </span>
            </button>
            <div className={s.startChoices}>
              <button
                className={s.startChoice}
                onClick={() => {
                  live.clearJob();
                  void local.createProject(createWorkbenchDraft(false)).catch(e=>setMessage(e.message));
                  setPage(0);
                  setStep(0);
                  setModal(null);
                }}
              >
                <span className={s.choiceIcon} aria-hidden="true">
                  ＋
                </span>
                <strong>
                  从空白开始 <span aria-hidden="true">↗</span>
                </strong>
                <span>写下名字，让故事从你开始。</span>
                <small>新建一份空白草稿</small>
              </button>
              <button
                className={s.startChoice}
                onClick={() => {
                  live.clearJob();
                  void local.createProject(createWorkbenchDraft()).catch(e=>setMessage(e.message));
                  setPage(0);
                  setModal(null);
                }}
              >
                <span className={s.choiceThumbnail} aria-hidden="true">
                  <img
                    src="/sample-books/gpt-image-2/brave-cloud/1.webp"
                    alt=""
                  />
                </span>
                <strong>
                  跟着示例试一试 <span aria-hidden="true">↗</span>
                </strong>
                <span>小云朵勇敢飞 · 8 页故事</span>
                <small>载入完整配置，逐项探索</small>
              </button>
            </div>
            <button
              className={s.storyboardOption}
              onClick={() => {
                const sample = createWorkbenchDraft();
                update((d) => ({
                  ...d,
                  story: sample.story,
                  pages: sample.pages.map((p) => ({
                    ...p,
                    characters: d.characters.length ? [d.characters[0].id] : [],
                  })),
                  spreads: [],
                }));
                setPage(1);
                setStep(2);
                setModal(null);
              }}
            >
              <span>
                <strong>只想试试故事分镜？</strong>
                <small>保留基础信息和人物，替换故事、正文与页面素材。</small>
              </span>
              <span className={s.storyboardCta}>
                载入分镜 <span aria-hidden="true">→</span>
              </span>
            </button>
          </div>
          <p className={s.replaceNote}>
            <span aria-hidden="true">ⓘ</span>{" "}
            选择新草稿或完整示例会替换当前草稿。想保留现在的内容，请先导出配置并保存原图。
          </p>
        </Modal>
      )}
    </main>
  );
}
