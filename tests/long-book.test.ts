import {it,expect} from "vitest";
import {createWorkbenchDraft,setWorkbenchPageCount,makeAsset} from "@/lib/custom-workbench";
import {localDraftSchema} from "@/lib/local/schema";
import {recordStudioChanges} from "@/lib/book-studio";
import {bookOpenings,openingForPage} from "@/lib/custom-book/reader";
it("saves page 200 with version history and keeps hidden pages when shortened",()=>{
  let d=setWorkbenchPageCount(createWorkbenchDraft(false),200);d.characters[0].name="若汐";
  d.pages[199].text="第二百页仍在。";
  d.studio={selectedPage:200,workspace:"edit",pages:{"200":{typography:{size:34}}}};
  const a=makeAsset("/sample-books/integrated-garden/cover.jpg","验收","page");a.origin="sample";
  const withImage=recordStudioChanges(d,{...d,pages:d.pages.map((p,i)=>i===199?{...p,asset:a}:p)});
  expect(localDraftSchema.parse(withImage).studio?.pages?.["200"].versions).toHaveLength(1);
  const short=setWorkbenchPageCount(withImage,1);expect(short.studio?.selectedPage).toBe(1);
  const restored=setWorkbenchPageCount(short,200);expect(restored.pages[199].text).toBe(d.pages[199].text);expect(restored.studio?.pages?.["200"].versions).toHaveLength(1);
});
it("keeps old twelve-slot drafts valid and rejects missing active page storage",()=>{
  const old=createWorkbenchDraft(false);expect(localDraftSchema.parse(old).pages).toHaveLength(12);
  expect(()=>localDraftSchema.parse({...old,pageCount:30})).toThrow();
  expect(bookOpenings(200)).toContain(100);expect(openingForPage(101)).toBe(100);expect(bookOpenings(200).at(-1)).toBe(200);
});
