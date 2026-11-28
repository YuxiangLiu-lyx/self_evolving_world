import type {
  V7Ability,
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Package,
  V7Point,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Clone, v7Id, v7Json } from './continuous-data.js';
import { v7Distance } from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { EXPRESSION_LIMITS, expressionFoundation } from './expression.js';

/** ex26: a two-person reciprocal conversation session over ordinary tell. Every spoken step
 * (propose, join, resume, contribute) is one call of tell's own handler (expression.tell of
 * foundation-expression@1), so its told event is delivered by tell's own after-round delivery:
 * the same hearers within the hearing radius (config.vision), the same heard events and the
 * same bounded heard lists. Nothing ever connects people more than that radius apart:
 * proposing needs the other person seen within it, and every other spoken step needs them
 * alive within it. The session record is hidden world state; each person's own record of a
 * session shows only their own acts, what they actually heard and changes that happened
 * within that radius of them, so it is never a remote channel. Nothing is created, moved,
 * granted or rewarded. */

const ID = 'reciprocal-conversation';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The hidden record of every session. Written only after the round's actions, never shown. */
const BOOK = `${ID}:sessions`;
/** A person's own record of their open sessions; it is shown with their active work. */
const OPEN = `${ID}:work:open`;
/** A person's latest closed sessions. */
const LAST = `${ID}:last`;
const TELL = {
  ability: 'tell',
  handler: 'expression.tell',
  revision: 'foundation-expression@1',
};
const LIMIT = { topic: 80, rounds: 20, ids: 4, last: 3, retain: 40 };
/** The kernel's own urgent-risk lines (v7FinishTasks): health 60, satiety 8 and a body
 * temperature 10 from 22, or an injury in the last round. */
const SAFE = { health: 60, satiety: 8, temperature: 10 };
const MODES = [
  'propose',
  'join',
  'contribute',
  'pause',
  'resume',
  'leave',
  'cancel',
];
const EVENTS = {
  proposed: `${ID}-proposed`,
  joined: `${ID}-joined`,
  active: `${ID}-active`,
  contributed: `${ID}-contributed`,
  delivered: `${ID}-delivered`,
  interrupted: `${ID}-interrupted`,
  exchange: `${ID}-exchange`,
  paused: `${ID}-paused`,
  resumed: `${ID}-resumed`,
  ended: `${ID}-ended`,
} as const;

type Status = 'pending' | 'active' | 'paused' | 'ended';
/** One spoken step: its session event, its told event and the other participant's heard event
 * (null when they did not hear it). */
type Spoken = {
  event: string;
  utterance: string;
  tick: number;
  heard: string | null;
};
type Contribution = Spoken & {
  speaker: string;
  listener: string;
  respondsTo: string | null;
  text: string;
  exchange: string | null;
};
type Exchange = {
  id: string;
  first: string;
  response: string;
  speakers: string[];
  listeners: string[];
  topic: string;
  rounds: number[];
  evidence: string[];
};
type Session = {
  id: string;
  initiator: string;
  invited: string;
  topic: string;
  rounds: number;
  proposedAt: number;
  expiresAt: number;
  invitation: Spoken;
  status: Status;
  /** pending, active, paused, or the end: left, cancelled, death or expired. */
  reason: string | null;
  /** The participant who ended it, or null for expiry. */
  by: string | null;
  /** Per participant, the pause reason as that participant could perceive it. */
  notes: Record<string, string>;
  activeSince: number | null;
  /** Current acceptances while pending (join) and reaffirmations while paused (resume). */
  accepted: Record<string, Spoken | null>;
  resumed: Record<string, Spoken | null>;
  contributions: Contribution[];
  exchanges: Exchange[];
  endedAt: number | null;
  /** Participants whose own record of this session is still open. */
  open: string[];
};
/** A person's own record of a session: only their own acts, what they heard and changes that
 * happened within hearing range of them. */
type View = {
  session: string;
  with: string;
  role: 'proposer' | 'invited';
  topic: string;
  status: Status;
  reason: string | null;
  proposedAt: number;
  expiresAt: number;
  /** Your current acceptance: join while pending, resume while paused. */
  ready: boolean;
  /** The other person's current acceptance, only as you heard it. */
  otherReady: boolean;
  said: string[];
  heard: string[];
  exchanges: string[];
};
type Label = { id: string; initiator: string; invited: string; topic: string };
type Own = Map<string, { type: string; reason: string | null }>;

const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const nothing = (reason: string) => new Error(`${reason} Nothing was said.`);
const done = (): V7HandlerResult => ({ complete: true, writes: [] });
const UNKNOWN =
  'You have no open conversation with that session id; use the id from an invitation you heard or from your own open conversations.';
const isRecord = (v: unknown): v is V7Data =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
function book(w: V7World): Record<string, Session> {
  const raw = w.state[BOOK];
  return isRecord(raw)
    ? (v7Clone(raw) as unknown as Record<string, Session>)
    : {};
}
function views(a: V7Actor, key = OPEN): View[] {
  const raw = a.extensionState[key];
  return Array.isArray(raw) ? (v7Clone(raw) as unknown as View[]) : [];
}
/** Keys are written only when they hold something, so a person without sessions is unchanged. */
const without = <T>(data: Record<string, T>, key: string) =>
  Object.fromEntries(Object.entries(data).filter(([k]) => k !== key));
function store(a: V7Actor, key: string, list: View[]): void {
  if (list.length) a.extensionState[key] = v7Json(list);
  else if (key in a.extensionState)
    a.extensionState = without(a.extensionState, key);
}
const person = (w: V7World, id: string) =>
  w.actors.find((a) => a.id === id) ?? null;
const otherOf = (s: Label, id: string) =>
  id === s.initiator ? s.invited : s.initiator;
const alive = (a: V7Actor | null): a is V7Actor => !!a && a.vitals.health > 0;
/** Within the hearing radius, as tell's hearers are. */
const within = (w: V7World, a: V7Actor | null, b: V7Actor | null) =>
  !!a && !!b && v7Distance(a.position, b.position) <= w.config.vision;
const heardBy = (w: V7World, listener: string, utterance: string) =>
  w.events.find(
    (e) =>
      e.type === 'heard' && e.actor === listener && e.data.source === utterance,
  )?.id ?? null;
const same = (x: string) => x.trim().toLowerCase().replace(/\s+/g, ' ');

function unsafe(w: V7World, a: V7Actor): string[] {
  const v = a.vitals,
    out: string[] = [];
  if (v.health <= SAFE.health)
    out.push(`health ${shown(v.health)} is at or below ${String(SAFE.health)}`);
  if (v.satiety <= SAFE.satiety)
    out.push(
      `satiety ${shown(v.satiety)} is at or below ${String(SAFE.satiety)}`,
    );
  if (Math.abs(v.temperature - 22) >= SAFE.temperature)
    out.push(`body temperature ${shown(v.temperature)} is 10 or more from 22`);
  if (
    w.events.some((e) => e.type === 'injured' && e.actor === a.id) ||
    (a.memory.important ?? []).some(
      (e) => e.type === 'injured' && e.tick >= w.tick - 1,
    )
  )
    out.push('you were injured in the last round');
  return out;
}

/** View metadata from committed facts only: session, participants, events, topic, position,
 * round, status and reason. Delivered words keep tell's own told and heard events. */
function info(
  s: Label,
  status: string,
  reason: string | null,
  at: V7Point | null,
  tick: number,
  extra: V7Data = {},
  events: string[] = [],
): V7Data {
  return {
    operation: ID,
    session: s.id,
    status,
    reason,
    ...extra,
    view: {
      component: null,
      indicator: status,
      session: s.id,
      participants: [s.initiator, s.invited],
      topic: s.topic,
      tick,
      x: at?.x ?? null,
      y: at?.y ?? null,
      status,
      reason,
      events,
    },
  };
}
/** A private notice to one participant: no position, so nobody else observes it. */
function notify(
  w: V7World,
  a: V7Actor,
  type: string,
  description: string,
  data: V7Data,
): void {
  w.events.push({
    id: v7Id(w, 'event'),
    tick: w.tick,
    actor: a.id,
    type,
    interface: null,
    success: true,
    description,
    position: null,
    target: null,
    data,
  });
}

/** tell's own handler, from the installed foundation-expression@1. */
function tellHandler(w: V7World) {
  const culture = w.config.longDevelopment?.culture,
    scope = w.config.development?.scope,
    contract = w.abilities.find((x) => x.id === TELL.ability);
  const handler =
    culture?.symbols &&
    scope &&
    contract?.handler === TELL.handler &&
    w.revisions.includes(TELL.revision)
      ? expressionFoundation(scope, culture, w.config.vision).handlers[
          TELL.handler
        ]
      : undefined;
  if (!handler) throw nothing('The ordinary tell interface is unavailable.');
  return handler;
}
/** Says the text aloud through tell's own handler; returns its told event id. */
function speak(c: V7ActionContext, text: string): string {
  const from = c.world.events.length;
  tellHandler(c.world)({
    ...c,
    action: { interface: TELL.ability, args: { text } },
  });
  const told = c.world.events.slice(from).find((e) => e.type === 'told');
  if (!told) throw nothing('tell said nothing.');
  return told.id;
}
function line(text: string, note: string): string {
  const out = note ? `${text} ${note}` : text;
  if (out.length > EXPRESSION_LIMITS.tell)
    throw nothing(
      `With your words this is ${String(out.length)} characters; tell allows ${String(EXPRESSION_LIMITS.tell)}. Shorten the topic or text.`,
    );
  return out;
}

function propose(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c,
    g = c.action.args;
  const ids = Array.isArray(g.participants) ? g.participants : [];
  const invited = ids.find((x) => x !== a.id);
  if (ids.length !== 2 || !ids.includes(a.id) || typeof invited !== 'string')
    throw nothing(
      'Give participants as your own id and the id of one other person.',
    );
  const own = views(a).find((v) => v.role === 'proposer');
  if (own)
    throw nothing(
      `Your conversation ${own.session} is still open; leave or cancel it first.`,
    );
  const topic = str(g.topic).trim();
  if (!topic || topic.length > LIMIT.topic)
    throw nothing(`Give a topic of 1 to ${String(LIMIT.topic)} characters.`);
  const rounds = g.rounds;
  if (
    typeof rounds !== 'number' ||
    !Number.isSafeInteger(rounds) ||
    rounds < 1 ||
    rounds > LIMIT.rounds
  )
    throw nothing(`Give rounds from 1 to ${String(LIMIT.rounds)}.`);
  // Only a living person seen now within hearing range; every other case gets the same answer.
  const other = person(w, invited);
  if (
    !alive(other) ||
    !within(w, a, other) ||
    !v7Observe(w, a.id).actors.some((x) => x.id === invited && x.alive)
  )
    throw nothing(
      `Invite one other living person you can see within ${String(w.config.vision)} units.`,
    );
  const risks = unsafe(w, a);
  if (risks.length)
    throw nothing(`Attend to the urgent risk first: ${risks.join('; ')}.`);
  const s: Label = {
    id: `session-${String(w.tick)}-${a.id}`,
    initiator: a.id,
    invited,
    topic,
  };
  const expiresAt = w.tick + rounds;
  const utterance = speak(
    c,
    line(
      `${s.id}: ${a.name} invites ${other.name} to a conversation about "${topic}" until round ${String(expiresAt)}; each of you joins with this id and topic.`,
      str(g.text).trim(),
    ),
  );
  c.emit(
    EVENTS.proposed,
    `Proposed conversation ${s.id} with ${other.name} about "${topic}" until round ${String(expiresAt)}. It is pending: it starts only after both of you join.`,
    info(
      s,
      'pending',
      null,
      a.position,
      w.tick,
      { initiator: a.id, invited, topic, rounds, expiresAt, utterance },
      [utterance],
    ),
  );
  return done();
}
function join(c: V7ActionContext, s: Session, other: V7Actor): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (s.status !== 'pending')
    throw nothing(
      `Conversation ${s.id} is ${s.status}; join accepts a pending one${s.status === 'paused' ? ', resume continues a paused one' : ''}.`,
    );
  if (str(c.action.args.topic).trim() !== s.topic)
    throw nothing(
      `Join with the topic "${s.topic}" exactly; another topic needs a new conversation that both of you join.`,
    );
  const utterance = speak(
    c,
    line(
      `${s.id}: ${a.name} joins the conversation with ${other.name} about "${s.topic}".`,
      str(c.action.args.text).trim(),
    ),
  );
  c.emit(
    EVENTS.joined,
    `Joined conversation ${s.id}; it starts once ${other.name} has joined too and each of you heard the other.`,
    info(
      s,
      'pending',
      null,
      a.position,
      w.tick,
      { participant: a.id, utterance },
      [utterance],
    ),
  );
  return done();
}
function resume(
  c: V7ActionContext,
  s: Session,
  other: V7Actor,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (s.status !== 'paused')
    throw nothing(
      `Only a paused conversation can be resumed; ${s.id} is ${s.status}.`,
    );
  const utterance = speak(
    c,
    line(
      `${s.id}: ${a.name} resumes the conversation with ${other.name}.`,
      str(c.action.args.text).trim(),
    ),
  );
  c.emit(
    EVENTS.resumed,
    `Resumed conversation ${s.id}; it continues once ${other.name} has resumed too and each of you heard the other.`,
    info(
      s,
      'paused',
      null,
      a.position,
      w.tick,
      { participant: a.id, utterance },
      [utterance],
    ),
  );
  return done();
}
function contribute(
  c: V7ActionContext,
  s: Session,
  other: V7Actor,
): V7HandlerResult {
  const { world: w, actor: a } = c,
    g = c.action.args;
  if (s.status !== 'active')
    throw nothing(
      `Conversation ${s.id} is ${s.status}; contribute needs it active.`,
    );
  const text = str(g.text);
  if (!text.trim()) throw nothing('Give the words to say as text.');
  if (text.length > EXPRESSION_LIMITS.tell)
    throw nothing(
      `tell allows ${String(EXPRESSION_LIMITS.tell)} characters; this text has ${String(text.length)}.`,
    );
  const reply = str(g.respondsTo) || null;
  if (
    reply &&
    !s.contributions.some(
      (x) => x.utterance === reply && x.speaker === other.id,
    )
  )
    throw nothing(
      `respondsTo must be the id of an utterance ${other.name} said in this conversation that you heard.`,
    );
  const utterance = speak(c, text);
  c.emit(
    EVENTS.contributed,
    `Spoke in conversation ${s.id}${reply ? ` in reply to ${reply}` : ''}; it counts once ${other.name} has heard it.`,
    info(
      s,
      'active',
      null,
      a.position,
      w.tick,
      { speaker: a.id, listener: other.id, utterance, respondsTo: reply },
      reply ? [utterance, reply] : [utterance],
    ),
  );
  return done();
}

function execute(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c,
    g = c.action.args;
  const mode = str(g.mode);
  if (!MODES.includes(mode)) throw nothing(`Give mode ${MODES.join(', ')}.`);
  if (mode === 'propose') return propose(c);
  const id = str(g.session);
  const mine = views(a).find((v) => v.session === id);
  const s = mine ? book(w)[id] : undefined;
  if (!mine || !s) {
    const closed = views(a, LAST).find((v) => v.session === id);
    throw nothing(
      closed
        ? `Conversation ${id} has ended (${closed.reason ?? 'ended'}); a new one needs a new proposal.`
        : UNKNOWN,
    );
  }
  const other = person(w, mine.with);
  const name = other?.name ?? mine.with;
  if (mode === 'leave' || mode === 'cancel') {
    const reason = mode === 'leave' ? 'left' : 'cancelled';
    c.emit(
      EVENTS.ended,
      `${mode === 'leave' ? 'Left' : 'Cancelled'} conversation ${id} with ${name}; what was said stays said.`,
      info(s, 'ended', reason, a.position, w.tick, { mode, by: a.id }),
    );
    return done();
  }
  // Every other mode needs the other person alive within hearing range before anything about
  // the session is checked or said, so a refusal never tells what happened out of range.
  if (!alive(other) || !within(w, a, other))
    throw nothing(
      `${name} must be alive and within ${String(w.config.vision)} units of you.`,
    );
  if (s.status === 'ended')
    throw nothing(
      `Conversation ${id} has ended; a new one needs a new proposal.`,
    );
  if (mode === 'pause') {
    if (s.status !== 'active')
      throw nothing(
        `Only an active conversation can be paused; ${id} is ${s.status}.`,
      );
    c.emit(
      EVENTS.paused,
      `Paused conversation ${id} with ${name}; both of you must resume to continue.`,
      info(s, 'paused', 'paused', a.position, w.tick, { mode, by: a.id }),
    );
    return done();
  }
  const risks = unsafe(w, a);
  if (risks.length)
    throw nothing(`Attend to the urgent risk first: ${risks.join('; ')}.`);
  if (mode === 'join') return join(c, s, other);
  if (mode === 'resume') return resume(c, s, other);
  return contribute(c, s, other);
}

/** This round kept the session for that person: a step of this session, wait (silence) or a
 * refused step of this interface. Any other action pauses it. */
function continued(w: V7World, s: Session, p: string): boolean {
  const own = w.events.filter((e) => e.actor === p && e.interface !== null);
  if (
    own.some(
      (e) => e.success && e.interface === ID && e.data.session === s.id,
    ) ||
    own.some((e) => !e.success && e.interface === ID)
  )
    return true;
  return own.length > 0 && own.every((e) => e.interface === 'wait');
}
/** Pause reasons per participant, as each can perceive them: their own causes always, the other
 * person's only within hearing range. */
function notes(
  w: V7World,
  s: Session,
  causes: Record<string, string[]>,
  apart: boolean,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of [s.initiator, s.invited]) {
    const q = otherOf(s, p),
      them = person(w, q)?.name ?? q;
    const parts = (causes[p] ?? []).map((x) =>
      x === 'pause'
        ? 'you paused it'
        : x === 'action'
          ? 'you took another action'
          : `you must attend to an urgent risk (${x})`,
    );
    if (!apart)
      parts.push(
        ...(causes[q] ?? []).map((x) =>
          x === 'pause'
            ? `${them} paused it`
            : x === 'action'
              ? `${them} took another action`
              : `${them} must attend to an urgent risk`,
        ),
      );
    if (apart)
      parts.push(
        `you are not both alive within ${String(w.config.vision)} units`,
      );
    out[p] = parts.join('; ') || 'paused';
  }
  return out;
}
function finish(
  w: V7World,
  s: Session,
  reason: string,
  by: string | null,
): void {
  s.status = 'ended';
  s.reason = reason;
  s.by = by;
  s.endedAt = w.tick;
  s.activeSince = null;
}
function ending(reason: string | null, own: boolean, them: string): string {
  if (reason === 'expired') return 'the expiry round passed';
  if (reason === 'death') return own ? 'you died' : `${them} died`;
  if (reason === 'cancelled')
    return own ? 'you cancelled it' : `${them} cancelled it`;
  return own ? 'you left' : `${them} left`;
}
function closeView(a: V7Actor, list: View[], final: View): void {
  store(
    a,
    OPEN,
    list.filter((v) => v.session !== final.session),
  );
  store(a, LAST, [...views(a, LAST), final].slice(-LIMIT.last));
}
function derive(s: Session, p: string, status: Status, reason: string | null) {
  const q = otherOf(s, p),
    marks =
      s.status === 'pending'
        ? s.accepted
        : s.status === 'paused'
          ? s.resumed
          : null;
  const view: View = {
    session: s.id,
    with: q,
    role: p === s.initiator ? 'proposer' : 'invited',
    topic: s.topic,
    status,
    reason,
    proposedAt: s.proposedAt,
    expiresAt: s.expiresAt,
    ready: status === 'active' || (!!marks && !!marks[p]),
    otherReady: status === 'active' || (!!marks && !!marks[q]?.heard),
    said: s.contributions
      .filter((x) => x.speaker === p)
      .map((x) => x.utterance)
      .slice(-LIMIT.ids),
    heard: s.contributions
      .filter((x) => x.speaker === q)
      .map((x) => x.utterance)
      .slice(-LIMIT.ids),
    exchanges: s.exchanges.map((x) => x.id).slice(-LIMIT.ids),
  };
  return view;
}
/** Brings each participant's own record up to date with what they can know. An end by the other
 * person shows only within hearing range, at expiry or after their own leave; until then their
 * record stays as if nothing happened out of range. `dead` closes that person's records. */
function sync(
  w: V7World,
  s: Session,
  own: Own,
  dead: string | null = null,
): void {
  for (const p of [s.initiator, s.invited]) {
    if (!s.open.includes(p)) continue;
    const a = person(w, p);
    if (!a) continue;
    const q = otherOf(s, p),
      b = person(w, q),
      them = b?.name ?? q;
    const near = within(w, a, b);
    const list = views(a),
      old = list.find((v) => v.session === s.id) ?? null;
    const mine = own.get(`${s.id}:${p}`);
    const left = mine?.type === EVENTS.ended;
    if (dead === p || left || s.status === 'ended') {
      const self = dead === p || left || s.by === p;
      if (!(self || near || s.reason === 'expired' || w.tick >= s.expiresAt)) {
        // Out of range: kept as the person last knew it; an active one pauses for range.
        if (old?.status === 'active') {
          const reason =
            s.notes[p] ??
            `you are not both alive within ${String(w.config.vision)} units`;
          store(a, OPEN, [
            ...list.filter((v) => v.session !== s.id),
            {
              ...old,
              status: 'paused',
              reason,
              ready: false,
              otherReady: false,
            },
          ]);
          notify(
            w,
            a,
            EVENTS.paused,
            `Conversation ${s.id} with ${them} paused: ${reason}.`,
            info(s, 'paused', reason, a.position, w.tick),
          );
        }
        continue;
      }
      const reason =
        dead === p
          ? 'you died'
          : left
            ? ending(mine.reason, true, them)
            : s.by === p
              ? ending(s.reason, true, them)
              : near && s.reason !== 'expired'
                ? ending(s.reason, false, them)
                : 'the expiry round passed';
      closeView(a, list, { ...derive(s, p, 'ended', reason), ready: false });
      s.open = s.open.filter((x) => x !== p);
      if (!left)
        notify(
          w,
          a,
          EVENTS.ended,
          `Conversation ${s.id} with ${them} ended: ${reason}.`,
          info(s, 'ended', reason, a.position, w.tick, {
            exchanges: s.exchanges.map((x) => x.id),
          }),
        );
      continue;
    }
    const next = derive(
      s,
      p,
      s.status,
      s.status === 'paused' ? (s.notes[p] ?? 'paused') : null,
    );
    store(a, OPEN, [...list.filter((v) => v.session !== s.id), next]);
    if (next.status === 'active' && old?.status !== 'active')
      notify(
        w,
        a,
        EVENTS.active,
        `Conversation ${s.id} with ${them} about "${s.topic}" is active: both of you joined and heard each other. Speak with contribute; wait keeps it in silence.`,
        info(s, 'active', null, a.position, w.tick, {
          accepted: [...Object.values(s.accepted), ...Object.values(s.resumed)]
            .filter((x): x is Spoken => !!x)
            .map((x) => x.event),
        }),
      );
    if (
      next.status === 'paused' &&
      old?.status === 'active' &&
      mine?.type !== EVENTS.paused
    )
      notify(
        w,
        a,
        EVENTS.paused,
        `Conversation ${s.id} with ${them} paused: ${next.reason ?? 'paused'}. Both of you must resume to continue.`,
        info(s, 'paused', next.reason, a.position, w.tick),
      );
  }
}
/** Commits a contribution the other participant actually heard; records a reciprocal exchange
 * when it answers an earlier committed utterance of the other person with new words. */
function commit(
  w: V7World,
  s: Session,
  spoken: Spoken,
  speaker: string,
  respondsTo: string | null,
): void {
  const listener = otherOf(s, speaker),
    a = person(w, speaker),
    b = person(w, listener);
  if (!a) return;
  const them = b?.name ?? listener;
  if (!spoken.heard || s.status !== 'active') {
    notify(
      w,
      a,
      EVENTS.interrupted,
      `${them} did not hear your words in conversation ${s.id}; they stay said to whoever heard them but do not count in the conversation.`,
      info(
        s,
        'interrupted',
        'not heard',
        a.position,
        w.tick,
        { speaker, listener, utterance: spoken.utterance },
        [spoken.event, spoken.utterance],
      ),
    );
    return;
  }
  const told = w.events.find((e) => e.id === spoken.utterance);
  const entry: Contribution = {
    ...spoken,
    speaker,
    listener,
    respondsTo,
    text: str(told?.data.text),
    exchange: null,
  };
  const first = respondsTo
    ? s.contributions.find(
        (x) =>
          x.utterance === respondsTo &&
          x.speaker === listener &&
          x.tick < w.tick,
      )
    : undefined;
  const fresh =
    !!first &&
    same(entry.text) !== same(first.text) &&
    !s.contributions.some(
      (x) => x.speaker === speaker && same(x.text) === same(entry.text),
    );
  s.contributions.push(entry);
  notify(
    w,
    a,
    EVENTS.delivered,
    `${them} heard your words in conversation ${s.id}.`,
    info(
      s,
      'active',
      null,
      a.position,
      w.tick,
      {
        speaker,
        listener,
        utterance: spoken.utterance,
        heard: spoken.heard,
        respondsTo,
      },
      [spoken.event, spoken.utterance, spoken.heard],
    ),
  );
  if (!first || first.exchange || !fresh || !first.heard || !b) return;
  const exchange: Exchange = {
    id: `${s.id}:exchange-${String(s.exchanges.length + 1)}`,
    first: first.utterance,
    response: spoken.utterance,
    speakers: [listener, speaker],
    listeners: [speaker, listener],
    topic: s.topic,
    rounds: [first.tick, w.tick],
    evidence: [first.heard, spoken.heard],
  };
  first.exchange = exchange.id;
  entry.exchange = exchange.id;
  s.exchanges.push(exchange);
  for (const x of [b, a])
    notify(
      w,
      x,
      EVENTS.exchange,
      `Reciprocal exchange in conversation ${s.id}: ${a.name} answered ${b.name}'s ${first.utterance} with ${spoken.utterance}, and each was heard.`,
      info(s, 'active', null, x.position, w.tick, { exchange }, [
        first.utterance,
        spoken.utterance,
        first.heard,
        spoken.heard,
      ]),
    );
}

/** After the round's actions and tell's own delivery: commit what was said and heard, apply
 * pause, leave and cancel, then pauses, activations and expiry, then each person's record. */
function environment(w: V7World): void {
  const all = book(w),
    before = new Map(Object.values(all).map((s) => [s.id, s.status]));
  const acts = w.events.filter(
    (e) =>
      e.success &&
      e.interface === ID &&
      !!e.actor &&
      typeof e.data.session === 'string',
  );
  if (!acts.length && !Object.keys(all).length) return;
  const own: Own = new Map(),
    paused = new Set<string>();
  // Speech first: what was said and heard this round stays said even if someone also left.
  for (const e of acts) {
    const actor = String(e.actor),
      sid = str(e.data.session),
      utterance = str(e.data.utterance);
    if (e.type === EVENTS.proposed) {
      const invited = str(e.data.invited),
        heard = heardBy(w, invited, utterance);
      all[sid] = {
        id: sid,
        initiator: actor,
        invited,
        topic: str(e.data.topic),
        rounds: Number(e.data.rounds),
        proposedAt: w.tick,
        expiresAt: Number(e.data.expiresAt),
        invitation: { event: e.id, utterance, tick: w.tick, heard },
        status: 'pending',
        reason: 'pending',
        by: null,
        notes: {},
        activeSince: null,
        accepted: { [actor]: null, [invited]: null },
        resumed: { [actor]: null, [invited]: null },
        contributions: [],
        exchanges: [],
        endedAt: null,
        open: heard ? [actor, invited] : [actor],
      };
      continue;
    }
    const s = all[sid];
    if (!s || s.status === 'ended') continue;
    const spoken: Spoken = {
      event: e.id,
      utterance,
      tick: w.tick,
      heard: utterance ? heardBy(w, otherOf(s, actor), utterance) : null,
    };
    if (e.type === EVENTS.joined && s.status === 'pending') {
      s.accepted[actor] = spoken;
      // The invited person who missed the invitation but hears the proposer join now knows it.
      if (spoken.heard && !s.open.includes(s.invited)) s.open.push(s.invited);
    } else if (e.type === EVENTS.resumed && s.status === 'paused')
      s.resumed[actor] = spoken;
    else if (e.type === EVENTS.contributed)
      commit(w, s, spoken, actor, str(e.data.respondsTo) || null);
  }
  for (const e of acts) {
    const s = all[str(e.data.session)],
      actor = String(e.actor);
    if (!s) continue;
    if (e.type === EVENTS.paused) {
      own.set(`${s.id}:${actor}`, { type: e.type, reason: 'paused' });
      paused.add(`${s.id}:${actor}`);
    }
    if (e.type === EVENTS.ended) {
      const reason = str(e.data.reason) || 'left';
      own.set(`${s.id}:${actor}`, { type: e.type, reason });
      if (s.status !== 'ended') finish(w, s, reason, actor);
    }
  }
  for (const s of Object.values(all)) {
    const a = person(w, s.initiator),
      b = person(w, s.invited),
      apart = !(alive(a) && alive(b) && within(w, a, b));
    if (before.get(s.id) === 'active' && a && b) {
      const causes: Record<string, string[]> = {};
      for (const x of [a, b]) {
        const list: string[] = [];
        if (paused.has(`${s.id}:${x.id}`)) list.push('pause');
        else if (!continued(w, s, x.id)) list.push('action');
        const risks = alive(x) ? unsafe(w, x) : [];
        if (risks.length) list.push(risks.join('; '));
        causes[x.id] = list;
      }
      s.notes = notes(w, s, causes, apart);
      if (
        s.status === 'active' &&
        w.tick < s.expiresAt &&
        (apart || Object.values(causes).some((x) => x.length))
      ) {
        s.status = 'paused';
        s.reason = 'paused';
        s.activeSince = null;
        s.resumed = { [s.initiator]: null, [s.invited]: null };
      }
    }
    if (s.status === 'ended') continue;
    if (w.tick >= s.expiresAt) {
      finish(w, s, 'expired', null);
      continue;
    }
    const marks = s.status === 'pending' ? s.accepted : s.resumed;
    if (
      (s.status === 'pending' || s.status === 'paused') &&
      !apart &&
      marks[a.id]?.heard &&
      marks[b.id]?.heard &&
      !unsafe(w, a).length &&
      !unsafe(w, b).length
    ) {
      s.status = 'active';
      s.reason = 'active';
      s.activeSince = w.tick;
      s.notes = {};
    }
  }
  for (const s of Object.values(all)) sync(w, s, own);
  // Bounded retention: a closed session is dropped 40 rounds after its end once nobody's own
  // record of it is open; its events stay in the event journal.
  const kept = Object.values(all).filter(
    (s) =>
      !(
        s.status === 'ended' &&
        !s.open.length &&
        s.endedAt !== null &&
        w.tick - s.endedAt >= LIMIT.retain
      ),
  );
  if (kept.length)
    w.state[BOOK] = v7Json(Object.fromEntries(kept.map((s) => [s.id, s])));
  else if (BOOK in w.state) w.state = without(w.state, BOOK);
}
function onDeath(w: V7World, a: V7Actor): void {
  const all = book(w);
  let changed = false;
  for (const s of Object.values(all)) {
    if (s.initiator !== a.id && s.invited !== a.id) continue;
    if (s.status !== 'ended') finish(w, s, 'death', a.id);
    sync(w, s, new Map(), a.id);
    changed = true;
  }
  if (changed) w.state[BOOK] = v7Json(all);
}

const ABILITY: V7Ability = {
  id: ID,
  name: 'Reciprocal conversation',
  function:
    'A two-person conversation session over ordinary tell: propose it to someone you see within 5, each of you joins, then speak with contribute, optionally answering a heard utterance of the other.',
  equivalence: 'conversation:two-person-reciprocal-session:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: MODES },
      session: { type: 'string', maxLength: 1000 },
      participants: {
        type: 'array',
        items: { type: 'string', maxLength: 1000 },
      },
      topic: { type: 'string', maxLength: 1000 },
      text: { type: 'string', maxLength: 1000 },
      rounds: { type: 'integer', minimum: 1, maximum: LIMIT.rounds },
      respondsTo: { type: 'string', maxLength: 1000 },
    }),
    required: ['mode'],
  },
  references: {},
  prerequisites: [TELL.ability],
  dependencies: { abilities: [TELL.ability], resources: [], knowledge: [] },
  learning: 1,
  costs:
    "propose, join, resume, contribute: tell's cost, 1 round, 0 energy, 0 material. pause, leave, cancel: no energy, no speech; they only use your action. Study: 1 round; needs tell.",
  effects:
    'propose: participants [you, them], topic (max 80), rounds 1-20 until expiry; says an invitation with the session id; only someone who hears it can join. join (with session and topic, the proposer too) and resume say a short tell; contribute says text (max 240) as tell; optional respondsTo: a heard utterance id of theirs in it. Each needs them alive within 5; words count only if they heard them. Active once both joined and heard each other. An answer with new words to their earlier utterance records a reciprocal exchange. Another action (wait is silence), urgent risk or more than 5 apart pauses it; both must resume. leave, cancel, death or expiry ends it. Your record shows only your acts, what you heard and changes within 5 of you. Grants nothing; no reward.',
  handler: HANDLER,
  revision: REVISION,
  authored: false,
  // The exchange notice never carries a qualified flag: conversation earns no practice milestone.
  practiceEvidence: EVENTS.exchange,
  execution: {
    duration: 1,
    interruption: 'cancel',
    progress:
      'Each mode is one complete action; a session spans rounds through separate actions of both people.',
  },
};

/** ex26: Kai's reciprocal conversation over ordinary tell. */
export const LONG_EX26_CONVERSATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex26',
  dependencies: ['foundation-open@1'],
  description:
    'Two-person reciprocal conversation sessions over ordinary tell: proposal to a person seen within 5, independent joins, contributions with optional replies, reciprocal exchange records, pause, resume, leave, cancel, death and expiry. Only hearers within 5 receive anything. No new medium, movement, item or reward.',
  reuse: {
    experiment:
      'foundation-expression@1 tell (expression.tell, equivalence expression-baseline:tell:1: up to 240 characters, 1 round, 0 energy, heard by every living person within config.vision through its after-round delivery, heard events and bounded heard lists); invite (expression-baseline:invite:1) is not called, people may use it themselves; message delivery is not used as evidence',
    source:
      "expression.ts (expressionFoundation(...).handlers['expression.tell'] called itself for every spoken step, EXPRESSION_LIMITS); continuous-observation.ts (v7Observe, who is seen); continuous-geometry.ts (v7Distance)",
    description:
      'Code dependency, not a copy: every spoken step is the tell handler itself, delivered by tell. New: session records, acceptance, reply and exchange checks, pause, resume and end rules, and records that disclose only what each person perceived.',
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
      !w.config.experience ||
      !w.config.longDevelopment?.culture?.symbols ||
      !w.revisions.includes(TELL.revision) ||
      w.abilities.find((a) => a.id === TELL.ability)?.handler !== TELL.handler
    )
      throw new Error(
        'Reciprocal conversation needs the ordinary tell interface of foundation-expression@1.',
      );
    return w;
  },
};
