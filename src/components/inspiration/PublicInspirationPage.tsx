import Link from "next/link";
import { notFound } from "next/navigation";
import TodayInspirationCard from "./TodayInspirationCard";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbs, localizedPath, pageMetadata, type SiteLocale } from "@/lib/seo";
import { getShanghaiDateKey } from "@/lib/email/daily-inspiration";
import { getFallbackPublicDailyInspiration, getTodayPublicDailyInspiration } from "@/lib/inspiration/public-daily-inspiration";
import { listInspirationArchive } from "@/lib/inspiration/archive";
import type { PublicDailyInspiration } from "@/lib/inspiration/types";
import { toAbsoluteAppUrl } from "@/lib/site-url";
import styles from "@/app/inspiration/InspirationPage.module.css";

export function inspirationMetadata(locale: SiteLocale = "zh", inspiration?: PublicDailyInspiration, archivePage = 1) {
  const en = locale === "en";
  return pageMetadata({
    path: inspiration ? `/inspiration/${inspiration.issueDate}` : archivePage > 1 ? `/inspiration?page=${archivePage}` : "/inspiration", locale, bilingual: true,
    title: inspiration ? `${en ? inspiration.titleEn : inspiration.titleZh} | ${inspiration.issueDate} · StoryBloom` : en ? `Daily Story Ideas for Kids & Families${archivePage > 1 ? ` - Page ${archivePage}` : ""} | StoryBloom` : `每日绘本灵感与往期故事主题${archivePage > 1 ? ` - 第 ${archivePage} 页` : ""} | StoryBloom`,
    description: inspiration ? (en ? inspiration.openingEn : inspiration.openingZh) : en ? "Find a daily story idea, conversation questions and Chinese and English inspiration for making picture books together. Browse past ideas by date." : "每天一个公开的中英双语亲子绘本灵感，无需登录即可阅读和开始创作；按日期浏览已保存的往期主题、故事开头与亲子提问。",
    type: inspiration ? "article" : "website",
  });
}

export default async function PublicInspirationPage({ locale = "zh", inspiration: archived, archivePage = 1 }: { locale?: SiteLocale; inspiration?: PublicDailyInspiration; archivePage?: number }) {
  const en = locale === "en";
  const local = (path: string) => localizedPath(path, locale);
  const inspiration = archived ?? await getTodayPublicDailyInspiration().catch(() => getFallbackPublicDailyInspiration(getShanghaiDateKey()));
  const archive = archived ? null : await listInspirationArchive(archivePage);
  if (archive && archivePage > 1 && archive.entries.length === 0) notFound();
  const path = archived ? `/inspiration/${archived.issueDate}` : "/inspiration";
  const title = en ? inspiration.titleEn : inspiration.titleZh;
  return <main className={styles.page} lang={en ? "en" : "zh-CN"}>
    <JsonLd data={{ "@context": "https://schema.org", "@graph": [
      breadcrumbs([{ name: en ? "Home" : "首页", path: local("/") }, { name: en ? "Daily story ideas" : "每日灵感", path: local("/inspiration") }, ...(archived ? [{ name: title, path: local(path) }] : [])]),
      ...(archived ? [{ "@type": "Article", headline: title, description: en ? inspiration.openingEn : inspiration.openingZh, url: toAbsoluteAppUrl(local(path)), datePublished: archived.issueDate, inLanguage: en ? "en" : "zh-CN", author: { "@type": "Organization", name: "StoryBloom" }, publisher: { "@type": "Organization", name: "StoryBloom" } }] : []),
    ] }} />
    <nav className={styles.topbar} aria-label={en ? "Page navigation" : "页面导航"}>
      <Link href={local("/")} className={styles.brand}>StoryBloom</Link>
      <div className={styles.links}><Link href={local("/library")}>{en ? "Library" : "绘本馆"}</Link><Link href={localizedPath(path, en ? "zh" : "en")} hrefLang={en ? "zh-CN" : "en"}>{en ? "中文" : "English"}</Link></div>
    </nav>
    <header className={styles.hero}>
      <p className={styles.kicker}>{archived ? `STORY IDEA · ${archived.issueDate}` : "DAILY STORY IDEA"}</p>
      <h1>{archived ? title : en ? "A new story to share with your child" : "今天，和孩子讲一个新的故事"}</h1>
      <p>{en ? "A concrete starting point for reading, imagining and talking together. You decide who the story is about and where it goes." : "每天一个温柔、具体的亲子绘本灵感。公开阅读，无需登录；你决定主角、细节和故事最后会开出什么花。"}</p>
    </header>
    <TodayInspirationCard inspiration={inspiration} locale={locale} />
    {!archived && !inspiration.id.startsWith("fallback-") ? <p className={styles.note}><Link href={local(`/inspiration/${inspiration.issueDate}`)}>{en ? "Permanent link to this idea →" : "查看这期灵感的固定链接 →"}</Link></p> : null}
    {archive ? <section className={styles.archive} aria-labelledby="inspiration-archive-title">
      <h2 id="inspiration-archive-title">{en ? "Past story ideas" : "往期灵感"}</h2>
      {archive.entries.length ? <ol>{archive.entries.map((item) => <li key={item.issue_date}><Link href={local(`/inspiration/${item.issue_date}`)}><time dateTime={item.issue_date}>{item.issue_date}</time><span>{en ? item.title_en : item.title_zh}</span></Link></li>)}</ol> : <p>{en ? "Saved daily ideas will appear here." : "已保存的每日灵感会按日期出现在这里。"}</p>}
      <nav className={styles.pagination} aria-label={en ? "Archive pages" : "归档分页"}>{archivePage > 1 ? <Link href={`${local("/inspiration")}?page=${archivePage - 1}`}>{en ? "← Newer" : "← 较新灵感"}</Link> : null}{archive.hasMore ? <Link href={`${local("/inspiration")}?page=${archivePage + 1}`}>{en ? "Older →" : "更早灵感 →"}</Link> : null}</nav>
    </section> : <p className={styles.note}><Link href={local("/inspiration")}>{en ? "← Browse all story ideas" : "← 浏览每日灵感与归档"}</Link></p>}
    <aside className={styles.note}><span aria-hidden="true">✦</span><p>{en ? "Daily ideas are public. Reading or signing in does not subscribe you to email; email delivery requires a separate confirmed subscription." : "每日灵感和邮件订阅彼此独立。登录不会自动订阅；只有你主动提交邮箱并完成确认后，才会收到每日邮件。"}</p></aside>
  </main>;
}
