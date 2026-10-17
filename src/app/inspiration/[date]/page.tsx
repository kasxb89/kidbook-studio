import { notFound } from "next/navigation";
import PublicInspirationPage, { inspirationMetadata } from "@/components/inspiration/PublicInspirationPage";
import { getArchivedInspiration } from "@/lib/inspiration/archive";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ date: string }> };
export async function generateMetadata({ params }: Props) {
  const { date } = await params;
  const inspiration = await getArchivedInspiration(date);
  if (!inspiration) notFound();
  return inspirationMetadata("zh", inspiration);
}
export default async function InspirationIssuePage({ params }: Props) {
  const { date } = await params;
  const inspiration = await getArchivedInspiration(date);
  if (!inspiration) notFound();
  return <PublicInspirationPage locale="zh" inspiration={inspiration} />;
}
