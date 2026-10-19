import { z } from "zod";
import { getAiInput,saveAiInput } from "@/lib/local/ai-input";
import { assertLocalRequest,localError,localJson,smallJson } from "@/lib/local/http";
import { localDraftSchema } from "@/lib/local/schema";
export const runtime="nodejs";
export async function GET(request:Request){try{assertLocalRequest(request);return localJson(getAiInput());}catch(e){return localError(e);}}
export async function PUT(request:Request){try{assertLocalRequest(request);const b=z.object({draft:localDraftSchema,revision:z.number().int().positive()}).parse(await smallJson(request));return localJson(saveAiInput(b.draft,b.revision));}catch(e){return localError(e);}}
