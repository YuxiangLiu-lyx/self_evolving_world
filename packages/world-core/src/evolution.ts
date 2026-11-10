import { resolveRound } from './world.js';
import type { WorldAction, WorldState } from './world.js';
import type {
  Knowledge,
  LearningEvent,
  LearningVital,
} from './learning-types.js';
import type { EvolutionRound } from './evolution-types.js';
import { parseLearningAction } from './learning.js';
import {
  compileMechanic,
  EVOLUTION_CONFIG,
  parseEvolutionProposal,
} from './evolution-schema.js';
import {
  evolutionData,
  evolutionSnapshot,
  eWalkable,
  registerEvolution,
} from './evolution-environment.js';
import {
  executeEvolution,
  mergeEvolutionEffects,
} from './evolution-execution.js';
import type { EvolutionEffect } from './evolution-execution.js';
import { dataObject, exactKeys, freeze, list } from './skill-code.js';
export function parseEvolutionRound(input: unknown): EvolutionRound {
  const r = dataObject(input);
  exactKeys(r, ['actions', 'proposal']);
  return freeze({
    actions: list(r.actions, 32).map(parseLearningAction),
    proposal: parseEvolutionProposal(r.proposal),
  });
}
export function stepEvolutionRound(
  world: WorldState,
  input: unknown,
): WorldState {
  const round = parseEvolutionRound(input),
    data = evolutionData(world),
    { actions, proposal } = round;
  if (
    actions.length !== world.agents.length ||
    new Set(actions.map((a) => a.agentId)).size !== actions.length ||
    actions.some((a) => !world.agents.some((x) => x.id === a.agentId))
  )
    throw new RangeError('Exactly one intent per actor is required.');
  const registered = registerEvolution(world, actions, proposal),
    knowledge: Record<string, Knowledge> = { ...data.knowledge },
    effects = new Map<string, EvolutionEffect>(),
    base: WorldAction[] = [],
    feedback = new Map<
      string,
      { outcome: string; detail: string; skillId: string | null }
    >();
  const delta = {
    north: [0, -1],
    east: [1, 0],
    south: [0, 1],
    west: [-1, 0],
  } as const;
  for (const actor of world.agents) {
    const a = actions.find((a) => a.agentId === actor.id),
      k = knowledge[actor.id],
      v = data.vitals[actor.id],
      memory = data.memory[actor.id];
    if (!a || !k || !v || !memory)
      throw new RangeError('Incomplete actor state.');
    const log = (
      outcome: string,
      detail: string,
      skillId: string | null = null,
    ) => feedback.set(actor.id, { outcome, detail, skillId });
    if (v.health === 0) {
      log('dead', 'Death is irreversible.');
      continue;
    }
    if (a.type === 'study') {
      if (!k.pending) {
        log('study-failed', 'No learning in progress.');
        continue;
      }
      const p = { ...k.pending, completed: k.pending.completed + 1 },
        finished = p.completed === p.total;
      knowledge[actor.id] = {
        learned: finished ? [...k.learned, p.skillId] : k.learned,
        pending: finished ? null : p,
      };
      log(
        finished ? 'learned' : 'studying',
        `${String(p.completed)}/${String(p.total)} learning rounds; usable from next round.`,
        p.skillId,
      );
    } else if (a.type === 'learn') {
      if (k.pending) {
        log('learning-failed', 'Finish the current learning first.');
        continue;
      }
      const review = proposal.reviews.find((r) => r.agentId === actor.id);
      if (!review) throw new RangeError('Unresolved review.');
      if (review.decision === 'reject') {
        log('learning-rejected', review.reason);
        continue;
      }
      const draft = proposal.mechanics.find((m) => m.id === review.mechanicId),
        signature = draft ? compileMechanic(draft).signature : null;
      const mechanic = registered.mechanics.find(
          (m) => m.id === review.mechanicId || m.signature === signature,
        ),
        skill = registered.skills.find((s) => s.mechanicId === mechanic?.id);
      if (!skill) throw new RangeError('Missing registered ability.');
      if (k.learned.includes(skill.id)) {
        log('already-learned', review.reason, skill.id);
        continue;
      }
      const finished = review.learningRounds === 1;
      knowledge[actor.id] = {
        learned: finished ? [...k.learned, skill.id] : k.learned,
        pending: finished
          ? null
          : { skillId: skill.id, total: review.learningRounds, completed: 1 },
      };
      log(
        finished ? 'learned' : 'studying',
        `${review.decision}: ${skill.name}; 1/${String(review.learningRounds)} rounds. ${review.reason} Prerequisites: ${review.prerequisites.join('; ')}`,
        skill.id,
      );
    } else if (a.type === 'move') {
      const [dx, dy] = delta[a.direction],
        p = { x: actor.position.x + dx, y: actor.position.y + dy };
      if (eWalkable(data, p)) base.push(a);
      else
        log(
          'terrain-blocked',
          'Impassable terrain or standing object; find a walkable route.',
        );
    } else if (a.type === 'pickup') {
      const stack = data.stacks.find((s) => s.id === a.itemId);
      if (
        !stack ||
        stack.quantity === 0 ||
        stack.owner !== null ||
        stack.position?.x !== actor.position.x ||
        stack.position.y !== actor.position.y
      ) {
        log(
          'pickup-failed',
          'Pickup requires a remaining ground stack on this cell.',
        );
        continue;
      }
      effects.set(actor.id, {
        stacks: data.stacks.map((s) =>
          s.id === stack.id ? { ...s, owner: actor.id, position: null } : s,
        ),
        sites: data.sites,
        vital: v,
        memory,
        writes: [`stack:${stack.id}`],
        detail: `Collected ${String(stack.quantity)} units; pickup alone does not nourish.`,
      });
      log(
        'picked-up',
        `Collected ${String(stack.quantity)} units; pickup alone does not nourish.`,
      );
    } else if (a.type === 'use') {
      const skill = data.skills.find((s) => s.id === a.skillId),
        mechanic = data.mechanics.find((m) => m.id === skill?.mechanicId);
      if (!skill || !mechanic || !k.learned.includes(skill.id)) {
        log(
          'use-failed',
          'Both registered implementation and individual learning are required.',
          a.skillId,
        );
        continue;
      }
      try {
        const effect = executeEvolution(world, actor, mechanic, a.args);
        effects.set(actor.id, effect);
        log('used', effect.detail, skill.id);
      } catch (error) {
        log(
          'use-failed',
          error instanceof Error ? error.message : 'Execution failed.',
          skill.id,
        );
      }
    } else log('waited', 'Waited one round.');
  }
  const counts = new Map<string, number>();
  for (const e of effects.values())
    for (const id of e.writes) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [actor, e] of effects)
    if (e.writes.some((id) => (counts.get(id) ?? 0) > 1)) {
      effects.delete(actor);
      feedback.set(actor, {
        outcome: 'resource-conflict',
        detail:
          'Concurrent transactions on the same resource were all rejected.',
        skillId: feedback.get(actor)?.skillId ?? null,
      });
    }
  const moved = resolveRound(world, base);
  for (const event of moved.events ?? [])
    feedback.set(event.action.agentId, {
      outcome: event.outcome,
      detail: event.outcome,
      skillId: null,
    });
  const applied = mergeEvolutionEffects(registered, effects),
    vitals: Record<string, LearningVital> = {};
  const events: LearningEvent[] = actions.map((action) => {
    const before = data.vitals[action.agentId],
      after = applied.vitals[action.agentId],
      result = feedback.get(action.agentId);
    if (!before || !after || !result)
      throw new RangeError('Missing round result.');
    const next =
      before.health === 0
        ? before
        : {
            ...after,
            health: Math.max(
              0,
              after.health -
                (after.satiety === 0 ? EVOLUTION_CONFIG.starvationDamage : 0),
            ),
            satiety: Math.max(0, after.satiety - EVOLUTION_CONFIG.satietyLoss),
          };
    vitals[action.agentId] = next;
    return {
      tick: moved.tick,
      action,
      ...result,
      healthDelta: next.health - before.health,
      satietyDelta: next.satiety - before.satiety,
    };
  });
  return evolutionSnapshot(
    moved,
    { ...applied, knowledge, vitals, events },
    moved.tick,
  );
}
