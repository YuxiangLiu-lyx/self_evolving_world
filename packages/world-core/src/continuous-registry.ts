import type { V7Package, V7Registry, V7World } from './continuous-types.js';
import { v7Clone, v7Freeze, v7Signature } from './continuous-data.js';

export function v7Registry(packages: V7Package[]): V7Registry {
  const handlers: V7Registry['handlers'] = {},
    processes: V7Registry['processes'] = {},
    ids = new Set<string>();
  for (const pkg of packages) {
    const key = `${pkg.id}@${String(pkg.version)}`;
    if (ids.has(key) || pkg.dependencies.some((d) => !ids.has(d)))
      throw new Error('Duplicate package or missing ordered dependency.');
    ids.add(key);
    for (const [id, handler] of Object.entries(pkg.handlers)) {
      if (handlers[id]) throw new Error('Handler versions are immutable.');
      handlers[id] = handler;
    }
    for (const [id, handler] of Object.entries(pkg.processes)) {
      if (processes[id]) throw new Error('Process versions are immutable.');
      processes[id] = handler;
    }
    for (const ability of pkg.abilities)
      if (
        !handlers[ability.handler] &&
        !['kernel.navigate', 'kernel.request', 'kernel.learn'].includes(
          ability.handler,
        )
      )
        throw new Error(`Missing handler for ${ability.id}.`);
  }
  return { packages, handlers, processes };
}
export function v7Install(
  world: V7World,
  registry: V7Registry,
  key: string,
): V7World {
  const pkg = registry.packages.find(
    (p) => `${p.id}@${String(p.version)}` === key,
  );
  if (
    !pkg ||
    world.revisions.includes(key) ||
    pkg.dependencies.some((d) => !world.revisions.includes(d))
  )
    throw new Error('Missing, duplicate or dependency-incomplete extension.');
  let next = v7Clone(world);
  const physicalInstances = v7Signature({
    objects: world.objects,
    processes: world.processes,
  });
  const protectedState = v7Signature({
    config: world.config,
    tick: world.tick,
    time: world.time,
    terrain: world.terrain,
    actors: world.actors.map((a) => ({
      id: a.id,
      vitals: a.vitals,
      wellbeing: a.wellbeing,
      mastered: a.mastered,
      learning: a.learning,
      position: a.position,
      radius: a.radius,
      parents: a.parents,
      bornAt: a.bornAt,
    })),
    stacks: world.stacks,
  });
  if (pkg.migrate) next = pkg.migrate(next);
  if (
    physicalInstances !==
    v7Signature({ objects: next.objects, processes: next.processes })
  )
    throw new Error(
      'Package installation cannot grant physical objects or processes; create them through paid execution.',
    );
  if (
    protectedState !==
    v7Signature({
      config: next.config,
      tick: next.tick,
      time: next.time,
      terrain: next.terrain,
      actors: next.actors.map((a) => ({
        id: a.id,
        vitals: a.vitals,
        wellbeing: a.wellbeing,
        mastered: a.mastered,
        learning: a.learning,
        position: a.position,
        radius: a.radius,
        parents: a.parents,
        bornAt: a.bornAt,
      })),
      stacks: next.stacks,
    })
  )
    throw new Error(
      'Migration changed protected goals, vitals, rewards, mastery, stock or run policy.',
    );
  for (const ability of pkg.abilities) {
    if (pkg.id !== 'foundation-v7' && ability.authored)
      throw new Error(
        'A new capability cannot claim authored baseline status.',
      );
    if (
      next.abilities.some(
        (a) => a.id === ability.id || a.equivalence === ability.equivalence,
      )
    )
      throw new Error(
        'Reuse the existing equivalent interface instead of duplicating it.',
      );
    if (
      !Number.isSafeInteger(ability.learning) ||
      ability.learning < 0 ||
      (!ability.authored && ability.learning < 1)
    )
      throw new Error('Learning needs a positive mechanism-specific duration.');
    next.abilities.push(v7Clone(ability));
  }
  for (const resource of pkg.resources) {
    if (next.resources.some((r) => r.id === resource.id))
      throw new Error('Resource definitions are immutable.');
    if (
      ![resource.mass, resource.nutrition, resource.toxicity].every(
        (x) => Number.isFinite(x) && x >= 0,
      )
    )
      throw new Error('Invalid physical resource properties.');
    next.resources.push(v7Clone(resource));
  }
  for (const source of pkg.satisfaction) {
    if (
      next.satisfaction.some(
        (r) => r.id === source.id || r.equivalence === source.equivalence,
      )
    )
      throw new Error(
        'Equivalent happiness sources cannot award again under another name.',
      );
    if (
      !next.abilities.some((a) => a.id === source.interface) ||
      [
        'requested',
        'learning',
        'mastered',
        'registered',
        'wellbeing',
        'satisfaction',
      ].includes(source.event) ||
      source.amount <= 0 ||
      source.cap > next.config.mentalCap ||
      source.amount > source.cap ||
      source.duration < 1 ||
      source.cooldown < 1 ||
      ![source.amount, source.cap, source.duration, source.cooldown].every(
        Number.isFinite,
      )
    )
      throw new Error('Invalid or ungrounded satisfaction rule.');
    next.satisfaction.push(v7Clone(source));
  }
  next.revisions.push(key);
  return v7Freeze(next);
}
