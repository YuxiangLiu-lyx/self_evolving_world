import {
  OPEN_GOAL,
  openMemory,
  openCatalogue,
  openExtensionSummary,
} from './open-context.js';
import { forestExperienceSummary } from './forest-experience-context.js';
import { collectiveRecords } from './collective-input.js';
import {
  V7_GOAL,
  forestClimate,
  v7Distance,
  v7Observe,
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
  for (const pkg of continuousRegistry(world).packages.filter((p) =>
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
    ...(world.config.experience
      ? {
          experience: forestExperienceSummary(self),
          execution: cursor?.operation ?? null,
        }
      : {}),
    ...(world.config.development
      ? {
          development: {
            inheritSkills: false,
            scope: world.config.development.scope,
            baseline: world.config.development.baseline,
          },
        }
      : {}),
    harness: evidence.harness,
    protocol: world.protocol,
    goal: world.config.development ? OPEN_GOAL : V7_GOAL,
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
      extensionState: world.config.development
        ? openExtensionSummary(self)
        : evidence.extensionState,
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
      ...openMemory(world, self),
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
    catalogue: openCatalogue(world, self),
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
  const sharedObjects = new Map<string, ReturnType<typeof objectFact>>();
  const catalogue = openCatalogue(world);
  // Review selects functions; execution schemas remain available in the source-bound handoff.
  // Avoid repeating every baseline argument schema alongside its functional index.
  if (world.config.collective) catalogue.interfaces = [];
  return {
    protocol: world.protocol,
    tick: world.tick,
    catalogue,
    physicalRules: world.config,
    applicants: Object.entries(requests).map(([actor, action]) => {
      const o = v7Observe(world, actor);
      if (world.config.collective) {
        const requested = JSON.stringify(action.args);
        const relevant = o.objects.filter((object) =>
          requested.includes(JSON.stringify(object.id)),
        );
        const nearby = [...o.objects].sort(
          (a, b) =>
            v7Distance(o.self.position, a.spatial) -
            v7Distance(o.self.position, b.spatial),
        );
        const selected = collectiveRecords(
          [
            ...new Map(
              [...relevant, ...nearby].map((object) => [object.id, object]),
            ).values(),
          ].map(objectFact),
          4,
          1800,
        );
        selected.shown.forEach((object) =>
          sharedObjects.set(object.id, object),
        );
        return {
          actor,
          request: action.args,
          actualState: {
            position: o.self.position,
            vitals: o.self.vitals,
            mastered: o.self.mastered,
            learning: o.self.learning,
          },
          personalRecords: {
            projects: collectiveRecords(
              Object.values(o.self.memory.projects ?? {}).sort(
                (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
              ),
              2,
              900,
            ),
            knowledge: collectiveRecords(
              Object.values(o.self.memory.knowledge ?? {}).sort(
                (a, b) => b.tick - a.tick,
              ),
              4,
              700,
            ),
          },
          observedObjectIds: selected.shown.map((object) => object.id),
          omittedObservedObjects: selected.omitted,
          ownedItems: collectiveRecords(
            o.stacks.filter((s) => s.owner === actor),
            12,
            2400,
          ),
          recentEvents: collectiveRecords(o.events, 3, 600),
        };
      }
      return {
        actor,
        request: action.args,
        actualState: {
          vitals: o.self.vitals,
          wellbeing: o.self.wellbeing,
          mastered: o.self.mastered,
          learning: o.self.learning,
        },
        ...(world.config.development
          ? { personalRecords: openMemory(world, o.self) }
          : {}),
        observedObjects: o.objects.map(objectFact),
        ownedItems: o.stacks.filter((s) => s.owner === actor),
        recentEvents: o.events,
      };
    }),
    ...(world.config.collective
      ? {
          sharedObservedObjects: [...sharedObjects.values()],
          contextPolicy:
            'Object IDs refer to deduplicated actual applicant observations. Whole records are selected with omission counts. Missing detail is unknown, not proof of absence. Full retained state is available during the development handoff; implementation must validate actual prerequisites and ownership.',
        }
      : {}),
    implementation:
      'New interfaces, state, geometry, persistent processes, rendering components and personal memory/task adapters can be delivered through a versioned current-conversation handoff. Source validation and history must remain intact. Declared implementation does not supply stock, objects or mastery.',
  };
}
export type WorldContinuousInput = ReturnType<typeof worldContinuousInput>;
