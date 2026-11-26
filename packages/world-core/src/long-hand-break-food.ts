import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Package,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { forestEvent } from './forest-climate.js';
import { foodTenths } from './forest-food-accounting.js';
import { openMaterial } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';

const ID = 'hand-break-food';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
/** Processing key of a unit this operation fractured or deformed. */
const PART = 'handBreak';
const MODEL = 'hand-break@1';
/** Energy of one paid unit (trial or prepare) and of one inspection. */
const UNIT = 1;
const LOOK = 0.2;
/** Most whole units one preparation may reserve. */
const MOST = 10;
/** Declared bounded bare-hand force on the size-scaled resistance scale of handBreakResponse:
 * it just breaks a 1-mass unit (read as 1 kg) of the weakest rigid tissue (hardness 1). */
export const HAND_FORCE = 0.1;
/** Flexibility at or above which tissue bends instead of snapping: ex16 branch-screen@1's
 * open-weave value, at which a rod deflects about its own thickness. */
export const HAND_BEND = 0.2;
/** One bounded snap of one whole unit separates it once, into two coarse pieces. */
const PIECES = 2;
/** Stack treatments other packages represent; no hand-break law applies over them. */
const TREATED = [
  'physical',
  'materialLayer',
  'mantle',
  'frictionKit',
  'waterCup',
  'fuelMoisture',
  'canopyDrying',
  'componentLots',
] as const;

type Outcome = 'fractured' | 'deformed' | 'resisted';
type Form = 'whole' | 'coarse-pieces' | 'deformed';
const FORM: Record<Outcome, Form> = {
  fractured: 'coarse-pieces',
  deformed: 'deformed',
  resisted: 'whole',
};
interface Result extends V7Data {
  input: string;
  output: string;
  outcome: Outcome;
  form: Form;
  pieces: number;
  tick: number;
}

/** Deterministic hand-workability rule on existing engine material values (never reported).
 * Tissue without rigidity (strength 0) squashes; otherwise, for geometrically similar units,
 * the force needed to break one grows with its cross-section, i.e. strength x mass^(2/3);
 * above the hand force it resists, below it flexible tissue bends and inflexible tissue snaps.
 * Compared in cubes so that only exact multiplication is used. */
export function handBreakResponse(
  r: V7Resource,
  unitMass: number,
): { outcome: Outcome; observed: string } {
  const m = openMaterial(r);
  if (m.strength <= 0)
    return {
      outcome: 'deformed',
      observed: 'squashed out of shape without separating',
    };
  const s = m.strength;
  if (s * s * s * unitMass * unitMass > HAND_FORCE * HAND_FORCE * HAND_FORCE)
    return {
      outcome: 'resisted',
      observed: 'did not visibly yield to the bounded hand force',
    };
  return m.flexibility >= HAND_BEND
    ? { outcome: 'deformed', observed: 'bent out of shape without separating' }
    : {
        outcome: 'fractured',
        observed: 'snapped across into two coarse pieces',
      };
}

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const results = (j: CollectiveWork): Result[] =>
  Array.isArray(j.results) ? (j.results as unknown as Result[]) : [];
const resourceOf = (j: CollectiveWork) =>
  typeof j.resource === 'string' ? j.resource : '';
const part = (s: V7Stack): V7Data | null => {
  const p = s.processing?.[PART];
  return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
};
const formOf = (s: V7Stack): Form => {
  const f = part(s)?.form;
  return f === 'coarse-pieces' || f === 'deformed' ? f : 'whole';
};
/** Reserved units of the work not yet worked. */
const pending = (w: V7World, j: CollectiveWork) =>
  j.escrow.flatMap((id) =>
    w.stacks.filter(
      (s) => s.id === id && s.reservedFor === j.id && s.quantity > 0,
    ),
  );
const ownJobs = (w: V7World, a: V7Actor) =>
  collectiveJobs(w, ID).filter((j) => j.owner === a.id);
const current = (w: V7World, a: V7Actor) => ownJobs(w, a).find(open);
const palette = (w: V7World, resource: string) => [
  w.resources.find((r) => r.id === resource)?.color ?? '#9a8f80',
];

/** Visible state of one lot: form, quantity and the displayed decay; no hidden value. */
function look(w: V7World, s: V7Stack): V7Data {
  const form = formOf(s);
  return {
    item: s.id,
    resource: s.resource,
    form,
    pieces: Number(part(s)?.pieces ?? 1),
    quantity: s.quantity,
    decay: v7RoundNumber(s.decay ?? 0),
    reserved: !!s.reservedFor,
    visual: {
      component: 'food',
      form,
      quantity: s.quantity,
      palette: palette(w, s.resource),
      decay: v7RoundNumber(s.decay ?? 0),
    },
  };
}
function summary(w: V7World, j: CollectiveWork): V7Data {
  const selected = strings(j.units).length;
  return {
    workId: j.id,
    actor: j.owner,
    mode: j.mode,
    status: j.status,
    resource: resourceOf(j),
    source: typeof j.source === 'string' ? j.source : null,
    selected,
    remaining: j.remainingWork,
    completedRounds: j.completedWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    progress: selected ? v7RoundNumber(results(j).length / selected) : 0,
    reserved: pending(w, j).map((s) => s.id),
    outputs: v7Json(results(j)),
    lost: strings(j.lost),
    position: { x: j.x, y: j.y },
  };
}
function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}

/** Reserved units that disappeared (they can only spoil while reserved) are recorded once. */
function noteLost(w: V7World, j: CollectiveWork) {
  const worked = results(j).map((r) => r.input),
    present = pending(w, j).map((s) => s.id);
  for (const id of j.escrow) {
    if (worked.includes(id) || present.includes(id)) continue;
    if (strings(j.lost).includes(id)) continue;
    j.lost = [...strings(j.lost), id];
    j.remainingWork = Math.max(0, j.remainingWork - 1);
  }
}

/** Whole units of an exact owned, unreserved, untreated, unspoiled food known as food. */
function eligible(c: V7ActionContext, n: number) {
  const id = v7String(c.action.args.inputStackId, 'inputStackId'),
    s = c.world.stacks.find(
      (x) =>
        x.id === id &&
        x.owner === c.actor.id &&
        !x.reservedFor &&
        x.quantity > 0,
    );
  if (!s)
    throw new Error(
      'inputStackId must be the exact id of an owned, unreserved item; resource names are not accepted. Nothing was spent.',
    );
  const known = c.actor.memory.discoveries?.[s.resource],
    r = collectiveFoodProfile(c.world, s);
  if (
    !known ||
    Number(known.nutrition ?? 0) <= 0 ||
    !r ||
    r.id !== s.resource ||
    r.nutrition <= 0
  )
    throw new Error(
      'Use food that your own record shows as edible; nothing was spent.',
    );
  if (
    TREATED.some((k) => s[k] !== undefined) ||
    Object.keys(s.processing ?? {}).length
  )
    throw new Error(
      'Only untreated whole food can be worked: broken, deformed or otherwise processed food has no rule in this version. Nothing was spent.',
    );
  const lifetime = r.properties?.decay ?? 0;
  if (lifetime && (s.decay ?? 0) >= lifetime)
    throw new Error('Spoiled food cannot be worked; nothing was spent.');
  if (foodTenths(s.quantity) < n * 10)
    throw new Error(
      `The item holds fewer than ${String(n)} whole units; nothing was spent.`,
    );
  return { stack: s, resource: r };
}
function count(c: V7ActionContext, trial: boolean): number {
  const n = c.action.args.quantity ?? 1;
  if (
    typeof n !== 'number' ||
    !Number.isSafeInteger(n) ||
    n < 1 ||
    n > (trial ? 1 : MOST)
  )
    throw new Error(
      trial
        ? 'A trial works exactly one whole unit; nothing was spent.'
        : `Select 1-${String(MOST)} whole units; nothing was spent.`,
    );
  return n;
}

function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  j.status = 'paused';
  j.reason = reason;
  c.emit(
    'hand-break-paused',
    `${reason} Worked units and reserved units are kept; nothing was spent.`,
    { ...summary(c.world, j), requiredEnergy: UNIT },
    j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}
function finish(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world,
    list = results(j);
  if (!list.length) {
    workStop(
      w,
      c.actor,
      j,
      'Every reserved unit spoiled before it was worked; nothing was produced or replaced.',
      false,
    );
    c.emit(
      'hand-break-stopped',
      'Hand-break work stopped: no reserved unit remained to work.',
      summary(w, j),
      j.id,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id] };
  }
  j.status = 'completed';
  j.outputs = list.map((r) => r.output);
  const tally = (o: Outcome) => list.filter((r) => r.outcome === o).length;
  c.emit(
    'hand-break-completed',
    tally('fractured')
      ? 'Hand-break work completed; only units that actually snapped are coarse pieces. It is raw food; eat it separately.'
      : 'Hand-break work completed, but no unit snapped: nothing was broken into pieces.',
    {
      ...summary(w, j),
      fractured: tally('fractured'),
      deformed: tally('deformed'),
      resisted: tally('resisted'),
    },
    j.id,
  );
  sync(c.actor, j);
  return {
    complete: true,
    remaining: 0,
    writes: [j.id, ...j.outputs],
  };
}

/** The physical result of one held unit persists as its own owned lot. */
function work(c: V7ActionContext, j: CollectiveWork, unit: V7Stack) {
  const w = c.world,
    r = w.resources.find((x) => x.id === unit.resource);
  if (!r) throw new Error('Missing actual food material.');
  const response = handBreakResponse(r, r.mass),
    form = FORM[response.outcome],
    pieces = response.outcome === 'fractured' ? PIECES : 1;
  let output = unit;
  if (response.outcome === 'resisted') {
    // The same unit stays whole and unchanged; it is only released from the work.
    delete unit.reservedFor;
    unit.position = { ...c.actor.position };
  } else {
    output = {
      ...v7Clone(unit),
      id: v7Id(w, 'item'),
      owner: c.actor.id,
      position: { ...c.actor.position },
      processing: {
        [PART]: {
          model: MODEL,
          form,
          pieces,
          from: unit.id,
          source: typeof j.source === 'string' ? j.source : null,
          workId: j.id,
          by: c.actor.id,
          at: w.tick,
          visual: {
            component: 'food',
            form,
            pieces,
            palette: palette(w, unit.resource),
          },
        },
      },
    };
    delete output.reservedFor;
    w.stacks = w.stacks.filter((s) => s !== unit);
    w.stacks.push(output);
  }
  const result: Result = {
    input: unit.id,
    output: output.id,
    outcome: response.outcome,
    form,
    pieces,
    tick: w.tick,
  };
  j.results = v7Json([...results(j), result]);
  // The verified record comes first, so the visible outcome is the round's last event.
  openRemember(c, {
    key: `${ID}:${r.id}:whole-untreated:${response.outcome}`,
    subject: r.id,
    property: 'response of one whole held unit to bounded two-hand bending',
    value: {
      outcome: response.outcome,
      form,
      pieces,
      observed: response.observed,
    },
    method: 'one bare-hand bending attempt on a whole held unit',
    condition:
      'whole untreated unspoiled unit; bare hands; no tool, support, water or heat',
    verified: true,
  });
  const data = {
    ...summary(w, j),
    ...result,
    observed: response.observed,
    lot: look(w, output),
  };
  if (response.outcome === 'fractured')
    c.emit(
      'food-fractured',
      `The unit snapped: one lot of ${String(output.quantity)} ${r.name} in ${String(PIECES)} coarse pieces, same food, age and quantity.`,
      data,
      output.id,
    );
  else if (response.outcome === 'deformed')
    c.emit(
      'food-deformed',
      `The unit ${response.observed}; it stays one lot of the same food, age and quantity.`,
      data,
      output.id,
    );
  else
    c.emit(
      'hand-break-resisted',
      'The unit did not yield and stays whole and unchanged; nothing was prepared.',
      data,
      output.id,
    );
  return output;
}

/** One paid unit after rechecking the reserved units and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world;
  if (!open(j)) throw new Error('This hand-break work is already settled.');
  noteLost(w, j);
  const unit = pending(w, j)[0];
  if (!unit || j.remainingWork <= 0) return finish(c, j);
  if (c.actor.vitals.energy < UNIT)
    return pause(c, j, 'Not enough energy for the next unit.');
  const resumed = j.status === 'paused';
  if (!workPay(c, j, UNIT))
    throw new Error('Energy changed before the paid unit.');
  c.actor.vitals.energy = v7RoundNumber(Math.max(0, c.actor.vitals.energy));
  j.paidEnergy = v7RoundNumber(j.paidEnergy);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  if (resumed)
    c.emit(
      'hand-break-resumed',
      'Unfinished hand-break work resumed after rechecking the reserved units and energy.',
      summary(w, j),
      j.id,
    );
  c.emit(
    'hand-force-applied',
    'Bounded two-hand bending force was applied once to one held whole unit.',
    { ...summary(w, j), unit: unit.id, unitLot: look(w, unit) },
    unit.id,
  );
  const output = work(c, j, unit);
  if (j.remainingWork <= 0 || !pending(w, j).length) return finish(c, j);
  sync(c.actor, j);
  return {
    complete: false,
    remaining: j.remainingWork,
    writes: [j.id, output.id],
  };
}

function start(c: V7ActionContext, mode: 'trial' | 'prepare') {
  if (current(c.world, c.actor))
    throw new Error(
      'Unfinished hand-break work exists; resume it with mode prepare and its workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined && c.action.args.workId !== '')
    throw new Error(
      'No unfinished hand-break work of yours has this workId; nothing was spent.',
    );
  const n = count(c, mode === 'trial'),
    { stack, resource } = eligible(c, n);
  if (c.actor.vitals.energy < UNIT)
    throw new Error(
      'Not enough energy for one paid unit; nothing was reserved.',
    );
  const j = workCreate(c, mode, n);
  j.resource = resource.id;
  j.source = stack.id;
  j.results = [];
  j.lost = [];
  workReserve(
    c,
    j,
    Array.from({ length: n }, () => ({ stack, quantity: 1 })),
  );
  if (stack.quantity <= 0)
    c.world.stacks = c.world.stacks.filter((s) => s !== stack);
  j.units = [...j.escrow];
  c.emit(
    'hand-break-started',
    `${String(n)} whole unit(s) reserved and held; they keep their owner, origin, age and decay. No tool, support, water or heat is used.`,
    summary(c.world, j),
    j.id,
  );
  return advance(c, j);
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    workId = c.action.args.workId;
  let subject: string, value: V7Data;
  if (typeof workId === 'string' && workId) {
    const j = ownJobs(w, c.actor).find((j) => j.id === workId);
    if (!j)
      throw new Error(
        'No hand-break work of yours has this workId; nothing was spent.',
      );
    v7Spend(c.actor, LOOK);
    subject = j.id;
    value = {
      workId: j.id,
      stage: j.status,
      mode: j.mode,
      selected: strings(j.units).length,
      remaining: j.remainingWork,
      completedRounds: j.completedWork,
      paidEnergy: v7RoundNumber(j.paidEnergy),
      reserved: pending(w, j).map((s) => look(w, s)),
      outputs: results(j).flatMap((r) =>
        w.stacks.filter((s) => s.id === r.output).map((s) => look(w, s)),
      ),
      lost: strings(j.lost),
    };
  } else {
    const id = v7String(c.action.args.inputStackId, 'inputStackId or workId'),
      s = w.stacks.find((x) => x.id === id && x.owner === c.actor.id);
    if (
      !s ||
      (!part(s) &&
        Number(c.actor.memory.discoveries?.[s.resource]?.nutrition ?? 0) <= 0)
    )
      throw new Error(
        'Inspect an exact owned food item or your own workId; nothing was spent.',
      );
    v7Spend(c.actor, LOOK);
    subject = s.id;
    value = look(w, s);
  }
  openRemember(c, {
    key: `${subject}:hand-break-condition`,
    subject,
    property: 'visible form, quantity, work stage and decay',
    value,
    method: 'direct inspection',
    condition: 'visible features only; no safety or keeping assessment',
    verified: false,
  });
  c.emit(
    'hand-break-inspected',
    'Only visible form, quantity, work stage and decay are reported.',
    value,
    subject,
  );
  return { complete: true, writes: [] };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    workId = c.action.args.workId,
    j = current(w, c.actor);
  if (!j || (typeof workId === 'string' && workId && workId !== j.id))
    throw new Error(
      'No unfinished hand-break work of yours to cancel; nothing was spent.',
    );
  const returned = pending(w, j).map((s) => s.id);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(
    w,
    c.actor,
    j,
    'Cancelled; unworked reserved units returned once, unchanged. Paid effort is not refunded.',
    false,
  );
  c.emit(
    'hand-break-cancelled',
    'Hand-break work cancelled; unworked units are returned whole and worked lots stay as they are.',
    { ...summary(w, j), returned },
    j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...returned] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode'),
    j = current(c.world, c.actor);
  // The bound action continues each round; prepare naming the work resumes it.
  if (
    j &&
    mode === 'prepare' &&
    (c.operation?.first === false || c.action.args.workId === j.id)
  )
    return advance(c, j);
  if (c.operation?.first === false && mode === 'prepare')
    throw new Error('The bound hand-break work is already settled.');
  if (mode === 'trial' || mode === 'prepare') return start(c, mode);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'cancel') return cancel(c);
  throw new Error('Unknown hand-break mode.');
}

/** Reserved units stay in the hands of their owner; an unworked round pauses the work. */
function environment(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    j.x = a.position.x;
    j.y = a.position.y;
    for (const s of pending(w, j)) s.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; worked lots and reserved units are kept.';
      forestEvent(
        w,
        'hand-break-paused',
        'Hand-break work paused because it was not worked this round; nothing was spent.',
        a.position,
        a.id,
        summary(w, j),
        j.id,
      );
    }
    sync(a, j);
  }
}

export const LONG_HAND_BREAK_FOOD: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: ['foundation-open@1'],
  description:
    'General hand-breaking of whole owned food without tools, heat or water: a deterministic hand-workability rule on existing material values decides whether each held unit snaps into coarse pieces, deforms or resists. Nutrition, toxicity, age and spoilage do not change.',
  reuse: {
    experiment:
      'ex15 food-preparation@1 (escrowed food work, pause, resume, cancel, death); ex16 hand-weave-fiber-mat@1 (verified material-response record)',
    source:
      'collective-work.ts (escrow, paid work, stop); open-physical.ts (engine material values); open-foundation.ts (personal records); collective-food-profile.ts and the unchanged eat path and meal experience',
    description:
      'Implementation reuse only; earlier packages are unchanged and no ability, item or mastery is inherited.',
  },
  abilities: [
    {
      id: ID,
      name: 'Hand-break food',
      function:
        'Apply bounded bare-hand bending force once to each selected whole unit of owned food: trial one unit or prepare several. The actual material decides whether it snaps into coarse pieces, deforms or resists. Inspect or cancel the work.',
      equivalence: 'food:hand-break:bare-hand-bending:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['trial', 'prepare', 'inspect', 'cancel'],
          },
          inputStackId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1, maximum: MOST },
          workId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 2,
      learningEnergy: 0.2,
      costs:
        'Study: 2 rounds at 0.2 energy. inputStackId: the exact id of an owned, unreserved, untreated, unspoiled food item your own record shows as edible; resource names are not accepted. trial: quantity 1; 1 round, 1 energy. prepare: quantity 1-10 whole units of that item, all reserved at once; 1 round and 1 energy per unit, continuing each round; resume with prepare and workId. inspect (workId, or inputStackId of your item): 1 round, 0.2 energy. cancel (optional workId): 1 round, no energy. Too little energy for the next unit or a round not worked pauses before any charge; refused requests spend nothing. No tool, support, water, heat or vessel is used or provided.',
      effects:
        'Each paid unit gets one two-hand bending attempt while held. Rigid, inflexible tissue small enough for hand force snaps into one lot of 2 coarse pieces; soft or flexible tissue deforms without separating; harder or larger units resist and stay whole and unchanged. Each worked unit becomes its own owned lot of the same food and quantity with the same origin, harvest time, decay, nutrition and toxicity; nothing detaches and pieces add no food. Results are raw food eaten with eat under the ordinary rules: shape alone changes no nutrition, safety, keeping, taste or meal variety. No washing, peeling, cooking, detoxifying or preservation; food keeps ageing, also while paused. Each worked unit records its observed response as a verified personal record; a repeated response confirms nothing new. Broken or deformed lots cannot be worked again in this version. Cancel returns unworked units once, unchanged; worked lots stay. Death leaves unworked units where the person died; spoiled reserved units are not replaced. Paid effort is never refunded; no reward or mastery is granted.',
      handler: 'long.hand-break-food',
      revision: REVISION,
      authored: false,
      // The completion event carries no qualified flag: breaking food earns no milestone.
      practiceEvidence: 'hand-break-completed',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'One paid unit per round; the exact work, reserved units and worked lots persist across interruption, and resuming by workId pays only the next unit after rechecks. Trial, inspect and cancel take one round.',
      },
    },
  ],
  handlers: { 'long.hand-break-food': execute },
  processes: {},
  visualComponents: [],
  events: [
    'hand-break-started',
    'hand-force-applied',
    'food-fractured',
    'food-deformed',
    'hand-break-resisted',
    'hand-break-paused',
    'hand-break-resumed',
    'hand-break-cancelled',
    'hand-break-stopped',
    'hand-break-completed',
    'hand-break-inspected',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of ownJobs(w, a).filter(open)) {
      j.x = a.position.x;
      j.y = a.position.y;
      workStop(
        w,
        a,
        j,
        'Performer died; unworked reserved units were left on the ground once, unchanged. Nothing is refunded.',
        true,
      );
      forestEvent(
        w,
        'hand-break-stopped',
        'Hand-break work stopped by death; unworked units lie where the person died and worked lots follow the ordinary possession rules.',
        a.position,
        a.id,
        summary(w, j),
        j.id,
      );
      sync(a, j);
    }
  },
};
