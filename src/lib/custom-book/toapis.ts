import "server-only";
import { database } from "../local/store";
import type { Reference } from "./provider";

type Config = { apiKey: string; baseUrl: string };
type Task = { id?: string; status?: string; url?: string; result?: { data?: { url?: string }[] } };
function providerUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("生图服务未返回图片地址。");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !["toapis.com", "toapis.cn"].some(d => url.hostname === d || url.hostname.endsWith(`.${d}`)))
    throw new Error("生图服务返回了不支持的图片地址。");
  return url.href;
}
async function jsonRequest(config: Config, route: string, init: RequestInit = {}, signal?: AbortSignal) {
  const response = await fetch(`${config.baseUrl}${route}`, {
    ...init, headers: { Authorization: `Bearer ${config.apiKey}`, ...init.headers },
    redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`ToAPIs 请求失败（${response.status}）。`);
  return response.json();
}
export async function requestToapisImage(config: Config, prompt: string, references: Reference[], size: string, model: string, requestId?: string, resolution: "1k" | "2k" | "4k" = "1k") {
  const signal = AbortSignal.timeout(240_000);
  const deadline = Date.now() + 210_000;
  const db = database();
  db.exec("CREATE TABLE IF NOT EXISTS image_provider_tasks (id TEXT PRIMARY KEY, task_id TEXT NOT NULL)");
  const cached = requestId ? db.prepare("SELECT task_id FROM image_provider_tasks WHERE id=?").get(requestId) : undefined;
  let task: Task;
  if (cached) task = { id: String(cached.task_id) };
  else {
    const urls: string[] = [];
    for (const [i, ref] of references.entries()) {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(ref.bytes)], { type: "image/jpeg" }), `reference-${i + 1}.jpg`);
      const uploaded = await jsonRequest(config, "/uploads/images", { method: "POST", body: form }, signal);
      urls.push(providerUrl(uploaded.data?.url));
    }
    task = await jsonRequest(config, "/images/generations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, n: 1, size: size === "1536x1024" ? "3:2" : size === "1024x1536" ? "2:3" : "1:1", resolution, response_format: "url", ...(urls.length ? { reference_images: urls } : {}) }),
    }, signal);
    if (!task.id || !/^[a-zA-Z0-9_-]{1,200}$/.test(task.id)) throw new Error("生图服务未返回有效任务编号。");
    if (requestId) db.prepare("INSERT INTO image_provider_tasks(id,task_id) VALUES(?,?)").run(requestId, task.id);
  }
  // Persist the remote ID before polling: reloads and explicit retries reuse the same paid task.
  while (task.status !== "completed") {
    if (["failed", "cancelled", "canceled"].includes(task.status || "")) {
      if (requestId) db.prepare("DELETE FROM image_provider_tasks WHERE id=?").run(requestId);
      throw new Error("ToAPIs 生图失败，已保留完成页面，可重试当前步骤。");
    }
    if (Date.now() >= deadline) throw new Error("图片仍在服务商生成中，请恢复当前步骤查询原任务，不会重复提交。");
    if (task.status) await new Promise(resolve => setTimeout(resolve, 3000));
    task = await jsonRequest(config, `/images/generations/${encodeURIComponent(task.id!)}`, {}, signal);
  }
  const url = providerUrl(task.result?.data?.[0]?.url || task.url);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
  if (!response.ok || !response.body) throw new Error("生成图片下载失败，可恢复原任务重试。");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > 30_000_000) { await reader.cancel(); throw new Error("生成图片超过大小限制。"); }
      parts.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
