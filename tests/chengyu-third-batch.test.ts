import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import drafts from "../content-drafts/chengyu/chengyu-91-100.json";
import generation from "../content-drafts/chengyu/chengyu-91-100-image-generation.json";
import { getBook, getPublishedBooks } from "../src/lib/library";
import { getLibraryChineseAudio } from "../src/lib/library-book-audio";

describe("third batch of ancient-character idiom books", () => {
  it("makes all ten approved stories readable with 180 consecutive bilingual pages", () => {
    expect(drafts.map(book => book.title)).toEqual([
      "温故知新", "不耻下问", "集思广益", "兼听则明", "实事求是",
      "量力而行", "持之以恒", "见贤思齐", "礼尚往来", "开诚布公",
    ]);
    const publishedIds = new Set(getPublishedBooks("chengyu").map(book => book.id));
    for (const [index, draft] of drafts.entries()) {
      expect(draft.order).toBe(91 + index);
      expect(draft.draftStatus).toBe("complete-local");
      expect(draft.origin).toContain("原创古代生活故事");
      expect(draft.adaptationNote.trim()).not.toBe("");
      expect(publishedIds.has(draft.id), draft.id).toBe(true);
      const book = getBook("chengyu", draft.id);
      expect(book?.comingSoon).toBe(false);
      expect(book?.pages).toHaveLength(18);
      book?.pages.forEach((page, pageIndex) => {
        expect(page.page).toBe(pageIndex + 1);
        expect(page.zhText).toBe(draft.pages[pageIndex].zh);
        expect(page.enText).toBe(draft.pages[pageIndex].en);
        expect(page.zhText.trim()).not.toBe("");
        expect(page.enText.trim()).not.toBe("");
      });
    }
  });

  it("uses one accepted local illustration per page, including selected revisions", () => {
    for (const draft of drafts) {
      const active = generation.images.filter(image => image.bookId === draft.id && image.active !== false);
      expect(active).toHaveLength(19);
      const cover = active.find(image => image.kind === "cover");
      expect(cover?.review).toBe("accepted-as-cover");
      expect(existsSync(path.resolve(`public${cover?.imageUrl}`))).toBe(true);
      const book = getBook("chengyu", draft.id)!;
      book.pages.forEach((page, index) => {
        const selected = active.filter(image => image.kind === "page" && image.page === index + 1);
        expect(selected, `${draft.id}/${index + 1}`).toHaveLength(1);
        expect(selected[0].review).toBe("accepted-as-page");
        expect(page.imageStatus).toBe("complete");
        expect(page.imageUrl).toBe(selected[0].imageUrl);
        const file = path.resolve(`public${page.imageUrl}`);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(1000);
        expect(statSync(file).size).toBeLessThanOrEqual(300 * 1024);
      });
    }
  });

  it("loads bundled Chinese narration and rejects it if the manuscript changes", () => {
    for (const draft of drafts) {
      const book = getBook("chengyu", draft.id)!;
      const audio = getLibraryChineseAudio("chengyu", draft.id, book.pages);
      expect(audio, draft.id).toBeDefined();
      if (!audio) continue;
      expect(audio.url).toBe(`/library/chengyu/${draft.id}/zh-${audio.contentHash.slice(0, 16)}.mp3`);
      expect(statSync(path.resolve(`public${audio.url}`)).size).toBeGreaterThan(1000);
      expect(audio.pageStarts).toHaveLength(18);
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
