import type {
  V7Ability,
  V7Action,
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Observation,
  V7Package,
  V7Point,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import {
  V7ComputePause,
  v7Clone,
  v7Json,
  v7RoundNumber,
  v7Validate,
} from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Obstacles,
  v7Reach,
  v7SegmentClear,
} from './continuous-geometry.js';
import { v7NavigateStep } from './continuous-kernel.js';
import { v7Observe } from './continuous-observation.js';
import { forestEvent } from './forest-climate.js';
import { forestRestFactor } from './forest-experience.js';
import { FOREST_BASE } from './forest-foundation.js';
import { ForestRouteFailure } from './forest-routing.js';
import { OPEN_FOUNDATION } from './open-foundation.js';
import { constituentIdList } from './long-ex21-constituent-test.js';
import {
  type SearchKnown,
  type SearchLimits,
  SEARCH_GATHER,
  SEARCH_MAX,
  SEARCH_NAVIGATE,
  SEARCH_PROBE,
  searchBinding,
  searchFits,
  searchNote,
  searchNothing,
  searchNum,
  searchPlace,
  searchShown,
  searchSources,
  searchStep,
  searchUsed,
} from './long-ex26-bounded-search.js';
import {
  type RecheckDirection,
  type RecheckRun,
  RECHECK_AREAS,
  RECHECK_DIRECTIONS,
  RECHECK_EAT_ENERGY,
  RECHECK_MODES,
  recheckAvoided,
  recheckByGap,
  recheckZoned,
  recheckZones,
} from './long-ex26-search-recheck.js';
import {
  type LowHealthOptions,
  LOW_HEALTH,
  LOW_HEALTH_BODY,
  lowHealthRisks,
} from './long-ex26-search-low-health.js';
import {
  FOOD_SUITABILITY_MAX_REFS,
  foodSuitabilityCitations,
  foodSuitabilityEvaluate,
  foodSuitabilityTarget,
} from './long-ex26-food-assessment.js';

/** ex26: bounded food foraging with gather-then-eat. A serial controller that takes exactly one
 * dependency step per round through that dependency's own handler: the kernel navigate step
 * (v7NavigateStep), probe's observe mode (open.probe), gather (forest.gather) or eat (forest.eat),
 * so no round moves anyone more than speed x dt = 0.8 and every cost and effect is the
 * primitive's own. The eligible kinds are only those of the person's cited eating records that
 * the evaluator of assess-food-suitability@1 supports as edible and nontoxic; any other kind seen
 * is reported with its unresolved verdict and never gathered or eaten. Candidates, their nearest
 * reach order, pricing, rechecks, exploration and avoidance are those of the three earlier
 * searches, taken across every eligible kind, and the stop lines are the low-health search's
 * (starvation damage alone does not stop it). One gathered unit is eaten as the next step, and
 * the gather is taken only when it and that eat both fit. Nothing is created, healed, refunded
 * or rewarded; every earlier package stays byte-identical. */

const ID = 'bounded-food-foraging';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The open (active or paused) run; the key is shown with the person's active work. */
const OPEN = `${ID}:work:open`;
/** The latest closed run; not active work. */
const LAST = `${ID}:last`;
/** The person's health just before this round's physiology, kept only while their satiety is 0
 * or less: the low-health search's evidence of starvation alone, under this operation's key. */
const BODY = `${ID}:body`;
const EAT = { ability: 'eat', handler: 'forest.eat' };
/** The default health threshold, inside the low-health search's range of 20 to 100. */
const MIN_HEALTH = 60;
const PREFIX = 'food-foraging';
const EVENTS = {
  started: `${PREFIX}-started`,
  moved: `${PREFIX}-moved`,
  inspected: `${PREFIX}-inspected`,
  empty: `${PREFIX}-empty`,
  gathered: `${PREFIX}-gathered`,
  ate: `${PREFIX}-ate`,
  blocked: `${PREFIX}-blocked`,
  paused: `${PREFIX}-paused`,
  resumed: `${PREFIX}-resumed`,
  cancelled: `${PREFIX}-cancelled`,
  completed: `${PREFIX}-completed`,
  stopped: `${PREFIX}-stopped`,
  ended: `${PREFIX}-ended`,
} as const;

type Point = { x: number; y: number };
type Options = LowHealthOptions & { explore: boolean };
/** The unit taken by this run's last gather: it is eaten as the next step. */
type Pending = { item: string; kind: string; source: string; tick: number };
type Meal = {
  tick: number;
  item: string;
  kind: string;
  quantity: number;
  energy: number;
  satiety: number;
  healthLost: number;
  event: string;
};
/** A kind seen in the area that the cited records do not support: never gathered or eaten. */
type Unresolved = {
  kind: string;
  verdict: string;
  sources: string[];
  tick: number;
};
type Run = RecheckRun &
  Options & {
    /** The cited record ids, as given. */
    refs: string[];
    /** The kinds the cited eating records support now. */
    kinds: string[];
    pending: Pending | null;
    eaten: number;
    eats: number;
    /** Satiety actually gained by this run's eating. */
    nutrition: number;
    meals: Meal[];
    unresolved: Unresolved[];
    /** Gathered units no longer eaten by this run, and why. */
    released: { item: string; tick: number; reason: string }[];
  };
type Status = 'completed' | 'stopped' | 'cancelled' | 'ended';
type Say = (
  type: string,
  description: string,
  data: V7Data,
  target?: string | null,
) => void;
/** What a step event shows: its state, its source or item, and how that is known. */
type View = {
  state?: string;
  source?: string | null;
  item?: string | null;
  kind?: string | null;
  evidence?: string | null;
  seenAt?: number | null;
  pastStock?: number | null;
  available?: number | null;
  outcome?: string | null;
  underlying?: string | null;
  indicator?: string | null;
  gathered?: boolean;
  eaten?: boolean;
  stop?: string | null;
};
type Target = ReturnType<typeof foodSuitabilityTarget>;
type Request = Parameters<typeof foodSuitabilityTarget>[1];

const shown = searchShown;
const nothing = searchNothing;
const used = searchUsed;
const byId = (m: { id: string }, n: { id: string }) =>
  m.id < n.id ? -1 : m.id > n.id ? 1 : 0;
function openRun(a: V7Actor): Run | null {
  const raw = a.extensionState[OPEN];
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (v7Clone(raw) as unknown as Run)
    : null;
}
function save(a: V7Actor, run: Run): void {
  a.extensionState[OPEN] = v7Json(run);
}
const sayIn =
  (c: V7ActionContext): Say =>
  (type, description, data, target = null) => {
    c.emit(type, description, data, target);
  };
const sayAt =
  (w: V7World, a: V7Actor): Say =>
  (type, description, data, target = null) => {
    forestEvent(w, type, description, a.position, a.id, data, target);
  };
/** eat's own effort (v7FoodEffect): 1 energy divided by the person's rest factor of mood. */
const eatPrice = (w: V7World, a: V7Actor) => 1 / forestRestFactor(w, a);

/** An exact item or source within reach, as the assessment resolves its target. */
const request = (target: string, refs: string[]): Request => ({
  mode: 'inspect',
  target,
  consumer: '',
  refs,
  method: 'observe',
  intensity: 0,
});
/** A plain unit of a kind as gathered from its source, the case an eating record of the kind
 * is about (the assessment's own form of a unit in place in its source). */
function kindTarget(w: V7World, a: V7Actor, kind: string): Target {
  return {
    id: kind,
    kind,
    name: w.resources.find((r) => r.id === kind)?.name ?? kind,
    stack: null,
    object: null,
    specimen: {
      target: kind,
      number: 1,
      setting: 'in place in its source',
      stack: {
        id: `${kind}#1`,
        resource: kind,
        quantity: 1,
        position: { x: a.position.x, y: a.position.y },
        owner: null,
        origin: kind,
      },
      source: null,
      whole: true,
    },
  };
}
/** The assessment's own evaluator on its own citation of the given ids: supported, harm-recorded
 * or unresolved. */
function verdict(
  c: V7ActionContext,
  t: Target,
  refs: string[],
  look: string | null = null,
): string {
  return foodSuitabilityEvaluate(
    c,
    t,
    foodSuitabilityCitations(c, t, refs),
    look,
    null,
  ).verdict.status;
}
/** The kinds of the cited eating records that the evaluator supports as food: never a kind from
 * the world's food table or another person's records. */
function eligible(c: V7ActionContext, refs: string[]): string[] {
  const { world: w, actor: a } = c;
  return refs.filter(
    (k) =>
      a.memory.discoveries?.[k] !== undefined &&
      w.resources.some((r) => r.id === k) &&
      verdict(c, kindTarget(w, a, k), refs) === 'supported',
  );
}

/** View metadata from committed state only: progress, location, source, item, evidence and
 * outcome. */
function data(
  w: V7World,
  a: V7Actor,
  run: Run,
  phase: string,
  extra: View = {},
): V7Data {
  return {
    operation: ID,
    run: run.id,
    phase,
    status: run.status,
    stop: extra.stop ?? null,
    modes: { recheck: run.recheck, explore: run.explore },
    view: {
      component: null,
      badge: null,
      state: extra.state ?? phase,
      actor: a.id,
      tick: w.tick,
      x: a.position.x,
      y: a.position.y,
      source: extra.source ?? null,
      item: extra.item ?? null,
      kind: extra.kind ?? null,
      evidence: extra.evidence ?? null,
      seenAt: extra.seenAt ?? null,
      pastStock: extra.pastStock ?? null,
      available: extra.available ?? null,
      outcome: extra.outcome ?? null,
      underlying: extra.underlying ?? null,
      indicator: extra.indicator ?? null,
      // A unit is marked only after its real transfer, and eaten only after eat commits.
      gathered: extra.gathered ?? false,
      eaten: extra.eaten ?? false,
      kinds: run.kinds,
      evidenceRefs: run.refs,
      unresolved: run.unresolved.map((u) => u.kind),
      collected: run.collected,
      consumed: run.eaten,
      carried: run.pending?.item ?? null,
      nutrition: run.nutrition,
      complete: run.eaten >= run.limits.quantity,
      minHealth: run.minHealth,
      distance: run.distance,
      energy: run.energy,
      time: used(w, run),
      limits: run.limits,
    },
  };
}
const tally = (w: V7World, run: Run) =>
  `path ${shown(run.distance)} of ${shown(run.limits.path)}, energy ${shown(run.energy)} of ${shown(run.limits.energy)}, round ${String(used(w, run))} of ${String(run.limits.time)}`;
const kindsOf = (run: Run) => run.kinds.join(', ');

function close(
  say: Say,
  w: V7World,
  a: V7Actor,
  run: Run,
  status: Status,
  reason: string,
  detail: string,
  writes: string[] = [],
): V7HandlerResult {
  run.status = status;
  run.phase = status;
  run.reason = reason;
  delete a.extensionState['bounded-food-foraging:work:open'];
  a.extensionState[LAST] = v7Json({ ...run, endedAt: w.tick, detail });
  const got = `${String(run.eaten)} of ${String(run.limits.quantity)} unit(s) eaten, ${String(run.collected)} gathered, ${shown(run.nutrition)} satiety gained${run.pending ? `; ${run.pending.item} (${run.pending.kind}), gathered and not eaten, stays in your inventory` : ''}`;
  const text =
    status === 'completed'
      ? reason === 'meal-cap'
        ? `Foraging complete: ${got}.`
        : `Foraging complete without reaching the cap: ${detail} ${got}.`
      : status === 'stopped'
        ? `Foraging stopped (${reason}): ${detail} ${got}; spent time and energy stay spent.`
        : status === 'cancelled'
          ? `Foraging cancelled: ${got}; spent time and energy are not refunded.`
          : `Foraging ended by death: ${got}; carried items follow the ordinary death rules.`;
  const unresolved = run.unresolved.length
    ? ` Seen without an applicable eating record of yours, so not eaten (safety unresolved): ${run.unresolved.map((u) => u.kind).join(', ')}.`
    : '';
  say(EVENTS[status], `${text}${unresolved}`, {
    ...data(w, a, run, status, {
      state: status,
      stop: reason,
      outcome:
        status === 'completed'
          ? reason === 'meal-cap'
            ? 'complete'
            : 'incomplete'
          : status,
      // An empty result is a neutral indicator, never a food or meal effect.
      indicator: run.eaten ? null : 'neutral',
    }),
    summary: {
      transfers: run.transfers,
      meals: run.meals,
      facts: run.facts,
      inspections: run.inspections,
      empty: run.empty,
      unresolved: run.unresolved,
      released: run.released,
      blocked: run.blocked,
      visited: run.visited,
      moves: run.moves,
      probes: run.probes,
      gathers: run.gathers,
      eats: run.eats,
      detail,
    },
  });
  return { complete: true, remaining: 0, writes };
}
function stop(
  c: V7ActionContext,
  run: Run,
  reason: string,
  detail: string,
): V7HandlerResult {
  return close(sayIn(c), c.world, c.actor, run, 'stopped', reason, detail);
}
/** The end of a step round: completion at the cap, the time limit, or continuation. */
function after(
  c: V7ActionContext,
  run: Run,
  writes: string[] = [],
): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (run.eaten >= run.limits.quantity)
    return close(
      sayIn(c),
      w,
      a,
      run,
      'completed',
      'meal-cap',
      'The cap of units to eat is reached.',
      writes,
    );
  if (used(w, run) >= run.limits.time)
    return close(
      sayIn(c),
      w,
      a,
      run,
      'stopped',
      'time-limit',
      `All ${String(run.limits.time)} rounds are used.`,
      writes,
    );
  save(a, run);
  return { complete: false, remaining: null, writes };
}

/** The low-health search's own stop lines in its low-health mode: health at or below minHealth,
 * any injury in the last round other than starvation alone, body temperature 10 or more from 22,
 * minTemp and maxTemp; low satiety alone does not stop it. Its evidence of starvation alone is
 * the health this operation keeps under its own key. */
function risks(w: V7World, a: V7Actor, run: Options): string[] {
  const kept = a.extensionState[BODY];
  return lowHealthRisks(
    w,
    {
      ...a,
      extensionState: { ...a.extensionState, [LOW_HEALTH_BODY]: kept ?? null },
    },
    { ...run, lowHealth: true },
  );
}

/** Kinds seen now in the area that the cited records do not support, with the evaluator's
 * verdict: reported, never gathered or eaten. */
function notice(c: V7ActionContext, run: Run, view: V7Observation): void {
  const { world: w, actor: a } = c;
  for (const o of view.objects) {
    const kind = typeof o.data.resource === 'string' ? o.data.resource : '';
    if (
      !kind ||
      o.kind === 'animal' ||
      run.kinds.includes(kind) ||
      !w.resources.some((r) => r.id === kind) ||
      v7Distance(run.origin, o.spatial) > run.radius + 1e-9
    )
      continue;
    const old = run.unresolved.find((u) => u.kind === kind);
    if (old) {
      if (!old.sources.includes(o.id)) old.sources = [...old.sources, o.id];
      continue;
    }
    run.unresolved = [
      ...run.unresolved,
      {
        kind,
        verdict: verdict(c, kindTarget(w, a, kind), run.refs),
        sources: [o.id],
        tick: w.tick,
      },
    ];
  }
}
/** The unit this run gathered last, or else another whole unit you carry of an eligible kind
 * that the evaluator supports as you hold it now: eaten before any further search or gathering.
 * A gathered unit that no longer qualifies is released to ordinary ownership, not eaten. */
function carried(c: V7ActionContext, run: Run): V7Stack | null {
  const { world: w, actor: a } = c;
  const whole = (s: V7Stack) =>
    s.owner === a.id &&
    !s.reservedFor &&
    s.quantity >= 1 &&
    run.kinds.includes(s.resource);
  const usable = (s: V7Stack) =>
    whole(s) &&
    verdict(c, foodSuitabilityTarget(c, request(s.id, run.refs)), run.refs) ===
      'supported';
  const pending = run.pending;
  if (pending) {
    const s = w.stacks.find((x) => x.id === pending.item);
    if (s && usable(s)) return s;
    run.released = [
      ...run.released,
      {
        item: pending.item,
        tick: w.tick,
        reason:
          s && whole(s)
            ? 'your cited records no longer support it as food as you hold it'
            : 'it is no longer a whole unit of an eligible kind that you carry',
      },
    ];
    run.pending = null;
  }
  return w.stacks.filter(usable).sort(byId)[0] ?? null;
}

function blocked(
  c: V7ActionContext,
  run: Run,
  target: string,
  reason: string,
): V7HandlerResult {
  run.blocked = [...run.blocked, { target, tick: c.world.tick, reason }];
  run.target = null;
  run.goal = null;
  run.checked = null;
  run.phase = 'blocked';
  c.emit(
    EVENTS.blocked,
    `No step toward ${target} could be taken (${reason}); it is left out of this run. ${tally(c.world, run)}.`,
    data(c.world, c.actor, run, 'blocked', {
      state: 'blocked',
      source: target.startsWith('place:') ? null : target,
      outcome: 'left out',
      indicator: 'neutral',
    }),
    target.startsWith('place:') ? null : target,
  );
  return after(c, run);
}
/** One navigate step through the kernel's own handler, priced first on a copy of the person
 * (nothing of it is kept). A step that does not fit every budget and the reserve, that would
 * leave too little for the probe, gather and eat after it (follow), or that would enter avoided
 * ground, is not taken. */
function travel(
  c: V7ActionContext,
  run: Run,
  action: V7Action,
  phase: string,
  shownAs: View,
  follow: number,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  const contract = w.abilities.find((x) => x.id === SEARCH_NAVIGATE.ability);
  if (contract?.handler !== SEARCH_NAVIGATE.handler)
    throw nothing('The ordinary navigate interface is unavailable.');
  v7Validate(contract.parameters, action.args);
  const target = run.target ?? '';
  const ghost = v7Clone(a);
  let complete: boolean;
  try {
    complete = v7NavigateStep(
      w,
      ghost,
      action,
      null,
      c.work,
      () => undefined,
    ).complete;
  } catch (error) {
    if (error instanceof V7ComputePause) throw error;
    return blocked(
      c,
      run,
      target,
      error instanceof ForestRouteFailure
        ? `${error.evidence.status}: ${error.evidence.reasonCode}`
        : error instanceof Error
          ? error.message
          : 'navigation failed',
    );
  }
  const into = recheckZones(run, ghost.position).filter(
    (z) => !recheckZones(run, a.position).includes(z),
  );
  if (into.length)
    return blocked(
      c,
      run,
      target,
      `the next step would enter avoided ${into.join(', ')}`,
    );
  const distance = v7Distance(a.position, ghost.position),
    energy = a.vitals.energy - ghost.vitals.energy;
  if (run.distance + distance > run.limits.path + 1e-9)
    return stop(
      c,
      run,
      'path-limit',
      `The next step of ${shown(distance)} would pass the path limit (${tally(w, run)}).`,
    );
  if (run.energy + energy > run.limits.energy + 1e-9)
    return stop(
      c,
      run,
      'energy-budget',
      `The next step costs ${shown(energy)} energy, more than the budget left (${tally(w, run)}).`,
    );
  if (ghost.vitals.energy < run.limits.reserve - 1e-9)
    return stop(
      c,
      run,
      'energy-reserve',
      `The next step would leave ${shown(ghost.vitals.energy)} energy, below the reserve of ${shown(run.limits.reserve)}.`,
    );
  if (run.energy + energy + follow > run.limits.energy + 1e-9)
    return stop(
      c,
      run,
      'energy-budget',
      `The next step costs ${shown(energy)} energy and would leave less than the ${shown(follow)} that the probe, gather and eat after it need (${tally(w, run)}).`,
    );
  if (ghost.vitals.energy - follow < run.limits.reserve - 1e-9)
    return stop(
      c,
      run,
      'energy-reserve',
      `After the next step the probe, gather and eat after it would leave less than the reserve of ${shown(run.limits.reserve)} energy.`,
    );
  const from = { ...a.position },
    before = a.vitals.energy,
    first = w.events.length;
  const result = v7NavigateStep(w, a, action, null, c.work, c.emit);
  const moved = v7Distance(from, a.position);
  if (
    a.position.x !== ghost.position.x ||
    a.position.y !== ghost.position.y ||
    a.vitals.energy !== ghost.vitals.energy ||
    result.complete !== complete
  )
    throw new Error('The navigate step differed from its priced copy.');
  // The kernel step moves at most speed x dt / travel factor; never more than navigate.
  if (moved > searchStep(w) + 1e-6)
    throw new Error('A foraging step would move faster than navigate.');
  run.distance = v7RoundNumber(run.distance + moved);
  run.energy = v7RoundNumber(run.energy + before - a.vitals.energy);
  run.moves += 1;
  run.phase = phase;
  run.path = [...run.path, { x: a.position.x, y: a.position.y, tick: w.tick }];
  const toPlace = target.startsWith('place:');
  if (result.complete && toPlace && run.goal) {
    run.visited = [...run.visited, { ...run.goal, tick: w.tick }];
    run.goal = null;
    run.target = null;
  }
  const step = w.events
    .slice(first)
    .find(
      (e) => e.actor === a.id && (e.type === 'arrived' || e.type === 'moved'),
    );
  c.emit(
    EVENTS.moved,
    `Foraging step ${String(run.moves + run.probes + run.gathers + run.eats)}: walked ${shown(moved)} through navigate toward ${toPlace ? `unseen ground near ${target.slice(6)}` : shownAs.evidence === 'remembered' ? `${target}, a place you remember (seen at round ${String(shownAs.seenAt)}; its stock now is unknown)` : target}${result.complete ? ', now within reach' : ''} (${tally(w, run)}).`,
    data(w, a, run, phase, {
      ...(toPlace ? { evidence: 'observed ground' } : shownAs),
      state: 'searching',
      source: toPlace ? null : target,
      outcome: 'moved',
      underlying: step?.id ?? null,
    }),
    toPlace ? null : target,
  );
  return after(c, run, result.writes);
}
/** One observation through probe's own handler (observe mode only, never a material trial). */
function inspect(
  c: V7ActionContext,
  run: Run,
  source: V7Object,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  const kind =
    typeof source.data.resource === 'string' ? source.data.resource : '';
  if (run.energy + SEARCH_PROBE.energy > run.limits.energy + 1e-9)
    return stop(
      c,
      run,
      'energy-budget',
      `An inspection costs ${String(SEARCH_PROBE.energy)} energy, more than the budget left (${tally(w, run)}).`,
    );
  if (a.vitals.energy - SEARCH_PROBE.energy < run.limits.reserve - 1e-9)
    return stop(
      c,
      run,
      'energy-reserve',
      `An inspection would leave less than the reserve of ${shown(run.limits.reserve)} energy.`,
    );
  const contract = w.abilities.find((x) => x.id === SEARCH_PROBE.ability);
  const probe = OPEN_FOUNDATION.handlers[SEARCH_PROBE.handler];
  if (contract?.handler !== SEARCH_PROBE.handler || !probe)
    throw nothing('The ordinary probe interface is unavailable.');
  const action: V7Action = {
    interface: SEARCH_PROBE.ability,
    args: { target: source.id, mode: 'observe', intensity: 0 },
  };
  v7Validate(contract.parameters, action.args);
  const before = a.vitals.energy;
  const result = probe({ ...c, action });
  const measured = a.memory.knowledge?.[`${source.id}:observed-state`];
  const fresh = measured?.tick === w.tick;
  const value: V7Data =
    fresh &&
    measured.value &&
    typeof measured.value === 'object' &&
    !Array.isArray(measured.value)
      ? measured.value
      : {};
  const stock = typeof value.stock === 'number' ? value.stock : 0;
  const event = fresh ? measured.evidence : '';
  run.energy = v7RoundNumber(run.energy + before - a.vitals.energy);
  run.probes += 1;
  run.checked = source.id;
  run.phase = 'inspect';
  run.visited = [
    ...run.visited,
    { x: a.position.x, y: a.position.y, tick: w.tick },
  ];
  searchNote(run, {
    source: source.id,
    stock,
    growth: typeof value.growth === 'number' ? value.growth : null,
    tick: w.tick,
    method: 'probe',
    x: source.spatial.x,
    y: source.spatial.y,
  });
  run.inspections = [
    ...run.inspections,
    { source: source.id, tick: w.tick, stock, event },
  ];
  const empty = stock < 1;
  if (empty) {
    run.empty = [...run.empty, source.id];
    run.target = null;
    run.checked = null;
  }
  c.emit(
    empty ? EVENTS.empty : EVENTS.inspected,
    empty
      ? `Inspected ${source.id} with probe: no ripe ${kind} now (${shown(stock)}); it is not inspected again in this run (${tally(w, run)}).`
      : `Inspected ${source.id} with probe: ${shown(stock)} ripe ${kind} in stock (${tally(w, run)}).`,
    data(w, a, run, 'inspect', {
      state: 'observing',
      source: source.id,
      kind,
      evidence: 'probe',
      seenAt: w.tick,
      available: stock,
      outcome: empty ? 'observed-empty' : 'stock-observed',
      underlying: event || null,
      indicator: empty ? 'neutral' : null,
    }),
    source.id,
  );
  return after(c, run, result.writes);
}
/** One gather of exactly one unit through its own handler, taken only when it and the eat after
 * it fit every budget and the reserve and the evaluator supports the source's kind now. */
function harvest(
  c: V7ActionContext,
  run: Run,
  source: V7Object,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  const kind =
    typeof source.data.resource === 'string' ? source.data.resource : '';
  const eat = eatPrice(w, a),
    pair = SEARCH_GATHER.energy + eat;
  if (run.energy + pair > run.limits.energy + 1e-9)
    return stop(
      c,
      run,
      'energy-budget',
      `Gathering one unit (${String(SEARCH_GATHER.energy)} energy) and eating it (${shown(eat)} energy) cost ${shown(pair)}, more than the budget left (${tally(w, run)}).`,
    );
  if (a.vitals.energy - pair < run.limits.reserve - 1e-9)
    return stop(
      c,
      run,
      'energy-reserve',
      `Gathering one unit and eating it would leave ${shown(a.vitals.energy - pair)} energy, below the reserve of ${shown(run.limits.reserve)}.`,
    );
  if (used(w, run) + 1 > run.limits.time)
    return stop(
      c,
      run,
      'time-limit',
      `Gathering one unit and eating it take 2 rounds; this is round ${String(used(w, run))} of ${String(run.limits.time)}.`,
    );
  const look =
    run.inspections.findLast((i) => i.source === source.id)?.event ?? '';
  if (
    !run.kinds.includes(kind) ||
    verdict(
      c,
      foodSuitabilityTarget(c, request(source.id, run.refs)),
      run.refs,
      look || null,
    ) !== 'supported'
  )
    return stop(
      c,
      run,
      'safety-unresolved',
      `Your cited records do not support ${kind || source.id} from ${source.id} as food now; nothing was gathered.`,
    );
  const contract = w.abilities.find((x) => x.id === SEARCH_GATHER.ability);
  const gather = FOREST_BASE.handlers[SEARCH_GATHER.handler];
  if (contract?.handler !== SEARCH_GATHER.handler || !gather)
    throw nothing('The ordinary gather interface is unavailable.');
  if (source.createdBy !== null && source.createdBy !== a.id)
    throw nothing(`${source.id} was made by another person.`);
  const action: V7Action = {
    interface: SEARCH_GATHER.ability,
    args: { target: source.id, quantity: 1 },
  };
  v7Validate(contract.parameters, action.args);
  const before = a.vitals.energy;
  // gather revalidates the real stock and reach at transfer time and moves exactly one unit.
  const result = gather({ ...c, action });
  const event = w.events.findLast(
    (e) => e.type === 'gathered' && e.actor === a.id && e.target === source.id,
  );
  const item = typeof event?.data.item === 'string' ? event.data.item : '';
  run.energy = v7RoundNumber(run.energy + before - a.vitals.energy);
  run.collected += 1;
  run.gathers += 1;
  run.phase = 'harvest';
  run.transfers = [
    ...run.transfers,
    { tick: w.tick, source: source.id, quantity: 1, item },
  ];
  run.pending = { item, kind, source: source.id, tick: w.tick };
  // The stock left there, as gather itself reports it.
  const remaining = event?.data.remaining;
  const left = typeof remaining === 'number' ? remaining : 0;
  searchNote(run, {
    source: source.id,
    stock: left,
    growth: null,
    tick: w.tick,
    method: 'gather',
    x: source.spatial.x,
    y: source.spatial.y,
  });
  if (left < 1) {
    run.target = null;
    run.checked = null;
  }
  c.emit(
    EVENTS.gathered,
    `Gathered 1 ${kind} from ${source.id} with gather as ${item}; ${shown(left)} left there; eating it is the next step (${tally(w, run)}).`,
    data(w, a, run, 'harvest', {
      state: 'gathering',
      source: source.id,
      item,
      kind,
      evidence: 'gather',
      seenAt: w.tick,
      available: left,
      outcome: 'gathered',
      underlying: event?.id ?? null,
      gathered: true,
    }),
    source.id,
  );
  return after(c, run, result.writes);
}
/** One eat of exactly one owned unit through eat's own handler: its energy, nutrition, toxicity,
 * meal experience and eating record are eat's. Priced first against the budget and reserve. */
function consume(
  c: V7ActionContext,
  run: Run,
  stack: V7Stack,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  const eat = eatPrice(w, a);
  if (run.energy + eat > run.limits.energy + 1e-9)
    return stop(
      c,
      run,
      'energy-budget',
      `Eating ${stack.id} costs ${shown(eat)} energy, more than the budget left (${tally(w, run)}).`,
    );
  if (a.vitals.energy - eat < run.limits.reserve - 1e-9)
    return stop(
      c,
      run,
      'energy-reserve',
      `Eating ${stack.id} would leave ${shown(a.vitals.energy - eat)} energy, below the reserve of ${shown(run.limits.reserve)}.`,
    );
  const contract = w.abilities.find((x) => x.id === EAT.ability);
  const handler = FOREST_BASE.handlers[EAT.handler];
  if (contract?.handler !== EAT.handler || !handler)
    throw nothing('The ordinary eat interface is unavailable.');
  const action: V7Action = {
    interface: EAT.ability,
    args: { target: stack.id, quantity: 1 },
  };
  v7Validate(contract.parameters, action.args);
  const before = { ...a.vitals },
    first = w.events.length;
  const result = handler({ ...c, action });
  const spent = before.energy - a.vitals.energy;
  if (Math.abs(spent - eat) > 1e-9)
    throw new Error('The eat step differed from its price.');
  const ate = w.events
    .slice(first)
    .find((e) => e.type === 'ate' && e.actor === a.id);
  const satiety = v7RoundNumber(a.vitals.satiety - before.satiety);
  const healthLost = v7RoundNumber(
    Math.max(0, before.health - a.vitals.health),
  );
  run.energy = v7RoundNumber(run.energy + spent);
  run.eaten += 1;
  run.eats += 1;
  run.nutrition = v7RoundNumber(run.nutrition + satiety);
  run.meals = [
    ...run.meals,
    {
      tick: w.tick,
      item: stack.id,
      kind: stack.resource,
      quantity: 1,
      energy: v7RoundNumber(spent),
      satiety,
      healthLost,
      event: ate?.id ?? '',
    },
  ];
  if (run.pending?.item === stack.id) run.pending = null;
  run.phase = 'eat';
  c.emit(
    EVENTS.ate,
    `Ate 1 ${stack.resource} (${stack.id}) with eat for ${shown(spent)} energy: satiety ${shown(before.satiety)} to ${shown(a.vitals.satiety)}${healthLost > 0 ? `, health ${shown(before.health)} to ${shown(a.vitals.health)}` : ''} (${String(run.eaten)} of ${String(run.limits.quantity)} eaten; ${tally(w, run)}).`,
    data(w, a, run, 'eat', {
      state: 'eating',
      source: stack.origin,
      item: stack.id,
      kind: stack.resource,
      evidence: 'eat',
      outcome: 'eaten',
      underlying: ate?.id ?? null,
      eaten: true,
    }),
    stack.id,
  );
  return after(c, run, result.writes);
}

/** Whether unseen cells of the area lie within vision of a point. */
function unseen(w: V7World, a: V7Actor, run: Run, p: Point): boolean {
  const cells = new Set(a.memory.cells);
  for (
    let y = Math.floor(p.y - w.config.vision);
    y <= p.y + w.config.vision;
    y++
  )
    for (
      let x = Math.floor(p.x - w.config.vision);
      x <= p.x + w.config.vision;
      x++
    )
      if (
        v7Distance({ x: x + 0.5, y: y + 0.5 }, p) <= w.config.vision &&
        v7Distance({ x: x + 0.5, y: y + 0.5 }, run.origin) <= run.radius &&
        x >= 0 &&
        y >= 0 &&
        x < w.config.width &&
        y < w.config.height &&
        !cells.has(`${String(x)},${String(y)}`)
      )
        return true;
  return false;
}

/** One round of an active run: checks, then exactly one eat, navigate, probe or gather step. */
function advance(c: V7ActionContext, run: Run): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (run.lastStep === w.tick)
    throw new Error('This round already took a foraging step.');
  run.lastStep = w.tick;
  run.status = 'active';
  run.reason = null;
  const hazards = risks(w, a, run);
  if (hazards.length) return stop(c, run, 'unsafe', `${hazards.join('; ')}.`);
  if (used(w, run) > run.limits.time)
    return stop(
      c,
      run,
      'time-limit',
      `All ${String(run.limits.time)} rounds are used.`,
    );
  if (a.vitals.satiety >= 100)
    return close(
      sayIn(c),
      w,
      a,
      run,
      'completed',
      'satiety-full',
      'Your satiety is full, so more food would add nothing.',
    );
  // The eligible kinds again, from the cited records as they are now.
  run.kinds = eligible(c, run.refs);
  if (!run.kinds.length)
    return stop(
      c,
      run,
      'safety-unresolved',
      'Your cited records no longer support any kind as food.',
    );
  const view = v7Observe(w, a.id);
  notice(c, run, view);
  // The unit gathered last round, or another eligible unit you carry, is eaten first.
  const unit = carried(c, run);
  if (unit) return consume(c, run, unit);
  // Candidates of every eligible kind together, as the earlier searches collect them.
  const known = run.kinds
    .flatMap((kind) => searchSources(w, a, { ...run, resource: kind }, view))
    .filter((k) => !recheckAvoided(run, k.object.spatial));
  for (const k of known)
    if (view.objects.some((o) => o.id === k.object.id))
      searchNote(run, {
        source: k.object.id,
        stock: k.stock,
        growth: null,
        tick: w.tick,
        method: 'seen',
        x: k.object.spatial.x,
        y: k.object.spatial.y,
      });
  const eat = eatPrice(w, a);
  // The searches' own pricing of reach, probe and one gather, with the eat after it: its energy
  // within the budget and above the reserve, and one more round.
  const meal: Run = {
    ...run,
    limits: {
      ...run.limits,
      energy: run.limits.energy - eat,
      reserve: run.limits.reserve + eat,
      time: run.limits.time - 1,
    },
  };
  const fits = (k: SearchKnown) => searchFits(w, a, meal, k);
  const viable = known.filter((k) => k.stock >= 1);
  // recheck: sources last seen without ripe stock, each inspected at most once in this run.
  const recheck = run.recheck
    ? known.filter(
        (k) =>
          k.stock < 1 && !run.inspections.some((i) => i.source === k.object.id),
      )
    : [];
  const pick = (list: SearchKnown[]) =>
    list.find((k) => k.object.id === run.target && fits(k)) ??
    list.filter(fits).sort(recheckByGap)[0];
  const source = pick(viable) ?? pick(recheck);
  if (source) {
    const id = source.object.id;
    if (run.target !== id) {
      run.target = id;
      run.goal = null;
      run.checked = null;
    }
    const seen = view.objects.find((o) => o.id === id);
    if (seen && v7Reach(a, seen.spatial))
      return run.checked === id && source.stock >= 1
        ? harvest(c, run, seen)
        : inspect(c, run, seen);
    const memory = a.memory.objects.find((m) => m.object.id === id);
    const kind =
      typeof source.object.data.resource === 'string'
        ? source.object.data.resource
        : null;
    return travel(
      c,
      run,
      {
        interface: SEARCH_NAVIGATE.ability,
        args: {
          target: id,
          x: source.object.spatial.x,
          y: source.object.spatial.y,
        },
      },
      'travel',
      seen
        ? {
            kind,
            evidence: 'seen now',
            seenAt: w.tick,
            pastStock: null,
          }
        : {
            kind,
            evidence: 'remembered',
            seenAt: memory?.seenAt ?? null,
            pastStock: source.stock,
          },
      SEARCH_PROBE.energy + SEARCH_GATHER.energy + eat,
    );
  }
  // Exploration: observed dry ground inside the area from which unseen cells lie within vision,
  // only while a probe, a gather and the eat after it would still fit on arrival.
  if (run.explore) {
    const tail = SEARCH_PROBE.energy + SEARCH_GATHER.energy + eat;
    const room: Run = {
      ...run,
      limits: {
        ...run.limits,
        energy: run.limits.energy - tail,
        reserve: run.limits.reserve + tail,
        time: run.limits.time - 3,
      },
    };
    const affordable = (p: Point) => {
      const d = v7Distance(a.position, p);
      return (
        run.distance + d <= run.limits.path + 1e-9 &&
        run.energy + 2 * d <= room.limits.energy + 1e-9 &&
        a.vitals.energy - 2 * d >= room.limits.reserve - 1e-9 &&
        Math.ceil(d / searchStep(w) - 1e-9) <=
          room.limits.time - used(w, run) + 1
      );
    };
    const goal =
      run.goal &&
      unseen(w, a, run, run.goal) &&
      v7SegmentClear(run.goal, run.goal, a.radius, v7Obstacles(w, a)) &&
      !recheckAvoided(run, run.goal) &&
      affordable(run.goal)
        ? run.goal
        : searchPlace(w, a, recheckZoned(w, room));
    if (goal) {
      run.goal = goal;
      run.target = `place:${String(Math.floor(goal.x))},${String(Math.floor(goal.y))}`;
      run.checked = null;
      return travel(
        c,
        run,
        {
          interface: SEARCH_NAVIGATE.ability,
          args: { target: '', x: goal.x, y: goal.y },
        },
        'explore',
        {},
        tail,
      );
    }
  }
  // Known sources with stock that no chain to a meal fits within the limits left: stop.
  const nearest = [...viable].sort((m, n) => m.gap - n.gap)[0];
  if (nearest)
    return stop(
      c,
      run,
      searchBinding(w, a, meal, nearest) ?? 'energy-budget',
      `${String(viable.length)} source(s) with ripe stock of ${kindsOf(run)} remain in the area, but none can be reached, inspected, gathered from and eaten from within the limits left (${tally(w, run)}).`,
    );
  run.target = null;
  run.goal = null;
  const skipped = recheck.length
    ? ` ${String(recheck.length)} source(s) last seen empty lie beyond the limits left.`
    : '';
  return close(
    sayIn(c),
    w,
    a,
    run,
    'completed',
    'search-exhausted',
    `No permitted reachable source with ripe stock of ${kindsOf(run)} remains in the area${run.explore ? ', and no unseen observed ground is within the limits left' : ''}.${skipped}`,
  );
}

/** Validates a start at no cost and builds the run. */
function begin(c: V7ActionContext): Run {
  const { world: w, actor: a, action } = c;
  const g = action.args;
  const missing = [
    'radius',
    'path',
    'time',
    'energy',
    'reserve',
    'quantity',
    'evidenceRefs',
  ].filter((k) => g[k] === undefined);
  if (missing.length) throw nothing(`start needs ${missing.join(', ')}.`);
  if ((g.x === undefined) !== (g.y === undefined))
    throw nothing(
      'Give both x and y for the origin, or neither for your position.',
    );
  const origin: V7Point =
    g.x === undefined
      ? { x: a.position.x, y: a.position.y }
      : { x: searchNum(g.x), y: searchNum(g.y) };
  if (!v7Inside(w, origin, 0))
    throw nothing('The origin is outside the world.');
  const number = (v: unknown) => (typeof v === 'number' ? v : null);
  const areas = Array.isArray(g.avoidAreas) ? g.avoidAreas : [];
  const directions = (
    Array.isArray(g.avoidDirections) ? g.avoidDirections : []
  ).filter((d): d is RecheckDirection =>
    RECHECK_DIRECTIONS.some((x) => x === d),
  );
  const options: Options = {
    recheck: g.recheck === true,
    // The low-health search's low-health mode, which includes its emergency mode.
    emergency: true,
    lowHealth: true,
    explore: g.explore === true,
    minHealth: number(g.minHealth) ?? MIN_HEALTH,
    minTemp: number(g.minTemp),
    maxTemp: number(g.maxTemp),
    avoidAreas: areas.map((z) => {
      const o: V7Data =
        z && typeof z === 'object' && !Array.isArray(z) ? z : {};
      return {
        x: searchNum(o.x),
        y: searchNum(o.y),
        radius: searchNum(o.radius),
      };
    }),
    avoidDirections: directions,
  };
  if (areas.length > RECHECK_AREAS)
    throw nothing(`Give at most ${String(RECHECK_AREAS)} avoidAreas.`);
  if (new Set(directions).size !== directions.length)
    throw nothing('Name each avoided direction once.');
  if (
    options.minTemp !== null &&
    options.maxTemp !== null &&
    options.minTemp >= options.maxTemp
  )
    throw nothing('minTemp must be below maxTemp.');
  const floor = options.minHealth ?? MIN_HEALTH;
  if (
    !Number.isFinite(floor) ||
    floor < LOW_HEALTH.health ||
    floor > LOW_HEALTH.most
  )
    throw nothing(
      `minHealth must be ${String(LOW_HEALTH.health)} to ${String(LOW_HEALTH.most)}.`,
    );
  const limits: SearchLimits = {
    path: searchNum(g.path),
    time: searchNum(g.time),
    energy: searchNum(g.energy),
    reserve: searchNum(g.reserve),
    quantity: searchNum(g.quantity),
  };
  const bounds: [string, number][] = [
    ['radius', searchNum(g.radius)],
    ['path', limits.path],
    ['time', limits.time],
    ['energy', limits.energy],
    ['quantity', limits.quantity],
  ];
  const bad = bounds.filter(([, v]) => !Number.isFinite(v) || v <= 0);
  if (bad.length)
    throw nothing(`Give finite ${bad.map(([k]) => k).join(', ')} above 0.`);
  if (
    !Number.isFinite(limits.reserve) ||
    limits.reserve < RECHECK_EAT_ENERGY - 1e-9
  )
    throw nothing(
      `Give a reserve of at least ${String(RECHECK_EAT_ENERGY)} energy, what eat costs; no step spends below it.`,
    );
  const refs = constituentIdList(c, 'evidenceRefs');
  if (!refs.length || refs.length > FOOD_SUITABILITY_MAX_REFS)
    throw nothing(
      `evidenceRefs takes 1 to ${String(FOOD_SUITABILITY_MAX_REFS)} of your record ids.`,
    );
  // Each cited id must be one of your complete records: the assessment's own citation refuses
  // any other at no cost (the kind of the unit it is cited for does not matter here).
  foodSuitabilityCitations(c, kindTarget(w, a, refs[0] ?? ''), refs);
  const kinds = eligible(c, refs);
  if (!kinds.length)
    throw nothing(
      'None of evidenceRefs is your own eating record of a kind that it supports as edible and nontoxic, so nothing would be eaten.',
    );
  const hazards = risks(w, a, options);
  if (hazards.length)
    throw nothing(`You cannot start foraging now: ${hazards.join('; ')}.`);
  if (a.vitals.satiety >= 100)
    throw nothing('Your satiety is full, so more food would add nothing.');
  if (a.vitals.energy <= limits.reserve + 1e-9)
    throw nothing(
      `Your energy ${shown(a.vitals.energy)} is not above the reserve of ${shown(limits.reserve)}.`,
    );
  return {
    id: `food-foraging-${a.id}-${String(w.tick)}`,
    actor: a.id,
    resource: kinds.join(', '),
    origin,
    radius: searchNum(g.radius),
    limits,
    ...options,
    refs,
    kinds,
    status: 'active',
    phase: 'started',
    target: null,
    goal: null,
    checked: null,
    startedAt: w.tick,
    lastStep: -1,
    distance: 0,
    energy: 0,
    collected: 0,
    moves: 0,
    probes: 0,
    gathers: 0,
    eats: 0,
    eaten: 0,
    nutrition: 0,
    pending: null,
    meals: [],
    unresolved: [],
    released: [],
    transfers: [],
    facts: [],
    inspections: [],
    empty: [],
    blocked: [],
    visited: [],
    path: [],
    reason: null,
  };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const mode = typeof action.args.mode === 'string' ? action.args.mode : '';
  const run = openRun(a);
  const continuing =
    !!run &&
    run.status === 'active' &&
    run.lastStep === w.tick - 1 &&
    c.operation?.first === false;
  if (mode === 'cancel') {
    if (!run) throw nothing('There is no open foraging run to cancel.');
    return close(
      sayIn(c),
      w,
      a,
      run,
      'cancelled',
      'cancel',
      'Cancelled on request.',
    );
  }
  if (mode === 'resume') {
    if (!run)
      throw nothing('There is no open foraging run to resume; give start.');
    if (!continuing) {
      // A deliberate resume inspects again before any gather; elapsed rounds still count.
      run.checked = null;
      run.status = 'active';
      c.emit(
        EVENTS.resumed,
        `Resumed foraging ${run.id} after fresh checks (${tally(w, run)}).`,
        data(w, a, run, 'resumed', { state: 'resumed', outcome: 'resumed' }),
      );
    }
    return advance(c, run);
  }
  if (mode !== 'start') throw nothing(`Give mode ${RECHECK_MODES.join(', ')}.`);
  if (run) {
    if (continuing) return advance(c, run);
    throw nothing(
      `Your foraging run ${run.id} is ${run.status}; give resume to continue it or cancel to end it.`,
    );
  }
  const fresh = begin(c);
  const extra = [
    fresh.recheck ? 'rechecking sources last seen empty' : '',
    fresh.explore ? 'exploring observed ground while a meal still fits' : '',
    `health ${shown(fresh.minHealth ?? MIN_HEALTH)} or below stops it; low satiety or starvation damage alone does not`,
    fresh.minTemp !== null || fresh.maxTemp !== null
      ? `body temperature within ${shown(fresh.minTemp ?? 12)} to ${shown(fresh.maxTemp ?? 32)}`
      : '',
    fresh.avoidAreas.length || fresh.avoidDirections.length
      ? `avoiding ${[...fresh.avoidAreas.map((z) => `within ${shown(z.radius)} of (${shown(z.x)}, ${shown(z.y)})`), ...fresh.avoidDirections.map((d) => `the ${d}`)].join(', ')}`
      : '',
  ].filter(Boolean);
  c.emit(
    EVENTS.started,
    `Began bounded food foraging for ${kindsOf(fresh)} (supported by your own eating records) within ${shown(fresh.radius)} of (${shown(fresh.origin.x)}, ${shown(fresh.origin.y)}): at most ${shown(fresh.limits.path)} distance, ${String(fresh.limits.time)} rounds and ${shown(fresh.limits.energy)} energy, keeping ${shown(fresh.limits.reserve)}, eating up to ${String(fresh.limits.quantity)} unit(s), each gathered alone and eaten next; ${extra.join('; ')}.`,
    data(w, a, fresh, 'started', { state: 'started', outcome: 'started' }),
  );
  return advance(c, fresh);
}

/** After the round's environment and before its physiology: an active run whose round was not a
 * foraging step pauses, and a person who has mastered this operation keeps their health while
 * their satiety is 0 or less, the evidence that the next round reads for starvation alone. */
function environment(w: V7World): void {
  for (const a of w.actors) {
    if (a.vitals.health <= 0) continue;
    if (a.mastered.includes(ID) && a.vitals.satiety <= 0)
      a.extensionState[BODY] = { tick: w.tick, health: a.vitals.health };
    else if (a.extensionState[BODY] !== undefined)
      delete a.extensionState['bounded-food-foraging:body'];
    const run = openRun(a);
    if (run?.status !== 'active' || run.lastStep === w.tick) continue;
    run.status = 'paused';
    run.phase = 'paused';
    run.reason =
      'this round was not a foraging step: another action, a refused action or no action took it';
    save(a, run);
    sayAt(w, a)(
      EVENTS.paused,
      `Foraging ${run.id} paused: ${run.reason}. Its steps and costs stay${run.pending ? `, and ${run.pending.item} stays in your inventory` : ''}; resume continues after fresh checks; cancel ends it (${tally(w, run)}).`,
      data(w, a, run, 'paused', { state: 'paused', outcome: 'paused' }),
    );
  }
}
function onDeath(w: V7World, a: V7Actor): void {
  const run = openRun(a);
  if (run)
    close(sayAt(w, a), w, a, run, 'ended', 'death', 'Died during the run.');
}

const ABILITY: V7Ability = {
  id: ID,
  name: 'Bounded food foraging',
  function:
    'Find ripe food of kinds your own eating records support in an area; gather one unit, then eat it; one navigate, probe, gather or eat step per round within limits.',
  equivalence: 'forage:bounded-food-foraging:gather-then-eat:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: RECHECK_MODES },
      x: { type: 'number' },
      y: { type: 'number' },
      radius: { type: 'number', minimum: 0.5, maximum: SEARCH_MAX.radius },
      path: { type: 'number', minimum: 0, maximum: SEARCH_MAX.path },
      time: { type: 'integer', minimum: 1, maximum: SEARCH_MAX.time },
      energy: { type: 'number', minimum: 0, maximum: SEARCH_MAX.energy },
      reserve: {
        type: 'number',
        minimum: RECHECK_EAT_ENERGY,
        maximum: SEARCH_MAX.energy,
      },
      quantity: { type: 'integer', minimum: 1, maximum: SEARCH_MAX.quantity },
      evidenceRefs: { type: 'array', items: { type: 'string' } },
      recheck: { type: 'boolean' },
      explore: { type: 'boolean' },
      minHealth: {
        type: 'number',
        minimum: LOW_HEALTH.health,
        maximum: LOW_HEALTH.most,
      },
      minTemp: { type: 'number', minimum: 12, maximum: 32 },
      maxTemp: { type: 'number', minimum: 12, maximum: 32 },
      avoidAreas: {
        type: 'array',
        items: v7ObjectSchema({
          x: { type: 'number' },
          y: { type: 'number' },
          radius: { type: 'number', minimum: 0.5, maximum: 16 },
        }),
      },
      avoidDirections: {
        type: 'array',
        items: { type: 'string', enum: [...RECHECK_DIRECTIONS] },
      },
    }),
    required: ['mode'],
  },
  references: {},
  prerequisites: [
    SEARCH_NAVIGATE.ability,
    SEARCH_PROBE.ability,
    SEARCH_GATHER.ability,
    EAT.ability,
  ],
  dependencies: {
    abilities: [
      SEARCH_NAVIGATE.ability,
      SEARCH_PROBE.ability,
      SEARCH_GATHER.ability,
      EAT.ability,
    ],
    resources: [],
    knowledge: [],
  },
  learning: 1,
  costs:
    "No cost of its own: one ordinary step per round at its own cost. navigate: distance x 2 energy (more on rough ground or loaded), <= 0.8 per round; probe observe: 0.2 energy; gather: 2 energy per unit; eat: eat's 1 energy (more when mood is low), real nutrition and toxicity. Each step is priced first against path, time, energy and reserve; a gather only if it and the next eat both fit. Paused rounds count. Study: 1 round; needs navigate, probe, gather, eat.",
  effects:
    "start: radius around x, y (default you), path, time, energy, reserve >= 1 (never spent below), quantity (units to eat), evidenceRefs (up to 6 record ids). Only kinds your cited eating records support as edible and nontoxic are eaten (assess-food-suitability's evaluator); other kinds seen are reported safety unresolved. A carried eligible unit is eaten first. Ripe sources of eligible kinds seen now or remembered in the radius, nearest reach first across kinds; recheck: then sources last seen empty, probed once per run. Remembered places are only destinations; stock is probed in reach. Walk, probe, gather one unit, eat it next. explore: walk to observed dry ground to see unseen parts. Stops: health <= minHealth (default 60, 20 to 100), injury in the last round other than starvation alone, body temperature <= 12 or >= 32, minTemp, maxTemp, any limit. avoidAreas, avoidDirections as in recheck. Ends at the cap or full satiety. Another action pauses; resume rechecks; cancel or death ends. No refund or reward; food not assured.",
  handler: HANDLER,
  revision: REVISION,
  authored: false,
  // The completion event never carries a qualified flag: foraging earns no practice milestone.
  practiceEvidence: EVENTS.completed,
  execution: {
    duration: null,
    interruption: 'cancel',
    progress:
      'start or resume continues with the same action, one step per round, until it completes or stops; a round taken by another action pauses it. Steps and costs stay.',
  },
};

/** ex26: Lin's bounded food foraging with gather-then-eat across the kinds her own eating
 * records support, through navigate, probe, gather and eat. */
export const LONG_EX26_FOOD_FORAGING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex26',
  dependencies: [
    'foundation-forest@1',
    'foundation-open@1',
    'bounded-resource-search@1',
    'bounded-resource-search-recheck@1',
    'bounded-resource-search-low-health@1',
    'assess-food-suitability@1',
  ],
  description:
    "Bounded food foraging across the kinds that the person's own cited eating records support as edible and nontoxic (the assess-food-suitability@1 evaluator; any other kind seen is reported unresolved and never eaten): candidates of every eligible kind in the nearest reach order, optional rechecks of sources last seen empty once per run and optional exploration of observed ground, one gathered unit at a time eaten as the next step through eat itself, the gather taken only when it and that eat both fit; the stop lines of bounded-resource-search-low-health@1 (minHealth default 60, 20 to 100; starvation damage alone does not stop it). No new movement, observation, harvest, food, healing or reward.",
  reuse: {
    experiment:
      'bounded-resource-search-low-health@1 (its low-health stop lines and the starvation-alone rule, its threshold range), bounded-resource-search-recheck@1 (recheck candidates and their once-per-run record, nearest reach order, avoided areas and directions, the eat-cost reserve, modes), bounded-resource-search@1 (candidates from perception and memory, pricing, exploration, the fact record), assess-food-suitability@1 (its target resolution, citation and evaluator), foundation-forest@1 navigate (kernel.navigate: speed 0.8 x dt / travel factor, distance x 2 x carried-mass effort), gather (forest.gather) and eat (forest.eat: energy, nutrition, toxicity, meal experience, eating record), foundation-open@1 probe observe mode (open.probe)',
    source:
      'long-ex26-search-low-health.ts (lowHealthRisks, LOW_HEALTH_BODY, LOW_HEALTH, exported unchanged); long-ex26-search-recheck.ts (recheckZones, recheckAvoided, recheckZoned, recheckByGap, its constants); long-ex26-bounded-search.ts (searchSources, searchBinding, searchFits, searchPlace, searchNote and its constants); long-ex26-food-assessment.ts (foodSuitabilityTarget, foodSuitabilityCitations, foodSuitabilityEvaluate, exported unchanged); long-ex21-constituent-test.ts (constituentIdList); continuous-kernel.ts (v7NavigateStep); open-foundation.ts (open.probe); forest-foundation.ts (forest.gather, forest.eat); forest-experience.ts (forestRestFactor, the effort eat itself applies); continuous-observation.ts (v7Observe); open-experience.ts (routine accounting gated by this revision)',
    description:
      'Code dependencies, not copies: the stop lines are the low-health function, candidate collection, pricing, exploration and avoidance are the earlier search functions, the food judgement is the assessment evaluator, and every movement, observation, transfer and meal is the dependency handler itself, called once per round. New: candidates across eligible kinds, the gather-then-eat order, the pair and meal pricing, the unresolved report, the run record and its lifecycle.',
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
      !w.config.forest ||
      !w.config.experience ||
      w.state.operationContinuity !== 1 ||
      !w.revisions.includes('foundation-open@1')
    )
      throw new Error(
        'Bounded food foraging needs the forest world with operation continuity and the open probe.',
      );
    return w;
  },
};
