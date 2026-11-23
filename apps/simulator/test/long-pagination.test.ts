import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { V7Execution } from '../src/continuous-run.js';
import { longOrdinaryInput, longRetrieve } from '../src/long-context.js';
import type { LongQuery, LongInput } from '../src/long-context.js';
import { continuousRequest } from '../src/continuous-provider.js';
import { longRequestMeasure } from '../src/long-tokens.js';
import { initialLongWorld } from '../src/long-scenario.js';
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as unknown;
const saved = () =>
  read(
    'experiment/ex13/technical-pauses/round-157/execution.json',
  ) as V7Execution;
interface Row {
  id: string;
  value?: unknown;
  fragment?: string;
  part?: number;
  parts?: number;
  partWidth?: number;
  error?: string;
}
interface Page {
  records: Row[];
  total: number;
  offset: number;
  next: number | null;
  access?: string;
}
const query = (
  section: LongQuery['section'],
  ids: string[],
  part = 0,
  offset = 0,
): LongQuery => ({ section, ids, search: '', part, offset });
it('reproduces the actual guard, corrects stable complete pages without mutating raw queries, and retains exact current work and inventory', () => {
  const s = saved(),
    raw = JSON.stringify(s),
    before = read(
      'docs/exec-plans/evidence/pr-31-long-open-development/context-157-before.json',
    ) as { input: LongInput; measure: { inputEstimate: number } };
  expect(before.measure.inputEstimate).toBe(14489);
  expect(
    longRequestMeasure(
      continuousRequest(s.model, 'ordinary', before.input),
      3500,
    ).inputEstimate,
  ).toBe(14489);
  const input = longOrdinaryInput(
      s.world,
      'lin',
      s.cursors.lin,
      s.longRetrieval?.lin,
    ),
    m = longRequestMeasure(continuousRequest(s.model, 'ordinary', input), 3500);
  expect(m.inputEstimate).toBeLessThan(14000);
  expect(input.packet.execution).toEqual(before.input.packet.execution);
  expect(input.packet.inventory).toEqual(before.input.packet.inventory);
  expect(input.packet.state).toEqual(before.input.packet.state);
  expect(input.packet.abilities).toEqual(before.input.packet.abilities);
  const memory = input.packet.memory as { knowledge: Page },
    row = memory.knowledge.records.find(
      (r) => r.id === 'opened-assessment:opened-assessment-157-lin-903',
    );
  if (!row) throw Error('Missing proactive current evidence');
  let body = row.fragment ?? JSON.stringify(row.value);
  expect(row.partWidth).toBe(600);
  for (let part = 1; part < (row.parts ?? 1); part++) {
    const page = longRetrieve(s.world, 'lin', 'ordinary', [
      query('knowledge', [row.id], part),
    ])[0] as Page;
    expect(page.records[0]?.partWidth).toBe(600);
    body += page.records[0]?.fragment ?? '';
  }
  const actor = s.world.actors.find((a) => a.id === 'lin');
  expect(JSON.parse(body) as unknown).toEqual(
    actor?.memory.knowledge?.[row.id],
  );
  const projected = input.retrieval as (Page & { query: LongQuery })[];
  const part3 = projected.find(
    (r) => r.query.section === 'knowledge' && r.query.part === 3,
  );
  expect(part3?.records[0]?.fragment?.length).toBe(600);
  const original = s.longRetrieval?.lin?.results as (Page & {
    query: LongQuery;
  })[];
  expect(original.find((r) => r.query.part === 3)?.records[0]?.fragment).toBe(
    '',
  );
  expect(JSON.stringify(s)).toBe(raw);
});
it('uses the identical canonical visible-object representation in proactive and queried pages, with explicit indexes and bounded exact pages', () => {
  const s = saved(),
    input = longOrdinaryInput(s.world, 'lin', s.cursors.lin),
    o = input.packet.observation as { objects: Page };
  for (const row of o.objects.records) {
    const retrieved = longRetrieve(s.world, 'lin', 'ordinary', [
      query('observed', [row.id]),
    ])[0] as Page;
    expect(retrieved.records[0]).toEqual(row);
  }
  const q = query('knowledge', []);
  q.search = 'food';
  const index = longRetrieve(s.world, 'lin', 'ordinary', [q])[0] as Page;
  expect(index.access).toContain('index');
  expect(index.records.every((r) => !r.fragment)).toBe(true);
  expect(JSON.stringify(index)).not.toContain('pale compact surface');
  const ids = index.records.map((r) => r.id);
  const details = longRetrieve(s.world, 'lin', 'ordinary', [
    query('knowledge', ids),
  ])[0] as Page;
  expect(details.records).toHaveLength(1);
  if (ids.length > 1) expect(details.next).toBe(1);
  const beyond = longRetrieve(s.world, 'lin', 'ordinary', [
    query('knowledge', ids, 100),
  ])[0] as Page;
  expect(beyond.records[0]?.error).toContain('out of range');
});
it('retains scope and privacy at large catalogue size and never turns a control query into an observation or world mutation', () => {
  const s = saved(),
    raw = JSON.stringify(s.world);
  const id = 'opened-assessment:opened-assessment-157-lin-903';
  expect(
    longRetrieve(s.world, 'moss', 'ordinary', [query('knowledge', [id])])[0],
  ).toMatchObject({ total: 0 });
  expect(
    longRetrieve(s.world, 'world', 'world', [query('knowledge', [id])])[0],
  ).toHaveProperty('error');
  expect(
    longRetrieve(initialLongWorld('other'), 'lin', 'ordinary', [
      query('abilities', ['opened-hazelnut-preparation-assessment']),
    ])[0],
  ).toMatchObject({ total: 0 });
  const a = s.world.actors.find((a) => a.id === 'lin');
  if (!a) throw Error('Missing actor');
  a.memory.knowledge ??= {};
  const originalKnowledge = { ...a.memory.knowledge };
  const old = a.memory.knowledge[id];
  if (!old) throw Error('Missing actual record');
  for (let i = 0; i < 5000; i++) {
    const key = 'offline-only-' + String(i);
    a.memory.knowledge[key] = {
      ...old,
      key,
      value: { large: 'x'.repeat(1000) },
    };
  }
  const input = longOrdinaryInput(
    s.world,
    'lin',
    s.cursors.lin,
    s.longRetrieval?.lin,
  );
  expect(
    longRequestMeasure(continuousRequest(s.model, 'ordinary', input), 3500)
      .inputEstimate,
  ).toBeLessThan(14000);
  a.memory.knowledge = originalKnowledge;
  expect(JSON.stringify(s.world)).toBe(raw);
});
