import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cultureInput } from './culture-metrics.js';
import type { CultureInput } from './culture-metrics.js';
import {
  MOTIFS,
  lineage,
  motifRows,
  recurringWords,
  spoken,
  transmission,
} from './culture-metrics-imagery.js';
import type { RunInfo, Spoken } from './culture-metrics-imagery.js';

const text = (
  run: string,
  actor: string,
  tick: number,
  value: string,
): Spoken => ({ run, actor, tick, kind: 'public', text: value });
const runs: RunInfo[] = [
  { run: 'ex1', lineage: 'ex1', seed: 1 },
  { run: 'ex2', lineage: 'ex2', seed: 2 },
  { run: 'ex3', lineage: 'ex1', seed: 1 },
];

describe('recurring imagery', () => {
  it('groups motif hits by independent lineage and seed', () => {
    const rows = motifRows(
      [
        text('ex1', 'lin', 4, 'A lantern waits by the path.'),
        text('ex3', 'moss', 130, 'The lanterns again.'),
        text('ex2', 'kai', 9, 'Quiet company is welcome, with no obligation.'),
        text('ex2', 'sol', 3, 'I like quiet company.'),
      ],
      runs,
      { ex3: ['Sign: The Lantern'] },
    );
    const lantern = rows.find((r) => r.motif === 'lantern');
    expect(lantern).toMatchObject({
      lineages: ['ex1'],
      runs: ['ex1', 'ex3'],
      seeds: [1],
      uses: 2,
      speakers: 2,
      inWorldText: ['ex3'],
      first: { run: 'ex1', tick: 4 },
    });
    expect(rows.find((r) => r.motif === 'quiet company')).toMatchObject({
      lineages: ['ex2'],
      uses: 2,
      first: { actor: 'sol', tick: 3 },
    });
    expect(rows.find((r) => r.motif === 'no obligation')?.uses).toBe(1);
    expect(rows.find((r) => r.motif === 'garden')?.uses).toBe(0);
    expect(rows).toHaveLength(MOTIFS.length);
  });

  it('lists only words outside each run’s world text that recur in enough lineages', () => {
    const texts = [
      text('ex1', 'lin', 1, 'The willow hums softly; Moss agrees.'),
      text('ex2', 'kai', 1, 'A willow beside the river hums.'),
      text('ex3', 'sol', 1, 'Willow branches.'),
    ];
    const excluded = {
      ex1: (k: string) => k === 'river',
      ex2: (k: string) => k === 'river',
      ex3: () => false,
    };
    const words = recurringWords(texts, runs, excluded, new Set(['moss']), 2);
    expect(words.map((w) => w.word)).toEqual(['willow']);
    expect(words[0]).toMatchObject({
      lineages: ['ex1', 'ex2'],
      runs: ['ex1', 'ex2', 'ex3'],
      uses: 3,
    });
    expect(recurringWords(texts, runs, excluded, new Set(), 3)).toEqual([]);
  });

  it('follows imports to the source lineage', () => {
    const root = mkdtempSync(join(tmpdir(), 'imagery-'));
    for (const [run, manifest] of [
      ['ex1', {}],
      ['ex2', { importedFrom: { experiment: 'ex1' } }],
      ['ex3', { importedFrom: { experiment: 'ex2' } }],
    ] as const) {
      mkdirSync(join(root, 'experiment', run), { recursive: true });
      writeFileSync(
        join(root, 'experiment', run, 'manifest.json'),
        JSON.stringify(manifest),
      );
    }
    expect(lineage(root, 'ex3')).toBe('ex1');
    expect(lineage(root, 'ex1')).toBe('ex1');
    expect(lineage(root, 'ex9')).toBe('ex9');
  });

  it('counts verified transmission, keeping only confirmed categories of partial entries', () => {
    const dir = mkdtempSync(join(tmpdir(), 'imagery-labels-'));
    writeFileSync(
      join(dir, 'verification.json'),
      JSON.stringify({
        entries: [
          {
            categories: ['narrative', 'narrative-continuation'],
            verdict: 'agree',
          },
          {
            categories: ['naming', 'name-adoption'],
            verdict: 'partial',
            confirmed: ['naming'],
          },
          { categories: ['norm-repetition'], verdict: 'disagree' },
          { categories: ['norm', 'norm-repetition'], verdict: 'agree' },
          { categories: [], verdict: null },
        ],
      }),
    );
    expect(transmission(dir)).toMatchObject({
      adoptions: 0,
      continuations: 1,
      repetitions: 1,
      verified: 4,
    });
    expect(transmission(join(dir, 'missing'))).toBeNull();
  });

  it('reads only spoken, sent and named text', () => {
    const input = {
      actors: [{ id: 'lin', name: 'Lin' }],
      harness: [],
      rounds: [
        {
          tick: 2,
          actions: {
            lin: {
              interface: 'tell',
              args: { text: 'A lantern by the path.' },
            },
          },
          events: [],
          memory: { lin: { notes: ['A private lantern note.'] } },
          intentions: {},
        },
      ],
    } as unknown as CultureInput;
    expect(spoken('ex1', input)).toEqual([
      {
        run: 'ex1',
        tick: 2,
        actor: 'lin',
        kind: 'public',
        text: 'A lantern by the path.',
      },
    ]);
  });

  it('finds the lantern in two independent retained runs', () => {
    const rows = motifRows(
      ['ex18', 'ex24'].flatMap((run) =>
        spoken(run, cultureInput(`experiment/${run}`)),
      ),
      [
        { run: 'ex18', lineage: 'ex18', seed: 20261123 },
        { run: 'ex24', lineage: 'ex24', seed: 20261203 },
      ],
      {},
    );
    expect(rows.find((r) => r.motif === 'lantern')).toMatchObject({
      lineages: ['ex18', 'ex24'],
      seeds: [20261123, 20261203],
    });
  }, 120_000);
});
