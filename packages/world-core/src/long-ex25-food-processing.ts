import type {
  V7Ability,
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
import { v7Id, v7Json, v7RoundNumber, v7Signature } from './continuous-data.js';
import { v7Reach, v7Visible } from './continuous-geometry.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import {
  foodSetQuantity,
  foodTenths,
  foodUnitMass,
} from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import { FOREST_RESOURCES } from './forest-foundation.js';
import { materialPortion } from './material-lots.js';
import { openConditions, openMaterial } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import { look as foodLook } from './long-unheated-food-preparation.js';
import {
  ex19MaterialContact,
  ex19MaterialDark,
  ex19MaterialGround,
  ex19MaterialPiece,
} from './long-ex19-material-contact.js';
import { thinSliceEdgeProblem } from './long-ex19-thin-slice-food-drying.js';
import {
  HAZELNUT_COMPOSITION,
  SAMPLE_OPENING_LAWS,
} from './long-ex20-sample-opening.js';
import type { EnclosedComposition } from './long-ex20-sample-opening.js';
import { casingResources } from './long-ex23-casing-cracking.js';

/** ex25: a general mechanical food separation trial. One bout is a paid setup round that checks
 * the food, the operation and the means and reserves the chosen portion, then a paid working
 * round. open works a represented shell in ex23's 0.1 blocks under the ex17/ex19/ex20
 * compression law, by bare hand or with an own striker on a support, and separates opened
 * blocks into kernel and shell by the ex20 composition with ex23's part materials; cut parts one
 * whole unit of food without a shell with a stone or flint edge that the ex19 contact rule
 * accepts. No separable layer is represented for any food, so peel stays refused. Nothing is
 * made safe, nothing is rewarded. */

const ID = 'mechanical-food-separation';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The open (ready or paused) work; the key is shown with the person's active work. */
const OPEN = `${ID}:work:open`;
/** The person's latest closed inspections and bouts, newest last. */
const RECORDS = `${ID}:records`;
const KEEP = 3;
/** Processing record on worked food and products; wear record on implements and supports. */
const KEY = 'foodSeparation';
const WEAR_KEY = 'foodSeparationWear';
const COMPONENT = 'mechanical-food-separation';
/** World Agent specification: study 0.2 per round, inspection 0.2, setup 0.2, working 0.5,
 * progress inspection 0.2. */
const COST = { study: 0.2, inspect: 0.2, setup: 0.2, work: 0.5, check: 0.2 };
const BOUT = COST.setup + COST.work;
const MODES = ['inspect', 'trial', 'inspect-progress', 'resume', 'cancel'];
const OPERATIONS = ['open', 'cut', 'peel'];
/** One bout works at most one unit: ten 0.1 blocks for open, one whole unit for cut. */
const BLOCKS = 10;
/** ex23 contact wear: the scratch-model dust quantum per abrading contact, the hardness margin
 * by which a harder surface marks a softer one without wearing, and contacts per block or
 * stroke (on the food, then following through onto the support). */
const ABRASION = 0.0001;
const MARGIN = 0.5;
const CONTACTS = 2;
/** The finest division of one unit a cut record represents: the engine's 0.1 quantum. */
const PORTIONS = 10;
/** Represented treatments without a separation law in this version (as ex20 and ex23). */
const TREATED = [
  'componentLots',
  'physical',
  'materialLayer',
  'frictionKit',
  'waterCup',
  'mantle',
  'fuelMoisture',
  'canopyDrying',
] as const;
const UNKNOWN = ['edibility', 'nutrition', 'toxins', 'safety'];
const { passes, handLoad, deterioration } = SAMPLE_OPENING_LAWS;
/** The published kernel bounds; no hidden material value is part of them. */
const LIMITS: V7Data = {
  bout: 'one setup round (0.2 energy) and one working round (0.5 energy); at most one unit',
  open: 'each 0.1 block of the portion gets one bare-hand squeeze or one impact (at most 10 per working round); opened blocks are picked apart by hand in the same round',
  hand: 'both hands; the bounded hand force of hand-break-food@1 spread over one represented unit',
  implement:
    'passes the lower of implement and support strength (hardness / 10) times (1 - flexibility)',
  cut: 'one stroke per working round with an edge that passes the world contact model; at most 10 portions per unit',
  wear: '0.0001 kg per abrading contact, at most 2 contacts per block or stroke on each surface',
  breakage: 'not represented: implements and supports do not fracture here',
};
const EVENTS = {
  inspected: 'food-separation-inspected',
  setup: 'food-separation-setup',
  contact: 'food-separation-contact',
  resisted: 'food-separation-resisted',
  damaged: 'food-separation-damaged',
  opened: 'food-separation-opened',
  cut: 'food-separation-cut',
  wear: 'food-separation-wear',
  completed: 'food-separation-completed',
  paused: 'food-separation-paused',
  resumed: 'food-separation-resumed',
  cancelled: 'food-separation-cancelled',
  invalidated: 'food-separation-invalidated',
  ended: 'food-separation-ended',
  checked: 'food-separation-checked',
} as const;

/** A represented shell: the ex20 composition and ex23's part materials under new ids. */
interface Casing {
  composition: EnclosedComposition;
  kernel: V7Resource;
  shell: V7Resource;
}
function casingOf(d: EnclosedComposition): Casing {
  const unit = FOREST_RESOURCES.find((r) => r.id === d.unit);
  if (!unit) throw new Error(`No represented unit material ${d.unit}.`);
  // ex23's derivation: each part's unit is that part of one whole source unit, so 0.1 of the
  // source yields exactly 0.1 of each part and mass and food value partition exactly.
  const [kernel, shell] = casingResources(d, unit);
  if (!kernel || !shell)
    throw new Error(`Invalid casing composition for ${d.unit}.`);
  return {
    composition: d,
    kernel: {
      ...kernel,
      id: `${d.unit}-freed-kernel`,
      name: `Freed ${d.contents.name.toLowerCase()}`,
    },
    shell: {
      ...shell,
      id: `${d.unit}-shell-fragments`,
      name: `Broken ${d.enclosure.name.toLowerCase()}`,
    },
  };
}
const CASINGS = [casingOf(HAZELNUT_COMPOSITION)];
const casingFor = (resource: string) =>
  CASINGS.find((x) => x.composition.unit === resource);

interface Means extends V7Data {
  kind: string;
  implement: string | null;
  implementMaterial: string | null;
  support: string | null;
  supportKind: string | null;
  supportMaterial: string | null;
}
interface Gear {
  means: Means;
  implement: V7Stack | null;
  implementResource: V7Resource | null;
  supportResource: V7Resource | null;
  supportItem: V7Stack | null;
}
type Plan =
  | { operation: 'open'; casing: Casing; food: V7Resource; damage: number }
  | { operation: 'cut'; food: V7Resource; portions: number };
interface Work extends V7Data {
  id: string;
  actor: string;
  mode: string;
  operation: string;
  status: string;
  stage: string;
  input: string;
  portion: string | null;
  resource: string;
  quantity: number;
  tenths: number;
  facts: V7Data;
  means: Means | null;
  paidEnergy: number;
  paidRounds: number;
  phases: V7Data[];
  outcome: string | null;
  outputs: string[];
  ledger: V7Data | null;
  observation: V7Data | null;
  x: number;
  y: number;
  reason: string | null;
  startedAt: number;
  lastWorked: number;
  endedAt: number | null;
}
type Say = (type: string, description: string, data: V7Data) => void;
interface Shown {
  phase: string;
  contact?: string | null;
  visible?: V7Data | null;
  products?: V7Data | null;
}

const round = (x: number) => v7RoundNumber(x);
const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
/** A sentence without its final period, for joining into a longer one. */
const clause = (s: string) => s.replace(/\.$/, '');
const hardness = (r: V7Resource | null | undefined) =>
  r?.properties?.hardness ?? 0;
const record = (value: unknown): V7Data | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as V7Data)
    : null;
const openWork = (a: V7Actor) => record(a.extensionState[OPEN]) as Work | null;
const records = (a: V7Actor): Work[] => {
  const list = a.extensionState[RECORDS];
  return Array.isArray(list) ? (list as unknown as Work[]) : [];
};
const recordOf = (s: V7Stack) => record(s.processing?.[KEY]);
const colorOf = (w: V7World, resource: string) =>
  w.resources.find((r) => r.id === resource)?.color ?? '#cfaf79';

/** The portion's material facts; age (decay), position, ownership and reservation are not
 * material changes, so they are left out. */
function factsOf(s: V7Stack): V7Data {
  const out: V7Data = {};
  for (const [k, v] of Object.entries(s) as [string, unknown][])
    if (
      ![
        'id',
        'position',
        'owner',
        'reservedFor',
        'decay',
        'quantityTenths',
      ].includes(k) &&
      v !== undefined
    )
      out[k] = v7Json(v);
  return out;
}
/** Sets this operation's record on an item, keeping no other processing key (none is allowed). */
function mark(s: V7Stack, value: V7Data) {
  s.processing = { ...(s.processing ?? {}), [KEY]: value };
}

/** What the operation can do with this item, or why it cannot. */
function planFor(w: V7World, s: V7Stack, operation: string): Plan | string {
  const food = collectiveFoodProfile(w, s);
  if (!food || food.nutrition <= 0)
    return `${s.id} is not food; this operation opens or cuts food only.`;
  if (
    TREATED.some((k) => s[k] !== undefined) ||
    Object.keys(s.processing ?? {}).some((k) => k !== KEY)
  )
    return 'Food under another represented treatment has no separation law in this version.';
  const rec = recordOf(s);
  if (rec && rec.revision !== REVISION)
    return 'This item carries another revision of this record.';
  const life = food.properties?.decay ?? 0;
  if (life > 0 && (s.decay ?? 0) >= life) return 'Spoiled food is not worked.';
  const casing = casingFor(s.resource);
  if (operation === 'peel')
    return `No separable outer layer, peel or skin is represented for ${s.resource}, so peeling it is not established in this world${casing ? '; its shell is opened with open' : ''}.`;
  if (operation === 'open') {
    if (!casing || openMaterial(food).strength <= 0)
      return `No shell or casing is represented for ${s.resource}, so open does not apply; cut can expose its interior.`;
    return { operation, casing, food, damage: Number(rec?.damage ?? 0) };
  }
  if (operation !== 'cut') return 'Give operation open, cut or peel.';
  if (casing)
    return `${s.resource} has a represented hard shell: open it first; cutting through a shell is not represented.`;
  const portions = Number(rec?.portions ?? 1);
  if (portions >= PORTIONS)
    return `${s.id} is already cut into ${String(PORTIONS)} portions, the finest division represented.`;
  return { operation, food, portions };
}

/** Tenths of a unit the bout works, or why the quantity is not supported. */
function tenthsOf(s: V7Stack, plan: Plan, quantity: unknown): number | string {
  const held = foodTenths(s.quantity);
  if (plan.operation === 'cut') {
    if (quantity !== undefined && quantity !== 1)
      return 'A cut divides exactly one whole unit: quantity is 1.';
    if (held < 10)
      return `${s.id} holds ${String(s.quantity)}, less than the one whole unit a cut divides; part of a unit has no represented shape.`;
    return 10;
  }
  if (quantity === undefined) return Math.min(BLOCKS, held);
  if (
    typeof quantity !== 'number' ||
    Math.abs(quantity * 10 - Math.round(quantity * 10)) > 1e-7
  )
    return 'quantity is given in exact tenths of a unit (0.1 blocks).';
  const n = Math.round(quantity * 10);
  if (n < 1 || n > BLOCKS) return 'One bout works 0.1 to 1 unit.';
  if (n > held)
    return `${s.id} holds ${String(s.quantity)}; ${String(n / 10)} was selected.`;
  return n;
}

/** Why an own item cannot serve as a whole, rigid, sound piece, or null (ex19/ex20/ex23). */
function pieceProblem(
  w: V7World,
  a: V7Actor,
  s: V7Stack | undefined,
): string | null {
  const problem = ex19MaterialPiece(w, a, s);
  if (problem || !s) return problem ?? 'Name one of your own carried items.';
  if (hardness(collectiveFoodProfile(w, s)) < 1)
    return `${s.id} is not rigid enough.`;
  const contact = ex19MaterialContact(w, s);
  if (contact.fractured || !contact.controlledContact)
    return `${s.id} is fractured or too small to give a sound face.`;
  return null;
}
/** The named support (ex20/ex23 rule): a solid inedible object in reach, or another own piece
 * resting on firm ground where you stand. */
function supportOf(
  w: V7World,
  a: V7Actor,
  id: string,
): { kind: string; resource: V7Resource; item: V7Stack | null } | string {
  const o = w.objects.find((x) => x.id === id);
  if (o) {
    const r = w.resources.find(
      (x) => x.id === o.data.resource && !!x.properties,
    );
    if (
      !r ||
      !o.spatial.solid ||
      o.spatial.reserved ||
      ['animal', 'plant'].includes(o.kind) ||
      r.nutrition > 0
    )
      return 'The support must be a solid, unreserved object of a represented inedible material, not a plant or an animal.';
    if (hardness(r) < 1) return 'The support is not rigid enough.';
    if (!v7Reach(a, o.spatial) || !v7Visible(w, a.position, o.spatial))
      return `Move within reach of ${o.id}.`;
    return { kind: 'object', resource: r, item: null };
  }
  const s = w.stacks.find((x) => x.id === id);
  const problem = pieceProblem(w, a, s) ?? ex19MaterialGround(w, a.position);
  if (problem || !s) return problem ?? 'The support is missing.';
  const r = collectiveFoodProfile(w, s);
  if (!r) return 'The support has no represented material.';
  return { kind: 'item', resource: r, item: s };
}
/** The means of the operation: both hands, or an own implement and a support. */
function meansOf(
  w: V7World,
  a: V7Actor,
  plan: Plan,
  food: V7Stack,
  implementId: string,
  supportId: string,
): Gear | string {
  if (plan.operation === 'open' && !implementId) {
    if (supportId)
      return 'A support alone does not open food: name implementId to strike on it, or neither for a bare-hand trial.';
    return {
      means: {
        kind: 'hand',
        implement: null,
        implementMaterial: null,
        support: null,
        supportKind: null,
        supportMaterial: null,
      },
      implement: null,
      implementResource: null,
      supportResource: null,
      supportItem: null,
    };
  }
  if (!implementId)
    return 'Cutting needs implementId: your own carried stone or flint unit with a usable edge; hands and food do not cut.';
  if (!supportId)
    return plan.operation === 'cut'
      ? 'Cutting needs supportId: a solid support to cut on.'
      : 'Striking needs supportId: a stable hard support under the food.';
  if (new Set([implementId, supportId, food.id]).size < 3)
    return 'The food, implement and support must be different.';
  const tool = w.stacks.find((s) => s.id === implementId);
  if (!tool || tool.owner !== a.id)
    return `${implementId} is not an item you carry.`;
  const problem =
    plan.operation === 'cut'
      ? thinSliceEdgeProblem(w, a, tool, food)
      : pieceProblem(w, a, tool);
  if (problem) return problem;
  const material = collectiveFoodProfile(w, tool);
  if (!material) return `${tool.id} has no represented material.`;
  const support = supportOf(w, a, supportId);
  if (typeof support === 'string') return support;
  return {
    means: {
      kind: 'implement',
      implement: tool.id,
      implementMaterial: material.id,
      support: supportId,
      supportKind: support.kind,
      supportMaterial: support.resource.id,
    },
    implement: tool,
    implementResource: material,
    supportResource: support.resource,
    supportItem: support.item,
  };
}
/** Load reaching each block; never stored or reported (it derives from hidden properties). */
function loadOf(w: V7World, g: Gear, portion: V7Stack): number {
  if (!g.implementResource || !g.supportResource)
    return handLoad(foodUnitMass(w, portion));
  return Math.min(passes(g.implementResource), passes(g.supportResource));
}

/** Visible condition of an implement: carried mass, recorded contacts and soundness. */
function condition(w: V7World, s: V7Stack): V7Data {
  const wear = record(s.processing?.[WEAR_KEY]);
  const contact = ex19MaterialContact(w, s);
  return {
    item: s.id,
    resource: s.resource,
    mass: round(foodUnitMass(w, s) * s.quantity),
    contacts: Number(wear?.contacts ?? 0),
    worn: round(Number(wear?.worn ?? 0)),
    sound: contact.controlledContact && !contact.fractured,
  };
}
/** Detaches one abrasion quantum from an inedible item's solids (ex23's scratch-rule wear) and
 * records it on the item. Returns the detached mass. */
function abrade(w: V7World, s: V7Stack): number {
  const r = w.resources.find((x) => x.id === s.resource);
  if (!r || r.nutrition > 0 || r.toxicity > 0) return 0;
  if (!s.physical) {
    const wet = r.properties?.moisture ?? 0;
    s.physical = {
      unitMass: r.mass,
      unitWater: r.mass * wet,
      unitSolids: r.mass * (1 - wet),
    };
  }
  if (s.physical.unitSolids * s.quantity < ABRASION) return 0;
  s.physical.unitSolids = round(s.physical.unitSolids - ABRASION / s.quantity);
  s.physical.unitMass = round(s.physical.unitWater + s.physical.unitSolids);
  const old = record(s.processing?.[WEAR_KEY]);
  s.processing = {
    ...(s.processing ?? {}),
    [WEAR_KEY]: {
      revision: REVISION,
      contacts: Number(old?.contacts ?? 0) + 1,
      worn: round(Number(old?.worn ?? 0) + ABRASION),
      lastTick: w.tick,
    },
  };
  return ABRASION;
}
/** Applies the contacts of one working round to the implement and an item support. */
function wear(
  w: V7World,
  g: Gear,
  implementHits: number,
  supportHits: number,
): V7Data | null {
  if (!g.implement) return null;
  let implementWorn = 0,
    supportWorn = 0;
  for (let i = 0; i < implementHits; i++)
    implementWorn += abrade(w, g.implement);
  for (let i = 0; i < supportHits; i++)
    if (g.supportItem) supportWorn += abrade(w, g.supportItem);
  return {
    implement: {
      item: g.implement.id,
      contacts: implementHits,
      mass: round(implementWorn),
    },
    support: {
      ref: g.means.support,
      kind: g.means.supportKind,
      contacts: supportHits,
      mass: round(supportWorn),
      massRepresented: !!g.supportItem,
    },
  };
}

/** Reusable drawing and observation metadata. Contact appears only when performed, products
 * only when they exist; no hidden value, no success badge. */
function view(w: V7World, j: Work, s: Shown): V7Data {
  return {
    component: COMPONENT,
    work: j.id,
    actor: j.actor,
    operation: j.operation,
    input: j.input,
    portion: j.portion,
    outputs: j.outputs,
    resource: j.resource,
    color: colorOf(w, j.resource),
    means: j.means,
    x: round(j.x),
    y: round(j.y),
    paidPhase: j.phases.at(-1)?.phase ?? null,
    phase: s.phase,
    status: j.status,
    outcome: j.outcome,
    contact: s.contact ?? null,
    visible: s.visible ?? null,
    products: s.products ?? null,
    reason: j.reason,
    badge: null,
  };
}
function summary(w: V7World, j: Work, s: Shown, extra: V7Data = {}): V7Data {
  return {
    work: j.id,
    by: j.actor,
    mode: j.mode,
    operation: j.operation,
    status: j.status,
    stage: j.stage,
    input: j.input,
    portion: j.portion,
    quantity: j.quantity,
    means: j.means,
    outcome: j.outcome,
    outputs: j.outputs,
    ledger: j.ledger,
    observation: j.observation,
    paidEnergy: j.paidEnergy,
    paidRounds: j.paidRounds,
    reason: j.reason,
    view: view(w, j, s),
    ...extra,
  };
}
function file(a: V7Actor, j: Work) {
  a.extensionState[RECORDS] = [...records(a), j].slice(-KEEP);
}
function close(w: V7World, a: V7Actor, j: Work, status: string, why: string) {
  j.status = status;
  j.reason = why;
  j.endedAt = w.tick;
  if (openWork(a)?.id === j.id)
    delete a.extensionState['mechanical-food-separation:work:open'];
  file(a, j);
}
/** Releases the portion reserved for the work, once; it stays carried as it now is. */
function release(w: V7World, j: Work): boolean {
  const s = w.stacks.find((x) => x.id === j.portion && x.reservedFor === j.id);
  if (!s) return false;
  delete s.reservedFor;
  return true;
}
function pause(w: V7World, j: Work, why: string, say: Say) {
  j.status = 'paused';
  j.reason = why;
  say(
    EVENTS.paused,
    `Separation work ${j.id} paused before the working round: ${clause(why)}. ${j.portion ?? j.input} stays carried and reserved; nothing was charged. resume rechecks and continues; cancel ends it.`,
    summary(w, j, { phase: 'paused' }),
  );
}
function invalidate(w: V7World, a: V7Actor, j: Work, why: string, say: Say) {
  const released = release(w, j);
  close(w, a, j, 'invalidated', why);
  say(
    EVENTS.invalidated,
    `Separation work ${j.id} cannot continue: ${clause(why)}. ${released ? `${j.portion ?? ''} is free again as it now is` : 'No reserved portion was left'}; nothing is refunded.`,
    summary(w, j, { phase: 'invalidated' }, { released }),
  );
}
/** A changed or missing portion ends the work; null while it is the same reserved portion. */
function changeOf(
  a: V7Actor,
  j: Work,
  portion: V7Stack | undefined,
): string | null {
  if (!portion || portion.owner !== a.id || portion.reservedFor !== j.id)
    return 'the reserved portion is no longer carried and reserved for this work';
  if (v7Signature(factsOf(portion)) !== v7Signature(j.facts))
    return 'the reserved portion changed since the setup';
  return null;
}

/** The own, unreserved item named by inputStackId. */
function ownedInput(c: V7ActionContext): V7Stack {
  const id = text(c.action.args.inputStackId);
  if (!id)
    throw nothing(
      'Name one of your own items by its exact item id in inputStackId.',
    );
  const s = c.world.stacks.find((x) => x.id === id);
  if (!s || s.owner !== c.actor.id)
    throw nothing(`${id} is not an item you carry.`);
  if (s.reservedFor) throw nothing(`${s.id} is reserved for unfinished work.`);
  return s;
}
function newWork(c: V7ActionContext, mode: string, s: V7Stack): Work {
  const { world: w, actor: a } = c;
  return {
    id: v7Id(w, 'separation'),
    actor: a.id,
    mode,
    operation: text(c.action.args.operation) || 'any',
    status: 'inspected',
    stage: 'inspection',
    input: s.id,
    portion: null,
    resource: s.resource,
    quantity: 0,
    tenths: 0,
    facts: {},
    means: null,
    paidEnergy: 0,
    paidRounds: 0,
    phases: [],
    outcome: null,
    outputs: [],
    ledger: null,
    observation: null,
    x: a.position.x,
    y: a.position.y,
    reason: null,
    startedAt: w.tick,
    lastWorked: w.tick,
    endedAt: null,
  };
}
/** The exact portion for the work: the item itself when the whole item is selected, else exact
 * tenths split from it with every other field kept (as collective-work reserves). */
function reserve(w: V7World, s: V7Stack, n: number, workId: string): V7Stack {
  if (foodTenths(s.quantity) === n) {
    s.reservedFor = workId;
    return s;
  }
  const part: V7Stack = {
    ...materialPortion(s, n),
    id: v7Id(w, 'item'),
    quantity: n / 10,
    quantityTenths: n,
    reservedFor: workId,
  };
  foodSetQuantity(s, foodTenths(s.quantity) - n);
  w.stacks.push(part);
  return part;
}

/** The paid inspection's findings: live condition, represented structure, each operation's
 * applicability, means and unmet needs, and the published limits. */
function assess(c: V7ActionContext, s: V7Stack): V7Data {
  const { world: w, actor: a, action } = c;
  const named = text(action.args.operation);
  const rec = recordOf(s);
  const casing = casingFor(s.resource);
  const options = (named ? [named] : OPERATIONS).map((operation): V7Data => {
    const plan = planFor(w, s, operation);
    if (typeof plan === 'string')
      return { operation, supported: false, unmet: [plan], ready: false };
    const unmet: string[] = [];
    const n = tenthsOf(s, plan, action.args.quantity);
    if (typeof n === 'string') unmet.push(n);
    const g = meansOf(
      w,
      a,
      plan,
      s,
      text(action.args.implementId),
      text(action.args.supportId),
    );
    if (typeof g === 'string') unmet.push(g);
    if (a.vitals.energy + 1e-8 < BOUT)
      unmet.push(
        `energy ${shown(a.vitals.energy)} is below the ${String(BOUT)} a bout needs`,
      );
    const tool = typeof g === 'string' ? null : g.implement;
    return {
      operation,
      supported: true,
      quantity: typeof n === 'number' ? n / 10 : null,
      means: typeof g === 'string' ? null : g.means,
      implement: tool ? condition(w, tool) : null,
      bout: { rounds: 2, energy: BOUT },
      unmet,
      ready: !unmet.length,
    };
  });
  return {
    item: foodLook(w, s),
    structure: {
      shell: casing
        ? 'represented: a hard shell around loose kernels, worked in 0.1 blocks'
        : 'not represented',
      separableLayer: 'not represented',
      shape: 'not represented',
      crack: casing ? round(Math.min(1, Number(rec?.damage ?? 0))) : null,
      portions: casing ? null : Number(rec?.portions ?? 1),
      interior: 'not visible',
    },
    options,
    limits: LIMITS,
    unknown: UNKNOWN,
  };
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const s = ownedInput(c);
  if (a.vitals.energy + 1e-8 < COST.inspect)
    throw nothing(
      `Not enough energy: inspecting needs ${String(COST.inspect)}, you have ${shown(a.vitals.energy)}.`,
    );
  v7Spend(a, COST.inspect);
  const f = assess(c, s);
  const options = (f.options ?? []) as V7Data[];
  const j = newWork(c, 'inspect', s);
  j.paidEnergy = COST.inspect;
  j.paidRounds = 1;
  j.phases = [{ phase: 'inspection', tick: w.tick, energy: COST.inspect }];
  const status = options.some((o) => o.ready === true)
    ? 'inspected'
    : options.some((o) => o.supported === true)
      ? 'infeasible'
      : 'unsupported';
  j.outcome = status;
  close(
    w,
    a,
    j,
    status,
    options
      .map(
        (o) =>
          `${text(o.operation)}: ${o.ready === true ? 'ready' : (o.unmet as string[]).map(clause).join('; ')}`,
      )
      .join(' | '),
  );
  c.emit(
    EVENTS.inspected,
    `Inspected ${s.id} (${s.resource}, ${String(s.quantity)}) for ${String(COST.inspect)} energy; nothing was reserved or used. ${j.reason ?? ''}`,
    summary(w, j, { phase: 'inspection' }, { findings: f }),
    s.id,
  );
  return { complete: true, remaining: 0, writes: [j.id] };
}

/** Round 1 of a bout: checks, the paid setup and the reservation; or the continuing round 2. */
function trial(c: V7ActionContext, open: Work | null): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  if (open) {
    if (
      open.status === 'ready' &&
      open.lastWorked === w.tick - 1 &&
      c.operation?.first === false &&
      action.args.inputStackId === open.input &&
      action.args.operation === open.operation
    )
      return work(c, open, false);
    throw nothing(
      `Your separation work ${open.id} is ${open.status} after its paid setup; give resume for the working round, inspect-progress to check it, or cancel to end it.`,
    );
  }
  const s = ownedInput(c);
  const operation = text(action.args.operation);
  if (!operation) throw nothing('Give operation open, cut or peel.');
  const plan = planFor(w, s, operation);
  if (typeof plan === 'string') throw nothing(plan);
  const n = tenthsOf(s, plan, action.args.quantity);
  if (typeof n === 'string') throw nothing(n);
  const g = meansOf(
    w,
    a,
    plan,
    s,
    text(action.args.implementId),
    text(action.args.supportId),
  );
  if (typeof g === 'string') throw nothing(g);
  if (a.vitals.energy + 1e-8 < BOUT)
    throw nothing(
      `Not enough energy: a bout needs ${String(BOUT)} (setup ${String(COST.setup)}, working round ${String(COST.work)}), you have ${shown(a.vitals.energy)}.`,
    );
  v7Spend(a, COST.setup);
  const j = newWork(c, 'trial', s);
  const portion = reserve(w, s, n, j.id);
  Object.assign(j, {
    status: 'ready',
    stage: 'setup',
    portion: portion.id,
    quantity: n / 10,
    tenths: n,
    facts: factsOf(portion),
    means: g.means,
    paidEnergy: COST.setup,
    paidRounds: 1,
    phases: [{ phase: 'setup', tick: w.tick, energy: COST.setup }],
  });
  a.extensionState[OPEN] = j;
  const blocks = plan.operation === 'open' ? n : 1;
  const quote: V7Data = {
    operation,
    quantity: n / 10,
    blocks: plan.operation === 'open' ? n : null,
    strokes: plan.operation === 'cut' ? 1 : null,
    rounds: 2,
    energy: BOUT,
    setupEnergy: COST.setup,
    workEnergy: COST.work,
    wearBound:
      g.means.kind === 'hand'
        ? null
        : {
            perContact: ABRASION,
            implement: round(CONTACTS * blocks * ABRASION),
            support: round(CONTACTS * blocks * ABRASION),
          },
    breakage: 'not represented',
    implement: g.implement ? condition(w, g.implement) : null,
    limits: LIMITS,
    unknown: UNKNOWN,
  };
  c.emit(
    EVENTS.setup,
    `Setup of ${operation} for ${String(COST.setup)} energy: ${portion.id === s.id ? `${s.id} (${String(n / 10)} ${s.resource})` : `${String(n / 10)} of ${s.id} as ${portion.id}`} is reserved, still carried, ${g.means.kind === 'hand' ? 'held in both hands' : `set on ${String(g.means.support)} with ${String(g.means.implement)} in hand`}. The next round of the same action is the working round for ${String(COST.work)} energy.`,
    summary(w, j, { phase: 'setup' }, { quote }),
    portion.id,
  );
  return {
    complete: false,
    remaining: 1,
    writes: [...new Set([j.id, s.id, portion.id])],
  };
}

/** Round 2: fresh checks, then the paid working round; or a free pause or an invalidation. */
function work(c: V7ActionContext, j: Work, resumed: boolean): V7HandlerResult {
  const { world: w, actor: a } = c;
  const say: Say = (type, description, data) => {
    c.emit(type, description, data, j.id);
  };
  const portion = w.stacks.find((s) => s.id === j.portion);
  const change = changeOf(a, j, portion);
  const plan = portion && !change ? planFor(w, portion, j.operation) : null;
  if (change || !portion || !plan || typeof plan === 'string') {
    invalidate(
      w,
      a,
      j,
      change ?? (typeof plan === 'string' ? plan : 'the portion is gone'),
      say,
    );
    return { complete: true, remaining: 0, writes: [j.id] };
  }
  const g = meansOf(
    w,
    a,
    plan,
    portion,
    j.means?.implement ?? '',
    j.means?.support ?? '',
  );
  const problems = [
    ...(typeof g === 'string' ? [g] : []),
    ...(a.vitals.energy + 1e-8 < COST.work
      ? [
          `not enough energy: ${shown(a.vitals.energy)} of the ${String(COST.work)} the working round needs`,
        ]
      : []),
  ];
  if (problems.length || typeof g === 'string') {
    if (resumed)
      throw nothing(
        `You cannot resume now: ${problems.map(clause).join('; ')}.`,
      );
    pause(w, j, problems.map(clause).join('; '), say);
    return { complete: true, remaining: 0, writes: [j.id] };
  }
  const wasPaused = j.status === 'paused';
  v7Spend(a, COST.work);
  j.status = 'ready';
  j.stage = 'working';
  j.paidEnergy = round(j.paidEnergy + COST.work);
  j.paidRounds += 1;
  j.lastWorked = w.tick;
  j.x = a.position.x;
  j.y = a.position.y;
  j.phases = [
    ...j.phases,
    { phase: 'working', tick: w.tick, energy: COST.work },
  ];
  if (resumed || wasPaused)
    say(
      EVENTS.resumed,
      `Separation work ${j.id} resumed after rechecking the portion, its recorded damage, the means and energy.`,
      summary(w, j, { phase: 'resumed' }),
    );
  return plan.operation === 'open'
    ? openRound(c, j, plan, g, portion)
    : cutRound(c, j, plan, g, portion);
}

/** The working round of open: one squeeze or impact per 0.1 block under the compression law,
 * then hand separation of opened blocks into kernel and shell by the ex20 composition. */
function openRound(
  c: V7ActionContext,
  j: Work,
  plan: Extract<Plan, { operation: 'open' }>,
  g: Gear,
  portion: V7Stack,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  const n = j.tenths,
    hand = g.means.kind === 'hand',
    d = plan.casing.composition;
  const strength = openMaterial(plan.food).strength;
  const load = loadOf(w, g, portion);
  // ex17/ex19/ex20 damage law: nothing at or below the strength, else (load - strength) / strength.
  const added = load <= strength ? 0 : round((load - strength) / strength);
  const damage = round(plan.damage + added);
  const outcome = added === 0 ? 'resisted' : damage >= 1 ? 'opened' : 'damaged';
  // ex23 contact rules per impact: a striker no harder than what it strikes sheds a quantum; a
  // support softer by the margin than what presses on it does; after a fracture the striker
  // follows through onto the support.
  const hi = hardness(g.implementResource),
    hk = hardness(plan.food),
    hp = hardness(g.supportResource);
  const through = outcome === 'opened';
  const worn = hand
    ? null
    : wear(
        w,
        g,
        n * ((hi <= hk ? 1 : 0) + (through && hi <= hp ? 1 : 0)),
        n *
          ((hk - hp >= MARGIN ? 1 : 0) +
            (through && hi - hp >= MARGIN ? 1 : 0)),
      );
  const unitMass = foodUnitMass(w, portion);
  const inputMass = round((unitMass * n) / 10);
  const life = plan.food.properties?.decay ?? 0;
  const interior = !through
    ? 'not visible'
    : ex19MaterialDark(w, a)
      ? 'not seen in this light'
      : deterioration(life > 0 ? Math.min(1, (portion.decay ?? 0) / life) : 0);
  const input = { item: portion.id, resource: portion.resource };
  let products: V7Data | null = null,
    returned: V7Data | null = null;
  if (through) {
    const part = (name: string): V7Data => ({
      version: 1,
      revision: REVISION,
      work: j.id,
      parent: j.input,
      part: name,
      separatedAt: w.tick,
      treatment: 'none: not washed, heated or made safe',
    });
    const make = (resource: V7Resource, name: string): V7Stack => {
      const s: V7Stack = {
        id: v7Id(w, 'item'),
        resource: resource.id,
        quantity: n / 10,
        quantityTenths: n,
        position: { ...a.position },
        owner: a.id,
        origin: portion.origin,
        ...(portion.harvestedAt === undefined
          ? {}
          : { harvestedAt: portion.harvestedAt }),
        decay: portion.decay ?? 0,
        processing: { [KEY]: part(name) },
      };
      w.stacks.push(s);
      return s;
    };
    const kernelItem = make(plan.casing.kernel, 'kernel');
    const shellItem = make(plan.casing.shell, 'shell');
    w.stacks = w.stacks.filter((s) => s.id !== portion.id);
    j.outputs = [kernelItem.id, shellItem.id];
    products = {
      kernel: {
        item: kernelItem.id,
        resource: kernelItem.resource,
        quantity: kernelItem.quantity,
        mass: round((plan.casing.kernel.mass * n) / 10),
      },
      shell: {
        item: shellItem.id,
        resource: shellItem.resource,
        quantity: shellItem.quantity,
        mass: round((plan.casing.shell.mass * n) / 10),
      },
    };
  } else {
    if (outcome === 'damaged')
      mark(portion, {
        ...(recordOf(portion) ?? {}),
        version: 1,
        revision: REVISION,
        work: j.id,
        part: 'closed shell',
        damage,
        crack: round(Math.min(1, damage)),
      });
    delete portion.reservedFor;
    portion.position = { ...a.position };
    j.outputs = [portion.id];
    returned = {
      item: portion.id,
      quantity: portion.quantity,
      mass: inputMass,
    };
  }
  const outMass =
    Number(record(products?.kernel)?.mass ?? 0) +
    Number(record(products?.shell)?.mass ?? 0) +
    Number(returned?.mass ?? 0);
  j.ledger = {
    quantum: 0.1,
    input: { ...input, quantity: n / 10, mass: inputMass, blocks: n },
    returned,
    kernel: products?.kernel ?? null,
    shell: products?.shell ?? null,
    debris: { quantity: 0, mass: 0 },
    conversion: through
      ? `each 0.1 block of ${d.unit} became 0.1 ${plan.casing.kernel.id} and 0.1 ${plan.casing.shell.id}`
      : 'none: nothing was separated',
    wear: worn,
    balanced: Math.abs(outMass - inputMass) < 1e-7,
  };
  const shell =
    outcome === 'resisted'
      ? 'no visible change'
      : outcome === 'damaged'
        ? 'cracked, still closed'
        : 'split open and picked apart by hand';
  const crack = round(
    Math.min(1, outcome === 'resisted' ? plan.damage : damage),
  );
  j.observation = {
    shell,
    crack,
    interior,
    kernelColor: through ? d.contents.color : null,
    kernelTexture: through ? d.contents.texture : null,
    unknown: UNKNOWN,
  };
  j.outcome = outcome;
  const contact = hand
    ? 'squeezing each 0.1 block between both hands'
    : `striking each 0.1 block on ${String(g.means.support)} with ${String(g.means.implement)}`;
  const visible = { shell, crack, interior };
  report(
    c,
    j,
    EVENTS.contact,
    `Working round of ${j.id} for ${String(COST.work)} energy: ${contact}, ${String(n)} block(s) of ${portion.id}.`,
    { phase: 'contact', contact, visible: null },
  );
  report(
    c,
    j,
    EVENTS[outcome],
    outcome === 'resisted'
      ? `The shell of ${portion.id} held: no visible change; nothing was opened. Identical bouts with the same means would not change it.`
      : outcome === 'damaged'
        ? `The shell of ${portion.id} cracked but stayed closed; the interior is not visible. The crack stays on ${portion.id}.`
        : `The shell split open and the kernels were picked from the shell pieces by hand: ${String(n / 10)} ${plan.casing.kernel.id} and ${String(n / 10)} ${plan.casing.shell.id}, with the source origin, age and decay. ${UNKNOWN.join(', ')} are not established.`,
    { phase: 'contact', contact, visible, products },
  );
  if (worn) wearNote(c, j, g, worn, { phase: 'contact', contact, visible });
  openRemember(c, {
    key: `${plan.food.id}:separation-response:${hand ? 'hand' : `${String(g.means.implementMaterial)}-on-${String(g.means.supportMaterial)}`}:${outcome}`,
    subject: plan.food.id,
    property: 'shell response of 0.1 blocks to one bout of separation',
    value: {
      item: j.input,
      means: hand
        ? 'bare hands'
        : `${String(g.means.implement)} on ${String(g.means.support)}`,
      outcome,
      shell,
      crack,
      interior,
    },
    method: hand
      ? 'one bare-hand squeeze per 0.1 block, then a direct look'
      : 'one controlled impact per 0.1 block on a support, then a direct look',
    condition: `${openConditions(w, a.position).regime}; one bout; not a safety test`,
    verified: false,
  });
  return finish(c, j, [
    ...j.outputs,
    ...(g.implement ? [g.implement.id] : []),
    ...(g.supportItem ? [g.supportItem.id] : []),
  ]);
}

/** The working round of cut: one edge stroke through one whole unit on the support. The unit
 * stays one unit of the same food (ex19: cutting keeps mass, food value and age; no offcut). */
function cutRound(
  c: V7ActionContext,
  j: Work,
  plan: Extract<Plan, { operation: 'cut' }>,
  g: Gear,
  portion: V7Stack,
): V7HandlerResult {
  const { world: w, actor: a } = c;
  const portions = plan.portions + 1;
  const hi = hardness(g.implementResource),
    hf = hardness(plan.food),
    hp = hardness(g.supportResource);
  // The edge meets the food, then follows through onto the support (ex23 contact rules).
  const worn = wear(
    w,
    g,
    (hi <= hf ? 1 : 0) + (hi <= hp ? 1 : 0),
    (hf - hp >= MARGIN ? 1 : 0) + (hi - hp >= MARGIN ? 1 : 0),
  );
  mark(portion, {
    ...(recordOf(portion) ?? {}),
    version: 1,
    revision: REVISION,
    work: j.id,
    parent: j.input,
    form: 'cut',
    portions,
    cutSurfaces: 2 * (portions - 1),
    cutAt: w.tick,
    treatment: 'none: not washed, heated or made safe',
  });
  delete portion.reservedFor;
  portion.position = { ...a.position };
  j.outputs = [portion.id];
  const mass = round(foodUnitMass(w, portion) * portion.quantity);
  const life = plan.food.properties?.decay ?? 0;
  const interior = ex19MaterialDark(w, a)
    ? 'not seen in this light'
    : deterioration(life > 0 ? Math.min(1, (portion.decay ?? 0) / life) : 0);
  const products = {
    cut: {
      item: portion.id,
      resource: portion.resource,
      quantity: portion.quantity,
      portions,
      exposedSurfaces: 2 * (portions - 1),
    },
  };
  j.ledger = {
    quantum: 0.1,
    input: {
      item: portion.id,
      resource: portion.resource,
      quantity: 1,
      mass,
    },
    cutUnit: { ...products.cut, mass },
    offcut: { quantity: 0, mass: 0 },
    debris: { quantity: 0, mass: 0 },
    conversion: `one whole ${portion.resource} unit, now in ${String(portions)} portions, still one unit`,
    wear: worn,
    balanced: true,
  };
  const visible = {
    cut: 'cut through',
    portions,
    surface: colorOf(w, portion.resource),
    interior,
  };
  j.observation = {
    ...visible,
    layers: 'not represented',
    unknown: UNKNOWN,
  };
  j.outcome = 'cut';
  const contact = `one stroke of the edge of ${String(g.means.implement)} through ${portion.id} on ${String(g.means.support)}`;
  report(
    c,
    j,
    EVENTS.contact,
    `Working round of ${j.id} for ${String(COST.work)} energy: ${contact}.`,
    { phase: 'contact', contact, visible: null },
  );
  report(
    c,
    j,
    EVENTS.cut,
    `${portion.id} was cut through: ${String(portions)} portions lying together as one unit of ${portion.resource}, with its mass, food value, origin, age and decay unchanged; no offcut. On the cut surfaces: ${interior}. ${UNKNOWN.join(', ')} are not established.`,
    { phase: 'contact', contact, visible, products },
  );
  if (worn) wearNote(c, j, g, worn, { phase: 'contact', contact, visible });
  openRemember(c, {
    key: `${plan.food.id}:cut-response:${String(g.means.implementMaterial)}-on-${String(g.means.supportMaterial)}`,
    subject: plan.food.id,
    property: 'response of one whole unit to one edge stroke',
    value: { item: portion.id, portions, interior },
    method:
      'one stroke of a hand-held edge through the unit on a support, then a direct look',
    condition: `${openConditions(w, a.position).regime}; one bout; not a safety test`,
    verified: false,
  });
  return finish(c, j, [
    portion.id,
    ...(g.implement ? [g.implement.id] : []),
    ...(g.supportItem ? [g.supportItem.id] : []),
  ]);
}

/** The wear event of a working round with at least one contact. */
function wearNote(
  c: V7ActionContext,
  j: Work,
  g: Gear,
  worn: V7Data,
  s: Shown,
) {
  const tool = record(worn.implement),
    rest = record(worn.support);
  const hits = Number(tool?.contacts ?? 0),
    marks = Number(rest?.contacts ?? 0);
  if (!hits && !marks) return;
  report(
    c,
    j,
    EVENTS.wear,
    `Contact wear: ${String(g.means.implement)} ${hits ? `lost ${shown(Number(tool?.mass ?? 0) * 1000)} g over ${String(hits)} contact(s)` : 'shows no wear'}; ${String(g.means.support)} ${!marks ? 'shows no wear' : g.supportItem ? `lost ${shown(Number(rest?.mass ?? 0) * 1000)} g over ${String(marks)} contact(s)` : `was marked by ${String(marks)} contact(s); its mass is not represented`}.`,
    s,
    { implement: g.implement ? condition(c.world, g.implement) : null },
  );
}
function report(
  c: V7ActionContext,
  j: Work,
  type: string,
  description: string,
  s: Shown,
  extra: V7Data = {},
) {
  c.emit(type, description, summary(c.world, j, s, extra), j.id);
}
/** Closes a worked bout; every product and returned portion is already the person's. */
function finish(
  c: V7ActionContext,
  j: Work,
  writes: string[],
): V7HandlerResult {
  const { world: w, actor: a } = c;
  j.stage = 'done';
  close(
    w,
    a,
    j,
    'completed',
    j.outcome === 'resisted'
      ? 'The bout was performed and the food resisted it; nothing changed.'
      : j.outcome === 'damaged'
        ? 'The bout was performed; the food is damaged but not separated.'
        : 'The bout was performed and its products are yours.',
  );
  c.emit(
    EVENTS.completed,
    `Separation bout ${j.id} ended (${String(j.outcome)}) after ${String(j.paidRounds)} paid rounds and ${String(j.paidEnergy)} energy; nothing is refunded, made safe or eaten.`,
    summary(w, j, { phase: 'completed' }),
    j.id,
  );
  return {
    complete: true,
    remaining: 0,
    writes: [...new Set([j.id, ...writes])],
  };
}

function resume(c: V7ActionContext, open: Work | null): V7HandlerResult {
  if (!open)
    throw nothing(
      'There is no open separation work to resume; start one with trial.',
    );
  return work(c, open, true);
}
function cancel(c: V7ActionContext, open: Work | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (!open)
    throw nothing(
      'There is no open separation work to cancel; completed products stay yours.',
    );
  const released = release(w, open);
  close(w, a, open, 'cancelled', 'Cancelled on request.');
  c.emit(
    EVENTS.cancelled,
    `Cancelled separation work ${open.id}: ${released ? `${open.portion ?? ''} stays in your inventory as it now is and is free again` : 'no reserved portion was left'}; the ${String(open.paidEnergy)} energy already paid is not refunded.`,
    summary(w, open, { phase: 'cancelled' }, { released }),
    open.id,
  );
  return { complete: true, remaining: 0, writes: [open.id] };
}
/** Facts of the open or latest work: live checks for open work, held outputs for closed work. */
function current(w: V7World, a: V7Actor, j: Work): V7Data {
  if (j.status === 'ready' || j.status === 'paused') {
    const portion = w.stacks.find((s) => s.id === j.portion);
    const change = changeOf(a, j, portion);
    const plan = portion && !change ? planFor(w, portion, j.operation) : null;
    const g =
      portion && plan && typeof plan !== 'string'
        ? meansOf(
            w,
            a,
            plan,
            portion,
            j.means?.implement ?? '',
            j.means?.support ?? '',
          )
        : null;
    return {
      portionCarried: !!portion && portion.owner === a.id,
      portionReserved: portion?.reservedFor === j.id,
      materialChange: change ?? (typeof plan === 'string' ? plan : null),
      liveProblems: [
        ...(typeof g === 'string' ? [g] : []),
        ...(a.vitals.energy + 1e-8 < COST.work
          ? [`energy below the ${String(COST.work)} the working round needs`]
          : []),
      ],
      workEnergy: COST.work,
    };
  }
  return {
    outputs: j.outputs.map((id) => {
      const s = w.stacks.find((x) => x.id === id);
      return {
        item: id,
        held: !!s && s.owner === a.id,
        quantity: s?.quantity ?? 0,
      };
    }),
  };
}
function check(c: V7ActionContext, open: Work | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  const j = open ?? records(a).at(-1) ?? null;
  if (!j) throw nothing('There is no separation work or inspection to report.');
  if (a.vitals.energy + 1e-8 < COST.check)
    throw nothing(
      `Not enough energy: checking needs ${String(COST.check)}, you have ${shown(a.vitals.energy)}.`,
    );
  v7Spend(a, COST.check);
  c.emit(
    EVENTS.checked,
    `Checked separation work ${j.id} for ${String(COST.check)} energy: ${j.status}${j.reason ? ` (${j.reason})` : ''}; ${String(j.paidEnergy)} energy paid over ${String(j.paidRounds)} round(s).`,
    summary(
      w,
      j,
      { phase: 'checked' },
      { current: current(w, a, j), checkEnergy: COST.check },
    ),
    j.id,
  );
  return { complete: true, remaining: 0, writes: [j.id] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  if (c.actor.vitals.health <= 0)
    throw nothing('Only a living person can work.');
  const mode = text(c.action.args.mode);
  const open = openWork(c.actor);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial') return trial(c, open);
  if (mode === 'inspect-progress') return check(c, open);
  if (mode === 'resume') return resume(c, open);
  if (mode === 'cancel') return cancel(c, open);
  throw nothing(`Give mode ${MODES.join(', ')}.`);
}

/** After the round: a missing or changed portion ends the work; set-up work whose round went to
 * something else pauses without charge; the reserved portion stays with its carrier. */
function environment(w: V7World) {
  for (const a of w.actors) {
    if (a.vitals.health <= 0) continue;
    const j = openWork(a);
    if (!j) continue;
    const say: Say = (type, description, data) => {
      forestEvent(w, type, description, a.position, a.id, data, j.id);
    };
    const portion = w.stacks.find((s) => s.id === j.portion);
    const change = changeOf(a, j, portion);
    if (change || !portion) {
      invalidate(w, a, j, change ?? 'the portion is gone', say);
      continue;
    }
    portion.position = { ...a.position };
    if (j.status === 'ready' && j.lastWorked < w.tick)
      pause(
        w,
        j,
        'this round did not do the working round: another action, a refused action or no action took it',
        say,
      );
  }
}
/** Death ends open work and releases the portion once; the death rules then handle it with the
 * rest of what the person carried. Products stay under the ordinary rules. */
function onDeath(w: V7World, a: V7Actor) {
  const j = openWork(a);
  if (!j) return;
  const released = release(w, j);
  close(
    w,
    a,
    j,
    'ended',
    'Died before the working round: the work ended and the portion is handled with the rest of what was carried.',
  );
  forestEvent(
    w,
    EVENTS.ended,
    `Separation work ${j.id} ended by death; nothing is refunded.`,
    a.position,
    a.id,
    summary(w, j, { phase: 'ended' }, { released }),
    j.id,
  );
}

const ABILITY: V7Ability = {
  id: ID,
  name: 'Mechanical food separation',
  function:
    'Open or cut your own food by hand or with your own stone where the represented material allows: open a hard shell in 0.1 blocks bare-handed or struck on a support, or cut a whole unit with a stone or flint edge on a support.',
  equivalence: 'food:mechanical-separation:open-cut-bout:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: MODES },
      operation: { type: 'string', enum: OPERATIONS },
      inputStackId: { type: 'string' },
      quantity: { type: 'number', minimum: 0.1, maximum: 1 },
      implementId: { type: 'string' },
      supportId: { type: 'string' },
    }),
    required: ['mode'],
  },
  references: {
    inputStackId: 'optional-exact-visible',
    implementId: 'optional-exact-visible',
    supportId: 'optional-exact-visible',
  },
  prerequisites: [],
  learning: 3,
  learningEnergy: COST.study,
  costs:
    'Study: 3 rounds, 0.2 energy each. inspect: inputStackId (your own item), optional operation, quantity, implementId, supportId; 1 round, 0.2 energy, no food used; reports condition, structure, means, limits and unmet needs. trial: the same fields; round 1 is the setup (0.2) and reserves the portion, round 2 of the same action the working round (0.5): 0.7 energy a bout. open: quantity 0.1-1 in tenths (default the item, up to 1); cut: quantity 1. inspect-progress: 1 round, 0.2. resume does the unpaid working round after fresh checks; cancel: 1 round, no energy. Refusals cost nothing; getting a stone and travel are separate actions.',
  effects:
    'open needs a represented shell (here hazelnut); each 0.1 block gets one squeeze or impact. Bare hands press with the bounded hand force of hand-break-food@1 over one unit; an implement (own whole rigid inedible piece) struck on a support (solid inedible object in reach, not a plant or animal, or another own piece on firm ground) passes the lower of their strengths (hardness / 10) x (1 - flexibility). At or below the shell strength nothing changes; above it damage (load - strength) / strength stays on the item: below 1 cracked and closed, at 1 open, then picked apart by hand into 0.1 kernel and 0.1 shell per block with the source origin, age and decay; the kernel keeps all food value; shell is not food. cut: a whole unit without a shell, an own stone or flint edge passing the world contact model (index 8+ and at least the food, radius 0.0002 or less, sound) and a support; one stroke parts it once more (up to 10 portions), still one unit with mass, food value and age unchanged, eaten whole; no offcut. peel is refused: no separable layer is represented. Wear: an implement no harder than what it meets, or a support softer by 0.5, loses 0.0001 kg per contact (2 at most per block or stroke); nothing breaks. Another action, lost reach or means or low energy pause before the working round; a changed portion ends the work; cancel or death releases it once. Safety, toxins and nutrition stay unknown; no refund or reward.',
  handler: HANDLER,
  revision: REVISION,
  authored: false,
  // The completion event never carries a qualified flag: a bout earns no practice milestone.
  practiceEvidence: EVENTS.completed,
  dependencies: { abilities: [], resources: [], knowledge: [] },
  execution: {
    duration: null,
    interruption: 'cancel',
    progress:
      'trial pays the setup in its first round and the working round in the next round of the same action; resume does a paused working round.',
  },
};

/** ex25: Lin's request for a hands-on opening, peeling or cutting trial of owned roots and
 * hazelnuts. */
export const LONG_EX25_FOOD_SEPARATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex25',
  dependencies: ['foundation-open@1'],
  description:
    'A general mechanical food separation trial: a paid setup that reserves an exact portion of owned food, then one paid working round that opens a represented shell in 0.1 blocks by hand or with an own striker on a support, or cuts one whole unit with a stone or flint edge on a support, with conserved products, a material and wear ledger, pause, resume, cancel, invalidation and death handling. Peeling is refused: no separable layer is represented. No reward.',
  reuse: {
    experiment:
      'ex23 crack-and-separate-casing@1 (0.1 blocks for fractional stacks, part materials per whole unit, damage law, contact wear); ex20 open-and-separate-sample@1 (hazelnut composition, transmission, bare-hand load and deterioration classes); ex19 thin-slice-food-drying-trial@1 and cutting-edge-assessment@1 (stone or flint edge rule; cutting keeps mass and food value, no offcut); ex19 shell-compression-opening@1 piece, contact, ground and light checks; ex17 mechanical-food-handling@1 (strength hardness / 10, harder food needs an implement); ex18 unheated-food-preparation@1 (look: live visible condition); comparison only, not used as a fracture law: probe press (handler open.probe, foundation-open@1)',
    source:
      'long-ex23-casing-cracking.ts (casingResources); long-ex20-sample-opening.ts (HAZELNUT_COMPOSITION, SAMPLE_OPENING_LAWS); long-ex19-thin-slice-food-drying.ts (thinSliceEdgeProblem); long-ex19-material-contact.ts; long-unheated-food-preparation.ts (look); open-physical.ts (openMaterial); open-foundation.ts (openRemember); material-lots.ts and forest-food-accounting.ts (exact tenths split); collective-food-profile.ts; continuous-geometry.ts; forest-climate.ts',
    description:
      'Code reuse only; every earlier package is unchanged and no ability, item or mastery is inherited. New: the two-round bout, the open, cut and peel applicability, cut portions kept as one unit, part materials under new ids, the wear and product ledger, pause, resume, cancel, invalidation and death handling, and view metadata.',
  },
  abilities: [ABILITY],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: Object.values(EVENTS),
  resources: CASINGS.flatMap((x) => [x.kernel, x.shell]),
  satisfaction: [],
  afterEnvironment: environment,
  onDeath,
};
