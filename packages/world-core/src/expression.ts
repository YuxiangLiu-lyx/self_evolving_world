import type {
  V7Ability,
  V7ActionContext,
  V7Actor,
  V7CultureOptions,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Point,
  V7Schema,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Id, v7Number, v7RoundNumber } from './continuous-data.js';
import { v7Distance, v7Inside, v7Reach } from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import {
  EXPRESSION_INCENTIVE_EVENTS,
  EXPRESSION_INCENTIVE_RULES,
  expressionIncentives,
} from './expression-incentives.js';

/** Package id of the authored symbolic foundation of the opt-in culture scenario. */
export const EXPRESSION_PACKAGE = 'foundation-expression';
export const EXPRESSION_REVISION = `${EXPRESSION_PACKAGE}@1`;
export const EXPRESSION_INTERFACES = ['name', 'mark', 'tell', 'invite'];
/** World-object kinds that hold symbolic records; they have no physical effect. */
export const EXPRESSION_SIGN_KINDS = ['name', 'mark', 'invitation'];
/** Text bounds, persistence bounds and ranges. Hearing uses the configured vision radius. */
export const EXPRESSION_LIMITS = {
  name: 60,
  mark: 120,
  tell: 240,
  invite: 120,
  signsPerPerson: 24,
  invitationsPerPerson: 3,
  invitationHorizon: 200,
  invitationGrace: 10,
  meetingRadius: 2.5,
  heard: 6,
} as const;
const SYMBOL_EVENTS = [
  'named',
  'marked',
  'told',
  'invited',
  'heard',
  'attendance',
];

export function expressionSign(object: V7Object): boolean {
  return (
    object.revision === EXPRESSION_REVISION &&
    EXPRESSION_SIGN_KINDS.includes(object.kind)
  );
}
const done = (): V7HandlerResult => ({ complete: true, writes: [] });
function bounded(value: unknown, label: string, limit: number, empty = false) {
  if (typeof value !== 'string') throw new Error(`The ${label} must be text.`);
  const text = value;
  if (text.length > limit)
    throw new Error(
      `The ${label} is limited to ${String(limit)} characters; nothing was recorded.`,
    );
  if (!empty && !text.trim())
    throw new Error(`The ${label} must not be empty.`);
  return text;
}
/** Bounded text arguments as an ordinary error before execution, so an oversized
 * plan is rejected with one correction instead of reaching the parsing guard. */
export function expressionArgumentIssue(action: {
  interface: string;
  args: V7Data;
}): string | null {
  const limit =
    action.interface === 'name'
      ? EXPRESSION_LIMITS.name
      : action.interface === 'mark'
        ? EXPRESSION_LIMITS.mark
        : action.interface === 'tell'
          ? EXPRESSION_LIMITS.tell
          : action.interface === 'invite'
            ? EXPRESSION_LIMITS.invite
            : null;
  const text = action.args.text;
  return limit !== null && typeof text === 'string' && text.length > limit
    ? `${action.interface} text is limited to ${String(limit)} characters.`
    : null;
}
function subjectOf(c: V7ActionContext, mode: 'visible' | 'reach') {
  const { world: w, actor: a } = c,
    subject = c.action.args.subject;
  if (typeof subject !== 'string')
    throw new Error(
      'The subject must be text; use an empty subject for this place.',
    );
  if (subject === '')
    return {
      key: `place:${String(Math.floor(a.position.x))},${String(Math.floor(a.position.y))}`,
      kind: 'place',
      label: 'this place',
    };
  const object = w.objects.find((o) => o.id === subject && !expressionSign(o));
  if (object) {
    if (
      mode === 'reach'
        ? !v7Reach(a, object.spatial)
        : !v7Observe(w, a.id).objects.some((o) => o.id === subject)
    )
      throw new Error(
        mode === 'reach'
          ? 'Approach the object before marking it.'
          : 'Only a currently visible object can be named from here.',
      );
    return { key: subject, kind: 'object', label: object.name };
  }
  const stack = w.stacks.find(
    (s) =>
      s.id === subject &&
      (s.owner === a.id ||
        (s.owner === null &&
          v7Distance(a.position, s.position) <=
            a.radius + w.config.interaction)),
  );
  if (stack) return { key: subject, kind: 'item', label: stack.resource };
  throw new Error(
    'Use an empty subject for this place, or the exact id of a nearby object or an owned or nearby ground item.',
  );
}
function sign(
  c: V7ActionContext,
  kind: string,
  text: string,
  data: V7Data,
): V7Object {
  const { world: w, actor: a } = c;
  const object: V7Object = {
    id: v7Id(w, 'sign'),
    kind,
    name: kind === 'name' ? 'Name' : kind === 'mark' ? 'Mark' : 'Invitation',
    spatial: {
      x: a.position.x,
      y: a.position.y,
      angle: 0,
      shape: { kind: 'circle', radius: 0.06 },
      solid: false,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'sign',
      color: '#eadfba',
      accent:
        kind === 'name' ? '#8fb7d6' : kind === 'mark' ? '#d6a16f' : '#c9a3d9',
      label: text.slice(0, 40),
      state: kind,
    },
    data: { text, by: a.id, at: w.tick, ...data },
    createdBy: a.id,
    createdAt: w.tick,
    revision: EXPRESSION_REVISION,
  };
  w.objects.push(object);
  return object;
}
/** Keep each person's most recent records; older ones fade without any other effect. */
function fade(w: V7World, actor: string, kinds: string[], limit: number) {
  const own = w.objects.filter(
    (o) => expressionSign(o) && o.createdBy === actor && kinds.includes(o.kind),
  );
  const faded = own
    .sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1))
    .slice(0, Math.max(0, own.length - limit))
    .map((o) => o.id);
  w.objects = w.objects.filter((o) => !faded.includes(o.id));
  return faded;
}
function name(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c,
    text = bounded(c.action.args.text, 'name', EXPRESSION_LIMITS.name),
    subject = subjectOf(c, 'visible');
  const existing = w.objects.find(
    (o) =>
      expressionSign(o) &&
      o.kind === 'name' &&
      o.createdBy === a.id &&
      o.data.subject === subject.key,
  );
  const previous =
    typeof existing?.data.text === 'string' ? existing.data.text : null;
  const record = existing ?? sign(c, 'name', text, {});
  record.data = {
    ...record.data,
    text,
    at: w.tick,
    subject: subject.key,
    subjectKind: subject.kind,
  };
  record.visual.label = text.slice(0, 40);
  const faded = fade(
    w,
    a.id,
    ['name', 'mark'],
    EXPRESSION_LIMITS.signsPerPerson,
  );
  c.emit(
    'named',
    `${a.name} named ${subject.label} "${text}".`,
    {
      sign: record.id,
      subject: subject.key,
      subjectKind: subject.kind,
      text,
      previous,
      faded,
    },
    record.id,
  );
  return done();
}
function mark(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c,
    text = bounded(c.action.args.text, 'mark', EXPRESSION_LIMITS.mark),
    subject = subjectOf(c, 'reach');
  const record = sign(c, 'mark', text, {
    subject: subject.key,
    subjectKind: subject.kind,
  });
  const faded = fade(
    w,
    a.id,
    ['name', 'mark'],
    EXPRESSION_LIMITS.signsPerPerson,
  );
  c.emit(
    'marked',
    `${a.name} left a mark on ${subject.label}: "${text}".`,
    {
      sign: record.id,
      subject: subject.key,
      subjectKind: subject.kind,
      text,
      faded,
    },
    record.id,
  );
  return done();
}
function tell(c: V7ActionContext): V7HandlerResult {
  const text = bounded(c.action.args.text, 'tell', EXPRESSION_LIMITS.tell);
  c.emit('told', text, {
    text,
    by: c.actor.id,
    hearing: c.world.config.vision,
  });
  return done();
}
function invite(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c,
    text = bounded(
      c.action.args.text,
      'invitation',
      EXPRESSION_LIMITS.invite,
      true,
    ),
    place = {
      x: v7RoundNumber(
        v7Number(c.action.args.x, 'meeting x', 0, w.config.width),
      ),
      y: v7RoundNumber(
        v7Number(c.action.args.y, 'meeting y', 0, w.config.height),
      ),
    },
    round = v7Number(c.action.args.round, 'meeting round');
  if (
    !Number.isSafeInteger(round) ||
    round <= w.tick ||
    round > w.tick + EXPRESSION_LIMITS.invitationHorizon
  )
    throw new Error(
      `The meeting round must be a later round within ${String(EXPRESSION_LIMITS.invitationHorizon)} rounds; this round is ${String(w.tick)}.`,
    );
  if (
    !v7Inside(w, place, 0.3) ||
    w.terrain[Math.floor(place.y)]?.[Math.floor(place.x)] === '~'
  )
    throw new Error(
      'The meeting place must be inside the world on dry ground.',
    );
  const record = sign(
    c,
    'invitation',
    text || `Meet at round ${String(round)}`,
    {
      text,
      meeting: { x: place.x, y: place.y, round },
      until: round + EXPRESSION_LIMITS.invitationGrace,
    },
  );
  const faded = fade(
    w,
    a.id,
    ['invitation'],
    EXPRESSION_LIMITS.invitationsPerPerson,
  );
  c.emit(
    'invited',
    `${a.name} invited listeners to meet at (${String(place.x)}, ${String(place.y)}) at round ${String(round)}${text ? `: ${text}` : '.'}`,
    { sign: record.id, meeting: { ...place, round }, text, by: a.id, faded },
    record.id,
  );
  return done();
}
function heardList(value: unknown): V7Data[] {
  return Array.isArray(value)
    ? value.filter(
        (x): x is V7Data => !!x && typeof x === 'object' && !Array.isArray(x),
      )
    : [];
}
/** Everyone who hears a sound made at a position: every other living person within the
 * hearing radius (the configured vision radius), seen or not, in world order. Shared by
 * tell and invite, and called by reviewed sound such as ex25's vocal-music@1. */
export function expressionHearers(
  world: V7World,
  source: string,
  position: V7Point,
): V7Actor[] {
  return world.actors.filter(
    (listener) =>
      !(
        listener.id === source ||
        listener.vitals.health <= 0 ||
        v7Distance(listener.position, position) > world.config.vision
      ),
  );
}
/** One private heard event for a listener, kept in the listener's bounded heard list. */
export function expressionHear(
  world: V7World,
  listener: V7Actor,
  description: string,
  data: V7Data,
  target: string | null = null,
): void {
  world.events.push({
    id: v7Id(world, 'event'),
    tick: world.tick,
    actor: listener.id,
    type: 'heard',
    interface: null,
    success: true,
    description,
    position: null,
    target,
    data,
  });
  listener.extensionState['expression:heard'] = [
    ...heardList(listener.extensionState['expression:heard']),
    { tick: world.tick, ...data },
  ].slice(-EXPRESSION_LIMITS.heard);
}
/** Spoken words reach every living person within hearing range at the speaker's
 * position; each listener receives a private heard event and a bounded heard list. */
function deliver(world: V7World): void {
  const spoken = world.events.filter(
    (e) =>
      e.success &&
      (e.type === 'told' || e.type === 'invited') &&
      e.actor &&
      e.position,
  );
  for (const e of spoken) {
    const speaker = world.actors.find((a) => a.id === e.actor),
      position = e.position;
    if (!speaker || !position) continue;
    const text = typeof e.data.text === 'string' ? e.data.text : '';
    const invitation = e.type === 'invited';
    const place = invitation ? meetingOf(e.data.meeting) : null;
    const away: string[] = [];
    for (const listener of expressionHearers(world, speaker.id, position)) {
      if (
        place &&
        v7Distance(listener.position, place) > EXPRESSION_LIMITS.meetingRadius
      )
        away.push(listener.id);
      const data: V7Data = {
        from: speaker.id,
        text,
        source: e.id,
        kind: invitation ? 'invitation' : 'tell',
        ...(invitation
          ? { sign: e.data.sign ?? null, meeting: e.data.meeting ?? null }
          : {}),
      };
      expressionHear(
        world,
        listener,
        invitation ? e.description : `${speaker.name}: ${text}`,
        data,
        invitation && typeof e.data.sign === 'string' ? e.data.sign : null,
      );
    }
    // Hidden bookkeeping: who heard the invitation while away from the place, so that
    // attendance can tell people who came from people who were already there.
    if (invitation && typeof e.data.sign === 'string') {
      const invited = world.state['expression:invited'];
      world.state['expression:invited'] = {
        ...(invited && typeof invited === 'object' && !Array.isArray(invited)
          ? invited
          : {}),
        [e.data.sign]: away.sort(),
      };
    }
  }
}
function meetingOf(m: unknown) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const r = m as Record<string, unknown>;
  return { x: Number(r.x), y: Number(r.y), round: Number(r.round) };
}
const meeting = (object: V7Object) => meetingOf(object.data.meeting);
/** At an invited round, record who is actually present; expired invitations disappear. */
function meetings(world: V7World): void {
  for (const object of world.objects.filter(
    (o) => expressionSign(o) && o.kind === 'invitation',
  )) {
    const m = meeting(object);
    if (!m || m.round !== world.tick) continue;
    const present = world.actors
      .filter(
        (a) =>
          a.vitals.health > 0 &&
          v7Distance(a.position, m) <= EXPRESSION_LIMITS.meetingRadius,
      )
      .map((a) => a.id)
      .sort();
    const invited = world.state['expression:invited'];
    const away =
      invited && typeof invited === 'object' && !Array.isArray(invited)
        ? invited[object.id]
        : undefined;
    // Present people who heard the invitation away from the place actually came.
    const came = present.filter(
      (id) => Array.isArray(away) && away.includes(id),
    );
    world.events.push({
      id: v7Id(world, 'event'),
      tick: world.tick,
      actor: null,
      type: 'attendance',
      interface: null,
      success: true,
      description: `${String(present.length)} present at the invited place and round.`,
      position: { x: m.x, y: m.y },
      target: object.id,
      data: {
        invitation: object.id,
        host: object.createdBy,
        round: m.round,
        present,
        came,
      },
    });
  }
  world.objects = world.objects.filter(
    (o) =>
      !(
        expressionSign(o) &&
        o.kind === 'invitation' &&
        world.tick > Number(o.data.until)
      ),
  );
  const invited = world.state['expression:invited'];
  if (invited && typeof invited === 'object' && !Array.isArray(invited))
    world.state['expression:invited'] = Object.fromEntries(
      Object.entries(invited).filter(([id]) =>
        world.objects.some((o) => o.id === id),
      ),
    );
}
function afterEnvironment(world: V7World): void {
  const options = world.config.longDevelopment?.culture;
  if (!options) return;
  if (options.symbols) {
    deliver(world);
    meetings(world);
  }
  if (options.incentives) expressionIncentives(world);
}
const text = (maxLength = 1000): V7Schema => ({ type: 'string', maxLength });
function ability(
  id: string,
  purpose: string,
  properties: Record<string, V7Schema>,
  effects: string,
): V7Ability {
  return {
    id,
    name: id,
    function: purpose,
    equivalence: `expression-baseline:${id}:1`,
    parameters: v7ObjectSchema(properties),
    prerequisites: [],
    learning: 0,
    costs: 'One round; no energy or material.',
    effects,
    handler: `expression.${id}`,
    revision: EXPRESSION_REVISION,
    authored: true,
    references: {},
    execution: {
      duration: 1,
      interruption: 'cancel',
      progress: 'One complete expression per execution.',
    },
  };
}
/** Authored symbolic interfaces and the opt-in satisfaction sources of the culture
 * scenario. No interface has a physical effect beyond its round of action time. */
export function expressionFoundation(
  scope: string,
  options: V7CultureOptions,
  hearing: number,
): V7Package {
  return {
    id: EXPRESSION_PACKAGE,
    version: 1,
    scope,
    dependencies: ['foundation-open@1'],
    description:
      'Authored names, marks, spoken words and meeting invitations with persistent signs; optional bounded satisfaction from other people actually answering, two-way contact and noticed own work.',
    resources: [],
    processes: {},
    visualComponents: options.symbols ? ['sign'] : [],
    events: [
      ...(options.symbols ? SYMBOL_EVENTS : []),
      ...(options.incentives ? EXPRESSION_INCENTIVE_EVENTS : []),
    ],
    satisfaction: options.incentives ? EXPRESSION_INCENTIVE_RULES : [],
    abilities: options.symbols
      ? [
          ability(
            'name',
            `Give a name of up to ${String(EXPRESSION_LIMITS.name)} characters to this place (empty subject) or to a visible object or nearby item; naming the same subject again replaces your name for it.`,
            { subject: text(240), text: text() },
            'Leaves a persistent name sign where you stand that nearby people can see. No physical effect.',
          ),
          ability(
            'mark',
            `Leave a mark or inscription of up to ${String(EXPRESSION_LIMITS.mark)} characters on the ground here (empty subject) or on an object or item within reach.`,
            { subject: text(240), text: text() },
            `Leaves a persistent mark sign where you stand that nearby people can see; your ${String(EXPRESSION_LIMITS.signsPerPerson)} most recent names and marks persist. No physical effect.`,
          ),
          ability(
            'tell',
            `Say up to ${String(EXPRESSION_LIMITS.tell)} characters aloud; everyone living within ${String(hearing)} units hears it, seen or not.`,
            { text: text() },
            'Each listener receives a heard event and keeps it in a short heard list. Nothing persists at the place. No physical effect.',
          ),
          ability(
            'invite',
            `Invite listeners to meet at a place and a later round within ${String(EXPRESSION_LIMITS.invitationHorizon)} rounds, with an optional note of up to ${String(EXPRESSION_LIMITS.invite)} characters.`,
            {
              x: { type: 'number' },
              y: { type: 'number' },
              round: { type: 'integer', minimum: 1 },
              text: text(),
            },
            `Heard like tell, and leaves an invitation sign where you stand until ${String(EXPRESSION_LIMITS.invitationGrace)} rounds after the meeting. At that round an attendance event records who is within ${String(EXPRESSION_LIMITS.meetingRadius)} units of the place. No physical effect.`,
          ),
        ]
      : [],
    handlers: options.symbols
      ? {
          'expression.name': name,
          'expression.mark': mark,
          'expression.tell': tell,
          'expression.invite': invite,
        }
      : {},
    afterEnvironment,
  };
}
