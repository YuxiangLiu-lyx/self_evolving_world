/**
 * Recurring imagery across independent runs (experiment A–D summary).
 *
 * For each run, the spoken, sent and named text of its people (`utterances` kinds message,
 * public and name) is searched for a declared list of images and phrases, and for words that
 * the run's own world and prompt text does not already contain. Runs are grouped into
 * independent lineages: an imported run belongs to the lineage of the run it was imported
 * from (`manifest.importedFrom`). A motif found in several lineages arose without any shared
 * transcript, so it is more likely to come from the model's prior than from the world. The
 * verified label directories give, per run, the transmission events (adoption, continuation,
 * repetition) that are the evidence of shared practice.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  cultureInput,
  environmentIndex,
  termKey,
  utterances,
} from './culture-metrics.js';
import type { CultureInput } from './culture-metrics.js';

export interface Motif {
  id: string;
  pattern: RegExp;
}
/** Declared after reading the runs, so this list is descriptive, not pre-registered. */
export const MOTIFS: readonly Motif[] = [
  { id: 'lantern', pattern: /\blanterns?\b/i },
  { id: 'quiet company', pattern: /\bquiet company\b/i },
  { id: 'no obligation', pattern: /\b(?:no|without|any) obligations?\b/i },
  { id: 'no pressure', pattern: /\b(?:no|without) pressure\b/i },
  { id: 'no hurry', pattern: /\b(?:no|without) hurry\b|\bunhurried\b/i },
  {
    id: 'beyond supplies',
    pattern:
      /\b(?:beyond|not (?:just|only|merely)|more than)\b[^.!?]{0,30}\b(?:supplies|the next meal)\b/i,
  },
  { id: 'garden', pattern: /\bgardens?\b/i },
  { id: 'thread', pattern: /\bthreads?\b/i },
  { id: 'dawn', pattern: /\bdawn\b/i },
  { id: 'traveler', pattern: /\btravell?ers?\b/i },
  { id: 'keeper', pattern: /\bkeepers?\b/i },
  { id: 'silence', pattern: /\bsilen(?:ce|t)\b/i },
  { id: 'song or tune', pattern: /\b(?:songs?|tunes?|melod(?:y|ies))\b/i },
];
const SPOKEN = new Set(['message', 'public', 'name']);

export interface Spoken {
  run: string;
  tick: number;
  actor: string;
  kind: string;
  text: string;
}
export function spoken(run: string, input: CultureInput): Spoken[] {
  return utterances(input)
    .filter((u) => SPOKEN.has(u.kind))
    .map((u) => ({
      run,
      tick: u.tick,
      actor: u.actor,
      kind: u.kind,
      text: u.text,
    }));
}

export interface RunInfo {
  run: string;
  lineage: string;
  seed: number | null;
}
/** The run an archive descends from through imports, or the archive itself. */
export function lineage(root: string, run: string): string {
  const path = join(root, 'experiment', run, 'manifest.json');
  if (!existsSync(path)) return run;
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    importedFrom?: { experiment?: unknown };
  };
  const source = manifest.importedFrom?.experiment;
  return typeof source === 'string' && source !== run
    ? lineage(root, source)
    : run;
}

export interface MotifRow {
  motif: string;
  lineages: string[];
  runs: string[];
  seeds: number[];
  uses: number;
  speakers: number;
  inWorldText: string[];
  first: Spoken | null;
}
export function motifRows(
  texts: Spoken[],
  runs: RunInfo[],
  environment: Record<string, string[]>,
): MotifRow[] {
  const info = new Map(runs.map((r) => [r.run, r]));
  return MOTIFS.map((m) => {
    const hits = texts.filter((t) => m.pattern.test(t.text));
    const used = [...new Set(hits.map((h) => h.run))];
    return {
      motif: m.id,
      lineages: [...new Set(used.map((r) => info.get(r)?.lineage ?? r))].sort(),
      runs: used.sort(),
      seeds: [
        ...new Set(
          used.flatMap((r) => {
            const s = info.get(r)?.seed;
            return s === null || s === undefined ? [] : [s];
          }),
        ),
      ].sort(),
      uses: hits.length,
      speakers: new Set(hits.map((h) => `${h.run}/${h.actor}`)).size,
      inWorldText: runs
        .filter((r) =>
          (environment[r.run] ?? []).some((e) => m.pattern.test(e)),
        )
        .map((r) => r.run),
      first:
        [...hits].sort(
          (a, b) => a.run.localeCompare(b.run) || a.tick - b.tick,
        )[0] ?? null,
    };
  });
}

/** Function words and the ordinary vocabulary of plans and reports, left out of the word list. */
const COMMON = new Set(
  `about above after again against also always another anything around asked because been before
being below between both could didn does doesn doing done down during each either enough even ever
every found from further going gone good great have haven having here into just keep keeping know
known later learn learned less like little look looking made make making many maybe might more
most much myself near need needn next nothing once only other others over perhaps please quite
rather really same should since some something soon still such sure take taking than thank thanks
that their them then there these they thing things think this those though through together very
want well were what when where which while will with without would your yours hello welcome`.split(
    /\s+/,
  ),
);
export interface WordRow {
  word: string;
  lineages: string[];
  runs: string[];
  uses: number;
}
/** Words of five letters or more, absent from each run's own world and prompt text. */
export function recurringWords(
  texts: Spoken[],
  runs: RunInfo[],
  excluded: Record<string, (key: string) => boolean>,
  names: Set<string>,
  minLineages: number,
): WordRow[] {
  const info = new Map(runs.map((r) => [r.run, r]));
  const byWord = new Map<string, Spoken[]>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const raw of t.text.toLowerCase().split(/[^a-z]+/)) {
      if (raw.length < 5 || names.has(raw) || COMMON.has(raw)) continue;
      const key = termKey(raw);
      if (!key || seen.has(key) || excluded[t.run]?.(key)) continue;
      seen.add(key);
      byWord.set(key, [...(byWord.get(key) ?? []), t]);
    }
  }
  return [...byWord.entries()]
    .map(([word, hits]) => {
      const used = [...new Set(hits.map((h) => h.run))].sort();
      return {
        word,
        lineages: [
          ...new Set(used.map((r) => info.get(r)?.lineage ?? r)),
        ].sort(),
        runs: used,
        uses: hits.length,
      };
    })
    .filter((w) => w.lineages.length >= minLineages)
    .sort(
      (a, b) =>
        b.lineages.length - a.lineages.length ||
        b.uses - a.uses ||
        a.word.localeCompare(b.word),
    );
}

export interface Transmission {
  directory: string;
  adoptions: number;
  continuations: number;
  repetitions: number;
  verified: number;
}
const LINKS: Record<
  string,
  keyof Omit<Transmission, 'directory' | 'verified'>
> = {
  'name-adoption': 'adoptions',
  'narrative-continuation': 'continuations',
  'norm-repetition': 'repetitions',
};
/** Verified transmission categories in one label directory: agree, or partial and confirmed. */
export function transmission(directory: string): Transmission | null {
  const path = join(directory, 'verification.json');
  if (!existsSync(path)) return null;
  const file = JSON.parse(readFileSync(path, 'utf8')) as {
    entries: {
      categories: string[];
      verdict?: string | null;
      confirmed?: string[] | null;
    }[];
  };
  const out: Transmission = {
    directory: basename(directory),
    adoptions: 0,
    continuations: 0,
    repetitions: 0,
    verified: 0,
  };
  for (const e of file.entries) {
    if (e.verdict) out.verified++;
    const kept =
      e.verdict === 'agree'
        ? e.categories
        : e.verdict === 'partial'
          ? (e.confirmed ?? [])
          : [];
    for (const c of kept) {
      const key = LINKS[c];
      if (key) out[key]++;
    }
  }
  return out;
}

export function main(argv: string[]): void {
  const args = argv.filter((a) => a !== '--');
  const option = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const root = option('--root') ?? '.';
  const out = option('--out');
  const labels = option('--labels') ?? 'docs/presentation/labels';
  const runs = (option('--runs') ?? '').split(',').filter(Boolean);
  if (!out || !runs.length)
    throw new Error(
      'Usage: tsx scripts/culture-metrics-imagery.ts --runs ex15,ex16 --out file.json [--labels dir] [--root dir]',
    );
  const texts: Spoken[] = [];
  const infos: RunInfo[] = [];
  const environment: Record<string, string[]> = {};
  const excluded: Record<string, (key: string) => boolean> = {};
  const names = new Set<string>();
  for (const run of runs) {
    const input = cultureInput(join(root, 'experiment', run));
    texts.push(...spoken(run, input));
    environment[run] = input.environment;
    excluded[run] = environmentIndex(input.environment);
    for (const a of input.actors) {
      names.add(a.id.toLowerCase());
      names.add(a.name.toLowerCase());
    }
    const initial = JSON.parse(
      readFileSync(join(root, 'experiment', run, 'initial.json'), 'utf8'),
    ) as { config?: { seed?: unknown } };
    const seed = initial.config?.seed;
    infos.push({
      run,
      lineage: lineage(root, run),
      seed: typeof seed === 'number' ? seed : null,
    });
  }
  const labelDirs = existsSync(join(root, labels))
    ? readdirSync(join(root, labels))
        .filter((d) => /^ex\d+-/.test(d))
        .sort()
    : [];
  const report = {
    format: 'self-evolving-world/culture-imagery',
    version: 1,
    runs: infos.map((r) => ({
      ...r,
      spoken: texts.filter((t) => t.run === r.run).length,
    })),
    motifs: motifRows(texts, infos, environment),
    words: recurringWords(texts, infos, excluded, names, 3),
    transmission: labelDirs.flatMap((d) => {
      const t = transmission(join(root, labels, d));
      return t ? [t] : [];
    }),
  };
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('culture-metrics-imagery.ts'))
  main(process.argv.slice(2));
