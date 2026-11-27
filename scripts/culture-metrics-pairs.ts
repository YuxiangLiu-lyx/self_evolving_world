import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cultureInput, cultureMetrics } from './culture-metrics.js';
import type { CultureInput } from './culture-metrics.js';

/**
 * The seven outcome measures that experiment B registered before its runs
 * (docs/exec-plans/completed/pr-44-b-goal-pairs.md, R5), computed per run over ticks 1–80.
 *
 * Measures 3, 4 and 6 are rule-based and read the archive. Measures 1, 2, 5 and 7 read the
 * model labels of `pnpm labels:culture` and count only positives that the verification confirmed:
 * every category of an `agree` entry, the `confirmed` categories of a `partial` entry, none of a
 * `disagree` entry. A distinct valued object is the `object` the verifier recorded on the entry.
 * Missed items found in the negative sample are reported by the agreement rates, not counted.
 */

export const LEANINGS = [
  'freedom',
  'belonging',
  'beauty',
  'fairness',
  'mastery',
  'calm',
] as const;
export type Leaning = (typeof LEANINGS)[number];

/**
 * Word forms of each leaning with the exclusions of review item B in the first culture v2 report
 * (docs/presentation/run-report-culture-v2.md): "free" only as "freedom" or "freely"; "belonging"
 * not when possessive ("belonging to", "belongs"); "mastery" only as "practical mastery" or "pursue
 * mastery", and never interface mastery ("is mastered").
 */
const FORMS: Record<Leaning, RegExp> = {
  freedom: /\b(freedom|freely)\b/gi,
  belonging: /\b(belonging(?!\s+to\b)|belong)\b/gi,
  beauty: /\b(beauty|beautiful)\b/gi,
  fairness: /\b(fair|fairly|fairness)\b/gi,
  mastery:
    /\b(practical\s+mastery|pursue\s+mastery|master|(?<!\b(?:is|are|was|were|been|be)\s)mastered)\b/gi,
  calm: /\b(calm|calmly)\b/gi,
};

/** Leaning word matches of one text, in order of appearance. */
export function leaningMatches(leaning: Leaning, text: string): string[] {
  return [...text.matchAll(FORMS[leaning])].map((m) => m[0]);
}

export interface CaresLeaning {
  actor: string;
  leaning: string | null;
  /** The first cares text, ticks 1–through, that contains the person's own leaning word. */
  first: { tick: number; text: string; matches: string[] } | null;
  /** Distinct cares texts the person wrote in the window. */
  versions: number;
}

/** Measure 4: people whose cares, in any version, contain their own leaning word. */
export function caresLeanings(
  input: CultureInput,
  leanings: Record<string, string | null>,
): CaresLeaning[] {
  return input.actors.map(({ id }) => {
    const leaning = leanings[id] ?? null;
    const texts = new Set<string>();
    let first: CaresLeaning['first'] = null;
    for (const round of input.rounds) {
      if (round.tick < 1) continue;
      const cares = round.memory[id]?.cares;
      if (typeof cares !== 'string' || !cares) continue;
      texts.add(cares);
      const matches = (LEANINGS as readonly string[]).includes(leaning ?? '')
        ? leaningMatches(leaning as Leaning, cares)
        : [];
      if (!first && matches.length)
        first = { tick: round.tick, text: cares, matches };
    }
    return { actor: id, leaning, first, versions: texts.size };
  });
}

export interface AttendedInvitation {
  invitation: string;
  host: string | null;
  round: number;
  present: string[];
}

/** Measure 6: invitations whose world attendance record lists someone other than the host. */
export function attendedInvitations(input: CultureInput): AttendedInvitation[] {
  return input.rounds.flatMap((round) =>
    round.tick < 1
      ? []
      : round.events.flatMap((e) => {
          if (e.type !== 'attendance') return [];
          const host = typeof e.data.host === 'string' ? e.data.host : null;
          const present = Array.isArray(e.data.present)
            ? e.data.present.filter((p): p is string => typeof p === 'string')
            : [];
          if (!present.some((p) => p !== host)) return [];
          return [
            {
              invitation:
                typeof e.data.invitation === 'string' ? e.data.invitation : '',
              host,
              round: Number(e.data.round),
              present,
            },
          ];
        }),
  );
}

interface LabelLink {
  field: string;
  entry: string;
  gist: string;
  by: string;
  item: string;
  tick: number;
  call: string;
}
interface LabelItem {
  id: string;
  tick: number;
  call: string;
  person: string;
  kind: string;
  text: string;
  categories: string[];
  links: LabelLink[];
}
interface VerificationEntry {
  item: string;
  sample: 'positive' | 'negative';
  verdict: 'agree' | 'disagree' | 'partial' | null;
  confirmed?: string[];
  object?: string;
}

export interface ConfirmedItem extends LabelItem {
  confirmed: string[];
  object: string | null;
}

/** Positives with the categories their verification confirmed; throws on unverified positives. */
export function confirmedPositives(
  items: readonly LabelItem[],
  entries: readonly VerificationEntry[],
): ConfirmedItem[] {
  const byItem = new Map(
    entries.filter((e) => e.sample === 'positive').map((e) => [e.item, e]),
  );
  return items.map((item) => {
    const entry = byItem.get(item.id);
    if (!entry?.verdict)
      throw new Error(`${item.id}: positive without a verification verdict.`);
    let confirmed: string[];
    if (entry.verdict === 'agree') confirmed = [...item.categories];
    else if (entry.verdict === 'disagree') confirmed = [];
    else {
      if (!Array.isArray(entry.confirmed))
        throw new Error(
          `${item.id}: a partial verdict needs its confirmed categories.`,
        );
      const unknown = entry.confirmed.filter(
        (c) => !item.categories.includes(c),
      );
      if (unknown.length)
        throw new Error(
          `${item.id}: confirmed categories ${unknown.join(', ')} were not labelled.`,
        );
      confirmed = [...entry.confirmed];
    }
    if (confirmed.includes('valued-object') && !entry.object)
      throw new Error(
        `${item.id}: a confirmed valued object needs the object the verifier identified.`,
      );
    return { ...item, confirmed, object: entry.object ?? null };
  });
}

const LINK_FIELD: Record<string, string> = {
  'name-adoption': 'adoptsName',
  'narrative-continuation': 'continues',
  'norm-repetition': 'repeatsNorm',
};
/** Confirmed items of a linked category whose link points to another person's entry. */
function linked(items: readonly ConfirmedItem[], category: string) {
  return items.flatMap((i) =>
    i.confirmed.includes(category)
      ? i.links
          .filter((l) => l.field === LINK_FIELD[category] && l.by !== i.person)
          .map((l) => ({ item: i, link: l }))
      : [],
  );
}

export interface LabelMeasures {
  /** Measure 1: distinct names with a confirmed adoption by a different person. */
  adoptedNames: {
    entry: string;
    gist: string;
    by: string;
    adopters: string[];
  }[];
  /** Measure 2: confirmed narratives and their confirmed continuations by others. */
  narratives: { items: string[]; continuations: string[] };
  /** Measure 5: confirmed repetitions of another person's normative statement. */
  normRepetitions: {
    item: string;
    person: string;
    entry: string;
    by: string;
  }[];
  /** Measure 7: distinct objects with a confirmed non-functional valuation. */
  valuedObjects: { object: string; items: string[] }[];
}

export function labelMeasures(items: readonly ConfirmedItem[]): LabelMeasures {
  const names = new Map<string, LabelMeasures['adoptedNames'][number]>();
  for (const { item, link } of linked(items, 'name-adoption')) {
    const n = names.get(link.entry) ?? {
      entry: link.entry,
      gist: link.gist,
      by: link.by,
      adopters: [],
    };
    if (!n.adopters.includes(item.person)) n.adopters.push(item.person);
    names.set(link.entry, n);
  }
  const objects = new Map<string, string[]>();
  for (const i of items)
    if (i.confirmed.includes('valued-object') && i.object)
      objects.set(i.object, [...(objects.get(i.object) ?? []), i.id]);
  return {
    adoptedNames: [...names.values()],
    narratives: {
      items: items
        .filter((i) => i.confirmed.includes('narrative'))
        .map((i) => i.id),
      continuations: [
        ...new Set(
          linked(items, 'narrative-continuation').map(({ item }) => item.id),
        ),
      ],
    },
    normRepetitions: linked(items, 'norm-repetition').map(({ item, link }) => ({
      item: item.id,
      person: item.person,
      entry: link.entry,
      by: link.by,
    })),
    valuedObjects: [...objects].map(([object, ids]) => ({
      object,
      items: ids,
    })),
  };
}

export interface PairMeasures {
  archive: string;
  through: number;
  labels: string;
  measures: {
    adoptedNames: number;
    narratives: number;
    narrativeContinuations: number;
    nonTransactionalShare: number | null;
    caresWithOwnLeaning: number;
    normRepetitions: number;
    attendedInvitations: number;
    valuedObjects: number;
  };
  detail: LabelMeasures & {
    nonTransactional: { messages: number; nonTransactional: number };
    caresLeanings: CaresLeaning[];
    attendedInvitations: AttendedInvitation[];
  };
}

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** All seven measures of one archive and its verified labels directory. */
export function pairMeasures(
  archive: string,
  labels: string,
  through = 80,
): PairMeasures {
  const input = cultureInput(archive, through);
  const metrics = cultureMetrics(input);
  const initial = read(join(archive, 'initial.json')) as {
    actors: { id: string; extensionState?: Record<string, unknown> }[];
  };
  const leanings = Object.fromEntries(
    initial.actors.map((a) => {
      const t = a.extensionState?.['long:tendencies'] as
        { leaning?: unknown } | undefined;
      return [a.id, typeof t?.leaning === 'string' ? t.leaning : null];
    }),
  );
  const items = (
    read(join(labels, 'positives.json')) as { items: LabelItem[] }
  ).items.filter((i) => i.tick >= 1 && i.tick <= through);
  const entries = (
    read(join(labels, 'verification.json')) as { entries: VerificationEntry[] }
  ).entries;
  const label = labelMeasures(confirmedPositives(items, entries));
  const cares = caresLeanings(input, leanings);
  const attended = attendedInvitations(input);
  return {
    archive,
    through,
    labels,
    measures: {
      adoptedNames: label.adoptedNames.length,
      narratives: label.narratives.items.length,
      narrativeContinuations: label.narratives.continuations.length,
      nonTransactionalShare: metrics.nonTransactional.share,
      caresWithOwnLeaning: cares.filter((c) => c.first).length,
      normRepetitions: label.normRepetitions.length,
      attendedInvitations: attended.length,
      valuedObjects: label.valuedObjects.length,
    },
    detail: {
      ...label,
      nonTransactional: {
        messages: metrics.nonTransactional.messages,
        nonTransactional: metrics.nonTransactional.nonTransactional,
      },
      caresLeanings: cares,
      attendedInvitations: attended,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [archive, labels, ...rest] = process.argv.slice(2);
  if (!archive || !labels)
    throw new Error(
      'Usage: tsx scripts/culture-metrics-pairs.ts experiment/exN labels-dir [through] [--json file]',
    );
  const j = rest.indexOf('--json');
  const json = j >= 0 ? rest[j + 1] : undefined;
  const through = rest.find((a) => /^\d+$/.test(a));
  const result = pairMeasures(
    archive,
    labels,
    through === undefined ? 80 : Number(through),
  );
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (json) writeFileSync(json, output);
  else console.log(output.trimEnd());
}
