import "server-only";
import { execFile } from "node:child_process";
import { getProjectBookFolder,LocalError } from "./store";
import { workbenchServerMode } from "../workbench-access";

export function localStorageLocation(projectId:string) {
  const folder=getProjectBookFolder(projectId),server=workbenchServerMode();
  return {...folder,revealAvailable:!server,storageMode:server?"server":"local",fileManager:server?"服务器":process.platform==="darwin"?"Finder":"文件管理器"};
}

export async function openLocalStorageLocation(projectId:string) {
  if(workbenchServerMode())throw new LocalError("服务器文件请使用下载按钮保存到你的电脑。",403);
  const location=localStorageLocation(projectId);
  const command=process.platform==="darwin"?"/usr/bin/open":process.platform==="win32"?"explorer.exe":"xdg-open";
  // Only this project's assigned directory can be opened. Never accept a command
  // or path from a browser request, and never invoke a shell.
  await new Promise<void>((resolve,reject)=>{
    execFile(command,[location.directory],{timeout:10000},error=>{
      if(error)reject(new LocalError("无法打开文件夹，请复制下方路径，在文件管理器中打开。",503));
      else resolve();
    });
  });
  return {...location,opened:true};
}
