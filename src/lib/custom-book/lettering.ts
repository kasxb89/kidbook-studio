import { z } from "zod";
import { textPlacementSchema } from "./text-style";
import type { WorkbenchPage } from "../custom-workbench";
import type { BookTypography } from "./typography";
import { normalizeTextPlacement, textRegion, type TextPlacement } from "./text-position";

export const letteringSchema = z.object({
  lines: z.array(z.string().max(2500)).max(80).optional(),
  emphasis: z.array(z.object({
    text: z.string().min(1).max(40),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    scale: z.number().min(.5).max(2.5).optional(),
  })).max(8).optional(),
  // Keep the raw input, including a trailing comma, while an editor types.
  words: z.string().max(300).optional(),
  placement: textPlacementSchema.optional(),
});
export type BookLettering = z.infer<typeof letteringSchema>;
export const LETTERING_COLOURS = ["#b75b36", "#2e667b", "#987028"] as const;
export const STORYBOOK_INK = .02;
export const STORYBOOK_TYPOGRAPHY = {
  preset: "storybook", fontFamily: "kai", size: 42, color: "#34452c",
  lineHeight: 1.35, letterSpacing: .035, align: "left", backing: false, textBox: null,
} as const;
const normal = (text: string) => text.replace(/[\r\n]/gu, "");
export function bookPageDimensions(format: "square" | "portrait" | "landscape"): [number, number] {
  return format === "portrait" ? [720, 900] : format === "landscape" ? [960, 720] : [800, 800];
}
export function validLetteringLines(text: string, lines?: string[]) {
  return !!lines?.length && normal(lines.join("")) === normal(text) && lines.some(line => line.trim());
}

export function letteringEmphasis(page: Pick<WorkbenchPage, "text" | "lettering" | "directing">) {
  const configured = page.lettering?.words !== undefined
    ? page.lettering.words.split(/[，,、;；\n]/u).map(text => ({ text: text.trim() }))
    : page.lettering?.emphasis;
  const candidates: NonNullable<BookLettering["emphasis"]> = configured || [
    ...(page.directing?.learningFocus?.split(/[，,、 /]/u) || []),
    ...["红色", "小汽车", "蝴蝶", "小花", "苹果", "香蕉", "胡萝卜", "西红柿", "干沙", "湿沙", "小沙堡", "请帮帮我", "谢谢", "轻轻", "慢慢", "勇敢", "再试一次"],
  ].filter(word => word.length > 1 && page.text.includes(word)).slice(0, 3).map(text => ({ text }));
  const seen = new Set<string>();
  return candidates.filter(item => {
    if (!item.text || !page.text.includes(item.text) || seen.has(item.text)) return false;
    seen.add(item.text); return true;
  }).slice(0, 8).map((item, i) => ({ text: item.text, color: item.color || LETTERING_COLOURS[i % 3], scale: item.scale || 1.18 }));
}

export function storyTextPlacement(page: Pick<WorkbenchPage, "lettering" | "directing">, design: BookTypography): TextPlacement {
  if (design.textBox) return normalizeTextPlacement(design.textBox);
  if (page.lettering?.placement) return normalizeTextPlacement(page.lettering.placement);
  const note = page.directing?.textPlacement || "";
  const top = /上方|上部|顶部|左上|右上/.test(note);
  const right = /右侧|右上|右下|右边/.test(note);
  return normalizeTextPlacement({ x: right ? 32 : 9, y: top ? 9 : /中部|中央/.test(note) ? 40 : design.position === "top" ? 9 : design.position === "middle" ? 40 : 76, width: 59 });
}

export type LetterGlyph = { text: string; x: number; baseline: number; size: number; color: string };
export type LetteringLayout = { glyphs: LetterGlyph[]; lines: string[]; width: number; height: number };
type Measure = (text: string, size: number) => number;
const closing = /^[，。！？、：；）》」』】〕〉”’…,.!?;:%\)\]\}]$/u;
const opening = /^[（《「『【〔〈“‘\(\[\{]$/u;

/** Shared by canvas and vector PDF: exact words, line breaks, baselines and colours. */
export function layoutStoryText(text: string, design: BookTypography, lettering: BookLettering | undefined, emphasis: ReturnType<typeof letteringEmphasis>, width: number, measure: Measure): LetteringLayout {
  if (!text.trim()) return { glyphs: [], lines: [], width: 0, height: 0 };
  // Explicit operator line breaks take priority over an older AI layout.
  const planned = !text.includes("\n") && validLetteringLines(text, lettering?.lines);
  const paragraphs = planned ? lettering!.lines! : text.replace(/\r/g, "").split("\n");
  const hardBreaks = planned || text.includes("\n");
  const all: LetterGlyph[] = [], lines: string[] = [];
  let y = 0, widest = 0;
  for (const paragraph of paragraphs) {
    const ranges: Array<{ start: number; end: number; color: string; scale: number }> = [];
    // Longer phrases win when emphasis ranges overlap.
    for (const item of [...emphasis].sort((a, b) => b.text.length - a.text.length)) {
      let from = 0;
      while (from < paragraph.length) {
        const start = paragraph.indexOf(item.text, from);
        if (start < 0) break;
        const end = start + item.text.length;
        if (!ranges.some(r => start < r.end && end > r.start)) ranges.push({ start, end, color: item.color, scale: item.scale });
        from = end;
      }
    }
    let offset = 0;
    const glyphs = Array.from(paragraph).map(character => {
      const index = offset; offset += character.length;
      const mark = ranges.find(r => index >= r.start && index < r.end);
      const size = design.size * (mark?.scale || 1);
      return { text: character, index, size, color: mark?.color || design.color, advance: measure(character, size) + size * (design.letterSpacing ?? .035) };
    });
    if (!glyphs.length) { lines.push(""); y += design.size * (design.lineHeight ?? 1.35); continue; }
    const wordEnds = new Set<number>();
    for (const word of new Intl.Segmenter("zh", { granularity: "word" }).segment(paragraph)) wordEnds.add(word.index + word.segment.length);
    const target = hardBreaks ? width : Math.min(width, design.size * (/[\u3400-\u9fff]/u.test(paragraph) ? 9 : 18));
    const n = glyphs.length, costs = Array<number>(n + 1).fill(Infinity), next = Array<number>(n).fill(n);
    costs[n] = 0;
    for (let i = n - 1; i >= 0; i--) {
      let used = 0;
      for (let j = i; j < n; j++) {
        used += glyphs[j].advance;
        if (used > target && j > i) break;
        const last = j === n - 1, end = glyphs[j].index + glyphs[j].text.length;
        const badPunctuation = !last && (opening.test(glyphs[j].text) || closing.test(glyphs[j + 1].text));
        const splitEmphasis = !last && ranges.some(r => end > r.start && end < r.end);
        const splitWord = !last && !wordEnds.has(end);
        const slack = Math.max(0, (target - used) / target);
        const penalty = .22 + slack * slack * (last ? .25 : 1) + (badPunctuation ? 12 : 0) + (splitEmphasis ? 4 : 0) + (splitWord ? 1.2 : 0) + (!last && /[，。！？；：,.!?;:]$/u.test(glyphs[j].text) ? -.12 : 0);
        if (penalty + costs[j + 1] < costs[i]) { costs[i] = penalty + costs[j + 1]; next[i] = j + 1; }
      }
    }
    for (let i = 0; i < n;) {
      const end = next[i], row = glyphs.slice(i, end);
      const rowWidth = row.reduce((sum, glyph) => sum + glyph.advance, 0) - row.at(-1)!.size * (design.letterSpacing ?? .035);
      const rowSize = Math.max(...row.map(glyph => glyph.size));
      let x = design.align === "center" ? (width - rowWidth) / 2 : design.align === "right" ? width - rowWidth : 0;
      for (const glyph of row) { all.push({ text: glyph.text, x, baseline: y + rowSize * .92, size: glyph.size, color: glyph.color }); x += glyph.advance; }
      lines.push(row.map(glyph => glyph.text).join("")); widest = Math.max(widest, rowWidth);
      y += rowSize * (design.lineHeight ?? 1.35); i = end;
    }
  }
  // Tight line spacing may overlap rows, but the final row still needs its full
  // ink height inside the text/background box.
  const inkBottom=all.reduce((bottom,glyph)=>Math.max(bottom,glyph.baseline+glyph.size*.18),0);
  return { glyphs: all, lines, width: widest, height: Math.max(y,inkBottom) };
}

export function storyTextPlan(page: Pick<WorkbenchPage, "text" | "lettering" | "directing">, design: BookTypography, pageWidth: number, height: number, side: number, measure: Measure) {
  const placement = storyTextPlacement(page, design);
  const area = { x: side * pageWidth + placement.x / 100 * pageWidth, y: placement.y / 100 * height, width: placement.width / 100 * pageWidth, height: height * .92 };
  const lettering = layoutStoryText(page.text, design, page.lettering, letteringEmphasis(page), area.width, measure);
  const region = textRegion(area, { ...design, textBox: placement }, lettering.height, pageWidth, height, side);
  return { lettering, region, overflow: lettering.width > region.width + .1 || lettering.height > height || region.y + region.height > height + .1 };
}
