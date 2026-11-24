import type { ModelDecision } from './experiment.js';
import { record, responseJson, string } from './remote-data.js';

const API = 'https://api.openai.com/v1';

export async function selectModel(
  token: string,
  requested?: string,
  transport: typeof fetch = fetch,
): Promise<string> {
  const response = await transport(`${API}/models`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  const catalog = record(await responseJson(response)).models;
  if (!Array.isArray(catalog))
    throw new Error('ChatGPT model catalog is unavailable.');
  const visible = catalog
    .map((value: unknown) => record(value))
    .filter((value) => value.visibility === 'list')
    .map((value) => string(value.slug, 'model slug'));
  const selected =
    requested ?? (visible.includes('gpt-6.1-sol') ? 'gpt-6.1-sol' : visible[0]);
  if (!selected || !visible.includes(selected))
    throw new Error(
      'Requested model is not in this account catalog. No inference was requested.',
    );
  return selected;
}

function completedDecision(
  value: unknown,
  responseFormat: 'sse' | 'json',
  textLimit: number,
  finalAnswerPhase: boolean,
): ModelDecision {
  const completed = record(value);
  if (completed.status !== 'completed' || !Array.isArray(completed.output))
    throw new Error('Invalid completed response.');
  const texts: string[] = [];
  const phased =
    finalAnswerPhase &&
    (completed.output as unknown[]).some((value) => {
      const item = record(value);
      return item.type === 'message' && item.phase !== undefined;
    });
  let finalMessages = 0;
  for (const value of completed.output as unknown[]) {
    const item = record(value);
    if (item.type === 'reasoning') continue;
    if (
      item.type !== 'message' ||
      item.role !== 'assistant' ||
      !Array.isArray(item.content)
    )
      throw new Error('Response contains an unsupported output item.');
    if (phased && !['commentary', 'final_answer'].includes(String(item.phase)))
      throw new Error('Ambiguous or unsupported decision message phase.');
    if (phased && item.status !== 'completed')
      throw new Error('Decision message is not complete.');
    if (phased && item.phase === 'final_answer') finalMessages++;
    for (const value of item.content as unknown[]) {
      const content = record(value);
      if (content.type !== 'output_text')
        throw new Error('Response did not provide an ordinary text decision.');
      if (phased && item.phase === 'commentary') {
        if (typeof content.text !== 'string')
          throw new Error('Invalid commentary text.');
        continue;
      }
      texts.push(string(content.text, 'decision text'));
    }
  }
  if (
    (phased && finalMessages !== 1) ||
    texts.length !== 1 ||
    (texts[0]?.length ?? 0) > textLimit
  )
    throw new Error('Expected exactly one bounded decision output.');
  return {
    text: string(texts[0], 'decision text'),
    responseId: string(completed.id, 'response ID'),
    responseFormat,
  };
}

export interface ResponseEvidence {
  readonly status: number;
  readonly contentType: string | null;
  readonly requestId: string | null;
  readonly body: string;
  readonly bodyComplete: boolean;
}

export async function readDecisionStream(
  response: Response,
  observe?: (evidence: ResponseEvidence) => Promise<void>,
  textLimit = 10_000,
  finalAnswerPhase = false,
): Promise<ModelDecision> {
  if (!Number.isSafeInteger(textLimit) || textLimit < 1 || textLimit > 100_000)
    throw new Error('Invalid bounded decision text limit.');
  const contentType = response.headers.get('content-type');
  let format: 'sse' | 'json' | undefined = contentType?.includes(
    'text/event-stream',
  )
    ? 'sse'
    : contentType?.includes('application/json')
      ? 'json'
      : undefined;
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let captured = '';
  let size = 0;
  let bodyComplete = false;
  const limit = 2_000_000;
  try {
    if (!reader) throw new Error('Responses returned no body.');
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        const tail = decoder.decode();
        buffer += tail;
        captured += tail;
        bodyComplete = true;
        break;
      }
      const text = decoder.decode(chunk.value.subarray(0, limit - size), {
        stream: true,
      });
      buffer += text;
      captured += text;
      size += chunk.value.byteLength;
      if (size > limit)
        throw new Error('Response stream exceeded the experiment limit.');
      // Keep HTTP error bodies for offline diagnosis, without accepting their contents.
      if (!response.ok) continue;
      if (contentType && !format)
        throw new Error(
          `Unsupported Responses content type: ${contentType}. No decision was accepted.`,
        );
      if (!format) {
        const prefix = buffer.trimStart();
        if (prefix.startsWith('{')) format = 'json';
        else if (/^(?:data:|event:|:)/.test(prefix)) format = 'sse';
        else if (prefix.length > 32)
          throw new Error('Unrecognized Responses body without Content-Type.');
      }
      if (format !== 'sse') continue;
      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer)) !== null) {
        const frame = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data || data === '[DONE]') continue;
        const event = record(parseResponseJson(data));
        if (
          ['error', 'response.failed', 'response.incomplete'].includes(
            String(event.type),
          )
        )
          throw new Error(
            `Responses ended with ${String(event.type)}; no decision was accepted.`,
          );
        if (event.type !== 'response.completed') continue;
        return completedDecision(
          event.response,
          'sse',
          textLimit,
          finalAnswerPhase,
        );
      }
    }
    if (!response.ok) await responseJson(response);
    if (format === 'json')
      return completedDecision(
        parseResponseJson(buffer),
        'json',
        textLimit,
        finalAnswerPhase,
      );
    throw new Error('Response stream ended without response.completed.');
  } finally {
    try {
      await reader?.cancel();
    } finally {
      reader?.releaseLock();
      await observe?.({
        status: response.status,
        contentType,
        requestId: response.headers.get('x-request-id'),
        body: captured,
        bodyComplete,
      });
    }
  }
}

function parseResponseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Responses body contains invalid JSON.');
  }
}
