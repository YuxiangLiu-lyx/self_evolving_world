import type {
  V7ActionContext,
  V7Data,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Json, v7Record, v7Signature } from './continuous-data.js';
export const JOIN_ID = 'source-bound-joining-trial',
  JOIN_REV = JOIN_ID + '@1';
export const JOIN_VINE = 'item-66-lin-388',
  JOIN_BRANCH = 'item-76-lin-448';
const KEY = 'long:joining:source-geometry';
export interface JoinPiece extends V7Data {
  id: string;
  source: string;
  length: number;
  diameter: number;
  kind: string;
}
export const sourceRevision = (s: V7Stack) =>
  v7Signature({
    id: s.id,
    origin: s.origin,
    resource: s.resource,
    quantity: s.quantity,
    harvestedAt: s.harvestedAt ?? null,
    processing: s.processing ?? null,
  });
function fraction(key: string) {
  let n = 2166136261;
  for (const c of key) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  return n / 4294967296;
}
/** New physical representation, not a retrospective observation or extra stock.
 * Like the earlier source-slot model, dimensions are fixed by seed/provenance,
 * independently of quantity. Only these surviving intact accounting lots reconcile.
 */
export function installJoinGeometry(w: V7World) {
  const vine = w.stacks.find((s) => s.id === JOIN_VINE),
    branch = w.stacks.find((s) => s.id === JOIN_BRANCH);
  if (
    !vine ||
    !branch ||
    vine.origin !== 'forest-vine-1' ||
    branch.origin !== 'canopy-18' ||
    vine.quantity !== 0.9 ||
    branch.quantity !== 2 ||
    vine.processing ||
    branch.processing
  )
    throw new Error('Reviewed surviving source lots cannot be reconciled.');
  const pieces: JoinPiece[] = [
    {
      id: 'forest-vine-1:retained-section',
      source: vine.id,
      kind: 'continuous-vine',
      length:
        0.28 +
        0.06 * fraction(`${String(w.config.seed)}:forest-vine-1:section`),
      diameter: 0.008,
    },
    ...[0, 1].map((i) => ({
      id: `canopy-18:withdrawn-piece-${String(i)}`,
      source: branch.id,
      kind: 'branch',
      length:
        0.18 +
        0.1 *
          fraction(`${String(w.config.seed)}:canopy-18:${String(i)}:length`),
      diameter:
        0.02 +
        0.005 *
          fraction(`${String(w.config.seed)}:canopy-18:${String(i)}:diameter`),
    })),
  ];
  w.state[KEY] = {
    revision: JOIN_REV,
    introducedAt: w.tick,
    assumption:
      'New source-bound physical-model assumption: two discrete branches and one surviving continuous vine section. Earlier numeric accounting did not measure or establish this structure. No mass, stock, strength, tools or mastery added.',
    sources: [sourceRevision(vine), sourceRevision(branch)],
    pieces,
  };
  return w;
}
export function joinGeometry(w: V7World) {
  const raw = v7Record(w.state[KEY]);
  if (!Array.isArray(raw.pieces))
    throw new Error('No installed physical piece representation.');
  return raw.pieces as JoinPiece[];
}
export function joinSources(c: V7ActionContext, arrangement?: string) {
  const sources = [JOIN_VINE, JOIN_BRANCH].map((id) => {
    const s = c.world.stacks.find((s) => s.id === id);
    if (
      !s ||
      (arrangement
        ? s.owner !== null || s.reservedFor !== arrangement
        : s.owner !== c.actor.id || !!s.reservedFor)
    )
      throw new Error(
        'Exact surviving source identities are unavailable or owned/reserved elsewhere.',
      );
    return s;
  });
  const original = v7Record(c.world.state[KEY]);
  if (
    JSON.stringify(sources.map(sourceRevision)) !==
    JSON.stringify(original.sources)
  )
    throw new Error(
      'Source revision changed; previous piece geometry no longer establishes a supported allocation.',
    );
  return sources;
}
export function measuredGeometry(c: V7ActionContext) {
  const pieces = joinGeometry(c.world);
  return v7Json({
    revision: JOIN_REV,
    tick: c.world.tick,
    actor: c.actor.id,
    sources: joinSources(c).map(sourceRevision),
    method:
      'Direct local visual comparison to the actor body diameter; approximate world-distance units, not calibrated SI metrology.',
    unit: 'world-distance',
    resolution: 0.02,
    uncertainty: 0.01,
    pieces: pieces.map((p) => ({
      id: p.id,
      source: p.source,
      kind: p.kind,
      length: Math.round(p.length / 0.02) * 0.02,
      uncertainty: 0.01,
      endpoints: [0, 1],
      continuity:
        p.kind === 'continuous-vine'
          ? 'one visible surviving section'
          : 'one visible discrete piece',
      selection:
        'Whole piece only, endpoints0 and1. No cutting or fractional length allocation.',
    })),
    modelBoundary: v7Record(c.world.state[KEY]).assumption,
    qualified: false,
  });
}
/** Actual local centerlines, never dimensions inferred from render scale. */
export function joinPaths(w: V7World, wrapped: boolean) {
  const ps = joinGeometry(w),
    vine = ps.find((p) => p.kind === 'continuous-vine');
  if (!vine) throw new Error('Missing continuous section');
  const radius = 0.04,
    circumference = 2 * Math.PI * radius;
  if (vine.length < circumference + 0.005)
    throw new Error('The actual section cannot span the bounded loose wrap.');
  const height = radius + vine.diameter / 2;
  const branch = ps.filter((p) => p.kind === 'branch');
  const paths = branch.map((p, i) => {
    const y = i ? 0.013 : -0.013;
    const inner = radius - vine.diameter / 2 - p.diameter / 2;
    if (inner <= Math.abs(y))
      throw new Error('The actual pieces cannot fit this loose wrap.');
    const z = wrapped
      ? height - Math.sqrt(inner ** 2 - y ** 2)
      : p.diameter / 2;
    return {
      id: p.id,
      source: p.source,
      kind: p.kind,
      diameter: p.diameter,
      contourLength: p.length,
      points: [
        { x: -p.length / 2, y, z },
        { x: p.length / 2, y, z },
      ],
    };
  });
  // A vertical loose loop, tangent below to the ground and enclosing the two
  // separate branch cross-sections. Height prevents a fictitious planar crossing.
  // Arc length is authoritative; the 32 display segments only approximate it.
  const points = wrapped
    ? Array.from({ length: 33 }, (_, i) => ({
        x: 0,
        y: radius * Math.sin((i * Math.PI) / 16),
        z: height - radius * Math.cos((i * Math.PI) / 16),
      }))
    : [
        { x: -vine.length / 2, y: 0.08, z: vine.diameter / 2 },
        { x: vine.length / 2, y: 0.08, z: vine.diameter / 2 },
      ];
  if (wrapped)
    points.push({ x: vine.length - circumference, y: 0, z: vine.diameter / 2 });
  paths.push({
    id: vine.id,
    source: vine.source,
    kind: vine.kind,
    diameter: vine.diameter,
    contourLength: vine.length,
    points,
  });
  return paths;
}
