import AccountOverview from "@/components/account/AccountOverview";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  path: "/me", title: "我的家庭成长记录 | StoryBloom",
  description: "查看和管理当前设备与本人私有云端中的家庭成长记录。", noindex: true,
});

export default function MePage() {
  return <AccountOverview />;
}
