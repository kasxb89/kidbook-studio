import { afterEach, expect, it, vi } from "vitest";
import { prepareBookInput } from "@/lib/custom-book/prepare";
import { createWorkbenchDraft } from "@/lib/custom-workbench";
vi.mock("@/lib/custom-book/text-endpoint", () => ({
  getStoryTextEndpoint: () => ({
    baseUrl: "https://text.example/v1",
    apiKey: "test",
  }),
}));
afterEach(() => vi.unstubAllGlobals());
function response(brief:Record<string,unknown>={}) {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "若汐的小沙堡",
              theme: "换个办法再试",
              brief: {
                domain: "habits",
                habitGoal: "换个办法再试",
                trigger: "沙子散了",
                ...brief,
              },
              characters: [
                {
                  name: "若汐",
                  role: "主角",
                  appearance: "插画建议",
                  personality: "好奇",
                  outfit: "黄色外套",
                },
              ],
            }),
          },
        },
      ],
    }),
  );
}
it("prepares settings while retaining uploaded identity, page IDs and original source", async () => {
  const d = createWorkbenchDraft(false);
  d.characters[0].name = "若汐";
  d.characters[0].appearance = "已确认的短发形象";
  d.characters[0].outfit = "蓝色裙子";
  d.story = "先用干沙，失败后改用湿沙。";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response()),
  );
  const r = await prepareBookInput(d);
  expect(r.characters[0].id).toBe(d.characters[0].id);
  expect(r.characters[0].appearance).toBe("已确认的短发形象");
  expect(r.characters[0].outfit).toBe("蓝色裙子");
  expect(r.story).toBe(d.story);
  expect(r.studio?.aiPrepared).toBe(true);
  expect(d.title).toBe("");
});
it("does not automatically confirm real memories or invent quotes", async () => {
  const d = createWorkbenchDraft(false);
  d.characters[0].name = "若汐";
  d.story = "孩子在沙池堆沙堡。";
  d.brief!.domain = "memories";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response()),
  );
  const r = await prepareBookInput(d);
  expect(r.brief?.domain).toBe("memories");
  expect(r.brief?.factsConfirmed).toBe(false);
  expect(r.brief?.facts).toBe(d.story);
  expect(r.brief?.childQuote).toBe("");
});
it("retains the chosen scenario and recognition type when the model suggests another",async()=>{
  const d=createWorkbenchDraft(false);d.characters[0].name="若汐";d.story="用家人的称呼学习爸、妈。";
  Object.assign(d.brief!,{domain:"learning",scenario:"家庭称呼汉字",learningKind:"characters"});
  const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>response({domain:"learning",scenario:"交通工具",learningKind:"objects",targets:"爸、妈"}));vi.stubGlobal("fetch",fetcher);
  const r=await prepareBookInput(d);
  expect(r.brief?.scenario).toBe("家庭称呼汉字");expect(r.brief?.learningKind).toBe("characters");
  const sent=JSON.parse(fetcher.mock.calls[0][1]!.body as string);const input=JSON.parse(sent.messages[1].content);
  expect(input.selectedScenario).toBe("家庭称呼汉字");expect(input.availableScenarios).toHaveLength(20);
});
it("lets AI recommend a scene and aligns its learning type with the catalog",async()=>{
  const d=createWorkbenchDraft(false);d.characters[0].name="若汐";d.story="观察开心、难过和生气的表情。";d.brief!.domain="learning";
  vi.stubGlobal("fetch",vi.fn(async()=>response({domain:"learning",scenario:"认识表情",learningKind:"characters"})));
  const r=await prepareBookInput(d);expect(r.brief?.scenario).toBe("认识表情");expect(r.brief?.learningKind).toBe("pictures");
});
