import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { assertLocalRequest,boundedBody,localError,localJson } from "@/lib/local/http";
import { getProject,saveProjectBookOutputs,LocalError } from "@/lib/local/store";
import { bookFileName } from "@/lib/local/book-files";
import { pdfPageNumbers } from "@/lib/custom-book/reader";
export const runtime="nodejs";
export const maxDuration=300;
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,c:Context) {
  try {
    assertLocalRequest(request);const id=(await c.params).id,project=getProject(id);
    const revision=z.coerce.number().int().positive().parse(request.headers.get("x-project-revision"));
    if(revision!==project.revision)throw new LocalError("绘本在导出期间发生修改，请重新导出当前版本。",409);
    const bytes=await boundedBody(request,128*1024*1024);
    if(Buffer.from(bytes.subarray(0,5)).toString()!=="%PDF-")throw new LocalError("没有收到有效的 PDF 文件。");
    let pdf:PDFDocument;try{pdf=await PDFDocument.load(bytes);}catch{throw new LocalError("PDF 文件读取失败，请重新导出。");}
    if(pdf.getPageCount()!==pdfPageNumbers(project.draft).length)throw new LocalError("PDF 页数与当前绘本不一致，请重新导出。");
    if(getProject(id).revision!==revision)throw new LocalError("绘本在导出期间发生修改，请重新导出当前版本。",409);
    const relative=`成品PDF/${bookFileName(project.draft.title,"绘本")}_阅读成品.pdf`;
    return localJson({...saveProjectBookOutputs(id,project.draft,{[relative]:bytes}),url:`/api/local/projects/${id}/files?path=${encodeURIComponent(relative)}`});
  }catch(e){return localError(e);}
}
