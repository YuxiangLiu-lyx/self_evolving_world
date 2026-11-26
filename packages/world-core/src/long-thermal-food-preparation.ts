import type {
  V7ActionContext,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Stack,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Id, v7String } from './continuous-data.js';
import { v7Distance, v7Reach } from './continuous-geometry.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { foodTenths } from './forest-food-accounting.js';
import { openRemember } from './open-foundation.js';
import { look, owned } from './long-unheated-food-preparation.js';

const ID = 'thermal-food-preparation';
const REVISION = `${ID}@1`;
/** The baseline probe observation cost; the World Agent specification sets assessment at 0.2. */
const LOOK_ENERGY = 0.2;
/** Supplied apparatus references checked by one assessment. */
const MAX_APPARATUS = 4;
/** Why the thermal mode is refused. No interface in this world version produces a heat source,
 * and no food has thermal properties, so heat can be neither applied nor measured. */
const HEAT_UNAVAILABLE =
  'Heating is not available: this world represents no usable heat source, no heat transfer into food and no food thermal properties, so no heat can be applied or measured. Use assess to record what you hold and what is within reach. Nothing was spent.';

/** What one assessment reports about a supplied id. */
interface Supplied extends V7Data {
  id: string;
  status: string;
}

/** The probe's heat rule (open.probe, mode heat): an object within reach with available heat. */
const heatSource = (c: V7ActionContext, o: V7Object) =>
  v7Reach(c.actor, o.spatial) && Number(o.data.availableHeat ?? 0) > 0;

/** One supplied reference, resolved only among the person's own items, ground items within
 * pickup reach and objects within interaction reach; nothing else is searched or revealed.
 * A proposed source without represented heat is reported as such; any other present item or
 * object keeps an unverified role, because no heating method is defined. */
function arrangement(c: V7ActionContext, id: string, source = false): Supplied {
  const { world: w, actor: a } = c;
  const other = source
    ? 'present; no represented heat'
    : 'present; role unverified';
  const s: V7Stack | undefined = w.stacks.find(
    (s) =>
      s.id === id &&
      (s.owner === a.id ||
        (s.owner === null &&
          v7Distance(a.position, s.position) <=
            a.radius + w.config.interaction)),
  );
  if (s)
    return {
      id,
      status: other,
      kind: 'item',
      resource: s.resource,
      quantity: s.quantity,
      carried: s.owner === a.id,
      reserved: !!s.reservedFor,
      heatSource: false,
    };
  const o = w.objects.find((o) => o.id === id && v7Reach(a, o.spatial));
  if (o)
    return {
      id,
      status: heatSource(c, o) ? 'present; represented heat' : other,
      kind: 'object',
      type: o.kind,
      heatSource: heatSource(c, o),
    };
  return { id, status: 'absent from your items and reach' };
}

/** Optional string arguments; an empty string counts as not supplied. */
function optional(c: V7ActionContext, key: string): string | null {
  const value = c.action.args[key];
  return value === undefined || value === '' ? null : v7String(value, key);
}

/** One atomic paid round: look at the food and check the supplied and reachable arrangement.
 * Every check runs before the charge; nothing is consumed, moved, reserved or heated. */
function assess(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const s = owned(c);
  const food = collectiveFoodProfile(w, s);
  if (!food || food.nutrition <= 0)
    throw new Error(
      'This is not food; only your own food can be assessed. Nothing was spent.',
    );
  const held = foodTenths(s.quantity);
  const requested = c.action.args.quantity;
  if (requested !== undefined && typeof requested !== 'number')
    throw new Error('quantity must be a number. Nothing was spent.');
  const tenths = requested === undefined ? held : foodTenths(requested);
  if (tenths < 1 || tenths > held)
    throw new Error(
      `${s.id} holds ${String(s.quantity)}; name a quantity from 0.1 up to that. Nothing was spent.`,
    );
  const source = optional(c, 'sourceId'),
    key = optional(c, 'evidenceKey');
  const raw = c.action.args.apparatusIds ?? [];
  const apparatus = Array.isArray(raw)
    ? raw.map((x) => v7String(x, 'apparatusIds'))
    : [];
  if (apparatus.length > MAX_APPARATUS)
    throw new Error(
      `Name at most ${String(MAX_APPARATUS)} apparatus ids. Nothing was spent.`,
    );
  const supplied = [s.id, ...(source ? [source] : []), ...apparatus];
  if (new Set(supplied).size !== supplied.length)
    throw new Error(
      'Each supplied id may appear once and must differ from the food. Nothing was spent.',
    );
  if (a.vitals.energy + 1e-8 < LOOK_ENERGY)
    throw new Error('Assessment needs 0.2 energy. Nothing was spent.');
  v7Spend(a, LOOK_ENERGY);
  const assessmentId = v7Id(w, 'thermal-assessment');
  const sourceSeen = source ? arrangement(c, source, true) : null;
  const tools = apparatus.map((id) => arrangement(c, id));
  const reachable = w.objects.filter((o) => heatSource(c, o)).map((o) => o.id);
  const own = a.memory.discoveries?.[s.resource];
  const record = key ? a.memory.knowledge?.[key] : undefined;
  const present = (x: Supplied) => x.status.startsWith('present');
  const missing = [
    ...(reachable.length || sourceSeen?.heatSource === true
      ? []
      : ['heat-source']),
    ...(tools.some(present) ? [] : ['exposure-support']),
    'heat-transfer',
  ];
  const all = [...(sourceSeen ? [sourceSeen] : []), ...tools];
  const value: V7Data = {
    assessmentId,
    input: s.id,
    quantity: tenths / 10,
    food: {
      ...look(w, s),
      heated: false,
      cooked: false,
      edibility: 'not established',
    },
    // The person's own earlier eating record of this food, not a test of this stack.
    eatingRecord: own
      ? {
          nutrition: own.nutrition ?? null,
          toxicity: own.toxicity ?? null,
          observedAt: own.observedAt ?? null,
        }
      : null,
    heatSource: sourceSeen,
    reachableHeatSources: reachable,
    ignition: 'not assessed: it depends on the actual heat source',
    apparatus: tools,
    localWater: ['~', '=', ','].includes(
      w.terrain[Math.floor(a.position.y)]?.[Math.floor(a.position.x)] ?? '',
    ),
    evidence: key
      ? record
        ? {
            key,
            status: 'present',
            subject: record.subject,
            property: record.property,
            verified: record.verified,
          }
        : { key, status: 'absent from your records' }
      : null,
    processingRule: null,
    missing,
    unverified: all
      .filter((x) => x.status === 'present; role unverified')
      .map((x) => x.id),
    absent: all.filter((x) => !present(x)).map((x) => x.id),
    heating: {
      available: false,
      dependency:
        'heat source, heat transfer into food, food thermal properties',
      reason:
        'Not represented in this world version; heating would not prove edibility or remove hazards.',
    },
    position: { x: a.position.x, y: a.position.y },
    tick: w.tick,
    safety: 'unknown',
    display: {
      food: 'raw-unchanged',
      heating: 'dependency-blocked',
      indicator: 'missing-prerequisites',
    },
  };
  openRemember(c, {
    key: `${s.id}:thermal-feasibility`,
    subject: s.resource,
    property: 'thermal preparation feasibility',
    value,
    method: 'direct look at the food and the supplied and reachable items',
    condition:
      'only supplied ids, your items and what is within reach; not a safety test',
    verified: false,
  });
  // No qualified flag: an assessment or a missing-prerequisite list earns no practice milestone.
  c.emit(
    'thermal-feasibility-assessed',
    'Feasibility assessed: the food was looked over and the supplied and reachable prerequisites were checked. Nothing was heated or cooked; safety stays unknown.',
    value,
    s.id,
  );
  return { complete: true, writes: [] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'heat') throw new Error(HEAT_UNAVAILABLE);
  if (mode === 'assess') return assess(c);
  throw new Error('Unknown thermal preparation mode. Nothing was spent.');
}

/** ex18: a general evidence-limited thermal food preparation. Its executable part is a paid
 * feasibility assessment of owned food and the supplied or reachable arrangement; the thermal
 * mode is refused before any cost because no heat source or food heat transfer is represented. */
export const LONG_THERMAL_FOOD_PREPARATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex18',
  dependencies: ['foundation-open@1'],
  description:
    'A general thermal food preparation whose executable part is a paid feasibility assessment: owned food is looked over and supplied or reachable prerequisites are reported present, unverified or missing; heating is refused before any cost because no heat source or heat transfer into food is represented.',
  reuse: {
    experiment:
      'ex18 unheated-food-preparation@1 (look: the visible food condition and treatment record; owned: the exact own unreserved stack check; the eating-record report); foundation-open@1 probe (observation cost 0.2, unverified personal records and the heat-source rule: an object within reach with available heat; the wetting rule for local water)',
    source:
      'long-unheated-food-preparation.ts (look, owned); open-foundation.ts (openRemember); collective-food-profile.ts (the eat edibility test); forest-food-accounting.ts (exact tenths); continuous-geometry.ts (reach)',
    description:
      'Implementation reuse only; no earlier ability, item or mastery is inherited and earlier packages are unchanged. local-fire@1 (hearth, friction ignition, combustion and warmth of people) is outside this scope, needs active-warming@1 and a satisfaction source, and never heats food, so it is not reused.',
  },
  abilities: [
    {
      id: ID,
      name: 'Thermal food preparation',
      function:
        'Assess whether your own food could be heat-treated: one paid look records its visible condition and treatment and which supplied or reachable prerequisites (heat source, support, tool, vessel, water, evidence) are present, unverified or missing. Heating is unavailable in this world version and is refused at no cost.',
      equivalence: 'food:thermal-preparation:assess-heat:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['assess', 'heat'] },
          inputStackId: { type: 'string' },
          quantity: { type: 'number', minimum: 0.1 },
          sourceId: { type: 'string' },
          apparatusIds: { type: 'array', items: { type: 'string' } },
          evidenceKey: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: { inputStackId: 'optional-exact-visible' },
      prerequisites: [],
      learning: 3,
      costs:
        'Study: 3 rounds. Assess: inputStackId is the exact item id of your own unreserved food, quantity the amount considered (0.1 steps; default all of it); one round and 0.2 energy. No food, fuel, tool, vessel or water is used, moved or reserved. Optional sourceId, apparatusIds (up to 4 exact ids of your items, ground items or objects within reach) and evidenceKey (an exact key of your own records) are only checked. Heat: refused before any cost. A wrong id, non-food, too large a quantity or energy below 0.2 fails at no cost.',
      effects:
        'Assess writes an unverified personal record and an event: the food quantity, origin, age, decay, visible condition and treatment records; your own eating record of that food (not a test of this stack); for each supplied id whether it is absent or present (a source with or without represented heat, otherwise role unverified); any object within reach with available heat; water in your cell; whether the evidence key exists; and the missing prerequisites. It never labels food cooked, edible or safe: safety stays unknown, and heat would not prove edibility or remove hazards. It does not show that no heat source exists elsewhere. Nothing changes except your energy and records. No reward.',
      handler: 'long.thermal-food-preparation',
      revision: REVISION,
      authored: false,
      // The assessment event carries no qualified flag: assessing earns no practice milestone.
      practiceEvidence: 'thermal-feasibility-assessed',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One atomic paid assessment round; only the personal record persists. Heating never starts, so there is no work to pause, resume or cancel.',
      },
    },
  ],
  handlers: { 'long.thermal-food-preparation': execute },
  processes: {},
  visualComponents: [],
  events: ['thermal-feasibility-assessed'],
  resources: [],
  satisfaction: [],
};
