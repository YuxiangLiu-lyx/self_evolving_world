/** Shorter transport markers only; all literal strings, field names, order and facts stay unchanged. */
export function openShortWire(text: string): string {
  const raw: unknown = JSON.parse(text);
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('recordColumns' in raw) ||
    !Array.isArray(raw.recordColumns) ||
    !('shared' in raw) ||
    !Array.isArray(raw.shared) ||
    !('payload' in raw) ||
    !('encoding' in raw) ||
    typeof raw.encoding !== 'string' ||
    !['lossless-shared-values-v3', 'lossless-shared-values-v4'].includes(
      raw.encoding,
    )
  )
    return text;
  const value: { recordColumns: unknown; shared: unknown[]; payload: unknown } =
    {
      recordColumns: raw.recordColumns,
      shared: raw.shared,
      payload: raw.payload,
    };
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      if (Object.keys(v).length === 1) {
        if ('$shared' in v) return { $s: v.$shared };
        if ('$record' in v) return { $r: visit(v.$record) };
        if ('$join' in v) return { $j: visit(v.$join) };
        if ('$table' in v) {
          const table = v.$table as { columns: string[]; rows: unknown[][] };
          return {
            $t: [table.columns, table.rows.map((row) => row.map(visit))],
          };
        }
      }
      return Object.fromEntries(
        Object.entries(v).map(([key, v]) => [key, visit(v)]),
      );
    }
    return v;
  };
  return JSON.stringify({
    encoding: 'lossless-shared-values-v5',
    meaning:
      'Expand {$s:n} as shared[n]. Expand {$r:[n,cells]} as an object with keys recordColumns[n] and corresponding cells. Expand {$t:[columns,rows]} as an array of objects with those columns and row cells. Expand {$j:parts} by concatenating expanded strings exactly, inserting/removing no characters. Expand all nested values recursively. Every original observation fact, interface field and literal character is preserved. These transport markers are never action arguments.',
    recordColumns: value.recordColumns,
    shared: value.shared.map(visit),
    payload: visit(value.payload),
  });
}
