import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/JsonLd";
import EnglishLibraryCard from "@/components/library/EnglishLibraryCard";
import { getAllSeries, getPublishedBooks, getSeries } from "@/lib/library";
import { seriesCopy, seriesMetadata, seriesStructuredData } from "@/lib/library/seo";

type Props = { params: Promise<{ seriesId: string }> };
export function generateStaticParams() { return getAllSeries().map((series) => ({ seriesId: series.id })); }
export async function generateMetadata({ params }: Props) {
  const { seriesId } = await params;
  const series = getSeries(seriesId);
  if (!series) notFound();
  return seriesMetadata(series, getPublishedBooks(seriesId), "en");
}

export default async function EnglishSeriesPage({ params }: Props) {
  const { seriesId } = await params;
  const series = getSeries(seriesId);
  if (!series) notFound();
  const books = getPublishedBooks(seriesId);
  const copy = seriesCopy(series, "en");
  return <main className="library-page" lang="en">
    <JsonLd data={seriesStructuredData(series, books, "en")} />
    <nav className="library-topbar" aria-label="Breadcrumb"><Link href="/en/library">← Picture Book Library</Link><Link href={`/library/${seriesId}`} hrefLang="zh-CN">中文</Link></nav>
    <header className="library-hero"><p className="library-kicker">CHINESE &amp; ENGLISH · READ TOGETHER</p><h1>{copy.title}</h1><p className="library-lead">{copy.description}</p></header>
    <section className="library-book-grid" aria-label={copy.title}>{books.map((book) => <EnglishLibraryCard key={book.id} book={book} series={series} />)}</section>
  </main>;
}
