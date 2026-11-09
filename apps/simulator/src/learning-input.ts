import {
  LEARNING_LIMITS,
  LEARNING_RULES,
  learningActions,
  learningData,
  lastLearningFrame,
  visibleEnvironment,
} from '@self-evolving-world/world-core';
import type { LearningRun } from '@self-evolving-world/world-core';

export function ordinaryLearningInput(run: LearningRun, agentId: string) {
  const frame = lastLearningFrame(run),
    data = learningData(frame),
    cursor = run.cursors[agentId];
  const observation = frame.observations.find((o) => o.self.id === agentId);
  if (!cursor || !observation) throw new Error('Missing private actor input.');
  return {
    observation,
    environment: visibleEnvironment(frame, agentId),
    settings: frame.settings,
    rules: LEARNING_RULES,
    vitals: data.vitals[agentId],
    knowledge: data.knowledge[agentId],
    learnedSkills: data.skills.filter((s) =>
      data.knowledge[agentId]?.learned.includes(s.id),
    ),
    publicSkillCatalogue: data.skills,
    recentFeedback: run.frames
      .slice(-6)
      .flatMap(
        (f) =>
          f.learning?.events.filter((e) => e.action.agentId === agentId) ?? [],
      ),
    previousProgram: cursor.active,
    interruption: cursor.interruption,
    remainingRounds: LEARNING_LIMITS.rounds - frame.tick,
    remainingCalls: LEARNING_LIMITS.callsPerAgent - cursor.calls,
    maxPlanRounds: Math.min(4, 18 - frame.tick),
  };
}
export function worldLearningInput(
  run: LearningRun,
  previousFailure: string | null = null,
) {
  const frame = lastLearningFrame(run),
    data = learningData(frame);
  const requests = learningActions(run).filter(
    (a) => a.type === 'learn' && data.vitals[a.agentId]?.health !== 0,
  );
  return {
    tick: frame.tick,
    era: data.environment.era,
    rules: LEARNING_RULES,
    settings: frame.settings,
    environment: data.environment,
    existingSkills: data.skills,
    requests: requests.map((a) => ({
      agentId: a.agentId,
      request: a.type === 'learn' ? a.request : null,
      applicant: ordinaryLearningInput(run, a.agentId),
    })),
    previousFailure,
  };
}
export type OrdinaryLearningInput = ReturnType<typeof ordinaryLearningInput>;
export type WorldLearningInput = ReturnType<typeof worldLearningInput>;
