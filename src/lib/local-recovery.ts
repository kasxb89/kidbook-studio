import type { CustomWorkbenchDraft } from "./custom-workbench";
export type RecoveryDraft={revision:number;draft:CustomWorkbenchDraft;sent?:CustomWorkbenchDraft};
function signature(value:unknown):string {
  return JSON.stringify(value,(_,item)=>item&&typeof item==="object"&&!Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);
}
// A refresh can land after the server committed a write but before its response
// reached the old page. Recover later edits only if that exact write is on disk.
export function resolveLocalRecovery(recovery:RecoveryDraft,stored:{revision:number;draft:CustomWorkbenchDraft}):"restore"|"saved"|"conflict" {
  if(signature(recovery.draft)===signature(stored.draft))return "saved";
  if(recovery.revision===stored.revision)return "restore";
  if(recovery.sent&&stored.revision===recovery.revision+1&&signature(recovery.sent)===signature(stored.draft))return "restore";
  return "conflict";
}
