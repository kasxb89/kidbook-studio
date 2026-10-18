import { describe,it,expect } from "vitest";
import { createWorkbenchDraft } from "../src/lib/custom-workbench";
import { resolveLocalRecovery } from "../src/lib/local-recovery";
describe("refresh recovery and uncertain save responses",()=>{
 it("restores edits when refresh interrupts the debounce",()=>{
  const stored=createWorkbenchDraft(false),edit={...stored,title:"新标题"};
  expect(resolveLocalRecovery({revision:1,draft:edit},{revision:1,draft:stored})).toBe("restore");
 });
 it("restores edits typed during an in-flight write after that write committed",()=>{
  const original=createWorkbenchDraft(false);const sent={...original,title:"已发送标题"};
  const later={...sent,story:"网络等待期间补写的真实经过"};
  expect(resolveLocalRecovery({revision:1,sent,draft:later},{revision:2,draft:sent})).toBe("restore");
 });
 it("does not overwrite a different window's newer version",()=>{
  const original=createWorkbenchDraft(false);
  expect(resolveLocalRecovery({revision:1,sent:original,draft:{...original,title:"窗口一"}},{revision:2,draft:{...original,title:"窗口二"}})).toBe("conflict");
 });
 it("recognizes an already saved draft independent of key ordering",()=>{
  const draft=createWorkbenchDraft(false);const reordered=Object.fromEntries(Object.entries(draft).reverse()) as typeof draft;
  expect(resolveLocalRecovery({revision:1,draft:reordered},{revision:2,draft})).toBe("saved");
 });
});
