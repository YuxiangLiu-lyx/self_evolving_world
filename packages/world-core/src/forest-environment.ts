import type {
  V7Actor,
  V7Data,
  V7Object,
  V7Point,
  V7World,
} from './continuous-types.js';
import { v7Id, v7RoundNumber } from './continuous-data.js';
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

export function forestEvent(
  world: V7World,
  type: string,
  description: string,
  position: V7Point,
  actor: string | null = null,
  data: V7Data = {},
  target: string | null = null,
): void {
  world.events.push({
    id: v7Id(world, 'event'),
    tick: world.tick,
    type,
    description,
    position: { ...position },
    actor,
    target,
    data,
    interface: null,
    success: true,
  });
}
/** One round is one simulation time unit. Time is deliberately accelerated relative to ecology. */
export function forestClimate(world: V7World, position: V7Point) {
  const settings = world.config.forest;
  if (!settings)
    throw new Error(
      'Forest climate requires a versioned forest configuration.',
    );
  const phase =
    (((world.time % settings.year) + settings.year) % settings.year) /
    settings.year;
  const daylight = Math.max(
    0,
    Math.sin(2 * Math.PI * (world.time / settings.day + 0.05)),
  );
  const ground =
    world.terrain[Math.floor(position.y)]?.[Math.floor(position.x)] ?? '.';
  const seasonal = 11 * Math.sin(2 * Math.PI * phase);
  const weather =
    2 * Math.sin((world.time * Math.PI) / 113 + (world.config.seed % 19));
  const region =
    ground === ':' ? -3 : ground === ',' ? -1.5 : ground === 'f' ? 0.5 : 1.5;
  let temperature = 14 + seasonal + weather + region + 4 * (daylight - 0.4);
  let light = daylight * (0.65 + Math.max(-0.35, seasonal / 30));
  let moisture =
    ground === ',' || ground === '=' ? 0.9 : ground === ':' ? 0.25 : 0.65;
  let indoor = false;
  for (const object of world.objects) {
    if (!v7Interior(position, object.spatial)) continue;
    indoor = true;
    // This reviewed windbreak changes bodily cold exposure, not ambient heat or growth conditions.
    if (object.kind === 'insulating-shelter') continue;
    const buffering =
      object.kind === 'cave' ? 0.72 : Number(object.data.buffering ?? 0.35);
    temperature += (12 - temperature) * buffering;
    temperature += Number(object.data.heating ?? 0);
    light = Math.max(light * 0.15, Number(object.data.light ?? 0));
    moisture = Number(object.data.moisture ?? moisture);
  }
  return {
    temperature: v7RoundNumber(temperature),
    light: v7RoundNumber(light),
    moisture,
    indoor,
    phase,
    season:
      ['spring', 'summer', 'autumn', 'winter'][Math.floor(phase * 4)] ??
      'spring',
    daylight: v7RoundNumber(daylight),
    trend:
      Math.cos(2 * Math.PI * phase) >= 0
        ? 'gradually warming'
        : 'gradually cooling',
  };
}

/** Temperature/light/water constraints remain locally alterable by reviewed physical mechanisms. */
export function forestGrowth(world: V7World, object: V7Object): number {
  const resource = world.resources.find((r) => r.id === object.data.resource),
    p = resource?.properties;
  if (!p) return 0;
  const climate = forestClimate(world, object.spatial);
  const temperature = climate.temperature + Number(object.data.warming ?? 0);
  const light = Math.max(climate.light, Number(object.data.light ?? 0));
  const moisture = Number(object.data.moisture ?? climate.moisture);
  return (
    Math.max(
      0,
      Math.min(
        1,
        (temperature - p.minGrowth) /
          Math.max(1, p.optimalGrowth - p.minGrowth),
      ),
    ) *
    light *
    Math.min(1, moisture / Math.max(0.1, p.moisture))
  );
}

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
  for (const object of world.objects.filter(
    (o) => Number(o.data.interval) > 0,
  )) {
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
  for (const stack of world.stacks) {
    const resource = world.resources.find((r) => r.id === stack.resource),
      lifetime = resource?.properties?.decay ?? 0;
    if (!lifetime) continue;
    const owner = world.actors.find((a) => a.id === stack.owner),
      position = owner?.position ?? stack.position;
    const temperature = forestClimate(world, position).temperature;
    stack.decay = (stack.decay ?? 0) + Math.max(0.15, (temperature + 4) / 24);
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
      stack.quantity = 0;
    }
  }
  world.stacks = world.stacks.filter((s) => s.quantity > 0);
  animals(world);
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
    climate.temperature,
    insulation,
    !!shelter,
  );
  actor.vitals.temperature = exposure.temperature;
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
  const starvation = before.satiety <= 0 ? world.config.starvation : 0;
  const thermal =
    Math.max(0, 7 - actor.vitals.temperature, actor.vitals.temperature - 34) *
    0.18;
  actor.vitals.health = v7RoundNumber(
    Math.max(0, before.health - starvation - thermal),
  );
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
}
