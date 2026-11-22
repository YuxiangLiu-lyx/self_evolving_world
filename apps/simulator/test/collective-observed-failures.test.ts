import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Step,
  v7Clone,
  v7Install,
} from '@self-evolving-world/world-core';
import { parseCollectiveDecision } from '../src/collective-controller.js';
import type { V7CallRecord } from '../src/continuous-run.js';
import type { V7Execution } from '../src/continuous-run.js';

it('distinguishes the actual ex12 malformed item reference from an alleged owned-inventory lookup defect', () => {
  const saved = JSON.parse(
    readFileSync(
      'experiment/ex12/technical-pauses/round-56/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  const world = saved.world;
  const item = world.stacks.find((s) => s.id === 'item-48-cedar-4-1203');
  expect(item).toMatchObject({
    owner: 'cedar-4',
    resource: 'hazelnut',
    quantity: 1,
  });
  const waits = Object.fromEntries(
    world.actors.map((a) => [a.id, { interface: 'wait', args: {} }]),
  );
  const run = (target: string) =>
    v7Step(
      world,
      {
        ...waits,
        'cedar-4': {
          interface: 'probe',
          args: { target, mode: 'observe', intensity: 1 },
        },
      },
      continuousRegistry(world),
    );
  const malformed = run('item: item-48-cedar-4-1203');
  expect(malformed.outcomes['cedar-4']?.success).toBe(false);
  expect(malformed.outcomes['cedar-4']?.reason).toContain(
    'Reference unavailable',
  );
  const exact = run('item:item-48-cedar-4-1203');
  expect(
    exact.outcomes['cedar-4']?.success,
    exact.outcomes['cedar-4']?.reason,
  ).toBe(true);
  expect(exact.world.stacks.find((s) => s.id === item?.id)?.quantity).toBe(1);
  expect(
    exact.world.events.some(
      (e) => e.actor === 'cedar-4' && e.type === 'information-confirmed',
    ),
  ).toBe(false);
  expect(world.stacks.find((s) => s.id === item?.id)?.quantity).toBe(1);
});

it('rejects the actual multi-member public proposal without inventing assignments or changing private plans', () => {
  const call = JSON.parse(
    readFileSync('experiment/ex12/calls/ordinary-290.json', 'utf8'),
  ) as V7CallRecord;
  const input = call.input;
  if (!('collective' in input) || !call.response)
    throw new Error('Missing retained public response.');
  const noPersonalPlan = () => {
    throw new Error('Public coordination cannot parse a personal assignment.');
  };
  expect(() =>
    parseCollectiveDecision(call.response?.text ?? '', input, noPersonalPlan),
  ).toThrow('actual member');
  const raw = JSON.parse(call.response.text) as {
    summary: string;
    proposals: unknown[];
  };
  // Isolated schema positive control; never replaces the rejected formal response.
  const valid = parseCollectiveDecision(
    JSON.stringify({ ...raw, proposals: raw.proposals.slice(0, 1) }),
    input,
    noPersonalPlan,
  );
  expect(valid.plans).toEqual({});
  expect(valid.intents).toEqual({});
  expect(valid.coordination?.proposals.map((p) => p.member)).toEqual([
    'cedar-5',
  ]);
});

it('combines the two actual ex12 round-90 bark supplies without retuning the retained world', () => {
  const saved = JSON.parse(
    readFileSync(
      'experiment/ex12/checkpoints/development-000090-294-6.json',
      'utf8',
    ),
  ) as { state: V7Execution };
  const original = saved.state.world;
  const ids = ['item-57-ash-1-1443', 'item-77-ash-1-1977'];
  const sources = original.stacks.filter((s) => ids.includes(s.id));
  expect(sources.map((s) => s.quantity)).toEqual([0.7, 0.7]);
  // Installation and mastery are isolated positive-control setup, never formal-run progress.
  const w = v7Clone(
    v7Install(
      original,
      continuousRegistry(original),
      'material-stack-combine@1',
    ),
  );
  const actor = w.actors.find((a) => a.id === 'ash-1');
  if (!actor) throw new Error('Missing archived performer.');
  actor.mastered.push('material-stack-combine');
  const r = v7Step(
    w,
    Object.fromEntries(
      w.actors.map((a) => [
        a.id,
        a.id === 'ash-1'
          ? {
              interface: 'material-stack-combine',
              args: { operation: 'combine', sourceIds: ids },
            }
          : { interface: 'wait', args: {} },
      ]),
    ),
    continuousRegistry(w),
  );
  expect(r.outcomes['ash-1']?.success, r.outcomes['ash-1']?.reason).toBe(true);
  const output = r.world.stacks.find(
    (s) => s.owner === 'ash-1' && s.componentLots,
  );
  expect(output?.quantityTenths).toBe(14);
  expect(
    output?.componentLots?.map((s) => [
      s.id,
      s.quantity,
      s.origin,
      s.harvestedAt,
      s.processing,
    ]),
  ).toEqual(
    sources.map((s) => [
      s.id,
      s.quantity,
      s.origin,
      s.harvestedAt,
      s.processing,
    ]),
  );
  expect(original.stacks.filter((s) => ids.includes(s.id))).toEqual(sources);
});

it('assesses the actual fractional bark from the ex12 round-95 request with one mass conversion and no free roots', () => {
  const saved = JSON.parse(
    readFileSync(
      'experiment/ex12/checkpoints/development-000095-309-7.json',
      'utf8',
    ),
  ) as { state: V7Execution };
  const original = saved.state.world,
    w = v7Clone(
      v7Install(original, continuousRegistry(original), 'root-preparation@2'),
    );
  const actor = w.actors.find((a) => a.id === 'birch-3');
  if (!actor) throw new Error('Missing real requester.');
  actor.mastered.push('root-preparation-surface');
  const r = v7Step(
    w,
    Object.fromEntries(
      w.actors.map((a) => [
        a.id,
        a.id === 'birch-3'
          ? {
              interface: 'root-preparation-surface',
              args: {
                operation: 'assess-surface',
                barkId: 'item-67-birch-3-1712',
                toolId: 'item-67-birch-3-1710',
              },
            }
          : { interface: 'wait', args: {} },
      ]),
    ),
    continuousRegistry(w),
  );
  expect(r.outcomes['birch-3']?.success, r.outcomes['birch-3']?.reason).toBe(
    true,
  );
  expect(
    r.world.events.find((e) => e.type === 'root-surface-assessed')?.data
      .geometry,
  ).toMatchObject({ mass: 0.09, quantity: 0.3, width: 0.3, height: 0.2 });
  expect(
    r.world.stacks
      .filter((s) => s.resource === 'root' && s.owner === 'birch-3')
      .map((s) => [s.id, s.quantity]),
  ).toEqual(
    original.stacks
      .filter((s) => s.resource === 'root' && s.owner === 'birch-3')
      .map((s) => [s.id, s.quantity]),
  );
});
