import type {
  V7ActionContext,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Json, v7RoundNumber } from './continuous-data.js';
import { v7Reach, v7Visible } from './continuous-geometry.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { foodTenths, foodUnitMass } from './forest-food-accounting.js';
import { forestResolveReference } from './forest-references.js';
import { openConditions, openMaterial } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  workAllocations,
  workCreate,
  workPay,
  workReserve,
} from './collective-work.js';
import {
  ex19MaterialContact,
  ex19MaterialDark,
  ex19MaterialGround,
  ex19MaterialPiece,
  ex19MaterialWhole,
} from './long-ex19-material-contact.js';

/** One controlled compression cycle of one whole unit (World Agent specification: 1 energy). */
const PRESS = 1;
/** Inspection: one round and the probe observation cost of 0.2. */
const LOOK = 0.2;
/** Study: 0.5 energy in each of the two rounds (World Agent specification). */
const STUDY = 0.5;
/** examine-food@1 and mechanical-food-handling@1: food of hardness index 1 or less is soft. */
const SOFT = 1;
/** Processing key of the outer-layer record this operation keeps on a unit. */
const KEY = 'shellCompression';
const SPLIT = 'split open';
/** Represented treatments without a compression law in this version (as mechanical food
 * handling refuses them). */
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
const NO_SEPARATION =
  'Shell and contents are not represented as separate parts in this world: each nut or other food unit is one unit with one mass, nutrition and decay, so contents cannot be separated, counted, weighed or piled apart without inventing a composition. open exposes the interior and the unit stays whole. Nothing was spent.';
const UNKNOWN = 'Edibility, nutrition, toxins and safety are not established.';

type Piece = {
  kind: 'item' | 'object';
  id: string;
  resource: string;
  /** Load the surface passes on: strength x (1 - flexibility). */
  passes: number;
};

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const round = (x: number) => v7RoundNumber(x);
/** Strength x (1 - flexibility) from openMaterial: the transmission law of mechanical food
 * handling (ex17), on the probe press scale where strength is hardness / 10. */
function passes(r: V7Resource): number {
  const m = openMaterial(r);
  return round(m.strength * (1 - m.flexibility));
}
/** examine-food@1 firmness and deterioration classes (as mechanical food handling uses them). */
const firmness = (hardness: number) =>
  hardness <= SOFT ? 'soft' : hardness <= 4 ? 'firm' : 'hard';
const deterioration = (fraction: number) =>
  fraction < 0.25
    ? 'little observable deterioration'
    : fraction < 0.65
      ? 'observable deterioration'
      : 'advanced deterioration';
function shell(s: V7Stack): V7Data | null {
  const h = s.processing?.[KEY];
  return h && typeof h === 'object' && !Array.isArray(h) ? h : null;
}
const damageOf = (s: V7Stack) => Number(shell(s)?.damage ?? 0);
const isOpen = (s: V7Stack) => shell(s)?.outer === SPLIT;

/** Visible outer layer and interior state; an unexposed interior is never described. */
function look(w: V7World, s: V7Stack, r: V7Resource): V7Data {
  const h = shell(s),
    exposed = isOpen(s),
    life = r.properties?.decay ?? 0;
  const seen =
    life > 0
      ? deterioration(Math.min(1, (s.decay ?? 0) / life))
      : 'not represented';
  return {
    item: s.id,
    resource: s.resource,
    name: r.name,
    quantity: s.quantity,
    origin: s.origin,
    harvestedAt: s.harvestedAt ?? null,
    color: r.color,
    unitMass: round(foodUnitMass(w, s)),
    firmness: firmness(r.properties?.hardness ?? 0),
    outer: text(h?.outer) || 'intact',
    crack: round(Math.min(1, damageOf(s))),
    opened: exposed,
    interior: exposed ? 'exposed' : 'not visible',
    exterior: seen,
    interiorCondition: exposed ? seen : 'unknown',
    contents:
      'not represented as separate material; the unit is still one whole unit',
    recoverable: s.quantity,
    scattered: 0,
    evidence: 'visual and by touch, approximate; no instrument',
    unknown: [
      'shell and kernel masses',
      'yield',
      'edibility',
      'nutrition',
      'toxins',
      'safety',
      ...(exposed ? [] : ['interior condition']),
    ],
    safety: 'not established',
  };
}

/** Reusable drawing metadata; it never shows an edible, nutritious, preserved or safe badge. */
function view(
  c: V7ActionContext,
  mode: string,
  unit: V7Stack,
  stage: string,
  pieces: Piece[] = [],
): V7Data {
  const h = shell(unit);
  return {
    operation: c.action.interface,
    mode,
    actor: c.actor.id,
    sample: unit.id,
    resource: unit.resource,
    pressureTools: pieces.filter((p) => p.kind === 'item').map((p) => p.id),
    support: pieces.find((p) => p.kind === 'object')?.id ?? null,
    x: c.actor.position.x,
    y: c.actor.position.y,
    stage,
    shell: isOpen(unit) ? 'open' : h ? 'cracked' : 'intact',
    crack: round(Math.min(1, damageOf(unit))),
    contents: isOpen(unit) ? 'exposed, not separated' : 'not visible',
    contentPile: null,
    shellPile: null,
    debris: 0,
    evidence: 'visual, approximate',
    badge: null,
  };
}

/** The two checked pressure surfaces and the load they pass, before any charge. */
function surfaces(c: V7ActionContext, unit: V7Stack): Piece[] {
  const { world: w, actor: a, action } = c;
  const ids: unknown = action.args.pressureToolIds ?? [];
  const support = text(action.args.supportId);
  if (!Array.isArray(ids) || ids.some((t) => typeof t !== 'string'))
    throw new Error('pressureToolIds lists item ids. Nothing was spent.');
  // Exactly two surfaces: one piece and a support object, or two pieces and no support.
  if (ids.length < 1 || ids.length > 2 || (ids.length === 2) === !!support)
    throw new Error(
      'Name exactly two pressure surfaces: one of your own pieces in pressureToolIds and a solid object in supportId, or two of your own pieces in pressureToolIds (the lower one rests on the ground). Nothing was spent.',
    );
  const pieces: Piece[] = [];
  for (const raw of ids as string[]) {
    const s = w.stacks.find(
      (s) => s.id === forestResolveReference(w, a, raw, 'owned', 1),
    );
    const problem = ex19MaterialPiece(w, a, s);
    if (problem || !s) throw new Error(`${problem ?? ''} Nothing was spent.`);
    if (s.id === unit.id || pieces.some((p) => p.id === s.id))
      throw new Error(
        'The sample and the two surfaces must be three different items. Nothing was spent.',
      );
    const m = collectiveFoodProfile(w, s);
    if (!m || (m.properties?.hardness ?? 0) < 1)
      throw new Error(
        `${s.id} is not rigid enough to press with. Nothing was spent.`,
      );
    const contact = ex19MaterialContact(w, s);
    if (contact.fractured || !contact.controlledContact)
      throw new Error(
        `${s.id} is fractured or too small to give a sound surface. Nothing was spent.`,
      );
    pieces.push({ kind: 'item', id: s.id, resource: m.id, passes: passes(m) });
  }
  if (pieces.length === 2) {
    const ground = ex19MaterialGround(w, a.position);
    if (ground) throw new Error(`${ground} Nothing was spent.`);
    return pieces;
  }
  const o: V7Object | undefined = w.objects.find((o) => o.id === support);
  const rock = w.resources.find(
    (r) => r.id === o?.data.resource && !!r.properties,
  );
  if (
    !o ||
    !rock ||
    !o.spatial.solid ||
    o.spatial.reserved ||
    o.kind === 'animal'
  )
    throw new Error(
      'The support must be a solid, unreserved object of a represented material. Nothing was spent.',
    );
  if (!v7Reach(a, o.spatial) || !v7Visible(w, a.position, o.spatial))
    throw new Error('Move within reach of the support. Nothing was spent.');
  return [
    ...pieces,
    { kind: 'object', id: o.id, resource: rock.id, passes: passes(rock) },
  ];
}

/** Why this unit cannot be pressed open, or null. */
function unsuitable(s: V7Stack, r: V7Resource): string | null {
  if (r.nutrition <= 0) return 'This operation opens food units only.';
  if (
    TREATED.some((k) => s[k] !== undefined) ||
    Object.keys(s.processing ?? {}).some((k) => k !== KEY)
  )
    return 'Food under another represented treatment has no compression law in this version.';
  if (ex19MaterialWhole(s) < 1)
    return `${s.id} holds less than one whole unit.`;
  if (shell(s) && foodTenths(s.quantity) !== 10)
    return 'A cracked unit can be pressed again only while it is one whole unit.';
  if (isOpen(s)) return 'This unit is already open.';
  const life = r.properties?.decay ?? 0;
  if (life <= 0 || (s.decay ?? 0) >= life)
    return 'Spoiled food cannot be pressed.';
  if ((r.properties?.hardness ?? 0) <= SOFT)
    return 'Soft food has no rigid outer layer to crack; pressing it would squash it, which this version does not represent.';
  return null;
}

/** The food unit named in inputStackId, which must be the person's own. */
function sample(c: V7ActionContext) {
  const s = c.world.stacks.find(
    (s) => s.id === text(c.action.args.inputStackId),
  );
  if (!s || s.owner !== c.actor.id)
    throw new Error(
      'Name one of your own food stacks by its exact item id in inputStackId. Nothing was spent.',
    );
  if (s.reservedFor)
    throw new Error(
      'That item is reserved for unfinished work. Nothing was spent.',
    );
  const r = collectiveFoodProfile(c.world, s);
  if (!r || r.nutrition <= 0)
    throw new Error(
      'This operation handles food units only. Nothing was spent.',
    );
  return { s, r };
}

/** A general opening of shelled food by bounded compression between two rigid surfaces. */
export function shellCompressionOpeningPackage(
  id: string,
  scope: string,
  dependencies: string[],
): V7Package {
  const revision = `${id}@1`;
  const handler = `long.${id}`;

  /** Personal record of one compression outcome per food, surface materials and outcome. */
  function remember(
    c: V7ActionContext,
    unit: V7Stack,
    pieces: Piece[],
    outcome: string,
    load: number,
  ) {
    openRemember(c, {
      key: `${unit.resource}:compression:${pieces.map((p) => p.resource).join('+')}:${outcome}`,
      subject: unit.resource,
      property: 'compression opening outcome',
      value: {
        unit: unit.id,
        surfaces: pieces.map((p) => p.id),
        outcome,
        load,
        crack: round(Math.min(1, damageOf(unit))),
      },
      method: 'one controlled compression between two rigid surfaces',
      condition: openConditions(c.world, c.actor.position).regime,
      verified: false,
    });
  }

  function press(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const { s: input, r } = sample(c);
    const problem = unsuitable(input, r);
    if (problem) throw new Error(`${problem} Nothing was spent.`);
    const pieces = surfaces(c, input);
    const dark = ex19MaterialDark(w, a);
    if (dark) throw new Error(`${dark} Nothing was spent.`);
    if (a.vitals.energy + 1e-8 < PRESS)
      throw new Error(
        'One compression cycle needs 1 energy. Nothing was spent.',
      );
    // All checks passed: one paid round performs the compression.
    const load = Math.min(...pieces.map((p) => p.passes)),
      strength = openMaterial(r).strength,
      added = load <= strength ? 0 : round((load - strength) / strength);
    const j = workCreate(c, 'compression', 1);
    if (!workPay(c, j, PRESS))
      throw new Error('Energy changed before the paid round.');
    a.vitals.energy = round(Math.max(0, a.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    j.status = 'completed';
    j.target = input.id;
    j.surfaces = pieces.map((p) => p.id);
    j.load = load;
    if (added === 0) {
      // The outer layer held: the unit stays as it was, in its own stack.
      j.outcome = 'held';
      remember(c, input, pieces, 'held', load);
      c.emit(
        'shell-compression-attempted',
        `One controlled compression of ${input.id} was performed; the outer layer held, since these surfaces pass load ${String(load)}, not above its strength ${String(strength)}. Nothing changed but the 1 energy spent.`,
        {
          workId: j.id,
          unit: input.id,
          surfaces: pieces,
          load,
          strength,
          outcome: 'held',
          energy: PRESS,
          view: view(c, 'open', input, 'held', pieces),
        },
        input.id,
      );
      a.extensionState[`long:work:${id}`] = v7Json(j);
      return { complete: true, writes: [j.id, input.id] };
    }
    // One whole unit is worked; a larger stack keeps the rest unchanged.
    let unit = input;
    if (foodTenths(input.quantity) !== 10) {
      workReserve(
        c,
        j,
        workAllocations(c, [{ itemId: input.id, quantity: 1 }]),
      );
      const part = w.stacks.find((s) => s.id === j.escrow.at(-1));
      if (!part) throw new Error('The worked unit is missing.');
      delete part.reservedFor;
      j.escrow = [];
      unit = part;
    }
    const prior = shell(unit),
      damage = round(damageOf(unit) + added),
      opened = damage >= 1;
    const parents = Array.isArray(prior?.parents) ? prior.parents : [];
    unit.position = { ...a.position };
    unit.processing = {
      ...(unit.processing ?? {}),
      [KEY]: {
        version: 1,
        parents: unit.id === input.id ? parents : [...parents, input.id],
        outer: opened ? SPLIT : 'cracked',
        interior: opened ? 'exposed' : 'not exposed',
        damage,
        attempts: Number(prior?.attempts ?? 0) + 1,
        lastLoad: load,
        openedAt: opened ? w.tick : null,
        openedBy: opened ? a.id : null,
        ledger: {
          parts: 'not represented',
          mass: round(foodUnitMass(w, unit) * unit.quantity),
          units: unit.quantity,
          detached: 0,
          scattered: 0,
        },
      },
    };
    j.outcome = opened ? SPLIT : 'cracked';
    j.outputs = [unit.id];
    remember(c, unit, pieces, opened ? 'opened' : 'cracked', load);
    const data = {
      workId: j.id,
      unit: unit.id,
      parent: input.id,
      surfaces: pieces,
      load,
      strength,
      crack: round(Math.min(1, damage)),
      outcome: j.outcome,
      energy: PRESS,
    };
    c.emit(
      'shell-compression-attempted',
      `One controlled compression of ${unit.id} was performed between ${pieces.map((p) => p.id).join(' and ')}.`,
      { ...data, view: view(c, 'open', unit, 'pressed', pieces) },
      unit.id,
    );
    c.emit(
      opened ? 'shell-compression-opened' : 'shell-compression-cracked',
      opened
        ? `The outer layer of ${unit.id} split open and the interior is exposed. It is still one carried unit with its mass, nutrition, origin, age and decay; nothing detached and no contents were separated. ${UNKNOWN}`
        : `The outer layer of ${unit.id} cracked without opening; the damage is kept on the unit and another compression may open it.`,
      {
        ...data,
        ledger: shell(unit)?.ledger ?? null,
        view: view(c, 'open', unit, opened ? 'opened' : 'cracked', pieces),
      },
      unit.id,
    );
    a.extensionState[`long:work:${id}`] = v7Json(j);
    return { complete: true, writes: [j.id, input.id, unit.id] };
  }

  function inspect(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const { s, r } = sample(c);
    const dark = ex19MaterialDark(w, a);
    if (dark) throw new Error(`${dark} Nothing was spent.`);
    if (a.vitals.energy + 1e-8 < LOOK)
      throw new Error('Inspection needs 0.2 energy. Nothing was spent.');
    v7Spend(a, LOOK);
    const observation = look(w, s, r);
    openRemember(c, {
      key: `${s.id}:shell-inspection`,
      subject: s.resource,
      property: 'visible outer layer and interior condition',
      value: observation,
      method: 'direct look and handling',
      condition: openConditions(w, a.position).regime,
      verified: false,
    });
    c.emit(
      'shell-compression-inspected',
      `Inspected ${s.id}: outer layer ${text(observation.outer)}, interior ${text(observation.interior)}. Contents are not separate material in this world. ${UNKNOWN}`,
      {
        unit: s.id,
        observation,
        energy: LOOK,
        view: view(c, 'inspect', s, 'inspected'),
      },
      s.id,
    );
    return { complete: true, writes: [] };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const mode = text(c.action.args.mode);
    if (mode === 'open') return press(c);
    if (mode === 'inspect') return inspect(c);
    if (mode === 'separate') throw new Error(NO_SEPARATION);
    throw new Error('Unknown shell opening mode. Nothing was spent.');
  }

  return {
    id,
    version: 1,
    scope,
    dependencies,
    description:
      'A general opening of shelled food: one whole owned food unit is pressed once per round between two checked rigid surfaces, settled by the existing strength and flexibility values, with crack or opening kept on the unit; inspection reports visible state; contents are not separated because the world does not represent shell and kernel.',
    reuse: {
      experiment:
        'ex17 mechanical-food-handling@1 (load transmission strength x (1 - flexibility), damage accumulation, support checks, treatment refusals, firmness and deterioration classes); probe@1 press law (a material holds a load not above its strength; strength is hardness / 10); ex19 cutting-edge-assessment@1 (shared light, piece and contact checks)',
      source:
        'open-physical.ts (openMaterial, openConditions); long-ex19-material-contact.ts (light, firm ground, whole own piece, contact state read on a copy); collective-work.ts (workCreate, workPay, workAllocations, workReserve); open-foundation.ts (openRemember); forest-references.ts; continuous-geometry.ts (reach, visibility); base gather, pickup and navigate unchanged',
      description:
        'Implementation reuse only; no surface, food, skill or mastery is supplied. The ex17 laws are reapplied in a new module with ex17 unchanged; compression between two surfaces, the firm-ground rule for a lower piece and the light rule are declared modeling assumptions.',
    },
    abilities: [
      {
        id,
        name: 'Shell compression opening',
        function:
          'Press one whole unit of your own firm food, such as a nut, once between two rigid pressure surfaces to crack or split its outer layer, or inspect a food unit for its visible outer layer and interior state. Shell and contents cannot be separated in this world.',
        equivalence: 'food:shell:compression-open-inspect:1',
        parameters: {
          ...v7ObjectSchema({
            mode: {
              type: 'string',
              enum: ['open', 'inspect', 'separate'],
            },
            inputStackId: { type: 'string' },
            pressureToolIds: { type: 'array', items: { type: 'string' } },
            supportId: { type: 'string' },
          }),
          required: ['mode'],
        },
        references: {
          inputStackId: 'optional-exact-visible',
          supportId: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 2,
        learningEnergy: STUDY,
        costs:
          'Study: 2 rounds, 0.5 energy each. open: inputStackId, your own unreserved, unspoiled, untreated food stack with a whole unit, not soft (hardness above 1); pressureToolIds, one or two of your own whole inedible rigid sound items; with one, supportId is a solid unreserved object of represented material in reach; with two, the second rests on firm ground where you stand. One round, 1 energy, one unit per attempt. inspect: inputStackId, your own food stack; one round, 0.2 energy. Both need light: outdoors daylight above 0.1, indoors light above 0.1. separate is refused. All checks run before any charge; gather, pickup and travel are separate.',
        effects:
          'Strength is hardness / 10. The load reaching the unit is the lower of the two surfaces’ strength x (1 - flexibility). If it is not above the unit’s strength the outer layer holds and nothing changes. Otherwise damage (load - strength) / strength is added and kept on the unit: at 1 its outer layer splits open and the interior is exposed, below 1 it stays cracked and closed and can be pressed again. A larger stack gives up one unit; the rest is unchanged. The surfaces carry no more than their own strength, so they are not damaged. The unit stays one whole carried unit with its mass, nutrition, origin, age and decay; shell and kernel parts, masses and yield are not represented, so nothing detaches and nothing is separated. Inspect records the visible outer layer, crack, whether the interior is exposed, visible deterioration (of the interior only once exposed) and quantity as an unverified approximate record; edibility, nutrition, toxins and safety stay unknown. No eating, refund or reward.',
        handler,
        revision,
        authored: false,
        // The opening event carries no qualified flag: opening earns no practice milestone.
        practiceEvidence: 'shell-compression-opened',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: 1,
          interruption: 'cancel',
          progress:
            'Each mode is one atomic round; a compression commits only when its round completes, and its crack or opening stays on the unit. No work, escrow or process persists.',
        },
      },
    ],
    handlers: { [handler]: execute },
    processes: {},
    visualComponents: [],
    events: [
      'shell-compression-attempted',
      'shell-compression-cracked',
      'shell-compression-opened',
      'shell-compression-inspected',
    ],
    resources: [],
    satisfaction: [],
  };
}

/** ex19: Ivo's opening of an owned hazelnut sample by compression. */
export const LONG_EX19_SHELL_COMPRESSION_OPENING =
  shellCompressionOpeningPackage('shell-compression-opening', 'long-ex19', [
    'foundation-open@1',
  ]);
