import type { AgentState, WorldState } from './world.js';
import type { LearningVital } from './learning-types.js';
import type {
  EMemory,
  ESite,
  EStack,
  EvolutionData,
  Mechanic,
} from './evolution-types.js';
import { evolutionData } from './evolution-environment.js';
import { seededUnit } from './evolution-schema.js';
import { freeze } from './skill-code.js';
export interface EvolutionEffect {
  readonly stacks: readonly EStack[];
  readonly sites: readonly ESite[];
  readonly vital: LearningVital;
  readonly memory: EMemory;
  readonly writes: readonly string[];
  readonly siteBefore?: readonly ESite[];
  readonly detail: string;
}
export function executeEvolution(
  world: WorldState,
  actor: AgentState,
  mechanic: Mechanic,
  args: Readonly<Record<string, string>>,
): EvolutionEffect {
  const data = evolutionData(world);
  if (
    Object.keys(args).sort().join(',') !==
    [...mechanic.parameters].sort().join(',')
  )
    throw new RangeError('Use exactly the declared mechanic parameters.');
  let vital = data.vitals[actor.id],
    memory = data.memory[actor.id];
  if (!vital || !memory) throw new RangeError('Missing acting state.');
  const stacks = new Map(data.stacks.map((s) => [s.id, s])),
    sites = new Map(data.sites.map((s) => [s.id, s])),
    writes = new Set<string>(),
    details: string[] = [];
  const definition = (id: string) => {
    const type = data.types.find((t) => t.id === id);
    if (!type) throw new RangeError('Undefined resource type.');
    return type;
  };
  const spend = (id: string, quantity: number): number => {
    const stack = stacks.get(id);
    if (!stack || stack.owner !== actor.id || stack.quantity < quantity)
      throw new RangeError('Need sufficient owned resource units.');
    stacks.set(id, { ...stack, quantity: stack.quantity - quantity });
    writes.add(`stack:${id}`);
    return definition(stack.type).nutrition * quantity;
  };
  const create = (type: string, quantity: number, index: number) => {
    const id = `produced-${String(world.tick + 1)}-${actor.id}-${String(index)}`,
      d = definition(type);
    stacks.set(id, {
      id,
      type,
      quantity,
      durability: d.durability,
      owner: actor.id,
      position: null,
    });
    writes.add(`stack:${id}`);
  };
  for (const [index, op] of mechanic.operations.entries()) {
    const target = op.target === null ? null : args[op.target];
    let energy = 0;
    for (const cost of op.costs) {
      let remaining = cost.quantity;
      for (const stack of [...stacks.values()]
        .filter((s) => s.owner === actor.id && s.type === cost.resource)
        .sort((a, b) => a.id.localeCompare(b.id))) {
        const quantity = Math.min(stack.quantity, remaining);
        if (quantity) {
          energy += spend(stack.id, quantity);
          remaining -= quantity;
        }
        if (!remaining) break;
      }
      if (remaining)
        throw new RangeError(`Missing material cost: ${cost.resource}.`);
    }
    if (op.tool) {
      const tool = [...stacks.values()].find(
        (s) =>
          s.owner === actor.id &&
          s.type === op.tool &&
          s.quantity > 0 &&
          s.durability > 0,
      );
      if (!tool) throw new RangeError(`Missing usable tool: ${op.tool}.`);
      stacks.set(tool.id, { ...tool, durability: tool.durability - 1 });
      writes.add(`stack:${tool.id}`);
    }
    if (op.op === 'extract') {
      const site = sites.get(target ?? '');
      if (
        !site ||
        Math.abs(site.position.x - actor.position.x) +
          Math.abs(site.position.y - actor.position.y) >
          1
      )
        throw new RangeError('Extraction requires an adjacent natural object.');
      const type = op.resource ?? '',
        available = site.stock[type] ?? 0;
      if (available < op.quantity)
        throw new RangeError(
          'The target has no sufficient matching stock; requesting again does not replenish it.',
        );
      if (
        seededUnit(
          data.seed,
          `attempt:${String(world.tick)}:${actor.id}:${mechanic.signature}:${String(index)}`,
        ) *
          100 >=
        op.chance
      )
        throw new RangeError(
          'The costed opportunity failed; no stock was taken.',
        );
      sites.set(site.id, {
        ...site,
        stock: { ...site.stock, [type]: available - op.quantity },
      });
      writes.add(`site:${site.id}`);
      create(type, op.quantity, index);
      memory = {
        ...memory,
        inspected: [...new Set([...memory.inspected, site.id])],
      };
      details.push(
        `Extracted ${String(op.quantity)} ${type}; site stock decreased.`,
      );
    } else if (op.op === 'consume') {
      const stack = stacks.get(target ?? '');
      if (!stack) throw new RangeError('Unknown resource instance.');
      const type = definition(stack.type);
      if (type.nutrition === 0)
        throw new RangeError('The material cannot provide nourishment.');
      spend(stack.id, op.quantity);
      vital = {
        ...vital,
        health: Math.max(0, vital.health - type.toxicity * op.quantity),
        satiety: Math.min(100, vital.satiety + type.nutrition * op.quantity),
      };
      memory = {
        ...memory,
        knownTypes: [...new Set([...memory.knownTypes, type.id])],
      };
      details.push(
        `Consumed ${String(op.quantity)} ${type.name}; nutrition ${String(type.nutrition)}, toxicity ${String(type.toxicity)} per unit.`,
      );
    } else if (op.op === 'convert') {
      if (target) energy += spend(target, op.quantity);
      const type = definition(op.resource ?? '');
      if (type.nutrition * op.quantity > energy)
        throw new RangeError(
          'Transformation cannot create nutritional energy from nonfood materials.',
        );
      create(type.id, op.quantity, index);
      details.push(
        `Transformed consumed inputs into ${String(op.quantity)} ${type.name}.`,
      );
    } else {
      const stack = stacks.get(target ?? ''),
        site = sites.get(target ?? '');
      if (
        stack &&
        (stack.owner === actor.id ||
          (stack.position &&
            Math.abs(stack.position.x - actor.position.x) +
              Math.abs(stack.position.y - actor.position.y) <=
              1))
      ) {
        const type = definition(stack.type);
        memory = {
          ...memory,
          knownTypes: [...new Set([...memory.knownTypes, type.id])],
        };
        details.push(
          `Identified ${type.name}: nutrition ${String(type.nutrition)}, toxicity ${String(type.toxicity)}.`,
        );
      } else if (
        site &&
        Math.abs(site.position.x - actor.position.x) +
          Math.abs(site.position.y - actor.position.y) <=
          1
      ) {
        memory = {
          ...memory,
          inspected: [...new Set([...memory.inspected, site.id])],
        };
        details.push(
          `Inspected ${site.id}: ${JSON.stringify(site.stock)}; ${site.allocation === null ? 'unassigned potential' : 'persistent assignment'}.`,
        );
      } else
        throw new RangeError(
          'Identification requires owned or adjacent observable material.',
        );
    }
  }
  return freeze({
    stacks: [...stacks.values()],
    sites: [...sites.values()],
    vital,
    memory,
    writes: [...writes],
    siteBefore: data.sites,
    detail: details.join(' '),
  });
}
/** Merge only declared transaction writes; concurrent effects never overwrite untouched state. */
export function mergeEvolutionEffects(
  data: EvolutionData,
  effects: ReadonlyMap<string, EvolutionEffect>,
): EvolutionData {
  const stacks = new Map(data.stacks.map((s) => [s.id, s])),
    sites = new Map(data.sites.map((s) => [s.id, s])),
    vitals = { ...data.vitals },
    memory = { ...data.memory };
  for (const [actor, e] of effects) {
    for (const s of e.stacks)
      if (e.writes.includes(`stack:${s.id}`)) stacks.set(s.id, s);
    for (const s of e.sites)
      if (e.writes.includes(`site:${s.id}`)) {
        const current = sites.get(s.id),
          before = e.siteBefore?.find((x) => x.id === s.id);
        if (!current || !before)
          throw new RangeError('Missing site transaction baseline.');
        const stock = { ...current.stock };
        for (const [type, n] of Object.entries(s.stock))
          stock[type] =
            (current.stock[type] ?? 0) + n - (before.stock[type] ?? 0);
        sites.set(s.id, { ...current, stock });
      }
    vitals[actor] = e.vital;
    memory[actor] = e.memory;
  }
  return {
    ...data,
    stacks: [...stacks.values()],
    sites: [...sites.values()],
    vitals,
    memory,
  };
}
