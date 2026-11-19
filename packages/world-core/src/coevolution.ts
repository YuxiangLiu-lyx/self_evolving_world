import {
  actionEffort,
  advanceResourceProcesses,
  recovery,
} from './coevolution-effects.js';
import { resolveRound } from './world.js';
import type { WorldAction, WorldState } from './world.js';
import type { Knowledge, LearningVital } from './learning-types.js';
import type {
  CoevolutionEvent,
  CoevolutionRound,
} from './coevolution-types.js';
import { parseCoevolutionAction } from './coevolution-schema.js';
import {
  compileCMechanic,
  COEVOLUTION_CONFIG,
  parseCoevolutionProposal,
} from './coevolution-schema.js';
import {
  coevolutionData,
  coevolutionSnapshot,
  cWalkable,
  registerCoevolution,
} from './coevolution-environment.js';
import {
  executeCoevolution,
  mergeCoevolutionEffects,
} from './coevolution-execution.js';
import type { CoevolutionEffect } from './coevolution-execution.js';
import { dataObject, exactKeys, freeze, list } from './skill-code.js';
export function parseCoevolutionRound(input: unknown): CoevolutionRound {
  const r = dataObject(input);
  exactKeys(r, ['actions', 'proposal']);
  return freeze({
    actions: list(r.actions, 32).map(parseCoevolutionAction),
    proposal: parseCoevolutionProposal(r.proposal),
  });
}
export function stepCoevolutionRound(
  world: WorldState,
  input: unknown,
): WorldState {
  const round = parseCoevolutionRound(input),
    data = coevolutionData(world),
    { actions, proposal } = round;
  if (
    actions.length !== world.agents.length ||
    new Set(actions.map((a) => a.agentId)).size !== actions.length ||
    actions.some((a) => !world.agents.some((x) => x.id === a.agentId))
  )
    throw new RangeError('Exactly one intent per actor is required.');
  const registered = registerCoevolution(world, actions, proposal),
    knowledge: Record<string, Knowledge> = { ...data.knowledge },
    energy = { ...data.energy },
    messages = [...data.messages],
    benefits = [...data.benefits],
    effects = new Map<string, CoevolutionEffect>(),
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
    const effort = actionEffort(data, actor, a);
    if ((energy[actor.id] ?? 0) < effort) {
      log(
        'effort-failed',
        'Insufficient energy for this action and carried load; rest or change the load.',
      );
      continue;
    }
    energy[actor.id] = (energy[actor.id] ?? 0) - effort;
    if (a.type === 'rest') {
      const r = recovery(data, actor),
        before = energy[actor.id] ?? 0;
      energy[actor.id] = Math.min(
        COEVOLUTION_CONFIG.energyCap,
        before + r.amount,
      );
      const bonus = Math.max(
        0,
        (energy[actor.id] ?? 0) - before - COEVOLUTION_CONFIG.restRecovery,
      );
      if (r.object && bonus)
        benefits.push({
          tick: world.tick + 1,
          actor: actor.id,
          object: r.object,
          kind: 'rest',
          amount: bonus,
        });
      log(
        'rested',
        `Recovered ${String((energy[actor.id] ?? 0) - before)} energy; actual bonus ${String(bonus)}.`,
      );
    } else if (a.type === 'message') {
      const target = world.agents.find((x) => x.id === a.recipient);
      if (
        !target ||
        target.id === actor.id ||
        Math.hypot(
          target.position.x - actor.position.x,
          target.position.y - actor.position.y,
        ) > world.settings.visionRadius
      ) {
        log('message-failed', 'Recipient must be another visible actor.');
        continue;
      }
      messages.push({
        tick: world.tick + 1,
        sender: actor.id,
        recipient: a.recipient,
        text: a.text,
      });
      log(
        'message-sent',
        'Delivered after this round; other actors cannot react until the next round.',
      );
    } else if (a.type === 'give' || a.type === 'drop') {
      const stack = data.stacks.find((s) => s.id === a.itemId),
        object = data.objects.find((o) => o.id === a.itemId),
        recipient =
          a.type === 'give'
            ? world.agents.find((x) => x.id === a.recipient)
            : null;
      if (
        (!stack && !object) ||
        (stack && (stack.owner !== actor.id || stack.quantity < 1)) ||
        (object && object.owner !== actor.id) ||
        (a.type === 'give' &&
          (!recipient ||
            recipient.id === actor.id ||
            Math.abs(recipient.position.x - actor.position.x) +
              Math.abs(recipient.position.y - actor.position.y) >
              1))
      ) {
        log(
          'transfer-failed',
          'Transfer needs an owned item and an adjacent other recipient, or drop on this cell.',
        );
        continue;
      }
      effects.set(actor.id, {
        stacks: data.stacks.map((s) =>
          s.id === stack?.id
            ? {
                ...s,
                owner: recipient?.id ?? null,
                position: recipient ? null : actor.position,
              }
            : s,
        ),
        sites: data.sites,
        vital: v,
        memory,
        writes: [stack ? `stack:${stack.id}` : `object:${object?.id ?? ''}`],
        objects: data.objects.map((o) =>
          o.id === object?.id
            ? {
                ...o,
                owner: recipient?.id ?? null,
                position: recipient ? null : actor.position,
              }
            : o,
        ),
        detail: 'Transferred owned property once.',
      });
      log('transferred', 'Transferred owned property once.');
    } else if (a.type === 'study') {
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
        signature = draft ? compileCMechanic(draft).signature : null;
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
      if (cWalkable(data, p)) base.push(a);
      else
        log(
          'terrain-blocked',
          'Impassable terrain or standing object; find a walkable route.',
        );
    } else if (a.type === 'pickup') {
      const object = data.objects.find((o) => o.id === a.itemId),
        blueprint = data.blueprints.find((b) => b.id === object?.blueprint);
      if (
        object &&
        blueprint?.portable &&
        object.owner === null &&
        object.position?.x === actor.position.x &&
        object.position.y === actor.position.y
      ) {
        effects.set(actor.id, {
          stacks: data.stacks,
          sites: data.sites,
          vital: v,
          memory,
          writes: [`object:${object.id}`],
          objects: data.objects.map((o) =>
            o.id === object.id ? { ...o, owner: actor.id, position: null } : o,
          ),
          detail: 'Collected portable object.',
        });
        log('picked-up', 'Collected portable object.');
        continue;
      }
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
        const effect = executeCoevolution(world, actor, mechanic, a.args);
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
  for (const action of actions) {
    if (
      action.type !== 'move' ||
      feedback.get(action.agentId)?.outcome !== 'moved'
    )
      continue;
    const actor = world.agents.find((a) => a.id === action.agentId);
    if (!actor) continue;
    const saved =
      actionEffort(data, actor, action, false) -
      actionEffort(data, actor, action);
    const object = data.objects
      .filter((o) => o.owner === actor.id)
      .sort(
        (a, b) =>
          (data.blueprints.find((d) => d.id === b.blueprint)?.carryBonus ?? 0) -
          (data.blueprints.find((d) => d.id === a.blueprint)?.carryBonus ?? 0),
      )[0];
    if (saved && object)
      benefits.push({
        tick: moved.tick,
        actor: actor.id,
        object: object.id,
        kind: 'carrying',
        amount: saved,
      });
  }
  const applied = advanceResourceProcesses(
      {
        ...mergeCoevolutionEffects(registered, effects),
        energy,
        messages,
        benefits,
      },
      moved.tick,
    ),
    vitals: Record<string, LearningVital> = {};
  const events: CoevolutionEvent[] = actions.map((action) => {
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
                (after.satiety === 0 ? COEVOLUTION_CONFIG.starvationDamage : 0),
            ),
            satiety: Math.max(
              0,
              after.satiety - COEVOLUTION_CONFIG.satietyLoss,
            ),
          };
    vitals[action.agentId] = next;
    return {
      tick: moved.tick,
      action,
      ...result,
      energyDelta:
        (energy[action.agentId] ?? 0) - (data.energy[action.agentId] ?? 0),
      healthDelta: next.health - before.health,
      satietyDelta: next.satiety - before.satiety,
    };
  });
  return coevolutionSnapshot(
    moved,
    { ...applied, knowledge, vitals, events },
    moved.tick,
  );
}
