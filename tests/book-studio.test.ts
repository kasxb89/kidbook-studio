import { describe, expect, it } from "vitest";
import { createWorkbenchDraft, makeAsset } from "@/lib/custom-workbench";
import { recordStudioChanges } from "@/lib/book-studio";
import { localDraftSchema } from "@/lib/local/schema";
const image = (id: string) => ({
  ...makeAsset(`/sample-books/${id}.png`, id, "page"),
  origin: "sample" as const,
});
describe("local book studio", () => {
  it("archives replaced and removed images, without duplicating crop changes or restored versions", () => {
    const initial = createWorkbenchDraft(false);
    initial.pages[0].asset = image("first");
    const second = structuredClone(initial);
    second.pages[0].asset = image("second");
    const saved = recordStudioChanges(initial, second);
    expect(saved.studio?.pages?.[1].versions).toHaveLength(2);
    const cropped = structuredClone(saved);
    cropped.pages[0].asset!.crop.zoom = 1.5;
    const edited = recordStudioChanges(saved, cropped);
    expect(edited.studio?.pages?.[1].versions).toHaveLength(2);
    const removed = structuredClone(edited);
    removed.pages[0].asset = undefined;
    expect(
      recordStudioChanges(edited, removed).studio?.pages?.[1].versions,
    ).toHaveLength(2);
    const restored = structuredClone(edited);
    restored.pages[0].asset = image("first");
    expect(
      recordStudioChanges(edited, restored).studio?.pages?.[1].versions,
    ).toHaveLength(2);
  });
  it("preserves studio metadata when generation returns only server fields and invalidates changed page approvals", () => {
    const before = createWorkbenchDraft(false);
    before.studio = {
      selectedPage: 2,
      activePanel: "canvas",
      view: "canvas",
      pages: { "1": { review: "approved", typography: { size: 28 } } },
    };
    const incoming = structuredClone(before);
    delete incoming.studio;
    incoming.pages[0].text = "修改后的正文";
    const result = recordStudioChanges(before, incoming);
    expect(result.studio?.selectedPage).toBe(2);
    expect(result.studio?.activePanel).toBe("canvas");
    expect(result.studio?.pages?.[1].typography?.size).toBe(28);
    expect(result.studio?.pages?.[1].review).toBe("draft");
  });
  it("round trips selection, typography and image history through the disk schema", () => {
    const draft = createWorkbenchDraft(false);
    draft.pages[0].asset = image("first");
    draft.studio = {
      selectedPage: 1,
      activePanel: "canvas",
      workspace: "edit",
      view: "canvas",
      pages: {
        "1": {
          review: "approved",
          typography: { position: "top", size: 31 },
          versions: [
            {
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              asset: image("old"),
            },
          ],
        },
      },
    };
    expect(
      localDraftSchema.parse(JSON.parse(JSON.stringify(draft))).studio,
    ).toEqual(draft.studio);
  });
});
