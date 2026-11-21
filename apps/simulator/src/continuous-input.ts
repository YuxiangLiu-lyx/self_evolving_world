import {
  V7_GOAL,
  forestClimate,
  v7Distance,
  v7Observe,
  v7PublicCatalogue,
  v7Load,
  continuousRegistry,
  v7Work,
  v7Freeze,
  v7Clone,
} from '@self-evolving-world/world-core';
import { forestDecisionEvidence } from './forest-context.js';
import type {
  V7Action,
  V7Cursor,
  V7Object,
  V7World,
  V7Data,
} from '@self-evolving-world/world-core';

const objectFact = (o: V7Object) => ({
  id: o.id,
  name: o.name,
  kind: o.kind,
  spatial: o.spatial,
  state: o.data,
  createdBy: o.createdBy,
  createdAt: o.createdAt,
});
export function ordinaryContinuousInput(
  world: V7World,
  id: string,
  cursor: V7Cursor | undefined,
  remainingCalls: number,
) {
  const o = v7Observe(world, id),
    self = o.self;
  const harness: Record<string, V7Data> = {};
  const work = v7Work(world.config.computation.workPerRound);
  for (const pkg of continuousRegistry().packages.filter((p) =>
    world.revisions.includes(`${p.id}@${String(p.version)}`),
  ))
    for (const [key, adapter] of Object.entries(pkg.harness ?? {})) {
      if (
        self.mastered.includes(key) &&
        self.extensionState[`harness:${key}`] === true
      )
        harness[key] = adapter(v7Freeze(v7Clone(o)), work);
    }
  const evidence =
    world.state.shelterConstruction === 1
      ? forestDecisionEvidence(self, harness)
      : { harness, extensionState: self.extensionState };
  return {
    harness: evidence.harness,
    protocol: world.protocol,
    goal: V7_GOAL,
    tick: world.tick,
    time: world.time,
    identity: { id, name: self.name },
    state: {
      position: self.position,
      radius: self.radius,
      vitals: self.vitals,
      wellbeing: self.wellbeing,
      load: v7Load(world, self),
      learning: self.learning,
      mastered: self.mastered,
      relationships: self.relationships,
      extensionState: evidence.extensionState,
      ...(self.life ? { life: self.life } : {}),
    },
    observation: {
      actors: o.actors,
      objects: o.objects.map(objectFact),
      stacks: o.stacks,
      terrain: o.terrain,
      events: o.events,
    },
    ...(world.config.forest
      ? { environment: forestClimate(world, self.position) }
      : {}),
    memory: {
      ...(world.config.forest
        ? {
            important: self.memory.important?.slice(-16),
            discoveries: self.memory.discoveries,
            death: self.life?.lastDeath,
          }
        : {}),
      notes: self.memory.notes,
      preferences: self.memory.preferences,
      experiences: self.memory.experiences.slice(-12),
      rememberedObjects: self.memory.objects
        .filter((x) => !o.objects.some((p) => p.id === x.object.id))
        .sort((a, b) =>
          world.config.forest
            ? v7Distance(self.position, a.object.spatial) -
              v7Distance(self.position, b.object.spatial)
            : 0,
        )
        .slice(0, world.config.forest ? 16 : Infinity)
        .map((m) => ({ ...objectFact(m.object), lastObservedAt: m.seenAt })),
      rememberedGround: self.memory.stacks
        .filter(
          (x) =>
            x.stack.owner === null &&
            !o.stacks.some((p) => p.id === x.stack.id),
        )
        .sort((a, b) => (world.config.forest ? b.seenAt - a.seenAt : 0))
        .slice(0, world.config.forest ? 10 : Infinity)
        .map((m) => ({ ...m.stack, lastObservedAt: m.seenAt })),
    },
    previousTask: cursor
      ? {
          intention: cursor.plan.intention,
          step: cursor.step,
          cycle: cursor.cycle,
          reason: cursor.reason,
        }
      : null,
    catalogue: v7PublicCatalogue(world, id),
    rules: {
      dt: world.config.dt,
      ...(world.config.forest
        ? {
            timeUnit: 'simulation time unit; ecological cycles are accelerated',
            lives: world.config.forest.lives,
            dayLength: world.config.forest.day,
            yearLength: world.config.forest.year,
          }
        : {}),
      speed: world.config.speed,
      vision: world.config.vision,
      pickupReach: self.radius + world.config.interaction,
      physicalWellbeingCap: world.config.physicalCap,
      otherSatisfactionCap: world.config.mentalCap,
      hungerPerRound: world.config.hunger,
      zeroSatietyDamage: world.config.starvation,
      restRecovery: world.config.restRecovery,
      energyCap: world.config.energyCap,
      worldBounds: { width: world.config.width, height: world.config.height },
    },
    remainingSharedOrdinaryCalls: remainingCalls,
  };
}
export type OrdinaryContinuousInput = ReturnType<
  typeof ordinaryContinuousInput
>;
export function worldContinuousInput(
  world: V7World,
  requests: Record<string, V7Action>,
) {
  return {
    protocol: world.protocol,
    tick: world.tick,
    catalogue: v7PublicCatalogue(world),
    physicalRules: world.config,
    applicants: Object.entries(requests).map(([actor, action]) => {
      const o = v7Observe(world, actor);
      return {
        actor,
        request: action.args,
        actualState: {
          vitals: o.self.vitals,
          wellbeing: o.self.wellbeing,
          mastered: o.self.mastered,
          learning: o.self.learning,
        },
        observedObjects: o.objects.map(objectFact),
        ownedItems: o.stacks.filter((s) => s.owner === actor),
        recentEvents: o.events,
      };
    }),
    implementation:
      'New interfaces, state, geometry, persistent processes, rendering components and personal memory/task adapters can be delivered through a versioned current-conversation handoff. Source validation and history must remain intact. Declared implementation does not supply stock, objects or mastery.',
  };
}
export type WorldContinuousInput = ReturnType<typeof worldContinuousInput>;
