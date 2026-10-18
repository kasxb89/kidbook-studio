import { afterEach, expect, it, vi } from "vitest";
import { requestToapisImage } from "@/lib/custom-book/toapis";
vi.mock("@/lib/local/store", () => ({ database: () => ({ exec: vi.fn(), prepare: () => ({ get: () => ({ task_id: "task_existing" }), run: vi.fn() }) }) }));
afterEach(() => vi.unstubAllGlobals());
it("resumes an existing paid task and downloads its result without forwarding the API key", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: "task_existing", status: "completed", result: { data: [{ url: "https://files.toapis.com/generated/test.jpg" }] } }))).mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal("fetch", fetcher);
  expect(await requestToapisImage({ apiKey: "test", baseUrl: "https://toapis.cn/v1" }, "test", [], "1024x1024", "gpt-image-2", "job:0")).toEqual(Buffer.from([1,2,3]));
  expect(fetcher.mock.calls[0][0]).toContain("/task_existing");
  expect(fetcher.mock.calls[1][1].headers).toBeUndefined();
});
it("rejects private result URLs before downloading", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "task_existing", status: "completed", result: { data: [{ url: "http://127.0.0.1/private" }] } })));
  vi.stubGlobal("fetch", fetcher);
  await expect(requestToapisImage({ apiKey: "test", baseUrl: "https://toapis.cn/v1" }, "test", [], "1024x1024", "gpt-image-2", "job:0")).rejects.toThrow("不支持");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
