/** Create numbered local review sheets; does not generate, upload or publish assets. */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

async function main() {
  const batch = process.argv.find(arg => arg.startsWith("--batch="))?.slice(8) ?? "81-90";
  const selected = process.argv.find(arg => arg.startsWith("--book="))?.slice(7);
  if (!/^\d+-\d+$/.test(batch) || selected && !/^[a-z0-9-]+$/.test(selected)) throw new Error("Invalid batch or book");
  const drafts = JSON.parse(await readFile(path.resolve(`content-drafts/chengyu/chengyu-${batch}.json`), "utf8"));
  const folder = path.resolve("content-drafts/chengyu/contact-sheets");
  await mkdir(folder, { recursive: true });
  for (const book of drafts.filter((item: { id: string }) => !selected || item.id === selected)) {
    const tiles: sharp.OverlayOptions[] = [];
    let images = 0;
    for (const [index, page] of book.pages.entries()) {
      const input = await readFile(path.resolve("public/library/chengyu", book.id, page.imageFile ?? `${page.page}.webp`)).catch(error => {
        if (error.code !== "ENOENT") throw error;
        return undefined;
      });
      if (input) {
        tiles.push({ input: await sharp(input).resize(300, 300).jpeg({ quality: 88 }).toBuffer(), left: index % 4 * 300, top: Math.floor(index / 4) * 328 });
        images++;
      }
      const label = Buffer.from(`<svg width="300" height="28"><rect width="300" height="28" fill="white"/><text x="12" y="20" font-size="18" fill="#333">${page.page}${input ? "" : " - pending"}</text></svg>`);
      tiles.push({ input: label, left: index % 4 * 300, top: Math.floor(index / 4) * 328 + 300 });
    }
    const output = path.join(folder, `${book.id}.jpg`);
    await sharp({ create: { width: 1200, height: Math.ceil(book.pages.length / 4) * 328, channels: 3, background: "#e7e4de" } })
      .composite(tiles).jpeg({ quality: 90 }).toFile(output);
    console.log(JSON.stringify({ book: book.id, pages: book.pages.length, images, path: output }));
  }
  if (!selected) {
    const tiles = [];
    for (const [index, book] of drafts.entries()) {
      const input = await readFile(path.resolve("public/library/chengyu", book.id, "cover.webp"));
      tiles.push({ input: await sharp(input).resize(300, 300).jpeg({ quality: 88 }).toBuffer(), left: index % 5 * 300, top: Math.floor(index / 5) * 328 });
      const label = Buffer.from(`<svg width="300" height="28"><rect width="300" height="28" fill="white"/><text x="10" y="20" font-size="17" fill="#333">${book.title}</text></svg>`);
      tiles.push({ input: label, left: index % 5 * 300, top: Math.floor(index / 5) * 328 + 300 });
    }
    const output = path.resolve(`content-drafts/chengyu/chengyu-${batch}-covers-ancient.jpg`);
    await sharp({ create: { width: 1500, height: Math.ceil(drafts.length / 5) * 328, channels: 3, background: "#e7e4de" } })
      .composite(tiles).jpeg({ quality: 90 }).toFile(output);
    console.log(JSON.stringify({ covers: drafts.length, path: output }));
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Contact sheet failed");
  process.exitCode = 1;
});
