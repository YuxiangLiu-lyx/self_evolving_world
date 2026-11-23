import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readDecisionStream } from '../src/responses.js';
const message = (phase: string | undefined, text = '{}') => ({
  type: 'message',
  role: 'assistant',
  status: 'completed',
  ...(phase ? { phase } : {}),
  content: [{ type: 'output_text', text }],
});
const response = (output: unknown[]) =>
  new Response(JSON.stringify({ id: 'fixture', status: 'completed', output }), {
    headers: { 'content-type': 'application/json' },
  });
it('reproduces the actual ex13 commentary plus final query without accepting commentary as an action or losing raw evidence', async () => {
  const retained = JSON.parse(
    readFileSync(
      new URL(
        '../../../experiment/ex13/calls/ordinary-59.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    failureEvidence: string;
    attempt: {
      usage: { inputTokens: number; outputTokens: number };
      status: string;
    };
  };
  expect(retained.attempt.status).toBe('failed');
  expect(retained.attempt.usage).toEqual({
    inputTokens: 6334,
    outputTokens: 275,
  });
  await expect(
    readDecisionStream(
      new Response(retained.failureEvidence, {
        headers: { 'content-type': 'text/event-stream' },
      }),
      undefined,
      100000,
    ),
  ).rejects.toThrow('exactly one');
  let raw = '';
  const result = await readDecisionStream(
    new Response(retained.failureEvidence, {
      headers: { 'content-type': 'text/event-stream' },
    }),
    async (capture) => {
      raw = capture.body;
      await Promise.resolve();
    },
    100000,
    true,
  );
  expect(JSON.parse(result.text) as unknown).toMatchObject({
    result_json: null,
    queries: [{ section: 'abilities' }, { section: 'observed' }],
  });
  expect(result.text).not.toContain('placement failed');
  expect(raw).toContain('placement failed');
});
it('requires one explicit completed final answer and fails closed on missing, mixed or duplicate candidates', async () => {
  for (const output of [
    [message('commentary')],
    [message('final_answer'), message('final_answer')],
    [message('commentary'), message(undefined)],
    [message('analysis'), message('final_answer')],
    [{ ...message('final_answer'), status: 'in_progress' }],
    [
      message('commentary'),
      {
        ...message('final_answer'),
        content: [{ type: 'refusal', refusal: 'No' }],
      },
    ],
  ])
    await expect(
      readDecisionStream(response(output), undefined, 100000, true),
    ).rejects.toThrow();
  expect(
    (
      await readDecisionStream(
        response([message(undefined, '{"queries":[]}')]),
        undefined,
        100000,
        true,
      )
    ).text,
  ).toBe('{"queries":[]}');
  await expect(
    readDecisionStream(
      response([message('commentary'), message('final_answer', '12345')]),
      undefined,
      4,
      true,
    ),
  ).rejects.toThrow('bounded');
});

it('accepts the real empty commentary at round25 only alongside the unique nonempty final answer', async () => {
  const retained = JSON.parse(
    readFileSync(
      new URL(
        '../../../experiment/ex13/calls/ordinary-65.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    failureEvidence: string;
    attempt: {
      status: string;
      usage: { inputTokens: number; outputTokens: number };
    };
  };
  expect(retained.attempt.status).toBe('failed');
  expect(retained.attempt.usage).toEqual({
    inputTokens: 6512,
    outputTokens: 302,
  });
  const result = await readDecisionStream(
    new Response(retained.failureEvidence, {
      headers: { 'content-type': 'text/event-stream' },
    }),
    undefined,
    100000,
    true,
  );
  expect(JSON.parse(result.text) as unknown).toMatchObject({
    queries: [{ section: 'abilities' }],
    result_json: null,
  });
  await expect(
    readDecisionStream(
      response([message('commentary', ''), message('final_answer', '')]),
      undefined,
      100000,
      true,
    ),
  ).rejects.toThrow();
});

it('retains the real interrupted round39 stream as failed unknown usage, never accepting progress events as a decision', async () => {
  const retained = JSON.parse(
    readFileSync(
      new URL(
        '../../../experiment/ex13/calls/ordinary-109.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    failureEvidence: string;
    attempt: { status: string; usage: unknown; reservedTokens: number };
  };
  expect(retained.attempt).toMatchObject({
    status: 'failed',
    usage: null,
    reservedTokens: 43073,
  });
  expect(retained.failureEvidence).toContain('response.in_progress');
  expect(retained.failureEvidence).not.toContain('response.completed');
  let captured = '';
  await expect(
    readDecisionStream(
      new Response(retained.failureEvidence, {
        headers: { 'content-type': 'text/event-stream' },
      }),
      async (evidence) => {
        captured = evidence.body;
        await Promise.resolve();
      },
      100000,
      true,
    ),
  ).rejects.toThrow('without response.completed');
  expect(captured).toBe(retained.failureEvidence);
});

it('keeps the real overloaded response failed with unknown usage and its full reservation', async () => {
  const retained = JSON.parse(
    readFileSync(
      new URL(
        '../../../experiment/ex13/calls/ordinary-123.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    failureEvidence: string;
    attempt: { status: string; usage: unknown; reservedTokens: number };
  };
  expect(retained.attempt).toMatchObject({
    status: 'failed',
    usage: null,
    reservedTokens: 44959,
  });
  expect(retained.failureEvidence).toContain('server_is_overloaded');
  expect(retained.failureEvidence).toContain('348000');
  await expect(
    readDecisionStream(
      new Response(retained.failureEvidence, {
        headers: { 'content-type': 'text/event-stream' },
      }),
      undefined,
      100000,
      true,
    ),
  ).rejects.toThrow('ended with error');
});
