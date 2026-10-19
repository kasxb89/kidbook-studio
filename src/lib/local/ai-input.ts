import "server-only";
import { createWorkbenchDraft, type CustomWorkbenchDraft } from "../custom-workbench";
import { database, LocalError, validateDraftAssets } from "./store";

function inputTable() {
  const db=database();
  db.exec("CREATE TABLE IF NOT EXISTS workspace_inputs(id TEXT PRIMARY KEY,draft TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1)");
  db.prepare("INSERT OR IGNORE INTO workspace_inputs(id,draft) VALUES('automatic-book',?)").run(JSON.stringify(createWorkbenchDraft(false)));
  return db;
}
export function getAiInput() {
  const row=inputTable().prepare("SELECT draft,revision FROM workspace_inputs WHERE id='automatic-book'").get()!;
  return {draft:JSON.parse(row.draft as string) as CustomWorkbenchDraft,revision:row.revision as number};
}
export function saveAiInput(draft:CustomWorkbenchDraft,revision:number) {
  validateDraftAssets(draft);
  const result=inputTable().prepare("UPDATE workspace_inputs SET draft=?,revision=revision+1 WHERE id='automatic-book' AND revision=?").run(JSON.stringify(draft),revision);
  if(!result.changes)throw new LocalError("AI 参数已在另一窗口更新，请刷新后再编辑。",409);
  return getAiInput();
}
