"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import { createWorkbenchDraft,type CustomWorkbenchDraft } from "@/lib/custom-workbench";
import { resolveLocalRecovery,type RecoveryDraft } from "@/lib/local-recovery";
type Input={draft:CustomWorkbenchDraft;revision:number};
const CACHE="storybloom.local.automatic-input-recovery";
async function api(body?:Input):Promise<Input>{
  const response=await fetch("/api/local/ai-input",{method:body?"PUT":"GET",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const result=await response.json();if(!response.ok)throw new Error(result.error||"AI 参数保存失败");return result;
}
export function useAiBookInput(){
  const [draft,stateDraft]=useState(()=>createWorkbenchDraft(false)),[ready,setReady]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState("正在读取 AI 参数…");
  const current=useRef(draft),record=useRef<Input|null>(null),saved=useRef(""),pending=useRef<Promise<void>|null>(null),inFlight=useRef<CustomWorkbenchDraft|undefined>(undefined),mounted=useRef(true),blocked=useRef(false);
  const cache=useCallback((sent=inFlight.current)=>{if(record.current)try{localStorage.setItem(CACHE,JSON.stringify({revision:record.current.revision,draft:current.current,sent}));}catch{}},[]);
  const setDraft=useCallback((next:CustomWorkbenchDraft)=>{current.current=next;stateDraft(next);cache();setStatus("正在保存参数…");},[cache]);
  const flush=useCallback(async()=>{
    if(pending.current)return pending.current;if(!record.current)return;if(blocked.current)throw new Error("AI 参数已在另一窗口更新，请刷新后重试。");
    const work=(async()=>{try{
      while(record.current&&JSON.stringify(current.current)!==saved.current){
        const sent=structuredClone(current.current);inFlight.current=sent;cache(sent);const next=await api({draft:sent,revision:record.current.revision});
        inFlight.current=undefined;record.current=next;saved.current=JSON.stringify(sent);cache();
      }
      localStorage.removeItem(CACHE);if(mounted.current){setError("");setStatus("参数与照片已保存到本机");}
    }catch(e){const message=e instanceof Error?e.message:"AI 参数保存失败";if(message.includes("另一窗口"))blocked.current=true;if(mounted.current){setError(message);setStatus("保存未完成，输入已暂存");}throw e;}})();
    pending.current=work;try{await work;}finally{pending.current=null;}
  },[cache]);
  useEffect(()=>{let cancelled=false;mounted.current=true;void api().then(value=>{
    if(cancelled)return;record.current=value;saved.current=JSON.stringify(value.draft);current.current=value.draft;stateDraft(value.draft);
    try{const raw=localStorage.getItem(CACHE);if(raw){const recovery=JSON.parse(raw) as RecoveryDraft;const resolution=resolveLocalRecovery(recovery,value);if(resolution==="restore"){current.current=recovery.draft;stateDraft(recovery.draft);}else if(resolution==="saved")localStorage.removeItem(CACHE);else{blocked.current=true;setError("另一窗口更新了 AI 参数，恢复输入已保留，请刷新后核对。");}}}catch{}
    setReady(true);setStatus("参数与照片已保存到本机");
  }).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;mounted.current=false;};},[]);
  useEffect(()=>{if(!ready)return;const timer=setTimeout(()=>{void flush().catch(()=>{});},500);return()=>clearTimeout(timer);},[draft,ready,flush]);
  useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(record.current&&JSON.stringify(current.current)!==saved.current){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",before);return()=>window.removeEventListener("beforeunload",before);},[]);
  return {draft,setDraft,ready,error,status,flush};
}
