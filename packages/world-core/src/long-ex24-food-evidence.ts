import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Json,
  V7Knowledge,
  V7Package,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Json, v7RoundNumber } from './continuous-data.js';
import { v7Distance } from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { expressionSign } from './expression.js';
import { forestClimate } from './forest-climate.js';
import { ex19MaterialDark } from './long-ex19-material-contact.js';
import {
  CONSTITUENT_ABSOLUTE_BALANCE,
  CONSTITUENT_SET_BY_METHOD,
  constituentBounded,
  constituentClassify,
  constituentIdList,
} from './long-ex21-constituent-test.js';
import type { ConstituentRow } from './long-ex21-constituent-test.js';
import { shelterMeasure } from './long-ex24-weather-shelter-physics.js';
import {
  materialDigest,
  materialRecords,
  materialSpecimen,
  materialUnitState,
} from './long-ex24-material-examination.js';
import type { MaterialSpecimen } from './long-ex24-material-examination.js';
import { openRemember } from './open-foundation.js';

/** ex24: assess food evidence without eating. assess checks one accessible specimen unit against
 * at most four of the person's complete records and one candidate method, and reports toxicity,
 * edibility and preparation separately, each unknown unless a validated non-ingestive method
 * supports it. execute-validated-method may run only an implemented, validated protocol; no
 * installed capability is one, so it is refused before any cost. Nothing reads a hidden food
 * value; nothing is handled, tasted, consumed, moved or reserved. */

const ID = 'assess-food-evidence';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
const EVENT = (s: string) => `food-evidence-${s}`;
/** Per-person log of completed assessments, the only state this operation keeps. */
const STATE = `long:${ID}`;
/** One assessment: one active round and 0.2 energy (specification). */
const ENERGY = 0.2;
/** Study: two rounds at 0.2 energy per completed round (specification). */
const STUDY = 0.2;
const LEARNING = 2;
const MAX_EVIDENCE = 4;
const MAX_METHOD = 160;
const LOG = 16;
const MODES = ['assess', 'execute-validated-method'] as const;
type Mode = (typeof MODES)[number];
const QUESTIONS = ['toxicity', 'edibility', 'preparation'] as const;
/** The expression foundation's per-listener list of heard words. */
const HEARD = 'expression:heard';
export const FOOD_EVIDENCE_SCOPED =
  'no validated non-ingestive method established among supplied accessible evidence; toxicity, edibility and preparation requirements remain unknown';
const ABSENCE =
  'absence of a result is not a negative result; a negative result for one hazard never establishes general edibility';
const POSSIBLE = 'this does not show that no such method can exist';
const SCOPE =
  'this one unit only, as it was when assessed; other units need not match';
const STALE =
  'applies while this unit and the cited records are unchanged; any change makes it inapplicable, with no automatic revalidation';
const NOTHING =
  'nothing was handled, tasted, tested, consumed, moved or reserved';
const MISSING =
  'Missing validated protocol: no implemented, validated non-ingestive food-evidence protocol exists in this world. One must declare its tested hazard or preparation claim, prerequisites, costs, detection limits, controls, hazards and disposal before it can run';
/** Why the installed capabilities nearest to a food test are not one. */
const CLOSEST: Record<string, string> = {
  'examine-material':
    'records qualitative traits and calibrated dimensions, not food hazards',
  probe:
    'observe records visible state, and its press, wet and heat trials consume material to test load, water or heat response, not food hazards',
  consult: 'reads records and tests nothing',
  eat: 'ingestion, which is excluded',
};
const REQUIRES: Record<(typeof QUESTIONS)[number], string> = {
  toxicity:
    'a validated non-ingestive assay or identification reference applicable to this specimen, naming the tested hazard, its detection limit and uncertainty',
  edibility:
    'validated findings covering every relevant hazard, and an applicable identification reference; a negative result for one hazard is not enough',
  preparation:
    'an applicable validated preparation reference; no recipe or detoxification efficacy is guessed',
};

const round = (x: number) => v7RoundNumber(x);
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const text = (v: V7Json | undefined) => (typeof v === 'string' ? v.trim() : '');
const isData = (v: unknown): v is V7Data =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown): V7Data[] =>
  Array.isArray(v) ? v.filter(isData) : [];
const isMode = (v: string): v is Mode =>
  (MODES as readonly string[]).includes(v);

interface Request {
  mode: Mode;
  target: string;
  number: number;
  refs: string[];
  method: string;
  equipment: string[];
  quantity: number | null;
}
/** Every argument check; a failure is refused before any cost. */
function request(c: V7ActionContext): Request {
  const args = c.action.args,
    mode = text(args.mode),
    target = text(args.target),
    n = args.specimen,
    q = args.quantity ?? null;
  if (!isMode(mode))
    throw nothing('mode is assess or execute-validated-method.');
  if (!target)
    throw nothing(
      'Name the exact target: your own item, a loose item or a material source within reach.',
    );
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1)
    throw nothing('specimen is a whole unit number from 1.');
  const refs = constituentIdList(c, 'evidenceRefs');
  if (refs.length > MAX_EVIDENCE)
    throw nothing(
      `evidenceRefs accepts at most ${String(MAX_EVIDENCE)} complete record ids.`,
    );
  if (q !== null && (typeof q !== 'number' || !(q > 0) || q > 1))
    throw nothing(
      'quantity is a sample size above 0 and at most the one specimen unit.',
    );
  return {
    mode,
    target,
    number: n,
    refs,
    method: constituentBounded(c, 'methodRef', MAX_METHOD),
    equipment: constituentIdList(c, 'equipmentRefs'),
    quantity: typeof q === 'number' ? q : null,
  };
}

type Category =
  | 'direct observation'
  | 'validated finding'
  | 'unverified claim'
  | 'inapplicable';
type Currency = 'current' | 'stale' | 'unchecked';
interface Cited {
  id: string;
  kind: 'personal record' | 'eating record' | 'heard message' | 'assessment';
  round: number;
  event: string | null;
  digest: string;
  category: Category;
  current: Currency | null;
  why: string;
  observed: string[];
  unseen: string[];
  /** A record of this unit's qualitative traits (examine-material@1's format). */
  traits: boolean;
}
function log(a: V7Actor): V7Data[] {
  const s = a.extensionState[STATE];
  return isData(s) ? list(s.assessments) : [];
}
const dated = (v: unknown, now: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= now;

/** What a supplied personal record is and whether it applies to this unit. */
function personal(
  c: V7ActionContext,
  p: MaterialSpecimen,
  state: string,
  id: string,
  k: V7Knowledge,
): Cited {
  const a = c.actor,
    resource = p.stack.resource,
    base = {
      id,
      kind: 'personal record' as const,
      round: k.tick,
      event: k.evidence,
      digest: materialDigest(k),
      current: null,
      observed: [],
      unseen: [],
      traits: false,
    },
    out = (category: Category, why: string): Cited => ({
      ...base,
      category,
      why,
    });
  if (k.key.endsWith(':food-evidence'))
    return {
      ...out(
        'inapplicable',
        'an earlier assessment of this operation: a derived report, not independent evidence',
      ),
      kind: 'assessment',
    };
  if (k.receivedFrom)
    return out(
      'unverified claim',
      `received from ${k.receivedFrom}, not tested by you`,
    );
  if (k.subject !== resource)
    return out('inapplicable', `about ${k.subject} only, not ${resource}`);
  if (k.verified)
    return out(
      'validated finding',
      `${k.property} by ${k.method} (${k.condition}); it tests no food hazard or preparation claim`,
    );
  if (!k.key.startsWith(`${p.target}:`))
    return out(
      'inapplicable',
      `not a record of ${p.target}; other sources and units need not match`,
    );
  const unit = /:unit-([0-9]+):/.exec(k.key)?.[1];
  if (unit && Number(unit) !== p.number)
    return out(
      'inapplicable',
      `about unit ${unit}, not unit ${String(p.number)}`,
    );
  // Currency: examine-material@1's logged unit-record digest, or the visible source state.
  const logged = materialRecords(a).find((x) => x.evidence === k.evidence),
    value = isData(k.value) ? k.value : {},
    current: Currency =
      logged && typeof logged.state === 'string'
        ? logged.state === state
          ? 'current'
          : 'stale'
        : k.property === 'visible state' && p.source
          ? value.stock === p.source.data.stock &&
            value.stage === p.source.data.stage
            ? 'current'
            : 'stale'
          : 'unchecked';
  if (current === 'stale')
    return {
      ...out(
        'inapplicable',
        `stale: ${p.target} changed after round ${String(k.tick)}; examine it again with examine-material`,
      ),
      current,
    };
  const traits = isData(value.traits) ? value.traits : null,
    entries = traits
      ? Object.entries(traits).filter(
          (e): e is [string, string] =>
            e[0] !== 'resource' && typeof e[1] === 'string',
        )
      : [];
  return {
    ...base,
    category: 'direct observation',
    current,
    why:
      k.property === 'visible state'
        ? 'visible state of the source: source condition, not food safety'
        : `${k.property} (${k.method}): appearance and handling, not food safety`,
    observed:
      k.property === 'visible state'
        ? ['visible state of the source (stock, growth stage, soil)']
        : entries
            .filter(([, v]) => !/^not (seen|applicable)/.test(v))
            .map(([key, v]) => `${key}: ${v}`),
    unseen: entries
      .filter(([, v]) => v.startsWith('not seen'))
      .map(([key]) => key),
    traits: !!traits,
  };
}

/** One cited reference: an exact complete record the person holds, or a free refusal. */
function cite(
  c: V7ActionContext,
  p: MaterialSpecimen,
  state: string,
  id: string,
): Cited {
  const { world: w, actor: a } = c,
    all = a.memory.knowledge ?? {},
    k = all[id] ?? Object.values(all).find((x) => x.evidence === id);
  if (k) {
    if (
      !k.evidence ||
      !dated(k.tick, w.tick) ||
      (isData(k.value) && k.value.encoding === 'paged-json')
    )
      throw nothing(
        `evidenceRefs: ${id} is not a complete dated record (a paged fragment or an undated entry); cite the whole record by its exact key.`,
      );
    return personal(c, p, state, id, k);
  }
  const resource = p.stack.resource,
    eaten = a.memory.discoveries?.[id];
  if (eaten) {
    if (!dated(eaten.observedAt, w.tick))
      throw nothing(`evidenceRefs: ${id} is not a complete dated record.`);
    const same = id === resource;
    return {
      id,
      kind: 'eating record',
      round: eaten.observedAt,
      event: null,
      digest: materialDigest(eaten),
      category: same ? 'direct observation' : 'inapplicable',
      current: null,
      why: same
        ? `your record of eating ${id} in round ${String(eaten.observedAt)}: the outcome for an eaten unit, not a non-ingestive assessment of this specimen`
        : `concerns ${id} only, not ${resource}`,
      observed: same ? [`ate ${id} in round ${String(eaten.observedAt)}`] : [],
      unseen: [],
      traits: false,
    };
  }
  const heard = list(a.extensionState[HEARD]).find((x) => x.source === id);
  if (heard) {
    if (!dated(heard.tick, w.tick) || typeof heard.from !== 'string')
      throw nothing(`evidenceRefs: ${id} is not a complete dated record.`);
    return {
      id,
      kind: 'heard message',
      round: heard.tick,
      event: id,
      digest: materialDigest(heard),
      category: 'unverified claim',
      current: null,
      why: `heard from ${heard.from} in round ${String(heard.tick)}: hearsay, not tested; it cannot establish identity, toxicity, edibility or preparation`,
      observed: [],
      unseen: [],
      traits: false,
    };
  }
  const prior = log(a).find((x) => x.id === id);
  if (prior && dated(prior.round, w.tick))
    return {
      id,
      kind: 'assessment',
      round: prior.round,
      event: text(prior.record) || null,
      digest: materialDigest(prior),
      category: 'inapplicable',
      current: null,
      why: 'an earlier assessment of this operation: a derived report, not independent evidence',
      observed: [],
      unseen: [],
      traits: false,
    };
  throw nothing(
    `evidenceRefs: ${id} is not one of your complete records (a personal record key or its evidence id, an eating record, a heard message id or an earlier assessment of this operation).`,
  );
}

/** The candidate method: an installed capability or a record, never accepted as validated. */
function candidate(w: V7World, a: V7Actor, method: string) {
  if (!method) return null;
  const out = (is: string, why: string) => ({
    id: method,
    is,
    validated: false,
    why,
  });
  if (method === ID)
    return out(
      'this assessment',
      'this assessment, which applies evidence and is not a test method',
    );
  const ability = w.abilities.find((x) => x.id === method);
  if (ability)
    return out(
      `installed capability ${ability.revision}`,
      `not a validated non-ingestive food-evidence protocol: ${
        CLOSEST[method] ??
        'it declares no tested food hazard or preparation claim, detection limit, controls, hazards or disposal'
      }`,
    );
  if (a.memory.knowledge?.[method])
    return out('your personal record', 'a record, not a method');
  throw nothing(
    `methodRef ${method} is not an installed capability or one of your records; name one exactly, or omit it.`,
  );
}

/** A supplied equipment id. Items are described without reading any food property. */
function equipmentOf(c: V7ActionContext, p: MaterialSpecimen, id: string) {
  const { world: w, actor: a } = c;
  if (id === p.target || id === p.stack.id)
    return {
      id,
      is: 'the specimen itself',
      why: 'the specimen cannot be its own equipment, reagent or control',
    };
  const s = w.stacks.find((x) => x.id === id);
  if (s) {
    const mine = s.owner === a.id,
      loose =
        s.owner === null &&
        v7Distance(a.position, s.position) <= a.radius + w.config.interaction;
    if (!mine && !loose)
      throw nothing(`equipmentRefs: ${id} is not yours or within reach.`);
    const name = w.resources.find((r) => r.id === s.resource)?.name;
    return {
      id,
      is: `${name ?? s.resource} item (${mine ? 'yours' : 'loose within reach'})`,
      why: 'an ordinary item, not a validated reagent, control, instrument or container',
    };
  }
  const k = constituentClassify(w, a, id, 'equipment', null);
  if (k) return { id, is: k.is, why: k.why };
  throw nothing(
    `equipmentRefs: ${id} is not your item, a loose item or an object within reach.`,
  );
}

/** The installed capabilities checked for a validated protocol; none in this world is one. */
function protocolCheck(w: V7World): string {
  const others = w.abilities.filter((x) => x.id !== ID),
    near = Object.keys(CLOSEST)
      .filter((k) => others.some((x) => x.id === k))
      .map((k) => `${k}: ${CLOSEST[k] ?? ''}`);
  return `${MISSING}; none of the ${String(others.length)} other installed capabilities is one (${near.join('; ')}); ${POSSIBLE}`;
}

/** The one evidence pipeline of both modes, without any charge or change. */
function survey(c: V7ActionContext, r: Request) {
  const { world: w, actor: a } = c,
    p = materialSpecimen(c, {
      mode: 'inspect',
      target: r.target,
      number: r.number,
      properties: [],
      tools: [],
      method: null,
    }),
    state = materialUnitState(w, p, shelterMeasure(w, p.stack)),
    cited = r.refs.map((id) => cite(c, p, state, id)),
    method = candidate(w, a, r.method),
    equipment = r.equipment.map((id) => equipmentOf(c, p, id)),
    dark = !!ex19MaterialDark(w, a),
    k = forestClimate(w, a.position),
    name = p.source
      ? p.source.name
      : (w.resources.find((x) => x.id === p.stack.resource)?.name ??
        p.stack.resource),
    signs = v7Observe(w, a.id).objects.filter(
      (o) => expressionSign(o) && o.data.subject === p.target,
    ),
    rows: ConstituentRow[] = [
      [
        'specimen',
        'one accessible specimen unit',
        'present',
        `unit ${String(p.number)} of ${p.target}, ${p.setting}`,
      ],
      [
        'identificationReference',
        'an applicable validated identification reference for this specimen',
        'missing',
        'none among the cited records or in this world; names, labels and appearance identify nothing',
      ],
      [
        'validatedProtocol',
        'an implemented, validated non-ingestive protocol for a named hazard or preparation claim',
        'missing',
        `none is installed in this world${method ? `; ${method.id} is ${method.why}` : ''}`,
      ],
      [
        'equipment',
        'the equipment that protocol requires',
        'unestablished',
        `${CONSTITUENT_SET_BY_METHOD}${equipment.length ? '; no supplied id meets it' : ''}`,
      ],
      [
        'controls',
        'the blank, negative and positive controls that protocol requires',
        'unestablished',
        `${CONSTITUENT_SET_BY_METHOD}; no control material is represented in this world`,
      ],
      [
        'materials',
        'the reagents and consumables that protocol requires',
        'unestablished',
        `${CONSTITUENT_SET_BY_METHOD}; no reagent or kit is represented in this world`,
      ],
      [
        'safeConditions',
        'the workspace, exposure limits and disposal that protocol requires',
        'unestablished',
        CONSTITUENT_SET_BY_METHOD,
      ],
      [
        'light',
        'light for any visual step',
        dark ? 'missing' : 'present',
        dark ? 'it is dark here now' : 'lit here now',
      ],
      [
        CONSTITUENT_ABSOLUTE_BALANCE[0],
        `${CONSTITUENT_ABSOLUTE_BALANCE[1]}, if the protocol takes a measured sample`,
        CONSTITUENT_ABSOLUTE_BALANCE[2],
        'no calibrated balance exists in this world',
      ],
    ],
    keys = (status: string) =>
      rows.filter((x) => x[2] === status).map((x) => x[0]);
  return {
    p,
    state,
    cited,
    method,
    equipment,
    dark,
    conditions: {
      light: round(k.light),
      temperature: round(k.temperature),
      rain: round(k.rain ?? 0),
      indoor: k.indoor,
      dark,
    },
    labels: [
      {
        ref: p.target,
        claim: `the shown name "${name}"`,
        why: 'a label, not an identification or a food finding',
      },
      ...signs.map((o) => ({
        ref: o.id,
        claim: `a ${o.kind} sign about ${p.target}`,
        why: 'a sign is not evidence of identity, toxicity, edibility or preparation',
      })),
    ],
    requirements: rows.map(([key, need, status, basis]) => ({
      key,
      need,
      status,
      basis,
    })),
    missing: keys('missing'),
    unestablished: keys('unestablished'),
  };
}
type Survey = ReturnType<typeof survey>;

/** Reusable drawing metadata. It never shows a safe badge, an assay, a newly seen detail in the
 * dark, or any tool, reagent or sample. */
function view(
  c: V7ActionContext,
  s: Survey,
  status: 'inconclusive' | 'evidence-supported',
  evidence: string,
): V7Data {
  return {
    operation: ID,
    mode: 'assess',
    actor: c.actor.id,
    target: s.p.target,
    specimen: s.p.number,
    setting: s.p.setting,
    status,
    progress: 1,
    rounds: 1,
    evidenceRefs: s.cited.map((x) => x.id),
    methodRef: s.method?.id ?? null,
    conditions: { light: s.conditions.light, dark: s.dark },
    result: 'unknown',
    uncertainty: 'toxicity, edibility and preparation unknown',
    limitations: [...(s.dark ? ['dark'] : []), 'missing-method'],
    priorObservations: s.cited
      .filter((x) => x.category === 'direct observation')
      .map((x) => x.id),
    newlySeen: [],
    badge: null,
    assay: null,
    tools: [],
    reagents: [],
    samples: [],
    x: c.actor.position.x,
    y: c.actor.position.y,
    withinReach: true,
    overlay: null,
    evidence,
    label: 'inconclusive: toxicity, edibility and preparation unknown',
  };
}

function assess(c: V7ActionContext, r: Request): V7HandlerResult {
  const { world: w, actor: a } = c,
    s = survey(c, r),
    p = s.p;
  if (a.vitals.energy + 1e-8 < ENERGY)
    throw nothing('An assessment needs 0.2 energy.');
  v7Spend(a, ENERGY);
  const by = (k: Category) => s.cited.filter((x) => x.category === k),
    direct = by('direct observation').map((x) => ({
      ref: x.id,
      kind: x.kind,
      round: x.round,
      current: x.current,
      observed: x.observed,
      scope: x.why,
    })),
    validated = by('validated finding').map((x) => ({
      ref: x.id,
      round: x.round,
      scope: x.why,
      addresses: [],
    })),
    claims = [
      ...s.labels,
      ...by('unverified claim').map((x) => ({
        ref: x.id,
        claim: `${x.kind} ${x.id}`,
        why: x.why,
      })),
    ],
    inapplicable = by('inapplicable').map((x) => ({ ref: x.id, why: x.why })),
    current = s.cited.some(
      (x) =>
        x.traits &&
        x.category === 'direct observation' &&
        x.current === 'current',
    ),
    unseen = [...new Set(s.cited.flatMap((x) => x.unseen))],
    unknowns = [
      `identity of this specimen: no applicable validated identification reference; ${s.dark ? 'too dark for any new visual identification, which must wait for light' : 'appearance alone identifies nothing'}`,
      ...QUESTIONS.map((q) => `${q}: unknown; it needs ${REQUIRES[q]}`),
      ...(unseen.length
        ? [
            `${unseen.join(', ')} of unit ${String(p.number)}: not seen when recorded`,
          ]
        : []),
      ...(current
        ? []
        : [
            `current traits of unit ${String(p.number)}: no current record cited; examine-material inspect is a separate action`,
          ]),
      ...(p.source
        ? [`whether other units of ${p.target} match unit ${String(p.number)}`]
        : []),
    ],
    // Every finding stays unknown unless a validated protocol produced it; none is implemented.
    findings = QUESTIONS.map((q) => ({
      question: q,
      status: 'unknown',
      supported: false,
      claim: null,
      method: null,
      detectionLimit: null,
      uncertainty: null,
      scope: `unit ${String(p.number)} of ${p.target}`,
      basis:
        'no validated non-ingestive method among the supplied accessible evidence',
      requires: REQUIRES[q],
    })),
    status = 'inconclusive' as const,
    versions = s.cited.map((x) => ({
      id: x.id,
      kind: x.kind,
      round: x.round,
      event: x.event,
      digest: x.digest,
      category: x.category,
      current: x.current,
    })),
    limitations = [
      FOOD_EVIDENCE_SCOPED,
      ABSENCE,
      POSSIBLE,
      SCOPE,
      STALE,
      ...(s.dark
        ? [
            'dark: no new visual identification; earlier observations are cited as recorded, not seen again',
          ]
        : []),
      NOTHING,
    ],
    assessment = `${ID}-${String(w.tick)}-${a.id}`,
    prior = log(a),
    newFinding = !prior.some(
      (x) =>
        x.target === p.target &&
        x.specimen === p.number &&
        x.state === s.state &&
        x.methodRef === (s.method?.id ?? null) &&
        JSON.stringify(x.evidence) === JSON.stringify(v7Json(versions)),
    );
  openRemember(c, {
    key: `${p.target}:unit-${String(p.number)}:food-evidence`,
    subject: p.stack.resource,
    property: 'non-ingestive food evidence assessment of one unit',
    value: v7Json({
      target: p.target,
      specimen: p.number,
      conclusion: FOOD_EVIDENCE_SCOPED,
      status,
      findings: findings.map((f) => ({
        question: f.question,
        status: f.status,
      })),
      directObservations: direct.map((x) => x.ref),
      validatedFindings: validated.map((x) => x.ref),
      unverifiedClaims: claims.map((x) => `${x.claim}: ${x.why}`),
      unknowns,
      inapplicable: inapplicable.map((x) => x.ref),
      evidence: versions,
      methodRef: s.method?.id ?? null,
      missing: s.missing,
      round: w.tick,
    }),
    method:
      'applicability check of cited records against this unit; nothing handled, tasted or tested',
    condition: `${SCOPE}; ${STALE}`,
    verified: false,
  });
  const evidence = w.events.at(-1)?.id ?? '';
  a.extensionState[STATE] = {
    assessments: [
      ...prior,
      {
        id: assessment,
        round: w.tick,
        actor: a.id,
        target: p.target,
        specimen: p.number,
        setting: p.setting,
        resource: p.stack.resource,
        state: s.state,
        evidence: v7Json(versions),
        methodRef: s.method?.id ?? null,
        status,
        missing: s.missing,
        record: evidence,
        rounds: 1,
        energy: ENERGY,
      },
    ].slice(-LOG),
  };
  c.emit(
    EVENT('assessed'),
    `${a.name} assessed food evidence for unit ${String(p.number)} of ${p.target} against ${String(s.cited.length)} cited record(s) and ${s.method ? `candidate method ${s.method.id}` : 'no candidate method'}: ${FOOD_EVIDENCE_SCOPED}. Direct observations ${String(direct.length)}, validated findings ${String(validated.length)}, unverified claims ${String(claims.length)}, not applicable ${String(inapplicable.length)}. ${s.dark ? 'Dark: no new visual identification. ' : ''}Missing: ${s.missing.join(', ')}. Nothing was handled, tasted, consumed, moved or reserved.`,
    {
      assessment,
      record: evidence,
      actorId: a.id,
      target: p.target,
      specimen: p.number,
      setting: p.setting,
      round: w.tick,
      time: w.time,
      status,
      conclusion: FOOD_EVIDENCE_SCOPED,
      findings,
      directObservations: direct,
      validatedFindings: validated,
      unverifiedClaims: claims,
      unknowns,
      inapplicable,
      evidence: versions,
      candidateProtocol: s.method,
      equipment: s.equipment,
      requestedQuantity: r.quantity,
      requirements: s.requirements,
      missing: s.missing,
      unestablished: s.unestablished,
      checks: {
        specimen: 'accessible within reach',
        evidenceComplete: true,
        applicable: [...direct, ...validated].map((x) => x.ref),
        stale: s.cited.filter((x) => x.current === 'stale').map((x) => x.id),
        validatedMethod: false,
        light: s.dark ? 'dark' : 'lit',
      },
      conditions: s.conditions,
      provenance: {
        revision: REVISION,
        reading: 'consult (foundation-open@1)',
        observation:
          'probe observe (foundation-open@1) and examine-material (measurement:material-specimen:nondestructive-examination:1), as separate actions',
      },
      limitations,
      newFinding,
      consumed: 0,
      reserved: false,
      moved: false,
      energy: ENERGY,
      view: view(c, s, status, evidence),
    },
    p.target,
  );
  return { complete: true, writes: [] };
}

/** Every input is checked through the same pipeline, then the run is refused before any cost. */
function refuse(c: V7ActionContext, r: Request): never {
  const s = survey(c, r);
  throw nothing(
    `Cannot execute a validated method on unit ${String(s.p.number)} of ${s.p.target}: ${s.method ? `${s.method.id} is ${s.method.why}` : 'no protocol named in methodRef'}. ${protocolCheck(c.world)}. Unmet: ${s.missing.join(', ')}; unestablished: ${s.unestablished.join(', ')}. No sample, reagent or equipment was committed and no progress was made; assess remains available.`,
  );
}

function execute(c: V7ActionContext): V7HandlerResult {
  const r = request(c);
  return r.mode === 'assess' ? assess(c, r) : refuse(c, r);
}

/** ex24: Lin's request to assess a root for toxicity, edibility and preparation without eating it. */
export const LONG_EX24_FOOD_EVIDENCE: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex24',
  dependencies: ['foundation-open@1'],
  description:
    'A general non-ingestive food-evidence assessment of one accessible specimen unit against at most four cited personal records and one candidate method: direct observations, validated findings, unverified claims and unknowns kept separate, toxicity, edibility and preparation reported independently, with the unmet requirements. Execution of a validated protocol is refused before any cost while none exists. Nothing is consumed, moved or reserved.',
  reuse: {
    experiment:
      'ex21 targeted-food-constituent-test@1 (scope long-ex21, not installed here: its id-list and bounded-text parsers, supplied-object classification and requirement-bill rows; its run mode was likewise refused before cost); ex24 examine-material@1 (target resolution, unit-record digest, examination log and traits record format); ex24 length-reference@1 (observed, unsupported and unknown evidence classes); foundation-open@1 consult and probe records',
    source:
      'long-ex21-constituent-test.ts (constituentIdList, constituentBounded, constituentClassify, CONSTITUENT_SET_BY_METHOD, CONSTITUENT_ABSOLUTE_BALANCE, ConstituentRow); long-ex24-material-examination.ts (materialSpecimen, materialUnitState, materialRecords, materialDigest); long-ex24-weather-shelter-physics.ts (shelterMeasure); open-foundation.ts (openRemember); expression.ts (expressionSign; heard words read only); long-ex19-material-contact.ts (ex19MaterialDark); forest-climate.ts',
    description:
      'Implementation reuse only; every existing package is unchanged. consult, probe and examine-material are not called: records are read with consult, visible state with probe observe and traits with examine-material, each at its own cost. New: evidence citation and applicability, currency checks, the separated classes, the three independent findings and the protocol gate.',
  },
  abilities: [
    {
      id: ID,
      name: 'Assess food evidence',
      function:
        'Assess whether one accessible specimen unit can be judged for toxicity, edibility and preparation without eating it, from up to four of your complete records and one candidate method. execute-validated-method runs only an implemented validated non-ingestive protocol.',
      equivalence: 'food:specimen-evidence:non-ingestive-assessment:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: [...MODES] },
          target: { type: 'string' },
          specimen: { type: 'integer', minimum: 1 },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
          methodRef: { type: 'string' },
          equipmentRefs: { type: 'array', items: { type: 'string' } },
          quantity: { type: 'number', minimum: 0 },
        }),
        required: ['mode', 'target', 'specimen', 'evidenceRefs'],
      },
      references: { target: 'optional-exact-visible' },
      prerequisites: [],
      learning: LEARNING,
      learningEnergy: STUDY,
      costs:
        'Study 2 rounds, 0.2 energy each. assess: 1 round, 0.2 energy; target and specimen (unit number) within reach; evidenceRefs: up to 4 exact ids of your complete records (record key or its evidence id, eating record, heard message id, earlier assessment), [] for none; optional methodRef (installed capability or your record), equipmentRefs (your items, loose items or objects in reach), quantity (above 0, at most 1 unit; nothing is taken). Every check precedes payment: malformed or inaccessible input is refused free. execute-validated-method is refused free while no validated protocol exists; none does here. Reading records is consult, inspecting is examine-material, at their own costs.',
      effects:
        'A personal record and event: target, unit, cited ids and versions, candidate method, equipment, conditions, round, applicability and currency checks, provenance and limits. Direct observations, validated findings, unverified claims (labels, signs, heard or received records) and unknowns are separate; toxicity, edibility and preparation are reported independently, each unknown unless a validated method supports it, with the unmet requirements: identification reference, validated protocol, its equipment, controls, materials and safe conditions. Records about other subjects, units or sources, or stale ones, do not apply. Absence of a result is not a negative result. In darkness no new visual identification is made. No food value is read or shown; nothing is handled, tasted, consumed, moved or reserved. No reward.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // The assessment event carries no qualified flag: assessments earn no practice milestone.
      practiceEvidence: EVENT('assessed'),
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic: one paid round that commits when it completes; an interrupted round completes no assessment and a retry is a new paid one. Nothing is reserved, paused or resumed.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: [EVENT('assessed')],
  resources: [],
  satisfaction: [],
};

/** The unchanged evidence citation that ex26 assess-food-suitability@1 reuses: one cited id
 * resolved against the person's complete records and classified for one specimen. */
export type { Cited as FoodEvidenceCited };
export { cite as foodEvidenceCite };
