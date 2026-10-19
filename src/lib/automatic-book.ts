import { createWorkbenchDraft, setWorkbenchPageCount, type CustomWorkbenchDraft } from "./custom-workbench";

// One-click creation starts a fresh book; finished pages from another project are never reused.
export function automaticBookDraft(source:CustomWorkbenchDraft):CustomWorkbenchDraft {
  const fresh=setWorkbenchPageCount(createWorkbenchDraft(false),source.pageCount);
  const hero={...fresh.characters[0],name:source.characters[0].name,asset:source.characters[0].asset};
  return {...fresh,characters:[hero],story:source.story,age:source.age,language:source.language,
    brief:source.brief&&{...source.brief,facts:source.brief.domain==="memories"?source.story:source.brief.facts},
    visualStyle:source.visualStyle,style:source.style,format:source.format,
    studio:{activePanel:"ai"},
  };
}
export function recoverAutomaticBook(current:CustomWorkbenchDraft,result:CustomWorkbenchDraft,id:string):CustomWorkbenchDraft {
  if(current.studio?.completedAutomaticJob===id)return current;
  return {...result,localJobId:id,studio:{...result.studio,...current.studio,completedAutomaticJob:id}};
}
