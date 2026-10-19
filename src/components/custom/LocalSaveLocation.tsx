"use client";
import { useEffect,useId,useState } from "react";
import { FolderOpen } from "@phosphor-icons/react/dist/csr/FolderOpen";
import s from "./LocalSaveLocation.module.css";
type Location={projectId:string;title:string;directory:string;images:string;pdfs:string;pdfCount:number;pdfOutdated:boolean;warnings:string[];fileManager:string};
export default function LocalSaveLocation({projectId,saved,onFlush}:{projectId:string;saved:string;onFlush:()=>Promise<void>}) {
  const [location,setLocation]=useState<Location|null>(null),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const id=useId();
  useEffect(()=>{if(!projectId)return;let cancelled=false;void fetch(`/api/local/storage?projectId=${projectId}`,{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"保存路径读取失败。");if(!cancelled)setLocation(data);}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"保存路径读取失败。");});return()=>{cancelled=true;};},[projectId,saved]);
  useEffect(()=>{if(!expanded)return;function escape(e:KeyboardEvent){if(e.key==="Escape")setExpanded(false);}document.addEventListener("keydown",escape);return()=>document.removeEventListener("keydown",escape);},[expanded]);
  async function open(){
    setBusy(true);setError("");setMessage("");setExpanded(true);
    try{await onFlush();const response=await fetch("/api/local/storage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"open-folder",projectId})});const data=await response.json();if(!response.ok)throw new Error(data.error||"打开文件夹失败。");setLocation(data);setMessage(`已在 ${data.fileManager} 中打开《${data.title}》的文件夹。`);}
    catch(e){setError(e instanceof Error?e.message:"打开文件夹失败，请复制路径后打开。");}finally{setBusy(false);}
  }
  async function copy(){try{await navigator.clipboard.writeText(location!.directory);setMessage("保存路径已复制。");setError("");}catch{setError("复制失败，可以选中下方路径手动复制。");}}
  async function showPath(){setExpanded(value=>!value);if(expanded||!projectId)return;try{await onFlush();const response=await fetch(`/api/local/storage?projectId=${projectId}`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"保存路径读取失败。");setLocation(data);setError("");}catch(e){setError(e instanceof Error?e.message:"保存路径读取失败。");}}
  return <div className={s.location}>
    <button onClick={()=>void open()} disabled={busy||!projectId} title={location?.directory}><FolderOpen size={16} aria-hidden="true"/>{busy?"正在打开…":"打开本书文件夹"}</button>
    <button className={s.pathToggle} onClick={()=>void showPath()} aria-expanded={expanded} aria-controls={id}>查看路径</button>
    {expanded&&<section className={s.popover} id={id} aria-label="本机保存位置">
      <header><strong>本书文件夹</strong><button aria-label="关闭保存位置" onClick={()=>setExpanded(false)}>×</button></header>
      <p>《{location?.title||"当前绘本"}》的编导稿、图片与导出成品单独归档。</p>
      <code className={s.path}>{location?.directory||"正在读取保存路径…"}</code>
      <dl><dt>编导稿</dt><dd>编导稿.txt</dd><dt>可编辑项目</dt><dd>项目配置.json</dd><dt>照片与逐页插图</dt><dd>图片 文件夹</dd><dt>成品 PDF</dt><dd>成品PDF 文件夹</dd><dt>制作交付包</dt><dd>交付包 文件夹</dd></dl>
      <p>{location?.pdfCount?`已归档 ${location.pdfCount} 份 PDF。${location.pdfOutdated?"绘本已有修改，请重新导出需要交付的版本。":""}`:"尚未导出 PDF；在“印刷交付”中导出后，会自动放入本书文件夹。"}</p>
      {!!location?.warnings.length&&<p className={s.error}>部分图片未能整理，请检查文件说明.txt。</p>}
      <footer><button disabled={!location} onClick={()=>void copy()}>复制路径</button><button onClick={()=>setExpanded(false)}>收起</button></footer>
      {message&&<p className={s.feedback} role="status">{message}</p>}{error&&<p className={s.error} role="alert">{error}</p>}
    </section>}
  </div>;
}
