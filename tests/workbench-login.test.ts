import {beforeAll,afterAll,beforeEach,describe,it,expect,vi} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {database} from "@/lib/local/store";
import {hashWorkbenchPassword,loginWorkbench,workbenchSession,logoutWorkbench,workbenchCookie} from "@/lib/local/workbench-auth";
import {assertLocalRequest} from "@/lib/local/http";
const env={STORYBLOOM_WORKBENCH_ORIGIN:"https://books.example",STORYBLOOM_WORKBENCH_USERNAME:"test-account",STORYBLOOM_WORKBENCH_PASSWORD_HASH:""};
const now=1800000000;
let root:string;
function request(token=""){return new Request("https://books.example/api/local/projects",{headers:{host:"books.example",origin:"https://books.example",cookie:token?`kidbook_session=${token}`:"","x-real-ip":"192.0.2.1"}});}
beforeAll(async()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"kidbook-login-"));vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",root);env.STORYBLOOM_WORKBENCH_PASSWORD_HASH=await hashWorkbenchPassword("test-password");});
beforeEach(()=>{for(const [name,value]of Object.entries(env))vi.stubEnv(name,value);});
afterAll(()=>{database().close();fs.rmSync(root,{recursive:true,force:true});vi.unstubAllEnvs();});
describe("workbench account login",()=>{
  it("uses opaque sessions, persists across requests and revokes on logout",async()=>{
    const login=await loginWorkbench(request(),env.STORYBLOOM_WORKBENCH_USERNAME,"test-password",env,now);
    expect(workbenchSession(request(login.token),env,now+1)?.username).toBe(env.STORYBLOOM_WORKBENCH_USERNAME);
    const stored=database().prepare("SELECT token_hash FROM workbench_sessions").get();expect(stored?.token_hash).not.toBe(login.token);
    expect(workbenchCookie(login.token,env)).toContain("HttpOnly; SameSite=Lax");expect(workbenchCookie(login.token,env)).toContain("Secure");
    logoutWorkbench(request(login.token));expect(workbenchSession(request(login.token),env,now+2)).toBeNull();
  });
  it("rejects forged/expired sessions and invalidates sessions after credentials change",async()=>{
    const login=await loginWorkbench(request(),env.STORYBLOOM_WORKBENCH_USERNAME,"test-password",env,now);
    expect(workbenchSession(request("f".repeat(64)),env,now+1)).toBeNull();
    expect(workbenchSession(request(login.token),{...env,STORYBLOOM_WORKBENCH_USERNAME:"changed"},now+1)).toBeNull();
    const next=await loginWorkbench(request(),env.STORYBLOOM_WORKBENCH_USERNAME,"test-password",env,now);
    expect(workbenchSession(request(next.token),env,now+12*3600+1)).toBeNull();
  });
  it("enforces sessions in Node handlers without relying on middleware",()=>{
    expect(()=>assertLocalRequest(request())).toThrow("重新登录");
    expect(()=>assertLocalRequest(new Request("https://books.example/api/local/projects",{headers:{host:"books.example",origin:"https://evil.example"}}))).toThrow("其他网站");
  });
  it("returns a generic failure and limits repeated login attempts",async()=>{
    await expect(loginWorkbench(request(),"unknown","test-password",env,now)).rejects.toMatchObject({status:401,message:"账号或密码不正确。"});
    database().prepare("UPDATE workbench_login_attempts SET attempts=10 WHERE scope LIKE 'ip:%'").run();
    await expect(loginWorkbench(request(),env.STORYBLOOM_WORKBENCH_USERNAME,"test-password",env,now+1)).rejects.toMatchObject({status:429});
    await expect(loginWorkbench(request(),env.STORYBLOOM_WORKBENCH_USERNAME,"test-password",env,now+901)).resolves.toHaveProperty("token");
  });
});
