"use client";
import { useEffect,useId,useState } from "react";
import { applyProductionEdits,bookProductionText,chineseProductionScene,productionEdits,productionPages,type ProductionBook,type ProductionEdit } from "@/lib/book-production";
import s from "./BookProductionPlan.module.css";
import { visualStyleFor } from "@/lib/custom-book/visual-style";
const tabs=[{id:"story",label:"整体故事线"},{id:"cast",label:"人物与美术"},{id:"pages",label:"逐页分镜"}] as const;
const pageFields=[["shot","景别与视角",200],["action","画面动作",500],["emotion","情绪与表情",300],["composition","画面构图",600],["textPlacement","文字位置",400],["continuity","连续性",400],["learningFocus","认知 / 练习目标",300]] as const;
function Value({value,label,onChange,max=2500,rows=2}:{value:string;label:string;onChange?:(v:string)=>void;max?:number;rows?:number}) {
  return onChange?<textarea className={s.editor} aria-label={label} value={value} maxLength={max} rows={rows} onChange={e=>onChange(e.target.value)}/>:<span className={s.value}>{value||"待补充"}</span>;
}
type Session={jobId:string;updatedAt:string;edit:ProductionEdit};
export default function BookProductionPlan({book,jobId,updatedAt,editable=false,onSave,onEditingChange}:{book:ProductionBook;jobId:string;updatedAt?:string;editable?:boolean;onSave?:(edit:ProductionEdit,updatedAt:string)=>Promise<void>;onEditingChange?:(editing:boolean)=>void}) {
  const [tab,setTab]=useState<typeof tabs[number]["id"]>("story"),[batch,setBatch]=useState(0),[session,setSession]=useState<Session|null>(null),[saving,setSaving]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const edit=session?.jobId===jobId?session.edit:null,uid=useId(),cacheKey=`storybloom.local.production-edit.${jobId}`;
  const d=edit?applyProductionEdits(book.result,edit):book.result,direction=d.direction,view={...book,result:d,...(edit?{outlinePlan:edit.pages.map(p=>p.beat)}:{})},pages=productionPages(view),hasContent=!!direction||pages.some(p=>p.beat||p.written),written=pages.filter(p=>p.written).length;
  useEffect(()=>{
    setTab("story");setBatch(0);setSession(null);setNotice("");setError("");
    try{const cached=JSON.parse(localStorage.getItem(cacheKey)||"null") as Session|null;if(cached?.jobId===jobId){setSession(cached);setNotice("已恢复刷新前的编导修改，保存后用于后续制作。");}}catch{}
  },[jobId,cacheKey]);
  useEffect(()=>{onEditingChange?.(!!edit);},[!!edit,onEditingChange]);
  useEffect(()=>{if(session?.jobId===jobId)try{localStorage.setItem(cacheKey,JSON.stringify(session));}catch{setError("编导恢复草稿保存失败，请点击保存修改后再关闭页面。");}},[session,jobId,cacheKey]);
  function patch(value:Partial<ProductionEdit>){setSession(current=>current?{...current,edit:{...current.edit,...value}}:current);}
  function pagePatch(index:number,value:Partial<ProductionEdit["pages"][number]>){if(edit)patch({pages:edit.pages.map((p,i)=>i===index?{...p,...value}:p)});}
  function directionPatch(value:Partial<NonNullable<ProductionEdit["direction"]>>){if(edit?.direction)patch({direction:{...edit.direction,...value}});}
  function finish(){localStorage.removeItem(cacheKey);setSession(null);setError("");}
  async function save(){if(!edit||!session||!onSave||!editable)return;setSaving(true);setError("");try{await onSave(edit,session.updatedAt);finish();setNotice("编导修改已保存到本机。已生成的插图需在单页画布中重新生成才会更新。");}catch(e){setError(e instanceof Error?e.message:"保存失败，修改已保留。");}finally{setSaving(false);}}
  const pageSize=edit?1:8,start=Math.min(Math.floor(batch/pageSize)*pageSize,Math.max(0,Math.floor((d.pageCount-1)/pageSize)*pageSize));
  function download(){const url=URL.createObjectURL(new Blob(["\uFEFF",bookProductionText(view)],{type:"text/plain;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`${(d.title||"绘本").replace(/[<>:"/\\|?*\u0000-\u001f]/g,"").slice(0,80)}_编导稿.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <section className={s.plan} aria-label="绘本编导工作台">
    <header className={s.heading}><div><span>编导工作台 · 随生成保存</span><h2>{edit?<Value value={edit.title} label="编导书名" max={100} rows={1} onChange={title=>patch({title})}/>:d.title||"正在构思这本绘本"}</h2><p>{d.age} · {d.pageCount} 页正文 · {visualStyleFor(d)==="realistic"?"真人写实":"动漫绘本"} <b>{book.status==="complete"?"整本已完成":book.status==="paused"?"已暂停 · 可修改":book.status==="retryable"?"已暂停 · 可继续":book.status==="failed"?"任务已结束":"自动制作中"}</b></p></div><div className={s.headingActions}><button disabled={!hasContent} onClick={download}>下载编导稿</button>{onSave&&!edit&&<button disabled={!editable||!hasContent} onClick={()=>{setSession({jobId,updatedAt:updatedAt||"",edit:productionEdits(book)});setNotice("");setError("");}}>修改编导</button>}</div></header>
    {edit?<div className={s.editBar}><div><strong>正在修改编导</strong><p>文字与编导可以直接改。已配好的图片保留；画面需要变化时，在单页画布重新生成。</p></div><div><button disabled={saving} onClick={()=>{finish();setNotice("已取消本次修改。");}}>取消修改</button><button disabled={saving||!editable} onClick={()=>void save()}>{saving?"正在保存…":"保存修改"}</button></div></div>:onSave&&<p className={s.editHint}>{editable?"生成结果可以修改。点击“修改编导”编辑故事线、人物、美术方案和每页内容。":"制作中如需改稿，点击右侧“暂停并修改编导”，当前步骤保存后即可编辑。"}</p>}
    {notice&&<p className={s.editHint} role="status">{notice}</p>}{error&&<p className={s.editError} role="alert">{error}</p>}
    <fieldset className={s.content} disabled={saving||!!edit&&!editable}>
    <div className={s.tabs} role="tablist" aria-label="查看编导内容" onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const index=tabs.findIndex(t=>t.id===tab),next=tabs[e.key==="Home"?0:e.key==="End"?2:(index+(e.key==="ArrowRight"?1:2))%3].id;setTab(next);document.getElementById(`${uid}-${next}-tab`)?.focus();}}>{tabs.map(t=><button key={t.id} role="tab" id={`${uid}-${t.id}-tab`} aria-controls={`${uid}-${t.id}-panel`} aria-selected={tab===t.id} tabIndex={tab===t.id?0:-1} onClick={()=>setTab(t.id)}>{t.label}{t.id==="pages"&&<small>{written} / {d.pageCount}</small>}</button>)}</div>
    <div role="tabpanel" id={`${uid}-story-panel`} aria-labelledby={`${uid}-story-tab`} hidden={tab!=="story"}>
      {edit&&<label className={s.theme}>全书主题<Value value={edit.theme} label="编导全书主题" max={300} onChange={theme=>patch({theme})}/></label>}
      {direction?<>
        <div className={s.logline}><span>一句话主线</span><p><Value value={direction.logline} label="编导一句话主线" max={300} onChange={edit?logline=>directionPatch({logline}):undefined}/></p></div>
        <section className={s.section}><h3>完整故事梗概</h3><p className={s.prose}><Value value={direction.synopsis} label="编导完整故事梗概" max={1800} rows={6} onChange={edit?synopsis=>directionPatch({synopsis}):undefined}/></p></section>
        <ol className={s.arc}>{direction.arc.map((a,i)=><li key={i}><b>{String(i+1).padStart(2,"0")}</b><div><strong><Value value={a.title} label={`第${i+1}阶段标题`} max={60} rows={1} onChange={edit?title=>directionPatch({arc:direction.arc.map((v,n)=>n===i?{...v,title}:v)}):undefined}/></strong><p><Value value={a.content} label={`第${i+1}阶段情节`} max={500} onChange={edit?content=>directionPatch({arc:direction.arc.map((v,n)=>n===i?{...v,content}:v)}):undefined}/></p></div></li>)}</ol>
      </>:<p className={s.waiting}>{book.status==="preparing"?"AI 正在整理完整故事线、起承转合和美术方案，完成后会显示在这里。":"这个旧任务未保存完整编导总案；下方仍可查看已保存的故事节拍和逐页分镜。"}</p>}
      <section className={s.section}><header className={s.sectionHeading}><h3>全书故事节拍</h3><small>{pages.filter(p=>p.beat).length} / {d.pageCount} 页已规划</small></header>
        {edit||pages.some(p=>p.beat)?<ol className={s.beats}>{pages.map(p=><li key={p.number} data-written={p.written}><b>{p.number}</b><div><strong>第 {p.number} 页</strong><p><Value value={p.beat} label={`第${p.number}页故事节拍`} max={400} onChange={edit?beat=>pagePatch(p.number-1,{beat}):undefined}/></p></div></li>)}</ol>:<p className={s.waiting}>整体故事线确定后，AI 会先铺好全部页面的情节节拍，再逐页写正文和编导说明。</p>}
      </section>
    </div>
    <div role="tabpanel" id={`${uid}-cast-panel`} aria-labelledby={`${uid}-cast-tab`} hidden={tab!=="cast"}>
      <section className={s.section}><h3>人物设定</h3><div className={s.characters}>{d.characters.map((c,i)=><article key={c.id}>{c.asset&&<img src={c.asset.src} alt={`${c.name}人物参考`}/>}<div><h4>{c.name||"主角"} <small>{c.role}</small></h4><dl>{([["name","称呼",40],["role","角色",100],["appearance","外形",1000],["personality","性格",500],["outfit","服装",500]] as const).filter(([key])=>edit||!["name","role"].includes(key)).map(([key,label,max])=><div className={s.characterField} key={key}><dt>{label}</dt><dd><Value value={c[key]} label={`人物${i+1}${label}`} max={max} onChange={edit?value=>patch({characters:edit.characters.map((v,n)=>n===i?{...v,[key]:value}:v)}):undefined}/></dd></div>)}</dl></div></article>)}</div></section>
      {direction?<><section className={s.section}><h3>全书美术与导演方案</h3><dl className={s.artBible}>{([["visualDirection","美术风格",1000],["palette","配色与光线",400],["cameraLanguage","镜头语言",600],["textLayout","文字留白",600],["coverConcept","封面构思",600]] as const).map(([key,label,max])=><div key={key}><dt>{label}</dt><dd><Value value={direction[key]} label={`编导${label}`} max={max} onChange={edit?value=>directionPatch({[key]:value}):undefined}/></dd></div>)}</dl></section><section className={s.section}><h3>连续性规则</h3><ul className={s.rules}>{direction.continuity.map((v,i)=><li key={i}><Value value={v} label={`连续性规则${i+1}`} max={400} onChange={edit?value=>directionPatch({continuity:direction.continuity.map((r,n)=>n===i?value:r)}):undefined}/></li>)}</ul></section></>:<p className={s.waiting}>人物外形、服装、道具和全书美术方案会在整理完成后显示。</p>}
    </div>
    <div role="tabpanel" id={`${uid}-pages-panel`} aria-labelledby={`${uid}-pages-tab`} hidden={tab!=="pages"}>
      <div className={s.pageTools}><span>每页正文、景别、动作、情绪与画面编排</span><label>{edit?"修改页面":"查看页段"}<select aria-label="编导分镜页段" value={start} onChange={e=>setBatch(Number(e.target.value))}>{Array.from({length:Math.ceil(d.pageCount/pageSize)},(_,i)=><option key={i} value={i*pageSize}>{edit?`第 ${i+1} 页`:`${i*8+1}–${Math.min(d.pageCount,i*8+8)} 页`}</option>)}</select></label></div>
      <div className={s.pages}>{pages.slice(start,start+pageSize).map(p=><article key={p.number} className={s.page}>
        <header><h3>第 {p.number} 页</h3><span>{p.image?"已配图":p.written?"编导已完成":["failed","retryable","paused"].includes(book.status)?"待生成":"正在编写"}</span></header>
        {(edit||p.beat)&&<p className={s.pageBeat}><Value value={p.beat} label={`分镜第${p.number}页故事节拍`} max={400} onChange={edit?beat=>pagePatch(p.number-1,{beat}):undefined}/></p>}
        <div className={s.pageBody}>{p.image&&<img src={p.image.src} alt={`第 ${p.number} 页插图`} loading="lazy"/>}<div><small>本页正文</small><p className={s.copy}><Value value={p.text} label={`第${p.number}页正文`} onChange={edit?text=>pagePatch(p.number-1,{text}):undefined}/></p><small>出场人物：{p.names.join("、")||"无人物"}</small>{edit&&<div className={s.castChecks}>{d.characters.map(c=><label key={c.id}><input type="checkbox" aria-label={`第${p.number}页出场人物${c.name}`} checked={p.characters.includes(c.id)} onChange={e=>pagePatch(p.number-1,{characters:e.target.checked?[...p.characters,c.id]:p.characters.filter(id=>id!==c.id)})}/>{c.name}</label>)}</div>}</div></div>
        {p.directing?<dl className={s.pageDirection}>{pageFields.map(([key,label,max])=>edit||p.directing?.[key]?<div key={key}><dt>{label}</dt><dd><Value value={p.directing?.[key]||""} label={`第${p.number}页${label}`} max={max} onChange={edit?value=>pagePatch(p.number-1,{directing:{...p.directing!,[key]:value}}):undefined}/></dd></div>:null)}</dl>:<p className={s.waiting}>{p.written?"此页未单独保存结构化编导，可展开下方查看场景和画面编排。":"本页编导尚未完成，继续制作后显示。"}</p>}
        <details className={s.prompt} open={edit?true:undefined}><summary>中文画面描述与画面编排</summary><strong>画面描述（中文）</strong><p><Value value={edit?edit.pages[p.number-1].scene:chineseProductionScene(p)||"旧版任务未保存中文描述，可点击修改编导补充。"} label={`第${p.number}页画面描述`} rows={4} onChange={edit?scene=>pagePatch(p.number-1,{scene}):undefined}/></p><strong>画面编排</strong><p><Value value={p.artDirection||""} label={`第${p.number}页画面编排`} max={1800} onChange={edit?artDirection=>pagePatch(p.number-1,{artDirection}):undefined}/></p></details>
      </article>)}</div>
    </div>
    </fieldset>
    <details className={s.source}><summary>本次原始参数与参考照片</summary><p>{(book.source||d).story}</p><dl><dt>领域 / 场景</dt><dd>{{habits:"好习惯",memories:"真实经历",learning:"认知启蒙"}[(book.source||d).brief?.domain||"habits"]} · {(book.source||d).brief?.scenario||"AI 推荐"}</dd></dl>{book.source?.characters[0].asset&&<img src={book.source.characters[0].asset.src} alt="本次上传的原始参考照片"/>}</details>
  </section>;
}
