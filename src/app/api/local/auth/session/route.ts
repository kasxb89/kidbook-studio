import { workbenchLoginEnabled,workbenchRequestError } from "@/lib/workbench-access";
import { workbenchSession } from "@/lib/local/workbench-auth";
import { localError,localJson } from "@/lib/local/http";
import { LocalError } from "@/lib/local/store";
export const runtime="nodejs";
export async function GET(request:Request) {
  try {const error=workbenchRequestError(request);if(error)throw new LocalError(error.message,error.status);const session=workbenchSession(request);return localJson({enabled:workbenchLoginEnabled(),username:session?.username||null});}
  catch(error){return localError(error);}
}
