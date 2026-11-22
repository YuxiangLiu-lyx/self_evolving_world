import type { V7ActionContext, V7Object, V7Data } from './continuous-types.js';
import { v7Id } from './continuous-data.js';
import { shortDesign, shortParts } from './open-short-material.js';
import type { ShortInput } from './open-short-material.js';
import {
  shortIncorporate,
  shortRelease,
  shortReturnPart,
  shortKey,
} from './open-short-work.js';
import type { ShortWork } from './open-short-work.js';
import { shortCapsules, shortDimensions } from './open-short-geometry.js';
export function shortCreate(c: V7ActionContext, rows: ShortInput[]): V7Object {
  const plan = shortDesign(c, rows);
  if (!plan.feasible) throw new Error(plan.reasons.join(' '));
  return {
    id: v7Id(c.world, 'object'),
    kind: 'short-refuge',
    name: 'Short-pole shade canopy',
    spatial: plan.shape,
    visual: {
      component: 'rock',
      color: '#b6a475',
      accent: '#e0ce99',
      label: 'Partial short frame',
      state: 'partial',
    },
    createdBy: c.actor.id,
    createdAt: c.world.tick,
    revision: 'short-material-refuge@1',
    data: {
      ...plan.dimensions,
      roofArea: plan.roofArea,
      stage: 0,
      components: [],
      integrity: 1,
      wetness: 0,
      coverage: 0,
      sag: 0,
      slip: false,
      proven: false,
      collapsed: false,
      geometryRevision: 'short-material-refuge@1',
      joints:
        'Two paired apex connections and two ground spread ties; no unverified natural anchor.',
      ground: plan.ground,
    },
  };
}
export function shortAssemble(c: V7ActionContext, j: ShortWork) {
  const w = c.world,
    o = w.objects.find((o) => o.id === j.structure);
  if (!o) throw new Error('Partial canopy is absent.');
  const ids = j.escrow.filter(
    (id) =>
      j.roles[id] ===
      (j.stage === 1 ? 'binding' : j.stage === 4 ? 'cover' : 'pole'),
  );
  const selected =
    j.stage === 2 ? ids.slice(1) : j.stage === 3 ? ids.slice(0, 1) : ids;
  shortIncorporate(w, j, o, selected);
  o.data.stage = j.stage;
  if (j.stage === 2) {
    const d = shortDimensions(o);
    for (const spatial of shortCapsules(o.spatial, d))
      w.objects.push({
        id: v7Id(w, 'object'),
        kind: 'short-pole',
        assemblyParent: o.id,
        name: 'Actual pole capsule segment',
        spatial,
        visual: {
          component: 'rock',
          color: '#896f45',
          accent: '#c6a873',
          label: 'Pole',
          state: 'installed',
        },
        createdBy: c.actor.id,
        createdAt: w.tick,
        revision: 'short-material-refuge@1',
        data: { parent: o.id },
      });
  }
  if (j.stage === 4) {
    o.data.coverage = 0.85;
    o.visual.state = 'unproven';
    shortRelease(
      w,
      j,
      'completed',
      'Four paid stages incorporated actual components; structure still needs its own proof test.',
    );
    c.emit(
      'short-refuge-completed',
      'Completed physical assembly; no proof, happiness or rest bonus granted.',
      {
        operationId: shortKey(j.owner, j.id),
        components: shortParts(o).map((s) => s.id),
        paidEnergy: j.paid,
        remainingWork: 0,
        geometryRevision: 'short-material-refuge@1',
      },
      o.id,
    );
  }
}
export function shortService(c: V7ActionContext, j: ShortWork) {
  const w = c.world,
    o = w.objects.find((o) => o.id === j.structure);
  if (!o) throw new Error('Structure absent.');
  if (j.mode === 'repair' && j.stage === 2) {
    const parts = shortParts(o),
      replacements = j.escrow.flatMap((id) => {
        const s = w.stacks.find((s) => s.id === id);
        return s && s.processing?.shortRole !== 'load' ? [s] : [];
      });
    for (const replacement of replacements) {
      const old = parts.find(
        (s) => s.processing?.shortRole === replacement.processing?.shortRole,
      );
      if (!old) throw new Error('Original matching component absent.');
      shortReturnPart(w, o, old);
      parts.splice(parts.indexOf(old), 1);
    }
    o.data.components = parts as unknown as V7Data[];
    shortIncorporate(
      w,
      j,
      o,
      replacements.map((s) => s.id),
    );
    o.data.proven = false;
    o.data.collapsed = false;
    o.data.integrity = Math.min(
      1,
      ...shortParts(o)
        .filter((s) => s.processing?.shortGrassModel)
        .map((s) => Number(s.processing?.shortIntegrity ?? 1)),
    );
    o.visual.state = 'unproven';
    c.emit(
      'short-refuge-progress',
      'Actual replacement completed; the two remaining paid stages use allocated loads to reprove this structure.',
      {
        operationId: shortKey(j.owner, j.id),
        stage: j.stage,
        remainingWork: 2,
        paidEnergy: j.paid,
      },
      o.id,
    );
  } else if (j.mode === 'dismantle') {
    const parts = shortParts(o),
      count = Math.ceil(parts.length / (3 - j.stage));
    for (const s of parts.slice(0, count)) shortReturnPart(w, o, s);
    o.data.components = parts.slice(count) as unknown as V7Data[];
    o.data.proven = false;
    o.data.stage = 0;
    o.visual.state = 'dismantling';
    if (j.stage === 2) {
      w.objects = w.objects.filter(
        (p) => p.id !== o.id && p.assemblyParent !== o.id,
      );
      shortRelease(
        w,
        j,
        'completed',
        'Actual surviving components recovered once; no vanished matter or effort refunded.',
      );
    }
  }
}
export function shortRepairInputs(o: V7Object, rows: ShortInput[]) {
  if (o.data.frameDamaged === true)
    throw new Error(
      'Permanently damaged poles require dismantling; grass replacement cannot restore them.',
    );
  const replacements = rows.filter((r) => r.role !== 'load');
  if (
    !replacements.length ||
    !rows.some((r) => r.role === 'load') ||
    new Set(replacements.map((r) => r.role)).size !== replacements.length ||
    replacements.some((r) => !['binding', 'cover'].includes(r.role))
  )
    throw new Error(
      'Repair requires explicit whole binding/cover replacements and separate actual proof loads.',
    );
  for (const r of replacements) {
    const old = shortParts(o).find((s) => s.processing?.shortRole === r.role);
    if (!old || old.quantity !== r.quantity)
      throw new Error(
        'Replacement must match one original whole component quantity.',
      );
  }
}
