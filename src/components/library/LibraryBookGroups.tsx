import type { ReactNode } from "react";
import {
  groupLibraryBooksBySubseries,
  type LibraryBookSummary,
} from "@/lib/library/catalog";

export default function LibraryBookGroups({
  books,
  renderBook,
  headingLevel = "h2",
}: {
  books: LibraryBookSummary[];
  renderBook: (book: LibraryBookSummary) => ReactNode;
  headingLevel?: "h2" | "h4";
}) {
  const groups = groupLibraryBooksBySubseries(books);
  const hasSubseries = groups.some((group) => group.subseries);
  const Heading = headingLevel;

  return (
    <div className="library-book-groups">
      {groups.map((group) => (
        <section key={group.subseries?.id ?? "independent-stories"}>
          {hasSubseries ? (
            <header className="library-subseries-heading">
              <Heading>{group.subseries?.title ?? "其他故事"}</Heading>
              <span>{group.books.length} 本</span>
            </header>
          ) : null}
          <div className="library-home-row">
            {group.books.map(renderBook)}
          </div>
        </section>
      ))}
    </div>
  );
}
