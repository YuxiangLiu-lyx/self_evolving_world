import { describe, expect, it, vi } from 'vitest';
import { parseReplay, serializeReplay } from '../../viewer/src/timeline.js';
import { DEMO_SETUP } from '../../viewer/src/scenario.js';
import { createWorld } from '@self-evolving-world/world-core';
import {
  experimentWorld,
  parseDecision,
  runOneRound,
} from '../src/experiment.js';
import type { DecisionInput } from '../src/experiment.js';
import {
  decisionRequest,
  readDecisionStream,
  responsesProvider,
  selectModel,
  type ResponseEvidence,
} from '../src/responses.js';

const choice = (direction = 'east') =>
  JSON.stringify({
    action: { type: 'move', direction },
    summary: 'Move toward the visible item.',
  });
const completed = (text = choice()) => ({
  type: 'response.completed',
  response: {
    id: 'resp_fixture',
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      },
    ],
  },
});
function stream(events: readonly unknown[], chunkSize = 7): Response {
  const source = events
    .map((event) => `event: fixture\r\ndata: ${JSON.stringify(event)}\r\n\r\n`)
    .join('');
  const bytes = new TextEncoder().encode(source);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < bytes.length; index += chunkSize)
          controller.enqueue(bytes.slice(index, index + chunkSize));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('single-round model experiment', () => {
  it('preserves the founding scenario and exposes only each initial observation', async () => {
    expect(experimentWorld()).toEqual(createWorld(DEMO_SETUP));
    const inputs: DecisionInput[] = [];
    const result = await runOneRound((input) => {
      inputs.push(input);
      return Promise.resolve({ text: choice(), responseId: 'fixture' });
    });
    expect(inputs.map((input) => input.observation.self.id)).toEqual([
      'lin',
      'moss',
      'sol',
    ]);
    expect(inputs.map((input) => input.observation.tick)).toEqual([0, 0, 0]);
    expect(
      inputs.map((input) => input.observation.items.map((item) => item.id)),
    ).toEqual([['wood', 'stone'], ['berry'], ['crystal']]);
    expect(
      inputs.every(
        (input) =>
          Object.keys(input).sort().join() === 'observation,rules,settings',
      ),
    ).toBe(true);
    expect(result.finalState.tick).toBe(3);
    expect(result.replay.actions.map((action) => action.agentId)).toEqual([
      'lin',
      'moss',
      'sol',
    ]);
    const timeline = parseReplay(JSON.stringify(result.replay));
    expect(timeline.frames.at(-1)).toEqual(result.finalState);
    expect(JSON.parse(serializeReplay(timeline)) as unknown).toEqual(
      result.replay,
    );
  });
  it('never retries failed providers or malformed decisions and records partial outcomes', async () => {
    const provider = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fixture network failure'))
      .mockResolvedValueOnce({
        text: JSON.stringify({
          action: { type: 'move', direction: 'east', agentId: 'lin' },
          summary: 'Attempt another actor.',
        }),
        responseId: 'fixture-bad',
      })
      .mockResolvedValueOnce({
        text: choice('west'),
        responseId: 'fixture-good',
      });
    const result = await runOneRound(provider);
    expect(provider).toHaveBeenCalledTimes(3);
    expect(result.decisions.map((decision) => decision.status)).toEqual([
      'failed',
      'failed',
      'applied',
    ]);
    expect(result.replay.actions).toEqual([
      { type: 'move', agentId: 'sol', direction: 'west' },
    ]);
    expect(result.finalState.tick).toBe(1);
  });
  it('binds actor identity locally and preserves record-only tries', async () => {
    expect(() =>
      parseDecision(
        JSON.stringify({
          action: { type: 'move', direction: 'east', agentId: 'moss' },
          summary: 'Unauthorized actor.',
        }),
        'lin',
      ),
    ).toThrow('fields');
    const result = await runOneRound(() =>
      Promise.resolve({
        text: JSON.stringify({
          action: { type: 'try', skill: 'fly' },
          summary: 'Record a flight request.',
        }),
        responseId: 'fixture',
      }),
    );
    expect(result.decisions.map((decision) => decision.outcome)).toEqual([
      'skill-unavailable',
      'skill-unavailable',
      'skill-unavailable',
    ]);
    expect(result.finalState.agents).toEqual(experimentWorld().agents);
    expect(result.finalState.rules).toEqual(experimentWorld().rules);
  });
  it('makes precisely three Responses requests without tools, storage, continuation or retries', async () => {
    const requests: object[] = [];
    const transport: typeof fetch = (url, init) => {
      expect(url).toBe('https://api.openai.com/v1/responses');
      expect(init?.redirect).toBe('error');
      if (typeof init?.body !== 'string')
        throw new Error('Expected a JSON request body.');
      requests.push(JSON.parse(init.body) as object);
      return Promise.resolve(stream([completed()]));
    };
    await runOneRound(
      responsesProvider('fixture-token', 'fixture-model', transport),
    );
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request).toMatchObject({
        model: 'fixture-model',
        store: false,
        stream: true,
      });
      for (const field of [
        'tools',
        'previous_response_id',
        'temperature',
        'max_output_tokens',
      ])
        expect(request).not.toHaveProperty(field);
      expect(JSON.stringify(request)).not.toContain('fixture-token');
    }
    const first = experimentWorld().observations[0];
    if (!first) throw new Error('Missing fixture observation.');
    expect(
      decisionRequest('fixture-model', {
        observation: first,
        settings: experimentWorld().settings,
        rules: experimentWorld().rules,
      }),
    ).not.toHaveProperty('tools');
  });
});

describe('Responses terminal event handling', () => {
  it('handles split CRLF frames and UTF-8 while waiting for a completed response', async () => {
    const text = JSON.stringify({
      action: { type: 'try', skill: '\u98de\u884c' },
      summary: 'Preserve imported Unicode.',
    });
    const result = await readDecisionStream(
      stream(
        [
          { type: 'response.output_text.delta', delta: 'untrusted partial' },
          completed(text),
        ],
        1,
      ),
    );
    expect(result).toEqual({
      text,
      responseId: 'resp_fixture',
      responseFormat: 'sse',
    });
  });
  it('accepts only a completed JSON response when the server returns JSON', async () => {
    expect(
      await readDecisionStream(Response.json(completed().response)),
    ).toEqual({
      text: choice(),
      responseId: 'resp_fixture',
      responseFormat: 'json',
    });
    for (const status of ['incomplete', 'failed', 'in_progress']) {
      await expect(
        readDecisionStream(Response.json({ ...completed().response, status })),
      ).rejects.toThrow('Invalid completed response');
    }
    await expect(
      readDecisionStream(
        new Response('<html>Unexpected page</html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    ).rejects.toThrow('Unsupported Responses content type: text/html');
  });
  it.each(['json', 'sse'] as const)(
    'validates completed %s when Content-Type is missing',
    async (format) => {
      const response =
        format === 'json'
          ? Response.json(completed().response)
          : stream([completed()], 1);
      response.headers.delete('Content-Type');
      expect(await readDecisionStream(response)).toEqual({
        text: choice(),
        responseId: 'resp_fixture',
        responseFormat: format,
      });
    },
  );
  it('retains a bounded response for offline parsing without another inference request', async () => {
    const response = stream([completed()], 1);
    response.headers.delete('Content-Type');
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const evidence: ResponseEvidence[] = [];
    const provider = responsesProvider(
      'fixture-secret',
      'fixture-model',
      transport,
      (_input, capture) => {
        evidence.push(capture);
        return Promise.resolve();
      },
    );
    const world = experimentWorld();
    const observation = world.observations[0];
    if (!observation) throw new Error('Missing fixture observation.');
    const decision = await provider({
      observation,
      settings: world.settings,
      rules: world.rules,
    });
    const capture = evidence[0];
    if (!capture) throw new Error('Missing response evidence.');
    expect(capture.contentType).toBeNull();
    expect(capture.body).toContain('response.completed');
    expect(
      await readDecisionStream(
        new Response(new TextEncoder().encode(capture.body)),
      ),
    ).toEqual(decision);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('preserves failed response evidence with bearer redaction and no accepted action', async () => {
    const captures: ResponseEvidence[] = [];
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json(
            { error: 'fixture-secret' },
            { status: 403, headers: { 'x-request-id': 'fixture-request' } },
          ),
        ),
      );
    const result = await runOneRound(
      responsesProvider(
        'fixture-secret',
        'fixture-model',
        transport,
        (_input, capture) => {
          captures.push(capture);
          return Promise.resolve();
        },
      ),
    );
    expect(transport).toHaveBeenCalledTimes(3);
    expect(result.replay.actions).toEqual([]);
    expect(result.finalState.tick).toBe(0);
    expect(captures).toHaveLength(3);
    expect(
      captures.every(
        (capture) => capture.bodyComplete && capture.status === 403,
      ),
    ).toBe(true);
    expect(JSON.stringify(captures)).not.toContain('fixture-secret');
    expect(captures[0]?.body).toContain('[REDACTED]');
  });
  it('rejects headerless incomplete, malformed and oversized bodies while retaining bounded evidence', async () => {
    for (const body of [
      JSON.stringify({ ...completed().response, status: 'incomplete' }),
      '{invalid',
      '<html>Unexpected response</html>',
    ]) {
      await expect(
        readDecisionStream(new Response(new TextEncoder().encode(body))),
      ).rejects.toThrow();
    }
    const captures: ResponseEvidence[] = [];
    await expect(
      readDecisionStream(new Response(new Uint8Array(2_000_001)), (capture) => {
        captures.push(capture);
        return Promise.resolve();
      }),
    ).rejects.toThrow('exceeded');
    expect(captures[0]?.body.length).toBe(2_000_000);
    expect(captures[0]?.bodyComplete).toBe(false);
  });
  it('redacts reflected credentials from response metadata and transport failures', async () => {
    const captures: ResponseEvidence[] = [];
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { error: 'fixture-secret' },
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json; detail=fixture-secret',
              'x-request-id': 'fixture-secret',
            },
          },
        ),
      )
      .mockRejectedValue(new Error('Network failure for fixture-secret'));
    const result = await runOneRound(
      responsesProvider(
        'fixture-secret',
        'fixture-model',
        transport,
        (_input, capture) => {
          captures.push(capture);
          return Promise.resolve();
        },
      ),
    );
    expect(transport).toHaveBeenCalledTimes(3);
    expect(result.replay.actions).toEqual([]);
    expect(
      result.decisions.every((decision) => decision.status === 'failed'),
    ).toBe(true);
    expect(JSON.stringify({ result, captures })).not.toContain(
      'fixture-secret',
    );
    expect(captures[0]?.requestId).toBe('[REDACTED]');
    expect(captures[0]?.contentType).toBe(
      'application/json; detail=[REDACTED]',
    );
    expect(result.decisions[1]?.error).toContain('[REDACTED]');
  });
  it.each(['text', 'responseId'] as const)(
    'rejects completed decisions that echo credentials in %s',
    async (field) => {
      const response = completed(
        field === 'text'
          ? JSON.stringify({
              action: { type: 'try', skill: 'fixture-secret' },
              summary: 'Record the supplied value.',
            })
          : choice(),
      ).response;
      if (field === 'responseId') response.id = 'fixture-secret';
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementation(() => Promise.resolve(Response.json(response)));
      const result = await runOneRound(
        responsesProvider('fixture-secret', 'fixture-model', transport),
      );
      expect(transport).toHaveBeenCalledTimes(3);
      expect(result.finalState.tick).toBe(0);
      expect(result.replay.actions).toEqual([]);
      expect(
        result.decisions.every((decision) =>
          decision.error?.includes('echoed a credential'),
        ),
      ).toBe(true);
      expect(JSON.stringify(result)).not.toContain('fixture-secret');
    },
  );
  it('retains evidence when a response stream fails during reading', async () => {
    const captures: ResponseEvidence[] = [];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('Fixture disconnect'));
      },
    });
    await expect(
      readDecisionStream(new Response(body), (capture) => {
        captures.push(capture);
        return Promise.resolve();
      }),
    ).rejects.toThrow('Fixture disconnect');
    expect(captures).toHaveLength(1);
    expect(captures[0]?.bodyComplete).toBe(false);
  });
  it.each(['response.failed', 'response.incomplete', 'error'])(
    'rejects %s after a plausible delta',
    async (type) => {
      await expect(
        readDecisionStream(
          stream([
            { type: 'response.output_text.delta', delta: choice() },
            { type },
          ]),
        ),
      ).rejects.toThrow(type);
    },
  );
  it('rejects truncated streams, refusals and tool output', async () => {
    await expect(
      readDecisionStream(
        stream([{ type: 'response.output_text.delta', delta: choice() }]),
      ),
    ).rejects.toThrow('without response.completed');
    for (const output of [
      [{ type: 'function_call', name: 'shell', arguments: '{}' }],
      [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'refusal', refusal: 'No decision.' }],
        },
      ],
    ])
      await expect(
        readDecisionStream(
          stream([
            {
              type: 'response.completed',
              response: { id: 'fixture', status: 'completed', output },
            },
          ]),
        ),
      ).rejects.toThrow();
  });
  it('reports HTTP failure and performs no retry', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"detail":"denied"}', {
        status: 403,
        headers: { 'x-request-id': 'fixture-request' },
      }),
    );
    const first = experimentWorld().observations[0];
    if (!first) throw new Error('Missing fixture observation.');
    await expect(
      responsesProvider(
        'fixture-secret',
        'fixture-model',
        transport,
      )({
        observation: first,
        settings: experimentWorld().settings,
        rules: experimentWorld().rules,
      }),
    ).rejects.toThrow('HTTP 403; request ID fixture-request');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('checks the account-specific catalog before inference', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        models: [{ slug: 'fixture-model', visibility: 'list' }],
      }),
    );
    expect(await selectModel('fixture', undefined, transport)).toBe(
      'fixture-model',
    );
    const unavailable: typeof fetch = () =>
      Promise.resolve(Response.json({ models: [] }));
    await expect(
      selectModel('fixture', 'unknown-model', unavailable),
    ).rejects.toThrow('not in this account catalog');
  });
});
