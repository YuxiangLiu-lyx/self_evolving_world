import type { V7Object, V7World } from './continuous-types.js';
import { v7Clone, v7String, v7Id, v7RoundNumber } from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Obstacles,
  v7SegmentClear,
  v7Visible,
} from './continuous-geometry.js';
import { forestClimate, forestEvent, forestGrowth } from './forest-climate.js';
import { openConditions } from './open-physical.js';

/** Local seed establishment consumes parent stock; sunlight/water power subsequent biomass growth. */
export function openPlants(world: V7World): void {
  for (const plant of [...world.objects].filter(
    (o) => Number(o.data.interval) > 0 && o.kind !== 'animal',
  )) {
    const resource = world.resources.find((r) => r.id === plant.data.resource);
    if (!resource || resource.id === 'fish') continue;
    const soil = openConditions(world, plant.spatial),
      climate = forestClimate(world, plant.spatial);
    plant.data.soil = soil.moisture;
    plant.data.depletion = Math.max(
      0,
      Number(plant.data.depletion ?? 0) - 0.005,
    );
    const woody = [
      'hazelnut',
      'walnut',
      'acorn',
      'apple',
      'plum',
      'oak',
      'birch',
      'willow',
      'resin',
      'bark',
    ].includes(resource.id);
    const seasonal = woody
      ? 0.2 + 0.8 * Math.max(0, Math.sin(2 * Math.PI * climate.phase))
      : 0.6 + 0.4 * Math.max(0, Math.sin(2 * Math.PI * climate.phase));
    const growth =
      forestGrowth(world, plant) *
      seasonal *
      Math.max(
        0.1,
        1 -
          soil.waterlogging *
            (resource.properties?.moisture &&
            resource.properties.moisture >= 0.8
              ? 0.2
              : 0.85),
      );
    if (plant.data.stage === 'seedling') {
      plant.data.establishment = Number(plant.data.establishment ?? 0) + growth;
      plant.visual.state = 'seedling';
      if (plant.data.establishment < (woody ? 60 : 12)) continue;
      plant.data.stage = 'mature';
      forestEvent(
        world,
        'plant-established',
        'A dispersed propagule established through actual light, moisture and temperature conditions.',
        plant.spatial,
        null,
        { parent: plant.data.parent ?? null, resource: resource.id },
        plant.id,
      );
    }
    plant.data.stage = 'mature';
    plant.data.growth = Number(plant.data.growth ?? 0) + growth;
    const interval = Number(plant.data.interval);
    if (plant.data.growth >= interval) {
      plant.data.growth = plant.data.growth % interval;
      if (Number(plant.data.stock) < Number(plant.data.capacity)) {
        plant.data.stock = Number(plant.data.stock) + 1;
        plant.data.produced = Number(plant.data.produced ?? 0) + 1;
        plant.visual.state = 'ready';
        forestEvent(
          world,
          'ripened',
          'Conditional seasonal growth produced one harvestable unit.',
          plant.spatial,
          null,
          {
            stock: plant.data.stock,
            resource: resource.id,
            soil: soil.moisture,
          },
          plant.id,
        );
      }
    }
    const local = world.objects.filter(
      (o) =>
        o.data.resource === resource.id &&
        v7Distance(o.spatial, plant.spatial) < 5,
    );
    if (
      Number(plant.data.stock) < 2 ||
      soil.moisture < 0.3 ||
      soil.moisture > 1.2 ||
      world.tick < Number(plant.data.nextDispersal ?? 200) ||
      local.length >= 3 ||
      growth < 0.08
    )
      continue;
    plant.data.nextDispersal = world.tick + (woody ? 600 : 300);
    const phase = (world.config.seed + plant.id.length * 17 + world.tick) % 16;
    const point = {
      x: plant.spatial.x + 1.6 * Math.cos((phase * Math.PI) / 8),
      y: plant.spatial.y + 1.6 * Math.sin((phase * Math.PI) / 8),
    };
    if (
      !v7Inside(world, point, 0.3) ||
      !v7SegmentClear(point, point, 0.35, v7Obstacles(world)) ||
      world.objects.some((o) => v7Distance(o.spatial, point) < 0.6) ||
      world.actors.some((a) => v7Distance(a.position, point) < 0.8)
    )
      continue;
    plant.data.stock = Number(plant.data.stock) - 1;
    plant.data.dispersed = Number(plant.data.dispersed ?? 0) + 1;
    const child = v7Clone(plant);
    child.id = v7Id(world, 'plant');
    child.createdAt = world.tick;
    child.spatial = { ...child.spatial, ...point, solid: false };
    child.data = {
      resource: resource.id,
      stock: 0,
      capacity: Math.min(4, Number(plant.data.capacity)),
      interval,
      stage: 'seedling',
      establishment: 0,
      seedUnits: 1,
      parent: plant.id,
      nextDispersal: world.tick + 600,
    };
    child.visual.state = 'seedling';
    world.objects.push(child);
    forestEvent(
      world,
      'seed-dispersed',
      'One actual parent stock unit became a local seed or vegetative propagule; establishment is conditional.',
      point,
      null,
      {
        parent: plant.id,
        inputResource: resource.id,
        inputQuantity: 1,
        child: child.id,
      },
      child.id,
    );
  }
}

/** Diet, injury, fear and grouping act on physical state without model decisions. */
export function openAnimals(world: V7World): void {
  const animals = world.objects.filter((o) => o.kind === 'animal'),
    obstacles = v7Obstacles(world);
  const hurt = (animal: V7Object, amount: number, cause: string) => {
    const before = Number(animal.data.health ?? 100);
    animal.data.health = Math.max(0, before - amount);
    forestEvent(
      world,
      'animal-injured',
      'An animal sustained a physical injury.',
      animal.spatial,
      null,
      { cause, before, after: animal.data.health },
      animal.id,
    );
  };
  for (const animal of animals) {
    const species = v7String(animal.data.species, 'species'),
      predator = species === 'wolf',
      defensive = species === 'boar';
    animal.data.health ??= 100;
    animal.data.satiety ??= 70;
    animal.data.group ??= species;
    // Peers share the group, which defaults to the species and is always the species in
    // every archive before the culture v2 villages genesis, so grouping there is unchanged.
    const group =
      typeof animal.data.group === 'string' ? animal.data.group : species;
    if (Number(animal.data.health) <= 0) {
      animal.data.mode = 'dead';
      animal.visual.state = 'dead';
      continue;
    }
    animal.data.satiety = Math.max(0, Number(animal.data.satiety) - 0.12);
    if (animal.data.satiety === 0 && world.tick % 10 === 0)
      hurt(animal, 1, 'food shortage');
    const peers = animals.filter(
      (o) =>
        o.id !== animal.id &&
        o.data.species === species &&
        (typeof o.data.group === 'string' ? o.data.group : species) === group &&
        Number(o.data.health ?? 100) > 0,
    );
    const nearest = world.actors
      .filter(
        (a) =>
          a.vitals.health > 0 && v7Visible(world, animal.spatial, a.position),
      )
      .sort(
        (a, b) =>
          v7Distance(a.position, animal.spatial) -
          v7Distance(b.position, animal.spatial),
      )[0];
    const distance = nearest
      ? v7Distance(nearest.position, animal.spatial)
      : Infinity;
    const prey = predator
      ? animals
          .filter(
            (o) =>
              o.data.species !== species &&
              Number(o.data.health ?? 100) > 0 &&
              v7Distance(o.spatial, animal.spatial) < 6,
          )
          .sort(
            (a, b) =>
              v7Distance(a.spatial, animal.spatial) -
              v7Distance(b.spatial, animal.spatial),
          )[0]
      : undefined;
    const danger = predator
      ? null
      : animals.find(
          (o) =>
            o.data.species === 'wolf' &&
            Number(o.data.health ?? 100) > 0 &&
            v7Distance(o.spatial, animal.spatial) < 3,
        );
    const approaching =
      distance < Number(animal.data.lastDistance ?? Infinity) - 0.05;
    animal.data.lastDistance = Number.isFinite(distance) ? distance : 1000;
    animal.data.fear = Math.max(
      0,
      Math.min(
        1,
        Number(animal.data.fear ?? 0) * 0.96 +
          (approaching && distance < 4 ? 0.12 : 0) +
          (danger ? 0.2 : 0),
      ),
    );
    const fleeing =
      (!predator &&
        distance < 3 &&
        (!defensive || Number(animal.data.health) < 40)) ||
      !!danger;
    const attacking =
      (defensive && distance < 1.3 && !fleeing) ||
      (predator && distance < 0.8 && animal.data.satiety < 30);
    const food = !predator
      ? world.objects
          .filter(
            (o) =>
              Number(o.data.stock) > 0 &&
              [
                'berry',
                'root',
                'apple',
                'plum',
                'hazelnut',
                'tuber',
                ...(defensive ? ['mushroom', 'acorn'] : []),
              ].includes(
                typeof o.data.resource === 'string' ? o.data.resource : '',
              ) &&
              v7Distance(o.spatial, animal.spatial) < 6,
          )
          .sort(
            (a, b) =>
              v7Distance(a.spatial, animal.spatial) -
              v7Distance(b.spatial, animal.spatial),
          )[0]
      : undefined;
    let mode = fleeing
      ? 'fleeing'
      : attacking
        ? 'defending'
        : prey && animal.data.satiety < 60
          ? 'hunting'
          : food && animal.data.satiety < 60
            ? 'foraging'
            : 'grouping';
    const home = { x: Number(animal.data.homeX), y: Number(animal.data.homeY) };
    let target = peers[0]?.spatial ?? home;
    if (mode === 'hunting' && prey) target = prey.spatial;
    if (mode === 'foraging' && food) target = food.spatial;
    if (fleeing) {
      const threat = danger?.spatial ?? nearest?.position ?? home;
      target = {
        ...animal.spatial,
        x: animal.spatial.x + (animal.spatial.x - threat.x) * 2,
        y: animal.spatial.y + (animal.spatial.y - threat.y) * 2,
      };
    }
    if (
      attacking &&
      nearest &&
      world.tick >= Number(animal.data.nextAttack ?? 0)
    ) {
      const before = nearest.vitals.health;
      nearest.vitals.health = Math.max(0, before - (predator ? 10 : 8));
      animal.data.nextAttack = world.tick + 8;
      forestEvent(
        world,
        'injured',
        'A threatened or hungry animal injured a nearby actor.',
        nearest.position,
        nearest.id,
        { cause: species, before, after: nearest.vitals.health },
        animal.id,
      );
    }
    if (
      mode === 'hunting' &&
      prey &&
      v7Distance(animal.spatial, prey.spatial) < 0.8 &&
      world.tick >= Number(animal.data.nextAttack ?? 0)
    ) {
      const consumed = Math.min(15, Number(prey.data.health ?? 100)),
        gained = (consumed * 2) / 3;
      hurt(prey, consumed, animal.id);
      animal.data.nextAttack = world.tick + 8;
      animal.data.satiety = Math.min(100, animal.data.satiety + gained);
      forestEvent(
        world,
        'animal-fed',
        'Predation transferred actual prey tissue to the predator.',
        animal.spatial,
        null,
        { prey: prey.id, healthConsumed: consumed, satiety: gained },
        animal.id,
      );
    }
    if (
      mode === 'foraging' &&
      food &&
      v7Distance(animal.spatial, food.spatial) < 1 &&
      world.tick % 20 === 0
    ) {
      food.data.stock = Number(food.data.stock) - 1;
      animal.data.satiety = Math.min(100, animal.data.satiety + 18);
      forestEvent(
        world,
        'animal-fed',
        'Foraging consumed one real local plant stock unit.',
        animal.spatial,
        null,
        { source: food.id, quantity: 1, satiety: 18 },
        animal.id,
      );
    }
    if (
      Number(animal.data.health) < 100 &&
      animal.data.satiety > 50 &&
      world.tick % 20 === 0
    ) {
      animal.data.health = Math.min(100, Number(animal.data.health) + 1);
      animal.data.satiety = animal.data.satiety - 1;
    }
    const mate = peers.find(
      (o) =>
        v7Distance(o.spatial, animal.spatial) < 2 &&
        Number(o.data.satiety ?? 0) > 60 &&
        world.tick >= Number(o.data.nextBreeding ?? 300),
    );
    if (
      mate &&
      animal.id < mate.id &&
      animal.data.satiety > 60 &&
      Number(animal.data.health) > 70 &&
      world.tick >= Number(animal.data.nextBreeding ?? 300) &&
      world.objects.filter(
        (o) =>
          o.kind === 'animal' &&
          o.data.species === species &&
          Number(o.data.health ?? 100) > 0,
      ).length < 8
    ) {
      animal.data.satiety = animal.data.satiety - 20;
      mate.data.satiety = Number(mate.data.satiety) - 20;
      animal.data.nextBreeding = world.tick + 600;
      mate.data.nextBreeding = world.tick + 600;
      animal.data.gestation = world.tick + 80;
      animal.data.mate = mate.id;
    }
    if (
      typeof animal.data.gestation === 'number' &&
      world.tick >= animal.data.gestation &&
      animal.data.satiety > 20 &&
      world.objects.filter(
        (o) =>
          o.kind === 'animal' &&
          o.data.species === species &&
          Number(o.data.health ?? 100) > 0,
      ).length < 8
    ) {
      const child = v7Clone(animal);
      child.id = v7Id(world, 'animal');
      child.createdAt = world.tick;
      child.spatial = { ...child.spatial, x: child.spatial.x + 0.4 };
      child.data = {
        species,
        homeX: animal.spatial.x,
        homeY: animal.spatial.y,
        health: 65,
        satiety: 40,
        group,
        parents: [animal.id, animal.data.mate ?? null],
        nextBreeding: world.tick + 600,
        mode: 'grouping',
      };
      if (
        v7Inside(world, child.spatial, 0.2) &&
        v7SegmentClear(child.spatial, child.spatial, 0.18, obstacles)
      ) {
        world.objects.push(child);
        delete animal.data.gestation;
        animal.data.satiety = animal.data.satiety - 15;
        animal.data.offspring = Number(animal.data.offspring ?? 0) + 1;
        forestEvent(
          world,
          'animal-born',
          'Fed parents produced offspring after a paid gestation period.',
          child.spatial,
          null,
          { parents: child.data.parents ?? [] },
          child.id,
        );
      }
    }
    if (Number(animal.data.health) <= 0) mode = 'dead';
    if (mode !== animal.data.mode && nearest && (attacking || fleeing))
      forestEvent(
        world,
        'animal-alert',
        'Animal posture and movement changed in response to an actual approach.',
        animal.spatial,
        nearest.id,
        { species, mode, fear: animal.data.fear },
        animal.id,
      );
    animal.data.mode = mode;
    animal.visual.state = mode;
    const length = v7Distance(animal.spatial, target),
      speed =
        (fleeing ? 0.4 : mode === 'hunting' ? 0.32 : 0.12) *
        Math.max(0.25, Number(animal.data.health) / 100);
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
      mode !== 'dead' &&
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
