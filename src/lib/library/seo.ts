import type { LibraryBook, LibrarySeries } from "@/types/library";
import { breadcrumbs, localizedPath, pageMetadata, type SiteLocale } from "@/lib/seo";
import { toAbsoluteAppUrl } from "@/lib/site-url";
import { resolveLibraryBookMetadata } from "./metadata";

export const ENGLISH_SERIES: Record<string, { title: string; description: string }> = {
  chengyu: { title: "Chinese Idiom Stories for Kids", description: "Discover Chinese idioms through illustrated stories for kids. Read complete English stories alongside Chinese, with simple explanations for family reading." },
  yanyu: { title: "Chinese Proverb Stories for Kids", description: "Explore everyday wisdom with Chinese proverb picture books. Read the complete stories in English and Chinese together." },
  xiyouji: { title: "Journey to the West for Kids", description: "Follow the Monkey King and his friends in illustrated Journey to the West stories, retold in Chinese and English for children." },
  haoqi: { title: "Science Stories for Curious Kids", description: "Explore nature and everyday science with illustrated questions and answers in Chinese and English for curious children." },
  tangshi: { title: "Tang Poems for Kids", description: "Discover Tang poetry with illustrated scenes, original Chinese poems and English translations for family reading." },
  sanzijing: { title: "Family and Growing-Up Stories", description: "Read Chinese and English picture books about family life, feelings and growing up together." },
  qiche: { title: "Cars and City Transport for Kids", description: "Discover how cars, trains and city transport work through illustrated science stories for kids in English and Chinese." },
  richang: { title: "Everyday Stories for Kids", description: "Read illustrated Chinese and English stories about everyday discoveries, friendship and family life." },
};

export function seriesCopy(series: LibrarySeries, locale: SiteLocale = "zh") {
  return locale === "en"
    ? ENGLISH_SERIES[series.id] ?? { title: series.title, description: "Illustrated stories in Chinese and English for reading together." }
    : { title: series.title, description: series.description };
}

export function bookDescription(book: LibraryBook, locale: SiteLocale = "zh") {
  if (locale === "en") {
    return `${book.title}: ${book.idiomMeaning?.en || book.poem?.appreciation.en || book.classic?.childExplanation.en || book.pages[0]?.enText || book.moral?.en || "A bilingual picture book for kids."}`.slice(0, 280);
  }
  const summary = book.question
    ? `${book.subtitle}。${book.pages[0]?.zhText || book.moral?.zh || ""}`
    : book.idiomMeaning?.zh || book.poem?.appreciation.zh || book.classic?.childExplanation.zh || book.moral?.zh || book.subtitle;
  return `${book.question || book.title}：${summary} 免费在线阅读 ${book.pages.length} 页中英双语儿童绘本，适合 ${book.ageLabel}亲子共读。`;
}

export function bookCover(book: LibraryBook) {
  return book.pages[0]?.imageStatus === "complete" ? book.pages[0].imageUrl : undefined;
}

export function seriesMetadata(series: LibrarySeries, books: LibraryBook[], locale: SiteLocale = "zh") {
  const copy = seriesCopy(series, locale);
  return pageMetadata({
    path: `/library/${series.id}`, locale, bilingual: true,
    title: locale === "en" ? `${copy.title} | Free Bilingual Picture Books - StoryBloom` : `${series.title}绘本 | 中英双语在线阅读 - StoryBloom`,
    description: copy.description,
    image: series.coverImage || books.filter((book) => !book.comingSoon).map(bookCover).find(Boolean),
  });
}

export function bookMetadata(book: LibraryBook, series: LibrarySeries, locale: SiteLocale = "zh") {
  return pageMetadata({
    path: `/library/${series.id}/${book.id}`, locale, bilingual: !book.comingSoon, type: "article",
    title: locale === "en"
      ? `${book.title} | ${seriesCopy(series, "en").title} - StoryBloom`
      : book.question ? `${book.question} - 儿童科普双语绘本 | StoryBloom`
        : book.poem ? `${book.title} - ${book.poem.author}唐诗双语绘本 | StoryBloom`
          : `${book.title} - 中英双语${series.title}绘本 | StoryBloom`,
    description: bookDescription(book, locale), image: bookCover(book), noindex: book.comingSoon,
  });
}

export function libraryBreadcrumbs(series?: LibrarySeries, book?: LibraryBook, locale: SiteLocale = "zh") {
  const local = (path: string) => localizedPath(path, locale);
  return breadcrumbs([
    { name: locale === "en" ? "Home" : "首页", path: local("/") },
    { name: locale === "en" ? "Picture Book Library" : "绘本馆", path: local("/library") },
    ...(series ? [{ name: seriesCopy(series, locale).title, path: local(`/library/${series.id}`) }] : []),
    ...(book ? [{ name: book.title, path: local(`/library/${series!.id}/${book.id}`) }] : []),
  ]);
}

export function seriesStructuredData(series: LibrarySeries, books: LibraryBook[], locale: SiteLocale = "zh") {
  const published = books.filter((book) => !book.comingSoon);
  const copy = seriesCopy(series, locale);
  const url = toAbsoluteAppUrl(localizedPath(`/library/${series.id}`, locale));
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", url, name: copy.title, description: copy.description, inLanguage: locale === "en" ? "en" : "zh-CN", mainEntity: { "@type": "ItemList", numberOfItems: published.length, itemListElement: published.map((book, index) => ({ "@type": "ListItem", position: index + 1, name: book.title, url: toAbsoluteAppUrl(localizedPath(`/library/${series.id}/${book.id}`, locale)) })) } },
    libraryBreadcrumbs(series, undefined, locale),
  ] };
}

export function bookStructuredData(book: LibraryBook, series: LibrarySeries, locale: SiteLocale = "zh") {
  const cover = bookCover(book);
  const metadata = resolveLibraryBookMetadata(book);
  return { "@context": "https://schema.org", "@graph": [
    {
      "@type": "Book", name: book.title, alternativeHeadline: book.subtitle,
      url: toAbsoluteAppUrl(localizedPath(`/library/${series.id}/${book.id}`, locale)),
      description: bookDescription(book, locale), inLanguage: ["zh-CN", "en"],
      numberOfPages: book.pages.length, datePublished: book.publishedAt,
      author: book.poem ? { "@type": "Person", name: book.poem.author } : { "@type": "Organization", name: "StoryBloom" },
      publisher: { "@type": "Organization", name: "StoryBloom", url: toAbsoluteAppUrl("/") },
      isPartOf: { "@type": "BookSeries", name: `StoryBloom ${seriesCopy(series, locale).title}` },
      audience: { "@type": "PeopleAudience", suggestedMinAge: metadata.ageRange.min, suggestedMaxAge: metadata.ageRange.max },
      ...(cover ? { image: toAbsoluteAppUrl(cover) } : {}),
    },
    libraryBreadcrumbs(series, book, locale),
  ] };
}
