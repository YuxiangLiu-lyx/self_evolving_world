import { continuousFixture } from '../../../../packages/world-core/test/fixtures/continuous-extension.js';
import {
  continuousRegistry,
  v7Step,
  v7Signature,
} from '@self-evolving-world/world-core';
import { browserDigest } from '../../src/continuous-history.js';
import type { SceneSegment } from '../../src/continuous-history.js';

/** Authored offline fixture; never included in ordinary-agent context. */
export async function recordedSegment(count = 7, offset = 0) {
  const initial = continuousFixture();
  const actor = initial.actors[0];
  if (!actor) throw new Error('Missing fixture actor.');
  actor.position.x += offset;
  let world = initial;
  const frames = [world];
  const segment: SceneSegment = {
    version: 7,
    start: 0,
    initial,
    rounds: [],
    initialCursors: {},
  };
  for (let i = 0; i < count; i++) {
    const before = await browserDigest(v7Signature(world));
    const actions = Object.fromEntries(
      world.actors.map((a) => [a.id, { interface: 'rest', args: {} }]),
    );
    world = v7Step(world, actions, continuousRegistry(world)).world;
    segment.rounds.push({
      tick: world.tick,
      before,
      after: await browserDigest(v7Signature(world)),
      actions,
      reviews: [],
      registrations: [],
      memory: {},
      events: world.events,
      tasks: {},
    });
    frames.push(world);
  }
  return { segment, frames };
}
