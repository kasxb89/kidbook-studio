"use client";
import type { CustomWorkbenchDraft } from "@/lib/custom-workbench";
import { visualStyleFor } from "@/lib/custom-book/visual-style";
import s from "./VisualStylePicker.module.css";

export default function VisualStylePicker({draft,onChange,newBook=false}:{draft:CustomWorkbenchDraft;onChange:(value:Partial<CustomWorkbenchDraft>)=>void;newBook?:boolean}) {
  const value=visualStyleFor(draft);
  return <div className={s.picker}>
    <strong>生成风格</strong>
    <div className={s.choices} role="group" aria-label="整本生成风格">
      <button type="button" aria-pressed={value==="realistic"} onClick={()=>onChange({visualStyle:"realistic"})}><span className={s.photoIcon} aria-hidden="true">人</span><span><b>真人写实</b><small>真实五官，摄影质感</small></span><i aria-hidden="true">{value==="realistic"?"●":"○"}</i></button>
      <button type="button" aria-pressed={value==="anime"} onClick={()=>onChange({visualStyle:"anime"})}><span className={s.artIcon} aria-hidden="true">绘</span><span><b>动漫绘本</b><small>统一的动漫人物形象</small></span><i aria-hidden="true">{value==="anime"?"●":"○"}</i></button>
    </div>
    {value==="anime"&&<details className={s.variations}><summary>更多动漫画风</summary><div role="group" aria-label="动漫画风">{([['watercolor','水彩'],['cartoon','卡通'],['fairytale','童话']] as const).map(([style,label])=><button key={style} type="button" aria-pressed={draft.style===style} onClick={()=>onChange({style})}>{label}</button>)}</div></details>}
    <p>{value==="realistic"?"新生成的图片使用真人写实风格，建议提供清晰的人物照片。":"新生成的图片使用动漫风格，照片仅作为人物身份参考。"}{!newBook&&"已有图片保留。"}</p>
  </div>;
}
