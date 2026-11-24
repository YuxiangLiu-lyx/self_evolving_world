import { describe, expect, it, vi } from 'vitest';
import { DEMO_SETUP } from '../../viewer/src/scenario.js';
import { createWorld } from '@self-evolving-world/world-core';
import { experimentWorld } from '../src/experiment.js';
import {
  readDecisionStream,
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

describe('founding experiment world', () => {
  it('preserves the founding scenario and exposes only nearby items in each initial observation', () => {
    const world = experimentWorld();
    expect(world).toEqual(createWorld(DEMO_SETUP));
    expect(world.observations.map((o) => o.self.id)).toEqual([
      'lin',
      'moss',
      'sol',
    ]);
    expect(world.observations.map((o) => o.tick)).toEqual([0, 0, 0]);
    expect(
      world.observations.map((o) => o.items.map((item) => item.id)),
    ).toEqual([['wood', 'stone'], ['berry'], ['crystal']]);
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
    const evidence: ResponseEvidence[] = [];
    const decision = await readDecisionStream(response, (capture) => {
      evidence.push(capture);
      return Promise.resolve();
    });
    const capture = evidence[0];
    if (!capture) throw new Error('Missing response evidence.');
    expect(evidence).toHaveLength(1);
    expect(capture.contentType).toBeNull();
    expect(capture.body).toContain('response.completed');
    expect(
      await readDecisionStream(
        new Response(new TextEncoder().encode(capture.body)),
      ),
    ).toEqual(decision);
  });
  it('reports HTTP failure while retaining the complete error body and accepting no decision', async () => {
    const captures: ResponseEvidence[] = [];
    await expect(
      readDecisionStream(
        Response.json(
          { detail: 'denied' },
          { status: 403, headers: { 'x-request-id': 'fixture-request' } },
        ),
        (capture) => {
          captures.push(capture);
          return Promise.resolve();
        },
      ),
    ).rejects.toThrow('HTTP 403; request ID fixture-request');
    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      status: 403,
      requestId: 'fixture-request',
      bodyComplete: true,
    });
    expect(captures[0]?.body).toContain('denied');
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
