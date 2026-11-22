/** Repeated JSON keys use a readable dictionary; literal values and original keys remain recoverable. */
export function openKeyWire(text: string): string {
  const raw: unknown = JSON.parse(text);
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('encoding' in raw) ||
    raw.encoding !== 'lossless-shared-values-v5' ||
    !('recordColumns' in raw) ||
    !Array.isArray(raw.recordColumns) ||
    !('shared' in raw) ||
    !Array.isArray(raw.shared) ||
    !('payload' in raw)
  )
    return text;
  const counts = new Map<string, number>();
  const state = { collision: false };
  const countKey = (key: string): void => {
    if (key.startsWith('#')) state.collision = true;
    if (!key.startsWith('$')) counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  const count = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(count);
    else if (v && typeof v === 'object')
      for (const [key, cell] of Object.entries(v)) {
        countKey(key);
        if (key === '$t') {
          const [columns, rows] = cell as [string[], unknown[][]];
          columns.forEach(countKey);
          rows.forEach(count);
        } else count(cell);
      }
  };
  (raw.recordColumns as string[][]).forEach((row) => {
    row.forEach(countKey);
  });
  raw.shared.forEach(count);
  count(raw.payload);
  if (state.collision) return text;
  const keys = [...counts]
    .filter(
      ([key, n]) => key.length >= 4 && (key.length - 3) * n > key.length + 4,
    )
    .map(([key]) => key);
  const indexes = new Map(keys.map((key, i) => [key, `#${i.toString(36)}`]));
  const key = (value: string): string => indexes.get(value) ?? value;
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([k, cell]) => {
          if (k === '$t') {
            const [columns, rows] = cell as [string[], unknown[][]];
            return [k, [columns.map(key), rows.map(visit)]];
          }
          return [key(k), visit(cell)];
        }),
      );
    return v;
  };
  const result = JSON.stringify({
    encoding: 'lossless-shared-values-v6',
    meaning:
      'Restore each object key and record/table column named #N to keys[parseInt(N,36)]; literal string values are unchanged. Then expand {$s:n} as shared[n], {$r:[n,cells]} using recordColumns[n], {$t:[columns,rows]} as records, and {$j:parts} by exact string concatenation. Expand nested cells recursively. Every original field, fact and character is retained. Markers are never action arguments.',
    keys,
    recordColumns: (raw.recordColumns as string[][]).map((row) => row.map(key)),
    shared: raw.shared.map(visit),
    payload: visit(raw.payload),
  });
  return result.length < text.length ? result : text;
}
