/** Short standard-JSON transport references. Literal collisions retain the preceding exact codec. */
export function openTupleWire(text: string): string {
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
  const collision = (v: unknown): boolean => {
    if (typeof v === 'string') return /^&\d+$/u.test(v);
    if (Array.isArray(v))
      return (
        (typeof v[0] === 'string' &&
          (/^@\d+$/u.test(v[0]) || ['+', '=', '%'].includes(v[0]))) ||
        v.some(collision)
      );
    return !!v && typeof v === 'object' && Object.values(v).some(collision);
  };
  if (raw.shared.some(collision) || collision(raw.payload)) return text;
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      if (Object.keys(v).length === 1) {
        if ('$s' in v) return `&${String(Number(v.$s))}`;
        if ('$r' in v) {
          const [index, cells] = v.$r as [number, unknown[]];
          return [`@${String(index)}`, ...cells.map(visit)];
        }
        if ('$j' in v || '$join' in v)
          return [
            '+',
            ...(('$j' in v ? v.$j : v.$join) as unknown[]).map(visit),
          ];
        if ('$json' in v) return ['=', visit(v.$json)];
        if ('$t' in v) {
          const [columns, rows] = v.$t as [unknown, unknown[]];
          return ['%', columns, rows.map(visit)];
        }
      }
      return Object.fromEntries(
        Object.entries(v).map(([key, cell]) => [key, visit(cell)]),
      );
    }
    return v;
  };
  const result = JSON.stringify({
    ...raw,
    encoding: 'lossless-shared-values-v8',
    meaning:
      'Recursive JSON: key #N=keys[base36 N]; numeric column n=keys[n]; string &N=shared[N]; array [@N,...cells]=recordColumns[N] record; [%,columns,rows]=records; [+,...parts]=exact string concatenation; [=,value]=JSON.stringify(expanded value in original key order). Other values are literal. Markers are not action arguments.',
    shared: raw.shared.map(visit),
    payload: visit(raw.payload),
  });
  return result.length < text.length ? result : text;
}
