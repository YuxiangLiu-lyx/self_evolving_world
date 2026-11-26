import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Json, v7RoundNumber, v7String } from './continuous-data.js';
import { v7Reach, v7Visible } from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
import { foodUnitMass } from './forest-food-accounting.js';
import {
  forestReferenceSpelling,
  forestResolveReference,
} from './forest-references.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { openConditions, openMaterial } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workFind,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';

const ID = 'mechanical-food-handling';
const REVISION = `${ID}@1`;
const HANDLER = 'long.mechanical-food-handling';
const STATE = `long:work:${ID}`;
/** Energy of one examination and of one performed opening round (World Agent specification). */
const EXAMINE = 0.2;
const ROUND = 0.5;
/** examine-food@1 (open-food-examination.ts): food above this hardness index needs a hard
 * implement, so bare hands open only softer food. Its firmness and deterioration classes are
 * reused for examination. */
const HAND = 1;
/** Represented treatments that have no handling law in this version. */
const TREATED = [
  'physical',
  'materialLayer',
  'canopyDrying',
  'frictionKit',
  'waterCup',
  'mantle',
  'fuelMoisture',
  'componentLots',
] as const;
const EQUIPMENT = [
  'frictionKit',
  'waterCup',
  'mantle',
  'componentLots',
] as const;
const SPLIT = 'split open';
const UNKNOWN = 'Safety, toxins and nutrition are not established by handling.';

type Method = 'hand' | 'strike';
type Setup = {
  method: Method;
  implement: V7Stack | null;
  support: V7Object | null;
  /** Load index a strike passes to the food; null for bare hands. */
  load: number | null;
};

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const unitOf = (w: V7World, j: CollectiveWork) =>
  w.stacks.find((s) => s.id === j.escrow[0] && s.reservedFor === j.id);
const text = (value: unknown) => (typeof value === 'string' ? value : null);
function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}
/** Handling state kept on the unit itself, so damage survives cancel, death and new attempts. */
function handling(s: V7Stack): V7Data | null {
  const h = s.processing?.foodHandling;
  return h && typeof h === 'object' && !Array.isArray(h) ? h : null;
}
const damageOf = (s: V7Stack) => Number(handling(s)?.damage ?? 0);
const isOpen = (s: V7Stack) => handling(s)?.outer === SPLIT;
/** Strength is hardness/10 (openMaterial, the probe press scale). */
const strength = (r: V7Resource | undefined) =>
  r ? openMaterial(r).strength : 0;
/** Load a body passes on: its strength times (1 - flexibility), both from openMaterial. */
function transmitted(r: V7Resource): number {
  const m = openMaterial(r);
  return v7RoundNumber(m.strength * (1 - m.flexibility));
}
/** examine-food@1 classes. */
const firmness = (hardness: number) =>
  hardness <= 1 ? 'soft' : hardness <= 4 ? 'firm' : 'hard';
const deterioration = (fraction: number) =>
  fraction < 0.25
    ? 'little observable deterioration'
    : fraction < 0.65
      ? 'observable deterioration'
      : 'advanced deterioration';

function ref(c: V7ActionContext): string | null {
  const value = c.action.args.inputStackId;
  if (value === undefined || value === '') return null;
  return forestReferenceSpelling(c.world, v7String(value, 'inputStackId'));
}
/** inputStackId names this unfinished work's unit (its reserved id or the item it came from). */
function names(j: CollectiveWork, value: string) {
  const bare = value.replace(/^item:/, '');
  return bare === j.escrow[0] || bare === j.sources[0]?.itemId;
}

/** Drawing and replay metadata only; no drawing component is declared in this version. */
function view(
  c: V7ActionContext,
  mode: string,
  unit: V7Stack | null,
  j: CollectiveWork | null,
  outcome: string,
): V7Data {
  const h = unit ? handling(unit) : null;
  return {
    operation: ID,
    mode,
    actor: c.actor.id,
    target: unit?.id ?? null,
    product: unit && isOpen(unit) ? unit.id : null,
    position: { x: c.actor.position.x, y: c.actor.position.y },
    progress: v7RoundNumber(Math.min(1, Number(h?.damage ?? 0))),
    outer: text(h?.outer) ?? 'intact',
    interior: text(h?.interior) ?? 'not exposed',
    fragments: 0,
    toolContact:
      j && text(j.implement)
        ? {
            implement: text(j.implement),
            support: text(j.support),
            attempts: Number(j.attempts ?? 0),
          }
        : null,
    outcome,
    uncertainty: UNKNOWN,
  };
}

/** Externally perceivable condition plus the person's own records about this food. */
function look(c: V7ActionContext, s: V7Stack, r: V7Resource): V7Data {
  const h = handling(s);
  const exposed = isOpen(s);
  const life = r.properties?.decay ?? 0;
  const seen =
    life > 0
      ? deterioration(Math.min(1, (s.decay ?? 0) / life))
      : 'not represented';
  const eaten = c.actor.memory.discoveries?.[s.resource];
  const records = Object.values(c.actor.memory.knowledge ?? {})
    .filter((k) => k.subject === s.resource)
    .sort((a, b) => b.tick - a.tick)
    .slice(0, 6)
    .map((k) => ({
      key: k.key,
      property: k.property,
      tick: k.tick,
      evidence: k.evidence,
      verified: k.verified,
    }));
  const unknown = ['shape', 'outer layer thickness and part masses'];
  if (!eaten) unknown.push('edibility', 'nutrition');
  unknown.push('safety', 'toxins');
  if (!exposed) unknown.push('interior condition');
  return {
    item: s.id,
    resource: s.resource,
    quantity: s.quantity,
    origin: s.origin,
    harvestedAt: s.harvestedAt ?? null,
    shape: 'not represented',
    color: r.color,
    unitMass: v7RoundNumber(foodUnitMass(c.world, s)),
    firmness: firmness(r.properties?.hardness ?? 0),
    outer: text(h?.outer) ?? 'no damage seen',
    crack: v7RoundNumber(Math.min(1, damageOf(s))),
    interior: exposed ? 'exposed' : 'not visible',
    exterior: seen,
    interiorCondition: exposed ? seen : 'unknown',
    eaten: eaten
      ? {
          record: `discoveries:${s.resource}`,
          observedAt: eaten.observedAt ?? null,
          nutrition: eaten.nutrition ?? null,
          toxicity: eaten.toxicity ?? null,
        }
      : null,
    records,
    unknown,
    safety: 'not established by examination',
  };
}

function examine(c: V7ActionContext): V7HandlerResult {
  const value = ref(c);
  if (!value)
    throw new Error(
      'Name one of your own food units in inputStackId. Nothing was spent.',
    );
  const j = workFind(c);
  const mine = j && open(j) && names(j, value) ? unitOf(c.world, j) : null;
  const id =
    mine?.id ?? forestResolveReference(c.world, c.actor, value, 'owned');
  const s = c.world.stacks.find((x) => x.id === id && x.owner === c.actor.id);
  if (!s)
    throw new Error('Name one of your own food units. Nothing was spent.');
  const r = collectiveFoodProfile(c.world, s);
  if (!r || r.nutrition <= 0)
    throw new Error(
      'This operation examines food units only. Nothing was spent.',
    );
  if (c.actor.vitals.energy + 1e-8 < EXAMINE)
    throw new Error('Examining needs 0.2 energy. Nothing was spent.');
  c.emit(
    'food-handling-examination-started',
    'Began examining the unit by handling and looking.',
    { unit: s.id, view: view(c, 'examine', s, null, 'examining') },
    s.id,
  );
  const observation = look(c, s, r);
  v7Spend(c.actor, EXAMINE);
  openRemember(c, {
    key: `${s.id}:food-examination`,
    subject: s.resource,
    property: 'examined food unit condition',
    value: observation,
    method: 'handling and looking at the unit',
    condition: openConditions(c.world, c.actor.position).regime,
    verified: false,
  });
  c.emit(
    'food-handling-examined',
    'Examined the unit: only perceivable condition and your own records were noted. Its edibility and safety are not established.',
    {
      unit: s.id,
      observation,
      evidence: c.world.events.at(-1)?.id ?? '',
      energy: EXAMINE,
      view: view(c, 'examine', s, null, 'examined'),
    },
    s.id,
  );
  return { complete: true, writes: [] };
}

/** Checked prerequisites of the next opening round, or the reasons it cannot be attempted. */
function setup(
  c: V7ActionContext,
  unit: V7Stack,
  j?: CollectiveWork,
): Setup | string[] {
  const args = c.action.args;
  // Resuming without naming a method keeps the unfinished work's implement and support.
  const named =
    args.toolIds !== undefined || args.supportTargetId !== undefined;
  const kept = j ? text(j.implement) : null;
  const tools = named ? (args.toolIds ?? []) : kept ? [kept] : [];
  const supportRef = named
    ? text(args.supportTargetId)
    : j
      ? text(j.support)
      : null;
  if (!Array.isArray(tools) || tools.some((t) => typeof t !== 'string'))
    throw new Error('toolIds lists implement item ids. Nothing was spent.');
  const reasons: string[] = [];
  if (c.actor.vitals.energy + 1e-8 < ROUND)
    reasons.push('An opening round needs 0.5 energy.');
  const food = strength(collectiveFoodProfile(c.world, unit));
  const first = tools[0];
  if (tools.length > 1)
    return [...reasons, 'This version strikes with one implement at a time.'];
  if (typeof first !== 'string') {
    if (supportRef)
      reasons.push(
        'A support alone does not open food; also name one owned implement in toolIds.',
      );
    else if (food > HAND / 10)
      reasons.push(
        'Bare hands do not open food this firm; strike it with an owned implement on a solid support.',
      );
    return reasons.length
      ? reasons
      : { method: 'hand', implement: null, support: null, load: null };
  }
  const tool = c.world.stacks.find(
    (s) => s.id === forestResolveReference(c.world, c.actor, first, 'owned', 1),
  );
  if (!tool)
    throw new Error('The implement is unavailable. Nothing was spent.');
  const material = collectiveFoodProfile(c.world, tool);
  if (tool.id === unit.id) reasons.push('A unit cannot strike itself.');
  else if (!material || material.nutrition > 0)
    reasons.push('Food is not used as an implement in this version.');
  else if ((material.properties?.hardness ?? 0) < 1)
    reasons.push('The implement is not rigid enough to strike with.');
  if (EQUIPMENT.some((key) => tool[key] !== undefined))
    reasons.push('Equipment and combined lots are not used as implements.');
  if (!supportRef) {
    reasons.push(
      'A strike needs a solid support in reach; name it in supportTargetId.',
    );
    return reasons;
  }
  const supportId = forestResolveReference(
    c.world,
    c.actor,
    supportRef,
    'object',
  );
  const support = c.world.objects.find((o) => o.id === supportId);
  if (!support)
    throw new Error('The support is unavailable. Nothing was spent.');
  const ground = text(support.data.resource);
  const rock = ground
    ? c.world.resources.find((r) => r.id === ground && !!r.properties)
    : undefined;
  if (
    !rock ||
    !support.spatial.solid ||
    support.spatial.reserved ||
    support.kind === 'animal'
  )
    reasons.push(
      'The support must be a solid, unreserved object of a represented material.',
    );
  if (
    !v7Reach(c.actor, support.spatial) ||
    !v7Visible(c.world, c.actor.position, support.spatial)
  )
    reasons.push('Move within reach of the support.');
  if (reasons.length || !material || !rock) return reasons;
  return {
    method: 'strike',
    implement: tool,
    support,
    load: Math.min(transmitted(material), transmitted(rock)),
  };
}

function blocked(
  c: V7ActionContext,
  reasons: string[],
  unit: V7Stack,
  j?: CollectiveWork,
): V7HandlerResult {
  if (j) {
    if (j.status === 'active') j.status = 'paused';
    j.reason = reasons.join(' ');
    sync(c.actor, j);
  }
  c.emit(
    'food-handling-blocked',
    `Not attempted: ${reasons.join(' ')} Nothing was spent.`,
    {
      unit: unit.id,
      workId: j?.id ?? null,
      reasons,
      energy: 0,
      view: view(c, 'open', unit, j ?? null, 'blocked'),
    },
    unit.id,
  );
  return { complete: true, writes: j ? [j.id] : [] };
}

/** Personal record of an opening outcome, one per food and implement/support material pair. */
function record(
  c: V7ActionContext,
  unit: V7Stack,
  j: CollectiveWork,
  s: Setup,
  outcome: string,
) {
  const tool = s.implement?.resource ?? 'hand',
    rest = text(s.support?.data.resource) ?? 'none';
  openRemember(c, {
    key: `${unit.resource}:opening:${tool}:${rest}`,
    subject: unit.resource,
    property: 'opening outcome',
    value: {
      unit: unit.id,
      method: s.method,
      implement: s.implement?.id ?? null,
      support: s.support?.id ?? null,
      outcome,
      crack: v7RoundNumber(Math.min(1, damageOf(unit))),
      attempts: Number(j.attempts ?? 0),
    },
    method: s.method === 'hand' ? 'opening by hand' : 'striking on a support',
    condition: openConditions(c.world, c.actor.position).regime,
    verified: false,
  });
}

/** Writes the conserved handling record: the unit stays one whole unit with every original
 * property; only its outer layer state, damage and interior exposure change. */
function mark(
  c: V7ActionContext,
  unit: V7Stack,
  j: CollectiveWork,
  damage: number,
) {
  const prior = handling(unit),
    opened = damage >= 1;
  const parents = Array.isArray(prior?.parents) ? prior.parents : [];
  unit.processing = {
    ...(unit.processing ?? {}),
    foodHandling: {
      version: 1,
      parents: [...parents, text(j.sources[0]?.itemId) ?? unit.id],
      workId: j.id,
      outer: opened ? SPLIT : 'cracked',
      interior: opened ? 'exposed' : 'not exposed',
      damage,
      attempts: Number(prior?.attempts ?? 0) + 1,
      openedAt: opened ? c.world.tick : null,
      openedBy: opened ? c.actor.id : null,
      ledger: {
        parts: ['outer layer', 'interior'],
        partMasses: 'not represented',
        mass: v7RoundNumber(foodUnitMass(c.world, unit) * unit.quantity),
        eatingUnits: unit.quantity,
        detached: 0,
        losses: 0,
      },
    },
  };
}

/** One performed, paid opening round under the resistance-and-force test. */
function attempt(
  c: V7ActionContext,
  j: CollectiveWork,
  unit: V7Stack,
  s: Setup,
  resumed: boolean,
): V7HandlerResult {
  j.remainingWork = 1;
  if (!workPay(c, j, ROUND))
    throw new Error('Energy changed before the paid round.');
  c.actor.vitals.energy = v7RoundNumber(Math.max(0, c.actor.vitals.energy));
  j.paidEnergy = v7RoundNumber(j.paidEnergy);
  j.method = s.method;
  j.implement = s.implement?.id ?? null;
  j.support = s.support?.id ?? null;
  j.attempts = Number(j.attempts ?? 0) + 1;
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  if (resumed)
    c.emit(
      'food-handling-resumed',
      'Resumed opening after rechecking the unit, implement, support, reach and energy.',
      {
        workId: j.id,
        unit: unit.id,
        view: view(c, 'open', unit, j, 'resumed'),
      },
      unit.id,
    );
  const food = strength(collectiveFoodProfile(c.world, unit));
  const load = s.load;
  const added =
    load === null
      ? 1
      : load <= food
        ? 0
        : food > 0
          ? v7RoundNumber((load - food) / food)
          : 1;
  if (added === 0) {
    record(c, unit, j, s, 'held');
    workStop(
      c.world,
      c.actor,
      j,
      'The food held under the strike; the unit returns unchanged. Spent energy is not refunded.',
      false,
    );
    c.emit(
      'food-handling-trial-failed',
      'The strike was performed but the food held: this implement and support do not pass a load above its strength. No damage was made; the unit returns unchanged and the 0.5 energy is spent.',
      {
        workId: j.id,
        unit: unit.id,
        energy: ROUND,
        view: view(c, 'open', unit, j, 'held'),
      },
      unit.id,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id, unit.id] };
  }
  const damage = v7RoundNumber(damageOf(unit) + added);
  mark(c, unit, j, damage);
  j.damage = damage;
  if (damage < 1) {
    // How many further rounds are needed is not shown; one more attempt is possible.
    j.remainingWork = 1;
    record(c, unit, j, s, 'cracked');
    c.emit(
      'food-handling-damaged',
      'The strike cracked the outer layer without opening it. The unit stays closed and reserved; the damage is kept on it.',
      {
        workId: j.id,
        unit: unit.id,
        crack: damage,
        energy: ROUND,
        view: view(c, 'open', unit, j, 'cracked'),
      },
      unit.id,
    );
    sync(c.actor, j);
    return { complete: false, remaining: null, writes: [j.id, unit.id] };
  }
  delete unit.reservedFor;
  unit.owner = c.actor.id;
  unit.position = { ...c.actor.position };
  j.status = 'completed';
  j.remainingWork = 0;
  j.outputs = [unit.id];
  record(c, unit, j, s, SPLIT);
  c.emit(
    'food-handling-opened',
    `The outer layer split open ${s.method === 'hand' ? 'by hand' : 'under the strike'} and the interior is exposed. It is still one carried unit with its mass, eating profile, origin, age and decay; nothing detached. It is not certified edible or safe.`,
    {
      workId: j.id,
      unit: unit.id,
      parent: j.sources[0]?.itemId ?? null,
      ledger: handling(unit)?.ledger ?? null,
      energy: ROUND,
      view: view(c, 'open', unit, j, SPLIT),
    },
    unit.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, unit.id] };
}

/** Stops work whose reserved unit is gone (it spoiled under the existing ageing rule). */
function lost(w: V7World, a: V7Actor, j: CollectiveWork) {
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, 'The reserved unit is gone; the opening stopped.', false);
  forestEvent(
    w,
    'food-handling-cancelled',
    'The reserved unit spoiled under the existing ageing rule; the opening stopped without refund.',
    a.position,
    a.id,
    { workId: j.id, reason: 'unit gone' },
    j.id,
  );
  sync(a, j);
}

function openUnit(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  const value = ref(c);
  if (j && open(j)) {
    if (value && !names(j, value))
      throw new Error(
        'Finish or cancel your unfinished opening first. Nothing was spent.',
      );
    const unit = unitOf(c.world, j);
    if (!unit) {
      lost(c.world, c.actor, j);
      return { complete: true, writes: [j.id] };
    }
    const s = setup(c, unit, j);
    if (Array.isArray(s)) return blocked(c, s, unit, j);
    return attempt(c, j, unit, s, j.status === 'paused');
  }
  if (c.operation?.first === false)
    throw new Error('This opening is already settled.');
  if (!value)
    throw new Error(
      'Name one of your own food units in inputStackId. Nothing was spent.',
    );
  const id = forestResolveReference(c.world, c.actor, value, 'owned', 1);
  const unit = c.world.stacks.find((s) => s.id === id);
  if (!unit) throw new Error('The unit is unavailable. Nothing was spent.');
  const r = collectiveFoodProfile(c.world, unit);
  if (!r || r.nutrition <= 0)
    throw new Error('This operation opens food units only. Nothing was spent.');
  if (
    TREATED.some((key) => unit[key] !== undefined) ||
    Object.keys(unit.processing ?? {}).some((key) => key !== 'foodHandling')
  )
    throw new Error(
      'Food under another represented treatment has no handling law in this version. Nothing was spent.',
    );
  if (isOpen(unit))
    throw new Error('This unit is already open. Nothing was spent.');
  const life = r.properties?.decay ?? 0;
  if (life <= 0 || (unit.decay ?? 0) >= life)
    throw new Error('Spoiled food cannot be handled. Nothing was spent.');
  const s = setup(c, unit);
  if (Array.isArray(s)) return blocked(c, s, unit);
  const n = workCreate(c, s.method, 1);
  workReserve(c, n, [{ stack: unit, quantity: 1 }]);
  const part = unitOf(c.world, n);
  if (!part) throw new Error('The reserved unit is missing.');
  n.target = part.id;
  n.attempts = 0;
  n.damage = damageOf(part);
  c.emit(
    'food-handling-started',
    'One whole unit was reserved for opening; it stays carried, owned and ageing.',
    {
      workId: n.id,
      unit: part.id,
      parent: unit.id,
      method: s.method,
      view: view(c, 'open', part, n, 'started'),
    },
    part.id,
  );
  return attempt(c, n, part, s, false);
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error(
      'No unfinished opening of yours to cancel. Nothing was spent.',
    );
  const unit = unitOf(c.world, j);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(
    c.world,
    c.actor,
    j,
    'Cancelled; the unit returns once in its current state. Spent energy and damage are not restored.',
    false,
  );
  c.emit(
    'food-handling-cancelled',
    'Opening cancelled; the unit returned in its current state, without repair or refund.',
    {
      workId: j.id,
      unit: unit?.id ?? null,
      crack: unit ? v7RoundNumber(Math.min(1, damageOf(unit))) : null,
      energy: 0,
      view: view(c, 'cancel', unit ?? null, j, 'cancelled'),
    },
    unit?.id ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'examine') return examine(c);
  if (mode === 'open') return openUnit(c);
  if (mode === 'cancel') return cancel(c);
  throw new Error('Unknown food handling mode.');
}

/** Ordinary simulation: the reserved unit is carried, keeps ageing, and an unworked round pauses. */
function environment(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a || a.vitals.health <= 0) continue;
    const unit = unitOf(w, j);
    if (!unit) {
      lost(w, a, j);
      continue;
    }
    j.x = a.position.x;
    j.y = a.position.y;
    unit.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; the unit keeps its damage and stays reserved.';
      forestEvent(
        w,
        'food-handling-paused',
        'Opening paused because it was not worked this round; the unit keeps its damage and stays reserved.',
        a.position,
        a.id,
        { workId: j.id, unit: unit.id, crack: damageOf(unit) },
        unit.id,
      );
    }
    sync(a, j);
  }
}

export const LONG_MECHANICAL_FOOD_HANDLING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex17',
  dependencies: ['foundation-open@1'],
  description:
    'A general examination and mechanical opening of one owned food unit: perceivable condition with cited personal records, and hand or strike opening settled by the existing hardness, strength and flexibility values, with damage kept on the unit and no composition invented.',
  reuse: {
    experiment:
      'examine-food@1 (ex10: harder food needs an implement; firmness and deterioration classes); probe@1 press law (a material holds a load not above its strength); ex17 plant-cultivation@1 and hearth-food-preparation@1 (unit inspection, paid-work, escrow and personal-record patterns)',
    source:
      'open-physical.ts (openMaterial strength and flexibility); open-foundation.ts (openRemember personal records); collective-food-profile.ts (eating profile, read only); forest-food-accounting.ts (unit mass); forest-references.ts (reference resolution); collective-work.ts (escrow, paid work, stop); continuous-geometry.ts (reach, visibility); base eat and gather unchanged',
    description:
      'Implementation reuse only; no implement, support, food, skill or mastery is granted. The load-transmission, damage-accumulation and hand rules are declared modeling assumptions.',
  },
  abilities: [
    {
      id: ID,
      name: 'Examine and open food',
      function:
        'Examine an owned food unit for perceivable condition and your own records about it, or open its outer layer by hand or by striking it with an owned implement on a solid support; cancel unfinished opening.',
      equivalence: 'food:examine-open:hand-or-strike:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['examine', 'open', 'cancel'] },
          inputStackId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1, maximum: 1 },
          toolIds: { type: 'array', items: { type: 'string' } },
          supportTargetId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 1,
      costs:
        'Study 1 round. Each mode takes 1 round. examine: inputStackId, an owned food stack; 0.2 energy; nothing is used. open: inputStackId, one whole owned untreated food unit (quantity 1); 0.5 energy per performed round. Bare hands open only soft food. A strike needs toolIds with one owned whole inedible rigid implement and supportTargetId, a solid object in reach. Missing or unsuitable prerequisites, or energy below 0.5, are reported as blocked and cost nothing. open again resumes paused work after rechecking unit, implement, support, reach and energy. cancel: no energy. Gathering and travel cost extra.',
      effects:
        'Examine records colour, heft, firmness by touch, visible damage, whether the interior is exposed, visible deterioration (of the interior only once exposed), your own eating record and your records of that food with their evidence; shape, edibility, safety, toxins and nutrition stay unknown. Strength is hardness/10. A strike passes the lower of the implement and support strength times (1 - flexibility); if that is not above the food strength the food holds: the trial fails and the work ends. Otherwise each strike adds damage (load - strength)/strength, kept on the unit; at 1 the outer layer splits open, else it stays cracked and closed. Soft food opens by hand at once. The unit stays one carried unit with its mass, eating profile, origin, age and decay; part masses are not represented, so nothing detaches. Opening is not tasting, cooking or detoxifying and certifies nothing; eat uses the existing rules. Opened units cannot be planted. An unworked round pauses; cancel or death releases the unit once as it is (at death, on the ground). No refund, repair, reward or wellbeing. Records are unverified.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // The opening event carries no qualified flag: opening earns no milestone.
      practiceEvidence: 'food-handling-opened',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'One paid round per opening attempt; the job, reserved unit, method and damage persist; an unworked round pauses unpaid; open resumes after revalidation; completion, a held trial, cancel and death settle once.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: [
    'food-handling-examination-started',
    'food-handling-examined',
    'food-handling-started',
    'food-handling-blocked',
    'food-handling-trial-failed',
    'food-handling-damaged',
    'food-handling-opened',
    'food-handling-paused',
    'food-handling-resumed',
    'food-handling-cancelled',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && open(j),
    )) {
      const unit = unitOf(w, j);
      j.x = a.position.x;
      j.y = a.position.y;
      workStop(
        w,
        a,
        j,
        'Performer died; the unit was left where they died, in its current state.',
        true,
      );
      forestEvent(
        w,
        'food-handling-cancelled',
        'Opening stopped by death; the unit lies where the person died, neither opened further nor repaired.',
        a.position,
        a.id,
        { workId: j.id, unit: unit?.id ?? null, reason: 'death' },
        unit?.id ?? j.id,
      );
      sync(a, j);
    }
  },
};
