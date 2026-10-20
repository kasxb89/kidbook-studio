"use client";
export function downloadUrl(url:string,name?:string) {
  const link=document.createElement("a");link.href=url;if(name)link.download=name;link.style.display="none";
  document.body.append(link);link.click();link.remove();
}
export function downloadBlob(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob);downloadUrl(url,name);
  // Safari may not start consuming the object URL until after the click task.
  setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
export function attachmentFileName(header:string|null,fallback:string) {
  const encoded=/filename\*=UTF-8''([^;]+)/i.exec(header||"");
  if(encoded)try{return decodeURIComponent(encoded[1]).replace(/[\\/\u0000-\u001f]/g,"_");}catch{}
  return fallback;
}
