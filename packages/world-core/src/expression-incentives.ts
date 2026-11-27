import type {
  V7Data,
  V7Event,
  V7Object,
  V7SatisfactionRule,
  V7World,
} from './continuous-types.js';
import { v7Id } from './continuous-data.js';
import { v7Distance, v7Visible } from './continuous-geometry.js';

/** Derived evidence events; each names the person who receives it as its actor. */
export const EXPRESSION_INCENTIVE_EVENTS = [
  'acknowledged',
  'reciprocated',
  'work-noticed',
];
/** Windows and per-pair deduplication of the derived evidence, in rounds. */
export const EXPRESSION_INCENTIVE_WINDOWS = {
  response: 60,
  remembered: 40,
  acknowledgedPair: 12,
  reciprocalWindow: 120,
  reciprocalContacts: 2,
  reciprocatedPair: 60,
  usedPair: 40,
  contactsKept: 8,
} as const;
const qualified = [
  { path: 'qualified', comparison: 'eq' as const, value: true },
];
const rule = (
  id: string,
  name: string,
  event: string,
  values: Pick<V7SatisfactionRule, 'amount' | 'cap' | 'duration' | 'cooldown'>,
  maintenance: { gain: number; decay: number; cap: number },
  rationale: string,
): V7SatisfactionRule => ({
  id,
  name,
  equivalence: `expression:${event}`,
  event,
  interface: '',
  derived: true,
  conditions: qualified,
  ...values,
  mode: 'hold',
  repetition: 'refresh',
  rationale,
  revision: 'foundation-expression@1',
  maintenance: { event, interface: '', ...maintenance },
});
/** Broad categories only. No rule names an interface, and none is triggered by the
 * rewarded person's own naming, marking, telling, queries or requests. */
export const EXPRESSION_INCENTIVE_RULES: V7SatisfactionRule[] = [
  rule(
    'answered',
    'Being answered or remembered',
    'acknowledged',
    { amount: 0.5, cap: 0.6, duration: 8, cooldown: 12 },
    { gain: 0.02, decay: 0.0015, cap: 0.4 },
    'Another person actually addressed you in response to your own recent contact, or after a long gap; one award per cooldown, decaying.',
  ),
  rule(
    'two-way',
    'Two-way contact',
    'reciprocated',
    { amount: 0.6, cap: 0.8, duration: 10, cooldown: 30 },
    { gain: 0.03, decay: 0.001, cap: 0.6 },
    'You and another person each actually addressed the other repeatedly within a bounded window; one award per pair per window, decaying.',
  ),
  rule(
    'work-noticed',
    'Own work noticed',
    'work-noticed',
    { amount: 0.5, cap: 0.6, duration: 8, cooldown: 16 },
    { gain: 0.02, decay: 0.0015, cap: 0.4 },
    'Another person actually acted at or used something you made; signs are excluded, and each person counts once per object window, decaying.',
  ),
];
type Ticks = Record<string, number[]>;
type Last = Record<string, number>;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const ticks = (value: unknown): Ticks =>
  Object.fromEntries(
    Object.entries(record(value)).map(([key, list]) => [
      key,
      Array.isArray(list)
        ? list.filter((x): x is number => typeof x === 'number')
        : [],
    ]),
  );
const last = (value: unknown): Last =>
  Object.fromEntries(
    Object.entries(record(value)).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter(Boolean),
  );
/** ex25 vocal-music@1: hummed or sung sound addresses no one and is not acting at or using
 * anything, so its segments and their heard events never feed these rules. The check is
 * false wherever that revision is absent, so every other world replays identically. */
function soundOnly(world: V7World, e: V7Event): boolean {
  return (
    world.revisions.includes('vocal-music@1') &&
    (e.interface === 'vocal-music' ||
      (e.type === 'heard' && (e.data.kind === 'hum' || e.data.kind === 'sing')))
  );
}
/** ex25 position-loose-material@1: a placed loose unit is only laid down, not made, and each
 * pickup and new placement gives it a new footprint record, so it is never counted as made
 * work. The check is false wherever that revision is absent, so every other world replays
 * identically. */
function positionedOnly(world: V7World, o: V7Object): boolean {
  return (
    world.revisions.includes('position-loose-material@1') &&
    o.kind === 'placed-loose-material'
  );
}
/** One real addressed contact per ordered pair and round, from the round's own events. */
function contacts(world: V7World) {
  const result: { from: string; to: string; event: string }[] = [];
  const add = (from: unknown, to: unknown, event: V7Event) => {
    if (
      typeof from !== 'string' ||
      typeof to !== 'string' ||
      from === to ||
      !world.actors.some((a) => a.id === from) ||
      !world.actors.some((a) => a.id === to) ||
      result.some((c) => c.from === from && c.to === to)
    )
      return;
    result.push({ from, to, event: event.id });
  };
  for (const e of world.events.filter(
    (e) => e.success && !soundOnly(world, e),
  )) {
    if (e.type === 'message') add(e.actor, e.target, e);
    else if (e.type === 'given') add(e.actor, e.data.recipient, e);
    else if (e.type === 'finding-offered') add(e.actor, e.target, e);
    else if (e.type === 'finding-accepted') add(e.actor, e.data.sender, e);
    else if (e.type === 'heard') {
      const listener = world.actors.find((a) => a.id === e.actor);
      const said = words(typeof e.data.text === 'string' ? e.data.text : '');
      // Spoken words address a listener only when they name that listener; an
      // invitation addresses every listener.
      if (
        listener &&
        (e.data.kind === 'invitation' ||
          said.has(listener.id) ||
          said.has(listener.name.toLowerCase()))
      )
        add(e.data.from, listener.id, e);
    } else if (e.type === 'attendance' && Array.isArray(e.data.came))
      for (const person of e.data.came) add(person, e.data.host, e);
  }
  return result;
}
function evidence(
  world: V7World,
  actor: string,
  type: string,
  description: string,
  data: V7Data,
): void {
  world.events.push({
    id: v7Id(world, 'event'),
    tick: world.tick,
    actor,
    type,
    interface: null,
    success: true,
    description,
    position: null,
    target: null,
    data: { ...data, qualified: true },
  });
}
/** Derive bounded evidence from other people's real actions in this round. Bookkeeping
 * lives in world state, which ordinary inputs never show. */
export function expressionIncentives(world: V7World): void {
  const w = EXPRESSION_INCENTIVE_WINDOWS,
    tick = world.tick,
    alive = (id: string) =>
      (world.actors.find((a) => a.id === id)?.vitals.health ?? 0) > 0,
    name = (id: string) => world.actors.find((a) => a.id === id)?.name ?? id;
  const history = ticks(world.state['expression:contacts']),
    answered = last(world.state['expression:acknowledged']),
    bonds = last(world.state['expression:bonds']);
  const touched = new Set<string>();
  // One acknowledgement event per recipient and round, listing every qualifying sender.
  const received = new Map<
    string,
    { from: string; event: string; mode: string }[]
  >();
  for (const c of contacts(world)) {
    const back = history[`${c.to}>${c.from}`] ?? [],
      forth = history[`${c.from}>${c.to}`] ?? [];
    const latest = Math.max(-Infinity, ...back, ...forth);
    const response = back.some((t) => tick - t <= w.response),
      remembered = Number.isFinite(latest) && tick - latest >= w.remembered;
    const key = `${c.from}>${c.to}`;
    if (
      (response || remembered) &&
      alive(c.to) &&
      tick - (answered[key] ?? -Infinity) >= w.acknowledgedPair
    ) {
      received.set(c.to, [
        ...(received.get(c.to) ?? []),
        {
          from: c.from,
          event: c.event,
          mode: response ? 'response' : 'remembered',
        },
      ]);
      answered[key] = tick;
    }
    history[key] = [...forth, tick].slice(-w.contactsKept);
    touched.add([c.from, c.to].sort().join('|'));
  }
  for (const [person, unsorted] of [...received].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const list = [...unsorted].sort((a, b) => (a.from < b.from ? -1 : 1));
    evidence(
      world,
      person,
      'acknowledged',
      `${list.map((x) => name(x.from)).join(', ')} addressed you in response to your own contact or after a long gap.`,
      {
        from: list.map((x) => x.from),
        evidence: list.map((x) => x.event),
        modes: list.map((x) => x.mode),
      },
    );
  }
  for (const pair of [...touched].sort()) {
    const [a = '', b = ''] = pair.split('|');
    const recent = (key: string) =>
      (history[key] ?? []).filter((t) => tick - t <= w.reciprocalWindow).length;
    if (
      recent(`${a}>${b}`) >= w.reciprocalContacts &&
      recent(`${b}>${a}`) >= w.reciprocalContacts &&
      tick - (bonds[pair] ?? -Infinity) >= w.reciprocatedPair
    ) {
      for (const [self, other] of [
        [a, b],
        [b, a],
      ] as const)
        if (alive(self))
          evidence(
            world,
            self,
            'reciprocated',
            `You and ${name(other)} have each repeatedly addressed the other.`,
            { with: other },
          );
      bonds[pair] = tick;
    }
  }
  // Made things: objects someone created, excluding the symbolic signs themselves.
  const noticed = record(world.state['expression:noticed']);
  const made = world.objects.filter(
    (o) =>
      o.createdBy !== null &&
      o.revision !== 'foundation-expression@1' &&
      !positionedOnly(world, o) &&
      world.actors.some((a) => a.id === o.createdBy),
  );
  const creditedMakers = new Set<string>();
  for (const object of made) {
    const maker = object.createdBy ?? '';
    const seen = last(noticed[object.id]);
    for (const other of world.actors) {
      if (other.id === maker || other.vitals.health <= 0) continue;
      const acted = world.events.find(
        (e) =>
          e.actor === other.id &&
          e.success &&
          e.interface &&
          !soundOnly(world, e),
      );
      if (!acted) continue;
      const used = world.events.find(
        (e) =>
          e.actor === other.id &&
          e.success &&
          e.interface &&
          e.target === object.id &&
          !soundOnly(world, e),
      );
      const sees =
        v7Distance(other.position, object.spatial) <= world.config.vision &&
        v7Visible(world, other.position, object.spatial);
      const before = seen[other.id];
      const qualifies = used
        ? tick - (before ?? -Infinity) >= w.usedPair
        : sees && before === undefined;
      if (!qualifies) continue;
      seen[other.id] = tick;
      if (creditedMakers.has(maker) || !alive(maker)) continue;
      creditedMakers.add(maker);
      evidence(
        world,
        maker,
        'work-noticed',
        `${name(other.id)} ${used ? 'used' : 'saw'} ${object.name} that you made.`,
        {
          by: other.id,
          object: object.id,
          mode: used ? 'used' : 'seen',
          evidence: (used ?? acted).id,
        },
      );
    }
    noticed[object.id] = seen;
  }
  world.state['expression:contacts'] = history;
  world.state['expression:acknowledged'] = answered;
  world.state['expression:bonds'] = bonds;
  world.state['expression:noticed'] = Object.fromEntries(
    Object.entries(noticed).filter(([id]) =>
      world.objects.some((o) => o.id === id),
    ),
  ) as V7Data;
}
