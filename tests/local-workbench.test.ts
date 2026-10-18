import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createWorkbenchDraft, makeAsset } from "../src/lib/custom-workbench";
import { bookBriefSchema, briefErrors, domainInstructions, missingLearningTargets } from "../src/lib/book-domain";
import { createProject, getProject, saveProject, saveAsset, readAsset, database, listProjects } from "../src/lib/local/store";
import { assertLocalRequest } from "../src/lib/local/http";
import { localDraftSchema } from "../src/lib/local/schema";

let root:string;
beforeAll(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"storybloom-local-test-"));vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",root);});
afterAll(()=>{database().close();fs.rmSync(root,{recursive:true,force:true});vi.unstubAllEnvs();});
describe("local projects and disk assets",()=>{
  it("persists an incomplete draft and rejects stale writes from another window",()=>{
    const p=createProject(createWorkbenchDraft(false));
    expect(getProject(p.id).draft.title).toBe("");
    const draft={...p.draft,title:"若汐的小沙堡"};
    const saved=saveProject(p.id,draft,p.revision);
    expect(saved.revision).toBe(2);
    expect(()=>saveProject(p.id,{...draft,title:"过期修改"},p.revision)).toThrow("另一个窗口");
    expect(getProject(p.id).draft.title).toBe("若汐的小沙堡");
  });
  it("keeps photos on disk and restores stable URLs with the project",()=>{
    const bytes=new Uint8Array([1,2,3,4]);const a=saveAsset(bytes,"photo.jpg");
    const draft=createWorkbenchDraft(false);
    draft.characters[0].asset={...makeAsset(a.src,"photo.jpg","character"),storagePath:a.storagePath};
    const p=createProject(draft);const saved=saveProject(p.id,draft,p.revision);
    expect(getProject(saved.id).draft.characters[0].asset?.src).toBe(a.src);
    expect([...readAsset(a.id)]).toEqual([...bytes]);
    expect(fs.existsSync(path.join(root,"storybloom.sqlite"))).toBe(true);
    expect(listProjects().some(p=>p.id===saved.id)).toBe(true);
  });
  it("rejects arbitrary asset URLs, missing assets and path traversal",()=>{
    const p=createProject(createWorkbenchDraft(false));const bad=structuredClone(p.draft);
    bad.cover=makeAsset("https://example.com/private.jpg","x","cover");
    expect(()=>saveProject(p.id,bad,p.revision)).toThrow("图片尚未保存");
    expect(()=>readAsset("../../secret")).toThrow("无效");
    expect(()=>readAsset(crypto.randomUUID())).toThrow("图片不存在");
  });
  it("allows blank projects but bounds payloads and character references",()=>{
    expect(localDraftSchema.safeParse(createWorkbenchDraft(false)).success).toBe(true);
    const bad=createWorkbenchDraft(false);bad.pages[0].characters=["unknown"];
    expect(localDraftSchema.safeParse(bad).success).toBe(false);
  });
});
describe("three domain contracts",()=>{
  it("requires one concrete habit and a situation",()=>{
    const brief=bookBriefSchema.parse({});expect(briefErrors(brief)).toHaveLength(2);
    brief.habitGoal="主动求助";brief.trigger="睡前找不到玩偶";expect(briefErrors(brief)).toEqual([]);
    expect(domainInstructions(brief)).toContain("exactly one observable behavior");
  });
  it("requires confirmed facts before a memory story",()=>{
    const brief=bookBriefSchema.parse({domain:"memories",facts:"先用干沙失败，再试湿沙成功"});
    expect(briefErrors(brief)).toHaveLength(1);brief.factsConfirmed=true;expect(briefErrors(brief)).toEqual([]);
    expect(domainInstructions(brief)).toContain("Do not invent conflicts");
  });
  it("checks exact vocabulary coverage rather than claiming image correctness",()=>{
    const brief=bookBriefSchema.parse({domain:"learning",targets:"水桶、铲子\n湿沙"});
    expect(missingLearningTargets(brief,["水桶里装着湿沙"])).toEqual(["铲子"]);
    expect(missingLearningTargets(brief,["水桶、铲子和湿沙"])).toEqual([]);
  });
});
describe("loopback access without login",()=>{
  it("permits same-origin local access but rejects foreign origins and DNS rebinding",()=>{
    expect(()=>assertLocalRequest(new Request("http://127.0.0.1:3100/api/local/projects"))).not.toThrow();
    expect(()=>assertLocalRequest(new Request("http://127.0.0.1:3100/api/local/projects",{headers:{origin:"https://evil.example"}}))).toThrow("其他网站");
    expect(()=>assertLocalRequest(new Request("http://localhost:3100/api/local/projects",{headers:{host:"127.0.0.1:3100",origin:"http://127.0.0.1:3100"}}))).not.toThrow();
    expect(()=>assertLocalRequest(new Request("http://evil.example/api/local/projects"))).toThrow("本机访问");
  });
});
