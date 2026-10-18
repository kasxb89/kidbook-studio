import { z } from "zod";
export const printSettingsSchema = z.object({
  mode: z.enum(["press", "office"]).default("press"),
  binding: z.enum(["left", "saddle"]).default("left"),
  bleedMm: z.number().min(0).max(6).default(3),
  innerMm: z.number().min(12).max(35).default(18),
  outerMm: z.number().min(10).max(30).default(12),
  topMm: z.number().min(10).max(30).default(15),
  bottomMm: z.number().min(10).max(30).default(15),
  bodyPt: z.number().min(14).max(28).default(20),
  imageWidthMm: z.number().min(60).max(190).default(180),
  cropMarks: z.boolean().default(false),
});
export type PrintSettings = z.infer<typeof printSettingsSchema>;
export const defaultPrintSettings = (): PrintSettings => printSettingsSchema.parse({});
export const MM_TO_PT = 72 / 25.4;
export const PRINT_PPI = 300;
export type PrintLeaf = { kind: "cover" | "inside-front" | "story" | "padding" | "inside-back" | "back"; sourcePage?: number; physical: number };
export function printLeaves(pageCount: number, binding: PrintSettings["binding"]): PrintLeaf[] {
  const leaves: Omit<PrintLeaf,"physical">[] = [{kind:"cover", sourcePage:0},{kind:"inside-front"}];
  for(let p=1;p<=pageCount;p++) leaves.push({kind:"story",sourcePage:p});
  const multiple = binding === "saddle" ? 4 : 2;
  while((leaves.length + 2) % multiple) leaves.push({kind:"padding"});
  leaves.push({kind:"inside-back"},{kind:"back"});
  return leaves.map((p,i)=>({...p,physical:i+1}));
}
export function printGeometry(settings: PrintSettings, physical: number) {
  const bleed = settings.mode === "press" ? settings.bleedMm : 0;
  const marks = settings.mode === "press" && settings.cropMarks ? 6 : 0;
  const origin = (bleed+marks)*MM_TO_PT;
  const left = physical % 2 ? settings.innerMm : settings.outerMm;
  const right = physical % 2 ? settings.outerMm : settings.innerMm;
  return {
    mediaWidth:(210+2*(bleed+marks))*MM_TO_PT,
    mediaHeight:(297+2*(bleed+marks))*MM_TO_PT,
    trim:{x:origin,y:origin,width:210*MM_TO_PT,height:297*MM_TO_PT},
    bleed:{x:marks*MM_TO_PT,y:marks*MM_TO_PT,width:(210+2*bleed)*MM_TO_PT,height:(297+2*bleed)*MM_TO_PT},
    safe:{x:origin+left*MM_TO_PT,y:origin+settings.bottomMm*MM_TO_PT,width:(210-left-right)*MM_TO_PT,height:(297-settings.topMm-settings.bottomMm)*MM_TO_PT},
  };
}
export function bookletPairs(pageCount: number) {
  if(pageCount%4) throw new Error("骑马订页数必须为4的倍数。");
  const pairs:number[][]=[];
  for(let sheet=0;sheet<pageCount/4;sheet++) pairs.push([pageCount-1-sheet*2,sheet*2],[sheet*2+1,pageCount-2-sheet*2]);
  return pairs;
}
