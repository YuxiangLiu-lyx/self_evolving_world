import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { V7World, V7Event } from '@self-evolving-world/world-core';
import type { SceneSegment } from '../src/continuous-history.js';
import { BOOKMARKS } from '../src/presentation/ex9/bookmarks.js';
import {
  currentAction,
  interior,
  motionFrom,
  ownedMantle,
  progress,
  project,
  unproject,
} from '../src/presentation/ex9/model.js';
const root = process.cwd();
const initial = JSON.parse(
  readFileSync(resolve(root, 'experiment/ex9/initial.json'), 'utf8'),
) as V7World;
const frame = (): V7World => structuredClone(initial);
function event(values: Partial<V7Event> = {}): V7Event {
  return {
    id: 'fixture',
    tick: 1,
    actor: 'lin',
    target: null,
    interface: 'navigate',
    type: 'moved',
    success: true,
    description: 'Isolated recorded movement fixture.',
    position: { x: 3.2, y: 3 },
    data: { distance: 0.2 },
    ...values,
  };
}
function movement() {
  const before = frame();
  before.objects = [];
  before.terrain = before.terrain.map((row) => '.'.repeat(row.length));
  before.tick = 0;
  const old = before.actors[0];
  if (!old) throw new Error('Missing fixture actor.');
  old.position = { x: 3, y: 3 };
  const after = structuredClone(before);
  after.tick = 1;
  const actor = after.actors[0];
  if (!actor) throw new Error('Missing fixture actor.');
  actor.position = { x: 3.2, y: 3 };
  after.events = [event()];
  return { before, after, actor };
}
describe('read-only ex9 presentation', () => {
  it('binds every bookmark to a successful real event and indexed bytes', () => {
    const index = JSON.parse(
      readFileSync(resolve(root, 'experiment/ex9/replay.json'), 'utf8'),
    ) as {
      segments: { start: number; end: number; path: string; sha256: string }[];
    };
    for (const part of index.segments) {
      const bookmarks = BOOKMARKS.filter(
        (b) => b.tick > part.start && b.tick <= part.end,
      );
      if (!bookmarks.length) continue;
      const bytes = readFileSync(resolve(root, 'experiment/ex9', part.path));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        part.sha256,
      );
      const segment = JSON.parse(bytes.toString()) as SceneSegment;
      for (const b of bookmarks) {
        const found = segment.rounds
          .find((r) => r.tick === b.tick)
          ?.events.find((e) => e.type === b.type && e.actor === b.sourceActor);
        expect(found, `${String(b.tick)} ${b.type}`).toBeDefined();
        expect(found?.success).toBe(true);
      }
    }
  });
  it('binds all unmodified asset copies to retained source provenance', () => {
    const dir = resolve(root, 'apps/viewer/public/presentation/ex9/assets');
    const manifest = JSON.parse(
      readFileSync(resolve(dir, 'provenance.json'), 'utf8'),
    ) as { files: { file: string; sha256: string }[] };
    for (const entry of manifest.files) {
      expect(
        createHash('sha256')
          .update(readFileSync(resolve(dir, entry.file)))
          .digest('hex'),
      ).toBe(entry.sha256);
    }
  });
  it('keeps camera transforms reversible for panning and picking', () => {
    const camera = { x: 13, y: 19.2, span: 16 },
      point = { x: 6.2, y: 30.1 };
    const recovered = unproject(
      project(point, camera, 1000, 650),
      camera,
      1000,
      650,
    );
    expect(recovered.x).toBeCloseTo(point.x);
    expect(recovered.y).toBeCloseTo(point.y);
  });
  it('interpolates only an adjacent successful recorded clear movement without mutation', () => {
    const { before, after, actor } = movement(),
      saved = JSON.stringify([before, after]);
    expect(motionFrom(before, after, actor)).toEqual({ x: 3, y: 3 });
    expect(JSON.stringify([before, after])).toBe(saved);
  });
  it('snaps discontinuous seeks, failed actions and unrecorded displacement', () => {
    const { before, after, actor } = movement();
    expect(motionFrom(undefined, after, actor)).toBeNull();
    after.tick = 2;
    expect(motionFrom(before, after, actor)).toBeNull();
    after.tick = 1;
    after.events = [event({ success: false })];
    expect(motionFrom(before, after, actor)).toBeNull();
    after.events = [event()];
    actor.position.x = 5;
    expect(motionFrom(before, after, actor)).toBeNull();
  });
  it('never interpolates across a solid wall or water cell', () => {
    const { before, after, actor } = movement();
    after.objects = [
      {
        id: 'fixture-wall',
        name: 'Isolated wall',
        kind: 'rock',
        createdAt: 0,
        createdBy: null,
        revision: 'fixture',
        visual: {
          component: 'rock',
          color: '#555',
          accent: '#555',
          label: 'Wall',
          state: 'solid',
        },
        data: {},
        spatial: {
          x: 3.1,
          y: 3,
          angle: 0,
          shape: { kind: 'rectangle', width: 0.05, height: 3 },
          solid: true,
          interaction: 0,
          entrances: [],
        },
      },
    ];
    expect(motionFrom(before, after, actor)).toBeNull();
    after.objects = [];
    after.terrain[3] = '...~' + '.'.repeat(44);
    expect(motionFrom(before, after, actor)).toBeNull();
  });
  it('keeps failures visible despite passive comfort events and does not claim completion', () => {
    const w = frame(),
      a = w.actors[0];
    if (!a) throw new Error('Missing actor.');
    w.events = [
      event({
        interface: 'process-willow',
        type: 'cancelled',
        success: false,
        description: 'Unfinished operation.',
      }),
      event({
        interface: 'portable-insulation',
        type: 'insulation-exposure-measured',
      }),
    ];
    expect(currentAction(w, a).failed).toBe(true);
    expect(progress(w, a)).toBeNull();
  });
  it('distinguishes an actual owned garment from mastery or another actor’s inventory', () => {
    const w = frame(),
      a = w.actors[0];
    if (!a) throw new Error('Missing actor.');
    a.mastered.push('portable-insulation');
    expect(ownedMantle(w, a.id, true)).toBeUndefined();
    w.stacks.push({
      id: 'fixture-mantle',
      resource: 'mantle',
      quantity: 1,
      position: a.position,
      owner: a.id,
      origin: 'fixture',
      mantle: {
        equipped: false,
        condition: 160,
        moisture: 0,
        lastTick: 0,
        inputs: [],
        repairs: [],
      },
    });
    expect(ownedMantle(w, a.id)).toBeDefined();
    expect(ownedMantle(w, a.id, true)).toBeUndefined();
    expect(ownedMantle(w, 'moss')).toBeUndefined();
  });
  it('uses actual enclosure bounds for the verified round-721 cave position', () => {
    const w = frame(),
      a = w.actors.find((a) => a.id === 'sol');
    if (!a) throw new Error('Missing Sol.');
    a.position = { x: 6, y: 30.1 };
    expect(interior(w, a)?.kind).toBe('cave');
    a.position = { x: 6, y: 31.7 };
    expect(interior(w, a)).toBeUndefined();
  });
});
