import { beforeAll,afterAll,it,expect,vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument,PDFName,PDFDict,PDFArray,PDFRawStream,decodePDFRawStream } from "pdf-lib";
import { unzipSync,strFromU8 } from "fflate";
import { createWorkbenchDraft,setWorkbenchPageCount } from "@/lib/custom-workbench";
import { database,saveAsset,readAsset } from "@/lib/local/store";
import { preflightPrint,exportPrintBook } from "@/lib/local/print";
import { defaultPrintSettings,printGeometry,printLeaves,bookletPairs,MM_TO_PT as MM } from "@/lib/custom-book/print-settings";
vi.setConfig({testTimeout:60000});
let root:string;
beforeAll(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),"storybook-print-"));vi.stubEnv("STORYBLOOM_LOCAL_DATA_DIR",root);});
afterAll(()=>{database().close();fs.rmSync(root,{recursive:true,force:true});vi.unstubAllEnvs();});
async function fixture(pixels=3000) {
  const draft=setWorkbenchPageCount(createWorkbenchDraft(false),1);draft.title="小禾的小沙堡";draft.characters[0].name="小禾";
  const stored=saveAsset(await sharp({create:{width:pixels,height:pixels,channels:3,background:"#c8dfec"}}).jpeg().toBuffer(),"print-fixture");
  const asset={...stored,name:"插图",purpose:"page" as const,origin:"uploaded" as const,crop:{x:50,y:50,zoom:1},ratio:"page" as const,appearance:"original" as const,anthropomorphic:false,retouch:[],instructions:""};
  draft.cover={...asset,purpose:"cover"};draft.pages[0]={text:"小禾收拾好玩具，带着小黄鸡，高高兴兴地回家了。",scene:"Test",characters:["hero"],asset};
  draft.print=defaultPrintSettings();return draft;
}
it("uses A4 trim, 3mm bleed, mirrored inner margins and separate office media",()=>{
  const settings=defaultPrintSettings(),odd=printGeometry(settings,3),even=printGeometry(settings,4);
  expect(odd.mediaWidth/MM).toBeCloseTo(216);expect(odd.mediaHeight/MM).toBeCloseTo(303);
  expect(odd.trim.width/MM).toBeCloseTo(210);expect(odd.trim.height/MM).toBeCloseTo(297);
  expect(odd.safe.x/MM).toBeCloseTo(21);expect(even.safe.x/MM).toBeCloseTo(15);
  expect(printGeometry({...settings,mode:"office",cropMarks:true},1).mediaWidth/MM).toBeCloseTo(210);
  expect(printGeometry({...settings,cropMarks:true},1).mediaWidth/MM).toBeCloseTo(228);
});
it("retains covers and explicit blanks when padding a saddle-stitched book",()=>{
  for(const count of [1,8,13,31,200]){
    const leaves=printLeaves(count,"saddle");expect(leaves.length%4).toBe(0);expect(leaves.at(-1)?.kind).toBe("back");
    expect(leaves.filter(p=>p.kind==="story").map(p=>p.sourcePage)).toEqual(Array.from({length:count},(_,i)=>i+1));
    expect(leaves.find(p=>p.sourcePage===1)?.physical).toBe(3);
    const imposed=bookletPairs(leaves.length).flat().sort((a,b)=>a-b);expect(imposed).toEqual(Array.from({length:leaves.length},(_,i)=>i));
  }
  expect(bookletPairs(12)[0]).toEqual([11,0]);expect(bookletPairs(12)[1]).toEqual([1,10]);
});
it("blocks low-resolution output instead of calling a resized bitmap 300ppi",async()=>{
  const draft=await fixture(640),report=await preflightPrint(draft);
  expect(report.ready).toBe(false);expect(report.checks[0].ppi).toBeLessThan(100);
  await expect(exportPrintBook(draft)).rejects.toThrow("300 ppi");
});
it("embeds the selected handwritten font in printed pages",async()=>{
  const draft=await fixture();
  draft.typography={...draft.typography,fontFamily:"kai",color:"#624536",backing:true,backingColor:"#e5efdf",backingStyle:"solid",backingOpacity:.7};
  const output=await exportPrintBook(draft,false);expect(output.report.ready).toBe(true);
  const pdf=await PDFDocument.load(output.pdf);
  const fonts=pdf.getPage(2).node.Resources()!.lookup(PDFName.of("Font"),PDFDict);
  const names=fonts.entries().map(([,ref])=>pdf.context.lookup(ref,PDFDict).get(PDFName.of("BaseFont"))?.toString()).join(" ");
  expect(names).toContain("LXGWWenKai");
});
it("moves printed text to its saved free position inside binding-safe margins",async()=>{
  const draft=await fixture();
  draft.studio={pages:{"1":{typography:{textBox:{x:15,y:20,width:65}}}}};
  const output=await exportPrintBook(draft,false),pdf=await PDFDocument.load(output.pdf);
  const page=pdf.getPage(2),contents=page.node.Contents() as PDFArray;
  const stream=Array.from({length:contents.size()},(_,i)=>Buffer.from(decodePDFRawStream(pdf.context.lookup(contents.get(i),PDFRawStream)).decode()).toString()).join("\n");
  const match=/1 0 0 1 ([\d.]+) ([\d.]+) Tm/.exec(stream);expect(match).not.toBeNull();
  const safe=printGeometry(defaultPrintSettings(),3).safe;
  expect(Number(match![1])).toBeCloseTo(safe.x+safe.width*.15,3);
  expect(Number(match![2])).toBeGreaterThan(safe.y+safe.height*.6);
  expect(Number(match![2])).toBeLessThan(safe.y+safe.height*.8);
});
it("keeps coloured picture-book lettering inside its illustration as vector text",async()=>{
  const draft=await fixture();
  draft.pages[0].text="她扶起一朵低着头的小花。";
  draft.pages[0].lettering={lines:["她扶起一朵","低着头","的小花。"],emphasis:[{text:"扶",color:"#987028"},{text:"低着头",color:"#b75b36"},{text:"小花",color:"#2e667b"}],placement:{x:9,y:10,width:59}};
  const output=await exportPrintBook(draft,false),pdf=await PDFDocument.load(output.pdf);
  const page=pdf.getPage(2),contents=page.node.Contents() as PDFArray;
  const stream=Array.from({length:contents.size()},(_,i)=>Buffer.from(decodePDFRawStream(pdf.context.lookup(contents.get(i),PDFRawStream)).decode()).toString()).join("\n");
  const colours=[...stream.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) rg/g)].map(m=>m.slice(1).map(v=>Math.round(Number(v)*255)));
  expect(colours).toContainEqual([183,91,54]);expect(colours).toContainEqual([46,102,123]);
  const sizes=[...stream.matchAll(/\/[^\s]+ ([\d.]+) Tf/g)].map(m=>Number(m[1]));
  expect(new Set(sizes.filter(size=>size>10)).size).toBeGreaterThan(1);
  const glyphCount=Array.from(draft.pages[0].text).length;
  const locations=[...stream.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)].slice(0,glyphCount).map(m=>({x:Number(m[1]),y:Number(m[2])}));
  expect(locations).toHaveLength(glyphCount);
  const safe=printGeometry(defaultPrintSettings(),3).safe;
  expect(locations.every(p=>p.x>safe.x&&p.x<safe.x+safe.width&&p.y>safe.y+safe.height*.5&&p.y<safe.y+safe.height)).toBe(true);
});
it("exports embedded Chinese text, correct PDF boxes, and a production bundle",async()=>{
  const draft=await fixture();const output=await exportPrintBook(draft);expect(output.report.ready).toBe(true);
  const pdf=await PDFDocument.load(output.pdf);expect(pdf.getPageCount()).toBe(6);
  const p=pdf.getPage(0);expect(p.getTrimBox().width/MM).toBeCloseTo(210);expect(p.getBleedBox().width/MM).toBeCloseTo(216);
  const fonts=p.node.Resources()?.lookup(PDFName.of("Font"),PDFDict);expect(fonts?.keys().length).toBeGreaterThan(0);
  const dict=fonts?.lookup(fonts.keys()[0],PDFDict);expect(dict?.has(PDFName.of("ToUnicode"))).toBe(true);
  const files=unzipSync(output.zip);expect((await PDFDocument.load(files["02_内页_A4.pdf"])).getPageCount()).toBe(2);
  expect((await PDFDocument.load(files["03_封面四面_A4.pdf"])).getPageCount()).toBe(4);
  expect(strFromU8(files["制作说明.txt"])).toContain("300ppi");
  expect(files["05_高清插图/001_正文.jpg"]).toBeDefined();
  expect(Buffer.from(files["05_高清插图/001_正文.jpg"])).toEqual(readAsset(draft.pages[0].asset!.storagePath!));
  expect(JSON.parse(strFromU8(files["06_文稿与排版.json"])).pages[0].text).toBe(draft.pages[0].text);
});
it("splits integrated spreads into physical leaves and produces A3 booklet sheets",async()=>{
  const draft=setWorkbenchPageCount(await fixture(),4);draft.print={...defaultPrintSettings(),mode:"office",binding:"saddle",imageWidthMm:90};
  draft.pages.slice(1).forEach(p=>{p.text="小黄鸡回家。";p.scene="Test";p.asset=draft.pages[0].asset;});
  const stored=saveAsset(await sharp({create:{width:3000,height:1500,channels:3,background:"#e8c998"}}).jpeg().toBuffer(),"spread");
  draft.spreads=[2];draft.pages[1].asset={...draft.pages[0].asset!,...stored,embeddedText:[draft.pages[1].text,draft.pages[2].text]};
  const report=await preflightPrint(draft);expect(report.checks.find(c=>c.page===2)?.pixels).toBe("1500 × 1500");expect(report.checks.find(c=>c.page===3)?.pixels).toBe("1500 × 1500");
  const output=await exportPrintBook(draft),files=unzipSync(output.zip);
  const imposed=await PDFDocument.load(files["04_骑马订_A3双面拼版.pdf"]);expect(imposed.getPageCount()).toBe(4);expect(imposed.getPage(0).getWidth()/MM).toBeCloseTo(420);expect(imposed.getPage(0).getHeight()/MM).toBeCloseTo(297);
  expect((await PDFDocument.load(output.pdf)).getPageCount()).toBe(8);
});
