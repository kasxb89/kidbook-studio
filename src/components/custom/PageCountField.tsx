"use client";
import { useEffect,useState } from "react";
import { MIN_BOOK_PAGES,MAX_BOOK_PAGES } from "@/lib/book-config";
export default function PageCountField({value,onChange,label="正文页数"}:{value:number;onChange:(count:number)=>void;label?:string}) {
  const [text,setText]=useState(String(value));
  useEffect(()=>setText(String(value)),[value]);
  return <input aria-label={label} type="number" inputMode="numeric" min={MIN_BOOK_PAGES} max={MAX_BOOK_PAGES} step={1} value={text}
    onChange={e=>{setText(e.target.value);const n=Number(e.target.value);if(e.target.value&&Number.isInteger(n)&&n>=MIN_BOOK_PAGES&&n<=MAX_BOOK_PAGES)onChange(n);}}
    onBlur={()=>{const n=Math.min(MAX_BOOK_PAGES,Math.max(MIN_BOOK_PAGES,Math.round(Number(text)||value)));setText(String(n));if(n!==value)onChange(n);}} />;
}
