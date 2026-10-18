"use client";
import { DOMAIN_SCENARIOS,LEARNING_SCENARIO_GROUPS,selectBookScenario,type BookBrief } from "@/lib/book-domain";

export default function ScenarioSelect({brief,onChange,label="分场景"}:{brief:BookBrief;onChange:(brief:BookBrief)=>void;label?:string}) {
  const choices=DOMAIN_SCENARIOS[brief.domain];
  const custom=!!brief.scenario&&!choices.includes(brief.scenario);
  return <select aria-label={label} value={brief.scenario} onChange={e=>onChange(selectBookScenario(brief,e.target.value))}>
    <option value="">让 AI 根据故事推荐</option>
    {custom&&<option value={brief.scenario}>{brief.scenario}（当前设定）</option>}
    {brief.domain==="learning"?LEARNING_SCENARIO_GROUPS.map(group=><optgroup key={group.kind} label={group.label}>{group.scenarios.map(value=><option key={value} value={value}>{value}</option>)}</optgroup>):choices.map(value=><option key={value} value={value}>{value}</option>)}
  </select>;
}
