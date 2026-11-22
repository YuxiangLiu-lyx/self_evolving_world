import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { v7ParsePlan } from '@self-evolving-world/world-core';
import { readDecisionStream } from '../src/responses.js';
import { continuousProvider } from '../src/continuous-provider.js';
import { parseCollectiveDecision } from '../src/collective-controller.js';
import type { V7CallRecord } from '../src/continuous-run.js';

describe('retained ex11 collective transport failures', () => {
  it.each([1, 2, 3])(
    'decodes the actual ordinary-%i response without inference while keeping the legacy single-person bound',
    async (number) => {
      const raw = JSON.parse(
        readFileSync(
          `experiment/ex11/calls/ordinary-${String(number)}.json`,
          'utf8',
        ),
      ) as V7CallRecord;
      if (!('collective' in raw.input))
        throw new Error('Expected retained collective input.');
      const response = () =>
        new Response(raw.failureEvidence, {
          headers: { 'content-type': 'text/event-stream' },
        });
      await expect(readDecisionStream(response())).rejects.toThrow(
        'bounded decision',
      );
      const transport: typeof fetch = () => Promise.resolve(response());
      const result = await continuousProvider(
        'offline-fixture-token-only',
        'gpt-6.1-sol',
        transport,
      )('ordinary', raw.input);
      expect(result.text.length).toBeGreaterThan(10000);
      expect(result.usage).toEqual(raw.attempt.usage);
      const parsed = parseCollectiveDecision(result.text, raw.input, (text) =>
        v7ParsePlan(
          JSON.parse(text) as unknown,
          raw.input.catalogue.events,
          true,
        ),
      );
      expect(Object.keys(parsed.plans).sort()).toEqual(
        [...raw.input.collective.eligible].sort(),
      );
    },
  );
});
