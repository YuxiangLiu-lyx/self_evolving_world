import { collectiveDecisions } from '../src/collective-controller.js';
import { v7Clone } from '@self-evolving-world/world-core';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { continuousInputText } from '../src/forest-input-encoding.js';
import { ordinaryContinuousInput } from '../src/continuous-input.js';
import { continuousRequest } from '../src/continuous-provider.js';
import type { V7Execution } from '../src/continuous-run.js';
function decode(text: string): unknown {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !('encoding' in raw)) return raw;
  if (raw.encoding === 'lossless-shared-values-v8') {
    const expand = (v: unknown): unknown => {
      if (typeof v === 'string' && /^&\d+$/u.test(v))
        return { $s: Number(v.slice(1)) };
      if (Array.isArray(v)) {
        if (typeof v[0] === 'string' && /^@\d+$/u.test(v[0]))
          return { $r: [Number(v[0].slice(1)), v.slice(1).map(expand)] };
        if (v[0] === '+') return { $j: v.slice(1).map(expand) };
        if (v[0] === '=') return { $json: expand(v[1]) };
        if (v[0] === '%') return { $t: [v[1], expand(v[2])] };
        return v.map(expand);
      }
      if (v && typeof v === 'object')
        return Object.fromEntries(
          Object.entries(v).map(([k, cell]) => [k, expand(cell)]),
        );
      return v;
    };
    return decode(
      JSON.stringify({
        ...raw,
        encoding: 'lossless-shared-values-v7',
        shared: expand('shared' in raw ? raw.shared : []),
        payload: expand('payload' in raw ? raw.payload : null),
      }),
    );
  }
  const value = raw as {
    encoding: string;
    keys?: string[];
    shared: unknown[];
    recordColumns?: string[][];
    payload: unknown;
  };
  const restoreKey = (key: string | number): string =>
    typeof key === 'number'
      ? (value.keys?.[key] ?? String(key))
      : ['lossless-shared-values-v6', 'lossless-shared-values-v7'].includes(
            value.encoding,
          ) && key.startsWith('#')
        ? (value.keys?.[Number.parseInt(key.slice(1), 36)] ?? key)
        : key;
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      if (
        [
          'lossless-shared-values-v5',
          'lossless-shared-values-v6',
          'lossless-shared-values-v7',
        ].includes(value.encoding) &&
        Object.keys(v).length === 1
      ) {
        if ('$json' in v) return JSON.stringify(visit(v.$json));
        if ('$join' in v)
          return (v.$join as unknown[]).map((part) => visit(part)).join('');
        if ('$s' in v) return visit(value.shared[Number(v.$s)]);
        if ('$j' in v)
          return (v.$j as unknown[])
            .map((part) => {
              const expanded = visit(part);
              if (typeof expanded !== 'string')
                throw new Error('Invalid fragment');
              return expanded;
            })
            .join('');
        if ('$r' in v) {
          const [index, cells] = v.$r as [number, unknown[]];
          return Object.fromEntries(
            (value.recordColumns?.[index] ?? []).map((key, i) => [
              restoreKey(key),
              visit(cells[i]),
            ]),
          );
        }
        if ('$t' in v) {
          const [columns, rows] = v.$t as [string[], unknown[][]];
          return rows.map((row) =>
            Object.fromEntries(
              columns.map((key, i) => [restoreKey(key), visit(row[i])]),
            ),
          );
        }
      }
      if (
        ['lossless-shared-values-v4', 'lossless-shared-values-v5'].includes(
          value.encoding,
        ) &&
        Object.keys(v).length === 1 &&
        '$join' in v
      )
        return (v.$join as unknown[])
          .map((part) => {
            const expanded = visit(part);
            if (typeof expanded !== 'string')
              throw new Error('Invalid text fragment');
            return expanded;
          })
          .join('');
      if (Object.keys(v).length === 1 && '$shared' in v)
        return visit(value.shared[Number(v.$shared)]);
      if (Object.keys(v).length === 1 && '$record' in v) {
        const [index, cells] = v.$record as [number, unknown[]];
        return Object.fromEntries(
          (value.recordColumns?.[index] ?? []).map((key, i) => [
            key,
            visit(cells[i]),
          ]),
        );
      }
      if (Object.keys(v).length === 1 && '$table' in v) {
        const t = v.$table as { columns: string[]; rows: unknown[][] };
        return t.rows.map((row) =>
          Object.fromEntries(
            t.columns.map((key, index) => [key, visit(row[index])]),
          ),
        );
      }
      return Object.fromEntries(
        Object.entries(v).map(([k, v]) => [restoreKey(k), visit(v)]),
      );
    }
    return v;
  };
  return visit(value.payload);
}
it('losslessly transmits every actual round-451 observation fact under the unchanged context limit', () => {
  const s = JSON.parse(
    readFileSync(
      'experiment/ex9/technical-pauses/round-451/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  for (const a of s.world.actors) {
    const input = ordinaryContinuousInput(s.world, a.id, s.cursors[a.id], 496);
    const text = continuousInputText(input);
    expect(decode(text)).toEqual(JSON.parse(JSON.stringify(input)));
    expect(text.length * 2).toBeLessThan(s.world.config.computation.inputBytes);
    expect(continuousInputText(input)).toBe(text);
    const body = continuousRequest('gpt-6.1-sol', 'ordinary', input);
    expect(body.input[0]?.content).toBe(text);
  }
});

it('losslessly transmits all actual round-689 facts with explicit shared record columns and rejects marker collisions', () => {
  const s = JSON.parse(
    readFileSync(
      'experiment/ex9/technical-pauses/round-689/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  for (const a of s.world.actors) {
    const input = ordinaryContinuousInput(s.world, a.id, s.cursors[a.id], 400);
    const text = continuousInputText(input);
    expect(text).toContain('$record');
    expect(decode(text)).toEqual(JSON.parse(JSON.stringify(input)));
    expect(text.length * 2).toBeLessThan(s.world.config.computation.inputBytes);
    expect(
      continuousRequest('gpt-6.1-sol', 'ordinary', input).input[0]?.content,
    ).toBe(text);
    expect(continuousInputText(input)).toBe(text);
    const collision = {
      ...input,
      literal: { $record: [0, ['actual user data']] },
    };
    expect(continuousInputText(collision)).toBe(JSON.stringify(collision));
  }
});
it('keeps legacy/small observations unchanged and preserves Unicode and marker-shaped data', () => {
  const small = {
    experience: { notes: '\u4f60\u597d' },
    items: [1, null, true],
  };
  expect(continuousInputText(small)).toBe(JSON.stringify(small));
  const repeated = 'Actual observed material and provenance. '.repeat(200);
  const big = {
    experience: { notes: '\u4f60\u597d' },
    items: Array.from({ length: 20 }, () => ({ name: repeated, quantity: 2 })),
  };
  expect(continuousInputText(big).length).toBeLessThan(
    JSON.stringify(big).length / 2,
  );
  expect(decode(continuousInputText(big))).toEqual(big);
  expect(continuousInputText({ items: big.items })).toBe(
    JSON.stringify({ items: big.items }),
  );
  const collision = { ...big, special: { $shared: 2 } };
  expect(continuousInputText(collision)).toBe(JSON.stringify(collision));
  const worldInput = {
    physicalRules: { experience: { version: 1 } },
    applicants: big.items,
  };
  expect(decode(continuousInputText(worldInput))).toEqual(worldInput);
});

it('losslessly transmits the larger actual round-478 inputs using named-column tables without weakening the limit', () => {
  const s = JSON.parse(
    readFileSync(
      'experiment/ex9/technical-pauses/round-478/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  for (const a of s.world.actors) {
    const input = ordinaryContinuousInput(s.world, a.id, s.cursors[a.id], 484);
    const text = continuousInputText(input);
    expect(text).toContain('$table');
    expect(decode(text)).toEqual(JSON.parse(JSON.stringify(input)));
    expect(text.length * 2).toBeLessThan(s.world.config.computation.inputBytes);
    expect(
      continuousRequest('gpt-6.1-sol', 'ordinary', input).input[0]?.content,
    ).toBe(text);
  }
  const collision = {
    experience: true,
    items: Array.from({ length: 200 }, (_, i) => ({
      name: 'Observed distinct record ' + String(i),
      detail: 'x'.repeat(400),
    })),
    literal: { $table: 'original data' },
  };
  expect(continuousInputText(collision)).toBe(JSON.stringify(collision));
});

it('retains every actual round-974 fact while sharing profitable short structures and inlining single-use definitions', () => {
  const s = JSON.parse(
    readFileSync(
      'experiment/ex9/technical-pauses/round-974/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  for (const a of s.world.actors) {
    const input = ordinaryContinuousInput(s.world, a.id, s.cursors[a.id], 300);
    const text = continuousInputText(input);
    expect(decode(text)).toEqual(JSON.parse(JSON.stringify(input)));
    expect(text.length * 2).toBeLessThan(s.world.config.computation.inputBytes);
    expect(
      continuousRequest('gpt-6.1-sol', 'ordinary', input).input[0]?.content,
    ).toBe(text);
    expect(continuousInputText(input)).toBe(text);
  }
  const child = {
    detail: 'A real nested observation '.repeat(80),
    short: { type: 'string', maxLength: 1000 },
  };
  const parent = { child, condition: 'Actual condition '.repeat(30) };
  const nested = {
    experience: true,
    values: Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: parent,
      right: parent,
      parameters: { type: 'string', maxLength: 1000 },
    })),
  };
  const encoded = continuousInputText(nested);
  expect(decode(encoded)).toEqual(nested);
  expect(encoded.length).toBeLessThan(JSON.stringify(nested).length / 4);
  const wire = JSON.parse(encoded) as { shared: unknown[]; payload: unknown };
  const counts = new Map<number, number>();
  const count = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(count);
    else if (v && typeof v === 'object') {
      if (Object.keys(v).length === 1 && '$shared' in v) {
        const n = Number(v.$shared);
        counts.set(n, (counts.get(n) ?? 0) + 1);
      } else Object.values(v).forEach(count);
    }
  };
  count(wire.payload);
  wire.shared.forEach(count);
  expect(wire.shared.every((_, i) => (counts.get(i) ?? 0) > 1)).toBe(true);
});

it('retains every actual ex10 round-114 fact while sharing repeated text prefixes without increasing the context cap', () => {
  const s = JSON.parse(
    readFileSync(
      'experiment/ex10/technical-pauses/round-114/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  const attemptsBefore = JSON.stringify(s.attempts),
    worldBefore = JSON.stringify(s.world);
  for (const a of s.world.actors) {
    const input = ordinaryContinuousInput(
        s.world,
        a.id,
        s.cursors[a.id],
        s.world.config.budgets.ordinary -
          s.attempts.filter((x) => x.role === 'ordinary').length,
      ),
      wire = continuousInputText(input);
    expect(decode(wire)).toEqual(JSON.parse(JSON.stringify(input)));
    expect(wire.length * 2).toBeLessThan(s.world.config.computation.inputBytes);
    expect(
      continuousRequest(s.model, 'ordinary', input).input[0]?.content,
    ).toBe(wire);
    expect(continuousInputText(input)).toBe(wire);
    if (a.id === 'moss') {
      expect(wire).toMatch(/lossless-shared-values-v[5-8]/);
      expect(wire.includes('$j') || wire.includes('["+"')).toBe(true);
      expect(wire.length).toBeLessThan(60198);
    }
  }
  expect(JSON.stringify(s.attempts)).toBe(attemptsBefore);
  expect(JSON.stringify(s.world)).toBe(worldBefore);
});
it('preserves Unicode, whitespace, literal markers and distinct identifiers through repeated text fragments', () => {
  const prefix =
      'Observed material response; physical requirements and original identity remain exact. ',
    detail = prefix + 'Additional evidence is uncertain. ',
    input = {
      experience: {},
      development: { scope: 'isolated' },
      records: Array.from({ length: 500 }, (_, i) => ({
        id: `actual-${String(i)}`,
        summary: prefix,
        detail: detail + '\u4f60\u597d \u{1fab5}\n\t' + String(i),
        literalText: 'Encoding markers are not item IDs.',
      })),
    };
  const wire = continuousInputText(input);
  expect(decode(wire)).toEqual(input);
  expect(wire.length).toBeLessThan(JSON.stringify(input).length);
  const literal = { ...input, literal: { $join: ['real', 'user', 'data'] } };
  expect(continuousInputText(literal)).toBe(JSON.stringify(literal));
});

it('keeps fragment arrays as strings instead of reinterpreting their encoding records as data tables', () => {
  const prefix = 'Known requirement and unchanged input fact. '.repeat(3),
    input = {
      experience: {},
      development: { scope: 'isolated' },
      prefix,
      observations: Array.from(
        { length: 400 },
        (_, i) => prefix + 'Distinct observation ' + String(i),
      ),
    };
  const wire = continuousInputText(input);
  expect(decode(wire)).toEqual(input);
  expect(wire.length).toBeLessThan(JSON.stringify(input).length);
});

it('preserves the complete actual round-123 observations under the original cap using shorter transport markers only', () => {
  const saved = JSON.parse(
    readFileSync(
      'experiment/ex10/technical-pauses/round-123/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  const original = JSON.stringify(saved);
  for (const a of saved.world.actors) {
    const input = ordinaryContinuousInput(
      saved.world,
      a.id,
      saved.cursors[a.id],
      saved.world.config.budgets.ordinary -
        saved.attempts.filter((x) => x.role === 'ordinary').length,
    );
    const wire = continuousInputText(input);
    expect(decode(wire)).toEqual(JSON.parse(JSON.stringify(input)));
    expect(wire.length * 2).toBeLessThan(
      saved.world.config.computation.inputBytes,
    );
    expect(
      continuousRequest(saved.model, 'ordinary', input).input[0]?.content,
    ).toBe(wire);
    if (a.id === 'moss') expect(wire.length).toBeLessThan(58000);
    for (const key of ['$s', '$r', '$t', '$j']) {
      const collision = {
        ...input,
        literal: { [key]: ['actual', '\u4f60\u597d', 'item:untouched'] },
      };
      expect(continuousInputText(collision)).toBe(JSON.stringify(collision));
    }
  }
  expect(JSON.stringify(saved)).toBe(original);
});

it('restores every retained round-149 field and literal through the key dictionary, without mutating policy or calls', () => {
  const saved = JSON.parse(
    readFileSync(
      'experiment/ex10/technical-pauses/round-149/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  const before = JSON.stringify(saved);
  for (const actor of saved.world.actors) {
    const input = ordinaryContinuousInput(
      saved.world,
      actor.id,
      saved.cursors[actor.id],
      saved.world.config.budgets.ordinary -
        saved.attempts.filter((a) => a.role === 'ordinary').length,
    );
    const wire = continuousInputText(input);
    expect(decode(wire)).toEqual(JSON.parse(JSON.stringify(input)));
    expect(wire.length * 2).toBeLessThan(
      saved.world.config.computation.inputBytes,
    );
    expect(
      continuousRequest(saved.model, 'ordinary', input).input[0]?.content,
    ).toBe(wire);
    expect(continuousInputText(input)).toBe(wire);
    const literal = {
      ...input,
      literal: { '#0': 'Original literal key, not a transport reference.' },
    };
    expect(decode(continuousInputText(literal))).toEqual(
      JSON.parse(JSON.stringify(literal)),
    );
  }
  expect(JSON.stringify(saved)).toBe(before);
});

it('preserves every round-166 input fact when adding the pending interface and shares embedded JSON without semantic truncation', async () => {
  const { continuousRegistry } =
    await import('@self-evolving-world/world-core');
  const { initialOpenWorld } = await import('../src/open-scenario.js');
  const saved = JSON.parse(
    readFileSync('experiment/ex10/calls/ordinary-116.json', 'utf8'),
  ) as { input: ReturnType<typeof ordinaryContinuousInput> };
  const added = continuousRegistry(initialOpenWorld()).packages.find(
    (p) => p.id === 'short-material-refuge',
  )?.abilities[0];
  if (!added) throw new Error('Missing reviewed interface.');
  const input = JSON.parse(JSON.stringify(saved.input)) as typeof saved.input;
  input.catalogue.interfaces.push(added);
  const wire = continuousInputText(input);
  expect(decode(wire)).toEqual(JSON.parse(JSON.stringify(input)));
  expect(wire.length * 2).toBeLessThan(120000);
  expect(
    continuousRequest('gpt-6.1-sol', 'ordinary', input).input[0]?.content,
  ).toBe(wire);
});
it('preserves embedded Unicode, escaped strings, numeric keys, noncanonical JSON and reserved literal markers', () => {
  const facts = {
      name: 'Exact \\ and "quoted" \u4f60\u597d',
      values: [1, 2, 3],
      details: { origin: 'actual-source', quantity: 1.25, uncertain: true },
    },
    input = {
      experience: {},
      development: { scope: 'codec-fixture' },
      records: Array.from({ length: 700 }, (_, i) => ({
        id: i,
        facts,
        description: `Measured ${String(i)}: ${JSON.stringify({ ...facts, sequence: i })} retained.`,
        noncanonical:
          'Literal { "0": 1, "value": 1.00 } and unmatched [ bracket.',
      })),
    };
  const wire = continuousInputText(input);
  expect(decode(wire)).toEqual(input);
  expect(wire.length).toBeLessThan(JSON.stringify(input).length);
  const literal = {
    ...input,
    actual: { $json: { not: 'a transport marker' } },
  };
  expect(continuousInputText(literal)).toBe(JSON.stringify(literal));
});

it('recovers the real round-200 pre-inference pause without dropping facts or changing the original context cap', () => {
  const saved = JSON.parse(
    readFileSync(
      'experiment/ex10/technical-pauses/round-200/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  const before = JSON.stringify(saved);
  for (const actor of saved.world.actors) {
    const input = ordinaryContinuousInput(
      saved.world,
      actor.id,
      saved.cursors[actor.id],
      saved.world.config.budgets.ordinary -
        saved.attempts.filter((a) => a.role === 'ordinary').length,
    );
    const wire = continuousInputText(input);
    expect(JSON.stringify(decode(wire))).toBe(JSON.stringify(input));
    expect(wire.length * 2).toBeLessThan(
      saved.world.config.computation.inputBytes,
    );
    expect(
      continuousRequest(saved.model, 'ordinary', input).input[0]?.content,
    ).toBe(wire);
    expect(continuousInputText(input)).toBe(wire);
  }
  expect(JSON.stringify(saved)).toBe(before);
});

it('shares only profitable literal clauses while preserving overlap, original table columns and Unicode', async () => {
  const { openPhraseWire } = await import('../src/open-input-phrases.js');
  const clause =
    'Actual material evidence with \\ and "quoted" \\u4f60\\u597d remains uncertain; ';
  const original = {
    rows: Array.from({ length: 20 }, (_, i) => ({
      id: i,
      detail: `${String(i)} ${clause}${clause} retained exactly.`,
      original: '',
    })),
  };
  const wire = JSON.stringify({
    encoding: 'lossless-shared-values-v7',
    meaning: 'Fixture of the documented v7 transport.',
    recordColumns: [],
    shared: [],
    payload: {
      rows: {
        $t: [
          ['id', 'detail', 'original'],
          original.rows.map((r) => [r.id, r.detail, r.original]),
        ],
      },
    },
  });
  const compact = openPhraseWire(wire);
  expect(compact.length).toBeLessThan(wire.length);
  expect(JSON.stringify(decode(compact))).toBe(JSON.stringify(original));
  expect(openPhraseWire(wire)).toBe(compact);
  expect(openPhraseWire(JSON.stringify(original))).toBe(
    JSON.stringify(original),
  );
});

it('preserves every actual round-210 field with shorter JSON references and substantial measured headroom', () => {
  const s = JSON.parse(
    readFileSync(
      'experiment/ex10/technical-pauses/round-210/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  const before = JSON.stringify(s);
  for (const a of s.world.actors) {
    const input = ordinaryContinuousInput(
        s.world,
        a.id,
        s.cursors[a.id],
        s.world.config.budgets.ordinary -
          s.attempts.filter((a) => a.role === 'ordinary').length,
      ),
      wire = continuousInputText(input);
    expect(JSON.stringify(decode(wire))).toBe(JSON.stringify(input));
    expect(wire.length * 2).toBeLessThan(s.world.config.computation.inputBytes);
    expect(
      continuousRequest(s.model, 'ordinary', input).input[0]?.content,
    ).toBe(wire);
    expect(continuousInputText(input)).toBe(wire);
  }
  expect(JSON.stringify(s)).toBe(before);
});
it('never reinterprets literal short-reference strings or tuple-shaped user arrays', async () => {
  const { openTupleWire } = await import('../src/open-input-tuples.js');
  for (const literal of [
    '&0',
    ['@0', 'actual data'],
    ['+', 'actual data'],
    ['=', 'actual data'],
    ['%', [], []],
  ]) {
    const wire = JSON.stringify({
      encoding: 'lossless-shared-values-v7',
      recordColumns: [],
      shared: [],
      payload: { literal },
    });
    expect(openTupleWire(wire)).toBe(wire);
  }
});

it('uses the existing lossless codec for the actual ex11 collective packet without dropping facts or increasing its guard', () => {
  const state = JSON.parse(
    readFileSync(
      'experiment/ex11/technical-pauses/round-7/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  const decisions = collectiveDecisions(v7Clone(state));
  expect(decisions).toHaveLength(1);
  for (const d of decisions) {
    const encoded = continuousInputText(d.input);
    expect(JSON.stringify(d.input).length).toBeGreaterThan(56000);
    expect(encoded.length).toBeLessThan(56000);
    expect(decode(encoded)).toEqual(JSON.parse(JSON.stringify(d.input)));
  }
  expect(state.world.config.collective?.contextCharacters).toBe(56000);
});
