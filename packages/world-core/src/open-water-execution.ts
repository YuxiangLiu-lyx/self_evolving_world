import type { V7ActionContext } from './continuous-types.js';
import { v7String } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { openRemember } from './open-foundation.js';
import {
  waterSurface,
  waterInspectCell,
  waterItem,
  waterWithdraw,
  waterPoint,
} from './open-water-state.js';
import { cupContents, cupSync } from './open-water-cup.js';
import { waterForm } from './open-water-work.js';
import { waterWet } from './open-water-contact.js';

export function waterExecute(c: V7ActionContext) {
  const { world: w, actor: a } = c,
    mode = v7String(c.action.args.mode, 'water mode'),
    target =
      typeof c.action.args.target === 'string'
        ? c.action.args.target
        : v7String(c.action.args.target, 'target'),
    container =
      typeof c.action.args.container === 'string'
        ? c.action.args.container
        : v7String(c.action.args.container, 'container'),
    ml = Number(c.action.args.quantityMl);
  if (mode !== 'fill' && ml !== 0)
    throw new Error(
      'Unused quantityMl must be zero; wet computes the exact specimen dose.',
    );
  if (
    !['inspect', 'form-cup'].includes(mode) &&
    (c.action.args.x !== 0 || c.action.args.y !== 0)
  )
    throw new Error('Unused water coordinates must be zero.');
  if (
    ['inspect', 'form-cup', 'resume', 'cancel'].includes(mode) &&
    container !== ''
  )
    throw new Error('Unused container must be empty.');
  if (['inspect-cup', 'resume', 'cancel'].includes(mode) && target !== '')
    throw new Error('Unused target must be empty.');
  if (['form-cup', 'resume', 'cancel'].includes(mode)) return waterForm(c);
  if (mode === 'wet') return waterWet(c);
  if (mode === 'inspect') {
    const surface = waterSurface(
      w,
      a,
      target,
      Number(c.action.args.x),
      Number(c.action.args.y),
    );
    if (a.vitals.energy < 0.2)
      return { complete: false, remaining: 1, writes: [] };
    v7Spend(a, 0.2);
    const cell = surface.surface
      ? waterInspectCell(w, surface.key, surface.x, surface.y)
      : null;
    const value = {
      source: surface.key,
      point: surface.point,
      surface: surface.surface,
      reachable: surface.reachable,
      conditions: surface.conditions,
      availableMlBounds: cell
        ? [
            Math.floor(Number(cell.remainingMl) * 0.9),
            Math.min(10000, Math.ceil(Number(cell.remainingMl) * 1.1)),
          ]
        : null,
      contamination: 'unknown',
      uncertainty:
        'Observed cell geometry and model-volume bounds; no drinking-safety or remote specimen conclusion.',
    };
    openRemember(c, {
      key: `water:access:${surface.key}`,
      subject: surface.key,
      property: 'local surface and access',
      value,
      method: 'paid actual bank inspection',
      condition: surface.surface
        ? 'represented river surface'
        : 'unresolved surface',
      verified: surface.surface,
    });
    c.emit(
      'water-access-inspected',
      'Observed actual surface geometry and bounded access; inspection moves nothing and supplies no water.',
      { ...value, paidEnergy: 0.2, remainingWork: 0 },
      surface.key,
    );
    return {
      complete: true,
      writes: cell ? [`water:cell:${surface.key}`] : [],
    };
  }
  const cup = waterItem(w, a, container),
    contents = cupContents(cup);
  if (mode === 'inspect-cup') {
    if (a.vitals.energy < 0.2)
      return { complete: false, remaining: 1, writes: [] };
    v7Spend(a, 0.2);
    c.emit(
      'water-access-inspected',
      'Observed the actual local cup, remaining wall and contents; no safety or filling reward.',
      {
        cup: cup.id,
        position: { ...waterPoint(w, cup) },
        capacityMl: Number(contents.capacityMl),
        waterMl: Number(contents.waterMl),
        wallMass: Number(contents.wallMass),
        contamination: 'unknown',
        paidEnergy: 0.2,
        remainingWork: 0,
      },
      cup.id,
    );
    return { complete: true, writes: [] };
  }
  if (mode !== 'fill') throw new Error('Unknown water operation.');
  if (
    !Number.isSafeInteger(ml) ||
    ml <= 0 ||
    Number(contents.waterMl) + ml > 100
  )
    throw new Error(
      'Positive whole ml must fit the actual 100 ml cup capacity.',
    );
  if (a.vitals.energy < 0.3)
    return { complete: false, remaining: 1, writes: [] };
  const before = Number(contents.waterMl),
    lineage = waterWithdraw(w, a, target, ml);
  v7Spend(a, 0.3);
  contents.waterMl = before + ml;
  contents.withdrawnMl = Number(contents.withdrawnMl) + ml;
  // One latest entry plus cumulative per-source totals bounds persistent vessel context; raw events retain every transfer.
  const provenance = (contents.provenance ?? []) as {
    source: string;
    ml: number;
    first: number;
    last: number;
  }[];
  const prior = provenance.find((p) => p.source === lineage.source);
  if (prior) {
    prior.ml += ml;
    prior.last = w.tick;
  } else
    provenance.push({
      source: lineage.source,
      ml,
      first: w.tick,
      last: w.tick,
    });
  contents.provenance = provenance;
  cupSync(cup);
  c.emit(
    'water-withdrawn',
    'Atomically moved finite inspected source water into the actual cup; contamination remains unknown.',
    {
      source: target,
      cup: cup.id,
      position: { ...waterPoint(w, cup) },
      beforeMl: before,
      afterMl: before + ml,
      withdrawnMl: ml,
      sourceRemainingMl:
        w.state[`water:cell:${target}`] &&
        typeof w.state[`water:cell:${target}`] === 'object'
          ? (w.state[`water:cell:${target}`] as { remainingMl: number })
              .remainingMl
          : null,
      paidEnergy: 0.3,
      remainingWork: 0,
    },
    cup.id,
  );
  return { complete: true, writes: [cup.id, `water:cell:${target}`] };
}
