import { describe, expect, it } from "vitest";
import { createWorkbenchDraft, makeAsset } from "@/lib/custom-workbench";
import { localDraftSchema } from "@/lib/local/schema";
import { customDraftSchema, type ImageUnit } from "@/lib/custom-book/schema";
import { applyBookTypography, effectiveTextBacking } from "@/lib/custom-book/typography";
import { imagePrompt, needsProcessing } from "@/lib/custom-book/provider";
import { visualStyleFor } from "@/lib/custom-book/visual-style";

describe("book presentation settings", () => {
  it("persists fonts, backdrop and visual style, including per-page overrides", () => {
    const d=createWorkbenchDraft(false);
    expect(d.typography.backing).toBe(false);
    d.visualStyle="realistic";
    d.typography={...d.typography,fontFamily:"kai",backing:false,backingColor:"#e5efdf",backingOpacity:.7,backingStyle:"solid",lineHeight:1.7,textBox:{x:10,y:25,width:70}};
    d.studio={selectedPage:2,activePanel:"canvas",pages:{"2":{typography:{fontFamily:"sans",backingOpacity:.4,textBox:null}}}};
    expect(localDraftSchema.parse(JSON.parse(JSON.stringify(d)))).toEqual(d);
    const invalid=structuredClone(d);invalid.typography.backingOpacity=1.5;
    expect(localDraftSchema.safeParse(invalid).success).toBe(false);
  });
  it("applies a chosen design to all saved pages without erasing art or text", () => {
    const d=createWorkbenchDraft();
    d.pages[0].textTreatment="soft";d.pages[11].textTreatment="natural";
    d.studio={selectedPage:1,activePanel:"canvas",pages:{"0":{typography:{size:40}},"1":{review:"approved",typography:{backing:true}},"12":{typography:{fontFamily:"sans",size:50}}}};
    expect(effectiveTextBacking(d,1)).toBe(true);
    const design={...d.typography,fontFamily:"kai" as const,backing:false,backingColor:"#f9e4de",backingOpacity:.6};
    const changed=applyBookTypography(d,design);
    expect(changed.typography).toEqual(design);
    expect(changed.studio?.pages?.[0].typography).toBeUndefined();
    expect(changed.studio?.pages?.[12].typography).toBeUndefined();
    expect(changed.studio?.pages?.[1].review).toBe("draft");
    expect(effectiveTextBacking(changed,1)).toBe(false);
    expect(changed.pages.map(p=>p.text)).toEqual(d.pages.map(p=>p.text));
    expect(changed.pages.map(p=>p.asset)).toEqual(d.pages.map(p=>p.asset));
    expect(changed.cover).toEqual(d.cover);expect(changed.studio?.selectedPage).toBe(1);
  });
});

describe("real-person generation style", () => {
  function draft() {
    const d=createWorkbenchDraft();delete d.cover;d.pages.forEach(p=>delete p.asset);
    d.characters[0].asset={...makeAsset('/api/local/assets/photo','photo','character'),storagePath:'photo',origin:'uploaded',appearance:'anime'};
    return d;
  }
  it("respects the old photo choice and gives the whole-book selection priority", () => {
    const d=draft();delete d.visualStyle;
    expect(visualStyleFor(d)).toBe("anime");d.characters[0].asset!.appearance="original";
    expect(visualStyleFor(d)).toBe("realistic");d.visualStyle="anime";
    expect(visualStyleFor(d)).toBe("anime");expect(createWorkbenchDraft(false).visualStyle).toBe("realistic");
    expect(needsProcessing(d.characters[0].asset!,"anime")).toBe(true);
    expect(needsProcessing({...d.characters[0].asset!,appearance:"anime"},"realistic")).toBe(false);
  });
  it("keeps photo instructions consistent for characters, covers and both page modes", () => {
    const d=draft();d.visualStyle="realistic";d.style="cartoon";
    const units:ImageUnit[]=[{kind:"character",index:0},{kind:"cover"},{kind:"page",index:0,spread:false}];
    for(const renderingMode of ["editable","integrated"] as const){
      d.renderingMode=renderingMode;const parsed=customDraftSchema.parse(d);
      for(const unit of units){
        const prompt=imagePrompt(parsed,unit);
        expect(prompt).toContain("Visual style is PHOTOREALISTIC");
        expect(prompt).not.toContain("polished warm cartoon illustration");
        expect(prompt).not.toContain("Gouache watercolor");expect(prompt).not.toContain("watercolor technique");
        expect(prompt).not.toContain("Transform into an anime/cartoon character");
      }
    }
    d.visualStyle="anime";
    expect(imagePrompt(customDraftSchema.parse(d),{kind:"cover"})).toContain("Visual style is ANIME PICTURE BOOK");
    expect(imagePrompt(customDraftSchema.parse(d),{kind:"character",index:0})).toContain("Transform into an anime/cartoon character");
  });
});
