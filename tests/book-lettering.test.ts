import { describe, it, expect } from "vitest";
import { createWorkbenchDraft, setWorkbenchPageCount } from "@/lib/custom-workbench";
import { localDraftSchema } from "@/lib/local/schema";
import { customDraftSchema } from "@/lib/custom-book/schema";
import { layoutStoryText, storyTextPlan, letteringEmphasis, validLetteringLines, STORYBOOK_TYPOGRAPHY } from "@/lib/custom-book/lettering";
import { applyBookTypography, pageTypography } from "@/lib/custom-book/typography";
import { imagePrompt } from "@/lib/custom-book/provider";
import { bookProductionText } from "@/lib/book-production";

const measure = (text: string, size: number) => Array.from(text).length * size;
function example() {
  const d = setWorkbenchPageCount(createWorkbenchDraft(false), 3);
  d.title = "小禾的花园";
  d.pages[0].text = "她扶起一朵低着头的小花。";
  d.pages[0].lettering = { lines: ["她扶起一朵", "低着头", "的小花。"], emphasis: [{ text: "扶", color: "#987028" }, { text: "低着头", color: "#b75b36" }, { text: "小花", color: "#2e667b" }], placement: { x: 9, y: 10, width: 59 } };
  return d;
}
describe("editable picture-book lettering", () => {
  it("defaults new books to short handwritten text while leaving old saved styles intact", () => {
    const d = example();
    expect(d.typography.preset).toBe("storybook"); expect(d.typography.fontFamily).toBe("kai"); expect(d.typography.backing).toBe(false);
    const old = createWorkbenchDraft(); delete old.typography.preset;
    expect(localDraftSchema.parse(old).typography.preset).toBeUndefined();
    expect(localDraftSchema.parse(old).typography.size).toBe(28);
  });
  it("keeps exact approved words, chosen line breaks, larger keywords and restrained colours", () => {
    const d = example(), p = d.pages[0];
    const result = layoutStoryText(p.text, d.typography, p.lettering, letteringEmphasis(p), 472, measure);
    expect(result.lines).toEqual(p.lettering!.lines); expect(result.glyphs.map(g => g.text).join("")).toBe(p.text);
    const marked = result.glyphs.find(g => g.text === "扶")!;
    expect(marked.color).toBe("#987028"); expect(marked.size).toBeGreaterThan(result.glyphs[0].size);
    expect(new Set(result.glyphs.map(g => g.color))).toEqual(new Set(["#34452c", "#987028", "#b75b36", "#2e667b"]));
    expect(result.height).toBeLessThan(230);
  });
  it("discards stale AI text plans after a prose edit and honours manual returns", () => {
    const d = example(), p = d.pages[0]; p.text = "一只蝴蝶，\n轻轻落在她身旁。";
    const result = layoutStoryText(p.text, d.typography, p.lettering, letteringEmphasis(p), 600, measure);
    expect(result.lines).toEqual(p.text.split("\n")); expect(result.glyphs.map(g => g.text).join("")).toBe(p.text.replace(/\n/g, ""));
    expect(validLetteringLines("red apple", ["red", "apple"])).toBe(false);
  });
  it("wraps long passages without losing punctuation, duplicating words or putting closing marks first", () => {
    const d = example(), text = "小禾慢慢走到花园里，看见一只蝴蝶，轻轻落在黄色的小花上。";
    const layout = layoutStoryText(text, d.typography, undefined, [], 472, measure);
    expect(layout.lines.join("")).toBe(text);
    expect(layout.lines.every(line => !/^[，。！？、）》”’]/u.test(line))).toBe(true);
    expect(layout.width).toBeLessThanOrEqual(472);
    expect(layout.lines.length).toBeGreaterThan(2);
  });
  it("keeps the two physical pages of a spread independently positioned across save/reload", () => {
    const d = example(); d.spreads = [2];
    d.pages[1] = { ...d.pages[0], lettering: { placement: { x: 9, y: 10, width: 59 } } };
    d.pages[2] = { ...d.pages[0], lettering: { placement: { x: 31, y: 68, width: 59 } } };
    d.studio = { pages: { "2": { typography: { textBox: { x: 7, y: 12, width: 60 } } }, "3": { typography: { textBox: { x: 30, y: 67, width: 59 } } } } };
    const saved = localDraftSchema.parse(JSON.parse(JSON.stringify(d)));
    const left = storyTextPlan(saved.pages[1], pageTypography(saved, 2), 800, 800, 0, measure);
    const right = storyTextPlan(saved.pages[2], pageTypography(saved, 3), 800, 800, 1, measure);
    expect(left.region.x).toBeCloseTo(56); expect(right.region.x).toBeCloseTo(1040);
    expect(right.region.y).toBeGreaterThan(left.region.y);
    expect(right.region.x + right.region.width).toBeLessThan(1600);
    const prompt=imagePrompt(customDraftSchema.parse({...saved,characters:saved.characters.map(c=>({...c,name:c.name||"小禾"}))}),{kind:"page",index:1,spread:true},page=>pageTypography(saved,page));
    expect(prompt).toContain("left physical page"); expect(prompt).toContain("left 7%, top 12%, width 60%"); expect(prompt).toContain("left 30%, top 67%, width 59%");
  });
  it("applies only body styling, retaining the cover, original art, prose and per-page placement", () => {
    const d = createWorkbenchDraft();
    d.studio = { pages: { "0": { typography: { size: 45 } }, "1": { typography: { textBox: { x: 10, y: 15, width: 60 } } }, "2": { typography: { textBox: { x: 30, y: 65, width: 60 } } } } };
    const changed = applyBookTypography(d, { ...d.typography, ...STORYBOOK_TYPOGRAPHY });
    expect(pageTypography(changed, 0)).toEqual(pageTypography(d, 0));
    expect(pageTypography(changed, 1).preset).toBe("storybook");
    expect(pageTypography(changed, 2).textBox).toEqual({ x: 30, y: 65, width: 60 });
    expect(changed.pages.map(p => p.text)).toEqual(d.pages.map(p => p.text)); expect(changed.pages.map(p => p.asset)).toEqual(d.pages.map(p => p.asset));
  });
  it("persists editable keywords, colour and placement and reserves the same area in image prompts", () => {
    const d = example(); d.characters[0].name = "小禾";
    d.pages[0].lettering!.words = "小花，";
    const parsed = customDraftSchema.parse(d);
    expect(parsed.pages[0].lettering).toEqual(d.pages[0].lettering);
    expect(letteringEmphasis(parsed.pages[0]).map(item => item.text)).toEqual(["小花"]);
    const prompt = imagePrompt(parsed, { kind: "page", index: 0, spread: false });
    expect(prompt).toContain("left 9%, top 10%, width 59%"); expect(prompt).toContain("never paint a blank rectangle");
    const manuscript=bookProductionText({result:d,status:"complete"});expect(manuscript).toContain("文字排版：绘本叙事");expect(manuscript).toContain("朗读断行：");expect(manuscript).toContain("小花（");
    d.pages[0].lettering!.words = ""; expect(letteringEmphasis(d.pages[0])).toEqual([]);
  });
});
