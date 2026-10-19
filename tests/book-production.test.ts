import { afterEach,expect,it,vi } from "vitest";
import { createWorkbenchDraft,setWorkbenchPageCount } from "@/lib/custom-workbench";
import { localDraftSchema } from "@/lib/local/schema";
import { customDraftSchema } from "@/lib/custom-book/schema";
import { bookProductionText,productionPages,chineseProductionScene,productionEdits,applyProductionEdits } from "@/lib/book-production";
import { generateCustomOutline,generateCustomOutlinePlan,imagePrompt } from "@/lib/custom-book/provider";
import fixture from "./fixtures/book-direction.json";
vi.mock("@/lib/custom-book/text-endpoint",()=>({getStoryTextEndpoint:()=>({baseUrl:"https://text.example/v1",apiKey:"test"})}));
afterEach(()=>vi.unstubAllGlobals());
function draft(){const d=setWorkbenchPageCount(createWorkbenchDraft(false),2);d.title="小禾的小沙堡";d.characters[0].name="小禾";d.direction=structuredClone(fixture.direction);d.pages[0].directing=structuredClone(fixture.pageDirection);return d;}
it("preserves the full treatment and per-page directing through local save and reload",()=>{
  const d=draft();const parsed=localDraftSchema.parse(JSON.parse(JSON.stringify(d)));
  expect(parsed.direction).toEqual(d.direction);expect(parsed.pages[0].directing).toEqual(d.pages[0].directing);
  expect(customDraftSchema.parse(d).direction).toEqual(d.direction);
});
it("exports the full storyline, cast, art bible and every page including pending long-book pages",()=>{
  const d=setWorkbenchPageCount(draft(),200);d.pages[0].text="小禾轻轻压实湿沙。";d.pages[0].scene="A child pressing damp sand.";
  const book={result:d,source:{...d,story:"用户填写的原始经历"},status:"outline",outlinePlan:Array.from({length:200},(_,i)=>`第 ${i+1} 个节拍`)};
  const text=bookProductionText(book);
  for(const value of [fixture.direction.synopsis,fixture.direction.coverConcept,fixture.pageDirection.shot,fixture.pageDirection.composition,"用户填写的原始经历","第 200 页","第 200 个节拍"])expect(text).toContain(value);
  expect(productionPages(book)).toHaveLength(200);expect(productionPages(book)[1].written).toBe(false);
});
it("feeds the approved storyline into both whole-book planning and detailed page direction",async()=>{
  const d=draft();const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>{const payload=JSON.parse(init!.body as string),data=JSON.parse(payload.messages[1].content);expect(data.productionBible).toEqual(d.direction);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(fetcher.mock.calls.length===1?{beats:fixture.beats.slice(0,2)}:{pages:Array.from({length:2},()=>({text:"小禾换成湿沙再试。",scene:"Child pressing damp sand.",characters:["hero"],directing:fixture.pageDirection,artDirection:"上方沙面留白，两行排字。"}))})}}]}));});
  vi.stubGlobal("fetch",fetcher);const plan=await generateCustomOutlinePlan(customDraftSchema.parse(d));const result=await generateCustomOutline(customDraftSchema.parse(d),{start:0,count:2,plan});
  expect(result.pages[1].directing).toEqual(fixture.pageDirection);
  const prompt=imagePrompt(result,{kind:"page",index:1,spread:false});expect(prompt).toContain(fixture.direction.palette);expect(prompt).toContain(fixture.pageDirection.composition);
});
it("rejects a new directed book's incomplete page instructions before spending on images",async()=>{
  const d=draft();vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({pages:Array.from({length:2},()=>({text:"小禾继续尝试。",scene:"Child in sandpit.",characters:["hero"]}))})}}]}))));
  await expect(generateCustomOutline(customDraftSchema.parse(d))).rejects.toThrow("逐页编导说明不完整");
});
it("keeps legacy jobs readable without pretending a missing treatment was generated",()=>{
  const d=draft();delete d.direction;delete d.pages[0].directing;d.pages[0].text="原来的正文";
  const text=bookProductionText({result:d,status:"complete"});expect(text).toContain("尚未保存编导总案");expect(text).toContain("原来的正文");
});

it("shows old English scenes through Chinese directing notes and exports an editable Chinese version",()=>{
  const d=draft();d.pages[0].scene="A child in a bright sandpit.";
  const book={result:d,status:"paused",outlinePlan:fixture.beats.slice(0,2)};
  expect(chineseProductionScene(d.pages[0])).toContain(fixture.pageDirection.composition);
  const edit=productionEdits(book);expect(edit.pages[0].scene).not.toContain("A child");edit.pages[0].scene="小禾站在沙池旁，拿着蓝色小桶。";edit.pages[0].text="小禾看了看小桶。";
  const changed=applyProductionEdits(d,edit);expect(changed.pages[0].scene).toBe(edit.pages[0].scene);
  expect(bookProductionText({...book,result:changed})).not.toContain("A child in a bright sandpit.");
  expect(bookProductionText({...book,result:changed})).toContain(edit.pages[0].scene);expect(d.pages[0].scene).toBe("A child in a bright sandpit.");
});
