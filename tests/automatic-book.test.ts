import { beforeAll,afterAll,beforeEach,it,expect,vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
vi.mock("@/lib/custom-book/text-endpoint",()=>({getStoryTextEndpoint:()=>({baseUrl:"https://test.invalid",apiKey:"test"})}));
vi.mock("@/lib/custom-book/prepare",async()=>{const fixture=(await import("./fixtures/book-direction.json")).default;return {prepareBookInput:vi.fn(async(d:import("@/lib/custom-workbench").CustomWorkbenchDraft)=>({...d,title:`${d.characters[0].name}的小沙堡`,direction:fixture.direction,brief:{...d.brief!,habitGoal:"换个办法再试",trigger:"干沙散开",facts:d.story,factsConfirmed:false,targets:d.brief?.targets||"苹果、香蕉"},studio:{...d.studio,aiPrepared:true}}))};});
vi.mock("@/lib/custom-book/provider",async()=>{const fixture=(await import("./fixtures/book-direction.json")).default;return {
  customImageConfig:()=>({model:"gpt-image-test"}),
  generateCustomOutline:vi.fn(async(d:import("@/lib/custom-book/schema").ServerDraft,range:{start:number;count:number})=>({...d,pages:d.pages.map((p,i)=>i>=range.start&&i<range.start+range.count?{...p,text:d.brief?.domain==="learning"?"小禾认识苹果和香蕉。":"小禾用湿沙搭好小沙堡。",scene:"Child builds a small sandcastle.",characters:[d.characters[0].id],directing:{...fixture.pageDirection,beat:`第 ${i+1} 页事件`}}:p)})),
  generateCustomOutlinePlan:vi.fn(async(d:{pageCount:number})=>Array.from({length:d.pageCount},(_,i)=>`第 ${i+1} 页事件`)),
  requestCustomImage:vi.fn(async()=>new Uint8Array([1,2,3])),imagePrompt:vi.fn(()=>"test"),imageSize:()=>"1024x1024",cropReference:async(b:Buffer)=>b,needsProcessing:()=>false,
};});
import { createWorkbenchDraft,makeAsset,setWorkbenchPageCount } from "@/lib/custom-workbench";
import { productionEdits } from "@/lib/book-production";
import { automaticBookDraft,recoverAutomaticBook } from "@/lib/automatic-book";
import { database,createProject,getProject,listProjects,saveAsset,saveProject } from "@/lib/local/store";
import { createAutomaticJob,advanceJob,getJob,updateJob,saveJobProduction } from "@/lib/local/jobs";
import { getAiInput,saveAiInput } from "@/lib/local/ai-input";
import { prepareBookInput } from "@/lib/custom-book/prepare";
import { generateCustomOutline,requestCustomImage,imagePrompt } from "@/lib/custom-book/provider";
let root:string;
beforeAll(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"kidbook-auto-"));vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",root);});
afterAll(()=>{database().close();fs.rmSync(root,{recursive:true,force:true});vi.unstubAllEnvs();});
beforeEach(()=>vi.clearAllMocks());
function input(pages=4){const d=setWorkbenchPageCount(createWorkbenchDraft(false),pages);d.characters[0].name="小禾";d.story="干沙散开后，小禾改用湿沙搭城堡。";const file=saveAsset(new Uint8Array([1,2,3]),"photo");d.characters[0].asset={...makeAsset(file.src,"照片","character"),...file};return d;}
it.each(["habits","memories","learning"] as const)("completes %s from raw parameters and photo without any manual confirmation stage",async domain=>{
  const d=input();d.brief={...d.brief!,domain,factsConfirmed:domain==="memories"};
  const old=createProject({...d,title:"原来的书"}),before=getProject(old.id),id=crypto.randomUUID();
  let job=createAutomaticJob(id,d);expect(job.projectId).not.toBe(old.id);expect(job.status).toBe("preparing");
  expect(createAutomaticJob(id,d).projectId).toBe(job.projectId);
  expect(()=>createAutomaticJob(id,{...d,story:"不同请求"})).toThrow("冲突");
  const states=[job.status];for(let n=0;job.status!=="complete"&&n<20;n++){job=await advanceJob(job.id);states.push(job.status);}
  expect(job.status).toBe("complete");expect(states).not.toContain("review");expect(states).not.toContain("retryable");
  expect(states).toContain("outline");expect(states).toContain("images");expect(prepareBookInput).toHaveBeenCalledTimes(1);
  expect(job.outlinePlan).toHaveLength(d.pageCount);expect(job.result.direction?.arc).toHaveLength(4);expect(job.source?.story).toBe(d.story);
  expect(job.result.pages.slice(0,d.pageCount).every(p=>p.directing?.shot)).toBe(true);
  expect(job.result.cover?.storagePath).toBeTruthy();expect(job.result.pages.slice(0,4).every(p=>p.asset?.storagePath)).toBe(true);
  expect(getJob(job.id).cursor).toBe(job.totalUnits);expect(getProject(old.id)).toEqual(before);
  if(domain==="memories"){expect(job.result.brief?.factsConfirmed).toBe(true);expect(job.result.brief?.facts).toBe(d.story);}
});
it("persists preparation failures and resumes the same new project",async()=>{
  const d=input();vi.mocked(prepareBookInput).mockRejectedValueOnce(new Error("temporary text outage"));
  const job=createAutomaticJob(crypto.randomUUID(),d),failed=await advanceJob(job.id);
  expect(failed.status).toBe("retryable");expect(failed.resumeStatus).toBe("preparing");expect(failed.result.story).toBe(d.story);
  const resumed=await advanceJob(job.id,true);expect(resumed.status).toBe("outline");expect(resumed.projectId).toBe(job.projectId);
});
it("resumes a failed image without repeating the cover or completed pages",async()=>{
  let job=createAutomaticJob(crypto.randomUUID(),input());for(let i=0;i<5&&job.status!=="images";i++)job=await advanceJob(job.id);
  job=await advanceJob(job.id);job=await advanceJob(job.id);const cover=job.result.cover?.storagePath,cursor=job.cursor;
  vi.mocked(requestCustomImage).mockRejectedValueOnce(new Error("temporary image outage"));
  job=await advanceJob(job.id);expect(job.status).toBe("retryable");expect(job.cursor).toBe(cursor);
  job=await advanceJob(job.id,true);expect(job.cursor).toBe(cursor+1);expect(job.result.cover?.storagePath).toBe(cover);
});
it("automatically advances long-book outline batches before image generation",async()=>{
  let job=createAutomaticJob(crypto.randomUUID(),input(18));job=await advanceJob(job.id);job=await advanceJob(job.id);
  job=await advanceJob(job.id);expect(job.outlineCursor).toBe(8);job=await advanceJob(job.id);expect(job.outlineCursor).toBe(16);
  job=await advanceJob(job.id);expect(job.status).toBe("images");expect(job.outlineCursor).toBe(18);
  expect(vi.mocked(generateCustomOutline).mock.calls.map(c=>c[1]?.start)).toEqual([0,8,16]);
});
it("requires real-source consent only at the initial automatic submission",()=>{
  const d=input();d.brief!.domain="memories";expect(()=>createAutomaticJob(crypto.randomUUID(),d)).toThrow("真实经过");
});
it("keeps independent AI parameters on disk with revision protection",()=>{
  const count=listProjects().length,initial=getAiInput(),d=input();const next=saveAiInput(d,initial.revision);
  expect(getAiInput()).toEqual(next);expect(listProjects()).toHaveLength(count);expect(()=>saveAiInput(d,initial.revision)).toThrow("另一窗口");
});
it("starts a fresh output draft without carrying previous story pages or artwork",()=>{
  const source=input();source.title="上一本";source.cover=source.characters[0].asset;source.pages[0].text="旧正文";source.pages[0].asset=source.characters[0].asset;
  const clean=automaticBookDraft(source);expect(clean.title).toBe("");expect(clean.cover).toBeUndefined();expect(clean.pages.every(p=>!p.text&&!p.asset)).toBe(true);expect(clean.characters[0].asset).toEqual(source.characters[0].asset);expect(clean.studio?.activePanel).toBe("ai");
});
it("recovers an already finished task once without erasing subsequent canvas edits",()=>{
  const current=input(),result={...current,title:"完成的书"},id=crypto.randomUUID();
  const restored=recoverAutomaticBook(current,result,id);expect(restored.title).toBe("完成的书");expect(restored.studio?.completedAutomaticJob).toBe(id);
  restored.title="校对后的标题";restored.typography.textBox={x:10,y:20,width:70};
  expect(recoverAutomaticBook(restored,result,id)).toBe(restored);
});
it("pauses after an in-flight image is saved, survives reload, and resumes with edited Chinese direction",async()=>{
  let job=createAutomaticJob(crypto.randomUUID(),input());while(job.status!=="images")job=await advanceJob(job.id);
  job=await advanceJob(job.id); // Reuse the uploaded character reference before testing the cover request.
  let release!:(value:Uint8Array)=>void;
  vi.mocked(requestCustomImage).mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const flight=advanceJob(job.id);await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
  const requested=updateJob(job.id,{action:"pause"});expect(requested.pauseRequested).toBe(true);expect(requested.leaseUntil).toBeTruthy();
  release(new Uint8Array([1,2,3]));job=await flight;
  expect(job.status).toBe("paused");expect(job.cursor).toBe(2);expect(job.result.characters[0].asset).toBeTruthy();
  expect((await advanceJob(job.id)).status).toBe("paused");expect(requestCustomImage).toHaveBeenCalledTimes(1);
  const p=getProject(job.projectId);saveProject(p.id,{...job.result,localJobId:job.id},p.revision);
  const edit=productionEdits(job);edit.direction!.synopsis="小禾观察沙子的干湿，再换个办法搭好沙堡。";edit.pages[0].scene="小禾在沙池中轻压湿沙，左侧柔光，顶部留白。";edit.pages[0].text="小禾轻轻压实湿沙。";edit.pages[0].beat="观察并压实湿沙。";
  const saved=saveJobProduction(job.id,edit,job.updatedAt,getProject(p.id).revision);
  expect(saved.job.status).toBe("paused");expect(saved.project.draft.pages[0].text).toBe(edit.pages[0].text);expect(getJob(job.id).outlinePlan![0]).toBe(edit.pages[0].beat);
  const next=await advanceJob(job.id,true);expect(next.cursor).toBe(3);expect(vi.mocked(imagePrompt).mock.lastCall?.[0].pages[0].scene).toBe(edit.pages[0].scene);expect(next.result.characters[0].asset).toEqual(job.result.characters[0].asset);
});
it("saves edits to a completed book atomically while retaining canvas typography, artwork and versions",async()=>{
  let job=createAutomaticJob(crypto.randomUUID(),input(1));while(job.status!=="complete")job=await advanceJob(job.id);
  const p=getProject(job.projectId);const latest={...job.result,localJobId:job.id,studio:{completedAutomaticJob:job.id,pages:{1:{typography:{color:"#123456"},versions:[{id:crypto.randomUUID(),createdAt:new Date().toISOString(),asset:job.result.pages[0].asset!}]}}}};
  const project=saveProject(p.id,latest,p.revision),edit=productionEdits({...job,result:latest});edit.title="校对后的沙堡";edit.pages[0].text="小禾用湿沙搭起小沙堡。";
  const saved=saveJobProduction(job.id,edit,job.updatedAt,project.revision);
  expect(saved.project.draft.studio).toEqual(latest.studio);expect(saved.project.draft.cover).toEqual(latest.cover);expect(saved.project.draft.pages[0].asset).toEqual(latest.pages[0].asset);expect(saved.job.result.title).toBe(edit.title);
  expect(()=>saveJobProduction(job.id,{...edit,title:"过期修改"},job.updatedAt,project.revision)).toThrow("另一窗口");
  expect(getProject(p.id)).toEqual(saved.project);expect(getJob(job.id).result.title).toBe(edit.title);
});
it("rejects editing active generation and rejects stale project revisions without partial writes",()=>{
  const job=createAutomaticJob(crypto.randomUUID(),input());const project=getProject(job.projectId);const edit=productionEdits(job);edit.title="新的标题";edit.theme="沙堡";
  expect(()=>saveJobProduction(job.id,edit,job.updatedAt,project.revision)).toThrow("先暂停");
  const paused=updateJob(job.id,{action:"pause"});const other=saveProject(project.id,{...project.draft,title:"另一窗口的修改"},project.revision);
  expect(()=>saveJobProduction(job.id,edit,paused.updatedAt,project.revision)).toThrow("另一个窗口");
  expect(getJob(job.id).result.title).toBe("");expect(getProject(project.id)).toEqual(other);
});
