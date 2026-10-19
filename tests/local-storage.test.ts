import { afterAll,beforeAll,beforeEach,expect,it,vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const state=vi.hoisted(()=>({fail:false}));
vi.mock("node:child_process",()=>({execFile:vi.fn((_command:unknown,_args:unknown,_options:unknown,callback:(error:Error|null)=>void)=>callback(state.fail?new Error("file manager unavailable"):null))}));
import { execFile } from "node:child_process";
import { createWorkbenchDraft } from "@/lib/custom-workbench";
import { createProject,database } from "@/lib/local/store";
import { GET,POST } from "@/app/api/local/storage/route";
let root:string,projectId:string;
beforeAll(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"kidbook folder $(literal) -"));vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",root);projectId=createProject({...createWorkbenchDraft(false),title:"测试绘本"}).id;});
afterAll(()=>{database().close();fs.rmSync(root,{recursive:true,force:true});vi.unstubAllEnvs();});
beforeEach(()=>{state.fail=false;vi.clearAllMocks();});
function request(body:unknown,origin="http://127.0.0.1:3100"){return new Request("http://127.0.0.1:3100/api/local/storage",{method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify(body)});}
it("reports the actual configured storage location without opening anything",async()=>{
  const response=await GET(new Request(`http://127.0.0.1:3100/api/local/storage?projectId=${projectId}`)),info=await response.json();
  expect(response.status).toBe(200);expect(info.directory).toBe(path.join(root,"绘本","测试绘本"));expect(info.manuscript).toBe(path.join(info.directory,"编导稿.txt"));expect(info.images).toBe(path.join(info.directory,"图片"));expect(execFile).not.toHaveBeenCalled();
});
it("opens only the configured directory as a single literal argument without a shell",async()=>{
  const response=await POST(request({action:"open-folder",projectId}));expect(response.status).toBe(200);expect((await response.json()).opened).toBe(true);
  const call=vi.mocked(execFile).mock.calls[0];expect(call[1]).toEqual([path.join(root,"绘本","测试绘本")]);expect(call[2]).toEqual({timeout:10000});
});
it("rejects arbitrary paths and cross-origin opening requests before launching a process",async()=>{
  expect((await POST(request({action:"open-folder",projectId,path:"/etc",command:"arbitrary"}))).status).toBe(400);
  expect((await POST(request({action:"open-folder",projectId},"https://foreign.example"))).status).toBe(403);
  expect(execFile).not.toHaveBeenCalled();
});
it("reports an opening failure truthfully and keeps the path available for manual copying",async()=>{
  state.fail=true;const response=await POST(request({action:"open-folder",projectId}));expect(response.status).toBe(503);expect((await response.json()).error).toContain("复制");
  const info=await (await GET(new Request(`http://127.0.0.1:3100/api/local/storage?projectId=${projectId}`))).json();expect(info.directory).toBe(path.join(root,"绘本","测试绘本"));
});
