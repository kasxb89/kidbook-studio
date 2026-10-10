/** Import one built-in imagegen result; preserve prior art and record resumable progress. */
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

async function main() {
  const options = Object.fromEntries(process.argv.slice(2).map(arg => {
    const match = arg.match(/^--(batch|book|page|source)=(.+)$/);
    if (!match) throw new Error("Use --batch=, --book=, --page=cover|NUMBER and --source=");
    return [match[1], match[2]];
  }));
  const batch = options.batch ?? "81-90";
  if (!/^\d+-\d+$/.test(batch) || !/^[a-z0-9-]+$/.test(options.book ?? "")) throw new Error("Invalid batch or book");
  const cover = options.page === "cover";
  const page = cover ? null : Number(options.page);
  if (!options.source || (!cover && (!Number.isInteger(page) || Number(page) < 1))) throw new Error("Invalid source or page");
  const root = process.cwd();
  const draftFile = path.resolve(`content-drafts/chengyu/chengyu-${batch}.json`);
  const manifestFile = path.resolve(`content-drafts/chengyu/chengyu-${batch}-image-generation.json`);
  const statusFile = path.resolve(`content-drafts/chengyu/chengyu-${batch}-production-status.json`);
  const drafts = JSON.parse(await readFile(draftFile, "utf8"));
  const book = drafts.find((item: { id: string }) => item.id === options.book);
  if (!book || (!cover && Number(page) > book.pages.length)) throw new Error("Unknown book or page");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  const source = path.resolve(options.source);
  const kind = cover ? "cover" : "page";
  const existing = manifest.images.find((item: { bookId: string; page: number | null; kind: string; sourcePath: string; active?: boolean }) =>
    item.bookId === book.id && item.page === page && item.kind === kind && item.sourcePath === source && item.active !== false);
  if (existing && await stat(path.resolve(existing.workspacePath)).then(() => true, () => false)) {
    console.log(JSON.stringify({ book: book.id, page: cover ? "cover" : page, status: "already-imported", path: existing.workspacePath }));
  } else {
    const input = await readFile(source);
    let output: Buffer | undefined;
    for (const quality of [82, 76, 70, 64, 58, 52]) {
      output = await sharp(input).resize(1024, 1024, { fit: "cover" }).webp({ quality, effort: 6 }).toBuffer();
      if (output.length <= 300 * 1024) break;
    }
    if (!output || output.length > 300 * 1024) throw new Error("Image exceeds 300 KiB");
    const directory = path.resolve("public/library/chengyu", book.id);
    await mkdir(directory, { recursive: true });
    let filename = cover ? "cover.webp" : `${page}.webp`;
    const originalExists = await stat(path.join(directory, filename)).then(() => true, () => false);
    if (originalExists && cover) {
      const backupDir = path.resolve("content-drafts/chengyu/variants", book.id);
      await mkdir(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, "cover-before-ancient.webp");
      if (!await stat(backupPath).then(() => true, () => false)) await copyFile(path.join(directory, filename), backupPath);
      for (const record of manifest.images.filter((item: { bookId: string; kind: string; active?: boolean }) => item.bookId === book.id && item.kind === "cover" && item.active === false)) {
        record.preservedWorkspacePath = path.relative(root, backupPath);
      }
    } else if (originalExists) {
      let version = 2;
      while (await stat(path.join(directory, `${page}-v${version}.webp`)).then(() => true, () => false)) version++;
      filename = `${page}-v${version}.webp`;
      book.pages[Number(page) - 1].imageFile = filename;
      await writeFile(`${draftFile}.tmp`, JSON.stringify(drafts, null, 2) + "\n");
      await rename(`${draftFile}.tmp`, draftFile);
    }
    const workspacePath = path.relative(root, path.join(directory, filename));
    await writeFile(path.join(directory, `${filename}.tmp`), output);
    await rename(path.join(directory, `${filename}.tmp`), path.join(directory, filename));
    for (const record of manifest.images.filter((item: { bookId: string; kind: string; page: number | null; active?: boolean }) => item.bookId === book.id && item.kind === kind && item.page === page && item.active !== false)) record.active = false;
    manifest.images.push({ bookId: book.id, page, kind, sourcePath: source, review: "pending-visual-review", active: true,
      imageUrl: `/library/chengyu/${book.id}/${filename}`, workspacePath, bytes: output.length, importedAt: new Date().toISOString(), artDirection: "ancient-chinese-human-characters" });
    await writeFile(`${manifestFile}.tmp`, JSON.stringify(manifest, null, 2) + "\n");
    await rename(`${manifestFile}.tmp`, manifestFile);
    const status = JSON.parse(await readFile(statusFile, "utf8"));
    const active = manifest.images.filter((item: { active?: boolean }) => item.active !== false);
    status.stage = "generating-assets";
    status.generatedCovers = active.filter((item: { kind: string }) => item.kind === "cover").length;
    status.acceptedCovers = active.filter((item: { kind: string; review: string }) => item.kind === "cover" && item.review === "accepted-as-cover").length;
    status.bodyIllustrations = active.filter((item: { kind: string }) => item.kind === "page").length;
    status.coversToRegenerate = status.coversToRegenerate.filter((id: string) => !active.some((item: { bookId: string; kind: string }) => item.bookId === id && item.kind === "cover"));
    status.visualReviewPending = active.filter((item: { review: string }) => item.review === "pending-visual-review").length;
    status.chineseAudioBooks = Object.keys(JSON.parse(await readFile(path.resolve(`content-drafts/chengyu/chengyu-${batch}-audio.json`), "utf8"))).length;
    await writeFile(`${statusFile}.tmp`, JSON.stringify(status, null, 2) + "\n");
    await rename(`${statusFile}.tmp`, statusFile);
    console.log(JSON.stringify({ book: book.id, page: cover ? "cover" : page, status: "imported", path: workspacePath, bytes: output.length }));
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Image import failed");
  process.exitCode = 1;
});
