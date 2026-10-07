/** Save one built-in image and its generation provenance; never reuse one image for multiple pages. */
import { readFile, writeFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => args[args.indexOf(name) + 1];
  const bookId = option("--book"), page = Number(option("--page")), source = option("--source");
  if (!/^[a-z0-9-]+$/.test(bookId ?? "") || !Number.isInteger(page) || page < 1 || page > 18 || !path.isAbsolute(source ?? "")) {
    throw new Error("--book, --page 1–18, and an absolute --source are required");
  }
  const batch = path.resolve("content-drafts/qinzi/batch-07-16");
  const queue: Array<{ book: string; page: number; prompt: string }> = JSON.parse(await readFile(path.join(batch, "image-prompts.json"), "utf8"));
  const job = queue.find((item) => item.book === bookId && item.page === page);
  if (!job) throw new Error("Image is outside the approved batch");
  const draftPath = path.resolve("content-drafts/qinzi", `${bookId}.json`);
  const draft = JSON.parse(await readFile(draftPath, "utf8"));
  const output = path.resolve("public/library/sanzijing", bookId, `${page}.webp`);
  const exists = await stat(output).catch(() => undefined);
  if (exists && !args.includes("--record-existing") && !args.includes("--replace")) throw new Error("Image already exists; inspect before explicitly replacing");
  if (!args.includes("--record-existing")) {
    let bytes: Buffer | undefined;
    for (const quality of [86, 82, 76, 70, 64, 58, 52, 46, 40, 34, 28]) {
      const candidate = await sharp(source).resize(1200, 1200, { fit: "cover" }).webp({ quality, effort: 6 }).toBuffer();
      if (candidate.length <= 300 * 1024) { bytes = candidate; break; }
    }
    if (!bytes) throw new Error("Image exceeds 300 KiB budget");
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(`${output}.tmp`, bytes);
    await rename(`${output}.tmp`, output);
  }
  const referencePrefix = "Input image 1 is a CHARACTER AND STYLE REFERENCE ONLY, not an edit target. Preserve its character identity, clothing and watercolor material; create a new composition for THIS PAGE'S SCENE. ";
  const prompt = args.includes("--prompt-file") ? await readFile(option("--prompt-file"), "utf8") : (page > 1 ? referencePrefix : "") + job.prompt;
  const index = draft.book.pages.findIndex((item: { page: number }) => item.page === page);
  if (index < 0) throw new Error("Page missing from manuscript");
  const editedFrom = args.includes("--replace") ? draft.book.pages[index].generatedSource : undefined;
  draft.book.pages[index] = { ...draft.book.pages[index], ...(editedFrom ? { editedFrom } : {}), imageStatus: "complete", generatedWith: "builtin-imagegen", generatedSource: source, generationPrompt: prompt };
  if (page > 1) draft.book.pages[index].characterReference = draft.book.pages[0].generatedSource;
  await writeFile(`${draftPath}.tmp`, JSON.stringify(draft, null, 2) + "\n");
  await rename(`${draftPath}.tmp`, draftPath);
  console.log(JSON.stringify({ book: bookId, page, saved: output, bytes: (await stat(output)).size }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Image import failed"); process.exitCode = 1; });
