import { workbenchRequestError } from "@/lib/workbench-access";
import { loginWorkbench,workbenchCookie } from "@/lib/local/workbench-auth";
import { localError,localJson,smallJson } from "@/lib/local/http";
import { LocalError } from "@/lib/local/store";
import { z } from "zod";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    const error=workbenchRequestError(request);if(error)throw new LocalError(error.message,error.status);
    const body=z.object({username:z.string().min(1).max(100),password:z.string().min(1).max(256)}).parse(await smallJson(request,2048));
    const result=await loginWorkbench(request,body.username,body.password),response=localJson({username:result.username});
    response.headers.set("Set-Cookie",workbenchCookie(result.token));return response;
  }catch(error){const response=localError(error);if(response.status===429)response.headers.set("Retry-After","900");return response;}
}
