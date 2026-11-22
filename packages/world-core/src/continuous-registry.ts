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
    world.config.development &&
    pkg &&
    !['foundation-forest', 'foundation-open'].includes(pkg.id) &&
    pkg.scope !== world.config.development.scope
  )
    throw new Error(
      'This package is not approved for the current experiment scope.',
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
      ...(world.config.experience ? { experience: a.experience } : {}),
      mastered: a.mastered,
      learning: a.learning,
      position: a.position,
      radius: a.radius,
      parents: a.parents,
      bornAt: a.bornAt,
      life: a.life ?? null,
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
        ...(world.config.experience ? { experience: a.experience } : {}),
        mastered: a.mastered,
        learning: a.learning,
        position: a.position,
        radius: a.radius,
        parents: a.parents,
        bornAt: a.bornAt,
        life: a.life ?? null,
      })),
      stacks: next.stacks,
    })
  )
    throw new Error(
      'Migration changed protected goals, vitals, rewards, mastery, stock or run policy.',
    );
  for (const ability of pkg.abilities) {
    if (
      ability.practiceEvidence &&
      !(pkg.events ?? []).includes(ability.practiceEvidence)
    )
      throw new Error('Practice evidence must use a declared extension event.');
    if (
      !['foundation-v7', 'foundation-forest', 'foundation-open'].includes(
        pkg.id,
      ) &&
      ability.authored
    )
      throw new Error(
        'A new capability cannot claim authored baseline status.',
      );
    if (world.config.development && ability.dependencies) {
      if (
        ability.dependencies.abilities.some(
          (id) => !next.abilities.some((a) => a.id === id),
        ) ||
        ability.dependencies.resources.some(
          (id) =>
            !next.resources.some((r) => r.id === id) &&
            !pkg.resources.some((r) => r.id === id),
        )
      )
        throw new Error(
          'Capability dependencies must exist in this experiment.',
        );
    }
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
    if (world.config.experience) {
      if (!ability.execution || !ability.references)
        throw new Error(
          'New interfaces require explicit execution and reference contracts.',
        );
      if (
        ability.execution.duration !== null &&
        (!Number.isSafeInteger(ability.execution.duration) ||
          ability.execution.duration < 1)
      )
        throw new Error(
          'Execution duration must be positive or state-dependent.',
        );
      if (ability.parameters.properties?.target && !ability.references.target)
        throw new Error(
          'Target parameters must use the shared reference resolver.',
        );
      if (
        Object.keys(ability.references).some(
          (key) => !ability.parameters.properties?.[key],
        )
      )
        throw new Error('Reference contracts must name declared parameters.');
    }
    next.abilities.push(v7Clone(ability));
    if (next.config.development && !ability.authored)
      next.satisfaction.push({
        id: `practice:${ability.id}`,
        name: 'Grounded capability progress',
        equivalence: `open:practice:${ability.equivalence}`,
        event: 'practice-confirmed',
        interface: ability.id,
        conditions: [{ path: 'qualified', comparison: 'eq', value: true }],
        amount: 0.4,
        cap: 0.5,
        duration: 8,
        mode: 'hold',
        repetition: 'refresh',
        cooldown: 12,
        rationale:
          'Limited milestones from paid complete practice with real changed outputs; no reward for mastery.',
        revision: ability.revision,
        maintenance: {
          event: 'practice-confirmed',
          interface: ability.id,
          gain: 0.02,
          decay: 0.001,
        },
      });
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
    if (
      world.config.experience &&
      resource.nutrition > 0 &&
      (!resource.food ||
        !resource.food.method.trim() ||
        !Number.isFinite(resource.food.quality) ||
        resource.food.quality < 0 ||
        resource.food.quality > 1 ||
        !resource.food.ingredients.length ||
        resource.food.ingredients.some(
          (i) =>
            !world.resources.some((r) => r.id === i.resource) ||
            !Number.isFinite(i.share) ||
            i.share <= 0,
        ) ||
        Math.abs(
          resource.food.ingredients.reduce((n, i) => n + i.share, 0) - 1,
        ) > 1e-8)
    )
      throw new Error(
        'New food requires actual known ingredient shares, processing and bounded quality.',
      );
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
      (source.repeatWindow !== undefined &&
        (source.repetition !== 'refresh' ||
          source.mode !== 'hold' ||
          !Number.isFinite(source.repeatWindow.rounds) ||
          !Number.isFinite(source.repeatWindow.amount) ||
          source.repeatWindow.rounds < source.cooldown ||
          source.repeatWindow.amount <= 0 ||
          source.repeatWindow.amount > source.amount)) ||
      (source.maintenance?.cap !== undefined &&
        (!Number.isFinite(source.maintenance.cap) ||
          source.maintenance.cap < 0 ||
          source.maintenance.cap > source.cap)) ||
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
  if (next.config.forest) {
    const declared = pkg.events ?? [];
    if (declared.some((e) => !/^[a-z][a-z0-9_-]*$/.test(e)))
      throw new Error('Invalid declared event name.');
    next.eventTypes = [...new Set([...(next.eventTypes ?? []), ...declared])];
    for (const rule of next.satisfaction)
      if (
        [
          { event: rule.event, interface: rule.interface },
          ...(rule.alternativeTriggers ?? []),
          ...(rule.maintenance?.alternativeTriggers ?? []),
        ].some(
          (trigger) =>
            !next.eventTypes?.includes(trigger.event) ||
            !next.abilities.some(
              (ability) => ability.id === trigger.interface,
            ) ||
            [
              'requested',
              'learning',
              'mastered',
              'registered',
              'wellbeing',
              'satisfaction',
            ].includes(trigger.event),
        )
      )
        throw new Error(
          'Satisfaction must reference a declared executable event.',
        );
  }
  next.revisions.push(key);
  return v7Freeze(next);
}
