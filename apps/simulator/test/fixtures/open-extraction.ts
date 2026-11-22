import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Action,
  V7Data,
} from '@self-evolving-world/world-core';
import { preservationFixture } from './open-preservation.js';
import { waterCupWorld } from './open-water.js';
export const extractionAction = (
  mode: string,
  project = 'aqueous-trial',
): V7Action => ({
  interface: 'noningestive-extractability',
  args: {
    mode,
    project,
    sample: '',
    reference: '',
    water: '',
    apparatus: [],
    quantityTenths: 0,
    waterMl: 0,
  },
});
export const extractionStep = (w: V7World, a: V7Action) =>
  v7Step(
    w,
    Object.fromEntries(
      w.actors.map((x) => [
        x.id,
        x.id === 'lin' ? a : { interface: 'wait', args: {} },
      ]),
    ),
    continuousRegistry(w),
  );
export function extractionAdvance(w: V7World, a: V7Action) {
  const r = extractionStep(w, a);
  if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
  return v7Clone(r.world);
}
export function extractionFixture(study = true) {
  let w = preservationFixture();
  const registry = continuousRegistry(w);
  const install = (id: string) => {
    const p = registry.packages.find(
      (p) => `${p.id}@${String(p.version)}` === id,
    );
    if (!p) throw new Error('Missing fixture package');
    for (const d of p.dependencies) if (!w.revisions.includes(d)) install(d);
    if (!w.revisions.includes(id)) w = v7Clone(v7Install(w, registry, id));
  };
  install('noningestive-extractability@1');
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor');
  a.position = { x: 8, y: 8 };
  a.vitals.energy = 40;
  a.vitals.satiety = 100;
  const balance = w.objects.find((o) => o.kind === 'comparison-balance'),
    tray = w.objects.find((o) => o.kind === 'drying-tray');
  if (!balance || !tray) throw new Error('Missing actual fixture equipment');
  // Explicit authored capacity/location fixture, not a formal build or obtainable upgraded tray.
  balance.spatial.x = 8;
  balance.spatial.y = 7.3;
  tray.spatial.x = 9;
  tray.spatial.y = 8;
  tray.spatial.shape = { kind: 'circle', radius: 0.65 };
  const cupSource = waterCupWorld().stacks.find((s) => s.waterCup);
  if (!cupSource)
    throw new Error('Missing physically formed source fixture cup');
  for (let i = 0; i < 2; i++) {
    const cup = v7Clone(cupSource);
    cup.id = `extraction-cup-${String(i)}`;
    cup.owner = null;
    cup.position = { x: 7.7 + i * 0.3, y: 8.35 };
    w.stacks.push(cup);
  }
  for (const resource of ['root', 'tuber'])
    w.stacks.push({
      id: `extraction-${resource}`,
      resource,
      quantity: 0.3,
      quantityTenths: 3,
      owner: 'lin',
      position: { ...a.position },
      origin: `isolated-${resource}-lineage`,
      harvestedAt: w.tick,
      decay: 0,
    });
  w.processes.push({
    id: 'fixture-cup-process',
    handler: 'open.water-cups',
    owner: null,
    object: null,
    next: w.tick + 1,
    revision: 'river-contact-water@1',
    data: {},
  });
  for (let i = 0; i < 2; i++)
    w = extractionAdvance(w, {
      interface: 'learn',
      args: { ability: 'access-water' },
    });
  if (study)
    for (let i = 0; i < 4; i++)
      w = extractionAdvance(w, {
        interface: 'learn',
        args: { ability: 'noningestive-extractability' },
      });
  const cup = w.stacks.find((s) => s.id === 'extraction-cup-0');
  if (!cup?.waterCup) throw new Error('Missing water fixture');
  // Explicit isolated retained-water input, not a free formal refill. Existing leakage applies immediately.
  cup.waterCup.waterMl = 78;
  cup.physical = {
    unitMass: 0.578,
    unitWater: 0.078 + 0.5 * Number(cup.waterCup.wallWaterFraction),
    unitSolids: 0.5 * (1 - Number(cup.waterCup.wallWaterFraction)),
  };
  return w;
}
export function extractionPrepare(w: V7World) {
  const balance = w.objects.find((o) => o.kind === 'comparison-balance'),
    tray = w.objects.find((o) => o.kind === 'drying-tray'),
    weight = w.stacks.find((s) => s.processing?.comparisonWeight);
  if (!balance || !tray || !weight) throw new Error('Missing fixture roles');
  return {
    interface: 'noningestive-extractability',
    args: {
      mode: 'prepare',
      project: 'aqueous-trial',
      sample: 'item:extraction-tuber',
      reference: 'item:extraction-root',
      water: 'item:extraction-cup-0',
      apparatus: [
        `object:${balance.id}`,
        `item:${weight.id}`,
        `object:${tray.id}`,
        'item:extraction-cup-0',
        'item:extraction-cup-1',
      ],
      quantityTenths: 1,
      waterMl: 35,
    },
  };
}
export const extractionJob = (w: V7World) =>
  w.state['extraction:lin:aqueous-trial'] as V7Data;
export function extractionFrames() {
  let w = extractionFixture();
  const frames = [w],
    prepare = extractionPrepare(w);
  for (let i = 0; i < 9; i++) {
    w = extractionAdvance(w, prepare);
    if (i === 4) frames.push(w);
  }
  frames.push(w);
  w = extractionAdvance(w, extractionAction('read'));
  frames.push(w);
  w = extractionAdvance(w, extractionAction('cancel'));
  frames.push(w);
  return frames;
}
