import type { AgentState, WorldState } from './world.js';
import type { LearningVital } from './learning-types.js';
import type {
  CMemory,
  CSite,
  EStack,
  CoevolutionData,
  CMechanic,
  PersistentObject,
  ResourceJob,
} from './coevolution-types.js';
import { coevolutionData, cBiomeAt } from './coevolution-environment.js';
import { cSeededUnit } from './coevolution-schema.js';
import { freeze } from './skill-code.js';
export interface CoevolutionEffect {
  readonly stacks: readonly EStack[];
  readonly sites: readonly CSite[];
  readonly vital: LearningVital;
  readonly memory: CMemory;
  readonly writes: readonly string[];
  readonly siteBefore?: readonly CSite[];
  readonly detail: string;
  readonly objects?: readonly PersistentObject[];
  readonly jobs?: readonly ResourceJob[];
}
export function executeCoevolution(
  world: WorldState,
  actor: AgentState,
  mechanic: CMechanic,
  args: Readonly<Record<string, string>>,
): CoevolutionEffect {
  const data = coevolutionData(world);
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
    details: string[] = [],
    objects = [...data.objects],
    jobs = [...data.jobs];
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
    const target =
      op.target === null
        ? null
        : op.target.startsWith('result-')
          ? `produced-${String(world.tick + 1)}-${actor.id}-${op.target.slice(7)}`
          : args[op.target];
    let energy = 0,
      units = 0;
    for (const cost of op.costs) {
      let remaining = cost.quantity;
      for (const stack of [...stacks.values()]
        .filter((s) => s.owner === actor.id && s.type === cost.resource)
        .sort((a, b) => a.id.localeCompare(b.id))) {
        const quantity = Math.min(stack.quantity, remaining);
        if (quantity) {
          energy += spend(stack.id, quantity);
          units += quantity;
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
        cSeededUnit(
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
      if (target) {
        energy += spend(target, op.quantity);
        units += op.quantity;
      }
      if (op.quantity > units)
        throw new RangeError('Conversion cannot amplify material units.');
      const type = definition(op.resource ?? '');
      if (type.nutrition * op.quantity > energy)
        throw new RangeError(
          'Transformation cannot create nutritional energy from nonfood materials.',
        );
      create(type.id, op.quantity, index);
      details.push(
        `Transformed consumed inputs into ${String(op.quantity)} ${type.name}.`,
      );
    } else if (op.op === 'place') {
      const blueprint = data.blueprints.find((b) => b.id === op.resource);
      if (!blueprint || objects.length >= 48)
        throw new RangeError('Unknown blueprint or object limit.');
      if (
        blueprint.growth &&
        !blueprint.growth.biomes.includes(cBiomeAt(data, actor.position))
      )
        throw new RangeError(
          'The current ground does not support this planting.',
        );
      if (
        !blueprint.portable &&
        objects.some(
          (o) =>
            o.position?.x === actor.position.x &&
            o.position.y === actor.position.y,
        )
      )
        throw new RangeError('One stationary facility per cell.');
      const id = `object-${String(world.tick + 1)}-${actor.id}-${String(index)}`;
      objects.push({
        id,
        blueprint: blueprint.id,
        creator: actor.id,
        created: world.tick + 1,
        owner: blueprint.portable ? actor.id : null,
        position: blueprint.portable ? null : actor.position,
        ...(blueprint.growth
          ? {
              growth: {
                next: world.tick + 1 + blueprint.growth.establishment,
                produced: 0,
                environmentalEnergy: 0,
              },
            }
          : {}),
      });
      writes.add(`object:${id}`);
      if (!blueprint.portable)
        writes.add(
          `cell:${String(actor.position.x)},${String(actor.position.y)}`,
        );
      details.push(
        `Created persistent ${id}; material inputs consumed; shared access to stationary effects.`,
      );
    } else if (op.op === 'process') {
      const object = objects.find((o) => o.id === target),
        blueprint = data.blueprints.find((b) => b.id === object?.blueprint),
        recipe = blueprint?.recipe;
      if (
        !object?.position ||
        !recipe ||
        Math.abs(object.position.x - actor.position.x) +
          Math.abs(object.position.y - actor.position.y) >
          1
      )
        throw new RangeError(
          'Processing needs an adjacent compatible facility.',
        );
      if (jobs.some((j) => j.object === object.id && !j.completed))
        throw new RangeError('Facility is busy.');
      for (const cost of recipe.inputs) {
        let remaining = cost.quantity;
        for (const stack of [...stacks.values()]
          .filter((s) => s.owner === actor.id && s.type === cost.resource)
          .sort((a, b) => a.id.localeCompare(b.id))) {
          const n = Math.min(stack.quantity, remaining);
          if (n) {
            energy += spend(stack.id, n);
            units += n;
            remaining -= n;
          }
          if (!remaining) break;
        }
        if (remaining) throw new RangeError('Missing processing inputs.');
      }
      if (
        definition(recipe.output).nutrition * recipe.quantity > energy ||
        recipe.quantity > units
      )
        throw new RangeError('Processing energy conservation failed.');
      const id = `job-${String(world.tick + 1)}-${actor.id}-${String(index)}`;
      jobs.push({
        id,
        object: object.id,
        actor: actor.id,
        output: recipe.output,
        quantity: recipe.quantity,
        due: world.tick + 1 + recipe.delay,
        completed: false,
      });
      writes.add(`job:${id}`);
      writes.add(`busy:${object.id}`);
      details.push(
        `Processing inputs consumed; ${id} completes at round ${String(world.tick + 1 + recipe.delay)} as shared ground output.`,
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
    objects,
    jobs,
  });
}
/** Merge only declared transaction writes; concurrent effects never overwrite untouched state. */
export function mergeCoevolutionEffects(
  data: CoevolutionData,
  effects: ReadonlyMap<string, CoevolutionEffect>,
): CoevolutionData {
  const stacks = new Map(data.stacks.map((s) => [s.id, s])),
    sites = new Map(data.sites.map((s) => [s.id, s])),
    vitals = { ...data.vitals },
    memory = { ...data.memory },
    objects = new Map(data.objects.map((o) => [o.id, o])),
    jobs = new Map(data.jobs.map((j) => [j.id, j]));
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
    for (const o of e.objects ?? [])
      if (e.writes.includes(`object:${o.id}`)) objects.set(o.id, o);
    for (const j of e.jobs ?? [])
      if (e.writes.includes(`job:${j.id}`)) jobs.set(j.id, j);
    vitals[actor] = e.vital;
    memory[actor] = e.memory;
  }
  return {
    ...data,
    stacks: [...stacks.values()],
    sites: [...sites.values()],
    vitals,
    memory,
    objects: [...objects.values()],
    jobs: [...jobs.values()],
  };
}
