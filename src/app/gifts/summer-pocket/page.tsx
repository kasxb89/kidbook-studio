import { pageMetadata } from "@/lib/seo";
import GraduationGift from "@/components/gifts/GraduationGift";
export const metadata = pageMetadata({
  path: "/gifts/summer-pocket",
  title: "把夏天装进口袋 · 幼儿园毕业礼物绘本 | StoryBloom",
  description: "送给即将毕业的小小的你。一本把勇敢、友谊与告别珍藏起来的图文一体电子绘本。",
  image: "/gift-books/summer-pocket/cover.webp",
});
export default function Page() { return <div data-gift-module><GraduationGift /></div>; }
