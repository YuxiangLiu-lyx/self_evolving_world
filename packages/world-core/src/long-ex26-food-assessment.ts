import type {
  V7Ability,
  V7Action,
  V7ActionContext,
  V7Data,
  V7HandlerResult,
  V7Json,
  V7Knowledge,
  V7Object,
  V7Package,
  V7Stack,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import {
  v7CanonicalNumbers,
  v7Clone,
  v7Json,
  v7Signature,
  v7Validate,
} from './continuous-data.js';
import { v7Distance, v7Reach } from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import {
  constituentBounded,
  constituentIdList,
} from './long-ex21-constituent-test.js';
import { foodEvidenceCite } from './long-ex24-food-evidence.js';
import type { FoodEvidenceCited } from './long-ex24-food-evidence.js';
import {
  materialDigest,
  materialUnitState,
} from './long-ex24-material-examination.js';
import type { MaterialSpecimen } from './long-ex24-material-examination.js';
import { shelterMeasure } from './long-ex24-weather-shelter-physics.js';
import { OPEN_FOUNDATION } from './open-foundation.js';

/** ex26: evidence-based food suitability of one accessible item or source. inspect is probe's own
 * observation (open.probe of foundation-open@1); trial is probe's own press, wet or heat trial on
 * 0.1 unit of an owned sample. Both attach four separate conclusions (identity, nutrition,
 * toxicity, preparation), each supported, contradicted or unresolved, from that probe evidence and
 * the person's own cited records, classified by ex24's evidence citation (foodEvidenceCite).
 * Identity is supported only by the person's own eating record of the same kind, never by a name
 * or label alone; only then are that record's satiety and health loss cited. A load, water or heat
 * response measures no nutrition, harm or preparation, so a trial bears only on identity, by
 * comparison with a cited verified probe record of the same kind, method and load; without one
 * it is refused before any cost. No hidden food value is read, nothing is eaten, gathered, moved,
 * created or rewarded, and nothing beyond the target in reach and the person's own records is
 * reported. */

const ID = 'assess-food-suitability';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The key suffix of this operation's own records: derived reports, never independent evidence. */
const SUFFIX = ':food-suitability';
const PROBE = { ability: 'probe', handler: 'open.probe' };
/** probe's own costs (foundation-open@1): observe 0.2 energy; a physical trial 0.5 energy and
 * 0.1 unit of an owned sample, and heat 0.1 of a source's available heat. */
const LOOK = 0.2;
const TRIAL = 0.5;
const SAMPLE = 0.1;
const HEAT = 0.1;
/** probe's wet trial needs water at the person's own cell: marsh, ford or river. */
const WATER = [',', '=', '~'];
/** What each probe trial records, by mode (open.probe). */
const TRIALS = {
  press: 'load response',
  wet: 'water response',
  heat: 'heat response',
} as const;
type Trial = keyof typeof TRIALS;
const MODES = ['inspect', 'trial'] as const;
type Mode = (typeof MODES)[number];
const MAX_REFS = 6;
const MAX_TEXT = 80;
const UNRESOLVED = 'safety unresolved; do not consume on this evidence.';
const EVENTS = {
  inspected: `${ID}-inspected`,
  trialled: `${ID}-trialled`,
} as const;
type Question = 'identity' | 'nutrition' | 'toxicity' | 'preparation';
type Status = 'supported' | 'contradicted' | 'unresolved';
/** The claim each conclusion supports or contradicts. */
const CLAIMS: Record<Question, string> = {
  identity:
    'it is the kind it is shown as, the same kind as your first-hand record',
  nutrition: 'eating it nourishes',
  toxicity: 'eating it as you ate it does no harm',
  preparation: 'it needs no preparation before eating',
};
const LIMITS = [
  'this target only, as it was in this round; reassess after any change',
  'freshness, contamination and changes since gathering are not observed',
  'nothing was tasted, eaten, fed, gathered, moved, created or certified',
];

const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const text = (v: V7Json | undefined) => (typeof v === 'string' ? v.trim() : '');
const isData = (v: unknown): v is V7Data =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const isTrial = (v: string): v is Trial => Object.keys(TRIALS).includes(v);
const conditionOf = (mode: Trial, load: number) =>
  mode === 'press' ? `load-band-${String(Math.floor(load * 3))}` : mode;

interface Request {
  mode: Mode;
  target: string;
  consumer: string;
  refs: string[];
  method: 'observe' | Trial;
  intensity: number;
}
/** Every argument check; a failure is refused before any cost. */
function request(c: V7ActionContext): Request {
  const args = c.action.args,
    mode = text(args.mode),
    target = text(args.target);
  if (mode !== 'inspect' && mode !== 'trial')
    throw nothing('Give mode: inspect or trial.');
  if (!target)
    throw nothing(
      'Give target: your own item, a loose item or a source within your reach.',
    );
  const refs = constituentIdList(c, 'evidenceRefs');
  if (refs.length > MAX_REFS)
    throw nothing(
      `evidenceRefs accepts at most ${String(MAX_REFS)} of your record ids.`,
    );
  const consumer = constituentBounded(c, 'intendedConsumer', MAX_TEXT);
  const given = constituentBounded(c, 'methodRef', MAX_TEXT);
  const raw = given.toLowerCase().replace(/^probe\s*[:./-]?\s*/, '');
  if (raw && raw !== 'observe' && !isTrial(raw))
    throw nothing(
      `methodRef ${given} is not one of probe's methods: observe for inspect; press, wet or heat for trial.`,
    );
  if (mode === 'inspect' && raw && raw !== 'observe')
    throw nothing(
      'inspect is probe observe; give methodRef press, wet or heat only with mode trial.',
    );
  if (mode === 'trial' && !isTrial(raw))
    throw nothing(
      "A trial needs methodRef press, wet or heat: probe's physical trials.",
    );
  return {
    mode,
    target,
    consumer,
    refs,
    method: isTrial(raw) ? raw : 'observe',
    intensity: typeof args.intensity === 'number' ? args.intensity : 0,
  };
}

interface Target {
  id: string;
  kind: string;
  name: string;
  stack: V7Stack | null;
  object: V7Object | null;
  specimen: MaterialSpecimen;
}
/** The exact accessible target: an own or loose item in reach or a source in reach. The kernel
 * already resolved it to one identity seen now (references: optional-exact-visible), so a
 * remembered or only named target never reaches this point. */
function targetOf(c: V7ActionContext, r: Request): Target {
  const { world: w, actor: a } = c;
  const s = w.stacks.find((x) => x.id === r.target);
  if (s) {
    if (s.owner !== null && s.owner !== a.id)
      throw nothing(
        `${s.id} is another person's item; assess your own items, loose items and sources within your reach.`,
      );
    if (s.reservedFor)
      throw nothing(`${s.id} is reserved for unfinished work.`);
    if (
      s.owner === null &&
      v7Distance(a.position, s.position) > a.radius + w.config.interaction
    )
      throw nothing(
        `${s.id} is not within your reach; approach it first with navigate.`,
      );
    const setting = s.owner ? 'carried' : 'on the ground';
    return {
      id: s.id,
      kind: s.resource,
      name: w.resources.find((x) => x.id === s.resource)?.name ?? s.resource,
      stack: s,
      object: null,
      specimen: {
        target: s.id,
        number: 1,
        setting,
        stack: s,
        source: null,
        whole: s.quantity >= 1,
      },
    };
  }
  const o = w.objects.find((x) => x.id === r.target);
  if (!o) throw nothing(`${r.target} is not an item or source you see now.`);
  if (!v7Reach(a, o.spatial))
    throw nothing(
      `${o.id} is not within your reach; approach it first with navigate.`,
    );
  const kind = typeof o.data.resource === 'string' ? o.data.resource : '';
  if (o.kind === 'animal' || !w.resources.some((x) => x.id === kind))
    throw nothing(
      `${o.id} is not an item or a source of a material, so it cannot be assessed as food.`,
    );
  return {
    id: o.id,
    kind,
    name: o.name,
    stack: null,
    object: o,
    specimen: {
      target: o.id,
      number: 1,
      setting: 'in place in its source',
      stack: {
        id: `${o.id}#1`,
        resource: kind,
        quantity: 1,
        position: { x: o.spatial.x, y: o.spatial.y },
        owner: null,
        origin: o.id,
      },
      source: null,
      whole: true,
    },
  };
}

/** You by default, or a living person you see now; only their seen id and name are used. */
function consumerOf(c: V7ActionContext, r: Request) {
  const a = c.actor;
  if (!r.consumer || r.consumer === a.id)
    return { id: a.id, name: a.name, self: true };
  const seen = v7Observe(c.world, a.id).actors.find(
    (x) => x.id === r.consumer && x.alive,
  );
  if (!seen)
    throw nothing(
      'intendedConsumer is you (the default) or a living person you see now.',
    );
  return { id: seen.id, name: seen.name, self: false };
}
type Consumer = ReturnType<typeof consumerOf>;

/** ex24's citation of each id, unchanged; this operation's own reports are derived, not evidence. */
function citations(
  c: V7ActionContext,
  t: Target,
  refs: string[],
): FoodEvidenceCited[] {
  const { world: w, actor: a } = c,
    all = a.memory.knowledge ?? {},
    state = materialUnitState(
      w,
      t.specimen,
      shelterMeasure(w, t.specimen.stack),
    );
  return refs.map((id) => {
    const k = all[id] ?? Object.values(all).find((x) => x.evidence === id);
    return k?.key.endsWith(SUFFIX)
      ? derived(id, k)
      : foodEvidenceCite(c, t.specimen, state, id);
  });
}
const derived = (id: string, k: V7Knowledge): FoodEvidenceCited => ({
  id,
  kind: 'assessment',
  round: k.tick,
  event: k.evidence || null,
  digest: materialDigest(k),
  category: 'inapplicable',
  current: null,
  why: 'an earlier assessment of this operation: a derived report, not independent evidence',
  observed: [],
  unseen: [],
  traits: false,
});

interface Reference {
  id: string;
  key: string;
  round: number;
  evidence: string;
  value: V7Json;
}
/** A cited verified probe record of the same kind, method, condition and load, kept as it was
 * before the trial (probe's new reading replaces the record of the same key). */
function referenceOf(c: V7ActionContext, t: Target, r: Request) {
  if (r.method === 'observe') return null;
  const all = c.actor.memory.knowledge ?? {},
    mode = r.method,
    condition = conditionOf(mode, r.intensity);
  for (const id of r.refs) {
    const k = all[id] ?? Object.values(all).find((x) => x.evidence === id);
    if (
      k?.verified &&
      !k.receivedFrom &&
      k.subject === t.kind &&
      k.property === TRIALS[mode] &&
      k.condition === condition &&
      (mode !== 'press' || (isData(k.value) && k.value.load === r.intensity))
    )
      return {
        id,
        key: k.key,
        round: k.tick,
        evidence: k.evidence,
        value: v7Clone(k.value),
      } satisfies Reference;
  }
  return null;
}

/** probe itself, with its own checks, costs, records and events. */
function probeRun(
  c: V7ActionContext,
  target: string,
  mode: 'observe' | Trial,
  intensity: number,
) {
  const ability = c.world.abilities.find((x) => x.id === PROBE.ability),
    probe = OPEN_FOUNDATION.handlers[PROBE.handler];
  if (ability?.handler !== PROBE.handler || !probe)
    throw nothing('The ordinary probe interface is unavailable.');
  const action: V7Action = {
    interface: PROBE.ability,
    args: { target, mode, intensity },
  };
  v7Validate(ability.parameters, action.args);
  const from = c.world.events.length,
    result = probe({ ...c, action });
  return {
    writes: result.writes,
    events: c.world.events.slice(from).map((e) => e.id),
  };
}

interface Finding {
  question: Question;
  claim: string;
  status: Status;
  basis: string;
  evidence: string[];
}
interface Comparison {
  mode: Trial;
  reference: Reference;
  value: V7Json;
  same: boolean;
  record: string;
}
/** The one evaluator of both modes: cited records and this round's probe evidence only. */
function evaluate(
  c: V7ActionContext,
  t: Target,
  cited: FoodEvidenceCited[],
  look: string | null,
  comparison: Comparison | null,
) {
  const { world: w, actor: a } = c,
    K = t.kind,
    eaten = cited.filter((x) => x.kind === 'eating record'),
    same = eaten.filter((x) => x.category === 'direct observation'),
    others = eaten
      .filter((x) => x.category !== 'direct observation')
      .map((x) => x.id),
    record = same.length ? a.memory.discoveries?.[K] : undefined,
    nutrition = typeof record?.nutrition === 'number' ? record.nutrition : null,
    toxicity = typeof record?.toxicity === 'number' ? record.toxicity : null,
    round = typeof record?.observedAt === 'number' ? record.observedAt : null,
    base = w.resources.find((x) => x.id === K),
    // The eating record is of the plain kind as eaten; a processed lot or a prepared-food record
    // (which keeps its item and composition) is a different case.
    plain =
      (!t.stack ||
        (!t.stack.processing && collectiveFoodProfile(w, t.stack) === base)) &&
      record?.itemId === undefined &&
      record?.composition === undefined,
    contradicted = !!comparison && !comparison.same,
    identified =
      !contradicted &&
      plain &&
      nutrition !== null &&
      toxicity !== null &&
      round !== null,
    seen = look ? [look] : [],
    trialNote = comparison
      ? `, and a ${comparison.mode} response measures none of this`
      : '';
  const finding = (
    question: Question,
    status: Status,
    basis: string,
    evidence: string[],
  ): Finding => ({
    question,
    claim: CLAIMS[question],
    status,
    basis,
    evidence,
  });
  const reasons = [
    ...(!record
      ? [
          `no first-hand record of ${K} is cited, such as a record of eating it; the shown name "${t.name}" is a label, not an identification`,
        ]
      : !plain
        ? [
            `this item was processed or changed after gathering, and your record is of ${K} as eaten`,
          ]
        : []),
    ...(others.length
      ? [
          `your records of ${others.join(', ')} concern other kinds and do not transfer to ${K}`,
        ]
      : []),
    ...(comparison?.same
      ? [
          `a matching ${comparison.mode} response is consistent with your record ${comparison.reference.id} but identifies nothing`,
        ]
      : []),
  ];
  const identity =
    comparison && contradicted
      ? finding(
          'identity',
          'contradicted',
          `its ${comparison.mode} response ${JSON.stringify(comparison.value)} differs from ${JSON.stringify(comparison.reference.value)} in your record ${comparison.reference.id} of ${K}, so it is not the same material`,
          [comparison.reference.id, comparison.record],
        )
      : identified
        ? finding(
            'identity',
            'supported',
            `you ate ${K} yourself (your eating record ${K}, round ${String(round)}) and ${t.stack?.owner === a.id ? 'hold' : 'inspected'} this ${K} now${comparison ? `; its ${comparison.mode} response matches your record ${comparison.reference.id}` : ''}`,
            [
              K,
              ...seen,
              ...(comparison
                ? [comparison.reference.id, comparison.record]
                : []),
            ],
          )
        : finding('identity', 'unresolved', reasons.join('; '), [
            ...seen,
            ...(comparison ? [comparison.reference.id, comparison.record] : []),
          ]);
  const unknown =
    identity.status === 'contradicted' ? 'contradicted' : 'unresolved';
  const findings: Finding[] = identified
    ? [
        identity,
        nutrition > 0
          ? finding(
              'nutrition',
              'supported',
              `${shown(nutrition)} satiety per unit when you ate ${K} (round ${String(round)})`,
              [K],
            )
          : finding(
              'nutrition',
              'contradicted',
              `no satiety when you ate ${K} (round ${String(round)})`,
              [K],
            ),
        toxicity <= 0
          ? finding(
              'toxicity',
              'supported',
              `no health loss when you ate ${K} (round ${String(round)})`,
              [K],
            )
          : finding(
              'toxicity',
              'contradicted',
              `health loss ${shown(toxicity)} per unit when you ate ${K} (round ${String(round)})`,
              [K],
            ),
        toxicity <= 0
          ? finding(
              'preparation',
              'supported',
              `you ate ${K} as gathered without harm, so none is needed for units like those`,
              [K],
            )
          : finding(
              'preparation',
              'unresolved',
              `eaten as gathered it harmed you, and no evidence-backed preparation that changes this is among your evidence`,
              [],
            ),
      ]
    : [
        identity,
        finding(
          'nutrition',
          'unresolved',
          `identity is ${unknown}, so no first-hand record applies; appearance, visible stock and the name are not nutrition evidence${trialNote}`,
          [],
        ),
        finding(
          'toxicity',
          'unresolved',
          `identity is ${unknown}, so no first-hand record applies; appearance is not chemical analysis${trialNote}`,
          [],
        ),
        finding(
          'preparation',
          'unresolved',
          `no applicable evidence-backed preparation method${trialNote}`,
          [],
        ),
      ];
  const verdict =
    identified && toxicity > 0
      ? {
          status: 'harm-recorded',
          text: `do not consume on this evidence: your own eating record of ${K} shows health loss.`,
        }
      : identified && nutrition > 0
        ? {
            status: 'supported',
            text: `your own eating record supports ${K} as food eaten as you ate it; not a guarantee, since freshness and later changes are not observed.`,
          }
        : { status: 'unresolved', text: UNRESOLVED };
  return {
    findings,
    verdict,
    prior: same.length
      ? {
          record: K,
          applied: identified,
          ...(identified ? { nutrition, toxicity, round } : {}),
          why: identified
            ? 'identity and applicability established by your own eating record of this kind'
            : reasons.join('; ') || 'identity is not established',
        }
      : null,
    others,
  };
}
type Evaluation = ReturnType<typeof evaluate>;

/** Event-linked drawing metadata: probe's interaction (reused, no new component), progress kept
 * apart from the findings, and no badge, prepared food or success effect. */
function view(
  c: V7ActionContext,
  r: Request,
  t: Target,
  e: Evaluation,
  status: 'observed' | 'informative-failure' | 'unresolved',
  probe: string[],
  sample: V7Data | null,
): V7Data {
  return {
    component: null,
    visual: 'probe interaction, reused',
    operation: ID,
    actor: c.actor.id,
    mode: r.mode,
    interaction: r.method,
    target: t.id,
    methodRef: r.method,
    evidenceRefs: r.refs,
    probeEvents: probe,
    progress: { done: 1, required: 1 },
    status,
    findings: v7Json(
      e.findings.map((f) => ({
        question: f.question,
        status: f.status,
        evidence: f.evidence,
      })),
    ),
    uncertainty: e.findings
      .filter((f) => f.status === 'unresolved')
      .map((f) => f.question),
    verdict: e.verdict.status,
    heat: r.method === 'heat',
    liquid: r.method === 'wet',
    sampleChange: sample,
    badge: null,
    preparedFood: null,
    successEffect: null,
    x: t.object?.spatial.x ?? c.actor.position.x,
    y: t.object?.spatial.y ?? c.actor.position.y,
    withinReach: true,
    tick: c.world.tick,
  };
}

/** The shared evidence record of both modes: one event, then the person's own record of it. */
function commit(
  c: V7ActionContext,
  r: Request,
  t: Target,
  who: Consumer,
  cited: FoodEvidenceCited[],
  e: Evaluation,
  description: string,
  extra: V7Data,
): void {
  const { world: w, actor: a } = c,
    status = e.findings.map((f) => `${f.question} ${f.status}`).join(', '),
    findings = status.charAt(0).toUpperCase() + status.slice(1),
    forWhom = who.self
      ? ''
      : ` For ${who.name}: from your own records only; nothing of ${who.name}'s state or records was read, and ${who.name} is not asked or committed to eat.`,
    limits = [
      ...LIMITS,
      ...(who.self
        ? []
        : [
            `assessed for ${who.name} from your own records only; their own state, records and tolerance are not read`,
          ]),
    ];
  c.emit(
    r.mode === 'inspect' ? EVENTS.inspected : EVENTS.trialled,
    `${description} ${findings}: ${e.verdict.text}${forWhom}`,
    {
      operation: ID,
      mode: r.mode,
      target: t.id,
      kind: t.kind,
      consumer: who.id,
      methodRef: r.method,
      findings: v7Json(e.findings),
      verdict: v7Json(e.verdict),
      priorKnowledge: v7Json(e.prior),
      notTransferred: e.others,
      evidence: v7Json(
        cited.map((x) => ({
          id: x.id,
          kind: x.kind,
          round: x.round,
          event: x.event,
          digest: x.digest,
          category: x.category,
          why: x.why,
        })),
      ),
      limits,
      work: { done: 1, required: 1 },
      rounds: 1,
      moved: false,
      experience: 'evidence only: no reward',
      ...extra,
    },
    t.id,
  );
  const event = w.events.at(-1)?.id ?? '';
  a.memory.knowledge ??= {};
  a.memory.knowledge[`${t.id}${SUFFIX}`] = {
    key: `${t.id}${SUFFIX}`,
    subject: t.kind,
    property: 'food suitability from cited evidence',
    value: v7Json({
      target: t.id,
      mode: r.mode,
      method: r.method,
      consumer: who.id,
      round: w.tick,
      verdict: e.verdict.status,
      findings: Object.fromEntries(
        e.findings.map((f) => [f.question, f.status]),
      ),
      evidence: cited.map((x) => x.id),
    }),
    method: `probe ${r.method} with your cited records; a derived report`,
    condition: limits[0] ?? '',
    evidence: event,
    tick: w.tick,
    verified: false,
  };
}

function inspect(
  c: V7ActionContext,
  r: Request,
  t: Target,
  who: Consumer,
  cited: FoodEvidenceCited[],
): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (a.vitals.energy + 1e-8 < LOOK)
    throw nothing(
      `Inspection is probe's observation for ${String(LOOK)} energy; you have ${shown(a.vitals.energy)}.`,
    );
  const run = probeRun(c, t.id, 'observe', r.intensity),
    known = a.memory.knowledge?.[`${t.id}:observed-state`],
    look = known?.tick === w.tick ? known : null,
    e = evaluate(c, t, cited, look?.evidence ?? null, null);
  commit(
    c,
    r,
    t,
    who,
    cited,
    e,
    `Inspected ${t.id} (${t.kind}) with probe for ${String(LOOK)} energy.`,
    {
      probe: {
        mode: 'observe',
        events: run.events,
        record: `${t.id}:observed-state`,
      },
      observation: look ? v7Clone(look.value) : null,
      energy: LOOK,
      view: view(
        c,
        r,
        t,
        e,
        e.verdict.status === 'unresolved' ? 'unresolved' : 'observed',
        run.events,
        null,
      ),
    },
  );
  return { complete: true, writes: run.writes };
}

/** Every trial prerequisite, checked before any cost; the refusal names what is missing. */
function trialCheck(
  c: V7ActionContext,
  r: Request,
  t: Target,
  mode: Trial,
  reference: Reference | null,
): void {
  const { world: w, actor: a } = c,
    debit = `1 round, ${String(TRIAL)} energy and ${String(SAMPLE)} unit of your sample${mode === 'heat' ? `, plus ${String(HEAT)} of a heat source's available heat` : ''}`,
    cell = w.terrain[Math.floor(a.position.y)]?.[Math.floor(a.position.x)],
    missing = [
      ...(!t.stack || t.stack.owner !== a.id
        ? [
            `your own sample: a trial uses 0.1 unit of an item you carry, not a source or a loose item (gather or pick one up first)`,
          ]
        : t.stack.quantity + 1e-9 < SAMPLE
          ? [`at least ${String(SAMPLE)} unit in ${t.id}`]
          : []),
      ...(mode === 'heat' &&
      !w.objects.some(
        (o) =>
          v7Reach(a, o.spatial) && Number(o.data.availableHeat ?? 0) >= HEAT,
      )
        ? [
            `a usable heat source with at least ${String(HEAT)} available heat within your reach`,
          ]
        : []),
      ...(mode === 'wet' && !WATER.includes(cell ?? '')
        ? [
            'usable water where you stand (marsh, ford or river), to wet the sample in it',
          ]
        : []),
      ...(!reference
        ? [
            `a cited verified ${TRIALS[mode]} record of ${t.kind} from probe at the same ${mode === 'press' ? `load ${String(r.intensity)}` : 'condition'} to compare with: a ${mode} response bears on identity only by comparison and measures no nutrition, harm or preparation`,
          ]
        : []),
      ...(a.vitals.energy + 1e-8 < TRIAL
        ? [`${String(TRIAL)} energy (you have ${shown(a.vitals.energy)})`]
        : []),
    ];
  if (missing.length)
    throw nothing(
      `Trial refused, missing: ${missing.join('; ')}. A ${mode} trial costs ${debit}.`,
    );
}

function trial(
  c: V7ActionContext,
  r: Request,
  t: Target,
  who: Consumer,
  cited: FoodEvidenceCited[],
): V7HandlerResult {
  const { actor: a } = c;
  if (r.method === 'observe')
    throw nothing('A trial needs press, wet or heat.');
  const mode = r.method,
    reference = referenceOf(c, t, r);
  trialCheck(c, r, t, mode, reference);
  const stack = t.stack;
  if (!stack || !reference) throw nothing('Trial prerequisites are missing.');
  const before = stack.quantity,
    run = probeRun(c, t.id, mode, r.intensity),
    key = `${t.kind}:${TRIALS[mode]}:${conditionOf(mode, r.intensity)}`,
    reading = a.memory.knowledge?.[key];
  if (reading?.tick !== c.world.tick)
    throw new Error('The probe trial recorded no reading.');
  const comparison: Comparison = {
      mode,
      reference,
      // Compared at the world's shared numeric precision, at which the reference was stored.
      value: v7CanonicalNumbers(v7Clone(reading.value)),
      same:
        v7Signature(v7CanonicalNumbers(reading.value)) ===
        v7Signature(v7CanonicalNumbers(reference.value)),
      record: reading.evidence,
    },
    e = evaluate(c, t, cited, null, comparison),
    sample: V7Data = {
      item: t.id,
      before,
      after: stack.quantity,
      consumed: SAMPLE,
      accountedAs:
        'loss: consumed by the trial (deformed, wetted or heated), not kept as food',
    };
  commit(
    c,
    r,
    t,
    who,
    cited,
    e,
    `${mode.charAt(0).toUpperCase()}${mode.slice(1)} trial of ${String(SAMPLE)} unit of ${t.id} (${t.kind}) through probe for ${String(TRIAL)} energy${mode === 'heat' ? ` and ${String(HEAT)} heat` : ''}: its ${TRIALS[mode]} ${comparison.same ? 'matches' : 'differs from'} your record ${reference.id}; the 0.1 unit was consumed as loss.`,
    {
      probe: { mode, events: run.events, record: key },
      comparison: v7Json(comparison),
      prerequisites: v7Json([
        {
          need: `your own sample of at least ${String(SAMPLE)} unit`,
          basis: `${t.id}, ${shown(before)} unit(s) before`,
        },
        {
          need:
            mode === 'heat'
              ? 'a usable heat source within reach'
              : mode === 'wet'
                ? 'usable water where you stand'
                : `a load of ${String(r.intensity)} by hand`,
          basis: 'present',
        },
        {
          need: `a verified ${TRIALS[mode]} record of ${t.kind} to compare`,
          basis: reference.id,
        },
      ]),
      risks:
        'probe applies no injury, spill or burn effect to this method, and none is added',
      debit: {
        rounds: 1,
        energy: TRIAL,
        sample: SAMPLE,
        heat: mode === 'heat' ? HEAT : 0,
      },
      consumed: sample,
      energy: TRIAL,
      view: view(
        c,
        r,
        t,
        e,
        comparison.same
          ? e.verdict.status === 'unresolved'
            ? 'unresolved'
            : 'observed'
          : 'informative-failure',
        run.events,
        sample,
      ),
    },
  );
  return { complete: true, writes: run.writes };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const r = request(c),
    t = targetOf(c, r),
    who = consumerOf(c, r),
    cited = citations(c, t, r.refs);
  return r.mode === 'inspect'
    ? inspect(c, r, t, who, cited)
    : trial(c, r, t, who, cited);
}

const ABILITY: V7Ability = {
  id: ID,
  name: 'Assess food suitability',
  function:
    'Judge whether an item or source within reach is suitable food for you or a person you see, from probe evidence and your own cited records: identity, nutrition, toxicity and preparation each supported, contradicted or unresolved. inspect observes it with probe; trial runs probe press, wet or heat on your own sample. Nothing is tasted, eaten or fed.',
  equivalence: 'food:evidence-qualified-suitability:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: [...MODES] },
      target: { type: 'string' },
      intendedConsumer: { type: 'string' },
      evidenceRefs: { type: 'array', items: { type: 'string' } },
      methodRef: { type: 'string' },
      intensity: { type: 'number', minimum: 0, maximum: 1 },
    }),
    required: ['mode', 'target'],
  },
  references: { target: 'optional-exact-visible' },
  prerequisites: [PROBE.ability],
  dependencies: { abilities: [PROBE.ability], resources: [], knowledge: [] },
  learning: 1,
  costs: `Study 1 round, no energy; needs probe. inspect: probe observe, 1 round, ${String(LOOK)} energy, no material. trial (methodRef press, wet or heat; intensity is the press load): probe's trial, 1 round, ${String(TRIAL)} energy and ${String(SAMPLE)} unit of your own sample, consumed as loss; heat also takes ${String(HEAT)} available heat from a source in reach, wet needs water where you stand. A trial needs a cited verified probe record of the same kind, method and load to compare with, since a load, water or heat response measures no nutrition, harm or preparation; otherwise it is refused, naming what is missing. Refusals cost nothing: target not seen now (only remembered or named), out of reach, another person's item, not a material, consumer not you or a person you see, unknown record ids. No surcharge, no refund.`,
  effects:
    'target: exact id of your item, a loose item or a source in reach. evidenceRefs: up to 6 ids of your records (record key or its evidence id, an eating record by its kind, a heard message id). intendedConsumer: you by default or a person you see; only your own records are used. Identity is supported only by your own eating record of the same kind, never by a name or label; only then are its satiety and health loss cited, and preparation is none for units as you ate them. A trial response that differs from the reference contradicts identity; a match identifies nothing. Without applicable evidence: "safety unresolved; do not consume on this evidence." An event and your record <target>:food-suitability keep the findings, evidence and limits. Nothing is gathered, moved, created, detoxified, certified or rewarded.',
  handler: HANDLER,
  revision: REVISION,
  authored: false,
  // Neither event ever carries a qualified flag: assessments earn no practice milestone.
  practiceEvidence: EVENTS.inspected,
  execution: {
    duration: 1,
    interruption: 'cancel',
    progress:
      'Atomic: each mode completes in its one round and commits with its event; a refused or interrupted round commits nothing, and a retry is a new paid round. Nothing is reserved or left pending.',
  },
};

/** ex26: Kai's evidence-based food suitability assessment, through probe and own records. */
export const LONG_EX26_FOOD_ASSESSMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex26',
  dependencies: ['foundation-forest@1', 'foundation-open@1'],
  description:
    "Assess the food suitability of one item or source within reach through probe's own observation or its press, wet or heat trial on 0.1 unit of an owned sample, with separate identity, nutrition, toxicity and preparation conclusions from that evidence and the person's own cited records. Identity rests only on the person's own eating record of the same kind; otherwise safety stays unresolved. No hidden food value, ingestion, gathering, movement, new food or reward.",
  reuse: {
    experiment:
      'foundation-open@1 probe (open.probe: observe and the press, wet and heat trials with their costs, checks, records and events); ex24 assess-food-evidence@1 (scope long-ex24, not installed here: its evidence citation and classification); ex21 targeted-food-constituent-test@1 (scope long-ex21: id-list and bounded-text parsers); ex24 examine-material@1 (unit-record state and digest); the eating record that eat keeps',
    source:
      'open-foundation.ts (OPEN_FOUNDATION.handlers open.probe); long-ex24-food-evidence.ts (foodEvidenceCite, exported unchanged); long-ex21-constituent-test.ts (constituentIdList, constituentBounded); long-ex24-material-examination.ts (materialUnitState, materialDigest); long-ex24-weather-shelter-physics.ts (shelterMeasure); collective-food-profile.ts; continuous-observation.ts (v7Observe); continuous-geometry.ts (v7Reach); open-experience.ts (routine accounting gated by this revision)',
    description:
      'Code dependencies, not copies. Checked and not equivalent: the ex21 constituent test (a requirement bill, no measurement), the ex19 and ex21 air-exposure and drying trials (exposure of whole food), examine-material (traits and dimensions) and the source-bound food evidence precursor. New: the four conclusions, the identity and applicability rule, the trial comparison and gate, and the record.',
  },
  abilities: [ABILITY],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: Object.values(EVENTS),
  resources: [],
  satisfaction: [],
  migrate(w) {
    const probe = w.abilities.find((a) => a.id === PROBE.ability);
    if (
      !w.config.forest ||
      !w.config.experience ||
      !w.config.development ||
      !w.revisions.includes('foundation-open@1') ||
      probe?.handler !== PROBE.handler
    )
      throw new Error(
        'Assessing food suitability needs the forest world with the ordinary probe interface.',
      );
    return w;
  },
};

// Shared unchanged with bounded-food-foraging@1 (long-ex26-food-foraging.ts).
export {
  MAX_REFS as FOOD_SUITABILITY_MAX_REFS,
  targetOf as foodSuitabilityTarget,
  citations as foodSuitabilityCitations,
  evaluate as foodSuitabilityEvaluate,
};
