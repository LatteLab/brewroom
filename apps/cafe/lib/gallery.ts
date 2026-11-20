export function getPageStart(index: number, spread: boolean): number {
  return spread ? index - (index % 2) : index;
}

export function getPageTarget(
  index: number,
  direction: -1 | 1,
  spread: boolean,
  total: number,
): number {
  return Math.max(
    0,
    Math.min(
      getPageStart(total - 1, spread),
      getPageStart(index, spread) + direction * (spread ? 2 : 1),
    ),
  );
}
