import { pageMetadata } from "@/lib/seo";
import CustomWorkbench from '@/components/custom/CustomWorkbench';
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { workbenchLoginEnabled } from "@/lib/workbench-access";
import { workbenchSession } from "@/lib/local/workbench-auth";
export const dynamic="force-dynamic";
export const runtime="nodejs";

export const metadata = pageMetadata({
  path: "/custom",
  title: "绘本定制工作台 | StoryBloom",
  description: "配置人物、故事与画风，逐页编辑、裁剪图片，实时预览属于你的绘本。",
  image: "/gift-books/summer-pocket/cover.webp",
});

export default async function CustomPage() {
  const incoming=await headers();
  if(workbenchLoginEnabled()&&!workbenchSession(new Request("http://localhost/custom",{headers:new Headers(incoming)})))redirect("/studio-login");
  return <CustomWorkbench />;
}
