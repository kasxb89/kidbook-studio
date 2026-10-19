export type VisualStyle = "realistic" | "anime";
type StyleDraft = { visualStyle?: VisualStyle; characters: readonly { asset?: { appearance: string } }[] };
export function visualStyleFor(draft: StyleDraft): VisualStyle {
  if (draft.visualStyle) return draft.visualStyle;
  // Migrate the old per-photo choice without changing existing illustrations.
  if (draft.characters.some(c => c.asset?.appearance === "anime")) return "anime";
  return draft.characters.some(c => c.asset?.appearance === "original") ? "realistic" : "anime";
}
export function visualStyleInstruction(draft: StyleDraft) {
  return visualStyleFor(draft) === "realistic"
    ? "Visual style is PHOTOREALISTIC. Show real human faces and natural human proportions, authentic skin texture and photographic lighting. Keep the photographed child's recognizable identity and age. Never turn the child into a cartoon, anime, doll, painted or illustrated character. This choice overrides style words in scene data, old artwork references and retouch notes."
    : "Visual style is ANIME PICTURE BOOK. Render every character as a coherent drawn anime character, including faces and skin. Preserve recognizable hairstyle, outfit and identity from references without mixing photorealistic faces into the illustrated scene. This choice overrides style words in scene data and old photo references.";
}
