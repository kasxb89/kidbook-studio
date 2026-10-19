import "server-only";
import { z } from "zod";
import { getStoryTextEndpoint } from "./text-endpoint";
import {
  bookBriefSchema,
  createBookBrief,
  DOMAIN_SCENARIOS,
  learningKindForScenario,
} from "../book-domain";
import type { CustomWorkbenchDraft } from "../custom-workbench";
import { visualStyleFor } from "./visual-style";
import { prepareBookPrompt } from "./prompts";
import { bookDirectionSchema } from "./direction";
const proposalSchema = z.object({
  direction: bookDirectionSchema,
  title: z.string().min(1).max(100),
  theme: z.string().min(1).max(300),
  brief: bookBriefSchema,
  characters: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        role: z.string().max(100),
        appearance: z.string().max(1000),
        personality: z.string().max(500),
        outfit: z.string().max(500),
      }),
    )
    .min(1)
    .max(4),
});
export async function prepareBookInput(
  draft: CustomWorkbenchDraft,
): Promise<CustomWorkbenchDraft> {
  if (!draft.characters[0]?.name.trim() || !draft.story.trim())
    throw new Error("请填写孩子称呼，并用几句话说说想写的故事。");
  if (draft.brief?.domain === "memories" && draft.story.length > 10000)
    throw new Error("真实经历请控制在 10000 字以内，或分成两本绘本。 ");
  const endpoint = getStoryTextEndpoint();
  if (!endpoint) throw new Error("故事模型尚未配置。");
  const domain = draft.brief?.domain || "habits";
  const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(100_000),
    body: JSON.stringify({
      model: process.env.CUSTOM_BOOK_TEXT_MODEL || "deepseek-v4-pro",
      ...(new URL(endpoint.baseUrl).hostname === "api.deepseek.com"
        ? { thinking: { type: "disabled" } }
        : {}),
      temperature: 0.5,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: prepareBookPrompt(draft),
        },
        {
          role: "user",
          content: JSON.stringify({
            domain,
            selectedScenario:draft.brief?.scenario||"",
            availableScenarios:DOMAIN_SCENARIOS[domain],
            age: draft.age,
            language: draft.language,
            pageCount: draft.pageCount,
            visualStyle: visualStyleFor(draft),
            title: draft.title,
            source: draft.story,
            characters: draft.characters.map(({ asset, ...c }) => c),
            brief: draft.brief,
          }),
        },
      ],
    }),
  });
  if (!response.ok)
    throw new Error(`AI 整理暂时失败（${response.status}），已保留填写内容。`);
  const raw = await response.json();
  const text = raw.choices?.[0]?.message?.content;
  let proposal: z.infer<typeof proposalSchema>;
  try {
    proposal = proposalSchema.parse(
      JSON.parse(
        String(text)
          .replace(/^```(?:json)?\s*/, "")
          .replace(/\s*```$/, ""),
      ),
    );
  } catch {
    throw new Error("AI 整理结果格式不完整，请重试；原内容未改动。");
  }
  // Keep existing cast IDs, assets and page references; only add explicitly suggested new cast.
  const characters = draft.characters.map((c, i) => {
    const suggestion =
      proposal.characters.find((p) => p.name === c.name) ||
      (i === 0 ? proposal.characters[0] : undefined);
    return suggestion
      ? {
          ...c,
          ...suggestion,
          id: c.id,
          name: c.name || suggestion.name,
          asset: c.asset,
          appearance: c.appearance || suggestion.appearance,
          outfit: c.outfit || suggestion.outfit,
        }
      : c;
  });
  for (const c of proposal.characters.slice(1))
    if (draft.story.includes(c.name) && !characters.some((p) => p.name === c.name) && characters.length < 4)
      characters.push({ ...c, id: crypto.randomUUID(), asset: undefined });
  const selectedScenario=draft.brief?.scenario.trim();
  const brief = { ...proposal.brief, domain, scenario:selectedScenario||proposal.brief.scenario, factsConfirmed: false };
  if(domain==="learning")brief.learningKind=selectedScenario?draft.brief!.learningKind:learningKindForScenario(brief.scenario)||proposal.brief.learningKind;
  if (domain === "memories") {
    brief.facts = draft.story;
    brief.allowedImagination = draft.brief?.allowedImagination || "";
    brief.childQuote = draft.brief?.childQuote || "";
  }
  return {
    ...draft,
    title: draft.title.trim() || proposal.title,
    theme: proposal.theme,
    direction: proposal.direction,
    characters,
    brief,
    studio: { ...draft.studio, aiPrepared: true },
  };
}
