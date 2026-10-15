"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { entries, type ScrapbookEntry } from "@/content/scrapbook";
import { filterEntries, type Category } from "@/lib/gallery";
export function ScrapbookGallery() {
  const [category, setCategory] = useState<Category>("All");
  const [limit, setLimit] = useState(6);
  const [selected, setSelected] = useState<ScrapbookEntry | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const filtered = filterEntries(entries, category);
  useEffect(() => {
    if (!selected) return;
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = previous;
      opener.current?.focus();
    };
  }, [selected]);
  return (
    <>
      <div className="gallery-toolbar">
        <div
          className="filter-group"
          role="group"
          aria-label="Filter scrapbook"
        >
          {(["All", "Events", "Drinks"] as const).map((c) => (
            <button
              key={c}
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
                setLimit(6);
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <span className="gallery-count" aria-live="polite">
          {filtered.length} little moments
        </span>
      </div>
      <div className="scrap-grid">
        {filtered.slice(0, limit).map((entry, index) => (
          <article
            className="scrap-entry"
            key={entry.id}
            style={
              {
                "--rotation": `${[-3, 2, 1, -2, 3, -1][index % 6]}deg`,
                "--entry-delay": `${Math.min(index, 5) * 55}ms`,
              } as CSSProperties
            }
          >
            <button
              className="photo-open"
              onClick={(e) => {
                opener.current = e.currentTarget;
                setSelected(entry);
              }}
              aria-label={`Enlarge ${entry.caption}`}
            >
              <span className="paper-tape" aria-hidden="true" />
              <span className="scrap-image">
                <Image
                  src={entry.src}
                  alt={entry.alt}
                  fill
                  sizes="(max-width: 600px) 85vw, (max-width: 900px) 42vw, 360px"
                />
              </span>
              <span className="photo-plus" aria-hidden="true">
                ↗
              </span>
            </button>
            <div className="scrap-meta">
              {entry.collection && <span>{entry.collection}</span>}
              <span>{entry.date}</span>
            </div>
          </article>
        ))}
      </div>
      {limit < filtered.length ? (
        <button
          className="button button-outline load-more"
          onClick={() => setLimit(limit + 6)}
        >
          A few more memories <span aria-hidden="true">↓</span>
        </button>
      ) : (
        <p className="gallery-end handwritten">
          More memories in the making. ♡
        </p>
      )}
      {selected && (
        <dialog
          ref={dialog}
          className="photo-dialog"
          aria-labelledby="photo-title"
          onCancel={() => setSelected(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="photo-dialog-inner">
            <button
              className="dialog-close"
              autoFocus
              onClick={() => setSelected(null)}
              aria-label="Close photo"
            >
              ✕
            </button>
            <Image
              src={selected.src}
              alt={selected.alt}
              width={1600}
              height={1200}
              sizes="90vw"
            />
            <div>
              <h2 id="photo-title" className="handwritten">
                {selected.caption}
              </h2>
              {selected.collection && (
                <p>
                  {selected.collection}
                  {selected.date ? ` · ${selected.date}` : ""}
                </p>
              )}
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
