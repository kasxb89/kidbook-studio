import "server-only";
import { cache } from "react";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/email/supabase-admin";
import { getShanghaiDateKey } from "@/lib/email/daily-inspiration";
import { isValidInspirationDate } from "./dates";
import { dailyInspirationRowSchema, PUBLIC_DAILY_INSPIRATION_COLUMNS, toPublicDailyInspiration } from "./public-daily-inspiration";

const summarySchema = z.object({ issue_date: z.string(), title_zh: z.string(), title_en: z.string(), updated_at: z.string() });
export type InspirationArchiveEntry = z.infer<typeof summarySchema>;
export const ARCHIVE_PAGE_SIZE = 30;

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Archive pages only represent persisted issues. Never synthesize historical issues.
export const getArchivedInspiration = cache(async (issueDate: string) => {
  if (!isValidInspirationDate(issueDate, getShanghaiDateKey()) || !configured()) return null;
  const { data, error } = await getSupabaseAdmin().from("daily_story_inspirations")
    .select(PUBLIC_DAILY_INSPIRATION_COLUMNS).eq("issue_date", issueDate).maybeSingle();
  if (error) throw error;
  return data ? toPublicDailyInspiration(dailyInspirationRowSchema.parse(data)) : null;
});

export async function listInspirationArchive(page = 1, pageSize = ARCHIVE_PAGE_SIZE) {
  if (!configured()) return { entries: [] as InspirationArchiveEntry[], hasMore: false };
  const offset = (page - 1) * pageSize;
  const { data, error } = await getSupabaseAdmin().from("daily_story_inspirations")
    .select("issue_date,title_zh,title_en,updated_at").lte("issue_date", getShanghaiDateKey())
    .order("issue_date", { ascending: false }).range(offset, offset + pageSize);
  if (error) throw error;
  const entries = z.array(summarySchema).parse(data ?? []);
  return { entries: entries.slice(0, pageSize), hasMore: entries.length > pageSize };
}

export async function listAllInspirationArchiveEntries() {
  const entries: InspirationArchiveEntry[] = [];
  // Supabase caps each response; explicitly page to keep older dates discoverable.
  for (let page = 1; ; page += 1) {
    const batch = await listInspirationArchive(page, 500);
    entries.push(...batch.entries);
    if (!batch.hasMore) return entries;
  }
}
