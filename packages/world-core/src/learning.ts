import {
  createWorld,
  parseWorldAction,
  resolveRound,
  snapshot,
} from './world.js';
import type { WorldAction, WorldSetup, WorldState } from './world.js';
import type {
  Knowledge,
  LearningAction,
  LearningData,
  LearningEvent,
  LearningRound,
  LearningVital,
  SkillSpec,
  WorldReview,
} from './learning-types.js';
import { parseEnvironment, walkable } from './learning-environment.js';
import { executeSkill } from './skill-execution.js';
import type { SkillEffect } from './skill-execution.js';
import {
  boundedText,
  compileSkill,
  dataObject,
  exactKeys,
  freeze,
  list,
  parseCapability,
  parseWorldReview,
} from './skill-code.js';

export const LEARNING_RULES = freeze({
  version: 'learning-v1',
  initialHealth: 100,
  initialSatiety: 15,
  cap: 100,
  satietyLoss: 3,
  starvationDamage: 10,
  settlement: 'actions, zero-satiety damage, then satiety loss',
  maxSkillStatements: 4,
});
export function createLearningWorld(
  setup: WorldSetup,
  environment: unknown,
): WorldState {
  const world = createWorld(setup);
  if (!world.agents.length)
    throw new RangeError('Learning requires at least one actor.');
  return freeze({
    ...world,
    learning: {
      version: 'learning-v1',
      environment: parseEnvironment(environment, world),
      skills: [],
      knowledge: Object.fromEntries(
        world.agents.map((a) => [a.id, { learned: [], pending: null }]),
      ),
      vitals: Object.fromEntries(
        world.agents.map((a) => [
          a.id,
          { health: 100, satiety: 15, cold: 0, heat: 0 },
        ]),
      ),
      events: [],
    },
  });
}
export function parseLearningAction(input: unknown): LearningAction {
  const a = dataObject(input),
    agentId = boundedText(a.agentId, 80);
  switch (a.type) {
    case 'move':
      exactKeys(a, ['type', 'agentId', 'direction']);
      return parseWorldAction(a) as Extract<LearningAction, { type: 'move' }>;
    case 'pickup':
      exactKeys(a, ['type', 'agentId', 'itemId']);
      return parseWorldAction(a) as Extract<LearningAction, { type: 'pickup' }>;
    case 'wait':
    case 'study':
      exactKeys(a, ['type', 'agentId']);
      return freeze({ type: a.type, agentId });
    case 'learn':
      exactKeys(a, ['type', 'agentId', 'request']);
      return freeze({
        type: 'learn',
        agentId,
        request: parseCapability(a.request),
      });
    case 'use': {
      exactKeys(a, ['type', 'agentId', 'skillId', 'args']);
      const args = dataObject(a.args);
      if (
        Object.keys(args).length > 4 ||
        Object.keys(args).some((k) => !/^[a-z][a-z0-9_]{0,23}$/.test(k))
      )
        throw new RangeError('Invalid skill arguments.');
      return freeze({
        type: 'use',
        agentId,
        skillId: boundedText(a.skillId, 80),
        args: Object.fromEntries(
          Object.entries(args).map(([k, v]) => [k, boundedText(v, 80)]),
        ),
      });
    }
    default:
      throw new RangeError('Unknown learning-v1 action.');
  }
}
export function parseLearningRound(input: unknown): LearningRound {
  const r = dataObject(input);
  exactKeys(r, ['actions', 'reviews']);
  return freeze({
    actions: list(r.actions, 32).map(parseLearningAction),
    reviews: list(r.reviews, 32).map(parseWorldReview),
  });
}
export function learningData(world: WorldState): LearningData {
  if (!world.learning) throw new RangeError('Missing learning-v1 extension.');
  return world.learning;
}
function settled(v: LearningVital): LearningVital {
  if (v.health === 0) return v;
  return freeze({
    ...v,
    health: Math.max(0, v.health - (v.satiety === 0 ? 10 : 0)),
    satiety: Math.max(0, v.satiety - 3),
  });
}
/** Validate/register the complete batch before any world action or game-time advancement. */
export function reviewedSkills(
  world: WorldState,
  actions: readonly LearningAction[],
  inputs: readonly WorldReview[],
) {
  const data = learningData(world),
    reviews = inputs.map(parseWorldReview);
  const requests = actions.filter(
    (a) =>
      a.type === 'learn' &&
      data.vitals[a.agentId]?.health !== 0 &&
      !data.knowledge[a.agentId]?.pending,
  );
  if (
    reviews.length !== requests.length ||
    new Set(reviews.map((r) => r.agentId)).size !== reviews.length ||
    reviews.some((r) => !requests.some((a) => a.agentId === r.agentId))
  )
    throw new RangeError(
      'Resolve exactly every living learning request before advancing the world.',
    );
  const skills: SkillSpec[] = [...data.skills];
  const byActor = new Map<
    string,
    { review: WorldReview; skill: SkillSpec | null; reused: boolean }
  >();
  for (const review of reviews) {
    let skill: SkillSpec | null = null,
      reused = review.decision === 'reuse';
    if (review.decision === 'create') {
      const candidate = compileSkill(
        review.specification,
        `skill-${String(skills.length + 1)}`,
        review.learningRounds,
      );
      const equivalent = skills.find(
        (s) => s.signature === candidate.signature,
      );
      reused = equivalent !== undefined;
      skill = equivalent ?? candidate;
      if (!equivalent) skills.push(candidate);
    } else if (review.decision === 'reuse') {
      skill = data.skills.find((s) => s.id === review.skillId) ?? null;
      if (!skill)
        throw new RangeError('Reuse must identify an existing implementation.');
    }
    byActor.set(review.agentId, { review, skill, reused });
  }
  return { skills: freeze(skills), byActor };
}
export function stepLearningRound(
  world: WorldState,
  input: LearningRound,
): WorldState {
  const data = learningData(world),
    round = parseLearningRound(input),
    { actions, reviews } = round;
  if (
    actions.length !== world.agents.length ||
    new Set(actions.map((a) => a.agentId)).size !== actions.length ||
    actions.some((a) => !world.agents.some((actor) => actor.id === a.agentId))
  )
    throw new RangeError('One intent per known actor is required.');
  const registry = reviewedSkills(world, actions, reviews);
  const base: WorldAction[] = [],
    details = new Map<
      string,
      { outcome: string; detail: string; skillId: string | null }
    >();
  const effects = new Map<string, SkillEffect>();
  const knowledge: Record<string, Knowledge> = { ...data.knowledge };
  const delta = {
    north: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    south: { x: 0, y: 1 },
    west: { x: -1, y: 0 },
  };
  for (const actor of world.agents) {
    const a = actions.find((a) => a.agentId === actor.id),
      v = data.vitals[actor.id],
      k = data.knowledge[actor.id];
    if (!a || !v || !k)
      throw new RangeError('Incomplete learning actor state.');
    const feedback = (
      outcome: string,
      detail: string,
      skillId: string | null = null,
    ) => details.set(actor.id, { outcome, detail, skillId });
    if (v.health === 0) {
      feedback('dead', 'Death is irreversible.');
      continue;
    }
    if (a.type === 'study' || a.type === 'learn') {
      if (a.type === 'study') {
        if (!k.pending) {
          feedback('study-failed', 'No learning is in progress.');
          continue;
        }
        const p = { ...k.pending, completed: k.pending.completed + 1 };
        const finished = p.completed === p.total;
        knowledge[actor.id] = {
          learned: finished ? [...k.learned, p.skillId] : k.learned,
          pending: finished ? null : p,
        };
        feedback(
          finished ? 'learned' : 'studying',
          `${String(p.completed)}/${String(p.total)} learning rounds; availability begins in the next round after completion.`,
          p.skillId,
        );
      } else {
        if (k.pending) {
          feedback(
            'learning-failed',
            'Finish the current learning before requesting another.',
          );
          continue;
        }
        const approved = registry.byActor.get(actor.id);
        if (!approved) throw new RangeError('Pending World Agent review.');
        const { review, skill, reused } = approved;
        if (!skill) {
          feedback('learning-rejected', review.reason);
          continue;
        }
        if (k.learned.includes(skill.id)) {
          feedback('already-learned', review.reason, skill.id);
          continue;
        }
        const finished = review.learningRounds === 1;
        knowledge[actor.id] = {
          learned: finished ? [...k.learned, skill.id] : k.learned,
          pending: finished
            ? null
            : { skillId: skill.id, total: review.learningRounds, completed: 1 },
        };
        feedback(
          finished ? 'learned' : 'studying',
          `${reused ? 'Reused' : 'Registered'} ${skill.id}; 1/${String(review.learningRounds)} learning rounds. ${review.reason}`,
          skill.id,
        );
      }
    } else if (a.type === 'move') {
      const d = delta[a.direction],
        target = { x: actor.position.x + d.x, y: actor.position.y + d.y };
      if (!walkable(data.environment, target))
        feedback(
          'terrain-blocked',
          'Deep water and standing objects are impassable; use a shallow crossing or walk around.',
        );
      else base.push(a);
    } else if (a.type === 'pickup') base.push(a);
    else if (a.type === 'use') {
      const skill = data.skills.find((s) => s.id === a.skillId);
      if (!skill || !k.learned.includes(skill.id)) {
        feedback(
          'use-failed',
          'The world implementation and this actor proficiency are both required.',
          a.skillId,
        );
        continue;
      }
      try {
        effects.set(
          actor.id,
          executeSkill(
            skill,
            a.args,
            actor,
            v,
            data.environment,
            world.tick + 1,
          ),
        );
        feedback('used', `${skill.name}: ${skill.effects.join(' ')}`, skill.id);
      } catch (error) {
        feedback(
          'use-failed',
          error instanceof Error ? error.message : 'Skill failed.',
          skill.id,
        );
      }
    } else feedback('waited', 'Waited one round.');
  }
  // Reject all conflicting resource transactions; ordering never awards a shared object to one actor.
  const writes = new Map<string, number>();
  for (const effect of effects.values())
    for (const id of effect.writes) writes.set(id, (writes.get(id) ?? 0) + 1);
  for (const [actor, effect] of effects)
    if (effect.writes.some((id) => (writes.get(id) ?? 0) > 1)) {
      effects.delete(actor);
      details.set(actor, {
        outcome: 'resource-conflict',
        detail:
          'Competing resource transactions were all rejected without consumption.',
        skillId: details.get(actor)?.skillId ?? null,
      });
    }
  const moved = resolveRound(world, base);
  for (const event of moved.events ?? [])
    details.set(event.action.agentId, {
      outcome: event.outcome,
      detail: event.outcome,
      skillId: null,
    });
  const resources = new Map(data.environment.resources.map((r) => [r.id, r])),
    objects = new Map(data.environment.objects.map((o) => [o.id, o]));
  for (const effect of effects.values()) {
    for (const r of effect.environment.resources)
      if (effect.writes.includes(r.id)) resources.set(r.id, r);
    for (const o of effect.environment.objects)
      if (effect.writes.includes(o.id)) objects.set(o.id, o);
  }
  const agents = moved.agents.map((a) => effects.get(a.id)?.agent ?? a);
  const vitals: Record<string, LearningVital> = {};
  const events: LearningEvent[] = world.agents.map((a) => {
    const initial = data.vitals[a.id],
      action = actions.find((v) => v.agentId === a.id),
      feedback = details.get(a.id);
    if (!initial || !action || !feedback)
      throw new RangeError('Missing committed action feedback.');
    const next = settled(effects.get(a.id)?.vital ?? initial);
    vitals[a.id] = next;
    return {
      tick: moved.tick,
      action,
      ...feedback,
      healthDelta: next.health - initial.health,
      satietyDelta: next.satiety - initial.satiety,
    };
  });
  const next = snapshot(moved.tick, world.settings, agents, moved.items, null);
  return freeze({
    ...next,
    events: moved.events ?? [],
    learning: {
      ...data,
      skills: registry.skills,
      knowledge,
      vitals,
      events,
      environment: {
        ...data.environment,
        resources: [...resources.values()],
        objects: [...objects.values()],
      },
    },
  });
}
export function replayLearning(
  initial: WorldState,
  records: unknown,
): readonly WorldState[] {
  const frames = [initial];
  for (const input of list(records, 60)) {
    const current = frames.at(-1);
    if (!current) throw new RangeError('Missing replay state.');
    frames.push(stepLearningRound(current, parseLearningRound(input)));
  }
  return freeze(frames);
}
