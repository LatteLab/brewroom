import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import press from "@/content/press.json";
export const metadata: Metadata = {
  title: "News & press",
  description:
    "Latte Lab in the news, plus stories from the wider MIT coffee community.",
  alternates: { canonical: "/news" },
};
export default function News() {
  const ordered = [press[press.length - 1], ...press.slice(0, -1)];
  return (
    <main id="main" className="shell news-page">
      <PageIntro
        eyebrow="A FEW WORDS ABOUT COFFEE"
        title="Fresh off the press."
        description="Latte Lab in the news—and a few stories from the wider MIT coffee community."
      />
      <div className="press-list">
        {ordered.map((item, i) => (
          <article
            className={`press-entry ${i === 0 ? "press-featured" : ""}`}
            key={item.link}
          >
            <div className="press-index">
              {String(i + 1).padStart(2, "0")}
              <span>{i === 0 ? "LATTE LAB" : "MIT COFFEE COMMUNITY"}</span>
            </div>
            <div className="press-copy">
              <p className="eyebrow">
                {item.category} <span>· {item.date}</span>
              </p>
              <h2>
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  {item.title}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </h2>
              <p>{item.description}</p>
              <a
                className="text-link"
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the story <span aria-hidden="true">↗</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </article>
        ))}
      </div>
      <div className="news-tail">
        <p className="handwritten">More of our story, in pictures.</p>
        <Link className="text-link" href="/scrapbook">
          Visit the scrapbook ↗
        </Link>
      </div>
    </main>
  );
}
