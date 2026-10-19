import "server-only";
import { unzipSync } from "fflate";
import type { CustomWorkbenchDraft } from "../custom-workbench";
import type { PrintReport } from "./print";
import { bookFileName } from "./book-files";
import { saveProjectBookOutputs } from "./store";
export function savePrintOutputs(projectId:string,draft:CustomWorkbenchDraft,output:{pdf:Uint8Array;zip:Uint8Array;report:PrintReport},bundle:boolean) {
  const settings=output.report.settings,variant=`A4_${settings.mode==="press"?"印厂版":"办公打印"}_${settings.binding==="saddle"?"骑马订":"左侧装订"}`,name=bookFileName(draft.title,"绘本");
  const files:Record<string,Uint8Array>={[`成品PDF/${name}_${variant}.pdf`]:output.pdf};
  if(bundle) {
    files[`交付包/${name}_${variant}_交付包.zip`]=output.zip;
    const parts=unzipSync(output.zip);
    for(const [file,bytes]of Object.entries(parts))if(file!=="01_整本_A4.pdf"&&/^[^/]+\.(pdf|txt|json)$/i.test(file))files[`成品PDF/${variant}/${file}`]=bytes;
  }
  return saveProjectBookOutputs(projectId,draft,files);
}
