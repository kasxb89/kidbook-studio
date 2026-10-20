import { beforeAll,afterAll,it,expect,vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import sharp from "sharp";
import { zipSync,unzipSync,strToU8,strFromU8 } from "fflate";
import { createWorkbenchDraft,setWorkbenchPageCount,makeAsset } from "@/lib/custom-workbench";
import { createProject,getProject,saveProject,database,saveAsset,readAsset,saveProjectBookOutputs,getProjectBookFolder } from "@/lib/local/store";
import { projectArchiveEntries,streamProjectArchive,importProjectArchive } from "@/lib/local/project-archive";
import { GET as files } from "@/app/api/local/projects/[id]/files/route";
let root:string;
const roots:string[]=[];
beforeAll(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"kidbook-download-"));roots.push(root);vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",root);});
afterAll(()=>{for(const r of roots){vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",r);database().close();fs.rmSync(r,{recursive:true,force:true});}vi.unstubAllEnvs();});
async function fixture(){
  const data=await sharp({create:{width:32,height:32,channels:3,background:"#9acabb"}}).jpeg().toBuffer(),a=saveAsset(data,"照片.jpg");
  const asset={...makeAsset(a.src,"照片.jpg","page"),storagePath:a.storagePath};
  const draft=setWorkbenchPageCount(createWorkbenchDraft(false),1);draft.title="小禾 / 下载测试";draft.pages[0].text="蔺澍和若汐的故事。";
  draft.pages[0].asset=asset;draft.cover=asset; // Deliberately shared object references.
  draft.studio={pages:{"1":{typography:{fontFamily:"brush",size:53.5,color:"#194a70",backing:true,backingColor:"#fff2c8",backingRadius:19.5,backingBorderWidth:1.3,rotation:-4.5,shadow:true,strokeWidth:.7},versions:[{id:crypto.randomUUID(),createdAt:new Date().toISOString(),asset}]}}};
  return {project:createProject(draft),data};
}
it("downloads UTF-8 named files with HTTP range support and rejects traversal and escaping symlinks",async()=>{
  const {project}=await fixture(),relative="成品PDF/中文成品.pdf",data=Buffer.from("%PDF-1.7\n1234567890");saveProjectBookOutputs(project.id,project.draft,{[relative]:data});
  const url=`http://127.0.0.1:3100/api/local/projects/${project.id}/files?path=${encodeURIComponent(relative)}`,context={params:Promise.resolve({id:project.id})};
  const response=await files(new Request(url,{headers:{range:"bytes=3-8"}}),context);
  expect(response.status).toBe(206);expect(Buffer.from(await response.arrayBuffer())).toEqual(data.subarray(3,9));
  expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''%E4%B8%AD");
  expect(response.headers.get("content-range")).toBe(`bytes 3-8/${data.length}`);
  const oldTag=response.headers.get("etag")!;
  const changed=Buffer.from("%PDF-1.7\nnew edition");saveProjectBookOutputs(project.id,project.draft,{[relative]:changed});
  const resumed=await files(new Request(url,{headers:{range:"bytes=3-8","if-range":oldTag}}),context);
  expect(resumed.status).toBe(200);expect(Buffer.from(await resumed.arrayBuffer())).toEqual(changed);
  expect((await files(new Request(url,{headers:{range:"bytes=999999-"}}),context)).status).toBe(416);
  expect((await files(new Request(url.replace(encodeURIComponent(relative),encodeURIComponent("../storybloom.sqlite"))),context)).status).toBe(400);
  const folder=getProjectBookFolder(project.id),outside=path.join(root,"outside.txt");fs.writeFileSync(outside,"private");fs.symlinkSync(outside,path.join(folder.directory,"成品PDF","escape.txt"));
  expect((await files(new Request(url.replace(encodeURIComponent(relative),encodeURIComponent("成品PDF/escape.txt"))),context)).status).toBe(403);
});
it("streams a complete portable project and restores images, typography and history into another data directory",async()=>{
  const {project,data}=await fixture(),archive=projectArchiveEntries(project.id,"project"),response=streamProjectArchive(archive.name,archive.entries),bytes=new Uint8Array(await response.arrayBuffer());
  const entries=unzipSync(bytes),manifest=JSON.parse(strFromU8(entries["kidbook-project.json"]));expect(manifest.assets).toHaveLength(1);
  expect(entries[manifest.assets[0].file]).toEqual(new Uint8Array(data));expect(strFromU8(entries["项目配置.json"])).not.toContain("CUSTOM_BOOK_IMAGE_API_KEY");
  const other=fs.mkdtempSync(path.join(os.tmpdir(),"kidbook-restore-"));roots.push(other);vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",other);
  try{
    const restored=await importProjectArchive(bytes),draft=getProject(restored.id).draft;
    expect(restored.id).not.toBe(project.id);expect(draft.pages[0].asset!.storagePath).not.toBe(project.draft.pages[0].asset!.storagePath);
    expect(readAsset(draft.pages[0].asset!.storagePath!)).toEqual(data);
    expect(draft.studio?.pages?.["1"]?.typography).toEqual(project.draft.studio?.pages?.["1"]?.typography);
    expect(draft.studio?.pages?.["1"]?.versions?.[0].asset.storagePath).toBe(draft.pages[0].asset!.storagePath);
    expect(draft.cover?.src).toBe(draft.pages[0].asset?.src);
  }finally{vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",root);}
  expect(getProject(project.id).draft.pages[0].asset?.storagePath).toBe(project.draft.pages[0].asset?.storagePath);
});
it("rejects broken backups and unsafe ZIP paths before importing a project",async()=>{
  await expect(importProjectArchive(zipSync({"../outside.txt":strToU8("bad")}))).rejects.toThrow("格式无效");
  await expect(importProjectArchive(zipSync({"配置.json":strToU8("{}")}))).rejects.toThrow("完整项目备份");
  await expect(importProjectArchive(zipSync({"kidbook-project.json":strToU8("null")}))).rejects.toThrow("版本或内容不支持");
  const {project}=await fixture(),archive=projectArchiveEntries(project.id,"project"),bytes=new Uint8Array(await streamProjectArchive(archive.name,archive.entries).arrayBuffer()),entries=unzipSync(bytes);
  const manifest=JSON.parse(strFromU8(entries["kidbook-project.json"]));manifest.assets[0].sha256="0".repeat(64);entries["kidbook-project.json"]=strToU8(JSON.stringify(manifest));
  await expect(importProjectArchive(zipSync(entries))).rejects.toThrow("校验失败");
});
it("preserves separately named print variants with the same inner PDF filename",async()=>{
  const {project}=await fixture(),first="成品PDF/A4_印厂版/02_内页_A4.pdf",second="成品PDF/A4_办公版/02_内页_A4.pdf";
  saveProjectBookOutputs(project.id,project.draft,{[first]:Buffer.from("%PDF-1.7\npress"),[second]:Buffer.from("%PDF-1.7\noffice")});
  const archive=projectArchiveEntries(project.id,"project"),restored=await importProjectArchive(new Uint8Array(await streamProjectArchive(archive.name,archive.entries).arrayBuffer())),directory=getProjectBookFolder(restored.id).directory;
  expect(fs.readFileSync(path.join(directory,first),"utf8")).toContain("press");expect(fs.readFileSync(path.join(directory,second),"utf8")).toContain("office");
});
it("restores source photos and production notes while keeping outdated PDFs marked outdated",async()=>{
  const {project,data}=await fixture(),folder=getProjectBookFolder(project.id),sourcePhoto="图片/人物参考/客户原始照片.jpg";
  fs.writeFileSync(path.join(folder.directory,sourcePhoto),data);
  saveProjectBookOutputs(project.id,project.draft,{"成品PDF/旧正文.pdf":Buffer.from("%PDF-1.7\nold"),"成品PDF/制作说明.txt":strToU8("骑马订制作说明")});
  saveProject(project.id,{...project.draft,pages:project.draft.pages.map(p=>({...p,text:"已经修改的正文。"}))},project.revision);
  expect(getProjectBookFolder(project.id).pdfOutdated).toBe(true);
  const archive=projectArchiveEntries(project.id,"project"),restored=await importProjectArchive(new Uint8Array(await streamProjectArchive(archive.name,archive.entries).arrayBuffer())),location=getProjectBookFolder(restored.id);
  expect(location.pdfOutdated).toBe(true);expect(fs.readFileSync(path.join(location.directory,sourcePhoto))).toEqual(data);
  expect(fs.readFileSync(path.join(location.directory,"成品PDF/制作说明.txt"),"utf8")).toContain("骑马订");
});
