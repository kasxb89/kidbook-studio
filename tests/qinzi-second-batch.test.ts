import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { getBook, getSeries, getPublishedBooks, getAdjacentBooks } from "@/lib/library";
import { createLibraryBookSummary, groupLibraryBooksBySubseries } from "@/lib/library/catalog";
import { getLibraryChineseAudio } from "@/lib/library-book-audio";
import { getLibraryStorySpecByContentId } from "@/lib/library/personalization";
import sitemap from "@/app/sitemap";
import plan from "../content-drafts/qinzi/batch-17-26/plan.json";

const root = path.resolve("content-drafts/qinzi");
const books = () => plan.books.map(({ id }) => getBook("sanzijing", id)!);

describe("Second approved parenting batch", () => {
  it("preserves all approved Chinese pages and ships 180 bilingual pages in series order", () => {
    expect(plan.approved).toBe(true);
    expect(getSeries("sanzijing")).toMatchObject({ title: "亲子成长", bookCount: 26 });
    expect(getPublishedBooks("sanzijing").slice(16).map((book) => book.id)).toEqual(plan.books.map(({ id }) => id));
    for (const item of plan.books) {
      const book = getBook("sanzijing", item.id);
      expect(book, item.id).not.toBeNull();
      if (!book) continue;
      const approved = JSON.parse(readFileSync(path.join(root, "batch-17-26/books", `${item.id}.json`), "utf8"));
      expect(approved.approved).toBe(true);
      expect(book.order).toBe(item.order);
      expect(book.pages).toHaveLength(18);
      expect(book.pages.map((page) => page.page)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
      expect(book.pages.map((page) => page.zhText)).toEqual(approved.pages.map((page: { zh: string }) => page.zh));
      expect(book.pages.every((page) => page.enText.trim() && page.illustrationPrompt?.trim())).toBe(true);
      expect(book.comingSoon).toBe(false);
      expect(book.metadata).toMatchObject({ category: "family-growth", personalizationEnabled: false });
      expect(getLibraryStorySpecByContentId(`sanzijing/${item.id}`)).toBeNull();
      expect(book.parentGuide?.questions).toHaveLength(3);
      expect(book.parentGuide?.activity).toBeTruthy();
    }
  });

  it("serves 180 distinct decoded square WebP images with generation provenance", async () => {
    const hashes = new Set<string>();
    for (const book of books()) {
      expect(book, "book integrated").toBeDefined();
      const source = JSON.parse(readFileSync(path.join(root, `${book.id}.json`), "utf8"));
      for (const page of book.pages) {
        expect(page.imageStatus).toBe("complete");
        expect(page.imageUrl).toBe(`/library/sanzijing/${book.id}/${page.page}.webp`);
        const file = path.resolve(`public${page.imageUrl}`);
        expect(statSync(file).size).toBeGreaterThan(1000);
        expect(statSync(file).size).toBeLessThanOrEqual(300 * 1024);
        expect(await sharp(file).metadata()).toMatchObject({ width: 1200, height: 1200, format: "webp" });
        const stats = await sharp(file).stats();
        expect(stats.channels.some((channel) => channel.stdev > 10)).toBe(true);
        const provenance = source.book.pages[page.page - 1];
        expect(provenance.generatedWith).toBe("builtin-imagegen");
        expect(provenance.generatedSource).toMatch(/generated_images\/.*\.png$/);
        expect(provenance.generationPrompt).toBeTruthy();
        if (page.page > 1) expect(provenance.characterReference).toBe(source.imagePromptKit.characterReferenceSource);
        hashes.add(createHash("sha256").update(readFileSync(file)).digest("hex"));
      }
    }
    expect(hashes.size).toBe(180);
    const review = JSON.parse(readFileSync(path.join(root, "batch-17-26/visual-review.json"), "utf8"));
    expect(review.status).toBe("reviewed");
    expect(review.books.map((book: { id: string }) => book.id)).toEqual(plan.books.map((book) => book.id));
  }, 30000);

  it("bundles matching narration with increasing page starts, decoded duration and non-silent pages", () => {
    for (const item of plan.books) {
      const { book } = JSON.parse(readFileSync(path.join(root, `${item.id}.json`), "utf8"));
      const audio = getLibraryChineseAudio("sanzijing", item.id, book.pages);
      expect(audio, item.id).toBeDefined();
      if (!audio) continue;
      expect(audio.pageStarts).toHaveLength(18);
      expect(audio.pageStarts[0]).toBe(0);
      expect(audio.pageStarts.every((time, i) => i === 0 || time > audio.pageStarts[i - 1])).toBe(true);
      expect(audio.duration).toBeGreaterThan(audio.pageStarts[17]);
      const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", path.resolve(`public${audio.url}`), "-f", "s16le", "-ac", "1", "-ar", "24000", "pipe:1"], { maxBuffer: 64 * 1024 * 1024 });
      expect(Math.abs(pcm.length / 48000 - audio.duration)).toBeLessThan(0.05);
      for (const [i, start] of audio.pageStarts.entries()) {
        const end = audio.pageStarts[i + 1] ?? audio.duration;
        const from = Math.floor(start * 24000) * 2;
        const to = Math.min(pcm.length, Math.floor(end * 24000) * 2);
        let energy = 0;
        for (let at = from; at < to; at += 2) energy += pcm.readInt16LE(at) ** 2;
        expect(Math.sqrt(energy / ((to - from) / 2)), `${item.id} page ${i + 1}`).toBeGreaterThan(15);
      }
      const changed = book.pages.map((page: { zhText: string }, i: number) => i ? page : { ...page, zhText: page.zhText + "修改" });
      expect(getLibraryChineseAudio("sanzijing", item.id, changed)).toBeUndefined();
    }
  });

  it("adds both subseries to discovery, sitemap and navigation without disturbing old books", () => {
    const series = getSeries("sanzijing")!;
    const all = getPublishedBooks("sanzijing");
    const groups = groupLibraryBooksBySubseries(all.map((book) => createLibraryBookSummary(series, book)));
    expect(groups.map((group) => ({ title: group.subseries?.title, count: group.books.length }))).toEqual([
      { title: "三字经", count: 6 }, { title: "亲子相处", count: 10 }, { title: "学会新本领", count: 10 },
    ]);
    const urls = sitemap().map((entry) => entry.url);
    for (const item of plan.books) {
      const index = all.findIndex((book) => book.id === item.id);
      expect(urls.some((url) => url.endsWith(`/library/sanzijing/${item.id}`))).toBe(true);
      expect(getAdjacentBooks("sanzijing", item.id).previous?.id).toBe(all[index - 1].id);
      expect(getAdjacentBooks("sanzijing", item.id).next?.id ?? null).toBe(all[index + 1]?.id ?? null);
    }
  });
});
