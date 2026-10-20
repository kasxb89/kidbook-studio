import "server-only";
import crypto from "node:crypto";
import { OUTLINE_BATCH_PAGES } from "../book-config";
import { database, createProject, getProject, saveProject, scheduleBookFolder, LocalError, readAsset, requireId, saveAsset, validateDraftAssets } from "./store";
import { briefErrors, missingLearningTargets } from "../book-domain";
import { customDraftSchema, imageUnits, type ServerAsset } from "../custom-book/schema";
import { customImageConfig, generateCustomOutline, generateCustomOutlinePlan, requestCustomImage, imagePrompt, imageSize, cropReference, needsProcessing, type Reference } from "../custom-book/provider";
import { getStoryTextEndpoint } from "../custom-book/text-endpoint";
import { artworkText, artworkMatchesText } from "../custom-book/integrated";
import type { CustomWorkbenchDraft, WorkbenchAsset } from "../custom-workbench";
import { visualStyleFor } from "../custom-book/visual-style";
import { prepareBookInput } from "../custom-book/prepare";
import { automaticBookDraft } from "../automatic-book";
import { applyProductionEdits,productionEditSchema,type ProductionEdit } from "../book-production";
import { localDraftSchema } from "./schema";
import { pageTypography } from "../custom-book/typography";

export type LocalJob = {
  id:string;projectId:string;inputHash:string;status:"preparing"|"outline"|"review"|"images"|"paused"|"retryable"|"complete"|"failed";
  automatic?:boolean;
  source?:CustomWorkbenchDraft;
  pauseRequested?:boolean;
  resumeStatus:"preparing"|"outline"|"images";cursor:number;totalUnits:number;attempts:number;
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
  return database().prepare("SELECT data,lease_until FROM jobs WHERE project_id=? ORDER BY rowid DESC").all(projectId).map(row=>({...JSON.parse(row.data as string),leaseUntil:row.lease_until?new Date(Number(row.lease_until)).toISOString():null}) as LocalJob);
}
export function getJob(id:string) {
  const row=database().prepare("SELECT data,lease_until FROM jobs WHERE id=?").get(requireId(id));
  if(!row)throw new LocalError("本地任务不存在。",404);
  return {...JSON.parse(row.data as string),leaseUntil:row.lease_until?new Date(Number(row.lease_until)).toISOString():null} as LocalJob;
}
export function createAutomaticJob(id:string,draft:CustomWorkbenchDraft):LocalJob {
  requireId(id);
  const input=automaticBookDraft(draft),inputHash=crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const existing=database().prepare("SELECT data FROM jobs WHERE id=?").get(id);
  if(existing){const job=JSON.parse(existing.data as string) as LocalJob;if(!job.automatic||job.inputHash!==inputHash)throw new LocalError("任务标识冲突。",409);return getJob(id);}
  validateDraftAssets(input);
  if(!input.characters[0].name.trim()||!input.story.trim())throw new LocalError("请填写孩子称呼和故事经历 / 认知目标。");
  if(input.brief?.domain==="memories"&&!input.brief.factsConfirmed)throw new LocalError("请先确认按填写的真实经过改编。");
  const configured=modelStatus();if(!configured.text||!configured.image)throw new LocalError("一键成书需要配置故事和生图模型，参数和照片已保留。",503);
  const db=database();db.exec("BEGIN IMMEDIATE");
  try {
    const project=createProject(input);
    const job:LocalJob={id,projectId:project.id,inputHash,automatic:true,source:structuredClone(input),status:"preparing",resumeStatus:"preparing",cursor:0,totalUnits:input.pageCount+2,attempts:0,leaseUntil:null,error:null,model:configured.model,result:input,updatedAt:new Date().toISOString()};
    db.prepare("INSERT INTO jobs(id,project_id,data) VALUES(?,?,?)").run(id,project.id,JSON.stringify(job));db.exec("COMMIT");return job;
  }catch(e){db.exec("ROLLBACK");throw e;}
}
function validateOutline(draft:CustomWorkbenchDraft) {
  const parsed=customDraftSchema.parse(draft),pages=parsed.pages.slice(0,parsed.pageCount);
  if(pages.some(p=>!p.text.trim()||!p.scene.trim()))throw new LocalError("请填写每页正文与画面描述。");
  if(parsed.direction&&pages.some(p=>!p.directing))throw new LocalError("逐页编导说明不完整，暂未开始配图。");
  const missing=missingLearningTargets(draft.brief,pages.map(p=>p.text));
  if(missing.length)throw new LocalError(`正文尚未覆盖认知目标：${missing.join("、")}`);
}
function writeJob(job:LocalJob,lease?:string) {
  if(lease) {
    const latest=getJob(job.id);
    if(latest.pauseRequested&&!["complete","failed","review"].includes(job.status))job.status="paused";
    if(latest.updatedAt>job.updatedAt)job.updatedAt=latest.updatedAt;
    job.pauseRequested=false;
  }
  for(const a of [job.result.cover,...job.result.characters.map(c=>c.asset),...job.result.pages.map(p=>p.asset)]) if(a?.storagePath) a.src=`/api/local/assets/${a.storagePath}`;
  job.updatedAt=new Date(Math.max(Date.now(),Date.parse(job.updatedAt)+1)).toISOString();job.leaseUntil=null;
  const sql=lease?"UPDATE jobs SET data=?,lease=NULL,lease_until=NULL WHERE id=? AND lease=?":"UPDATE jobs SET data=?,lease=NULL,lease_until=NULL WHERE id=? AND lease IS NULL";
  const result=database().prepare(sql).run(...(lease?[JSON.stringify(job),job.id,lease]:[JSON.stringify(job),job.id]));
  if(!result.changes)throw new LocalError("任务正在另一窗口处理，请稍后重新载入。",409);
  scheduleBookFolder(job.projectId);
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
  if(original.status==="paused"&&!retry)return original;
  if(original.status==="retryable"&&!retry)return original;
  const lease=crypto.randomUUID();const now=Date.now();
  const claimed=database().prepare("UPDATE jobs SET lease=?,lease_until=? WHERE id=? AND (lease IS NULL OR (lease_until<? AND ?=1))")
    .run(lease,now+300000,id,now,retry?1:0);
  if(!claimed.changes)throw new LocalError("任务正在生成；若程序曾中断，请在五分钟后主动重试。",409);
  const job=getJob(id);job.status=job.resumeStatus;job.attempts++;
  try{
    if(job.status==="preparing") {
      const confirmed=job.result.brief?.factsConfirmed;
      const prepared=await prepareBookInput(job.result);
      if(prepared.brief?.domain==="memories")prepared.brief.factsConfirmed=!!confirmed;
      const issues=briefErrors(prepared.brief);if(issues.length)throw new LocalError(issues.join(" "));
      customDraftSchema.parse(prepared);job.result=prepared;
      job.totalUnits=imageUnits(customDraftSchema.parse(prepared)).length;
      job.status="outline";job.resumeStatus="outline";
    }else if(job.status==="outline") {
      const parsed=customDraftSchema.parse(job.result);
      if((job.automatic||parsed.pageCount>OUTLINE_BATCH_PAGES)&&!job.outlinePlan) {
        job.outlinePlan=await generateCustomOutlinePlan(parsed);
        job.attempts=0;job.error=null;return writeJob(job,lease);
      }
      const start=job.outlineCursor||0;
      const end=Math.min(parsed.pageCount,start+OUTLINE_BATCH_PAGES);
      const result=await generateCustomOutline(parsed,{start,count:end-start,plan:job.outlinePlan});
      if(job.automatic&&end>=parsed.pageCount)validateOutline(result as CustomWorkbenchDraft);
      const localAsset=(a?:ServerAsset):WorkbenchAsset|undefined=>a?{...a,src:`/api/local/assets/${a.storagePath}`}:undefined;
      job.result={...result,studio:job.result.studio,cover:localAsset(result.cover),characters:result.characters.map(c=>({...c,asset:localAsset(c.asset)})),pages:result.pages.map(p=>({...p,asset:localAsset(p.asset)}))};job.outlineCursor=end;
      if(end>=parsed.pageCount&&job.automatic){job.status="images";job.resumeStatus="images";job.totalUnits=imageUnits(customDraftSchema.parse(job.result)).length;}
      else job.status=end>=parsed.pageCount?"review":"outline";
    }else{
      const config=customImageConfig();
      if(job.model!=="未配置"&&job.model!==config.model)throw new Error("生图模型已变化，请新建任务以保持整本一致。");
      job.model=config.model;
      const parsed=customDraftSchema.parse(job.result);const units=imageUnits(parsed),unit=units[job.cursor];
      if(!unit){job.status="complete";return writeJob(job,lease);}
      const asset=unit.kind==="character"?job.result.characters[unit.index].asset:unit.kind==="cover"?job.result.cover:job.result.pages[unit.index].asset;
      let output=asset;
      if(!asset||needsProcessing(asset,visualStyleFor(job.result))||(job.result.renderingMode==="integrated"&&unit.kind!=="character")){
        const refs:Reference[]=[];
        if(asset?.storagePath)refs.push({bytes:await cropReference(readAsset(asset.storagePath),asset,1),label:"Source image to edit"});
        if(unit.kind!=="character"){
          const cast=unit.kind==="cover"?job.result.characters.map(c=>c.id):job.result.pages.slice(unit.index,unit.index+(unit.spread?2:1)).flatMap(p=>p.characters);
          for(const c of job.result.characters.filter(c=>cast.includes(c.id)))if(c.asset?.storagePath)refs.push({bytes:readAsset(c.asset.storagePath),label:`Character ${c.id}: ${c.name}, ${c.appearance}, ${c.outfit}. Keep this identity.`});
          if(job.result.cover?.storagePath)refs.push({bytes:readAsset(job.result.cover.storagePath),label:"Approved cover style reference; do not repeat its title"});
        }
        const designPage=unit.kind==="cover"?0:unit.kind==="page"?unit.index+1:undefined;
        const promptDraft=designPage===undefined?parsed:{...parsed,typography:{...parsed.typography,...job.result.studio?.pages?.[designPage]?.typography}};
        const bytes=await requestCustomImage(imagePrompt(promptDraft,unit,page=>pageTypography(job.result,page)),refs,imageSize(parsed,unit),job.model,`${job.id}:${job.cursor}`);
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
export function saveJobProduction(id:string,edit:ProductionEdit,expectedUpdatedAt:string,projectRevision:number) {
  const db=database();db.exec("BEGIN IMMEDIATE");
  try {
    const job=getJob(id),lock=db.prepare("SELECT lease FROM jobs WHERE id=?").get(id);
    if(lock?.lease||!["paused","review","retryable","complete","failed"].includes(job.status))throw new LocalError("请先暂停制作，等待当前图片保存后再修改。",409);
    if(job.updatedAt!==expectedUpdatedAt)throw new LocalError("编导已在另一窗口更新，请保留修改并重新载入。",409);
    const project=getProject(job.projectId);
    if(project.revision!==projectRevision)throw new LocalError("项目已在另一个窗口更新，请保留修改并重新载入。",409);
    const value=productionEditSchema.parse(edit);
    // Merge text edits onto the latest project, retaining canvas layout, image
    // versions and original assets. Job and project commit in one transaction.
    const result=applyProductionEdits(project.draft,value);
    applyProductionEdits(job.result,value);
    localDraftSchema.parse(result);
    if(job.resumeStatus==="images"&&!["complete","failed"].includes(job.status))validateOutline(result);
    if(job.status==="complete")result.studio={...result.studio,completedAutomaticJob:job.id};
    job.result=result;
    if(job.outlinePlan)job.outlinePlan=value.pages.map((p,i)=>p.beat||job.outlinePlan![i]);
    const saved=saveProject(job.projectId,result,projectRevision);
    const next=writeJob(job);db.exec("COMMIT");return {job:next,project:saved};
  }catch(e){db.exec("ROLLBACK");throw e;}
}
export function updateJob(id:string,action:{action:string;pages?:unknown;draft?:unknown}) {
  const job=getJob(id);
  const lock=database().prepare("SELECT lease,lease_until FROM jobs WHERE id=?").get(id);
  if(action.action==="pause") {
    if(["complete","failed","review","paused"].includes(job.status))return job;
    if(lock?.lease){
      job.pauseRequested=true;job.updatedAt=new Date(Math.max(Date.now(),Date.parse(job.updatedAt)+1)).toISOString();
      database().prepare("UPDATE jobs SET data=? WHERE id=?").run(JSON.stringify(job),job.id);
      return getJob(id);
    }
    job.status="paused";job.pauseRequested=false;return writeJob(job);
  }
  if(lock?.lease&&Number(lock.lease_until)>Date.now())throw new LocalError("任务正在生成，请等待当前步骤结束。",409);
  if(lock?.lease)throw new LocalError("任务上次中断，请先恢复当前步骤再修改状态。",409);
  if(action.action==="cancel") {job.status="failed";job.error="任务已取消，已完成内容保留。";return writeJob(job);}
  if(action.action==="confirm") {
    if(job.status!=="review")throw new LocalError("请先生成或恢复待确认的分镜。",409);
    const pages=action.pages as CustomWorkbenchDraft["pages"];
    const candidate={...job.result,pages:job.result.pages.map((p,i)=>i<job.result.pageCount?{...p,...pages[i]}:p)};
    if(pages.length!==job.result.pageCount)throw new LocalError("分镜页数与任务不一致。");
    validateOutline(candidate);
    if(!modelStatus().image)throw new LocalError("生图模型尚未配置。分镜已保存在本机，配置接口后可继续。",503);
    job.result=candidate;job.status="images";job.resumeStatus="images";job.model=customImageConfig().model;job.attempts=0;return writeJob(job);
  }
  throw new LocalError("不支持的本地任务操作。");
}
