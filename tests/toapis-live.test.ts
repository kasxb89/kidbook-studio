import { it } from "vitest";
import fs from "node:fs";
import { requestToapisImage } from "@/lib/custom-book/toapis";
it.skipIf(process.env.RUN_TOAPIS_LIVE !== "1")("generates one live connection sample", async () => {
  const bytes = await requestToapisImage({ baseUrl: process.env.CUSTOM_BOOK_IMAGE_BASE_URL!, apiKey: process.env.CUSTOM_BOOK_IMAGE_API_KEY! }, "A single friendly teddy bear holding a blue toy bucket, watercolor children's picture book, simple pale background, no text.", [], "1024x1024", "gpt-image-2", "connection-check-20261018");
  fs.writeFileSync("artifacts/evaluation/toapis-connection-check.png", bytes);
}, 260_000);
