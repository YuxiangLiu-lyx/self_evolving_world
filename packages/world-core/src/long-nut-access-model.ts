import type { V7ActionContext, V7Data, V7World } from './continuous-types.js';
import { v7Record, v7Signature } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import {
  v7Distance,
  v7Reach,
  v7Visible,
  v7SegmentClear,
  v7Obstacles,
} from './continuous-geometry.js';
import { nutModel, nutRevision, NUT_REV } from './long-nut-contact.js';
export const ACCESS_ID = 'source-bound-opened-hazelnut-access-trial',
  ACCESS_ITEM = 'item-141-lin-821',
  ACCESS_TOOL = 'item-131-lin-766',
  ACCESS_KEY = 'long:nut:access';
export interface AccessModel extends V7Data {
  sourceRevision: string;
  aperture: number;
  compliance: number;
  fractureEffort: number;
  contacts: number;
  assumption: string;
}
export const accessModel = (w: V7World) =>
  v7Record(w.state[ACCESS_KEY]) as AccessModel;
/** Shared source response parameterization; applying it to a new source is a new model assumption. */
export function rimResponse(w: V7World, origin: string, width: number) {
  let h = 2166136261;
  for (const ch of `${String(w.config.seed)}:${origin}:rim-access-v1`)
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const u = h / 4294967296;
  return {
    aperture: Math.min(width * 0.5, 0.04 + 0.04 * u),
    compliance: 0.1,
    fractureEffort: 0.6 + 0.2 * u,
  };
}
export function installAccess(w: V7World) {
  const s = w.stacks.find((s) => s.id === ACCESS_ITEM),
    m = nutModel(w);
  if (
    !s ||
    s.owner !== 'lin' ||
    s.quantity !== 1 ||
    m.contacts !== 2 ||
    !m.exposed ||
    nutRevision(s) !==
      v7Record(w.state['long:nut:retrieved-assembly']).sourceRevision
  )
    throw Error(
      'The actual retrieved opened assembly and unchanged exhausted opening ledger are required.',
    );
  const response = rimResponse(w, s.origin, m.exteriorWidth);
  w.state[ACCESS_KEY] = {
    sourceRevision: nutRevision(s),
    introducedAt: w.tick,
    contacts: 0,
    ...response,
    assumption:
      'New deterministic local exterior-rim model, not historical measurement: a bounded aperture within the existing body envelope, elastic rim compliance0.1 and fracture effort0.6–0.8 in abstract nonimpact units. No inference from visibleRegion or accounting fractions. No individually loose interior component, grasping anatomy, extraction, prepared receiver or food properties are represented.',
  };
  const rule = w.satisfaction.find((r) => r.id === 'grounded-understanding');
  if (rule?.maintenance) {
    const t = { event: 'information-confirmed', interface: ACCESS_ID };
    rule.alternativeTriggers = [...(rule.alternativeTriggers ?? []), t];
    rule.maintenance.alternativeTriggers = [
      ...(rule.maintenance.alternativeTriggers ?? []),
      t,
    ];
  }
  return w;
}
export function accessSource(
  c: V7ActionContext,
  lock?: string,
  ground = false,
) {
  const s = c.world.stacks.find((s) => s.id === ACCESS_ITEM),
    m = accessModel(c.world);
  if (
    c.actor.id !== 'lin' ||
    c.actor.vitals.health <= 0 ||
    !s ||
    s.quantity !== 1 ||
    s.origin !== 'start-0-nuts' ||
    s.harvestedAt !== 119 ||
    nutRevision(s) !== m.sourceRevision ||
    nutModel(c.world).contacts !== 2 ||
    (lock
      ? s.owner !== null || s.reservedFor !== lock
      : s.owner !== (ground ? null : c.actor.id) || !!s.reservedFor)
  )
    throw Error(
      'Exact living owner, source revision, quantity and access reservation required; no contact reset or replacement.',
    );
  return s;
}
export function accessInputs(
  c: V7ActionContext,
  actuator: string,
  support: string,
  lock?: string,
  fixed?: { x: number; y: number },
  ground = false,
) {
  const t = c.world.stacks.find((s) => s.id === actuator),
    o = c.world.objects.find((o) => o.id === support);
  if (
    !t ||
    t.id !== ACCESS_TOOL ||
    t.owner !== (lock || ground ? null : c.actor.id) ||
    t.quantity !== 1 ||
    t.resource !== 'stone' ||
    (t.reservedFor && t.reservedFor !== lock) ||
    t.processing?.method !== NUT_REV ||
    t.processing.diameter !== 0.12 ||
    t.processing.blunting !== 0.004
  )
    throw Error(
      'The actual owned unreserved rounded stone with its recorded geometry/condition is required; no internal probe or tool is supplied.',
    );
  if (
    !o ||
    o.kind !== 'rock' ||
    o.data.resource !== 'stone' ||
    !o.spatial.solid ||
    o.spatial.shape.kind !== 'circle' ||
    o.spatial.shape.radius < 0.35 ||
    (o.spatial.reserved && (!lock || o.data.accessLock !== lock)) ||
    !v7Reach(c.actor, o.spatial) ||
    !v7Visible(c.world, c.actor.position, o.spatial)
  )
    throw Error(
      'Reach a real free stable rock support; no receiver or hand anatomy is presumed.',
    );
  const d = v7Distance(c.actor.position, o.spatial),
    r = o.spatial.shape.radius,
    exterior = nutModel(c.world),
    footprint =
      Math.max(exterior.exteriorLength, exterior.exteriorWidth) / 2 + 0.14;
  if (d < r + c.actor.radius - 1e-8)
    throw Error('The actor cannot occupy the support.');
  const p = fixed ?? {
    x:
      o.spatial.x +
      ((c.actor.position.x - o.spatial.x) / d) * (r - footprint - 0.01),
    y:
      o.spatial.y +
      ((c.actor.position.y - o.spatial.y) / d) * (r - footprint - 0.01),
  };
  if (
    v7Distance(p, o.spatial) > r - footprint ||
    v7Distance(c.actor.position, p) > 0.65 ||
    !v7SegmentClear(
      c.actor.position,
      p,
      footprint,
      v7Obstacles({
        ...c.world,
        objects: c.world.objects.filter((x) => x.id !== o.id),
      }),
      c.work,
    ) ||
    c.world.stacks.some(
      (s) =>
        s.owner === null &&
        s.quantity > 0 &&
        s.id !== ACCESS_ITEM &&
        s.id !== ACCESS_TOOL &&
        v7Distance(s.position, p) < footprint * 2,
    )
  )
    throw Error(
      'The actual specimen/stone contact footprint must be supported, clear and within reach.',
    );
  const m = accessModel(c.world),
    direction = {
      x: (p.x - o.spatial.x) / v7Distance(p, o.spatial),
      y: (p.y - o.spatial.y) / v7Distance(p, o.spatial),
    };
  const toolPoint = {
    x: p.x + direction.x * (exterior.exteriorWidth / 2 + 0.06),
    y: p.y + direction.y * (exterior.exteriorWidth / 2 + 0.06),
  };
  const startPoint = {
    x: toolPoint.x + direction.x * 0.02,
    y: toolPoint.y + direction.y * 0.02,
  };
  if (
    (lock || ground) &&
    v7Distance(t.position, m.contacts === 0 ? startPoint : toolPoint) > 1e-7
  )
    throw Error(
      'The actual positioned actuator moved; no teleport or renewed quote.',
    );
  if (!(
    m.compliance > 0 &&
    0.1 < m.fractureEffort &&
    m.compliance * 0.1 <= 0.02
  ))
    throw Error('No justified safe nonimpact effort quote for this model.');
  return {
    tool: t,
    support: o,
    point: p,
    toolPoint,
    startPoint,
    direction,
    signature: v7Signature({
      tool: nutRevision(t),
      support: o.spatial,
      model: {
        aperture: m.aperture,
        compliance: m.compliance,
        fractureEffort: m.fractureEffort,
      },
    }),
  };
}
export function accessReference(
  c: V7ActionContext,
  value: unknown,
  scope: 'owned' | 'object',
) {
  if (typeof value !== 'string')
    throw Error('An exact actual reference is required.');
  return forestResolveReference(
    c.world,
    c.actor,
    value,
    scope,
    scope === 'owned' ? 1 : 0,
  );
}
