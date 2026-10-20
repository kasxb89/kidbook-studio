import type { CustomWorkbenchDraft } from "../custom-workbench";
import { spreadStart } from "../custom-workbench";

import { BOOK_FONTS, type BookFont } from "./font-catalog";
export { BOOK_FONTS, type BookFont } from "./font-catalog";
export type { BookTypography } from "./text-style";
import type { BookTypography } from "./text-style";
export function pageTypography(draft: CustomWorkbenchDraft, page: number): BookTypography {
  const start = spreadStart(draft, page) || page;
  return { ...draft.typography, ...draft.studio?.pages?.[start]?.typography, ...draft.studio?.pages?.[page]?.typography };
}
export function canvasFontFamily(font?: BookFont) {
  // Match the self-hosted PDF face; system fonts are a final browser fallback.
  return font && BOOK_FONTS[font] ? `${BOOK_FONTS[font].family}, "KidBook Sans", sans-serif` : '"KidBook Sans", "PingFang SC", "Microsoft YaHei", sans-serif';
}
export async function loadBookFont(font?: BookFont) {
  if (typeof document !== "undefined") {
    const selected=font && BOOK_FONTS[font] ? font : "sans";
    const loaded = await Promise.all([...new Set([selected,"sans"] as BookFont[])].map(id=>document.fonts.load(`400 28px ${BOOK_FONTS[id].family}`, "小禾的故事")));
    if (loaded.some(faces=>!faces.length)) throw new Error("字体尚未载入，请稍后重试。");
  }
}
export function effectiveTextBacking(draft: CustomWorkbenchDraft, page: number) {
  const design = pageTypography(draft, page);
  const treatment = page ? draft.pages[page - 1]?.textTreatment : undefined;
  return treatment ? treatment === "soft" : design.backing;
}
export function applyBookTypography(draft: CustomWorkbenchDraft, design: BookTypography): CustomWorkbenchDraft {
  const pages = { ...draft.studio?.pages };
  if (design.preset === "storybook") {
    // A shared style must not stamp one page's placement across the whole book.
    for (let page = 1; page <= draft.pages.length; page++) {
      const before = pageTypography(draft, page);
      pages[page] = { ...pages[page], typography: { ...design, textBox: before.textBox || null }, review: "draft" };
    }
    return { ...draft, pages: draft.pages.map(page => ({ ...page, textTreatment: undefined })), studio: { ...draft.studio, pages } };
  }
  // Clear old overrides for all saved pages, including temporarily hidden pages.
  for (const key of Object.keys(pages)) pages[key] = { ...pages[key], typography: undefined, review: "draft" };
  return {
    ...draft, typography: { ...design },
    pages: draft.pages.map(page => ({ ...page, textTreatment: undefined })),
    studio: { ...draft.studio, pages },
  };
}
