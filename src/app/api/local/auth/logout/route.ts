import { workbenchRequestError } from "@/lib/workbench-access";
import { logoutWorkbench,workbenchCookie } from "@/lib/local/workbench-auth";
import { localError,localJson } from "@/lib/local/http";
import { LocalError } from "@/lib/local/store";
export const runtime="nodejs";
export async function POST(request:Request) {
  try {
    const error=workbenchRequestError(request);if(error)throw new LocalError(error.message,error.status);
    logoutWorkbench(request);const response=localJson({loggedOut:true});response.headers.set("Set-Cookie",workbenchCookie(""));return response;
  }catch(error){return localError(error);}
}
