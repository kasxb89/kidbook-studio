"use client";
import { Image as ImageIcon } from "@phosphor-icons/react/dist/csr/Image";
import type { CustomWorkbenchDraft } from "@/lib/custom-workbench";
import VisualStylePicker from "./VisualStylePicker";
import s from "./ManualBookSetup.module.css";
export default function ManualBookSetup({draft,onChange,onUpload,onAutomatic,disabled}:{draft:CustomWorkbenchDraft;onChange:(draft:CustomWorkbenchDraft)=>void;onUpload:(file:File)=>void;onAutomatic:()=>void;disabled:boolean}) {
  return <section className={s.setup} aria-label="手动创作设定"><header><span>手动制作</span><h2>人物与画风</h2><p>在这里逐项调整当前项目；下方可编辑人物细节、故事和分镜。</p></header>
    <fieldset disabled={disabled}><div className={s.photoRow}>{draft.characters[0]?.asset&&<img src={draft.characters[0].asset.src} alt="手动项目人物照片"/>}<label>人物照片<span><ImageIcon size={17} aria-hidden="true"/>{draft.characters[0]?.asset?"更换人物照片":"选择人物照片"}</span><input aria-label="孩子参考照片" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)onUpload(file);e.target.value="";}}/></label></div><VisualStylePicker draft={draft} onChange={patch=>onChange({...draft,...patch})}/></fieldset>
    <div className={s.automatic}><strong>只填参数，自动做完整本</strong><p>“AI 一键成书”有独立的参数和照片，自动完成设定、分镜和配图，保存为新项目。</p><button onClick={onAutomatic}>前往 AI 一键成书 →</button></div>
  </section>;
}
