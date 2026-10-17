import HomeExperience from "@/components/home/HomeExperience";
import HomeIntroduction from "@/components/home/HomeIntroduction";
import HomeStructuredData from "@/components/home/HomeStructuredData";
import { HOME_TITLES, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  path: "/", title: HOME_TITLES.zh, bilingual: true,
  description: "用 AI 把孩子的成长小事变成专属儿童绘本，生成中英双语故事与插画，支持亲子共读、睡前故事朗读和绘本保存。也可免费阅读成语、唐诗、科普等系列绘本。",
});

export default function HomePage() {
  return <>
    <HomeStructuredData />
    <HomeExperience key="zh" initialLocale="zh"><HomeIntroduction /></HomeExperience>
  </>;
}
