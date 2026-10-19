"use client";
import { useEffect,useState } from "react";
import { Image as ImageIcon } from "@phosphor-icons/react/dist/csr/Image";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useAiBookInput } from "@/hooks/useAiBookInput";
import type { LiveCustomJob } from "@/hooks/useCustomBook";
import type { ProductionEdit } from "@/lib/book-production";
import { createBookBrief,selectBookDomain } from "@/lib/book-domain";
import { makeAsset,setWorkbenchPageCount,type CustomWorkbenchDraft } from "@/lib/custom-workbench";
import { MIN_BOOK_PAGES,MAX_BOOK_PAGES } from "@/lib/book-config";
import ScenarioSelect from "./ScenarioSelect";
import PageCountField from "./PageCountField";
import VisualStylePicker from "./VisualStylePicker";
import BookProductionPlan from "./BookProductionPlan";
import s from "./AutomaticBookCreator.module.css";

export default function AutomaticBookCreator({onStart,job,busy,disabled,configured,error,onPause,onSaveProduction,onResume,onRead,onEdit,onPrint}:{
  onStart:(draft:CustomWorkbenchDraft)=>Promise<void>;job:LiveCustomJob|null;busy:boolean;disabled:boolean;
  configured:{text:boolean;image:boolean};error:string;onResume:()=>void;onRead:()=>void;onEdit:()=>void;onPrint:()=>void;
  onPause:()=>Promise<void>;onSaveProduction:(edit:ProductionEdit,expectedUpdatedAt:string)=>Promise<void>;
}) {
  const input=useAiBookInput(),{draft,setDraft}=input;
  const [uploading,setUploading]=useState(false),[starting,setStarting]=useState(false),[message,setMessage]=useState("");
  const [creatingNext,setCreatingNext]=useState(false);
  const [editing,setEditing]=useState(false),[pausing,setPausing]=useState(false);
  useEffect(()=>{setCreatingNext(false);setEditing(false);setPausing(false);},[job?.id]);
  const brief=draft.brief||createBookBrief(),running=!!job&&!["complete","failed"].includes(job.status);
  const locked=!input.ready||disabled||busy||running||starting||uploading;
  const patch=(value:Partial<CustomWorkbenchDraft>)=>setDraft({...draft,...value});
  async function upload(file:File) {
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>15*1024*1024){setMessage("请选择 15 MB 以内的 JPG、PNG 或 WebP 照片。");return;}
    setUploading(true);setMessage("");
    try{const form=new FormData();form.append("file",file);const response=await fetch("/api/local/assets",{method:"POST",body:form});const result=await response.json();if(!response.ok)throw new Error(result.error||"照片保存失败");patch({characters:draft.characters.map((c,i)=>i===0?{...c,asset:{...makeAsset(result.src,file.name,"character"),storagePath:result.storagePath,origin:"uploaded"}}:c)});}
    catch(e){setMessage(e instanceof Error?e.message:"照片保存失败，请重试。");}finally{setUploading(false);}
  }
  async function start(){setStarting(true);setMessage("");try{await input.flush();await onStart(draft);}catch(e){setMessage(e instanceof Error?e.message:"制作未启动，输入已保留。");}finally{setStarting(false);}}
  const phase=job&&["retryable","failed","paused"].includes(job.status)?job.resumeStatus:job?.status;
  const stage=phase==="preparing"?0:phase==="outline"?1:phase==="complete"?3:2;
  return <section className={s.creator} data-production={!!job&&!creatingNext} aria-label="AI 独立一键成书">
    {job&&!creatingNext?<div className={s.productionCard}><BookProductionPlan book={job} jobId={job.id} updatedAt={job.updatedAt} editable={!disabled&&!busy&&!job.leaseUntil&&["paused","review","retryable","complete","failed"].includes(job.status)} onSave={onSaveProduction} onEditingChange={setEditing}/></div>:<div className={s.formCard}>
      <header><span>填写一次，自动制作整本</span><h2>从照片和想法开始</h2><p>这里的参数与手动编辑独立。AI 自动完成设定、分镜、封面和全部内页，每次制作保存为一个新项目。</p></header>
      <form onSubmit={e=>{e.preventDefault();void start();}}>
        <fieldset disabled={locked}>
          <div className={s.row}>
            <label>孩子称呼<input aria-label="AI 孩子称呼" value={draft.characters[0].name} maxLength={40} placeholder="例如：小禾" required onChange={e=>patch({characters:draft.characters.map((c,i)=>i===0?{...c,name:e.target.value}:c)})}/></label>
            <label>适读年龄<select aria-label="AI 适读年龄" value={draft.age} onChange={e=>patch({age:e.target.value})}><option>2–3 岁</option><option>4–5 岁</option><option>6–8 岁</option></select></label>
            <label>绘本领域<select aria-label="AI 绘本领域" value={brief.domain} onChange={e=>patch({brief:selectBookDomain(brief,e.target.value as typeof brief.domain)})}><option value="habits">养成好习惯</option><option value="memories">孩子的真实经历</option><option value="learning">识图、识物与识字</option></select></label>
            <label>分场景<ScenarioSelect brief={brief} label="AI 分场景" onChange={value=>patch({brief:value})}/></label>
          </div>
          <label>{brief.domain==="learning"?"想让孩子认识什么？":"故事经历或制作要求"}<textarea aria-label="AI 故事与要求" required value={draft.story} maxLength={brief.domain==="memories"?10000:15000} placeholder={brief.domain==="learning"?"例如：带小禾认识苹果、香蕉、胡萝卜和西红柿，用果蔬乐园串起来，每页有一个找一找的小问题。":"例如：小禾搭沙堡时，干沙总是散开。她换成湿沙，慢慢搭成了小城堡。想让她学会换个办法再试。"} onChange={e=>patch({story:e.target.value,brief:{...brief,factsConfirmed:false}})}/></label>
          <div className={s.photoRow}>{draft.characters[0].asset?<img src={draft.characters[0].asset.src} alt="AI 制作参考照片"/>:<span className={s.photoPlaceholder}><ImageIcon size={24} aria-hidden="true"/></span>}<label className={s.upload}>人物照片<span>{uploading?"正在保存照片…":draft.characters[0].asset?"更换照片":"上传照片"}</span><input aria-label="AI 人物照片" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value="";}}/></label><small>用于保持人物一致<br/>照片保存在本机</small></div>
          <VisualStylePicker draft={draft} onChange={patch} newBook/>
          <div className={s.row}><label>正文页数（封面另算）<PageCountField label="AI 正文页数" value={draft.pageCount} onChange={count=>setDraft(setWorkbenchPageCount(draft,count))}/><small>可选 {MIN_BOOK_PAGES}–{MAX_BOOK_PAGES} 页，长绘本分批制作。</small></label><label>书页形状<select aria-label="AI 书页形状" value={draft.format} onChange={e=>patch({format:e.target.value as typeof draft.format})}><option value="square">方形绘本</option><option value="portrait">竖版绘本</option><option value="landscape">横版绘本</option></select></label></div>
          {brief.domain==="memories"&&<label className={s.confirm}><input type="checkbox" checked={brief.factsConfirmed} onChange={e=>patch({brief:{...brief,factsConfirmed:e.target.checked}})}/>按我填写的真实经过改编，不补写未提供的事实、原话和家人关系。</label>}
          <button className={s.start} type="submit" disabled={!draft.characters[0].name.trim()||!draft.story.trim()||!configured.text||!configured.image||(brief.domain==="memories"&&!brief.factsConfirmed)}><Sparkle size={18} aria-hidden="true"/>{starting?"正在创建本机任务…":running?"AI 正在自动制作…":job?.status==="complete"?"用这些参数再制作一本":"一键生成整本绘本"}</button>
        </fieldset>
      </form>
      <p className={s.saved} role="status">{input.status}</p>
      <small className={s.note}>制作时，相关文字和照片会发送到已配置的模型服务。完成后可进入画布改字、移动文字和切换图片版本。</small>
      {(!configured.text||!configured.image)&&<p className={s.alert}>故事或生图模型尚未配置，参数可以先保存。</p>}
      {(input.error||message)&&<p className={s.alert} role="alert">{input.error||message}</p>}
    </div>}
    <aside className={s.progressCard} aria-label="整本自动制作进度">
      <span>自动制作流程</span><h2>{job?.status==="complete"?"整本绘本已完成":job?.status==="failed"?"已保存的制作内容":job?.status==="paused"?"已暂停，等待修改":"交给 AI 接着完成"}</h2>
      <ol>{["整理书名、人物与创作设定","编写故事与逐页分镜","生成封面与全部内页","保存整本，进入成品编辑"].map((label,i)=><li key={label} data-state={job?(i<stage||job.status==="complete"?"done":i===stage&&!["failed","paused"].includes(job.status)?"active":"waiting"):"waiting"}><b>{job&&(i<stage||job.status==="complete")?<CheckCircle size={19} aria-hidden="true"/>:i+1}</b><span>{label}</span></li>)}</ol>
      {job?<div className={s.result} aria-live="polite">
        <strong>{job.result.title||`${job.result.characters[0]?.name||"孩子"}的绘本`}</strong>
        <p>{job.pauseRequested?"正在等待当前步骤保存，随后暂停，可修改故事与编导。":job.status==="paused"?"已暂停。可以修改编导，保存后继续制作；刷新也会保留暂停状态。":job.status==="complete"?`${job.result.pageCount} 页正文和封面已保存到本机。`:job.status==="preparing"?"正在整理故事与人物设定…":job.status==="outline"?`已完成 ${job.outlineCursor||0} / ${job.result.pageCount} 页分镜，完成后自动开始配图。`:job.status==="images"?`已完成 ${job.cursor} / ${job.totalUnits} 张人物与书页图片。`:job.status==="failed"?"任务已结束，已完成内容仍保留。":"这一步中断了，已完成内容保留，可从当前步骤继续。"}</p>
        {job.status==="images"&&<progress aria-label="自动生图进度" value={job.cursor} max={Math.max(job.totalUnits,1)}/>}
        {job.result.cover&&<img src={job.result.cover.src} alt="AI 制作绘本封面"/>}
        {(job.error||error)&&<p className={s.alert} role="alert">{job.error||error}</p>}
        {["preparing","outline","images"].includes(job.status)&&<button disabled={pausing||job.pauseRequested||disabled} onClick={async()=>{setPausing(true);setMessage("");try{await onPause();}catch(e){setMessage(e instanceof Error?e.message:"暂停失败，请重试。");}finally{setPausing(false);}}}>{job.pauseRequested?"正在暂停…":"暂停并修改编导"}</button>}
        {job.status==="complete"?<div className={s.actions}><button disabled={editing} onClick={onRead}>整本阅读</button><button disabled={editing} onClick={onEdit}>进入画布编辑</button><button disabled={editing} onClick={onPrint}>导出成品</button></div>:job.status!=="failed"&&!busy&&(["retryable","paused"].includes(job.status)||!!error)&&<button disabled={editing} onClick={onResume}>{job.status==="paused"?"继续自动制作":"从中断处继续制作"}</button>}
        {message&&<p className={s.alert} role="alert">{message}</p>}
        {["complete","failed"].includes(job.status)&&!creatingNext&&<button disabled={editing} className={s.newBook} onClick={()=>setCreatingNext(true)}>制作下一本绘本</button>}
      </div>:<p className={s.empty}>开始后会先展示完整故事线、人物和美术方案，再逐页展开分镜与画面编导，自动继续配图。</p>}
    </aside>
  </section>;
}
