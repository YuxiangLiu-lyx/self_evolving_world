import type {
  V7ActionContext,
  V7Data,
  V7HandlerResult,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7RoundNumber } from './continuous-data.js';
import { v7Reach, v7Visible } from './continuous-geometry.js';
import { HARDNESS_SCALE } from './open-hardness-physics.js';
import { openRemember } from './open-foundation.js';
import {
  ex19MaterialContact,
  ex19MaterialDark,
  ex19MaterialPiece,
  ex19MaterialWhole,
} from './long-ex19-material-contact.js';

/** Selection and inspection: one round and the probe observation cost of 0.2 each. */
const LOOK = 0.2;
/** Study: 0.5 energy in each of the three rounds (World Agent specification). */
const STUDY = 0.5;
/** The existing usable-edge rule of stone-edge bark separation (collective-bark), applied
 * unchanged by thin-slice-food-drying-trial@1: stone or flint, contact-resistance index at least
 * 8, contact-model edge radius at most 0.0002, controlled contact, neither fractured nor
 * contaminated, at least one whole unit. */
const EDGE_MATERIALS = ['stone', 'flint'];
const EDGE_HARDNESS = 8;
const EDGE_RADIUS = 0.0002;
const NO_INSTRUMENT =
  'No edge-measuring, hardness-reference or contamination-test instrument is represented in this world; inspection reports visible state and world contact model values without one. Nothing was spent.';
const NO_SHAPING =
  'Shaping is not available: the world contact model has no fracture, flaking or sharpening law, and its only stone contact law (scratch strokes) wears an edge blunter, adding 0.00001 to its radius per stroke. An intact unit already has its material edge radius. Nothing was spent.';
const RULE =
  'Under the world contact model every intact, unworn whole stone unit (index 8, edge radius 0.000125) or flint unit (index 9, edge radius 0.000111) meets this rule; edge shape, length and orientation are not represented.';
const SCALES = {
  hardness: HARDNESS_SCALE,
  edgeRadius:
    'contact-model length units, the units of the 0.0002 requirement (radius = 0.001 / index for an unworn edge)',
};

const text = (v: unknown) => (typeof v === 'string' ? v : '');
const round = (x: number) => v7RoundNumber(x);

/** Each requirement of the stone-edge rule with its value, evidence and result. Visible state
 * and contact geometry are observed as hardness-assessment@1 inspection observes them; the
 * hardness index is the material's model value, since no hardness reference exists. */
function assess(w: V7World, s: V7Stack) {
  const c = ex19MaterialContact(w, s),
    name = w.resources.find((r) => r.id === s.resource)?.name ?? s.resource;
  const row = (
    value: V7Data[string],
    required: string,
    pass: boolean,
    evidence: 'visible' | 'world contact model',
  ): V7Data => ({
    value,
    required,
    pass,
    evidence,
    status: !pass ? 'failed' : evidence === 'visible' ? 'observed' : 'model',
  });
  const properties: Record<string, V7Data> = {
    material: row(
      name,
      'stone or flint',
      EDGE_MATERIALS.includes(s.resource),
      'visible',
    ),
    wholeUnits: row(
      ex19MaterialWhole(s),
      'at least 1',
      ex19MaterialWhole(s) >= 1,
      'visible',
    ),
    hardness: row(
      c.resistance,
      `index ${String(EDGE_HARDNESS)} or more`,
      c.resistance >= EDGE_HARDNESS,
      'world contact model',
    ),
    edgeRadius: row(
      round(c.edgeRadius),
      `at most ${String(EDGE_RADIUS)}`,
      c.edgeRadius <= EDGE_RADIUS + 1e-12,
      'visible',
    ),
    fractured: row(c.fractured, 'not fractured', !c.fractured, 'visible'),
    contaminated: row(
      c.contaminated,
      'not contaminated',
      !c.contaminated,
      'visible',
    ),
    controlledContact: row(
      c.controlledContact,
      'large and intact enough for controlled contact',
      c.controlledContact,
      'visible',
    ),
  };
  const unmet = Object.entries(properties)
    .filter(([, p]) => p.pass !== true)
    .map(([k]) => k);
  return {
    properties,
    unmet,
    meets: unmet.length === 0,
    wear: round(c.wear),
    name,
  };
}

/** Reusable drawing metadata. It never shows a passing-tool or food-safe badge. */
function view(
  c: V7ActionContext,
  mode: string,
  item: string,
  resource: string,
  at: { x: number; y: number },
  meets: boolean,
  unmet: string[],
): V7Data {
  return {
    component: 'rock',
    operation: c.action.interface,
    mode,
    actor: c.actor.id,
    item,
    material: resource,
    color: c.world.resources.find((r) => r.id === resource)?.color ?? '#869189',
    x: at.x,
    y: at.y,
    strokes: 0,
    chips: 0,
    edgeOutline: 'not represented',
    evidence: 'visual inspection and world contact model values',
    status: meets ? 'meets the stone-edge rule' : 'fails the stone-edge rule',
    unmet,
    measured: false,
    badge: null,
  };
}

/** A general selection and inspection of cutting-edge material against the stone-edge rule. */
export function cuttingEdgeAssessmentPackage(
  id: string,
  scope: string,
  dependencies: string[],
): V7Package {
  const revision = `${id}@1`;
  const handler = `long.${id}`;

  /** Checks shared by both executable modes, before any charge. */
  function ready(c: V7ActionContext) {
    const ids = c.action.args.instrumentIds;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 0))
      throw new Error(NO_INSTRUMENT);
    const dark = ex19MaterialDark(c.world, c.actor);
    if (dark) throw new Error(`${dark} Nothing was spent.`);
    if (c.actor.vitals.energy + 1e-8 < LOOK)
      throw new Error('This look needs 0.2 energy. Nothing was spent.');
  }

  function select(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const source = text(action.args.sourceId);
    if (!source)
      throw new Error(
        'Name a reachable material source by its exact id in sourceId. Nothing was spent.',
      );
    const o = w.objects.find((o) => o.id === source);
    const r = w.resources.find((r) => r.id === o?.data.resource);
    if (!o || !r || typeof o.data.stock !== 'number')
      throw new Error(
        `${source} is not a source of loose material. Nothing was spent.`,
      );
    if (r.nutrition > 0)
      throw new Error(
        `${source} yields food, not edge material. Nothing was spent.`,
      );
    if (!v7Reach(a, o.spatial) || !v7Visible(w, a.position, o.spatial))
      throw new Error(
        `${source} is out of reach; walk there first. Nothing was spent.`,
      );
    ready(c);
    v7Spend(a, LOOK);
    // Loose units are not individually represented: one gathered unit is a fresh whole unit.
    const unit: V7Stack = {
      id: `${o.id}:loose-unit`,
      resource: r.id,
      quantity: 1,
      quantityTenths: 10,
      position: { x: o.spatial.x, y: o.spatial.y },
      owner: null,
      origin: o.id,
    };
    const v = assess(w, unit);
    const report: V7Data = {
      source: o.id,
      material: r.id,
      name: v.name,
      position: { x: o.spatial.x, y: o.spatial.y },
      looseUnits: o.data.stock,
      candidates:
        'Loose units are not individually represented: every unit gathered here is one whole unit with the same represented properties; no per-unit shape, size, edge or defect exists to see.',
      gatheredUnit: v.properties,
      unmet: v.unmet,
      meets: v.meets,
      rule: RULE,
      scales: SCALES,
      measured: false,
      instruments: 'none represented',
      foodSafety: 'not assessed',
      next: v.meets
        ? 'gather one unit (gather, 2 energy), then inspect it'
        : 'this material does not meet the stone-edge rule',
    };
    openRemember(c, {
      key: `${o.id}:cutting-edge-candidates`,
      subject: r.id,
      property: 'cutting edge candidates at a source',
      value: report,
      method: 'direct look at the source; world contact model values',
      condition:
        'loose units not individually represented; no instrument measurement',
      verified: false,
    });
    c.emit(
      'cutting-edge-candidates-observed',
      `Looked over ${o.id}: ${String(o.data.stock)} loose ${v.name} units within reach, not individually distinguishable. A gathered intact unit would ${v.meets ? 'meet' : 'not meet'} the stone-edge rule under the world contact model; nothing was gathered or measured.`,
      {
        ...report,
        energy: LOOK,
        view: view(c, 'select', o.id, r.id, o.spatial, v.meets, v.unmet),
      },
      o.id,
    );
    return { complete: true, writes: [] };
  }

  function inspect(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const s = w.stacks.find((s) => s.id === text(action.args.inputStackId));
    const problem = ex19MaterialPiece(w, a, s);
    if (problem || !s) throw new Error(`${problem ?? ''} Nothing was spent.`);
    ready(c);
    v7Spend(a, LOOK);
    const v = assess(w, s);
    const report: V7Data = {
      item: s.id,
      material: s.resource,
      name: v.name,
      origin: s.origin,
      quantity: s.quantity,
      properties: v.properties,
      wear: v.wear,
      unmet: v.unmet,
      meets: v.meets,
      rule: RULE,
      scales: SCALES,
      measured: false,
      instruments: 'none represented',
      foodSafety: 'not assessed',
      trial:
        'thin-slice-food-drying-trial@1 applies this rule itself and must be learned separately',
    };
    openRemember(c, {
      key: `${s.id}:cutting-edge-inspection`,
      subject: s.resource,
      property: 'cutting edge against the stone-edge rule',
      value: report,
      method:
        'direct look and handling of the carried piece; world contact model values',
      condition: 'no instrument measurement; food safety not assessed',
      verified: false,
    });
    c.emit(
      'cutting-edge-inspected',
      v.meets
        ? `Inspected ${s.id}: every requirement of the stone-edge rule is met under the world contact model. No instrument measured it and no food safety is established.`
        : `Inspected ${s.id}: it does not meet the stone-edge rule (${v.unmet.join(', ')}).`,
      {
        ...report,
        energy: LOOK,
        view: view(
          c,
          'inspect',
          s.id,
          s.resource,
          a.position,
          v.meets,
          v.unmet,
        ),
      },
      s.id,
    );
    return { complete: true, writes: [] };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const mode = text(c.action.args.mode);
    if (mode === 'select') return select(c);
    if (mode === 'inspect') return inspect(c);
    if (mode === 'shape') throw new Error(NO_SHAPING);
    throw new Error('Unknown edge assessment mode. Nothing was spent.');
  }

  return {
    id,
    version: 1,
    scope,
    dependencies,
    description:
      'A general selection and inspection of cutting-edge material: a reachable loose material source or an own carried piece is looked over in light and each requirement of the existing stone-edge rule is reported with its evidence; shaping is refused because the world has no edge-forming law.',
    reuse: {
      experiment:
        'ex12 bark separation (stone or flint usable-edge rule); ex10 hardness-assessment@1 (inspection of contact geometry and surface condition without an absolute hardness reference); ex19 thin-slice-food-drying-trial@1 (the same rule, applied unchanged)',
      source:
        'open-hardness-physics.ts (scratchPhysical, scratchVisible, HARDNESS_SCALE), read on a copy as in long-ex19-thin-slice-food-drying.ts; long-ex19-material-contact.ts (shared with shell-compression-opening@1); forest-climate.ts (light); open-foundation.ts (openRemember); continuous-geometry.ts (reach, visibility); base gather, pickup and navigate unchanged',
      description:
        'Implementation reuse only; no stone, tool, instrument, skill or mastery is supplied. New work is the per-requirement report with evidence classes, the source look and the light rule; the contact values are the existing model, unchanged.',
    },
    abilities: [
      {
        id,
        name: 'Cutting edge selection and inspection',
        function:
          'Look over a reachable loose material source for cutting-edge pieces, or inspect one of your own carried pieces, and report each requirement of the stone-edge rule (stone or flint, hardness index 8+, edge radius at most 0.0002, not fractured or contaminated) with its evidence and pass or fail. Shaping is not available.',
        equivalence: 'material:cutting-edge:select-inspect:1',
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: ['select', 'inspect', 'shape'] },
            sourceId: { type: 'string' },
            inputStackId: { type: 'string' },
            instrumentIds: { type: 'array', items: { type: 'string' } },
          }),
          required: ['mode'],
        },
        references: {
          sourceId: 'optional-exact-visible',
          inputStackId: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 3,
        learningEnergy: STUDY,
        costs:
          'Study: 3 rounds, 0.5 energy each. select: sourceId, a loose non-food material source within reach; one round, 0.2 energy; nothing is gathered (gather costs 2 energy per unit). inspect: inputStackId, your own carried unreserved non-food item of at least one whole unit; one round, 0.2 energy. Both need light: outdoors daylight above 0.1, indoors light above 0.1. shape and any instrumentIds are refused. All checks run before any charge; travel, gathering and pickup are separate.',
        effects:
          'Reports, as an unverified personal record, the material, whole units and the world contact model hardness index, edge radius (0.001 / index when unworn), wear, fracture, contamination and controlled contact, each marked observed, model value or failed against the rule thin-slice-food-drying-trial@1 applies, and whether all are met. Under this model every intact, unworn whole stone (index 8, radius 0.000125) or flint unit (9, 0.000111) meets it; each scratch stroke that wears a piece adds 0.00001 to its radius. Loose source units are not individually represented, so select reports what one gathered unit would show. Nothing is gathered, shaped, measured by an instrument or changed; no tool, equipment or food safety is created. Shaping is refused: the world has no fracture, flaking or sharpening law and abrasion only blunts. The drying trial still runs its own check and must be learned separately. No refund or reward.',
        handler,
        revision,
        authored: false,
        // The inspection event carries no qualified flag: looking earns no practice milestone.
        practiceEvidence: 'cutting-edge-inspected',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: 1,
          interruption: 'cancel',
          progress:
            'Each mode is one atomic round; a look commits only when its round completes. No work, escrow or process persists.',
        },
      },
    ],
    handlers: { [handler]: execute },
    processes: {},
    visualComponents: [],
    events: ['cutting-edge-candidates-observed', 'cutting-edge-inspected'],
    resources: [],
    satisfaction: [],
  };
}

/** ex19: Moss's cutting-edge selection and inspection for the thin-slice drying trial. */
export const LONG_EX19_CUTTING_EDGE_ASSESSMENT = cuttingEdgeAssessmentPackage(
  'cutting-edge-assessment',
  'long-ex19',
  ['foundation-open@1'],
);
