import { it,expect } from "vitest";
import { bookTypographySchema } from "@/lib/custom-book/text-style";
import { localDraftSchema } from "@/lib/local/schema";
import { createWorkbenchDraft } from "@/lib/custom-workbench";
import { BOOK_FONT_IDS } from "@/lib/custom-book/font-catalog";
import { normalizeTextPlacement } from "@/lib/custom-book/text-position";
import { rotatedTextBounds } from "@/lib/custom-book/text-canvas";
import { layoutStoryText } from "@/lib/custom-book/lettering";
it("retains fine text controls through persistence without silently stripping new fields",()=>{
  const draft=createWorkbenchDraft(false);
  for(const fontFamily of BOOK_FONT_IDS) {
    draft.typography={...draft.typography,fontFamily,size:127.5,letterSpacing:-.04,lineHeight:.95,opacity:.37,italic:true,underline:true,rotation:-17.3,strokeWidth:1.7,strokeColor:"#99aacc",shadow:true,shadowColor:"#112233",shadowX:-7.2,shadowY:3.4,shadowOpacity:.6,backingPaddingX:12.4,backingPaddingY:20.1,backingRadius:23,backingBorderWidth:2.3,backingBorderColor:"#778899",textBox:{x:2.15,y:3.41,width:9.5}};
    expect(localDraftSchema.parse(draft).typography).toEqual(draft.typography);
  }
  expect(BOOK_FONT_IDS).toHaveLength(24);
  expect(bookTypographySchema.safeParse({...draft.typography,fontFamily:"/etc/passwd"}).success).toBe(false);
});
it("supports fractional positioning and rotation about the centre of the text block",()=>{
  expect(normalizeTextPlacement({x:2.15,y:3.41,width:9.5})).toEqual({x:2.15,y:3.41,width:9.5});
  const bounds=rotatedTextBounds({x:100,y:100,width:200,height:100},90);
  expect(bounds.left).toBeCloseTo(150);expect(bounds.top).toBeCloseTo(50);expect(bounds.right).toBeCloseTo(250);expect(bounds.bottom).toBeCloseTo(250);
});
it("keeps the final glyph and underline inside the box when rows use tight spacing",()=>{
  const design={...createWorkbenchDraft(false).typography,size:100,lineHeight:.8};
  const layout=layoutStoryText("小花\n慢慢",design,undefined,[],500,(_text,size)=>size);
  expect(layout.height).toBeGreaterThanOrEqual(Math.max(...layout.glyphs.map(g=>g.baseline+g.size*.12)));
});
