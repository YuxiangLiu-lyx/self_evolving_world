import { v7Interior, v7Walls } from '@self-evolving-world/world-core';
import type {
  V7Actor,
  V7Object,
  V7Point,
  V7World,
} from '@self-evolving-world/world-core';
import { FollowCamera } from './camera.js';
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
  private next: V7World | undefined;
  private moves = new Map<string, V7Point>();
  private poses = new Map<string, V7Point>();
  private strides = new Map<string, number>();
  private facing = new Map<string, V7Point>();
  private workBlend = new Map<string, number>();
  private time = 0;
  private active = false;
  readonly rig = new FollowCamera();
  get camera(): Camera {
    return this.rig.view;
  }
  private labels: { x: number; y: number; text: string; color: string }[] = [];
  private hits: { id: string; x: number; y: number; r: number }[] = [];
  selected: Person = 'lin';
  follow = true;
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mini: HTMLCanvasElement,
    private readonly art: Art,
  ) {}
  setWorld(world: V7World, next?: V7World, cut = false): void {
    if (world !== this.world || next !== this.next) {
      this.moves.clear();
      if (next)
        for (const actor of next.actors) {
          const point = motionFrom(world, next, actor);
          if (point)
            this.moves.set(actor.id, {
              x: actor.position.x - point.x,
              y: actor.position.y - point.y,
            });
        }
    }
    this.world = world;
    this.next = next;
    if (cut) {
      this.poses.clear();
      this.strides.clear();
      this.facing.clear();
      this.workBlend.clear();
      this.focus();
    }
  }
  focus(): void {
    const actor = this.world?.actors.find((a) => a.id === this.selected);
    if (actor) this.rig.cut(this.poses.get(actor.id) ?? actor.position);
  }
  select(id: Person): boolean {
    this.selected = id;
    const point =
      this.poses.get(id) ??
      this.world?.actors.find((a) => a.id === id)?.position;
    const distant =
      !!point &&
      Math.hypot(point.x - this.camera.x, point.y - this.camera.y) >
        this.camera.span * 0.65;
    if (distant) this.rig.cut(point);
    this.follow = true;
    return distant;
  }
  render(
    fraction: number,
    time: number,
    seconds: number,
    active: boolean,
  ): void {
    this.time = time;
    this.active = active;
    for (const actor of this.world?.actors ?? []) {
      const movement = this.moves.get(actor.id),
        point = {
          x: actor.position.x + (movement?.x ?? 0) * fraction,
          y: actor.position.y + (movement?.y ?? 0) * fraction,
        },
        previous = this.poses.get(actor.id);
      if (previous) {
        const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
        // Discontinuous or rejected paths never add imaginary walking distance.
        if (distance < 0.5)
          this.strides.set(
            actor.id,
            (this.strides.get(actor.id) ?? 0) + (distance * Math.PI * 2) / 0.65,
          );
      }
      if (movement) this.facing.set(actor.id, movement);
      this.poses.set(actor.id, point);
      const action = this.poseAction(actor),
        work =
          !movement &&
          !action.failed &&
          [
            'gather',
            'process-willow',
            'portable-insulation',
            'build-shelter',
            'twist-cord',
          ].includes(action.kind);
      const blend = this.workBlend.get(actor.id) ?? 0;
      this.workBlend.set(
        actor.id,
        blend + (Number(work) - blend) * (1 - Math.exp(-18 * seconds)),
      );
    }
    this.rig.update(
      seconds,
      this.follow ? this.poses.get(this.selected) : undefined,
      this.active ? this.moves.get(this.selected) : undefined,
    );
    this.draw();
  }
  private poseAction(actor: V7Actor): ReturnType<typeof currentAction> {
    const world = this.world;
    if (!world) throw new Error('Cannot animate without a verified frame.');
    const nextActor = this.next?.actors.find((a) => a.id === actor.id);
    // Preview the activity only; all objects, progress and outputs use the base frame.
    return this.active && this.next && nextActor
      ? currentAction(this.next, nextActor)
      : currentAction(world, actor);
  }
  snapshot(): {
    point: V7Point | undefined;
    camera: Camera;
    phase: number;
    moving: boolean;
    work: number;
  } {
    return {
      point: this.poses.get(this.selected),
      camera: { ...this.camera },
      phase: this.strides.get(this.selected) ?? 0,
      moving: this.active && this.moves.has(this.selected),
      work: this.workBlend.get(this.selected) ?? 0,
    };
  }
  pick(x: number, y: number): Person | undefined {
    return this.hits
      .map((h) => ({ ...h, distance: Math.hypot(h.x - x, h.y - y) }))
      .filter((h) => h.distance < h.r)
      .sort((a, b) => a.distance - b.distance)[0]?.id as Person | undefined;
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
    const world = this.world;
    if (!world) return;
    const rect = this.canvas.getBoundingClientRect(),
      width = rect.width,
      height = rect.height,
      ratio = devicePixelRatio || 1;
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
    const poses = this.poses;
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
          this.object(c, o, scale, p);
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
          this.person(c, a, point, world, scale, p);
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
      const point = this.poses.get(this.selected),
        screen = point ? p(point) : undefined,
        tree = this.art.trees,
        height = 3.1 * scale,
        treeScale = height / tree.height,
        left =
          pos.x -
          (o.id.length % 2 === 0 ? tree.width - tree.foot : tree.foot) *
            treeScale;
      const obscures =
        point &&
        screen &&
        point.y < o.spatial.y &&
        screen.x + 0.4 * scale > left &&
        screen.x - 0.4 * scale < left + tree.width * treeScale &&
        screen.y > pos.y - height &&
        screen.y - 1.5 * scale < pos.y;
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
  ): void {
    const pos = p(point),
      action = this.poseAction(a),
      moving = this.active && this.moves.has(a.id),
      phase = this.strides.get(a.id) ?? 0,
      direction = this.facing.get(a.id),
      dx = direction?.x ?? Math.cos(a.angle),
      dy = direction?.y ?? Math.sin(a.angle),
      side = Math.abs(dx) > Math.abs(dy) * 1.2,
      back = !side && dy < 0,
      step = Math.sin(phase) >= 0 ? 0 : 1,
      frame = moving
        ? side
          ? step
            ? 7
            : 3
          : (back ? 5 : 1) + step
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
    const work = this.workBlend.get(a.id) ?? 0;
    if (resting) c.scale(1, 0.8 + 0.01 * Math.sin(this.time * 2));
    if (moving) {
      c.translate(0, -scale * 0.025 * Math.abs(Math.sin(phase)));
      c.rotate(0.018 * Math.sin(phase));
    } else if (work > 0.01) {
      c.rotate(work * 0.035 * Math.sin(this.time * Math.PI * 3));
    }
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
      if (work > 0.01 && !action.failed && !moving) {
        c.strokeStyle = '#e0c99e';
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(pos.x + scale * 0.2, pos.y - scale * 0.85);
        c.lineTo(
          pos.x + scale * 0.42,
          pos.y -
            scale * (0.65 + work * 0.09 * Math.sin(this.time * Math.PI * 3)),
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
    const ratio = devicePixelRatio || 1,
      w = this.mini.clientWidth,
      h = this.mini.clientHeight;
    if (
      this.mini.width !== Math.round(w * ratio) ||
      this.mini.height !== Math.round(h * ratio)
    ) {
      this.mini.width = Math.round(w * ratio);
      this.mini.height = Math.round(h * ratio);
    }
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.drawImage(this.makeGround(world), 0, 0, w, h);
    for (const a of world.actors) {
      c.fillStyle = PEOPLE[a.id as Person];
      c.strokeStyle = '#15251f';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(
        ((this.poses.get(a.id)?.x ?? a.position.x) / world.config.width) * w,
        ((this.poses.get(a.id)?.y ?? a.position.y) / world.config.height) * h,
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
