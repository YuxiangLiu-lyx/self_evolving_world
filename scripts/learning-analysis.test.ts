import { describe, expect, it } from 'vitest';
import {
  continueLearningExecution,
  newLearningExecution,
} from '../apps/simulator/src/learning-run.js';
import type {
  ordinaryLearningInput,
  worldLearningInput,
} from '../apps/simulator/src/learning-input.js';
import {
  auditLearning,
  learningCallArchive,
  measureLearning,
  readLearningExecution,
} from './learning-analysis.js';
import { parseReplay, serializeReplay } from '../apps/viewer/src/timeline.js';

const request = {
  name: 'Nourishment',
  purpose: 'Consume owned edible resources to recover satiety',
  target: 'An owned edible unit',
  conditions: 'Owned food with positive quantity',
  expectedEffect: 'Spend the resource and apply nutrition and toxicity',
};
async function simulation() {
  let calls = 0;
  return continueLearningExecution(
    newLearningExecution('offline-fixture', 'simulated-test'),
    (role, input) => {
      calls++;
      const world = input as ReturnType<typeof worldLearningInput>,
        actor = input as ReturnType<typeof ordinaryLearningInput>;
      const result =
        role === 'world'
          ? {
              needsDevelopment: false,
              reviews: world.requests.map((r) => ({
                agentId: r.agentId,
                decision: 'create',
                reason: 'One round to learn direct consumption.',
                prerequisites: ['Owned edible food'],
                learningRounds: 1,
                skillId: null,
                specification: {
                  name: 'Nourish',
                  description: 'Consume a finite owned food unit.',
                  parameters: ['food'],
                  code: 'consume("food",1);',
                },
              })),
            }
          : {
              code:
                actor.observation.tick === 0
                  ? `learn(${JSON.stringify(request)});`
                  : actor.observation.tick === 1
                    ? `move("east",1); pickup("${actor.observation.self.id}-fruit"); use("skill-1",{"food":"${actor.observation.self.id}-fruit"});`
                    : `wait(${String(Math.min(3, actor.remainingRounds))});`,
              summary: 'Offline fixture: request, acquire, consume, then wait.',
            };
      return Promise.resolve({
        decision: {
          text: JSON.stringify(result),
          responseId: `fixture-${String(calls)}`,
          responseFormat: 'sse',
        },
        http: {
          status: 200,
          requestId: null,
          contentType: 'text/event-stream',
        },
      });
    },
    () => Promise.resolve(),
  );
}
describe('learning archive evidence', () => {
  it('reconstructs real effects from synthetic decisions and rejects wrong input, reviews, provenance and templates', async () => {
    const simulated = await simulation(),
      run = auditLearning(simulated);
    expect(run.frames.at(-1)?.learning?.skills).toHaveLength(1);
    expect(
      run.frames
        .flatMap((f) => f.learning?.events ?? [])
        .filter((e) => e.outcome === 'used'),
    ).toHaveLength(3);
    const source = serializeReplay({
      schedule: 'learning-v1',
      frames: run.frames,
      learningPrograms: run.programs,
      learningRounds: run.rounds,
    });
    expect(parseReplay(source).frames).toEqual(run.frames);
    expect(() =>
      measureLearning(
        'ex99',
        'Offline fixture for archive validation only.',
        simulated,
        learningCallArchive(simulated),
      ),
    ).toThrow('real-model');
    // An explicit synthetic fixture exercises the live-record schema; it is never written as an experiment.
    const fixture = { ...simulated, controller: 'chatgpt-plan' as const };
    const measured = measureLearning(
      'ex99',
      'Offline fixture for archive validation only.',
      fixture,
      learningCallArchive(fixture),
    );
    expect(measured.results.goals).toEqual({
      realWorldReview: true,
      generatedSkillExecuted: true,
      survivedBeyondIdle: true,
    });
    expect(measured.results.control).toMatchObject({
      deathRound: 15,
      healthRound5: 100,
      healthRound6: 90,
    });
    expect(() =>
      auditLearning({
        ...simulated,
        attempts: simulated.attempts.map((a, i) =>
          i ? a : { ...a, input: { ...a.input, remainingCalls: 999 } },
        ),
      }),
    ).toThrow('input');
    expect(() =>
      auditLearning({
        ...simulated,
        rounds: simulated.rounds.map((r, i) => (i ? r : { ...r, reviews: [] })),
      }),
    ).toThrow('bypassed');
    expect(() =>
      readLearningExecution({
        ...simulated,
        rounds: simulated.rounds.slice(0, 2),
        programs: simulated.programs.filter((p) => p.tick < 2),
      }),
    ).toThrow('premature');
    expect(() =>
      measureLearning(
        'ex99',
        'Offline fixture for archive validation only.',
        fixture,
        { ...learningCallArchive(fixture), funding: 'unverified' },
      ),
    ).toThrow('template');
  });
});
