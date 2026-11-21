import type {
  V7Actor,
  V7Data,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Clone, v7Id, v7String } from './continuous-data.js';
import { v7FoodEffect, v7Spend } from './continuous-base.js';
import { forestEvent } from './forest-environment.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';

const pendingKey = 'food-assessment:pending';
const recordsKey = 'food-assessment:records';
interface Assessment extends V7Data {
  id: string;
  target: string;
  resource: string;
  origin: string;
  mode: string;
  fraction: number;
  escrow: string | null;
  startTick: number;
  lastTick: number;
  elapsed: number;
  x: number;
  y: number;
  ingested: boolean;
  nourishment: number;
  adverse: boolean;
  confounding: boolean;
  sensory: V7Data;
  baseline: V7Data;
  followup: V7Data[];
  evidence: V7Data[];
}
function pending(actor: V7Actor): Assessment | null {
  const value = actor.extensionState[pendingKey];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.elapsed !== 'number' ||
    !Array.isArray(value.followup)
  )
    throw new Error('Invalid retained food assessment.');
  return value as Assessment;
}
function record(
  actor: V7Actor,
  operation: Assessment,
  status: string,
  tick: number,
  reason: string,
): void {
  const old = actor.extensionState[recordsKey];
  actor.extensionState[recordsKey] = [
    ...(Array.isArray(old)
      ? old.filter(
          (r) =>
            !r ||
            typeof r !== 'object' ||
            Array.isArray(r) ||
            r.id !== operation.id,
        )
      : []),
    {
      ...v7Clone(operation),
      status,
      endTick: tick,
      reason,
      uncertainty:
        'This records one examination or measured exposure. It does not establish general safety, hidden composition, immunity or future effects.',
    },
  ].slice(-16);
}
function emit(
  world: V7World,
  actor: V7Actor,
  type: string,
  description: string,
  data: V7Data,
): void {
  forestEvent(world, type, description, actor.position, actor.id, data);
  const event = world.events.at(-1);
  if (event) event.interface = 'assess-food';
}
function cancel(
  world: V7World,
  actor: V7Actor,
  reason: string,
  dead = false,
): void {
  const operation = pending(actor);
  if (!operation) return;
  const escrow = world.stacks.find(
    (s) => s.id === operation.escrow && s.reservedFor === operation.id,
  );
  if (escrow && !operation.ingested) {
    delete escrow.reservedFor;
    escrow.owner = dead ? null : actor.id;
    escrow.position = { ...actor.position };
  }
  record(actor, operation, 'cancelled', world.tick, reason);
  emit(
    world,
    actor,
    'food-assessment-cancelled',
    `Food assessment cancelled: ${reason}. Unconsumed surviving material is released once; consumed or spoiled material is not restored.`,
    { operation: operation.id, ingested: operation.ingested },
  );
  delete actor.extensionState['food-assessment:pending'];
}
function sensory(world: V7World, stack: V7Stack): V7Data {
  const r = world.resources.find((r) => r.id === stack.resource);
  const hardness = r?.properties?.hardness;
  const life = r?.properties?.decay ?? 0;
  return {
    appearance: r
      ? `Observed color ${r.color}; ${r.name}.`
      : 'Unknown appearance.',
    texture:
      hardness === undefined
        ? 'Unknown: no tactile property is implemented.'
        : hardness >= 4
          ? 'Firm under direct examination.'
          : 'Soft or yielding under direct examination.',
    odor: 'Unknown: no odor property is implemented.',
    deterioration:
      life && (stack.decay ?? 0) >= life * 0.7
        ? 'Visible aging; freshness is uncertain.'
        : 'No visible deterioration recorded; this does not establish safety.',
    nutrition: 'Unknown from appearance or touch.',
    toxicity: 'Unknown from appearance or touch.',
  };
}
export const FOREST_FOOD_ASSESSMENT: V7Package = {
  id: 'food-assessment',
  version: 1,
  dependencies: ['foundation-forest@1'],
  description:
    'Paid examination, fixed-point sample escrow and monitored personal evidence with explicit uncertainty.',
  resources: [],
  handlers: {
    'food.assess@1': ({ world, actor, action }) => {
      const target = v7String(action.args.target, 'owned sample target');
      const mode = v7String(action.args.mode, 'assessment mode');
      if (!['examine', 'sample'].includes(mode))
        throw new Error('Unknown assessment mode.');
      const fraction = mode === 'sample' ? Number(action.args.fraction) : 0;
      if (
        mode === 'sample' &&
        (!Number.isFinite(fraction) ||
          fraction < 0.1 ||
          fraction > 1 ||
          foodTenths(fraction) < 1)
      )
        throw new Error(
          'A sample needs an explicit measured fraction from 0.1 to 1 in tenths.',
        );
      if (
        actor.vitals.health < 80 ||
        (mode === 'sample' &&
          !pending(actor)?.ingested &&
          actor.vitals.satiety > 90)
      )
        throw new Error(
          'Assessment requires health at least 80; sampling also requires satiety at most 90.',
        );
      let operation = pending(actor);
      if (
        operation &&
        (operation.target !== target ||
          operation.mode !== mode ||
          operation.fraction !== fraction ||
          operation.x !== actor.position.x ||
          operation.y !== actor.position.y ||
          operation.lastTick !== world.tick - 1)
      ) {
        cancel(
          world,
          actor,
          'target, mode, position or consecutive attention changed',
        );
        operation = null;
      }
      v7Spend(actor, 0.5);
      if (!operation) {
        const stack = world.stacks.find(
          (s) => s.id === target && s.owner === actor.id && !s.reservedFor,
        );
        if (!stack || stack.quantity < fraction)
          throw new Error(
            'The actual owned unreserved target quantity is unavailable.',
          );
        const id = v7Id(world, 'assessment');
        let escrow: V7Stack | null = null;
        if (mode === 'sample') {
          escrow = {
            ...v7Clone(stack),
            id: v7Id(world, 'sample'),
            reservedFor: id,
            position: { ...actor.position },
          };
          foodSetQuantity(escrow, foodTenths(fraction));
          foodSetQuantity(
            stack,
            foodTenths(stack.quantity) - foodTenths(fraction),
          );
          world.stacks.push(escrow);
        }
        operation = {
          id,
          target,
          resource: stack.resource,
          origin: stack.origin,
          mode,
          fraction,
          escrow: escrow?.id ?? null,
          startTick: world.tick,
          lastTick: world.tick,
          elapsed: 0,
          x: actor.position.x,
          y: actor.position.y,
          ingested: false,
          nourishment: 0,
          adverse: false,
          confounding: false,
          sensory: {},
          baseline: { ...actor.vitals },
          followup: [],
          evidence: [],
        };
        actor.extensionState[pendingKey] = operation;
        emit(
          world,
          actor,
          'food-assessment-started',
          `Started ${mode} assessment; ${String(fraction)} resource units reserved.`,
          {
            operation: id,
            mode,
            fraction,
            resource: stack.resource,
            origin: stack.origin,
          },
        );
      }
      const material = world.stacks.find(
        (s) => s.id === (operation.escrow ?? target),
      );
      if (!operation.ingested && !material)
        throw new Error('The assessment material no longer exists.');
      operation.elapsed++;
      operation.lastTick = world.tick;
      if (operation.elapsed <= 2 && material) {
        operation.sensory = sensory(world, material);
        emit(
          world,
          actor,
          'food-assessment-observed',
          `Examining actual ${operation.resource}: ${String(operation.elapsed)} / 2 rounds. Composition and general safety remain unknown.`,
          { operation: operation.id, sensory: operation.sensory },
        );
      }
      if (mode === 'sample' && operation.elapsed === 3) {
        if (!material || material.reservedFor !== operation.id)
          throw new Error('Missing uniquely reserved sample.');
        const r = world.resources.find((r) => r.id === material.resource);
        if (!r) throw new Error('Unknown actual material.');
        const before = { ...actor.vitals };
        v7FoodEffect(actor, r, fraction, world, material);
        foodSetQuantity(material, 0);
        operation.ingested = true;
        operation.nourishment = actor.vitals.satiety - before.satiety;
        operation.adverse = actor.vitals.health < before.health;
        emit(
          world,
          actor,
          'food-assessment-sampled',
          `Consumed a measured ${String(fraction)} portion; observed satiety change ${String(operation.nourishment)} and health change ${String(actor.vitals.health - before.health)}. General safety remains unknown.`,
          {
            operation: operation.id,
            resource: r.id,
            fraction,
            before,
            after: { ...actor.vitals },
            origin: operation.origin,
          },
        );
        if (operation.adverse)
          emit(
            world,
            actor,
            'injured',
            'Measured food exposure caused health loss.',
            {
              operation: operation.id,
              cause: 'food exposure',
              before: before.health,
              after: actor.vitals.health,
            },
          );
      }
      return {
        complete: operation.elapsed >= (mode === 'sample' ? 5 : 2),
        ...(world.config.experience
          ? {
              remaining: Math.max(
                0,
                (mode === 'sample' ? 5 : 2) - operation.elapsed,
              ),
            }
          : {}),
        writes: [],
      };
    },
  },
  processes: {},
  visualComponents: [],
  events: [
    'food-assessment-started',
    'food-assessment-observed',
    'food-assessment-sampled',
    'food-assessment-completed',
    'food-assessment-cancelled',
  ],
  abilities: [
    {
      id: 'assess-food',
      name: 'Cautious food assessment',
      function:
        'Examine an owned material or consume a measured sample and monitor actual personal effects.',
      equivalence: 'food:owned-evidence:fixed-tenths:examine-sample-monitor',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string' },
          mode: { type: 'string', enum: ['examine', 'sample'] },
          fraction: { type: 'number', minimum: 0.1, maximum: 1 },
        },
        required: ['target', 'mode'],
        additionalProperties: false,
      },
      prerequisites: [],
      learning: 3,
      costs:
        'Examine: 2 stationary rounds at 0.5 energy each. Sample: 5 stationary rounds at 0.5 energy each plus 1 ingestion energy, the specified 0.1–1 resource units and real proportional harm; metabolism continues. Requires health >=80; sample satiety <=90. Reserved material ages and cannot be spent twice.',
      effects:
        'Retain dated sensory and exposure evidence with confounders, never a safety certification or hidden composition. Interrupted, invalidated or fatal work releases only unconsumed surviving escrow. A completed nourishing exposure without injury or another food intake may give modest relief: 1 for 6 rounds, cooldown 12, no stacking. Owned items are located at the carrier, not their old pickup coordinates.',
      handler: 'food.assess@1',
      revision: 'food-assessment@1',
      authored: false,
    },
  ],
  satisfaction: [
    {
      id: 'cautious-food-relief',
      name: 'Cautious food relief',
      equivalence: 'experience:cautious-food-relief',
      event: 'food-assessment-completed',
      interface: 'assess-food',
      participants: 'actor',
      conditions: [{ path: 'qualified', comparison: 'eq', value: true }],
      amount: 1,
      cap: 1,
      duration: 6,
      cooldown: 12,
      repeatWindow: { rounds: 12, amount: 1 },
      mode: 'hold',
      repetition: 'refresh',
      rationale:
        'Modest relief follows personally experienced nourishment from completed monitored exposure without adverse or confounding evidence. Examination, labels and absence of evidence do not certify safety or earn reward.',
      revision: 'food-assessment@1',
    },
  ],
  migrate: (world) => {
    world.state.foodAssessment = 1;
    // Versioned quantity refinement preserves all previous whole-unit transfer calls.
    for (const ability of world.abilities.filter((a) =>
      ['pickup', 'drop', 'give'].includes(a.id),
    )) {
      if (ability.parameters.properties)
        ability.parameters.properties.quantity = {
          type: 'number',
          minimum: 0.1,
        };
      ability.effects +=
        ' Material transfers also accept exact tenths after food-assessment installation; reserved portions cannot be transferred.';
    }
    for (const actor of world.actors) {
      actor.extensionState[recordsKey] = [];
      actor.extensionState['harness:assess-food'] = true;
    }
    return world;
  },
  harness: {
    'assess-food': (o) => ({
      pending: o.self.extensionState[pendingKey] ?? null,
      records: o.self.extensionState[recordsKey] ?? [],
      meaning:
        'Dated personal evidence, with unresolved uncertainty. Reserved portions remain real carried material.',
    }),
  },
  onDeath: (world, actor) => {
    const operation = pending(actor);
    if (operation) {
      operation.adverse = true;
      operation.followup.push({
        tick: world.tick,
        vitals: { ...actor.vitals },
      });
      operation.evidence.push(
        ...world.events
          .filter(
            (e) =>
              e.actor === actor.id &&
              ['injured', 'ate', 'spoiled'].includes(e.type),
          )
          .map((e) => ({
            tick: e.tick,
            type: e.type,
            description: e.description,
            data: e.data,
          })),
      );
    }
    cancel(world, actor, 'observer died', true);
  },
};
/** Settle evidence after real actions, aging, animal injury, physiology and death, before reward evaluation. */
export function foodAssessmentAfterRound(
  before: V7World,
  world: V7World,
): void {
  if (world.state.foodAssessment !== 1) return;
  for (const actor of world.actors) {
    const operation = pending(actor);
    if (!operation) continue;
    const events = world.events.filter(
      (e) =>
        e.actor === actor.id &&
        ['injured', 'ate', 'spoiled', 'moved', 'died'].includes(e.type),
    );
    operation.evidence.push(
      ...events.map((e) => ({
        tick: e.tick,
        type: e.type,
        description: e.description,
        data: e.data,
      })),
    );
    operation.adverse ||= events.some((e) => e.type === 'injured');
    operation.confounding ||= events.some((e) => e.type === 'ate');
    operation.followup.push({ tick: world.tick, vitals: { ...actor.vitals } });
    if (
      operation.lastTick !== world.tick ||
      actor.position.x !== operation.x ||
      actor.position.y !== operation.y
    ) {
      cancel(
        world,
        actor,
        'attention was interrupted by an incompatible or failed action',
      );
      continue;
    }
    if (
      !operation.ingested &&
      !world.stacks.some((s) => s.id === (operation.escrow ?? operation.target))
    ) {
      cancel(
        world,
        actor,
        'the real target or reserved sample was consumed, removed or spoiled',
      );
      continue;
    }
    const prior = before.actors.find((a) => a.id === actor.id);
    if (prior && actor.vitals.health < prior.vitals.health)
      operation.adverse = true;
    if (operation.elapsed < (operation.mode === 'sample' ? 5 : 2)) continue;
    const qualified =
      operation.mode === 'sample' &&
      operation.ingested &&
      operation.nourishment > 0 &&
      !operation.adverse &&
      !operation.confounding &&
      actor.vitals.health > 0;
    record(
      actor,
      operation,
      'completed',
      world.tick,
      'Actual attention and monitoring completed; uncertainty remains.',
    );
    emit(
      world,
      actor,
      'food-assessment-completed',
      `Completed ${operation.mode} evidence for ${operation.resource}; ${qualified ? 'observed nourishment without adverse evidence supports modest relief' : 'no qualifying relief evidence'}. This does not establish safety.`,
      {
        operation: operation.id,
        resource: operation.resource,
        qualified,
        sensory: operation.sensory,
        nourishment: operation.nourishment,
        adverse: operation.adverse,
        confounding: operation.confounding,
      },
    );
    delete actor.extensionState['food-assessment:pending'];
  }
}
