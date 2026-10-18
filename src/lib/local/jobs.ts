import "server-only";
import crypto from "node:crypto";
import { OUTLINE_BATCH_PAGES } from "../book-config";
import { database, getProject, LocalError, readAsset, requireId, saveAsset, validateDraftAssets } from "./store";
import { briefErrors, missingLearningTargets } from "../book-domain";
import { customDraftSchema, imageUnits, type ServerAsset } from "../custom-book/schema";
import { customImageConfig, generateCustomOutline, generateCustomOutlinePlan, requestCustomImage, imagePrompt, imageSize, cropReference, needsProcessing, type Reference } from "../custom-book/provider";
import { getStoryTextEndpoint } from "../custom-book/text-endpoint";
import { artworkText, artworkMatchesText } from "../custom-book/integrated";
import type { CustomWorkbenchDraft, WorkbenchAsset } from "../custom-workbench";

export type LocalJob = {
  id:string;projectId:string;inputHash:string;status:"outline"|"review"|"images"|"retryable"|"complete"|"failed";
  resumeStatus:"outline"|"images";cursor:number;totalUnits:number;attempts:number;
  outlineCursor?:number;
  outlinePlan?:string[];
  leaseUntil:string|null;error:string|null;model:string;result:CustomWorkbenchDraft;updatedAt:string;
};
export function modelStatus() {
  let image=false,model="未配置";try{const c=customImageConfig();image=true;model=c.model;}catch{}
  return {text:!!getStoryTextEndpoint(),image,model};
}
export function listJobs(projectId:string): LocalJob[] {
  getProject(projectId);
  return database().prepare("SELECT data FROM jobs WHERE project_id=? ORDER BY rowid DESC").all(projectId).map(row=>JSON.parse(row.data as string) as LocalJob);
}
export function getJob(id:string) {
  const row=database().prepare("SELECT data FROM jobs WHERE id=?").get(requireId(id));
  if(!row)throw new LocalError("本地任务不存在。",404);
  return JSON.parse(row.data as string) as LocalJob;
}
function writeJob(job:LocalJob,lease?:string) {
  for(const a of [job.result.cover,...job.result.characters.map(c=>c.asset),...job.result.pages.map(p=>p.asset)]) if(a?.storagePath) a.src=`/api/local/assets/${a.storagePath}`;
  job.updatedAt=new Date().toISOString();job.leaseUntil=null;
  const sql=lease?"UPDATE jobs SET data=?,lease=NULL,lease_until=NULL WHERE id=? AND lease=?":"UPDATE jobs SET data=?,lease=NULL,lease_until=NULL WHERE id=? AND lease IS NULL";
  const result=database().prepare(sql).run(...(lease?[JSON.stringify(job),job.id,lease]:[JSON.stringify(job),job.id]));
  if(!result.changes)throw new LocalError("任务正在另一窗口处理，请稍后重新载入。",409);
  return job;
}
export function createJob(id:string,projectId:string,draft:CustomWorkbenchDraft) {
  requireId(id);getProject(projectId);validateDraftAssets(draft);
  const issues=briefErrors(draft.brief);if(issues.length)throw new LocalError(issues.join(" "));
  // Enforce full generation validation, while removing disk/UI-only sample assets.
  const input=structuredClone(draft);delete input.studio;
  const strip=(asset?:WorkbenchAsset,retainGenerated=false)=>asset?.origin==="sample"||(asset?.origin==="generated"&&!retainGenerated)?undefined:asset;
  input.cover=strip(input.cover);input.characters.forEach(c=>c.asset=strip(c.asset,true));input.pages.forEach(p=>p.asset=strip(p.asset));
  customDraftSchema.parse(input);
  if(!modelStatus().text)throw new LocalError("故事模型尚未配置。创作内容已保存在本机，可先手动编辑分镜。",503);
  const inputHash=crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const existing=database().prepare("SELECT data,project_id FROM jobs WHERE id=?").get(id);
  if(existing){if(existing.project_id!==projectId || (JSON.parse(existing.data as string) as LocalJob).inputHash!==inputHash)throw new LocalError("任务标识冲突。",409);return JSON.parse(existing.data as string) as LocalJob;}
  const running=listJobs(projectId).find(j=>!["failed","complete"].includes(j.status));
  if(running)throw new LocalError("请先恢复或取消本项目未结束的生成任务。",409);
  const job:LocalJob={id,projectId,inputHash,status:"outline",resumeStatus:"outline",cursor:0,totalUnits:imageUnits(customDraftSchema.parse(input)).length,attempts:0,leaseUntil:null,error:null,model:modelStatus().model,result:input,updatedAt:new Date().toISOString()};
  database().prepare("INSERT INTO jobs(id,project_id,data) VALUES(?,?,?)").run(id,projectId,JSON.stringify(job));return job;
}
export async function advanceJob(id:string,retry=false) {
  const original=getJob(id);
  if(["review","complete","failed"].includes(original.status))return original;
  if(original.status==="retryable"&&!retry)return original;
  const lease=crypto.randomUUID();const now=Date.now();
  const claimed=database().prepare("UPDATE jobs SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR (lease_until<? AND ?=1))")
    .run(lease,now+300000,id,now,retry?1:0);
  if(!claimed.changes)throw new LocalError("任务正在生成；若程序曾中断，请在五分钟后主动重试。",409);
  const job=getJob(id);job.status=job.resumeStatus;job.attempts++;
  try{
    if(job.status==="outline") {
      const parsed=customDraftSchema.parse(job.result);
      if(parsed.pageCount>OUTLINE_BATCH_PAGES&&!job.outlinePlan) {
        job.outlinePlan=await generateCustomOutlinePlan(parsed);
        job.attempts=0;job.error=null;return writeJob(job,lease);
      }
      const start=job.outlineCursor||0;
      const end=Math.min(parsed.pageCount,start+OUTLINE_BATCH_PAGES);
      const result=await generateCustomOutline(parsed,{start,count:end-start,plan:job.outlinePlan});
      const localAsset=(a?:ServerAsset):WorkbenchAsset|undefined=>a?{...a,src:`/api/local/assets/${a.storagePath}`}:undefined;
      job.result={...result,cover:localAsset(result.cover),characters:result.characters.map(c=>({...c,asset:localAsset(c.asset)})),pages:result.pages.map(p=>({...p,asset:localAsset(p.asset)}))};job.outlineCursor=end;job.status=end>=parsed.pageCount?"review":"outline";
    }else{
      const config=customImageConfig();
      if(job.model!=="未配置"&&job.model!==config.model)throw new Error("生图模型已变化，请新建任务以保持整本一致。");
      job.model=config.model;
      const parsed=customDraftSchema.parse(job.result);const units=imageUnits(parsed),unit=units[job.cursor];
      if(!unit){job.status="complete";return writeJob(job,lease);}
      const asset=unit.kind==="character"?job.result.characters[unit.index].asset:unit.kind==="cover"?job.result.cover:job.result.pages[unit.index].asset;
      let output=asset;
      if(!asset||needsProcessing(asset)||(job.result.renderingMode==="integrated"&&unit.kind!=="character")){
        const refs:Reference[]=[];
        if(asset?.storagePath)refs.push({bytes:await cropReference(readAsset(asset.storagePath),asset,1),label:"Source image to edit"});
        if(unit.kind!=="character"){
          const cast=unit.kind==="cover"?job.result.characters.map(c=>c.id):job.result.pages.slice(unit.index,unit.index+(unit.spread?2:1)).flatMap(p=>p.characters);
          for(const c of job.result.characters.filter(c=>cast.includes(c.id)))if(c.asset?.storagePath)refs.push({bytes:readAsset(c.asset.storagePath),label:`Character ${c.id}: ${c.name}, ${c.appearance}, ${c.outfit}. Keep this identity.`});
          if(job.result.cover?.storagePath)refs.push({bytes:readAsset(job.result.cover.storagePath),label:"Approved cover style reference; do not repeat its title"});
        }
        const bytes=await requestCustomImage(imagePrompt(parsed,unit),refs,imageSize(parsed,unit),job.model,`${job.id}:${job.cursor}`);
        const stored=saveAsset(bytes,`generated-${job.id}-${job.cursor}`);
        output={id:stored.id,storagePath:stored.storagePath,src:stored.src,name:"本机生成插图",purpose:unit.kind,origin:"generated",crop:{x:50,y:50,zoom:1},ratio:"page",appearance:"original",anthropomorphic:false,retouch:[],instructions:""};
        // Persist output and cursor in one SQLite write. Never erase completed units on retry.
        if(job.result.renderingMode==="integrated"&&unit.kind!=="character")output.embeddedText=artworkText(job.result,unit.kind==="cover"?0:unit.index+1);
      }
      if(unit.kind==="character")job.result.characters[unit.index].asset=output;
      else if(unit.kind==="cover")job.result.cover=output;
      else job.result.pages[unit.index].asset=output;
      job.cursor++;if(job.cursor>=units.length)job.status="complete";
    }
    job.attempts=0;job.error=null;
  }catch(e){job.status="retryable";job.error=e instanceof Error?e.message:"当前步骤失败，已完成内容保留。";}
  return writeJob(job,lease);
}
export function updateJob(id:string,action:{action:string;pages?:unknown;draft?:unknown}) {
  const job=getJob(id);
  const lock=database().prepare("SELECT lease,lease_until FROM jobs WHERE id=?").get(id);
  if(lock?.lease&&Number(lock.lease_until)>Date.now())throw new LocalError("任务正在生成，请等待当前步骤结束。",409);
  if(lock?.lease)throw new LocalError("任务上次中断，请先恢复当前步骤再修改状态。",409);
  if(action.action==="cancel") {job.status="failed";job.error="任务已取消，已完成内容保留。";return writeJob(job);}
  if(action.action==="confirm") {
    if(job.status!=="review")throw new LocalError("请先生成或恢复待确认的分镜。",409);
    const pages=action.pages as CustomWorkbenchDraft["pages"];
    const candidate={...job.result,pages:job.result.pages.map((p,i)=>i<job.result.pageCount?{...p,...pages[i]}:p)};
    if(pages.length!==job.result.pageCount)throw new LocalError("分镜页数与任务不一致。");
    const parsed=customDraftSchema.parse(candidate);
    if(parsed.pages.slice(0,parsed.pageCount).some(p=>!p.text.trim()||!p.scene.trim()))throw new LocalError("请填写每页正文与画面描述。");
    const missing=missingLearningTargets(candidate.brief,pages.map(p=>p.text));
    if(missing.length)throw new LocalError(`正文尚未覆盖认知目标：${missing.join("、")}`);
    if(!modelStatus().image)throw new LocalError("生图模型尚未配置。分镜已保存在本机，配置接口后可继续。",503);
    job.result=candidate;job.status="images";job.resumeStatus="images";job.model=customImageConfig().model;job.attempts=0;return writeJob(job);
  }
  throw new LocalError("不支持的本地任务操作。");
}
