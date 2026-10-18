import { z } from "zod";
import { MAX_BOOK_PAGES } from "@/lib/book-config";
import { advanceJob, getJob, updateJob } from "@/lib/local/jobs";
import { assertLocalRequest,localError,localJson } from "@/lib/local/http";
import { customPageSchema } from "@/lib/custom-book/schema";
import { smallJson } from "@/lib/local/http";
export const runtime="nodejs";export const maxDuration=300;
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,c:Context){try{assertLocalRequest(request);return localJson(getJob((await c.params).id));}catch(e){return localError(e);}}
const action=z.discriminatedUnion("action",[
  z.object({action:z.literal("advance"),retry:z.boolean().optional()}),
  z.object({action:z.literal("cancel")}),
  z.object({action:z.literal("confirm"),pages:z.array(customPageSchema.omit({asset:true})).min(1).max(MAX_BOOK_PAGES)}),
]);
export async function POST(request:Request,c:Context){try{assertLocalRequest(request);const id=(await c.params).id;const b=action.parse(await smallJson(request));return localJson(b.action==="advance"?await advanceJob(id,b.retry):updateJob(id,b));}catch(e){return localError(e);}}
