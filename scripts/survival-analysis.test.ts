import { describe, expect, it } from 'vitest';
import {
  acceptProgram,
  advanceProgramRound,
  createProgramRun,
  pendingPrograms,
  PROGRAM_LIMITS,
} from '@self-evolving-world/world-core';
import {
  initialSurvivalWorld,
  programDecision,
  programInput,
} from '../apps/simulator/src/survival-run.js';
import type {
  ModelAttempt,
  ProgramResponse,
} from '../apps/simulator/src/survival-run.js';
import { parseReplay, serializeReplay } from '../apps/viewer/src/timeline.js';
import { measureSurvival, modelCallArchive } from './survival-analysis.js';

const OBJECTIVE = 'Offline fixture for survival archive validation only.';
/** Builds a synthetic completed ledger offline; it never contacts a model. */
function fixture() {
  let run = createProgramRun(initialSurvivalWorld()),
    count = 0;
  const attempts: ModelAttempt[] = [];
  while (run.frames.length <= PROGRAM_LIMITS.rounds) {
    for (const agentId of pendingPrograms(run)) {
      const input = programInput(run, agentId),
        tick = input.observation.tick,
        call = (run.cursors[agentId]?.calls ?? 0) + 1;
      const response: ProgramResponse = {
        decision: {
          responseId: `fixture_${String(++count)}`,
          responseFormat: 'sse',
          text: JSON.stringify({
            code: 'learn("shelter"); wait(59);',
            summary: 'Exercise denial and survive the mild protocol.',
          }),
        },
        http: {
          status: 200,
          requestId: null,
          contentType: 'text/event-stream',
        },
      };
      const decision = programDecision(
        response.decision.text,
        agentId,
        input.remainingRounds,
      );
      attempts.push({
        agentId,
        tick,
        call,
        input,
        status: 'accepted',
        response,
      });
      run = acceptProgram(run, { agentId, tick, call, ...decision });
    }
    run = advanceProgramRound(run);
  }
  const replay = JSON.parse(
    serializeReplay({
      schedule: 'survival-v1',
      frames: run.frames,
      programs: run.programs,
    }),
  ) as unknown;
  return { run, replay, ledger: modelCallArchive('fixture-model', attempts) };
}
describe('model experiment evidence reconstruction', () => {
  it('round-trips code and vital history and independently measures calls and denials without inference', () => {
    const f = fixture();
    const parsed = parseReplay(JSON.stringify(f.replay));
    expect(parsed.frames).toEqual(f.run.frames);
    expect(parsed.programs).toEqual(f.run.programs);
    const measurement = measureSurvival('ex3', OBJECTIVE, f.replay, f.ledger);
    expect(measurement.results).toMatchObject({
      externalModelCalls: 3,
      survivors: 3,
      learningRequests: 3,
      invariantFailures: 0,
    });
    expect(
      measurement.results.agents.every(
        (a) => a.modelRounds === 60 && a.fallbackRounds === 0,
      ),
    ).toBe(true);
  });
  it('rejects altered private observations, response code, attempt counts and incomplete HTTP evidence', () => {
    const f = fixture();
    for (const mutate of [
      (ledger: Record<string, unknown>) => {
        ledger.attempts = [];
      },
      (ledger: Record<string, unknown>) => {
        ledger.endpoint = 'https://other.invalid';
      },
    ]) {
      const ledger = structuredClone(f.ledger);
      mutate(ledger);
      expect(() =>
        measureSurvival('ex3', OBJECTIVE, f.replay, ledger),
      ).toThrow();
    }
    const first = f.ledger.attempts[0];
    if (!first?.response) throw new Error('Missing fixture evidence.');
    const changed = [
      {
        ...first,
        input: { ...first.input, vitals: { ...first.input.vitals, health: 1 } },
      },
      {
        ...first,
        response: {
          ...first.response,
          decision: {
            ...first.response.decision,
            text: JSON.stringify({
              code: 'wait(60);',
              summary: 'Different code.',
            }),
          },
        },
      },
      {
        ...first,
        response: {
          ...first.response,
          http: { ...first.response.http, status: 429 },
        },
      },
      { ...first, status: 'started' },
    ];
    for (const attempt of changed)
      expect(() =>
        measureSurvival('ex3', OBJECTIVE, f.replay, {
          ...f.ledger,
          attempts: [attempt, ...f.ledger.attempts.slice(1)],
        }),
      ).toThrow();
  });
});
