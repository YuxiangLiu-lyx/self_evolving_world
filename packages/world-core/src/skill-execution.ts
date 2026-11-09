import type { AgentState } from './world.js';
import type {
  LearningEnvironment,
  LearningVital,
  ResourceKind,
  SkillSpec,
} from './learning-types.js';
import { resource } from './learning-environment.js';
import { freeze } from './skill-code.js';

export interface SkillEffect {
  readonly agent: AgentState;
  readonly vital: LearningVital;
  readonly environment: LearningEnvironment;
  readonly writes: readonly string[];
}
/** Transactional candidate: any failed instruction discards every previous effect. */
export function executeSkill(
  skill: SkillSpec,
  args: Readonly<Record<string, string>>,
  actor: AgentState,
  vital: LearningVital,
  env: LearningEnvironment,
  tick: number,
): SkillEffect {
  if (
    Object.keys(args).sort().join(',') !==
    [...skill.parameters].sort().join(',')
  )
    throw new RangeError(
      'Skill arguments must exactly match its declared parameters.',
    );
  let inventory = [...actor.inventory],
    health = vital.health,
    satiety = vital.satiety;
  const resources = env.resources.map((r) => ({ ...r }));
  const objects = env.objects.map((o) => ({ ...o, stock: { ...o.stock } }));
  const writes = new Set<string>();
  const owned = (id: string) => {
    const r = resources.find((r) => r.id === id);
    if (!r || !inventory.some((i) => i.id === id) || r.quantity === 0)
      throw new RangeError('Target is not an owned resource.');
    return r;
  };
  const spend = (kind: ResourceKind, quantity: number) => {
    const available = resources.filter(
      (r) => r.kind === kind && inventory.some((i) => i.id === r.id),
    );
    if (available.reduce((n, r) => n + r.quantity, 0) < quantity)
      throw new RangeError(`Missing ${kind} recipe cost.`);
    for (const r of available) {
      const used = Math.min(quantity, r.quantity);
      if (!used) continue;
      r.quantity -= used;
      quantity -= used;
      writes.add(r.id);
      if (r.quantity === 0) inventory = inventory.filter((i) => i.id !== r.id);
    }
  };
  for (const [index, instruction] of skill.instructions.entries()) {
    if (health <= 0)
      throw new RangeError('A lethal intermediate effect cannot continue.');
    if (instruction.op === 'consume') {
      const target = args[instruction.parameter];
      if (!target) throw new RangeError('Missing resource argument.');
      const r = owned(target);
      if (r.nutrition <= 0 || r.quantity < instruction.quantity)
        throw new RangeError(
          'Resource is inedible or lacks the required quantity.',
        );
      r.quantity -= instruction.quantity;
      writes.add(r.id);
      if (r.quantity === 0) inventory = inventory.filter((i) => i.id !== r.id);
      satiety = Math.min(100, satiety + r.nutrition * instruction.quantity);
      health = Math.max(0, health - r.toxicity * instruction.quantity);
    } else {
      const kind = instruction.kind;
      const quantity = instruction.op === 'craft' ? 1 : instruction.quantity;
      if (instruction.op === 'craft') {
        spend('branch', kind === 'rod' ? 2 : 1);
        spend('stone', kind === 'rod' ? 1 : 2);
      } else {
        const o = objects.find((o) => o.id === args[instruction.parameter]);
        if (
          !o ||
          Math.abs(o.position.x - actor.position.x) +
            Math.abs(o.position.y - actor.position.y) >
            1
        )
          throw new RangeError(
            'Harvest requires an adjacent environment object.',
          );
        if ((o.stock[kind] ?? 0) < quantity)
          throw new RangeError('Object lacks the requested finite stock.');
        if (kind === 'timber' || kind === 'fish') {
          const tool = resources.find(
            (r) =>
              r.kind === (kind === 'timber' ? 'axe' : 'rod') &&
              r.quantity > 0 &&
              r.durability >= quantity &&
              inventory.some((i) => i.id === r.id),
          );
          if (!tool)
            throw new RangeError(
              `Missing usable ${kind === 'timber' ? 'axe' : 'rod'}.`,
            );
          tool.durability -= quantity;
          writes.add(tool.id);
        }
        o.stock[kind] = (o.stock[kind] ?? 0) - quantity;
        writes.add(o.id);
      }
      const id = `yield-${String(tick)}-${actor.id}-${String(index)}`;
      if (resources.some((r) => r.id === id))
        throw new RangeError('Generated resource identity collision.');
      resources.push({ ...resource(id, kind, quantity) });
      writes.add(id);
      inventory.push({ id, name: kind });
    }
  }
  return freeze({
    agent: { ...actor, inventory },
    vital: { ...vital, health, satiety },
    environment: { ...env, resources, objects },
    writes: [...writes],
  });
}
