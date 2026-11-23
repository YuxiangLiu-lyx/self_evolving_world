import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
  v7Distance,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const ID = 'source-bound-joining-trial',
  VINE = 'item-66-lin-388',
  BRANCH = 'item-76-lin-448';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, action: V7Action) =>
  v7Step(w, { lin: action, moss: wait, sol: wait }, continuousRegistry(w));
const actor = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'lin');
  if (!a) throw new Error('Missing actor');
  return a;
};
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/joining-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const initial = v7Clone(raw.world);
  let w = v7Clone(v7Install(initial, continuousRegistry(initial), ID + '@1'));
  expect(w.stacks).toEqual(initial.stacks);
  expect(w.actors).toEqual(initial.actors);
  expect(w.objects).toEqual(initial.objects);
  let point: { x: number; y: number } | null = null;
  for (let y = 3; y < 30 && !point; y++)
    for (let x = 3; x < 44 && !point; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (
        !['~', '=', ',', ':'].includes(w.terrain[y]?.[x] ?? '~') &&
        w.objects.every((o) => v7Distance(o.spatial, p) > 2) &&
        w.actors
          .filter((a) => a.id !== 'lin')
          .every((a) => v7Distance(a.position, p) > 2)
      )
        point = p;
    }
  if (!point) throw new Error('Missing isolated test patch');
  actor(w).position = { x: point.x - 0.6, y: point.y };
  const assess: V7Action = {
    interface: ID,
    args: {
      mode: 'assess',
      vineStackId: VINE,
      branchStackId: BRANCH,
      ...point,
    },
  };
  expect(step(w, assess).outcomes.lin?.success).toBe(false);
  w = v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
  expect(actor(w).mastered).not.toContain(ID);
  w = v7Clone(step(w, wait).world);
  expect(actor(w).mastered).toContain(ID);
  const r = step(w, assess);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(actor(r.world).vitals.energy).toBeCloseTo(
    actor(w).vitals.energy - 0.5,
  );
  const knowledge = actor(r.world).memory.knowledge?.['joining-geometry'];
  if (!knowledge) throw new Error('Missing actual measured record');
  const wrap: V7Action = {
    interface: ID,
    args: {
      mode: 'wrap',
      measurementId: knowledge.evidence,
      branchPieceA: 'canopy-18:withdrawn-piece-0',
      branchPieceB: 'canopy-18:withdrawn-piece-1',
      vinePiece: 'forest-vine-1:retained-section',
      segmentStart: 0,
      segmentEnd: 1,
      ...point,
    },
  };
  return { w: v7Clone(r.world), wrap, assess };
}
function quantities(w: V7World) {
  return w.stacks
    .filter((s) => [VINE, BRANCH].includes(s.id))
    .map((s) => [s.id, s.resource, s.quantity, s.origin]);
}
const object = (w: V7World) => {
  const o = w.objects.find((o) => o.kind === 'loose-wrap-trial');
  if (!o) throw new Error('Missing physical arrangement');
  return o;
};
it('measures actual versioned geometry then places, wraps and recovers exact whole sources with paid stages and no reward', () => {
  const f = fixture(),
    before = quantities(f.w),
    energy = actor(f.w).vitals.energy;
  expect(
    continuousRegistry(initialLongWorld('other')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
  const placed = step(f.w, f.wrap);
  expect(placed.outcomes.lin?.success, placed.outcomes.lin?.reason).toBe(true);
  expect(actor(placed.world).vitals.energy).toBeCloseTo(energy - 0.5);
  expect(quantities(placed.world)).toEqual(before);
  expect(
    placed.world.stacks
      .filter((s) => [VINE, BRANCH].includes(s.id))
      .every(
        (s) => s.owner === null && s.reservedFor === object(placed.world).id,
      ),
  ).toBe(true);
  expect(object(placed.world).data.stage).toBe('positioned');
  const finished = step(v7Clone(placed.world), f.wrap);
  expect(finished.outcomes.lin?.success, finished.outcomes.lin?.reason).toBe(
    true,
  );
  expect(object(finished.world).data.stage).toBe('wrapped-unverified');
  expect(actor(finished.world).vitals.energy).toBeCloseTo(energy - 1);
  expect(
    finished.world.events.some(
      (e) =>
        e.actor === 'lin' &&
        ['satisfaction', 'practice-confirmed'].includes(e.type),
    ),
  ).toBe(false);
  expect(
    step(JSON.parse(JSON.stringify(placed.world)) as V7World, f.wrap).world,
  ).toEqual(finished.world);
  const recover: V7Action = {
    interface: ID,
    args: { mode: 'recover', arrangementId: object(finished.world).id },
  };
  const r = step(v7Clone(finished.world), recover);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(quantities(r.world)).toEqual(before);
  expect(actor(r.world).vitals.energy).toBeCloseTo(energy - 1.5);
  expect(
    r.world.stacks
      .filter((s) => [VINE, BRANCH].includes(s.id))
      .every((s) => s.owner === 'lin' && !s.reservedFor),
  ).toBe(true);
  expect(step(v7Clone(r.world), recover).outcomes.lin?.success).toBe(false);
});
it('refuses altered geometry, fractional selection, force claims, foreign input and occupied ground before payment', () => {
  const f = fixture(),
    energy = actor(f.w).vitals.energy;
  for (const patch of [
    { segmentEnd: 0.5 },
    { branchPieceB: 'fake' },
    { measurementId: 'unperformed' },
    { mode: 'separate' },
  ]) {
    const r = step(v7Clone(f.w), {
      ...f.wrap,
      args: { ...f.wrap.args, ...patch },
    });
    expect(r.outcomes.lin?.success).toBe(false);
    expect(actor(r.world).vitals.energy).toBe(energy);
  }
  const changed = v7Clone(f.w),
    vine = changed.stacks.find((s) => s.id === VINE);
  if (!vine) throw new Error('Missing vine');
  vine.quantity = 0.8;
  vine.quantityTenths = 8;
  expect(step(changed, f.wrap).outcomes.lin?.success).toBe(false);
  const foreign = v7Clone(f.w);
  const branch = foreign.stacks.find((s) => s.id === BRANCH);
  if (!branch) throw new Error('Missing branch');
  branch.owner = 'moss';
  expect(step(foreign, f.assess).outcomes.lin?.success).toBe(false);
  const blocked = v7Clone(f.w);
  blocked.stacks.push({
    id: 'fixture-ground',
    resource: 'stone',
    quantity: 1,
    owner: null,
    origin: 'fixture-only',
    position: { x: Number(f.wrap.args.x), y: Number(f.wrap.args.y) },
  });
  expect(step(blocked, f.wrap).outcomes.lin?.success).toBe(false);
});
it('pauses exact work without charging, resumes remaining labor, and leaves placed matter on cancellation or death', () => {
  const f = fixture(),
    placed = step(f.w, f.wrap),
    o = object(placed.world),
    processId = o.data.activeWork;
  if (typeof processId !== 'string')
    throw new Error('Missing actual process ID');
  const remote = v7Clone(placed.world);
  actor(remote).position = { x: 1, y: 1 };
  const resume: V7Action = {
    interface: ID,
    args: { mode: 'resume', processId },
  };
  const paused = step(remote, resume);
  expect(actor(paused.world).vitals.energy).toBe(actor(remote).vitals.energy);
  expect(object(paused.world).data.remainingWork).toBe(1);
  const back = v7Clone(paused.world);
  actor(back).position = { ...actor(f.w).position };
  expect(object(step(back, resume).world).data.stage).toBe(
    'wrapped-unverified',
  );
  const cancel: V7Action = {
    interface: ID,
    args: { mode: 'cancel', processId },
  };
  const stopped = step(v7Clone(paused.world), cancel);
  expect(object(stopped.world).data.stage).toBe('cancelled-positioned');
  expect(quantities(stopped.world)).toEqual(quantities(f.w));
  expect(step(v7Clone(stopped.world), cancel).outcomes.lin?.success).toBe(
    false,
  );
  const dying = v7Clone(placed.world);
  actor(dying).vitals.health = 0.1;
  actor(dying).vitals.satiety = 0;
  const dead = step(dying, wait);
  expect(
    dead.world.events.some((e) => e.type === 'died' && e.actor === 'lin'),
  ).toBe(true);
  expect(object(dead.world).data.activeWork).toBeNull();
  expect(quantities(dead.world)).toEqual(quantities(f.w));
  expect(
    dead.world.stacks
      .filter((s) => [VINE, BRANCH].includes(s.id))
      .every((s) => s.owner === null),
  ).toBe(true);
});
it('keeps observed pieces stable and private on repeated paid assessment without rerolls or discovery rewards', () => {
  const f = fixture(),
    old = actor(f.w).memory.knowledge?.['joining-geometry'];
  const r = step(f.w, f.assess);
  const current = actor(r.world).memory.knowledge?.['joining-geometry'];
  expect(r.outcomes.lin?.success).toBe(true);
  if (
    !old ||
    !current ||
    !old.value ||
    typeof old.value !== 'object' ||
    Array.isArray(old.value) ||
    !current.value ||
    typeof current.value !== 'object' ||
    Array.isArray(current.value)
  )
    throw new Error('Missing measured record');
  expect(current.value.pieces).toEqual(old.value.pieces);
  expect(current.value.sources).toEqual(old.value.sources);
  expect(
    r.world.actors.find((a) => a.id === 'moss')?.memory.knowledge?.[
      'joining-geometry'
    ],
  ).toBeUndefined();
  expect(
    r.world.events.some(
      (e) =>
        e.actor === 'lin' &&
        [
          'satisfaction',
          'information-confirmed',
          'practice-confirmed',
        ].includes(e.type),
    ),
  ).toBe(false);
});
