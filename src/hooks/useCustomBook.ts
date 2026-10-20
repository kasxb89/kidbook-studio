"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomWorkbenchDraft } from "@/lib/custom-workbench";
import type { ProductionEdit } from "@/lib/book-production";
import { needsAutomaticJobRefresh } from "@/lib/automatic-job-progress";
export type LiveCustomJob = {
  id:string;projectId:string;status:"preparing"|"outline"|"review"|"images"|"paused"|"retryable"|"complete"|"failed";
  automatic?:boolean;
  source?:CustomWorkbenchDraft;
  pauseRequested?:boolean;
  resumeStatus?:"preparing"|"outline"|"images";
  cursor:number;totalUnits:number;attempts:number;leaseUntil:string|null;error:string|null;
  outlineCursor?:number;
  outlinePlan?:string[];
  model:string;result:CustomWorkbenchDraft;updatedAt:string;
};
export function useCustomBook(onResult:(draft:CustomWorkbenchDraft,job:LiveCustomJob)=>void,onMessage:(message:string)=>void,projectId:string) {
  const [job,setJob]=useState<LiveCustomJob|null>(null),[jobs,setJobs]=useState<LiveCustomJob[]>([]);
  const [configured,setConfigured]=useState({text:false,image:false,model:"未配置"});
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const active=useRef(false), epoch=useRef(0), resultRef=useRef(onResult), messageRef=useRef(onMessage);
  const pending=useRef<string|null>(null);
  const automaticAttempt=useRef("");
  resultRef.current=onResult;messageRef.current=onMessage;
  const api=useCallback(async(path:string,body?:unknown)=>{
    const r=await fetch(`/api/local/jobs${path}`,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});
    const data=await r.json();if(!r.ok)throw new Error(data.error||"本地任务操作失败");return data;
  },[]);
  const refresh=useCallback(async()=>{
    if(!projectId)return;
    const version=epoch.current;const data=await api(`?projectId=${projectId}`);
    if(version===epoch.current){setConfigured(data.configured);setJobs(data.jobs);}
  },[api,projectId]);
  useEffect(()=>{epoch.current++;setJob(null);setError("");pending.current=null;automaticAttempt.current="";setJobs([]);void refresh().catch(e=>setError(e.message));return()=>{epoch.current++;};},[projectId,refresh]);
  function accept(next:LiveCustomJob){setJob(next);resultRef.current({...next.result,localJobId:next.id},next);}
  async function guarded(fn:(version:number)=>Promise<void>){
    if(active.current)return;active.current=true;setBusy(true);setError("");const version=epoch.current;
    try{await fn(version);}catch(e){if(version===epoch.current){const m=e instanceof Error?e.message:"操作失败";setError(m);messageRef.current(m);}}
    finally{active.current=false;setBusy(false);if(version===epoch.current)await refresh().catch(()=>{});}
  }
  async function run(initial:LiveCustomJob,version:number,retry=false){
    let next=initial;
    if(next.leaseUntil&&Date.parse(next.leaseUntil)>Date.now())return;
    while(version===epoch.current&&(["preparing","outline","images"].includes(next.status)||retry)){
      next=await api(`/${next.id}`,{action:"advance",retry});retry=false;
      if(version!==epoch.current)return;accept(next);
      if(next.status==="retryable"){messageRef.current(next.error||"当前步骤中断，可恢复。");break;}
    }
  }
  const start=(draft:CustomWorkbenchDraft)=>guarded(async v=>{
    const id=pending.current||crypto.randomUUID();pending.current=id;
    const next=await api("",{id,projectId,draft:{...draft,studio:undefined}});pending.current=null;if(v!==epoch.current)return;accept(next);await run(next,v);
  });
  const resume=(id:string,currentDraft?:CustomWorkbenchDraft)=>guarded(async v=>{const next:LiveCustomJob=await api(`/${id}`);if(v!==epoch.current)return;if(next.status==="review"&&currentDraft?.localJobId===id)next.result=currentDraft;accept(next);await run(next,v,["outline","images","paused","retryable"].includes(next.status));});
  async function pause(id:string){const version=epoch.current;const next=await api(`/${id}`,{action:"pause"});if(version===epoch.current)setJob(next);}
  async function saveProduction(id:string,edit:ProductionEdit,expectedUpdatedAt:string,projectRevision:number){
    const version=epoch.current;
    const data:{job:LiveCustomJob;project:{id:string;draft:CustomWorkbenchDraft;revision:number;updatedAt:string}}=await api(`/${id}`,{action:"save-production",edit,expectedUpdatedAt,projectRevision});
    if(version!==epoch.current)throw new Error("项目已切换，编导修改已保存，请重新打开该项目。");
    setJob(data.job);setJobs(current=>current.map(j=>j.id===id?data.job:j));return data;
  }
  const retry=()=>guarded(async v=>{if(job)await run(job,v,true);});
  const confirm=(draft:CustomWorkbenchDraft)=>guarded(async v=>{
    if(!job)return;const next=await api(`/${job.id}`,{action:"confirm",pages:draft.pages.slice(0,draft.pageCount).map(({asset,...page})=>page)});
    if(v!==epoch.current)return;accept(next);await run(next,v);
  });
  const cancel=()=>guarded(async v=>{if(!job)return;const next=await api(`/${job.id}`,{action:"cancel"});if(v!==epoch.current)return;accept(next);});
  useEffect(()=>{
    const candidate=jobs.find(j=>j.automatic&&!["complete","failed","retryable","paused","review"].includes(j.status));
    if(!candidate||busy||active.current)return;
    if(job?.id===candidate.id&&["complete","failed","retryable","paused"].includes(job.status))return;
    if(candidate.leaseUntil&&Date.parse(candidate.leaseUntil)>Date.now())return;
    const key=`${candidate.id}:${candidate.updatedAt}:${candidate.leaseUntil}`;
    if(automaticAttempt.current===key)return;automaticAttempt.current=key;
    void resume(candidate.id);
  },[jobs,busy,job]);
  useEffect(()=>{
    if(busy||!jobs.some(j=>needsAutomaticJobRefresh(j)))return;
    const timer=setInterval(()=>{void refresh().catch(()=>{});},3000);return()=>clearInterval(timer);
  },[jobs,busy,refresh]);
  const stored=job&&jobs.find(j=>j.id===job.id&&j.updatedAt>job.updatedAt);
  return {job:stored||job,jobs,configured,busy,error,start,resume,retry,confirm,cancel,pause,saveProduction,refresh,clearJob:()=>{if(!busy){epoch.current++;setJob(null);pending.current=null;}}};
}
