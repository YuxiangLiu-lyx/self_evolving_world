import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Cursor,
  v7TaskAction,
  v7Step,
  v7FinishTasks,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Data,
  V7World,
} from '@self-evolving-world/world-core';
import { initialForestExperienceWorld } from '../../src/forest-experience-scenario.js';
export const fireRegistry = continuousRegistry();
export const fireWait: V7Action = { interface: 'wait', args: {} };
export const fireAction = (mode: string, args: V7Data = {}): V7Action => ({
  interface: 'tend-fire',
  args: { mode, ...args },
});
export function fireFixture() {
  const w = v7Clone(initialForestExperienceWorld());
  w.objects = [];
  w.processes = [];
  w.terrain = w.terrain.map((r) => '.'.repeat(r.length));
  w.actors.forEach((a, i) => {
    a.position = { x: 10 + i * 4, y: 10 };
    a.vitals.satiety = 95;
    a.vitals.temperature = 12;
    a.memory.objects = [];
    a.memory.stacks = [];
  });
  // Fixed dry ignition window in this isolated fixture, not a formal-run policy change.
  w.tick = 545;
  w.time = 545;
  w.stacks = [
    ['branch', 7],
    ['stone', 4],
    ['bark', 2],
    ['vine', 1],
    ['dry-grass', 1],
  ].map(([r, n]) => ({
    id: 'fixture-' + String(r),
    resource: String(r),
    quantity: Number(n),
    owner: 'lin',
    position: { x: 10, y: 10 },
    origin: 'isolated-material-fixture',
    fuelMoisture: 0,
  }));
  return v7Clone(v7Install(w, fireRegistry, 'local-fire@1'));
}
export function fireOperation(
  w: V7World,
  action: V7Action,
  id = 'lin',
  limit = 30,
) {
  const cursors = {
    [id]: v7Cursor(
      {
        intention: 'Isolated operation, never ordinary model context',
        steps: [{ action, repeat: 1, until: null, guard: null }],
        repeat: 1,
        until: null,
        interrupts: [],
        notes: [],
        preferences: [],
      },
      w.tick,
    ),
  };
  const frames: V7World[] = [];
  const outcomes = [];
  for (let n = 0; n < limit; n++) {
    const cursor = cursors[id];
    if (!cursor) throw new Error('Missing isolated cursor');
    const selected = v7TaskAction(w, id, cursor);
    if (!selected) break;
    const r = v7Step(
      w,
      { lin: fireWait, moss: fireWait, sol: fireWait, [id]: selected },
      fireRegistry,
      cursors,
    );
    if (r.paused) throw new Error(r.paused);
    outcomes.push(r.outcomes[id]);
    v7FinishTasks(w, r, cursors);
    Object.assign(
      cursors,
      JSON.parse(JSON.stringify(cursors)) as typeof cursors,
    );
    w = v7Clone(r.world);
    frames.push(w);
    if (r.outcomes[id]?.success === false) break;
  }
  return { world: w, frames, outcomes, cursors };
}
export function fireStudy(w: V7World, id = 'lin') {
  let r = v7Step(
    w,
    {
      lin: fireWait,
      moss: fireWait,
      sol: fireWait,
      [id]: { interface: 'learn', args: { ability: 'tend-fire' } },
    },
    fireRegistry,
  );
  for (let n = 1; n < 6; n++)
    r = v7Step(
      r.world,
      { lin: fireWait, moss: fireWait, sol: fireWait },
      fireRegistry,
    );
  return v7Clone(r.world);
}
export function fireSetup() {
  let w = fireStudy(fireFixture());
  const frames: V7World[] = [];
  const run = (a: V7Action) => {
    const r = fireOperation(w, a);
    if (r.outcomes.some((o) => !o?.success))
      throw new Error(JSON.stringify(r.outcomes));
    w = r.world;
    frames.push(...r.frames);
  };
  run(
    fireAction('prepare', {
      target: 'item:fixture-branch',
      materials: [{ target: 'item:fixture-branch', quantity: 1 }],
    }),
  );
  run(
    fireAction('build', {
      x: 11,
      y: 10,
      materials: [
        { target: 'fixture-stone', quantity: 4 },
        { target: 'fixture-bark', quantity: 2 },
        { target: 'fixture-vine', quantity: 1 },
      ],
    }),
  );
  const site = w.objects.find((o) => o.kind === 'stone-hearth');
  if (!site) throw new Error('Paid fixture hearth missing');
  run(
    fireAction('feed', {
      target: site.id,
      materials: [
        { target: 'fixture-branch', quantity: 3 },
        { target: 'fixture-dry-grass', quantity: 0.5 },
      ],
    }),
  );
  run(fireAction('ignite', { target: site.id }));
  return { world: w, frames, site: site.id };
}
