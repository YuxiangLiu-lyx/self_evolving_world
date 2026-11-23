import { preparedPortions } from './long-prepared-portions.js';
import { mossRepresentation } from './long-moss-representation.js';
import type { V7ActionContext } from './continuous-types.js';
import {
  v7Distance,
  v7Inside,
  v7Obstacles,
  v7SegmentClear,
  v7ShapesOverlap,
  v7Visible,
} from './continuous-geometry.js';
import { rootPlacement } from './collective-tray-placement.js';
import { surfaceBare } from './long-surface.js';
export const PREPARED_ID = 'prepared-surface-root-placement';
export const PREPARED_SURFACE = 'surface-21-lin-113';
export const MOSS_PREPARED_ID = 'moss-prepared-root-placement';
export const MOSS_PREPARED_SURFACE = 'surface-38-moss-234';
/** A source-bound physical check; never changes the world to make a predicate pass. */
export function preparedSite(
  c: V7ActionContext,
  surfaceId: string,
  plotId?: string,
  processId?: string,
) {
  const moss = c.action.interface === MOSS_PREPARED_ID;
  const s = c.world.objects.find((o) => o.id === surfaceId);
  if (
    !s ||
    s.id !== (moss ? MOSS_PREPARED_SURFACE : PREPARED_SURFACE) ||
    s.revision !== 'small-soil-patch-preparation@1' ||
    s.createdBy !== c.actor.id ||
    c.actor.id !== (moss ? 'moss' : 'lin') ||
    s.spatial.x !== (moss ? 14 : 9.25) ||
    s.spatial.y !== (moss ? 12.5 : 12.9) ||
    s.spatial.shape.kind !== 'circle' ||
    s.spatial.shape.radius !== 0.2
  )
    throw new Error(
      'This adapter requires the exact nominated prepared surface and its responsible learned actor.',
    );
  if (
    !v7Inside(c.world, s.spatial, 0.2) ||
    v7Distance(c.actor.position, s.spatial) > c.actor.radius + 0.65 ||
    !v7Visible(c.world, c.actor.position, s.spatial)
  )
    throw new Error(
      'Reach the visible nominated footprint before examining or handling it.',
    );
  const w = {
    ...c.world,
    objects: c.world.objects.filter((o) => o.id !== plotId),
  };
  const physical = w.objects.flatMap((o) => {
    if (o.id === s.id && !o.spatial.solid && !o.spatial.reserved)
      return preparedPortions(o.data.residues);
    if (
      (o.revision === 'bounded-surface-residue-transfer@1' ||
        (moss &&
          o.id === 'residue-deposit-49-moss-298' &&
          o.revision === 'moss-surface-residue-transfer@1')) &&
      !o.spatial.solid &&
      !o.spatial.reserved &&
      !o.data.activeWork
    )
      return preparedPortions(o.data.deposits);
    return [{ ...o.spatial, solid: true }];
  });
  const ground = w.stacks
    .filter((t) => !t.owner && t.quantity > 0 && t.reservedFor !== processId)
    .map((t) => ({
      ...t.position,
      angle: 0,
      shape: { kind: 'circle' as const, radius: 0.05 },
      solid: true,
      interaction: 0,
      entrances: [],
    }));
  const people = w.actors
    .filter((a) => a.vitals.health > 0 && a.id !== c.actor.id)
    .map((a) => ({
      ...a.position,
      angle: 0,
      shape: { kind: 'circle' as const, radius: a.radius },
      solid: true,
      interaction: 0,
      entrances: [],
    }));
  const path = v7SegmentClear(
    c.actor.position,
    s.spatial,
    0.01,
    [...v7Obstacles(w), ...physical, ...ground, ...people],
    c.work,
  );
  if (!path)
    throw new Error(
      'An unobstructed physical hand-access path could not be established.',
    );
  const footprint = { ...s.spatial, reserved: true };
  const placement = rootPlacement(w, c.actor, footprint, 0.2);
  let substrateError: string | null = null;
  if (moss) {
    try {
      mossRepresentation(
        s,
        w.objects.find((o) => o.id === 'residue-deposit-49-moss-298'),
      );
      if (
        s.data.source !== 'terrain-footprint:14:12.5:0.2' ||
        s.data.initialCoverMass !== 0.04 ||
        Number(s.data.completedPaidRounds) < 3 ||
        Number(s.data.exposedArea) < Math.PI * 0.04 - 1e-7 ||
        !placement.samples.every(
          (p) => ['.', 'f'].includes(p.ground) && p.waterlogging <= 0.1,
        )
      )
        substrateError =
          'No supported exposed soil case: require original conserved forest-floor provenance, completed physical exposure and current dry soil/forest substrate samples. Other substrate remains unknown.';
    } catch {
      substrateError =
        'Complete conserved surface/deposit representation is unavailable; substrate compatibility remains unknown.';
    }
  }
  const error =
    substrateError ??
    (s.spatial.solid ||
    s.spatial.reserved ||
    (s.data.activeWork && s.data.activeWork !== processId)
      ? 'The nominated annotation has an actual conflicting reservation or physical obstruction.'
      : !surfaceBare(s)
        ? 'Actual cover or residue remains in the nominated footprint.'
        : (placement.error ??
          ([...physical, ...ground].some((p) => v7ShapesOverlap(footprint, p))
            ? 'Physical clearance is not established; real matter occupies the footprint.'
            : null)));
  return { surface: s, error };
}
