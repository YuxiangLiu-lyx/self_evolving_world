import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { V7Execution } from '../src/continuous-run.js';
import { longOrdinaryInput, longRetrieve } from '../src/long-context.js';
import { continuousRequest } from '../src/continuous-provider.js';
import { longRequestMeasure } from '../src/long-tokens.js';
import { catalogueRetrievalView } from '../src/long-catalogue.js';
import { initialLongWorld } from '../src/long-scenario.js';
const saved = () =>
  JSON.parse(
    readFileSync(
      'experiment/ex13/technical-pauses/round-56/execution.json',
      'utf8',
    ),
  ) as V7Execution;
it('reproduces the real catalogue retrieval overflow and retains operations, physical queries and raw records under the unchanged guard', () => {
  const s = saved(),
    original = JSON.stringify(s),
    retrieval = s.longRetrieval?.moss;
  if (!retrieval) throw new Error('Missing retained retrieval');
  const input = longOrdinaryInput(s.world, 'moss', s.cursors.moss, retrieval);
  const before = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/context-56-before.json',
      'utf8',
    ),
  ) as typeof input;
  expect(
    longRequestMeasure(continuousRequest(s.model, 'ordinary', before), 3500)
      .inputEstimate,
  ).toBe(15352);
  expect(
    longRequestMeasure(continuousRequest(s.model, 'ordinary', input), 3500)
      .inputEstimate,
  ).toBeLessThan(14000);
  expect(input.packet.execution).toEqual(before.packet.execution);
  expect(input.packet.abilities).toEqual(before.packet.abilities);
  for (let i = 0; i < retrieval.results.length; i++) {
    const r = retrieval.results[i] as {
      query?: { section: string; ids: string[] };
    };
    if (r.query?.section !== 'abilities' || r.query.ids.length)
      expect(
        catalogueRetrievalView(s.world, 'moss', retrieval.results)[i],
      ).toEqual(r);
  }
  expect(JSON.stringify(s)).toBe(original);
});
it('separates compact catalogue discovery from complete exact-id detail and preserves permissions and pagination', () => {
  const s = saved(),
    query = {
      section: 'abilities' as const,
      ids: [] as string[],
      search: '',
      offset: 14,
      part: 0,
    };
  const catalogue = longRetrieve(s.world, 'moss', 'ordinary', [query])[0] as {
    records: { id: string; value: unknown }[];
    next: number;
    access: string;
  };
  expect(catalogue.records).toHaveLength(3);
  expect(catalogue.next).toBe(17);
  expect(catalogue.access).toContain('exact ids');
  expect(JSON.stringify(catalogue)).not.toContain('additionalProperties');
  const id = catalogue.records[0]?.id;
  if (!id) throw new Error('Missing discovered identity');
  let detail = '',
    total = 1;
  for (let part = 0; part < total; part++) {
    const r = longRetrieve(s.world, 'moss', 'ordinary', [
      { ...query, ids: [id], offset: 0, part },
    ])[0] as {
      records: { fragment?: string; parts?: number; value?: unknown }[];
    };
    const row = r.records[0];
    if (!row) throw new Error('Missing exact detail');
    total = row.parts ?? 1;
    detail += row.fragment ?? JSON.stringify(row.value);
  }
  expect(JSON.parse(detail) as unknown).toMatchObject({
    id,
    parameters: { additionalProperties: false },
  });
  const fresh = initialLongWorld('independent-run');
  expect(
    longRetrieve(fresh, 'moss', 'ordinary', [
      { ...query, ids: [id], offset: 0 },
    ])[0],
  ).toMatchObject({ total: 0 });
  expect(
    catalogueRetrievalView(s.world, 'moss', [
      { validationError: 'retained failure' },
    ]),
  ).toEqual([{ validationError: 'retained failure' }]);
});
