import { materialRefresh } from './material-lots.js';
import { rootWater, rootAge } from './collective-root-physics.js';
import {
  leanPhysiology,
  leanAfterPhysiology,
} from './collective-shelter-exposure.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import {
  preservationAge,
  preservationExchange,
  preservationOnTray,
  preservationReleaseSurface,
} from './open-preservation-physics.js';
import { refugePhysiology } from './open-shelter-exposure.js';
import { simpleShelterPhysiology } from './long-shelter-exposure.js';
import { sharedShelterPhysiology } from './long-shared-shelter-exposure.js';
import { branchScreenPhysiology } from './long-branch-screen-exposure.js';
import {
  smallFireBurn,
  smallFireExposure,
} from './long-ex21-small-combustion-physics.js';
import { openConditions } from './open-physical.js';
import { forestEvent, forestClimate, forestGrowth } from './forest-climate.js';
export { forestEvent, forestClimate, forestGrowth } from './forest-climate.js';
import { openPlants, openAnimals } from './open-ecology.js';
import { fireExposure } from './forest-fire-exposure.js';
import type { V7Actor, V7World } from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { shelterTemperature } from './forest-thermal.js';
import {
  v7Distance,
  v7Inside,
  v7Interior,
  v7Obstacles,
  v7SegmentClear,
  v7Visible,
} from './continuous-geometry.js';

export const FOREST_EVENTS = [
  'moved',
  'arrived',
  'rested',
  'waited',
  'picked-up',
  'ate',
  'gathered',
  'dropped',
  'given',
  'message',
  'requested',
  'review-rejected',
  'learning',
  'mastered',
  'already-mastered',
  'failed',
  'wellbeing',
  'satisfaction',
  'ripened',
  'injured',
  'died',
  'respawned',
  'season-changed',
  'weather-changed',
  'animal-alert',
  'spoiled',
  'discovered',
  'target-changed',
  'actor-seen',
];

function animals(world: V7World): void {
  const obstacles = v7Obstacles(world);
  for (const animal of world.objects.filter((o) => o.kind === 'animal')) {
    const species =
        typeof animal.data.species === 'string'
          ? animal.data.species
          : 'unknown',
      home = { x: Number(animal.data.homeX), y: Number(animal.data.homeY) };
    const nearest = world.actors
      .filter(
        (a) =>
          a.vitals.health > 0 && v7Visible(world, animal.spatial, a.position),
      )
      .sort(
        (a, b) =>
          v7Distance(animal.spatial, a.position) -
          v7Distance(animal.spatial, b.position),
      )[0];
    const distance = nearest
      ? v7Distance(animal.spatial, nearest.position)
      : Infinity;
    const predator = species === 'wolf',
      defensive = species === 'boar';
    const hunting =
      predator &&
      world.tick % 120 < 75 &&
      distance < 5 &&
      v7Distance(animal.spatial, home) < 7;
    const defending = defensive && distance < 1.5;
    const fleeing = !predator && !defending && distance < 3;
    const mode = hunting
      ? 'hunting'
      : defending
        ? 'defending'
        : fleeing
          ? 'fleeing'
          : 'foraging';
    if (mode !== animal.data.mode && nearest && (hunting || defending))
      forestEvent(
        world,
        'animal-alert',
        `${animal.name} is ${mode}; its posture and movement changed.`,
        animal.spatial,
        nearest.id,
        { species, distance, mode },
        animal.id,
      );
    animal.data.mode = mode;
    animal.visual.state = mode;
    if (
      (hunting || defending) &&
      nearest &&
      distance < 0.8 &&
      world.tick >= Number(animal.data.nextAttack ?? 0)
    ) {
      const before = nearest.vitals.health,
        damage = predator ? 14 : 10;
      nearest.vitals.health = Math.max(0, before - damage);
      animal.data.nextAttack = world.tick + 6;
      forestEvent(
        world,
        'injured',
        `${animal.name} injured ${nearest.name}.`,
        nearest.position,
        nearest.id,
        { cause: species, before, after: nearest.vitals.health, damage },
        animal.id,
      );
    }
    let target = {
      x: home.x + 2.2 * Math.cos(world.time / 23 + animal.createdAt),
      y: home.y + 2.2 * Math.sin(world.time / 31 + animal.createdAt),
    };
    if (hunting && nearest) target = nearest.position;
    if (fleeing && nearest)
      target = {
        x: animal.spatial.x + (animal.spatial.x - nearest.position.x) * 2,
        y: animal.spatial.y + (animal.spatial.y - nearest.position.y) * 2,
      };
    const food = world.objects
      .filter(
        (o) =>
          o.kind !== 'animal' &&
          Number(o.data.stock) > 0 &&
          world.resources.some(
            (r) => r.id === o.data.resource && r.nutrition > 0,
          ) &&
          v7Distance(home, o.spatial) < 5,
      )
      .sort(
        (a, b) =>
          v7Distance(animal.spatial, a.spatial) -
          v7Distance(animal.spatial, b.spatial),
      )[0];
    if (mode === 'foraging' && food && !predator) {
      target = food.spatial;
      if (v7Distance(animal.spatial, food.spatial) < 1 && world.tick % 25 === 0)
        food.data.stock = Number(food.data.stock) - 1;
    }
    const length = v7Distance(animal.spatial, target),
      speed = hunting ? 0.32 : fleeing ? 0.4 : 0.12;
    const next = {
      x:
        animal.spatial.x +
        ((target.x - animal.spatial.x) / Math.max(1e-6, length)) *
          Math.min(speed, length),
      y:
        animal.spatial.y +
        ((target.y - animal.spatial.y) / Math.max(1e-6, length)) *
          Math.min(speed, length),
    };
    if (
      v7Inside(world, next, 0.2) &&
      v7SegmentClear(animal.spatial, next, 0.18, obstacles)
    ) {
      animal.spatial.angle = Math.atan2(
        next.y - animal.spatial.y,
        next.x - animal.spatial.x,
      );
      animal.spatial.x = v7RoundNumber(next.x);
      animal.spatial.y = v7RoundNumber(next.y);
    }
  }
}
export function forestEnvironment(world: V7World): void {
  if (!world.config.forest) return;
  const climate = forestClimate(world, { x: 5, y: 5 });
  const oldSeason = world.state.season;
  world.state.season = climate.season;
  if (oldSeason !== climate.season)
    for (const actor of world.actors.filter((a) => a.vitals.health > 0))
      forestEvent(
        world,
        'season-changed',
        `Season: ${climate.season}; daylight and temperatures have changed gradually.`,
        actor.position,
        actor.id,
        { season: climate.season },
      );
  if (world.config.development) {
    openPlants(world);
    for (const actor of world.actors) {
      const local = openConditions(world, actor.position),
        key = `open:local:${actor.id}`;
      if (world.state[key] !== undefined && world.state[key] !== local.regime)
        forestEvent(
          world,
          'local-hazard',
          `Visible local soil changed to ${local.regime}.`,
          actor.position,
          actor.id,
          {
            regime: local.regime,
            moisture: local.moisture,
            drought: local.drought,
            waterlogging: local.waterlogging,
          },
        );
      world.state[key] = local.regime;
    }
  }
  for (const object of world.objects.filter(
    (o) =>
      Number(o.data.interval) > 0 &&
      (!world.config.development || o.data.resource === 'fish'),
  )) {
    if (world.config.experience)
      object.data.depletion = Math.max(
        0,
        Number(object.data.depletion ?? 0) - 0.005,
      );
    object.data.growth =
      Number(object.data.growth ?? 0) + forestGrowth(world, object);
    const interval = Number(object.data.interval);
    if (object.data.growth >= interval) {
      object.data.growth = object.data.growth % interval;
      if (Number(object.data.stock) < Number(object.data.capacity)) {
        object.data.stock = Number(object.data.stock) + 1;
        object.data.produced = Number(object.data.produced ?? 0) + 1;
        object.visual.state = 'ready';
        forestEvent(
          world,
          'ripened',
          `${object.name} has new visible growth.`,
          object.spatial,
          null,
          { stock: object.data.stock },
          object.id,
        );
      }
    }
  }
  for (const item of world.stacks) {
    for (const stack of item.componentLots ?? [item]) {
      const originalLocation = { owner: stack.owner, position: stack.position };
      if (item.componentLots) {
        stack.owner = item.owner;
        stack.position = item.position;
      }
      rootWater(world, stack);
      // Ex10, or the opt-in food water representation; a no-op for food without its record.
      if (world.state.foodPreservation === 1 || world.state.foodWater === 1)
        preservationExchange(world, stack);
      const resource = collectiveFoodProfile(world, stack),
        lifetime = resource?.properties?.decay ?? 0;
      if (!lifetime) {
        if (item.componentLots) Object.assign(stack, originalLocation);
        continue;
      }
      const owner = world.actors.find((a) => a.id === stack.owner),
        position = preservationOnTray(stack)
          ? stack.position
          : (owner?.position ?? stack.position);
      const temperature = forestClimate(world, position).temperature;
      const preservation = world.config.experience
        ? Math.min(
            1,
            ...world.objects
              .filter((o) => v7Interior(position, o.spatial))
              .map((o) => Math.max(0.1, Number(o.data.preservation ?? 1))),
          )
        : 1;
      stack.decay =
        (stack.decay ?? 0) +
        rootAge(
          world,
          stack,
          preservationAge(
            stack,
            Math.max(0.15, (temperature + 4) / 24) * preservation,
          ),
        );
      if (stack.decay >= lifetime) {
        forestEvent(
          world,
          'spoiled',
          `${String(stack.quantity)} ${resource?.name ?? stack.resource} spoiled.`,
          position,
          stack.owner,
          { quantity: stack.quantity, resource: stack.resource },
          stack.id,
        );
        preservationReleaseSurface(world, stack);
        stack.quantity = 0;
      }
      if (item.componentLots) Object.assign(stack, originalLocation);
    }
    materialRefresh(item);
  }
  world.stacks = world.stacks.filter((s) => s.quantity > 0);
  if (world.config.development) openAnimals(world);
  else animals(world);
}

export function forestPhysiology(world: V7World, actor: V7Actor): void {
  if (actor.vitals.health <= 0) return;
  const before = { ...actor.vitals },
    climate = forestClimate(world, actor.position);
  const insulation = Math.max(
    0,
    Number(actor.extensionState.insulation ?? 0),
    ...world.objects
      .filter((o) => v7Interior(actor.position, o.spatial))
      .map((o) => Number(o.data.insulation ?? 0)),
  );
  const shelter =
    world.state.shelterConstruction === 1
      ? world.objects.find(
          (o) =>
            o.kind === 'insulating-shelter' &&
            Number(o.data.remainingService) > 0 &&
            v7Interior(actor.position, o.spatial),
        )
      : undefined;
  const exposure = shelterTemperature(
    before.temperature,
    branchScreenPhysiology(
      world,
      actor,
      sharedShelterPhysiology(
        world,
        actor,
        simpleShelterPhysiology(
          world,
          actor,
          leanPhysiology(
            world,
            actor,
            refugePhysiology(world, actor, climate.temperature),
          ),
        ),
      ),
    ),
    insulation,
    !!shelter,
  );
  actor.vitals.temperature = insulationExposure(
    world,
    actor,
    before.temperature,
    exposure.temperature,
    exposure.shelteredColdLoss,
    climate,
    (type, item, data) => {
      forestEvent(
        world,
        type,
        type === 'insulation-exposure-measured'
          ? `Portable insulation avoided ${Number(data.avoidedCooling).toFixed(3)} cooling; ${Number(data.remainingCooling).toFixed(3)} remaining; net temperature ${Number(data.netChange).toFixed(3)}.`
          : type === 'rain-canopy-exposure-measured'
            ? `Covered mantle moisture ${Number(data.before).toFixed(2)} to ${Number(data.after).toFixed(2)}; actual drying avoided ${Number(data.avoidedCooling).toFixed(4)} cooling.`
            : 'The mantle is worn out; it now provides no protection.',
        actor.position,
        actor.id,
        data,
        item,
      );
      const event = world.events.at(-1);
      if (event)
        event.interface =
          type === 'rain-canopy-exposure-measured'
            ? 'rain-canopy-work'
            : 'portable-insulation';
    },
  );
  if (shelter) {
    const coldDiscomfort = (temperature: number) =>
      Math.min(1, Math.max(0, 16 - temperature) / 12);
    const measurement = {
      tick: world.tick,
      target: shelter.id,
      actor: actor.id,
      ambient: climate.temperature,
      beforeTemperature: before.temperature,
      ...exposure,
      coldDiscomfort: coldDiscomfort(exposure.temperature),
      unshelteredColdDiscomfort: coldDiscomfort(
        exposure.unshelteredTemperature,
      ),
      meaning:
        'Cold loss is the body-temperature cooling contribution below the existing comfort threshold, not direct health damage. Ambient temperature is unchanged.',
    };
    actor.extensionState['shelter:exposure'] = measurement;
    forestEvent(
      world,
      'shelter-exposure-measured',
      'Measured actual interior cold exposure against the same-round unsheltered temperature update.',
      actor.position,
      actor.id,
      measurement,
      shelter.id,
    );
  }
  actor.vitals.temperature = fireExposure(
    world,
    actor,
    actor.vitals.temperature,
    (id, data) => {
      forestEvent(
        world,
        'fire-exposure-measured',
        'Actual finite fire heat reached this actor before thermal damage.',
        actor.position,
        actor.id,
        data,
        id,
      );
      const e = world.events.at(-1);
      if (e) e.interface = 'tend-fire';
    },
  );
  // ex21 small-combustion-source@1: heat from burning beds, only where that revision is installed.
  actor.vitals.temperature = smallFireExposure(
    world,
    actor,
    actor.vitals.temperature,
  );
  const starvation = before.satiety <= 0 ? world.config.starvation : 0;
  const thermal =
    Math.max(0, 7 - actor.vitals.temperature, actor.vitals.temperature - 34) *
    0.18;
  actor.vitals.health = v7RoundNumber(
    Math.max(0, before.health - starvation - thermal),
  );
  smallFireBurn(world, actor);
  actor.vitals.satiety = v7RoundNumber(
    Math.max(0, before.satiety - world.config.hunger * world.config.dt),
  );
  if (actor.vitals.health < before.health)
    forestEvent(
      world,
      'injured',
      `Physiological damage: ${starvation > 0 ? 'starvation' : 'thermal exposure'}.`,
      actor.position,
      actor.id,
      {
        before: before.health,
        after: actor.vitals.health,
        starvation,
        thermal,
        satiety: before.satiety,
        temperature: actor.vitals.temperature,
      },
    );
  leanAfterPhysiology(world, actor);
}
import { insulationExposure } from './forest-insulation-exposure.js';
