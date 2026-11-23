/** Keep source-bound labels readable without moving any world entity. */
export function labelRows<T extends { x: number; y: number; width: number }>(
  labels: T[],
): T[] {
  const placed: T[] = [];
  for (const label of labels) {
    let y = label.y;
    for (const p of [...placed].sort((a, b) => a.y - b.y))
      if (
        Math.abs(p.x - label.x) < (p.width + label.width) / 2 + 8 &&
        Math.abs(p.y - y) < 29
      )
        y = p.y + 29;
    placed.push({ ...label, y });
  }
  return placed;
}
