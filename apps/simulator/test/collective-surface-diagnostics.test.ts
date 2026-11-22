import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Install,
  v7Clone,
  v7Step,
  surfaceDiagnosticHistory,
  surfaceDiagnosticResult,
} from '@self-evolving-world/world-core';
import type { V7Data } from '@self-evolving-world/world-core';
import type { V7Execution } from '../src/continuous-run.js';
import { collectiveInput } from '../src/collective-input.js';
import { initialCollectiveWorld } from '../src/collective-scenario.js';
import { rootStep } from './fixtures/collective-roots.js';
import {
  surfaceMust,
  surfaceFrames,
  surfaceAction,
  surfaceJob,
} from './fixtures/collective-root-surface.js';
import {
  diagnosticAction,
  diagnosticFixture,
  diagnosticFrames,
  diagnosticResult,
  diagnosticsId,
} from './fixtures/collective-surface-diagnostics.js';
const checks = (r: V7Data) =>
  Array.isArray(r.checks)
    ? r.checks.filter(
        (c): c is V7Data => !!c && typeof c === 'object' && !Array.isArray(c),
      )
    : [];
function present<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('Missing fixture record.');
  return v;
}
describe('independent retained surface checks without relaxed physical requirements', () => {
  it('identifies the performer collision and independently evaluates tool, sheet, reach and support with no food', () => {
    const f = diagnosticFrames(),
      r = diagnosticResult(f.blocked);
    expect(r.suitable).toBe(false);
    expect(r.failedChecks).toEqual(['clearance']);
    expect(checks(r).find((c) => c.code === 'tool-hardness')).toMatchObject({
      status: 'pass',
      required: { minimum: 3 },
    });
    expect(
      checks(r).find((c) => c.code === 'personal-contact-inspection')?.status,
    ).toBe('pass');
    expect(
      checks(r).find((c) => c.code === 'clearance')?.evidenceIds,
    ).toContain('ash-1');
    expect(r.geometry).toMatchObject({ mass: 0.09, width: 0.3, height: 0.2 });
    expect(diagnosticResult(f.clear)).toMatchObject({
      suitable: true,
      failedChecks: [],
      unresolvedChecks: [],
      remainingWork: 0,
    });
    expect(f.blocked.stacks.map((s) => [s.id, s.quantity])).toEqual(
      f.legacy.stacks.map((s) => [s.id, s.quantity]),
    );
    expect(present(f.blocked.actors[0]).vitals.energy).toBeCloseTo(
      present(f.legacy.actors[0]).vitals.energy - 0.2,
      6,
    );
    expect(f.clear.processes).toEqual(f.legacy.processes);
    expect(f.clear.objects).toEqual(f.legacy.objects);
  });
  it('retains legacy uncertainty and reads immutable personal results despite changed current geometry, without duplicate feedback', () => {
    const f = diagnosticFrames();
    expect(diagnosticResult(f.legacy)).toMatchObject({
      legacy: true,
      suitable: null,
      unresolvedChecks: ['legacy-diagnostics'],
    });
    expect(diagnosticResult(f.read)).toEqual(diagnosticResult(f.clear));
    expect(
      f.read.events.some((e) =>
        ['information-confirmed', 'practice-confirmed'].includes(e.type),
      ),
    ).toBe(false);
    const a = present(f.read.actors[0]);
    expect(surfaceDiagnosticHistory(a)).toHaveLength(3);
    expect(surfaceDiagnosticResult(present(v7Clone(f.read).actors[0]))).toEqual(
      diagnosticResult(f.read),
    );
    const repeat = surfaceMust(f.clear, diagnosticAction());
    expect(repeat.events.some((e) => e.type === 'information-confirmed')).toBe(
      false,
    );
  });
  it('reports multiple independent failures and unknown dimensions without inventing a connected sheet or hidden evidence', () => {
    const f = diagnosticFrames();
    expect(diagnosticResult(f.unknown).unresolvedChecks).toContain(
      'sheet-geometry',
    );
    expect(
      checks(diagnosticResult(f.unknown)).find(
        (c) => c.code === 'tool-hardness',
      )?.status,
    ).toBe('pass');
    const w = diagnosticFixture(),
      stone = present(w.stacks.find((s) => s.id === 'fixture-stone'));
    stone.quantity = 0.5;
    stone.quantityTenths = 5;
    const resource = present(w.resources.find((r) => r.id === 'stone'));
    resource.properties = { ...present(resource.properties), hardness: 1 };
    const actor = present(w.actors[0]);
    const out = surfaceMust(
      w,
      diagnosticAction({ site: { ...actor.position } }),
    );
    expect(diagnosticResult(out).failedChecks).toEqual(
      expect.arrayContaining([
        'tool-hardness',
        'tool-form-quantity',
        'clearance',
      ]),
    );
    const far = surfaceMust(w, diagnosticAction({ site: { x: 70, y: 60 } }));
    expect(diagnosticResult(far).failedChecks).toContain('reach');
    expect(
      checks(diagnosticResult(far)).find((c) => c.code === 'support'),
    ).toMatchObject({ status: 'unknown', observed: [] });
  });
  it('requires separate learning, exact owned access, paid commitment and preserves isolation of personal reads and public context', () => {
    const w = diagnosticFixture(),
      actor = present(w.actors[0]);
    actor.mastered = actor.mastered.filter((id) => id !== diagnosticsId);
    expect(rootStep(w, diagnosticAction()).outcomes['ash-1']?.success).toBe(
      false,
    );
    const f = diagnosticFrames(),
      r = diagnosticResult(f.clear);
    const input = JSON.stringify(
      collectiveInput(f.clear, 'ash', ['ash-1'], {}, 'individual', 100),
    );
    expect(input).toContain(JSON.stringify(r));
    expect(
      JSON.stringify(
        collectiveInput(f.clear, 'ash', [], {}, 'coordination', 100),
      ),
    ).not.toContain(
      typeof r.assessmentId === 'string'
        ? r.assessmentId
        : 'missing-assessment-id',
    );
    const other = v7Clone(f.clear),
      second = present(other.actors[1]);
    second.mastered.push(diagnosticsId);
    second.collective?.knownAbilities.push(diagnosticsId);
    const actions = Object.fromEntries(
      other.actors.map((a) => [
        a.id,
        a.id === second.id
          ? diagnosticAction({ assessmentId: r.assessmentId ?? null })
          : { interface: 'wait', args: {} },
      ]),
    );
    expect(
      v7Step(other, actions, continuousRegistry(other)).outcomes[second.id]
        ?.success,
    ).toBe(false);
    for (const target of [
      'never-existed',
      'actual-ground',
      'item: fixture-bark-0',
    ])
      expect(
        rootStep(f.clear, diagnosticAction({ barkId: target })).outcomes[
          'ash-1'
        ]?.success,
      ).toBe(false);
    const tired = diagnosticFixture();
    present(tired.actors[0]).vitals.energy = 0;
    const before = diagnosticResult(tired),
      failed = rootStep(tired, diagnosticAction());
    expect(failed.outcomes['ash-1']?.success).toBe(false);
    expect(diagnosticResult(failed.world)).toEqual(before);
    const dead = diagnosticFixture();
    present(dead.actors[0]).vitals.health = 0;
    expect(
      rootStep(dead, diagnosticAction()).world.events.some(
        (e) => e.type === 'root-surface-assessed',
      ),
    ).toBe(false);
    const a = initialCollectiveWorld('collective-ex11', 'A');
    expect(() =>
      v7Install(a, continuousRegistry(a), 'root-preparation@3'),
    ).toThrow();
  });
  it('keeps active preparation progress and old personal mastery executable after the diagnostic upgrade', () => {
    const f = surfaceFrames();
    const upgraded = v7Install(
      f.partial,
      continuousRegistry(f.partial),
      'root-preparation@3',
    );
    expect(present(upgraded.actors[0]).mastered).not.toContain(diagnosticsId);
    const complete = surfaceMust(
      upgraded,
      surfaceAction('continue', {
        processId: present(surfaceJob(upgraded)).id,
      }),
    );
    expect(surfaceJob(complete)).toMatchObject({
      status: 'completed',
      paidEnergy: 2,
      remainingWork: 0,
    });
    expect(
      complete.stacks
        .filter((s) => s.resource === 'crushed-root')
        .map((s) => s.quantity),
    ).toEqual([1]);
    expect(complete.stacks.find((s) => s.id === 'fixture-root')?.quantity).toBe(
      1,
    );
  });
  it('explains the real round-111 request and succeeds at a clear nearby site in an isolated control without editing the archive', () => {
    const saved = JSON.parse(
      readFileSync(
        'experiment/ex12/checkpoints/development-000111-361-9.json',
        'utf8',
      ),
    ) as { state: V7Execution };
    const original = saved.state.world;
    const w = v7Clone(
        v7Install(original, continuousRegistry(original), 'root-preparation@3'),
      ),
      actor = present(w.actors.find((a) => a.id === 'birch-5'));
    actor.mastered.push(diagnosticsId);
    actor.collective?.knownAbilities.push(diagnosticsId);
    const base = {
      barkId: 'item-87-birch-5-2400',
      toolId: 'item-87-birch-5-2398',
    };
    const run = (args: V7Data) =>
      v7Step(
        w,
        Object.fromEntries(
          w.actors.map((a) => [
            a.id,
            a.id === actor.id
              ? diagnosticAction(args)
              : { interface: 'wait', args: {} },
          ]),
        ),
        continuousRegistry(w),
      );
    const blocked = run({ ...base, site: { ...actor.position } });
    expect(blocked.outcomes[actor.id]?.success).toBe(true);
    const r = surfaceDiagnosticResult(
      present(blocked.world.actors.find((a) => a.id === actor.id)),
    );
    expect(r?.failedChecks).toContain('clearance');
    expect(
      checks(present(r ?? undefined)).find((c) => c.code === 'clearance')
        ?.evidenceIds,
    ).toContain(actor.id);
    const clear = run(base);
    expect(clear.outcomes[actor.id]?.success).toBe(true);
    expect(
      surfaceDiagnosticResult(
        present(clear.world.actors.find((a) => a.id === actor.id)),
      )?.suitable,
    ).toBe(true);
    expect(original.revisions).not.toContain('root-preparation@3');
    expect(
      original.actors.find((a) => a.id === actor.id)?.mastered,
    ).not.toContain(diagnosticsId);
  });
});
