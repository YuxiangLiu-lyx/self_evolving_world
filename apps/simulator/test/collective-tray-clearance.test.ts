import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  trayClearanceHistory,
  trayClearanceResult,
} from '@self-evolving-world/world-core';
import type { V7Execution } from '../src/continuous-run.js';
import { initialCollectiveWorld } from '../src/collective-scenario.js';
import { rootStep, trayBuild } from './fixtures/collective-roots.js';
import {
  clearanceFixture,
  clearanceFrames,
  clearanceResult,
  clearanceAction,
  clearanceId,
} from './fixtures/collective-tray-clearance.js';
function present<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('Missing fixture data.');
  return v;
}
describe('paid root tray placement diagnostics', () => {
  it('shares the real construction clearance while exposing the performer body without consuming materials', () => {
    const f = clearanceFrames();
    expect(clearanceResult(f.blocked).failedChecks).toEqual(['clearance']);
    expect(JSON.stringify(clearanceResult(f.blocked))).toContain(
      'performer-body',
    );
    expect(clearanceResult(f.clear).suitable).toBe(true);
    expect(f.clear.objects).toEqual(f.initial.objects);
    expect(f.clear.stacks.map((s) => [s.id, s.quantity])).toEqual(
      f.initial.stacks.map((s) => [s.id, s.quantity]),
    );
    expect(present(f.clear.actors[0]).vitals.energy).toBeCloseTo(
      present(f.initial.actors[0]).vitals.energy - 0.4,
    );
    expect(rootStep(f.initial, trayBuild).outcomes['ash-1']?.success).toBe(
      true,
    );
    expect(
      rootStep(f.initial, { ...trayBuild, args: { ...trayBuild.args, x: 10 } })
        .outcomes['ash-1']?.success,
    ).toBe(false);
    expect(rootStep(f.read, trayBuild).outcomes['ash-1']?.success).toBe(false);
  });
  it('retains immutable personal reads across restore, deduplicates feedback and forbids another person reading them', () => {
    const f = clearanceFrames();
    expect(clearanceResult(f.read)).toEqual(clearanceResult(f.clear));
    expect(f.read.events.some((e) => e.type === 'information-confirmed')).toBe(
      false,
    );
    const repeat = rootStep(f.clear, clearanceAction()).world;
    expect(repeat.events.some((e) => e.type === 'information-confirmed')).toBe(
      false,
    );
    const restored = v7Clone(f.read);
    expect(clearanceResult(restored)).toEqual(clearanceResult(f.clear));
    const b = present(restored.actors[1]);
    b.mastered.push('root-air-drying', clearanceId);
    const bad = rootStep(
      restored,
      {
        interface: clearanceId,
        args: {
          mode: 'read',
          assessmentId: clearanceResult(f.clear).assessmentId ?? '',
        },
      },
      b.id,
    );
    expect(bad.outcomes[b.id]?.success).toBe(false);
    expect(trayClearanceResult(present(bad.world.actors[1]))).toBeNull();
    expect(trayClearanceHistory(present(restored.actors[0]))).toHaveLength(2);
  });
  it('does not reveal remote obstacles, certify unobserved support or add plant collision rules', () => {
    const w = clearanceFixture();
    w.objects.push({
      id: 'unseen-secret',
      name: 'Hidden object',
      kind: 'fixture',
      spatial: {
        x: 60,
        y: 60,
        angle: 0,
        shape: { kind: 'circle', radius: 1 },
        solid: true,
        interaction: 0,
        entrances: [],
      },
      visual: {
        component: 'resource',
        color: '#fff',
        accent: '#000',
        label: 'Hidden',
        state: 'ready',
      },
      data: {},
      createdBy: null,
      createdAt: 0,
      revision: 'fixture',
    });
    const remote = rootStep(w, clearanceAction(60, 60)).world;
    expect(clearanceResult(remote).unresolvedChecks).toEqual([
      'observability',
      'support',
      'clearance',
    ]);
    expect(JSON.stringify(clearanceResult(remote))).not.toContain(
      'unseen-secret',
    );
    const plant = v7Clone(present(w.objects[0]));
    plant.id = 'visible-nonsolid-plant';
    plant.kind = 'plant';
    plant.spatial.x = 10.7;
    plant.spatial.y = 10;
    plant.spatial.solid = false;
    w.objects = [plant];
    expect(clearanceResult(rootStep(w, clearanceAction()).world).suitable).toBe(
      true,
    );
    plant.spatial.reserved = true;
    expect(
      clearanceResult(rootStep(w, clearanceAction()).world).failedChecks,
    ).toContain('clearance');
  });
  it('rejects invalid or unaffordable work before payment, reports independent failures and requires individual learning', () => {
    const w = clearanceFixture(),
      a = present(w.actors[0]);
    a.vitals.energy = 0.1;
    const failed = rootStep(w, clearanceAction());
    expect(failed.outcomes[a.id]?.success).toBe(false);
    expect(trayClearanceResult(present(failed.world.actors[0]))).toBeNull();
    const invalid = rootStep(clearanceFixture(), clearanceAction(-1));
    expect(invalid.outcomes[a.id]?.success).toBe(false);
    const b = clearanceFixture();
    present(b.actors[0]).mastered = present(b.actors[0]).mastered.filter(
      (x) => x !== clearanceId,
    );
    expect(rootStep(b, clearanceAction()).outcomes[a.id]?.success).toBe(false);
    expect(
      continuousRegistry(
        initialCollectiveWorld('collective-ex11', 'A'),
      ).packages.some((p) => p.id === clearanceId),
    ).toBe(false);
    const boundary = clearanceResult(
      rootStep(clearanceFixture(), clearanceAction(0.1, 0.1)).world,
    );
    expect(boundary.failedChecks).toEqual(['bounds', 'reach']);
  });
  it('reproduces the real round-127 requester geometry without inventing a historical blocker', () => {
    const saved = JSON.parse(
      readFileSync(
        'experiment/ex12/checkpoints/development-000127-411-11.json',
        'utf8',
      ),
    ) as { state: V7Execution };
    const w = v7Clone(
      v7Install(
        saved.state.world,
        continuousRegistry(saved.state.world),
        clearanceId + '@1',
      ),
    );
    const a = present(w.actors.find((a) => a.id === 'ash-1'));
    a.mastered.push(clearanceId);
    const r = rootStep(w, clearanceAction(a.position.x, a.position.y), a.id);
    expect(r.outcomes[a.id]?.success).toBe(true);
    const result = trayClearanceResult(
      present(r.world.actors.find((person) => person.id === a.id)),
    );
    expect(JSON.stringify(result)).toContain('performer-body');
  });
});
