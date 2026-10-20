import "server-only";
import crypto from "node:crypto";
import { database, LocalError } from "./store";
import { workbenchCredentialsConfigured, workbenchLoginEnabled, type WorkbenchEnvironment } from "../workbench-access";

function derivePassword(password:string,salt:string) {
  return new Promise<Buffer>((resolve,reject)=>crypto.scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
}
export const WORKBENCH_COOKIE="kidbook_session";
const SESSION_SECONDS=7*24*60*60, IDLE_SECONDS=12*60*60, ATTEMPT_WINDOW=15*60;
const initialized=new WeakSet<object>();
function authDatabase() {
  const db=database();
  if(!initialized.has(db)) {
    db.exec(`CREATE TABLE IF NOT EXISTS workbench_sessions(token_hash TEXT PRIMARY KEY,username TEXT NOT NULL,credential_version TEXT NOT NULL,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS workbench_login_attempts(scope TEXT PRIMARY KEY,attempts INTEGER NOT NULL,reset_at INTEGER NOT NULL);`);
    initialized.add(db);
  }
  return db;
}
function credentialVersion(env:WorkbenchEnvironment) {return crypto.createHash("sha256").update(`${env.STORYBLOOM_WORKBENCH_USERNAME}\0${env.STORYBLOOM_WORKBENCH_PASSWORD_HASH}`).digest("hex");}
function sessionHash(token:string) {return crypto.createHash("sha256").update(token).digest("hex");}
function cookieToken(request:Request) {return request.headers.get("cookie")?.split(";").map(p=>p.trim()).find(p=>p.startsWith(WORKBENCH_COOKIE+"="))?.slice(WORKBENCH_COOKIE.length+1)||"";}
export async function hashWorkbenchPassword(password:string) {
  const salt=crypto.randomBytes(16).toString("hex");
  const key=await derivePassword(password,salt);
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export function workbenchSession(request:Request,env:WorkbenchEnvironment=process.env,now=Math.floor(Date.now()/1000)) {
  if(!workbenchLoginEnabled(env))return null;
  if(!workbenchCredentialsConfigured(env))throw new LocalError("工作空间登录配置不完整。",503);
  const token=cookieToken(request);if(!/^[a-f0-9]{64}$/.test(token))return null;
  const db=authDatabase(),hash=sessionHash(token),row=db.prepare("SELECT * FROM workbench_sessions WHERE token_hash=?").get(hash);
  if(!row)return null;
  if(Number(row.expires_at)<=now||Number(row.last_seen)+IDLE_SECONDS<=now||row.credential_version!==credentialVersion(env)) {
    db.prepare("DELETE FROM workbench_sessions WHERE token_hash=?").run(hash);return null;
  }
  if(Number(row.last_seen)+60<now)db.prepare("UPDATE workbench_sessions SET last_seen=? WHERE token_hash=?").run(now,hash);
  return {username:String(row.username),expiresAt:Number(row.expires_at)};
}
export function assertWorkbenchSession(request:Request) {
  if(workbenchLoginEnabled()&&!workbenchSession(request))throw new LocalError("登录已过期，请重新登录后继续。",401);
}
export async function loginWorkbench(request:Request,username:string,password:string,env:WorkbenchEnvironment=process.env,now=Math.floor(Date.now()/1000)) {
  if(!workbenchCredentialsConfigured(env))throw new LocalError("工作空间登录配置不完整。",503);
  const db=authDatabase(),ip=request.headers.get("x-real-ip")||"local";
  const scopes=[{name:"global",limit:60},{name:"ip:"+crypto.createHash("sha256").update(ip.slice(0,128)).digest("hex"),limit:10}];
  // Reserve attempts before the expensive password check, including concurrent
  // requests. Successful logins release their own reservation.
  db.exec("BEGIN IMMEDIATE");
  try {
    for(const scope of scopes){
      const row=db.prepare("SELECT attempts,reset_at FROM workbench_login_attempts WHERE scope=?").get(scope.name);
      if(row&&Number(row.reset_at)>now&&Number(row.attempts)>=scope.limit)throw new LocalError("尝试次数过多，请15分钟后再试。",429);
    }
    for(const scope of scopes)db.prepare("INSERT INTO workbench_login_attempts VALUES(?,1,?) ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END").run(scope.name,now+ATTEMPT_WINDOW,now,now);
    db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
  const [,salt,expected]=env.STORYBLOOM_WORKBENCH_PASSWORD_HASH!.split(":");
  const actual=await derivePassword(password,salt);
  const suppliedName=crypto.createHash("sha256").update(username).digest(),expectedName=crypto.createHash("sha256").update(env.STORYBLOOM_WORKBENCH_USERNAME!).digest();
  if(!crypto.timingSafeEqual(actual,Buffer.from(expected,"hex"))||!crypto.timingSafeEqual(suppliedName,expectedName))throw new LocalError("账号或密码不正确。",401);
  for(const scope of scopes)db.prepare("UPDATE workbench_login_attempts SET attempts=max(attempts-1,0) WHERE scope=?").run(scope.name);
  db.prepare("DELETE FROM workbench_sessions WHERE expires_at<=? OR last_seen<=?").run(now,now-IDLE_SECONDS);
  const token=crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO workbench_sessions VALUES(?,?,?,?,?,?)").run(sessionHash(token),env.STORYBLOOM_WORKBENCH_USERNAME!,credentialVersion(env),now,now,now+SESSION_SECONDS);
  return {token,username:env.STORYBLOOM_WORKBENCH_USERNAME!};
}
export function logoutWorkbench(request:Request) {
  const token=cookieToken(request);if(/^[a-f0-9]{64}$/.test(token))authDatabase().prepare("DELETE FROM workbench_sessions WHERE token_hash=?").run(sessionHash(token));
}
export function workbenchCookie(token:string,env:WorkbenchEnvironment=process.env) {
  return `${WORKBENCH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token?SESSION_SECONDS:0}${env.STORYBLOOM_WORKBENCH_ORIGIN?.startsWith("https:")?"; Secure":""}`;
}
