import { z } from "zod";
import { customDraftSchema } from "../custom-book/schema";
import { MAX_BOOK_PAGES } from "../book-config";

const base = customDraftSchema.innerType();
const localAsset = base.shape.cover.unwrap().extend({
  storagePath: z.string().max(300).optional(), src: z.string().max(1500),
  origin: z.enum(["sample", "uploaded", "generated"]).optional(),
});
// Drafts may be incomplete. Generation uses the stricter server schema later.
export const localDraftSchema = base.extend({
  studio: z.object({
    aiPrepared: z.boolean().optional(),
    completedAutomaticJob: z.string().uuid().optional(),
    workspace: z.enum(["board", "edit"]).optional(),
    activePanel: z.enum(["ai", "create", "board", "canvas", "print"]).optional(),
    selectedPage: z.number().int().min(0).max(MAX_BOOK_PAGES).optional(),
    view: z.enum(["book", "canvas"]).optional(),
    pages: z.record(z.string().regex(/^(?:0|[1-9]\d{0,2})$/).refine(key=>Number(key)<=MAX_BOOK_PAGES), z.object({
      review: z.enum(["draft", "approved"]).optional(),
      typography: base.shape.typography.partial().optional(),
      versions: z.array(z.object({ id: z.string().uuid(), createdAt: z.string().datetime(), asset: localAsset })).max(32).optional(),
    })).optional(),
  }).optional(),
  localJobId: z.string().uuid().optional(),
  title: z.string().max(100), theme: z.string().max(300),
  cover: localAsset.optional(),
  characters: z.array(base.shape.characters.element.extend({ name: z.string().max(40), asset: localAsset.optional() })).min(1).max(6),
  pages: z.array(base.shape.pages.element.extend({ asset: localAsset.optional() })).min(1).max(MAX_BOOK_PAGES),
}).superRefine((draft, ctx) => {
  if(draft.pages.length<draft.pageCount)ctx.addIssue({code:"custom",message:"正文页数超过已保存的页面数量"});
  const ids = new Set(draft.characters.map(c => c.id));
  if (ids.size !== draft.characters.length || draft.pages.some(p => p.characters.some(id => !ids.has(id)))) ctx.addIssue({code:"custom",message:"人物引用无效"});
  if (new Set(draft.spreads).size !== draft.spreads.length || draft.spreads.some(n=>n%2!==0)) ctx.addIssue({code:"custom",message:"跨页配置无效"});
});
