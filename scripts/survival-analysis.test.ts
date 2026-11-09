import { describe, expect, it } from 'vitest';
import {
  runSurvivalPrograms,
  SURVIVAL_OBJECTIVE,
} from '../apps/simulator/src/survival-run.js';
import { parseReplay, serializeReplay } from '../apps/viewer/src/timeline.js';
import { measureSurvival, modelCallArchive } from './survival-analysis.js';

async function fixture() {
  let count = 0;
  const { run, attempts } = await runSurvivalPrograms(
    () =>
      Promise.resolve({
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
      }),
    () => Promise.resolve(),
  );
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
  it('round-trips code and vital history and independently measures calls and denials without inference', async () => {
    const f = await fixture();
    const parsed = parseReplay(JSON.stringify(f.replay));
    expect(parsed.frames).toEqual(f.run.frames);
    expect(parsed.programs).toEqual(f.run.programs);
    const measurement = measureSurvival(
      'ex3',
      SURVIVAL_OBJECTIVE,
      f.replay,
      f.ledger,
    );
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
  it('rejects altered private observations, response code, attempt counts and incomplete HTTP evidence', async () => {
    const f = await fixture();
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
        measureSurvival('ex3', SURVIVAL_OBJECTIVE, f.replay, ledger),
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
        measureSurvival('ex3', SURVIVAL_OBJECTIVE, f.replay, {
          ...f.ledger,
          attempts: [attempt, ...f.ledger.attempts.slice(1)],
        }),
      ).toThrow();
  });
});
