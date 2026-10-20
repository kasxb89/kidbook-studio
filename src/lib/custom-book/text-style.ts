import { z } from "zod";
import { BOOK_FONT_IDS } from "./font-catalog";

const colour = z.string().regex(/^#[0-9a-f]{6}$/i);
export const textPlacementSchema = z.object({
  x: z.number().min(0).max(100), y: z.number().min(0).max(100), width: z.number().min(5).max(100),
});
export const bookTypographySchema = z.object({
  preset: z.enum(["paragraph", "storybook"]).optional(),
  fontFamily: z.enum(BOOK_FONT_IDS).optional(),
  size: z.number().min(8).max(180),
  color: colour,
  opacity: z.number().min(0).max(1).optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  inkWeight: z.number().min(0).max(.12).optional(),
  letterSpacing: z.number().min(-.1).max(1).optional(),
  lineHeight: z.number().min(.8).max(3).optional(),
  rotation: z.number().min(-180).max(180).optional(),
  strokeWidth: z.number().min(0).max(12).optional(),
  strokeColor: colour.optional(),
  shadow: z.boolean().optional(),
  shadowColor: colour.optional(),
  shadowOpacity: z.number().min(0).max(1).optional(),
  shadowX: z.number().min(-40).max(40).optional(),
  shadowY: z.number().min(-40).max(40).optional(),
  textBox: textPlacementSchema.nullable().optional(),
  position: z.enum(["top", "middle", "bottom"]),
  align: z.enum(["left", "center", "right"]),
  backing: z.boolean(),
  backingColor: colour.optional(),
  backingOpacity: z.number().min(0).max(1).optional(),
  backingStyle: z.enum(["soft", "solid"]).optional(),
  backingPaddingX: z.number().min(0).max(80).optional(),
  backingPaddingY: z.number().min(0).max(80).optional(),
  backingRadius: z.number().min(0).max(80).optional(),
  backingBorderWidth: z.number().min(0).max(12).optional(),
  backingBorderColor: colour.optional(),
  background: colour,
});
export type BookTypography = z.infer<typeof bookTypographySchema>;
export const DEFAULT_TEXT_EFFECTS = {
  opacity: 1, italic: false, underline: false, rotation: 0,
  strokeWidth: 0, strokeColor: "#ffffff", shadow: false, shadowColor: "#17221c",
  shadowOpacity: .45, shadowX: 2, shadowY: 3,
  backingPaddingX: 16, backingPaddingY: 12, backingRadius: 0,
  backingBorderWidth: 0, backingBorderColor: "#53675b",
} as const;

export const TEXT_PALETTES = {
  "常用": ["#151b18", "#283e32", "#624536", "#a64f2f", "#285c72", "#8c6622", "#ffffff", "#fff7e8"],
  "暖色": ["#7f1d1d", "#b53131", "#e05a4f", "#f58c6c", "#a54223", "#c9782d", "#e4ae42", "#f7d773"],
  "冷色": ["#173d61", "#245f8c", "#3887a3", "#70b7c4", "#25583d", "#528259", "#5a447a", "#9871ad"],
  "浅色": ["#fffdf5", "#f6e7c9", "#f6ded8", "#eee1f4", "#dcebf5", "#ddf0ec", "#e7eed9", "#f4efcf"],
  "深色": ["#17201c", "#23394a", "#303452", "#45344e", "#643b43", "#603e2b", "#4d512b", "#214d48"],
  "亮色": ["#ffca3a", "#ff924c", "#ff595e", "#f15bb5", "#9b5de5", "#1982c4", "#00b4a2", "#69a83b"],
} as const;

export function textBackingRect(design: BookTypography, region: { x:number; y:number; width:number; height:number }) {
  const px = design.backingPaddingX ?? 16, py = design.backingPaddingY ?? 12;
  return { x:region.x-px, y:region.y-py, width:region.width+px*2, height:region.height+py*2, radius:Math.min(design.backingRadius??0,(region.width+px*2)/2,(region.height+py*2)/2) };
}
