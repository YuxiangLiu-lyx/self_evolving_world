import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { v7Clone, v7Observe } from '@self-evolving-world/world-core';
import type { V7Cursor, V7World } from '@self-evolving-world/world-core';
import type { V7Execution } from '../src/continuous-run.js';
import {
  COMPACTION_ACCESS,
  compactLongInput,
  longDecodeTerrainRows,
  longTerrainRows,
} from '../src/long-compaction.js';
import type { LongInput, LongQuery } from '../src/long-context.js';
import { longOrdinaryInput, longRetrieve } from '../src/long-context.js';
import { longVisibleAbilities } from '../src/long-capability-view.js';
import {
  CULTURE_EXCLUDED_WORDS,
  LONG_CULTURE_V2,
} from '../src/long-culture.js';
import { COMPACTION_REPLACEMENTS, longRequest } from '../src/long-request.js';
import { initialLongWorld } from '../src/long-scenario.js';
import { longRequestMeasure } from '../src/long-tokens.js';

// Whole-input builds over the ex15 round-70 state run slower on CI than locally.
vi.setConfig({ testTimeout: 30_000 });

const PAUSE = 'experiment/ex15/technical-pauses/round-70/execution.json';
const saved = () => JSON.parse(readFileSync(PAUSE, 'utf8')) as V7Execution;
type Row = Record<string, unknown>;
const rows = (page: unknown) => (page as { records: Row[] }).records;
/** The ex15 round-70 world switched to the culture v2 context settings. */
function v2(world: V7World, compaction = true): V7World {
  const copy = v7Clone(world),
    policy = copy.config.longDevelopment;
  if (!policy?.culture) throw new Error('Missing culture policy');
  policy.exactRecordWidth = LONG_CULTURE_V2.exactRecordWidth;
  policy.culture = { ...policy.culture, goal: 'open' };
  if (compaction)
    policy.compaction = {
      version: 1,
      recentAbilityRounds: LONG_CULTURE_V2.recentAbilityRounds,
    };
  return copy;
}
const exact = (
  section: LongQuery['section'],
  id: string,
  part = 0,
): LongQuery => ({ section, search: '', ids: [id], offset: 0, part });
const read = (world: V7World, actor: string, query: LongQuery) =>
  rows(longRetrieve(world, actor, 'ordinary', [query])[0]);
const build = (s: V7Execution, world: V7World, actor: string) =>
  longOrdinaryInput(world, actor, s.cursors[actor], s.longRetrieval?.[actor]);
const estimate = (input: LongInput) =>
  longRequestMeasure(longRequest('model', input), 3500).inputEstimate;

describe('culture v2 genesis', () => {
  const world = initialLongWorld('long-ex16', 'long-culture-v2');
  it('opts in to compaction with the frozen recent window', () => {
    expect(world.config.longDevelopment?.compaction).toEqual({
      version: 1,
      recentAbilityRounds: 25,
    });
  });
  it('summarizes unused interfaces, keeps them readable and explains it', () => {
    for (const actor of world.actors) {
      const input = longOrdinaryInput(world, actor.id);
      expect(input.longContext.compaction).toBe(true);
      const baseline = (input.packet.abilities as { baseline: Row[] }).baseline;
      // Nothing has been used or planned yet, so every authored interface is a summary.
      expect(baseline.every((e) => !('parameters' in e))).toBe(true);
      for (const entry of baseline) {
        const full = read(
          world,
          actor.id,
          exact('abilities', String(entry.id)),
        );
        expect(full[0]?.value).toEqual(
          longVisibleAbilities(world, actor.id).find((a) => a.id === entry.id),
        );
        expect(entry.function).toBe((full[0]?.value as Row).function);
      }
      expect(String(input.packet.access)).toContain(
        COMPACTION_ACCESS.abilities(25),
      );
      expect(
        longDecodeTerrainRows(
          (input.packet.observation as { terrain: string[] }).terrain,
        ),
      ).toEqual(
        v7Observe(world, actor.id).terrain.map((p) => [p.x, p.y, p.kind]),
      );
      expect(longRequest('model', input).instructions).toContain(
        COMPACTION_REPLACEMENTS[0]?.[1],
      );
    }
  });
});

describe('culture v2 compaction on the ex15 round-70 state', () => {
  const s = saved(),
    world = v2(s.world),
    plain = v2(s.world, false);

  it('keeps the archived configuration uncompacted', () => {
    const input = build(s, s.world, 'ivo');
    expect(input.longContext.compaction).toBeUndefined();
    expect(
      (input.packet.observation as { terrain: unknown[][] }).terrain[0],
    ).toHaveLength(3);
    expect(JSON.stringify(input)).not.toContain('"settled"');
    expect(JSON.stringify(input)).not.toContain('"inRetrieval"');
  });

  it('lowers every estimate below the uncompacted v2 and ex15 inputs', () => {
    for (const actor of s.world.actors.map((a) => a.id)) {
      const compacted = estimate(build(s, world, actor));
      expect(compacted).toBeLessThan(estimate(build(s, plain, actor)));
      expect(compacted).toBeLessThan(estimate(build(s, s.world, actor)));
    }
  });

  it('keeps settled work identity and returns the full record by exact state query', () => {
    let settled = 0;
    for (const actor of s.world.actors) {
      const input = build(s, world, actor.id);
      const execution = input.packet.execution as {
        activeState: Record<string, unknown>;
        binding: unknown;
      };
      expect(execution.binding).toEqual(
        actor.extensionState['execution:operation'] ?? null,
      );
      for (const [key, value] of Object.entries(execution.activeState)) {
        const full = actor.extensionState[key];
        if (!(value as Row | null)?.settled) {
          // Pointers, active and paused work stay complete.
          expect(value).toEqual(full);
          continue;
        }
        settled += 1;
        const record = full as Row;
        expect(['completed', 'stopped', 'cancelled']).toContain(record.status);
        for (const [field, kept] of Object.entries(value as Row))
          if (field !== 'settled') expect(kept).toEqual(record[field]);
        expect(read(world, actor.id, exact('state', key))[0]?.value).toEqual(
          record,
        );
      }
    }
    expect(settled).toBeGreaterThan(5);
  });

  it('references only entries that the same retrieval really contains', () => {
    const input = build(s, plain, 'ivo'),
      compacted = v7Clone(input);
    compactLongInput(compacted, 25, new Set(['inRetrieval']));
    const found = (section: string, id: unknown) =>
      input.retrieval
        .map((r) => r as { query: LongQuery; records: Row[]; access?: string })
        .filter(
          (r) =>
            r.query.section === section &&
            (r.query.ids.length > 0 || section === 'abilities'),
        )
        .flatMap((r) => r.records)
        .filter((r) => r.id === id && 'value' in r)
        .map((r) => r.value as Row);
    const pages: [string, string, string][] = [
      ['memory', 'projects', 'projects'],
      ['memory', 'knowledge', 'knowledge'],
      ['memory', 'records', 'memory'],
      ['observation', 'objects', 'observed'],
    ];
    let references = 0;
    for (const [group, key, section] of pages) {
      const before = rows((input.packet[group] as Row)[key]),
        after = rows((compacted.packet[group] as Row)[key]);
      after.forEach((row, i) => {
        if (!row.inRetrieval) return;
        references += 1;
        expect(row).toEqual({ id: before[i]?.id, inRetrieval: true });
        const original = before[i] ?? {},
          json = JSON.stringify(found(section, row.id)[0]);
        if ('value' in original)
          expect(JSON.stringify(original.value)).toBe(json);
        else {
          const part = Number(original.part);
          expect(json.slice(part * 600, (part + 1) * 600)).toBe(
            original.fragment,
          );
        }
      });
    }
    const before = (input.packet.abilities as { candidates: Row[] }).candidates;
    (compacted.packet.abilities as { candidates: Row[] }).candidates.forEach(
      (row, i) => {
        if (!row.inRetrieval) return;
        references += 1;
        const original = before[i] ?? {},
          sources = found('abilities', row.id);
        expect(
          sources.some(
            (v) =>
              String(v.function).startsWith(String(original.function)) &&
              v.learning === original.learning &&
              (v.mastered ?? row.mastered) === original.mastered,
          ),
        ).toBe(true);
      },
    );
    expect(references).toBeGreaterThanOrEqual(4);
    // The fully compacted input references the same entries.
    const full = JSON.stringify(build(s, world, 'ivo').packet);
    expect(full).toContain(
      '{"id":"shared-shelter-feasibility","inRetrieval":true}',
    );
  });

  it('references a detail read in full this round and keeps its personal mastery', () => {
    const input = longOrdinaryInput(world, 'ivo', s.cursors.ivo, {
      tick: 70,
      batches: 1,
      results: longRetrieve(world, 'ivo', 'ordinary', [
        exact('abilities', 'bark-separation'),
      ]),
    });
    const details = (input.packet.abilities as { details: Row[] }).details;
    expect(details).toContainEqual({
      id: 'bark-separation',
      inRetrieval: true,
      mastered: true,
    });
    expect(rows(input.retrieval[0])[0]?.value).toEqual(
      longVisibleAbilities(world, 'ivo').find(
        (a) => a.id === 'bark-separation',
      ),
    );
  });

  it('joins contiguous exact parts in order and leaves other parts separate', () => {
    const paged = v7Clone(world);
    delete paged.config.longDevelopment?.exactRecordWidth;
    const id = 'shared-shelter',
      parts = [1, 0, 2, 4].map((part) => exact('abilities', id, part));
    const input = longOrdinaryInput(paged, 'ivo', s.cursors.ivo, {
      tick: 70,
      batches: 1,
      results: longRetrieve(paged, 'ivo', 'ordinary', parts),
    });
    const results = input.retrieval as { query: LongQuery; records: Row[] }[];
    expect(results).toHaveLength(2);
    const joined = results[0]?.records[0] ?? {},
      single = results[1]?.records[0] ?? {};
    expect(joined.joinedParts).toEqual([0, 1, 2]);
    expect(joined.part).toBe(0);
    expect(joined.fragment).toBe(
      [0, 1, 2]
        .map((part) => read(paged, 'ivo', exact('abilities', id, part))[0])
        .map((r) => String(r?.fragment))
        .join(''),
    );
    const record = longVisibleAbilities(paged, 'ivo').find((a) => a.id === id);
    expect(joined.fragment).toBe(JSON.stringify(record).slice(0, 1800));
    expect(single.part).toBe(4);
    expect(single.joinedParts).toBeUndefined();
    expect(results[1]?.query.part).toBe(4);
    expect(String(input.packet.access)).toContain(COMPACTION_ACCESS.joined);
    expect(JSON.stringify(input)).not.toContain('"projection"');
    expect(JSON.stringify(input)).not.toContain('Stable600-code-unit pages');
  });

  it('encodes terrain as rows that decode to the exact cells', () => {
    for (const actor of s.world.actors.map((a) => a.id)) {
      const terrain = (
        build(s, world, actor).packet.observation as { terrain: string[] }
      ).terrain;
      expect(terrain.every((row) => typeof row === 'string')).toBe(true);
      expect(longDecodeTerrainRows(terrain)).toEqual(
        v7Observe(world, actor).terrain.map((p) => [p.x, p.y, p.kind]),
      );
    }
    const gaps: [number, number, string][] = [
      [1, 0, '.'],
      [3, 0, 'f'],
      [4, 0, ':'],
      [0, 2, '~'],
    ];
    const encoded = longTerrainRows(gaps);
    expect(encoded).toEqual(['0:1:.', '0:3:f:', '2:0:~']);
    expect(longDecodeTerrainRows(encoded ?? [])).toEqual(gaps);
    expect(longTerrainRows([[0, 0, 'ff']])).toBeNull();
  });

  it('gives full contracts only to interfaces needed now or used in the last 25 rounds', () => {
    const w = v7Clone(world),
      ivo = w.actors.find((a) => a.id === 'ivo');
    const template = ivo?.experience?.recent[0];
    if (!ivo?.experience || !template) throw new Error('Missing ivo');
    ivo.experience.recent = [
      { ...template, tick: 44, action: 'drop' },
      { ...template, tick: 44, action: 'food-preparation' },
      { ...template, tick: 45, action: 'give' },
      { ...template, tick: 45, action: 'cultivation-trial' },
    ];
    const operation: V7Cursor = {
      ...(s.cursors.ivo as V7Cursor),
      operation: {
        action: { interface: 'exchange', args: {} },
        elapsed: 0,
        remaining: null,
        startedAt: 70,
      },
    };
    const input = longOrdinaryInput(w, 'ivo', operation);
    const abilities = input.packet.abilities as {
      baseline: Row[];
      details: Row[];
    };
    const entry = (id: string) => abilities.baseline.find((e) => e.id === id);
    const legacy = (
      longOrdinaryInput(plain, 'ivo', operation).packet.abilities as {
        baseline: Row[];
      }
    ).baseline;
    // Used exactly 25 rounds ago: full; 26 rounds ago: summary.
    expect(entry('give')).toEqual(legacy.find((e) => e.id === 'give'));
    expect(entry('drop')).toEqual({
      id: 'drop',
      function: longVisibleAbilities(w, 'ivo').find((a) => a.id === 'drop')
        ?.function,
    });
    // Needed now: every plan step and the current operation, used recently or not.
    for (const id of ['rest', 'navigate', 'probe', 'exchange'])
      expect(entry(id)).toEqual(legacy.find((e) => e.id === id));
    expect(abilities.details.map((d) => d.id).sort()).toEqual([
      'bark-separation',
      'cultivation-trial',
    ]);
    // A summarized interface stays fully readable by exact id.
    expect(read(w, 'ivo', exact('abilities', 'drop'))[0]?.value).toMatchObject({
      parameters: legacy.find((e) => e.id === 'drop')?.parameters,
    });
  });

  it('adds explanations free of excluded words', () => {
    const sentences = [
      ...Object.values(COMPACTION_ACCESS).map((v) =>
        typeof v === 'string' ? v : v(25),
      ),
      ...COMPACTION_REPLACEMENTS.map(([, to]) => to),
    ];
    for (const sentence of sentences)
      expect(sentence).not.toMatch(CULTURE_EXCLUDED_WORDS);
    for (const actor of s.world.actors.map((a) => a.id)) {
      const legacy = String(build(s, plain, actor).packet.access),
        access = String(build(s, world, actor).packet.access);
      expect(access.startsWith(legacy)).toBe(true);
      const text = access.slice(legacy.length);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(CULTURE_EXCLUDED_WORDS);
      expect(sentences.some((x) => text.includes(x))).toBe(true);
    }
  });
});
