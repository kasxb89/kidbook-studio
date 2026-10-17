import InstallExperience from "@/components/pwa/InstallExperience";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  path: "/install", title: "添加 StoryBloom 到主屏幕 | 安装指南",
  description: "了解如何在 iPhone、iPad 和 Android 上把 StoryBloom 绘本馆添加到主屏幕，以及缓存和联网功能的使用范围。",
  noindex: true,
});

export default function InstallPage() { return <InstallExperience />; }
