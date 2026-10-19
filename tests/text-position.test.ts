import { describe,it,expect } from "vitest";
import { createWorkbenchDraft } from "@/lib/custom-workbench";
import { textArea,textRegion,placementFromRegion,normalizeTextPlacement } from "@/lib/custom-book/text-position";
import { layoutTextBox } from "@/lib/custom-book/layout";
import { customDraftSchema } from "@/lib/custom-book/schema";
import { imagePrompt } from "@/lib/custom-book/provider";

describe("movable book text",()=>{
  it("retains old layouts until text is moved, then applies the same position to each half of a spread",()=>{
    const d=createWorkbenchDraft();
    for(const side of [0,1]){
      expect(textArea("minimal",800,800,side)).toEqual(layoutTextBox("minimal",800,800,side));
      const design={...d.typography,textBox:{x:10,y:20,width:60}};
      const area=textArea("minimal",800,800,side,design.textBox);
      const region=textRegion(area,design,100,800,800,side);
      expect(region).toMatchObject({x:side*800+80,y:160,width:480,height:100});
      expect(placementFromRegion(region,800,800)).toEqual(design.textBox);
    }
  });
  it("keeps long text and out-of-range drags within the physical page",()=>{
    const d=createWorkbenchDraft(),textBox=normalizeTextPlacement({x:98,y:98,width:70});
    const design={...d.typography,textBox};
    const region=textRegion(textArea("panorama",720,900,1,textBox),design,200,720,900,1);
    expect(region.x).toBeGreaterThan(720);expect(region.x+region.width).toBeLessThan(1440);
    expect(region.y+region.height).toBeLessThanOrEqual(900*.96);
  });
  it("sends the chosen negative space and only the visible character bible to the image model",()=>{
    const d=createWorkbenchDraft(false);d.characters[0].name="小禾";d.title="水果乐园";
    d.typography.textBox={x:10,y:15,width:65};d.pages[0].characters=[d.characters[0].id];
    d.characters.push({...d.characters[0],id:"other",name:"未出场的人",outfit:"紫色衣服"});
    const prompt=imagePrompt(customDraftSchema.parse(d),{kind:"page",index:0,spread:false});
    expect(prompt).toContain("left 10%, top 15%, width 65%");
    expect(prompt).toContain('"name":"小禾"');expect(prompt).not.toContain("未出场的人");
  });
});
