import sharp from "sharp";
import { saveAsset, LocalError } from "@/lib/local/store";
import { assertLocalRequest, localError, localJson } from "@/lib/local/http";
import { boundedBody } from "@/lib/local/http";
export const runtime="nodejs";
export async function POST(request:Request) {try {
  assertLocalRequest(request);
  const bytes=await boundedBody(request,16*1024*1024);
  const form=await new Response(bytes,{headers:{"Content-Type":request.headers.get("content-type")||""}}).formData();
  const file=form.get("file");
  if(!(file instanceof File)||file.size>15*1024*1024||!["image/png","image/jpeg","image/webp"].includes(file.type)) throw new LocalError("请选择 15 MB 以内的 JPG、PNG 或 WebP 图片。");
  let image:Buffer;
  try {image=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:30_000_000}).rotate().jpeg({quality:96}).toBuffer();}
  catch {throw new LocalError("图片无法解码，请换一张图片。");}
  return localJson(saveAsset(image,file.name));
}catch(e){return localError(e);}}
