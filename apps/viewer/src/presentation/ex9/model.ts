import {
  v7Interior,
  v7Obstacles,
  v7SegmentClear,
} from '@self-evolving-world/world-core';
import type {
  V7Actor,
  V7Data,
  V7Event,
  V7Point,
  V7Spatial,
  V7World,
} from '@self-evolving-world/world-core';

export const PEOPLE = {
  lin: '#d9bc78',
  moss: '#99c3b3',
  sol: '#d99b83',
} as const;
export type Person = keyof typeof PEOPLE;
export interface Camera {
  x: number;
  y: number;
  span: number;
}
export const DEPTH = 0.78;
export function project(
  p: V7Point,
  camera: Camera,
  width: number,
  height: number,
): V7Point {
  const scale = width / camera.span;
  return {
    x: width / 2 + (p.x - camera.x) * scale,
    y: height / 2 + (p.y - camera.y) * scale * DEPTH,
  };
}
export function unproject(
  p: V7Point,
  camera: Camera,
  width: number,
  height: number,
): V7Point {
  const scale = width / camera.span;
  return {
    x: camera.x + (p.x - width / 2) / scale,
    y: camera.y + (p.y - height / 2) / scale / DEPTH,
  };
}
export function data(value: unknown): V7Data | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as V7Data)
    : null;
}
const passive = new Set([
  'wellbeing',
  'mental-state',
  'season-changed',
  'insulation-exposure-measured',
  'insulation-comfort-qualified',
  'satisfaction',
  'satisfaction-maintained',
  'satisfaction-expired',
  'shelter-refuge-qualified',
]);
export function actionEvents(world: V7World, actor: string): V7Event[] {
  return world.events.filter(
    (e) => e.actor === actor && !!e.interface && !passive.has(e.type),
  );
}
export function currentAction(
  world: V7World,
  actor: V7Actor,
): {
  label: string;
  event: V7Event | undefined;
  kind: string;
  failed: boolean;
  resting: boolean;
  working: boolean;
} {
  const events = actionEvents(world, actor.id);
  const failure = events.find(
    (e) => !e.success || e.type.includes('cancelled'),
  );
  const event =
    failure ??
    events.findLast((e) => e.type === 'apple-trial-consumed') ??
    events.findLast((e) => e.type.endsWith('-completed')) ??
    events.at(-1);
  const kind = event?.interface ?? (actor.learning ? 'learn' : 'idle');
  const labels: Record<string, string> = {
    'source-bound-opened-hazelnut-access-trial':
      'Clearance / exterior contact; no extraction',
    navigate: 'Travelling',
    gather: 'Gathering',
    rest: 'Resting',
    eat: 'Eating',
    learn: 'Studying',
    request: 'Requesting a capability',
    give: 'Handing over material',
    message: 'Communicating',
    'build-shelter': 'Building shelter',
    'portable-insulation': 'Working with insulation',
    'process-willow': 'Processing willow',
    'active-warming': 'Warming through movement',
    recuperate: 'Recovering',
    'assess-food': 'Assessing food',
    'observe-wildlife': 'Observing wildlife',
    'inspect-route': 'Inspecting a route',
    wait: 'Waiting',
    drop: 'Putting down an item',
    idle: 'At a recorded boundary',
  };
  return {
    label: failure
      ? 'Action failed / interrupted'
      : event?.type === 'separation-assessed'
        ? 'Clearance checked; separation unresolved'
        : event?.type === 'branch-assessment-completed'
          ? 'Geometry unavailable; no load test performed'
          : event?.type === 'birch-assessment-completed'
            ? 'Assessment inconclusive; no container made'
            : event?.type === 'recovery-assessment-completed'
              ? 'Access checked; pickup and separation are separate'
              : event?.type === 'nut-access-completed'
                ? 'Contact test ended; no material transferred'
                : event?.type === 'opened-assessment-completed'
                  ? 'Assessment recorded; separability unresolved'
                  : event?.type === 'nut-opening-completed'
                    ? event.data.exposed === true
                      ? 'Contact exposed a region; safety unverified'
                      : 'Bounded contact ended; result unverified'
                    : event?.type === 'apple-trial-consumed'
                      ? 'Actual 0.1 portion consumed; safety unresolved'
                      : event?.type === 'moss-apple-assessment-completed' ||
                          event?.type === 'apple-assessment-completed' ||
                          event?.type === 'moss-food-assessment-completed' ||
                          event?.type === 'plum-assessment-completed'
                        ? 'Assessment inconclusive; safety unverified'
                        : event?.type === 'specimen-examination-completed'
                          ? 'Specimen examined; safety unverified'
                          : event?.type.endsWith('-completed')
                            ? 'Work completed'
                            : event?.type === 'insulation-equipped'
                              ? 'Mantle equipped'
                              : (labels[kind] ??
                                world.abilities.find((a) => a.id === kind)
                                  ?.name ??
                                kind),
    event,
    kind,
    failed: !!failure,
    resting:
      !failure && (kind === 'rest' || events.some((e) => e.type === 'rested')),
    working:
      !failure &&
      events.some((e) =>
        [
          'process-progress',
          'site-examination-completed',
          'prepared-placement-examined',
          'root-inspected',
          'moss-inspected',
          'specimen-examination-completed',
          'apple-assessment-completed',
          'moss-food-assessment-completed',
          'opened-assessment-completed',
          'nut-opening-contact',
          'nut-opening-inspected',
          'nut-access-assessed',
          'nut-access-contact',
          'nut-access-observed',
          'recovery-assessment-completed',
          'birch-assessment-completed',
          'branch-assessment-completed',
          'separation-assessed',
          'plum-assessment-completed',
          'moss-apple-assessment-completed',
          'apple-trial-consumed',
        ].includes(e.type),
      ),
  };
}
/** A displayed transition is never a new route. Use only adjacent successful
 * recorded movement, with a clear swept disc in both authoritative snapshots. */
export function motionFrom(
  before: V7World | undefined,
  after: V7World,
  actor: V7Actor,
): V7Point | null {
  if (!before || before.tick + 1 !== after.tick) return null;
  const old = before.actors.find((a) => a.id === actor.id);
  if (
    !old ||
    old.vitals.health <= 0 ||
    actor.vitals.health <= 0 ||
    old.life?.deaths !== actor.life?.deaths
  )
    return null;
  const event = after.events.find(
    (e) =>
      e.actor === actor.id &&
      e.interface === 'navigate' &&
      e.success &&
      ['moved', 'arrived'].includes(e.type),
  );
  if (!event || typeof event.data.distance !== 'number') return null;
  const distance = Math.hypot(
    old.position.x - actor.position.x,
    old.position.y - actor.position.y,
  );
  if (
    distance < 1e-8 ||
    Math.abs(distance - event.data.distance) > 1e-6 ||
    distance > 1.5
  )
    return null;
  if (
    ![before, after].every((w) =>
      v7SegmentClear(old.position, actor.position, actor.radius, [
        ...v7Obstacles(w),
        ...w.actors
          .filter((a) => a.id !== actor.id)
          .map((a): V7Spatial => ({
            ...a.position,
            angle: 0,
            shape: { kind: 'circle', radius: a.radius },
            solid: true,
            interaction: 0,
            entrances: [],
          })),
      ]),
    )
  )
    return null;
  return old.position;
}
export function interior(world: V7World, actor: V7Actor) {
  return world.objects.find((o) => v7Interior(actor.position, o.spatial));
}
export function ownedMantle(world: V7World, actor: string, equipped = false) {
  return world.stacks.find(
    (s) =>
      s.owner === actor &&
      s.quantity > 0 &&
      s.mantle &&
      (!equipped || s.mantle.equipped),
  );
}
export function progress(
  world: V7World,
  actor: V7Actor,
): { paid: number; total: number; label: string } | null {
  const event = [...actionEvents(world, actor.id)]
    .reverse()
    .find((e) => typeof e.data.elapsed === 'number');
  if (event && typeof event.data.elapsed === 'number') {
    const paid = event.data.elapsed;
    const remaining =
      typeof event.data.remaining === 'number'
        ? event.data.remaining
        : event.interface === 'build-shelter'
          ? 6 - paid
          : 0;
    return {
      paid,
      total: paid + Math.max(0, remaining),
      label: event.type.includes('completed')
        ? 'Completed paid work'
        : event.success && !event.type.includes('cancelled')
          ? 'Recorded paid work'
          : 'Interrupted; paid effort recorded',
    };
  }
  if (world.config.longDevelopment) {
    const paid = actionEvents(world, actor.id).findLast(
      (e) => e.type === 'process-progress',
    );
    if (
      paid &&
      typeof paid.data.completedWork === 'number' &&
      typeof paid.data.initialWork === 'number'
    )
      return {
        paid: paid.data.completedWork,
        total: paid.data.initialWork,
        label: 'Paid work steps; see actual outcome',
      };
    const binding = data(actor.extensionState['execution:operation']);
    const operation = data(binding?.operation);
    if (
      operation &&
      typeof operation.elapsed === 'number' &&
      typeof operation.remaining === 'number'
    )
      return {
        paid: operation.elapsed,
        total: operation.elapsed + operation.remaining,
        label: 'Retained operation; paid progress',
      };
  }
  if (actor.learning) {
    const total = world.abilities.find(
      (a) => a.id === actor.learning?.ability,
    )?.learning;
    if (total !== undefined)
      return {
        paid: total - actor.learning.remaining,
        total,
        label: 'Personal study; no automatic equipment',
      };
  }
  return null;
}
