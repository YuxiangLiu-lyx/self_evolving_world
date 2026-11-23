import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { v7Clone } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../apps/simulator/src/long-scenario.js';
import {
  longOrdinaryInput,
  longWorldInput,
} from '../apps/simulator/src/long-context.js';
import { ordinaryContinuousInput } from '../apps/simulator/src/continuous-input.js';
import { continuousRequest } from '../apps/simulator/src/continuous-provider.js';
import { longRequestMeasure } from '../apps/simulator/src/long-tokens.js';
import type {
  V7Execution,
  V7CallRecord,
} from '../apps/simulator/src/continuous-run.js';
const output =
  'docs/exec-plans/evidence/pr-31-long-open-development/context-before-after.json';
const fresh = initialLongWorld(),
  saved = JSON.parse(
    readFileSync('experiment/ex10/execution.json', 'utf8'),
  ) as V7Execution;
const grown = v7Clone(saved.world);
grown.config.longDevelopment = required(fresh.config.longDevelopment);
const snapshots = [
  { name: 'fresh', world: fresh, cursors: {} as V7Execution['cursors'] },
  {
    name: 'archived-ex10-at-358-projection-only',
    world: grown,
    cursors: saved.cursors,
  },
];
const projections = snapshots.flatMap(({ name, world, cursors }) =>
  world.actors.map((a) => ({
    name,
    actor: a.id,
    before: longRequestMeasure(
      continuousRequest(
        'gpt-6.1-sol',
        'ordinary',
        ordinaryContinuousInput(world, a.id, cursors[a.id], 650),
      ),
      3500,
    ),
    after: longRequestMeasure(
      continuousRequest(
        'gpt-6.1-sol',
        'ordinary',
        longOrdinaryInput(world, a.id, cursors[a.id]),
      ),
      3500,
    ),
  })),
);
const expanded = v7Clone(fresh),
  actor = required(expanded.actors[0]);
for (let i = 0; i < 5000; i++) {
  expanded.abilities.push({
    ...v7Clone(required(expanded.abilities[0])),
    id: `offline-${String(i)}`,
    authored: false,
    function: `Independent fixture property ${String(i)}`,
    equivalence: `offline:${String(i)}`,
  });
  actor.memory.knowledge ??= {};
  actor.memory.knowledge[`offline-${String(i)}`] = {
    key: `offline-${String(i)}`,
    subject: `offline-${String(i)}`,
    property: 'fixture only',
    value: i,
    verified: true,
    method: 'fixture',
    condition: 'fixture',
    evidence: `offline-${String(i)}`,
    tick: i,
  };
}
const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * p))
  ] ?? null;
const distributions = ['ex10', 'ex12'].map((id) => {
  const calls = readdirSync(`experiment/${id}/calls`)
    .filter((p) => p.endsWith('.json'))
    .map(
      (p) =>
        JSON.parse(
          readFileSync(`experiment/${id}/calls/${p}`, 'utf8'),
        ) as V7CallRecord,
    );
  return {
    id,
    roles: ['ordinary', 'world'].map((role) => {
      const attempts = calls
          .filter((c) => c.attempt.role === role)
          .map((c) => c.attempt),
        known = attempts.flatMap((a) => (a.usage ? [a.usage] : []));
      return {
        role,
        attempts: attempts.length,
        failed: attempts.filter((a) => a.status !== 'accepted').length,
        unknownUsage: attempts.length - known.length,
        actualInput: {
          sum: known.reduce((n, u) => n + u.inputTokens, 0),
          median: percentile(
            known.map((u) => u.inputTokens),
            0.5,
          ),
          p90: percentile(
            known.map((u) => u.inputTokens),
            0.9,
          ),
          maximum: Math.max(...known.map((u) => u.inputTokens)),
        },
        actualOutput: known.reduce((n, u) => n + u.outputTokens, 0),
      };
    }),
  };
});
const result = {
  version: 1,
  formalCalls: 0,
  method:
    'Complete serialized request estimated with o200k_base BPE; model mapping and server framing are approximate. Actual retained usage is reported separately. Byte reservations are conservative ceilings, not token estimates. Module counts overlap (packet and its fields) and are not additive.',
  projections,
  expanded5000: {
    ordinary: longRequestMeasure(
      continuousRequest(
        'gpt-6.1-sol',
        'ordinary',
        longOrdinaryInput(expanded, actor.id),
      ),
      3500,
    ),
    world: longRequestMeasure(
      continuousRequest(
        'gpt-6.1-sol',
        'world',
        longWorldInput(expanded, {
          lin: {
            interface: 'request',
            args: { problem: 'Unknown fixture property' },
          },
        }),
      ),
      3500,
    ),
  },
  distributions,
  forecast: {
    targetRounds: 1600,
    actors: 3,
    roundsPerDecision: 5,
    ordinaryDecisions: 960,
    retrievalFraction: 0.2,
    completeInputEstimate: 6000,
    averageOutputAssumption: 700,
    ordinaryAndRetrieval: Math.ceil(960 * 1.2) * 6700,
    worldCalls: 60,
    worldInputOutputAssumption: 8000,
    world: 480000,
    unknownUsageAllowance: 200000,
    projectedTotal: Math.ceil(960 * 1.2) * 6700 + 480000 + 200000,
    hardCeiling: 10000000,
    interpretation:
      'Plausible coverage under declared assumptions, not a guarantee. One fungible ordinary/world pool across all stages; no probe launched, no automatic budget increase. Development/review/tool usage is separate and unobservable here.',
  },
};
mkdirSync('docs/exec-plans/evidence/pr-31-long-open-development', {
  recursive: true,
});
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      output,
      projections: projections.map((p) => ({
        name: p.name,
        actor: p.actor,
        before: p.before.inputEstimate,
        after: p.after.inputEstimate,
      })),
      expanded: result.expanded5000.ordinary.inputEstimate,
      forecast: result.forecast.projectedTotal,
    },
    null,
    2,
  ),
);

function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null)
    throw new Error('Required fixture or audit value is absent.');
  return value;
}
