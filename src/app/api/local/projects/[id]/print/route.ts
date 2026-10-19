import { z } from "zod";
import { MAX_BOOK_PAGES } from "@/lib/book-config";
import { assertLocalRequest,smallJson,localJson,localError } from "@/lib/local/http";
import { getProject,LocalError } from "@/lib/local/store";
import { exportPrintBook,preflightPrint } from "@/lib/local/print";
import { preparePrintImage } from "@/lib/local/print-images";
import { savePrintOutputs } from "@/lib/local/print-output";
export const runtime="nodejs";
export const maxDuration=300;
type Context={params:Promise<{id:string}>};
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("preflight")}),
  z.object({action:z.literal("enhance"),page:z.number().int().min(0).max(MAX_BOOK_PAGES)}),
  z.object({action:z.literal("export"),format:z.enum(["pdf","zip"]),proofread:z.boolean().optional()}),
]);
export async function POST(request:Request,c:Context) {try{
  assertLocalRequest(request);const {id}=await c.params;const body=input.parse(await smallJson(request,4000));
  if(body.action==="enhance")return localJson(await preparePrintImage(id,body.page));
  const project=getProject(id);
  if(body.action==="preflight")return localJson(await preflightPrint(project.draft));
  if(!body.proofread&&[project.draft.cover,...project.draft.pages.slice(0,project.draft.pageCount).map(p=>p.asset)].some(a=>a?.embeddedText))throw new LocalError("图文一体成品请先逐页核对并勾选校对确认。",422);
  const zip=body.format==="zip",output=await exportPrintBook(project.draft,zip);
  savePrintOutputs(id,project.draft,output,zip);
  const name=`${project.draft.title||"绘本"}_A4_${project.draft.print?.mode==="office"?"办公打印":"印刷"}.${zip?"zip":"pdf"}`;
  return new Response(new Uint8Array(zip?output.zip:output.pdf),{headers:{"Content-Type":zip?"application/zip":"application/pdf","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(name)}`,"Cache-Control":"no-store"}});
}catch(e){return localError(e);}}
