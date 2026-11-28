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
export function openRoutine(
  world: V7World,
  actor: V7Actor,
  before?: V7World,
): number {
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
    // ex22 sleep-in-place@1 recovers through rest's own code: the same subsistence routine,
    // neither progress work nor relief from routine. Absent elsewhere, so other runs replay.
    ...(world.revisions.includes('sleep-in-place@1') ? ['sleep-in-place'] : []),
    // ex26 bounded-resource-search@1 takes one navigate, probe or gather step per round through
    // their own code: the same subsistence routine, neither progress work nor relief from
    // routine. Absent elsewhere, so other runs replay.
    ...(world.revisions.includes('bounded-resource-search@1')
      ? ['bounded-resource-search']
      : []),
  ];
  // ex26 tend-rooted-plants@1: its inspection is probe's own observation and its other modes
  // change nothing, so each of its rounds counts as a probe round does: routine unless
  // meaningful, never progress work. Absent elsewhere, so other runs replay.
  const probing = [
    'probe',
    ...(world.revisions.includes('tend-rooted-plants@1')
      ? ['tend-rooted-plants']
      : []),
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
  let progress = meaningful;
  if (world.config.longDevelopment) {
    const old = before?.actors.find((a) => a.id === actor.id);
    const location = `${String(Math.floor(actor.position.x))},${String(Math.floor(actor.position.y))}`;
    const visited = actor.extensionState['long:visited'];
    const cells = Array.isArray(visited)
      ? visited.filter((x): x is string => typeof x === 'string')
      : [];
    const novelPlace = !cells.includes(location);
    if (novelPlace) cells.push(location);
    actor.extensionState['long:visited'] = cells;
    const work = world.events.some(
      (e) =>
        e.actor === actor.id &&
        e.success &&
        e.interface &&
        !survival.includes(e.interface) &&
        !['learn', 'request', 'consult', ...probing].includes(e.interface) &&
        (typeof e.data.remaining === 'number' ||
          typeof e.data.progress === 'number' ||
          typeof e.data.elapsed === 'number'),
    );
    // Its navigate steps reach new places as navigate does (only where that revision exists).
    const searched =
      world.revisions.includes('bounded-resource-search@1') &&
      world.events.some(
        (e) =>
          e.actor === actor.id &&
          e.success &&
          e.interface === 'bounded-resource-search' &&
          (e.type === 'moved' || e.type === 'arrived'),
      );
    if (
      meaningful ||
      work ||
      (novelPlace && (event?.interface === 'navigate' || searched))
    )
      actor.extensionState['long:lastProgress'] = world.tick;
    progress =
      meaningful ||
      work ||
      world.tick - Number(actor.extensionState['long:lastProgress'] ?? -1000) <=
        16;
    // Neutral rest/repositioning after real progress is not meaningless routine. Textual projects give no credit.
    if (old?.learning) progress = true;
  }
  const repeating =
    (!world.config.longDevelopment || !progress) &&
    !!event &&
    (survival.includes(event.interface ?? '') ||
      (probing.includes(event.interface ?? '') && !meaningful));
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
