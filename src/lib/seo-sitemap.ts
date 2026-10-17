import type { MetadataRoute } from "next";
import { languageAlternates, localizedPath } from "@/lib/seo";
import { toAbsoluteAppUrl } from "@/lib/site-url";

export function bilingualSitemapEntries(path: string, extra: Omit<MetadataRoute.Sitemap[number], "url"> = {}): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(Object.entries(languageAlternates(path)).map(([key, value]) => [key, toAbsoluteAppUrl(value)]));
  return (["zh", "en"] as const).map((locale) => ({
    url: toAbsoluteAppUrl(localizedPath(path, locale)), ...extra, alternates: { languages },
  }));
}
