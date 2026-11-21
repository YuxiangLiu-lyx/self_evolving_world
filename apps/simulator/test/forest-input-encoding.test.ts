import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { continuousInputText } from '../src/forest-input-encoding.js';
import { ordinaryContinuousInput } from '../src/continuous-input.js';
import { continuousRequest } from '../src/continuous-provider.js';
import type { V7Execution } from '../src/continuous-run.js';
function decode(text: string): unknown {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !('encoding' in raw)) return raw;
  const value = raw as {
    encoding: string;
    shared: unknown[];
    recordColumns?: string[][];
    payload: unknown;
  };
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
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
        Object.entries(v).map(([k, v]) => [k, visit(v)]),
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
