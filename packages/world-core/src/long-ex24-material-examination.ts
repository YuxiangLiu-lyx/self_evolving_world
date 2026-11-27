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
import { v7Json, v7RoundNumber, v7Signature } from './continuous-data.js';
import { v7Distance, v7Reach } from './continuous-geometry.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { forestClimate } from './forest-climate.js';
import { forestResolveReference } from './forest-references.js';
import { openConditions } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  ex19MaterialContact,
  ex19MaterialDark,
  ex19MaterialWhole,
} from './long-ex19-material-contact.js';
import { SMALL_FIRE } from './long-ex21-small-combustion-physics.js';
import {
  WEATHER_SHELTER as G,
  WEATHER_SHELTER_REVISION as SHELTER,
  shelterMeasure,
  shelterMinLength,
} from './long-ex24-weather-shelter-physics.js';
import type { ShelterMeasure } from './long-ex24-weather-shelter-physics.js';

/** ex24: examine material. A general, nondestructive one-round examination of one accessible
 * specimen: an owned item, a loose item on the ground or one unit in place in a material source.
 * inspect records directly observable qualitative traits; measure reads one property, and only
 * with a calibrated reference or instrument that is physically present. The world's represented
 * dimensions are the record-derived measures of construct-weather-shelter@1 (shelterMeasure: the
 * ex21 rod law and the version-2 strand law); a person reads them only through a calibrated tool,
 * rounded to its resolution with a stated uncertainty. Nothing is consumed, reserved or moved. */

const ID = 'examine-material';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
const EVENT = (s: string) => `material-examination-${s}`;
/** Per-person log of examination records, the only state this operation keeps. */
const STATE = `long:${ID}`;
/** Each inspect or single-property measure: one active round and 0.2 energy (specification). */
const ENERGY = 0.2;
/** Study: two rounds at 0.2 energy per completed round (specification). */
const STUDY = 0.2;
const LEARNING = 2;
const LOG = 16;
const MAX_TOOLS = 6;
const MODES = ['inspect', 'measure'] as const;
const PROPERTIES = [
  'length',
  'diameter',
  'mass',
  'volume',
  'moisture',
  'rigidity',
] as const;
type Mode = (typeof MODES)[number];
type Property = (typeof PROPERTIES)[number];
/** The record a calibrated reference or instrument carries: on an item in
 * processing[MATERIAL_CALIBRATION], on an object in data[MATERIAL_CALIBRATION]. No mechanism
 * installed in ex24 writes one, and this package never creates, calibrates or repairs a tool. */
export const MATERIAL_CALIBRATION = 'measurementCalibration';
const FORMS: Record<string, 'length' | 'mass'> = {
  'graduated-scale': 'length',
  'reference-length': 'length',
  balance: 'mass',
};
const UNITS = { length: 'm', mass: 'kg' } as const;
/** Hand feel of elongated pieces: stiff at the ex21 rigidity limit (flexibility at most 3) and
 * pliable from the ex16 wrap limit (flexibility 5) that construct-weather-shelter@1 applies. */
const PLIABLE = 5;
/** A pliable strand laid out straight by hand lies within 1% of its length (assumption). */
const LAY = 0.01;
/** Visible dryness bands of the represented water share: dry at the shelter's (and the world's
 * air-dry grass) 0.4, wet from 0.8 (assumption); never reported as a number. */
const WET = 0.8;
/** The ex16 thin-stem set as construct-weather-shelter@1 reads covering and bedding. */
const THIN = ['dry-grass', 'reed'];
const NO_REFERENCE = 'metric dimensions unavailable: no calibrated reference';
const NO_BALANCE =
  'mass unavailable: no calibrated balance with a verified tare';
const IN_PLACE =
  'unavailable in place: a unit in its source cannot be laid against a reference without gathering it';
const SCOPE =
  'this one handled unit only; other units of the item or source were not examined and need not match';
const STALE =
  'valid while this unit record is unchanged; later weather, decay, movement or deformation can make it stale';

const round = (x: number) => v7RoundNumber(x);
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const text = (v: V7Json | undefined) => (typeof v === 'string' ? v.trim() : '');
const isProperty = (v: unknown): v is Property =>
  typeof v === 'string' && (PROPERTIES as readonly string[]).includes(v);
/** A short deterministic digest of a record state (FNV-1a). */
function digest(value: unknown): string {
  let n = 2166136261;
  for (const ch of v7Signature(value))
    n = Math.imul(n ^ ch.charCodeAt(0), 16777619) >>> 0;
  return n.toString(16).padStart(8, '0');
}

interface Request {
  mode: Mode;
  target: string;
  number: number;
  properties: Property[];
  tools: string[];
  method: string | null;
}
function request(c: V7ActionContext): Request {
  const args = c.action.args,
    mode = text(args.mode) === 'measure' ? 'measure' : 'inspect',
    target = text(args.target);
  if (!target)
    throw nothing(
      'Name the exact target id: your own item, a loose item on the ground or a material source within reach.',
    );
  const tools = Array.isArray(args.tools)
    ? [...new Set(args.tools.map((x) => text(x)).filter(Boolean))]
    : [];
  if (tools.length > MAX_TOOLS)
    throw nothing(`Name at most ${String(MAX_TOOLS)} tools.`);
  return {
    mode,
    target,
    number: typeof args.specimen === 'number' ? args.specimen : 1,
    properties: Array.isArray(args.properties)
      ? [...new Set(args.properties.filter(isProperty))]
      : [],
    tools,
    method: text(args.method) || null,
  };
}

interface Specimen {
  target: string;
  number: number;
  setting: 'carried' | 'on the ground' | 'in place in its source';
  /** The real item, or for a source a unit record of its material that is never stored. */
  stack: V7Stack;
  source: V7Object | null;
  whole: boolean;
}
/** The exact accessible specimen; every failure is refused before any cost. */
function specimen(c: V7ActionContext, r: Request): Specimen {
  const { world: w, actor: a } = c,
    s = w.stacks.find((x) => x.id === r.target),
    reach = a.radius + w.config.interaction;
  if (s) {
    if (s.owner !== null && s.owner !== a.id)
      throw nothing(`${s.id} is another person's item.`);
    if (s.reservedFor)
      throw nothing(`${s.id} is reserved for unfinished work.`);
    if (s.owner === null) {
      if (v7Distance(a.position, s.position) > reach)
        throw nothing(`${s.id} is beyond reach; move next to it first.`);
      if (openConditions(w, s.position).hazards.length)
        throw nothing(
          `${s.id} lies under a hazard and is not safely accessible.`,
        );
    }
    const whole = ex19MaterialWhole(s),
      units = Math.max(1, whole);
    if (r.number > units)
      throw nothing(
        `${s.id} holds ${whole ? `${String(whole)} whole unit(s)` : 'less than one whole unit'}; specimen is at most ${String(units)}.`,
      );
    return {
      target: s.id,
      number: r.number,
      setting: s.owner ? 'carried' : 'on the ground',
      stack: s,
      source: null,
      whole: whole >= 1,
    };
  }
  const o = w.objects.find((x) => x.id === r.target);
  if (!o) throw nothing(`${r.target} is not an item or object in view.`);
  const resource = text(o.data.resource);
  if (!resource || !w.resources.some((x) => x.id === resource))
    throw nothing(`${o.id} is not loose material or a material source.`);
  if (!v7Reach(a, o.spatial))
    throw nothing(`${o.id} is beyond reach; move next to it first.`);
  if (openConditions(w, o.spatial).hazards.length)
    throw nothing(`${o.id} is under a hazard and is not safely accessible.`);
  const stock = Math.floor(Number(o.data.stock ?? 0));
  if (stock < 1) throw nothing(`${o.id} shows no unit to examine.`);
  if (r.number > stock)
    throw nothing(
      `${o.id} shows ${String(stock)} unit(s); specimen is at most ${String(stock)}.`,
    );
  return {
    target: o.id,
    number: r.number,
    setting: 'in place in its source',
    stack: {
      id: `${o.id}#${String(r.number)}`,
      resource,
      quantity: 1,
      position: { x: o.spatial.x, y: o.spatial.y },
      owner: null,
      origin: o.id,
    },
    source: o,
    whole: true,
  };
}
/** The unit record a reading depends on; position is not part of it. */
function stateOf(w: V7World, p: Specimen, m: ShelterMeasure): string {
  const s = p.stack;
  return digest(
    p.source
      ? {
          source: p.source.id,
          resource: s.resource,
          stock: p.source.data.stock,
        }
      : {
          resource: s.resource,
          origin: s.origin,
          harvestedAt: s.harvestedAt ?? null,
          quantity: s.quantity,
          unitMass: m.unitMass,
          waterShare: m.waterShare,
          processing: s.processing ?? null,
          decay: s.decay ?? 0,
          condition: m.condition,
          contact: w.state[`hardness:intrinsic:${s.id}`] ?? null,
        },
  );
}

interface Calibration {
  tool: string;
  quantity: 'length' | 'mass';
  form: string;
  unit: string;
  resolution: number;
  uncertainty: number;
  range: number;
  tare: number | null;
  provenance: V7Data;
}
/** A named tool's declared, verified calibration record, or why it is not one. */
function calibration(
  w: V7World,
  a: V7Actor,
  id: string,
  target: string,
): Calibration | string {
  if (id === target)
    return `${id} is the specimen itself and cannot be its own reference`;
  const s = w.stacks.find((x) => x.id === id),
    o = s ? undefined : w.objects.find((x) => x.id === id);
  let record: V7Json | undefined;
  if (s) {
    if (
      s.owner !== a.id &&
      (s.owner !== null ||
        v7Distance(a.position, s.position) > a.radius + w.config.interaction)
    )
      return `${id} is not in your hands or within reach`;
    record = s.processing?.[MATERIAL_CALIBRATION];
  } else if (o) {
    if (!v7Reach(a, o.spatial)) return `${id} is beyond reach`;
    record = o.data[MATERIAL_CALIBRATION];
  }
  if (!record || typeof record !== 'object' || Array.isArray(record))
    return `${id} carries no calibration record; an uncalibrated object is not a reference`;
  const rec: V7Data = record,
    num = (k: string) => {
      const v = rec[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    },
    str = (k: string) => text(rec[k]),
    form = str('form'),
    quantity = FORMS[form],
    resolution = num('resolution'),
    uncertainty = num('uncertainty'),
    range = num('range'),
    at = num('calibratedAt'),
    condition = num('condition') ?? 1,
    tare = num('tare'),
    bad = [
      ...(rec.verified === true ? [] : ['verified']),
      ...(quantity ? [] : ['form']),
      ...(quantity && rec.quantity === quantity ? [] : ['quantity']),
      ...(quantity && rec.unit === UNITS[quantity] ? [] : ['unit']),
      ...(resolution !== null && resolution > 0 ? [] : ['resolution']),
      ...(uncertainty !== null && uncertainty >= 0 ? [] : ['uncertainty']),
      ...(range !== null && resolution !== null && range >= resolution
        ? []
        : ['range']),
      ...(at !== null && at >= 0 && at <= w.tick ? [] : ['calibratedAt']),
      ...['standard', 'method', 'evidence', 'revision'].filter((k) => !str(k)),
      ...(str('revision') === REVISION ? ['revision'] : []),
      ...(quantity === 'mass' && (tare === null || tare < 0) ? ['tare'] : []),
    ];
  if (bad.length || !quantity)
    return `${id}: its calibration record is not complete and verified (${bad.join(', ')})`;
  if (condition < G.sound)
    return `${id} is not serviceable (condition ${String(round(condition))})`;
  return {
    tool: id,
    quantity,
    form,
    unit: UNITS[quantity],
    resolution: resolution ?? 0,
    uncertainty: uncertainty ?? 0,
    range: range ?? 0,
    tare,
    provenance: {
      tool: id,
      form,
      standard: str('standard'),
      method: str('method'),
      evidence: str('evidence'),
      calibratedAt: at ?? 0,
      revision: str('revision'),
      resolution: resolution ?? 0,
      uncertainty: uncertainty ?? 0,
      range: range ?? 0,
      tare,
      condition: round(condition),
    },
  };
}
/** Resolves every named tool through the shared resolver; unknown ids refuse the request. */
function tools(c: V7ActionContext, r: Request, target: string) {
  const usable: Calibration[] = [],
    rejected: string[] = [];
  for (const id of r.tools) {
    let resolved: string;
    try {
      resolved = forestResolveReference(
        c.world,
        c.actor,
        id,
        'optional-exact-visible',
      );
    } catch (error) {
      throw nothing(
        `tools: ${id} is not resolved (${error instanceof Error ? error.message : 'unknown identity'}).`,
      );
    }
    const t = calibration(c.world, c.actor, resolved, target);
    if (typeof t === 'string') rejected.push(t);
    else usable.push(t);
  }
  return { usable, rejected };
}

interface Reading extends V7Data {
  id: string;
  value: number;
  uncertainty: number;
}
function records(a: V7Actor): V7Data[] {
  const s = a.extensionState[STATE];
  const list =
    s && typeof s === 'object' && !Array.isArray(s) ? s.records : null;
  return Array.isArray(list)
    ? list.filter(
        (x): x is V7Data => !!x && typeof x === 'object' && !Array.isArray(x),
      )
    : [];
}
/** The person's latest readings of this unit that are still current. */
function current(a: V7Actor, p: Specimen, state: string) {
  const out: Partial<Record<Property, Reading>> = {};
  for (const x of records(a))
    if (
      x.target === p.target &&
      x.specimen === p.number &&
      x.state === state &&
      x.status === 'measured' &&
      isProperty(x.property) &&
      typeof x.value === 'number' &&
      typeof x.uncertainty === 'number'
    )
      out[x.property] = x as Reading;
  return out;
}

type Verdict = 'meets' | 'fails' | 'indeterminate' | 'unmeasured';
/** A threshold check over the whole uncertainty interval of a reading. */
function judge(r: Reading | undefined, pass: (x: number) => boolean): Verdict {
  if (!r) return 'unmeasured';
  const low = pass(r.value - r.uncertainty),
    high = pass(r.value + r.uncertainty);
  return low && high ? 'meets' : !low && !high ? 'fails' : 'indeterminate';
}
/** construct-weather-shelter@1 checks from genuinely measured inputs only. Rigidity, water share,
 * pliability and strength have no supported measurement, so a specimen never passes outright. */
function recipe(
  p: Specimen,
  m: ShelterMeasure,
  now: Partial<Record<Property, Reading>>,
): V7Data & { verdict: string } {
  const roles: string[] = [],
    checks: V7Data[] = [],
    unmeasurable: string[] = [],
    failed: string[] = [],
    row = (check: string, verdict: Verdict, r: Reading | undefined) => {
      checks.push({
        check,
        verdict,
        reading: r ? r.id : null,
        value: r ? r.value : null,
        uncertainty: r ? r.uncertainty : null,
      });
      if (verdict === 'fails') failed.push(check);
    };
  if (m.rod) {
    roles.push('rod');
    const leg = shelterMinLength('leg'),
      span = shelterMinLength('ridge');
    row(
      `rod diameter at least ${String(G.diameter)} m at ${String(G.precision)} m precision`,
      judge(
        now.diameter,
        (x) => Math.round(x / G.precision) * G.precision + 1e-9 >= G.diameter,
      ),
      now.diameter,
    );
    const asLeg = judge(now.length, (x) => x + 1e-9 >= leg);
    row(`rod length at least ${String(leg)} m for a leg`, asLeg, now.length);
    const asSpan = judge(now.length, (x) => x + 1e-9 >= span);
    if (asSpan === 'fails' && asLeg !== 'fails')
      checks.push({
        check: `rod length at least ${String(span)} m for a ridge, rail or batten`,
        verdict: asSpan,
        note: 'usable only as a leg',
      });
    else
      row(
        `rod length at least ${String(span)} m for a ridge, rail or batten`,
        asSpan,
        now.length,
      );
    unmeasurable.push(
      'rod rigidity: no supported procedure; hand feel is qualitative',
    );
  }
  if (m.strand) {
    roles.push('binding');
    checks.push({
      check: `usable strand length toward the ${String(G.cord)} m binding minimum`,
      verdict: now.length ? 'measured' : 'unmeasured',
      reading: now.length ? now.length.id : null,
      metres: now.length ? now.length.value : null,
      uncertainty: now.length ? now.length.uncertainty : null,
    });
    unmeasurable.push(
      'wrapping pliability and breaking strength: no supported procedure',
    );
  }
  if (THIN.includes(p.stack.resource)) {
    roles.push('covering or bedding');
    unmeasurable.push(
      m.stem
        ? `water share at most ${String(G.dry)} and installed stem volume: water share has no supported procedure`
        : `${p.stack.resource} has no represented stem law, so its installed volume cannot be derived`,
    );
  }
  return {
    recipe: SHELTER,
    roles,
    checks,
    unmeasurable,
    failed,
    verdict: !roles.length
      ? 'not applicable'
      : failed.length
        ? 'fails'
        : 'undetermined',
    scope: SCOPE,
  };
}

/** Directly observable traits: handled ones always, visual ones only in light. */
function traits(w: V7World, p: Specimen, m: ShelterMeasure, dark: boolean) {
  const s = p.stack,
    r = w.resources.find((x) => x.id === s.resource),
    elongated = !!(m.rod ?? m.strand) || THIN.includes(s.resource),
    unseen = 'not seen: too dark',
    contact = p.source ? null : ex19MaterialContact(w, s),
    f = m.flexibility;
  return {
    material: r?.name ?? s.resource,
    resource: s.resource,
    form: m.rod
      ? 'elongated wood piece, long and slender'
      : m.stem
        ? 'long thin stem'
        : m.strand
          ? 'long pliable strand'
          : THIN.includes(s.resource)
            ? 'fine thin stems'
            : (collectiveFoodProfile(w, s)?.nutrition ?? 0) > 0
              ? 'food item'
              : 'material with no represented form',
    handFeel: !elongated
      ? 'not applicable: not an elongated piece'
      : f <= SMALL_FIRE.rigid
        ? 'stiff: does not bend under hand pressure'
        : f < PLIABLE
          ? 'bends a little under hand pressure'
          : 'pliable: bends and wraps by hand',
    wholeness: p.whole ? 'whole unit' : 'less than one whole unit',
    setting: p.setting,
    color: dark ? unseen : (r?.color ?? null),
    surface: dark
      ? unseen
      : m.waterShare <= G.dry + 1e-9
        ? 'looks dry'
        : m.waterShare < WET
          ? 'looks moist'
          : 'looks wet',
    damage: dark
      ? unseen
      : !contact
        ? 'none seen on the exposed unit'
        : contact.fractured
          ? 'fractured'
          : contact.contaminated
            ? 'contaminated surface'
            : 'none seen',
    worked: dark ? unseen : m.treated ? 'worked or treated' : 'plain',
    wear: dark ? unseen : m.condition < G.sound ? 'visibly worn' : 'none seen',
  };
}

/** Every reason a property cannot be read in this examination; empty when measure can read it. */
function blocked(
  p: Specimen,
  m: ShelterMeasure,
  property: Property,
  available: Calibration[],
  now: Partial<Record<Property, Reading>>,
  method: string | null,
): string[] {
  if (property === 'moisture')
    return [
      'moisture unavailable: no supported measurement procedure; visible dryness is qualitative',
    ];
  if (property === 'rigidity')
    return [
      'rigidity unavailable: no supported measurement procedure; hand feel is qualitative',
    ];
  const cylinder = !!(m.rod ?? m.strand),
    out: string[] = [];
  if (property === 'mass' && !available.some((t) => t.quantity === 'mass'))
    out.push(NO_BALANCE);
  if (
    (property === 'length' || property === 'diameter') &&
    !available.some((t) => t.quantity === 'length')
  )
    out.push(NO_REFERENCE);
  if (p.source) out.push(IN_PLACE);
  else if (!p.whole)
    out.push(
      'unresolved: less than one whole unit, whose geometry and mass are not represented',
    );
  else if (m.treated)
    out.push(
      'unresolved: a worked or treated item is not described by the plain-unit records',
    );
  if (property !== 'mass' && !cylinder)
    out.push(
      property === 'volume'
        ? `no applicable geometric method for ${p.stack.resource}`
        : `this world represents no ${property} for ${p.stack.resource}`,
    );
  if (property === 'volume' && cylinder && !p.source) {
    if (!now.length || !now.diameter)
      out.push(
        'volume needs your current length and diameter readings of this unit',
      );
    if (method !== 'cylinder')
      out.push('volume needs the stated geometric method cylinder');
  }
  return out;
}
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function view(
  c: V7ActionContext,
  r: Request,
  p: Specimen,
  status: string,
  extra: V7Data,
): V7Data {
  return {
    operation: ID,
    mode: r.mode,
    actor: c.actor.id,
    target: p.target,
    specimen: p.number,
    setting: p.setting,
    property: r.mode === 'measure' ? (r.properties[0] ?? null) : null,
    status,
    progress: status === 'handling' ? 0 : 1,
    rounds: 1,
    x: c.actor.position.x,
    y: c.actor.position.y,
    withinReach: true,
    overlay: status === 'handling' ? 'handling within reach' : null,
    tool: null,
    instrument: null,
    value: null,
    units: null,
    uncertainty: null,
    evidence: null,
    label: status === 'qualitative' ? 'qualitative traits only' : 'unavailable',
    ...extra,
  };
}
function log(c: V7ActionContext, record: V7Data) {
  c.actor.extensionState[STATE] = {
    records: [...records(c.actor), record].slice(-LOG),
  };
}
function conditions(w: V7World, a: V7Actor): V7Data {
  const k = forestClimate(w, a.position);
  return {
    light: round(k.light),
    temperature: round(k.temperature),
    rain: round(k.rain ?? 0),
    indoor: k.indoor,
  };
}
/** The start of the paid round: the person handles the specimen within reach, with the tool
 * physically present when one is used. */
function handled(
  c: V7ActionContext,
  r: Request,
  p: Specimen,
  tool: Calibration | null,
) {
  c.emit(
    EVENT('handled'),
    `${c.actor.name} handled ${p.source ? `one unit of ${p.target} in place` : `unit ${String(p.number)} of ${p.target}`} within reach to ${r.mode === 'measure' ? `measure ${r.properties[0] ?? ''}` : 'inspect it'}${tool ? ` with ${tool.tool}` : ''}.`,
    {
      target: p.target,
      specimen: p.number,
      mode: r.mode,
      view: view(c, r, p, 'handling', {
        tool: tool?.tool ?? null,
        instrument: tool?.form ?? null,
      }),
    },
    p.target,
  );
}

function inspect(c: V7ActionContext, r: Request): V7HandlerResult {
  const { world: w, actor: a } = c,
    p = specimen(c, r),
    t = tools(c, r, p.target),
    m = shelterMeasure(w, p.stack),
    state = stateOf(w, p, m),
    now = current(a, p, state);
  if (a.vitals.energy + 1e-8 < ENERGY)
    throw nothing('An examination needs 0.2 energy.');
  v7Spend(a, ENERGY);
  handled(c, r, p, null);
  const dark = !!ex19MaterialDark(w, a),
    q = traits(w, p, m, dark),
    asked = r.properties.length ? r.properties : [...PROPERTIES],
    metric: V7Data = {};
  for (const x of asked) {
    const why = blocked(p, m, x, t.usable, now, 'cylinder');
    metric[x] = why.length
      ? why.join('; ')
      : x === 'volume'
        ? 'not derived: measure volume with method cylinder from your current readings'
        : 'not measured: inspect is qualitative; measure reads it with the named reference';
  }
  const dimensions = [
    ...new Set(
      (['length', 'diameter'] as const).flatMap((x) =>
        blocked(p, m, x, t.usable, now, null),
      ),
    ),
  ];
  const shelter = recipe(p, m, now),
    id = `examination-${String(w.tick)}-${a.id}`,
    limitations = [
      SCOPE,
      STALE,
      ...(p.source
        ? ['in place in its source: only the exposed unit was seen and felt']
        : []),
      ...(dark ? ['too dark to see surfaces: visual traits not seen'] : []),
      ...t.rejected,
    ],
    source = p.source
      ? {
          stock: p.source.data.stock ?? null,
          growth: p.source.data.growth ?? null,
          stage: p.source.data.stage ?? null,
          soil: openConditions(w, p.source.spatial).regime,
        }
      : null;
  openRemember(c, {
    key: `${p.target}:unit-${String(p.number)}:traits`,
    subject: p.stack.resource,
    property: 'qualitative traits of one handled unit',
    value: v7Json({
      target: p.target,
      specimen: p.number,
      traits: q,
      metric,
      shelter: shelter.verdict,
    }),
    method: 'nondestructive handling and looking within reach',
    condition: `${SCOPE}; ${STALE}`,
    verified: false,
  });
  const evidence = w.events.at(-1)?.id ?? '';
  log(c, {
    id,
    round: w.tick,
    actor: a.id,
    mode: 'inspect',
    target: p.target,
    specimen: p.number,
    setting: p.setting,
    resource: p.stack.resource,
    origin: p.stack.origin,
    state,
    property: null,
    status: 'qualitative',
    traits: v7Json(q),
    metric,
    shelter: shelter.verdict,
    tools: r.tools,
    evidence,
    rounds: 1,
    energy: ENERGY,
  });
  c.emit(
    EVENT('inspected'),
    `Qualitative examination of ${p.source ? `one unit of ${p.target} in place` : `unit ${String(p.number)} of ${p.target}`} (${q.material}): ${q.form}; ${q.handFeel}; ${q.surface}. ${dimensions.length ? sentence(dimensions.join('; ')) : 'Length and diameter not measured in inspect'}. Shelter recipe suitability: ${shelter.verdict}. Nothing was consumed, reserved or moved.`,
    {
      examination: id,
      record: evidence,
      target: p.target,
      specimen: p.number,
      setting: p.setting,
      resource: p.stack.resource,
      origin: p.stack.origin,
      qualitative: v7Json(q),
      metric,
      source,
      shelter,
      conditions: conditions(w, a),
      limitations,
      consumed: 0,
      reserved: false,
      moved: false,
      energy: ENERGY,
      view: view(c, r, p, 'qualitative', {
        evidence,
        unavailable: Object.keys(metric),
        shelterVerdict: shelter.verdict,
      }),
    },
    p.target,
  );
  return { complete: true, writes: [] };
}

/** A calibrated reading of a represented dimension or mass. */
function reading(
  truth: number,
  t: Calibration,
  lengthwise: boolean,
  lay: boolean,
) {
  const placements = lengthwise
      ? Math.max(1, Math.ceil(truth / t.range - 1e-9))
      : 1,
    steps = Math.round(truth / t.resolution),
    value = steps > 0 ? round(steps * t.resolution) : null,
    over = !lengthwise && truth > t.range + 1e-12;
  const uncertainty =
    value === null || over
      ? null
      : round(
          placements * (t.uncertainty + t.resolution / 2) +
            (lay ? LAY * value : 0),
        );
  return {
    value: over ? null : value,
    uncertainty,
    placements,
    limitation: over
      ? `beyond the ${String(t.range)} ${t.unit} range of ${t.tool}; more than ${String(t.range)} ${t.unit}`
      : value === null
        ? `below the ${String(t.resolution)} ${t.unit} resolution of ${t.tool}; less than ${String(round(t.resolution / 2))} ${t.unit}`
        : null,
  };
}

function measure(c: V7ActionContext, r: Request): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (r.properties.length !== 1)
    throw nothing(
      'measure reads exactly one property per round; name it in properties.',
    );
  const property = r.properties[0] ?? 'length',
    p = specimen(c, r),
    t = tools(c, r, p.target),
    m = shelterMeasure(w, p.stack),
    state = stateOf(w, p, m),
    now = current(a, p, state),
    why = blocked(p, m, property, t.usable, now, r.method);
  if (why.length)
    throw nothing(
      `${sentence(why.join('; '))}.${t.rejected.length ? ` Named tools: ${t.rejected.join('; ')}.` : ''}${
        why.includes(NO_REFERENCE)
          ? ' Unmet requirement: a real graduated tool or a previously calibrated physical reference, serviceable and within reach, named in tools; body size, coordinates and stock are never references. inspect records qualitative traits.'
          : why.includes(NO_BALANCE)
            ? ' Unmet requirement: a functioning calibrated balance with a verified tare within reach, named in tools.'
            : ''
      }`,
    );
  const dark = property === 'volume' ? null : ex19MaterialDark(w, a);
  if (dark) throw nothing(`${dark} A reading needs light.`);
  if (a.vitals.energy + 1e-8 < ENERGY)
    throw nothing('An examination needs 0.2 energy.');
  const tool =
    property === 'volume'
      ? null
      : (t.usable.find(
          (x) => x.quantity === (property === 'mass' ? 'mass' : 'length'),
        ) ?? null);
  v7Spend(a, ENERGY);
  handled(c, r, p, tool);
  let value: number | null,
    uncertainty: number | null,
    unit: string,
    method: string,
    placements = 1,
    limitation: string | null = null,
    basis: string[] = [];
  if (property === 'volume') {
    const L = now.length,
      D = now.diameter;
    if (!L || !D) throw new Error('Missing current readings.');
    const v = (Math.PI / 4) * D.value * D.value * L.value;
    value = round(v);
    uncertainty = round(
      v * ((2 * D.uncertainty) / D.value + L.uncertainty / L.value),
    );
    unit = 'm3';
    method =
      'cylinder: pi/4 x diameter^2 x length from current readings; envelope volume of this unit, not a packed or bulk volume';
    basis = [L.id, D.id];
  } else if (tool) {
    const lengthwise = property === 'length',
      truth =
        property === 'mass'
          ? m.unitMass
          : property === 'length'
            ? (m.rod?.length ?? m.strand?.length ?? 0)
            : (m.rod?.diameter ?? m.strand?.diameter ?? 0),
      x = reading(
        truth,
        tool,
        lengthwise,
        lengthwise && m.flexibility >= PLIABLE && !m.rod,
      );
    value = x.value;
    uncertainty = x.uncertainty;
    placements = x.placements;
    limitation = x.limitation;
    unit = tool.unit;
    method =
      property === 'mass'
        ? `weighed alone on ${tool.tool} after its verified tare`
        : property === 'length'
          ? `both ends exposed and ${m.rod ? 'laid' : 'laid out straight by hand'} along ${tool.tool} in ${String(placements)} placement(s)`
          : `read across the unit against ${tool.tool}`;
  } else throw new Error('Missing calibrated tool.');
  const status = value === null ? 'limited' : 'measured',
    id = `examination-${String(w.tick)}-${a.id}`,
    after = { ...now },
    record: V7Data = {
      id,
      round: w.tick,
      actor: a.id,
      mode: 'measure',
      target: p.target,
      specimen: p.number,
      setting: p.setting,
      resource: p.stack.resource,
      origin: p.stack.origin,
      state,
      property,
      status,
      value,
      unit,
      uncertainty,
      resolution: tool?.resolution ?? null,
      placements,
      method,
      tool: tool?.tool ?? null,
      calibration: tool?.provenance ?? null,
      basis,
      limitation,
      rounds: 1,
      energy: ENERGY,
    };
  if (value !== null && uncertainty !== null)
    after[property] = { id, value, uncertainty };
  const shelter = recipe(p, m, after);
  openRemember(c, {
    key: `${p.target}:unit-${String(p.number)}:${property}`,
    subject: p.stack.resource,
    property: `measured ${property} of one handled unit`,
    value: v7Json({
      target: p.target,
      specimen: p.number,
      property,
      value,
      unit,
      uncertainty,
      limitation,
      tool: tool?.tool ?? null,
      shelter: shelter.verdict,
    }),
    method,
    condition: `${SCOPE}; ${STALE}`,
    verified: false,
  });
  const evidence = w.events.at(-1)?.id ?? '';
  log(c, { ...record, shelter: shelter.verdict, evidence });
  const shown =
    value === null
      ? `${property} not read: ${limitation ?? ''}`
      : `${property} ${String(value)} ± ${String(uncertainty)} ${unit}`;
  c.emit(
    value === null ? EVENT('limited') : EVENT('measured'),
    `${value === null ? 'Tried to measure' : 'Measured'} unit ${String(p.number)} of ${p.target}: ${shown}${tool ? ` (${tool.form} ${tool.tool}, resolution ${String(tool.resolution)} ${tool.unit})` : ''}. ${value === null ? 'No value is recorded. ' : ''}Shelter recipe suitability: ${shelter.verdict}. This unit only; nothing was consumed, reserved or moved.`,
    {
      ...record,
      examination: id,
      record: evidence,
      conditions: conditions(w, a),
      scope: SCOPE,
      limitations: [
        SCOPE,
        STALE,
        ...(limitation ? [limitation] : []),
        ...t.rejected,
      ],
      shelter,
      consumed: 0,
      reserved: false,
      moved: false,
      view: view(c, r, p, status, {
        tool: tool?.tool ?? null,
        instrument: tool ? tool.form : null,
        value,
        units: unit,
        uncertainty,
        evidence,
        label: value === null ? `${property} unavailable` : shown,
        shelterVerdict: shelter.verdict,
      }),
    },
    p.target,
  );
  return { complete: true, writes: [] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const r = request(c);
  return r.mode === 'measure' ? measure(c, r) : inspect(c, r);
}

/** ex24: Kai's request to measure candidate shelter materials. */
export const LONG_EX24_MATERIAL_EXAMINATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex24',
  dependencies: ['foundation-open@1'],
  description:
    'A general nondestructive one-round examination of one accessible specimen: qualitative traits by handling and looking, and single-property readings of length, diameter or mass only with a calibrated reference or instrument physically present, a cylinder volume from current readings, and within-uncertainty comparison with the construct-weather-shelter@1 recipe checks. Moisture and rigidity are unavailable. Nothing is consumed, reserved or moved.',
  reuse: {
    experiment:
      'ex24 construct-weather-shelter@1 (the record-derived rod, strand and stem measures that its free refusal reads, its recipe thresholds and minimum rod lengths); foundation-open@1 probe observe (the visible source state) and its personal records; ex19 material contact, light and whole-unit checks; ex21 small-combustion-source@1 (the rigidity limit behind the stiff hand-feel class)',
    source:
      'long-ex24-weather-shelter-physics.ts (shelterMeasure, shelterMinLength, WEATHER_SHELTER); open-foundation.ts (openRemember; the probe observe value is mirrored, not called); forest-references.ts (forestResolveReference for target and tools); long-ex19-material-contact.ts (ex19MaterialContact, ex19MaterialDark, ex19MaterialWhole); long-ex21-small-combustion-physics.ts (SMALL_FIRE.rigid); open-physical.ts (openConditions); forest-climate.ts',
    description:
      'Implementation reuse only; every existing package is unchanged and no tool, balance, reference, calibration, skill or mastery is supplied. New: the specimen and calibration-record checks, the reading and uncertainty rule, the cylinder volume, the within-uncertainty recipe comparison and the examination log.',
  },
  abilities: [
    {
      id: ID,
      name: 'Examine material',
      function:
        'Nondestructively examine one accessible specimen (own item, loose ground item or one unit in place in a source): inspect records qualitative traits; measure reads one property with a calibrated reference you name.',
      equivalence: 'measurement:material-specimen:nondestructive-examination:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: [...MODES] },
          target: { type: 'string' },
          specimen: { type: 'integer', minimum: 1 },
          properties: {
            type: 'array',
            items: { type: 'string', enum: [...PROPERTIES] },
          },
          tools: { type: 'array', items: { type: 'string' } },
          method: { type: 'string', enum: ['cylinder'] },
        }),
        required: ['mode', 'target'],
      },
      references: { target: 'optional-exact-visible' },
      prerequisites: [],
      learning: LEARNING,
      learningEnergy: STUDY,
      costs:
        'Study 2 rounds, 0.2 energy each. inspect or measure: 1 round, 0.2 energy; target in reach; specimen is a unit number (default 1). measure: one property; length or diameter needs tools naming a serviceable item with a verified length calibration record, mass a calibrated balance with a verified tare, volume method cylinder and your current length and diameter readings of that unit; tool readings need light; every value needs a separated whole plain unit. Every check precedes payment: a refused request costs nothing. Travel and other specimens or properties are separate actions.',
      effects:
        'A personal record and event: target, unit, method, tool and calibration provenance, value, units, resolution, uncertainty, conditions, scope and limits. inspect: form, hand feel, visible dryness, damage, wear, treatment, wholeness; metric values unavailable without a calibrated reference (none exists here; body size, coordinates and stock are never used). measure: value rounded to the resolution; uncertainty = placements x (calibration uncertainty + half the resolution), plus 1% of the length for a strand laid out by hand; below resolution or over range is a paid limit with no value. Units in place, partial or worked items get no reading. Moisture and rigidity are unavailable. construct-weather-shelter@1 rod checks are judged over the uncertainty (meets, fails, indeterminate); suitability stays undetermined unless a check fails. A reading covers that unit and goes stale when its record changes. Nothing is consumed, reserved or moved. No reward.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // The completion events carry no qualified flag: examinations earn no practice milestone.
      practiceEvidence: EVENT('measured'),
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic: each inspect or measure is one paid round that commits when it completes; nothing is reserved, paused or resumed.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: [
    EVENT('handled'),
    EVENT('inspected'),
    EVENT('measured'),
    EVENT('limited'),
  ],
  resources: [],
  satisfaction: [],
};

/** The unchanged checks that ex24 length-reference@1 reuses: target resolution, qualitative
 * traits, calibration-record validation, the reading rule and the unit-record digest.
 * assess-food-evidence@1 also reads the examination log to check a cited record's currency. */
export type {
  Calibration as MaterialCalibration,
  Specimen as MaterialSpecimen,
};
export {
  calibration as materialCalibration,
  digest as materialDigest,
  reading as materialReading,
  records as materialRecords,
  specimen as materialSpecimen,
  stateOf as materialUnitState,
  traits as materialTraits,
};
