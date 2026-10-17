import { pageMetadata } from "@/lib/seo";
import CustomWorkbench from '@/components/custom/CustomWorkbench';

export const metadata = pageMetadata({
  path: "/custom",
  title: "绘本定制工作台 | StoryBloom",
  description: "配置人物、故事与画风，逐页编辑、裁剪图片，实时预览属于你的绘本。",
  image: "/gift-books/summer-pocket/cover.webp",
});

export default function CustomPage() {
  return <CustomWorkbench />;
}
