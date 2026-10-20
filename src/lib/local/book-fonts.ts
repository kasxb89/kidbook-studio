import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont } from "pdf-lib";
import { BOOK_FONTS, type BookFont } from "../custom-book/font-catalog";

const bytes=new Map<BookFont,Promise<Uint8Array>>(),documents=new WeakMap<PDFDocument,Map<BookFont,Promise<PDFFont>>>();
const fallbacks=new WeakMap<PDFFont,PDFFont>(),characters=new WeakMap<PDFFont,Set<number>>();
function charset(font:PDFFont) {let set=characters.get(font);if(!set){set=new Set(font.getCharacterSet());characters.set(font,set);}return set;}
export async function printFont(pdf:PDFDocument,family:BookFont="sans"):Promise<PDFFont> {
  pdf.registerFontkit(fontkit);
  let cache=documents.get(pdf);if(!cache){cache=new Map();documents.set(pdf,cache);}
  if(!cache.has(family)) {
    if(!bytes.has(family))bytes.set(family,fs.readFile(path.join(process.cwd(),"public/fonts/print",BOOK_FONTS[family].file)).catch(e=>{bytes.delete(family);throw e;}));
    cache.set(family,bytes.get(family)!.then(data=>pdf.embedFont(data,{subset:false})));
  }
  const font=await cache.get(family)!;
  if(family!=="sans")fallbacks.set(font,await printFont(pdf,"sans"));
  return font;
}
export function fontForCharacter(font:PDFFont,character:string) {return charset(font).has(character.codePointAt(0)!)?font:fallbacks.get(font)||font;}
export function supportsPrintCharacter(font:PDFFont,character:string) {return charset(fontForCharacter(font,character)).has(character.codePointAt(0)!);}
export function measurePrintText(font:PDFFont,text:string,size:number) {return Array.from(text).reduce((width,c)=>width+fontForCharacter(font,c).widthOfTextAtSize(c,size),0);}
