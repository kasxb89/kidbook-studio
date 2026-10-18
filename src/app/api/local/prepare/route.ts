import { LOCAL_DRAFT_BYTES } from "@/lib/book-config";
import { assertLocalRequest, localError, localJson, smallJson } from "@/lib/local/http";
import { LocalError } from "@/lib/local/store";
import { localDraftSchema } from "@/lib/local/schema";
import { prepareBookInput } from "@/lib/custom-book/prepare";
export const runtime="nodejs";
export async function POST(request:Request){try{
  assertLocalRequest(request);const body=await smallJson(request,LOCAL_DRAFT_BYTES);const draft=localDraftSchema.parse(body.draft);
  if(!draft.characters[0]?.name.trim()||!draft.story.trim())throw new LocalError("请填写孩子称呼和故事经历。");
  try{return localJson({draft:localDraftSchema.parse(await prepareBookInput(draft))});}catch(e){throw new LocalError(e instanceof Error?e.message:"AI 整理失败，请重试。",502);}
}catch(e){return localError(e);}}
