import { v7Interior, v7Walls } from '@self-evolving-world/world-core';
import type {
  V7Actor,
  V7Object,
  V7Point,
  V7World,
} from '@self-evolving-world/world-core';
import { sprite } from './assets.js';
import type { Art } from './assets.js';
import {
  currentAction,
  data,
  DEPTH,
  motionFrom,
  ownedMantle,
  PEOPLE,
  project,
} from './model.js';
import type { Camera, Person } from './model.js';

/** All scenery is projected from a verified frame. This module has no simulation
 * mutators, registry, inference or experiment-write entry points. */
export class ForestRenderer {
  private ground: HTMLCanvasElement | undefined;
  private terrain = '';
  private world: V7World | undefined;
  private from = new Map<string, V7Point>();
  private started = 0;
  private gestures = false;
  private animation = 0;
  private labels: { x: number; y: number; text: string; color: string }[] = [];
  private hits: { id: string; x: number; y: number; r: number }[] = [];
  camera: Camera = { x: 13, y: 19, span: 16 };
  selected: Person = 'lin';
  follow = true;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mini: HTMLCanvasElement,
    private readonly art: Art,
  ) {}
  setWorld(world: V7World, animate: boolean): void {
    this.from.clear();
    if (animate)
      for (const actor of world.actors) {
        const point = motionFrom(this.world, world, actor);
        if (point) this.from.set(actor.id, point);
      }
    this.gestures = animate;
    this.world = world;
    this.started = performance.now();
    this.draw();
  }
  focus(): void {
    const actor = this.world?.actors.find((a) => a.id === this.selected);
    if (actor) {
      this.camera.x = actor.position.x;
      this.camera.y = actor.position.y - 1.8;
    }
  }
  pick(x: number, y: number): Person | undefined {
    return this.hits
      .map((h) => ({ ...h, distance: Math.hypot(h.x - x, h.y - y) }))
      .filter((h) => h.distance < h.r)
      .sort((a, b) => a.distance - b.distance)[0]?.id as Person | undefined;
  }
  dispose(): void {
    cancelAnimationFrame(this.animation);
  }
  private makeGround(world: V7World): HTMLCanvasElement {
    const key = world.terrain.join('\n');
    if (this.ground && key === this.terrain) return this.ground;
    this.terrain = key;
    const ground = document.createElement('canvas'),
      unit = 48;
    ground.width = world.config.width * unit;
    ground.height = world.config.height * unit;
    const c = ground.getContext('2d');
    if (!c) throw new Error('Canvas unavailable.');
    const g = this.art.ground;
    for (let y = 0; y < ground.height; y += unit * 6)
      for (let x = 0; x < ground.width; x += unit * 6)
        c.drawImage(
          g.image,
          g.x,
          g.y,
          g.width,
          g.height,
          x,
          y,
          unit * 6,
          unit * 6,
        );
    for (let y = 0; y < world.config.height; y++)
      for (let x = 0; x < world.config.width; x++) {
        const tile = world.terrain[y]?.[x];
        c.fillStyle =
          tile === 'f'
            ? '#203c251b'
            : tile === ':'
              ? '#8c8b6b55'
              : tile === ','
                ? '#395d5955'
                : '#a8a26c16';
        c.fillRect(x * unit, y * unit, unit, unit);
        if (tile === '~' || tile === '=') {
          c.fillStyle = tile === '~' ? '#284b50' : '#547574';
          c.fillRect(x * unit, y * unit, unit, unit);
          const w = this.art.water;
          c.globalAlpha = 0.34;
          c.drawImage(
            w.image,
            w.x,
            w.y,
            w.width,
            w.height,
            x * unit,
            y * unit,
            unit,
            unit,
          );
          c.globalAlpha = 1;
          // Ripples are contained in recorded water cells; they do not draw new banks.
          c.strokeStyle = '#b3c1aa44';
          c.lineWidth = 1;
          for (let n = 0; n < 3; n++) {
            c.beginPath();
            c.moveTo(x * unit + 7, y * unit + 12 + n * 11);
            c.lineTo(x * unit + 32, y * unit + 10 + n * 11);
            c.stroke();
          }
        } else if ((x * 13 + y * 7) % 7 === 0) {
          sprite(
            c,
            tile === ':' ? this.art.pebbles : this.art.leaves,
            (x + 0.5) * unit,
            (y + 0.7) * unit,
            unit * 0.55,
          );
        }
      }
    this.ground = ground;
    return ground;
  }
  draw = (): void => {
    cancelAnimationFrame(this.animation);
    const world = this.world;
    if (!world) return;
    const rect = this.canvas.getBoundingClientRect(),
      width = rect.width,
      height = rect.height,
      ratio = Math.min(2, devicePixelRatio);
    if (!width || !height) return;
    if (
      this.canvas.width !== Math.round(width * ratio) ||
      this.canvas.height !== Math.round(height * ratio)
    ) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    const c = this.canvas.getContext('2d');
    if (!c) return;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.fillStyle = '#17291e';
    c.fillRect(0, 0, width, height);
    const mix = Math.min(1, (performance.now() - this.started) / 420);
    if (this.follow) {
      this.focus();
      const old = this.from.get(this.selected),
        actor = world.actors.find((a) => a.id === this.selected);
      if (old && actor) {
        this.camera.x += (old.x - actor.position.x) * (1 - mix);
        this.camera.y += (old.y - actor.position.y) * (1 - mix);
      }
    }
    const scale = width / this.camera.span,
      p = (v: V7Point) => project(v, this.camera, width, height);
    const origin = p({ x: 0, y: 0 });
    c.drawImage(
      this.makeGround(world),
      origin.x,
      origin.y,
      world.config.width * scale,
      world.config.height * scale * DEPTH,
    );
    // Soft grading preserves visibility even during recorded darkness. It is a presentation light, not a world effect.
    c.fillStyle = '#20302222';
    c.fillRect(0, 0, width, height);
    const poses = new Map<string, V7Point>();
    for (const a of world.actors) {
      const before = this.from.get(a.id);
      poses.set(
        a.id,
        before
          ? {
              x: before.x + (a.position.x - before.x) * mix,
              y: before.y + (a.position.y - before.y) * mix,
            }
          : a.position,
      );
    }
    const drawables: { y: number; draw: () => void }[] = [];
    this.hits = [];
    this.labels = [];
    for (const o of world.objects) {
      const pos = p(o.spatial);
      if (
        pos.x < -300 ||
        pos.x > width + 300 ||
        pos.y < -120 ||
        pos.y > height + 300
      )
        continue;
      if (o.spatial.enclosure) {
        this.building(c, o, world, scale, p);
        continue;
      }
      drawables.push({
        y: o.spatial.y,
        draw: () => {
          this.object(c, o, world, scale, p);
        },
      });
    }
    for (const a of world.actors) {
      const job = data(a.extensionState['shelter:pending']);
      if (
        job &&
        typeof job.x === 'number' &&
        typeof job.y === 'number' &&
        job.mode === 'build'
      ) {
        const point = p({ x: job.x, y: job.y }),
          paid = Number(job.elapsed ?? 0);
        c.save();
        c.translate(point.x, point.y);
        c.scale(scale, scale * DEPTH);
        c.rotate(Number(job.angle ?? 0));
        c.fillStyle = '#b99f6455';
        c.fillRect(-1, -1, 2, 2);
        c.strokeStyle = '#dec59b';
        c.lineWidth = 0.025;
        c.setLineDash([0.1, 0.1]);
        c.strokeRect(-1, -1, 2, 2);
        c.setLineDash([]);
        c.strokeStyle = '#c8a06b';
        c.lineWidth = 0.08;
        for (let n = 0; n < Math.min(6, paid); n++) {
          c.beginPath();
          c.moveTo(-0.9 + n * 0.32, 0.85);
          c.lineTo(-0.9 + n * 0.32, -0.85);
          c.stroke();
        }
        c.restore();
        this.labels.push({
          x: point.x,
          y: point.y - 1.2 * scale,
          text: `Under construction · ${String(paid)}/6`,
          color: '#ead0a1',
        });
      }
    }
    for (const s of world.stacks.filter((s) => !s.owner && s.quantity > 0)) {
      const pos = p(s.position);
      drawables.push({
        y: s.position.y,
        draw: () => {
          this.shadow(c, pos.x, pos.y, scale * 0.18);
          c.fillStyle =
            world.resources.find((r) => r.id === s.resource)?.color ??
            '#d4bf8a';
          c.fillRect(
            pos.x - scale * 0.1,
            pos.y - scale * 0.12,
            scale * 0.2,
            scale * 0.12,
          );
        },
      });
    }
    for (const a of world.actors) {
      const point = poses.get(a.id) ?? a.position;
      drawables.push({
        y: point.y,
        draw: () => {
          this.person(c, a, point, world, scale, p, mix);
        },
      });
    }
    drawables
      .sort((a, b) => a.y - b.y)
      .forEach((d) => {
        d.draw();
      });
    for (const label of this.labels)
      this.label(c, label.x, label.y, label.text, label.color);
    // Selected identity stays readable above foreground foliage.
    const selected = world.actors.find((a) => a.id === this.selected);
    if (selected) {
      const pos = p(poses.get(selected.id) ?? selected.position);
      this.label(
        c,
        pos.x,
        pos.y - scale * 1.67,
        selected.name,
        PEOPLE[this.selected],
      );
    }
    const vignette = c.createRadialGradient(
      width / 2,
      height / 2,
      width * 0.2,
      width / 2,
      height / 2,
      width * 0.75,
    );
    vignette.addColorStop(0, '#111c1300');
    vignette.addColorStop(1, '#101f1a88');
    c.fillStyle = vignette;
    c.fillRect(0, 0, width, height);
    this.drawMini(world, width, height);
    if (mix < 1 && this.gestures)
      this.animation = requestAnimationFrame(this.draw);
  };
  private shadow(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
  ): void {
    c.fillStyle = '#0c191b66';
    c.beginPath();
    c.ellipse(x, y, r, r * 0.3, 0, 0, Math.PI * 2);
    c.fill();
  }
  private label(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    color: string,
  ): void {
    c.font = '600 12px system-ui';
    const width = c.measureText(text).width;
    c.fillStyle = '#13241eeb';
    c.beginPath();
    c.roundRect(x - width / 2 - 9, y - 18, width + 18, 25, 6);
    c.fill();
    c.fillStyle = color;
    c.textAlign = 'center';
    c.fillText(text, x, y);
  }
  private object(
    c: CanvasRenderingContext2D,
    o: V7Object,
    world: V7World,
    scale: number,
    p: (v: V7Point) => V7Point,
  ): void {
    const pos = p(o.spatial);
    const component = o.visual.component;
    this.shadow(c, pos.x, pos.y, scale * 0.35);
    if (
      component === 'tree' ||
      o.kind.includes('tree') ||
      o.kind.includes('willow')
    ) {
      const actor = world.actors.find((a) => a.id === this.selected);
      const obscures =
        actor &&
        Math.abs(actor.position.x - o.spatial.x) < 1.5 &&
        actor.position.y < o.spatial.y &&
        actor.position.y > o.spatial.y - 3;
      c.save();
      c.globalAlpha = obscures ? 0.12 : 0.94;
      sprite(
        c,
        this.art.trees,
        pos.x,
        pos.y,
        scale * 3.1,
        o.id.length % 2 === 0,
      );
      c.restore();
    } else if (
      component === 'rock' ||
      o.kind.includes('rock') ||
      o.kind.includes('stone')
    )
      sprite(c, this.art.rock, pos.x, pos.y, scale * 0.8);
    else if (component === 'animal' || o.kind === 'animal') {
      c.fillStyle = o.visual.color;
      c.beginPath();
      c.ellipse(
        pos.x,
        pos.y - scale * 0.18,
        scale * 0.22,
        scale * 0.14,
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.beginPath();
      c.arc(
        pos.x + scale * 0.19,
        pos.y - scale * 0.28,
        scale * 0.09,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.strokeStyle = '#2c2923';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(pos.x - scale * 0.12, pos.y - scale * 0.12);
      c.lineTo(pos.x - scale * 0.14, pos.y);
      c.moveTo(pos.x + scale * 0.13, pos.y - scale * 0.12);
      c.lineTo(pos.x + scale * 0.12, pos.y);
      c.stroke();
    } else if (o.data.resource === 'fish') {
      c.strokeStyle = '#9bb5a5aa';
      c.lineWidth = 1.2;
      c.beginPath();
      c.ellipse(pos.x, pos.y, scale * 0.2, scale * 0.07, 0, 0, Math.PI * 2);
      c.stroke();
    } else {
      c.save();
      if (Number(o.data.stock ?? 1) <= 0) c.globalAlpha = 0.4;
      sprite(
        c,
        this.art.herb,
        pos.x,
        pos.y,
        scale * (o.data.resource === 'berry' ? 0.65 : 0.45),
      );
      if (o.data.resource === 'berry' && Number(o.data.stock ?? 0) > 0) {
        c.fillStyle = '#a54846';
        for (const [x, y] of [
          [-0.13, -0.2],
          [0.08, -0.26],
          [0.16, -0.15],
        ]) {
          c.beginPath();
          c.arc(
            pos.x + scale * (x ?? 0),
            pos.y + scale * (y ?? 0),
            Math.max(1, scale * 0.035),
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      }
      c.restore();
    }
  }
  private building(
    c: CanvasRenderingContext2D,
    object: V7Object,
    world: V7World,
    scale: number,
    p: (v: V7Point) => V7Point,
  ): void {
    const s = object.spatial,
      cave = object.kind === 'cave',
      expired = !cave && Number(object.data.remainingService ?? 0) <= 0;
    if (s.shape.kind !== 'rectangle') return;
    const center = p(s),
      w = s.shape.width,
      h = s.shape.height,
      inside = world.actors.some((a) => v7Interior(a.position, s));
    c.save();
    c.translate(center.x, center.y);
    c.scale(scale, scale * DEPTH);
    c.rotate(s.angle);
    c.fillStyle = cave ? '#202d2a' : '#655a3b';
    c.fillRect(-w / 2, -h / 2, w, h);
    // Roof cutaway reveals actual footprint only, never an invented room.
    if (!inside && !expired) {
      c.fillStyle = cave ? '#72756a' : '#9b8655';
      c.fillRect(-w / 2, -h / 2, w, h * 0.64);
      c.strokeStyle = cave ? '#4c564c' : '#6e623f';
      c.lineWidth = 0.04;
      for (let x = -w / 2 + 0.1; x < w / 2; x += 0.15) {
        c.beginPath();
        c.moveTo(x, -h / 2);
        c.lineTo(x, h * 0.14);
        c.stroke();
      }
    }
    c.restore();
    for (const wall of v7Walls(s)) {
      if (wall.shape.kind !== 'rectangle') continue;
      const point = p(wall);
      c.save();
      c.translate(point.x, point.y);
      c.scale(scale, scale * DEPTH);
      c.rotate(wall.angle);
      c.fillStyle = cave ? '#757c68' : '#bba06e';
      c.fillRect(
        -wall.shape.width / 2,
        -wall.shape.height / 2,
        wall.shape.width,
        wall.shape.height,
      );
      c.beginPath();
      c.rect(
        -wall.shape.width / 2,
        -wall.shape.height / 2,
        wall.shape.width,
        wall.shape.height,
      );
      c.clip();
      if (cave) {
        const rock = this.art.rock;
        for (
          let y = -wall.shape.height / 2;
          y < wall.shape.height / 2;
          y += 0.4
        )
          for (
            let x = -wall.shape.width / 2;
            x < wall.shape.width / 2;
            x += 0.55
          )
            c.drawImage(
              rock.image,
              rock.x,
              rock.y,
              rock.width,
              rock.height,
              x - 0.08,
              y - 0.06,
              0.7,
              0.5,
            );
      } else {
        c.strokeStyle = '#74623e';
        c.lineWidth = 0.02;
        for (
          let x = -wall.shape.width / 2;
          x < wall.shape.width / 2;
          x += 0.08
        ) {
          c.beginPath();
          c.moveTo(x, -wall.shape.height / 2);
          c.lineTo(x, wall.shape.height / 2);
          c.stroke();
        }
      }
      c.restore();
    }
    for (const e of s.entrances) {
      const point = p({
        x: s.x + e.x * Math.cos(s.angle) - e.y * Math.sin(s.angle),
        y: s.y + e.x * Math.sin(s.angle) + e.y * Math.cos(s.angle),
      });
      c.fillStyle = '#e1ca8c';
      c.beginPath();
      c.arc(point.x, point.y, 3, 0, Math.PI * 2);
      c.fill();
    }
    this.labels.push({
      x: center.x - Math.max(0, (w * scale) / 2 - 65),
      y: center.y - (h * scale * DEPTH) / 2 - 9,
      text: `${cave ? 'Cave' : 'Shelter'}${expired ? ' · covering expired' : inside ? ' · cutaway' : ''}`,
      color: '#e3d6b5',
    });
  }
  private person(
    c: CanvasRenderingContext2D,
    a: V7Actor,
    point: V7Point,
    world: V7World,
    scale: number,
    p: (v: V7Point) => V7Point,
    mix: number,
  ): void {
    const pos = p(point),
      action = currentAction(world, a),
      moving = this.from.has(a.id) && mix < 1;
    const old = this.from.get(a.id),
      dx = old ? a.position.x - old.x : Math.cos(a.angle),
      dy = old ? a.position.y - old.y : Math.sin(a.angle);
    const side = Math.abs(dx) > Math.abs(dy) * 1.2,
      back = !side && dy < 0;
    const frame = moving
      ? side
        ? 3
        : (back ? 5 : 1) + (Math.floor(mix * 4) % 2)
      : side
        ? 3
        : back
          ? 4
          : 0;
    const art = this.art.people[a.id]?.[frame];
    if (!art) return;
    this.shadow(c, pos.x, pos.y, scale * 0.36);
    c.strokeStyle = PEOPLE[a.id as Person];
    c.lineWidth = a.id === this.selected ? 2.5 : 1.2;
    c.beginPath();
    c.ellipse(pos.x, pos.y, scale * 0.32, scale * 0.12, 0, 0, Math.PI * 2);
    c.stroke();
    const resting = action.kind === 'rest' && !action.failed;
    c.save();
    c.translate(pos.x, pos.y);
    if (resting)
      c.scale(
        1,
        0.8 + (this.gestures && mix < 1 ? 0.02 * Math.sin(mix * Math.PI) : 0),
      );
    sprite(c, art, 0, 0, scale * 1.48, side && dx < 0);
    const mantle = ownedMantle(world, a.id, true)?.mantle;
    if (mantle) {
      const fold = c.createLinearGradient(-scale * 0.32, 0, scale * 0.28, 0);
      fold.addColorStop(0, mantle.moisture > 0.4 ? '#493e2d' : '#73613e');
      fold.addColorStop(0.4, mantle.moisture > 0.4 ? '#7d6c4d' : '#ad9464');
      fold.addColorStop(1, '#594b32');
      c.fillStyle = fold;
      c.strokeStyle = '#d0b989';
      c.lineWidth = scale * 0.018;
      c.beginPath();
      c.moveTo(-scale * 0.18, -scale * 1.15);
      c.quadraticCurveTo(
        -scale * 0.34,
        -scale * 0.9,
        -scale * 0.32,
        -scale * 0.35,
      );
      c.lineTo(scale * 0.28, -scale * (mantle.condition < 40 ? 0.46 : 0.35));
      c.quadraticCurveTo(
        scale * 0.33,
        -scale * 0.8,
        scale * 0.17,
        -scale * 1.15,
      );
      c.closePath();
      c.fill();
      c.stroke();
      c.strokeStyle = '#d4c49355';
      c.lineWidth = scale * 0.018;
      for (const x of [-0.13, 0.09]) {
        c.beginPath();
        c.moveTo(x * scale, -scale * 1.06);
        c.quadraticCurveTo(
          x * scale * 0.7,
          -scale * 0.7,
          x * scale * 1.6,
          -scale * 0.42,
        );
        c.stroke();
      }
    }
    c.restore();
    if (a.id === this.selected && this.camera.span < 28) {
      const work =
        [
          'gather',
          'process-willow',
          'portable-insulation',
          'build-shelter',
        ].includes(action.kind) && !action.failed;
      if (work) {
        c.strokeStyle = '#e0c99e';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(pos.x + scale * 0.2, pos.y - scale * 0.85);
        c.lineTo(
          pos.x + scale * 0.42,
          pos.y -
            scale *
              (0.65 +
                (this.gestures && mix < 1
                  ? 0.09 * Math.sin(mix * Math.PI * 4)
                  : 0)),
        );
        c.stroke();
      }
      if (action.failed)
        this.label(c, pos.x, pos.y + 23, 'Interrupted', '#e4ac85');
      else if (resting) this.label(c, pos.x, pos.y + 23, 'Resting', '#bbcdb8');
    }
    this.hits.push({
      id: a.id,
      x: pos.x,
      y: pos.y - scale * 0.7,
      r: Math.max(14, scale * 0.65),
    });
  }
  private drawMini(world: V7World, width: number, height: number): void {
    const c = this.mini.getContext('2d');
    if (!c) return;
    const w = this.mini.width,
      h = this.mini.height;
    c.drawImage(this.makeGround(world), 0, 0, w, h);
    for (const a of world.actors) {
      c.fillStyle = PEOPLE[a.id as Person];
      c.strokeStyle = '#15251f';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(
        (a.position.x / world.config.width) * w,
        (a.position.y / world.config.height) * h,
        a.id === this.selected ? 4.5 : 3,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.stroke();
    }
    const viewHeight = ((height / width) * this.camera.span) / DEPTH;
    c.strokeStyle = '#efe4bf';
    c.lineWidth = 1;
    c.strokeRect(
      ((this.camera.x - this.camera.span / 2) / world.config.width) * w,
      ((this.camera.y - viewHeight / 2) / world.config.height) * h,
      (this.camera.span / world.config.width) * w,
      (viewHeight / world.config.height) * h,
    );
  }
}
