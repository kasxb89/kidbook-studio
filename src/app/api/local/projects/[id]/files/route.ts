import { assertLocalRequest,localError,localJson } from "@/lib/local/http";
import { listBookDownloads,resolveBookDownload,sendBookFile } from "@/lib/local/downloads";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,c:Context) {try {
  assertLocalRequest(request);const {id}=await c.params,relative=new URL(request.url).searchParams.get("path");
  return relative!==null?sendBookFile(request,resolveBookDownload(id,relative)):localJson(listBookDownloads(id));
}catch(e){return localError(e);}}
export const HEAD=GET;
