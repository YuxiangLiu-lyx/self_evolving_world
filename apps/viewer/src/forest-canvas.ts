import {
  forestClimate,
  v7Interior,
  v7Walls,
  v7Visible,
  v7Distance,
  v7SegmentClear,
  v7Obstacles,
} from '@self-evolving-world/world-core';
import type {
  V7Actor,
  V7Object,
  V7Point,
} from '@self-evolving-world/world-core';
import type { SceneFrame } from './continuous-scene.js';
import { CONTINUOUS_VISUALS } from './continuous-visuals.js';

const visualCache = new Map<string, HTMLImageElement>();
function packageVisual(c: CanvasRenderingContext2D, o: V7Object): boolean {
  const render = CONTINUOUS_VISUALS[o.visual.component];
  if (
    !render ||
    ['tree', 'rock', 'plant', 'animal', 'cave', 'enclosure'].includes(
      o.visual.component,
    )
  )
    return false;
  const key = JSON.stringify([o.visual, o.data, o.spatial.shape]);
  let image = visualCache.get(key);
  if (!image) {
    image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 6 6" width="384" height="384">${render(o, [])}</svg>`)}`;
    image.addEventListener(
      'load',
      () => {
        window.dispatchEvent(new Event('forest-visual-ready'));
      },
      { once: true },
    );
    visualCache.set(key, image);
    if (visualCache.size > 128)
      visualCache.delete(visualCache.keys().next().value ?? '');
  }
  if (image.complete && image.naturalWidth) c.drawImage(image, -3, -3, 6, 6);
  return image.complete && image.naturalWidth > 0;
}

export interface ForestCamera {
  x: number;
  y: number;
  size: number;
}
const terrainColors: Record<string, string> = {
  f: '#52644a',
  '.': '#7d8860',
  ',': '#596e61',
  ':': '#888b78',
  '~': '#365c68',
  '=': '#88a599',
};
const circle = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
): void => {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};
const ellipse = (
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
): void => {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
};
function label(
  c: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = '#fff0cf',
): void {
  c.font = '600 0.25px system-ui';
  c.textAlign = 'center';
  c.lineWidth = 0.075;
  c.strokeStyle = '#253c34';
  c.strokeText(text, x, y);
  c.fillStyle = color;
  c.fillText(text, x, y);
}
function object(
  c: CanvasRenderingContext2D,
  o: V7Object,
  selected: V7Actor | undefined,
): void {
  const { x, y } = o.spatial;
  c.save();
  c.translate(x, y);
  if (o.kind === 'shelter-site') {
    c.rotate(o.spatial.angle);
    c.fillStyle = '#8b795744';
    c.fillRect(-1, -1, 2, 2);
    c.strokeStyle = '#d8c797';
    c.lineWidth = 0.06;
    c.setLineDash([0.18, 0.1]);
    c.strokeRect(-1, -1, 2, 2);
    for (const px of [-0.85, 0.85]) {
      c.beginPath();
      c.moveTo(px, 0.85);
      c.lineTo(px, -0.85);
      c.stroke();
    }
    c.restore();
    label(
      c,
      `Reserved site · ${String(Number(o.data.progress))} / 6`,
      x,
      y - 1.3,
    );
    return;
  }
  if (o.spatial.enclosure && o.spatial.shape.kind === 'rectangle') {
    c.rotate(o.spatial.angle);
    const { width: w, height: h } = o.spatial.shape,
      inside = !!selected && v7Interior(selected.position, o.spatial);
    c.fillStyle = o.kind === 'cave' ? '#343e39' : '#8a7859';
    c.fillRect(-w / 2, -h / 2, w, h);
    for (let i = 0; i < 28; i++) {
      const px = Math.sin(i * 9.3) * (w / 2 - 0.4),
        py = Math.cos(i * 4.7) * (h / 2 - 0.4);
      ellipse(c, px, py, 0.07, 0.03, '#b6aa8133');
    }
    c.restore();
    for (const wall of v7Walls(o.spatial)) {
      if (wall.shape.kind !== 'rectangle') continue;
      c.save();
      c.translate(wall.x, wall.y);
      c.rotate(wall.angle);
      c.fillStyle = o.visual.color;
      c.fillRect(
        -wall.shape.width / 2,
        -wall.shape.height / 2,
        wall.shape.width,
        wall.shape.height,
      );
      c.strokeStyle = '#293b32';
      c.lineWidth = 0.07;
      c.strokeRect(
        -wall.shape.width / 2,
        -wall.shape.height / 2,
        wall.shape.width,
        wall.shape.height,
      );
      c.restore();
    }
    if (!inside) {
      c.save();
      c.translate(x, y);
      c.rotate(o.spatial.angle);
      c.globalAlpha =
        o.kind === 'insulating-shelter' && Number(o.data.remainingService) <= 0
          ? 0.35
          : 0.91;
      c.fillStyle = o.spatial.enclosure.roof;
      c.beginPath();
      c.moveTo(-w / 2 - 0.1, -h / 2);
      c.lineTo(0, -h / 2 - 0.5);
      c.lineTo(w / 2 + 0.1, -h / 2);
      c.lineTo(w / 2 + 0.1, h / 2 - 0.7);
      c.lineTo(-w / 2 - 0.1, h / 2 - 0.7);
      c.closePath();
      c.fill();
      c.strokeStyle = '#d7c99b33';
      c.lineWidth = 0.08;
      for (let n = -w / 2; n < w / 2 && o.kind !== 'cave'; n += 0.45) {
        c.beginPath();
        c.moveTo(n, -h / 2 + 0.1);
        c.lineTo(n, h / 2 - 0.8);
        c.stroke();
      }
      if (o.kind === 'cave') {
        for (let n = 0; n < 13; n++) {
          const px = Math.sin(n * 2.4) * (w / 2 - 0.45),
            py = -0.5 + Math.cos(n * 2.4) * (h / 2 - 0.65);
          c.fillStyle = n % 2 ? '#7b8072' : '#646f65';
          c.beginPath();
          c.moveTo(px - 0.65, py + 0.25);
          c.lineTo(px - 0.45, py - 0.5);
          c.lineTo(px + 0.15, py - 0.7);
          c.lineTo(px + 0.6, py - 0.2);
          c.lineTo(px + 0.5, py + 0.4);
          c.closePath();
          c.fill();
          c.strokeStyle = '#abb09a55';
          c.lineWidth = 0.035;
          c.stroke();
        }
      }
      c.restore();
    }
    label(c, inside ? `${o.name} · interior` : o.name, x, y - h / 2 - 0.75);
    if (o.kind === 'insulating-shelter')
      label(
        c,
        o.data.maintenance
          ? `Maintenance · ${String(Number(o.data.progress))} / 2`
          : Number(o.data.remainingService) > 0
            ? `${String(Number(o.data.remainingService))} service rounds`
            : 'Expired covering · frame remains',
        x,
        y - h / 2 - 1.1,
      );
    return;
  }
  ellipse(c, 0.13, 0.12, 0.58, 0.22, '#1b302b40');
  if (packageVisual(c, o)) {
    c.restore();
    return;
  }
  if (o.kind === 'tree') {
    c.fillStyle = '#6a533c';
    c.fillRect(-0.08, -0.8, 0.16, 0.95);
    // Feet retain exact physical anchors. Canopies soften when covering the selected actor.
    c.globalAlpha =
      selected &&
      Math.hypot(selected.position.x - x, selected.position.y - (y - 0.5)) < 0.9
        ? 0.35
        : 1;
    for (let n = 0; n < 7; n++)
      ellipse(
        c,
        Math.cos(n * 2.4) * 0.38,
        -0.8 + Math.sin(n * 2.4) * 0.28,
        0.48,
        0.41,
        n % 2 ? '#536f49' : '#375b43',
      );
    ellipse(c, -0.2, -1.05, 0.42, 0.16, '#9dac684d');
  } else if (o.kind === 'animal') {
    const species = o.data.species;
    c.rotate(o.spatial.angle);
    ellipse(c, 0, 0, 0.42, species === 'boar' ? 0.26 : 0.19, o.visual.color);
    circle(c, 0.34, -0.04, 0.15, o.visual.color);
    c.strokeStyle = o.visual.color;
    c.lineWidth = 0.075;
    for (const yy of [-0.2, 0.2]) {
      c.beginPath();
      c.moveTo(-0.23, yy);
      c.lineTo(-0.32, yy * 1.6);
      c.moveTo(0.18, yy);
      c.lineTo(0.24, yy * 1.6);
      c.stroke();
    }
    circle(c, 0.43, -0.09, 0.025, '#182b25');
    if (species === 'deer') {
      c.strokeStyle = '#d4c5a0';
      c.lineWidth = 0.04;
      c.beginPath();
      c.moveTo(0.32, -0.13);
      c.lineTo(0.3, -0.4);
      c.lineTo(0.17, -0.47);
      c.moveTo(0.3, -0.3);
      c.lineTo(0.43, -0.43);
      c.stroke();
    }
  } else if (o.kind === 'rock') {
    c.fillStyle = o.visual.color;
    c.beginPath();
    c.moveTo(-0.4, 0.1);
    c.lineTo(-0.32, -0.3);
    c.lineTo(0.05, -0.48);
    c.lineTo(0.39, -0.22);
    c.lineTo(0.43, 0.19);
    c.lineTo(-0.1, 0.28);
    c.closePath();
    c.fill();
    c.strokeStyle = '#c7c9b3';
    c.lineWidth = 0.04;
    c.stroke();
  } else {
    const stock = Number(o.data.stock ?? 1);
    for (let n = 0; n < 5; n++)
      ellipse(
        c,
        Math.cos(n * 2.4) * 0.2,
        Math.sin(n * 2.4) * 0.12,
        0.17,
        0.11,
        stock ? '#63804f' : '#6e7356',
      );
    for (let n = 0; n < Math.min(7, stock); n++)
      circle(
        c,
        Math.cos(n * 2.4) * 0.24,
        Math.sin(n * 2.4) * 0.16 - 0.1,
        0.06,
        o.visual.accent,
      );
    if (o.createdBy) {
      c.strokeStyle = o.visual.accent;
      c.lineWidth = 0.06;
      c.strokeRect(-0.4, -0.3, 0.8, 0.6);
    }
  }
  c.restore();
}
function actor(
  c: CanvasRenderingContext2D,
  a: V7Actor,
  selected: string,
  phase: number,
  active: string | null,
): void {
  c.save();
  c.translate(a.position.x, a.position.y);
  const dead = a.vitals.health <= 0,
    color =
      a.id === 'lin' ? '#c5aa73' : a.id === 'moss' ? '#83a99e' : '#b89087';
  ellipse(c, 0.02, 0.15, 0.28, 0.12, '#142b294d');
  if (a.id === selected) {
    c.strokeStyle = '#f5dba1';
    c.lineWidth = 0.045;
    c.beginPath();
    c.ellipse(0, 0.12, 0.36, 0.19, 0, 0, Math.PI * 2);
    c.stroke();
  }
  if (dead) c.rotate(-Math.PI / 2);
  const exercising = !dead && !!a.extensionState['warming:pending'];
  const gait =
    active === 'navigate' || exercising
      ? Math.sin(phase * Math.PI * 4) * 0.09
      : 0;
  c.strokeStyle = '#283d38';
  c.lineWidth = 0.1;
  c.beginPath();
  c.moveTo(-0.08, -0.02);
  c.lineTo(-0.1, 0.17 + gait);
  c.moveTo(0.08, -0.02);
  c.lineTo(0.1, 0.17 - gait);
  c.stroke();
  ellipse(c, 0, -0.19, 0.18, 0.23, color);
  circle(c, 0, -0.48, 0.13, '#ddc2a0');
  ellipse(c, -0.015, -0.55, 0.135, 0.07, '#584b3b');
  c.strokeStyle = color;
  c.lineWidth = 0.08;
  c.beginPath();
  c.moveTo(-0.15, -0.3);
  c.lineTo(
    -0.24,
    exercising ? -0.3 - Math.sin(phase * Math.PI * 4) * 0.12 : -0.1,
  );
  c.moveTo(0.15, -0.3);
  c.lineTo(
    0.25,
    (active && active !== 'rest' && active !== 'active-warming') || exercising
      ? -0.3 - Math.sin(phase * Math.PI) * 0.12
      : -0.1,
  );
  c.stroke();
  c.restore();
  label(c, a.name, a.position.x, a.position.y - 0.86);
  if (active && active !== 'wait')
    label(
      c,
      active.replaceAll('_', ' '),
      a.position.x,
      a.position.y + 0.65,
      '#dfd8ad',
    );
}

/** A read-only projection; animation phase and device pixels never touch simulation state. */
function routeOverlay(
  c: CanvasRenderingContext2D,
  frame: SceneFrame,
  selected: string,
): void {
  const self = frame.actors.find((a) => a.id === selected);
  const event = frame.events.find(
    (e) =>
      e.actor === selected &&
      (e.type === 'route-inspection-completed' ||
        (e.type === 'failed' &&
          e.interface === 'navigate' &&
          e.data.reasonCode)),
  );
  if (!self || !event) return;
  const evidence = event.data;
  const point = (raw: unknown): V7Point | null => {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      !('x' in raw) ||
      !('y' in raw) ||
      typeof raw.x !== 'number' ||
      typeof raw.y !== 'number'
    )
      return null;
    return { x: raw.x, y: raw.y };
  };
  const start = point(evidence.start),
    goal = point(evidence.goal);
  if (!start || !goal) return;
  const path = Array.isArray(evidence.path)
    ? evidence.path.flatMap((raw) => {
        const p = point(raw);
        return p ? [p] : [];
      })
    : [];
  let from = start;
  const currentWorld = frame.continuous;
  const stillClear =
    !!currentWorld &&
    path.every((to) => {
      const clear = v7SegmentClear(from, to, self.radius, [
        ...v7Obstacles(currentWorld),
        ...frame.actors
          .filter((a) => a.id !== self.id)
          .map((a) => ({
            ...a.position,
            angle: 0,
            shape: { kind: 'circle' as const, radius: a.radius },
            solid: true,
            interaction: 0,
            entrances: [],
          })),
      ]);
      from = to;
      return clear;
    });
  const status =
    typeof evidence.status === 'string' ? evidence.status : 'unknown';
  const color =
    status === 'blocked'
      ? '#e5a18c'
      : status === 'reachable' && path.length && stillClear
        ? '#a3e4c6'
        : '#e1c88a';
  c.save();
  c.strokeStyle = color;
  c.lineWidth = 0.045;
  const wallIds = Array.isArray(evidence.walls)
    ? evidence.walls.flatMap((raw) =>
        raw &&
        typeof raw === 'object' &&
        !Array.isArray(raw) &&
        typeof raw.id === 'string'
          ? [raw.id]
          : [],
      )
    : [];
  for (const object of frame.objects)
    for (const [i, wall] of v7Walls(object.spatial).entries()) {
      if (
        !wallIds.includes(`${object.id}/wall:${String(i)}`) ||
        wall.shape.kind !== 'rectangle'
      )
        continue;
      c.save();
      c.translate(wall.x, wall.y);
      c.rotate(wall.angle);
      c.strokeRect(
        -wall.shape.width / 2,
        -wall.shape.height / 2,
        wall.shape.width,
        wall.shape.height,
      );
      c.restore();
    }
  c.beginPath();
  c.moveTo(start.x, start.y);
  if (path.length && stillClear) for (const p of path) c.lineTo(p.x, p.y);
  else {
    c.setLineDash([0.12, 0.1]);
    c.lineTo(goal.x, goal.y);
  }
  c.stroke();
  c.setLineDash([]);
  circle(c, goal.x, goal.y, 0.09, color);
  const blockers = Array.isArray(evidence.observedBlockers)
    ? evidence.observedBlockers
    : [];
  for (const a of frame.actors.filter(
    (a) =>
      blockers.includes(a.id) &&
      (!frame.continuous ||
        v7Visible(frame.continuous, self.position, a.position)),
  )) {
    c.beginPath();
    c.arc(a.position.x, a.position.y, a.radius + 0.08, 0, Math.PI * 2);
    c.stroke();
  }
  const code =
    typeof evidence.reasonCode === 'string' ? evidence.reasonCode : 'unknown';
  label(
    c,
    `Route: ${status} · ${code}`,
    self.position.x,
    self.position.y - 2.1,
    color,
  );
  if (path.length && !stillClear)
    label(
      c,
      'Geometry changed after inspection',
      self.position.x,
      self.position.y - 2.5,
      '#e1c88a',
    );
  c.restore();
}
export function drawForestCanvas(
  canvas: HTMLCanvasElement,
  frame: SceneFrame,
  selected: string,
  camera: ForestCamera,
  geometry = false,
  phase = 1,
  previous?: SceneFrame,
): void {
  const c = canvas.getContext('2d');
  if (!c) return;
  const rect = canvas.getBoundingClientRect(),
    dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, rect.width),
    height = Math.max(1, rect.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  c.scale(dpr, dpr);
  c.fillStyle = '#263d34';
  c.fillRect(0, 0, width, height);
  const scale = Math.min(width, height) / camera.size;
  c.translate(
    (width - camera.size * scale) / 2,
    (height - camera.size * scale) / 2,
  );
  c.scale(scale, scale);
  c.translate(-camera.x, -camera.y);
  const visible = frame.visible ? new Set(frame.visible) : null;
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++) {
      const cell = frame.terrain[y * frame.width + x] ?? '.';
      c.fillStyle =
        visible && !visible.has(`${String(x)},${String(y)}`)
          ? '#293d35'
          : (terrainColors[cell] ?? '#77835c');
      c.fillRect(x, y, 1.02, 1.02);
      if (visible && !visible.has(`${String(x)},${String(y)}`)) continue;
      for (let n = 0; n < 3; n++) {
        const px = x + 0.5 + 0.42 * Math.sin(x * 17 + y * 31 + n * 13),
          py = y + 0.5 + 0.42 * Math.cos(x * 7 + y * 11 + n * 19);
        ellipse(
          c,
          px,
          py,
          cell === '~' ? 0.16 : 0.05,
          cell === '~' ? 0.018 : 0.026,
          cell === '~' ? '#a5c7bf33' : '#d5cf9740',
        );
      }
    }
  const self = frame.actors.find((a) => a.id === selected);
  const beneathClosedRoof = (point: { x: number; y: number }): boolean =>
    frame.objects.some(
      (o) =>
        o.spatial.enclosure &&
        v7Interior(point, o.spatial) &&
        (!self || !v7Interior(self.position, o.spatial)),
    );
  for (const o of frame.objects.filter((o) => o.spatial.enclosure))
    object(c, o, self);
  const entities = [
    ...frame.objects
      .filter((o) => !o.spatial.enclosure && !beneathClosedRoof(o.spatial))
      .map((o) => ({ y: o.spatial.y, object: o })),
    ...frame.actors
      .filter((a) => !beneathClosedRoof(a.position))
      .map((a) => ({ y: a.position.y, actor: a })),
  ].sort((a, b) => a.y - b.y);
  for (const e of entities) {
    if ('object' in e) object(c, e.object, self);
    else {
      let a = e.actor;
      const old = previous?.actors.find((p) => p.id === a.id);
      if (
        old &&
        previous?.tick === frame.tick - 1 &&
        phase < 1 &&
        !frame.events.some(
          (ev) => ev.actor === a.id && ['died', 'respawned'].includes(ev.type),
        )
      )
        a = {
          ...a,
          position: {
            x: old.position.x + (a.position.x - old.position.x) * phase,
            y: old.position.y + (a.position.y - old.position.y) * phase,
          },
        };
      actor(
        c,
        a,
        selected,
        phase,
        frame.events.find((ev) => ev.actor === a.id && ev.interface)
          ?.interface ?? null,
      );
    }
  }
  for (const a of frame.actors.filter((a) => !beneathClosedRoof(a.position))) {
    const warming = a.extensionState['warming:pending'];
    const warmingEvent = frame.events.find(
      (e) => e.actor === a.id && e.type === 'warming-round-completed',
    );
    if (warming && typeof warming === 'object' && !Array.isArray(warming))
      label(
        c,
        `Exercising · ${String(Number(warming.remainingRounds))} rounds left`,
        a.position.x,
        a.position.y - 1.65,
        '#efc690',
      );
    if (warmingEvent) {
      const m = warmingEvent.data;
      const signed = (value: unknown) =>
        `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}`;
      label(
        c,
        `Energy −${String(Number(m.energySpent))} · Env ${signed(m.environmentalChange)} · Heat ${signed(m.exertionHeat)} · Net ${signed(m.netChange)}`,
        a.position.x,
        a.position.y - 2.15,
        '#efc690',
      );
    }
    const assessment = a.extensionState['food-assessment:pending'];
    const completed = frame.events.find(
      (e) => e.actor === a.id && e.type === 'food-assessment-completed',
    );
    if (
      assessment &&
      typeof assessment === 'object' &&
      !Array.isArray(assessment)
    ) {
      const elapsed = Number(assessment.elapsed);
      const phaseName =
        elapsed <= 2
          ? 'Examining'
          : elapsed === 3
            ? 'Sample consumed'
            : 'Monitoring';
      label(
        c,
        `${phaseName} · ${String(elapsed)} / ${assessment.mode === 'sample' ? '5' : '2'}`,
        a.position.x,
        a.position.y - 1.65,
        '#c5e5d8',
      );
      if (assessment.mode === 'sample') {
        circle(
          c,
          a.position.x + 0.42,
          a.position.y - 0.25,
          0.08,
          elapsed < 3 ? '#c8ad77' : '#c5e5d8',
        );
        label(
          c,
          `${String(Number(assessment.fraction))} ${elapsed < 3 ? 'reserved' : 'consumed'}`,
          a.position.x,
          a.position.y - 2.1,
          '#c5e5d8',
        );
      }
    } else if (completed)
      label(
        c,
        'Evidence recorded · uncertainty remains',
        a.position.x,
        a.position.y - 1.65,
        '#c5e5d8',
      );
    const pending = a.extensionState['wildlife:pending'];
    const complete = frame.events.find(
      (e) =>
        e.actor === a.id &&
        e.type === 'wildlife-observation-completed' &&
        e.success,
    );
    const target =
      pending && typeof pending === 'object' && !Array.isArray(pending)
        ? pending.target
        : complete?.target;
    const animal = frame.objects.find(
      (o) => o.id === target && o.kind === 'animal',
    );
    if (
      !animal ||
      !frame.continuous ||
      v7Distance(a.position, animal.spatial) > frame.continuous.config.vision ||
      !v7Visible(frame.continuous, a.position, animal.spatial)
    )
      continue;
    c.strokeStyle = '#f2dba1';
    c.lineWidth = 0.05;
    c.beginPath();
    c.arc(animal.spatial.x, animal.spatial.y, 0.65, 0, Math.PI * 2);
    c.stroke();
    label(
      c,
      complete ? 'Observed · 2 / 2' : 'Watching · 1 / 2',
      animal.spatial.x,
      animal.spatial.y - 1.65,
    );
  }
  for (const s of frame.stacks.filter((s) => !beneathClosedRoof(s))) {
    ellipse(c, s.x, s.y, 0.16, 0.1, s.color);
    label(c, s.label, s.x, s.y + 0.4);
  }
  routeOverlay(c, frame, selected);
  for (const e of frame.events) {
    if (!e.position || beneathClosedRoof(e.position)) continue;
    if (
      e.type === 'injured' &&
      frame.events.some((d) => d.type === 'died' && d.actor === e.actor)
    )
      continue;
    const color =
      e.type === 'died'
        ? '#e4d9c7'
        : e.type === 'respawned'
          ? '#d9ebae'
          : e.type === 'injured'
            ? '#ef9c80'
            : e.type === 'ripened'
              ? '#bcdd8f'
              : e.type === 'gathered'
                ? '#e4c98c'
                : e.type === 'satisfaction'
                  ? '#edce83'
                  : null;
    if (color) {
      c.strokeStyle = color;
      c.lineWidth = 0.07;
      c.beginPath();
      c.arc(e.position.x, e.position.y, 0.45 + phase * 0.3, 0, Math.PI * 2);
      c.stroke();
      label(c, e.type, e.position.x, e.position.y - 1.2, color);
    }
  }
  if (geometry) {
    c.strokeStyle = '#ffe3a5';
    c.lineWidth = 0.035;
    for (const o of frame.objects)
      for (const wall of v7Walls(o.spatial)) {
        c.save();
        c.translate(wall.x, wall.y);
        c.rotate(wall.angle);
        if (wall.shape.kind === 'rectangle')
          c.strokeRect(
            -wall.shape.width / 2,
            -wall.shape.height / 2,
            wall.shape.width,
            wall.shape.height,
          );
        else {
          c.beginPath();
          c.arc(0, 0, wall.shape.radius, 0, Math.PI * 2);
          c.stroke();
        }
        c.restore();
      }
  }
  if (frame.continuous?.config.forest) {
    const climate = forestClimate(
      frame.continuous,
      self?.position ?? { x: 5, y: 5 },
    );
    c.fillStyle = `rgba(19,30,56,${String((1 - climate.daylight) * 0.12)})`;
    c.fillRect(0, 0, frame.width, frame.height);
  }
}
