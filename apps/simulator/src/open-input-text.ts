/** Share repeated readable text fragments without deleting characters or changing any JSON fact. */
export function openTextFragments(value: unknown): unknown {
  const strings = new Set<string>();
  const collect = (v: unknown): void => {
    if (typeof v === 'string') strings.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect(value);
  const values = [...strings],
    candidates = new Set<string>();
  for (const text of values)
    if (
      text.length >= 64 &&
      text.length <= 512 &&
      values.some(
        (other) => other.length > text.length && other.startsWith(text),
      )
    )
      candidates.add(text);
  const sentences = new Map<string, number>();
  for (const text of values)
    for (const part of new Set(text.split(/(?<=[.!?;])(?=\s)/)))
      if (part.length >= 64 && part.length <= 512)
        sentences.set(part, (sentences.get(part) ?? 0) + 1);
  for (const [part, count] of sentences) if (count > 1) candidates.add(part);
  const fragments = [...candidates].sort(
    (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
  );
  const visit = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const parts: string[] = [];
      let offset = 0;
      while (offset < v.length) {
        let at = -1,
          match = '';
        for (const fragment of fragments) {
          if (fragment === v) continue;
          const index = v.indexOf(fragment, offset);
          if (
            index >= 0 &&
            (at < 0 ||
              index < at ||
              (index === at && fragment.length > match.length))
          ) {
            at = index;
            match = fragment;
          }
        }
        if (at < 0) {
          parts.push(v.slice(offset));
          break;
        }
        if (at > offset) parts.push(v.slice(offset, at));
        parts.push(match);
        offset = at + match.length;
      }
      return parts.length > 1 ? { $join: parts.map(visit) } : v;
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([k, v]) => [k, visit(v)]),
      );
    return v;
  };
  return visit(value);
}
export function openWireInput(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  return (
    'development' in input ||
    ('physicalRules' in input &&
      !!input.physicalRules &&
      typeof input.physicalRules === 'object' &&
      'development' in input.physicalRules)
  );
}
export function literalJoin(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(literalJoin);
  if (value && typeof value === 'object')
    return (
      (Object.keys(value).length === 1 &&
        ['$join', '$s', '$r', '$t', '$j', '$json'].some(
          (key) => key in value,
        )) ||
      Object.values(value).some(literalJoin)
    );
  return false;
}
