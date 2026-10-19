import { spreadStart,type CustomWorkbenchDraft } from "./custom-workbench";
import { z } from "zod";
import { MAX_BOOK_PAGES } from "./book-config";
import { bookDirectionSchema,pageDirectionSchema } from "./custom-book/direction";
export const productionEditSchema=z.object({
  title:z.string().trim().min(1).max(100),theme:z.string().trim().min(1).max(300),
  direction:bookDirectionSchema.optional(),
  characters:z.array(z.object({id:z.string().min(1).max(80),name:z.string().trim().min(1).max(40),role:z.string().max(100),appearance:z.string().max(1000),personality:z.string().max(500),outfit:z.string().max(500)})).min(1).max(6),
  pages:z.array(z.object({text:z.string().max(2500),scene:z.string().max(2500),artDirection:z.string().max(1800).optional(),directing:pageDirectionSchema.optional(),characters:z.array(z.string().max(80)).max(6),beat:z.string().max(400)})).min(1).max(MAX_BOOK_PAGES),
});
export type ProductionEdit=z.infer<typeof productionEditSchema>;
export type ProductionBook={result:CustomWorkbenchDraft;source?:CustomWorkbenchDraft;outlinePlan?:string[];outlineCursor?:number;status:string};
// Older jobs stored English scene prompts. Their saved Chinese directing notes
// provide the operator view without translating through a paid model call.
export function chineseProductionScene(page:CustomWorkbenchDraft["pages"][number]) {
  if(!page.scene.trim()||/[\u3400-\u9fff]/.test(page.scene))return page.scene;
  const p=page.directing;
  return p?[p.shot,p.action,p.emotion,p.composition,p.textPlacement,p.continuity].filter(Boolean).join("\n"):page.artDirection&&/[\u3400-\u9fff]/.test(page.artDirection)?page.artDirection:"";
}
export function productionEdits(book:ProductionBook):ProductionEdit {
  const d=book.result;
  return {title:d.title,theme:d.theme,direction:d.direction?structuredClone(d.direction):undefined,characters:d.characters.map(({id,name,role,appearance,personality,outfit})=>({id,name,role,appearance,personality,outfit})),pages:d.pages.slice(0,d.pageCount).map((p,i)=>({text:p.text,scene:chineseProductionScene(p),artDirection:p.artDirection,directing:p.directing?structuredClone(p.directing):undefined,characters:[...p.characters],beat:book.outlinePlan?.[i]||p.directing?.beat||""}))};
}
export function applyProductionEdits(draft:CustomWorkbenchDraft,edit:ProductionEdit):CustomWorkbenchDraft {
  if(edit.pages.length!==draft.pageCount||edit.characters.length!==draft.characters.length||edit.characters.some((c,i)=>c.id!==draft.characters[i].id))throw new Error("编导页数或人物已变化，请重新载入后修改。");
  const ids=new Set(draft.characters.map(c=>c.id));
  if(edit.pages.some(p=>p.characters.some(id=>!ids.has(id))))throw new Error("分镜引用了不存在的人物。");
  return {...draft,title:edit.title,theme:edit.theme,direction:edit.direction,characters:draft.characters.map((c,i)=>({...c,...edit.characters[i]})),pages:draft.pages.map((p,i)=>{const e=edit.pages[i];if(!e)return p;return {...p,text:e.text,scene:e.scene||p.scene,artDirection:e.artDirection,directing:e.directing?{...e.directing,beat:e.beat||e.directing.beat}:undefined,characters:e.characters};})};
}
export function productionPages(book:ProductionBook) {
  const d=book.result;
  return d.pages.slice(0,d.pageCount).map((page,index)=>({
    ...page,number:index+1,beat:book.outlinePlan?.[index]||page.directing?.beat||"",
    names:page.characters.map(id=>d.characters.find(c=>c.id===id)?.name||id),
    image:d.pages[(spreadStart(d,index+1)||index+1)-1]?.asset,
    written:!!(page.text.trim()&&page.scene.trim()),
  }));
}
export function bookProductionText(book:ProductionBook) {
  const d=book.result,direction=d.direction;
  const lines=[`${d.title||"未命名绘本"} · 编导稿`,`${d.age} · ${d.pageCount} 页正文 · ${book.status==="complete"?"制作完成":"生成中 / 已保存的阶段内容"}`,"",
    "【原始输入】",book.source?.story||d.story,"","【整体故事线】"];
  if(direction)lines.push("一句话主线："+direction.logline,"完整梗概："+direction.synopsis,...direction.arc.map(a=>`${a.title}：${a.content}`));
  else lines.push("本任务尚未保存编导总案。已保存的故事节拍和分镜见下文。");
  lines.push("","【人物设定】");
  for(const c of d.characters)lines.push(`${c.name} · ${c.role}`,`外形：${c.appearance||"未填写"}`,`性格：${c.personality||"未填写"}`,`服装：${c.outfit||"未填写"}`,"");
  if(direction)lines.push("【美术与导演方案】",`美术：${direction.visualDirection}`,`配色与光线：${direction.palette}`,`镜头语言：${direction.cameraLanguage}`,`文字留白：${direction.textLayout}`,`封面构思：${direction.coverConcept}`,"连续性规则：",...direction.continuity.map((v,i)=>`${i+1}. ${v}`),"");
  lines.push("【逐页故事与分镜】");
  for(const p of productionPages(book)) {
    lines.push(`第 ${p.number} 页`, `故事节拍：${p.beat||"待生成"}`,`出场人物：${p.names.join("、")||"无"}`,`正文：${p.text||"待生成"}`);
    if(p.directing)lines.push(`景别与视角：${p.directing.shot}`,`动作：${p.directing.action}`,`情绪：${p.directing.emotion}`,`构图：${p.directing.composition}`,`文字位置：${p.directing.textPlacement}`,`连续性：${p.directing.continuity}`,...(p.directing.learningFocus?[`认知 / 练习目标：${p.directing.learningFocus}`]:[]));
    lines.push(`画面编排：${p.artDirection||"待生成"}`,`中文画面描述：${chineseProductionScene(p)||"旧版任务未保存中文描述，可在编导工作台补充。"}`,`插图：${p.image?"已生成":"待生成"}`,"");
  }
  return lines.join("\n");
}
