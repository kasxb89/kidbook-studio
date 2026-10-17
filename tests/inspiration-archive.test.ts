import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidInspirationDate, inspirationArchivePage } from "@/lib/inspiration/dates";
// Next supplies React's server cache; the standalone test runtime uses React 18.
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));

const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), lte: vi.fn(), order: vi.fn(), range: vi.fn() }));
vi.mock("@/lib/email/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: db.from }) }));
import { getArchivedInspiration, listInspirationArchive, listAllInspirationArchiveEntries } from "@/lib/inspiration/archive";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
  db.from.mockReturnValue({ select: db.select });
  db.select.mockReturnValue({ eq: db.eq, lte: db.lte });
  db.eq.mockReturnValue({ maybeSingle: db.maybeSingle });
  db.lte.mockReturnValue({ order: db.order });
  db.order.mockReturnValue({ range: db.range });
});

describe("daily inspiration archive", () => {
  it("rejects impossible, future and malformed dates before querying", async () => {
    expect(isValidInspirationDate("2024-02-29", "2026-10-17")).toBe(true);
    for (const date of ["0000-01-01", "2026-02-29", "2026-02-31", "9999-10-18", "2026-1-02", "../me"]) {
      expect(isValidInspirationDate(date, "2026-10-17")).toBe(false);
      expect(await getArchivedInspiration(date)).toBeNull();
    }
    expect(db.from).not.toHaveBeenCalled();
    expect(inspirationArchivePage("2")).toBe(2);
    for (const value of ["0", "-1", "1.5", "Infinity", "1000000"]) expect(inspirationArchivePage(value)).toBe(1);
  });

  it("does not turn a missing historical row into a fallback issue", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getArchivedInspiration("2026-08-09")).toBeNull();
    expect(db.eq).toHaveBeenCalledWith("issue_date", "2026-08-09");
    expect(db.select).not.toHaveBeenCalledWith("*");
  });

  it("paginates stored issues and keeps all sitemap dates after the database response cap", async () => {
    const row = (index: number) => ({ issue_date: "2026-08-09", title_zh: `灵感 ${index}`, title_en: `Idea ${index}`, updated_at: "2026-08-09T00:00:00Z" });
    db.range.mockResolvedValueOnce({ data: [row(0), row(1), row(2)], error: null });
    expect(await listInspirationArchive(2, 2)).toEqual({ entries: [row(0), row(1)], hasMore: true });
    expect(db.range).toHaveBeenCalledWith(2, 4);
    db.range.mockResolvedValueOnce({ data: Array.from({ length: 501 }, (_, i) => row(i)), error: null }).mockResolvedValueOnce({ data: [row(500)], error: null });
    expect(await listAllInspirationArchiveEntries()).toHaveLength(501);
    expect(db.range).toHaveBeenLastCalledWith(500, 1000);
  });

  it("surfaces database errors without publishing invented archive content", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: new Error("database unavailable") });
    await expect(getArchivedInspiration("2026-08-09")).rejects.toThrow("database unavailable");
  });
});
