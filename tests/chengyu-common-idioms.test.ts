import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import drafts from "../content-drafts/chengyu/chengyu-71-80.json";
import { getBook } from "../src/lib/library";
import { resolveLibraryBookMetadata } from "../src/lib/library/metadata";

describe("confirmed common idiom book assets", () => {
  it("exposes all 192 bilingual pages and uses the selected revisions in the reader", () => {
    let pages = 0;
    let revisions = 0;
    for (const draft of drafts) {
      const book = getBook("chengyu", draft.id);
      expect(book, draft.id).not.toBeNull();
      if (!book) continue;
      expect(book.comingSoon).toBe(false);
      expect(resolveLibraryBookMetadata(book).category).toBe("idiom");
      expect(book.pages).toHaveLength(draft.pages.length);
      for (const [index, page] of book.pages.entries()) {
        const source = draft.pages[index];
        const filename = "imageFile" in source && source.imageFile
          ? source.imageFile
          : `${index + 1}.webp`;
        expect(page.page).toBe(index + 1);
        expect(page.zhText).toBe(source.zh);
        expect(page.enText).toBe(source.en);
        expect(page.imageStatus).toBe("complete");
        expect(page.imageUrl).toBe(`/library/chengyu/${draft.id}/${filename}`);
        const file = path.resolve(`public${page.imageUrl}`);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(1000);
        expect(statSync(file).size).toBeLessThanOrEqual(300 * 1024);
        pages++;
        if (filename.includes("-v2")) revisions++;
      }
    }
    expect(pages).toBe(192);
    expect(revisions).toBe(20);
  });
});
