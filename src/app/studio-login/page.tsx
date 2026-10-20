import { headers } from "next/headers";
import { redirect } from "next/navigation";
import WorkbenchLogin from "@/components/auth/WorkbenchLogin";
import { workbenchLoginEnabled } from "@/lib/workbench-access";
import { workbenchSession } from "@/lib/local/workbench-auth";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const metadata={title:"登录绘本工作台 | KidBook Studio",robots:{index:false,follow:false}};
export default async function StudioLoginPage() {
  const incoming=await headers();
  if(!workbenchLoginEnabled()||workbenchSession(new Request("http://localhost/studio-login",{headers:new Headers(incoming)})))redirect("/custom");
  return <WorkbenchLogin/>;
}
