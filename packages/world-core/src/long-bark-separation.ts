import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Json,
  V7Object,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import {
  v7Id,
  v7Json,
  v7Number,
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import { v7Distance, v7Reach, v7Visible } from './continuous-geometry.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import { materialPortion } from './material-lots.js';
import { OPEN_FOUNDATION, openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workFind,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';

const ID = 'bark-separation';
const REVISION = `${ID}@1`;
const STATE = 'long:work:bark-separation';
const TRIALS = 'long:bark-separation:trials';
const MODEL = 'fallen-branch-bark@1';
/** bark-extraction@1 (ex12): an otherwise unspecified fallen branch carries 10% of its mass as outer bark. */
const BARK_SHARE = 0.1;
/** simple-shelter@1 counts one bark unit (0.3 mass) as 0.5 m2 of roofing; recovered bark uses the same basis. */
const AREA_PER_BARK_UNIT = 0.5;
/** The shelters use one branch unit as one 2 m member. */
const PIECE_LENGTH = 2;
/** Largest bark surface one hand increment may process. */
const INCREMENT_AREA = 0.1;
/** Integer mass accounting in millionths. */
const MICRO = 1e6;
/** Stack treatments other packages represent; the bark model does not apply over them. */
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

/** Per-unit authoritative component record of one branch lot (mass units). */
interface BarkRecord extends V7Data {
  model: string;
  woodPerUnit: number;
  attachedPerUnit: number;
  /** Bark detached by hand separation (recovered strips and their offcuts). */
  separatedPerUnit: number;
  /** Bark removed and torn by a separation trial. */
  testedPerUnit: number;
  lastWork: string | null;
}

function basis(w: V7World) {
  const branch = w.resources.find((r) => r.id === 'branch'),
    bark = w.resources.find((r) => r.id === 'bark');
  if (!branch || !bark || branch.mass <= 0 || bark.mass <= 0)
    throw new Error('Missing branch or bark material definitions.');
  const density = bark.mass / AREA_PER_BARK_UNIT;
  return {
    branchMass: branch.mass,
    density,
    tenthMicro: Math.round((bark.mass / 10) * MICRO),
    capMicro: Math.round(INCREMENT_AREA * density * MICRO),
    water: branch.properties?.moisture ?? 0,
  };
}
const micro = (perUnit: number, tenths: number) =>
  Math.round((perUnit * tenths * MICRO) / 10);
const mass = (value: number) => v7RoundNumber(value / MICRO);

/** The represented composition of a stack, or null where none exists. */
function composition(w: V7World, s: V7Stack): BarkRecord | null {
  const prior = s.processing?.barkSeparation;
  if (prior && typeof prior === 'object' && !Array.isArray(prior))
    return s.resource === 'branch' && prior.model === MODEL
      ? ({ ...prior } as BarkRecord)
      : null;
  if (
    s.resource !== 'branch' ||
    Object.keys(s.processing ?? {}).length ||
    TREATED.some((key) => s[key] !== undefined)
  )
    return null;
  return untreated(w);
}
/** The stated model of one untreated fallen-branch unit. */
function untreated(w: V7World): BarkRecord {
  const m = basis(w).branchMass;
  return {
    model: MODEL,
    woodPerUnit: v7RoundNumber(m * (1 - BARK_SHARE)),
    attachedPerUnit: v7RoundNumber(m * BARK_SHARE),
    separatedPerUnit: 0,
    testedPerUnit: 0,
    lastWork: null,
  };
}
function setRecord(w: V7World, s: V7Stack, r: BarkRecord) {
  const unit = v7RoundNumber(r.woodPerUnit + r.attachedPerUnit),
    water = basis(w).water;
  s.processing = { ...(s.processing ?? {}), barkSeparation: v7Json(r) };
  s.physical = {
    unitMass: unit,
    unitWater: v7RoundNumber(unit * water),
    unitSolids: v7RoundNumber(unit * (1 - water)),
  };
}
/** Visible geometry of the bark per branch unit. */
function geometry(w: V7World, r: BarkRecord) {
  const d = basis(w).density,
    area = (r.attachedPerUnit + r.separatedPerUnit + r.testedPerUnit) / d;
  return {
    lengthPerUnit: PIECE_LENGTH,
    circumference: v7RoundNumber(area / PIECE_LENGTH),
    barkAreaPerUnit: v7RoundNumber(area),
    coveredAreaPerUnit: v7RoundNumber(r.attachedPerUnit / d),
    separatedAreaPerUnit: v7RoundNumber(r.separatedPerUnit / d),
    tornAreaPerUnit: v7RoundNumber(r.testedPerUnit / d),
  };
}
const surface = (r: BarkRecord) =>
  r.attachedPerUnit <= 1e-9
    ? 'bark-removed'
    : r.separatedPerUnit + r.testedPerUnit > 1e-9
      ? 'partly-separated'
      : 'intact-bark';

const trialKey = (resource: string, origin: string) => `${resource}:${origin}`;
function trialOf(a: V7Actor, key: string): V7Data | null {
  const all = a.extensionState[TRIALS];
  if (!all || typeof all !== 'object' || Array.isArray(all)) return null;
  const t = all[key];
  return t && typeof t === 'object' && !Array.isArray(t) ? t : null;
}

function separability(trial: V7Data | null): V7Json {
  return trial
    ? {
        byOwnTrial: true,
        tick: trial.tick ?? null,
        evidence: trial.evidence ?? null,
      }
    : 'unknown until a hand separation trial on an owned portion';
}

function noTool(c: V7ActionContext) {
  if (c.action.args.toolId)
    throw new Error(
      'Tool-assisted separation is not represented in this version; only hand separation is available. Nothing was spent.',
    );
}
function ownedStack(c: V7ActionContext): V7Stack {
  const id = v7String(c.action.args.target, 'target');
  const s = c.world.stacks.find((s) => s.id === id);
  if (!s || s.owner !== c.actor.id || s.reservedFor)
    throw new Error(
      'Trials and recovery need your own carried, unreserved material; natural source stock is gathered separately. Nothing was spent.',
    );
  const r = composition(c.world, s);
  if (!r)
    throw new Error(
      'No bark composition is represented for this material, so its bark is unresolved; trial and recovery are unavailable in this version, not ruled out. Nothing was spent.',
    );
  if (r.attachedPerUnit <= 1e-9)
    throw new Error(
      'No attached bark remains on this material. Nothing was spent.',
    );
  return s;
}

/** Visible surface facts only: attached mass and separability are never inferred here. */
const resourceOf = (o?: V7Object, s?: V7Stack) =>
  s?.resource ??
  (typeof o?.data.resource === 'string' ? o.data.resource : (o?.kind ?? ''));
function finding(c: V7ActionContext, o?: V7Object, s?: V7Stack): V7Data {
  const resource = resourceOf(o, s);
  const base = {
    target: s?.id ?? o?.id ?? '',
    resource,
    kind: s ? 'item' : 'object',
  };
  if (resource === 'bark')
    return {
      ...base,
      status: 'detached-bark',
      note: s
        ? 'Already detached bark; nothing to separate.'
        : 'A bark source; gather collects its loose stock separately.',
    };
  if (o && resource === 'branch') {
    const stock = Number(o.data.stock ?? 0),
      g = geometry(c.world, untreated(c.world)),
      trial = trialOf(c.actor, trialKey(resource, o.id));
    return stock <= 0
      ? { ...base, status: 'no-material', stock: 0 }
      : {
          ...base,
          status: trial ? 'separable-verified' : 'separability-unresolved',
          stock,
          barkCovering: 'visible on the fallen pieces',
          exposedEdges: 'bark edges visible at the broken ends',
          pieceLength: g.lengthPerUnit,
          circumference: g.circumference,
          visibleBarkArea: v7RoundNumber(stock * g.coveredAreaPerUnit),
          attachedMass: 'unknown: bark thickness and adhesion are not visible',
          separability: separability(trial),
          access:
            'Natural source stock is not owned work material; gather it first.',
        };
  }
  const r = s ? composition(c.world, s) : null;
  if (!s || !r)
    return {
      ...base,
      status: 'composition-unresolved',
      note: 'No bark composition is represented for this material in this version; trial and recovery are unavailable, not ruled out.',
    };
  const g = geometry(c.world, r),
    trial = trialOf(c.actor, trialKey(s.resource, s.origin));
  return {
    ...base,
    status: trial ? 'separable-verified' : 'separability-unresolved',
    surface: surface(r),
    quantity: s.quantity,
    origin: s.origin,
    harvestedAt: s.harvestedAt ?? null,
    pieceLength: g.lengthPerUnit,
    circumference: g.circumference,
    visibleBarkArea: v7RoundNumber(s.quantity * g.coveredAreaPerUnit),
    separatedArea: v7RoundNumber(s.quantity * g.separatedAreaPerUnit),
    tornTestArea: v7RoundNumber(s.quantity * g.tornAreaPerUnit),
    exposedEdges:
      r.attachedPerUnit > 1e-9
        ? 'bark edges visible at the broken ends'
        : 'no attached bark remains',
    attachedMass: 'unknown: bark thickness and adhesion are not visible',
    separability: separability(trial),
    roofing: 'not established by inspection',
  };
}

/** Baseline probe observation (its single 0.2 energy charge) plus a visible-surface record. */
function inspect(c: V7ActionContext): V7HandlerResult {
  const target = v7String(c.action.args.target, 'target');
  const o = c.world.objects.find((o) => o.id === target),
    s = c.world.stacks.find((s) => s.id === target);
  if (!o && !s)
    throw new Error('The target is not available. Nothing was spent.');
  if (s?.reservedFor)
    throw new Error(
      'This material is reserved by ongoing work. Nothing was spent.',
    );
  if (
    (o &&
      (!v7Reach(c.actor, o.spatial) ||
        !v7Visible(c.world, c.actor.position, o.spatial))) ||
    (s &&
      s.owner !== c.actor.id &&
      v7Distance(c.actor.position, s.position) >
        c.actor.radius + c.world.config.interaction)
  )
    throw new Error(
      'Move within visible interaction reach of the target. Nothing was spent.',
    );
  const probe = OPEN_FOUNDATION.handlers['open.probe'];
  if (!probe) throw new Error('Missing baseline probe.');
  probe({
    ...c,
    action: {
      interface: 'probe',
      args: { target, mode: 'observe', intensity: 0 },
    },
  });
  const value = finding(c, o, s);
  openRemember(c, {
    key: `${target}:bark-surface`,
    subject: resourceOf(o, s),
    property: 'visible bark surface',
    value,
    method: 'close visual inspection',
    condition: 'visible surface only',
    verified: false,
  });
  c.emit(
    'bark-separation-inspected',
    `Inspection: ${typeof value.status === 'string' ? value.status : 'recorded'}. Only visible surface facts were recorded; nothing was separated.`,
    value,
    target,
  );
  return { complete: true, writes: [target] };
}

/** One paid hand peel on a 0.1 owned portion: its bark is lifted and torn off; its wood remains. */
function trial(c: V7ActionContext): V7HandlerResult {
  noTool(c);
  const s = ownedStack(c);
  if (
    c.action.args.quantity !== undefined &&
    foodTenths(v7Number(c.action.args.quantity, 'quantity', 0.1)) !== 1
  )
    throw new Error(
      'A separation trial uses exactly 0.1 unit. Nothing was spent.',
    );
  const r = composition(c.world, s) as BarkRecord,
    g = geometry(c.world, r),
    b = basis(c.world);
  v7Spend(c.actor, 0.5);
  // Lock only the selected portion: split it off as its own stack.
  const portion: V7Stack = {
    ...materialPortion(s, 1),
    id: v7Id(c.world, 'item'),
    position: { ...c.actor.position },
  };
  foodSetQuantity(s, foodTenths(s.quantity) - 1);
  c.world.stacks.push(portion);
  const removed = micro(r.attachedPerUnit, 1),
    wood = micro(r.woodPerUnit, 1),
    area = v7RoundNumber(mass(removed) / b.density),
    next: BarkRecord = {
      ...r,
      attachedPerUnit: 0,
      testedPerUnit: v7RoundNumber(r.testedPerUnit + r.attachedPerUnit),
      lastWork: `trial-${portion.id}`,
    };
  setRecord(c.world, portion, next);
  const result = {
    actorId: c.actor.id,
    target: s.id,
    portion: portion.id,
    provenance: {
      resource: s.resource,
      origin: s.origin,
      harvestedAt: s.harvestedAt ?? null,
    },
    region: {
      quantity: 0.1,
      length: v7RoundNumber(area / g.circumference),
      width: g.circumference,
      area,
    },
    edge: 'accessible at the broken end',
    handSeparation: 'separates along the grain at safe hand force',
    arealMass: v7RoundNumber(b.density),
    barkShareOfMass: v7RoundNumber(
      r.attachedPerUnit / (r.woodPerUnit + r.attachedPerUnit),
    ),
    damage: {
      testStrip: 'lifted and torn',
      area,
      mass: mass(removed),
      fate: 'recorded waste left at the trial position (below one tenth of a bark unit)',
    },
    ledger: {
      input: mass(removed + wood),
      residualWood: mass(wood),
      remainingAttached: 0,
      recovered: 0,
      waste: mass(removed),
    },
    paidEnergy: 0.5,
    roofing: 'not established: a torn test strip is not a roofing unit',
  };
  openRemember(c, {
    key: `bark-separation:${s.origin}:trial`,
    subject: s.resource,
    property: 'hand bark separation trial',
    value: result,
    method: 'paid hand peel of an owned 0.1 portion',
    condition: `material from ${s.origin}`,
    verified: false,
  });
  c.emit(
    'bark-separation-trial',
    'Hand trial: an accessible edge at the broken end; the bark separates along the grain at safe hand force. The test strip tore and is recorded as waste; the portion keeps its wood.',
    result,
    portion.id,
  );
  const prior = c.actor.extensionState[TRIALS];
  c.actor.extensionState[TRIALS] = {
    ...(prior && typeof prior === 'object' && !Array.isArray(prior)
      ? prior
      : {}),
    [trialKey(s.resource, s.origin)]: {
      tick: c.world.tick,
      portion: portion.id,
      evidence: c.world.events.at(-1)?.id ?? '',
      edge: true,
      hand: true,
    },
  };
  return { complete: true, writes: [s.id, portion.id] };
}

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const escrow = (w: V7World, j: CollectiveWork, a: V7Actor) =>
  w.stacks.find(
    (s) => s.id === j.escrow[0] && s.reservedFor === j.id && s.owner === a.id,
  );
const num = (j: CollectiveWork, key: string) => Number(j[key] ?? 0);
function summary(w: V7World, j: CollectiveWork): V7Data {
  const d = basis(w).density,
    tenth = basis(w).tenthMicro;
  const attached = num(j, 'attachedMicro'),
    start = num(j, 'startMicro');
  return {
    workId: j.id,
    status: j.status,
    provenance: v7Json(j.provenance),
    input: v7Json(j.sources),
    trialEvidence: v7Json(j.trialEvidence),
    region: {
      totalArea: v7RoundNumber(mass(start) / d),
      processedArea: v7RoundNumber(mass(start - attached) / d),
      remainingArea: v7RoundNumber(mass(attached) / d),
      stripWidth: v7Json(j.stripWidth),
    },
    ledger: {
      input: mass(num(j, 'woodMicro') + start),
      residualWood: mass(num(j, 'woodMicro')),
      remainingAttached: mass(attached),
      recovered: mass(num(j, 'recoveredTenths') * tenth),
      recoveredUnits: num(j, 'recoveredTenths') / 10,
      waste: mass(num(j, 'wasteMicro')),
    },
    pieces: v7Json(j.pieces ?? []),
    products: v7Json(j.outputs),
    completedRounds: j.completedWork,
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    position: { x: j.x, y: j.y },
    visual: {
      state:
        j.status === 'completed'
          ? 'separated'
          : j.status === 'active'
            ? 'in-progress'
            : j.status,
      progress: start ? v7RoundNumber((start - attached) / start) : 0,
      peeledArea: v7RoundNumber(mass(start - attached) / d),
      coveredArea: v7RoundNumber(mass(attached) / d),
    },
  };
}
function sync(w: V7World, a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(summary(w, j));
}
function stop(c: V7ActionContext, j: CollectiveWork, reason: string) {
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(c.world, c.actor, j, reason, false);
  c.emit('bark-separation-stopped', reason, summary(c.world, j), j.id);
  sync(c.world, c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** Recovered strips become ordinary owned bark in exact tenths; nothing is reserved on them. */
function deliver(c: V7ActionContext, j: CollectiveWork, e: V7Stack, n: number) {
  let p = c.world.stacks.find(
    (s) =>
      s.id === j.product &&
      s.owner === c.actor.id &&
      s.resource === 'bark' &&
      !s.reservedFor,
  );
  if (!p) {
    p = {
      id: v7Id(c.world, 'item'),
      resource: 'bark',
      quantity: 0,
      quantityTenths: 0,
      owner: c.actor.id,
      position: { ...c.actor.position },
      origin: e.origin,
      ...(e.harvestedAt === undefined ? {} : { harvestedAt: e.harvestedAt }),
    };
    c.world.stacks.push(p);
    j.product = p.id;
    j.outputs.push(p.id);
  }
  foodSetQuantity(p, foodTenths(p.quantity) + n);
  return p;
}

/** One paid increment of at most 0.1 m2, after revalidating material, record, edge and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  if (!open(j)) throw new Error('This bark separation is already settled.');
  const e = escrow(c.world, j, c.actor);
  if (!e)
    return stop(
      c,
      j,
      'The reserved material is no longer held; completed products and damage remain as they are.',
    );
  const r = composition(c.world, e),
    tenths = foodTenths(e.quantity),
    b = basis(c.world);
  let attached = num(j, 'attachedMicro');
  if (
    !r ||
    Math.abs(micro(r.attachedPerUnit, tenths) - attached) > 1 ||
    !trialOf(c.actor, trialKey(e.resource, e.origin))
  )
    return stop(
      c,
      j,
      'The reserved material changed outside this work; completed products and damage remain as they are.',
    );
  const resumed = j.status === 'paused';
  if (c.actor.vitals.energy < 1) {
    j.status = 'paused';
    j.reason = 'Insufficient energy for the next increment; nothing was spent.';
    c.emit(
      'bark-separation-paused',
      'Paused before work: not enough energy for the next increment. Completed products and the reserved remainder are kept.',
      { ...summary(c.world, j), requiredEnergy: 1 },
      j.id,
    );
    sync(c.world, c.actor, j);
    return { complete: true, writes: [j.id] };
  }
  if (!workPay(c, j, 1))
    throw new Error('Energy changed before the paid increment.');
  c.actor.vitals.energy = v7RoundNumber(Math.max(0, c.actor.vitals.energy));
  j.paidEnergy = v7RoundNumber(j.paidEnergy);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  if (resumed)
    c.emit(
      'bark-separation-resumed',
      'Unfinished separation resumed on the remaining surface after revalidation.',
      summary(c.world, j),
      j.id,
    );
  const m = Math.min(b.capMicro, attached),
    units = Math.floor(m / b.tenthMicro),
    offcut = m - units * b.tenthMicro;
  attached -= m;
  j.attachedMicro = attached;
  j.recoveredTenths = num(j, 'recoveredTenths') + units;
  j.wasteMicro = num(j, 'wasteMicro') + offcut;
  setRecord(c.world, e, {
    ...r,
    attachedPerUnit: v7RoundNumber((attached * 10) / tenths / MICRO),
    separatedPerUnit: v7RoundNumber(
      r.separatedPerUnit + (m * 10) / tenths / MICRO,
    ),
    lastWork: j.id,
  });
  const p = units ? deliver(c, j, e, units) : undefined,
    area = v7RoundNumber(mass(m) / b.density),
    width = Number(j.stripWidth);
  const piece = {
    increment: j.completedWork,
    area,
    width,
    length: v7RoundNumber(area / width),
    mass: mass(m),
    recoveredUnits: units / 10,
    offcutWaste: mass(offcut),
    product: p?.id ?? null,
    condition: 'continuous strip',
  };
  j.pieces = [...(Array.isArray(j.pieces) ? j.pieces : []), piece];
  const balance =
    num(j, 'woodMicro') +
    num(j, 'startMicro') -
    (num(j, 'woodMicro') +
      attached +
      num(j, 'recoveredTenths') * b.tenthMicro +
      num(j, 'wasteMicro'));
  if (Math.abs(balance) > 1)
    throw new Error('Bark separation must conserve the processed material.');
  c.emit(
    'bark-separation-progress',
    units
      ? `One paid hand increment detached ${String(area)} m2 of bark; ${String(units / 10)} bark unit moved into your carried bark.`
      : `One paid hand increment detached ${String(area)} m2 of bark, less than one tenth of a bark unit, recorded as waste.`,
    { ...summary(c.world, j), piece },
    j.id,
  );
  if (attached > 0) {
    sync(c.world, c.actor, j);
    return { complete: false, remaining: j.remainingWork, writes: [j.id] };
  }
  delete e.reservedFor;
  e.position = { ...c.actor.position };
  j.status = 'completed';
  c.emit(
    'bark-separation-completed',
    'All bark of the reserved portion was separated by hand. Recovered whole tenths are ordinary carried bark; the peeled wood stays as a lighter branch with its separation record.',
    { ...summary(c.world, j), residual: e.id },
    j.id,
  );
  sync(c.world, c.actor, j);
  return { complete: true, remaining: 0, writes: [j.id, e.id, ...j.outputs] };
}

function recover(c: V7ActionContext): V7HandlerResult {
  const existing = workFind(c);
  if (existing && open(existing) && c.operation?.first === false)
    return advance(c, existing);
  if (existing && open(existing))
    throw new Error(
      'Unfinished bark separation exists; resume or cancel it first. Nothing was spent.',
    );
  if (c.operation?.first === false)
    throw new Error('The bound bark separation is already settled.');
  noTool(c);
  const s = ownedStack(c),
    r = composition(c.world, s) as BarkRecord,
    evidence = trialOf(c.actor, trialKey(s.resource, s.origin));
  if (!evidence)
    throw new Error(
      'No hand separation trial of your own on material from this source has shown an accessible edge; run separation-trial on an owned portion first. Nothing was spent.',
    );
  const tenths = foodTenths(
    c.action.args.quantity === undefined
      ? s.quantity
      : v7Number(c.action.args.quantity, 'quantity', 0.1),
  );
  if (tenths > foodTenths(s.quantity))
    throw new Error('Select at most the quantity you hold. Nothing was spent.');
  if (c.actor.vitals.energy < 1)
    throw new Error(
      'Not enough energy for the first increment; nothing was reserved.',
    );
  const b = basis(c.world),
    start = micro(r.attachedPerUnit, tenths);
  const j = workCreate(c, 'hand-separation', Math.ceil(start / b.capMicro));
  j.provenance = {
    resource: s.resource,
    origin: s.origin,
    harvestedAt: s.harvestedAt ?? null,
  };
  j.trialEvidence = evidence;
  j.startMicro = start;
  j.attachedMicro = start;
  j.woodMicro = micro(r.woodPerUnit, tenths);
  j.recoveredTenths = 0;
  j.wasteMicro = 0;
  j.stripWidth = geometry(c.world, r).circumference;
  j.pieces = [];
  j.product = '';
  workReserve(c, j, [{ stack: s, quantity: tenths / 10 }]);
  c.emit(
    'bark-separation-started',
    'The selected branch portion is reserved and stays carried; no bark is supplied before paid separation.',
    summary(c.world, j),
    j.id,
  );
  return advance(c, j);
}

function resume(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error('No unfinished personal bark separation to resume.');
  return advance(c, j);
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error('No unfinished personal bark separation to cancel.');
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(
    c.world,
    c.actor,
    j,
    'Cancelled; the partly separated remainder returns in its actual state. Spent energy and time are not refunded.',
    false,
  );
  c.emit(
    'bark-separation-cancelled',
    'Separation cancelled; completed bark, damage and the remaining attached bark stay as they are.',
    summary(c.world, j),
    j.id,
  );
  sync(c.world, c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'inspect') return inspect(c);
  if (mode === 'separation-trial') return trial(c);
  if (mode === 'recover') return recover(c);
  if (mode === 'resume') return resume(c);
  if (mode === 'cancel') return cancel(c);
  throw new Error('Unknown bark separation mode.');
}

export const LONG_BARK_SEPARATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex15',
  dependencies: ['foundation-open@1'],
  description:
    'Assess fallen woody material for bark and separate the attached bark of owned fallen branches by hand, with a conserved wood/bark component record.',
  reuse: {
    experiment:
      'ex12 bark-extraction@1 branch bark share; ex15 food-preparation@1 paid-work pattern; foundation-open@1 probe',
    source:
      'open-foundation.ts (open.probe observe, openRemember); collective-work.ts (escrow, paid work, stop); material-lots.ts (portion); forest-food-accounting.ts (exact tenths); collective-bark-material.ts (10% bark share, water share from the branch moisture property)',
    description:
      'Reuses the probe observation and visible-target resolution unchanged, the existing escrow and paid-work helpers, and the bark-extraction@1 assumption that an unspecified fallen branch carries 10% of its mass as bark. Its stone-tool peeling, bark-fines resource and peeled-branch resource are not installed; separation here is by hand only.',
  },
  abilities: [
    {
      id: ID,
      name: 'Assess and separate bark by hand',
      function:
        'Inspect fallen woody material for visible bark, test hand separation on a 0.1 portion of an owned fallen branch, and separate its attached bark by hand into ordinary carried bark while the wood remains; resume or cancel unfinished work.',
      equivalence: 'branch:attached-bark:hand-assessment-and-separation:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'inspect',
              'separation-trial',
              'recover',
              'resume',
              'cancel',
            ],
          },
          target: { type: 'string' },
          quantity: { type: 'number', minimum: 0.1 },
          toolId: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: { target: 'optional-exact-visible' },
      prerequisites: [],
      learning: 2,
      costs:
        'Study: 2 rounds. Inspect: target a visible object or item in reach (your own carried items count), one round and 0.2 energy (the baseline probe observation; no second charge), no material used. Separation-trial: target your own carried fallen-branch stack, one round and 0.5 energy on exactly 0.1 unit split off from it. Recover: target your own carried fallen-branch stack and quantity (0.1 steps, default all); needs your own earlier trial on material from the same source. Work is one increment per round of at most 0.1 m2 of bark surface at 1 energy each, including a smaller final increment (one branch unit carries about 0.18 m2); recover pays the first and the same action continues each round; resume pays the next increment; cancel takes one round and no energy. Hand only: a toolId is refused at no cost. Travel and gathering are separate actions.',
      effects:
        'Represented composition (stated assumptions): one untreated fallen-branch unit (1.1 mass) is 0.99 wood and 0.11 attached bark (the bark-extraction@1 share), bark covers about 0.18 m2 at the bark unit basis of 0.3 mass per 0.5 m2, on a 2 m piece of about 0.09 m circumference, and separates by hand from the broken ends. Other materials have no represented bark composition: inspection reports them as unresolved and trial and recovery are refused at no cost. Inspect records only visible facts as a personal unverified record: bark covering, exposed edges, piece length, circumference, covered, separated and torn areas; attached mass and separability stay unknown until your own trial. The trial lifts and tears the bark of the 0.1 portion (recorded waste, about 0.011 mass) and reports edge, separation behaviour and bark share; the portion keeps its wood as its own stack. Each recover increment detaches real attached bark: every whole 0.03-mass tenth becomes ordinary carried bark (resource bark, same origin and harvest date, no other record), usable wherever bark units are used; a remainder below a tenth is recorded waste. The worked portion stays branch whose mass per unit falls by exactly the bark removed (0.99 when bare) and carries a separation record, so the shelters, which take only untreated units, do not accept it. Wood, attached bark, recovered bark and waste always sum to the input. Only the selected portion is reserved; it stays carried. Work not continued in a round pauses; too little energy pauses without spending; lost or changed material stops the work. Cancel returns the remainder in its actual state; death drops it on the ground. Completed products, damage, time and energy are never refunded. No shelter, comfort, food, regrowth or reward follows from separation.',
      handler: 'long.bark-separation',
      revision: REVISION,
      authored: false,
      // The completion event carries no qualified flag: separating bark earns no milestone.
      practiceEvidence: 'bark-separation-completed',
      dependencies: {
        abilities: [],
        resources: ['branch', 'bark'],
        knowledge: [],
      },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Inspect and trial complete in one round. Recover is paid work in increments of at most 0.1 m2 whose exact job, reserved portion, component ledger and products persist across interruption; resume pays only the next increment after revalidation; completion, stop, cancellation and death settle once.',
      },
    },
  ],
  handlers: { 'long.bark-separation': execute },
  processes: {},
  visualComponents: [],
  events: [
    'bark-separation-inspected',
    'bark-separation-trial',
    'bark-separation-started',
    'bark-separation-progress',
    'bark-separation-paused',
    'bark-separation-resumed',
    'bark-separation-cancelled',
    'bark-separation-stopped',
    'bark-separation-completed',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment(w) {
    for (const j of collectiveJobs(w, ID).filter(open)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a) continue;
      j.x = a.position.x;
      j.y = a.position.y;
      const e = escrow(w, j, a);
      if (e) e.position = { ...a.position };
      // No unattended progress: a round without paid work leaves the work paused.
      if (j.status === 'active' && j.lastPaid < w.tick) {
        j.status = 'paused';
        j.reason =
          'Not worked this round; completed products and the reserved remainder are kept.';
        forestEvent(
          w,
          'bark-separation-paused',
          'Separation paused because it was not worked this round; nothing progressed.',
          a.position,
          a.id,
          summary(w, j),
          j.id,
        );
      }
      sync(w, a, j);
    }
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && open(j),
    )) {
      j.x = a.position.x;
      j.y = a.position.y;
      workStop(
        w,
        a,
        j,
        'Performer died; the partly separated remainder was left on the ground once, neither completed nor refunded.',
        true,
      );
      forestEvent(
        w,
        'bark-separation-stopped',
        'Separation stopped by death; the remainder lies on the ground in its actual state.',
        a.position,
        a.id,
        summary(w, j),
        j.id,
      );
      sync(w, a, j);
    }
  },
};
