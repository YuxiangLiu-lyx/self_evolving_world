import { describe, expect, it } from 'vitest';
import { runSurvivalPrograms, programDecision } from '../src/survival-run.js';
import type { ProgramResponse } from '../src/survival-run.js';
import { programProvider, programRequest } from '../src/program-provider.js';

function response(
  id: number,
  code = 'learn("shelter"); wait(11);',
): ProgramResponse {
  return {
    decision: {
      text: JSON.stringify({
        code,
        summary: 'Request shelter and remain in the mild climate.',
      }),
      responseId: `resp_${String(id)}`,
      responseFormat: 'sse',
    },
    http: {
      status: 200,
      requestId: `req_${String(id)}`,
      contentType: 'text/event-stream',
    },
  };
}
describe('survival model orchestration', () => {
  it('persists each attempt before inference, reuses the same world snapshot and obeys five calls per actor', async () => {
    let count = 0,
      persisted = 0;
    const observedTicks: number[] = [];
    const { run, attempts } = await runSurvivalPrograms(
      (input) => {
        expect(persisted).toBe(count + 1);
        expect(input.observation.agents.every((a) => !('inventory' in a))).toBe(
          true,
        );
        expect(Object.keys(input.vitals)).toEqual([
          'satiety',
          'cold',
          'heat',
          'health',
        ]);
        observedTicks.push(input.observation.tick);
        return Promise.resolve(response(++count));
      },
      (attempts) => {
        persisted = attempts.length;
        return Promise.resolve();
      },
    );
    expect(count).toBe(15);
    expect(observedTicks).toEqual([
      0, 0, 0, 12, 12, 12, 24, 24, 24, 36, 36, 36, 48, 48, 48,
    ]);
    expect(attempts.every((a) => a.status === 'accepted')).toBe(true);
    expect(run.frames).toHaveLength(61);
    expect(
      run.frames[1]?.survival?.events.every(
        (e) => e.outcome === 'learning-denied',
      ),
    ).toBe(true);
  });
  it('retains rejected output and transport failures without hidden retries or fake model actions', async () => {
    let count = 0;
    const { run, attempts } = await runSurvivalPrograms(
      () => {
        count++;
        if (count % 2)
          return Promise.reject(new Error('HTTP 429: plan usage limit.'));
        return Promise.resolve(response(count, 'process.exit();'));
      },
      () => Promise.resolve(),
    );
    expect(count).toBe(15);
    expect(attempts.filter((a) => a.status === 'failed')).toHaveLength(8);
    expect(attempts.filter((a) => a.status === 'rejected')).toHaveLength(7);
    expect(run.programs.every((p) => p.code === null)).toBe(true);
    expect(run.frames.at(-1)?.tick).toBe(60);
  });
  it('will not invoke the provider if pre-request persistence fails', async () => {
    let count = 0;
    await expect(
      runSurvivalPrograms(
        () => {
          count++;
          return Promise.resolve(response(count));
        },
        () => Promise.reject(new Error('disk full')),
      ),
    ).rejects.toThrow('disk full');
    expect(count).toBe(0);
  });
  it('accepts only bounded exact decision fields', () => {
    expect(() =>
      programDecision(
        '{"code":"wait(2);","summary":"Wait.","agentId":"sol"}',
        'lin',
        60,
      ),
    ).toThrow();
    expect(() =>
      programDecision('{"code":"wait(2);","summary":"Wait."}', 'lin', 1),
    ).toThrow();
  });
  it('uses direct plan Responses with streaming completion and redacts credentials from failures', async () => {
    let captured: RequestInit | undefined;
    await runSurvivalPrograms(
      async (input) => {
        const request = programRequest('model', input);
        expect(request).toMatchObject({ store: false, stream: true });
        const provider = programProvider(
          'private-token',
          'model',
          (_url, init) => {
            captured = init;
            return Promise.resolve(
              new Response(
                `data: ${JSON.stringify({ type: 'response.completed', response: { id: 'resp_test', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ code: `wait(${String(input.remainingRounds)});`, summary: 'Stay alive.' }) }] }] } })}\n\n`,
                { headers: { 'content-type': 'text/event-stream' } },
              ),
            );
          },
        );
        const result = await provider(input);
        expect(result.decision.responseId).toBe('resp_test');
        expect(captured?.body).toBe(JSON.stringify(request));
        await expect(
          programProvider('private-token', 'model', () =>
            Promise.reject(new Error('private-token')),
          )(input),
        ).rejects.toThrow('[REDACTED]');
        return result;
      },
      () => Promise.resolve(),
    );
  });
});
