import type {
  V7Actor,
  V7World,
  V7Ability,
  V7Data,
} from './continuous-types.js';
import { v7Signature } from './continuous-data.js';

/** Practice is evidenced by paid, completed execution and actual changed outputs, never registration/study. */
export function openPractice(
  before: V7World,
  world: V7World,
  actor: V7Actor,
  ability: V7Ability,
  complete: boolean,
  emit: (type: string, description: string, data?: V7Data) => void,
): void {
  if (!world.config.development || ability.authored || !complete) return;
  if (
    ability.practiceEvidence &&
    !world.events.some(
      (e) =>
        e.actor === actor.id &&
        e.type === ability.practiceEvidence &&
        e.data.qualified === true &&
        e.data.practiceEligible !== false,
    )
  )
    return;
  const old = before.actors.find((a) => a.id === actor.id);
  if (!old) return;
  const effort = Math.max(0, old.vitals.energy - actor.vitals.energy);
  const changed =
    v7Signature(before.stacks) !== v7Signature(world.stacks) ||
    v7Signature(before.objects) !== v7Signature(world.objects) ||
    v7Signature(old.memory.knowledge ?? {}) !==
      v7Signature(actor.memory.knowledge ?? {});
  if (
    !changed ||
    effort <= 0 ||
    world.processes.some(
      (p) =>
        p.owner === actor.id &&
        !before.processes.some((old) => old.id === p.id),
    )
  )
    return;
  const key = `open:practice:${ability.equivalence}`,
    count = Number(actor.extensionState[key] ?? 0) + 1;
  actor.extensionState[key] = count;
  if ([1, 3, 8].includes(count))
    emit(
      'practice-confirmed',
      'Paid completed practice established a more reliable personal method through actual changed outputs.',
      {
        ability: ability.id,
        equivalence: ability.equivalence,
        completedPractices: count,
        effort,
        qualified: true,
      },
    );
}
/** A small response to sustained actual subsistence repetition, not absence of pleasure or changing labels. */
export function openRoutine(world: V7World, actor: V7Actor): number {
  if (!world.config.development) return 0;
  const event = world.events.find(
    (e) => e.actor === actor.id && e.interface && e.success,
  );
  const survival = [
    'navigate',
    'rest',
    'wait',
    'pickup',
    'gather',
    'eat',
    'drop',
  ];
  const meaningful = world.events.some(
    (e) =>
      e.actor === actor.id &&
      e.success &&
      [
        'information-confirmed',
        'finding-accepted',
        'practice-confirmed',
      ].includes(e.type) &&
      e.data.qualified === true,
  );
  const repeating =
    !!event &&
    (survival.includes(event.interface ?? '') ||
      (event.interface === 'probe' && !meaningful));
  const history = actor.extensionState['open:routine'];
  const records = Array.isArray(history)
    ? history.filter((v): v is boolean => typeof v === 'boolean')
    : [];
  records.push(repeating);
  actor.extensionState['open:routine'] = records.slice(-160);
  const fraction = records.filter(Boolean).length / records.length;
  const burden =
    records.length >= 160 ? Math.max(0, (fraction - 0.9) / 0.1) * 0.025 : 0;
  actor.extensionState['open:routineBurden'] = burden;
  return burden;
}
