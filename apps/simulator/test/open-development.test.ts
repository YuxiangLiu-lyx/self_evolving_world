import { describe, it, expect } from 'vitest';
import {
  continuousRegistry,
  v7Install,
  v7Step,
  v7Clone,
  v7PublicCatalogue,
  openStopProcess,
  openConditions,
  openSaveProjects,
  v7ParsePlan,
  OPEN_BASELINE,
  v7Signature,
  forestRestFactor,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../src/open-scenario.js';
import {
  ordinaryContinuousInput,
  worldContinuousInput,
} from '../src/continuous-input.js';
import { continuousRequest } from '../src/continuous-provider.js';
import { openFixture, openWait, actorOf } from './fixtures/open-development.js';
const waits = (w: V7World) =>
  Object.fromEntries(w.actors.map((a) => [a.id, openWait]));
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { ...waits(w), [actorOf(w).id]: a }, continuousRegistry(w));

describe('fresh world isolation and grounded exploration', () => {
  it('filters registry, public search, personal learning and execution across A/B and restores A without losing work', () => {
    const f = openFixture(),
      a = v7Install(f.world, f.registry, 'fixture-package@1'),
      b = initialOpenWorld('isolated-b');
    expect(continuousRegistry(b).packages.map((p) => p.id)).toEqual([
      'foundation-forest',
      'foundation-open',
    ]);
    expect(() => v7Install(b, f.registry, 'fixture-package@1')).toThrow(
      /scope/,
    );
    for (const w of [b, initialOpenWorld('isolated-c')]) {
      expect(w.abilities.map((a) => a.id).sort()).toEqual(
        [...OPEN_BASELINE].sort(),
      );
      expect(w.processes).toEqual([]);
      expect(w.satisfaction.map((s) => s.id)).toEqual([
        'grounded-understanding',
        'reciprocal-understanding',
      ]);
      expect(
        JSON.stringify([
          v7PublicCatalogue(w),
          ordinaryContinuousInput(w, 'lin', undefined, 650),
          worldContinuousInput(w, {}),
        ]),
      ).not.toMatch(
        /fixture-first|active-warming|willow-work|recuperate|bast-cord/,
      );
      expect(
        step(w, { interface: 'learn', args: { ability: 'fixture-first' } })
          .outcomes.lin?.success,
      ).toBe(false);
      expect(
        step(w, {
          interface: 'fixture-first',
          args: { target: 'fixture-input' },
        }).outcomes.lin?.success,
      ).toBe(false);
    }
    let restored = JSON.parse(JSON.stringify(a)) as V7World;
    expect(actorOf(restored).mastered).not.toContain('fixture-first');
    restored = v7Step(
      restored,
      { lin: { interface: 'learn', args: { ability: 'fixture-first' } } },
      f.registry,
    ).world;
    expect(actorOf(restored).mastered).not.toContain('fixture-first');
    restored = v7Step(restored, { lin: openWait }, f.registry).world;
    expect(actorOf(restored).mastered).toContain('fixture-first');
    expect(
      v7Step(
        restored,
        {
          lin: {
            interface: 'fixture-first',
            args: { target: 'fixture-input' },
          },
        },
        f.registry,
      ).outcomes.lin?.success,
    ).toBe(true);
  });
  it('records informative failure once and never rewards a repeated property or numeric jitter', () => {
    let { world: w } = openFixture();
    const action = {
      interface: 'probe',
      args: { target: 'item:fixture-input', mode: 'press', intensity: 0.9 },
    };
    const before = actorOf(w).vitals.energy;
    w = v7Clone(step(w, action).world);
    expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(true);
    expect(
      Object.values(actorOf(w).memory.knowledge ?? {})[0]?.value,
    ).toMatchObject({ held: false });
    expect(actorOf(w).vitals.energy).toBeCloseTo(before - 0.5);
    expect(w.stacks[0]?.quantity).toBeCloseTo(1.9);
    const reward = actorOf(w).wellbeing.sources[0]?.sustained ?? 0;
    w = v7Clone(
      step(w, { ...action, args: { ...action.args, intensity: 0.91 } }).world,
    );
    expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(
      false,
    );
    expect(actorOf(w).wellbeing.sources[0]?.sustained).toBeLessThan(reward);
    expect(actorOf(w).mastered).toEqual(OPEN_BASELINE);
  });
  it('requires real heat, owned material and reachable subjects; failed trials consume nothing', () => {
    const { world: w } = openFixture();
    const before = w.stacks[0]?.quantity;
    const r = step(w, {
      interface: 'probe',
      args: { target: 'resource:stone', mode: 'press', intensity: 0.5 },
    });
    expect(r.outcomes.lin?.success).toBe(false);
    expect(r.world.stacks[0]?.quantity).toBe(before);
    const empty = v7Clone(w);
    const station = empty.objects[0];
    if (station) station.data.availableHeat = 0;
    expect(
      step(empty, {
        interface: 'probe',
        args: { target: 'fixture-input', mode: 'heat', intensity: 1 },
      }).outcomes.lin?.success,
    ).toBe(false);
  });
  it('persists actor-selected projects independently of physical truth and supplies bounded contexts', () => {
    const w = v7Clone(initialOpenWorld()),
      a = actorOf(w);
    const p = {
      id: 'own-question',
      status: 'active' as const,
      question: 'What changed?',
      evidence: [],
      uncertainty: 'Unknown',
      goal: 'Understand',
      completedSteps: [],
      outputs: [],
      missing: 'Evidence',
      next: 'Observe',
      pauseReason: '',
      benefit: '',
    };
    openSaveProjects(a, [p], 0);
    openSaveProjects(a, [], 1);
    expect(a.memory.projects?.['own-question']).toMatchObject(p);
    const inventory = v7Signature(w.stacks);
    openSaveProjects(
      a,
      [{ ...p, status: 'completed', benefit: 'A personal claim' }],
      2,
    );
    expect(v7Signature(w.stacks)).toBe(inventory);
    expect(a.wellbeing.sources).toEqual([]);
    const input = ordinaryContinuousInput(w, a.id, undefined, 650),
      request = continuousRequest('fixture-model', 'ordinary', input);
    expect(request.instructions).not.toContain('Do not invent a project');
    expect(request.instructions).toContain('You may initiate');
    expect(JSON.stringify(input).length).toBeLessThan(40000);
    expect(() =>
      v7ParsePlan(
        {
          intention: '',
          steps: [{ action: openWait, repeat: 1, until: null, guard: null }],
          repeat: 1,
          until: null,
          interrupts: [],
          notes: [],
          preferences: [],
          projects: [p],
        },
        w.eventTypes,
        true,
      ),
    ).not.toThrow();
  });
  it('requires independent acceptance and keeps received claims separate from personally verified knowledge', () => {
    let w = v7Clone(initialOpenWorld());
    w.objects = [];
    w.terrain = w.terrain.map((row) => '.'.repeat(row.length));
    const a = actorOf(w),
      b = w.actors[1];
    if (!b) throw new Error('Missing second actor');
    a.position = { x: 8, y: 8 };
    b.position = { x: 9, y: 8 };
    a.memory.knowledge = {
      fact: {
        key: 'fact',
        subject: 'branch',
        property: 'load',
        value: false,
        method: 'physical trial',
        condition: 'tested',
        evidence: 'fixture-event',
        tick: 0,
        verified: true,
      },
    };
    w = v7Clone(
      step(w, {
        interface: 'exchange',
        args: { recipient: b.id, finding: 'fact', mode: 'offer' },
      }).world,
    );
    expect(w.actors[1]?.memory.knowledge?.fact).toBeUndefined();
    w = v7Clone(
      v7Step(
        w,
        {
          ...waits(w),
          [b.id]: {
            interface: 'exchange',
            args: { recipient: a.id, finding: 'fact', mode: 'accept' },
          },
        },
        continuousRegistry(w),
      ).world,
    );
    expect(w.actors[1]?.memory.knowledge?.fact).toMatchObject({
      verified: false,
      receivedFrom: a.id,
    });
    expect(w.events.filter((e) => e.type === 'satisfaction')).toHaveLength(2);
    expect(
      step(w, {
        interface: 'exchange',
        args: { recipient: b.id, finding: 'fact', mode: 'accept' },
      }).outcomes.lin?.success,
    ).toBe(false);
  });
  it('local hazards have fixed scope and recovery and cannot change global policy or disable basic recovery', () => {
    const w = v7Clone(initialOpenWorld());
    w.tick = 300;
    expect(openConditions(w, { x: 9, y: 10 }).drought).toBeGreaterThan(0.5);
    expect(openConditions(w, { x: 40, y: 30 }).drought).toBe(0);
    w.tick = 450;
    expect(openConditions(w, { x: 9, y: 10 }).drought).toBe(0);
    const a = actorOf(w);
    if (a.experience) a.experience.mental = -1;
    expect(forestRestFactor(w, a)).toBe(0.85);
  });
});

describe('persistent process conservation and composition', () => {
  const prepared = () => {
    const f = openFixture();
    const w = v7Clone(v7Install(f.world, f.registry, 'fixture-package@1'));
    actorOf(w).mastered.push('fixture-first', 'fixture-second');
    return { ...f, world: w };
  };
  it('continues after departure and serialization, pays wear/heat once and uses a real prior product in a dependent capability', () => {
    const f = prepared();
    let w = v7Step(
      f.world,
      {
        lin: { interface: 'fixture-first', args: { target: 'fixture-input' } },
      },
      f.registry,
    ).world;
    expect(w.processes).toHaveLength(1);
    expect(w.stacks[0]?.quantity).toBe(1);
    w = v7Clone(w);
    actorOf(w).position = { x: 15, y: 15 };
    for (let n = 0; n < 3; n++)
      w = v7Step(
        JSON.parse(JSON.stringify(w)) as V7World,
        { lin: openWait },
        f.registry,
      ).world;
    expect(w.processes).toHaveLength(0);
    expect(w.objects[0]?.data.service).toBeCloseTo(9.7);
    expect(w.objects[0]?.data.availableHeat).toBeCloseTo(9.4);
    const first = w.stacks.find((s) => s.resource === 'fixture-strip');
    expect(first?.processing?.inputs).toBeDefined();
    if (!first) throw new Error('Missing real first output');
    w = v7Clone(w);
    actorOf(w).position = { x: 8, y: 8 };
    w = v7Step(
      w,
      { lin: { interface: 'pickup', args: { target: first.id, quantity: 1 } } },
      f.registry,
    ).world;
    const owned = w.stacks.find(
      (s) => s.resource === 'fixture-strip' && s.owner === 'lin',
    );
    if (!owned) throw new Error('Missing picked-up output');
    w = v7Step(
      w,
      { lin: { interface: 'fixture-second', args: { target: owned.id } } },
      f.registry,
    ).world;
    for (let n = 0; n < 3; n++)
      w = v7Step(w, { lin: openWait }, f.registry).world;
    expect(w.stacks.filter((s) => s.resource === 'fixture-strip')).toHaveLength(
      0,
    );
    const final = w.stacks.find((s) => s.resource === 'fixture-joined');
    expect(final?.processing?.dependencies).toEqual({
      abilities: ['fixture-first'],
      knowledge: [],
    });
    expect(JSON.stringify(final?.processing?.inputs)).toContain(first.origin);
    expect(
      w.stacks.reduce(
        (sum, s) =>
          sum +
          s.quantity *
            (w.resources.find((r) => r.id === s.resource)?.mass ?? 0),
        0,
      ),
    ).toBeCloseTo(2.2);
  });
  it('stalls without sufficient energy, cancels at its actual station exactly once, and preserves paid effort', () => {
    const f = prepared();
    let w = v7Step(
      f.world,
      {
        lin: { interface: 'fixture-first', args: { target: 'fixture-input' } },
      },
      f.registry,
    ).world;
    w = v7Clone(w);
    const station = w.objects[0];
    if (station) station.data.availableHeat = 0;
    w = v7Clone(v7Step(w, { lin: openWait }, f.registry).world);
    expect(w.processes[0]?.data.progress).toBe(0);
    const p = w.processes[0];
    if (!p) throw new Error('Missing process');
    openStopProcess(w, p, 'fixture cancellation');
    openStopProcess(w, p, 'duplicate cancellation');
    expect(w.stacks.reduce((n, s) => n + s.quantity, 0)).toBe(2);
    expect(w.stacks.find((s) => s.owner === null)?.position).toEqual({
      x: 8.8,
      y: 8,
    });
    expect(actorOf(w).vitals.energy).toBe(39);
  });
});

it('keeps accumulated projects and capability discovery outside bounded expanded context while retaining exact lookup', async () => {
  const { continuousInputText } =
    await import('../src/forest-input-encoding.js');
  const w = v7Clone(initialOpenWorld()),
    a = actorOf(w),
    prototype = w.abilities.find((x) => x.id === 'probe');
  if (!prototype) throw new Error('Missing baseline probe');
  for (let i = 0; i < 60; i++) {
    const id = `test-capability-${String(i)}`;
    w.abilities.push({
      ...v7Clone(prototype),
      id,
      authored: false,
      function: 'A synthetic distinct test function ' + String(i),
      costs: 'Recorded cost '.repeat(100),
      effects: 'Recorded physical effect '.repeat(100),
    });
    a.mastered.push(id);
  }
  for (let i = 0; i < 1000; i++)
    openSaveProjects(
      a,
      [
        {
          id: `question-${String(i)}`,
          status: 'paused',
          question: 'Retained question',
          evidence: [],
          uncertainty: 'Unknown',
          goal: 'Personal goal',
          completedSteps: [],
          outputs: [],
          missing: 'Evidence',
          next: 'Reconsider',
          pauseReason: 'Other priorities',
          benefit: '',
        },
      ],
      i,
    );
  const input = ordinaryContinuousInput(w, a.id, undefined, 650);
  expect(input.catalogue.interfaces.length).toBe(18);
  expect(input.memory.projects?.length).toBe(4);
  expect(input.memory.projectCount).toBe(1000);
  expect(continuousInputText(input).length * 2).toBeLessThanOrEqual(
    w.config.computation.inputBytes,
  );
  const r = step(w, {
    interface: 'consult',
    args: { kind: 'project', subject: 'question-0' },
  });
  expect(r.outcomes.lin?.success).toBe(true);
  expect(
    r.world.events.find((e) => e.type === 'record-consulted')?.data.record,
  ).toMatchObject({ id: 'question-0' });
});
