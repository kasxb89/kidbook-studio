import { z } from "zod";
import { assertLocalRequest,localError,localJson,smallJson } from "@/lib/local/http";
import { localStorageLocation,openLocalStorageLocation } from "@/lib/local/storage";
export const runtime="nodejs";
export async function GET(request:Request) {
  try{assertLocalRequest(request);const id=z.string().uuid().parse(new URL(request.url).searchParams.get("projectId"));return localJson(localStorageLocation(id));}catch(e){return localError(e);}
}
export async function POST(request:Request) {
  try{
    assertLocalRequest(request);
    const body=z.object({action:z.literal("open-folder"),projectId:z.string().uuid()}).strict().parse(await smallJson(request,1024));
    return localJson(await openLocalStorageLocation(body.projectId));
  }catch(e){return localError(e);}
}
