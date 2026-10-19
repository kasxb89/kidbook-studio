"use client";
import { BOOK_FONTS, type BookFont, type BookTypography } from "@/lib/custom-book/typography";
import s from "./BookTextSettings.module.css";
import { normalizeTextPlacement, type TextPlacement } from "@/lib/custom-book/text-position";

export default function BookTextSettings({ typography, backing, disabled, onChange, onApplyAll, placement }: {
  typography: BookTypography;
  backing: boolean;
  disabled?: boolean;
  onChange: (patch: Partial<BookTypography>) => void;
  onApplyAll: () => void;
  placement?:TextPlacement;
}) {
  const mode = !backing ? "none" : typography.backingStyle || "soft";
  const current=placement||typography.textBox||{x:6,y:80,width:88};
  return <section className={s.settings} aria-label="文字样式">
    <header><strong>文字样式</strong><span>改完立即预览</span></header>
    <fieldset className={s.fields} disabled={disabled}>
      <div className={s.row}>
        <label>字体<select aria-label="本页字体" value={typography.fontFamily || "sans"} onChange={e=>onChange({fontFamily:e.target.value as BookFont})}>
          {Object.entries(BOOK_FONTS).map(([key,font])=><option key={key} value={key}>{font.label}</option>)}
        </select></label>
        <label>字号<input aria-label="本页字号" type="number" min={18} max={60} value={typography.size} onChange={e=>{const value=e.currentTarget.valueAsNumber;if(Number.isFinite(value)&&value>=18&&value<=60)onChange({size:value});}}/></label>
      </div>
      <div className={s.colourRow}><label>文字颜色<input type="color" aria-label="本页文字颜色" value={typography.color} onChange={e=>onChange({color:e.target.value})}/></label>
        <div className={s.swatches} role="group" aria-label="常用文字颜色">
          {[["#202722","黑色"],["#343b32","深绿"],["#624536","棕色"],["#ffffff","白色"]].map(([colour,label])=><button key={colour} aria-label={`文字${label}`} aria-pressed={typography.color.toLowerCase()===colour} style={{background:colour}} onClick={()=>onChange({color:colour})}/>)}</div>
      </div>
      <div className={s.backing}><span>文字底色</span><div className={s.segmented} role="group" aria-label="文字底色方式">
        {[["none","无底色"],["soft","柔和"],["solid","实色"]].map(([key,label])=><button key={key} aria-pressed={mode===key} onClick={()=>onChange(key==="none"?{backing:false}:{backing:true,backingStyle:key as "soft"|"solid"})}>{label}</button>)}
      </div></div>
      {backing&&<div className={s.backingOptions}>
        <label>底色<input type="color" aria-label="本页文字底色" value={typography.backingColor || "#fffcf3"} onChange={e=>onChange({backingColor:e.target.value})}/></label>
        <label>不透明度 <output>{Math.round((typography.backingOpacity??.92)*100)}%</output><input aria-label="文字底色不透明度" type="range" min={0} max={100} value={Math.round((typography.backingOpacity??.92)*100)} onChange={e=>onChange({backingOpacity:Number(e.target.value)/100})}/></label>
        <div className={s.swatches} role="group" aria-label="常用文字底色">{[["#fffcf3","米白"],["#e5efdf","浅绿"],["#f9e4de","浅粉"]].map(([colour,label])=><button key={colour} aria-label={`底色${label}`} aria-pressed={(typography.backingColor||"#fffcf3")===colour} style={{background:colour}} onClick={()=>onChange({backingColor:colour})}/>)}</div>
      </div>}
      <div className={s.row}>
        <label>文字位置<select aria-label="本页文字位置" value={typography.textBox?"custom":typography.position} onChange={e=>onChange({position:e.target.value as BookTypography["position"],textBox:null})}><option value="top">上方</option><option value="middle">居中</option><option value="bottom">下方</option>{typography.textBox&&<option value="custom" disabled>自由位置</option>}</select></label>
        <label>对齐<select aria-label="本页文字对齐" value={typography.align} onChange={e=>onChange({align:e.target.value as BookTypography["align"]})}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
      </div>
      <p className={s.positionHint}>在画布上拖动文字框，或选中文字框后用方向键微调。</p>
      <details className={s.more}><summary>精细调整位置与宽度</summary>
        {([["x","左右位置",4,96-current.width],["y","上下位置",4,96],["width","文字框宽度",20,92]] as const).map(([key,label,min,max])=><label key={key}>{label} <output>{Math.round(current[key])}%</output><input type="range" aria-label={label} min={min} max={max} value={current[key]} onChange={e=>onChange({textBox:normalizeTextPlacement({...current,[key]:Number(e.target.value)})})}/></label>)}
        <button onClick={()=>onChange({textBox:null,position:"bottom"})}>重置文字位置</button>
      </details>
      <details className={s.more}><summary>行距与书页底色</summary>
        <label>行距 <output>{(typography.lineHeight??1.55).toFixed(2)}</output><input aria-label="本页行距" type="range" min={1.2} max={2} step={.05} value={typography.lineHeight??1.55} onChange={e=>onChange({lineHeight:Number(e.target.value)})}/></label>
        <label>书页底色<input aria-label="本页书页底色" type="color" value={typography.background} onChange={e=>onChange({background:e.target.value})}/></label>
      </details>
      <button className={s.apply} onClick={onApplyAll}>应用到整本（含封面）</button>
    </fieldset>
  </section>;
}
