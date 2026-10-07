/** Build a numbered review sheet; never mark an illustration as reviewed. */
import { readFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

async function main() {
  const batch = path.resolve("content-drafts/qinzi/batch-07-16");
  const plan = JSON.parse(await readFile(path.join(batch, "plan.json"), "utf8"));
  const partial = process.argv.includes("--partial");
  const selectedIndex = process.argv.indexOf("--book");
  const selected = selectedIndex >= 0 ? process.argv[selectedIndex + 1] : undefined;
  const tile = 280, cellHeight = 304, columns = 4;
  for (const item of plan.books as Array<{ id: string; pages: number }>) {
    if (selected && item.id !== selected) continue;
    const layers: sharp.OverlayOptions[] = [];
    let complete = 0;
    for (let page = 1; page <= item.pages; page++) {
      const file = path.resolve("public/library/sanzijing", item.id, `${page}.webp`);
      const available = await access(file).then(() => true).catch(() => false);
      if (!available && !partial) throw new Error(`Missing illustration ${item.id}/${page}`);
      const left = ((page - 1) % columns) * tile;
      const top = Math.floor((page - 1) / columns) * cellHeight;
      if (available) {
        layers.push({ input: await sharp(file).resize(tile, tile).toBuffer(), left, top });
        complete++;
      }
      const label = `<svg width="${tile}" height="24"><rect width="${tile}" height="24" fill="#fffaf2"/><text x="10" y="17" font-family="sans-serif" font-size="14" fill="#5f4836">Page ${page}${available ? "" : " pending"}</text></svg>`;
      layers.push({ input: Buffer.from(label), left, top: top + tile });
    }
    const dir = path.join(batch, item.id);
    await mkdir(dir, { recursive: true });
    const output = path.join(dir, partial ? "contact-sheet-in-progress.jpg" : "contact-sheet.jpg");
    await sharp({ create: { width: columns * tile, height: Math.ceil(item.pages / columns) * cellHeight, channels: 3, background: "#fffaf2" } }).composite(layers).jpeg({ quality: 92 }).toFile(output);
    console.log(JSON.stringify({ book: item.id, complete, total: item.pages, output }));
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Contact sheet failed"); process.exitCode = 1; });
