import type { Metadata } from "next";
import { toAbsoluteAppUrl } from "@/lib/site-url";

export const SITE_NAME = "StoryBloom";
export const DEFAULT_SHARE_IMAGE = "/gift-books/summer-pocket/cover.webp";
export type SiteLocale = "zh" | "en";

export const HOME_TITLES = {
  zh: "StoryBloom - AI 儿童绘本生成 | 把孩子的成长小事变成专属绘本",
  en: "StoryBloom - AI Storybook Creator & Bilingual Stories for Kids",
};

export function localizedPath(path: string, locale: SiteLocale) {
  return locale === "en" ? (path === "/" ? "/en" : `/en${path}`) : path;
}

export function languageAlternates(path: string) {
  return { "zh-CN": path, en: localizedPath(path, "en"), "x-default": path };
}

// Keep canonicals at the page level: Next replaces nested metadata objects.
export function pageMetadata({
  path, title, description, image = DEFAULT_SHARE_IMAGE,
  locale = "zh", bilingual = false, type = "website", noindex = false,
}: {
  path: string;
  title: string;
  description: string;
  image?: string;
  locale?: SiteLocale;
  bilingual?: boolean;
  type?: "website" | "article";
  noindex?: boolean;
}): Metadata {
  const url = localizedPath(path, locale);
  return {
    title,
    description,
    alternates: {
      canonical: url,
      ...(bilingual ? { languages: languageAlternates(path) } : {}),
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title, description, url, siteName: SITE_NAME,
      locale: locale === "en" ? "en_US" : "zh_CN",
      ...(bilingual ? { alternateLocale: locale === "en" ? "zh_CN" : "en_US" } : {}),
      type,
      images: [{ url: image, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export function breadcrumbs(items: Array<{ name: string; path: string }>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem", position: index + 1, name: item.name,
      item: toAbsoluteAppUrl(item.path),
    })),
  };
}

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
