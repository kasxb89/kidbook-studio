/** On-device narration: uses installed macOS speech only, without reading credentials or sending text. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { BookAudio } from "../miniprogram/src/core/types";

const voice = "Tingting (中文（中国大陆）)", rate = 170;
const cache = path.resolve(".storybloom-cache/qinzi-local-audio");
const batch = path.resolve("content-drafts/qinzi/batch-07-16");
const manifestPath = path.resolve("content-drafts/qinzi/local-audio.json");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const decode = (file: string) => execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "s16le", "-ar", "24000", "-ac", "1", "pipe:1"], { maxBuffer: 64 * 1024 * 1024, stdio: "pipe" });
const validPcm = (pcm: Buffer) => {
  if (pcm.length < 4800 || pcm.length % 2) return false;
  let energy = 0;
  for (let i = 0; i < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
  return Math.sqrt(energy / (pcm.length / 2)) > 15;
};

async function pagePcm(text: string) {
  const key = hash(JSON.stringify({ engine: "macos-say", voice, rate, text: text.trim(), version: 1 }));
  const file = path.join(cache, `${key}.pcm`);
  try { const pcm = await readFile(file); if (validPcm(pcm)) return pcm; } catch { /* Resume at missing page. */ }
  const source = path.join(cache, `${key}.aiff`);
  let pcm: Buffer;
  try { pcm = decode(source); if (!validPcm(pcm)) throw new Error("Silent cached audio"); }
  catch {
    const input = path.join(cache, `${key}.txt`);
    await writeFile(input, text.trim(), "utf8");
    execFileSync("say", ["-v", voice, "-r", String(rate), "-f", input, "-o", `${source}.tmp.aiff`], { stdio: "pipe", timeout: 60000 });
    await rename(`${source}.tmp.aiff`, source);
    pcm = decode(source);
  }
  if (!validPcm(pcm)) throw new Error("Invalid or silent local narration");
  await writeFile(`${file}.tmp`, pcm); await rename(`${file}.tmp`, file);
  return pcm;
}

async function main() {
  if (process.platform !== "darwin") throw new Error("On-device narration requires macOS");
  const plan = JSON.parse(await readFile(path.join(batch, "plan.json"), "utf8"));
  if (!plan.approved) throw new Error("Content is not approved");
  await mkdir(cache, { recursive: true });
  let manifest: Record<string, BookAudio & { generatedWith?: string; voice?: string; rate?: number }> = {};
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch { /* First local batch. */ }
  for (const { id } of plan.books as Array<{ id: string }>) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid book id");
    const { book } = JSON.parse(await readFile(path.resolve("content-drafts/qinzi", `${id}.json`), "utf8"));
    const texts: string[] = book.pages.map((page: { zhText: string }) => page.zhText.trim());
    if (texts.length !== 18 || texts.some((text) => !text)) throw new Error("Incomplete manuscript");
    const chunks: Buffer[] = [], pageStarts: number[] = [];
    let samples = 0;
    for (const [i, text] of texts.entries()) {
      const pcm = await pagePcm(text);
      pageStarts.push(samples / 24000); chunks.push(pcm); samples += pcm.length / 2;
      if (i < texts.length - 1) { chunks.push(Buffer.alloc(14400)); samples += 7200; }
      console.log(JSON.stringify({ book: id, page: i + 1, status: "decoded-local" }));
    }
    const contentHash = hash(JSON.stringify({ version: 1, texts }));
    const raw = path.join(cache, `${contentHash}.pcm`); await writeFile(raw, Buffer.concat(chunks));
    const dir = path.resolve("public/library/sanzijing", id); await mkdir(dir, { recursive: true });
    const filename = `zh-${contentHash.slice(0, 16)}.mp3`, output = path.join(dir, filename);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", raw, "-c:a", "libmp3lame", "-b:a", "64k", "-f", "mp3", `${output}.tmp`], { stdio: "pipe" });
    const duration = samples / 24000, encoded = decode(`${output}.tmp`);
    if (!validPcm(encoded) || Math.abs(encoded.length / 48000 - duration) > 0.05) throw new Error("Encoded narration validation failed");
    await rename(`${output}.tmp`, output);
    manifest[`sanzijing/${id}`] = { url: `/library/sanzijing/${id}/${filename}`, contentHash, pageStarts, duration, generatedWith: "macos-say-local", voice, rate };
    await writeFile(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2) + "\n"); await rename(`${manifestPath}.tmp`, manifestPath);
    console.log(JSON.stringify({ book: id, pages: 18, seconds: duration, status: "complete-local" }));
  }
  console.log(JSON.stringify({ books: Object.keys(manifest).length, generatedWith: "macos-say-local", textSentToThirdParty: false }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Local narration failed"); process.exitCode = 1; });
