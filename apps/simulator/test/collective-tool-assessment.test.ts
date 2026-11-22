import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  toolAssessmentResult,
  toolAssessmentHistory,
} from '@self-evolving-world/world-core';
import type { V7Execution } from '../src/continuous-run.js';
import { initialCollectiveWorld } from '../src/collective-scenario.js';
import { rootStep } from './fixtures/collective-roots.js';
import {
  toolAction,
  toolFixture,
  toolFrames,
  toolId,
  toolResult,
} from './fixtures/collective-tool-assessment.js';
function present<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('Missing fixture data.');
  return v;
}
describe('standalone provenance-backed tool inspection', () => {
  it('uses actual registry hardness without a scratch claim or reward and changes no material', () => {
    const f = toolFrames();
    expect(toolResult(f.assessed)).toMatchObject({
      suitable: true,
      entireSetupCertified: false,
      remainingWork: 0,
      evidenceSource: { resolvedHardness: 8 },
    });
    expect(f.assessed.stacks).toEqual(f.initial.stacks);
    expect(present(f.assessed.actors[0]).vitals.energy).toBeCloseTo(
      present(f.initial.actors[0]).vitals.energy - 0.2,
    );
    expect(
      f.assessed.events.some(
        (e) =>
          e.type === 'information-confirmed' || e.type === 'practice-confirmed',
      ),
    ).toBe(false);
    expect(f.assessed.state['hardness:intrinsic:fixture-stone']).toEqual(
      f.initial.state['hardness:intrinsic:fixture-stone'],
    );
  });
  it('retains personal dated reads, live damage and unknown hardness without name inference', () => {
    const f = toolFrames();
    expect(toolResult(f.damaged).suitable).toBe(false);
    expect(toolResult(f.read)).toEqual(toolResult(f.assessed));
    expect(toolResult(f.unknown)).toMatchObject({
      suitable: false,
      evidenceSource: { resolvedHardness: null },
    });
    expect(JSON.stringify(toolResult(f.unknown))).toContain('unknown');
    const a = present(f.read.actors[0]);
    expect(toolAssessmentHistory(a)).toHaveLength(2);
    expect(toolAssessmentResult(present(v7Clone(f.read).actors[0]))).toEqual(
      toolResult(f.assessed),
    );
    const repeat = rootStep(f.assessed, toolAction).world;
    expect(repeat.events.some((e) => e.type === 'information-confirmed')).toBe(
      false,
    );
  });
  it('honors carried ownership despite stale coordinates and rejects missing reserved ground or other-owned tools', () => {
    const w = toolFixture(),
      s = present(w.stacks[0]);
    s.position = { x: 80, y: 60 };
    expect(rootStep(w, toolAction).outcomes['ash-1']?.success).toBe(true);
    for (const variant of ['ground', 'other', 'reserved', 'missing']) {
      const bad = v7Clone(w),
        t = present(bad.stacks[0]);
      if (variant === 'ground') t.owner = null;
      if (variant === 'other') t.owner = 'ash-2';
      if (variant === 'reserved') t.reservedFor = 'fixture-work';
      if (variant === 'missing') bad.stacks = [];
      expect(rootStep(bad, toolAction).outcomes['ash-1']?.success).toBe(false);
      expect(
        toolAssessmentResult(
          present(rootStep(bad, toolAction).world.actors[0]),
        ),
      ).toBeNull();
    }
  });
  it('requires personal learning, affordable atomic payment and private record ownership', () => {
    const w = toolFixture(),
      a = present(w.actors[0]);
    a.vitals.energy = 0.1;
    expect(rootStep(w, toolAction).outcomes[a.id]?.success).toBe(false);
    const f = toolFrames(),
      b = present(f.assessed.actors[1]);
    b.mastered.push('root-preparation', 'root-preparation-surface', toolId);
    expect(
      rootStep(
        f.assessed,
        {
          interface: toolId,
          args: {
            mode: 'read',
            assessmentId: toolResult(f.assessed).assessmentId ?? '',
          },
        },
        b.id,
      ).outcomes[b.id]?.success,
    ).toBe(false);
    const fresh = toolFixture();
    present(fresh.actors[0]).mastered = present(
      fresh.actors[0],
    ).mastered.filter((x) => x !== toolId);
    expect(rootStep(fresh, toolAction).outcomes[a.id]?.success).toBe(false);
    expect(
      continuousRegistry(
        initialCollectiveWorld('collective-ex11', 'A'),
      ).packages.some((p) => p.id === toolId),
    ).toBe(false);
  });
  it('checks the real round-132 applicant stone without requiring bark or a recipe experiment', () => {
    const saved = JSON.parse(
      readFileSync(
        'experiment/ex12/checkpoints/development-000132-427-12.json',
        'utf8',
      ),
    ) as { state: V7Execution };
    const w = v7Clone(
        v7Install(
          saved.state.world,
          continuousRegistry(saved.state.world),
          toolId + '@1',
        ),
      ),
      a = present(w.actors.find((a) => a.id === 'cedar-1')),
      stone = present(
        w.stacks.find(
          (s) => s.owner === a.id && s.resource === 'stone' && !s.reservedFor,
        ),
      );
    a.mastered.push(toolId);
    const r = rootStep(
      w,
      {
        interface: toolId,
        args: { ...toolAction.args, toolId: 'item:' + stone.id },
      },
      a.id,
    );
    expect(r.outcomes[a.id]?.success).toBe(true);
    expect(
      toolAssessmentResult(present(r.world.actors.find((x) => x.id === a.id))),
    ).toMatchObject({
      entireSetupCertified: false,
      evidenceSource: { resolvedHardness: 8 },
    });
  });
});
