import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { getBook, getPublishedBooks, getSeries } from "@/lib/library";
import { createLibraryBookSummary, groupLibraryBooksBySubseries } from "@/lib/library/catalog";
import { filterLibraryBooks } from "@/lib/library/discovery";
import { getLibraryStorySpecByContentId } from "@/lib/library/personalization";
import type { LibraryBook } from "@/types/library";

const EXPECTED_BOOKS = [
  { id: "xi-guan-hui-man-man-zhang-da", pages: 12 },
  { id: "pei-hai-zi-ba-lu-zou-chang", pages: 12 },
  { id: "ai-jia-ren-ye-zun-zhong-zi-ji", pages: 14 },
  { id: "mei-yi-zhong-xin-qing-dou-you-ming-zi", pages: 10 },
  { id: "shan-liang-cheng-shi-he-you-fen-cun", pages: 12 },
  { id: "hui-du-hui-xiang-ye-hui-wan", pages: 12 },
] as const;

describe("Sanzijing parenting library", () => {
  it("retains six ordered classic books within the expanded parenting series", () => {
    const series = getSeries("sanzijing");
    const books = getPublishedBooks("sanzijing").filter((book) => book.subseries?.id === "sanzijing");

    expect(series).toMatchObject({
      title: "亲子成长",
      bookCount: 26,
      ageRange: "4–8 岁",
    });
    expect(books.map(({ id, pages }) => ({ id, pages: pages.length }))).toEqual(
      EXPECTED_BOOKS,
    );

    for (const [index, book] of books.entries()) {
      expect(book.subseries).toEqual({ id: "sanzijing", title: "三字经" });
      expect(book.order).toBe(index + 1);
      expect(book.comingSoon).not.toBe(true);
      expect(book.pages.map((page) => page.page)).toEqual(
        Array.from({ length: book.pages.length }, (_, pageIndex) => pageIndex + 1),
      );
      expect(
        book.pages.every(
          (page) =>
            page.zhText.trim() &&
            page.enText.trim() &&
            page.illustrationPrompt?.trim() &&
            page.imageStatus === "complete",
        ),
      ).toBe(true);
    }
  });

  it("accepts independent growth stories without labelling them as Sanzijing", () => {
    const series = getSeries("sanzijing")!;
    const classic = getPublishedBooks("sanzijing")[0];
    const growthStory: LibraryBook = {
      id: "new-growth-story",
      seriesId: series.id,
      title: "一起慢慢长大",
      subtitle: "一个新的亲子故事",
      pages: classic.pages,
      ageLabel: "4–8 岁",
      publishedAt: "2026-10-06",
      order: 7,
    };
    const summaries = [classic, growthStory].map((book) =>
      createLibraryBookSummary(series, book),
    );
    expect(summaries[0].metadata.category).toBe("classic");
    expect(summaries[1].metadata.category).toBe("family-growth");
    expect(summaries[1].metadata.tags).not.toContain("三字经");
    expect(summaries[1].subseries).toBeUndefined();
    expect(groupLibraryBooksBySubseries(summaries).map((group) => ({
      title: group.subseries?.title,
      ids: group.books.map((book) => book.id),
    }))).toEqual([
      { title: "三字经", ids: [classic.id] },
      { title: undefined, ids: [growthStory.id] },
    ]);
    expect(summaries[0].href).toBe(`/library/sanzijing/${classic.id}`);
    expect(filterLibraryBooks(summaries, { query: "亲子成长" })).toHaveLength(2);
    expect(filterLibraryBooks(summaries, { query: "三字经" }).map((book) => book.id)).toEqual([classic.id]);
  });

  it("requires reviewed classic context and a complete Chinese parent guide", () => {
    for (const book of getPublishedBooks("sanzijing").filter((book) => book.subseries?.id === "sanzijing")) {
      expect(book.classic?.workTitle).toBe("《三字经》");
      expect(book.classic?.originalLines.length).toBeGreaterThan(0);
      expect(book.classic?.childExplanation.zh).toBeTruthy();
      expect(book.classic?.childExplanation.en).toBeTruthy();
      expect(book.classic?.historicalContext.length).toBeGreaterThan(20);
      expect(book.parentGuide?.goal).toBeTruthy();
      expect(book.parentGuide?.reminder).toBeTruthy();
      expect(book.parentGuide?.questions).toHaveLength(3);
      expect(book.parentGuide?.activity).toBeTruthy();
      expect(book.parentGuide?.ageTips.age4to5).toBeTruthy();
      expect(book.parentGuide?.ageTips.age6to8).toBeTruthy();
      expect(book.metadata?.personalizationEnabled).toBe(false);
    }
  });

  it("makes classic and parenting metadata discoverable without indexing pages", () => {
    const series = getSeries("sanzijing");
    expect(series).not.toBeNull();
    if (!series) return;

    const summaries = getPublishedBooks("sanzijing").map((book) =>
      createLibraryBookSummary(series, book),
    );
    expect(
      filterLibraryBooks(summaries, { query: "七情 情绪" }).map(
        (book) => book.id,
      ),
    ).toEqual(["mei-yi-zhong-xin-qing-dou-you-ming-zi"]);
    expect(
      filterLibraryBooks(summaries, { query: "亲子共读 习惯" }).map(
        (book) => book.id,
      ),
    ).toContain("xi-guan-hui-man-man-zhang-da");
  });

  it("does not expose fixed-eight-page personalization for these books", () => {
    for (const { id } of EXPECTED_BOOKS) {
      expect(getLibraryStorySpecByContentId(`sanzijing/${id}`)).toBeNull();
    }
  });

  it("keeps the active thumbnail visible in variable-length turn mode", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/library/LibraryBookReader.tsx"),
      "utf8",
    );
    expect(source).toContain("activeThumbnail?.scrollIntoView");
    expect(source).toContain('inline: "nearest"');
    expect(source).toContain("[pageIndex, readerMode]");
  });

  it("includes the series and six books in the sitemap", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/library/sanzijing"))).toBe(true);
    for (const { id } of EXPECTED_BOOKS) {
      expect(
        urls.some((url) => url.endsWith(`/library/sanzijing/${id}`)),
      ).toBe(true);
    }
  });

  it("ships every square WebP illustration within the library budget", async () => {
    for (const { id, pages } of EXPECTED_BOOKS) {
      const book = getBook("sanzijing", id);
      expect(book).not.toBeNull();
      for (let page = 1; page <= pages; page += 1) {
        const imagePath = join(
          process.cwd(),
          "public",
          "library",
          "sanzijing",
          id,
          `${page}.webp`,
        );
        expect(existsSync(imagePath), imagePath).toBe(true);
        if (!existsSync(imagePath)) continue;
        expect(statSync(imagePath).size).toBeLessThanOrEqual(300 * 1024);
        const metadata = await sharp(imagePath).metadata();
        expect(metadata.format).toBe("webp");
        expect(metadata.width).toBe(1200);
        expect(metadata.height).toBe(1200);
        expect(book?.pages[page - 1]?.imageUrl).toBe(
          `/library/sanzijing/${id}/${page}.webp`,
        );
      }
    }
  });
});
