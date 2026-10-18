import { beforeAll,afterAll,describe,it,expect,vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
vi.mock("../src/lib/custom-book/text-endpoint",()=>({getStoryTextEndpoint:()=>({baseUrl:"https://test.invalid",apiKey:"test"})}));
vi.mock("../src/lib/custom-book/provider",()=>({
 customImageConfig:()=>({model:"gpt-image-test"}),
 generateCustomOutline:vi.fn(async(draft:object)=>({...draft})),
 generateCustomOutlinePlan:vi.fn(async(draft:{pageCount:number})=>Array.from({length:draft.pageCount},(_,i)=>`第${i+1}页事件`)),
 requestCustomImage:async()=>new Uint8Array([1,2,3]),
 imagePrompt:()=>"test prompt",imageSize:()=>"1024x1024",cropReference:async(b:Buffer)=>b,needsProcessing:()=>false,
}));
import { createWorkbenchDraft,setWorkbenchPageCount } from "../src/lib/custom-workbench";
import { generateCustomOutline,generateCustomOutlinePlan } from "../src/lib/custom-book/provider";
import { createProject, database, saveAsset } from "../src/lib/local/store";
import { createJob, advanceJob, updateJob, getJob } from "../src/lib/local/jobs";
let root:string;
beforeAll(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"storybloom-job-test-"));vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",root);});
afterAll(()=>{database().close();fs.rmSync(root,{recursive:true,force:true});vi.unstubAllEnvs();});
function project(){const draft=createWorkbenchDraft(false);draft.title="若汐的小熊";draft.characters[0].name="若汐";draft.brief!.habitGoal="主动求助";draft.brief!.trigger="找不到玩偶";draft.pageCount=4;draft.pages.forEach(p=>{p.text="若汐请妈妈帮忙找小熊。";p.scene="Child asking mom for help.";});return createProject(draft);}
describe("local persistent generation",()=>{
 it("persists outline batches and resumes a failed middle batch without restarting the book",async()=>{
   const p=project();p.draft=setWorkbenchPageCount(p.draft,23);
   const fn=vi.mocked(generateCustomOutline);fn.mockClear();
   fn.mockImplementationOnce(async(d)=>d).mockRejectedValueOnce(new Error("interrupted")).mockImplementation(async(d)=>d);
   const job=createJob(crypto.randomUUID(),p.id,p.draft);
   const planned=await advanceJob(job.id);expect(planned.outlinePlan).toHaveLength(23);expect(planned.outlineCursor||0).toBe(0);
   expect((await advanceJob(job.id)).outlineCursor).toBe(8);
   expect((await advanceJob(job.id)).status).toBe("retryable");expect(getJob(job.id).outlineCursor).toBe(8);
   expect((await advanceJob(job.id,true)).outlineCursor).toBe(16);
   const completed=await advanceJob(job.id);expect(completed.status).toBe("review");expect(completed.outlineCursor).toBe(23);
   expect(fn.mock.calls.map(c=>c[1]?.start)).toEqual([0,8,8,16]);
   expect(vi.mocked(generateCustomOutlinePlan)).toHaveBeenCalledTimes(1);
   expect(fn.mock.calls.every(c=>c[1]?.plan?.length===23)).toBe(true);
 });
 it("requires domain facts and prevents two active tasks on one project",()=>{
   const p=project();const invalid=structuredClone(p.draft);invalid.brief!.domain="memories";
   expect(()=>createJob(crypto.randomUUID(),p.id,invalid)).toThrow("真实经过");
   const id=crypto.randomUUID();createJob(id,p.id,p.draft);
   expect(()=>createJob(crypto.randomUUID(),p.id,p.draft)).toThrow("未结束");
   expect(createJob(id,p.id,p.draft).id).toBe(id);
   expect(()=>createJob(id,p.id,{...p.draft,title:"不同请求"})).toThrow("冲突");
 });
 it("requires outline confirmation, saves each image, and resumes from disk",async()=>{
   const p=project();const job=createJob(crypto.randomUUID(),p.id,p.draft);
   const outlined=await advanceJob(job.id);expect(outlined.status).toBe("review");
   updateJob(job.id,{action:"confirm",pages:outlined.result.pages.slice(0,4)});
   const reference=await advanceJob(job.id);expect(reference.cursor).toBe(1);
   expect(getJob(job.id).result.characters[0].asset?.src).toMatch(/^\/api\/local\/assets\//);
   const saved=JSON.stringify(getJob(job.id).result.characters[0].asset);
   let next=reference;while(next.status!=="complete")next=await advanceJob(job.id);
   expect(next.cursor).toBe(next.totalUnits);
   expect(JSON.stringify(next.result.characters[0].asset)).toBe(saved);
   expect(getJob(job.id).status).toBe("complete");
 });
 it("reuses character references but clears old generated pages on a new story",()=>{
   const p=project();const file=saveAsset(new Uint8Array([1,2,3]),"old-page");
   const asset={...file,name:"旧图",purpose:"page" as const,origin:"generated" as const,crop:{x:50,y:50,zoom:1},ratio:"page" as const,appearance:"original" as const,anthropomorphic:false,retouch:[],instructions:""};
   p.draft.pages[0].asset=asset;p.draft.characters[0].asset={...asset,purpose:"character"};
   const job=createJob(crypto.randomUUID(),p.id,p.draft);
   expect(job.result.pages[0].asset).toBeUndefined();expect(job.result.characters[0].asset?.storagePath).toBe(file.storagePath);
 });
 it("rejects missing vocabulary before image generation",async()=>{
   const p=project();p.draft.brief!.domain="learning";p.draft.brief!.targets="水桶、铲子";
   const j=createJob(crypto.randomUUID(),p.id,p.draft);const outlined=await advanceJob(j.id);
   expect(()=>updateJob(j.id,{action:"confirm",pages:outlined.result.pages.slice(0,4)})).toThrow("正文尚未覆盖");
   expect(getJob(j.id).status).toBe("review");
 });
 it("explicit recovery reclaims only expired leases after a process restart",async()=>{
   const p=project();const job=createJob(crypto.randomUUID(),p.id,p.draft);
   database().prepare("UPDATE jobs SET lease=?,lease_until=? WHERE id=?").run("interrupted-worker",Date.now()-1000,job.id);
   await expect(advanceJob(job.id)).rejects.toThrow("任务正在生成");
   expect((await advanceJob(job.id,true)).status).toBe("review");
   const next=project();const running=createJob(crypto.randomUUID(),next.id,next.draft);
   database().prepare("UPDATE jobs SET lease=?,lease_until=? WHERE id=?").run("live-worker",Date.now()+60000,running.id);
   await expect(advanceJob(running.id,true)).rejects.toThrow("任务正在生成");
 });

});
