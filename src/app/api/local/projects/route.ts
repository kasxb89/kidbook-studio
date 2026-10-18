import { LOCAL_DRAFT_BYTES } from "@/lib/book-config";
import { createWorkbenchDraft } from "@/lib/custom-workbench";
import { createProject, listProjects, validateDraftAssets } from "@/lib/local/store";
import { assertLocalRequest, localError, localJson } from "@/lib/local/http";
import { localDraftSchema } from "@/lib/local/schema";
import { smallJson } from "@/lib/local/http";
export const runtime = "nodejs";
export async function GET(request: Request) { try { assertLocalRequest(request); return localJson({ projects: listProjects() }); } catch(e) { return localError(e); } }
export async function POST(request: Request) { try {
  assertLocalRequest(request);
  const body = await smallJson(request, LOCAL_DRAFT_BYTES);
  const draft = localDraftSchema.parse(body.draft ?? createWorkbenchDraft(false));
  validateDraftAssets(draft);
  return localJson(createProject(draft));
} catch(e) { return localError(e); } }
