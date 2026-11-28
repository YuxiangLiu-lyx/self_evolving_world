import type {
  V7Ability,
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Package,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7RoundNumber } from './continuous-data.js';
import { forestEvent } from './forest-climate.js';
import {
  EXPRESSION_LIMITS,
  EXPRESSION_REVISION,
  expressionHear,
  expressionHearers,
} from './expression.js';

/** ex25: quiet hummed or sung phrases with one's own voice. Each voiced round is one transient
 * segment that reaches listeners through the expression foundation's own heard delivery
 * (the recipients and heard events of tell, foundation-expression@1). Nothing persists but
 * small personal progress, limit and bout records; there is no reward of any kind. */

const ID = 'vocal-music';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The person's shared vocal-use record: study, hum and sing all count against it. */
const VOICE = `${ID}:voice`;
/** The open (active or paused) bout; the key is shown with the person's active work. */
const OPEN = `${ID}:work:open`;
/** Paid study per round (two rounds) and energy per voiced performance round. */
const STUDY_ENERGY = 0.2;
const ROUND_ENERGY = 0.5;
const MAX_ROUNDS = 3;
/** At most LIMIT voiced rounds in any WINDOW consecutive rounds, study included, and REST
 * unvoiced rounds after a bout of MAX_ROUNDS voiced rounds or any 3 consecutive voiced rounds. */
const WINDOW = 10;
const LIMIT = 3;
const REST = 2;
const NOTES = { min: 2, max: 8 };
const PITCH = 4;
const BEATS = 4;
/** Body temperatures outside which forest physiology deals thermal damage every round
 * (forest-environment.ts): the represented breathing and body distress. */
const COLD = 7;
const HOT = 34;
const MODES = ['hum', 'sing', 'resume', 'cancel'];
const EVENTS = {
  started: 'vocal-music-started',
  segment: 'vocal-music-segment',
  study: 'vocal-music-study-segment',
  paused: 'vocal-music-paused',
  resumed: 'vocal-music-resumed',
  cancelled: 'vocal-music-cancelled',
  completed: 'vocal-music-completed',
  ended: 'vocal-music-ended',
} as const;

interface Note extends V7Data {
  pitch: number;
  beats: number;
}
interface Voiced extends V7Data {
  tick: number;
  kind: string;
  bout: string | null;
}
interface Segment extends V7Data {
  n: number;
  tick: number;
  event: string;
  x: number;
  y: number;
  energy: number;
}
interface Bout extends V7Data {
  id: string;
  actor: string;
  mode: string;
  phrase: Note[];
  improvised: boolean;
  words: string;
  requested: number;
  voiced: number;
  energy: number;
  status: string;
  reason: string | null;
  startedAt: number;
  lastVoiced: number;
  endedAt: number | null;
  segments: Segment[];
}
interface Voice extends V7Data {
  /** Voiced rounds of the last WINDOW rounds. */
  voiced: Voiced[];
  /** The last round that must stay unvoiced, or null. */
  restUntil: number | null;
  /** The study rounds still owed after the last recorded study round, while studying. */
  studyRemaining: number | null;
  /** Rounds of paid study that were voiced, and those that stayed silent in pain or distress. */
  studyRounds: number[];
  studyQuiet: number[];
  studyEndedAt: number | null;
  /** The latest closed bout. */
  last: V7Data | null;
}
type Say = (type: string, description: string, data: V7Data) => void;

const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const readVoice = (a: V7Actor) =>
  record(a.extensionState[VOICE]) as Voice | null;
function writeVoice(a: V7Actor): Voice {
  const found = readVoice(a);
  if (found) return found;
  const fresh: Voice = {
    voiced: [],
    restUntil: null,
    studyRemaining: null,
    studyRounds: [],
    studyQuiet: [],
    studyEndedAt: null,
    last: null,
  };
  a.extensionState[VOICE] = fresh;
  return fresh;
}
const openBout = (a: V7Actor) => record(a.extensionState[OPEN]) as Bout | null;
const sung = (mode: string) => (mode === 'sing' ? 'sung' : 'hummed');

/** improvise=true, never random: FNV-1a of "id:round" seeds xorshift32 (13, 17, 5), whose
 * draws give the length (4 + draw % 3), each inner note's step (-2, -1, +1 or +2, kept within
 * -3..+3) and each beat count (1 + draw % 2). The first and last notes are the home note 0 and
 * the last lasts 2 beats. The same person and round give the same phrase. Study rounds hum the
 * phrase of their own round. */
function improvisation(actor: string, tick: number): Note[] {
  let h = 0x811c9dc5;
  const seed = `${actor}:${String(tick)}`;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  let s = h || 1;
  const next = (n: number) => {
    s = (s ^ (s << 13)) >>> 0;
    s = (s ^ (s >>> 17)) >>> 0;
    s = (s ^ (s << 5)) >>> 0;
    return s % n;
  };
  const length = 4 + next(3);
  const notes: Note[] = [];
  let pitch = 0;
  for (let i = 0; i < length; i++) {
    const inner = i > 0 && i < length - 1;
    pitch = inner
      ? Math.max(-3, Math.min(3, pitch + ([-2, -1, 1, 2][next(4)] ?? 1)))
      : 0;
    notes.push({ pitch, beats: i === length - 1 ? 2 : 1 + next(2) });
  }
  return notes;
}

/** Represented pain or distress now: an injury in the round just ended or in this round,
 * starvation (satiety 0 costs health every round), or a body temperature with thermal
 * damage. No unconsciousness or vocal impairment is represented beyond these. */
function unwell(w: V7World, a: V7Actor): string[] {
  const out: string[] = [];
  if (a.vitals.health <= 0) out.push('only a living person can voice');
  if (
    w.events.some((e) => e.actor === a.id && e.type === 'injured') ||
    (a.memory.important ?? []).some(
      (e) => e.type === 'injured' && e.tick >= w.tick - 1,
    )
  )
    out.push('pain: you were injured in the last round');
  if (a.vitals.satiety <= 0) out.push('distress: starving (satiety 0)');
  const t = a.vitals.temperature;
  if (t < COLD || t > HOT)
    out.push(
      `distress: body temperature ${shown(t)} is outside ${String(COLD)}-${String(HOT)}`,
    );
  return out;
}
/** Whether n consecutive voiced rounds from round t fit the shared limits. */
function fits(v: Voice | null, t: number, n: number): boolean {
  const rest = v?.restUntil ?? null;
  if (rest !== null && t <= rest) return false;
  const before = (v?.voiced ?? []).map((e) => e.tick).filter((x) => x < t);
  for (let k = 0; k < n; k++)
    if (before.filter((x) => x > t + k - WINDOW).length + k + 1 > LIMIT)
      return false;
  return true;
}
function earliest(v: Voice | null, t: number, n: number): number {
  for (let s = t; s < t + 3 * WINDOW; s++) if (fits(v, s, n)) return s;
  return t + 3 * WINDOW;
}
function limits(v: Voice | null, t: number, n: number): string[] {
  if (fits(v, t, n)) return [];
  const from = earliest(v, t, n);
  const rest = v?.restUntil ?? null;
  if (rest !== null && t <= rest)
    return [
      `vocal rest: after 3 voiced rounds in a row or in one bout, rounds through ${String(rest)} stay unvoiced; ${String(n)} voiced round(s) fit from round ${String(from)}`,
    ];
  const voiced = (v?.voiced ?? [])
    .filter((e) => e.tick > t - WINDOW)
    .map((e) => `${String(e.tick)} (${e.kind})`);
  return [
    `at most ${String(LIMIT)} voiced rounds (study included) fit in any ${String(WINDOW)} rounds; voiced at ${voiced.join(', ')}; ${String(n)} voiced round(s) fit from round ${String(from)}`,
  ];
}
function blockers(w: V7World, a: V7Actor, n: number): string[] {
  return [
    ...unwell(w, a),
    ...(a.vitals.energy < ROUND_ENERGY - 1e-9
      ? [
          `not enough energy: ${shown(a.vitals.energy)} of the ${String(ROUND_ENERGY)} a voiced round needs`,
        ]
      : []),
    ...limits(readVoice(a), w.tick, n),
  ];
}
/** Records one voiced round in the shared record and starts the rest when it is due. */
function recordVoiced(v: Voice, t: number, kind: string, bout: Bout | null) {
  v.voiced = [
    ...v.voiced.filter((e) => e.tick > t - WINDOW),
    { tick: t, kind, bout: bout?.id ?? null },
  ];
  const run = [t - 2, t - 1].every((x) => v.voiced.some((e) => e.tick === x));
  if (run || (bout && bout.voiced >= MAX_ROUNDS)) v.restUntil = t + REST;
  else if (v.restUntil !== null && v.restUntil < t) v.restUntil = null;
}

/** View metadata, keyed by the event that carries it and its actor. The voice glyph is shown
 * only on an executed voiced segment; no badge, notes or lasting mark exist. */
function view(
  w: V7World,
  a: V7Actor,
  b: Pick<Bout, 'id' | 'mode' | 'voiced' | 'requested' | 'startedAt'>,
  status: string,
  voiced: boolean,
): V7Data {
  return {
    component: null,
    glyph: voiced ? (b.mode === 'sing' ? 'voice-wave' : 'hum-wave') : null,
    operation: ID,
    bout: b.id,
    actor: a.id,
    mode: b.mode,
    x: a.position.x,
    y: a.position.y,
    intensity: 'quiet',
    segment: b.voiced,
    requested: b.requested,
    elapsed: w.tick - b.startedAt + 1,
    voiced,
    radius: w.config.vision,
    status,
    badge: null,
  };
}
function summary(w: V7World, a: V7Actor, b: Bout, status: string): V7Data {
  return {
    operation: ID,
    bout: b.id,
    by: a.id,
    mode: b.mode,
    requested: b.requested,
    voicedSegments: b.voiced,
    energyUsed: b.energy,
    status,
    reason: b.reason,
    nextVoicedRound: earliest(readVoice(a), w.tick + 1, 1),
    view: view(w, a, b, status, false),
  };
}
function close(w: V7World, a: V7Actor, b: Bout, status: string, why: string) {
  b.status = status;
  b.reason = why;
  b.endedAt = w.tick;
  delete a.extensionState['vocal-music:work:open'];
  writeVoice(a).last = {
    bout: b.id,
    mode: b.mode,
    status,
    voicedSegments: b.voiced,
    requested: b.requested,
    energyUsed: b.energy,
    startedAt: b.startedAt,
    endedAt: w.tick,
    reason: why,
  };
}
function pause(w: V7World, a: V7Actor, b: Bout, reasons: string[], say: Say) {
  b.status = 'paused';
  b.reason = reasons.join('; ');
  say(
    EVENTS.paused,
    `Stopped voicing after ${String(b.voiced)} of ${String(b.requested)} segment(s): ${b.reason}. Voiced segments and their energy stay; nothing is refunded or charged. resume continues after fresh checks; cancel ends it.`,
    summary(w, a, b, 'paused'),
  );
}

/** One voiced round: debit, record, and one segment event at the person's position. */
function voice(c: V7ActionContext, b: Bout): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (b.lastVoiced === w.tick) throw new Error('This round is already voiced.');
  a.vitals.energy = v7RoundNumber(a.vitals.energy - ROUND_ENERGY);
  b.voiced += 1;
  b.energy = v7RoundNumber(b.energy + ROUND_ENERGY);
  b.lastVoiced = w.tick;
  b.status = 'active';
  b.reason = null;
  const v = writeVoice(a);
  recordVoiced(v, w.tick, b.mode, b);
  c.emit(
    EVENTS.segment,
    `Voiced segment ${String(b.voiced)} of ${String(b.requested)}: ${b.mode === 'sing' ? 'sang' : 'hummed'} the ${String(b.phrase.length)}-note phrase quietly for ${String(ROUND_ENERGY)} energy; everyone else living within ${String(w.config.vision)} units hears it.`,
    {
      operation: ID,
      bout: b.id,
      by: a.id,
      mode: b.mode,
      phrase: b.phrase,
      improvised: b.improvised,
      words: b.words,
      segment: b.voiced,
      requested: b.requested,
      energy: ROUND_ENERGY,
      hearing: w.config.vision,
      intensity: 'quiet',
      view: view(w, a, b, 'voicing', true),
    },
  );
  b.segments = [
    ...b.segments,
    {
      n: b.voiced,
      tick: w.tick,
      event: w.events.at(-1)?.id ?? '',
      x: a.position.x,
      y: a.position.y,
      energy: ROUND_ENERGY,
    },
  ];
  if (b.voiced < b.requested)
    return {
      complete: false,
      remaining: b.requested - b.voiced,
      writes: [b.id],
    };
  close(w, a, b, 'completed', 'Every requested segment was voiced.');
  c.emit(
    EVENTS.completed,
    `Finished all ${String(b.requested)} requested segment(s); the sound ended with the last one. The next voiced round fits from round ${String(earliest(v, w.tick + 1, 1))}.`,
    summary(w, a, b, 'completed'),
  );
  return { complete: true, remaining: 0, writes: [b.id] };
}
/** The next round of an active bout: fresh checks, then a segment or a pause without charge. */
function next(c: V7ActionContext, b: Bout): V7HandlerResult {
  const unmet = blockers(c.world, c.actor, 1);
  if (!unmet.length) return voice(c, b);
  pause(c.world, c.actor, b, unmet, (type, description, data) => {
    c.emit(type, description, data);
  });
  return { complete: true, remaining: 0, writes: [b.id] };
}
function phraseOf(c: V7ActionContext): { phrase: Note[]; improvised: boolean } {
  const { phrase, improvise } = c.action.args;
  if (improvise === true) {
    if (Array.isArray(phrase) && phrase.length)
      throw nothing('Give either a phrase or improvise=true, not both.');
    return {
      phrase: improvisation(c.actor.id, c.world.tick),
      improvised: true,
    };
  }
  if (
    !Array.isArray(phrase) ||
    phrase.length < NOTES.min ||
    phrase.length > NOTES.max
  )
    throw nothing(
      `Give a phrase of ${String(NOTES.min)}-${String(NOTES.max)} notes, each {pitch, beats}, or improvise=true.`,
    );
  return {
    phrase: phrase.map((n) => {
      const note = record(n);
      return { pitch: Number(note?.pitch), beats: Number(note?.beats) };
    }),
    improvised: false,
  };
}
function wordsOf(value: unknown, mode: string): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw nothing('text must be text.');
  if (value.length > EXPRESSION_LIMITS.tell)
    throw nothing(
      `Sung text is limited to ${String(EXPRESSION_LIMITS.tell)} characters, as for tell.`,
    );
  if (!value.trim()) return '';
  if (mode === 'hum')
    throw nothing('Humming has no words; give sing for text.');
  return value;
}

function execute(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const mode = typeof action.args.mode === 'string' ? action.args.mode : '';
  const open = openBout(a);
  // resume and cancel use only mode: the open bout keeps its rounds, phrase and words.
  if (mode === 'cancel') {
    if (!open) throw nothing('There is no open bout to cancel.');
    close(w, a, open, 'cancelled', 'Cancelled on request.');
    c.emit(
      EVENTS.cancelled,
      `Cancelled the ${sung(open.mode)} bout after ${String(open.voiced)} of ${String(open.requested)} segment(s); voiced segments and their energy stay, nothing is refunded.`,
      summary(w, a, open, 'cancelled'),
    );
    return { complete: true, remaining: 0, writes: [open.id] };
  }
  if (mode === 'resume') {
    if (!open)
      throw nothing('There is no open bout to resume; give hum or sing.');
    if (open.status === 'active' && open.lastVoiced === w.tick - 1)
      return next(c, open);
    const unmet = blockers(w, a, open.requested - open.voiced);
    if (unmet.length)
      throw nothing(`You cannot resume voicing now: ${unmet.join('; ')}.`);
    open.status = 'active';
    open.reason = null;
    c.emit(
      EVENTS.resumed,
      `Resumed the ${sung(open.mode)} bout at segment ${String(open.voiced + 1)} of ${String(open.requested)} after fresh checks.`,
      summary(w, a, open, 'resumed'),
    );
    return voice(c, open);
  }
  if (mode !== 'hum' && mode !== 'sing')
    throw nothing(`Give mode ${MODES.join(', ')}.`);
  if (open) {
    if (
      open.mode === mode &&
      open.status === 'active' &&
      open.lastVoiced === w.tick - 1 &&
      c.operation?.first === false
    )
      return next(c, open);
    throw nothing(
      `Your ${sung(open.mode)} bout ${open.id} is ${open.status} after ${String(open.voiced)} of ${String(open.requested)} segment(s); give resume to continue it or cancel to end it.`,
    );
  }
  const rounds =
    action.args.rounds === undefined ? 1 : Number(action.args.rounds);
  const { phrase, improvised } = phraseOf(c);
  const words = wordsOf(action.args.text, mode);
  const unmet = blockers(w, a, rounds);
  if (unmet.length)
    throw nothing(`You cannot start voicing now: ${unmet.join('; ')}.`);
  const b: Bout = {
    id: `voice-${a.id}-${String(w.tick)}`,
    actor: a.id,
    mode,
    phrase,
    improvised,
    words,
    requested: rounds,
    voiced: 0,
    energy: 0,
    status: 'active',
    reason: null,
    startedAt: w.tick,
    lastVoiced: -1,
    endedAt: null,
    segments: [],
  };
  a.extensionState[OPEN] = b;
  c.emit(
    EVENTS.started,
    `Began a quiet ${sung(mode)} bout of ${String(rounds)} round(s): a ${String(phrase.length)}-note ${improvised ? 'improvised ' : ''}phrase${words ? ` with the words "${words}"` : ', no words'}.`,
    {
      operation: ID,
      bout: b.id,
      by: a.id,
      mode,
      phrase,
      improvised,
      words,
      requested: rounds,
      hearing: w.config.vision,
      view: view(w, a, b, 'started', false),
    },
  );
  return voice(c, b);
}

/** A paid study round of this ability: the kernel started it this round (remaining changed)
 * or finished it with mastery. A round paused for rest pays nothing and is not study. */
function study(w: V7World, a: V7Actor) {
  const learning = a.learning?.ability === ID ? a.learning : null;
  const mastered = w.events.some(
    (e) => e.actor === a.id && e.type === 'mastered' && e.data.ability === ID,
  );
  const known = readVoice(a);
  if (!learning && !mastered) {
    if (known && known.studyRemaining !== null) known.studyRemaining = null;
    return;
  }
  const paid =
    mastered || learning?.remaining !== (known?.studyRemaining ?? null);
  const v = writeVoice(a);
  v.studyRemaining = learning?.remaining ?? null;
  if (!paid) return;
  if (unwell(w, a).length) {
    v.studyQuiet = [...v.studyQuiet, w.tick];
    return;
  }
  v.studyRounds = [...v.studyRounds, w.tick];
  recordVoiced(v, w.tick, 'study', null);
  const phrase = improvisation(a.id, w.tick);
  const b = {
    id: `study-${a.id}`,
    mode: 'hum',
    voiced: v.studyRounds.length,
    requested: 2,
    startedAt: v.studyRounds[0] ?? w.tick,
  };
  forestEvent(
    w,
    EVENTS.study,
    `${a.name} hummed a short quiet ${String(phrase.length)}-note practice phrase while studying vocal music (${String(STUDY_ENERGY)} energy, paid by the study).`,
    a.position,
    a.id,
    {
      operation: ID,
      by: a.id,
      mode: 'hum',
      practice: true,
      phrase,
      improvised: true,
      words: '',
      segment: b.voiced,
      hearing: w.config.vision,
      intensity: 'quiet',
      view: view(w, a, b, 'study', true),
    },
  );
}
/** Each voiced segment of this round reaches every other living person within tell's hearing
 * radius at their actual positions, through the expression foundation's own heard delivery. */
function deliver(w: V7World) {
  for (const e of w.events.filter(
    (e) => e.success && (e.type === EVENTS.segment || e.type === EVENTS.study),
  )) {
    const performer = w.actors.find((x) => x.id === e.actor);
    if (!performer || !e.position) continue;
    const mode = e.data.mode === 'sing' ? 'sing' : 'hum';
    const words = typeof e.data.words === 'string' ? e.data.words : '';
    const notes = Array.isArray(e.data.phrase) ? e.data.phrase.length : 0;
    const practice = e.data.practice === true;
    const sound =
      mode === 'hum'
        ? 'hummed, no words'
        : words
          ? 'sung with words'
          : 'sung, no words';
    const description = `${performer.name} ${mode === 'sing' ? 'sang' : 'hummed'} a quiet ${String(notes)}-note ${practice ? 'practice ' : ''}phrase nearby${words ? `: "${words}"` : ', no words'}.`;
    for (const listener of expressionHearers(w, performer.id, e.position))
      expressionHear(w, listener, description, {
        from: performer.id,
        kind: mode,
        sound,
        phrase: e.data.phrase ?? [],
        words,
        source: e.id,
        segment: e.data.segment ?? null,
        ...(practice ? { practice: true } : {}),
      });
  }
}
/** After the round: record paid study, pause a bout whose round was not voiced or whose
 * performer was injured this round, then deliver the round's segments to listeners. */
function environment(w: V7World) {
  for (const a of w.actors) {
    if (a.vitals.health <= 0) continue;
    study(w, a);
    const b = openBout(a);
    if (b?.status !== 'active') continue;
    const reasons =
      b.lastVoiced !== w.tick
        ? [
            'this round was not voiced: another action, a refused action or no action took it',
          ]
        : w.events.some((e) => e.actor === a.id && e.type === 'injured')
          ? ['pain: you were injured this round']
          : [];
    if (reasons.length)
      pause(w, a, b, reasons, (type, description, data) => {
        forestEvent(w, type, description, a.position, a.id, data);
      });
  }
  deliver(w);
}
function onDeath(w: V7World, a: V7Actor) {
  const b = openBout(a);
  if (b) {
    close(w, a, b, 'ended', 'Died: the bout ended.');
    forestEvent(
      w,
      EVENTS.ended,
      `The ${sung(b.mode)} bout ended by death after ${String(b.voiced)} of ${String(b.requested)} segment(s); nothing is refunded.`,
      a.position,
      a.id,
      summary(w, a, b, 'ended'),
    );
  }
  if (a.learning?.ability === ID) {
    const v = writeVoice(a);
    v.studyEndedAt = w.tick;
    v.studyRemaining = null;
    forestEvent(
      w,
      EVENTS.ended,
      `Study of vocal music ended by death after ${String(v.studyRounds.length)} voiced study round(s); it does not continue after respawn.`,
      a.position,
      a.id,
      {
        operation: ID,
        by: a.id,
        status: 'study-ended',
        studyRounds: v.studyRounds,
        view: null,
      },
    );
  }
}

const ABILITY: V7Ability = {
  id: ID,
  name: 'Vocal music',
  function:
    'Hum or sing a short quiet phrase with your own voice for 1-3 rounds; nearby people hear each voiced round.',
  equivalence: 'voice:quiet-hummed-or-sung-phrase:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: MODES },
      rounds: { type: 'integer', minimum: 1, maximum: MAX_ROUNDS },
      phrase: {
        type: 'array',
        items: v7ObjectSchema({
          pitch: { type: 'integer', minimum: -PITCH, maximum: PITCH },
          beats: { type: 'integer', minimum: 1, maximum: BEATS },
        }),
      },
      improvise: { type: 'boolean' },
      text: { type: 'string', maxLength: 1000 },
    }),
    required: ['mode'],
  },
  references: {},
  prerequisites: [],
  learning: 2,
  learningEnergy: STUDY_ENERGY,
  costs: `Study: 2 rounds at ${String(STUDY_ENERGY)} energy each; each hums a short practice phrase heard nearby (silent in pain or distress). hum or sing: rounds 1-${String(MAX_ROUNDS)} (default 1), ${String(ROUND_ENERGY)} energy per voiced round, no material. phrase: ${String(NOTES.min)}-${String(NOTES.max)} notes {pitch: -${String(PITCH)}..${String(PITCH)} steps from the home note 0, beats: 1-${String(BEATS)}}, or improvise=true. sing may add text (at most ${String(EXPRESSION_LIMITS.tell)} characters, as tell). Shared by study, hum and sing: at most ${String(LIMIT)} voiced rounds in any ${String(WINDOW)} rounds, and ${String(REST)} unvoiced rounds after ${String(MAX_ROUNDS)} voiced rounds in a row or in one bout; a start must fit every requested round. Checked at start and each round: alive; no pain (an injury in the last round) or distress (satiety 0, body temperature below ${String(COLD)} or above ${String(HOT)}); at least ${String(ROUND_ENERGY)} energy. A refused start or resume costs nothing. resume continues a paused bout after fresh checks; cancel takes one round and no energy; both use only mode.`,
  effects: `Each voiced round is one segment at your position: everyone else living within 5 units (tell's hearing radius), seen or not, gets a heard event and heard-list entry with your mode, phrase, words and segment. Silence, refusals and pauses are not heard. The sound ends with each segment; no object, item, mark or lasting sound is made. Another action, a refused round, too little energy, a limit, pain or distress pauses the bout without charge; voiced segments and their energy are never refunded. Death ends the bout and any study. improvise=true derives 4-6 notes from your id and the start round (FNV-1a and xorshift32; from 0, steps of -2..+2 within -3..+3, back to 0), never at random. No reward, mood change or practice milestone; listeners get only the heard entry, and no reaction is implied.`,
  handler: HANDLER,
  revision: REVISION,
  authored: false,
  // The completion event never carries a qualified flag: voicing earns no practice milestone.
  practiceEvidence: EVENTS.completed,
  execution: {
    duration: null,
    interruption: 'cancel',
    progress:
      'hum or sing voices one segment per round and continues with the same action until the requested rounds are voiced; resume continues a paused bout; cancel takes one round. Voiced segments persist across pauses.',
  },
};

/** ex25: Kai's quiet vocal music, heard through the expression foundation's delivery. */
export const LONG_EX25_VOCAL_MUSIC: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex25',
  dependencies: ['foundation-open@1'],
  description:
    'Quiet hummed or sung phrases with one own voice: two paid study rounds, 1-3 voiced rounds per bout at 0.5 energy each, shared limits of 3 voiced rounds in any 10 and a 2-round rest after 3, pain, distress and energy checks every round, pause, resume, cancel and death handling, deterministic improvisation, and one heard segment per voiced round through the expression heard delivery. No object, material, sound record or reward.',
  reuse: {
    experiment:
      'foundation-expression@1 hearing: tell (expression.tell) reaches every other living person within the hearing radius (the vision radius, 5) at the speaker position, each with a private heard event and an entry in the bounded expression:heard list (6 entries)',
    source:
      'expression.ts (expressionHearers and expressionHear, factored out of the tell and invite delivery without behavior change; EXPRESSION_LIMITS.tell); forest-climate.ts (forestEvent); continuous-base.ts (v7ObjectSchema); kernel study (learning, learningEnergy)',
    description:
      'Every voiced segment reaches listeners through the same recipient selection and heard delivery as tell, called rather than copied; tell itself is never invoked. New: phrase validation and improvisation, the shared vocal-use limits, bout records and their lifecycle.',
  },
  abilities: [ABILITY],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: Object.values(EVENTS),
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath,
  migrate(w) {
    if (
      !w.revisions.includes(EXPRESSION_REVISION) ||
      !w.config.longDevelopment?.culture?.symbols
    )
      throw new Error(
        'Vocal music needs the expression foundation and its heard delivery.',
      );
    return w;
  },
};
