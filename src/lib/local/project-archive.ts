import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { Zip, ZipPassThrough, unzipSync, strToU8, strFromU8 } from "fflate";
import type { CustomWorkbenchDraft, WorkbenchAsset } from "../custom-workbench";
import { getProject,getProjectBookFolder,readAsset,saveAsset,createProject,saveProjectBookOutputs,LocalError } from "./store";
import { localDraftSchema } from "./schema";
import { bookFileName } from "./book-files";
import { attachmentHeaders,listBookDownloads,resolveBookDownload } from "./downloads";

type Entry={name:string;file?:string;data?:Uint8Array};
type Manifest={kind:"kidbook-project";version:1;draft:CustomWorkbenchDraft;pdfOutdated?:boolean;assets:Array<{id:string;file:string;name:string;sha256:string}>};
export const PROJECT_IMPORT_LIMIT=512*1024*1024;
export function projectAssets(draft:CustomWorkbenchDraft) {
  return [draft.cover,...draft.characters.map(c=>c.asset),...draft.pages.map(p=>p.asset),...Object.values(draft.studio?.pages||{}).flatMap(p=>(p.versions||[]).map(v=>v.asset))].filter((a):a is WorkbenchAsset=>!!a);
}
export function projectArchiveEntries(id:string,kind:"project"|"images"|"delivery") {
  const project=getProject(id),folder=getProjectBookFolder(id),listed=listBookDownloads(id),entries:Entry[]=[];
  if(folder.warnings.length)throw new LocalError("有图片尚未完成归档，请处理后再下载整本资料。",422);
  if(kind==="project") {
    const draft=structuredClone(project.draft),manifest:Manifest={kind:"kidbook-project",version:1,draft,pdfOutdated:listed.pdfOutdated,assets:[]},bySource=new Map<string,string>();
    for(const asset of new Set(projectAssets(draft))) {
      const identity=asset.storagePath||asset.src;let key=bySource.get(identity);
      if(!key) {
        key=crypto.randomUUID();bySource.set(identity,key);
        const data=asset.storagePath?readAsset(asset.storagePath):asset.origin==="sample"&&/^\/sample-books\/[a-zA-Z0-9_./-]+$/.test(asset.src)&&!asset.src.includes("..")?fs.readFileSync(path.join(process.cwd(),"public",asset.src)):undefined;
        if(!data)throw new LocalError("素材未保存，无法打包项目。",422);
        const name=`assets/${key}.jpg`;
        manifest.assets.push({id:key,file:name,name:asset.name,sha256:crypto.createHash("sha256").update(data).digest("hex")});
        if(asset.storagePath)entries.push({name,file:path.join(path.dirname(folder.directory),"..","assets",`${asset.storagePath}.jpg`)});
        else entries.push({name,data});
      }
      asset.id=key;asset.storagePath=key;asset.src=`/api/local/assets/${key}`;if(asset.origin==="sample")asset.origin="uploaded";
    }
    delete draft.localJobId;if(draft.studio)delete draft.studio.completedAutomaticJob;
    entries.unshift({name:"kidbook-project.json",data:strToU8(JSON.stringify(manifest))});
    entries.push({name:"项目配置.json",data:strToU8(JSON.stringify(draft,null,2))});
    entries.push({name:"恢复说明.txt",data:strToU8("在绘本工作台点击“导入项目备份”，选择本ZIP即可恢复。原图、文字样式、分镜和图片历史都在包内。导入会新建绘本，不覆盖已有项目。\n")});
  }
  for(const file of listed.files) {
    if(kind==="images"&&file.kind!=="image")continue;
    if(file.kind==="archive"||(kind==="project"&&file.path==="项目配置.json"))continue;
    entries.push({name:file.path,file:resolveBookDownload(id,file.path)});
  }
  return {name:`${bookFileName(project.draft.title,"绘本")}_${kind==="project"?"完整项目备份":kind==="images"?"全部原图":"整本交付资料"}.zip`,entries};
}

/** Stream uncompressed image/PDF entries with backpressure; no giant browser Blob. */
export function streamProjectArchive(name:string,entries:Entry[]) {
  let cancelled=false,resume:(()=>void)|undefined,active:fs.ReadStream|undefined;
  const body=new ReadableStream<Uint8Array>({
    start(controller) {
      const zip=new Zip((error,data,final)=>{if(cancelled)return;if(error){cancelled=true;active?.destroy();controller.error(error);return;}if(data.length)controller.enqueue(data);if(final)controller.close();});
      const ready=async()=>{if(!cancelled&&(controller.desiredSize??0)<=0)await new Promise<void>(resolve=>{resume=resolve;});};
      void (async()=>{
        try {
          for(const item of entries) {
            if(cancelled)return;const entry=new ZipPassThrough(item.name);zip.add(entry);await ready();
            if(item.file) {active=fs.createReadStream(item.file,{highWaterMark:64*1024});for await(const chunk of active){if(cancelled)return;entry.push(new Uint8Array(chunk),false);await ready();}active=undefined;}
            else {entry.push(item.data||new Uint8Array(),false);await ready();}
            entry.push(new Uint8Array(),true);await ready();
          }
          if(!cancelled)zip.end();
        }catch(error){if(!cancelled){cancelled=true;controller.error(error);}}
      })();
    },
    pull(){const next=resume;resume=undefined;next?.();},
    cancel(){cancelled=true;active?.destroy();const next=resume;resume=undefined;next?.();},
  },{highWaterMark:512*1024,size:chunk=>chunk.byteLength});
  return new Response(body,{headers:attachmentHeaders(name,"application/zip")});
}

export async function importProjectArchive(bytes:Uint8Array) {
  if(bytes.byteLength>PROJECT_IMPORT_LIMIT)throw new LocalError("备份包超过512MB，请拆分资料后再导入。",413);
  let total=0,count=0,files:Record<string,Uint8Array>;
  try {files=unzipSync(bytes,{filter:file=>{
    if(++count>10000||file.name.length>1500||/[\\:\u0000-\u001f]/.test(file.name)||file.name.split("/").some(p=>p===".."||p.startsWith("."))||file.name.startsWith("/"))throw Error("path");
    total+=file.originalSize;if(total>PROJECT_IMPORT_LIMIT||file.originalSize>PROJECT_IMPORT_LIMIT)throw Error("size");return true;
  }});}catch{throw new LocalError("备份包格式无效，或解压后超过512MB。",400);}
  const raw=files["kidbook-project.json"];if(!raw||raw.length>20*1024*1024)throw new LocalError("请导入由本工作台下载的完整项目备份ZIP。",400);
  let manifest:Manifest;
  try{manifest=JSON.parse(strFromU8(raw));}catch{throw new LocalError("项目配置损坏。",400);}
  if(!manifest||manifest.kind!=="kidbook-project"||manifest.version!==1||!Array.isArray(manifest.assets)||manifest.assets.length>10000)throw new LocalError("项目备份版本或内容不支持。",400);
  const parsed=localDraftSchema.safeParse(manifest.draft);if(!parsed.success)throw new LocalError("项目文字样式、页数或人物配置无效。",400);
  const draft=parsed.data as CustomWorkbenchDraft,prepared=new Map<string,{data:Uint8Array;name:string}>();
  for(const a of manifest.assets) {
    if(!a||!/^assets\/[0-9a-f-]{36}\.jpg$/i.test(a.file)||a.file!==`assets/${a.id}.jpg`||prepared.has(a.id)||!files[a.file]||files[a.file].byteLength>40*1024*1024)throw new LocalError("备份中的图片索引无效。",400);
    const data=files[a.file];if(crypto.createHash("sha256").update(data).digest("hex")!==a.sha256)throw new LocalError("备份中的图片校验失败。",400);
    try{const meta=await sharp(data,{limitInputPixels:64_000_000}).metadata();if(!meta.width||!meta.height||!['jpeg','png','webp'].includes(meta.format||"")||meta.width*meta.height>64_000_000)throw Error();}catch{throw new LocalError("备份包含无法读取的图片。",400);}
    prepared.set(a.id,{data,name:typeof a.name==="string"?a.name.slice(0,200):"导入图片"});
  }
  for(const a of projectAssets(draft))if(!a.storagePath||!prepared.has(a.storagePath))throw new LocalError("备份缺少当前或历史版本使用的原图。",400);
  // Originals from the AI job's source may no longer be the active character
  // reference. Retain those organised photos as well as editable asset IDs.
  const extras:Record<string,Uint8Array>={};
  for(const [file,data]of Object.entries(files)) {
    if(/^图片\/(?:[^/]+\/)*[^/]+\.(?:jpg|jpeg|png|webp)$/i.test(file)) {
      try{const meta=await sharp(data,{limitInputPixels:64_000_000}).metadata();if(!meta.width||!meta.height||!['jpeg','png','webp'].includes(meta.format||"")||meta.width*meta.height>64_000_000)throw Error();}catch{throw new LocalError("备份中的原始参考照片无法读取。",400);}
      extras[file]=data;
    }else if(/^成品PDF\/(?:[^/]+\/)*[^/]+\.(?:txt|json)$/i.test(file))extras[file]=data;
  }
  const names=new Set(Object.keys(extras));
  for(const file of names){const parts=file.split("/");for(let n=1;n<parts.length;n++)if(names.has(parts.slice(0,n).join("/")))throw new LocalError("备份中的资料路径冲突。",400);}
  const mapped=new Map<string,ReturnType<typeof saveAsset>>();
  for(const [id,a]of prepared)mapped.set(id,saveAsset(a.data,a.name));
  for(const a of projectAssets(draft)){const next=mapped.get(a.storagePath!)!;a.id=next.id;a.storagePath=next.storagePath;a.src=next.src;if(a.origin==="sample")a.origin="uploaded";}
  delete draft.localJobId;if(draft.studio)delete draft.studio.completedAutomaticJob;
  const project=createProject(draft),outputs:Record<string,Uint8Array>={};
  for(const [file,data]of Object.entries(files))if(/^成品PDF\/(?!.*历史版本\/)(?:[^/]+\/)*[^/]+\.pdf$/i.test(file)&&Buffer.from(data.subarray(0,5)).toString()==="%PDF-")outputs[file]=data;
  if(Object.keys(outputs).length)saveProjectBookOutputs(project.id,draft,outputs,manifest.pdfOutdated===true);
  const root=getProjectBookFolder(project.id).directory;
  for(const [relative,data]of Object.entries(extras)) {
    const dest=path.resolve(root,relative);if(!dest.startsWith(root+path.sep))throw new LocalError("备份中的资料路径无效。",400);
    // Current managed images have already been rebuilt from the restored IDs.
    if(fs.existsSync(dest))continue;fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});fs.writeFileSync(dest,data,{flag:"wx",mode:0o600});
  }
  return project;
}
