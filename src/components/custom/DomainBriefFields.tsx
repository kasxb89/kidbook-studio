"use client";
import { createBookBrief, selectBookDomain, missingLearningTargets, type BookBrief } from "@/lib/book-domain";
import type { CustomWorkbenchDraft } from "@/lib/custom-workbench";
import s from "./CustomWorkbench.module.css";
import ScenarioSelect from "./ScenarioSelect";
export default function DomainBriefFields({draft,onChange}:{draft:CustomWorkbenchDraft;onChange:(brief:BookBrief)=>void}){
  const brief=draft.brief||createBookBrief();
  const patch=(value:Partial<BookBrief>)=>onChange({...brief,...value,...(brief.domain==="memories"&&!Object.prototype.hasOwnProperty.call(value,"factsConfirmed")?{factsConfirmed:false}:{})});
  const field=(label:string,key:"habitGoal"|"trigger"|"parentResponse"|"eventPlace"|"facts"|"childQuote"|"allowedImagination"|"targets"|"interaction",placeholder:string)=>(
    <label className={s.field} key={key}>{label}<textarea aria-label={label} value={brief[key]} maxLength={key==="facts"?10000:2000} placeholder={placeholder} onChange={e=>patch({[key]:e.target.value})}/></label>
  );
  const missing=missingLearningTargets(brief,draft.pages.slice(0,draft.pageCount).map(p=>p.text));
  return <section aria-label="绘本领域与创作目标" className={s.note}>
    <label className={s.field}>创作领域<select aria-label="创作领域" value={brief.domain} onChange={e=>onChange(selectBookDomain(brief,e.target.value as BookBrief["domain"]))}>
      <option value="habits">好习惯与成长</option><option value="memories">真实经历改编</option><option value="learning">认知启蒙：识图 / 识物 / 识字</option>
    </select></label>
    <label className={s.field}>分场景（20 个常用场景）<ScenarioSelect brief={brief} onChange={onChange}/></label>
    {brief.domain==="habits"&&<>
      {field("本书练习的一个行为","habitGoal","例如：找不到玩偶时，主动说“妈妈，请帮帮我”。")}
      {field("具体情境与孩子的反应","trigger","事情在什么时候发生？孩子当时怎么做、怎么说？")}
      {field("家长如何陪伴 / 练习的小步骤","parentResponse","例如：先接纳难过，再一起回想、寻找。")}
      <p>一次只练一个能力，故事保留孩子真实的情绪。</p>
    </>}
    {brief.domain==="memories"&&<>
      {field("时间、地点与人物","eventPlace","例如：周日下午，公园沙池，若汐和妈妈。")}
      {field("真实经过（按顺序）","facts","干沙搭不起来；妈妈提示试试湿沙；孩子重新尝试，搭成沙堡。")}
      {field("孩子的原话","childQuote","只填写确实说过的话，可留空。")}
      {field("允许的艺术加工","allowedImagination","例如：只丰富画面气氛，不增加新人物、不改变结果。留空即不增加想象事件。")}
      <label className={s.check}><input type="checkbox" checked={brief.factsConfirmed} onChange={e=>patch({factsConfirmed:e.target.checked})}/>我已确认上述事实和允许加工范围。修改经过后需要重新确认。</label>
    </>}
    {brief.domain==="learning"&&<>
      <label className={s.field}>启蒙类型<select aria-label="启蒙类型" value={brief.learningKind} onChange={e=>patch({learningKind:e.target.value as BookBrief["learningKind"]})}><option value="pictures">识图：观察、表情与顺序</option><option value="objects">识物：名称、用途与概念</option><option value="characters">识字：图物字对应</option></select></label>
      {field("认知目标（用顿号或换行分隔）","targets","例如：水桶、铲子、干沙、湿沙；识字可填：水、沙、手。")}
      {field("亲子互动与复现要求","interaction","例如：找一找水桶在哪里；一起说说干沙和湿沙有什么不同。")}
      {brief.learningKind==="characters"&&<label className={s.check}><input type="checkbox" checked={brief.pinyin} onChange={e=>patch({pinyin:e.target.checked})}/>正文需要拼音（生成后人工校对）</label>}
      <p>{missing.length?`当前正文尚未覆盖：${missing.join("、")}`:"当前正文已包含填写的目标词；图物对应仍需逐页检查。"}</p>
    </>}
  </section>;
}
