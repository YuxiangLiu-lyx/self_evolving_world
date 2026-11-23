import { getEncoding } from 'js-tiktoken';
import type { V7World } from '@self-evolving-world/world-core';
const encoding = getEncoding('o200k_base');
export interface LongRequestMeasure {
  estimator: 'o200k_base; approximate model mapping';
  inputEstimate: number;
  modules: Record<string, number>;
  requestBytes: number;
  reservation: number;
}
const count = (value: unknown) =>
  encoding.encode(
    typeof value === 'string' ? value : JSON.stringify(value),
    [],
    [],
  ).length;
/** Offline BPE estimate is not provider usage. UTF-8 upper reservation also covers unknown failed usage. */
export function longRequestMeasure(
  request: {
    instructions: string;
    input: { content: string }[];
    text: unknown;
  },
  outputLimit: number,
): LongRequestMeasure {
  const wire = JSON.stringify(request),
    payload = JSON.parse(request.input[0]?.content ?? '{}') as Record<
      string,
      unknown
    >;
  return {
    estimator: 'o200k_base; approximate model mapping',
    inputEstimate: count(wire),
    modules: {
      instructions: count(request.instructions),
      schema: count(request.text),
      ...Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [key, count(value)]),
      ),
      ...(payload.packet && typeof payload.packet === 'object'
        ? Object.fromEntries(
            Object.entries(payload.packet).map(([key, value]) => [
              `packet.${key}`,
              count(value),
            ]),
          )
        : {}),
    },
    requestBytes: new TextEncoder().encode(wire).length,
    reservation: new TextEncoder().encode(wire).length + outputLimit + 4096,
  };
}
export function longTokenBudget(state: {
  world: Pick<V7World, 'config'>;
  attempts: {
    usage: { inputTokens: number; outputTokens: number } | null;
    reservedTokens?: number;
  }[];
}) {
  const policy = state.world.config.longDevelopment;
  return policy
    ? {
        limit: policy.tokens,
        used: state.attempts.reduce(
          (n, a) =>
            n +
            (a.usage
              ? a.usage.inputTokens + a.usage.outputTokens
              : (a.reservedTokens ?? policy.tokens)),
          0,
        ),
      }
    : null;
}
