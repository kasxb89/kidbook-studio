"use client";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { createWorkbenchDraft, type CustomWorkbenchDraft } from "@/lib/custom-workbench";
import { resolveLocalRecovery, type RecoveryDraft } from "@/lib/local-recovery";
import { recordStudioChanges } from "@/lib/book-studio";
import { createBookBrief } from "@/lib/book-domain";

type Project = { id:string; draft:CustomWorkbenchDraft; revision:number; updatedAt:string };
type ProjectSummary = {id:string;title:string;updatedAt:string};
const ACTIVE="storybloom.local.active-project";
const RECOVERY="storybloom.local.recovery.";
function cacheRecovery(projectId:string,value:RecoveryDraft) {
  try {localStorage.setItem(RECOVERY+projectId,JSON.stringify(value));return true;}
  catch {return false;}
}
async function request(path:string,init?:RequestInit) {
  const r=await fetch(`/api/local/projects${path}`,{...init,headers:{"Content-Type":"application/json"},cache:"no-store"});
  const data=await r.json();if(!r.ok) throw new Error(data.error||"本地保存失败");return data;
}
export function useLocalWorkbench() {
  const [draft,stateDraft]=useState(()=>createWorkbenchDraft(false));
  const [projectId,setProjectId]=useState("");
  const [projects,setProjects]=useState<ProjectSummary[]>([]);
  const [ready,setReady]=useState(false);
  const [loadAttempt,setLoadAttempt]=useState(0);
  const [switching,setSwitching]=useState(false);
  const navigating=useRef(false);
  const [status,setStatus]=useState("正在读取本机项目…");
  const [error,setError]=useState("");
  const inFlight=useRef<CustomWorkbenchDraft|undefined>(undefined);
  const current=useRef(draft), record=useRef<Project|null>(null), saved=useRef("");
  const saving=useRef<Promise<void>|null>(null), mounted=useRef(true), blocked=useRef(false);
  const refreshList=useCallback(async()=>{const data=await request("");if(mounted.current)setProjects(data.projects);},[]);
  function apply(p:Project) {
    p.draft={...p.draft,brief:p.draft.brief||createBookBrief()};
    inFlight.current=undefined;record.current=p;saved.current=JSON.stringify(p.draft);current.current=p.draft;
    localStorage.setItem(ACTIVE,p.id);setProjectId(p.id);stateDraft(p.draft);setReady(true);setError("");blocked.current=false;setStatus("已保存到本机");
  }
  const setDraft=useCallback((action:SetStateAction<CustomWorkbenchDraft>)=>{
    const incoming=typeof action==="function"?action(current.current):action;
    const next=recordStudioChanges(current.current,incoming);
    current.current=next;stateDraft(next);
    if(record.current) {
      if(!cacheRecovery(record.current.id,{revision:record.current.revision,draft:next,sent:inFlight.current}))setError("浏览器恢复草稿暂不可用，自动保存仍继续。请等待已保存到本机后再关闭页面。");
    }
    setStatus("有修改，等待保存…");
  },[]);
  const flush=useCallback(async()=>{
    if(saving.current) return saving.current;
    if(!record.current) return;
    if(blocked.current) throw new Error("另一窗口已更新此项目；为保护你的修改，自动保存已暂停。请导出当前配置后重新载入。");
    const work=(async()=>{
      let wrote=false;
      try {
        while(record.current && JSON.stringify(current.current)!==saved.current) {
          const snapshot=JSON.stringify(current.current);const p=record.current;
          if(mounted.current)setStatus("正在写入本机…");
          inFlight.current=JSON.parse(snapshot);
          cacheRecovery(p.id,{revision:p.revision,draft:current.current,sent:inFlight.current});
          const next:Project=await request(`/${p.id}`,{method:"PUT",body:JSON.stringify({draft:JSON.parse(snapshot),revision:p.revision})});
          inFlight.current=undefined;wrote=true;record.current={...next,draft:current.current};saved.current=snapshot;
          // Keep the new revision with any edits made while this write was running.
          cacheRecovery(p.id,{revision:next.revision,draft:current.current});
        }
        if(wrote && record.current)localStorage.removeItem(RECOVERY+record.current.id);
        if(mounted.current){setStatus("已保存到本机");setError("");void refreshList().catch(()=>{});}
      }catch(e){
        const message=e instanceof Error?e.message:"本地保存失败";
        if(message.includes("另一个窗口"))blocked.current=true;
        if(mounted.current){setError(message);setStatus("保存失败，恢复草稿已保留");}throw e;
      }
    })();
    saving.current=work;try {await work;}finally{saving.current=null;}
  },[refreshList]);
  useEffect(()=>{
    mounted.current=true;let cancelled=false;
    (async()=>{
      try {
        const list=await request("");if(cancelled)return;
        setProjects(list.projects);
        const active=localStorage.getItem(ACTIVE);
        const id=list.projects.find((p:ProjectSummary)=>p.id===active)?.id||list.projects[0]?.id;
        const p:Project=id?await request(`/${id}`):await request("",{method:"POST",body:JSON.stringify({draft:createWorkbenchDraft(false)})});
        if(cancelled)return;apply(p);
        const recovery=localStorage.getItem(RECOVERY+p.id);
        if(recovery){
          const value=JSON.parse(recovery) as RecoveryDraft;
          const resolution=resolveLocalRecovery(value,p);
          if(resolution==="restore"){setDraft(value.draft);setStatus("已恢复刷新前的修改，正在保存…");}
          else if(resolution==="saved")localStorage.removeItem(RECOVERY+p.id);
          else {setError("发现另一窗口更新后的恢复草稿，未覆盖本机项目。恢复记录仍保留在浏览器中。");}
        }
      }catch(e){if(!cancelled){setError(e instanceof Error?e.message:"本机项目读取失败");setStatus("读取失败，请重试");}}
    })();
    return()=>{cancelled=true;mounted.current=false;};
  },[setDraft,loadAttempt]);
  useEffect(()=>{if(!ready)return;const timer=setTimeout(()=>{void flush().catch(()=>{});},500);return()=>clearTimeout(timer);},[draft,ready,flush]);
  useEffect(()=>{
    const leave=(e:BeforeUnloadEvent)=>{if(JSON.stringify(current.current)!==saved.current){e.preventDefault();e.returnValue="";}};
    const hide=()=>{void flush().catch(()=>{});};
    window.addEventListener("beforeunload",leave);document.addEventListener("visibilitychange",hide);
    return()=>{window.removeEventListener("beforeunload",leave);document.removeEventListener("visibilitychange",hide);};
  },[flush]);
  async function navigate(load:()=>Promise<Project>) {
    if(navigating.current)throw new Error("正在切换项目，请稍候。");
    navigating.current=true;setSwitching(true);
    try {await flush();const p=await load();apply(p);await refreshList();}
    finally {navigating.current=false;setSwitching(false);}
  }
  async function createProject(next=createWorkbenchDraft(false)) {
    await navigate(()=>request("",{method:"POST",body:JSON.stringify({draft:next})}));
  }
  async function selectProject(id:string) {await navigate(()=>request(`/${id}`));}

  function acceptServerProject(p:Project) {
    if(p.id!==record.current?.id)throw new Error("项目已切换，请重新读取。");
    if(JSON.stringify(current.current)!==saved.current)throw new Error("仍有本机修改未保存，请先保存再读取高清结果。");
    localStorage.removeItem(RECOVERY+p.id);apply(p);void refreshList().catch(()=>{});
  }
  return {draft,setDraft,projectId,projects,ready:ready&&!switching,status,error,flush,createProject,selectProject,acceptServerProject,reload:()=>{setReady(false);setLoadAttempt(n=>n+1);}};
}
