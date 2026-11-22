import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Clone, v7String, v7Json } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  v7Distance,
  v7Inside,
  v7Obstacles,
  v7SegmentClear,
  v7ShapesOverlap,
  v7Visible,
} from './continuous-geometry.js';
import { forestResolveReference } from './forest-references.js';
import { forestEvent } from './forest-climate.js';
import { scratchPhysical, scratchVisible } from './open-hardness-physics.js';
import { openRemember } from './open-foundation.js';
import { openConditions } from './open-physical.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workFind,
  workPay,
  workReserve,
  workResult,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
export const FOOD_INSPECTION = 'non-ingestive-food-inspection';
interface InspectionJob extends CollectiveWork {
  sample: string;
  tool: string;
  startingFraction: number;
  originalSample: string;
  originalTool: string;
}
const fraction = (s: V7Stack) =>
  Number((s.processing?.foodInspection as V7Data | undefined)?.fraction ?? 0);
function publicSample(w: V7World, s: V7Stack) {
  return {
    sampleId: s.id,
    resource: s.resource,
    quantity: s.quantity,
    origin: s.origin,
    openedFraction: fraction(s),
    interiorAccessible: fraction(s) >= 1,
    grossCondition: s.processing?.visibleSpoilage ?? null,
    recordedDecay: s.decay ?? 0,
    nutrition: null,
    toxicity: null,
    safeToEat: null,
    anatomy: null,
    limitation:
      'Not a safety test. Appearance and mechanical access cannot establish nutrition, absence of toxins or edible yield. Baseline aging is retained; opening is not validated as crushed-food processing.',
    tick: w.tick,
  };
}
function emitProgress(c: V7ActionContext, j: InspectionJob, type: string) {
  const sample = c.world.stacks.find((s) => s.id === j.sample);
  c.emit(
    type,
    'Actual non-ingestive work and retained uncertainty; not a safety test.',
    {
      processId: j.id,
      sampleId: j.sample,
      sourceId: j.originalSample,
      toolId: j.tool,
      status: j.status,
      completedWork: j.completedWork,
      remainingWork: j.remainingWork,
      paidEnergy: j.paidEnergy,
      findings: sample ? publicSample(c.world, sample) : null,
    },
    j.id,
  );
}
function validSite(
  c: V7ActionContext,
  j: { x: number; y: number; id?: string },
) {
  const spatial = {
    ...j,
    angle: 0,
    shape: { kind: 'circle' as const, radius: 0.18 },
    solid: false,
    interaction: 0.65,
    entrances: [],
  };
  return (
    !collectiveJobs(c.world, FOOD_INSPECTION).some(
      (other) =>
        other.id !== j.id &&
        ['active', 'paused'].includes(other.status) &&
        v7Distance(other, j) < 0.36,
    ) &&
    v7Inside(c.world, spatial, 0.18) &&
    v7Distance(c.actor.position, j) <= 0.65 &&
    v7Visible(c.world, c.actor.position, spatial) &&
    !['~', '=', ','].includes(openConditions(c.world, j).ground) &&
    !v7Obstacles(c.world).some((o) => v7ShapesOverlap(spatial, o)) &&
    !c.world.objects.some(
      (o) => o.spatial.reserved && v7ShapesOverlap(spatial, o.spatial),
    ) &&
    !c.world.actors.some(
      (a) => a.vitals.health > 0 && v7Distance(a.position, j) < a.radius + 0.18,
    ) &&
    v7SegmentClear(c.actor.position, j, 0, v7Obstacles(c.world))
  );
}
function contact(w: V7World, tool: V7Stack, sample: V7Stack) {
  const physical = scratchPhysical(w, tool),
    visible = scratchVisible(w, tool),
    target = scratchPhysical(w, sample);
  return (
    ['stone', 'flint'].includes(tool.resource) &&
    physical.usable &&
    !physical.fractured &&
    !physical.contaminated &&
    visible.controlledContact &&
    Number(physical.resistance) >= Math.max(1, Number(target.resistance))
  );
}
function start(c: V7ActionContext): InspectionJob {
  const inputs = workAllocations(c, [
    { itemId: c.action.args.sampleId, quantity: 0.1 },
    { itemId: c.action.args.toolId, quantity: 1 },
  ]);
  const sample = inputs[0]?.stack,
    tool = inputs[1]?.stack;
  if (
    !sample ||
    !tool ||
    sample.resource !== 'hazelnut' ||
    fraction(sample) >= 1
  )
    throw new Error(
      'An actual owned unopened or partly opened hazelnut portion is required.',
    );
  if (!contact(c.world, tool, sample))
    throw new Error(
      'An actual usable hard stone/flint contact is required; no tool or safety knowledge is supplied.',
    );
  const point = {
    x: c.actor.position.x + c.actor.radius + 0.23,
    y: c.actor.position.y,
  };
  if (!validSite(c, point))
    throw new Error(
      'The adjacent work position overlaps an actual body, obstacle or reserved surface, or is inaccessible. Move to clear reachable ground.',
    );
  const j = workCreate(
    c,
    'open',
    Math.round(2 * (1 - fraction(sample))),
  ) as InspectionJob;
  j.x = point.x;
  j.y = point.y;
  j.startingFraction = fraction(sample);
  j.originalSample = sample.id;
  j.originalTool = tool.id;
  // Retain engine composition for audit without exposing it as an observed measurement.
  c.world.state['food-inspection:composition:' + j.id] = v7Json({
    resource: c.world.resources.find((r) => r.id === sample.resource) ?? null,
    physical: sample.physical ?? null,
    processing: sample.processing ?? null,
    age: sample.harvestedAt ?? null,
    decay: sample.decay ?? 0,
  });
  const toolPhysical = scratchPhysical(c.world, tool),
    samplePhysical = scratchPhysical(c.world, sample);
  workReserve(c, j, inputs);
  j.sample = j.escrow[0] ?? '';
  j.tool = j.escrow[1] ?? '';
  c.world.state['hardness:intrinsic:' + j.tool] = v7Clone(toolPhysical);
  c.world.state['hardness:intrinsic:' + j.sample] = v7Clone(samplePhysical);
  emitProgress(c, j, 'food-inspection-started');
  return j;
}
export function stopFoodInspection(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
) {
  workStop(w, a, j, reason, true);
  for (const s of w.stacks.filter((s) => j.escrow.includes(s.id))) {
    s.processing ??= {};
    s.processing.collectiveWorkReleased = j.id;
  }
  forestEvent(
    w,
    'food-inspection-stopped',
    reason,
    { x: j.x, y: j.y },
    a.id,
    {
      processId: j.id,
      sampleId: j.sample ?? null,
      toolId: j.tool ?? null,
      completedWork: j.completedWork,
      remainingWork: j.remainingWork,
      paidEnergy: j.paidEnergy,
    },
    j.id,
  );
}
function advance(c: V7ActionContext, j: InspectionJob) {
  if (!['active', 'paused'].includes(j.status))
    throw new Error('This food inspection process is already settled.');
  const sample = c.world.stacks.find((s) => s.id === j.sample),
    tool = c.world.stacks.find((s) => s.id === j.tool);
  if (
    !sample ||
    !tool ||
    [sample, tool].some(
      (s) => s.owner !== c.actor.id || s.reservedFor !== j.id,
    ) ||
    !validSite(c, j) ||
    !contact(c.world, tool, sample)
  ) {
    j.status = 'paused';
    j.reason =
      'Actual sample, contact or reachable clear work position is unavailable; paid progress remains.';
    return workResult(j);
  }
  if (!workPay(c, j, 0.5)) return workResult(j);
  sample.processing ??= {};
  sample.processing.foodInspection = {
    fraction: j.startingFraction + j.completedWork / 2,
    source: j.originalSample,
    method: 'paid hard-tool compression',
    work: j.id,
  };
  emitProgress(c, j, 'food-inspection-progress');
  if (j.remainingWork === 0) {
    for (const s of [sample, tool]) {
      delete s.reservedFor;
      s.position = { ...c.actor.position };
    }
    j.status = 'completed';
    j.outputs = [sample.id];
    openRemember(c, {
      key: 'hazelnut:mechanical-interior-access:compression-v1',
      subject: 'hazelnut',
      property: 'interior mechanically accessible after paid compression',
      value: {
        accessible: true,
        nutrition: null,
        toxicity: null,
        safeToEat: null,
      },
      method: 'two paid work increments with actual hard-tool contact',
      condition: 'Only mechanical access; not a food safety assay.',
      verified: true,
    });
    // The reviewed finding uses one canonical source, not a second practice reward.
    const evidence = c.world.events.at(-1);
    if (evidence?.type === 'information-confirmed')
      evidence.data.practiceEligible = false;
    emitProgress(c, j, 'food-inspection-completed');
  }
  return workResult(j);
}
function inspect(c: V7ActionContext, j?: InspectionJob) {
  const id =
    j?.sample ??
    forestResolveReference(
      c.world,
      c.actor,
      v7String(c.action.args.sampleId, 'sampleId'),
      'visible',
    );
  const sample = c.world.stacks.find((s) => s.id === id);
  if (
    !sample ||
    (sample.owner !== c.actor.id && sample.owner !== null) ||
    (sample.reservedFor && sample.reservedFor !== j?.id) ||
    ((sample.owner === null || !!sample.reservedFor) &&
      v7Distance(c.actor.position, sample.position) > 0.65)
  )
    throw new Error(
      'Inspect only an actually accessible personal or ground sample.',
    );
  v7Spend(c.actor, 0.2);
  c.emit(
    'food-inspection-observed',
    'Retained observable sample state; not a safety test.',
    {
      ...publicSample(c.world, sample),
      inspectionEnergy: 0.2,
      processId: j?.id ?? null,
      remainingWork: j?.remainingWork ?? 0,
      paidEnergy: j?.paidEnergy ?? 0,
    },
    sample.id,
  );
  c.actor.memory.knowledge ??= {};
  const key = 'food-inspection:' + sample.id;
  c.actor.memory.knowledge[key] = {
    key,
    subject: sample.id,
    property: 'dated non-ingestive appearance',
    value: publicSample(c.world, sample),
    method: 'paid local inspection',
    condition: 'Not a safety test.',
    evidence: c.world.events.at(-1)?.id ?? '',
    tick: c.world.tick,
    verified: false,
  };
  return { complete: true, writes: [] };
}
export function executeFoodInspection(c: V7ActionContext) {
  const mode = v7String(c.action.args.action, 'action');
  let j = workFind(c) as InspectionJob | undefined;
  if (mode === 'inspect') {
    if (c.action.args.sampleId && c.action.args.processId)
      throw new Error(
        'Inspect one explicit sample or process identity, not both.',
      );
    return inspect(c, c.action.args.sampleId ? undefined : j);
  }
  if (mode === 'start' && j && c.operation?.first !== false)
    throw new Error(
      'Existing work retains exact inputs. Continue by processId or cancel first.',
    );
  if (mode === 'start' && !j) j = start(c);
  if (!j) throw new Error('No exact personal inspection process.');
  if (mode === 'continue' && (c.action.args.sampleId || c.action.args.toolId))
    throw new Error(
      'Continue by processId without substituting material references.',
    );
  if (mode === 'cancel') {
    stopFoodInspection(
      c.world,
      c.actor,
      j,
      'Cancelled; actual partial sample and reusable tool released at the work location.',
    );
    return workResult(j);
  }
  return advance(c, j);
}
export function pauseFoodInspection(w: V7World, a: V7Actor) {
  for (const j of collectiveJobs(w, FOOD_INSPECTION).filter(
    (j) => j.owner === a.id && j.status === 'active',
  ))
    j.status = 'paused';
}
