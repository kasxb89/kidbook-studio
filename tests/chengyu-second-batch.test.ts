import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import drafts from "../content-drafts/chengyu/chengyu-81-90.json";
import prompts from "../content-drafts/chengyu/chengyu-81-90-image-prompts.json";
import generation from "../content-drafts/chengyu/chengyu-81-90-image-generation.json";
import { getBook, getSeries } from "../src/lib/library";
import { getLibraryChineseAudio } from "../src/lib/library-book-audio";
import { resolveLibraryBookMetadata } from "../src/lib/library/metadata";

describe("second batch of ancient-character idiom picture books", () => {
  it("keeps the ten confirmed selections and all 188 bilingual pages", () => {
    expect(drafts.map(book => book.title)).toEqual([
      "柳暗花明", "负荆请罪", "三思而行", "齐心协力", "因地制宜",
      "举一反三", "有备无患", "循序渐进", "精益求精", "拾金不昧",
    ]);
    expect(drafts.map(book => book.pages.length)).toEqual([18, 20, 20, 20, 18, 18, 18, 18, 20, 18]);
    expect(drafts.reduce((total, book) => total + book.pages.length, 0)).toBe(188);
    expect(new Set(drafts.map(book => book.id)).size).toBe(10);
    for (const [index, draft] of drafts.entries()) {
      expect(draft.order).toBe(81 + index);
      expect(draft.draftStatus).toBe("complete-local");
      if (index >= 2) expect(draft.origin).toContain("原创古代生活故事");
      expect(draft.adaptationNote).not.toBe("");
      const kit = prompts.books.find(book => book.bookId === draft.id);
      expect(kit, draft.id).toBeDefined();
      expect(kit?.pages).toHaveLength(draft.pages.length);
      expect(kit?.coverStatus).toBe("accepted-as-cover");
      expect(JSON.stringify(kit?.characterSpecs)).not.toMatch(/\b(monkey|rabbit|bear|squirrel|duck|deer|hedgehog|fox|owl|badger|tortoise)\b/i);
      draft.pages.forEach((page, pageIndex) => {
        expect(page.page).toBe(pageIndex + 1);
        expect(page.zh.trim().length).toBeGreaterThan(10);
        expect(page.en.trim().length).toBeGreaterThan(20);
        expect(kit?.pages[pageIndex].castCodes).toEqual(page.castCodes);
        expect(kit?.pages[pageIndex].prompt).toContain(page.en);
      });
    }
  });

  it("serves the selected art and includes these ten books in the existing idiom library", () => {
    expect(getSeries("chengyu")?.bookCount).toBe(84);
    expect(getSeries("yanyu")?.bookCount).toBe(16);
    for (const draft of drafts) {
      const book = getBook("chengyu", draft.id);
      expect(book, draft.id).not.toBeNull();
      if (!book) continue;
      expect(book.comingSoon).toBe(false);
      expect(resolveLibraryBookMetadata(book).category).toBe("idiom");
      expect(book.pages).toHaveLength(draft.pages.length);
      const cover = generation.images.find(image => image.bookId === draft.id && image.kind === "cover" && image.active !== false);
      expect(cover?.review).toBe("accepted-as-cover");
      expect(existsSync(path.resolve(`public${cover?.imageUrl}`))).toBe(true);
      for (const [index, page] of book.pages.entries()) {
        expect(page.zhText).toBe(draft.pages[index].zh);
        expect(page.enText).toBe(draft.pages[index].en);
        expect(page.imageStatus).toBe("complete");
        const image = generation.images.find(item => item.bookId === draft.id && item.kind === "page" && item.page === index + 1 && item.active !== false);
        expect(image, `${draft.id}/${index + 1}`).toBeDefined();
        expect(image?.review).toBe("accepted-as-page");
        expect(page.imageUrl).toBe(image?.imageUrl);
        const file = path.resolve(`public${page.imageUrl}`);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(1000);
        expect(statSync(file).size).toBeLessThanOrEqual(300 * 1024);
      }
    }
  });

  it("resolves page-aligned local narration and rejects narration for changed text", () => {
    for (const draft of drafts) {
      const book = getBook("chengyu", draft.id);
      expect(book, draft.id).not.toBeNull();
      if (!book) continue;
      const audio = getLibraryChineseAudio("chengyu", draft.id, book.pages);
      expect(audio, draft.id).toBeDefined();
      if (!audio) continue;
      expect(audio.url).toBe(`/library/chengyu/${draft.id}/zh-${audio.contentHash.slice(0, 16)}.mp3`);
      expect(existsSync(path.resolve(`public${audio.url}`))).toBe(true);
      expect(audio.pageStarts).toHaveLength(book.pages.length);
      expect(audio.pageStarts[0]).toBe(0);
      audio.pageStarts.forEach((start, index) => {
        expect(start).toBeLessThan(audio.duration);
        if (index) expect(start).toBeGreaterThan(audio.pageStarts[index - 1]);
      });
      const changed = book.pages.map((page, index) => index ? page : { ...page, zhText: page.zhText + "新正文" });
      expect(getLibraryChineseAudio("chengyu", draft.id, changed)).toBeUndefined();
    }
  });
});
