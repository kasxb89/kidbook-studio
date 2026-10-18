"use client";
import { useEffect,useRef,useState } from "react";
import type { CustomWorkbenchDraft } from "@/lib/custom-workbench";
import { defaultPrintSettings,printLeaves,type PrintSettings } from "@/lib/custom-book/print-settings";
import type { PrintReport } from "@/lib/local/print";
import s from "./PrintExportPanel.module.css";
type Project={id:string;draft:CustomWorkbenchDraft;revision:number;updatedAt:string};
function PrintNumber({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(value:number)=>void}) {
  const [text,setText]=useState(String(value));
  useEffect(()=>setText(String(value)),[value]);
  return <input aria-label={label} type="number" min={min} max={max} step="any" value={text}
    onChange={e=>{setText(e.target.value);const n=Number(e.target.value);if(e.target.value&&Number.isFinite(n)&&n>=min&&n<=max)onChange(n);}}
    onBlur={()=>{const n=text&&Number.isFinite(Number(text))?Math.min(max,Math.max(min,Number(text))):value;setText(String(n));if(n!==value)onChange(n);}}/>;
}
export default function PrintExportPanel({draft,projectId,disabled,proofread,onChange,onFlush,onProject,onBusy}:{draft:CustomWorkbenchDraft;projectId:string;disabled:boolean;proofread:boolean;onChange:(settings:PrintSettings)=>void;onFlush:()=>Promise<void>;onProject:(project:Project)=>void;onBusy:(busy:boolean)=>void}) {
  const settings=draft.print||defaultPrintSettings();
  const [busy,setBusy]=useState(false),[report,setReport]=useState<PrintReport|null>(null),[message,setMessage]=useState(""),[error,setError]=useState("");
  const fingerprint=JSON.stringify({settings,pages:draft.pages.slice(0,draft.pageCount),cover:draft.cover,typography:draft.typography,design:draft.studio?.pages,title:draft.title,subtitle:draft.subtitle,author:draft.author,format:draft.format,spreads:draft.spreads,count:draft.pageCount});
  const checkedContent=useRef(fingerprint);
  useEffect(()=>{if(checkedContent.current!==fingerprint){checkedContent.current=fingerprint;if(!busy)setReport(null);}},[fingerprint,busy]);
  async function api(body:unknown) {
    const response=await fetch(`/api/local/projects/${projectId}/print`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(!response.ok){const data=await response.json();throw new Error(data.error||"印刷导出失败。");}return response;
  }
  async function run(action:"check"|"enhance"|"pdf"|"zip") {
    setBusy(true);onBusy(true);setError("");
    try {
      await onFlush();
      if(action==="pdf"||action==="zip") {
        setMessage("正在生成 A4 印刷文件，请稍候…");
        const response=await api({action:"export",format:action,proofread}),blob=await response.blob();
        const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`${draft.title||"绘本"}_A4_${settings.mode==="press"?"印刷":"办公打印"}.${action}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        setMessage(action==="zip"?"交付包已下载，包含整本、内页、封面、高清插图、文稿和制作说明。":"A4 PDF 已下载，请按制作说明选择纸张和双面方式。");return;
      }
      setMessage("正在检查原图像素、版式和字体…");
      let next:PrintReport=await (await api({action:"preflight"})).json();setReport(next);
      if(action==="enhance") {
        const pages=[...new Set(next.checks.filter(c=>c.needsUpgrade).map(c=>c.upgradePage))];
        for(const [index,page]of pages.entries()) {
          setMessage(`正在准备高清图 ${index+1} / ${pages.length} · ${page?`正文第 ${page} 页`:"封面"}。完成页会自动保存，刷新后可接着准备。`);
          const data=await (await api({action:"enhance",page})).json();onProject(data.project);next=data.report;setReport(next);
        }
      }
      setMessage(next.ready?"检查通过：全部插图达到 300 ppi，可导出 A4 印刷文件。":"检查已完成，请先处理下方未通过的项目。");
    }catch(e){setError(e instanceof Error?e.message:"印刷操作失败，请重试。");setMessage("已完成的页面保留在本机，可重新检查并继续。");}
    finally {setBusy(false);onBusy(false);}
  }
  const leaves=printLeaves(draft.pageCount,settings.binding),low=report?.checks.filter(c=>c.needsUpgrade)||[];
  function patch(value:Partial<PrintSettings>){onChange({...settings,...value});}
  return <section className={s.panel} aria-label="A4 印刷导出">
    <h3>A4 输出设置</h3>
    <p>完整插图与正文分区排版，中文字体嵌入，逐页检查原图的有效清晰度。</p>
    <fieldset disabled={disabled||busy}>
      <div className={s.fields}>
        <label>输出用途<select aria-label="印刷输出用途" value={settings.mode} onChange={e=>patch({mode:e.target.value as PrintSettings["mode"]})}><option value="press">印厂版 · A4成品＋出血</option><option value="office">办公版 · 直接使用A4纸</option></select></label>
        <label>装订方式<select aria-label="印刷装订方式" value={settings.binding} onChange={e=>patch({binding:e.target.value as PrintSettings["binding"]})}><option value="left">左侧装订 / 胶装 / 打孔</option><option value="saddle">骑马订 · 对折装订</option></select></label>
      </div>
      <p>{settings.mode==="press"?`成品 210 × 297 mm；四边 ${settings.bleedMm} mm 出血，需更大的纸张裁切。` : "文件就是 210 × 297 mm，按实际大小打印，不含外出血或裁切标记。"} {settings.binding==="saddle"?"骑马订自动补足4的倍数；办公交付包附A3双面拼版，折后为A4。":"左右页自动镜像内侧留白；双面使用长边翻转。"}</p>
      <p>正文 {draft.pageCount} 页 → 成册 {leaves.length} 面，包含封面四面与补白。内侧 {settings.innerMm} mm，外侧 {settings.outerMm} mm。</p>
      <details><summary>调整出血、装订留白和印刷字号</summary><div className={s.fields}>
        {([
          ["bleedMm","四边出血（mm）",0,6], ["innerMm","内侧留白（mm）",12,35], ["outerMm","外侧留白（mm）",10,30], ["topMm","上方留白（mm）",10,30], ["bottomMm","下方留白（mm）",10,30], ["bodyPt","正文字号（pt）",14,28], ["imageWidthMm","插图最大宽度（mm）",60,190],
        ]as const).map(([key,label,min,max])=><label key={key}>{label}<PrintNumber label={label} min={min} max={max} value={settings[key]} onChange={n=>patch({[key]:n})}/></label>)}
      </div><label className={s.check}><input type="checkbox" checked={settings.cropMarks} disabled={settings.mode==="office"} onChange={e=>patch({cropMarks:e.target.checked})}/> 添加裁切标记（需更大纸张）</label></details>
      <div className={s.actions}><button onClick={()=>void run("check")}>检查印刷质量</button><button onClick={()=>void run("enhance")}>准备高清插图</button></div>
      <small>高清准备会调用已配置的生图接口，保留原图到版本历史。画面细节请制作人员复核；文件放大不会被当作高清。</small>
      <div className={s.actions}><button className={s.primary} disabled={!report?.ready} onClick={()=>void run("pdf")}>下载 A4 印刷 PDF</button><button className={s.primary} disabled={!report?.ready} onClick={()=>void run("zip")}>下载印刷交付包</button></div>
    </fieldset>
    {message&&<div className={s.status} role="status">{message}</div>}
    {error&&<p className={s.errors} role="alert">{error}</p>}
    {report&&<div><p>{report.ready?"全部页面通过检查。":`${low.length} 页插图待提升清晰度。`}</p>{report.errors.map((e,i)=><p key={i} className={s.errors}>{e}</p>)}<div className={s.table}><table><thead><tr><th>页面</th><th>实际像素</th><th>有效 ppi</th><th>结果</th></tr></thead><tbody>{report.checks.map(c=><tr key={c.page}><td>{c.label}</td><td>{c.pixels}</td><td>{c.ppi} / 300</td><td>{c.needsUpgrade?"需高清图或缩小尺寸":"通过"}</td></tr>)}</tbody></table></div></div>}
  </section>;
}
