import PublicInspirationPage, { inspirationMetadata } from "@/components/inspiration/PublicInspirationPage";
import { inspirationArchivePage } from "@/lib/inspiration/dates";

export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  return inspirationMetadata("zh", undefined, inspirationArchivePage(page));
}
export default async function InspirationPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  return <PublicInspirationPage locale="zh" archivePage={inspirationArchivePage(page)} />;
}
