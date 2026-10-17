import BookshelfShareManager from "@/components/account/BookshelfShareManager";
import UnifiedStoryLibrary from "@/components/account/UnifiedStoryLibrary";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({
  path: "/me/books", title: "我的绘本 | StoryBloom",
  description: "查看本机保存的专属绘本，继续阅读和管理已分享的链接。", noindex: true,
});
export default function MyBooksPage() {
  return <><UnifiedStoryLibrary /><details className="growth-sync-details"><summary>管理已分享的链接</summary><BookshelfShareManager /></details></>;
}
