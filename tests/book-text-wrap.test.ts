import { expect, it } from "vitest";
import { wrapBookText } from "@/lib/custom-book/text-wrap";
const measure = (text: string) => Array.from(text).length;

it("keeps a full stop with the preceding glyph when it would wrap alone", () => {
  expect(wrapBookText("甲乙丙。", 3, measure)).toEqual(["甲乙", "丙。"]);
});
it("moves an opening bracket to the line containing its content", () => {
  expect(wrapBookText("甲乙（丙丁", 3, measure)).toEqual(["甲乙", "（丙丁"]);
});
it("keeps closing punctuation clusters with their preceding text", () => {
  expect(wrapBookText("甲乙丙。”", 4, measure)).toEqual(["甲乙", "丙。”"]);
});
it("preserves explicit paragraph breaks and Unicode characters", () => {
  expect(wrapBookText("甲。\n🐥乙。", 10, measure)).toEqual(["甲。", "🐥乙。"]);
});
