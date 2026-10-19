import { afterAll,beforeAll,expect,it,vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { zipSync,strToU8 } from "fflate";
import { createWorkbenchDraft,makeAsset,setWorkbenchPageCount } from "@/lib/custom-workbench";
import { createProject,getProject,saveProject,saveAsset,database,getProjectBookFolder,saveProjectBookOutputs } from "@/lib/local/store";
import { savePrintOutputs } from "@/lib/local/print-output";
import { defaultPrintSettings } from "@/lib/custom-book/print-settings";
import { POST as savePreview } from "@/app/api/local/projects/[id]/preview/route";
let root:string;
beforeAll(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"kidbook-folders-"));vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",root);});
afterAll(()=>{database().close();fs.rmSync(root,{recursive:true,force:true});vi.unstubAllEnvs();});
function project(title="一本绘本") {
  const d=setWorkbenchPageCount(createWorkbenchDraft(false),1);d.title=title;d.characters[0].name="小禾";d.pages[0].text="小禾观察沙子。";
  const stored=saveAsset(new Uint8Array([255,216,255,0,1,2,3]),"test image");d.pages[0].asset={...makeAsset(stored.src,"本页插图","page"),storagePath:stored.storagePath};
  return createProject(d);
}
it("automatically organizes manuscript, project and named images after save without modifying the source project",async()=>{
  const p=project();await new Promise<void>(resolve=>queueMicrotask(resolve));
  const directory=path.join(root,"绘本",p.draft.title);
  expect(fs.readFileSync(path.join(directory,"编导稿.txt"),"utf8")).toContain("小禾观察沙子。");
  expect([...fs.readFileSync(path.join(directory,"图片","第001页.jpg"))]).toEqual([255,216,255,0,1,2,3]);
  expect(JSON.parse(fs.readFileSync(path.join(directory,"项目配置.json"),"utf8")).id).toBe(p.id);expect(getProject(p.id)).toEqual(p);
});
it("separates identical titles and renames a book folder with all existing exports intact",()=>{
  const a=project("相同书名"),b=project("相同书名"),af=getProjectBookFolder(a.id),bf=getProjectBookFolder(b.id);expect(af.directory).not.toBe(bf.directory);
  saveProjectBookOutputs(a.id,a.draft,{"成品PDF/成品.pdf":strToU8("%PDF-old")});
  saveProject(a.id,{...a.draft,title:"新的书名"},a.revision);const renamed=getProjectBookFolder(a.id);
  expect(path.basename(renamed.directory)).toBe("新的书名");expect(fs.existsSync(af.directory)).toBe(false);expect(fs.readFileSync(path.join(renamed.pdfs,"成品.pdf"),"utf8")).toBe("%PDF-old");expect(renamed.pdfOutdated).toBe(true);expect(fs.existsSync(bf.directory)).toBe(true);
});
it("keeps previous image and PDF versions when a book changes",()=>{
  const p=project("保留版本"),old=getProjectBookFolder(p.id);saveProjectBookOutputs(p.id,p.draft,{"成品PDF/成品.pdf":strToU8("%PDF-first")});
  const file=saveAsset(new Uint8Array([255,216,255,9,8,7]),"second image"),d=structuredClone(p.draft);d.pages[0].text="小禾换成湿沙。";d.pages[0].asset={...d.pages[0].asset!,id:file.id,storagePath:file.storagePath,src:file.src};saveProject(p.id,d,p.revision);
  const next=getProjectBookFolder(p.id);expect(next.directory).toBe(old.directory);expect(next.pdfOutdated).toBe(true);expect(fs.readdirSync(path.join(next.images,"历史版本")).some(name=>name.startsWith("第001页_"))).toBe(true);
  saveProjectBookOutputs(p.id,d,{"成品PDF/成品.pdf":strToU8("%PDF-second")});const final=getProjectBookFolder(p.id);expect(final.pdfOutdated).toBe(false);expect(fs.readdirSync(path.join(final.pdfs,"历史版本"))).toHaveLength(1);expect(fs.readFileSync(final.manuscript,"utf8")).toContain("小禾换成湿沙。");
});
it("sanitizes titles and avoids merging into unrelated folders",()=>{
  fs.mkdirSync(path.join(root,"绘本","已有文件夹"),{recursive:true});fs.writeFileSync(path.join(root,"绘本","已有文件夹","客户文件.txt"),"keep me");
  const a=project("已有文件夹"),af=getProjectBookFolder(a.id);expect(path.basename(af.directory)).not.toBe("已有文件夹");expect(fs.readFileSync(path.join(root,"绘本","已有文件夹","客户文件.txt"),"utf8")).toBe("keep me");
  const b=project("../../路径/测试"),bf=getProjectBookFolder(b.id);expect(path.dirname(bf.directory)).toBe(path.join(root,"绘本"));
  expect(()=>saveProjectBookOutputs(b.id,b.draft,{"成品PDF/../../outside.pdf":strToU8("bad")})).toThrow("超出");
});
it("archives print PDFs, split files and the delivery ZIP inside the correct book",async()=>{
  const p=project("印刷归档"),doc=await PDFDocument.create();doc.addPage();const pdf=await doc.save(),parts={"01_整本_A4.pdf":pdf,"02_内页_A4.pdf":pdf,"03_封面四面_A4.pdf":pdf,"制作说明.txt":strToU8("制作说明")};
  const location=savePrintOutputs(p.id,p.draft,{pdf,zip:zipSync(parts),report:{settings:defaultPrintSettings()} as never},true);
  expect(location.pdfCount).toBe(3);expect(fs.readdirSync(path.join(location.directory,"交付包"))).toHaveLength(1);expect(fs.existsSync(path.join(location.pdfs,"A4_印厂版_左侧装订","02_内页_A4.pdf"))).toBe(true);
});
it("validates and archives preview PDFs and rejects invalid bytes, page counts and stale revisions",async()=>{
  const p=project("阅读归档");const doc=await PDFDocument.create();doc.addPage();doc.addPage();const bytes=await doc.save();
  const request=(body:Uint8Array,revision=p.revision)=>new Request(`http://127.0.0.1:3100/api/local/projects/${p.id}/preview`,{method:"POST",headers:{"Content-Type":"application/pdf","X-Project-Revision":String(revision)},body:new Uint8Array(body)});
  const context={params:Promise.resolve({id:p.id})};expect((await savePreview(request(strToU8("bad")),context)).status).toBe(400);
  const valid=await savePreview(request(bytes),context);expect(valid.status).toBe(200);expect((await valid.json()).pdfCount).toBe(1);
  saveProject(p.id,{...p.draft,title:"改名后的书"},p.revision);expect((await savePreview(request(bytes),context)).status).toBe(409);
  const wrong=await PDFDocument.create();wrong.addPage();expect((await savePreview(request(await wrong.save(),p.revision+1),context)).status).toBe(400);
});
