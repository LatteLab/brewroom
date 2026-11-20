import type { Metadata } from "next";
import { ScrapbookBook } from "@/components/scrapbook-book";
import { bookPhotos, chapters } from "@/content/scrapbook-book";
import "./scrapbook.css";
export const metadata: Metadata = {
  title: "Our scrapbook",
  description:
    "Campus coffee pop-ups, drinks we’ve made, and moments we’ve shared. Browse the Latte Lab scrapbook.",
  alternates: { canonical: "/scrapbook" },
};
export default function Scrapbook() {
  return (
    <main id="main" className="scrapbook-page">
      <div className="scrapbook-shell">
        <header className="scrapbook-intro">
          <div>
            <h1>
              Our <em>scrapbook.</em>
            </h1>
          </div>
          <div className="scrapbook-intro-note">
            <span>
              {bookPhotos.length} photographs · {chapters.length} chapters
            </span>
          </div>
        </header>
        <ScrapbookBook />
      </div>
    </main>
  );
}
