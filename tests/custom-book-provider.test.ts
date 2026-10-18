import { afterEach, describe, it, expect, vi } from "vitest";
import {
  customImageConfig,
  requestCustomImage,
  generateCustomOutlinePlan,
  generateCustomOutline,
} from "@/lib/custom-book/provider";
import {createWorkbenchDraft,setWorkbenchPageCount} from "@/lib/custom-workbench";
import type {ServerDraft} from "@/lib/custom-book/schema";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("custom workbench GPT routing", () => {
  it("rejects incomplete full-book plans and passes the saved rhythm to later batches",async()=>{
    vi.stubEnv("CUSTOM_BOOK_TEXT_BASE_URL","https://text.example/v1");vi.stubEnv("CUSTOM_BOOK_TEXT_API_KEY","test");vi.stubEnv("CUSTOM_BOOK_TEXT_MODEL","test-model");
    const draft=setWorkbenchPageCount(createWorkbenchDraft(false),24) as ServerDraft;
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({beats:["只有一页"]})}}]})));
    vi.stubGlobal("fetch",fetcher);
    await expect(generateCustomOutlinePlan(draft)).rejects.toThrow("全书规划页数不完整");
    const plan=Array.from({length:24},(_,i)=>`计划第${i+1}页`);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({beats:plan})}}]})));
    expect(await generateCustomOutlinePlan(draft)).toEqual(plan);
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({pages:Array.from({length:8},()=>({text:"继续故事",scene:"Child playing.",characters:["hero"]}))})}}]})));
    const result=await generateCustomOutline(draft,{start:8,count:8,plan});
    const sent=JSON.parse(fetcher.mock.calls[2][1].body);const brief=JSON.parse(sent.messages[1].content);
    expect(brief.requestedBeats).toEqual(plan.slice(8,16));expect(result.pages[8].text).toBe("继续故事");expect(result.pages[0].text).toBe("");
  });
  it("uses GPT Image 2 independently of the existing CPA model setting", () => {
    vi.stubEnv("CUSTOM_BOOK_IMAGE_MODEL", "");
    vi.stubEnv("CPA_IMAGE_MODEL", "gemini-3.1-flash-image");
    vi.stubEnv("CPA_API_KEY", "test");
    expect(customImageConfig().model).toBe("gpt-image-2");
  });
  it("calls the edit endpoint with references and refuses an invalid payload without fallback", async () => {
    vi.stubEnv("CPA_API_KEY", "test");
    vi.stubEnv("CPA_BASE_URL", "https://image.example/v1");
    vi.stubEnv("CUSTOM_BOOK_IMAGE_BASE_URL", "");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ url: "http://127.0.0.1/private" }] }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      requestCustomImage(
        "prompt",
        [{ bytes: new Uint8Array([1, 2, 3]), label: "hero" }],
        "1536x1024",
        "gpt-image-2",
      ),
    ).rejects.toThrow("未返回有效图片");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://image.example/v1/images/edits",
    );
    const form = fetcher.mock.calls[0][1].body as FormData;
    expect(form.get("model")).toBe("gpt-image-2");
    expect(form.get("size")).toBe("1536x1024");
    expect(form.getAll("image[]")).toHaveLength(1);
  });
});

it("keeps the whole plot out of editable cover requests so it does not become a storyboard", async () => {
  const { createWorkbenchDraft } = await import("@/lib/custom-workbench");
  const { imagePrompt } = await import("@/lib/custom-book/provider");
  const draft = createWorkbenchDraft(false);
  draft.title = "若汐的小沙堡";
  draft.story = "FULL_CHRONOLOGICAL_PLOT_SENTINEL";
  draft.pages[6].scene = "One child beside one small sandcastle.";
  const prompt = imagePrompt(draft as any, { kind: "cover", index: 0 });
  expect(prompt).not.toContain("FULL_CHRONOLOGICAL_PLOT_SENTINEL");
  expect(prompt).toContain("One child beside one small sandcastle.");
});
