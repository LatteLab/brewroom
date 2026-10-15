export type Category = "All" | "Events" | "Drinks";
export function filterEntries<T extends { category: Exclude<Category, "All"> }>(
  entries: T[],
  category: Category,
): T[] {
  return category === "All"
    ? entries
    : entries.filter((entry) => entry.category === category);
}
