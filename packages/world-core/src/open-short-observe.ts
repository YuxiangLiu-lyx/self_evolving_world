import type { V7ActionContext, V7Data } from './continuous-types.js';
import { v7String } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { v7ShapeDistance } from './continuous-geometry.js';
import { forestResolveReference } from './forest-references.js';
import { poleMeasurement } from './open-material-geometry.js';
import { shortStructure } from './open-short-material.js';

import { shortDimensions, shortRay } from './open-short-geometry.js';
import { forestClimate } from './forest-climate.js';
import { openRemember } from './open-foundation.js';
export function shortInspect(c: V7ActionContext) {
  const id = forestResolveReference(
      c.world,
      c.actor,
      v7String(c.action.args.target, 'exact target'),
      'optional-exact-visible',
    ),
    s = c.world.stacks.find((s) => s.id === id && s.owner === c.actor.id),
    o = c.world.objects.find((o) => o.id === id && o.kind === 'short-refuge');
  if (!s && !o)
    throw new Error('Inspect an owned material or reachable short refuge.');
  if (o && v7ShapeDistance(c.actor.position, o.spatial) > 0.65)
    throw new Error('Approach actual structure within 0.65.');
  v7Spend(c.actor, 0.2);
  c.emit(
    'short-refuge-inspected',
    'Observed identity and condition; untested material is not certified.',
    {
      operationId: `short:inspect:${c.actor.id}:${String(c.world.tick)}`,
      paidEnergy: 0.2,
      remainingWork: 0,
      material: s
        ? {
            id: s.id,
            quantity: s.quantity,
            resource: s.resource,
            origin: s.origin,
            dimensions: poleMeasurement(c.world, c.actor.id, s),
            coupon: s.processing?.shortCoupon ?? null,
          }
        : null,
      structure: o
        ? {
            id: o.id,
            dimensions: { ...shortDimensions(o) },
            stage: o.data.stage ?? 0,
            proven: o.data.proven ?? false,
            integrity: o.data.integrity ?? 0,
            wetness: o.data.wetness ?? 0,
            proof: o.data.proof ?? null,
          }
        : null,
    },
    id,
  );
  return { complete: true, writes: [] };
}
export function shortExposure(c: V7ActionContext) {
  const o = shortStructure(
    c.world,
    c.actor,
    v7String(c.action.args.target, 'structure'),
  );
  if (v7ShapeDistance(c.actor.position, o.spatial) > 0.65)
    throw new Error('Actual exposure reading requires local access.');
  const climate = forestClimate(c.world, c.actor.position),
    angle = (c.world.time * Math.PI * 2) / (c.world.config.forest?.day ?? 80),
    sun = shortRay(
      o,
      c.actor.position,
      Math.cos(angle) * 0.5,
      Math.sin(angle) * 0.5,
    ),
    rain = shortRay(o, c.actor.position, (climate.wind ?? 0) * 0.25, 0),
    overhead = shortRay(o, c.actor.position, 0, 0);
  v7Spend(c.actor, 0.2);
  const data: V7Data = {
    structure: o.id,
    position: { ...c.actor.position },
    solar:
      climate.daylight > 0
        ? {
            reference: 4 * climate.daylight,
            actual: 4 * climate.daylight * (1 - 0.65 * sun),
          }
        : null,
    rain:
      (climate.rain ?? 0) > 0
        ? {
            reference: climate.rain ?? 0,
            actual: (climate.rain ?? 0) * (1 - 0.4 * rain),
          }
        : null,
    wind:
      (climate.wind ?? 0) > 0
        ? {
            reference: climate.wind ?? 0,
            actual: (climate.wind ?? 0) * (1 - Math.min(0.2, overhead * 0.1)),
          }
        : null,
    uncertainty: 0.05,
    pointOnly: true,
    geometryRevision: 'short-material-refuge@1',
    remainingWork: 0,
    paidEnergy: 0.2,
  };
  c.emit(
    'short-refuge-exposure',
    'Actual occupied-point comparison against the same unobstructed weather; absent forcing is unresolved.',
    data,
    o.id,
  );
  if (data.solar || data.rain || data.wind)
    openRemember(c, {
      key: `short:exposure:${sun > 0 ? 'solar-block' : 'solar-open'}:${(climate.rain ?? 0) > 0 ? (rain > 0 ? 'rain-block' : 'rain-open') : 'rain-unresolved'}`,
      subject: o.id,
      property: 'point exposure under present forcing',
      value: data,
      method: 'paid same-weather occupied-point comparison',
      condition:
        'Only this position and weather; no whole-body or absent-forcing guarantee.',
      verified: true,
    });
  return { complete: true, writes: [] };
}
