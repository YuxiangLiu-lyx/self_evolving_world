import type {
  V7Package,
  V7ActionContext,
  V7Actor,
  V7World,
  V7Data,
} from './continuous-types.js';
import { v7Id, v7String, v7RoundNumber } from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Reach, v7ShapeDistance, v7Visible } from './continuous-geometry.js';
import { forestResolveReference } from './forest-references.js';
import { forestEvent } from './forest-climate.js';
import { foodTenths, foodSetQuantity } from './forest-food-accounting.js';
import { openRemember } from './open-foundation.js';
import { barkSubstrate } from './open-bark-accounting.js';
interface BarkWork extends V7Data {
  target: string;
  tool: string;
  sample: string;
  reserved: number;
  removed: number;
  stage: number;
  paid: number;
  x: number;
  y: number;
}
const key = 'open:bark-work';
const job = (a: V7Actor) => a.extensionState[key] as BarkWork | undefined;
function reachable(c: V7ActionContext, id: string) {
  const s = barkSubstrate(c.world, id);
  if (s.stack && s.stack.owner !== c.actor.id)
    throw new Error('Material targets must be actually owned.');
  if (
    s.object &&
    (!v7Reach(c.actor, s.object.spatial) ||
      v7ShapeDistance(c.actor.position, s.object.spatial) > 0.65 ||
      !v7Visible(c.world, c.actor.position, s.object.spatial))
  )
    throw new Error(
      'The actual substrate must be reachable within 0.65, without a blocking obstacle.',
    );
  if (!s.stack && !s.object)
    throw new Error('The actual substrate no longer exists.');
  return s;
}
export function barkCancel(w: V7World, a: V7Actor, reason: string): void {
  const j = job(a);
  if (!j) return;
  const s = barkSubstrate(w, j.target),
    output = w.stacks.find((s) => s.id === j.sample);
  if (s.stack?.reservedFor === key) delete s.stack.reservedFor;
  if (s.object?.data.barkLock === a.id) delete s.object.data.barkLock;
  if (output) delete output.reservedFor;
  delete a.extensionState['open:bark-work'];
  forestEvent(
    w,
    'bark-strip-stopped',
    'Cancelled stripping once; removed fragments remain physical and unremoved reservation returns to the same substrate. Spent effort is not refunded.',
    { x: j.x, y: j.y },
    a.id,
    {
      target: j.target,
      removedMass: j.removed,
      releasedReservation: j.reserved - j.removed,
      paidEnergy: j.paid,
      stage: j.stage,
      reason,
    },
    j.sample,
  );
}
function inspect(c: V7ActionContext) {
  const target = v7String(c.action.args.target, 'substrate'),
    s = reachable(c, target),
    p = s.layer;
  v7Spend(c.actor, 0.2);
  const suitable =
    !!p &&
    p.resource === 'bark' &&
    p.separable &&
    p.unitLayerMass * s.quantity >= 0.06 - 1e-8 &&
    p.sheetArea * s.quantity >= 0.1;
  const result = {
    status: !p
      ? 'unresolved'
      : suitable
        ? 'verified separable layer'
        : 'unsuitable for intact sheets',
    target,
    layer: p
      ? {
          resource: p.resource,
          remainingMass: p.unitLayerMass * s.quantity,
          separable: p.separable,
          intactArea: p.sheetArea * s.quantity,
          moisture: p.moisture,
          evidence: p.evidence,
        }
      : null,
    uncertainty: !p
      ? 'No represented or measured outer layer is available. A resource name is not physical evidence of bark.'
      : 'The finding applies to this actual finite substrate; no additional material was supplied.',
  };
  const findingKey = `${s.resource}:outer-layer:${result.status}`;
  if (p && !c.actor.memory.knowledge?.[findingKey]?.verified) {
    openRemember(c, {
      key: findingKey,
      subject: s.resource,
      property: 'separable outer layer',
      value: result,
      method: 'paid close inspection of actual represented material',
      condition: result.status,
      verified: !!p,
    });
  } else {
    c.emit(
      'trial-result',
      `Inspection remains ${result.status}; this observation supplies no new confirmed finding.`,
      { ...result, verified: !!p, newInformation: false },
      target,
    );
  }
  const inspections = (c.actor.extensionState['open:bark-inspections'] ??
    {}) as V7Data;
  inspections[target] = {
    tick: c.world.tick,
    suitable,
    evidence: p?.evidence ?? null,
  };
  c.actor.extensionState['open:bark-inspections'] = inspections;
  c.emit(
    'bark-inspected',
    `Inspection: ${result.status}. ${result.uncertainty}`,
    result,
    target,
  );
  return { complete: true, remaining: 0, writes: [] };
}
function strip(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  let j = job(a);
  const target = j?.target ?? v7String(c.action.args.target, 'substrate'),
    s = reachable(c, target),
    p = s.layer;
  if (!p || p.resource !== 'bark' || s.quantity <= 0)
    throw new Error(
      'No actual finite bark layer is represented; no stock is created.',
    );
  const inspection = (
    (a.extensionState['open:bark-inspections'] ?? {}) as V7Data
  )[target];
  if (
    !inspection ||
    typeof inspection !== 'object' ||
    Array.isArray(inspection) ||
    inspection.suitable !== true ||
    inspection.evidence !== p.evidence
  )
    throw new Error(
      'Personal inspection of this actual layer must establish suitability before stripping.',
    );
  if (!j) {
    if (s.object?.data.barkLock || s.stack?.reservedFor)
      throw new Error('The real substrate is already reserved.');
    const tool = forestResolveReference(
      w,
      a,
      v7String(c.action.args.tool, 'retained stone'),
      'owned',
    );
    const item = w.stacks.find((s) => s.id === tool),
      r = w.resources.find((r) => r.id === item?.resource);
    if (!item || item.quantity < 1 || (r?.properties?.hardness ?? 0) < 8)
      throw new Error('An actual retained hard stone tool is required.');
    const reserved =
      Math.floor((Math.min(0.12, p.unitLayerMass * s.quantity) + 1e-9) / 0.06) *
      0.06;
    if (reserved < 0.06 || !p.separable || p.sheetArea * s.quantity < 0.1)
      throw new Error(
        'Insufficient separable intact layer; no rounding-created material.',
      );
    if (a.vitals.energy < 0.5)
      return { complete: false, remaining: 2, writes: [] };
    j = {
      target,
      tool,
      sample: v7Id(w, 'item'),
      reserved,
      removed: 0,
      stage: 0,
      paid: 0,
      x: a.position.x,
      y: a.position.y,
    };
    a.extensionState[key] = j;
    w.processes.push({
      id: v7Id(w, 'process'),
      handler: 'open.bark-work',
      owner: a.id,
      object: s.object?.id ?? null,
      next: w.tick + 1,
      revision: 'inspect-strip-bark@1',
      data: { target },
    });
    if (s.object) s.object.data.barkLock = a.id;
    if (s.stack) s.stack.reservedFor = key;
  }
  const tool = w.stacks.find(
    (s) =>
      s.id === j.tool && s.owner === a.id && !s.reservedFor && s.quantity >= 1,
  );
  if (!tool || a.vitals.energy < 0.5)
    return { complete: false, remaining: 2 - j.stage, writes: [] };
  const mass = j.reserved / 2;
  if (p.unitLayerMass * s.quantity + 1e-8 < mass)
    throw new Error(
      'The actual reserved layer was destroyed; removed material cannot be restored.',
    );
  v7Spend(a, 0.5);
  j.paid += 0.5;
  j.stage++;
  j.removed = v7RoundNumber(j.removed + mass);
  const fraction = mass / Math.max(1e-12, p.unitLayerMass * s.quantity);
  p.sheetArea = v7RoundNumber(p.sheetArea * (1 - fraction));
  p.unitLayerMass = v7RoundNumber(p.unitLayerMass - mass / s.quantity);
  p.unitMass = v7RoundNumber(p.unitMass - mass / s.quantity);
  if (s.stack) {
    s.stack.materialLayer = p;
    s.stack.physical = {
      unitMass: p.unitMass,
      unitWater: 0,
      unitSolids: p.unitMass,
    };
  }
  if (s.object) {
    s.object.data.materialLayer = p;
    s.object.visual.state = 'partially-stripped';
    const log = (s.object.data.extractionHistory ?? []) as V7Data[];
    log.push({ tick: w.tick, actor: a.id, mass, sample: j.sample });
    s.object.data.extractionHistory = log;
  }
  let out = w.stacks.find((s) => s.id === j.sample);
  if (!out) {
    out = {
      id: j.sample,
      resource: 'bark-fragments',
      quantity: mass / 0.3,
      quantityTenths: foodTenths(mass / 0.3),
      owner: a.id,
      position: { ...a.position },
      origin: target,
      reservedFor: key,
      processing: {
        barkRemoval: {
          target,
          evidence: p.evidence,
          tool: j.tool,
          removedMass: mass,
          paidEnergy: j.paid,
        },
      },
    };
    w.stacks.push(out);
  } else {
    foodSetQuantity(out, foodTenths(out.quantity) + foodTenths(mass / 0.3));
    out.processing = {
      barkRemoval: {
        target,
        evidence: p.evidence,
        tool: j.tool,
        removedMass: j.removed,
        paidEnergy: j.paid,
      },
    };
  }
  const complete = j.stage === 2;
  if (complete) {
    if (p.separable) out.resource = 'bark';
    delete out.reservedFor;
    if (s.stack) delete s.stack.reservedFor;
    if (s.object) delete s.object.data.barkLock;
    delete a.extensionState['open:bark-work'];
  }
  c.emit(
    complete ? 'bark-stripped' : 'bark-strip-progress',
    complete
      ? 'Recovered only the real removed layer; the substrate lost exactly that mass.'
      : 'Paid stripping removed a real partial layer into retained fragments.',
    {
      target,
      tool: j.tool,
      sample: out.id,
      removedMass: j.removed,
      remainingLayerMass: p.unitLayerMass * s.quantity,
      substrateMass: p.unitMass * s.quantity,
      paidEnergy: j.paid,
      remainingWork: 2 - j.stage,
      output: out.resource,
      quantity: out.quantity,
    },
    target,
  );
  return { complete, remaining: 2 - j.stage, writes: [target, out.id] };
}
export const OPEN_BARK: V7Package = {
  id: 'inspect-strip-bark',
  version: 1,
  scope: 'open-ex10',
  description:
    'Close inspection and conserved stripping only from actual layer evidence; generic branches remain unresolved.',
  dependencies: ['foundation-open@1'],
  reuse: {
    experiment: 'ex10 current baseline',
    source: 'packages/world-core/src/open-foundation.ts',
    description:
      'Shared grounded findings, references, geometry and exact-tenths transfer. No historical willow stripping handler or positive natural bark profile is inherited.',
  },
  abilities: [
    {
      id: 'inspect-strip-bark',
      name: 'Inspect and strip represented bark',
      function:
        'Inspect an actual source or owned material, then strip a finite verified separable layer. Generic branch names do not establish a bark layer.',
      equivalence: 'open:actual-bark-layer-inspection-and-removal:1',
      parameters: v7ObjectSchema({
        mode: { type: 'string', enum: ['inspect', 'strip'] },
        target: { type: 'string' },
        tool: { type: 'string' },
      }),
      prerequisites: [],
      dependencies: { abilities: [], resources: ['bark'], knowledge: [] },
      learning: 3,
      costs:
        'Inspect: one round, 0.2 energy, actual reach <=0.65; tool may be empty. Strip: personal positive inspection, actual supported layer and retained owned stone of hardness >=8; two performed rounds at 0.5 energy each. At most 0.12 mass is removed from substrate in exact representable steps; no material is supplied.',
      effects:
        'Nullable composition stays unknown until actual evidence exists. Finite layer mass and sheet area decline; only completed suitable sheets become bark. Partial/failed material remains bark-fragments. Shared source locks prevent simultaneous gathering or duplicate extraction. No felling, regeneration, free apparatus or guaranteed bark yield.',
      handler: 'open.bark',
      revision: 'inspect-strip-bark@1',
      authored: false,
      references: { target: 'visible' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Inspection completes once; stripping has two paid stages. Lost tools or energy pause without charges. Change of action, loss of reach, destroyed substrate or death cancels once; surviving removed fragments remain, unremoved material remains in the same substrate.',
      },
    },
  ],
  handlers: {
    'open.bark': (c) =>
      c.action.args.mode === 'inspect' ? inspect(c) : strip(c),
  },
  processes: {
    'open.bark-work': (w, p) => {
      const a = w.actors.find((a) => a.id === p.owner),
        j = a ? job(a) : undefined;
      if (a && j) {
        const s = barkSubstrate(w, j.target);
        if (
          (!s.stack && !s.object) ||
          !s.layer ||
          s.layer.unitLayerMass * s.quantity + 1e-8 < j.reserved - j.removed
        )
          barkCancel(
            w,
            a,
            'Reserved substrate was destroyed or its real remaining layer was lost.',
          );
      }
      if (!a || !job(a)) w.processes = w.processes.filter((x) => x.id !== p.id);
      else p.next = w.tick + 1;
    },
  },
  resources: [
    {
      id: 'bark-fragments',
      name: 'Separated bark fragments',
      mass: 0.3,
      nutrition: 0,
      toxicity: 0,
      color: '#bca67e',
    },
  ],
  satisfaction: [],
  visualComponents: ['plant'],
  events: [
    'bark-inspected',
    'bark-strip-progress',
    'bark-stripped',
    'bark-strip-stopped',
  ],
  beforeAction(w, a, action, continuing) {
    const j = job(a);
    if (j) {
      const s = barkSubstrate(w, j.target);
      if (
        action.interface !== 'inspect-strip-bark' ||
        !continuing ||
        (!s.stack && !s.object) ||
        (s.object && v7ShapeDistance(a.position, s.object.spatial) > 0.65)
      )
        barkCancel(
          w,
          a,
          'Active action, actual substrate or interaction reach changed.',
        );
    }
    if (action.interface === 'gather') {
      const o = w.objects.find((o) => o.id === action.args.target);
      if (o?.data.barkLock)
        throw new Error(
          'The observed source is reserved by unfinished extraction.',
        );
    }
  },
  onDeath(w, a) {
    barkCancel(
      w,
      a,
      'Performer died; surviving fragments drop with actual possessions.',
    );
  },
  migrate(w) {
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance)
      throw new Error('Missing current-run understanding source.');
    r.alternativeTriggers = [
      ...(r.alternativeTriggers ?? []),
      { event: 'information-confirmed', interface: 'inspect-strip-bark' },
    ];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      { event: 'information-confirmed', interface: 'inspect-strip-bark' },
    ];
    return w;
  },
};
