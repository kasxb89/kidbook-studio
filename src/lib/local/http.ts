import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LocalError } from "./store";
import { LOCAL_DRAFT_BYTES } from "../book-config";

// No login for a loopback-only workbench, but reject foreign origins and non-loopback hosts.
export function assertLocalRequest(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  let actual:URL;
  try { actual = new URL(`${url.protocol}//${host}`); } catch { throw new LocalError("无效的本机地址。",403); }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(actual.hostname) || actual.host !== host) throw new LocalError("本地工作台仅允许本机访问。", 403);
  const origin = request.headers.get("origin");
  if ((origin && origin !== actual.origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new LocalError("不接受其他网站发起的本地操作。", 403);
}
export function localJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function localError(error: unknown) {
  if (error instanceof LocalError) return localJson({ error: error.message }, error.status);
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
