import { assertLocalRequest,boundedBody,localError,localJson } from "@/lib/local/http";
import { importProjectArchive,PROJECT_IMPORT_LIMIT } from "@/lib/local/project-archive";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request) {try {
  assertLocalRequest(request);return localJson(await importProjectArchive(await boundedBody(request,PROJECT_IMPORT_LIMIT)),201);
}catch(e){return localError(e);}}
