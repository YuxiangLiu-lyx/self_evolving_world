import { describe, expect, it } from 'vitest';
import {
  acceptLearningProgram,
  advanceLearningRound,
  createLearningRun,
  lastLearningFrame,
  learningActions,
  learningData,
  pendingLearningPrograms,
  LEARNING_LIMITS,
} from '@self-evolving-world/world-core';
import type { WorldReview } from '@self-evolving-world/world-core';
import { initialLearningWorld } from '../apps/simulator/src/learning-scenario.js';
import {
  parseOrdinaryLearning,
  parseWorldLearning,
} from '../apps/simulator/src/learning-run.js';
import type {
  LearningAttempt,
  LearningExecution,
} from '../apps/simulator/src/learning-run.js';
import type { ProgramResponse } from '../apps/simulator/src/survival-run.js';
import {
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
function completed(value: object, id: number): ProgramResponse {
  return {
    decision: {
      text: JSON.stringify(value),
      responseId: `fixture-${String(id)}`,
      responseFormat: 'sse',
    },
    http: { status: 200, requestId: null, contentType: 'text/event-stream' },
  };
}
/** Builds a synthetic completed ledger offline; it never contacts a model. */
function simulation(): LearningExecution {
  let run = createLearningRun(initialLearningWorld()),
    calls = 0;
  const attempts: LearningAttempt[] = [];
  while (lastLearningFrame(run).tick < LEARNING_LIMITS.rounds) {
    const tick = lastLearningFrame(run).tick;
    for (const actor of pendingLearningPrograms(run)) {
      const input = ordinaryLearningInput(run, actor),
        call = (run.cursors[actor]?.calls ?? 0) + 1;
      const response = completed(
        {
          code:
            tick === 0
              ? `learn(${JSON.stringify(request)});`
              : tick === 1
                ? `move("east",1); pickup("${actor}-fruit"); use("skill-1",{"food":"${actor}-fruit"});`
                : `wait(${String(Math.min(3, input.remainingRounds))});`,
          summary: 'Offline fixture: request, acquire, consume, then wait.',
        },
        ++calls,
      );
      attempts.push({
        role: 'ordinary',
        actor,
        tick,
        call,
        input,
        status: 'accepted',
        response,
      });
      run = acceptLearningProgram(run, {
        agentId: actor,
        tick,
        call,
        ...parseOrdinaryLearning(response.decision.text, actor, tick),
      });
    }
    let reviews: readonly WorldReview[] = [];
    if (
      learningActions(run).some(
        (a) =>
          a.type === 'learn' &&
          learningData(lastLearningFrame(run)).vitals[a.agentId]?.health !== 0,
      )
    ) {
      const input = worldLearningInput(run);
      const response = completed(
        {
          needsDevelopment: false,
          reviews: input.requests.map((r) => ({
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
        },
        ++calls,
      );
      reviews = parseWorldLearning(response.decision.text).reviews;
      attempts.push({
        role: 'world',
        actor: 'world',
        tick,
        call: attempts.filter((a) => a.role === 'world').length + 1,
        input,
        status: 'accepted',
        response,
      });
    }
    run = advanceLearningRound(run, reviews);
  }
  return {
    version: 1,
    controller: 'simulated-test',
    model: 'offline-fixture',
    programs: run.programs,
    rounds: run.rounds,
    attempts,
    developments: [],
    phase: 'completed',
    barrier: null,
  };
}
describe('learning archive evidence', () => {
  it('reconstructs real effects from synthetic decisions and rejects wrong input, reviews, provenance and templates', () => {
    const simulated = simulation(),
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
