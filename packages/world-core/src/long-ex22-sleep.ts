import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Json,
  V7Object,
  V7Package,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7RoundNumber } from './continuous-data.js';
import {
  v7Distance,
  v7Interior,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { FOREST_BASE } from './forest-foundation.js';
import { shelterTemperature } from './forest-thermal.js';
import { openRemember } from './open-foundation.js';
import { openConditions } from './open-physical.js';
import { collectiveJobs, workCreate } from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import { ex19MaterialGround } from './long-ex19-material-contact.js';
import { SURFACE_MARKING_SHARED } from './long-ex20-surface-marking.js';

/** A general sleep where the person lies: whole-round intervals, each running the shared rest
 * recovery (forest.rest of foundation-forest@1) exactly once, with entry and per-round checks of
 * support, hazards, fire, represented thermal exposure and observed threats. Sleep has no energy
 * source of its own: a slept round recovers exactly what rest would recover in that round. */

/** The longest requested sleep: half of the 80-round forest day (World Agent: whole rounds). */
const MAX_ROUNDS = 40;
/** The world's thermal comfort band on body temperature (vitals.temperature, not air): the
 * physical wellbeing term 1 - max(0, 16 - T, T - 27) / 12 is 1 only inside it. */
const COMFORT_LOW = 16;
const COMFORT_HIGH = 27;
/** Animals with represented attacks on people (open-ecology), and the species the respawn safety
 * rule (forest-lives) keeps people away from. */
const HOSTILE = ['wolf', 'boar'];
/** The rest code this operation runs; the world's rest ability must use it. */
const REST = 'forest.rest';
const MODES = ['start', 'continue', 'wake', 'cancel', 'status'];
const WATER_NAMES: Record<string, string> = {
  '~': 'water',
  '=': 'shallow water',
};

/** One suitability condition as checked now. */
interface Check extends V7Data {
  condition: string;
  met: boolean;
  value: V7Json;
  reason: string | null;
}
/** One round taken by an open sleep: slept (rest recovery ran) or blocked by a recheck. */
interface Interval extends V7Data {
  n: number | null;
  tick: number;
  slept: boolean;
  energyBefore: number;
  satietyBefore: number;
  healthBefore: number;
  body: number;
  air: number;
  unmet: string[];
  credit: number;
  nominal: number | null;
  factor: number | null;
  cap: number;
  capped: boolean;
  energyAfterCredit: number;
  result: string;
  energyAfter: number | null;
  otherDebits: number | null;
  net: number | null;
  satietyChange: number | null;
  healthChange: number | null;
  bodyAfter: number | null;
  outcome: string | null;
  settled: string;
}
interface Sleep extends CollectiveWork {
  phase: string;
  posture: string | null;
  support: V7Data;
  entries: V7Data[];
  intervals: Interval[];
  interruptions: V7Data[];
  checks: Check[];
  lastInterval: number;
  lastCredit: number;
  pending: boolean;
  startedAt: number;
  endedAt: number | null;
}
type Say = (
  type: string,
  description: string,
  data: V7Data,
  target: string | null,
) => void;

const round = (x: number) => v7RoundNumber(x);
const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const isOpen = (j: Sleep) => j.status === 'active' || j.status === 'paused';
const groundName = (ground: string) =>
  SURFACE_MARKING_SHARED.groundNames[ground] ?? WATER_NAMES[ground] ?? 'ground';

/** Whether an object is burning now: a hearth or a small fire bed with burning fuel. */
function burning(o: V7Object): boolean {
  if (Number(o.data.burnFraction ?? 0) > 0) return true;
  const f = o.data.fire;
  return (
    !!f &&
    typeof f === 'object' &&
    !Array.isArray(f) &&
    Number(f.burnFraction ?? 0) > 0 &&
    f.covered !== true
  );
}

/** The represented exposure for one more round where the person lies: the body temperature
 * update of forestPhysiology (shelterTemperature, 0.035 of the gap to the local air, divided by
 * 1 + insulation) toward the forest climate air temperature, which already includes the rain and
 * wind exposure outdoors and the buffering of an enclosing interior. */
function exposureOf(w: V7World, a: V7Actor) {
  const c = forestClimate(w, a.position);
  const insulation = Math.max(
    0,
    Number(a.extensionState.insulation ?? 0),
    ...w.objects
      .filter((o) => v7Interior(a.position, o.spatial))
      .map((o) => Number(o.data.insulation ?? 0)),
  );
  const body = a.vitals.temperature;
  const next = shelterTemperature(body, c.temperature, insulation, false);
  const low = Math.min(body, next.temperature),
    high = Math.max(body, next.temperature);
  const air = `air at ${shown(c.temperature)} (rain ${shown(c.rain ?? 0)}, wind ${shown(c.wind ?? 0)}, ${c.indoor ? 'buffered' : 'outdoors'})`;
  const reason =
    low < COMFORT_LOW
      ? `body temperature ${shown(body)} now and ${shown(next.temperature)} after this round in ${air} falls below the comfort band ${String(COMFORT_LOW)}-${String(COMFORT_HIGH)}: bedding or shelter that cuts cold loss (insulation or an enclosed interior) is needed, and none is supplied`
      : high > COMFORT_HIGH
        ? `body temperature ${shown(body)} now and ${shown(next.temperature)} after this round in ${air} rises above the comfort band ${String(COMFORT_LOW)}-${String(COMFORT_HIGH)}: a cooler or buffered place is needed`
        : null;
  return {
    met: reason === null,
    reason,
    value: {
      body: round(body),
      projected: next.temperature,
      air: c.temperature,
      rain: c.rain ?? null,
      wind: c.wind ?? null,
      indoor: c.indoor,
      insulation: round(insulation),
      band: [COMFORT_LOW, COMFORT_HIGH],
    },
  };
}

/** Every suitability condition where the person lies now, in a fixed order. */
function checksOf(w: V7World, a: V7Actor): Check[] {
  const p = a.position,
    k = openConditions(w, p),
    name = groundName(k.ground);
  const list: Check[] = [];
  const add = (
    condition: string,
    met: boolean,
    value: V7Json,
    reason: string,
  ) => {
    list.push({ condition, met, value, reason: met ? null : reason });
  };
  add(
    'alive',
    a.vitals.health > 0,
    round(a.vitals.health),
    'only a living person can sleep',
  );
  add(
    'support',
    ex19MaterialGround(w, p) === null,
    { ground: name, waterlogging: k.waterlogging },
    `${name} where you lie is not firm, dry ground: water, a wet bank or waterlogged soil does not hold a sleeper, and dry raised bedding is not represented here`,
  );
  const taken = [
    ...w.actors
      .filter(
        (x) =>
          x.id !== a.id &&
          x.vitals.health > 0 &&
          v7Distance(x.position, p) < x.radius + a.radius,
      )
      .map((x) => x.id),
    // An enclosing interior is lived in, not lain on; anything else under the body takes it.
    ...w.objects
      .filter(
        (o) =>
          !v7Interior(p, o.spatial) && v7ShapeDistance(p, o.spatial) < a.radius,
      )
      .map((o) => o.id),
  ];
  add(
    'unoccupied',
    !taken.length,
    taken,
    `the ground under your body is taken by ${taken.join(', ')}`,
  );
  add(
    'hazard',
    !k.hazards.length,
    k.hazards,
    `you lie inside the active hazard area ${k.hazards.join(', ')} (drought ${shown(k.drought)}, waterlogging ${shown(k.waterlogging)})`,
  );
  const fires = w.objects
    .filter((o) => burning(o) && v7ShapeDistance(p, o.spatial) < a.radius)
    .map((o) => o.id);
  add(
    'fire',
    !fires.length,
    fires,
    `the burning bed ${fires.join(', ')} reaches your body`,
  );
  const e = exposureOf(w, a);
  add('exposure', e.met, e.value, e.reason ?? '');
  const threats = v7Observe(w, a.id)
    .objects.filter(
      (o) =>
        o.kind === 'animal' &&
        HOSTILE.includes(text(o.data.species)) &&
        Number(o.data.health ?? 100) > 0,
    )
    .map(
      (o) =>
        `a ${text(o.data.species)} (${o.id}) ${shown(v7Distance(p, o.spatial))} away`,
    );
  add(
    'threat',
    !threats.length,
    threats,
    `${threats.join(', ')} is in view, and wolves and boars can attack`,
  );
  return list;
}
const unmetOf = (checks: Check[]) =>
  checks.filter((c) => !c.met).map((c) => c.reason ?? c.condition);

export function sleepPackage(id: string, scope: string): V7Package {
  const revision = `${id}@1`;
  const handler = `long.${id}`;
  const viewKey = `long:view:${id}`;
  const works = (w: V7World) => collectiveJobs(w, id).map((j) => j as Sleep);
  const mine = (w: V7World, a: V7Actor) =>
    works(w).filter((j) => j.owner === a.id);
  const current = (w: V7World, a: V7Actor) => mine(w, a).find(isOpen);
  const sayIn =
    (c: V7ActionContext): Say =>
    (type, description, data, target) => {
      c.emit(type, description, data, target);
    };
  const sayAt =
    (w: V7World, a: V7Actor): Say =>
    (type, description, data, target) => {
      forestEvent(w, type, description, a.position, a.id, data, target);
    };

  /** View metadata for the person's sleep, tied to the actor and the work record. Lying and
   * asleep appear only after a real entry. */
  function view(w: V7World, j: Sleep): V7Data {
    const last = j.intervals.findLast((e) => e.slept);
    return {
      component: null,
      operation: id,
      work: j.id,
      actor: j.owner,
      support: j.support.ref ?? null,
      x: j.x,
      y: j.y,
      ground: j.support.name ?? null,
      posture: j.posture,
      phase: j.phase,
      slept: j.completedWork,
      requested: j.initialWork,
      lastCredit: last?.credit ?? null,
      lastNet: last?.net ?? null,
      interruption: j.status === 'paused' ? (j.reason ?? null) : null,
      enteredAt: j.entries.map((e) => e.tick ?? null),
      updatedAt: w.tick,
      badge: null,
    };
  }
  function summary(w: V7World, j: Sleep, all = false): V7Data {
    return {
      work: j.id,
      actor: j.owner,
      phase: j.phase,
      posture: j.posture,
      status: j.status,
      requested: j.initialWork,
      slept: j.completedWork,
      left: j.remainingWork,
      support: j.support,
      reason: j.reason ?? null,
      startedAt: j.startedAt,
      endedAt: j.endedAt,
      entries: j.entries,
      interruptions: j.interruptions,
      ...(all ? { intervals: j.intervals } : {}),
      view: view(w, j),
    };
  }
  const sync = (w: V7World, a: V7Actor, j: Sleep) => {
    a.extensionState[viewKey] = view(w, j);
  };

  /** Fills each finished round's post-round vitals from the world's own per-round record
   * (experience.recent), or from the body at death. Other debits are the energy lost after the
   * rest credit; net is the round's whole energy change. */
  function settle(w: V7World, a: V7Actor, j: Sleep, say: Say, dead = false) {
    if (!j.pending) return;
    for (const e of j.intervals) {
      if (e.settled !== 'pending' || e.tick > w.tick) continue;
      if (e.tick === w.tick && !dead) continue;
      const r =
        e.tick === w.tick
          ? { ...a.vitals, tick: w.tick }
          : a.experience?.recent.find((x) => x.tick === e.tick);
      if (!r) {
        e.settled = 'unmeasured';
        e.outcome = 'post-round vitals were not recorded';
        continue;
      }
      const extra: Record<string, unknown> = r;
      e.energyAfter = r.energy;
      e.otherDebits = round(e.energyAfterCredit - r.energy);
      e.net = round(r.energy - e.energyBefore);
      e.satietyChange = round(r.satiety - e.satietyBefore);
      e.healthChange = round(r.health - e.healthBefore);
      e.bodyAfter =
        typeof extra.temperature === 'number' ? extra.temperature : null;
      e.settled = 'measured';
      e.outcome = !e.slept
        ? 'blocked: no sleep and no recovery this round'
        : e.credit > 0
          ? e.net > 0
            ? 'net gain'
            : 'credit offset by other debits'
          : e.energyBefore >= e.cap - 1e-9
            ? 'no credit: already at the energy cap'
            : 'no credit below the cap: unresolved accounting fault';
      say(
        'sleep-recovery-measured',
        `Round ${String(e.tick)}: rest credit ${shown(e.credit)}, other debits ${shown(e.otherDebits)}, net change ${shown(e.net)} (energy ${shown(e.energyBefore)} to ${shown(r.energy)}); ${e.outcome}.`,
        { ...summary(w, j), interval: e },
        j.id,
      );
    }
    j.pending = j.intervals.some((e) => e.settled === 'pending');
  }

  function enter(
    c: V7ActionContext,
    j: Sleep,
    checks: Check[],
    again: boolean,
  ) {
    const w = c.world;
    j.status = 'active';
    j.phase = 'asleep';
    j.posture = 'lying';
    j.reason = 'Asleep.';
    j.checks = checks;
    j.entries = [...j.entries, { tick: w.tick, resumed: again }];
    c.emit(
      'sleep-entered',
      `${again ? 'Lay down again' : 'Lay down'} on the ${text(j.support.name)} and fell asleep: every check was met.`,
      { ...summary(w, j), checks },
      j.id,
    );
  }

  function pause(
    w: V7World,
    a: V7Actor,
    j: Sleep,
    reasons: string[],
    say: Say,
  ) {
    j.status = 'paused';
    j.phase = 'paused';
    j.posture = 'lying';
    j.reason = `Woke: ${reasons.join('; ')}.`;
    j.interruptions = [...j.interruptions, { tick: w.tick, reasons }];
    say(
      'sleep-interrupted',
      `${j.reason} ${String(j.completedWork)} slept interval(s) and their recovery stay; nothing is refunded. continue lies down again after fresh checks; wake ends it.`,
      summary(w, j),
      j.id,
    );
    sync(w, a, j);
  }

  function finish(
    w: V7World,
    a: V7Actor,
    j: Sleep,
    status: string,
    why: string,
    say: Say,
  ) {
    j.status = status;
    j.phase = 'woken';
    j.posture = 'up';
    j.reason = why;
    j.endedAt = w.tick;
    say(
      'sleep-woken',
      `${why} ${String(j.completedWork)} of ${String(j.initialWork)} interval(s) slept; elapsed time, hunger and recovery received are not undone, and nothing is refunded.`,
      summary(w, j),
      j.id,
    );
    sync(w, a, j);
  }

  /** One slept round: the rest recovery runs once through the rest code itself. */
  function interval(
    c: V7ActionContext,
    j: Sleep,
    checks: Check[],
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    const unmet = unmetOf(checks);
    const exposure = checks.find((x) => x.condition === 'exposure')?.value;
    const air =
      exposure && typeof exposure === 'object' && !Array.isArray(exposure)
        ? Number(exposure.air ?? 0)
        : 0;
    const entry: Interval = {
      n: null,
      tick: w.tick,
      slept: false,
      energyBefore: a.vitals.energy,
      satietyBefore: a.vitals.satiety,
      healthBefore: a.vitals.health,
      body: a.vitals.temperature,
      air,
      unmet,
      credit: 0,
      nominal: null,
      factor: null,
      cap: w.config.energyCap,
      capped: false,
      energyAfterCredit: a.vitals.energy,
      result: 'blocked',
      energyAfter: null,
      otherDebits: null,
      net: null,
      satietyChange: null,
      healthChange: null,
      bodyAfter: null,
      outcome: null,
      settled: 'pending',
    };
    j.checks = checks;
    j.pending = true;
    if (unmet.length) {
      j.intervals = [...j.intervals, entry];
      pause(w, a, j, unmet, sayIn(c));
      return { complete: true, remaining: 0, writes: [j.id] };
    }
    if (j.lastCredit === w.tick)
      throw new Error(
        'This round already ran the rest recovery for this sleep.',
      );
    const rest = FOREST_BASE.handlers[REST];
    if (!rest) throw new Error('Missing baseline rest.');
    rest({ ...c, action: { interface: 'rest', args: {} } });
    const rested =
      w.events.findLast((e) => e.type === 'rested' && e.actor === a.id)?.data ??
      {};
    const credit = round(a.vitals.energy - entry.energyBefore);
    const capped = a.vitals.energy >= w.config.energyCap - 1e-9;
    Object.assign(entry, {
      n: j.completedWork + 1,
      slept: true,
      credit,
      nominal: typeof rested.nominal === 'number' ? rested.nominal : null,
      factor:
        typeof rested.mentalFactor === 'number' ? rested.mentalFactor : null,
      capped,
      energyAfterCredit: a.vitals.energy,
      result:
        credit > 0
          ? capped
            ? 'credited up to the energy cap'
            : 'credited'
          : entry.energyBefore >= w.config.energyCap - 1e-9
            ? 'no credit: already at the energy cap'
            : 'no credit below the cap: unresolved accounting fault',
    });
    j.intervals = [...j.intervals, entry];
    j.completedWork += 1;
    j.remainingWork = Math.max(0, j.initialWork - j.completedWork);
    j.lastInterval = w.tick;
    j.lastCredit = w.tick;
    // The personal record comes first so that the round's outcome reads as the interval.
    const kind =
      credit > 0
        ? 'credited'
        : entry.energyBefore >= w.config.energyCap - 1e-9
          ? 'at-cap'
          : 'uncredited';
    const key = `${id}:energy-recovery:${kind}`;
    const known = a.memory.knowledge?.[key]?.value;
    if (
      !known ||
      typeof known !== 'object' ||
      Array.isArray(known) ||
      known.work !== j.id
    )
      openRemember(c, {
        key,
        subject: 'sleep',
        property: 'energy added by one slept round (the rest recovery)',
        value: {
          work: j.id,
          credit,
          energyBefore: entry.energyBefore,
          energyAfter: a.vitals.energy,
          cap: w.config.energyCap,
          nominal: entry.nominal,
          factor: entry.factor,
          ground: j.support.name ?? null,
          body: entry.body,
          air,
        },
        method: 'one slept round; own energy read before and after',
        condition: `${text(j.support.name)}; energy before ${shown(entry.energyBefore)} of cap ${String(w.config.energyCap)}`,
        verified: true,
      });
    c.emit(
      'sleep-interval-completed',
      `Slept interval ${String(entry.n)} of ${String(j.initialWork)}: the rest recovery added ${shown(credit)} energy (${shown(entry.energyBefore)} to ${shown(a.vitals.energy)}${capped ? ', the cap' : ''}). The net change is measured after the round.`,
      { ...summary(w, j), interval: entry },
      j.id,
    );
    if (j.completedWork >= j.initialWork) {
      finish(
        w,
        a,
        j,
        'completed',
        'Woke after the requested interval(s).',
        sayIn(c),
      );
      return { complete: true, remaining: 0, writes: [j.id] };
    }
    sync(w, a, j);
    return { complete: false, remaining: j.remainingWork, writes: [j.id] };
  }

  function start(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const open = current(w, a);
    if (open) {
      if (
        open.status === 'active' &&
        open.lastInterval === w.tick - 1 &&
        c.operation?.first === false
      )
        return interval(c, open, checksOf(w, a));
      throw nothing(
        open.status === 'paused'
          ? `Your sleep ${open.id} was interrupted (${text(open.reason)}); give continue to lie down again after fresh checks, or wake.`
          : `You are already asleep in ${open.id}; give continue, wake or status.`,
      );
    }
    const ability = w.abilities.find((x) => x.id === 'rest');
    if (ability?.handler !== REST || !FOREST_BASE.handlers[REST])
      throw nothing('This world has no forest rest recovery for sleep to use.');
    const duration =
      action.args.duration === undefined ? 1 : Number(action.args.duration);
    const checks = checksOf(w, a);
    const unmet = unmetOf(checks);
    if (unmet.length)
      throw nothing(
        `You cannot lie down to sleep here now: ${unmet.join('; ')}. No bedding or shelter is supplied.`,
      );
    const k = openConditions(w, a.position);
    const j = workCreate(c, 'sleep', duration) as Sleep;
    Object.assign(j, {
      phase: 'awake',
      posture: null,
      support: {
        ref: `ground:${String(Math.floor(a.position.x))}:${String(Math.floor(a.position.y))}`,
        ground: k.ground,
        name: groundName(k.ground),
        x: a.position.x,
        y: a.position.y,
      },
      entries: [],
      intervals: [],
      interruptions: [],
      checks,
      lastInterval: -1,
      lastCredit: -1,
      pending: false,
      startedAt: w.tick,
      endedAt: null,
    });
    enter(c, j, checks, false);
    return interval(c, j, checks);
  }

  function resume(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = current(w, a);
    if (!j)
      throw nothing(
        'You have no sleep in progress or interrupted; give start.',
      );
    const checks = checksOf(w, a);
    if (j.status === 'active' && j.lastInterval === w.tick - 1)
      return interval(c, j, checks);
    const unmet = unmetOf(checks);
    if (unmet.length)
      throw nothing(
        `You cannot lie down to sleep again here now: ${unmet.join('; ')}.`,
      );
    enter(c, j, checks, true);
    return interval(c, j, checks);
  }

  function wake(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = current(w, a);
    if (!j) throw nothing('You are not asleep and have no interrupted sleep.');
    finish(
      w,
      a,
      j,
      'stopped',
      `Woke on request (${c.action.args.mode === 'cancel' ? 'cancel' : 'wake'}).`,
      sayIn(c),
    );
    return { complete: true, remaining: 0, writes: [j.id] };
  }

  function status(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = current(w, a) ?? mine(w, a).at(-1);
    const checks = checksOf(w, a);
    const unmet = unmetOf(checks);
    if (j?.status === 'active')
      pause(w, a, j, ['awake to check status'], sayIn(c));
    const now = unmet.length
      ? `Unmet now: ${unmet.join('; ')}.`
      : 'Every sleep check is met now.';
    c.emit(
      'sleep-status',
      j
        ? `Sleep ${j.id}: ${j.phase}, ${String(j.completedWork)} of ${String(j.initialWork)} interval(s) slept, ${String(round(j.intervals.reduce((n, e) => n + e.credit, 0)))} energy credited in all. ${now}`
        : `Awake, with no sleep record. ${now}`,
      {
        ...(j ? summary(w, j, true) : { phase: 'awake', posture: null }),
        checks,
        unmet,
        energy: a.vitals.energy,
        cap: w.config.energyCap,
      },
      j?.id ?? null,
    );
    if (j) sync(w, a, j);
    return { complete: true, remaining: 0, writes: j ? [j.id] : [] };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    if (a.vitals.health <= 0) throw nothing('Only a living person can sleep.');
    const mode = typeof action.args.mode === 'string' ? action.args.mode : '';
    if (mode !== 'start' && action.args.duration !== undefined)
      throw nothing(
        mode === 'continue'
          ? 'duration is set at start; continue sleeps the remaining interval(s).'
          : 'duration belongs to start.',
      );
    for (const j of mine(w, a)) settle(w, a, j, sayIn(c));
    if (mode === 'start') return start(c);
    if (mode === 'continue') return resume(c);
    if (mode === 'wake' || mode === 'cancel') return wake(c);
    if (mode === 'status') return status(c);
    throw nothing(`Give mode: ${MODES.join(', ')}.`);
  }

  /** After the round's environment: settle earlier rounds, pause a sleep whose round was not
   * slept, end one whose sleeper walked away, and wake a sleeper on a threat, injury, lost
   * support, hazard, fire or exposure. */
  function environment(w: V7World) {
    for (const j of works(w)) {
      const a = w.actors.find((x) => x.id === j.owner);
      if (!a || a.vitals.health <= 0) continue;
      const say = sayAt(w, a);
      settle(w, a, j, say);
      if (!isOpen(j)) continue;
      if (j.status === 'active' && j.lastInterval !== w.tick)
        pause(
          w,
          a,
          j,
          [
            'this round was not slept (another action, study, a refused action or no action took it)',
          ],
          say,
        );
      if (j.status === 'paused') {
        // Getting up and walking away ends the sleep; a new place needs a new start.
        if (v7Distance(a.position, j) > 1e-6)
          finish(
            w,
            a,
            j,
            'stopped',
            'Got up and left the place of this sleep, which ended it.',
            say,
          );
        continue;
      }
      const last = j.intervals.at(-1);
      const injured =
        w.events.some((e) => e.type === 'injured' && e.actor === a.id) ||
        (!!last && a.vitals.health < last.healthBefore - 1e-9);
      const reasons = [
        ...(injured ? ['injured'] : []),
        ...unmetOf(checksOf(w, a)),
      ];
      if (reasons.length) pause(w, a, j, reasons, say);
      else sync(w, a, j);
    }
  }

  return {
    id,
    version: 1,
    scope,
    dependencies: ['foundation-open@1'],
    description:
      'Sleep where the person lies, in whole-round intervals, each running the shared forest rest recovery exactly once, with entry and per-round checks of firm unoccupied ground, hazards, fire, represented thermal exposure and observed wolves or boars, per-interval energy records, interruption, wake and death handling. No new energy source, bedding, shelter or reward.',
    reuse: {
      experiment:
        'foundation-forest@1 rest (forest.rest: base 4, registered facility bonus, mood rest factor, lean exposure factor, energy cap 40) run unchanged as the recovery of each slept round; ex19 firm-ground rule; forest physiology exposure law and the wellbeing thermal comfort band; open-ecology attack species and the forest-lives respawn safety species',
      source:
        'forest-foundation.ts (FOREST_BASE.handlers forest.rest); continuous-base.ts (base.rest); forest-thermal.ts (shelterTemperature); forest-climate.ts (forestClimate, forestEvent); open-physical.ts (openConditions hazards); long-ex19-material-contact.ts (ex19MaterialGround); long-ex20-surface-marking.ts (ground names); continuous-observation.ts (v7Observe); collective-work.ts (workCreate, collectiveJobs); open-foundation.ts (openRemember); forest-experience.ts (per-round vital record read for settlement)',
      description:
        'The rest path is called, not copied or changed: a slept round recovers exactly what rest recovers in that round, and at the cap that is 0. New: sleep work records, suitability checks, interval settlement and wake rules.',
    },
    abilities: [
      {
        id,
        name: 'Sleep here',
        function:
          'Lie down and sleep where you are for whole rounds when the ground and conditions allow; each slept round gives exactly the energy rest would give then.',
        equivalence: 'body:sleep:rest-recovery-interval:1',
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: MODES },
            duration: { type: 'integer', minimum: 1, maximum: MAX_ROUNDS },
          }),
          required: ['mode'],
        },
        references: {},
        prerequisites: [],
        learning: 1,
        costs: `Study: 1 round. start: duration, whole rounds 1-${String(MAX_ROUNDS)} (default 1); it lies down and sleeps, continuing round by round. Each slept round uses that round and your action, no energy or item; hunger and other ongoing changes go on. continue: the next round, or after an interruption lie down again after fresh checks. wake or cancel: one round, no energy, ends it. status: one round, no energy: state, every interval record and the checks now. Checked at entry and every round: alive; firm ground where you lie (not water, a wet bank or waterlogged soil); no person, plant or object under your body (an enclosing interior is fine); no active hazard area and no burning bed; body temperature (vitals, not air) inside the comfort band ${String(COMFORT_LOW)}-${String(COMFORT_HIGH)} now and after this round toward the local air (rain and wind included) at your insulation; no wolf or boar in view. A failed entry check refuses at no cost, naming each unmet condition. No bedding, shelter or watcher is supplied.`,
        effects:
          'A slept round runs the rest recovery once, through rest itself: base 4 with the same facility and mood modifiers, capped at 40, so at 40 it adds 0. Each interval records energy before, eligibility, the rest credit, other debits, energy after and net change (settled from the next round), and whether a zero was the cap. You lie asleep only after a real entry. Another action, study, status, a failed recheck, injury, or a wolf or boar coming into view wakes you: completed intervals and the reason stay, nothing is refunded or undone; walking away ends it. Death ends it; no recovery follows. Unseen threats are not detected; nearby people give no protection. No reward, comfort or mood effect.',
        handler,
        revision,
        authored: false,
        // The ending event never carries a qualified flag: sleeping earns no practice milestone.
        practiceEvidence: 'sleep-woken',
        dependencies: { abilities: ['rest'], resources: [], knowledge: [] },
        execution: {
          duration: null,
          interruption: 'cancel',
          progress:
            'start sleeps one interval per round and continues until the requested intervals are slept; continue resumes after an interruption with fresh checks; wake, cancel and status take one round. Completed intervals persist across interruption.',
        },
      },
    ],
    handlers: { [handler]: execute },
    processes: {},
    visualComponents: [],
    events: [
      'sleep-entered',
      'sleep-interval-completed',
      'sleep-recovery-measured',
      'sleep-interrupted',
      'sleep-woken',
      'sleep-status',
      'sleep-ended',
    ],
    resources: [],
    satisfaction: [],
    afterEnvironment: environment,
    onDeath(w, a) {
      for (const j of mine(w, a)) {
        const say = sayAt(w, a);
        // Settled from the body at death, before respawn replaces the vitals.
        settle(w, a, j, say, true);
        if (!isOpen(j)) continue;
        j.status = 'ended';
        j.phase = 'ended';
        j.posture = null;
        j.reason = 'Died while the sleep was open; no recovery follows death.';
        j.endedAt = w.tick;
        say(
          'sleep-ended',
          `Sleep ended by death after ${String(j.completedWork)} slept interval(s); possessions follow the ordinary death rules.`,
          summary(w, j),
          j.id,
        );
        sync(w, a, j);
      }
    },
  };
}

/** ex22: Ivo's sleep where he lies, reusing the rest recovery. */
export const LONG_EX22_SLEEP = sleepPackage('sleep-in-place', 'long-ex22');
