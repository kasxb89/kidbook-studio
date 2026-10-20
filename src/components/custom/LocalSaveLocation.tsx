"use client";
import { useEffect,useId,useState } from "react";
import { FolderOpen } from "@phosphor-icons/react/dist/csr/FolderOpen";
import { downloadUrl } from "@/lib/browser-download";
import s from "./LocalSaveLocation.module.css";
type Location={projectId:string;title:string;directory:string;pdfCount:number;pdfOutdated:boolean;warnings:string[];fileManager:string;storageMode:"local"|"server";revealAvailable:boolean};
type BookFile={path:string;name:string;bytes:number;kind:"pdf"|"image"|"archive"|"text"};
export default function LocalSaveLocation({projectId,saved,onFlush,onImport,importing=false}:{projectId:string;saved:string;onFlush:()=>Promise<void>;onImport?:()=>void;importing?:boolean}) {
  const [location,setLocation]=useState<Location|null>(null),[files,setFiles]=useState<BookFile[]>([]),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const id=useId();
  async function refresh() {
    const responses=await Promise.all([fetch(`/api/local/storage?projectId=${projectId}`,{cache:"no-store"}),fetch(`/api/local/projects/${projectId}/files`,{cache:"no-store"})]);
    const [info,list]=await Promise.all(responses.map(r=>r.json()));
    if(!responses[0].ok||!responses[1].ok)throw new Error(info.error||list.error||"文件列表读取失败。");
    setLocation(info);setFiles(list.files);return info as Location;
  }
  useEffect(()=>{if(!projectId)return;let active=true;void fetch(`/api/local/storage?projectId=${projectId}`,{cache:"no-store"}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"文件信息读取失败。");if(active)setLocation(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[projectId,saved]);
  useEffect(()=>{if(!expanded||!projectId)return;void refresh().catch(e=>setError(e.message));function escape(e:KeyboardEvent){if(e.key==="Escape")setExpanded(false);}document.addEventListener("keydown",escape);return()=>document.removeEventListener("keydown",escape);},[expanded,projectId,saved]);
  async function archive(kind:"project"|"images"|"delivery") {setBusy(true);setError("");try{await onFlush();downloadUrl(`/api/local/projects/${projectId}/download?kind=${kind}`);setMessage("下载已开始，请在浏览器下载列表中查看进度。文件会保存到你电脑的下载位置。");}catch(e){setError(e instanceof Error?e.message:"下载失败，请重试。");}finally{setBusy(false);}}
  async function open() {
    if(location&&!location.revealAvailable){await archive("delivery");return;}
    setBusy(true);setError("");setMessage("");setExpanded(true);
    try{await onFlush();const response=await fetch("/api/local/storage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"open-folder",projectId})});const data=await response.json();if(!response.ok)throw new Error(data.error||"打开文件夹失败。");setLocation(data);setMessage(`已在${data.fileManager}中打开本书文件夹。`);}catch(e){setError(e instanceof Error?e.message:"打开失败，请使用下载。");}finally{setBusy(false);}
  }
  async function file(path:string) {setError("");try{await onFlush();downloadUrl(`/api/local/projects/${projectId}/files?path=${encodeURIComponent(path)}`);setMessage("文件已开始下载。");}catch(e){setError(e instanceof Error?e.message:"下载失败，请重试。");}}
  async function copy() {try{await navigator.clipboard.writeText(location!.directory);setMessage("保存路径已复制。");}catch{setError("复制失败，可以手动选中路径复制。");}}
  return <div className={s.location}>
    <button onClick={()=>void open()} disabled={busy||!projectId||!location}><FolderOpen size={16} aria-hidden="true"/>{busy?"正在处理…":location?.revealAvailable?"打开本书文件夹":"下载本书资料"}</button>
    <button className={s.pathToggle} disabled={!projectId} onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded} aria-controls={id}>文件与下载</button>
    {expanded&&<section className={s.popover} id={id} aria-label="本书文件与下载"><header><strong>本书文件与下载</strong><button aria-label="关闭文件与下载" onClick={()=>setExpanded(false)}>×</button></header>
      <p>《{location?.title||"当前绘本"}》的编导稿、图片与PDF单独归档。{location?.storageMode==="server"?"工作空间保存在服务器；点击下载即可保存到你的电脑。":"可打开本机文件夹，或直接下载所需文件。"}</p>
      <div className={s.downloads}><button disabled={busy} onClick={()=>void archive("delivery")}>下载整本交付资料</button><button disabled={busy} onClick={()=>void archive("images")}>下载全部原图</button><button disabled={busy} onClick={()=>void archive("project")}>下载完整项目备份</button><button disabled={busy||importing||!onImport} onClick={onImport}>{importing?"正在导入…":"导入项目备份"}</button></div>
      <small>完整项目备份包含原图、分镜、排版和图片历史，可在另一台电脑或服务器导入后继续修改。</small>
      {location?.pdfOutdated&&<p className={s.error}>绘本已有修改，下列PDF可能是旧版；请重新导出后交付。</p>}
      <div className={s.fileList}>{files.filter(f=>f.kind!=="image").map(f=><button key={f.path} title={f.path} disabled={busy} onClick={()=>void file(f.path)}><span>{f.name}</span><small>{f.bytes>=1024*1024?`${(f.bytes/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(f.bytes/1024))} KB`}</small></button>)}</div>
      {!files.some(f=>f.kind==="pdf")&&<p>尚未归档PDF；在“印刷交付”中导出后，可随时回到这里下载。</p>}
      {location?.revealAvailable&&<details><summary>查看本机保存路径</summary><code className={s.path}>{location.directory}</code><button onClick={()=>void copy()}>复制路径</button></details>}
      {!!location?.warnings.length&&<p className={s.error}>部分图片未能整理，请检查文件说明.txt。</p>}
      {message&&<p className={s.feedback} role="status">{message}</p>}{error&&<p className={s.error} role="alert">{error}</p>}
    </section>}
  </div>;
}
