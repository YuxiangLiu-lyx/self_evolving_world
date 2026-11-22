/** Find literal repeated clauses at readable boundaries; no summary or inference. */
export function openRepeatedPhrases(values: string[]): string[] {
  const suffixes: string[] = [];
  for (const value of values) {
    // Bounded windows keep sorting independent of arbitrarily long user strings.
    for (let i = 0; i < value.length; i++)
      if (i === 0 || /[\s,;:()[\]{}]/u.test(value[i - 1] ?? ''))
        if (value.length - i >= 12) suffixes.push(value.slice(i, i + 512));
  }
  suffixes.sort();
  const phrases = new Set<string>();
  for (let i = 1; i < suffixes.length; i++) {
    const left = suffixes[i - 1] ?? '',
      right = suffixes[i] ?? '';
    let n = 0;
    while (n < left.length && n < right.length && left[n] === right[n]) n++;
    // Keep the boundary exactly; never normalize spaces, punctuation or Unicode.
    while (
      n > 0 &&
      n < right.length &&
      !/[\s,;:.!?()[\]{}]/u.test(right[n] ?? '')
    )
      n--;
    if (n >= 12) phrases.add(right.slice(0, n));
  }
  return [...phrases];
}

/** Reuse v7's existing exact string-join/shared-value semantics after structural compression. */
export function openPhraseWire(text: string): string {
  const raw: unknown = JSON.parse(text);
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('encoding' in raw) ||
    raw.encoding !== 'lossless-shared-values-v7' ||
    !('shared' in raw) ||
    !Array.isArray(raw.shared) ||
    !('payload' in raw)
  )
    return text;
  const counts = new Map<string, number>();
  const walk = (v: unknown, string: (s: string) => unknown): unknown => {
    if (typeof v === 'string') return string(v);
    if (Array.isArray(v)) return v.map((cell) => walk(cell, string));
    if (v && typeof v === 'object') {
      if (Object.keys(v).length === 1 && '$t' in v) {
        const [columns, rows] = v.$t as [unknown, unknown];
        return { $t: [columns, walk(rows, string)] };
      }
      return Object.fromEntries(
        Object.entries(v).map(([key, cell]) => [key, walk(cell, string)]),
      );
    }
    return v;
  };
  const count = (s: string): string => {
    counts.set(s, (counts.get(s) ?? 0) + 1);
    return s;
  };
  raw.shared.forEach((v) => walk(v, count));
  walk(raw.payload, count);
  const parts = new Map<string, (string | number)[]>(
    [...counts.keys()].map((s) => [s, [s]]),
  );
  const fragments: string[] = [];
  const base = raw.shared.length;
  const encode = (cells: (string | number)[]): unknown => {
    const values = cells.map((c) =>
      typeof c === 'number' ? { $s: base + c } : c,
    );
    return values.length === 1 ? values[0] : { $j: values };
  };
  const candidates = openRepeatedPhrases([...counts.keys()]).sort(
    (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  for (const phrase of candidates) {
    const updates = new Map<string, (string | number)[]>();
    let gain = -JSON.stringify(phrase).length - 1;
    for (const [original, cells] of parts) {
      if (!cells.some((c) => typeof c === 'string' && c.includes(phrase)))
        continue;
      const next: (string | number)[] = [];
      for (const cell of cells) {
        if (typeof cell !== 'string') {
          next.push(cell);
          continue;
        }
        const split = cell.split(phrase);
        split.forEach((piece, index) => {
          if (index) next.push(fragments.length);
          if (piece) next.push(piece);
        });
      }
      gain +=
        (JSON.stringify(encode(cells)).length -
          JSON.stringify(encode(next)).length) *
        (counts.get(original) ?? 0);
      updates.set(original, next);
    }
    if (gain <= 0) continue;
    fragments.push(phrase);
    for (const [original, next] of updates) parts.set(original, next);
  }
  if (!fragments.length) return text;
  const replace = (s: string): unknown => encode(parts.get(s) ?? [s]);
  const result = JSON.stringify({
    ...raw,
    shared: [...raw.shared.map((v) => walk(v, replace)), ...fragments],
    payload: walk(raw.payload, replace),
  });
  return result.length < text.length ? result : text;
}
