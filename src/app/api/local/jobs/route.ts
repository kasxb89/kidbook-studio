import { z } from "zod";
import { listJobs, modelStatus, createJob } from "@/lib/local/jobs";
import { assertLocalRequest, localError, localJson } from "@/lib/local/http";
import { localDraftSchema } from "@/lib/local/schema";
import { smallJson } from "@/lib/local/http";
export const runtime="nodejs";
export async function GET(request:Request){try{assertLocalRequest(request);const projectId=new URL(request.url).searchParams.get("projectId");return localJson({configured:modelStatus(),jobs:projectId?listJobs(projectId):[]});}catch(e){return localError(e);}}
export async function POST(request:Request){try{assertLocalRequest(request);const b=z.object({id:z.string().uuid(),projectId:z.string().uuid(),draft:localDraftSchema}).parse(await smallJson(request));return localJson(createJob(b.id,b.projectId,b.draft));}catch(e){return localError(e);}}
