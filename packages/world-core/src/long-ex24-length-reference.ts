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
import { v7Json, v7RoundNumber } from './continuous-data.js';
import { v7Distance, v7Reach } from './continuous-geometry.js';
import { expressionSign } from './expression.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { forestResolveReference } from './forest-references.js';
import { openConditions } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  ex19MaterialContact,
  ex19MaterialDark,
  ex19MaterialWhole,
} from './long-ex19-material-contact.js';
import {
  WEATHER_SHELTER as G,
  shelterMeasure,
} from './long-ex24-weather-shelter-physics.js';
import type { ShelterMeasure } from './long-ex24-weather-shelter-physics.js';
import {
  MATERIAL_CALIBRATION,
  materialCalibration,
  materialDigest,
  materialReading,
  materialSpecimen,
  materialTraits,
  materialUnitState,
} from './long-ex24-material-examination.js';
import type {
  MaterialCalibration,
  MaterialSpecimen,
} from './long-ex24-material-examination.js';

/** ex24: investigate and transfer length references. investigate examines one accessible
 * candidate for a valid length calibration record (examine-material@1's format and checks) and
 * for use as an uncalibrated, non-metric comparison span. With a real calibrated source, transfer
 * compares a suitable carrier's whole end-to-end length with it and verify repeats the comparison
 * and writes a single-span calibration record that examine-material@1 reads. No installed
 * mechanism makes durable physical marks, so no span is laid off and nothing is graduated. */

const ID = 'length-reference';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
const EVENT = (s: string) => `length-reference-${s}`;
/** Per-person log of steps and the one pending transfer, the only actor state kept. */
const STATE = `long:${ID}`;
/** investigate, transfer and verify: one round and 0.2 energy each (specification). */
const ENERGY = 0.2;
/** Study: two rounds at 0.2 energy per completed round (specification). */
const STUDY = 0.2;
const LEARNING = 2;
const LOG = 16;
const MODES = [
  'investigate',
  'transfer',
  'verify',
  'resume',
  'cancel',
] as const;
type Mode = (typeof MODES)[number];
export const LENGTH_REFERENCE_SCOPED =
  'no qualifying standard established among these examined candidates';
const MISSING =
  'Missing standard: a physically present, serviceable reference whose verified length calibration record states an independently justified length, unit, uncertainty, resolution, range, provenance and calibrating revision, named in source. None is established here; body size, coordinates, stock counts, recipe dimensions, display scale, names and marks never qualify. Zero fabrication progress; investigate remains available.';
const NO_MARKS =
  'no installed mechanism makes durable physical marks on a piece (a name or mark is a separate sign with no physical effect)';
const SPAN =
  'non-metric: the whole piece end to end, in no unit; it can show another piece as longer, shorter or about the same and is never a calibration';
const SUPPORTED =
  'one end-to-end span only: resolution and range equal the span; no subdivisions and no diameter';

const round = (x: number) => v7RoundNumber(x);
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const text = (v: V7Json | undefined) => (typeof v === 'string' ? v.trim() : '');
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const isData = (v: unknown): v is V7Data =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'unknown identity';
const lifeOf = (a: V7Actor) => a.life?.deaths ?? 0;

interface Job extends V7Data {
  id: string;
  carrier: string;
  source: string;
  life: number;
  comparedAt: number;
  value: number;
  uncertainty: number;
  placements: number;
  carrierState: string;
  sourceState: string;
  standard: string;
  evidence: string;
}
function memory(a: V7Actor) {
  const s = a.extensionState[STATE],
    o = isData(s) ? s : {},
    records = Array.isArray(o.records) ? o.records.filter(isData) : [],
    job = isData(o.job) ? (o.job as Job) : null;
  return { records, job, current: job && job.life === lifeOf(a) ? job : null };
}
function save(a: V7Actor, add: V7Data[], job: Job | null) {
  a.extensionState[STATE] = {
    records: [...memory(a).records, ...add].slice(-LOG),
    job,
  };
}

/** The piece without this operation's calibration record: its physical unit record. */
function plain(s: V7Stack): V7Stack {
  const rest = Object.fromEntries(
      Object.entries(s.processing ?? {}).filter(
        ([k]) => k !== MATERIAL_CALIBRATION,
      ),
    ),
    copy: V7Stack = { ...s };
  if (Object.keys(rest).length) copy.processing = rest;
  else delete copy.processing;
  return copy;
}
const unitOf = (
  s: V7Stack,
  setting: MaterialSpecimen['setting'],
): MaterialSpecimen => ({
  target: s.id,
  number: 1,
  setting,
  stack: s,
  source: null,
  whole: ex19MaterialWhole(s) >= 1,
});
/** examine-material@1's unit-record digest of the plain piece; position and owner excluded. */
const pieceState = (w: V7World, s: V7Stack) => {
  const p = plain(s);
  return materialUnitState(w, unitOf(p, 'carried'), shelterMeasure(w, p));
};
const recordOf = (w: V7World, id: string): V7Data | null => {
  const s = w.stacks.find((x) => x.id === id),
    raw = s
      ? s.processing?.[MATERIAL_CALIBRATION]
      : w.objects.find((x) => x.id === id)?.data[MATERIAL_CALIBRATION];
  return isData(raw) ? raw : null;
};
function conditions(w: V7World, a: V7Actor): V7Data {
  const k = forestClimate(w, a.position);
  return {
    light: round(k.light),
    temperature: round(k.temperature),
    rain: round(k.rain ?? 0),
    indoor: k.indoor,
  };
}
function view(c: V7ActionContext, mode: Mode, extra: V7Data): V7Data {
  return {
    operation: ID,
    mode,
    actor: c.actor.id,
    target: null,
    source: null,
    carrier: null,
    sourceRevision: null,
    status: 'done',
    calibration: 'unknown',
    units: null,
    span: null,
    range: null,
    resolution: null,
    uncertainty: null,
    marks: [],
    step: mode,
    progress: 1,
    rounds: mode === 'cancel' ? 0 : 1,
    x: c.actor.position.x,
    y: c.actor.position.y,
    withinReach: true,
    overlay: mode === 'cancel' ? null : 'handling within reach',
    evidence: null,
    visibility: 'private evidence record; no outward change to any item',
    label: 'no calibrated reference',
    ...extra,
  };
}

/** One exact visible identity through the shared resolver, or why it is not resolved. */
function resolve(c: V7ActionContext, label: string, id: string) {
  if (!id) return { id: '', why: [] };
  try {
    return {
      id: forestResolveReference(
        c.world,
        c.actor,
        id,
        'optional-exact-visible',
      ),
      why: [],
    };
  } catch (error) {
    return {
      id: '',
      why: [`${label} ${id} is not resolved (${message(error)})`],
    };
  }
}

/** The verified length calibration a named source carries, or every reason it is not one. */
function sourceOf(
  c: V7ActionContext,
  id: string,
): { t: MaterialCalibration | null; why: string[] } {
  if (!id) return { t: null, why: ['no source named'] };
  const t = materialCalibration(c.world, c.actor, id, '');
  if (typeof t === 'string') return { t: null, why: [t] };
  if (t.quantity !== 'length')
    return {
      t: null,
      why: [`${id} is a calibrated balance, not a length reference`],
    };
  return { t, why: [] };
}

/** Why a separated piece is not a whole, rigid, straight, plain and sound span. */
function pieceProblems(w: V7World, s: V7Stack, m: ShelterMeasure): string[] {
  const out: string[] = [],
    contact = ex19MaterialContact(w, s);
  if (!m.rod)
    out.push(
      m.strand
        ? 'a pliable strand, not a rigid piece'
        : 'not an elongated wood piece',
    );
  else if (!m.rod.rigid) out.push('bends under hand pressure: not rigid');
  if (ex19MaterialWhole(s) < 1) out.push('less than one whole unit');
  if (m.treated) out.push('worked or treated');
  if (m.condition < G.sound) out.push('visibly worn');
  if (contact.fractured) out.push('fractured');
  return out;
}

interface Carrier {
  stack: V7Stack | null;
  m: ShelterMeasure | null;
  why: string[];
}
/** The named carrier: one separated whole rigid plain piece, the person's or loose in reach. */
function carrierOf(
  c: V7ActionContext,
  id: string,
  source: string,
  t: MaterialCalibration | null,
  verifying: boolean,
): Carrier {
  const { world: w, actor: a } = c;
  if (!id)
    return {
      stack: null,
      m: null,
      why: [
        'name the carrier: one separated whole rigid wood piece, yours or loose within reach',
      ],
    };
  const resolved = id;
  const s = w.stacks.find((x) => x.id === resolved);
  if (!s)
    return {
      stack: null,
      m: null,
      why: [
        `${resolved} is an object or a source in place; the carrier must be a separated item (gather one unit first)`,
      ],
    };
  if (resolved === source)
    return {
      stack: null,
      m: null,
      why: ['the carrier cannot be its own source'],
    };
  if (s.owner !== null && s.owner !== a.id)
    return { stack: null, m: null, why: [`${s.id} is another person's item`] };
  const why: string[] = [];
  if (s.owner === null) {
    if (v7Distance(a.position, s.position) > a.radius + w.config.interaction)
      why.push(`${s.id} is beyond reach`);
    if (openConditions(w, s.position).hazards.length)
      why.push(`${s.id} lies under a hazard`);
  }
  const p = plain(s),
    m = shelterMeasure(w, p),
    whole = ex19MaterialWhole(s);
  why.push(...pieceProblems(w, p, m));
  if (whole > 1)
    why.push(
      `${s.id} holds ${String(whole)} units; separate one (drop one unit) to use it alone`,
    );
  const raw = recordOf(w, s.id);
  if (raw && raw.revision !== REVISION)
    why.push(
      `${s.id} already carries another instrument's calibration record, which is not overwritten`,
    );
  else if (raw && raw.verified === true && !verifying)
    why.push(`${s.id} already carries a current verified span`);
  if (t && m.rod && m.rod.length > t.range + 1e-9)
    why.push(
      `${s.id} is longer than the ${String(t.range)} m range of ${t.tool}; stepping the source along it needs intermediate marks, and ${NO_MARKS}`,
    );
  return { stack: s, m, why };
}

// ---------------------------------------------------------------- investigate

interface Candidate {
  id: string;
  specimen: MaterialSpecimen | null;
  object: V7Object | null;
}
/** examine-material@1's target resolution for items and sources; any other object in reach. */
function candidate(c: V7ActionContext, id: string): Candidate {
  const { world: w, actor: a } = c,
    o = w.objects.find((x) => x.id === id),
    resource = o ? text(o.data.resource) : '';
  if (!o || (resource && w.resources.some((r) => r.id === resource))) {
    const p = materialSpecimen(c, {
      mode: 'inspect',
      target: id,
      number: 1,
      properties: [],
      tools: [],
      method: null,
    });
    return {
      id: p.target,
      specimen: p.source ? p : { ...p, stack: plain(p.stack) },
      object: p.source,
    };
  }
  if (!v7Reach(a, o.spatial))
    throw nothing(`${o.id} is beyond reach; move next to it first.`);
  if (openConditions(w, o.spatial).hazards.length)
    throw nothing(`${o.id} is under a hazard and is not safely accessible.`);
  return { id: o.id, specimen: null, object: o };
}

function investigate(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c,
    id = text(c.action.args.target);
  if (!id)
    throw nothing(
      'Name the exact candidate id in target: your own item, a loose item or an object within reach.',
    );
  const k = candidate(c, id);
  if (a.vitals.energy + 1e-8 < ENERGY)
    throw nothing('An investigation needs 0.2 energy.');
  v7Spend(a, ENERGY);
  const p = k.specimen,
    m = p ? shelterMeasure(w, p.stack) : null,
    dark = !!ex19MaterialDark(w, a),
    q = p && m ? materialTraits(w, p, m, dark) : null,
    t = materialCalibration(w, a, k.id, ''),
    raw = recordOf(w, k.id),
    qualifies = typeof t !== 'string' && t.quantity === 'length',
    stale = raw?.revision === REVISION && raw.state === 'stale',
    status =
      typeof t === 'string'
        ? `${t}${stale ? ` (stale since round ${String(Number(raw.staleAt))})` : ''}`
        : qualifies
          ? `${k.id} carries a complete verified length calibration: ${t.form}, resolution ${String(t.resolution)} m, uncertainty ${String(t.uncertainty)} m, range ${String(t.range)} m, standard ${text(t.provenance.standard)}`
          : `${k.id} carries a verified mass calibration (balance); it is not a length reference`;
  const span = !p
      ? ['an object in place, not a separable piece']
      : p.source
        ? [
            'in place in its source: gather one unit to handle it as a separate piece',
          ]
        : m
          ? pieceProblems(w, p.stack, m)
          : [],
    sighted =
      !span.length && dark
        ? ['straightness not judged: too dark to sight along it']
        : [],
    spanWhy = [...span, ...sighted],
    whole = p && !p.source ? ex19MaterialWhole(p.stack) : 0,
    carrierWhy = [
      ...spanWhy,
      ...(whole > 1
        ? [`holds ${String(whole)} units; separate one to use it as a carrier`]
        : []),
    ],
    signs = w.objects
      .filter((o) => expressionSign(o) && o.data.subject === k.id)
      .map((o) => `${o.id} ("${text(o.data.text)}")`);
  const observed = [
      q
        ? `${q.material}: ${q.form}; ${q.handFeel}; ${q.wholeness}; ${q.setting}; ${q.worked}`
        : `${k.object?.name ?? k.id} (${k.object?.kind ?? 'object'}), an object in place`,
      status,
      spanWhy.length
        ? `not an uncalibrated comparison span: ${spanWhy.join('; ')}`
        : `usable as an uncalibrated comparison span (${SPAN})`,
    ],
    unsupported = [
      qualifies
        ? 'any length beyond its recorded range or finer than its resolution'
        : 'any length of this candidate in metres or another unit',
      ...signs.map((s) => `the name or mark ${s}: a sign carries no length`),
      ...(p?.source
        ? ['the separated geometry of a unit still in its source']
        : []),
    ],
    unknowns = [
      ...(qualifies
        ? []
        : [
            'its length in any unit: no calibrated reference was compared with it',
          ]),
      ...((m?.rod ?? m?.strand)
        ? ['straightness and end squareness beyond hand-and-eye inspection']
        : []),
      'whether a qualifying standard exists among candidates not examined',
      ...(dark ? ['visual traits: too dark to see surfaces'] : []),
    ];
  const prior = memory(a).records.filter((x) => x.mode === 'investigate'),
    examined = [...new Set([...prior.map((x) => text(x.candidate)), k.id])],
    found = [
      ...new Set([
        ...prior
          .filter((x) => x.qualifies === true)
          .map((x) => text(x.candidate)),
        ...(qualifies ? [k.id] : []),
      ]),
    ],
    conclusion = found.length
      ? `qualifying standard established among these examined candidates: ${found.join(', ')} (each as found when examined)`
      : `${LENGTH_REFERENCE_SCOPED}: ${examined.join(', ')}`,
    state = materialDigest({
      unit:
        p && m ? materialUnitState(w, p, m) : v7Json(k.object?.data ?? null),
      record: raw,
    }),
    finding = `${status} | ${spanWhy.join('; ')}`,
    newFinding = !prior.some(
      (x) => x.candidate === k.id && x.state === state && x.finding === finding,
    ),
    calibration = qualifies
      ? 'verified'
      : stale
        ? 'stale'
        : spanWhy.length
          ? 'unknown'
          : 'comparison-only',
    source =
      k.object && p?.source
        ? {
            stock: k.object.data.stock ?? null,
            growth: k.object.data.growth ?? null,
            stage: k.object.data.stage ?? null,
            soil: openConditions(w, k.object.spatial).regime,
          }
        : null;
  openRemember(c, {
    key: `${k.id}:length-reference`,
    subject: p?.stack.resource ?? k.object?.kind ?? 'object',
    property: 'length reference investigation of one candidate',
    value: v7Json({
      candidate: k.id,
      observed,
      unsupported,
      unknowns,
      conclusion,
    }),
    method: 'handling and looking within reach; calibration record check',
    condition:
      'this candidate as examined this round; candidates not examined are not covered',
    verified: false,
  });
  const evidence = w.events.at(-1)?.id ?? '';
  let spanRecord: string | null = null;
  if (!spanWhy.length && p) {
    openRemember(c, {
      key: `${k.id}:comparison-span`,
      subject: p.stack.resource,
      property: 'uncalibrated comparison span (non-metric)',
      value: v7Json({
        candidate: k.id,
        span: 'end-to-end length of this whole piece',
        unit: null,
        metric: false,
        calibration: 'none',
        use: SPAN,
      }),
      method: 'handled whole and sighted along in light; no unit or standard',
      condition: 'valid while this piece is unchanged; never a calibration',
      verified: false,
    });
    spanRecord = w.events.at(-1)?.id ?? null;
  }
  const id2 = `${ID}-${String(w.tick)}-${a.id}`;
  save(
    a,
    [
      {
        id: id2,
        round: w.tick,
        actor: a.id,
        mode: 'investigate',
        candidate: k.id,
        state,
        finding,
        status,
        qualifies,
        comparisonSpan: !spanWhy.length,
        evidence,
        rounds: 1,
        energy: ENERGY,
      },
    ],
    memory(a).job,
  );
  c.emit(
    EVENT('investigated'),
    `${a.name} investigated ${k.id} as a length reference: ${status}. ${sentence(observed[2] ?? '')}. Conclusion: ${conclusion}. Nothing was consumed, reserved or moved.`,
    {
      investigation: id2,
      record: evidence,
      spanRecord,
      candidate: k.id,
      setting: p?.setting ?? 'object in place',
      resource: p?.stack.resource ?? null,
      qualitative: q ? v7Json(q) : null,
      source,
      observed,
      unsupported,
      unknowns,
      calibration: status,
      qualifies,
      comparisonSpan: {
        suitable: !spanWhy.length,
        reasons: spanWhy,
        metric: false,
      },
      carrier: { suitable: !carrierWhy.length, reasons: carrierWhy },
      conclusion,
      examined,
      newFinding,
      conditions: conditions(w, a),
      consumed: 0,
      reserved: false,
      moved: false,
      energy: ENERGY,
      view: view(c, 'investigate', {
        target: k.id,
        status: 'investigated',
        calibration,
        evidence,
        label: qualifies
          ? 'calibrated reference found'
          : spanWhy.length
            ? 'no calibrated reference'
            : 'comparison span only: no unit',
      }),
    },
    k.id,
  );
  return { complete: true, writes: [] };
}

// ------------------------------------------------------------ transfer, verify

/** Every reason a transfer or verification cannot run; refusals precede payment. */
function check(
  c: V7ActionContext,
  sourceId: string,
  carrierId: string,
  verifying: boolean,
) {
  const rs = resolve(c, 'source', sourceId),
    rk = resolve(c, 'carrier', carrierId),
    s = rs.why.length ? { t: null, why: rs.why } : sourceOf(c, rs.id),
    k: Carrier = rk.why.length
      ? { stack: null, m: null, why: rk.why }
      : carrierOf(c, rk.id, rs.id, s.t, verifying),
    dark = ex19MaterialDark(c.world, c.actor);
  return {
    t: s.t,
    k,
    why: [
      ...s.why,
      ...k.why,
      ...(dark
        ? [
            `${dark.charAt(0).toLowerCase()}${dark.slice(1).replace(/\.$/, '')}; aligning and reading need light`,
          ]
        : []),
      ...(c.actor.vitals.energy + 1e-8 < ENERGY
        ? ['this step needs 0.2 energy']
        : []),
    ],
  };
}
const refuse = (mode: Mode, why: string[], missing: boolean) =>
  nothing(`Cannot ${mode}: ${why.join('; ')}.${missing ? ` ${MISSING}` : ''}`);

interface Ids {
  source: string;
  carrier: string;
}
const named = (c: V7ActionContext): Ids => ({
  source: text(c.action.args.source),
  carrier: text(c.action.args.carrier),
});

function transfer(
  c: V7ActionContext,
  ids: Ids,
  resumed = false,
): V7HandlerResult {
  const { world: w, actor: a } = c,
    { t, k, why } = check(c, ids.source, ids.carrier, false),
    job = memory(a).current,
    /** A new comparison that replaces this carrier's invalidated one. */
    redo = !!job && !!k.stack && job.carrier === k.stack.id;
  if (job && k.stack && job.carrier !== k.stack.id)
    why.push(
      `a pending transfer onto ${job.carrier} exists; verify, resume or cancel it first`,
    );
  else if (
    job &&
    k.stack &&
    t &&
    job.source === t.tool &&
    job.sourceState === materialDigest(t.provenance) &&
    job.carrierState === pieceState(w, k.stack)
  )
    why.push(
      `${job.carrier} was already compared in round ${String(job.comparedAt)}; verify next`,
    );
  if (why.length || !t || !k.stack || !k.m?.rod)
    throw refuse(resumed ? 'resume' : 'transfer', why, !t);
  v7Spend(a, ENERGY);
  const r = materialReading(k.m.rod.length, t, true, false),
    id = `${ID}-${String(w.tick)}-${a.id}`,
    carrier = k.stack.id,
    base = {
      source: t.tool,
      carrier,
      sourceRevision: t.provenance.revision ?? null,
      sourceEvidence: t.provenance.evidence ?? null,
      standard: text(t.provenance.standard),
      method: `whole piece laid alongside ${t.tool} (${t.form}), one end aligned, far end read in light`,
      marks: 'none made: ' + NO_MARKS,
      expendables: 'none',
      redo,
      conditions: conditions(w, a),
      consumed: 0,
      moved: false,
      energy: ENERGY,
    };
  if (r.value === null) {
    save(
      a,
      [{ id, round: w.tick, mode: 'transfer', status: 'limited', ...base }],
      job,
    );
    c.emit(
      EVENT('aligned'),
      `${a.name} laid ${carrier} alongside ${t.tool}, but ${r.limitation ?? 'no reading was possible'}; no span was transferred. Nothing was consumed.`,
      {
        ...base,
        status: 'limited',
        limitation: r.limitation,
        view: view(c, 'transfer', {
          source: t.tool,
          carrier,
          status: 'limited',
          calibration: 'failed',
          label: 'comparison gave no reading',
        }),
      },
      carrier,
    );
    return { complete: true, writes: [] };
  }
  const uncertainty = round(r.placements * (t.uncertainty + t.resolution));
  c.emit(
    EVENT('aligned'),
    `${a.name} laid ${carrier} alongside ${t.tool}, ends aligned, and read its end-to-end length as ${String(r.value)} ± ${String(uncertainty)} m. Calibration pending: verify with a second comparison (1 round, 0.2 energy). No marks were made; the carrier is unchanged and nothing was consumed.`,
    {
      ...base,
      status: 'compared',
      reading: r.value,
      uncertainty,
      placements: r.placements,
      next: 'verify: 1 round, 0.2 energy, the same source and carrier in light',
      view: view(c, 'transfer', {
        source: t.tool,
        carrier,
        sourceRevision: t.provenance.revision ?? null,
        status: 'compared',
        calibration: 'pending',
        overlay: 'carrier aligned beside the source',
        label: 'calibration pending: not verified',
      }),
    },
    carrier,
  );
  const evidence = w.events.at(-1)?.id ?? '',
    next: Job = {
      id,
      carrier,
      source: t.tool,
      life: lifeOf(a),
      comparedAt: w.tick,
      value: r.value,
      uncertainty,
      placements: r.placements,
      carrierState: pieceState(w, k.stack),
      sourceState: materialDigest(t.provenance),
      standard: base.standard,
      evidence,
    };
  save(
    a,
    [
      {
        id,
        round: w.tick,
        mode: 'transfer',
        status: 'compared',
        reading: r.value,
        uncertainty,
        evidence,
        ...base,
      },
    ],
    next,
  );
  return { complete: true, writes: [] };
}

function verify(
  c: V7ActionContext,
  ids: Ids,
  mode: Mode = 'verify',
): V7HandlerResult {
  const { world: w, actor: a } = c,
    job = memory(a).current,
    { t, k, why } = check(
      c,
      ids.source || (job?.source ?? ''),
      ids.carrier || (job?.carrier ?? ''),
      true,
    );
  if (!job)
    why.unshift('no completed transfer comparison to verify: transfer first');
  else {
    if (t && t.tool !== job.source)
      why.push(
        `the pending comparison used ${job.source}; verify against the same source`,
      );
    if (k.stack && k.stack.id !== job.carrier)
      why.push(
        `the pending comparison is of ${job.carrier}, not ${k.stack.id}`,
      );
    else if (k.stack && pieceState(w, k.stack) !== job.carrierState)
      why.push(
        `the round ${String(job.comparedAt)} comparison is invalidated: the record of ${job.carrier} changed since; transfer again or resume`,
      );
    if (
      t &&
      t.tool === job.source &&
      materialDigest(t.provenance) !== job.sourceState
    )
      why.push(
        `the calibration record of ${job.source} changed since round ${String(job.comparedAt)}; transfer again or resume`,
      );
  }
  if (why.length || !job || !t || !k.stack || !k.m?.rod)
    throw refuse(mode, why, !t);
  v7Spend(a, ENERGY);
  const s = k.stack,
    r = materialReading(k.m.rod.length, t, true, false),
    gap = r.value === null ? Infinity : round(Math.abs(r.value - job.value)),
    agrees = gap <= r.placements * t.resolution + 1e-9,
    id = `${ID}-${String(w.tick)}-${a.id}`,
    base = {
      source: t.tool,
      carrier: s.id,
      sourceRevision: t.provenance.revision ?? null,
      comparison: job.evidence,
      readings: [job.value, r.value],
      repetitions: 2,
      placements: r.placements,
      endpointResolution: round(t.resolution / 2),
      conditions: conditions(w, a),
      consumed: 0,
      moved: false,
      energy: ENERGY,
    };
  if (!agrees || r.value === null) {
    save(a, [{ id, round: w.tick, mode, status: 'failed', ...base }], null);
    c.emit(
      EVENT('unverified'),
      `${a.name} compared ${s.id} with ${t.tool} again; the readings ${String(job.value)} and ${String(r.value)} m disagree beyond the alignment window, so the calibration is not verified. Transfer again; no calibration record was written.`,
      {
        ...base,
        status: 'failed',
        view: view(c, mode, {
          source: t.tool,
          carrier: s.id,
          status: 'failed',
          calibration: 'failed',
          label: 'verification failed: not calibrated',
        }),
      },
      s.id,
    );
    return { complete: true, writes: [] };
  }
  const value = r.value,
    uncertainty = round(r.placements * (t.uncertainty + t.resolution) + gap),
    carrierState = pieceState(w, s);
  openRemember(c, {
    key: `${s.id}:length-calibration`,
    subject: s.resource,
    property: 'verified single-span length calibration of one carried piece',
    value: v7Json({
      carrier: s.id,
      span: value,
      unit: 'm',
      uncertainty,
      source: t.tool,
      supported: SUPPORTED,
    }),
    method: `two end-to-end comparisons with ${t.tool}`,
    condition: 'valid while this piece is unchanged; any change makes it stale',
    verified: false,
  });
  const evidence = w.events.at(-1)?.id ?? '',
    record: V7Data = {
      verified: true,
      form: 'reference-length',
      quantity: 'length',
      unit: 'm',
      resolution: value,
      uncertainty,
      range: value,
      standard: `${job.standard} through ${t.tool}`,
      method: `end-to-end comparison of the whole piece with ${t.tool} (${t.form}) in light, 2 readings`,
      evidence,
      calibratedAt: w.tick,
      revision: REVISION,
      condition: k.m.condition,
      state: 'verified',
      span: value,
      source: t.tool,
      sourceRevision: t.provenance.revision ?? null,
      sourceEvidence: t.provenance.evidence ?? null,
      sourceUncertainty: t.uncertainty,
      comparison: job.evidence,
      readings: [job.value, value],
      placements: r.placements,
      carrierState,
      supported: SUPPORTED,
    };
  s.processing = { ...(s.processing ?? {}), [MATERIAL_CALIBRATION]: record };
  save(
    a,
    [
      {
        id,
        round: w.tick,
        mode,
        status: 'verified',
        evidence,
        span: value,
        uncertainty,
        ...base,
      },
    ],
    null,
  );
  c.emit(
    EVENT('verified'),
    `${a.name} compared ${s.id} with ${t.tool} a second time; both readings give ${String(value)} m, so its whole end-to-end span is a verified reference length of ${String(value)} ± ${String(uncertainty)} m (${SUPPORTED}). The piece is physically unchanged and unmarked; nothing was consumed.`,
    {
      ...base,
      status: 'verified',
      calibrationRecord: record,
      view: view(c, mode, {
        source: t.tool,
        carrier: s.id,
        sourceRevision: t.provenance.revision ?? null,
        status: 'verified',
        calibration: 'verified',
        units: 'm',
        span: value,
        range: value,
        resolution: value,
        uncertainty,
        evidence,
        visibility:
          'private calibration record on the piece; no outward change',
        label: `single span ${String(value)} ± ${String(uncertainty)} m`,
      }),
    },
    s.id,
  );
  return { complete: true, writes: [] };
}

/** The next step of the pending transfer with its recorded source and carrier: verification
 * while the comparison is still valid, otherwise the comparison again. */
function resume(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c,
    job = memory(a).current;
  if (!job) throw nothing('No pending transfer to resume.');
  const ids = { source: job.source, carrier: job.carrier },
    t = sourceOf(c, resolve(c, 'source', ids.source).id).t,
    s = w.stacks.find((x) => x.id === job.carrier),
    valid =
      !!t &&
      !!s &&
      materialDigest(t.provenance) === job.sourceState &&
      pieceState(w, s) === job.carrierState;
  return valid ? verify(c, ids, 'resume') : transfer(c, ids, true);
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c,
    job = memory(a).current;
  if (!job) throw nothing('No pending transfer to cancel.');
  save(
    a,
    [
      {
        id: `${ID}-${String(w.tick)}-${a.id}`,
        round: w.tick,
        mode: 'cancel',
        status: 'cancelled',
        carrier: job.carrier,
        source: job.source,
        energy: 0,
      },
    ],
    null,
  );
  c.emit(
    EVENT('cancelled'),
    `${a.name} cancelled the pending transfer onto ${job.carrier}. The carrier stays as it is, unmarked and uncalibrated; the round ${String(job.comparedAt)} comparison is not refunded.`,
    {
      carrier: job.carrier,
      source: job.source,
      comparison: job.evidence,
      energy: 0,
      refunded: 0,
      view: view(c, 'cancel', {
        carrier: job.carrier,
        source: job.source,
        status: 'cancelled',
        progress: 0,
        label: 'transfer cancelled: not calibrated',
      }),
    },
    job.carrier,
  );
  return { complete: true, writes: [] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = text(c.action.args.mode);
  if (mode === 'transfer') return transfer(c, named(c));
  if (mode === 'verify') return verify(c, named(c));
  if (mode === 'resume') return resume(c);
  if (mode === 'cancel') return cancel(c);
  return investigate(c);
}

/** Any later change of a verified piece's record (damage, wear, wetting, drying, splitting or
 * merging) makes its calibration stale at once; time never restores it. */
function environment(w: V7World) {
  for (const s of w.stacks) {
    const raw = s.processing?.[MATERIAL_CALIBRATION];
    if (!isData(raw) || raw.revision !== REVISION || raw.verified !== true)
      continue;
    if (pieceState(w, s) === raw.carrierState) continue;
    s.processing = {
      ...s.processing,
      [MATERIAL_CALIBRATION]: {
        ...raw,
        verified: false,
        state: 'stale',
        staleAt: w.tick,
        staleReason: 'the piece record changed after verification',
      },
    };
    forestEvent(
      w,
      EVENT('stale'),
      `The verified span on ${s.id} is now stale: the piece changed after verification. It needs a new comparison and verification before any further use.`,
      s.position,
      s.owner,
      {
        carrier: s.id,
        status: 'stale',
        view: {
          operation: ID,
          carrier: s.id,
          calibration: 'stale',
          marks: [],
          visibility: 'private calibration record; no outward change',
          label: 'calibration stale: not verified',
        },
      },
      s.id,
    );
  }
}

/** Death stops pending work; nothing was locked, and carried items follow the death rules. */
function onDeath(w: V7World, a: V7Actor) {
  const job = memory(a).job;
  if (!job) return;
  save(
    a,
    [
      {
        id: `${ID}-${String(w.tick)}-${a.id}`,
        round: w.tick,
        mode: 'stopped',
        status: 'stopped by death',
        carrier: job.carrier,
      },
    ],
    null,
  );
  forestEvent(
    w,
    EVENT('stopped'),
    `${a.name}'s pending transfer onto ${job.carrier} stopped at death; the carrier is unchanged and uncalibrated.`,
    a.position,
    a.id,
    {
      carrier: job.carrier,
      status: 'stopped',
      view: {
        operation: ID,
        carrier: job.carrier,
        calibration: 'unknown',
        marks: [],
        label: 'transfer stopped: not calibrated',
      },
    },
    job.carrier,
  );
}

/** ex24: Kai's request for physically grounded length references. */
export const LONG_EX24_LENGTH_REFERENCE: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex24',
  dependencies: ['foundation-open@1'],
  description:
    'Investigate one accessible candidate as a length reference (examine-material@1 calibration-record checks; whether it is an uncalibrated, non-metric comparison span), and with a real calibrated source transfer its length to a whole rigid carrier by end-to-end comparison and verify it as a single-span reference-length that examine-material@1 reads. No marking, graduation, cutting or expendables; any change of the carrier makes the calibration stale.',
  reuse: {
    experiment:
      'ex24 examine-material@1 (target resolution, qualitative traits, calibration-record format and validation, reading rule, unit-record digest); construct-weather-shelter@1 (the record-derived rod measure); foundation-open@1 (personal records; probe observe visible source state, mirrored); foundation-expression@1 (signs, read only); ex19 material contact, light and whole-unit checks',
    source:
      'long-ex24-material-examination.ts (materialSpecimen, materialTraits, materialCalibration, materialReading, materialUnitState, materialDigest, MATERIAL_CALIBRATION); long-ex24-weather-shelter-physics.ts (shelterMeasure, WEATHER_SHELTER.sound); open-foundation.ts (openRemember); expression.ts (expressionSign); forest-references.ts; long-ex19-material-contact.ts; open-physical.ts; forest-climate.ts',
    description:
      'Implementation reuse only; every existing package is unchanged. probe, consult and navigate are not called: observation is part of this paid round, records are read with consult, and travel is navigate, each at its own cost. New: candidate findings, the comparison span, the end-to-end transfer and verification, the single-span record, staleness and the step log.',
  },
  abilities: [
    {
      id: ID,
      name: 'Length reference',
      function:
        'Investigate one accessible candidate as a length reference; with a real calibrated source, transfer its length to a whole rigid carrier end to end and verify it.',
      equivalence: 'measurement:length-reference:investigate-transfer-verify:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: [...MODES] },
          target: { type: 'string' },
          source: { type: 'string' },
          carrier: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: { target: 'optional-exact-visible' },
      prerequisites: [],
      learning: LEARNING,
      learningEnergy: STUDY,
      costs:
        'Study 2 rounds, 0.2 energy each. investigate: 1 round, 0.2 energy, one target in reach. transfer and verify: 1 round, 0.2 energy each; source is a serviceable item or object in reach with a complete verified length calibration record (none exists here); carrier is one separated whole, rigid, plain, sound wood unit, yours or loose in reach, no longer than the source range; light. No marking, cutting or expendables. resume runs the next step at its cost; cancel is free. Every check precedes payment: a refused request costs nothing. Travel, gathering and reading records are separate actions.',
      effects:
        'investigate: a personal record and event of observed facts, unsupported claims and unknowns: calibration record status, and whether the piece is an uncalibrated comparison span (a non-metric record, never a calibration); conclusion "no qualifying standard established among these examined candidates" unless one qualifies. Nothing is consumed, reserved or moved. transfer: the carrier is laid end to end beside the source and read; calibration pending. verify: a second reading; if they agree, the carrier gets a reference-length record that examine-material reads: span = resolution = range, uncertainty = placements x (source uncertainty + resolution) + reading difference; no subdivisions or diameter. Any change of the carrier makes it stale; time never restores it. Without a source: refused, zero progress. No reward.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // No event carries a qualified flag: these steps earn no practice milestone.
      practiceEvidence: EVENT('verified'),
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic one-round steps; a pending transfer waits for an explicit paid verify or resume, never advances on its own and holds no lock.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: [
    EVENT('investigated'),
    EVENT('aligned'),
    EVENT('verified'),
    EVENT('unverified'),
    EVENT('cancelled'),
    EVENT('stale'),
    EVENT('stopped'),
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath,
};
