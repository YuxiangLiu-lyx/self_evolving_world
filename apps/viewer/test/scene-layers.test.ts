import { expect, it } from 'vitest';
import {
  continuousScene,
  sceneHitSvg,
  sceneMinimapSvg,
} from '../src/continuous-scene.js';
import { continuousFixture } from '../../../packages/world-core/test/fixtures/continuous-extension.js';

it('retains exact selectable identities without rendering hidden terrain twice', () => {
  const world = continuousFixture();
  const frame = continuousScene(world, null);
  const hit = sceneHitSvg(frame);
  for (const actor of world.actors) {
    expect(hit).toContain(`data-scene-actor="${actor.id}"`);
    expect(hit).toContain(`data-x="${String(actor.position.x)}"`);
  }
  for (const object of world.objects)
    expect(hit).toContain(`data-scene-object="${object.id}"`);
  expect(hit).not.toContain('id="terrain"');
  expect(hit).not.toContain('feTurbulence');
});
it('keeps private hit targets and overview entities within the supplied observation', () => {
  const world = continuousFixture(),
    self = world.actors[0],
    hidden = world.actors[1];
  if (!self || !hidden) throw new Error('Missing fixture members.');
  hidden.position = { x: 100, y: 100 };
  const privateFrame = continuousScene(world, self.id);
  expect(privateFrame.actors.map((a) => a.id)).not.toContain(hidden.id);
  expect(sceneHitSvg(privateFrame)).not.toContain(
    `data-scene-actor="${hidden.id}"`,
  );
  expect(sceneMinimapSvg(privateFrame)).not.toContain('cx="100"');
  expect(sceneMinimapSvg(privateFrame)).toContain('#203d37');
});
it('escapes names in accessible hit regions and merges uniform map cells into paths', () => {
  const world = continuousFixture(),
    actor = world.actors[0];
  if (!actor) throw new Error('Missing member');
  actor.name = '<script>unsafe</script>';
  const frame = continuousScene(world, null);
  expect(sceneHitSvg(frame)).not.toContain('<script>');
  expect(sceneHitSvg(frame)).toContain('&lt;script&gt;');
  frame.terrain = Array.from({ length: frame.width * frame.height }, () => '.');
  const map = sceneMinimapSvg(frame);
  expect(map.match(/<path /g)).toHaveLength(1);
  expect(map).not.toContain('feTurbulence');
});
