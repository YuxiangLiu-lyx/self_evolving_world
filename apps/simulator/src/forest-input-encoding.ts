/** Lossless wire representation only. No observation fact, goal, interface or cost is removed. */
export function continuousInputText(input: unknown): string {
  const plain = JSON.stringify(input);
  if (
    !input ||
    typeof input !== 'object' ||
    !(
      'experience' in input ||
      ('physicalRules' in input &&
        input.physicalRules &&
        typeof input.physicalRules === 'object' &&
        'experience' in input.physicalRules)
    ) ||
    plain.length * 2 <= 100_000
  )
    return plain;
  // Normalize exactly as the original JSON transport, including omitted undefined fields.
  const value: unknown = JSON.parse(plain);
  const counts = new Map<string, number>();
  const state = { collision: false };
  const count = (item: unknown): void => {
    const text = JSON.stringify(item);
    if (text.length >= 20) counts.set(text, (counts.get(text) ?? 0) + 1);
    if (Array.isArray(item)) item.forEach(count);
    else if (item && typeof item === 'object') {
      if (
        Object.keys(item).length === 1 &&
        ('$shared' in item || '$table' in item || '$record' in item)
      )
        state.collision = true;
      Object.values(item).forEach(count);
    }
  };
  count(value);
  // Never reinterpret existing data as an encoding reference.
  if (state.collision) return plain;
  const shared: unknown[] = [],
    indexes = new Map<string, number>();
  const visit = (item: unknown, definition = false): unknown => {
    const text = JSON.stringify(item);
    if (
      !definition &&
      text.length >= 20 &&
      (counts.get(text) ?? 0) * (text.length - 18) > text.length + 2
    ) {
      const previous = indexes.get(text);
      if (previous !== undefined) return { $shared: previous };
      const index = shared.length;
      indexes.set(text, index);
      shared.push(null);
      shared[index] = visit(item, true);
      return { $shared: index };
    }
    if (Array.isArray(item)) return item.map((item) => visit(item));
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item).map(([key, item]) => [key, visit(item)]),
      );
    return item;
  };
  const payload = visit(value);
  const live = inlineSingleReferences(shared, payload);
  const tables = {
    shared: live.shared.map(compactTables),
    payload: compactTables(live.payload),
  };
  const records = compactRecords(tables);
  const compact = JSON.stringify({
    encoding: 'lossless-shared-values-v3',
    meaning:
      'Expand {$shared:n} as shared[n] recursively. Expand {$table:{columns,rows}} as an array of objects: each row supplies values for the named columns in order. Expand {$record:[n,values]} as one object whose keys are recordColumns[n] and whose values are the supplied cells in order. Expand all nested cells recursively. These lossless encodings preserve every observation fact and interface field. Encoding markers are never action arguments.',
    recordColumns: records.columns,
    shared: records.shared,
    payload: records.payload,
  });
  return compact.length < plain.length ? compact : plain;
}

/** Parent sharing can leave a child definition with one real wire use. Inline it verbatim. */
function inlineSingleReferences(
  shared: unknown[],
  payload: unknown,
): { shared: unknown[]; payload: unknown } {
  const uses = new Map<number, number>();
  const count = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(count);
    else if (value && typeof value === 'object') {
      if (Object.keys(value).length === 1 && '$shared' in value) {
        const index = Number(value.$shared);
        uses.set(index, (uses.get(index) ?? 0) + 1);
      } else Object.values(value).forEach(count);
    }
  };
  count(payload);
  shared.forEach(count);
  const kept = shared
    .map((_, index) => index)
    .filter((index) => (uses.get(index) ?? 0) > 1);
  const indexes = new Map(kept.map((index, next) => [index, next]));
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      if (Object.keys(value).length === 1 && '$shared' in value) {
        const index = Number(value.$shared);
        if (!Number.isSafeInteger(index) || index < 0 || index >= shared.length)
          throw new Error('Invalid internal shared-value reference.');
        return indexes.has(index)
          ? { $shared: indexes.get(index) }
          : visit(shared[index]);
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, value]) => [key, visit(value)]),
      );
    }
    return value;
  };
  return {
    shared: kept.map((index) => visit(shared[index])),
    payload: visit(payload),
  };
}

/** Repeated record shapes share only field names, never drop optional fields or cells. */
function compactRecords(input: { shared: unknown[]; payload: unknown }): {
  columns: string[][];
  shared: unknown[];
  payload: unknown;
} {
  const counts = new Map<string, number>();
  const count = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(count);
    else if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      if (!keys.some((key) => key.startsWith('$'))) {
        const shape = JSON.stringify(keys);
        counts.set(shape, (counts.get(shape) ?? 0) + 1);
      }
      Object.values(value).forEach(count);
    }
  };
  count(input);
  const columns: string[][] = [],
    indexes = new Map<string, number>();
  for (const [shape, count] of counts) {
    // Conservative byte savings include the shared definition and marker overhead.
    if (count >= 2 && (shape.length - 25) * count > shape.length) {
      indexes.set(shape, columns.length);
      columns.push(JSON.parse(shape) as string[]);
    }
  }
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      const index = indexes.get(JSON.stringify(Object.keys(value)));
      if (index !== undefined)
        return { $record: [index, Object.values(value).map(visit)] };
      return Object.fromEntries(
        Object.entries(value).map(([key, value]) => [key, visit(value)]),
      );
    }
    return value;
  };
  return {
    columns,
    shared: input.shared.map(visit),
    payload: visit(input.payload),
  };
}

/** Equal-shaped record arrays retain explicit column names and every cell, in original order. */
function compactTables(value: unknown): unknown {
  if (Array.isArray(value)) {
    const rows = value.map(compactTables);
    if (
      rows.length > 1 &&
      rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))
    ) {
      const first = rows[0] as Record<string, unknown>;
      const columns = Object.keys(first);
      if (
        !columns.includes('$shared') &&
        !columns.includes('$table') &&
        rows.every(
          (row) =>
            JSON.stringify(Object.keys(row as object)) ===
            JSON.stringify(columns),
        )
      ) {
        const table = {
          $table: {
            columns,
            rows: rows.map((row) =>
              columns.map((key) => (row as Record<string, unknown>)[key]),
            ),
          },
        };
        if (JSON.stringify(table).length < JSON.stringify(rows).length)
          return table;
      }
    }
    return rows;
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [key, compactTables(value)]),
    );
  return value;
}
