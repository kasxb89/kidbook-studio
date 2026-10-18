import { LOCAL_DRAFT_BYTES } from "@/lib/book-config";
import { z } from "zod";
import { getProject, saveProject } from "@/lib/local/store";
import { assertLocalRequest, localError, localJson } from "@/lib/local/http";
import { localDraftSchema } from "@/lib/local/schema";
import { smallJson } from "@/lib/local/http";
export const runtime = "nodejs";
type Context = {params: Promise<{id:string}>};
export async function GET(request:Request,c:Context) {try {assertLocalRequest(request);return localJson(getProject((await c.params).id));}catch(e){return localError(e);}}
export async function PUT(request:Request,c:Context) {try {
  assertLocalRequest(request);
  const body=z.object({draft:localDraftSchema,revision:z.number().int().positive()}).parse(await smallJson(request, LOCAL_DRAFT_BYTES));
  return localJson(saveProject((await c.params).id,body.draft,body.revision));
}catch(e){return localError(e);}}
