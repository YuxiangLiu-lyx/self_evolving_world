import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { V7Execution } from '../src/continuous-run.js';
import {
  dedupeWholeReads,
  longOrdinaryInput,
  longRetrieve,
  WHOLE_READ_REPEAT,
} from '../src/long-context.js';
import type { LongQuery } from '../src/long-context.js';

const PAUSE = 'experiment/ex13/technical-pauses/round-157/execution.json';
const ROW = 'opened-assessment:opened-assessment-157-lin-903';
const saved = () => JSON.parse(readFileSync(PAUSE, 'utf8')) as V7Execution;
interface Row {
  id: string;
  value?: unknown;
  complete?: string;
  fragment?: string;
  part?: number;
  parts?: number;
  partWidth?: number;
}
interface Page {
  records: Row[];
}
const exact = (section: LongQuery['section'], id: string, part = 0) => ({
  section,
  ids: [id],
  search: '',
  part,
  offset: 0,
});
const read = (world: V7Execution['world'], query: LongQuery) =>
  longRetrieve(world, 'lin', 'ordinary', [query])[0] as Page;
const withWidth = (s: V7Execution, width: number) => {
  const world = structuredClone(s.world);
  if (!world.config.longDevelopment) throw Error('Missing long policy');
  world.config.longDevelopment.exactRecordWidth = width;
  return world;
};

it('keeps ex13 exact reads and access text unchanged when the width is absent', () => {
  const s = saved();
  expect(s.world.config.longDevelopment?.exactRecordWidth).toBeUndefined();
  const retained = [{ query: exact('knowledge', ROW), records: [] }];
  expect(dedupeWholeReads(s.world, retained)).toBe(retained);
  const page = read(s.world, exact('knowledge', ROW));
  expect(page.records[0]?.partWidth).toBe(600);
  expect(page.records[0]?.part).toBe(0);
  const input = longOrdinaryInput(
    s.world,
    'lin',
    s.cursors.lin,
    s.longRetrieval?.lin,
  );
  expect(String(input.packet.access)).not.toContain('Exact-id queries return');
});

it('returns a whole multi-page record in one exact read when opted in', () => {
  const s = saved();
  const world = withWidth(s, 4000);
  const lin = world.actors.find((a) => a.id === 'lin');
  const record = lin?.memory.knowledge?.[ROW];
  expect(JSON.stringify(record).length).toBeGreaterThan(600);
  const page = read(world, exact('knowledge', ROW));
  expect(page.records[0]?.fragment).toBeUndefined();
  expect(page.records[0]?.value).toEqual(record);
  // Following a proactive fragment's continuation hint still yields the record.
  expect(read(world, exact('knowledge', ROW, 1)).records[0]?.value).toEqual(
    record,
  );
  // Repeated whole reads within one round are shown to the model only once.
  const shown = dedupeWholeReads(world, [
    {
      query: exact('knowledge', ROW, 0),
      records: [{ id: ROW, value: record }],
    },
    {
      query: exact('knowledge', ROW, 1),
      records: [{ id: ROW, value: record }],
    },
  ]) as Page[];
  expect(shown[0]?.records[0]?.value).toEqual(record);
  expect(shown[1]?.records[0]).toEqual({
    id: ROW,
    complete: WHOLE_READ_REPEAT,
  });
  const input = longOrdinaryInput(
    world,
    'lin',
    s.cursors.lin,
    s.longRetrieval?.lin,
  );
  const memory = input.packet.memory as { knowledge: Page };
  const proactive = memory.knowledge.records.find((r) => r.id === ROW);
  expect(proactive?.partWidth).toBe(600);
  expect(String(input.packet.access)).toContain(
    'complete record of up to 4000 code units',
  );
});

it('still pages exact reads larger than the configured width', () => {
  const s = saved();
  const page = read(withWidth(s, 601), exact('knowledge', ROW));
  expect(page.records[0]?.partWidth).toBe(600);
  expect(page.records[0]?.fragment?.length).toBe(600);
});
