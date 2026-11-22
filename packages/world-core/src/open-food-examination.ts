import type {
  V7Actor,
  V7World,
  V7Data,
  V7Package,
  V7ActionContext,
  V7Stack,
} from './continuous-types.js';
import { v7Clone, v7Id, v7String } from './continuous-data.js';
import { v7Spend, v7ObjectSchema } from './continuous-base.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import { openRemember } from './open-foundation.js';
import { forestClearOperation } from './forest-operations.js';

const key = 'open:food-examination';
interface Examination extends V7Data {
  source: string;
  sample: string;
  tool: string | null;
  x: number;
  y: number;
  stage: number;
  paid: number;
  started: number;
}
const job = (actor: V7Actor) =>
  actor.extensionState[key] as Examination | undefined;
function release(w: V7World, a: V7Actor, reason: string): void {
  const j = job(a);
  if (!j) return;
  const sample = w.stacks.find((s) => s.id === j.sample);
  if (sample) {
    delete sample.reservedFor;
    sample.position = { x: j.x, y: j.y };
  }
  delete a.extensionState['open:food-examination'];
  forestClearOperation(a);
  forestEvent(
    w,
    'process-stopped',
    'Food examination cancelled; surviving opened material remains real and spent effort is not refunded.',
    { x: j.x, y: j.y },
    a.id,
    {
      ability: 'examine-food',
      source: j.source,
      sample: j.sample,
      stage: j.stage,
      paidEnergy: j.paid,
      returnedQuantity: sample?.quantity ?? 0,
      reason,
    },
    j.sample,
  );
}
const limitations =
  'Visible condition and tissue structure do not establish safety, digestibility, calories or absence of toxins. No chemical or biological assay was performed.';
function examine(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  let j = job(a);
  if (!j) {
    const source = w.stacks.find(
      (s) =>
        s.id === v7String(c.action.args.target, 'food sample') &&
        s.owner === a.id &&
        !s.reservedFor,
    );
    const r = w.resources.find((r) => r.id === source?.resource);
    if (!source || !r || r.nutrition <= 0 || source.quantity < 0.1)
      throw new Error(
        'An actual owned food sample of at least 0.1 unit is required; this does not certify its safety.',
      );
    const hard = (r.properties?.hardness ?? 0) > 1;
    const tools = w.stacks.filter(
      (s) =>
        s.owner === a.id &&
        !s.reservedFor &&
        s.quantity >= 1 &&
        w.resources.some(
          (r) =>
            r.id === s.resource &&
            (r.properties?.hardness ?? 0) >= 8 &&
            (r.properties?.fuel ?? 0) === 0,
        ),
    );
    if (hard && tools.length !== 1)
      throw new Error(
        `A harder sample needs one unambiguous owned hard stone tool. Actual owned candidates: ${tools.map((s) => `item:${s.id}`).join(', ') || 'none'}. No alternative item is silently selected.`,
      );
    v7Spend(a, 0.5);
    const sample: V7Stack = {
      ...v7Clone(source),
      id: v7Id(w, 'item'),
      quantity: 0.1,
      quantityTenths: 1,
      reservedFor: key,
      position: { ...a.position },
      processing: {
        ...(source.processing ?? {}),
        foodExamination: {
          source: source.id,
          originalOrigin: source.origin,
          openedAt: w.tick,
          quantity: 0.1,
          paidEnergy: 0.5,
          tool: hard ? (tools[0]?.id ?? null) : null,
          limitations,
        },
      },
    };
    foodSetQuantity(source, foodTenths(source.quantity) - 1);
    w.stacks.push(sample);
    j = {
      source: source.id,
      sample: sample.id,
      tool: hard ? (tools[0]?.id ?? null) : null,
      x: a.position.x,
      y: a.position.y,
      stage: 1,
      paid: 0.5,
      started: w.tick,
    };
    a.extensionState[key] = j;
    c.emit(
      'food-sample-opened',
      'Opened 0.1 actual food unit; no food was eaten, detoxified or declared safe.',
      {
        source: j.source,
        sample: j.sample,
        quantity: 0.1,
        paidEnergy: 0.5,
        tool: j.tool,
        remainingWork: 1,
        limitations,
      },
      sample.id,
    );
    return { complete: false, remaining: 1, writes: [source.id, sample.id] };
  }
  const sample = w.stacks.find(
    (s) => s.id === j.sample && s.owner === a.id && s.reservedFor === key,
  );
  if (!sample)
    throw new Error(
      'The real opened sample is missing or spoiled; no observation or material is invented.',
    );
  if (
    j.tool &&
    !w.stacks.some(
      (s) =>
        s.id === j.tool &&
        s.owner === a.id &&
        !s.reservedFor &&
        s.quantity >= 1,
    )
  ) {
    c.emit(
      'process-progress',
      'Examination is paused because its actual tool is unavailable; no additional cost was charged.',
      {
        ability: 'examine-food',
        sample: j.sample,
        remainingWork: 1,
        paidEnergy: j.paid,
        paused: true,
      },
    );
    return { complete: false, remaining: 1, writes: [] };
  }
  v7Spend(a, 0.5);
  j.paid += 0.5;
  const r = w.resources.find((r) => r.id === sample.resource);
  if (!r) throw new Error('Missing actual sample definition.');
  const fraction =
    (r.properties?.decay ?? 0) > 0
      ? Math.min(1, (sample.decay ?? 0) / (r.properties?.decay ?? 1))
      : 0;
  const condition =
    fraction < 0.25
      ? 'little observable deterioration'
      : fraction < 0.65
        ? 'observable deterioration'
        : 'advanced deterioration';
  const observations = {
    integrity: Math.round((1 - fraction) * 100) / 100,
    firmness:
      (r.properties?.hardness ?? 0) <= 1
        ? 'soft'
        : (r.properties?.hardness ?? 0) <= 4
          ? 'firm'
          : 'hard',
    condition,
    opened: true,
  };
  openRemember(c, {
    key: `${r.id}:tissue-integrity:${condition}`,
    subject: r.id,
    property: 'exposed tissue integrity',
    value: observations,
    method: 'paid opening and direct internal examination',
    condition,
    verified: true,
  });
  delete sample.reservedFor;
  sample.processing = {
    ...(sample.processing ?? {}),
    foodExamination: {
      source: j.source,
      originalOrigin: sample.origin,
      openedAt: j.started,
      examinedAt: w.tick,
      quantity: sample.quantity,
      paidEnergy: j.paid,
      tool: j.tool,
      observations,
      limitations,
    },
  };
  c.emit(
    'food-examination-completed',
    'Completed the actual internal examination and retained the opened sample. Food safety and nutritional usefulness remain unknown.',
    {
      source: j.source,
      sample: j.sample,
      resource: r.id,
      quantity: sample.quantity,
      paidEnergy: j.paid,
      tool: j.tool,
      harvestedAt: sample.harvestedAt ?? null,
      decay: sample.decay ?? 0,
      observations,
      limitations,
      remainingWork: 0,
    },
    sample.id,
  );
  delete a.extensionState['open:food-examination'];
  return { complete: true, remaining: 0, writes: [sample.id] };
}
export const OPEN_FOOD_EXAMINATION: V7Package = {
  id: 'food-examination',
  version: 1,
  scope: 'open-ex10',
  description:
    'Ex10 requested non-ingestive internal food examination; no universal safety assay.',
  dependencies: ['foundation-open@1'],
  reuse: {
    experiment: 'ex10 authored baseline',
    source: 'packages/world-core/src/open-foundation.ts',
    description:
      'Reuses the current-run grounded knowledge recorder and shared reference, fixed-point and durable-operation engine. No historical generated food-assessment handler, mastery, resource or reward is inherited.',
  },
  abilities: [
    {
      id: 'examine-food',
      name: 'Examine an opened food sample',
      function:
        'Open and inspect an actual owned sample for internal physical deterioration and tissue condition without ingestion. Safety, calories and toxin absence remain unknown.',
      equivalence: 'open:noningestive-food-tissue-examination:1',
      parameters: v7ObjectSchema({
        target: { type: 'string' },
        method: { type: 'string', enum: ['open-inspect'] },
      }),
      prerequisites: [],
      dependencies: { abilities: [], resources: [], knowledge: [] },
      learning: 2,
      costs:
        'Two performed work rounds, 0.5 energy each, and 0.1 food unit temporarily escrowed and retained as opened material. Hard samples require one actual owned hard stone tool, retained. No health, nutrition or detoxification benefit.',
      effects:
        'Measured internal condition with explicit uncertainty and conserved provenance. No repeated-finding reward. Existing authored paid-practice milestones remain distinct from the shared confirmed-understanding source.',
      handler: 'open.food-examination',
      revision: 'food-examination@1',
      authored: false,
      references: { target: 'owned' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Two performed work stages. Global pauses preserve exact work; a missing retained tool pauses without charges. Action change, movement or death cancels and releases surviving opened material once. Spent energy is not refunded.',
      },
    },
  ],
  handlers: { 'open.food-examination': examine },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: ['plant'],
  events: ['food-sample-opened', 'food-examination-completed'],
  beforeAction(w, a, action, continuing) {
    const j = job(a);
    if (
      j &&
      (action.interface !== 'examine-food' ||
        !continuing ||
        a.position.x !== j.x ||
        a.position.y !== j.y)
    )
      release(w, a, 'Action, exact identity or starting position changed.');
  },
  onDeath(w, a) {
    release(w, a, 'Performer died.');
  },
  migrate(w) {
    const source = w.satisfaction.find(
      (s) => s.id === 'grounded-understanding',
    );
    if (!source || !source.maintenance)
      throw new Error('Missing current-run grounded-understanding source.');
    source.alternativeTriggers = [
      ...(source.alternativeTriggers ?? []),
      { event: 'information-confirmed', interface: 'examine-food' },
    ];
    source.maintenance.alternativeTriggers = [
      ...(source.maintenance.alternativeTriggers ?? []),
      { event: 'information-confirmed', interface: 'examine-food' },
    ];
    return w;
  },
};
