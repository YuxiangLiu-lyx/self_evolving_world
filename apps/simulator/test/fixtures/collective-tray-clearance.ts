import {
  continuousRegistry,
  v7Clone,
  v7Install,
  trayClearanceResult,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { rootFixture, rootStep } from './collective-roots.js';
export const clearanceId = 'root-tray-clearance';
export const clearanceAction = (x = 10.7, y = 10): V7Action => ({
  interface: clearanceId,
  args: { mode: 'assess', site: { x, y } },
});
export function clearanceFixture() {
  const w = v7Clone(
    v7Install(
      rootFixture(),
      continuousRegistry(rootFixture()),
      clearanceId + '@1',
    ),
  );
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor.');
  a.mastered.push(clearanceId);
  a.collective?.knownAbilities.push(clearanceId);
  return w;
}
export function clearanceResult(w: V7World) {
  const a = w.actors[0];
  const r = a && trayClearanceResult(a);
  if (!r) throw new Error('Missing actual assessment.');
  return r;
}
export function clearanceFrames() {
  const initial = clearanceFixture();
  const blocked = rootStep(initial, clearanceAction(10, 10)).world;
  const clear = rootStep(blocked, clearanceAction()).world;
  const moved = v7Clone(clear);
  const a = moved.actors[0];
  if (!a) throw new Error('Missing actor.');
  a.position = { x: 10.7, y: 10 };
  const read = rootStep(moved, {
    interface: clearanceId,
    args: {
      mode: 'read',
      assessmentId: clearanceResult(clear).assessmentId ?? '',
    },
  }).world;
  const unknown = rootStep(initial, clearanceAction(60, 60)).world;
  return { initial, blocked, clear, read, unknown };
}
