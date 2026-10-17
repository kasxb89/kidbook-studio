import { pageMetadata } from "@/lib/seo";
import IllustratedGift from "@/components/gifts/IllustratedGift";
import { illustratedGifts } from "@/components/gifts/illustrated-gifts";

const book = illustratedGifts[0];
export const metadata = pageMetadata({
  path: `/gifts/${book.slug}`,
  title: `${book.title} · ${book.theme}绘本 | StoryBloom`,
  description: book.description.replaceAll("\n", ""),
  image: `/gift-books/${book.slug}/cover.webp`,
});
export default function Page() {
  return <div data-gift-module><IllustratedGift book={book} /></div>;
}
