import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { getBook, getSeries, getPublishedBooks, getAdjacentBooks } from "@/lib/library";
import { createLibraryBookSummary, groupLibraryBooksBySubseries } from "@/lib/library/catalog";
import { filterLibraryBooks } from "@/lib/library/discovery";
import { getLibraryChineseAudio } from "@/lib/library-book-audio";
import { getLibraryStorySpecByContentId } from "@/lib/library/personalization";
import sitemap from "@/app/sitemap";
import plan from "../content-drafts/qinzi/batch-07-16/plan.json";

const root = path.resolve("content-drafts/qinzi");
const expandedBooks = () => plan.books.map(({ id }) => getBook("sanzijing", id)!);

describe("Approved parenting and skill stories", () => {
  it("ships ten approved 18-page bilingual books without changing the approved Chinese text", () => {
    expect(plan.approved).toBe(true);
    expect(getSeries("sanzijing")).toMatchObject({ title: "亲子成长", bookCount: 26 });
    expect(getPublishedBooks("sanzijing").slice(6, 16).map((book) => book.id)).toEqual(plan.books.map(({ id }) => id));
    let pageCount = 0;
    for (const [index, item] of plan.books.entries()) {
      const book = getBook("sanzijing", item.id);
      expect(book, item.id).not.toBeNull();
      if (!book) continue;
      const review = JSON.parse(readFileSync(path.join(root, "batch-07-16/books", `${item.id}.json`), "utf8"));
      expect(review.approved).toBe(true);
      expect(book.order).toBe(index + 7);
      expect(book.pages).toHaveLength(18);
      expect(book.pages.map((page) => page.page)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
      expect(book.pages.map((page) => page.zhText)).toEqual(review.pages.map((page: { zh: string }) => page.zh));
      expect(book.pages.every((page) => page.enText.trim() && page.illustrationPrompt?.trim())).toBe(true);
      expect(book.comingSoon).toBe(false);
      expect(book.classic).toBeUndefined();
      expect(book.parentGuide?.questions).toHaveLength(3);
      expect(book.parentGuide?.activity).toBeTruthy();
      expect(book.metadata).toMatchObject({ category: "family-growth", personalizationEnabled: false });
      expect(getLibraryStorySpecByContentId(`sanzijing/${item.id}`)).toBeNull();
      pageCount += book.pages.length;
    }
    expect(pageCount).toBe(180);
  });

  it("serves 180 distinct built-in images with per-page provenance and bounded square WebP files", async () => {
    const hashes = new Set<string>();
    for (const book of expandedBooks()) {
      const source = JSON.parse(readFileSync(path.join(root, `${book.id}.json`), "utf8"));
      for (const page of book.pages) {
        expect(page.imageStatus).toBe("complete");
        expect(page.imageUrl).toBe(`/library/sanzijing/${book.id}/${page.page}.webp`);
        const file = path.resolve(`public${page.imageUrl}`);
        expect(statSync(file).size).toBeGreaterThan(1000);
        expect(statSync(file).size).toBeLessThanOrEqual(300 * 1024);
        expect(await sharp(file).metadata()).toMatchObject({ width: 1200, height: 1200, format: "webp" });
        const provenance = source.book.pages[page.page - 1];
        expect(provenance.generatedWith).toBe("builtin-imagegen");
        expect(provenance.generatedSource).toMatch(/generated_images\/.*\.png$/);
        expect(provenance.generationPrompt).toBeTruthy();
        if (page.page > 1) expect(provenance.characterReference).toBe(source.book.pages[0].generatedSource);
        hashes.add(createHash("sha256").update(readFileSync(file)).digest("hex"));
      }
    }
    expect(hashes.size).toBe(180);
  });

  it("bundles pre-generated non-silent Chinese narration and rejects stale text", () => {
    for (const book of expandedBooks()) {
      const audio = getLibraryChineseAudio("sanzijing", book.id, book.pages);
      expect(audio, book.id).toBeDefined();
      if (!audio) continue;
      expect(audio.url).toBe(`/library/sanzijing/${book.id}/zh-${audio.contentHash.slice(0, 16)}.mp3`);
      expect(audio.pageStarts).toHaveLength(18);
      expect(audio.pageStarts[0]).toBe(0);
      expect(audio.pageStarts.every((time, i) => i === 0 || time > audio.pageStarts[i - 1])).toBe(true);
      expect(audio.duration).toBeGreaterThan(audio.pageStarts[17]);
      const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", path.resolve(`public${audio.url}`), "-f", "s16le", "-ac", "1", "-ar", "24000", "pipe:1"], { maxBuffer: 64 * 1024 * 1024 });
      expect(Math.abs(pcm.length / 48000 - audio.duration)).toBeLessThan(0.05);
      let energy = 0;
      for (let i = 0; i < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
      expect(Math.sqrt(energy / (pcm.length / 2))).toBeGreaterThan(15);
      const changed = book.pages.map((page, i) => i ? page : { ...page, zhText: page.zhText + "修改" });
      expect(getLibraryChineseAudio("sanzijing", book.id, changed)).toBeUndefined();
    }
  });

  it("groups classics, family stories and skills, with discovery and navigation across groups", () => {
    const series = getSeries("sanzijing")!;
    const books = getPublishedBooks("sanzijing");
    const summaries = books.map((book) => createLibraryBookSummary(series, book));
    expect(groupLibraryBooksBySubseries(summaries).map((group) => ({ title: group.subseries?.title, count: group.books.length }))).toEqual([
      { title: "三字经", count: 6 }, { title: "亲子相处", count: 10 }, { title: "学会新本领", count: 10 },
    ]);
    expect(filterLibraryBooks(summaries, { query: "跳绳", filters: { category: "family-growth", seriesId: "sanzijing", language: "bilingual" } }).map((book) => book.id)).toContain("sheng-zi-shua-de-yi-sheng");
    const urls = sitemap().map((entry) => entry.url);
    for (let i = 6; i < books.length; i++) {
      expect(urls.some((url) => url.endsWith(`/library/sanzijing/${books[i].id}`))).toBe(true);
      expect(getAdjacentBooks("sanzijing", books[i].id).previous?.id).toBe(books[i - 1].id);
      expect(getAdjacentBooks("sanzijing", books[i].id).next?.id ?? null).toBe(books[i + 1]?.id ?? null);
    }
  });
});
