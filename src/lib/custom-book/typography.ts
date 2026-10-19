import type { CustomWorkbenchDraft } from "../custom-workbench";

export const BOOK_FONTS = {
  sans: { label: "清晰黑体", family: '"KidBook Sans"', file: "NotoSansSC-Regular.ttf" },
  kai: { label: "手写楷体", family: '"KidBook Kai"', file: "LXGWWenKai-Regular.ttf" },
} as const;
export type BookFont = keyof typeof BOOK_FONTS;
export type BookTypography = CustomWorkbenchDraft["typography"];
export function canvasFontFamily(font?: BookFont) {
  // Keep the appearance of existing books until a font is explicitly selected.
  return font ? BOOK_FONTS[font].family : '"PingFang SC", "Microsoft YaHei", sans-serif';
}
export async function loadBookFont(font?: BookFont) {
  if (font && typeof document !== "undefined") {
    const loaded = await document.fonts.load(`400 28px ${BOOK_FONTS[font].family}`, "小禾的故事");
    if (!loaded.length) throw new Error("字体尚未载入，请稍后重试。");
  }
}
export function effectiveTextBacking(draft: CustomWorkbenchDraft, page: number) {
  const design = { ...draft.typography, ...draft.studio?.pages?.[page]?.typography };
  const treatment = page ? draft.pages[page - 1]?.textTreatment : undefined;
  return treatment ? treatment === "soft" : design.backing;
}
export function applyBookTypography(draft: CustomWorkbenchDraft, design: BookTypography): CustomWorkbenchDraft {
  const pages = { ...draft.studio?.pages };
  // Clear old overrides for all saved pages, including temporarily hidden pages.
  for (const key of Object.keys(pages)) pages[key] = { ...pages[key], typography: undefined, review: "draft" };
  return {
    ...draft, typography: { ...design },
    pages: draft.pages.map(page => ({ ...page, textTreatment: undefined })),
    studio: { ...draft.studio, pages },
  };
}
