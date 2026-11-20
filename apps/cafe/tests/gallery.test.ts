import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { bookPages, bookPhotos, chapters } from "../content/scrapbook-book.ts";
import { entries } from "../content/scrapbook.ts";
import { getPageStart, getPageTarget } from "../lib/gallery.ts";

test("the book preserves every original photograph exactly once", () => {
  const byId = new Map(bookPhotos.map((photo) => [photo.id, photo]));
  assert.equal(byId.size, bookPhotos.length);
  for (const entry of entries) {
    assert.equal(byId.get(entry.id)?.src, entry.src);
  }
  for (const photo of bookPhotos) {
    assert.ok(photo.caption && photo.alt);
    assert.ok(existsSync(new URL(`../public${photo.src}`, import.meta.url)));
    assert.ok(photo.width > 0 && photo.height > 0);
  }
});
test("each chapter starts on a left page and has a complete spread", () => {
  assert.equal(bookPages.length % 2, 0);
  for (const chapter of chapters) {
    const start = bookPages.findIndex((page) => page.chapter === chapter.id);
    assert.ok(start >= 0);
    assert.equal(start % 2, 0);
    assert.equal(bookPages[start + 1].chapter, chapter.id);
  }
  const expectedPrints = {
    panorama: 3,
    "bottom-banner": 3,
    "left-portrait": 3,
    "right-portrait": 3,
    cascade: 3,
    triptych: 3,
    inset: 2,
    pair: 2,
    "contact-column": 4,
    "contact-row": 4,
  };
  for (const page of bookPages) {
    assert.ok(chapters.some((chapter) => chapter.id === page.chapter));
    assert.equal(
      page.photos.length,
      expectedPrints[page.composition],
      page.title,
    );
  }
});
test("related event photographs stay within the same spread", () => {
  for (const ids of [
    ["blueprint-6", "blueprint-4"],
    ["social-2", "social-3"],
    ["saas-1", "saas-2"],
    ["halloween-ghost-2025", "halloween-filming-2025"],
  ]) {
    assert.ok(
      bookPages.some(
        (_, index) =>
          index % 2 === 0 &&
          ids.every((id) =>
            bookPages
              .slice(index, index + 2)
              .some((page) => page.photos.some((photo) => photo.id === id)),
          ),
      ),
    );
  }
});
test("spread navigation advances by two and stops at either end", () => {
  const total = bookPages.length;
  assert.equal(getPageTarget(0, -1, true, total), 0);
  assert.equal(getPageTarget(0, 1, true, total), 2);
  assert.equal(getPageTarget(total - 2, 1, true, total), total - 2);
  assert.equal(getPageTarget(total - 2, -1, true, total), total - 4);
});
test("phone navigation reaches every page including the final right-hand page", () => {
  const total = bookPages.length;
  let page = 0;
  const visited = [page];
  for (let index = 0; index < total - 1; index++) {
    page = getPageTarget(page, 1, false, total);
    visited.push(page);
  }
  assert.deepEqual(
    visited,
    Array.from({ length: total }, (_, index) => index),
  );
  assert.equal(getPageTarget(total - 1, 1, false, total), total - 1);
  assert.equal(getPageTarget(0, -1, false, total), 0);
});
test("resizing a right-hand phone page preserves its containing spread", () => {
  assert.equal(getPageStart(5, true), 4);
  assert.equal(getPageStart(5, false), 5);
  assert.equal(getPageTarget(5, 1, true, 12), 6);
  assert.equal(getPageTarget(5, -1, true, 12), 2);
});
