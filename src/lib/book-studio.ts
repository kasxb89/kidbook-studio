import {
  spreadStart,
  type CustomWorkbenchDraft,
  type WorkbenchAsset,
} from "./custom-workbench";
export type ImageVersion = {
  id: string;
  createdAt: string;
  asset: WorkbenchAsset;
};
export type StudioPage = {
  versions?: ImageVersion[];
  review?: "draft" | "approved";
  typography?: Partial<CustomWorkbenchDraft["typography"]>;
};
export type BookStudio = {
  aiPrepared?: boolean;
  selectedPage?: number;
  workspace?: "board" | "edit";
  activePanel?: "create" | "board" | "canvas" | "print";
  view?: "book" | "canvas";
  pages?: Record<string, StudioPage>;
};
export function assetForPage(draft: CustomWorkbenchDraft, page: number) {
  return page === 0 ? draft.cover : draft.pages[page - 1]?.asset;
}
function identity(asset?: WorkbenchAsset) {
  return asset?.storagePath || asset?.src;
}
// Store file references, never duplicate image bytes in the draft/recovery journal.
export function recordStudioChanges(
  previous: CustomWorkbenchDraft,
  incoming: CustomWorkbenchDraft,
): CustomWorkbenchDraft {
  const studio = {
    ...(incoming.studio || previous.studio),
    pages: { ...(incoming.studio?.pages || previous.studio?.pages) },
  };
  for (let page = 0; page <= Math.max(previous.pages.length, incoming.pages.length); page++) {
    const before = assetForPage(previous, page),
      after = assetForPage(incoming, page);
    const entry = { ...studio.pages[String(page)] };
    const versions = [...(entry.versions || [])];
    for (const asset of [before, after]) {
      if (asset && !versions.some((v) => identity(v.asset) === identity(asset)))
        versions.push({
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          asset: structuredClone(asset),
        });
    }
    if (versions.length) entry.versions = versions.slice(-32);
    const contentChanged =
      page === 0
        ? previous.title !== incoming.title ||
          previous.subtitle !== incoming.subtitle ||
          JSON.stringify(previous.cover) !== JSON.stringify(incoming.cover)
        : JSON.stringify(previous.pages[page - 1]) !==
          JSON.stringify(incoming.pages[page - 1]);
    const sharedImageChanged =
      page > 0 &&
      JSON.stringify(
        assetForPage(previous, spreadStart(previous, page) || page),
      ) !==
        JSON.stringify(
          assetForPage(incoming, spreadStart(incoming, page) || page),
        );
    const designPage = spreadStart(incoming, page) || page;
    const sharedDesignChanged =
      JSON.stringify(previous.studio?.pages?.[designPage]?.typography) !==
      JSON.stringify(studio.pages[designPage]?.typography);
    if (
      identity(before) !== identity(after) ||
      contentChanged ||
      sharedImageChanged ||
      sharedDesignChanged ||
      previous.format !== incoming.format ||
      JSON.stringify(previous.studio?.pages?.[page]?.typography) !==
        JSON.stringify(entry.typography) ||
      JSON.stringify(previous.typography) !==
        JSON.stringify(incoming.typography)
    )
      entry.review = "draft";
    if (Object.keys(entry).length) studio.pages[String(page)] = entry;
  }
  return { ...incoming, studio };
}
