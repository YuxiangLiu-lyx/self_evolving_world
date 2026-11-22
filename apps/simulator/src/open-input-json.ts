import { literalJoin } from './open-input-text.js';
/** JSON embedded verbatim inside event descriptions shares the same facts as structured evidence. */
export function openEmbeddedJson(value: unknown): unknown {
  const visit = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const parts: unknown[] = [];
      let from = 0;
      for (let start = 0; start < v.length; start++) {
        if (!['{', '['].includes(v[start] ?? '')) continue;
        let depth = 0,
          quoted = false,
          escaped = false,
          end = start;
        for (; end < v.length; end++) {
          const char = v[end];
          if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
            continue;
          }
          if (char === '"') {
            quoted = true;
            continue;
          }
          if (char === '{' || char === '[') depth++;
          else if (char === '}' || char === ']') depth--;
          if (depth === 0) {
            end++;
            break;
          }
        }
        if (depth !== 0 || quoted || end - start < 64) continue;
        const fragment = v.slice(start, end);
        let parsed: unknown;
        try {
          parsed = JSON.parse(fragment) as unknown;
        } catch {
          continue;
        }
        if (
          JSON.stringify(parsed) !== fragment ||
          literalJoin(parsed) ||
          reserved(parsed)
        )
          continue;
        if (start > from) parts.push(v.slice(from, start));
        parts.push({ $json: visit(parsed) });
        from = end;
        start = end - 1;
      }
      if (!parts.length) return v;
      if (from < v.length) parts.push(v.slice(from));
      return { $join: parts };
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([k, cell]) => [k, visit(cell)]),
      );
    return v;
  };
  return visit(value);
}
function reserved(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(reserved);
  if (v && typeof v === 'object')
    return (
      (Object.keys(v).length === 1 &&
        ['$json', '$shared', '$record', '$table'].some((k) => k in v)) ||
      Object.values(v).some(reserved)
    );
  return false;
}
export function openJsonWire(text: string): string | null {
  const raw: unknown = JSON.parse(text);
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('encoding' in raw) ||
    !('recordColumns' in raw) ||
    !Array.isArray(raw.recordColumns) ||
    !('shared' in raw) ||
    !Array.isArray(raw.shared) ||
    !('payload' in raw) ||
    typeof raw.encoding !== 'string' ||
    !['lossless-shared-values-v5', 'lossless-shared-values-v6'].includes(
      raw.encoding,
    )
  )
    return null;
  const v = raw as {
    keys?: string[];
    recordColumns: string[][];
    shared: unknown[];
    payload: unknown;
  };
  const column = (key: string): string | number =>
    v.keys && key.startsWith('#') ? Number.parseInt(key.slice(1), 36) : key;
  const visit = (cell: unknown): unknown => {
    if (Array.isArray(cell)) return cell.map(visit);
    if (cell && typeof cell === 'object') {
      if (Object.keys(cell).length === 1 && '$t' in cell) {
        const [columns, rows] = cell.$t as [string[], unknown[][]];
        return { $t: [columns.map(column), rows.map(visit)] };
      }
      return Object.fromEntries(
        Object.entries(cell).map(([k, cell]) => [k, visit(cell)]),
      );
    }
    return cell;
  };
  return JSON.stringify({
    encoding: 'lossless-shared-values-v7',
    meaning:
      'Recursive: key #N=keys[base36 N]; numeric column n=keys[n]; $s:n=shared[n]; $r:[n,cells]=recordColumns[n] record; $t:[columns,rows]=records; $j/$join=string concatenation; $json=JSON.stringify(expanded value in original key order).',
    ...(v.keys ? { keys: v.keys } : {}),
    recordColumns: v.recordColumns.map((row) => row.map(column)),
    shared: v.shared.map(visit),
    payload: visit(v.payload),
  });
}
