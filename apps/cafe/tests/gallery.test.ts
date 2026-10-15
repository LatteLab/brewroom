import { test } from "node:test";
import assert from "node:assert/strict";
import { filterEntries } from "../lib/gallery.ts";
const entries = [
  { id: "popup", category: "Events" as const },
  { id: "latte", category: "Drinks" as const },
];
test("Drinks excludes event photos", () =>
  assert.deepEqual(
    filterEntries(entries, "Drinks").map((x) => x.id),
    ["latte"],
  ));
test("Events excludes drink photos", () =>
  assert.deepEqual(
    filterEntries(entries, "Events").map((x) => x.id),
    ["popup"],
  ));
test("All preserves editorial order without changing input", () => {
  const before = structuredClone(entries);
  assert.deepEqual(filterEntries(entries, "All"), before);
  assert.deepEqual(entries, before);
});
test("An empty category remains empty", () =>
  assert.deepEqual(filterEntries([entries[0]], "Drinks"), []));
