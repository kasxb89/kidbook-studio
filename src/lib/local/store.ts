import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { CustomWorkbenchDraft } from "../custom-workbench";
import { syncBookFiles,writeBookOutputs } from "./book-files";
import type { ProductionBook } from "../book-production";

export class LocalError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function dataDirectory() {
  const root = path.resolve(process.env.STORYBLOOM_LOCAL_DATA_DIR || path.join(process.cwd(), ".local-data"));
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  return root;
}
// Connections survive hot reload; SQLite WAL makes project writes atomic and restart-safe.
const globalDb = globalThis as typeof globalThis & { storybloomLocalDatabases?: Map<string, DatabaseSync> };
export function database(): DatabaseSync {
  const root = dataDirectory();
  const databases = globalDb.storybloomLocalDatabases ??= new Map<string, DatabaseSync>();
  let db = databases.get(root);
  if (!db) {
    db = new DatabaseSync(path.join(root, "storybloom.sqlite"));
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, draft TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, data TEXT NOT NULL, lease TEXT, lease_until INTEGER);
      CREATE INDEX IF NOT EXISTS jobs_project ON jobs(project_id);
      CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active ON jobs(project_id) WHERE json_extract(data,'$.status') NOT IN ('complete','failed');
    `);
    fs.chmodSync(path.join(root, "storybloom.sqlite"), 0o600);
    databases.set(root, db);
  }
  return db;
}
export function requireId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new LocalError("无效的本地项目标识。", 400);
  return id;
}
export function listProjects() {
  return database().prepare("SELECT id,draft,revision,updated_at FROM projects ORDER BY updated_at DESC").all().map(row => ({
    id: row.id as string, title: (JSON.parse(row.draft as string) as CustomWorkbenchDraft).title || "未命名绘本", revision: row.revision, updatedAt: row.updated_at,
  }));
}
export function getProject(id: string) {
  const row = database().prepare("SELECT * FROM projects WHERE id=?").get(requireId(id));
  if (!row) throw new LocalError("本地项目不存在。", 404);
  return { id, draft: JSON.parse(row.draft as string) as CustomWorkbenchDraft, revision: row.revision as number, updatedAt: row.updated_at as string };
}
export function createProject(draft: CustomWorkbenchDraft) {
  const id = crypto.randomUUID();
  database().prepare("INSERT INTO projects(id,draft,updated_at) VALUES(?,?,?)").run(id, JSON.stringify(draft), new Date().toISOString());
  scheduleBookFolder(id);return getProject(id);
}
export function saveProject(id: string, draft: CustomWorkbenchDraft, revision: number) {
  validateDraftAssets(draft);
  const r = database().prepare("UPDATE projects SET draft=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?")
    .run(JSON.stringify(draft), new Date().toISOString(), requireId(id), revision);
  if (!r.changes) throw new LocalError("此项目已在另一个窗口更新。请先保留当前配置，再刷新载入最新项目。", 409);
  scheduleBookFolder(id);return getProject(id);
}
function folderSnapshot(db:DatabaseSync,id:string) {
  const row=db.prepare("SELECT * FROM projects WHERE id=?").get(requireId(id));
  if(!row)throw new LocalError("本地项目不存在。",404);
  const project={id,draft:JSON.parse(row.draft as string) as CustomWorkbenchDraft,revision:Number(row.revision),updatedAt:String(row.updated_at)};
  const jobRow=db.prepare("SELECT data FROM jobs WHERE project_id=? ORDER BY rowid DESC LIMIT 1").get(id);
  const job=jobRow?JSON.parse(String(jobRow.data)):null;
  const result=job&&job.status!=="failed"&&job.updatedAt>project.updatedAt?job.result:project.draft;
  const book:ProductionBook={result,source:job?.source,outlinePlan:job?.outlinePlan,outlineCursor:job?.outlineCursor,status:job?.status||"saved"};
  return {project,book};
}
const pendingFolders=new Set<string>();
export function scheduleBookFolder(id:string) {
  const root=dataDirectory(),db=database(),key=`${root}:${id}`;
  if(pendingFolders.has(key))return;pendingFolders.add(key);
  // Run after any enclosing SQLite transaction commits, and coalesce rapid
  // progress updates. SQLite remains the authoritative refresh-recovery store.
  queueMicrotask(()=>{
    pendingFolders.delete(key);if(!fs.existsSync(root))return;
    try{const {project,book}=folderSnapshot(db,id);syncBookFiles(db,root,project,book);}
    catch(e){console.error("Book folder sync failed",id,e instanceof Error?e.message:"UnknownError");}
  });
}
export function getProjectBookFolder(id:string) {
  const db=database(),{project,book}=folderSnapshot(db,id);
  return syncBookFiles(db,dataDirectory(),project,book);
}
export function saveProjectBookOutputs(id:string,draft:CustomWorkbenchDraft,files:Record<string,Uint8Array>) {
  const location=getProjectBookFolder(id);writeBookOutputs(location,draft,files);
  return getProjectBookFolder(id);
}
export function saveAsset(bytes: Uint8Array, name: string) {
  const id = crypto.randomUUID();
  fs.mkdirSync(path.join(dataDirectory(), "assets"), { recursive: true, mode: 0o700 });
  const target = path.join(dataDirectory(), "assets", `${id}.jpg`);
  fs.writeFileSync(target, bytes, { mode: 0o600, flag: "wx" });
  database().prepare("INSERT INTO assets VALUES(?,?,?)").run(id, name, new Date().toISOString());
  return { id, storagePath: id, src: `/api/local/assets/${id}` };
}
export function readAsset(id: string) {
  requireId(id);
  if (!database().prepare("SELECT id FROM assets WHERE id=?").get(id)) throw new LocalError("图片不存在，请重新上传。", 404);
  return fs.readFileSync(path.join(dataDirectory(), "assets", `${id}.jpg`));
}
export function validateDraftAssets(draft: CustomWorkbenchDraft) {
  const checked=new Set<string>();
  for (const a of [draft.cover, ...draft.characters.map(c => c.asset), ...draft.pages.map(p => p.asset), ...Object.values(draft.studio?.pages || {}).flatMap(p => (p.versions || []).map(v => v.asset))]) {
    if (!a) continue;
    if (a.origin === "sample" && /^\/sample-books\/[a-zA-Z0-9_./-]+$/.test(a.src) && !a.src.includes("..")) continue;
    if (!a.storagePath || a.src !== `/api/local/assets/${requireId(a.storagePath)}`) throw new LocalError("图片尚未保存到本机，请重新上传后再保存。 ");
    if(!checked.has(a.storagePath)) {
      if(!database().prepare("SELECT id FROM assets WHERE id=?").get(a.storagePath)||!fs.existsSync(path.join(dataDirectory(),"assets",`${a.storagePath}.jpg`))) throw new LocalError("图片不存在，请重新上传。",404);
      checked.add(a.storagePath);
    }
  }
}
