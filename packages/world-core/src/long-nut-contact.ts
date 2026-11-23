import type {
  V7ActionContext,
  V7Data,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Record, v7Signature, v7String } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import {
  v7Distance,
  v7Reach,
  v7Visible,
  v7Obstacles,
  v7SegmentClear,
} from './continuous-geometry.js';
export const NUT_ID = 'source-bound-hazelnut-opening-trial',
  NUT_REV = NUT_ID + '@1',
  NUT_ITEM = 'item-119-lin-699',
  NUT_KEY = 'long:nut:contact';
export interface NutBinding {
  id: string;
  actor: string;
  item: string;
  origin: string;
  harvestedAt: number;
  modelKey: string;
  exteriorKey: string;
  groundTool: boolean;
}
export const NUT_BINDING: NutBinding = {
  id: NUT_ID,
  actor: 'lin',
  item: NUT_ITEM,
  origin: 'start-0-nuts',
  harvestedAt: 119,
  modelKey: NUT_KEY,
  exteriorKey: 'long:nut:exterior',
  groundTool: false,
};
export const nutRevision = (s: V7Stack) =>
  v7Signature({
    id: s.id,
    quantity: s.quantity,
    origin: s.origin,
    harvestedAt: s.harvestedAt,
    processing: s.processing ?? null,
  });
interface NutModel extends V7Data {
  revision: string;
  currentRevision: string;
  contacts: number;
  damage: number;
  exposed: boolean;
  threshold: number;
  exteriorLength: number;
  exteriorWidth: number;
  assumption: string;
  fractions: V7Data;
  interiorColor: string;
  interiorTexture: string;
}
export function nutModel(w: V7World, binding = NUT_BINDING): NutModel {
  return v7Record(w.state[binding.modelKey]) as NutModel;
}
export function nutSpecimen(
  c: V7ActionContext,
  owned: boolean,
  reservation?: string,
  binding = NUT_BINDING,
) {
  const s = c.world.stacks.find((s) => s.id === binding.item);
  if (
    !s ||
    s.quantity !== 1 ||
    s.resource !== 'hazelnut' ||
    s.origin !== binding.origin ||
    s.harvestedAt !== binding.harvestedAt ||
    (binding.groundTool &&
      (!Number.isFinite(s.decay ?? 0) ||
        (s.decay ?? 0) < 0 ||
        (s.decay ?? 0) > 1000)) ||
    (owned && s.owner !== c.actor.id) ||
    (s.reservedFor && s.reservedFor !== reservation)
  )
    throw new Error(
      'The unchanged source identity, whole surviving quantity and proper access/lock are required.',
    );
  const m = nutModel(c.world, binding);
  if (nutRevision(s) !== m.currentRevision)
    throw new Error(
      'The actual source was altered outside this response model.',
    );
  if (
    !owned &&
    s.owner !== c.actor.id &&
    (s.owner !== null ||
      v7Distance(c.actor.position, s.position) > 0.65 ||
      !v7Visible(c.world, c.actor.position, s.position))
  )
    throw new Error(
      'Reach the actual specimen; no remote inspection or return.',
    );
  return s;
}
export function nutInputs(
  c: V7ActionContext,
  toolId: string,
  supportId: string,
  lock?: string,
  fixed?: { x: number; y: number },
  binding = NUT_BINDING,
) {
  const t = c.world.stacks.find((s) => s.id === toolId),
    o = c.world.objects.find((o) => o.id === supportId);
  if (
    !t ||
    t.owner !== (binding.groundTool && lock ? null : c.actor.id) ||
    t.resource !== 'stone' ||
    t.quantity !== 1 ||
    (t.reservedFor && t.reservedFor !== lock) ||
    (t.processing && t.processing.method !== binding.id + '@1')
  )
    throw new Error(
      'One actually owned whole stone with supported geometry and no conflicting use is required.',
    );
  if (
    !o ||
    o.kind !== 'rock' ||
    o.data.resource !== 'stone' ||
    !o.spatial.solid ||
    o.spatial.shape.kind !== 'circle' ||
    o.spatial.shape.radius < 0.35 ||
    !v7Reach(c.actor, o.spatial) ||
    !v7Visible(c.world, c.actor.position, o.spatial) ||
    (o.spatial.reserved && (!lock || o.data.nutContactLock !== lock))
  )
    throw new Error(
      'An accessible real solid rock support with a free contact surface is required.',
    );
  const d = v7Distance(c.actor.position, o.spatial);
  if (d < o.spatial.shape.radius + c.actor.radius - 1e-8)
    throw new Error('The actor cannot occupy the solid support.');
  const p = fixed ?? {
    x:
      o.spatial.x +
      ((c.actor.position.x - o.spatial.x) / d) *
        (o.spatial.shape.radius - 0.03),
    y:
      o.spatial.y +
      ((c.actor.position.y - o.spatial.y) / d) *
        (o.spatial.shape.radius - 0.03),
  };
  if (
    v7Distance(p, o.spatial) > o.spatial.shape.radius - 0.02 ||
    v7Distance(c.actor.position, p) > 0.65 ||
    !v7SegmentClear(
      c.actor.position,
      p,
      0.02,
      v7Obstacles({
        ...c.world,
        objects: c.world.objects.filter((x) => x.id !== o.id),
      }),
      c.work,
    )
  )
    throw new Error(
      'The full contact region must be supported and locally accessible without another obstacle.',
    );
  if (
    c.world.stacks.some(
      (s) =>
        s.owner === null &&
        s.quantity > 0 &&
        s.id !== binding.item &&
        (!binding.groundTool || s.id !== toolId) &&
        v7Distance(s.position, p) < 0.12,
    )
  )
    throw new Error('Other real material occupies the contact region.');
  if (binding.groundTool && lock && v7Distance(t.position, p) > 1e-8)
    throw Error('The positioned actuator left its actual contact region.');
  const hardness = c.world.resources.find((r) => r.id === 'stone')?.properties
    ?.hardness;
  if (
    typeof hardness !== 'number' ||
    hardness < 6 ||
    Number(t.processing?.blunting ?? 0) > 0.05
  )
    throw new Error(
      'The actual stone contact condition is outside this bounded model.',
    );
  return { tool: t, support: o, point: p, hardness };
}
export function nutReference(
  c: V7ActionContext,
  key: string,
  scope: 'owned' | 'object',
) {
  return forestResolveReference(
    c.world,
    c.actor,
    v7String(c.action.args[key], key),
    scope,
    scope === 'owned' ? 1 : 0,
  );
}
export function installNutContact(w: V7World, binding = NUT_BINDING) {
  const s = w.stacks.find((s) => s.id === binding.item),
    exterior = v7Record(w.state[binding.exteriorKey]);
  if (!s || s.quantity !== 1 || s.processing || !exterior.sourceRevision)
    throw new Error('The actual reviewed exterior specimen is required.');
  let h = 2166136261;
  for (const ch of `${String(w.config.seed)}:${s.origin}:contact-v1`)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  w.state[binding.modelKey] = {
    revision: binding.id + '@1',
    currentRevision: nutRevision(s),
    introducedAt: w.tick,
    contacts: 0,
    damage: 0,
    exposed: false,
    threshold: 1.1 + (h / 4294967296) * 0.5,
    exteriorLength: Number(exterior.length),
    exteriorWidth: Number(exterior.width),
    assumption: binding.groundTool
      ? 'New forest-source non-detaching contact-response model and local rounded stone/support geometry; not prior measurements, copied fracture outcomes, anatomy or edible fractions. All matter remains one assembly.'
      : 'New source-bound abstract contact model, not calibrated force or measured shell strength. A whole stone unit is represented as one rounded 0.12-diameter piece; a solid rock has a usable top contact patch. Retained assembly fractions are accounting shares, not measured mass.',
    fractions: binding.groundTool ? {} : { covering: 0.35, interior: 0.65 },
    interiorColor: '#d8bd91',
    interiorTexture: 'pale compact surface',
  };
  const rule = w.satisfaction.find((r) => r.id === 'grounded-understanding');
  if (rule?.maintenance) {
    const trigger = { event: 'information-confirmed', interface: binding.id };
    rule.alternativeTriggers = [...(rule.alternativeTriggers ?? []), trigger];
    rule.maintenance.alternativeTriggers = [
      ...(rule.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
  }
  return w;
}
