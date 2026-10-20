import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LocalError } from "./store";
import { LOCAL_DRAFT_BYTES } from "../book-config";
import { workbenchRequestError } from "../workbench-access";
import { assertWorkbenchSession } from "./workbench-auth";

// Session enforcement also lives in each Node route, independent of middleware.
export function assertLocalRequest(request: Request) {
  const error=workbenchRequestError(request);if(error)throw new LocalError(error.message,error.status);
  assertWorkbenchSession(request);
}
export function localJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function localError(error: unknown) {
  if (error instanceof LocalError) return localJson({error:error.message},error.status);
  if (error instanceof ZodError) return localJson({ error: "请检查填写内容、页数与素材格式。" }, 400);
  console.error("Local workbench request failed", error instanceof Error ? error.name : "UnknownError");
  return localJson({ error: "本地保存或读取失败，请检查数据目录和磁盘空间后重试。" }, 500);
}

export async function boundedBody(request:Request,max:number) {
  if(Number(request.headers.get("content-length")||0)>max)throw new LocalError("内容过大。",413);
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const parts:Uint8Array[]=[];let size=0;
  try {while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>max){await reader.cancel();throw new LocalError("内容过大。",413);}parts.push(next.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export async function smallJson(request:Request,max=LOCAL_DRAFT_BYTES) {
  const bytes=await boundedBody(request,max);try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new LocalError("请求内容不是有效的 JSON。");}
}
