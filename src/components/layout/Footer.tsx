"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function Footer() {
  const pathname=usePathname();if(pathname==="/custom"||pathname==="/studio-login")return null;
  return <footer className="site-footer"><div className="footer-inner">
    <span>StoryBloom · 本地内部工作台</span><Link href="/custom">绘本创作</Link>
    <span>项目与图片保存在本机 · 请定期备份 .local-data</span>
  </div></footer>;
}
