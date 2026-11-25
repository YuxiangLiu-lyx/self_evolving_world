import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPRESSION_LIMITS,
  EXPRESSION_MEMORY,
  EXPRESSION_SIGN_KINDS,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Condition,
  V7Cursor,
  V7Event,
  V7Point,
  V7World,
} from '@self-evolving-world/world-core';
import type { ContinuousModelInput } from '../apps/simulator/src/continuous-provider.js';
import { continuousRequest } from '../apps/simulator/src/continuous-provider.js';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import {
  continuousRead,
  reconstructContinuousSegment,
} from './continuous-store.js';
import type { V7ReplayIndex, V7ReplaySegment } from './continuous-store.js';

/*
 * Deterministic, rule-based culture metrics (E0) of a continuous-family archive (ex7 onward),
 * computed from retained files only: replay segments for actions, events, memory and plans,
 * execution.json for the final catalogue, initial.json and the first retained ordinary call
 * of each actor for the authored prompt. Each segment is also replayed exactly (checked against
 * its recorded hashes) only to read every actor's energy at the start of each round.
 * No model is called and nothing is written to the archive.
 * Owner-only private memory (`cares`, `views`) is reported in its own section and is never read
 * by a public metric. Every rule is documented in docs/presentation/culture-baseline.md.
 */

/** Interfaces that will carry symbolic culture once they exist; none exists in ex7–ex13. */
export const SYMBOLIC_INTERFACES = ['name', 'mark', 'tell', 'invite'] as const;
/** Movement and idling are not activities. */
export const NON_ACTIVITY_INTERFACES = ['navigate', 'wait'];
/** Collective activity: uses at most this many rounds apart link into one episode. */
export const ACTIVITY_WINDOW = 1;
/** A reply from B to A answers A's message to B sent at most this many rounds earlier. */
export const RESPONSE_WINDOW = 10;
/** A prescribed action counts as an echo when performed within this many rounds. */
export const ACTION_ECHO_WINDOW = 10;
/** Private memory is measured at the end of every window of this many rounds and at the last round. */
export const PRIVATE_SAMPLE_INTERVAL = 10;
/** Base interfaces that always count as survival behavior. */
export const SURVIVAL_INTERFACES = ['gather', 'eat', 'rest'];
/** Rest acts as a default idle behavior when at least this share of rest actor-rounds is idle rest. */
export const REST_DEFAULT_SHARE = 0.5;
/**
 * A rest begun at or above this share of the energy cap is not need-driven: three quarters of the
 * cap still pays for many rounds of ordinary work (30 of 40 is about 18 moves at 1.6 energy).
 */
export const REST_HIGH_START = 0.75;
/** A rest step that rests until energy reaches at least this share of the cap rests to (nearly) full. */
export const REST_TO_FULL = 0.9;
/** Two sharing phrases have similar wording at or above this Jaccard similarity of their folded content words. */
export const SHARING_SIMILARITY = 0.5;
/** Interface id or name words that concern food, water, warmth or shelter (prefix match). */
export const SURVIVAL_WORDS = [
  'food',
  'eat',
  'meal',
  'forag',
  'harvest',
  'cook',
  'nutri',
  'edible',
  'water',
  'drink',
  'warm',
  'heat',
  'fire',
  'thermal',
  'insulat',
  'mantle',
  'shelter',
  'refuge',
];

/** Function words, pronouns, modals and common sentence openers; never part of a coined term. */
const STOP = new Set(
  `a an the and or but if then else so as at by for from in into of on onto to with without within
about above after again against all am any are be been before being below between both can could
did do does doing done down during each few further had has have having he her here hers him his
how i it its itself just me more most my myself no nor not now off once only other our ours out
over own same she should some such than that their theirs them themselves there these they this
those through too under until up very was we were what when where which while who whom why will
would you your yours yourself may might must shall ought also yet still even ever never always
let lets us is isn't i'm i've i'll it's don't can't won't hello hi please thanks thank yes ok okay
dear near nearby currently already today tick ticks round rounds another every per via because`
    .split(/\s+/)
    .filter(Boolean),
);

/** Number words; a compound that counts something is not a coinage. */
const NUMBER_WORDS = new Set(
  `zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen
twenty thirty forty fifty hundred thousand first second third fourth fifth half quarter double
single multi`.split(/\s+/),
);
/** Ordinary English compound modifiers: degree, size or prefix first parts, and adjective heads. */
const MODIFIER_FIRST = new Set(
  `low lower high higher small smaller large larger short shorter long longer full non self well
semi re co pre post sub un over under out mid cross less least better best worse worst new old`.split(
    /\s+/,
  ),
);
const ADJECTIVE_HEADS = new Set(
  `safe free based like bound wide level scale sized term specific related ready proof friendly
compatible dependent sensitive intensive`.split(/\s+/),
);
/** Hyphenated compounds that are ordinary English rather than coinages. */
export function ordinaryCompound(parts: string[]): boolean {
  const last = parts.at(-1) ?? '';
  return (
    parts.some((p) => STOP.has(p) || NUMBER_WORDS.has(p)) ||
    MODIFIER_FIRST.has(parts[0] ?? '') ||
    ADJECTIVE_HEADS.has(last) ||
    /(?:ing|ed)$/.test(last)
  );
}

type Kind = 'message' | 'public' | 'intention' | 'note' | 'project' | 'name';
const KINDS: readonly Kind[] = [
  'message',
  'public',
  'intention',
  'note',
  'project',
  'name',
];
const COMMUNICATION: readonly Kind[] = ['message', 'public'];
const BELIEF_SOURCES: readonly Kind[] = ['message', 'public', 'note'];

interface CultureMemory {
  notes?: string[];
  preferences?: string[];
  intention?: string;
  projects?: { id: string }[];
  collectiveIntent?: { goal?: string; reason?: string };
  /**
   * Owner-only private memory update (culture voice), recorded in the round its plan starts.
   * Read only by `privateMemoryMetric`; never an utterance and never part of a public metric.
   */
  cares?: string;
  /** Owner-only private update: person id to view; an empty view forgets that person. */
  views?: Record<string, string>;
}
/** One retained round: the submitted actions, the settled events and the actor-authored records. */
export interface CultureRound {
  tick: number;
  actions: Record<string, V7Action>;
  events: V7Event[];
  memory: Record<string, CultureMemory>;
  /** Plan intentions from the retained task cursors, for archives whose memory lacks them. */
  intentions: Record<string, string>;
  /**
   * First round of the plan that produced each actor's action (its cursor start plus one), so text
   * spoken from a plan step is dated when it was written; absent in synthetic rounds.
   */
  authored?: Record<string, number>;
  /** Energy condition of the actor-decided plan step that produced each actor's `rest`. */
  restSteps?: Record<string, RestStep>;
  /** Each actor's energy at the start of the round, from exact replay; absent in synthetic rounds. */
  energy?: Record<string, number>;
  /** The accepted ordinary call that produced each actor's plan for this round; absent in synthetic rounds. */
  calls?: Record<string, string>;
}
/** How a plan step that rests depends on the actor's own energy. */
export interface RestStep {
  /** Whether the step's `until` or `guard`, or the plan's `until`, reads the actor's energy. */
  conditioned: boolean;
  /** The energy an `until` on energy (`gte` or `gt`) rests toward, else null. */
  target: number | null;
}
/** Everything the metrics read, so unit tests can supply synthetic worlds. */
export interface CultureInput {
  archive: string;
  actors: { id: string; name: string }[];
  vision: number;
  start: Record<string, V7Point>;
  abilities: { id: string; name: string }[];
  resources: { id: string; name: string; nutrition: number }[];
  /** Authored prompt, catalogue and world vocabulary that agents did not coin. */
  environment: string[];
  /** Plan intentions the controller wrote itself after a failed decision; never actor-authored. */
  harness: string[];
  rounds: CultureRound[];
  /** Whether the archive's scope offers private memory (culture `voice`); detected from the archive. */
  voice?: boolean;
  /**
   * Energy cap and base rest recovery from the configuration. `unrecordedRestFactor` is set when an
   * installed weather lean-to can lower rest recovery by a factor no event records.
   */
  energy?: { cap: number; restRecovery: number; unrecordedRestFactor: boolean };
  /** Person-made world objects other than signs and assembly parts; absent in synthetic inputs. */
  works?: CultureWork[];
  /** Kinds and names of the world's objects other than signs; absent in synthetic inputs. */
  objects?: string[];
}
/** Actor-authored text: messages and public reports, plan intentions, notes, project ids and given names. */
export interface Utterance {
  actor: string;
  tick: number;
  kind: Kind;
  text: string;
  recipient: string | null;
}
export interface Edge {
  from: string;
  to: string;
  weight: number;
}
export interface Graph {
  edges: Edge[];
  pairs: number;
  reciprocated: number;
  /** Share of directed pairs whose reverse pair also exists; null without edges. */
  reciprocity: number | null;
}
export interface SharedTerm {
  term: string;
  firstUsers: string[];
  firstRound: number;
  laterUsers: string[];
  /** Later users who had received the term in a message or nearby public text before using it. */
  exposedLaterUsers: string[];
  crossAgentUses: number;
}
export interface Statement {
  actor: string;
  round: number;
  kind: Kind;
  text: string;
  key: string[];
}
export interface NormStatement extends Statement {
  recipient: string | null;
  polarity: 'prescriptive' | 'prohibitive';
  prescribedInterface: string | null;
  phraseEchoes: { actor: string; round: number }[];
  actionEchoes: { actor: string; round: number }[];
}
export interface BeliefStatement extends Statement {
  type: 'causal' | 'supernatural';
  citations: { actor: string; round: number }[];
}
/** Ideas of restraint in, or sharing of, common resources; each idea has its own patterns. */
export const SHARING_IDEAS = [
  'leave-for-others',
  'take-moderately',
  'no-depletion',
  'share-split',
  'coordinate-collection',
] as const;
export type SharingIdea = (typeof SHARING_IDEAS)[number];
export const SHARING_DESCRIPTIONS: Record<SharingIdea, string> = {
  'leave-for-others': 'leave part of a source for other people',
  'take-moderately': 'take only a modest share or what is needed',
  'no-depletion': 'do not exhaust, strip or empty a source',
  'share-split': 'share, split or pool a resource',
  'coordinate-collection':
    'coordinate a finite stock instead of competing for it or duplicating its collection',
};
export interface SharingMatch {
  idea: SharingIdea;
  /** The matched words, or for `coordinate-collection` the clause around the coordination word. */
  phrase: string;
}
/** One sentence of an utterance that expresses at least one sharing idea. */
export interface SharingExpression {
  actor: string;
  /** Round the text appeared: when it was spoken or sent, or first recorded in memory. */
  round: number;
  /** First round of the plan that wrote it; a plan's spoken step can be written rounds earlier. */
  authored: number;
  kind: Kind;
  recipient: string | null;
  /** A message, public speech or a name or mark: text another person can receive. */
  communicated: boolean;
  text: string;
  matches: SharingMatch[];
}
/** How a person could have received an earlier communicated sharing expression. */
export interface SharingExposure {
  idea: SharingIdea;
  /** Author and round of the received expression. */
  actor: string;
  round: number;
  /** Round of receipt: the message, the speech within the vision radius or the first sight of the sign. */
  received: number;
  via: 'message' | 'speech' | 'council' | 'sign';
}
/** A sharing idea expressed by a person after another person had already expressed it. */
export interface SharingReuse {
  idea: SharingIdea;
  actor: string;
  round: number;
  authored: number;
  kind: Kind;
  phrase: string;
  /** The earlier expression of the idea by another person with the most similar phrase. */
  closest: {
    actor: string;
    round: number;
    authored: number;
    kind: Kind;
    phrase: string;
    similarity: number;
  };
  similarWording: boolean;
  /** Earliest receipt, before the reuse was written, of the same idea from another person. */
  exposure: SharingExposure | null;
  /** Earliest receipt, before the reuse was written, of another sharing idea from another person. */
  otherExposure: SharingExposure | null;
}
export interface SharingIdeaSummary {
  idea: SharingIdea;
  description: string;
  expressions: number;
  communicated: number;
  people: string[];
  /** People who wrote the idea in its first authored round. */
  firstUsers: string[];
  firstAuthored: number | null;
  /** Other people who expressed it in a later authored round. */
  laterUsers: string[];
  /** Later users who had received it from another person before their first later expression. */
  exposedLaterUsers: string[];
}
/** A sharing expression in owner-only private memory; never part of a public metric. */
export interface PrivateSharingExpression {
  actor: string;
  round: number;
  field: 'cares' | 'view';
  /** The viewed person of a view, else null. */
  person: string | null;
  text: string;
  matches: SharingMatch[];
  /** Earliest receipt, before the write, of one of its ideas from another person's public text. */
  exposure: SharingExposure | null;
}
/** Convergence of different observers' current views of the same person at the end of one window. */
export interface ViewConvergenceSample {
  round: number;
  /** Mean over targets of the mean pairwise similarity; null without two observers of one target. */
  similarity: number | null;
  /** Targets with at least one scored observer pair. */
  targets: number;
  /** Scored observer pairs behind the value. */
  pairs: number;
}
/** Similarity of different people's current cares at the end of one window. */
export interface CaresSimilaritySample {
  round: number;
  /** Mean pairwise similarity; null without two people holding cares. */
  similarity: number | null;
  /** People holding cares. */
  people: number;
  /** Scored pairs of people behind the value. */
  pairs: number;
}
/** First and last scored sample, their difference and the least-squares slope over scored samples. */
export interface PrivateTrend<T> {
  first: T | null;
  last: T | null;
  /** Last minus first similarity; null with fewer than two scored samples. */
  change: number | null;
  slopePer100Rounds: number | null;
}
/** One person's private memory history: writes recorded in plans, actual changes and forgets. */
export interface PrivateHistory {
  writes: number;
  changes: number;
  forgotten: number;
}
export interface PrivateMemoryMetrics {
  /** Owner-only: shown only in the owner's own packet; no other person can see it. */
  visibility: 'owner-only';
  note: string;
  cares: PrivateHistory & {
    /** People who ever held non-empty cares. */
    people: number;
    /** People holding cares at the last round. */
    holding: number;
  };
  views: PrivateHistory & {
    /** People who ever held a view of someone. */
    observers: number;
    /** People someone ever held a view of. */
    targets: number;
    /** People holding at least one view at the last round. */
    holding: number;
    /** Views held at the last round. */
    entries: number;
  };
  perAgent: {
    actor: string;
    cares: PrivateHistory & { current: string | null };
    views: PrivateHistory & {
      /** Held views, most recently updated last, with the round of their last update. */
      current: { person: string; view: string; round: number }[];
    };
  }[];
  sampleInterval: number;
  similarity: 'jaccard-content-words';
  viewConvergence: {
    samples: ViewConvergenceSample[];
    trend: PrivateTrend<ViewConvergenceSample>;
  };
  caresSimilarity: {
    samples: CaresSimilaritySample[];
    trend: PrivateTrend<CaresSimilaritySample>;
  };
  /** Sharing ideas in cares and views, detected like the public ones but kept here. */
  sharing: {
    expressions: PrivateSharingExpression[];
    byIdea: Record<SharingIdea, number>;
  };
}
export interface CultureMetrics {
  archive: string;
  rounds: { first: number; last: number; count: number };
  agents: string[];
  utterances: Record<Kind, number>;
  vocabulary: {
    terms: number;
    sharedTerms: number;
    transmittedTerms: number;
    crossAgentUses: number;
    top: SharedTerm[];
    topCandidates: { term: string; users: string[]; uses: number }[];
  };
  activities: {
    window: number;
    radius: number;
    excluded: string[];
    repeated: number;
    repeatedNonSurvival: number;
    byInterface: {
      interface: string;
      survival: boolean;
      episodes: number;
      participants: string[];
      actorRounds: number;
    }[];
  };
  norms: {
    statements: number;
    echoed: number;
    phraseEchoes: number;
    actionEchoes: number;
    /** Normative sentences that stayed in private notes; context only, never echoed or listed. */
    privateStatements: number;
    list: NormStatement[];
  };
  /**
   * Sharing or restraint ideas about common resources in actor-authored public and plan text, and
   * their reuse by other people with the exposure that could explain it. Cares and views are excluded.
   */
  sharing: {
    expressions: number;
    communicated: number;
    /** Expressions of an idea written after another person had expressed it. */
    reuses: number;
    similarReuses: number;
    exposedReuses: number;
    similarityThreshold: number;
    ideas: SharingIdeaSummary[];
    list: SharingExpression[];
    reuseList: SharingReuse[];
    limitations: string[];
  };
  beliefs: {
    statements: number;
    causal: number;
    supernatural: number;
    cited: number;
    citations: number;
    list: BeliefStatement[];
  };
  relationships: {
    responseWindow: number;
    messages: Graph;
    responses: Graph;
    transfers: Graph;
  };
  survival: {
    actorRounds: number;
    survivalRounds: number;
    share: number | null;
    interfaces: string[];
    /** Submitted `rest` actor-rounds, all counted in `survivalRounds`. */
    restRounds: number;
    /** Survival actor-rounds other than `rest` over all actor-rounds; a second value, not the gate. */
    shareWithoutRest: number | null;
    perAgent: {
      actor: string;
      actorRounds: number;
      survivalRounds: number;
      restRounds: number;
      share: number | null;
      shareWithoutRest: number | null;
    }[];
  };
  /** Whether `rest` is chosen without an energy need, by the idle-rest criterion. */
  rest: RestMetrics;
  nonTransactional: {
    messages: number;
    nonTransactional: number;
    share: number | null;
  };
  symbolic: {
    interfaces: string[];
    perAgent: {
      actor: string;
      attempted: number;
      succeeded: number;
      byInterface: Record<string, number>;
    }[];
    everyAgentAtLeastOne: boolean;
  };
  /** `rest` and `wait` actor-rounds, reported as idle apart from survival (revised G2). */
  idle: {
    interfaces: string[];
    actorRounds: number;
    rest: number;
    wait: number;
    rounds: number;
    share: number | null;
    perAgent: {
      actor: string;
      actorRounds: number;
      rest: number;
      wait: number;
      share: number | null;
    }[];
  };
  /** Clauses adopted by another person after receiving them; see `PHRASE_CRITERION`. */
  phrases: {
    criterion: string;
    propagations: number;
    /** Distinct (source person, source clause, adopter) triples. */
    adoptions: number;
    /** Propagations into spoken, sent or posted text. */
    communicated: number;
    list: PhrasePropagation[];
  };
  invitations: { criterion: string; list: InvitationRecord[] };
  /** Person-made world objects other than signs, with the call that started each. */
  works: WorkRecord[];
  appearance: { criterion: string; list: AppearanceValue[] };
  /** Gate G2 as revised after the fact on 2026-11-25, with the original gate for reference. */
  gate: Omit<typeof G2_REVISION, 'criteria'> & {
    criteria: readonly string[];
    survival: { share: number | null; threshold: number; passed: boolean };
    symbolic: { people: string[]; required: number; passed: boolean };
    adoption: {
      names: AdoptedItem[];
      sayings: AdoptedItem[];
      rules: AdoptedItem[];
      passed: boolean;
    };
    passed: boolean;
    original: {
      survivalShare: number | null;
      everyAgentAtLeastOne: boolean;
      passed: boolean;
    };
  };
  /** Dated names, rules, invitations, attendance, works and adoptions, each with its call. */
  timeline: TimelineItem[];
  /**
   * Owner-only private memory (`cares`, `views`) of a scope with a culture voice, reported apart
   * from every public metric above, which never reads it; null when the archive has none.
   */
  privateMemory: PrivateMemoryMetrics | null;
  /**
   * Extension point for an optional, separately requested model labeling pass over the listed
   * statements. It is never implemented or called here; the field stays null.
   */
  modelLabels: null;
}
/** Rest counts of one person or of everyone under two criteria, each with its own verdict. */
export interface RestCounts {
  /** Submitted `rest` actor-rounds. */
  rests: number;
  /** Criterion 1: rests from a plan step with no energy condition, or cut by the cap; each once. */
  idle: number;
  /** Rests whose producing step has no condition on the person's energy. */
  unconditioned: number;
  /** Rests whose recovery the energy cap cut; null when recovery cannot be read exactly. */
  highEnergy: number | null;
  /** Rests from a step that rests until energy reaches at least `REST_TO_FULL` of the cap. */
  toFull: number;
  /** Rests with a retained producing step, and with a recorded recovery: the two tests' bases. */
  withStep: number;
  withRecovery: number;
  idleShare: number | null;
  /** Criterion 1 verdict: idle rests are at least `REST_DEFAULT_SHARE` of rests; null without rests. */
  default: boolean | null;
  /** Criterion 2: rests begun at or above `REST_HIGH_START` of the cap; null without start energy. */
  highStart: number | null;
  /** Rests with a reconstructed start energy: criterion 2's base. */
  withStart: number;
  highStartShare: number | null;
  /** Criterion 2 verdict: high-start rests are at least `REST_DEFAULT_SHARE` of them. */
  startDefault: boolean | null;
}
export interface RestMetrics extends RestCounts {
  criterion: string;
  startCriterion: string;
  defaultShare: number;
  startShare: number;
  toFullShare: number;
  perAgent: (RestCounts & { actor: string })[];
}
/** Contract a later model labeler would satisfy; this module neither implements nor calls one. */
export interface CultureLabeler {
  label(statements: Statement[]): Promise<{ text: string; label: string }[]>;
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';
const ratio = (part: number, whole: number): number | null =>
  whole ? part / whole : null;
const distance = (a: V7Point, b: V7Point) => Math.hypot(a.x - b.x, a.y - b.y);
const words = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);
/** Lowercase letter words joined by single spaces; hyphens and punctuation separate words. */
export const normalize = (value: string): string => words(value).join(' ');
/** Singular form of a plural word: berries → berry, roots → root; other words are unchanged. */
const singular = (w: string) =>
  w.length > 4 && w.endsWith('ies')
    ? `${w.slice(0, -3)}y`
    : w.length > 3 && w.endsWith('s') && !w.endsWith('ss')
      ? w.slice(0, -1)
      : w;
/** Identity of a term: normalized words in singular form, so plural and hyphenated variants match. */
export const termKey = (value: string): string =>
  words(value).map(singular).join(' ');
const sentences = (value: string): string[] =>
  value
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Whether the actor's submitted action in this round avoided a failure event. */
function succeeded(round: CultureRound, actor: string): boolean {
  return !round.events.some((e) => e.actor === actor && e.type === 'failed');
}

/** Actor-authored text of the metrics below; private `cares` and `views` are never read here. */
export function utterances(input: CultureInput): Utterance[] {
  const ids = new Set(input.actors.map((a) => a.id));
  const harness = new Set(input.harness);
  const out: Utterance[] = [];
  const seen = new Set<string>();
  const once = (actor: string, tick: number, kind: Kind, value: unknown) => {
    const t = text(value);
    const key = `${actor}\u0000${kind}\u0000${t}`;
    if (!t || seen.has(key) || (kind === 'intention' && harness.has(t))) return;
    seen.add(key);
    out.push({ actor, tick, kind, text: t, recipient: null });
  };
  for (const round of input.rounds) {
    const sent = new Set<string>();
    for (const e of round.events) {
      if (!e.actor || !e.success) continue;
      const data = object(e.data);
      if (e.type === 'message') {
        const subject = text(data.subject);
        const recipient = text(data.recipient) || (e.target ?? '');
        sent.add(`${e.actor}\u0000${e.description}`);
        out.push({
          actor: e.actor,
          tick: round.tick,
          kind: 'message',
          text: subject ? `${subject}. ${e.description}` : e.description,
          recipient: ids.has(recipient) ? recipient : null,
        });
      } else if (
        e.type === 'collective-report' ||
        e.type === 'collective-response'
      ) {
        const said = text(
          e.type === 'collective-report'
            ? object(data.report).text
            : data.reason,
        );
        if (said)
          out.push({
            actor: e.actor,
            tick: round.tick,
            kind: 'public',
            text: said,
            recipient: null,
          });
      }
    }
    for (const actor of input.actors) {
      const action = round.actions[actor.id];
      if (!action || !succeeded(round, actor.id)) continue;
      const args = object(action.args);
      if (action.interface === 'tell' || action.interface === 'invite') {
        const said = ['text', 'message', 'content', 'invitation']
          .map((k) => text(args[k]))
          .find(Boolean);
        const to = ['recipient', 'participant', 'invitee', 'target']
          .map((k) => text(args[k]))
          .find((v) => ids.has(v));
        if (said && !sent.has(`${actor.id}\u0000${said}`))
          out.push({
            actor: actor.id,
            tick: round.tick,
            kind: to ? 'message' : 'public',
            text: said,
            recipient: to ?? null,
          });
      }
      if (action.interface === 'name' || action.interface === 'mark')
        for (const k of ['name', 'label', 'title', 'text', 'mark', 'symbol'])
          if (text(args[k]))
            out.push({
              actor: actor.id,
              tick: round.tick,
              kind: 'name',
              text: text(args[k]),
              recipient: null,
            });
    }
    for (const actor of input.actors) {
      const memory = round.memory[actor.id];
      once(actor.id, round.tick, 'intention', memory?.intention);
      once(actor.id, round.tick, 'intention', round.intentions[actor.id]);
      once(actor.id, round.tick, 'intention', memory?.collectiveIntent?.goal);
      for (const note of [
        ...(memory?.notes ?? []),
        ...(memory?.preferences ?? []),
      ])
        once(actor.id, round.tick, 'note', note);
      once(actor.id, round.tick, 'note', memory?.collectiveIntent?.reason);
      for (const project of memory?.projects ?? [])
        once(actor.id, round.tick, 'project', project.id);
    }
  }
  return out;
}

/**
 * Actor positions per round from each actor's first located action event (an event that names an
 * interface; world events such as observed-source changes may carry another position), carried forward.
 */
function positions(input: CultureInput): Map<number, Map<string, V7Point>> {
  const result = new Map<number, Map<string, V7Point>>();
  let last = new Map(Object.entries(input.start));
  for (const round of input.rounds) {
    const now = new Map(last);
    const located = new Set<string>();
    for (const e of round.events)
      if (e.actor && e.interface && e.position && !located.has(e.actor)) {
        located.add(e.actor);
        now.set(e.actor, e.position);
      }
    result.set(round.tick, now);
    last = now;
  }
  return result;
}

/** Words that are never coinages: actor names and ids split into letter words. */
function actorWords(input: CultureInput): Set<string> {
  return new Set(
    input.actors.flatMap((a) => [...words(a.id), ...words(a.name)]),
  );
}

/** Word n-grams of the environment, so a candidate is excluded when the world or prompt already says it. */
export function environmentIndex(strings: string[]): (key: string) => boolean {
  const grams = new Set<string>();
  const long: string[] = [];
  const seen = new Set<string>();
  for (const value of strings) {
    const w = words(value).map(singular);
    const joined = w.join(' ');
    if (seen.has(joined)) continue;
    seen.add(joined);
    for (let i = 0; i < w.length; i++)
      for (let n = 1; n <= 6 && i + n <= w.length; n++)
        grams.add(w.slice(i, i + n).join(' '));
    long.push(` ${joined} `);
  }
  return (key: string) =>
    grams.has(key) ||
    (key.split(' ').length > 6 && long.some((s) => s.includes(` ${key} `)));
}

const CAPITALIZED =
  /\b[A-Z][a-z]+(?:[ \t]+(?:(?:of|the)[ \t]+)?[A-Z][a-z]+)+(?![a-zA-Z])/g;
const HYPHENATED = /(?<![\w’'-])[A-Za-z]{2,}(?:-[A-Za-z]{2,})+(?![\w’'-])/g;
const QUOTED = /["“]([^"”\n]{2,48})["”]/g;

/** Candidate coinages: multi-word capitalized phrases, hyphenated compounds and quoted phrases. */
export function termCandidates(
  value: string,
  excluded: (key: string) => boolean,
  names: Set<string>,
): { key: string; surface: string }[] {
  const found = new Map<string, string>();
  const ordinary = (w: string) =>
    STOP.has(w) || NUMBER_WORDS.has(w) || names.has(w);
  const add = (surface: string) => {
    const key = termKey(surface);
    const parts = normalize(surface).split(' ');
    if (
      !key ||
      parts.every(ordinary) ||
      (/^[A-Za-z]+(?:-[A-Za-z]+)+$/.test(surface) &&
        (ordinaryCompound(parts) || parts.some((p) => names.has(p)))) ||
      excluded(key) ||
      found.has(key)
    )
      return;
    found.set(key, surface);
  };
  for (const match of value.matchAll(CAPITALIZED)) {
    const phrase = match[0].split(/\s+/);
    while (phrase.length && ordinary(phrase[0]?.toLowerCase() ?? ''))
      phrase.shift();
    while (phrase.length && ordinary(phrase.at(-1)?.toLowerCase() ?? ''))
      phrase.pop();
    if (phrase.filter((w) => /^[A-Z]/.test(w)).length >= 2)
      add(phrase.join(' '));
  }
  for (const match of value.matchAll(HYPHENATED)) add(match[0]);
  for (const match of value.matchAll(QUOTED)) {
    const inner = (match[1] ?? '').trim();
    const count = inner.split(/\s+/).length;
    if (
      /^[A-Za-z][A-Za-z’' -]*[A-Za-z]$/.test(inner) &&
      count <= 4 &&
      (count > 1 || inner.includes('-') || /^[A-Z]/.test(inner))
    )
      add(inner);
  }
  return [...found].map(([key, surface]) => ({ key, surface }));
}

/** Content words: letter words that are neither stop words nor actor names. */
const content = (value: string, names: Set<string>) =>
  words(value)
    .filter((w) => !STOP.has(w) && !names.has(w) && w.length > 1)
    .map(singular);
const contains = (haystack: string[], needle: string[]) =>
  needle.length > 0 &&
  haystack.some((_, i) => needle.every((w, j) => haystack[i + j] === w));

const NORM =
  /\b(should(?:n['’]t| not)?|must(?:n['’]t| not)?|ought(?:n['’]t)?(?: not)? to|never|always)\b/i;
/** Counterfactual, epistemic or descriptive uses that prescribe nothing. */
const NOT_NORM =
  /\b(?:should|must)(?:n['’]t| not)?\s+have\b|\b(?:should|must)['’]ve\b|\b(?:has|have|had|was|were|is|are|been|'ve)\s+(?:never|always)\b/i;
const CAUSAL =
  /\b(because|caused by|due to|the reason|as a result of|results? from|resulted from|explains?(?: why)?|that is why|which is why|this is why)\b/i;
/** A causal sentence restating an action failure, or giving the reason for one's own choice, explains nothing unseen. */
const FAILURE_FEEDBACK = /\b(?:fail\w*|rejected|blocked|unsuccessful)\b/i;
const DECISION_RATIONALE =
  /\b(?:paused?|keep|keeping|avoid\w*|choos\w*|chose|decid\w*|decision|plan\w*|prefer\w*|will|wait\w*|deliberate\w*)\b/i;
const SUPERNATURAL =
  /\b(spirits?|luck|lucky|unlucky|punish\w*|bless\w*|curse[ds]?|omens?|gods?|goddess|sacred|magic\w*|rituals?|(?:the|its|their|his|her|our)\s+favou?r|favou?red by)\b/i;

function clauseKey(
  sentence: string,
  match: RegExpExecArray,
  names: Set<string>,
) {
  return content(sentence.slice(match.index + match[0].length), names).slice(
    0,
    3,
  );
}

/** Normative sentences in communication (or the given kinds); questions and descriptive uses are excluded. */
export function normStatements(
  list: Utterance[],
  names: Set<string>,
  kinds: readonly Kind[] = COMMUNICATION,
): Omit<
  NormStatement,
  'prescribedInterface' | 'phraseEchoes' | 'actionEchoes'
>[] {
  const out: Omit<
    NormStatement,
    'prescribedInterface' | 'phraseEchoes' | 'actionEchoes'
  >[] = [];
  for (const u of list.filter((x) => kinds.includes(x.kind)))
    for (const s of sentences(u.text)) {
      const match = NORM.exec(s);
      if (!match || s.endsWith('?') || NOT_NORM.test(s)) continue;
      out.push({
        actor: u.actor,
        round: u.tick,
        kind: u.kind,
        text: s,
        key: clauseKey(s, match, names),
        recipient: u.recipient,
        polarity: /not|n['’]t|never/i.test(match[0])
          ? 'prohibitive'
          : 'prescriptive',
      });
    }
  return out;
}

/** Explanations of causes in communication and notes; supernatural attributions are a stricter class. */
export function beliefStatements(
  list: Utterance[],
  names: Set<string>,
): Omit<BeliefStatement, 'citations'>[] {
  const out: Omit<BeliefStatement, 'citations'>[] = [];
  for (const u of list.filter((x) => BELIEF_SOURCES.includes(x.kind)))
    for (const s of sentences(u.text)) {
      if (s.endsWith('?')) continue;
      const strict = SUPERNATURAL.exec(s);
      let causal = strict ? null : CAUSAL.exec(s);
      if (causal) {
        const explained = s.slice(0, causal.index);
        if (
          /\bnot\s+$/i.test(explained) ||
          FAILURE_FEEDBACK.test(explained) ||
          DECISION_RATIONALE.test(explained)
        )
          causal = null;
      }
      const match = strict ?? causal;
      if (!match) continue;
      out.push({
        actor: u.actor,
        round: u.tick,
        kind: u.kind,
        text: s,
        key: strict
          ? content(s.slice(match.index), names).slice(0, 3)
          : clauseKey(s, match, names),
        type: strict ? 'supernatural' : 'causal',
      });
    }
  return out;
}

/*
 * Sharing and restraint about common resources. Every rule is an English keyword pattern over one
 * sentence; a match is a candidate expression, not an interpretation. Plain quantity reports
 * ("I'm collecting four"), self-rationing of one's own food ("reserve berries for later") and
 * sharing information ("share measured findings") are deliberately not matched.
 */
const re = (source: string) => new RegExp(source, 'i');
/** One word token: letters, digits, apostrophes and hyphens. */
const W = String.raw`[\w’'-]+`;
/** Nouns of food, materials and the places that hold them. */
const RESOURCE = String.raw`(?:food|meals?|berr(?:y|ies)|roots?|nuts?|fruits?|resources?|suppl(?:y|ies)|stocks?|stores?|reserves?|harvests?|materials?|bark|vines?|branch(?:es)?|wood|stones?|water|patch(?:es)?|bush(?:es)?|shrubs?|plants?|trees?|sources?|commons|yields?)`;
const RESOURCE_WORD = re(String.raw`\b${RESOURCE}\b`);
/** Nouns of information: sharing these is sharing knowledge, not a resource. */
const INFO =
  /\b(?:findings?|evidence|information|info|observations?|results?|knowledge|locations?|requirements?|limits?|methods?|ideas?|reports?|plans?|details?|news|data|notes?|measure\w*|views?|stor(?:y|ies)|experiences?|thoughts?|lessons?|skills?|techniques?|recipes?|specifications?|coordinates?|positions?|names?|words?|status|claims?|propert(?:y|ies)|limitations?|inspections?|assessments?|tests?|trials?|experiments?|answers?|questions?|updates?|preparation|separation|process(?:es|ing)?|finds)\b/i;
/** The people something is left for. */
const OTHERS = String.raw`(?:others|other\s+people|everyone|everybody|the\s+others|you|your|them|neighbou?rs|whoever|the\s+group|anyone\s+else|someone\s+else)`;
const LEAVE = String.raw`\bleav(?:e|es|ing)\b`;
const TAKE = String.raw`(?:take|takes|taking|took|collect|collects|collecting|gather|gathers|gathering|harvest|harvests|harvesting|pick|picks|picking)`;
const COUNT = String.raw`(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
/** A negation just before a match reverses leaving, taking modestly or sharing. */
const NEGATED =
  /\b(?:not|never|won['’]t|don['’]t|didn['’]t|can['’]t|cannot|refus\w*|stop\w*)\s+(?:\w+\s+)?$/i;
/** Up to three object words after a verb, stopping at punctuation and clause conjunctions. */
const OBJECT = String.raw`(?:\s+(?!(?:and|or|but|then|while|to|so)\b)${W}){0,3}`;
/** Depleting oneself or one's energy is not depleting a source. */
const SELF_OBJECT =
  /^\s*(?:yourself|myself|ourselves|themselves|himself|herself|my\b|one['’]s\b)|\b(?:energy|strength)\b/i;
/** "share the observed source" reports a finding; an observed, confirmed or known object is information. */
const REPORTED =
  /\b(?:observed|confirmed|known|reported|seen|located|visible|measured|tested|verified|latest|current)\b|^\s*(?:what|how|where|when|why|whether|if)\b/i;
/** A determiner or amount word before `share` makes it the noun of "leave a share", not the verb. */
const SHARE_NOUN =
  /\b(?:a|an|the|my|our|your|their|his|her|its|modest|fair|small|equal|substantial|reasonable|own|large|big|generous)\s+$/i;
/** A resource word that is not the first part of a compound such as `food-preparation`. */
const RESOURCE_HEAD = String.raw`${RESOURCE}(?![\w’'-])`;
const words3 = (value: string) => value.split(/\s+/).slice(0, 3).join(' ');
const negated = (sentence: string, m: RegExpExecArray) =>
  NEGATED.test(sentence.slice(0, m.index));
const after = (sentence: string, m: RegExpExecArray) =>
  sentence.slice(m.index + m[0].length);
/** Clause around a match: between the nearest comma, semicolon or clause conjunction on each side. */
function clause(sentence: string, m: RegExpExecArray): string {
  const before = sentence.slice(0, m.index);
  const cut = /(?:,|;|\bwhile\b|\bthen\b)\s*/gi;
  let start = 0;
  for (const c of before.matchAll(cut)) start = c.index + c[0].length;
  const rest = sentence.slice(m.index);
  const end = /,|;/.exec(rest);
  return sentence
    .slice(start, m.index + (end ? end.index : rest.length))
    .trim()
    .replace(/[.!?]$/, '');
}
interface SharingRule {
  idea: SharingIdea;
  pattern: RegExp;
  reject?: (sentence: string, m: RegExpExecArray) => boolean;
  phrase?: (sentence: string, m: RegExpExecArray) => string;
}
/*
 * `coordinate-collection` needs, besides a coordination word, a finite or common stock ("scarce
 * materials", "the same supply"), a contrast with collecting or with duplicating a collection, or
 * doubt that more remains ("rather than assume more remains").
 */
const SCARCE = re(
  String.raw`\b(?:scarce|finite|limited|shared|common|same)\s+(?:${W}\s+){0,2}?${RESOURCE}\b`,
);
/** Collecting itself, as an act or its noun. */
const COLLECTING = String.raw`(?:collect\w*|gather\w*|harvest\w*)`;
/** Contrast with collecting: "before collecting the same supply". */
const NOT_COLLECTING = re(
  String.raw`\b(?:rather\s+than|instead\s+of|before|not)\s+(?:${W}\s+){0,2}?${COLLECTING}`,
);
/** Contrast with duplicating or competing: "rather than duplicate others' collection". */
const NOT_DUPLICATING = re(
  String.raw`\b(?:rather\s+than|instead\s+of|without|before|not)\s+(?:${W}\s+){0,2}?(?:duplicat\w*|compet\w*|doubl\w*)((?:\s+${W}){0,3})`,
);
/** The coordinated object is a resource or a collection: "coordinate additional collection". */
const COORDINATED_STOCK = re(
  String.raw`\bcoordinat\w*\s+(?:${W}\s+){0,3}?(?:${RESOURCE_HEAD}|${COLLECTING})`,
);
const ASSUME_MORE = re(
  String.raw`\brather\s+than\s+assum\w*\s+(?:${W}\s+){0,2}?(?:remain\w*|fresh|new|more|additional|extra)\b`,
);
export const SHARING_RULES: readonly SharingRule[] = [
  // "leave some stock for others", "leaving 6 for your single bay"
  {
    idea: 'leave-for-others',
    pattern: re(
      String.raw`${LEAVE}(?:\s+${W}){0,4}?\s+for\s+${OTHERS}\b${OBJECT}`,
    ),
    reject: negated,
  },
  // "would leave a share", "leaving a substantial share", "leave the rest"
  {
    idea: 'leave-for-others',
    pattern: re(
      String.raw`${LEAVE}\s+(?:(?:a|an|some|the|their|its)\s+)?(?:(?:substantial|fair|good|decent|small|reasonable|large|big|generous)\s+)?(?:share|portion|remainder|rest)\b`,
    ),
    reject: negated,
  },
  // "leaving the other currently visible root"
  {
    idea: 'leave-for-others',
    pattern: re(
      String.raw`${LEAVE}\s+(?:the\s+)?(?:other|others|remaining|last)\b(?:\s+${W}){0,3}?\s+${RESOURCE}\b`,
    ),
    reject: negated,
  },
  // "6 remain at the birch for your planned collection"
  {
    idea: 'leave-for-others',
    pattern: re(
      String.raw`\b(?:some|enough|plenty|part|half|the\s+rest|the\s+remainder|${COUNT})\s+(?:${W}\s+){0,2}?remain(?:s|ing)?\b[^.;]{0,40}?\bfor\s+${OTHERS}\b${OBJECT}`,
    ),
  },
  // "collect a modest share", "use modest quantities"
  {
    idea: 'take-moderately',
    pattern: re(
      String.raw`\b(?:${TAKE}|use|uses|using|keep|keeps|keeping)\s+(?:(?:a|an|my|our|your|their|his|her|only|just)\s+)*(?:modest|moderate|fair|small|limited|reasonable|equal)\s+(?:share|portion|part|amount|quantity|quantities|harvests?)\b`,
    ),
    reject: negated,
  },
  // "modest harvests", "modest material collection", "a fair share"
  {
    idea: 'take-moderately',
    pattern: re(
      String.raw`\b(?:modest|moderate|fair|limited)\s+(?:(?:material|food|bark|vine|root|berry)\s+)?(?:shares?|portions?|harvests?|collections?|gathering|takes?)\b`,
    ),
    reject: negated,
  },
  // "take what you need", "gather only what is needed"
  {
    idea: 'take-moderately',
    pattern: re(
      String.raw`\b(?:${TAKE}|eat|eating)\s+(?:only\s+|just\s+)?(?:what|as\s+much\s+as)\s+(?:i|we|you|they|he|she|one|each\s+${W}|is|are)\s+(?:${W}\s+)?(?:needs?|needed|can\s+eat|will\s+eat|can\s+use|will\s+use)\b`,
    ),
    reject: negated,
  },
  // "collect only four"; "gather only observed stock" names no amount and does not match
  {
    idea: 'take-moderately',
    pattern: re(
      String.raw`\b${TAKE}\s+(?:only|just|no\s+more\s+than|at\s+most)\s+(?:${COUNT}|a\s+few|a\s+little|a\s+couple|some|part|half|a\s+share|a\s+portion)\b`,
    ),
    reject: negated,
  },
  // "without exhausting shared sources"
  {
    idea: 'no-depletion',
    pattern: re(
      String.raw`\bwithout\s+(?:exhausting|depleting|emptying|stripping|draining|using\s+up|over-?harvesting|clearing\s+out|wiping\s+out)\b(${OBJECT})`,
    ),
    reject: (s, m) => SELF_OBJECT.test(`${m[1] ?? ''} ${words3(after(s, m))}`),
  },
  // "rather than strip shared patches", "don't strip the bush"; participles ("not depleted") describe
  {
    idea: 'no-depletion',
    pattern: re(
      String.raw`\b(?:not|never|don['’]t|do\s+not|rather\s+than|instead\s+of|avoid(?:s|ing)?)\s+(?:to\s+)?(?:strip(?:ping)?|exhaust(?:ing)?|deplet(?:e|ing)|drain(?:ing)?|over-?harvest(?:ing)?|use\s+up|using\s+up|clear(?:ing)?\s+out|wip(?:e|ing)\s+out)\b(${OBJECT})`,
    ),
    reject: (s, m) => SELF_OBJECT.test(`${m[1] ?? ''} ${words3(after(s, m))}`),
  },
  {
    idea: 'no-depletion',
    pattern: re(
      String.raw`\b(?:never|don['’]t|do\s+not|rather\s+than|instead\s+of|avoid(?:s|ing)?)\s+(?:empty|emptying)\s+(?:the|a|any|shared|common|our|this|that)\b`,
    ),
  },
  // "not the whole patch"
  {
    idea: 'no-depletion',
    pattern: re(String.raw`\bnot\s+the\s+(?:whole|entire)\s+${RESOURCE}\b`),
  },
  // "don't take all the berries", "never take the last one"
  {
    idea: 'no-depletion',
    pattern: re(
      String.raw`\b(?:never|don['’]t|do\s+not|rather\s+than|instead\s+of|avoid(?:s|ing)?)\s+${TAKE}\s+(?:(?:all|every|each)\b|the\s+(?:whole|entire|last)\b|everything\b)`,
    ),
  },
  // "preserve food sources"
  {
    idea: 'no-depletion',
    pattern: re(
      String.raw`\b(?:preserv(?:e|es|ing)|protect(?:s|ing)?|conserv(?:e|es|ing)|spar(?:e|es|ing))\s+(?:(?:the|shared|common|our|food|local|nearby|these|those)\s+){0,2}(?:sources?|patch(?:es)?|bush(?:es)?|shrubs?|plants?|commons)\b`,
    ),
  },
  // "share berries"; "share known food information" and "share findings about food" share knowledge
  {
    idea: 'share-split',
    pattern: re(
      String.raw`\b(?:share|shares|sharing)\s+((?:${W}\s+){0,3}?)${RESOURCE_HEAD}`,
    ),
    reject: (s, m) =>
      negated(s, m) ||
      SHARE_NOUN.test(s.slice(0, m.index)) ||
      REPORTED.test(m[1] ?? '') ||
      INFO.test(`${m[1] ?? ''} ${words3(after(s, m))}`),
  },
  // "shared the berries"; the adjective in "shared shelter" or "shared sources" is not sharing
  {
    idea: 'share-split',
    pattern: re(
      String.raw`\bshared\s+(?:my|our|the|some|a|an|his|her|their|its|${COUNT})\s+((?:${W}\s+){0,2}?)${RESOURCE_HEAD}`,
    ),
    reject: (s, m) =>
      negated(s, m) || INFO.test(`${m[1] ?? ''} ${words3(after(s, m))}`),
  },
  // "findings and resources can be shared"; "berries are split between two stacks" is physical
  {
    idea: 'share-split',
    pattern: re(
      String.raw`\b${RESOURCE}\s+((?:${W}\s+){0,3}?)(?:can|could|should|will|would|must|may|might|are|is|to)\s+(?:be\s+)?(?:shared|pooled)\b`,
    ),
    reject: (_, m) => INFO.test(m[1] ?? ''),
  },
  // "our combined supply"
  {
    idea: 'share-split',
    pattern: re(
      String.raw`\b(?:our|their|a|the)\s+(?:combined|pooled|joint|common|communal)\s+(?:suppl(?:y|ies)|stocks?|stores?|reserves?|food|harvests?|materials?)\b`,
    ),
  },
  { idea: 'share-split', pattern: /\b(?:take|takes|taking)\s+turns\b/i },
  // "split the berries between us"; splitting wood or bark alone is physical work
  {
    idea: 'share-split',
    pattern: re(
      String.raw`\b(?:split|splits|splitting|divide|divides|dividing|pooling)\b[^.;]{0,40}?\b(?:evenly|equally|fairly|(?:between|among)\s+(?:us|you|them|both\s+of\s+us|all\s+of\s+us|everyone|everybody|the\s+group|ourselves)|with\s+${OTHERS})\b`,
    ),
    reject: negated,
  },
  // "avoid competing with others for already discussed supplies"
  {
    idea: 'coordinate-collection',
    pattern: re(
      String.raw`\b(?:avoid(?:s|ing)?|not|without|rather\s+than|instead\s+of)\s+compet\w*`,
    ),
    reject: (s) => !RESOURCE_WORD.test(s),
    phrase: clause,
  },
  // "coordinate scarce materials rather than duplicate collection"; "let's coordinate materials"
  // names no finite stock, contrast or doubt and does not match
  {
    idea: 'coordinate-collection',
    pattern: /\bcoordinat\w*/i,
    reject: (s) => {
      const dup = NOT_DUPLICATING.exec(s);
      return !(
        SCARCE.test(s) ||
        NOT_COLLECTING.test(s) ||
        ASSUME_MORE.test(s) ||
        (dup &&
          (COORDINATED_STOCK.test(s) ||
            re(String.raw`\b${COLLECTING}`).test(dup[1] ?? '')))
      );
    },
    phrase: clause,
  },
];

/** Sharing ideas in each sentence of a text, at most one match per idea and sentence. */
export function sharingMatches(
  value: string,
): { sentence: string; matches: SharingMatch[] }[] {
  const out: { sentence: string; matches: SharingMatch[] }[] = [];
  for (const sentence of sentences(value)) {
    const matches: SharingMatch[] = [];
    for (const rule of SHARING_RULES) {
      if (matches.some((m) => m.idea === rule.idea)) continue;
      const m = rule.pattern.exec(sentence);
      if (!m || rule.reject?.(sentence, m)) continue;
      matches.push({
        idea: rule.idea,
        phrase: (rule.phrase?.(sentence, m) ?? m[0]).trim(),
      });
    }
    if (matches.length)
      out.push({
        sentence,
        matches: SHARING_IDEAS.flatMap((idea) =>
          matches.filter((m) => m.idea === idea),
        ),
      });
  }
  return out;
}

/** Crude suffix folding for phrase similarity: leaving, leave and leaves share `leav`. */
function fold(w: string): string {
  const base = singular(w);
  const cut = base.replace(/(?:ing|ed|es|e|s)$/, '');
  const stem = cut.length >= 3 ? cut : base;
  return /([b-df-hj-np-tv-z])\1$/.test(stem) ? stem.slice(0, -1) : stem;
}
/** Jaccard similarity of folded content words (no stop, number or name words, `others` or `rather`). */
export function phraseSimilarity(
  a: string,
  b: string,
  names: Set<string> = new Set(),
): number {
  const set = (value: string) =>
    new Set(
      words(value)
        .filter(
          (w) =>
            !STOP.has(w) &&
            !NUMBER_WORDS.has(w) &&
            !names.has(w) &&
            w !== 'others' &&
            w !== 'rather',
        )
        .map(fold),
    );
  const x = set(a);
  const y = set(b);
  const union = new Set([...x, ...y]).size;
  return union ? [...x].filter((w) => y.has(w)).length / union : 0;
}

/**
 * Chronological statements with their echoes: later utterances of the given kinds by other agents
 * that contain the statement's key (at least two content words, in order). A sentence that echoes
 * an earlier statement counts as that echo, not as a new statement.
 */
function withEchoes<T extends Statement>(
  statements: T[],
  list: Utterance[],
  kinds: readonly Kind[],
  names: Set<string>,
): (T & { echoes: { actor: string; round: number }[] })[] {
  const repeats: { actor: string; round: number; key: string[] }[] = [];
  const out: (T & { echoes: { actor: string; round: number }[] })[] = [];
  for (const statement of statements) {
    const own = content(statement.text, names);
    if (
      repeats.some(
        (r) =>
          r.actor === statement.actor &&
          r.round === statement.round &&
          contains(own, r.key),
      )
    )
      continue;
    const found =
      statement.key.length < 2
        ? []
        : list.filter(
            (u) =>
              kinds.includes(u.kind) &&
              u.actor !== statement.actor &&
              u.tick > statement.round &&
              contains(content(u.text, names), statement.key),
          );
    for (const u of found)
      repeats.push({ actor: u.actor, round: u.tick, key: statement.key });
    out.push({
      ...statement,
      echoes: found.map((u) => ({ actor: u.actor, round: u.tick })),
    });
  }
  return out;
}

function graph(edges: Map<string, number>): Graph {
  const list = [...edges]
    .map(([key, weight]) => {
      const [from = '', to = ''] = key.split('\u0000');
      return { from, to, weight };
    })
    .sort((a, b) =>
      a.from === b.from
        ? a.to.localeCompare(b.to)
        : a.from.localeCompare(b.from),
    );
  const reciprocated = list.filter((e) =>
    edges.has(`${e.to}\u0000${e.from}`),
  ).length;
  return {
    edges: list,
    pairs: list.length,
    reciprocated,
    reciprocity: ratio(reciprocated, list.length),
  };
}
const bump = (map: Map<string, number>, from: string, to: string) => {
  const key = `${from}\u0000${to}`;
  map.set(key, (map.get(key) ?? 0) + 1);
};

/** Each reply B→A answers the earliest unanswered A→B message sent within the response window. */
export function responseGraph(messages: Utterance[]): Graph {
  const edges = new Map<string, number>();
  const answered = new Set<Utterance>();
  for (const reply of messages)
    if (reply.recipient) {
      const original = messages.find(
        (m) =>
          !answered.has(m) &&
          m.actor === reply.recipient &&
          m.recipient === reply.actor &&
          m.tick < reply.tick &&
          reply.tick - m.tick <= RESPONSE_WINDOW,
      );
      if (original) {
        answered.add(original);
        bump(edges, reply.actor, original.actor);
      }
    }
  return graph(edges);
}

/** Survival: gather, eat, rest, or an interface whose id or name words concern food, water, warmth or shelter. */
export function survivalInterface(
  ability: { id: string; name: string },
  edible: Set<string>,
): boolean {
  if (SURVIVAL_INTERFACES.includes(ability.id)) return true;
  return [...words(ability.id), ...words(ability.name)].some(
    (w) =>
      SURVIVAL_WORDS.some((s) => w.startsWith(s)) || edible.has(singular(w)),
  );
}

const TRANSACTIONAL_WORDS = [
  'food',
  'stock',
  'supply',
  'supplies',
  'reserve',
  'inventory',
  'material',
  'item',
  'resource',
  'nutrition',
  'toxic',
  'edible',
  'harvest',
  'gather',
  'eat',
  'meal',
  'water',
  'location',
  'position',
  'site',
  'route',
  'coordinate',
  'north',
  'south',
  'east',
  'west',
  'distance',
  'give',
  'gave',
  'trade',
  'exchange',
  'swap',
  'offer',
  'share',
  'lend',
  'loan',
  'borrow',
  'transfer',
  'handover',
  'accept',
  'please',
  'need',
  'help',
  'request',
  'ask',
  'meet',
  'join',
  'together',
  'build',
  'carry',
  'collect',
  'fetch',
  'bring',
  'cooperat',
];
/** Transactional: mentions a coordinate, a resource (singular term keys) or a documented trade, request or task word. */
export function transactional(value: string, resources: Set<string>): boolean {
  if (/\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)/.test(value))
    return true;
  const all = words(value);
  const folded = all.map(singular);
  return (
    all.some((w) => TRANSACTIONAL_WORDS.some((k) => w.startsWith(k))) ||
    folded.some((w) => resources.has(w)) ||
    [...resources].some(
      (r) => r.includes(' ') && contains(folded, r.split(' ')),
    )
  );
}

/** Shared derived state of one analysis. */
interface Context {
  input: CultureInput;
  agents: string[];
  order: (a: string, b: string) => number;
  names: Set<string>;
  list: Utterance[];
  /** Whether two actors were within vision radius of each other in a round. */
  near: (a: string, b: string, tick: number) => boolean;
  /** An actor's position in a round, as `positions` carries it forward. */
  at: (actor: string, tick: number) => V7Point | undefined;
  isSurvival: (id: string) => boolean;
  /** The accepted call that produced an actor's plan for a round, or null. */
  call: (actor: string, tick: number) => string | null;
}
interface Receipt {
  actor: string;
  tick: number;
  from: string;
  text: string;
  via: 'message' | 'speech' | 'council' | 'sign';
}

/**
 * Text an actor received from another agent: messages addressed to it, public text spoken within
 * its vision radius, and the dated reports it read at a council meeting.
 */
function receipts(
  c: Pick<Context, 'input' | 'list' | 'agents' | 'near'>,
): Receipt[] {
  const out: Receipt[] = [];
  for (const u of c.list) {
    if (u.kind === 'message' && u.recipient)
      out.push({
        actor: u.recipient,
        tick: u.tick,
        from: u.actor,
        text: u.text,
        via: 'message',
      });
    if (u.kind === 'public')
      for (const actor of c.agents)
        if (actor !== u.actor && c.near(u.actor, actor, u.tick))
          out.push({
            actor,
            tick: u.tick,
            from: u.actor,
            text: u.text,
            via: 'speech',
          });
  }
  for (const round of c.input.rounds)
    for (const e of round.events) {
      const reader = e.actor;
      if (e.type !== 'collective-read' || !reader || !e.success) continue;
      const shared = object(object(e.data).shared);
      const reports = Array.isArray(shared.reports) ? shared.reports : [];
      for (const report of reports.map(object))
        if (text(report.actor) && text(report.actor) !== reader)
          out.push({
            actor: reader,
            tick: round.tick,
            from: text(report.actor),
            text: text(report.text),
            via: 'council',
          });
    }
  return out;
}

function vocabularyMetric(c: Context): CultureMetrics['vocabulary'] {
  const excluded = environmentIndex(c.input.environment);
  const catalogue = new Set(c.input.abilities.map((a) => termKey(a.id)));
  // A name given through a naming action is a term as given, even if the world later repeats it,
  // and any later text containing it uses it.
  const named = new Map<string, string>();
  for (const u of c.list) {
    const key = termKey(u.text);
    if (
      u.kind === 'name' &&
      key &&
      !named.has(key) &&
      !c.names.has(key) &&
      !catalogue.has(key)
    )
      named.set(key, u.text);
  }
  const textCandidates = (value: string) => {
    const found = termCandidates(value, excluded, c.names);
    const folded = words(value).map(singular);
    for (const [key, surface] of named)
      if (!found.some((x) => x.key === key) && contains(folded, key.split(' ')))
        found.push({ key, surface });
    return found;
  };
  const candidates = (u: Utterance) =>
    u.kind === 'name'
      ? named.has(termKey(u.text))
        ? [{ key: termKey(u.text), surface: u.text }]
        : []
      : textCandidates(u.text);
  const uses = new Map<
    string,
    { surface: string; actor: string; tick: number }[]
  >();
  for (const u of c.list)
    for (const { key, surface } of candidates(u)) {
      const all = uses.get(key) ?? [];
      all.push({ surface, actor: u.actor, tick: u.tick });
      uses.set(key, all);
    }
  // Sign texts count as received where they could be seen (fix-log 7g).
  const heard = [...receipts(c), ...signReceipts(c)].map((r) => ({
    ...r,
    keys: new Set(textCandidates(r.text).map((x) => x.key)),
  }));
  const received = (actor: string, key: string, before: number) =>
    heard.some((r) => r.actor === actor && r.tick < before && r.keys.has(key));
  const terms: SharedTerm[] = [...uses].map(([key, all]) => {
    const firstRound = Math.min(...all.map((x) => x.tick));
    const firstUsers = [
      ...new Set(all.filter((x) => x.tick === firstRound).map((x) => x.actor)),
    ].sort(c.order);
    const later = all.filter(
      (x) => x.tick > firstRound && !firstUsers.includes(x.actor),
    );
    const laterUsers = [...new Set(later.map((x) => x.actor))].sort(c.order);
    return {
      term: all[0]?.surface ?? key,
      firstUsers,
      firstRound,
      laterUsers,
      exposedLaterUsers: laterUsers.filter((actor) =>
        received(
          actor,
          key,
          Math.min(
            ...later.filter((x) => x.actor === actor).map((x) => x.tick),
          ),
        ),
      ),
      crossAgentUses: later.length,
    };
  });
  const shared = terms
    .filter((t) => t.laterUsers.length)
    .sort(
      (a, b) =>
        b.laterUsers.length - a.laterUsers.length ||
        b.crossAgentUses - a.crossAgentUses ||
        a.firstRound - b.firstRound ||
        a.term.localeCompare(b.term),
    );
  return {
    terms: terms.length,
    sharedTerms: shared.length,
    transmittedTerms: shared.filter((t) => t.exposedLaterUsers.length).length,
    crossAgentUses: shared.reduce((n, t) => n + t.crossAgentUses, 0),
    top: shared.slice(0, 10),
    topCandidates: [...uses]
      .map(([key, all]) => ({
        term: all[0]?.surface ?? key,
        users: [...new Set(all.map((x) => x.actor))].sort(c.order),
        uses: all.length,
      }))
      .sort(
        (a, b) =>
          b.users.length - a.users.length ||
          b.uses - a.uses ||
          a.term.localeCompare(b.term),
      )
      .slice(0, 10),
  };
}

/** Uses linked by different actors within the window and radius form one episode (single linkage). */
export function activityEpisodes(
  uses: { actor: string; tick: number; at: V7Point }[],
  radius: number,
): Set<string>[] {
  const sorted = [...uses].sort((a, b) => a.tick - b.tick);
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] ?? i;
    return i;
  };
  sorted.forEach((a, i) => {
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (!b || b.tick - a.tick > ACTIVITY_WINDOW) break;
      if (b.actor !== a.actor && distance(a.at, b.at) <= radius)
        parent[find(j)] = find(i);
    }
  });
  const groups = new Map<number, Set<string>>();
  sorted.forEach((a, i) => {
    const root = find(i);
    groups.set(root, (groups.get(root) ?? new Set()).add(a.actor));
  });
  return [...groups.values()].filter((g) => g.size >= 2);
}

function activityMetric(
  c: Context,
  at: Map<number, Map<string, V7Point>>,
): CultureMetrics['activities'] {
  const used = new Map<
    string,
    { actor: string; tick: number; at: V7Point }[]
  >();
  for (const round of c.input.rounds)
    for (const actor of c.agents) {
      const action = round.actions[actor];
      const where = at.get(round.tick)?.get(actor);
      if (
        !action ||
        !where ||
        NON_ACTIVITY_INTERFACES.includes(action.interface) ||
        !succeeded(round, actor)
      )
        continue;
      const all = used.get(action.interface) ?? [];
      all.push({ actor, tick: round.tick, at: where });
      used.set(action.interface, all);
    }
  const byInterface = [...used]
    .map(([id, all]) => {
      const episodes = activityEpisodes(all, c.input.vision);
      return {
        interface: id,
        survival: c.isSurvival(id),
        episodes: episodes.length,
        participants: [...new Set(episodes.flatMap((g) => [...g]))].sort(
          c.order,
        ),
        actorRounds: all.length,
      };
    })
    .filter((x) => x.episodes > 0)
    .sort(
      (a, b) =>
        b.episodes - a.episodes || a.interface.localeCompare(b.interface),
    );
  return {
    window: ACTIVITY_WINDOW,
    radius: c.input.vision,
    excluded: NON_ACTIVITY_INTERFACES,
    repeated: byInterface.filter((x) => x.episodes >= 2).length,
    repeatedNonSurvival: byInterface.filter(
      (x) => x.episodes >= 2 && !x.survival,
    ).length,
    byInterface,
  };
}

function normMetric(c: Context): CultureMetrics['norms'] {
  const heard = receipts(c);
  const performed = (actor: string, id: string, from: number, to: number) =>
    c.input.rounds.find(
      (r) =>
        r.tick >= from &&
        r.tick <= to &&
        r.actions[actor]?.interface === id &&
        succeeded(r, actor),
    )?.tick;
  const phrases = c.input.abilities
    .flatMap((a) => [
      { id: a.id, phrase: normalize(a.id) },
      { id: a.id, phrase: normalize(a.name) },
    ])
    .filter((x) => x.phrase);
  const list: NormStatement[] = withEchoes(
    normStatements(c.list, c.names),
    c.list,
    COMMUNICATION,
    c.names,
  ).map(({ echoes, ...n }) => {
    const modal = NORM.exec(n.text)?.index ?? 0;
    const clause = ` ${normalize(n.text.slice(modal))} `;
    // The earliest interface id or name after the modal; longer ids win ties.
    const prescribed =
      phrases
        .map((x) => ({ id: x.id, index: clause.indexOf(` ${x.phrase} `) }))
        .filter((x) => x.index >= 0)
        .sort((a, b) => a.index - b.index || b.id.length - a.id.length)[0]
        ?.id ?? null;
    // Each receiver's first receipt of the statement starts its echo window.
    const receivers = new Map<string, number>();
    for (const r of heard)
      if (
        r.from === n.actor &&
        r.tick >= n.round &&
        r.text.includes(n.text) &&
        !receivers.has(r.actor)
      )
        receivers.set(r.actor, r.tick);
    const actionEchoes =
      prescribed && n.polarity === 'prescriptive'
        ? [...receivers].flatMap(([actor, tick]) => {
            const round = performed(
              actor,
              prescribed,
              tick + 1,
              tick + ACTION_ECHO_WINDOW,
            );
            const before = performed(
              actor,
              prescribed,
              tick - ACTION_ECHO_WINDOW,
              tick,
            );
            return round !== undefined && before === undefined
              ? [{ actor, round }]
              : [];
          })
        : [];
    return {
      ...n,
      prescribedInterface: prescribed,
      phraseEchoes: echoes,
      actionEchoes,
    };
  });
  return {
    statements: list.length,
    echoed: list.filter((n) => n.phraseEchoes.length || n.actionEchoes.length)
      .length,
    phraseEchoes: list.reduce((n, x) => n + x.phraseEchoes.length, 0),
    actionEchoes: list.reduce((n, x) => n + x.actionEchoes.length, 0),
    privateStatements: normStatements(c.list, c.names, ['note']).length,
    list,
  };
}

function beliefMetric(c: Context): CultureMetrics['beliefs'] {
  const list: BeliefStatement[] = withEchoes(
    beliefStatements(c.list, c.names),
    c.list,
    BELIEF_SOURCES,
    c.names,
  ).map(({ echoes, ...b }) => ({ ...b, citations: echoes }));
  return {
    statements: list.length,
    causal: list.filter((b) => b.type === 'causal').length,
    supernatural: list.filter((b) => b.type === 'supernatural').length,
    cited: list.filter((b) => b.citations.length).length,
    citations: list.reduce((n, b) => n + b.citations.length, 0),
    list,
  };
}

function relationshipMetric(c: Context): CultureMetrics['relationships'] {
  const messages = c.list.filter((u) => u.kind === 'message' && u.recipient);
  const sent = new Map<string, number>();
  for (const m of messages) if (m.recipient) bump(sent, m.actor, m.recipient);
  // Completed transfers: material gives, accepted findings and accepted lessons.
  const transfers = new Map<string, number>();
  for (const round of c.input.rounds)
    for (const e of round.events) {
      if (!e.actor || !e.success) continue;
      const recipient = text(object(e.data).recipient);
      if (e.type === 'given' && c.agents.includes(recipient))
        bump(transfers, e.actor, recipient);
      if (
        (e.type === 'finding-accepted' || e.type === 'lesson-accepted') &&
        e.target &&
        c.agents.includes(e.target)
      )
        bump(transfers, e.target, e.actor);
    }
  return {
    responseWindow: RESPONSE_WINDOW,
    messages: graph(sent),
    responses: responseGraph(messages),
    transfers: graph(transfers),
  };
}

function survivalMetric(c: Context): CultureMetrics['survival'] {
  const interfaces = new Set<string>();
  const perAgent = c.agents.map((actor) => {
    let actorRounds = 0;
    let survivalRounds = 0;
    let restRounds = 0;
    for (const round of c.input.rounds) {
      const id = round.actions[actor]?.interface;
      if (id === undefined) continue;
      actorRounds++;
      if (id === 'rest') restRounds++;
      if (c.isSurvival(id)) {
        survivalRounds++;
        interfaces.add(id);
      }
    }
    return {
      actor,
      actorRounds,
      survivalRounds,
      restRounds,
      share: ratio(survivalRounds, actorRounds),
      shareWithoutRest: ratio(survivalRounds - restRounds, actorRounds),
    };
  });
  const sum = (key: 'actorRounds' | 'survivalRounds' | 'restRounds') =>
    perAgent.reduce((n, a) => n + a[key], 0);
  return {
    actorRounds: sum('actorRounds'),
    survivalRounds: sum('survivalRounds'),
    share: ratio(sum('survivalRounds'), sum('actorRounds')),
    interfaces: [...interfaces].sort(),
    restRounds: sum('restRounds'),
    shareWithoutRest: ratio(
      sum('survivalRounds') - sum('restRounds'),
      sum('actorRounds'),
    ),
    perAgent,
  };
}

export const REST_CRITERION = `Idle rest: a submitted rest whose producing plan step has no condition on the person's energy, or whose recorded recovery the energy cap cut (the person began the round within one nominal rest of the cap). Rest acts as a default idle behavior when idle rests are at least ${String(REST_DEFAULT_SHARE * 100)}% of rests.`;
export const REST_START_CRITERION = `High-start rest: a submitted rest begun, by exact replay, with energy at or above ${String(REST_HIGH_START * 100)}% of the cap. Rest acts as a default when high-start rests are at least ${String(REST_DEFAULT_SHARE * 100)}% of rests with a known start energy.`;

/**
 * Whether `rest` is chosen without an energy need, by two criteria. Criterion 1: a rest is idle
 * when its plan step has no energy condition, or when the energy cap cut its recorded recovery
 * (recovery below nominal times mental factor: already within one rest of full energy).
 * Criterion 2: a rest begun at or above `REST_HIGH_START` of the cap, from exact replay.
 */
function restMetric(c: Context): RestMetrics {
  const energy = c.input.energy;
  const exact = !energy?.unrecordedRestFactor;
  const counts = (actors: string[]): RestCounts => {
    let rests = 0;
    let idle = 0;
    let unconditioned = 0;
    let highEnergy = 0;
    let toFull = 0;
    let withStep = 0;
    let withRecovery = 0;
    let highStart = 0;
    let withStart = 0;
    for (const round of c.input.rounds)
      for (const actor of actors) {
        if (round.actions[actor]?.interface !== 'rest') continue;
        rests++;
        const step = round.restSteps?.[actor];
        const free = step !== undefined && !step.conditioned;
        if (step) withStep++;
        if (free) unconditioned++;
        if (
          step?.target !== null &&
          step?.target !== undefined &&
          energy &&
          step.target >= REST_TO_FULL * energy.cap
        )
          toFull++;
        const rested = round.events.find(
          (e) => e.actor === actor && e.type === 'rested' && e.success,
        );
        const data = object(rested?.data);
        const nominal =
          typeof data.nominal === 'number'
            ? data.nominal
            : energy?.restRecovery;
        const factor =
          typeof data.mentalFactor === 'number' ? data.mentalFactor : 1;
        let high = false;
        if (
          rested &&
          exact &&
          typeof data.recovered === 'number' &&
          nominal !== undefined
        ) {
          withRecovery++;
          high = data.recovered < nominal * factor - 1e-6;
          if (high) highEnergy++;
        }
        if (free || high) idle++;
        const start = round.energy?.[actor];
        if (start !== undefined && energy) {
          withStart++;
          if (start >= REST_HIGH_START * energy.cap - 1e-9) highStart++;
        }
      }
    const verdict = (share: number | null) =>
      share === null ? null : share >= REST_DEFAULT_SHARE;
    const idleShare = ratio(idle, rests);
    const highStartShare = ratio(highStart, withStart);
    return {
      rests,
      idle,
      unconditioned,
      highEnergy: exact ? highEnergy : null,
      toFull,
      withStep,
      withRecovery,
      idleShare,
      default: verdict(idleShare),
      highStart: withStart ? highStart : null,
      withStart,
      highStartShare,
      startDefault: verdict(highStartShare),
    };
  };
  return {
    criterion: REST_CRITERION,
    startCriterion: REST_START_CRITERION,
    defaultShare: REST_DEFAULT_SHARE,
    startShare: REST_HIGH_START,
    toFullShare: REST_TO_FULL,
    ...counts(c.agents),
    perAgent: c.agents.map((actor) => ({ actor, ...counts([actor]) })),
  };
}

export const SHARING_LIMITATIONS = [
  'Rule-based English patterns: a match is a candidate, not an interpretation. Paraphrases outside the patterns are missed (for example "avoiding the patch with only two remaining" or a bare "let\'s coordinate materials"), and a plain logistics sentence can match.',
  'Ideas are coarse classes. A later expression of the same idea is not proof of transmission: everyone shares one model and similar situations, so independent wording is expected.',
  'Exposure covers messages to the person, public speech within the vision radius, council reads and names, marks and invitation signs within the vision radius of where they were made (ignoring sign caps, expiry and obstacles). It does not cover what a person saw others do.',
  'Spoken text is dated by the first round of the plan that wrote it, so exposure must precede the writing, not the speaking. Plan notes and intentions are visible only to their author; owner-only cares and views are reported only in the private memory section.',
  'Project texts other than project ids, and planned steps that were never executed, are not read.',
];

interface SharingItem {
  e: SharingExpression;
  m: SharingMatch;
}
/** Expressions of each utterance sentence that matches a sharing idea, in chronological order. */
function sharingExpressions(c: Context): SharingExpression[] {
  const byTick = new Map(c.input.rounds.map((r) => [r.tick, r]));
  const spoken: readonly Kind[] = ['message', 'public', 'name'];
  return c.list
    .flatMap((u) => {
      const authored = spoken.includes(u.kind)
        ? (byTick.get(u.tick)?.authored?.[u.actor] ?? u.tick)
        : u.tick;
      return sharingMatches(u.text).map((s) => ({
        actor: u.actor,
        round: u.tick,
        authored: Math.min(authored, u.tick),
        kind: u.kind,
        recipient: u.recipient,
        communicated: spoken.includes(u.kind),
        text: s.sentence,
        matches: s.matches,
      }));
    })
    .sort(
      (a, b) =>
        a.authored - b.authored ||
        a.round - b.round ||
        c.order(a.actor, b.actor),
    );
}

/**
 * Earliest receipt by `actor`, before round `before`, of a communicated expression by another
 * person whose idea passes `wanted`: a message, speech heard within the radius, a council read,
 * or a name, mark or invitation sign seen within the vision radius of where it was made.
 */
function sharingExposure(
  c: Context,
): (
  actor: string,
  before: number,
  wanted: (idea: SharingIdea) => boolean,
) => SharingExposure | null {
  const heard = receipts(c);
  const list = sharingExpressions(c).filter((e) => e.communicated);
  const byTick = new Map(c.input.rounds.map((r) => [r.tick, r]));
  const sign = (e: SharingExpression) => {
    const action = byTick.get(e.round)?.actions[e.actor];
    return action && ['name', 'mark', 'invite'].includes(action.interface)
      ? c.at(e.actor, e.round)
      : undefined;
  };
  return (actor, before, wanted) => {
    let best: SharingExposure | null = null;
    for (const e of list) {
      if (e.actor === actor || e.round >= before) continue;
      const idea = e.matches.find((m) => wanted(m.idea))?.idea;
      if (!idea) continue;
      const got = heard.find(
        (r) =>
          r.actor === actor &&
          r.from === e.actor &&
          r.tick >= e.round &&
          r.tick < before &&
          r.text.includes(e.text),
      );
      let received: { tick: number; via: SharingExposure['via'] } | null = got
        ? { tick: got.tick, via: got.via }
        : null;
      const place = sign(e);
      if (place)
        for (const round of c.input.rounds) {
          if (round.tick < e.round || round.tick >= before) continue;
          if (received && round.tick >= received.tick) break;
          const where = c.at(actor, round.tick);
          if (where && distance(where, place) <= c.input.vision) {
            received = { tick: round.tick, via: 'sign' };
            break;
          }
        }
      if (received && (!best || received.tick < best.received))
        best = {
          idea,
          actor: e.actor,
          round: e.round,
          received: received.tick,
          via: received.via,
        };
    }
    return best;
  };
}

function sharingMetric(
  c: Context,
  exposure: ReturnType<typeof sharingExposure>,
): CultureMetrics['sharing'] {
  const list = sharingExpressions(c);
  const items: SharingItem[] = list.flatMap((e) =>
    e.matches.map((m) => ({ e, m })),
  );
  // An idea's earliest authors restating it are not reuses (fix-log 7h).
  const earliest = new Map<SharingIdea, Set<string>>();
  for (const idea of SHARING_IDEAS) {
    const own = items.filter((x) => x.m.idea === idea);
    const first = Math.min(...own.map((x) => x.e.authored));
    earliest.set(
      idea,
      new Set(own.filter((x) => x.e.authored === first).map((x) => x.e.actor)),
    );
  }
  const reuseList: SharingReuse[] = items.flatMap(({ e, m }) => {
    if (earliest.get(m.idea)?.has(e.actor)) return [];
    const earlier = items.filter(
      (x) =>
        x.m.idea === m.idea &&
        x.e.actor !== e.actor &&
        x.e.authored < e.authored,
    );
    const best = earlier
      .map((x) => ({
        x,
        similarity: phraseSimilarity(m.phrase, x.m.phrase, c.names),
      }))
      .reduce<{ x: SharingItem; similarity: number } | null>(
        (top, y) => (!top || y.similarity > top.similarity ? y : top),
        null,
      );
    if (!best) return [];
    return [
      {
        idea: m.idea,
        actor: e.actor,
        round: e.round,
        authored: e.authored,
        kind: e.kind,
        phrase: m.phrase,
        closest: {
          actor: best.x.e.actor,
          round: best.x.e.round,
          authored: best.x.e.authored,
          kind: best.x.e.kind,
          phrase: best.x.m.phrase,
          similarity: best.similarity,
        },
        similarWording: best.similarity >= SHARING_SIMILARITY,
        exposure: exposure(e.actor, e.authored, (idea) => idea === m.idea),
        otherExposure: exposure(e.actor, e.authored, (idea) => idea !== m.idea),
      },
    ];
  });
  const ideas = SHARING_IDEAS.map((idea): SharingIdeaSummary => {
    const own = items.filter((x) => x.m.idea === idea);
    const firstAuthored = own.length
      ? Math.min(...own.map((x) => x.e.authored))
      : null;
    const firstUsers = [
      ...new Set(
        own.filter((x) => x.e.authored === firstAuthored).map((x) => x.e.actor),
      ),
    ].sort(c.order);
    const reuses = reuseList.filter(
      (r) => r.idea === idea && !firstUsers.includes(r.actor),
    );
    const laterUsers = [...new Set(reuses.map((r) => r.actor))].sort(c.order);
    return {
      idea,
      description: SHARING_DESCRIPTIONS[idea],
      expressions: own.length,
      communicated: own.filter((x) => x.e.communicated).length,
      people: [...new Set(own.map((x) => x.e.actor))].sort(c.order),
      firstUsers,
      firstAuthored,
      laterUsers,
      exposedLaterUsers: laterUsers.filter(
        (actor) => reuses.find((r) => r.actor === actor)?.exposure,
      ),
    };
  });
  return {
    expressions: list.length,
    communicated: list.filter((e) => e.communicated).length,
    reuses: reuseList.length,
    similarReuses: reuseList.filter((r) => r.similarWording).length,
    exposedReuses: reuseList.filter((r) => r.exposure).length,
    similarityThreshold: SHARING_SIMILARITY,
    ideas,
    list,
    reuseList,
    limitations: SHARING_LIMITATIONS,
  };
}

function communicationMetric(c: Context): CultureMetrics['nonTransactional'] {
  const resources = new Set(
    c.input.resources
      .flatMap((r) => [termKey(r.id), termKey(r.name)])
      .filter((w) => w && !c.names.has(w)),
  );
  const communication = c.list.filter((u) => COMMUNICATION.includes(u.kind));
  const nonTransactional = communication.filter(
    (u) => !transactional(u.text, resources),
  ).length;
  return {
    messages: communication.length,
    nonTransactional,
    share: ratio(nonTransactional, communication.length),
  };
}

function symbolicMetric(c: Context): CultureMetrics['symbolic'] {
  const perAgent = c.agents.map((actor) => {
    const byInterface: Record<string, number> = Object.fromEntries(
      SYMBOLIC_INTERFACES.map((id) => [id, 0]),
    );
    let attempted = 0;
    let done = 0;
    for (const round of c.input.rounds) {
      const id = round.actions[actor]?.interface ?? '';
      if (!(id in byInterface)) continue;
      attempted++;
      if (succeeded(round, actor)) {
        done++;
        byInterface[id] = (byInterface[id] ?? 0) + 1;
      }
    }
    return { actor, attempted, succeeded: done, byInterface };
  });
  return {
    interfaces: [...SYMBOLIC_INTERFACES],
    perAgent,
    everyAgentAtLeastOne:
      perAgent.length > 0 && perAgent.every((a) => a.succeeded >= 1),
  };
}

/** Jaccard similarity of two content-word sets; null when both are empty. */
export function contentSimilarity(
  a: string,
  b: string,
  names: Set<string>,
): number | null {
  const x = new Set(content(a, names));
  const y = new Set(content(b, names));
  const union = new Set([...x, ...y]).size;
  return union ? [...x].filter((w) => y.has(w)).length / union : null;
}

const mean = (values: number[]) =>
  values.reduce((n, v) => n + v, 0) / values.length;

function trend<T extends { round: number; similarity: number | null }>(
  samples: T[],
): PrivateTrend<T> {
  const scored = samples.filter((s) => s.similarity !== null);
  const points = scored.map((s) => ({ x: s.round, y: s.similarity ?? 0 }));
  const first = scored[0] ?? null;
  const last = scored.at(-1) ?? null;
  if (points.length < 2 || !first || !last)
    return { first, last, change: null, slopePer100Rounds: null };
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  const sxx = points.reduce((n, p) => n + (p.x - mx) ** 2, 0);
  const sxy = points.reduce((n, p) => n + (p.x - mx) * (p.y - my), 0);
  return {
    first,
    last,
    change: (last.similarity ?? 0) - (first.similarity ?? 0),
    slopePer100Rounds: (sxy / sxx) * 100,
  };
}

/**
 * Owner-only private memory, rebuilt from the round memory updates exactly as replay applies
 * them: omitted fields persist, an empty text forgets, views apply in person-id order and only
 * the most recently updated people are kept. Reported apart from every public metric.
 */
export function privateMemoryMetric(
  input: CultureInput,
  exposure?: ReturnType<typeof sharingExposure>,
): PrivateMemoryMetrics | null {
  const agents = input.actors.map((a) => a.id);
  const updated = input.rounds.some((r) =>
    agents.some((a) => r.memory[a]?.cares !== undefined || r.memory[a]?.views),
  );
  if (!input.voice && !updated) return null;
  const names = actorWords(input);
  const history = () => ({ writes: 0, changes: 0, forgotten: 0 });
  const state = new Map(
    agents.map((actor) => [
      actor,
      {
        cares: { ...history(), current: null as string | null, ever: false },
        views: {
          ...history(),
          current: [] as { person: string; view: string; round: number }[],
        },
      },
    ]),
  );
  const viewed = new Map<string, Set<string>>();
  // Sharing ideas in each distinct private text, dated by its first write.
  const sharing: PrivateSharingExpression[] = [];
  const written = new Set<string>();
  const scan = (
    actor: string,
    round: number,
    field: 'cares' | 'view',
    person: string | null,
    value: string,
  ) => {
    const key = [actor, field, person ?? '', value].join('\u0000');
    if (!value || written.has(key)) return;
    written.add(key);
    for (const s of sharingMatches(value))
      sharing.push({
        actor,
        round,
        field,
        person,
        text: s.sentence,
        matches: s.matches,
        exposure:
          exposure?.(actor, round, (idea) =>
            s.matches.some((m) => m.idea === idea),
          ) ?? null,
      });
  };
  const viewSamples: ViewConvergenceSample[] = [];
  const caresSamples: CaresSimilaritySample[] = [];
  const sample = (round: number) => {
    // Observers' current views of each target, in actor order.
    const byTarget = new Map<string, string[]>();
    for (const observer of agents)
      for (const v of state.get(observer)?.views.current ?? [])
        if (v.person !== observer)
          byTarget.set(v.person, [...(byTarget.get(v.person) ?? []), v.view]);
    const perTarget: number[] = [];
    let viewPairs = 0;
    for (const views of byTarget.values()) {
      const scores = views.flatMap((a, i) =>
        views.slice(i + 1).flatMap((b) => {
          const s = contentSimilarity(a, b, names);
          return s === null ? [] : [s];
        }),
      );
      if (!scores.length) continue;
      perTarget.push(mean(scores));
      viewPairs += scores.length;
    }
    viewSamples.push({
      round,
      similarity: perTarget.length ? mean(perTarget) : null,
      targets: perTarget.length,
      pairs: viewPairs,
    });
    const cares = agents.flatMap((a) => {
      const c = state.get(a)?.cares.current;
      return c ? [c] : [];
    });
    const scores = cares.flatMap((a, i) =>
      cares.slice(i + 1).flatMap((b) => {
        const s = contentSimilarity(a, b, names);
        return s === null ? [] : [s];
      }),
    );
    caresSamples.push({
      round,
      similarity: scores.length ? mean(scores) : null,
      people: cares.length,
      pairs: scores.length,
    });
  };
  input.rounds.forEach((round, index) => {
    for (const actor of agents) {
      const update = round.memory[actor];
      const own = state.get(actor);
      if (!update || !own) continue;
      if (update.cares !== undefined) {
        const before = own.cares.current;
        const after = update.cares === '' ? null : update.cares;
        own.cares.writes++;
        if (after !== before) own.cares.changes++;
        if (before !== null && after === null) own.cares.forgotten++;
        if (after !== null) own.cares.ever = true;
        own.cares.current = after;
        scan(actor, round.tick, 'cares', null, after ?? '');
      }
      if (!update.views) continue;
      let held = own.views.current;
      for (const person of Object.keys(update.views).sort()) {
        const view = update.views[person] ?? '';
        const before = held.find((v) => v.person === person);
        own.views.writes++;
        if (view !== '' && before?.view !== view) own.views.changes++;
        if (view === '' && before) {
          own.views.changes++;
          own.views.forgotten++;
        }
        held = held.filter((v) => v.person !== person);
        scan(actor, round.tick, 'view', person, view);
        if (view !== '') {
          held.push({ person, view, round: round.tick });
          viewed.set(actor, (viewed.get(actor) ?? new Set()).add(person));
        }
      }
      own.views.current = held.slice(-EXPRESSION_MEMORY.people);
    }
    if (
      round.tick % PRIVATE_SAMPLE_INTERVAL === 0 ||
      index === input.rounds.length - 1
    )
      sample(round.tick);
  });
  const perAgent = agents.map((actor) => {
    const own = state.get(actor);
    return {
      actor,
      cares: {
        writes: own?.cares.writes ?? 0,
        changes: own?.cares.changes ?? 0,
        forgotten: own?.cares.forgotten ?? 0,
        current: own?.cares.current ?? null,
      },
      views: {
        writes: own?.views.writes ?? 0,
        changes: own?.views.changes ?? 0,
        forgotten: own?.views.forgotten ?? 0,
        current: own?.views.current ?? [],
      },
    };
  });
  const total = (key: 'cares' | 'views') => ({
    writes: perAgent.reduce((n, a) => n + a[key].writes, 0),
    changes: perAgent.reduce((n, a) => n + a[key].changes, 0),
    forgotten: perAgent.reduce((n, a) => n + a[key].forgotten, 0),
  });
  return {
    visibility: 'owner-only',
    note: 'Each person sees only their own cares and views; no other person can see them. No public metric reads them.',
    cares: {
      ...total('cares'),
      people: agents.filter((a) => state.get(a)?.cares.ever).length,
      holding: perAgent.filter((a) => a.cares.current !== null).length,
    },
    views: {
      ...total('views'),
      observers: viewed.size,
      targets: new Set([...viewed.values()].flatMap((s) => [...s])).size,
      holding: perAgent.filter((a) => a.views.current.length).length,
      entries: perAgent.reduce((n, a) => n + a.views.current.length, 0),
    },
    perAgent,
    sampleInterval: PRIVATE_SAMPLE_INTERVAL,
    similarity: 'jaccard-content-words',
    viewConvergence: { samples: viewSamples, trend: trend(viewSamples) },
    caresSimilarity: { samples: caresSamples, trend: trend(caresSamples) },
    sharing: {
      expressions: sharing,
      byIdea: Object.fromEntries(
        SHARING_IDEAS.map((idea) => [
          idea,
          sharing.filter((x) => x.matches.some((m) => m.idea === idea)).length,
        ]),
      ) as Record<SharingIdea, number>,
    },
  };
}

/** Interfaces reported as idle apart from survival under the revised G2. */
export const IDLE_INTERFACES = ['rest', 'wait'];

function idleMetric(c: Context): CultureMetrics['idle'] {
  const perAgent = c.agents.map((actor) => {
    let actorRounds = 0;
    let rest = 0;
    let wait = 0;
    for (const round of c.input.rounds) {
      const id = round.actions[actor]?.interface;
      if (id === undefined) continue;
      actorRounds++;
      if (id === 'rest') rest++;
      if (id === 'wait') wait++;
    }
    return {
      actor,
      actorRounds,
      rest,
      wait,
      share: ratio(rest + wait, actorRounds),
    };
  });
  const sum = (key: 'actorRounds' | 'rest' | 'wait') =>
    perAgent.reduce((n, a) => n + a[key], 0);
  return {
    interfaces: [...IDLE_INTERFACES],
    actorRounds: sum('actorRounds'),
    rest: sum('rest'),
    wait: sum('wait'),
    rounds: sum('rest') + sum('wait'),
    share: ratio(sum('rest') + sum('wait'), sum('actorRounds')),
    perAgent,
  };
}

/**
 * Sign texts: the given name of a `name`, the text of a `mark` and the note of an `invite`,
 * placed where their author stood. Each is received by every other person at the first round
 * they come within the vision radius of that place, ignoring sign caps, expiry and obstacles,
 * as the sharing exposure does (fix-log 7g).
 */
function signReceipts(c: Pick<Context, 'input' | 'agents' | 'at'>): Receipt[] {
  const out: Receipt[] = [];
  for (const round of c.input.rounds)
    for (const actor of c.agents) {
      const action = round.actions[actor];
      if (
        !action ||
        !['name', 'mark', 'invite'].includes(action.interface) ||
        !succeeded(round, actor)
      )
        continue;
      const args = object(action.args);
      const keys =
        action.interface === 'invite'
          ? ['text', 'message', 'content', 'invitation']
          : ['name', 'label', 'title', 'text', 'mark', 'symbol'];
      const said = keys.map((k) => text(args[k])).filter(Boolean);
      const place = c.at(actor, round.tick);
      if (!said.length || !place) continue;
      for (const other of c.agents) {
        if (other === actor) continue;
        const seen = c.input.rounds.find((r) => {
          if (r.tick < round.tick) return false;
          const where = c.at(other, r.tick);
          return !!where && distance(where, place) <= c.input.vision;
        });
        if (seen)
          for (const value of said)
            out.push({
              actor: other,
              tick: seen.tick,
              from: actor,
              text: value,
              via: 'sign',
            });
      }
    }
  return out;
}

/** Thresholds of phrase propagation; see `phraseMatch`. */
export const PHRASE_RULE = {
  /** Shared words, in order (the longest common subsequence), single letters excluded. */
  minShared: 4,
  /** Shared words over the words of the shorter clause. */
  coverage: 0.5,
  /** Shared content words: not function, number, name, survival, resource or interface words. */
  content: 2,
} as const;
export const PHRASE_CRITERION = `Phrase propagation: a clause (text between sentence punctuation, semicolons, colons, dashes or commas) by one person that shares at least ${String(PHRASE_RULE.minShared)} words in order with a clause another person had communicated earlier (at least ${String(PHRASE_RULE.coverage * 100)}% of the shorter clause, including at least ${String(PHRASE_RULE.content)} content words), written after the person received that text and not before its first author wrote it. Content words exclude function words and contraction fragments, numbers, names, common light verbs, directions, trade and task words, survival words, and the words of resources, world objects and interfaces. Clauses that also match authored prompt, catalogue or world text are excluded. Only propagations into spoken, sent or posted text count as adopted sayings for G2; plan notes and intentions are listed apart.`;
/** Folded words that never count as content in a phrase. */
const PHRASE_FUNCTION = new Set(
  [
    ...STOP,
    ...NUMBER_WORDS,
    ...TRANSACTIONAL_WORDS,
    ...`t s d ll ve re m don didn doesn isn wasn aren weren won can couldn wouldn shouldn haven hasn hadn
take make get keep put set check try use see look find start finish continue stay inspect study learn plan
north south east west northern southern eastern western northeast northwest southeast southwest`.split(
      /\s+/,
    ),
  ]
    .filter(Boolean)
    .map(fold),
);

/** Clauses of a text: split at sentence punctuation, semicolons, colons, dashes and commas. */
export function phraseClauses(value: string): string[] {
  return value
    .split(/[.!?;:\n]+|,|\s[–—-]\s|[–—]/)
    .map((s) => s.trim())
    .filter((s) => phraseTokens(s).length >= PHRASE_RULE.minShared);
}
/** Folded words of a clause, single letters removed. */
export function phraseTokens(value: string): string[] {
  return words(value)
    .filter((w) => w.length > 1)
    .map(fold);
}
function lcs(a: string[], b: string[]): string[] {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) {
      const row = table[i] ?? [];
      row[j] =
        a[i] === b[j]
          ? (table[i + 1]?.[j + 1] ?? 0) + 1
          : Math.max(table[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const x = a[i] ?? '';
    if (x === b[j]) {
      out.push(x);
      i++;
      j++;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) i++;
    else j++;
  }
  return out;
}
/**
 * Whether two clauses' folded words share a phrase under `PHRASE_RULE`, with the shared words
 * and their coverage of the shorter clause; null otherwise.
 */
export function phraseMatch(
  a: string[],
  b: string[],
  content: (w: string) => boolean,
): { shared: string[]; coverage: number } | null {
  const shorter = Math.min(a.length, b.length);
  if (shorter < PHRASE_RULE.minShared) return null;
  const shared = lcs(a, b);
  const coverage = shared.length / shorter;
  return shared.length >= PHRASE_RULE.minShared &&
    coverage >= PHRASE_RULE.coverage &&
    new Set(shared.filter(content)).size >= PHRASE_RULE.content
    ? { shared, coverage }
    : null;
}

export interface PhrasePropagation {
  actor: string;
  round: number;
  authored: number;
  kind: Kind;
  call: string | null;
  text: string;
  source: {
    actor: string;
    round: number;
    authored: number;
    kind: Kind;
    call: string | null;
    text: string;
  };
  shared: string[];
  coverage: number;
  received: { tick: number; via: Receipt['via'] };
}
interface Clause {
  actor: string;
  round: number;
  authored: number;
  kind: Kind;
  communicated: boolean;
  text: string;
  tokens: string[];
}

function phraseMetric(c: Context, heard: Receipt[]): CultureMetrics['phrases'] {
  const byTick = new Map(c.input.rounds.map((r) => [r.tick, r]));
  const spoken: readonly Kind[] = ['message', 'public', 'name'];
  const excluded = new Set(
    [
      ...c.input.resources.flatMap((r) => [r.id, r.name]),
      ...c.input.abilities.flatMap((a) => [a.id, a.name]),
      ...(c.input.objects ?? []),
    ].flatMap((value) => words(value).map(fold)),
  );
  const names = new Set([...c.names].map(fold));
  const content = (w: string) =>
    !PHRASE_FUNCTION.has(w) &&
    !names.has(w) &&
    !excluded.has(w) &&
    !SURVIVAL_WORDS.some((s) => w.startsWith(s));
  const clauses: Clause[] = c.list
    .filter((u) => u.kind !== 'project')
    .flatMap((u) => {
      const authored = spoken.includes(u.kind)
        ? Math.min(byTick.get(u.tick)?.authored?.[u.actor] ?? u.tick, u.tick)
        : u.tick;
      return phraseClauses(u.text).map((t) => ({
        actor: u.actor,
        round: u.tick,
        authored,
        kind: u.kind,
        communicated: spoken.includes(u.kind),
        text: t,
        tokens: phraseTokens(t),
      }));
    });
  const environment = c.input.environment
    .flatMap(phraseClauses)
    .map(phraseTokens);
  const authored = (x: string[]) =>
    environment.some((e) => phraseMatch(e, x, content));
  const sources = clauses.filter((x) => x.communicated);
  const list: PhrasePropagation[] = [];
  for (const t of clauses) {
    const candidates = sources
      .filter((s) => s.actor !== t.actor && s.authored < t.authored)
      .map((s) => ({ s, m: phraseMatch(s.tokens, t.tokens, content) }))
      .filter(
        (x): x is { s: Clause; m: { shared: string[]; coverage: number } } =>
          x.m !== null,
      )
      .sort((a, b) => a.s.authored - b.s.authored || a.s.round - b.s.round);
    for (const { s, m } of candidates) {
      // The person had written this phrase no later than its source: not an adoption.
      if (
        clauses.some(
          (x) =>
            x.actor === t.actor &&
            x.authored <= s.authored &&
            phraseMatch(x.tokens, s.tokens, content),
        )
      )
        continue;
      const got = heard.find(
        (r) =>
          r.actor === t.actor &&
          r.from === s.actor &&
          r.tick >= s.round &&
          r.tick < t.authored &&
          r.text.includes(s.text),
      );
      if (!got || authored(m.shared)) continue;
      list.push({
        actor: t.actor,
        round: t.round,
        authored: t.authored,
        kind: t.kind,
        call: c.call(t.actor, t.round),
        text: t.text,
        source: {
          actor: s.actor,
          round: s.round,
          authored: s.authored,
          kind: s.kind,
          call: c.call(s.actor, s.round),
          text: s.text,
        },
        shared: m.shared,
        coverage: m.coverage,
        received: { tick: got.tick, via: got.via },
      });
      break;
    }
  }
  const adoptions = new Set(
    list.map((p) => `${p.source.actor}\u0000${p.source.text}\u0000${p.actor}`),
  );
  return {
    criterion: PHRASE_CRITERION,
    propagations: list.length,
    adoptions: adoptions.size,
    communicated: list.filter((p) => COMMUNICATION.includes(p.kind)).length,
    list,
  };
}

export interface InvitationRecord {
  host: string;
  round: number;
  call: string | null;
  sign: string;
  place: V7Point;
  meetingRound: number;
  text: string;
  /** People who received the invitation (speech within the radius or the sign) by the meeting round. */
  heard: string[];
  /** The world's attendance record at the meeting round; null if none was retained. */
  attendance: {
    event: string | null;
    present: string[];
    came: string[];
  } | null;
  /** Guests within the meeting radius at any round of the meeting and its grace period, first round each. */
  arrivals: { actor: string; round: number; call: string | null }[];
  /** Speech by the host and the arrived guests at the place during the meeting and its grace period. */
  speech: {
    actor: string;
    round: number;
    call: string | null;
    text: string;
  }[];
}
export const INVITATION_CRITERION = `Invitation attendance: for each invitation, the world's own attendance record at the invited round (present: within ${String(EXPRESSION_LIMITS.meetingRadius)} units of the place; came: present people who had heard it away from the place), plus every guest within that radius at any round from the invited round through the ${String(EXPRESSION_LIMITS.invitationGrace)}-round grace period, and what the host and those guests said there.`;

function invitationMetric(c: Context, heard: Receipt[]): InvitationRecord[] {
  const out: InvitationRecord[] = [];
  for (const round of c.input.rounds)
    for (const e of round.events) {
      if (e.type !== 'invited' || !e.success || !e.actor) continue;
      const data = object(e.data);
      const meeting = object(data.meeting);
      const sign = text(data.sign) || (e.target ?? '');
      const place = { x: Number(meeting.x), y: Number(meeting.y) };
      const meetingRound = Number(meeting.round);
      if (!Number.isFinite(place.x) || !Number.isSafeInteger(meetingRound))
        continue;
      const host = e.actor;
      const said = text(data.text);
      const last = meetingRound + EXPRESSION_LIMITS.invitationGrace;
      const attended = c.input.rounds
        .flatMap((r) => r.events)
        .find((x) => x.type === 'attendance' && x.target === sign);
      const at = object(attended?.data);
      const list = (value: unknown) =>
        Array.isArray(value) ? value.map(text).filter(Boolean) : [];
      const arrivals = c.agents.flatMap((actor) => {
        if (actor === host) return [];
        const first = c.input.rounds.find((r) => {
          if (r.tick < meetingRound || r.tick > last) return false;
          const where = c.at(actor, r.tick);
          return (
            !!where && distance(where, place) <= EXPRESSION_LIMITS.meetingRadius
          );
        });
        return first
          ? [{ actor, round: first.tick, call: c.call(actor, first.tick) }]
          : [];
      });
      const people = new Set([host, ...arrivals.map((a) => a.actor)]);
      out.push({
        host,
        round: round.tick,
        call: c.call(host, round.tick),
        sign,
        place,
        meetingRound,
        text: said,
        heard: c.agents.filter((actor) =>
          heard.some(
            (r) =>
              r.actor === actor &&
              r.from === host &&
              r.tick >= round.tick &&
              r.tick <= meetingRound &&
              !!said &&
              r.text.includes(said),
          ),
        ),
        attendance: attended
          ? {
              event: attended.id,
              present: list(at.present),
              came: list(at.came),
            }
          : null,
        arrivals,
        speech: c.list
          .filter((u) => {
            if (!COMMUNICATION.includes(u.kind) || !people.has(u.actor))
              return false;
            if (u.tick < meetingRound || u.tick > last) return false;
            const where = c.at(u.actor, u.tick);
            return (
              !!where &&
              distance(where, place) <= EXPRESSION_LIMITS.meetingRadius
            );
          })
          .map((u) => ({
            actor: u.actor,
            round: u.tick,
            call: c.call(u.actor, u.tick),
            text: u.text,
          })),
      });
    }
  return out;
}

/** A person-made world object (not a sign), as the archive's worlds retain it. */
export interface CultureWork {
  id: string;
  kind: string;
  name: string;
  maker: string;
  created: number;
  /** First round an event reported the object complete, else null. */
  completed: number | null;
  /** Status at the last retained sighting, if the object records one. */
  status: string | null;
}
export interface WorkRecord extends CultureWork {
  call: string | null;
}

const APPEARANCE =
  /\b(?:patterns?|looks?|shapes?|colou?rs?|textures?|grain|weave|woven|appearance|design|form|beauty|beautiful|pretty|handsome|elegant)\b/i;
const APPRECIATE =
  /\b(?:like[sd]?|lov(?:e|es|ed)|enjoy(?:s|ed)?|admir(?:e|es|ed)|appreciat(?:e|es|ed)|valu(?:e|es|ed)|treasur(?:e|es|ed)|glad|pleased|delight(?:ed)?|beautiful|pretty|handsome|elegant)\b/i;
const FUNCTION_FAILED =
  /\btoo\s+(?:strong|weak|wet|small|cold|loose)\b|\b(?:no|without)\s+(?:\w+\s+)?(?:shelter|effect|protection|benefit|warmth|shielding|comfort)\b|\b(?:gave|gives|give|had|has|have)\s+no\b|\b(?:did|does|do|would|will|could)(?:n['’]t|\s+not)\s+(?:work|help|block|shelter|shield|protect|hold|keep)\b|\bwon['’]t\s+(?:work|help|block|shelter|shield|protect|hold)\b|\bfail(?:ed|s|ure)?\b|\buseless\b|\bunsuitable\b|\bnot\s+(?:effective|useful|working)\b/i;
export const APPEARANCE_CRITERION = `Valued for appearance despite a functional failure: an utterance (spoken, sent or posted text, a plan note or intention) that names a person-made object's kind by its head word, reports that the object failed at its function (for example "too strong for its shelter effect", "gave no", "didn't work", "failed") and, in one sentence, values its appearance (an appreciation word with a pattern, look, shape, colour, texture, grain or weave, or "beautiful"). Acknowledgements are later texts within ${String(RESPONSE_WINDOW)} rounds by people who had received the statement and repeat its appearance word with an appreciation word.`;

export interface AppearanceValue {
  actor: string;
  round: number;
  kind: Kind;
  call: string | null;
  text: string;
  work: string;
  failure: string;
  appearance: string;
  acknowledgements: {
    actor: string;
    round: number;
    call: string | null;
    text: string;
  }[];
}

function appearanceMetric(
  c: Context,
  works: CultureWork[],
  heard: Receipt[],
): AppearanceValue[] {
  const head = (w: CultureWork) => w.kind.split(/[^a-z]+/i).at(-1) ?? w.kind;
  const valued = (sentence: string) =>
    APPRECIATE.test(sentence)
      ? [...sentence.matchAll(new RegExp(APPEARANCE.source, 'gi'))]
          .map((x) => x[0].toLowerCase())
          .join(', ') || undefined
      : undefined;
  const out: AppearanceValue[] = [];
  for (const u of c.list) {
    if (u.kind === 'project' || u.kind === 'name') continue;
    const failure = FUNCTION_FAILED.exec(u.text)?.[0];
    if (!failure) continue;
    const appearance = sentences(u.text).map(valued).find(Boolean);
    if (!appearance) continue;
    const mentioned = works.filter(
      (w) =>
        w.created <= u.tick &&
        new RegExp(`\\b${head(w)}s?\\b`, 'i').test(u.text),
    );
    const work =
      mentioned.filter((w) => w.maker === u.actor).at(-1) ?? mentioned.at(-1);
    if (!work) continue;
    const appearanceWords = appearance.split(', ');
    out.push({
      actor: u.actor,
      round: u.tick,
      kind: u.kind,
      call: c.call(u.actor, u.tick),
      text: u.text,
      work: work.id,
      failure,
      appearance,
      acknowledgements: c.list
        .filter(
          (x) =>
            x.actor !== u.actor &&
            x.tick > u.tick &&
            x.tick <= u.tick + RESPONSE_WINDOW &&
            x.kind !== 'project' &&
            sentences(x.text).some(
              (s) =>
                APPRECIATE.test(s) &&
                appearanceWords.some((w) =>
                  new RegExp(`\\b${w}\\b`, 'i').test(s),
                ),
            ) &&
            heard.some(
              (r) =>
                r.actor === x.actor &&
                r.from === u.actor &&
                r.tick >= u.tick &&
                r.tick <= x.tick &&
                r.text.includes(u.text.slice(0, 80)),
            ),
        )
        .map((x) => ({
          actor: x.actor,
          round: x.tick,
          call: c.call(x.actor, x.tick),
          text: x.text,
        })),
    });
  }
  return out;
}

/** One dated item of a run's timeline of names, rules, invitations, attendance and works. */
export interface TimelineItem {
  round: number;
  type:
    | 'name'
    | 'name-adopted'
    | 'rule'
    | 'rule-adopted'
    | 'saying-adopted'
    | 'invitation'
    | 'attendance'
    | 'work-started'
    | 'work-completed'
    | 'valued-appearance';
  actor: string | null;
  /** The model call that produced the actor's plan for that round; null for world records. */
  call: string | null;
  /** Other people involved, each with the call that produced their plan, if any. */
  people: { actor: string; call: string | null }[];
  text: string;
  ref: string | null;
}
export interface AdoptedItem {
  type: 'name' | 'saying' | 'rule';
  text: string;
  origin: string;
  round: number;
  adopter: string;
  adoptedRound: number;
  via: Receipt['via'] | 'action';
  call: string | null;
}

export const G2_REVISION = {
  id: 'G2-group',
  date: '2026-11-25',
  postHoc: true,
  reason:
    'Revised by the user after reviewing ex16 and ex17, after both had failed the original gate. The original per-person symbolic condition fails a whole run on one solitary or silent person, and the original survival share counts idle rest as survival; neither half measures shared culture by itself. The revision judges the group and requires that some content (a name, saying or rule) be adopted by another person.',
  criteria: [
    'Survival actor-rounds other than idle rest and wait below 50% of actor-rounds (wait is never survival; rest and wait are reported as idle).',
    'At least half of the people make at least one successful symbolic action (name, mark, tell or invite).',
    'At least one name, saying or rule adopted by another person who had received it: a transmitted term, a phrase propagation, a norm echoed after receipt, or a sharing reuse with similar wording after receipt.',
  ],
} as const;

function gateMetric(
  m: Pick<
    CultureMetrics,
    'agents' | 'survival' | 'symbolic' | 'vocabulary' | 'norms' | 'sharing'
  >,
  phrases: CultureMetrics['phrases'],
  heard: Receipt[],
  call: Context['call'],
  firstUse: (term: string, actor: string, after: number) => number | null,
): CultureMetrics['gate'] {
  const survivalShare = m.survival.shareWithoutRest;
  const people = m.symbolic.perAgent
    .filter((a) => a.succeeded >= 1)
    .map((a) => a.actor);
  const required = Math.ceil(m.agents.length / 2);
  const names: AdoptedItem[] = m.vocabulary.top.flatMap((t) =>
    t.exposedLaterUsers.flatMap((adopter) => {
      const round = firstUse(t.term, adopter, t.firstRound);
      return round === null
        ? []
        : [
            {
              type: 'name' as const,
              text: t.term,
              origin: t.firstUsers.join(', '),
              round: t.firstRound,
              adopter,
              adoptedRound: round,
              via:
                heard.find(
                  (r) =>
                    r.actor === adopter &&
                    r.tick < round &&
                    termKey(r.text).includes(termKey(t.term)),
                )?.via ?? 'speech',
              call: call(adopter, round),
            },
          ];
    }),
  );
  const sayings: AdoptedItem[] = phrases.list
    .filter((p) => COMMUNICATION.includes(p.kind))
    .map((p) => ({
      type: 'saying',
      text: p.source.text,
      origin: p.source.actor,
      round: p.source.round,
      adopter: p.actor,
      adoptedRound: p.round,
      via: p.received.via,
      call: p.call,
    }));
  const rules: AdoptedItem[] = [
    ...m.norms.list.flatMap((n) => [
      ...n.phraseEchoes
        .filter((e) =>
          heard.some(
            (r) =>
              r.actor === e.actor &&
              r.from === n.actor &&
              r.tick >= n.round &&
              r.tick < e.round &&
              r.text.includes(n.text),
          ),
        )
        .map((e) => ({
          type: 'rule' as const,
          text: n.text,
          origin: n.actor,
          round: n.round,
          adopter: e.actor,
          adoptedRound: e.round,
          via: 'speech' as const,
          call: call(e.actor, e.round),
        })),
      ...n.actionEchoes.map((e) => ({
        type: 'rule' as const,
        text: n.text,
        origin: n.actor,
        round: n.round,
        adopter: e.actor,
        adoptedRound: e.round,
        via: 'action' as const,
        call: call(e.actor, e.round),
      })),
    ]),
    ...m.sharing.reuseList
      .filter((r) => r.exposure && r.similarWording)
      .map((r) => ({
        type: 'rule' as const,
        text: r.closest.phrase,
        origin: r.closest.actor,
        round: r.closest.round,
        adopter: r.actor,
        adoptedRound: r.round,
        via: r.exposure?.via ?? ('speech' as const),
        call: call(r.actor, r.round),
      })),
  ];
  const survival = survivalShare !== null && survivalShare < 0.5;
  const symbolic = people.length >= required;
  const adopted = names.length + sayings.length + rules.length > 0;
  const originalSurvival = m.survival.share !== null && m.survival.share < 0.5;
  return {
    ...G2_REVISION,
    survival: { share: survivalShare, threshold: 0.5, passed: survival },
    symbolic: { people, required, passed: symbolic },
    adoption: { names, sayings, rules, passed: adopted },
    passed: survival && symbolic && adopted,
    original: {
      survivalShare: m.survival.share,
      everyAgentAtLeastOne: m.symbolic.everyAgentAtLeastOne,
      passed: originalSurvival && m.symbolic.everyAgentAtLeastOne,
    },
  };
}

function timelineMetric(
  c: Context,
  m: Pick<CultureMetrics, 'norms' | 'sharing' | 'gate'>,
  invitations: InvitationRecord[],
  works: WorkRecord[],
  appearance: AppearanceValue[],
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const round of c.input.rounds)
    for (const actor of c.agents) {
      const action = round.actions[actor];
      if (
        !action ||
        !['name', 'mark'].includes(action.interface) ||
        !succeeded(round, actor)
      )
        continue;
      const args = object(action.args);
      const value = ['name', 'label', 'title', 'text', 'mark', 'symbol']
        .map((k) => text(args[k]))
        .find(Boolean);
      if (value)
        items.push({
          round: round.tick,
          type: 'name',
          actor,
          call: c.call(actor, round.tick),
          people: [],
          text: `${action.interface}: ${value}`,
          ref:
            round.events.find(
              (e) => e.actor === actor && ['named', 'marked'].includes(e.type),
            )?.target ?? null,
        });
    }
  for (const n of m.norms.list)
    if (COMMUNICATION.includes(n.kind))
      items.push({
        round: n.round,
        type: 'rule',
        actor: n.actor,
        call: c.call(n.actor, n.round),
        people: [],
        text: n.text,
        ref: null,
      });
  for (const e of m.sharing.list)
    if (e.communicated)
      items.push({
        round: e.round,
        type: 'rule',
        actor: e.actor,
        call: c.call(e.actor, e.round),
        people: [],
        text: `${e.text} [${e.matches.map((x) => x.idea).join(', ')}]`,
        ref: null,
      });
  const adopted: [AdoptedItem[], TimelineItem['type']][] = [
    [m.gate.adoption.names, 'name-adopted'],
    [m.gate.adoption.rules, 'rule-adopted'],
    [m.gate.adoption.sayings, 'saying-adopted'],
  ];
  for (const [list, type] of adopted)
    for (const a of list)
      items.push({
        round: a.adoptedRound,
        type,
        actor: a.adopter,
        call: a.call,
        people: [{ actor: a.origin, call: c.call(a.origin, a.round) }],
        text: `${a.text} (from ${a.origin}, round ${String(a.round)}, via ${a.via})`,
        ref: null,
      });
  for (const i of invitations) {
    items.push({
      round: i.round,
      type: 'invitation',
      actor: i.host,
      call: i.call,
      people: i.heard.map((actor) => ({ actor, call: null })),
      text: `meet at (${String(i.place.x)}, ${String(i.place.y)}) at round ${String(i.meetingRound)}: ${i.text}`,
      ref: i.sign,
    });
    items.push({
      round: i.meetingRound,
      type: 'attendance',
      actor: null,
      call: null,
      people: i.arrivals.map((a) => ({ actor: a.actor, call: a.call })),
      text: `present ${i.attendance?.present.join(', ') || 'none'}; came after hearing ${i.attendance?.came.join(', ') || 'none'}; guests within the grace period ${i.arrivals.map((a) => `${a.actor} (round ${String(a.round)})`).join(', ') || 'none'}`,
      ref: i.attendance?.event ?? i.sign,
    });
  }
  for (const w of works) {
    items.push({
      round: w.created,
      type: 'work-started',
      actor: w.maker,
      call: w.call,
      people: [],
      text: `${w.name} (${w.kind})`,
      ref: w.id,
    });
    if (w.completed !== null)
      items.push({
        round: w.completed,
        type: 'work-completed',
        actor: w.maker,
        call: c.call(w.maker, w.completed),
        people: [],
        text: `${w.name} (${w.kind})`,
        ref: w.id,
      });
  }
  for (const a of appearance)
    items.push({
      round: a.round,
      type: 'valued-appearance',
      actor: a.actor,
      call: a.call,
      people: a.acknowledgements.map((x) => ({ actor: x.actor, call: x.call })),
      text: a.text,
      ref: a.work,
    });
  return items.sort(
    (a, b) =>
      a.round - b.round ||
      a.type.localeCompare(b.type) ||
      (a.actor ?? '').localeCompare(b.actor ?? ''),
  );
}

export function cultureMetrics(input: CultureInput): CultureMetrics {
  const agents = input.actors.map((a) => a.id);
  const at = positions(input);
  const catalogue = new Map(input.abilities.map((a) => [a.id, a]));
  const edible = new Set(
    input.resources.filter((r) => r.nutrition > 0).map((r) => termKey(r.id)),
  );
  const list = utterances(input);
  const byTick = new Map(input.rounds.map((r) => [r.tick, r]));
  const c: Context = {
    input,
    agents,
    order: (a, b) => agents.indexOf(a) - agents.indexOf(b),
    names: actorWords(input),
    list,
    near: (a, b, tick) => {
      const p = at.get(tick)?.get(a);
      const q = at.get(tick)?.get(b);
      return !!p && !!q && distance(p, q) <= input.vision;
    },
    at: (actor, tick) => at.get(tick)?.get(actor),
    isSurvival: (id) =>
      survivalInterface(catalogue.get(id) ?? { id, name: id }, edible),
    call: (actor, tick) => byTick.get(tick)?.calls?.[actor] ?? null,
  };
  const ticks = input.rounds.map((r) => r.tick);
  // Private memory may read public receipts for its own exposure; nothing flows the other way.
  const exposure = sharingExposure(c);
  const heard = [...receipts(c), ...signReceipts(c)];
  const last = ticks.length ? Math.max(...ticks) : 0;
  const base = {
    agents,
    vocabulary: vocabularyMetric(c),
    norms: normMetric(c),
    sharing: sharingMetric(c, exposure),
    survival: survivalMetric(c),
    symbolic: symbolicMetric(c),
  };
  const phrases = phraseMetric(c, heard);
  // A person's first use of a term after its first round; null if they had used it (or a
  // longer term containing it, such as a name they gave) by then.
  const firstUse = (term: string, actor: string, after: number) => {
    const uses = list.filter(
      (u) => u.actor === actor && termKey(u.text).includes(termKey(term)),
    );
    if (uses.some((u) => u.tick <= after)) return null;
    return uses.find((u) => u.tick > after)?.tick ?? null;
  };
  const gate = gateMetric(base, phrases, heard, c.call, firstUse);
  const invitations = invitationMetric(c, heard);
  const works: WorkRecord[] = (input.works ?? [])
    .filter((w) => w.created <= last)
    .map((w) => ({
      ...w,
      completed:
        w.completed !== null && w.completed <= last ? w.completed : null,
      call: c.call(w.maker, w.created),
    }));
  const appearance = appearanceMetric(c, works, heard);
  return {
    archive: input.archive,
    rounds: {
      first: ticks.length ? Math.min(...ticks) : 0,
      last,
      count: ticks.length,
    },
    agents,
    utterances: Object.fromEntries(
      KINDS.map((k) => [k, list.filter((u) => u.kind === k).length]),
    ) as Record<Kind, number>,
    vocabulary: base.vocabulary,
    activities: activityMetric(c, at),
    norms: base.norms,
    sharing: base.sharing,
    beliefs: beliefMetric(c),
    relationships: relationshipMetric(c),
    survival: base.survival,
    rest: restMetric(c),
    nonTransactional: communicationMetric(c),
    symbolic: base.symbolic,
    idle: idleMetric(c),
    phrases,
    invitations: { criterion: INVITATION_CRITERION, list: invitations },
    works,
    appearance: { criterion: APPEARANCE_CRITERION, list: appearance },
    gate,
    timeline: timelineMetric(
      c,
      { norms: base.norms, sharing: base.sharing, gate },
      invitations,
      works,
      appearance,
    ),
    privateMemory: privateMemoryMetric(input, exposure),
    modelLabels: null,
  };
}

/** All string values below a JSON value, skipping the named keys. */
function strings(
  value: unknown,
  skip: ReadonlySet<string> = new Set(),
): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((v) => strings(v, skip));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) =>
      skip.has(k) ? [] : [k, ...strings(v, skip)],
    );
  return [];
}

/** Event types whose description or data repeat actor-authored text. */
const ACTOR_TEXT_EVENTS = [
  // A listener's copy of spoken text (culture voice scopes); it is actor text, not world text.
  'heard',
  'message',
  'requested',
  'collective-report',
  'collective-response',
  'collective-read',
  'finding-offered',
  'finding-accepted',
  'lesson-offered',
  'lesson-accepted',
];

interface RetainedCall {
  attempt: { id: string; role: 'ordinary' | 'world'; actor: string };
  input: ContinuousModelInput;
}

/**
 * A retained model input with the owner's private `memory.cares` and `memory.views` emptied, so
 * actor-authored private text never enters the authored-prompt environment. Inputs without
 * these packet fields (every archive before the culture voice) are returned unchanged.
 */
export function withoutPrivateMemory(
  input: ContinuousModelInput,
): ContinuousModelInput {
  if (!('longContext' in input)) return input;
  const memory = object(input.packet.memory);
  if (!('cares' in memory) && !('views' in memory)) return input;
  return {
    ...input,
    packet: { ...input.packet, memory: { ...memory, cares: null, views: [] } },
  };
}

/** Read a continuous-family archive's retained files into the metrics input, up to and including round `through`. */
export function cultureInput(archive: string, through?: number): CultureInput {
  const header = continuousRead<{ protocol?: unknown }>(
    join(archive, 'replay.json'),
  );
  if (header.protocol !== 'continuous-v1')
    throw new Error(`${archive} is not a continuous-family archive.`);
  const execution = continuousRead<V7Execution>(
    join(archive, 'execution.json'),
  );
  const initial = continuousRead<V7World>(join(archive, 'initial.json'));
  const index = continuousRead<V7ReplayIndex>(join(archive, 'replay.json'));
  // After a decision with no accepted call the controller installs its own fallback plan.
  const decided = new Map<string, boolean>();
  for (const a of execution.attempts)
    if (a.role === 'ordinary') {
      const key = `${a.actor}\u0000${String(a.tick)}`;
      decided.set(key, (decided.get(key) ?? false) || a.status === 'accepted');
    }
  const harness = new Set<string>();
  const rounds: CultureRound[] = [];
  const worlds: V7World[] = [initial];
  const own = (actor: string, cursor: V7Cursor) =>
    decided.get(`${actor}\u0000${String(cursor.startedAt)}`) !== false;
  // The accepted ordinary call of each decision; a query batch precedes its plan, so the last wins.
  const accepted = new Map<string, string>();
  for (const a of execution.attempts)
    if (a.role === 'ordinary' && a.status === 'accepted')
      accepted.set(`${a.actor}\u0000${String(a.tick)}`, a.id);
  const actorIds = new Set(initial.actors.map((a) => a.id));
  const made = new Map<string, CultureWork>();
  const sight = (w: V7World) => {
    for (const o of w.objects) {
      if (
        !o.createdBy ||
        !actorIds.has(o.createdBy) ||
        o.assemblyParent ||
        EXPRESSION_SIGN_KINDS.includes(o.kind) ||
        (through !== undefined && o.createdAt > through)
      )
        continue;
      const status = typeof o.data.status === 'string' ? o.data.status : null;
      made.set(o.id, {
        id: o.id,
        kind: o.kind,
        name: o.name,
        maker: o.createdBy,
        created: o.createdAt,
        completed: null,
        status: status ?? made.get(o.id)?.status ?? null,
      });
    }
  };
  for (const part of index.segments) {
    const source = readFileSync(join(archive, part.path));
    if (createHash('sha256').update(source).digest('hex') !== part.sha256)
      throw new Error(`Replay segment integrity failed: ${part.path}`);
    const segment = JSON.parse(source.toString('utf8')) as V7ReplaySegment;
    worlds.push(segment.initial);
    const kept = segment.rounds.filter(
      (r) => through === undefined || r.tick <= through,
    );
    // Exact replay (each round checked against its recorded hashes) gives the world before
    // every kept round; only energy is read from it.
    const frames = kept.length
      ? reconstructContinuousSegment({ ...segment, rounds: kept })
      : [];
    frames.forEach(sight);
    kept.forEach((r, i) =>
      rounds.push({
        tick: r.tick,
        actions: r.actions,
        events: r.events,
        memory: r.memory,
        energy: Object.fromEntries(
          (frames[i]?.actors ?? []).map((a) => [a.id, a.vitals.energy]),
        ),
        intentions: Object.fromEntries(
          Object.entries(r.tasks).flatMap(([actor, cursor]) => {
            if (own(actor, cursor)) return [[actor, cursor.plan.intention]];
            harness.add(cursor.plan.intention);
            return [];
          }),
        ),
        calls: Object.fromEntries(
          Object.entries(r.tasks).flatMap(([actor, cursor]) => {
            const id = own(actor, cursor)
              ? accepted.get(`${actor}\u0000${String(cursor.startedAt)}`)
              : undefined;
            return id ? [[actor, id]] : [];
          }),
        ),
        // A round's retained cursor is the one that produced its action (state after the round).
        authored: Object.fromEntries(
          Object.entries(r.tasks).map(([actor, cursor]) => [
            actor,
            cursor.startedAt + 1,
          ]),
        ),
        restSteps: Object.fromEntries(
          Object.entries(r.tasks).flatMap(([actor, cursor]) => {
            const action = r.actions[actor];
            const step =
              action?.interface === 'rest' && own(actor, cursor)
                ? restStep(cursor, action)
                : null;
            return step ? [[actor, step]] : [];
          }),
        ),
      }),
    );
  }
  const world = execution.world;
  sight(world);
  for (const work of made.values())
    work.completed =
      rounds.find((r) =>
        r.events.some(
          (e) =>
            e.target === work.id &&
            e.success &&
            (e.type.endsWith('-completed') ||
              object(e.data).status === 'complete'),
        ),
      )?.tick ?? null;
  // Authored prompt: the instructions and packet of each actor's first retained ordinary request.
  const prompts: string[] = [];
  const pending = new Set(world.actors.map((a) => a.id));
  const files = readdirSync(join(archive, 'calls'))
    .filter((f) => f.startsWith('ordinary-'))
    .sort(
      (a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')),
    );
  for (const file of files) {
    if (!pending.size) break;
    const call = continuousRead<RetainedCall>(join(archive, 'calls', file));
    if (!pending.has(call.attempt.actor)) continue;
    pending.delete(call.attempt.actor);
    const request = continuousRequest(
      execution.model,
      'ordinary',
      withoutPrivateMemory(call.input),
    );
    prompts.push(...strings(request));
  }
  // Catalogue and world vocabulary; actor records, events and shared state carry agent text and are skipped.
  // Names, marks and invitation signs hold actor text and are not world vocabulary.
  const notSign = (o: V7World['objects'][number]) =>
    !EXPRESSION_SIGN_KINDS.includes(o.kind);
  const vocabulary = worlds.flatMap((w) =>
    strings(
      {
        abilities: w.abilities,
        objects: w.objects.filter(notSign),
        resources: w.resources,
        satisfaction: w.satisfaction,
        eventTypes: w.eventTypes ?? [],
      },
      new Set(['terrain']),
    ),
  );
  const finals = strings({
    abilities: world.abilities,
    objects: world.objects.filter(notSign).map((o) => ({
      id: o.id,
      kind: o.kind,
      name: o.name,
    })),
    resources: world.resources,
    satisfaction: world.satisfaction,
    eventTypes: world.eventTypes ?? [],
  });
  // World event text (descriptions, reason codes, measured data); events carrying actor text are skipped.
  const worldEvents = rounds.flatMap((r) =>
    r.events.flatMap((e) =>
      ACTOR_TEXT_EVENTS.includes(e.type) ||
      (SYMBOLIC_INTERFACES as readonly (string | null)[]).includes(e.interface)
        ? [e.type]
        : [e.type, e.description, ...strings(e.data)],
    ),
  );
  return {
    archive,
    actors: initial.actors.map((a) => ({ id: a.id, name: a.name })),
    vision: initial.config.vision,
    start: Object.fromEntries(initial.actors.map((a) => [a.id, a.position])),
    abilities: world.abilities.map((a) => ({ id: a.id, name: a.name })),
    resources: world.resources.map((r) => ({
      id: r.id,
      name: r.name,
      nutrition: r.nutrition,
    })),
    harness: [...harness].sort(),
    environment: [
      ...prompts,
      ...harness,
      ...vocabulary,
      ...finals,
      ...worldEvents,
    ],
    rounds,
    objects: [
      ...new Set(
        [initial, ...worlds, world].flatMap((w) =>
          w.objects.filter(notSign).flatMap((o) => [o.kind, o.name]),
        ),
      ),
    ].sort(),
    works: [...made.values()].sort(
      (a, b) => a.created - b.created || a.id.localeCompare(b.id),
    ),
    voice: world.config.longDevelopment?.culture?.voice ?? false,
    energy: {
      cap: initial.config.energyCap,
      restRecovery: initial.config.restRecovery,
      unrecordedRestFactor: [...worlds, world].some((w) =>
        w.revisions.includes('weather-lean-to@1'),
      ),
    },
  };
}

/**
 * The energy condition of the plan step that produced a `rest`. The retained cursor is the state
 * after the round: it stays on the producing step when the round ended the plan (a `reason`) or
 * the step is still repeating, and otherwise has advanced one step, wrapping to the first. If that
 * step is not the action, the matching step at the cursor, else the last one before it, is taken.
 */
export function restStep(cursor: V7Cursor, action: V7Action): RestStep | null {
  const steps = cursor.plan.steps;
  const args = JSON.stringify(action.args);
  const same = (i: number) => {
    const step = steps[i];
    return (
      step !== undefined &&
      step.action.interface === action.interface &&
      JSON.stringify(step.action.args) === args
    );
  };
  const stayed = cursor.reason !== null || cursor.repetition > 0;
  const expected = stayed ? cursor.step : (cursor.step || steps.length) - 1;
  const matching = steps.flatMap((_, i) => (same(i) ? [i] : []));
  const index = same(expected)
    ? expected
    : matching.includes(cursor.step)
      ? cursor.step
      : (matching.filter((i) => i < cursor.step).at(-1) ?? matching.at(-1));
  const step = index === undefined ? undefined : steps[index];
  if (!step) return null;
  const energy = (c: V7Condition | null): c is V7Condition =>
    !!c && /(?:^|\.)energy$/.test(c.path);
  const target = [step.until, cursor.plan.until].find(
    (c): c is V7Condition =>
      energy(c) &&
      (c.comparison === 'gte' || c.comparison === 'gt') &&
      typeof c.value === 'number',
  );
  return {
    conditioned:
      energy(step.until) || energy(step.guard) || energy(cursor.plan.until),
    target: typeof target?.value === 'number' ? target.value : null,
  };
}

export function archiveCultureMetrics(
  archive: string,
  through?: number,
): CultureMetrics {
  return cultureMetrics(cultureInput(archive, through));
}

const percent = (value: number | null) =>
  value === null ? '–' : `${(value * 100).toFixed(1)}%`;
const recip = (g: Graph) =>
  `${String(g.pairs)} directed ${g.pairs === 1 ? 'pair' : 'pairs'}, ${String(g.reciprocated)} reciprocated (${percent(g.reciprocity)})`;
const id = (value: string) => `\`${value}\``;

/** Headline row of one archive, in the column order of `CULTURE_COLUMNS`. */
export function cultureRow(m: CultureMetrics): string[] {
  const name = m.archive.split('/').filter(Boolean).at(-1) ?? m.archive;
  return [
    name,
    String(m.rounds.count),
    String(m.agents.length),
    `${String(m.vocabulary.sharedTerms)} / ${String(m.vocabulary.terms)}`,
    String(m.vocabulary.crossAgentUses),
    String(m.vocabulary.transmittedTerms),
    `${String(m.activities.repeated)} (${String(m.activities.repeatedNonSurvival)})`,
    `${String(m.norms.statements)} / ${String(m.norms.echoed)}`,
    `${String(m.sharing.expressions)} / ${String(m.sharing.reuses)} (${String(m.sharing.exposedReuses)})`,
    `${String(m.beliefs.causal)} + ${String(m.beliefs.supernatural)} / ${String(m.beliefs.cited)}`,
    String(m.relationships.messages.edges.reduce((n, e) => n + e.weight, 0)),
    percent(m.relationships.messages.reciprocity),
    String(m.relationships.responses.edges.reduce((n, e) => n + e.weight, 0)),
    String(m.relationships.transfers.edges.reduce((n, e) => n + e.weight, 0)),
    percent(m.survival.share),
    percent(m.survival.shareWithoutRest),
    percent(m.nonTransactional.share),
    String(m.symbolic.perAgent.reduce((n, a) => n + a.succeeded, 0)),
  ];
}
export const CULTURE_COLUMNS = [
  'Archive',
  'Rounds',
  'Agents',
  'Shared / candidate terms',
  'Cross-agent term uses',
  'Transmitted terms',
  'Repeated activities (non-survival)',
  'Norms / echoed',
  'Sharing expressions / reuses (exposed)',
  'Beliefs causal + supernatural / cited',
  'Messages',
  'Message reciprocity',
  'Responses',
  'Gives/exchanges',
  'Survival share',
  'Survival share without rest',
  'Non-transactional share',
  'Symbolic actions',
];
const table = (header: string[], rows: string[][]) =>
  [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
const clip = (value: string, n = 140) =>
  value.length > n ? `${value.slice(0, n - 1)}…` : value;

/** A Markdown section for one archive. */
export function cultureMarkdown(m: CultureMetrics): string {
  const name = m.archive.split('/').filter(Boolean).at(-1) ?? m.archive;
  const lines = [
    `## Culture metrics: ${name}`,
    '',
    `Rounds ${String(m.rounds.first)}–${String(m.rounds.last)} (${String(m.rounds.count)}), agents ${m.agents.map(id).join(', ')}. Utterances: ${KINDS.map((k) => `${k} ${String(m.utterances[k])}`).join(', ')}.`,
    '',
    table(CULTURE_COLUMNS, [cultureRow(m)]),
    '',
    '### Shared vocabulary',
    '',
    m.vocabulary.top.length
      ? table(
          [
            'Term',
            'First users',
            'First round',
            'Later users',
            'Exposed later users',
            'Cross-agent uses',
          ],
          m.vocabulary.top.map((t) => [
            id(t.term),
            t.firstUsers.join(', '),
            String(t.firstRound),
            t.laterUsers.join(', '),
            t.exposedLaterUsers.join(', ') || '–',
            String(t.crossAgentUses),
          ]),
        )
      : 'No candidate term was used by a second agent.',
    '',
    m.vocabulary.topCandidates.length
      ? `Most used candidates: ${m.vocabulary.topCandidates.map((t) => `${id(t.term)} (${t.users.join(', ')}; ${String(t.uses)})`).join(', ')}.`
      : 'No candidate term was found.',
    '',
    '### Collective activities',
    '',
    m.activities.byInterface.length
      ? table(
          ['Interface', 'Survival', 'Episodes', 'Participants', 'Actor-rounds'],
          m.activities.byInterface.map((a) => [
            id(a.interface),
            a.survival ? 'yes' : 'no',
            String(a.episodes),
            a.participants.join(', '),
            String(a.actorRounds),
          ]),
        )
      : 'No interface was used by two agents within the window and radius.',
    '',
    '### Norms',
    '',
    m.norms.list.length
      ? table(
          [
            'Round',
            'Speaker',
            'Statement',
            'Prescribed interface',
            'Phrase echoes',
            'Action echoes',
          ],
          m.norms.list
            .slice(0, 12)
            .map((n) => [
              String(n.round),
              n.actor,
              clip(n.text).replace(/\|/g, '/'),
              n.prescribedInterface ? id(n.prescribedInterface) : '–',
              String(n.phraseEchoes.length),
              String(n.actionEchoes.length),
            ]),
        )
      : 'No normative statement was found in messages or public text.',
    '',
    `Private normative notes (never communicated, context only): ${String(m.norms.privateStatements)}.`,
    '',
    ...sharingMarkdown(m),
    '### Beliefs',
    '',
    m.beliefs.list.length
      ? table(
          ['Round', 'Author', 'Type', 'Statement', 'Citations'],
          m.beliefs.list
            .slice(0, 12)
            .map((b) => [
              String(b.round),
              b.actor,
              b.type,
              clip(b.text).replace(/\|/g, '/'),
              String(b.citations.length),
            ]),
        )
      : 'No explanation of a cause was found.',
    '',
    '### Relationships',
    '',
    `Messages: ${recip(m.relationships.messages)}. Responses within ${String(m.relationships.responseWindow)} rounds: ${recip(m.relationships.responses)}. Gives/exchanges: ${recip(m.relationships.transfers)}.`,
    '',
    ...(['messages', 'responses', 'transfers'] as const).flatMap((k) =>
      m.relationships[k].edges.length
        ? [
            `- ${k}: ${m.relationships[k].edges.map((e) => `${e.from} → ${e.to} ${String(e.weight)}`).join(', ')}`,
          ]
        : [],
    ),
    ...(m.relationships.messages.edges.length ||
    m.relationships.transfers.edges.length
      ? ['']
      : []),
    '### Auxiliary',
    '',
    `- Survival share: ${String(m.survival.survivalRounds)} of ${String(m.survival.actorRounds)} actor-rounds (${percent(m.survival.share)}); survival interfaces used: ${m.survival.interfaces.map(id).join(', ') || '–'}. Without \`rest\` (a second value; the gate uses the share above): ${String(m.survival.survivalRounds - m.survival.restRounds)} of ${String(m.survival.actorRounds)} (${percent(m.survival.shareWithoutRest)}).`,
    restLine(m.rest),
    `- Non-transactional communication: ${String(m.nonTransactional.nonTransactional)} of ${String(m.nonTransactional.messages)} (${percent(m.nonTransactional.share)}).`,
    `- Symbolic actions (${m.symbolic.interfaces.map(id).join(', ')}): ${m.symbolic.perAgent.map((a) => `${a.actor} ${String(a.succeeded)}`).join(', ')}; every agent at least one: ${m.symbolic.everyAgentAtLeastOne ? 'yes' : 'no'}.`,
    '',
    ...restMarkdown(m),
    ...gateMarkdown(m),
    ...eventsMarkdown(m),
    ...(m.privateMemory ? privateMarkdown(m.privateMemory) : []),
  ];
  return lines.join('\n');
}

const cell = (value: string, n = 90) => clip(value, n).replace(/\|/g, '/');
/** Author and round of a received expression, its idea when asked, and the channel and round of receipt. */
const exposed = (x: SharingExposure | null, idea = false) =>
  x
    ? `${x.actor} r${String(x.round)}${idea ? ` ${id(x.idea)}` : ''} via ${x.via} (r${String(x.received)})`
    : '–';

/** The public sharing section: ideas, reuses with their closest wording and exposure, limitations. */
function sharingMarkdown(m: CultureMetrics): string[] {
  const s = m.sharing;
  return [
    '### Sharing expressions',
    '',
    `Sentences of public and plan text that express restraint in, or sharing of, common resources (patterns in \`SHARING_RULES\`): ${String(s.expressions)}, ${String(s.communicated)} of them spoken, sent or posted. ${String(s.reuses)} later expressions repeat an idea another person had expressed earlier; ${String(s.similarReuses)} with similar wording (folded content-word Jaccard at least ${String(s.similarityThreshold)}), ${String(s.exposedReuses)} after receiving that idea from someone else. Rounds are authored rounds (the first round of the plan that wrote the text).`,
    '',
    table(
      [
        'Idea',
        'Expressions (spoken)',
        'People',
        'First users (round)',
        'Later users',
        'Exposed later users',
      ],
      s.ideas.map((i) => [
        `${id(i.idea)}: ${i.description}`,
        `${String(i.expressions)} (${String(i.communicated)})`,
        i.people.join(', ') || '–',
        i.firstUsers.length
          ? `${i.firstUsers.join(', ')} (${String(i.firstAuthored)})`
          : '–',
        i.laterUsers.join(', ') || '–',
        i.exposedLaterUsers.join(', ') || '–',
      ]),
    ),
    '',
    s.reuseList.length
      ? table(
          [
            'Authored / spoken',
            'Person',
            'Kind',
            'Idea',
            'Phrase',
            'Closest earlier (similarity)',
            'Same idea received',
            'Other idea received',
          ],
          s.reuseList.map((r) => [
            `${String(r.authored)} / ${String(r.round)}`,
            r.actor,
            r.kind,
            id(r.idea),
            cell(r.phrase, 70),
            `${r.closest.actor} r${String(r.closest.authored)} ${r.closest.kind} "${cell(r.closest.phrase, 50)}" (${r.closest.similarity.toFixed(2)})`,
            exposed(r.exposure),
            exposed(r.otherExposure, true),
          ]),
        )
      : 'No person expressed an idea that another person had expressed earlier.',
    '',
    ...s.limitations.map((l) => `- ${l}`),
    '',
  ];
}

const yesNo = (v: boolean | null) => (v === null ? '–' : v ? 'yes' : 'no');
const restLine = (r: RestMetrics) =>
  `- Rest as a default idle behavior, criterion 1 (no energy condition or cap-cut recovery): ${String(r.idle)} of ${String(r.rests)} rests idle (${percent(r.idleShare)}: ${String(r.unconditioned)} from steps without an energy condition, ${r.highEnergy === null ? 'high-energy test unavailable' : `${String(r.highEnergy)} begun within one rest of the energy cap`}); default: ${yesNo(r.default)}. Criterion 2 (start energy at or above ${String(r.startShare * 100)}% of the cap): ${r.highStart === null ? 'start energy unavailable' : `${String(r.highStart)} of ${String(r.withStart)} rests (${percent(r.highStartShare)})`}; default: ${yesNo(r.startDefault)}. Threshold ${String(r.defaultShare * 100)}% for both. ${String(r.toFull)} rests came from steps that rest until at least ${String(r.toFullShare * 100)}% of the cap.`;

const pass = (v: boolean) => (v ? 'pass' : 'fail');
const via = (a: AdoptedItem) =>
  `${a.adopter} r${String(a.adoptedRound)} (${a.call ?? 'no call'}) from ${a.origin} r${String(a.round)} via ${a.via}: "${cell(a.text, 70)}"`;

/** Gate G2 as revised after the fact, with idle time and the original gate. */
function gateMarkdown(m: CultureMetrics): string[] {
  const g = m.gate;
  const adopted = [
    ...g.adoption.names,
    ...g.adoption.sayings,
    ...g.adoption.rules,
  ];
  return [
    '### Gate G2 (revised after the fact)',
    '',
    `Revision \`${g.id}\` of ${g.date}, made after the fact: ${g.reason}`,
    '',
    ...g.criteria.map((x, i) => `${String(i + 1)}. ${x}`),
    '',
    table(
      ['Condition', 'Value', 'Result'],
      [
        [
          'Survival share without idle rest and wait',
          percent(g.survival.share),
          pass(g.survival.passed),
        ],
        [
          'People with a symbolic action',
          `${String(g.symbolic.people.length)} of ${String(m.agents.length)} (${g.symbolic.people.join(', ') || 'none'}); at least ${String(g.symbolic.required)} required`,
          pass(g.symbolic.passed),
        ],
        [
          'Adopted names, sayings and rules',
          `${String(g.adoption.names.length)} names, ${String(g.adoption.sayings.length)} sayings, ${String(g.adoption.rules.length)} rules`,
          pass(g.adoption.passed),
        ],
        ['Revised G2', '', pass(g.passed)],
        [
          'Original G2 (survival share with rest; every person symbolic)',
          `${percent(g.original.survivalShare)}; every person: ${yesNo(g.original.everyAgentAtLeastOne)}`,
          pass(g.original.passed),
        ],
      ],
    ),
    '',
    `Idle (\`rest\` and \`wait\`, not survival): ${String(m.idle.rounds)} of ${String(m.idle.actorRounds)} actor-rounds (${percent(m.idle.share)}; rest ${String(m.idle.rest)}, wait ${String(m.idle.wait)}). Per person: ${m.idle.perAgent.map((a) => `${a.actor} ${percent(a.share)}`).join(', ')}.`,
    '',
    ...(adopted.length
      ? adopted.map((a) => `- ${a.type}: ${via(a)}`)
      : ['No name, saying or rule was adopted by another person.']),
    '',
  ];
}

/** Phrase propagation, invitations, works valued for appearance and the timeline. */
function eventsMarkdown(m: CultureMetrics): string[] {
  const p = m.phrases;
  return [
    '### Phrase propagation',
    '',
    `${p.criterion} ${String(p.propagations)} propagations (${String(p.adoptions)} distinct adoptions, ${String(p.communicated)} into spoken, sent or posted text).`,
    '',
    p.list.length
      ? table(
          ['Round', 'Person (call)', 'Kind', 'Clause', 'Source', 'Received'],
          p.list.map((x) => [
            String(x.round),
            `${x.actor} (${x.call ?? '–'})`,
            x.kind,
            cell(x.text, 70),
            `${x.source.actor} r${String(x.source.round)} (${x.source.call ?? '–'}): "${cell(x.source.text, 60)}"`,
            `r${String(x.received.tick)} ${x.received.via}`,
          ]),
        )
      : 'No phrase propagated.',
    '',
    '### Invitations and attendance',
    '',
    m.invitations.criterion,
    '',
    ...(m.invitations.list.length
      ? m.invitations.list.flatMap((i) => [
          `- ${i.host} r${String(i.round)} (${i.call ?? '–'}), ${id(i.sign)}: meet at (${String(i.place.x)}, ${String(i.place.y)}) at round ${String(i.meetingRound)}: "${cell(i.text, 100)}". Heard by ${i.heard.join(', ') || 'nobody'}. Attendance: ${i.attendance ? `present ${i.attendance.present.join(', ') || 'none'}, came after hearing ${i.attendance.came.join(', ') || 'none'} (${id(i.attendance.event ?? '–')})` : 'not recorded'}. Guests within the grace period: ${i.arrivals.map((a) => `${a.actor} r${String(a.round)} (${a.call ?? '–'})`).join(', ') || 'none'}.`,
          ...i.speech.map(
            (s) =>
              `  - ${s.actor} r${String(s.round)} (${s.call ?? '–'}): "${cell(s.text, 120)}"`,
          ),
        ])
      : ['No invitation.']),
    '',
    '### Works and appearance',
    '',
    m.works.length
      ? table(
          ['Work', 'Kind', 'Maker (call)', 'Started', 'Completed', 'Status'],
          m.works.map((w) => [
            id(w.id),
            w.kind,
            `${w.maker} (${w.call ?? '–'})`,
            String(w.created),
            w.completed === null ? '–' : String(w.completed),
            w.status ?? '–',
          ]),
        )
      : 'No person-made object.',
    '',
    m.appearance.criterion,
    '',
    ...(m.appearance.list.length
      ? m.appearance.list.flatMap((a) => [
          `- ${a.actor} r${String(a.round)} (${a.call ?? '–'}), ${id(a.work)}: failure "${a.failure}", appearance "${a.appearance}": "${cell(a.text, 160)}"`,
          ...a.acknowledgements.map(
            (x) =>
              `  - acknowledged by ${x.actor} r${String(x.round)} (${x.call ?? '–'}): "${cell(x.text, 120)}"`,
          ),
        ])
      : ['No object was valued for its appearance despite a failure.']),
    '',
    '### Timeline',
    '',
    m.timeline.length
      ? table(
          ['Round', 'Type', 'Person (call)', 'Others (call)', 'Text', 'Record'],
          m.timeline.map((t) => [
            String(t.round),
            t.type,
            t.actor ? `${t.actor} (${t.call ?? '–'})` : 'world',
            t.people
              .map((x) => (x.call ? `${x.actor} (${x.call})` : x.actor))
              .join(', ') || '–',
            cell(t.text, 100),
            t.ref ? id(t.ref) : '–',
          ]),
        )
      : 'No dated item.',
    '',
  ];
}

/** Per-person rest and survival table. */
function restMarkdown(m: CultureMetrics): string[] {
  if (!m.rest.rests) return [];
  return [
    `Rest criterion 1: ${m.rest.criterion}`,
    '',
    `Rest criterion 2: ${m.rest.startCriterion}`,
    '',
    table(
      [
        'Person',
        'Actor-rounds',
        'Rests',
        'Criterion 1: idle (no energy condition / cap-cut), default',
        `Criterion 2: begun at ≥${String(m.rest.startShare * 100)}% of cap, default`,
        `Rests to at least ${String(m.rest.toFullShare * 100)}% of cap`,
        'Survival share',
        'Without rest',
      ],
      m.survival.perAgent.map((a) => {
        const r = m.rest.perAgent.find((x) => x.actor === a.actor);
        return [
          a.actor,
          String(a.actorRounds),
          String(a.restRounds),
          r
            ? `${String(r.idle)} (${String(r.unconditioned)} / ${r.highEnergy === null ? '–' : String(r.highEnergy)}) ${percent(r.idleShare)}, ${yesNo(r.default)}`
            : '–',
          r && r.highStart !== null
            ? `${String(r.highStart)} of ${String(r.withStart)} ${percent(r.highStartShare)}, ${yesNo(r.startDefault)}`
            : '–',
          r ? String(r.toFull) : '–',
          percent(a.share),
          percent(a.shareWithoutRest),
        ];
      }),
    ),
    '',
  ];
}

const score = (value: number | null) =>
  value === null ? '–' : value.toFixed(3);
const historyText = (h: PrivateHistory) =>
  `${String(h.writes)} / ${String(h.changes)} / ${String(h.forgotten)}`;
function trendLine<T extends { round: number; similarity: number | null }>(
  t: PrivateTrend<T>,
  count: (s: T) => string,
): string {
  if (!t.first || !t.last) return 'never defined.';
  const at = (s: T) =>
    `round ${String(s.round)} ${score(s.similarity)} (${count(s)})`;
  const signed = (v: number | null) =>
    v === null ? '–' : `${v >= 0 ? '+' : ''}${v.toFixed(3)}`;
  return `first ${at(t.first)}, last ${at(t.last)}; change ${signed(t.change)}, slope ${signed(t.slopePer100Rounds)} per 100 rounds.`;
}

/** The owner-only private memory section, kept apart from the public sections. */
function privateMarkdown(p: PrivateMemoryMetrics): string[] {
  const count = (n: number, one: string, many = `${one}s`) =>
    `${String(n)} ${n === 1 ? one : many}`;
  return [
    '### Private memory (owner-only)',
    '',
    `Each person's \`cares\` and \`views\` appear only in that person's own packet; no other person can see them. They are reported only in this section and never enter the public metrics above. Writes / changes / forgotten count recorded plan updates, updates that changed the held text, and empty texts that removed a held one.`,
    '',
    `- Cares: ${String(p.cares.people)} people held cares, ${String(p.cares.holding)} at the last round; ${historyText(p.cares)}.`,
    `- Views: ${String(p.views.observers)} people held views of ${String(p.views.targets)} people; ${String(p.views.entries)} views held by ${String(p.views.holding)} people at the last round; ${historyText(p.views)}.`,
    `- Private view convergence (Jaccard similarity of content-word sets between different observers' current views of the same person, mean over pairs then over targets, every ${String(p.sampleInterval)} rounds): ${trendLine(p.viewConvergence.trend, (s) => `${count(s.targets, 'target')}, ${count(s.pairs, 'pair')}`)}`,
    `- Cares similarity across people (same similarity, mean over pairs of people holding cares): ${trendLine(p.caresSimilarity.trend, (s) => `${count(s.people, 'person', 'people')}, ${count(s.pairs, 'pair')}`)}`,
    `- Private sharing expressions (the public sharing patterns applied to cares and views): ${
      p.sharing.expressions.length
        ? p.sharing.expressions
            .map(
              (x) =>
                `${x.actor} round ${String(x.round)} ${x.field === 'view' ? `view of ${x.person ?? ''}` : 'cares'} (${x.matches.map((mm) => mm.idea).join(', ')}; "${clip(x.matches[0]?.phrase ?? '', 60)}"; ${x.exposure ? `heard ${x.exposure.idea} from ${x.exposure.actor} at round ${String(x.exposure.received)}` : 'no earlier public expression received'})`,
            )
            .join('; ')
        : 'none'
    }.`,
    '',
    table(
      [
        'Person',
        'Cares writes / changes / forgotten',
        'View writes / changes / forgotten',
        'Currently viewed',
        'Current cares',
      ],
      p.perAgent.map((a) => [
        a.actor,
        historyText(a.cares),
        historyText(a.views),
        a.views.current.map((v) => v.person).join(', ') || '–',
        a.cares.current ? clip(a.cares.current, 80).replace(/\|/g, '/') : '–',
      ]),
    ),
    '',
    p.viewConvergence.samples.length
      ? table(
          [
            'Round',
            'View convergence',
            'Targets',
            'View pairs',
            'Cares similarity',
            'People',
            'Cares pairs',
          ],
          p.viewConvergence.samples.map((v, i) => {
            const c = p.caresSimilarity.samples[i];
            return [
              String(v.round),
              score(v.similarity),
              String(v.targets),
              String(v.pairs),
              score(c?.similarity ?? null),
              String(c?.people ?? 0),
              String(c?.pairs ?? 0),
            ];
          }),
        )
      : 'No round was retained.',
    '',
  ];
}

/** CLI: `pnpm metrics:culture -- experiment/exN [more archives] [rounds] [--markdown file] [--json file]`. */
function main(argv: string[]) {
  const args = argv.filter((a) => a !== '--');
  const option = (flag: string) => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const value = args[i + 1];
    args.splice(i, 2);
    return value;
  };
  const markdown = option('--markdown');
  const json = option('--json');
  const through = args.find((a) => /^\d+$/.test(a));
  const archives = args.filter((a) => !/^\d+$/.test(a));
  const results = (archives.length ? archives : ['experiment/ex13']).map((a) =>
    archiveCultureMetrics(
      a,
      through === undefined ? undefined : Number(through),
    ),
  );
  const output = `${JSON.stringify(results.length === 1 ? results[0] : results, null, 2)}\n`;
  if (json) writeFileSync(json, output);
  else console.log(output.trimEnd());
  if (markdown)
    writeFileSync(
      markdown,
      [
        '# Culture metrics',
        '',
        table(CULTURE_COLUMNS, results.map(cultureRow)),
        '',
        ...results.map(cultureMarkdown),
      ].join('\n'),
    );
}

if (process.argv[1]?.endsWith('culture-metrics.ts'))
  main(process.argv.slice(2));
