import { it, expect } from 'vitest';
import {
  v7Install,
  v7Clone,
  openStartProcess,
  openStopProcess,
  openAdvanceProcess,
} from '@self-evolving-world/world-core';
import type {
  V7ActionContext,
  OpenProcessSpec,
} from '@self-evolving-world/world-core';
import { openFixture, actorOf } from './fixtures/open-development.js';
function fixture() {
  const f = openFixture(),
    w = v7Clone(v7Install(f.world, f.registry, 'fixture-package@1'));
  actorOf(w).mastered.push('fixture-first');
  const context: V7ActionContext = {
    world: w,
    actor: actorOf(w),
    action: { interface: 'fixture-first', args: {} },
    work: { remaining: 10000, spend() {} },
    emit() {},
  };
  const spec: OpenProcessSpec = {
    kind: 'physical-fixture',
    inputs: [{ item: 'fixture-input', quantity: 1 }],
    outputs: [{ resource: 'fixture-strip', quantity: 1 }],
    work: 2,
    station: 'fixture-station',
    temperature: [-20, 50],
    moisture: [0, 2],
    heatPerRound: 0.2,
    wearPerRound: 0.1,
    maximumStall: 5,
    dependencies: { abilities: ['fixture-first'], knowledge: [] },
  };
  return { w, context, spec };
}
it('rejects nominal-mass and undeclared composition shortcuts before allocating actual process inputs', () => {
  const { w, context, spec } = fixture(),
    input = w.stacks[0];
  if (!input) throw new Error('Missing fixture input');
  input.physical = { unitMass: 2, unitWater: 0.9, unitSolids: 1.1 };
  expect(() => openStartProcess(context, spec)).toThrow(/mass/);
  expect(input.quantity).toBe(2);
  expect(w.processes).toHaveLength(0);
  input.physical = { unitMass: 1.1, unitWater: 0.2, unitSolids: 0.9 };
  expect(() => openStartProcess(context, spec)).toThrow(/explicit physical/);
  expect(input.quantity).toBe(2);
});
it('retains physical composition and nested prior provenance when cancelled after serialization', () => {
  const { w, context, spec } = fixture(),
    input = w.stacks[0];
  if (!input) throw new Error('Missing fixture input');
  const output = spec.outputs[0];
  if (!output) throw new Error('Missing fixture output');
  input.physical = { unitMass: 1.1, unitWater: 0.2, unitSolids: 0.9 };
  input.processing = { source: 'prior-process', tool: 'actual-tool', stage: 3 };
  input.materialLayer = { layer: 'observed' };
  input.quantityTenths = 20;
  output.physical = { ...input.physical };
  openStartProcess(context, spec);
  const resumed = v7Clone(w),
    p = resumed.processes[0];
  if (!p) throw new Error('Missing process');
  openStopProcess(resumed, p, 'fixture cancellation');
  openStopProcess(resumed, p, 'duplicate');
  const recovered = resumed.stacks.find((s) => s.owner === null);
  expect(recovered).toMatchObject({
    quantity: 1,
    quantityTenths: 10,
    physical: input.physical,
    processing: input.processing,
    materialLayer: input.materialLayer,
  });
  expect(
    resumed.stacks.reduce(
      (n, s) => n + s.quantity * (s.physical?.unitMass ?? 0),
      0,
    ),
  ).toBeCloseTo(2.2);
});
it('requires declared water and solids conservation and produces real physical output with linked earlier work', () => {
  const { w, context, spec } = fixture(),
    input = w.stacks[0];
  if (!input) throw new Error('Missing fixture input');
  const output = spec.outputs[0];
  if (!output) throw new Error('Missing fixture output');
  input.physical = { unitMass: 1.1, unitWater: 0.2, unitSolids: 0.9 };
  input.processing = { source: 'actual-prior-work' };
  output.physical = { unitMass: 1.1, unitWater: 0.1, unitSolids: 1 };
  expect(() => openStartProcess(context, spec)).toThrow(/conserved outputs/);
  output.physical = { ...input.physical };
  openStartProcess(context, spec);
  for (let i = 0; i < 2; i++) {
    const p = w.processes[0];
    if (!p) throw new Error('Missing process');
    w.tick++;
    openAdvanceProcess(w, p);
  }
  const result = w.stacks.find((s) => s.resource === 'fixture-strip');
  expect(result?.physical).toEqual(input.physical);
  expect(JSON.stringify(result?.processing)).toContain('actual-prior-work');
  expect(w.objects[0]?.data.availableHeat).toBeCloseTo(9.6);
});
