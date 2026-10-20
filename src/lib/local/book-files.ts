import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { CustomWorkbenchDraft,WorkbenchAsset } from "../custom-workbench";
import { bookProductionText,type ProductionBook } from "../book-production";

type Project={id:string;draft:CustomWorkbenchDraft;revision:number;updatedAt:string};
type Manifest={projectId:string;managed:Record<string,string>;exports:Record<string,{content:string;exportedAt:string}>};
export type BookFolder={projectId:string;title:string;directory:string;images:string;pdfs:string;manuscript:string;configuration:string;pdfCount:number;pdfOutdated:boolean;warnings:string[]};
export function bookFileName(value:string,fallback="未命名绘本") {
  let name=value.normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,"_").replace(/^[.\s]+|[.\s]+$/g,"");
  while(Buffer.byteLength(name,"utf8")>180)name=Array.from(name).slice(0,-1).join("");
  if(!name)name=fallback;
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name="_"+name;
  return name;
}
function target(directory:string,relative:string) {
  const resolved=path.resolve(directory,relative);
  if(resolved===directory||!resolved.startsWith(directory+path.sep))throw new Error("文件路径超出绘本文件夹。");
  return resolved;
}
function atomic(file:string,bytes:string|Uint8Array) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(fs.existsSync(file)&&fs.readFileSync(file).equals(Buffer.from(bytes)))return;
  const temp=path.join(path.dirname(file),`.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try{fs.writeFileSync(temp,bytes,{mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function readManifest(directory:string):Manifest|null {
  try{return JSON.parse(fs.readFileSync(path.join(directory,".book-files.json"),"utf8"));}catch{return null;}
}
function archive(directory:string,relative:string,category="图片/历史版本") {
  const file=target(directory,relative);if(!fs.existsSync(file)||!fs.statSync(file).isFile())return;
  const bytes=fs.readFileSync(file),hash=crypto.createHash("sha256").update(bytes).digest("hex").slice(0,16),ext=path.extname(file);
  atomic(target(directory,`${category}/${path.basename(file,ext)}_${hash}${ext}`),bytes);
}
function directoryFor(db:DatabaseSync,root:string,project:Project) {
  const base=path.join(root,"绘本");fs.mkdirSync(base,{recursive:true,mode:0o700});
  db.exec("CREATE TABLE IF NOT EXISTS book_folders(project_id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE)");
  const old=db.prepare("SELECT name FROM book_folders WHERE project_id=?").get(project.id)?.name as string|undefined;
  const title=bookFileName(project.draft.title),suffix=project.id.slice(0,8);let name=title;
  for(let n=0;;n++) {
    name=n?`${title}_${suffix}${n>1?`_${n}`:""}`:title;
    const reserved=db.prepare("SELECT project_id FROM book_folders WHERE name=? COLLATE NOCASE").get(name)?.project_id;
    const dest=target(base,name),occupied=fs.existsSync(dest);
    if(reserved&&reserved!==project.id)continue;
    if(occupied&&readManifest(dest)?.projectId!==project.id&&name!==old)continue;
    break;
  }
  const directory=target(base,name);
  if(fs.existsSync(directory)&&fs.lstatSync(directory).isSymbolicLink())throw new Error("绘本文件夹不能是符号链接。");
  if(old&&old!==name&&path.basename(old)===old) {
    const prior=target(base,old);
    if(fs.existsSync(prior)&&!fs.existsSync(directory))fs.renameSync(prior,directory);
  }
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  db.prepare("INSERT INTO book_folders(project_id,name) VALUES(?,?) ON CONFLICT(project_id) DO UPDATE SET name=excluded.name").run(project.id,name);
  return directory;
}
export function bookContentSignature(d:CustomWorkbenchDraft) {
  return crypto.createHash("sha256").update(JSON.stringify({title:d.title,subtitle:d.subtitle,author:d.author,pageCount:d.pageCount,pages:d.pages.slice(0,d.pageCount),cover:d.cover,format:d.format,spreads:d.spreads,typography:d.typography,design:Object.fromEntries(Object.entries(d.studio?.pages||{}).map(([key,value])=>[key,value.typography]))})).digest("hex");
}
function source(root:string,asset:WorkbenchAsset) {
  if(asset.storagePath&&/^[0-9a-f-]{36}$/i.test(asset.storagePath))return path.join(root,"assets",asset.storagePath+".jpg");
  if(asset.origin==="sample"&&/^\/sample-books\/[a-zA-Z0-9_./-]+$/.test(asset.src)&&!asset.src.includes(".."))return path.join(process.cwd(),"public",asset.src);
  throw new Error("图片没有可读取的本机文件。");
}
function extension(file:string) {
  const fd=fs.openSync(file,"r"),head=Buffer.alloc(12);
  try{fs.readSync(fd,head,0,12,0);}finally{fs.closeSync(fd);}
  return head[0]===137&&head.toString("ascii",1,4)==="PNG"?"png":head.toString("ascii",0,4)==="RIFF"&&head.toString("ascii",8,12)==="WEBP"?"webp":head.toString("ascii",0,3)==="GIF"?"gif":"jpg";
}
function pdfFiles(directory:string):string[] {
  if(!fs.existsSync(directory))return [];
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.name==="历史版本"?[]:entry.isDirectory()?pdfFiles(path.join(directory,entry.name)):entry.name.toLowerCase().endsWith(".pdf")?[path.join(directory,entry.name)]:[]);
}
export function syncBookFiles(db:DatabaseSync,root:string,project:Project,book?:ProductionBook):BookFolder {
  const directory=directoryFor(db,root,{...project,draft:book?.result||project.draft}),previous=readManifest(directory);
  const manifest:Manifest={projectId:project.id,managed:{},exports:previous?.exports||{}};
  const warnings:string[]=[],draft=book?.result||project.draft;
  for(const sub of ["图片/人物参考","图片/历史版本","成品PDF","交付包"])fs.mkdirSync(target(directory,sub),{recursive:true,mode:0o700});
  function image(asset:WorkbenchAsset|undefined,label:string) {
    if(!asset)return;
    try {
      const original=source(root,asset),stat=fs.statSync(original),relative=`图片/${label}.${extension(original)}`;
      const signature=`${asset.storagePath||asset.src}:${stat.size}:${stat.mtimeMs}`,dest=target(directory,relative);
      manifest.managed[relative]=signature;
      if(previous?.managed?.[relative]===signature&&fs.existsSync(dest))return;
      if(fs.existsSync(dest))archive(directory,relative);
      const temp=dest+`.${crypto.randomUUID()}.tmp`;
      try{fs.copyFileSync(original,temp,fs.constants.COPYFILE_FICLONE);fs.chmodSync(temp,0o600);fs.renameSync(temp,dest);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
    }catch(e){warnings.push(`${label}：${e instanceof Error?e.message:"图片整理失败"}`);}
  }
  image(draft.cover,"封面");
  draft.characters.forEach((c,i)=>image(c.asset,`人物参考/${i+1}_${bookFileName(c.name,"人物")}_当前参考`));
  book?.source?.characters.forEach((c,i)=>image(c.asset,`人物参考/${i+1}_${bookFileName(c.name,"人物")}_原始照片`));
  for(let i=0;i<draft.pageCount;i++) {
    if(i>0&&draft.spreads.includes(i))continue;
    const spread=draft.spreads.includes(i+1),label=`第${String(i+1).padStart(3,"0")}${spread?`-${String(i+2).padStart(3,"0")}`:""}页${spread?"_跨页":""}`;
    image(draft.pages[i]?.asset,label);
  }
  for(const [number,page]of Object.entries(draft.studio?.pages||{}))for(const version of page.versions||[])image(version.asset,`历史版本/${number==="0"?"封面":`第${number.padStart(3,"0")}页`}_${version.id.slice(0,8)}`);
  for(const relative of Object.keys(previous?.managed||{}))if(!warnings.length&&!manifest.managed[relative]&&!relative.startsWith("图片/历史版本/")) {
    try{const old=target(directory,relative);archive(directory,relative);if(fs.existsSync(old))fs.unlinkSync(old);}catch(e){warnings.push(`历史图片整理失败：${e instanceof Error?e.message:"请检查文件夹"}`);}
  }
  atomic(target(directory,"编导稿.txt"),"\uFEFF"+bookProductionText(book?{...book,result:draft}:{result:draft,status:"saved"}));
  atomic(target(directory,"项目配置.json"),JSON.stringify({...project,draft},null,2));
  atomic(target(directory,"文件说明.txt"),"\uFEFF"+[`书名：${draft.title||"未命名绘本"}`,"编导稿.txt：完整故事线、人物、美术方案、逐页正文和编导说明。","项目配置.json：工作台可编辑项目的保存快照。","图片：封面、按页码命名的原图、人物参考和历史图片。","成品PDF：导出时自动归档的阅读版、印刷版与拆分文件。","交付包：已导出的制作交付压缩包。","编辑文字或更换图片后，请重新导出PDF，已有导出文件会保留。",...(warnings.length?["",...warnings]:[])].join("\n"));
  atomic(target(directory,".book-files.json"),JSON.stringify(manifest,null,2));
  const pdfs=pdfFiles(target(directory,"成品PDF")),signature=bookContentSignature(draft);
  return {projectId:project.id,title:draft.title||"未命名绘本",directory,images:target(directory,"图片"),pdfs:target(directory,"成品PDF"),manuscript:target(directory,"编导稿.txt"),configuration:target(directory,"项目配置.json"),pdfCount:pdfs.length,pdfOutdated:Object.values(manifest.exports).some(item=>item.content!==signature),warnings};
}
export function writeBookOutputs(location:BookFolder,draft:CustomWorkbenchDraft,files:Record<string,Uint8Array>,outdated=false) {
  const manifest=readManifest(location.directory);if(!manifest||manifest.projectId!==location.projectId)throw new Error("绘本文件夹标识不一致。");
  for(const [relative,bytes]of Object.entries(files)) {
    if(!/^(成品PDF|交付包)\//.test(relative))throw new Error("成品文件路径无效。");
    const dest=target(location.directory,relative);
    if(fs.existsSync(dest)&&!fs.readFileSync(dest).equals(Buffer.from(bytes)))archive(location.directory,relative,`${relative.split("/")[0]}/历史版本`);
    atomic(dest,bytes);manifest.exports[relative]={content:outdated?"restored-outdated":bookContentSignature(draft),exportedAt:new Date().toISOString()};
  }
  atomic(target(location.directory,".book-files.json"),JSON.stringify(manifest,null,2));
}
