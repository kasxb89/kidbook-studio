const DEFAULT_APP_URL = "https://storybloom.valleylmh.vip";

export const APP_METADATA_BASE = new URL(
  (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL).replace(/\/$/, ""),
);

export function toAbsoluteAppUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, APP_METADATA_BASE).toString();
}
