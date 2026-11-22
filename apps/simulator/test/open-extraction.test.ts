import { it, expect } from 'vitest';
import {
  v7Clone,
  continuousRegistry,
  v7Install,
} from '@self-evolving-world/world-core';
import type { V7World, V7Data } from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../src/open-scenario.js';
import {
  extractionFixture,
  extractionAction,
  extractionPrepare,
  extractionAdvance,
  extractionStep,
  extractionJob,
  extractionFrames,
} from './fixtures/open-extraction.js';
const material = (w: V7World) =>
  w.stacks.filter((s) => s.resource === 'extraction-material');
const accounts = (w: V7World) =>
  material(w).reduce(
    (n, s) => {
      const d = s.processing?.extraction as V7Data;
      return {
        solids: n.solids + (s.physical?.unitSolids ?? 0) * s.quantity,
        nutrition: n.nutrition + Number(d.nutrition) * s.quantity,
        toxins: n.toxins + Number(d.toxins) * s.quantity,
      };
    },
    { solids: 0, nutrition: 0, toxins: 0 },
  );
it('requires fresh scope, exact personally studied dependencies and four actual learning rounds', () => {
  const b = initialOpenWorld('another-fresh-experiment');
  expect(
    continuousRegistry(b).packages.some(
      (p) => p.id === 'noningestive-extractability',
    ),
  ).toBe(false);
  expect(() =>
    v7Install(b, continuousRegistry(), 'noningestive-extractability@1'),
  ).toThrow(/scope/);
  let w = extractionFixture(false);
  expect(extractionStep(w, extractionPrepare(w)).outcomes.lin?.success).toBe(
    false,
  );
  for (let i = 0; i < 3; i++)
    w = extractionAdvance(w, {
      interface: 'learn',
      args: { ability: 'noningestive-extractability' },
    });
  expect(w.actors[0]?.mastered).not.toContain('noningestive-extractability');
  w = extractionAdvance(w, { interface: 'wait', args: {} });
  expect(w.actors[0]?.mastered).toContain('noningestive-extractability');
  expect(extractionStep(w, extractionPrepare(w)).outcomes.lin?.success).toBe(
    true,
  );
});
it('allocates two actual portions and conserves solids/nutrients/toxins through real leakage, separation and cancellation', () => {
  let w = extractionFixture();
  const a = extractionPrepare(w);
  for (let i = 0; i < 9; i++) {
    w = extractionAdvance(w, a);
    const totals = accounts(w);
    expect(totals.solids).toBeCloseTo(0.025, 7);
    expect(totals.nutrition).toBeCloseTo(3.4, 7);
    expect(totals.toxins).toBe(0);
  }
  expect(w.stacks.find((s) => s.id === 'extraction-root')?.quantity).toBe(0.2);
  expect(w.stacks.find((s) => s.id === 'extraction-tuber')?.quantity).toBe(0.2);
  expect(extractionJob(w)).toMatchObject({
    stage: 8,
    paid: 4,
    status: 'passive',
  });
  expect(
    material(w).some(
      (s) => (s.processing?.extraction as V7Data).role === 'leakage deposit',
    ),
  ).toBe(true);
  const original = accounts(w);
  w = extractionAdvance(w, extractionAction('cancel'));
  const count = material(w).length;
  w = extractionAdvance(w, extractionAction('cancel'));
  expect(material(w)).toHaveLength(count);
  expect(accounts(w)).toEqual(original);
  expect(
    w.stacks.some((s) => s.reservedFor === 'extraction:lin:aqueous-trial'),
  ).toBe(false);
});
it('rejects wrong ownership, repeated references, alias ambiguity, absent water and actual overcapacity before payment', () => {
  const w = extractionFixture(),
    a = extractionPrepare(w);
  for (const patch of [
    { sample: 'resource:tuber' },
    { sample: 'item:absent' },
    { reference: 'item:extraction-tuber' },
    { waterMl: 1000 },
    { quantityTenths: 99 },
    { apparatus: [...a.args.apparatus, 'extra'] },
  ]) {
    const r = extractionStep(w, { ...a, args: { ...a.args, ...patch } });
    expect(r.outcomes.lin?.success).toBe(false);
    expect(material(r.world)).toHaveLength(0);
    expect(r.world.actors[0]?.vitals.energy).toBe(w.actors[0]?.vitals.energy);
  }
  const other = v7Clone(w),
    s = other.stacks.find((s) => s.id === 'extraction-tuber');
  if (s) s.owner = 'moss';
  expect(extractionStep(other, a).outcomes.lin?.success).toBe(false);
  const tiny = v7Clone(w),
    tray = tiny.objects.find((o) => o.kind === 'drying-tray');
  if (tray) tray.spatial.shape = { kind: 'circle', radius: 0.18 };
  expect(extractionStep(tiny, a).outcomes.lin?.success).toBe(false);
});
it('retains one allocation, paid work and real contact time across unpaid pauses and JSON restoration', () => {
  let w = extractionFixture();
  const a = extractionPrepare(w);
  w = extractionAdvance(w, a);
  const first = material(w).map((s) => s.id),
    actor = w.actors[0];
  if (!actor) throw new Error('Missing actor');
  actor.vitals.energy = 0;
  w = extractionAdvance(w, a);
  expect(extractionJob(w).paid).toBe(0.5);
  expect(extractionJob(w).stage).toBe(1);
  expect(material(w).map((s) => s.id)).toEqual(first);
  w = JSON.parse(JSON.stringify(w)) as V7World;
  w = extractionAdvance(w, { interface: 'rest', args: {} });
  w = extractionAdvance(w, extractionAction('resume'));
  expect(extractionJob(w)).toMatchObject({ stage: 2, paid: 1 });
  expect(material(w).map((s) => s.id)).toEqual(first);
});
it('keeps installed contact, weather and loss active when an actor leaves, and releases surviving matter once on death', () => {
  let w = extractionFixture();
  const a = extractionPrepare(w);
  for (let i = 0; i < 6; i++) w = extractionAdvance(w, a);
  const j = extractionJob(w),
    before = Number((j.arms as V7Data[])[0]?.extracted);
  const actor = w.actors[0];
  if (!actor) throw new Error('Missing actor');
  actor.position = { x: 7, y: 9 };
  for (let i = 0; i < 3; i++)
    w = extractionAdvance(w, { interface: 'wait', args: {} });
  expect(
    Number((extractionJob(w).arms as V7Data[])[0]?.extracted),
  ).toBeGreaterThan(before);
  expect(accounts(w).solids).toBeCloseTo(0.025, 7);
  const dying = w.actors[0];
  if (!dying) throw new Error('Missing actor');
  dying.vitals.health = 0.1;
  dying.vitals.satiety = 0;
  w = v7Clone(extractionStep(w, { interface: 'wait', args: {} }).world);
  expect(extractionJob(w).status).toBe('stopped');
  expect(accounts(w).nutrition).toBeCloseTo(3.4, 7);
  expect(
    w.stacks.some((s) => s.reservedFor === 'extraction:lin:aqueous-trial'),
  ).toBe(false);
});
it('measures actual residues with uncertainty and refuses a safety certificate or rewards for inconclusive or repeated readings', () => {
  let w = extractionFrames()[3];
  if (!w) throw new Error('Missing read frame');
  const first = w.events.find((e) => e.type === 'extraction-reading');
  expect(first?.data).toMatchObject({
    quantitativeExtractability: null,
    nutrition: null,
    hazards: null,
  });
  expect(first?.data.limits).not.toEqual([]);
  for (let i = 0; i < 2; i++)
    w = extractionAdvance(w, { interface: 'wait', args: {} });
  w = extractionAdvance(w, extractionAction('read'));
  expect(
    w.events.some((e) =>
      ['information-confirmed', 'practice-confirmed', 'satisfaction'].includes(
        e.type,
      ),
    ),
  ).toBe(false);
  expect(accounts(w).solids).toBeCloseTo(0.025, 7);
});
it('requires independent known-food evidence and retains existing processed composition and original age', () => {
  const w = extractionFixture(),
    root = w.stacks.find((s) => s.id === 'extraction-root'),
    sample = w.stacks.find((s) => s.id === 'extraction-tuber');
  if (!root || !sample) throw new Error('Missing input');
  sample.physical = { unitMass: 0.3, unitWater: 0.15, unitSolids: 0.15 };
  sample.decay = 90;
  sample.processing = { priorTrial: 'retained' };
  const a = extractionPrepare(w),
    r = extractionStep(w, a);
  expect(r.outcomes.lin?.success).toBe(true);
  const tissue = material(r.world).find(
    (s) => (s.processing?.extraction as V7Data).source === sample.id,
  );
  expect(tissue?.physical?.unitWater).toBeCloseTo(0.015);
  expect(tissue?.processing?.priorTrial).toBe('retained');
  expect(
    Number((tissue?.processing?.extraction as V7Data).decay),
  ).toBeGreaterThanOrEqual(90);
  const fresh = v7Clone(w);
  delete fresh.actors[0]?.memory.discoveries?.root;
  expect(extractionStep(fresh, a).outcomes.lin?.success).toBe(false);
});
it('balances all physical mass against retained deposits and measured atmospheric exchange, including vessel collapse', () => {
  let w = extractionFixture();
  const mass = (w: V7World) =>
    w.stacks.reduce(
      (n, s) =>
        n +
        (s.physical?.unitMass ??
          w.resources.find((r) => r.id === s.resource)?.mass ??
          0) *
          s.quantity,
      0,
    ) +
    w.objects
      .filter((o) => o.kind === 'water-spill')
      .reduce(
        (n, o) => n + Number(o.data.waterMl) / 1000 + Number(o.data.clayMass),
        0,
      );
  const initial = mass(w),
    a = extractionPrepare(w);
  for (let i = 0; i < 9; i++) w = extractionAdvance(w, a);
  const ledger = w.state['preservation:water'] as V7Data | undefined;
  expect(
    mass(w) +
      Number(ledger?.evaporated ?? 0) -
      Number(ledger?.absorbed ?? 0) -
      Number(ledger?.rain ?? 0),
  ).toBeCloseTo(initial, 6);
  let broken = extractionFixture();
  const prepare = extractionPrepare(broken);
  for (let i = 0; i < 6; i++) broken = extractionAdvance(broken, prepare);
  const cup = broken.stacks.find((s) => s.id === 'extraction-cup-0');
  if (!cup?.waterCup) throw new Error('Missing cup');
  // Separately authored wear boundary; not a formal elapsed-wear result.
  cup.waterCup.wallMass = 0.45005;
  broken = extractionAdvance(broken, { interface: 'wait', args: {} });
  expect(broken.stacks.find((s) => s.id === cup.id)?.waterCup).toBeUndefined();
  expect(accounts(broken).solids).toBeCloseTo(0.025, 7);
  expect(accounts(broken).nutrition).toBeCloseTo(3.4, 7);
  expect((extractionJob(broken).invalid as string[]).join(' ')).toContain(
    'collapsed',
  );
});
it('continues the exact paid operation after fully consumed source identities disappear, without resolving substitutes', () => {
  let w = extractionFixture();
  for (const s of w.stacks.filter((s) =>
    ['extraction-root', 'extraction-tuber'].includes(s.id),
  )) {
    s.quantity = 0.1;
    s.quantityTenths = 1;
  }
  const prepare = extractionPrepare(w);
  w = extractionAdvance(w, prepare);
  expect(w.stacks.some((s) => s.id === 'extraction-tuber')).toBe(false);
  w = JSON.parse(JSON.stringify(w)) as V7World;
  w = extractionAdvance(w, prepare);
  expect(extractionJob(w)).toMatchObject({ stage: 2, paid: 1 });
  expect(accounts(w).nutrition).toBeCloseTo(3.4, 7);
});
