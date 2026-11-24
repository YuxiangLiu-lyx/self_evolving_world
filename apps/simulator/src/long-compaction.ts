import type {
  V7Actor,
  V7Schema,
  V7World,
} from '@self-evolving-world/world-core';
import { CATALOGUE_ACCESS } from './long-catalogue.js';

/** Culture v2 (opt-in `longDevelopment.compaction`) lossless ordinary-input compaction.
 * Every transform here runs only for that policy, so ex7-ex15 inputs stay byte-identical.
 * Nothing is hidden: whatever leaves the packet is either still in the same input or
 * returned by an exact query with the same permissions. */

/** Per-record note of every paged record (`longPage`); compaction states it once in access. */
export const PAGE_ACCESS =
  'Stable600-code-unit pages, zero-based part; concatenate all parts before parsing. Use the same exact id for continuation.';
/** Per-result note of a reprojected retained query; packet.access already states it. */
export const PROJECTION_NOTE =
  'Current authorized read with stable600 pages; original query/result retained unchanged in the call archive.';
/** String limits at or above this are parsing protection and stay only in the exact record. */
export const LONG_STRING_LIMIT = 200;
/** One packet.access sentence for each compaction that applied to an input. */
export const COMPACTION_ACCESS = {
  paging:
    ' Paged records omit their per-record notes: concatenate all parts before parsing; continue with the same exact id.',
  inRetrieval:
    " An entry marked inRetrieval is shown with at least the same content under the same id in this input's retrieval.",
  joined:
    ' Contiguous parts of one exact record read this round are joined in order into one fragment; joinedParts lists the parts it contains.',
  settled:
    ' Work records marked settled are completed, stopped or cancelled and show only identity, ability, mode, status, target, products and last payment; an exact state query with the same key returns the complete record.',
  terrain:
    ' observation.terrain rows are "y:x:cells" strings: each character of cells is the terrain kind of one visible cell, at x, x+1, ... in row y.',
  abilities: (rounds: number) =>
    ` abilities.baseline entries with id, function and args summarize interfaces you neither used in the last ${String(rounds)} rounds nor need now. args lists the arguments in order: a bare name is a string; otherwise its type with any bounds (number>=lo, integer<=hi, integer lo..hi, and a bare lo..hi is a number range) or its choices a|b; ? marks an optional argument and "" means none. An exact abilities query by id returns the complete contract, including references and string limits of ${String(LONG_STRING_LIMIT)} or more code units.`,
};
const choice = (values: readonly unknown[]) =>
  values.every((v) => typeof v === 'string' && /^[^\s|,:?{}[\]"]+$/.test(v))
    ? values.join('|')
    : values.map((v) => JSON.stringify(v)).join('|');
/** Deterministic compact argument signature of a parameter schema, in schema order, for an
 * interface summary: `target, mode: observe|press, intensity: 0..1`. Plain strings are bare
 * names; long string limits, references and extra-property rules stay in the exact record.
 * An interface without arguments gets "". */
export function longArgumentSignature(schema: V7Schema): string {
  const bounds = (s: V7Schema) =>
    s.minimum !== undefined && s.maximum !== undefined
      ? `${String(s.minimum)}..${String(s.maximum)}`
      : s.minimum !== undefined
        ? `>=${String(s.minimum)}`
        : s.maximum !== undefined
          ? `<=${String(s.maximum)}`
          : '';
  const type = (s: V7Schema): string => {
    if (s.enum) return choice(s.enum);
    if (s.type === 'object') return `{${fields(s)}}`;
    if (s.type === 'array') return `[${s.items ? type(s.items) : ''}]`;
    if (s.type === 'number' || s.type === 'integer') {
      // A bare lo..hi is a number range; every other numeric form names its type.
      const range = bounds(s);
      return s.type === 'number' && range.includes('..')
        ? range
        : `${s.type}${range.includes('..') ? ' ' : ''}${range}`;
    }
    if (s.type === 'string')
      return s.maxLength !== undefined && s.maxLength < LONG_STRING_LIMIT
        ? `string<=${String(s.maxLength)}`
        : '';
    return s.type;
  };
  const fields = (s: V7Schema) =>
    Object.entries(s.properties ?? {})
      .map(([name, child]) => {
        const label = `${name}${(s.required ?? []).includes(name) ? '' : '?'}`,
          kind = type(child);
        return kind ? `${label}: ${kind}` : label;
      })
      .join(', ');
  return schema.type === 'object' ? fields(schema) : type(schema);
}
const SETTLED = new Set(['completed', 'stopped', 'cancelled']);
const SETTLED_FIELDS = [
  'id',
  'workId',
  'ability',
  'mode',
  'status',
  'target',
  'outputs',
  'products',
  'lastPaid',
];
type Row = Record<string, unknown>;
const text = (value: unknown) => JSON.stringify(value ?? null);
const object = (v: unknown): Row | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null;

/** Interfaces the actor acted with in the last `rounds` rounds (`experience.recent`). */
export function longRecentInterfaces(
  actor: V7Actor,
  tick: number,
  rounds: number,
): Set<string> {
  return new Set(
    (actor.experience?.recent ?? [])
      .filter((r) => r.tick >= tick - rounds)
      .map((r) => r.action),
  );
}

/** Interfaces this actor mastered in the current round (its `mastered` events): learning
 * that just completed is about to be used, so it counts as needed now. */
export function longJustMastered(world: V7World, actor: string): string[] {
  return world.events
    .filter((e) => e.actor === actor && e.type === 'mastered')
    .map((e) => e.data.ability)
    .filter((ability): ability is string => typeof ability === 'string');
}

/** Visible terrain as "y:x:cells" runs of consecutive cells in one row, or null when a
 * kind is not exactly one character (the tuple form is then kept). */
export function longTerrainRows(
  terrain: readonly (readonly [number, number, string])[],
): string[] | null {
  if (terrain.some(([, , kind]) => kind.length !== 1)) return null;
  const runs: { y: number; x: number; cells: string }[] = [];
  for (const [x, y, kind] of terrain) {
    const last = runs.at(-1);
    if (last && last.y === y && last.x + last.cells.length === x)
      last.cells += kind;
    else runs.push({ y, x, cells: kind });
  }
  return runs.map((r) => `${String(r.y)}:${String(r.x)}:${r.cells}`);
}
/** Exact inverse of `longTerrainRows`: the `[x, y, kind]` cells in their original order. */
export function longDecodeTerrainRows(
  rows: string[],
): [number, number, string][] {
  return rows.flatMap((row) => {
    const i = row.indexOf(':'),
      j = row.indexOf(':', i + 1);
    const y = Number(row.slice(0, i)),
      x = Number(row.slice(i + 1, j));
    // One UTF-16 code unit per cell, as `longTerrainRows` requires.
    const cells = row.slice(j + 1);
    return Array.from(
      { length: cells.length },
      (_, n): [number, number, string] => [x + n, y, cells.charAt(n)],
    );
  });
}

/** Complete records and catalogue entries present in this input's retrieval. Search indexes
 * of other sections are not records and are ignored; fragments are never sources. */
function retrievalSources(retrieval: unknown[]) {
  const full = new Map<string, unknown>(),
    catalogue = new Map<string, Row>();
  for (const raw of retrieval) {
    const result = object(raw),
      query = object(result?.query);
    if (!result || !query || !Array.isArray(result.records)) continue;
    const exact = Array.isArray(query.ids) && query.ids.length > 0;
    const listed = result.access === CATALOGUE_ACCESS;
    if (!exact && query.section !== 'abilities') continue;
    for (const row of result.records) {
      const r = object(row);
      if (!r || typeof r.id !== 'string' || !('value' in r)) continue;
      if (listed) {
        const entry = object(r.value);
        if (entry) catalogue.set(r.id, entry);
      } else full.set(`${String(query.section)}\u0000${r.id}`, r.value);
    }
  }
  return { full, catalogue };
}
/** True when a packet page row (whole value or one fragment) is contained in `value`. */
function rowContained(row: Row, value: unknown): boolean {
  const json = text(value);
  if ('value' in row) return text(row.value) === json;
  if (typeof row.fragment !== 'string' || typeof row.part !== 'number')
    return false;
  const width = Number(row.partWidth);
  return (
    !('error' in row) &&
    row.parts === Math.ceil(json.length / width) &&
    json.slice(row.part * width, (row.part + 1) * width) === row.fragment
  );
}
/** Compact ability fields (candidate or detail) that an available source fully covers.
 * `mastered` is personal and absent from the public record, so it stays unless a
 * catalogue entry states the same value. */
function abilityReference(
  entry: Row,
  record: Row | null,
  listed: Row | null,
): Row | null {
  const covered = (source: Row, key: string) => {
    const value = entry[key];
    if (key === 'function' && typeof value === 'string') {
      const whole = source.function;
      return typeof whole === 'string' && whole.startsWith(value);
    }
    return text(value) === text(source[key]);
  };
  const keys = Object.keys(entry).filter(
    (k) => k !== 'id' && entry[k] !== undefined,
  );
  if (listed && keys.every((k) => covered(listed, k)))
    return { id: entry.id, inRetrieval: true };
  if (
    record &&
    keys.filter((k) => k !== 'mastered').every((k) => covered(record, k))
  )
    return {
      id: entry.id,
      inRetrieval: true,
      ...('mastered' in entry ? { mastered: entry.mastered } : {}),
    };
  return null;
}
const PAGED_SECTIONS: readonly [string[], string][] = [
  [['observation', 'objects'], 'observed'],
  [['inventory'], 'inventory'],
  [['memory', 'recentMessages'], 'memory'],
  [['memory', 'projects'], 'projects'],
  [['memory', 'knowledge'], 'knowledge'],
  [['memory', 'records'], 'memory'],
];
function pageAt(packet: Row, path: string[]): Row | null {
  let value: unknown = packet;
  for (const key of path) value = object(value)?.[key];
  const page = object(value);
  return page && Array.isArray(page.records) ? page : null;
}
/** Every paged view in the packet, including those without a query section. */
function packetPages(packet: Row): Row[] {
  const observation = object(packet.observation),
    memory = object(packet.memory);
  return [
    ...['objects', 'signs', 'ground', 'events'].map((k) => observation?.[k]),
    packet.inventory,
    ...['recentMessages', 'projects', 'knowledge', 'records'].map(
      (k) => memory?.[k],
    ),
  ]
    .map(object)
    .filter((p): p is Row => !!p && Array.isArray(p.records));
}
/** Join contiguous fragments of one exact record into the earliest result of each run. */
function joinFragments(retrieval: unknown[]): {
  results: unknown[];
  joined: boolean;
} {
  const runs = new Map<string, { index: number; part: number; row: Row }[]>();
  retrieval.forEach((raw, index) => {
    const result = object(raw),
      query = object(result?.query),
      rows = Array.isArray(result?.records) ? result.records : [];
    const row = object(rows[0]);
    if (
      !query ||
      !Array.isArray(query.ids) ||
      query.ids.length !== 1 ||
      rows.length !== 1 ||
      !row ||
      typeof row.fragment !== 'string' ||
      typeof row.part !== 'number' ||
      'error' in row
    )
      return;
    const key = `${String(query.section)}\u0000${String(row.id)}\u0000${String(row.parts)}\u0000${String(row.partWidth)}`;
    runs.set(key, [...(runs.get(key) ?? []), { index, part: row.part, row }]);
  });
  const replace = new Map<number, unknown>(),
    drop = new Set<number>();
  for (const members of runs.values()) {
    const sorted = [...members].sort((a, b) => a.part - b.part);
    let run: typeof sorted = [];
    const flush = () => {
      const head = run[0];
      if (head && run.length > 1) {
        // The lowest part's result, at the position of the run's earliest result.
        const first = Math.min(...run.map((m) => m.index));
        replace.set(first, {
          ...object(retrieval[head.index]),
          records: [
            {
              ...head.row,
              fragment: run.map((m) => String(m.row.fragment)).join(''),
              joinedParts: run.map((m) => m.part),
            },
          ],
        });
        for (const m of run) if (m.index !== first) drop.add(m.index);
      }
      run = [];
    };
    for (const m of sorted) {
      const last = run.at(-1);
      if (last && m.part !== last.part + 1) flush();
      run.push(m);
    }
    flush();
  }
  return {
    results: retrieval
      .map((raw, index) => replace.get(index) ?? raw)
      .filter((_, index) => !drop.has(index)),
    joined: replace.size > 0,
  };
}

export type LongCompaction = keyof typeof COMPACTION_ACCESS;
const ORDER: readonly LongCompaction[] = [
  'paging',
  'inRetrieval',
  'joined',
  'settled',
  'terrain',
  'abilities',
];
const without = (row: Row, key: string) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => k !== key));

/** Apply the lossless compactions in place and append one access sentence per compaction
 * that applied. Abilities summaries are made by the builder; this only explains them.
 * `only` restricts the transforms for offline attribution (scripts); the run uses all. */
export function compactLongInput(
  input: { packet: Row; retrieval: unknown[] },
  recentAbilityRounds: number,
  only: ReadonlySet<LongCompaction> = new Set(ORDER),
): void {
  const packet = input.packet,
    applied = new Set<LongCompaction>();
  const mark = (kind: LongCompaction) => applied.add(kind);
  if (only.has('paging'))
    // Retained results: the reprojection note is already stated once in packet.access.
    input.retrieval = input.retrieval.map((raw) => {
      const result = object(raw);
      if (result?.projection !== PROJECTION_NOTE) return raw;
      mark('paging');
      return without(result, 'projection');
    });
  // Packet entries already present with at least the same content in this retrieval.
  const abilities = object(packet.abilities);
  if (only.has('inRetrieval')) {
    const { full, catalogue } = retrievalSources(input.retrieval);
    for (const [path, section] of PAGED_SECTIONS) {
      const page = pageAt(packet, path);
      if (!page) continue;
      page.records = (page.records as unknown[]).map((raw) => {
        const row = object(raw),
          key = `${section}\u0000${String(row?.id)}`;
        if (!row || !full.has(key) || !rowContained(row, full.get(key)))
          return raw;
        mark('inRetrieval');
        return { id: row.id, inRetrieval: true };
      });
    }
    for (const field of ['candidates', 'details']) {
      const list = abilities?.[field];
      if (!abilities || !Array.isArray(list)) continue;
      abilities[field] = (list as unknown[]).map((raw) => {
        const entry = object(raw);
        if (!entry || typeof entry.id !== 'string') return raw;
        const reference = abilityReference(
          entry,
          object(full.get(`abilities\u0000${entry.id}`)),
          catalogue.get(entry.id) ?? null,
        );
        if (!reference) return raw;
        mark('inRetrieval');
        return reference;
      });
    }
  }
  if (only.has('paging')) {
    // The per-record paging note is stated once in packet.access.
    const strip = (row: unknown) => {
      const r = object(row);
      if (r?.access !== PAGE_ACCESS) return row;
      mark('paging');
      return without(r, 'access');
    };
    for (const page of packetPages(packet))
      page.records = (page.records as unknown[]).map(strip);
    input.retrieval = input.retrieval.map((raw) => {
      const result = object(raw);
      return result && Array.isArray(result.records)
        ? { ...result, records: result.records.map(strip) }
        : raw;
    });
  }
  if (only.has('joined')) {
    const joined = joinFragments(input.retrieval);
    input.retrieval = joined.results;
    if (joined.joined) mark('joined');
  }
  // Settled work keeps its identity and outcome; active and paused work stay complete.
  const execution = object(packet.execution),
    active = object(execution?.activeState);
  if (only.has('settled') && execution && active)
    execution.activeState = Object.fromEntries(
      Object.entries(active).map(([key, value]) => {
        const work = object(value);
        if (
          !key.includes(':work:') ||
          !work ||
          !SETTLED.has(String(work.status))
        )
          return [key, value];
        mark('settled');
        const kept = SETTLED_FIELDS.filter((k) => k in work);
        return [
          key,
          {
            ...Object.fromEntries(kept.map((k) => [k, work[k]])),
            settled: true,
          },
        ];
      }),
    );
  const observation = object(packet.observation),
    terrain = observation?.terrain;
  if (only.has('terrain') && observation && Array.isArray(terrain)) {
    const rows = terrain.length
      ? longTerrainRows(terrain as [number, number, string][])
      : null;
    if (rows) {
      observation.terrain = rows;
      mark('terrain');
    }
  }
  if (
    only.has('abilities') &&
    Array.isArray(abilities?.baseline) &&
    abilities.baseline.some((raw) => !('parameters' in (object(raw) ?? {})))
  )
    mark('abilities');
  packet.access =
    String(packet.access) +
    ORDER.filter((k) => applied.has(k))
      .map((k) =>
        k === 'abilities'
          ? COMPACTION_ACCESS.abilities(recentAbilityRounds)
          : COMPACTION_ACCESS[k],
      )
      .join('');
}
