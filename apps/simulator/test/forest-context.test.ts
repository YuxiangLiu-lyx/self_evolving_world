import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Install,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import { initialForestWorld } from '../src/forest-scenario.js';
import { ordinaryContinuousInput } from '../src/continuous-input.js';
it('projects bounded dated evidence once without changing full personal records or hiding adverse outcomes', () => {
  const registry = continuousRegistry();
  let w = v7Clone(
    v7Install(
      v7Install(initialForestWorld(), registry, 'food-assessment@1'),
      registry,
      'shelter-construction@1',
    ),
  );
  const actor = w.actors[0];
  if (!actor) throw new Error('Missing actor');
  actor.mastered.push('assess-food');
  actor.extensionState['food-assessment:records'] = Array.from(
    { length: 16 },
    (_, i) => ({
      id: `sample-${String(i)}`,
      resource: 'hazelnut',
      origin: 'isolated',
      startTick: i,
      endTick: i + 5,
      mode: 'sample',
      status: 'completed',
      fraction: 0.1,
      ingested: true,
      nourishment: 1.8,
      adverse: i === 0,
      confounding: false,
      sensory: { appearance: 'Observed shell; safety remains unknown.' },
      baseline: { health: 100 },
      followup: Array.from({ length: 5 }, (_, n) => ({
        tick: i + n,
        vitals: { health: 100, satiety: 70, energy: 30, temperature: 12 },
      })),
      evidence: [],
      uncertainty:
        'A single measured exposure does not establish general safety.',
    }),
  );
  const saved = JSON.stringify(actor.extensionState);
  const input = ordinaryContinuousInput(w, actor.id, undefined, 100);
  expect(JSON.stringify(input).length * 2).toBeLessThan(
    w.config.computation.inputBytes,
  );
  expect(input.state.extensionState['food-assessment:records']).toBeUndefined();
  expect(input.harness['assess-food']?.records).toHaveLength(16);
  expect(input.harness['assess-food']?.records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'sample-0', adverse: true }),
    ]),
  );
  expect(input.harness['assess-food']?.latestDetailedEvidence).toMatchObject({
    id: 'sample-15',
  });
  const latest = input.harness['assess-food']?.latestDetailedEvidence;
  if (!latest || typeof latest !== 'object' || Array.isArray(latest))
    throw new Error('Missing latest evidence');
  expect(Array.isArray(latest.followup)).toBe(true);
  expect(JSON.stringify(actor.extensionState)).toBe(saved);
  w = v7Clone(w);
  delete w.state.shelterConstruction;
  expect(
    ordinaryContinuousInput(w, actor.id, undefined, 100).state.extensionState[
      'food-assessment:records'
    ],
  ).toBeDefined();
});

it('keeps diagnostic and exercise evidence once and retains raw evidence when the personal adapter is unavailable', async () => {
  const { forestDecisionEvidence } = await import('../src/forest-context.js');
  const w = v7Clone(initialForestWorld()),
    actor = w.actors[0];
  if (!actor) throw new Error('Missing actor');
  actor.extensionState['route:lastInspection'] = {
    tick: 619,
    status: 'unknown',
    reasonCode: 'unobserved-terrain',
  };
  actor.extensionState['warming:lastRound'] = {
    tick: 619,
    exertionHeat: 0.35,
    netChange: -0.1,
  };
  const saved = JSON.stringify(actor);
  const projected = forestDecisionEvidence(actor, {
    'inspect-route': {
      lastInspection: actor.extensionState['route:lastInspection'],
    },
    'active-warming': { lastRound: actor.extensionState['warming:lastRound'] },
  });
  expect(projected.extensionState['route:lastInspection']).toBeUndefined();
  expect(projected.extensionState['warming:lastRound']).toBeUndefined();
  expect(projected.harness['inspect-route']?.lastInspection).toMatchObject({
    status: 'unknown',
  });
  expect(
    forestDecisionEvidence(actor, {}).extensionState['route:lastInspection'],
  ).toBeDefined();
  expect(JSON.stringify(actor)).toBe(saved);
});
