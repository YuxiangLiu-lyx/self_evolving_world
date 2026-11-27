import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Json,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Reach } from './continuous-geometry.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { openRemember } from './open-foundation.js';

/** ex21: a targeted food-constituent test. The World Agent specification makes a bounded
 * prerequisite assessment the smallest executable mode: it lists the method-dependent bill of
 * requirements for a named constituent and states that no measurement is available. The physical
 * run stays refused until its concrete dependencies exist. This world represents no validated
 * method record, reagent, solvent, kit, reference standard, container, reader or gram-reading
 * balance (its only mass instrument, beam-mass-comparator@1, reads fractions of a reference
 * piece), so no run can be locked, quoted or started here. Nothing reads a hidden constituent,
 * mass, contamination, nutrition or toxicity value. */

const ID = 'targeted-food-constituent-test';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
const EVENT = (s: string) => `constituent-test-${s}`;
/** Per-person log of completed assessments, the only state this operation keeps. */
const STATE = `long:${ID}`;
/** assess and inspect: one active round and 0.2 energy each (World Agent specification). */
const LOOK = 0.2;
/** Study: five active rounds at 0.5 energy per completed round (experience review). */
const STUDY = 0.5;
const LEARNING = 5;
/** Bounds on supplied id lists, argument text and the kept log. Text bounds are refused here,
 * at no cost, rather than declared as schema maxLength, which pauses the round instead. */
const MAX_IDS = 12;
const MAX_ID = 120;
const MAX_CONSTITUENT = 80;
const MAX_METHOD = 160;
const LOG = 12;
const SHOWN = 8;
const RESULT = 'no measurement available';
const NOT_MEASURED =
  'This assessment measured nothing. Not established: the level of this constituent, other toxins, allergens, microbes, rancidity, nutrition, general edibility, a needed preparation, detoxification or any health effect. Visible-state records and mass comparisons are not dietary evidence.';
/** The object kind of the ex19 and ex21 lever comparator (long-ex19-lever-mass-comparison). */
const COMPARATOR = 'lever-comparator';

type Status = 'present' | 'missing' | 'unestablished';
type Row = readonly [key: string, need: string, status: Status, basis: string];
interface Family {
  key: string;
  analyte: string;
  method: string;
  rows: readonly Row[];
}

const SET_BY_METHOD =
  'set only by a validated method record, and none exists here';
const ABSOLUTE: Row = [
  'absoluteBalance',
  'calibrated balance reading grams',
  'missing',
  'no gram-reading balance exists in this world; a beam comparator reads only fractions of its reference piece',
];

/** The concrete initial family of the specification. It names what one result would mean,
 * never that this food contains it. */
const AFLATOXINS: Family = {
  key: 'total-aflatoxins',
  analyte: 'total aflatoxins (measured sum of B1, B2, G1 and G2)',
  method:
    'matrix-validated competitive immunoassay, within its documented cross-reactivity and recovery limits',
  rows: [
    [
      'methodReference',
      'exact manufacturer, product, revision and lot-specific instructions and calibration validated for this food matrix',
      'missing',
      'no validated method record exists in this world',
    ],
    [
      'recipe',
      'locked recipe: sample grams, liquid identities and amounts, extraction ratio and duration, grinding, aliquot and dilution volumes, incubation and read windows',
      'unestablished',
      SET_BY_METHOD,
    ],
    [
      'sampleSize',
      'minimum destructive sample mass, and whether this one item supplies it',
      'unestablished',
      SET_BY_METHOD,
    ],
    ABSOLUTE,
    [
      'preparationEquipment',
      'clean grinding equipment that adds no material',
      'unestablished',
      SET_BY_METHOD,
    ],
    [
      'extractionLiquid',
      'the measured extraction solvent and diluent',
      'missing',
      'no solvent, diluent or measured liquid is represented in this world',
    ],
    [
      'volumetricEquipment',
      'calibrated volumetric tools and containers',
      'missing',
      'no container or volumetric tool is represented in this world',
    ],
    [
      'assayKit',
      'lot-matched immunoassay kit and consumables',
      'missing',
      'no reagent, kit or assay consumable is represented in this world',
    ],
    [
      'controls',
      'blank, negative and positive or recovery controls and calibrators',
      'missing',
      'no reference standard or control material is represented in this world',
    ],
    [
      'reader',
      'compatible calibrated reader',
      'missing',
      'no reader or detector is represented in this world',
    ],
    [
      'wasteHandling',
      'solvent containment, ventilation, ignition separation and waste storage',
      'unestablished',
      SET_BY_METHOD,
    ],
    [
      'limits',
      'detection and quantitation limits, reportable range, recovery, cross-reactivity, units and uncertainty',
      'unestablished',
      SET_BY_METHOD,
    ],
  ],
};

/** Any other named constituent: no method family is defined for it in this release. */
function generic(constituent: string, key: string): Family {
  return {
    key,
    analyte: constituent,
    method: 'none defined',
    rows: [
      [
        'methodReference',
        'validated, lot-specific method record for this constituent and food matrix',
        'missing',
        'no validated method record exists in this world',
      ],
      [
        'analyticalFamily',
        'a selective measuring principle for this constituent',
        'unestablished',
        'this release defines a method family only for total aflatoxins',
      ],
      ABSOLUTE,
      [
        'materials',
        'reagents, liquids, equipment, controls, reader, timing, waste handling and limits',
        'unestablished',
        SET_BY_METHOD,
      ],
    ],
  };
}

const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const text = (v: V7Json | undefined) => (typeof v === 'string' ? v.trim() : '');
/** A trimmed text argument within its length bound. */
function bounded(c: V7ActionContext, key: string, max: number): string {
  const v = text(c.action.args[key]);
  if (v.length > max)
    throw nothing(`${key} is longer than ${String(max)} characters.`);
  return v;
}
const bare = (id: string) => id.replace(/^(item|object):/, '');
const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

function family(constituent: string): Family {
  const key = normal(constituent);
  return /^(total-)?aflatoxins?$/.test(key)
    ? AFLATOXINS
    : generic(constituent, key || 'unnamed');
}

/** An exact id list argument, deduplicated; prefixes item: and object: are accepted. */
function idList(c: V7ActionContext, key: string): string[] {
  const v = c.action.args[key];
  if (v === undefined || v === null) return [];
  const entries = Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && !!x.trim())
    : [];
  if (!Array.isArray(v) || entries.length !== v.length)
    throw nothing(`${key} must be a list of exact ids.`);
  if (entries.some((x) => x.trim().length > MAX_ID))
    throw nothing(`${key} ids are at most ${String(MAX_ID)} characters.`);
  const list = [...new Set(entries.map((x) => bare(x.trim())))];
  if (list.length > MAX_IDS)
    throw nothing(`${key} accepts at most ${String(MAX_IDS)} ids.`);
  return list;
}

/** Why an item cannot be the sample, or null. Reads ownership, reservation, the world's food
 * classification and spoilage only; no constituent, mass or contamination. */
function sampleProblem(
  w: V7World,
  a: V7Actor,
  id: string,
): { stack: V7Stack | null; problem: string | null } {
  if (!id)
    return {
      stack: null,
      problem: 'Name your own food item in targetItemId.',
    };
  const s = w.stacks.find((s) => s.id === id);
  if (!s || s.owner !== a.id)
    return {
      stack: null,
      problem: `${id} is not one of your own items; only your own sample can be assessed.`,
    };
  if (s.reservedFor)
    return { stack: s, problem: `${id} is reserved for unfinished work.` };
  // Owned items are carried (they keep their pickup position as a record), so they are in reach.
  const food = collectiveFoodProfile(w, s);
  if (!food || food.nutrition <= 0)
    return { stack: s, problem: `${id} is not food.` };
  const life =
    w.resources.find((r) => r.id === s.resource)?.properties?.decay ?? 0;
  if (life > 0 && (s.decay ?? 0) >= life)
    return { stack: s, problem: `${id} is spoiled.` };
  return { stack: s, problem: null };
}

type Role = 'equipment' | 'reagent' | 'reference';
/** One requirement of the bill with its status and the basis for that status. */
type Requirement = { key: string; need: string; status: Status; basis: string };
/** One supplied id: what it is and why it meets no requirement. */
type Supplied = {
  id: string;
  role: Role;
  is: string;
  meets: false;
  why: string;
};

/** What a supplied id is and why it meets no requirement, or null when it is not an own item,
 * an object within reach or (for references) one of the person's own records. */
function classify(
  w: V7World,
  a: V7Actor,
  id: string,
  role: Role,
  sample: V7Stack | null,
): Supplied | null {
  const resource = sample?.resource ?? 'the sample';
  const out = (is: string, why: string): Supplied => ({
    id,
    role,
    is,
    meets: false,
    why,
  });
  const s = w.stacks.find((s) => s.id === id && s.owner === a.id);
  if (s) {
    const name = w.resources.find((r) => r.id === s.resource)?.name;
    if (s.id === sample?.id)
      return out(
        'the sample itself',
        'the sample cannot be its own equipment, reagent or reference',
      );
    if ((collectiveFoodProfile(w, s)?.nutrition ?? 0) > 0)
      return out(
        `${name ?? s.resource} (food)`,
        'food is not analytical material',
      );
    return out(
      name ?? s.resource,
      'plain material, not a reagent, solvent, kit, standard, container or instrument',
    );
  }
  const o = w.objects.find((o) => o.id === id);
  if (o && v7Reach(a, o.spatial))
    return o.kind === COMPARATOR
      ? out(
          'beam mass comparator',
          'it reads mass only as a fraction of its reference piece, not grams, so it cannot be the absolute balance',
        )
      : out(o.name, 'not an analytical instrument or material');
  if (role !== 'reference') return null;
  const records = Object.values(a.memory.knowledge ?? {});
  const k = records.find((r) => r.key === id || r.evidence === id);
  if (k)
    return k.subject === resource
      ? out(
          `your unverified ${k.property} record (${k.method})`,
          'an observation, not a dietary measurement or analytical reference',
        )
      : out(
          `your record about ${k.subject}`,
          `about ${k.subject}, not ${resource}; not evidence about this item`,
        );
  if (a.memory.discoveries?.[id])
    return out(
      `your eating record for ${id}`,
      id === resource
        ? 'a record of eating, not an analytical reference'
        : `about ${id}, not ${resource}; not evidence about this item`,
    );
  return null;
}

/** The complete prerequisite survey of one request, without any charge or change. */
function survey(c: V7ActionContext) {
  const { world: w, actor: a, action } = c;
  const constituent = bounded(c, 'constituent', MAX_CONSTITUENT);
  const methodRef = bounded(c, 'methodRef', MAX_METHOD);
  const mass = action.args.sampleMass;
  if (mass !== undefined && (typeof mass !== 'number' || !(mass >= 0)))
    throw nothing('sampleMass must be a nonnegative number of grams.');
  const { stack, problem } = sampleProblem(
    w,
    a,
    text(action.args.targetItemId),
  );
  const supplied: Supplied[] = [];
  const unknown: string[] = [];
  for (const role of ['equipment', 'reagent', 'reference'] as const)
    for (const id of idList(c, `${role}Ids`)) {
      const v = classify(w, a, id, role, stack);
      if (v) supplied.push(v);
      else unknown.push(id);
    }
  const f = family(constituent);
  const rows: Requirement[] = [
    {
      key: 'sample',
      need: 'an owned, unspoiled food item within reach',
      status: problem ? 'missing' : 'present',
      basis: problem ?? `${stack?.id ?? ''} (${stack?.resource ?? ''})`,
    },
    ...f.rows.map(([key, need, status, basis]) => ({
      key,
      need,
      status,
      basis:
        key === 'methodReference' && methodRef
          ? `${basis}; '${methodRef}' is not one`
          : key === 'sampleSize' && typeof mass === 'number'
            ? `${basis}; ${String(mass)} g was requested and cannot be weighed here`
            : basis,
    })),
  ];
  const keys = (status: Status) =>
    rows.filter((r) => r.status === status).map((r) => r.key);
  return {
    constituent,
    methodRef,
    mass: typeof mass === 'number' ? mass : null,
    stack,
    problem,
    family: f,
    rows,
    supplied,
    unknown,
    missing: keys('missing'),
    unestablished: keys('unestablished'),
  };
}

type Survey = ReturnType<typeof survey>;

/** Reusable drawing metadata. It never shows a test in progress, a reading or a safe badge. */
function view(c: V7ActionContext, mode: string, v: Survey | null): V7Data {
  const at = c.actor.position;
  return {
    component: 'carried-sample',
    capability: ID,
    mode,
    actor: c.actor.id,
    target: v?.stack?.id ?? null,
    methodRef: v?.methodRef || null,
    stage: mode === 'assess' ? 'prerequisite assessment' : 'record review',
    progress: null,
    elapsedRounds: 0,
    deadlineRound: null,
    equipmentIds: (v?.supplied ?? [])
      .filter((s) => s.role === 'equipment')
      .map((s) => s.id),
    materialIds: (v?.supplied ?? [])
      .filter((s) => s.role !== 'equipment')
      .map((s) => s.id),
    x: at.x,
    y: at.y,
    status: 'requirements-missing',
    result: RESULT,
    measured: false,
    badge: null,
  };
}

function log(a: V7Actor): V7Data[] {
  const s = a.extensionState[STATE];
  const list =
    s && typeof s === 'object' && !Array.isArray(s) ? s.assessments : null;
  return Array.isArray(list)
    ? list.filter(
        (x): x is V7Data => !!x && typeof x === 'object' && !Array.isArray(x),
      )
    : [];
}

function assess(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const v = survey(c);
  if (!v.constituent)
    throw nothing(
      'Name the constituent to assess, for example total aflatoxins.',
    );
  if (v.problem || !v.stack) throw nothing(v.problem ?? 'Name your sample.');
  if (v.unknown.length)
    throw nothing(
      `Not your item, an object within reach or your record: ${v.unknown.join(', ')}.`,
    );
  if (a.vitals.energy + 1e-8 < LOOK)
    throw nothing('An assessment needs 0.2 energy.');
  v7Spend(a, LOOK);
  const s = v.stack;
  const summary: V7Data = {
    constituent: v.constituent,
    analyte: v.family.analyte,
    method: v.family.method,
    methodRef: v.methodRef || null,
    result: RESULT,
    measured: false,
    present: v.rows.filter((r) => r.status === 'present').map((r) => r.key),
    missing: v.missing,
    unestablished: v.unestablished,
    supplied: v.supplied.map((x) => ({ id: x.id, meets: false })),
    runAvailable: false,
  };
  openRemember(c, {
    key: `${s.id}:constituent-assessment:${v.family.key}`,
    subject: s.resource,
    property: `${v.family.key} test prerequisites`,
    value: summary,
    method:
      'prerequisite checklist against supplied ids and this world; the sample was not handled',
    condition:
      'no validated method record, kit, gram balance or reader exists here; not a chemical result',
    verified: false,
  });
  const evidence = w.events.at(-1)?.id ?? '';
  a.extensionState[STATE] = {
    assessments: [
      ...log(a),
      {
        round: w.tick,
        target: s.id,
        resource: s.resource,
        origin: s.origin,
        constituent: v.constituent,
        family: v.family.key,
        methodRef: v.methodRef || null,
        result: RESULT,
        missing: v.missing,
        unestablished: v.unestablished,
        evidence,
      },
    ].slice(-LOG),
  };
  c.emit(
    EVENT('assessed'),
    `Assessed what a ${v.family.analyte} test of ${s.id} would need: ${RESULT}. Missing: ${v.missing.join(', ')}. Unestablished: ${v.unestablished.join(', ')}. Nothing was handled or consumed.`,
    {
      ...summary,
      target: s.id,
      resource: s.resource,
      origin: s.origin,
      requirements: v.rows,
      supplied: v.supplied,
      requestedSampleMass: v.mass,
      notMeasured: NOT_MEASURED,
      record: evidence,
      energy: LOOK,
      view: view(c, 'assess', v),
    },
    s.id,
  );
  return { complete: true, writes: [] };
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const { actor: a } = c;
  const target = text(c.action.args.targetItemId);
  const all = log(a).filter((x) => !target || x.target === target);
  if (!all.length)
    throw nothing(
      `You have no assessment of this operation${target ? ` for ${target}` : ''} to inspect, and no run exists.`,
    );
  if (a.vitals.energy + 1e-8 < LOOK)
    throw nothing('An inspection needs 0.2 energy.');
  v7Spend(a, LOOK);
  const shown = all.slice(-SHOWN);
  c.emit(
    EVENT('inspected'),
    `Reviewed ${String(all.length)} of your own constituent test assessments: every one reports ${RESULT}. No run exists.`,
    {
      assessments: shown,
      total: all.length,
      run: null,
      runState: 'none: a run cannot start until every dependency exists',
      result: RESULT,
      measured: false,
      energy: LOOK,
      view: view(c, 'inspect', null),
    },
    target || null,
  );
  return { complete: true, writes: [] };
}

/** run and resume: every prerequisite is checked and the request is refused before any charge. */
function refuse(c: V7ActionContext, mode: string): never {
  const v = survey(c);
  const lines = [
    ...(v.constituent ? [] : ['constituent: not named']),
    ...(v.problem ? [`sample: ${v.problem.replace(/\.$/, '')}`] : []),
    ...(v.unknown.length ? [`unknown ids: ${v.unknown.join(', ')}`] : []),
    `missing: ${v.missing.join(', ')}`,
    `unestablished: ${v.unestablished.join(', ')}`,
  ];
  throw nothing(
    `${mode === 'resume' ? 'No logged run exists to resume, and a run cannot start' : 'A run cannot start'}: ${lines.join('; ')}. No validated method record, kit, gram balance or reader exists in this world, so no recipe can be locked or quoted and no measurement is available.`,
  );
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = text(c.action.args.mode);
  if (mode === 'assess') return assess(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'run' || mode === 'resume') refuse(c, mode);
  if (mode === 'cancel')
    throw nothing(
      'No run of this operation exists, so nothing is reserved or released.',
    );
  throw nothing('Unknown constituent test mode.');
}

export const LONG_EX21_CONSTITUENT_TEST: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex21',
  dependencies: ['foundation-open@1'],
  description:
    'A general targeted food-constituent test: a paid prerequisite assessment that lists the bill of requirements for a named constituent and states that no measurement is available; the physical run is refused until its method dependencies exist.',
  reuse: {
    experiment:
      'Registry check: no long-ex21 interface measures a dietary constituent; ex10 food-assay@1 and noningestive-extractability@1 are scoped to open-ex10 (food-assay refused its chemical mode for comparable missing vessels, solvent, reagent, reference, controls and calibrated equipment) and the ex12 food inspection to collective-ex12; ex19 cutting-edge-assessment@1 gave the per-requirement report pattern',
    source:
      'open-foundation.ts (openRemember and its trial-result event); continuous-base.ts (v7Spend); collective-food-profile.ts (the food classification); continuous-geometry.ts (reach); the shared reference resolver. probe (open.probe) is not reused and implements no assay',
    description:
      'Implementation reuse only; no reagent, kit, instrument, method record, skill or mastery is supplied. New work is the requirement bill, the supplied-id classification, the assessment log and the refusals.',
  },
  abilities: [
    {
      id: ID,
      name: 'Targeted food constituent test',
      function:
        'Assess what a test of one named dietary constituent of your own food item needs (method, materials, equipment, controls, reader, limits), each requirement marked present, missing or unestablished; inspect your assessments. The physical run stays unavailable until every dependency exists.',
      equivalence: 'food:targeted-constituent:prerequisite-assessment:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['assess', 'run', 'inspect', 'resume', 'cancel'],
          },
          targetItemId: { type: 'string' },
          constituent: { type: 'string' },
          methodRef: { type: 'string' },
          sampleMass: { type: 'number', minimum: 0 },
          equipmentIds: {
            type: 'array',
            items: { type: 'string' },
          },
          reagentIds: {
            type: 'array',
            items: { type: 'string' },
          },
          referenceIds: {
            type: 'array',
            items: { type: 'string' },
          },
        }),
        required: ['mode'],
      },
      references: { targetItemId: 'optional-exact-visible' },
      prerequisites: [],
      learning: LEARNING,
      learningEnergy: STUDY,
      costs:
        'Study: 5 rounds, 0.5 energy each. assess: targetItemId, your own unreserved, unspoiled food item in reach, and constituent; optional methodRef, sampleMass (g) and equipmentIds, reagentIds, referenceIds (each your own item, an object in reach or, for references, your own record); 1 round, 0.2 energy; nothing is handled or consumed. inspect: your own assessments, optionally for one targetItemId; 1 round, 0.2. run and resume are refused before any charge with the exact missing list; cancel is refused at no cost, as no run exists and nothing is reserved. All checks precede any charge; no refund.',
      effects:
        'assess gives an event and an unverified personal record of the bill of requirements and the result: no measurement available. For total aflatoxins (measured sum of B1, B2, G1, G2 by a matrix-validated competitive immunoassay): a lot-specific validated method reference, a locked recipe, sample size, a calibrated balance reading grams, clean grinding equipment, extraction liquid, volumetric tools, an immunoassay kit, controls, a reader, waste handling and method limits. This world represents no method record, reagent, solvent, kit, standard, container, reader or gram balance, so those are missing and the method-set items unestablished; a beam comparator reads only fractions of its reference piece. Other constituents: method reference and gram balance missing, the rest unestablished. Each supplied id is reported and meets nothing. No constituent, mass, contamination, nutrition, edibility, preparation need or safety is read, inferred or shown; visible-state records and mass comparisons are not dietary evidence. No reward.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // The assessment event carries no qualified flag: checklists earn no practice milestone.
      practiceEvidence: EVENT('assessed'),
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'assess and inspect are atomic rounds; a look commits only when its round completes. No run, reservation or process exists.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: [EVENT('assessed'), EVENT('inspected')],
  resources: [],
  satisfaction: [],
};

/** The unchanged parts that ex24 assess-food-evidence@1 reuses: the exact id-list and bounded
 * text parsers, the classification of a supplied object, and the requirement-bill rows. */
export type { Row as ConstituentRow, Status as ConstituentStatus };
export {
  ABSOLUTE as CONSTITUENT_ABSOLUTE_BALANCE,
  SET_BY_METHOD as CONSTITUENT_SET_BY_METHOD,
  bounded as constituentBounded,
  classify as constituentClassify,
  idList as constituentIdList,
};
