import { z } from "zod";
import { assertLocalRequest,localError } from "@/lib/local/http";
import { projectArchiveEntries,streamProjectArchive } from "@/lib/local/project-archive";
export const runtime="nodejs";
export const maxDuration=300;
export async function GET(request:Request,c:{params:Promise<{id:string}>}) {try {
  assertLocalRequest(request);const {id}=await c.params,kind=z.enum(["project","images","delivery"]).parse(new URL(request.url).searchParams.get("kind")||"project"),archive=projectArchiveEntries(id,kind);
  return streamProjectArchive(archive.name,archive.entries);
}catch(e){return localError(e);}}
