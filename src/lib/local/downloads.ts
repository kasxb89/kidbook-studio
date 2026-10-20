import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getProjectBookFolder, LocalError } from "./store";

export function attachmentHeaders(name:string,type:string) {
  const encoded=encodeURIComponent(name).replace(/['()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
  return {"Content-Type":type,"Content-Disposition":`attachment; filename="kidbook${path.extname(name).replace(/[^.a-z0-9]/gi,"")}"; filename*=UTF-8''${encoded}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
}
function allowed(relative:string) {
  return relative.length<1500&&!relative.includes("\\")&&!relative.includes("\0")&&!path.isAbsolute(relative)&&relative.split("/").every(part=>!!part&&!part.startsWith(".")&&!part.includes(":"))&&(/^(图片|成品PDF|交付包)\//.test(relative)||["编导稿.txt","项目配置.json","文件说明.txt"].includes(relative));
}
export function resolveBookDownload(projectId:string,relative:string) {
  if(!allowed(relative))throw new LocalError("文件路径无效。",400);
  const root=fs.realpathSync(getProjectBookFolder(projectId).directory),file=path.resolve(root,relative);
  if(!fs.existsSync(file))throw new LocalError("文件不存在，请重新导出。",404);
  const real=fs.realpathSync(file);
  if(!real.startsWith(root+path.sep)||!fs.statSync(real).isFile())throw new LocalError("文件路径无效。",403);
  return real;
}
export function listBookDownloads(projectId:string) {
  const folder=getProjectBookFolder(projectId),files:Array<{path:string;name:string;bytes:number;updatedAt:string;kind:"pdf"|"image"|"archive"|"text"}>=[];
  function walk(directory:string,prefix="") {
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      if(entry.isSymbolicLink()||entry.name.startsWith(".")||entry.name==="历史版本")continue;
      const relative=prefix+entry.name;
      if(entry.isDirectory()){if(prefix||["图片","成品PDF","交付包"].includes(entry.name))walk(path.join(directory,entry.name),relative+"/");continue;}
      if(!allowed(relative))continue;
      const info=fs.statSync(path.join(directory,entry.name)),ext=path.extname(entry.name).toLowerCase();
      files.push({path:relative,name:entry.name,bytes:info.size,updatedAt:info.mtime.toISOString(),kind:ext===".pdf"?"pdf":ext===".zip"?"archive":[".jpg",".png",".webp"].includes(ext)?"image":"text"});
    }
  }
  walk(folder.directory);
  return {projectId,title:folder.title,pdfOutdated:folder.pdfOutdated,warnings:folder.warnings,files};
}
export function sendBookFile(request:Request,file:string,name=path.basename(file)) {
  const stat=fs.statSync(file),size=stat.size,ext=path.extname(name).toLowerCase();
  const type=({".pdf":"application/pdf",".zip":"application/zip",".json":"application/json; charset=utf-8",".txt":"text/plain; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".webp":"image/webp"} as Record<string,string>)[ext]||"application/octet-stream";
  const etag=`"${size.toString(16)}-${stat.mtimeMs.toString(16)}-${stat.ino.toString(16)}"`;
  const headers=new Headers({...attachmentHeaders(name,type),"Accept-Ranges":"bytes","Last-Modified":stat.mtime.toUTCString(),"ETag":etag});
  let start=0,end=size-1,status=200;
  const ifRange=request.headers.get("if-range"),unchanged=!ifRange||ifRange===etag;
  // A regenerated PDF is a different entity; never append its tail to an old
  // partial download when the browser supplies a stale If-Range validator.
  const range=unchanged?request.headers.get("range"):null;
  if(range) {
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match||(!match[1]&&!match[2])||!size)return new Response(null,{status:416,headers:{...Object.fromEntries(headers),"Content-Range":`bytes */${size}`}});
    if(!match[1]) {const suffix=Number(match[2]);start=Math.max(0,size-suffix);if(!suffix)start=size;}
    else {start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end)return new Response(null,{status:416,headers:{...Object.fromEntries(headers),"Content-Range":`bytes */${size}`}});
    status=206;headers.set("Content-Range",`bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length",String(Math.max(0,end-start+1)));
  if(request.method==="HEAD"||!size)return new Response(null,{status,headers});
  return new Response(Readable.toWeb(fs.createReadStream(file,{start,end})) as ReadableStream<Uint8Array>,{status,headers});
}
