import type { MetadataRoute } from "next";
import { bilingualSitemapEntries } from "@/lib/seo-sitemap";
import { listAllInspirationArchiveEntries } from "@/lib/inspiration/archive";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const issues = await listAllInspirationArchiveEntries();
  return issues.flatMap((issue) => bilingualSitemapEntries(`/inspiration/${issue.issue_date}`, { lastModified: issue.updated_at }));
}
