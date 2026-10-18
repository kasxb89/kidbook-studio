import "server-only";
import crypto from "node:crypto";
import sharp from "sharp";
import { recordStudioChanges } from "../book-studio";
import { requestCustomImage,customImageConfig } from "../custom-book/provider";
import { database,getProject,saveProject,saveAsset,LocalError } from "./store";
import { artworkBytes,preflightPrint,sourceForPrint } from "./print";

export async function preparePrintImage(projectId:string,page:number) {
  const initial=getProject(projectId);
  if(page<0||page>initial.draft.pageCount)throw new LocalError("印刷页码无效。");
  const source=sourceForPrint(initial.draft,page),asset=source.asset;
  if(!asset)throw new LocalError("请先上传或生成此页插图。");
  const report=await preflightPrint(initial.draft);
  if(!report.checks.some(c=>c.upgradePage===source.upgradePage&&c.needsUpgrade))return {project:initial,report};
  const original=await artworkBytes(asset),meta=await sharp(original).metadata();
  const db=database();
  db.exec("CREATE TABLE IF NOT EXISTS print_enhancements(id TEXT PRIMARY KEY,asset_id TEXT,lease_until INTEGER)");
  // Fixed source identity and provider task ID make interrupted paid calls resumable.
  const key="print4k-"+crypto.createHash("sha256").update(`${projectId}:${asset.storagePath||asset.src}`).digest("hex");
  let record=db.prepare("SELECT * FROM print_enhancements WHERE id=?").get(key);
  if(!record?.asset_id) {
    if((meta.width||0)>=2800&&(meta.height||0)>=1900)throw new LocalError("此页已是高清图，当前取景仍低于300ppi；请减小放大取景或印刷插图宽度。");
    db.prepare("INSERT OR IGNORE INTO print_enhancements(id) VALUES(?)").run(key);
    const now=Date.now();
    const claimed=db.prepare("UPDATE print_enhancements SET lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<?)").run(now+300000,key,now);
    if(!claimed.changes)throw new LocalError("此页高清图正在处理；若程序曾中断，请在五分钟后继续。",409);
    try {
      const model=customImageConfig().model;
      if(model!=="gpt-image-2")throw new LocalError("高清准备目前使用已配置的 gpt-image-2。");
      const ratio=(meta.width||1)/(meta.height||1),size=ratio>1.2?"1536x1024":ratio<.84?"1024x1536":"1024x1024";
      const content=page===0?initial.draft.title:initial.draft.pages[source.upgradePage-1].scene;
      const prompt=`Create a high-resolution print master of this exact existing children's book illustration. Preserve the entire image composition, crop, all faces, identities, outfits, object colors, object counts, poses, camera angle and every story event. Preserve the exact watercolor and paper texture. Improve fine detail and clean edges for a large print. Do not add or remove doors, paths, flags, people, toys or decorative elements. Never create panels or a collage. Scene data: ${content}. ${asset.embeddedText?`Preserve these exact existing words without additions or changes: ${JSON.stringify(asset.embeddedText)}`:"No text, lettering, watermark or border."}`;
      const bytes=await requestCustomImage(prompt,[{bytes:original,label:"The exact source to reproduce at higher resolution; preserve all visual facts."}],size,model,key,"4k");
      const info=await sharp(bytes).metadata();
      if(!info.width||!info.height||Math.max(info.width,info.height)<2300)throw new LocalError("服务商返回的像素不足以作为高清版，请保留原图并检查模型输出。");
      const stored=saveAsset(bytes,`print-master-${projectId}-${source.upgradePage}`);
      db.prepare("UPDATE print_enhancements SET asset_id=?,lease_until=NULL WHERE id=?").run(stored.id,key);
    }catch(e){db.prepare("UPDATE print_enhancements SET lease_until=NULL WHERE id=?").run(key);throw e;}
    record=db.prepare("SELECT * FROM print_enhancements WHERE id=?").get(key);
  }
  const fresh=getProject(projectId),current=sourceForPrint(fresh.draft,source.upgradePage).asset;
  if((current?.storagePath||current?.src)!==(asset.storagePath||asset.src))throw new LocalError("此页原图已在另一窗口更换，高清结果已保留，未覆盖当前页。",409);
  const id=String(record!.asset_id),next={...asset,id,storagePath:id,src:`/api/local/assets/${id}`,origin:"generated" as const,name:`${page?`第${source.upgradePage}页`:"封面"} · 印刷高清`};
  const incoming=structuredClone(fresh.draft);
  if(source.upgradePage===0)incoming.cover=next;else incoming.pages[source.upgradePage-1].asset=next;
  const project=saveProject(projectId,recordStudioChanges(fresh.draft,incoming),fresh.revision);
  return {project,report:await preflightPrint(project.draft)};
}
