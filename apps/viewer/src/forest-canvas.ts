import { drawToolAssessment } from './collective-tool-assessment-view.js';
import { drawTrayClearance } from './collective-tray-clearance-view.js';
import { drawSmallDrying } from './collective-small-drying-view.js';
import { drawSurfaceDiagnostics } from './collective-surface-diagnostics-view.js';
import { drawRootSurface } from './collective-root-surface-view.js';
import { drawMaterialCombine } from './collective-material-view.js';
import { drawFoodInspection } from './collective-food-inspection-view.js';
import { drawCollectiveBark } from './collective-bark-view.js';
import { drawExtraction } from './open-extraction-view.js';
import {
  drawWaterObject,
  drawWaterItem,
  drawWaterAccess,
  drawCarriedWater,
} from './open-water-visual.js';
import { drawShortRefuge, drawShortProposal } from './open-short-visual.js';
import { drawMetrology } from './open-metrology-visual.js';
import { drawOpenRefuge } from './open-shelter-visual.js';
import { drawAssayApparatus } from './open-assay-visual.js';
import { drawWillowWork, drawWillowItem } from './forest-willow-visual.js';
import {
  forestClimate,
  openConditions,
  v7Interior,
  v7Walls,
  v7Visible,
  v7Distance,
  v7SegmentClear,
  v7Obstacles,
  collectiveGroups,
} from '@self-evolving-world/world-core';
import type {
  V7Actor,
  V7Object,
  V7Point,
  V7Stack,
} from '@self-evolving-world/world-core';
import type { SceneFrame } from './continuous-scene.js';
import { CONTINUOUS_VISUALS } from './continuous-visuals.js';
import { COLLECTIVE_COLORS } from './collective-view.js';

/** Body colors of the long-run people; the culture scenario's three newcomers get their own. */
const PERSON_COLORS: Record<string, string> = {
  lin: '#c5aa73',
  moss: '#83a99e',
  kai: '#9fa3c9',
  wren: '#c99a6b',
  ivo: '#8fb98a',
};
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
  time: number,
  day: number,
  quietWater = false,
): void {
  const { x, y } = o.spatial;
  if (drawWaterObject(c, o, quietWater)) return;
  if (drawMetrology(c, o)) {
    label(
      c,
      `${Number(o.data.span) > 0 ? 'Load trial' : o.data.measured === true ? 'Measured specimen' : 'Measurement pending'} · ${String(Number(o.data.stage))} / 2`,
      x,
      y + 0.5,
    );
    return;
  }
  if (drawShortRefuge(c, o, time, day) || drawOpenRefuge(c, o, time, day)) {
    if (o.kind === 'open-refuge')
      label(
        c,
        `${o.data.proven === true ? 'Proven shade' : o.visual.state === 'failed' ? 'Failed proof' : 'Partial frame'} · ${String(Number(o.data.stage))} / 10 · condition ${Number(o.data.condition).toFixed(2)}`,
        x,
        y - 1.6,
      );
    return;
  }
  if (drawAssayApparatus(c, o)) {
    label(
      c,
      o.kind === 'comparison-balance'
        ? o.data.calibrated === true
          ? 'Calibrated balance'
          : 'Uncalibrated balance'
        : o.kind === 'drying-tray'
          ? 'Actual drying tray'
          : `Assembly · ${String(Number(o.data.progress))}`,
      x,
      o.kind === 'drying-tray' ? y + 1.4 : y - 1.8,
    );
    return;
  }
  c.save();
  c.translate(x, y);
  if (o.visual.state === 'partially-stripped') {
    c.strokeStyle = '#e4d0a3';
    c.lineWidth = 0.08;
    c.beginPath();
    c.moveTo(x - 0.18, y - 0.12);
    c.lineTo(x + 0.18, y + 0.12);
    c.stroke();
  }
  if (o.data.stage === 'seedling') c.scale(0.5, 0.5);
  if (o.kind === 'animal' && o.data.mode === 'dead') c.globalAlpha = 0.45;
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
  if (o.kind === 'canopy-post') ellipse(c, 0.03, 0.03, 0.12, 0.06, '#1b302b40');
  else if (o.visual.component === 'sign')
    ellipse(c, 0.02, 0.16, 0.12, 0.05, '#1b302b40');
  // A mark applied flat to the ground, or a groove in it, casts no shadow.
  else if (
    ![
      'rain-canopy',
      'rain-canopy-work',
      'applied-mark',
      'groove-drawing',
    ].includes(o.kind)
  )
    ellipse(c, 0.13, 0.12, 0.58, 0.22, '#1b302b40');
  if (packageVisual(c, o)) {
    c.restore();
    if (['root-work', 'root-drying-tray'].includes(o.kind)) {
      const f = o.data.food;
      const food = f && typeof f === 'object' && !Array.isArray(f) ? f : null;
      label(
        c,
        o.data.activeWork
          ? `Work left ${String(Number(o.data.remainingWork))} · paid ${String(Number(o.data.paidEnergy ?? 0))} energy`
          : food
            ? `Water ${(Number(food.waterFraction) * 100).toFixed(1)}% · decay ×${Number(food.decayMultiplier).toFixed(2)}`
            : 'Empty reusable tray',
        x,
        y - 1.35,
      );
      if (food)
        label(
          c,
          `${typeof food.status === 'string' ? food.status : 'Actual exposure'} · ${Number(food.remainingWaterRemoval).toFixed(3)} water work left`,
          x,
          y - 1.75,
        );
    }
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
  if (o.data.stage === 'seedling') label(c, 'Seedling', x, y - 0.55);
  if (
    o.kind === 'animal' &&
    typeof o.data.health === 'number' &&
    o.data.health < 90
  )
    label(
      c,
      `${typeof o.data.mode === 'string' ? o.data.mode : 'unknown'} · ${o.data.health.toFixed(0)} health`,
      x,
      y - 0.55,
    );
  if (o.data.resource === 'willow' && o.kind === 'tree')
    label(c, `Willow · stock ${String(Number(o.data.stock))}`, x, y - 1.75);
}
function actor(
  c: CanvasRenderingContext2D,
  a: V7Actor,
  selected: string,
  phase: number,
  active: string | null,
  mantle?: V7Stack['mantle'],
  paidFood = false,
): void {
  c.save();
  c.translate(a.position.x, a.position.y);
  const dead = a.vitals.health <= 0,
    color =
      (a.collective ? COLLECTIVE_COLORS[a.collective.group] : undefined) ??
      PERSON_COLORS[a.id] ??
      '#b89087';
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
  const status = a.extensionState['recuperation:lastStatus'];
  const recoveryCancelled =
    active === 'recuperate' &&
    !a.extensionState['recuperation:pending'] &&
    !!status &&
    typeof status === 'object' &&
    !Array.isArray(status) &&
    status.status === 'cancelled';
  const recuperating = !dead && active === 'recuperate' && !recoveryCancelled;
  if (recuperating) {
    c.translate(0, 0.13);
    c.scale(1, 0.75);
  }
  const gait =
    active === 'navigate' || exercising
      ? Math.sin(phase * Math.PI * 4) * 0.09
      : 0;
  c.strokeStyle = '#283d38';
  c.lineWidth = 0.1;
  c.beginPath();
  c.moveTo(-0.08, -0.02);
  c.lineTo(recuperating ? -0.22 : -0.1, recuperating ? 0.08 : 0.17 + gait);
  c.moveTo(0.08, -0.02);
  c.lineTo(recuperating ? 0.22 : 0.1, recuperating ? 0.08 : 0.17 - gait);
  c.stroke();
  ellipse(c, 0, -0.19, 0.18, 0.23, color);
  if (mantle) drawMantle(c, mantle);
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
    (active &&
      active !== 'rest' &&
      active !== 'active-warming' &&
      active !== 'recuperate') ||
      exercising
      ? -0.3 - Math.sin(phase * Math.PI) * 0.12
      : -0.1,
  );
  c.stroke();
  drawWillowWork(c, a, active, phase);
  if (paidFood) {
    ellipse(c, 0, 0.12, 0.18, 0.07, '#ba9764');
    circle(
      c,
      0.05,
      -0.04 + Math.sin(phase * Math.PI * 4) * 0.04,
      0.055,
      '#ddc2a0',
    );
  }
  c.restore();
  label(c, a.name, a.position.x, a.position.y - 0.86);
  if (active && active !== 'wait')
    label(
      c,
      recoveryCancelled
        ? 'recuperation cancelled'
        : active === 'short-material-refuge'
          ? 'Canopy work'
          : active === 'access-water'
            ? 'Water work'
            : active === 'noningestive-extractability'
              ? 'Extraction'
              : active === 'short-refuge-trial-diagnostics'
                ? 'Read trial'
                : active.replaceAll('_', ' '),
      a.position.x,
      a.position.y +
        ([
          'short-material-refuge',
          'access-water',
          'short-refuge-trial-diagnostics',
          'noningestive-extractability',
        ].includes(active)
          ? 1.65
          : active === 'shelter-material-metrology'
            ? 1.65
            : 0.65),
      '#dfd8ad',
    );
  if (recuperating) {
    const pending = a.extensionState['recuperation:pending'];
    const last = a.extensionState['recuperation:lastRound'];
    if (pending && typeof pending === 'object' && !Array.isArray(pending))
      label(
        c,
        `${String(Number(pending.remaining))} rounds left · +${Number(pending.healed).toFixed(2)} health`,
        a.position.x,
        a.position.y + 1.03,
        '#c3d3bb',
      );
    else if (
      last &&
      typeof last === 'object' &&
      !Array.isArray(last) &&
      Number(last.healing) > 0
    )
      label(
        c,
        `Recovered +${Number(last.cumulativeHealing).toFixed(2)} health`,
        a.position.x,
        a.position.y + 1.03,
        '#c3d3bb',
      );
  }
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
interface TerrainLayer {
  frame: SceneFrame;
  key: string;
  canvas: HTMLCanvasElement;
}
const terrainLayers = new WeakMap<HTMLCanvasElement, TerrainLayer>();
function terrainLayer(
  owner: HTMLCanvasElement,
  frame: SceneFrame,
  camera: ForestCamera,
  width: number,
  height: number,
  dpr: number,
): HTMLCanvasElement {
  const key = [camera.x, camera.y, camera.size, width, height, dpr].join(',');
  const prior = terrainLayers.get(owner);
  if (prior?.frame === frame && prior.key === key) return prior.canvas;
  const canvas = prior?.canvas ?? document.createElement('canvas');
  if (canvas.width !== owner.width) canvas.width = owner.width;
  if (canvas.height !== owner.height) canvas.height = owner.height;
  const c = canvas.getContext('2d');
  if (!c) return canvas;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  const left = Math.max(
    0,
    Math.floor(camera.x - (width / scale - camera.size) / 2 - 1),
  );
  const top = Math.max(
    0,
    Math.floor(camera.y - (height / scale - camera.size) / 2 - 1),
  );
  const right = Math.min(
    frame.width,
    Math.ceil(camera.x + camera.size + (width / scale - camera.size) / 2 + 1),
  );
  const bottom = Math.min(
    frame.height,
    Math.ceil(camera.y + camera.size + (height / scale - camera.size) / 2 + 1),
  );
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      const cell = frame.terrain[y * frame.width + x] ?? '.';
      c.fillStyle =
        visible && !visible.has(`${String(x)},${String(y)}`)
          ? '#293d35'
          : (terrainColors[cell] ?? '#77835c');
      c.fillRect(x, y, 1.02, 1.02);
      if (visible && !visible.has(`${String(x)},${String(y)}`)) continue;
      if (frame.continuous?.config.development) {
        const local = openConditions(frame.continuous, {
          x: x + 0.5,
          y: y + 0.5,
        });
        if (local.drought > 0.05 || local.waterlogging > 0.05) {
          c.fillStyle =
            local.drought > local.waterlogging
              ? `rgba(188,139,65,${String(local.drought * 0.55)})`
              : `rgba(75,151,183,${String(local.waterlogging * 0.6)})`;
          c.fillRect(x, y, 1, 1);
        }
      }
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
  terrainLayers.set(owner, { frame, key, canvas });
  return canvas;
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
  if (canvas.width !== Math.round(width * dpr))
    canvas.width = Math.round(width * dpr);
  if (canvas.height !== Math.round(height * dpr))
    canvas.height = Math.round(height * dpr);
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(terrainLayer(canvas, frame, camera, width, height, dpr), 0, 0);
  c.scale(dpr, dpr);
  const scale = Math.min(width, height) / camera.size;
  c.translate(
    (width - camera.size * scale) / 2,
    (height - camera.size * scale) / 2,
  );
  c.scale(scale, scale);
  c.translate(-camera.x, -camera.y);
  const self = frame.actors.find((a) => a.id === selected);
  const beneathClosedRoof = (point: { x: number; y: number }): boolean =>
    frame.objects.some(
      (o) =>
        o.spatial.enclosure &&
        v7Interior(point, o.spatial) &&
        (!self || !v7Interior(self.position, o.spatial)),
    );
  if (frame.continuous?.config.collective) {
    for (const group of collectiveGroups(frame.continuous)) {
      if (frame.visible !== null && self?.collective?.group !== group.id)
        continue;
      const tint = COLLECTIVE_COLORS[group.id] ?? '#d8d5bf';
      c.save();
      c.strokeStyle = tint;
      c.lineWidth = 0.035;
      c.setLineDash([0.18, 0.16]);
      c.beginPath();
      c.arc(group.meeting.x, group.meeting.y, 3, 0, Math.PI * 2);
      c.stroke();
      c.restore();
      label(
        c,
        `${group.name} meeting place`,
        group.meeting.x,
        group.meeting.y - 3.25,
        tint,
      );
    }
  }
  for (const o of frame.objects.filter((o) => o.spatial.enclosure))
    object(
      c,
      o,
      self,
      frame.continuous?.time ?? frame.tick,
      frame.continuous?.config.forest?.day ?? 80,
      frame.continuous?.processes.some(
        (p) => p.handler === 'open.extraction',
      ) ?? false,
    );
  const entities = [
    ...frame.objects
      .filter((o) => !o.spatial.enclosure && !beneathClosedRoof(o.spatial))
      .map((o) => ({ y: o.spatial.y, object: o })),
    ...frame.actors
      .filter((a) => !beneathClosedRoof(a.position))
      .map((a) => ({ y: a.position.y, actor: a })),
  ].sort((a, b) => a.y - b.y);
  for (const e of entities) {
    if ('object' in e)
      object(
        c,
        e.object,
        self,
        frame.continuous?.time ?? frame.tick,
        frame.continuous?.config.forest?.day ?? 80,
        frame.continuous?.processes.some(
          (p) => p.handler === 'open.extraction',
        ) ?? false,
      );
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
        frame.continuous?.stacks.find(
          (s) => s.owner === a.id && s.mantle?.equipped,
        )?.mantle,
        frame.events.some(
          (ev) =>
            ev.actor === a.id &&
            ['prepare-food', 'root-preparation', 'root-air-drying'].includes(
              ev.interface ?? '',
            ) &&
            ev.type === 'process-progress' &&
            ev.success,
        ),
      );
      const crushed =
        frame.continuous?.stacks
          .filter((s) => s.owner === a.id && s.resource === 'crushed-root')
          .reduce((n, s) => n + s.quantity, 0) ?? 0;
      if (crushed > 0 && (frame.visible === null || selected === a.id)) {
        ellipse(
          c,
          a.position.x + 0.35,
          a.position.y + 0.15,
          0.15,
          0.09,
          '#c0a77e',
        );
        label(
          c,
          `${String(crushed)} crushed root units`,
          a.position.x,
          a.position.y + 1.4,
        );
      }
      const portions =
        frame.continuous?.stacks
          .filter((s) => s.owner === a.id && s.resource === 'hand-mashed-food')
          .reduce((n, s) => n + s.quantity, 0) ?? 0;
      if (portions > 0 && (frame.visible === null || selected === a.id)) {
        ellipse(
          c,
          a.position.x + 0.35,
          a.position.y + 0.15,
          0.15,
          0.09,
          '#ba9764',
        );
        label(
          c,
          `${String(portions)} prepared portions`,
          a.position.x,
          a.position.y + 1.4,
        );
      }
      const paid = frame.events.find(
        (ev) =>
          ev.actor === a.id &&
          ['prepare-food', 'root-preparation', 'root-air-drying'].includes(
            ev.interface ?? '',
          ) &&
          ev.type === 'process-progress' &&
          ev.success,
      );
      if (paid)
        label(
          c,
          `${String(Number(paid.data.completedWork))} / ${String(Number(paid.data.initialWork))} paid work`,
          a.position.x,
          a.position.y + 1.02,
        );
      if (frame.visible === null || selected === a.id)
        drawCarriedWater(
          c,
          frame.continuous?.stacks.filter(
            (s) => s.owner === a.id && s.waterCup,
          ) ?? [],
          a,
        );
    }
  }
  for (const event of frame.events.filter(
    (e) => e.type === 'short-refuge-assessed',
  ))
    drawShortProposal(c, event.data);
  for (const event of frame.events)
    drawWaterAccess(
      c,
      event,
      frame.actors.find((a) => a.id === event.actor),
    );
  for (const process of frame.continuous?.processes ?? []) {
    const station = frame.objects.find((o) => o.id === process.object);
    if (station && process.handler === 'open.process')
      label(
        c,
        `Process · ${String(Number(process.data.progress ?? 0))} work · ${typeof process.data.status === 'string' ? process.data.status : 'pending'}`,
        station.spatial.x,
        station.spatial.y - 1.25,
      );
  }
  for (const a of frame.actors.filter((a) => !beneathClosedRoof(a.position))) {
    const examination = a.extensionState['open:food-examination'];
    const examined = frame.events.find(
      (e) => e.actor === a.id && e.type === 'food-examination-completed',
    );
    if (
      (examination &&
        typeof examination === 'object' &&
        !Array.isArray(examination)) ||
      examined
    ) {
      const sampleId =
        examination &&
        typeof examination === 'object' &&
        !Array.isArray(examination)
          ? examination.sample
          : examined?.target;
      const sample = frame.continuous?.stacks.find((s) => s.id === sampleId);
      if (sample) {
        const sx = a.position.x + 0.6,
          sy = a.position.y + 0.2;
        ellipse(c, sx - 0.07, sy, 0.1, 0.14, '#d8bb9a');
        ellipse(c, sx + 0.12, sy, 0.1, 0.14, '#d8bb9a');
        if (
          examination &&
          typeof examination === 'object' &&
          !Array.isArray(examination) &&
          typeof examination.tool === 'string' &&
          frame.continuous?.stacks.some(
            (s) => s.id === examination.tool && s.owner === a.id,
          )
        )
          ellipse(c, sx + 0.3, sy, 0.1, 0.08, '#aaa8a0');
        label(
          c,
          examined ? 'Examined · safety unknown' : 'Opened sample · 1 / 2',
          a.position.x,
          a.position.y - 1.65,
        );
      }
    }
    const scratch = [...frame.events]
      .reverse()
      .find(
        (e) =>
          e.actor === a.id &&
          [
            'hardness-test-progress',
            'hardness-comparison-completed',
            'hardness-assessment-completed',
            'contact-calibration-progress',
            'contact-calibration-completed',
            'contact-calibration-stopped',
            'contact-calibration-invalidated',
          ].includes(e.type),
      );
    if (scratch) {
      const sx = a.position.x + 0.65,
        sy = a.position.y + 0.15;
      const specimens = Array.isArray(scratch.data.specimens)
        ? scratch.data.specimens
        : typeof scratch.data.specimen === 'string'
          ? [scratch.data.specimen]
          : [];
      if (
        specimens.some((id) =>
          frame.continuous?.stacks.some((s) => s.id === id && s.owner === a.id),
        )
      ) {
        ellipse(c, sx - 0.13, sy, 0.1, 0.08, '#858b8e');
        const contact = scratch.type.startsWith('contact-calibration');
        if (scratch.type !== 'hardness-assessment-completed') {
          ellipse(c, sx + 0.13, sy, 0.1, 0.08, '#505b68');
          if (
            !contact ||
            (scratch.type === 'contact-calibration-progress' &&
              Number(scratch.data.stage) <= 4)
          ) {
            c.strokeStyle = '#e1d8b2';
            c.lineWidth = 0.025;
            c.beginPath();
            c.moveTo(sx - 0.16, sy - 0.05);
            c.lineTo(sx + 0.12, sy + 0.04);
            c.stroke();
          }
        }
        label(
          c,
          contact
            ? scratch.type === 'contact-calibration-progress'
              ? Number(scratch.data.stage) <= 4
                ? `Contact sweep · ${String(Number(scratch.data.stage))} / 4`
                : 'Surface inspection · four contacts'
              : scratch.type === 'contact-calibration-invalidated'
                ? 'Surface evidence invalidated'
                : 'Absolute bounds unresolved'
            : scratch.type === 'hardness-test-progress'
              ? `Scratch contact · ${String(Number(scratch.data.stage))} / 2`
              : 'Relative evidence · absolute unresolved',
          a.position.x,
          a.position.y - 1.85,
        );
      }
    }
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
  if (frame.continuous) {
    drawExtraction(c, frame.continuous);
    drawFoodInspection(
      c,
      frame.continuous,
      frame.visible === null ? null : selected,
    );
    drawMaterialCombine(
      c,
      frame.continuous,
      frame.visible === null ? null : selected,
    );
    drawSurfaceDiagnostics(
      c,
      frame.continuous,
      frame.visible === null ? null : selected,
    );
    drawTrayClearance(
      c,
      frame.continuous,
      frame.visible === null ? null : selected,
    );
    drawToolAssessment(
      c,
      frame.continuous,
      frame.visible === null ? null : selected,
    );
    drawSmallDrying(
      c,
      frame.continuous,
      frame.visible === null ? null : selected,
    );
    drawRootSurface(
      c,
      frame.continuous,
      frame.visible === null ? null : selected,
    );
    drawCollectiveBark(
      c,
      frame.continuous,
      frame.visible === null ? null : selected,
    );
  }
  for (const s of frame.stacks
    .filter((s) => !beneathClosedRoof(s))
    .sort(
      (a, b) =>
        Number(
          !!frame.continuous?.stacks.find((s) => s.id === a.id)?.waterCup,
        ) -
        Number(!!frame.continuous?.stacks.find((s) => s.id === b.id)?.waterCup),
    )) {
    const waterItem = frame.continuous?.stacks.find((item) => item.id === s.id);
    if (waterItem?.resource === 'wet-clay-fragments') {
      const group = (frame.continuous?.stacks ?? []).filter(
        (item) =>
          item.owner === null &&
          item.resource === 'wet-clay-fragments' &&
          item.position.x === s.x &&
          item.position.y === s.y,
      );
      if (group[0]?.id === s.id)
        drawWaterItem(
          c,
          waterItem,
          `Retained clay · ${group.reduce((n, item) => n + (item.physical?.unitMass ?? 0) * item.quantity * 1000, 0).toFixed(1)} g · ${String(group.length)} stacks`,
        );
      continue;
    }
    if (waterItem?.processing?.collectiveWorkReleased) {
      const group =
        frame.continuous?.stacks.filter(
          (item) =>
            item.owner === null &&
            item.processing?.collectiveWorkReleased ===
              waterItem.processing?.collectiveWorkReleased &&
            item.position.x === s.x &&
            item.position.y === s.y,
        ) ?? [];
      if (group[0]?.id === s.id) {
        c.fillStyle = '#b99e73';
        c.fillRect(s.x - 0.22, s.y - 0.12, 0.44, 0.24);
        ellipse(c, s.x - 0.08, s.y, 0.12, 0.09, '#8c9790');
        label(
          c,
          group
            .map((item) => `${String(item.quantity)} ${item.resource}`)
            .join(' · '),
          s.x,
          s.y + 1.9,
        );
      }
      continue;
    }
    if (waterItem?.resource === 'extraction-material') {
      ellipse(c, s.x, s.y, 0.035, 0.025, '#c1af88');
      continue;
    }
    if (
      waterItem?.reservedFor &&
      frame.continuous?.objects.some(
        (o) =>
          ['lean-to-work', 'root-work', 'root-drying-tray'].includes(o.kind) &&
          (o.data.activeWork === waterItem.reservedFor ||
            o.id === waterItem.reservedFor),
      )
    ) {
      const group = frame.continuous.stacks.filter(
        (item) => item.reservedFor === waterItem.reservedFor,
      );
      if (group[0]?.id === s.id) {
        if (
          !frame.continuous.objects.some(
            (o) =>
              ['root-work', 'root-drying-tray'].includes(o.kind) &&
              (o.id === waterItem.reservedFor ||
                o.data.activeWork === waterItem.reservedFor),
          )
        )
          ellipse(c, s.x, s.y, 0.24, 0.14, '#ad9d76');
        label(
          c,
          group
            .map((item) => `${String(item.quantity)} ${item.resource}`)
            .join(' · '),
          s.x,
          s.y + 1.85,
        );
      }
      continue;
    }
    const extractionCup = !!waterItem?.reservedFor?.startsWith('extraction:');
    if (
      waterItem &&
      drawWaterItem(c, waterItem, extractionCup ? '' : undefined)
    )
      continue;
    const mantle = frame.continuous?.stacks.find(
      (item) => item.id === s.id,
    )?.mantle;
    if (mantle) {
      c.save();
      c.translate(s.x, s.y + 0.18);
      c.rotate(Math.PI / 2);
      c.scale(0.75, 0.75);
      drawMantle(c, mantle);
      c.restore();
    } else {
      const item = frame.continuous?.stacks.find((item) => item.id === s.id);
      if (item?.resource === 'hand-mashed-food') {
        ellipse(c, s.x, s.y, 0.22, 0.13, '#ba9764');
        for (const dx of [-0.1, 0, 0.1])
          circle(c, s.x + dx, s.y - 0.02, 0.035, '#e0c89f');
      } else if (!item || !drawWillowItem(c, item))
        ellipse(c, s.x, s.y, 0.16, 0.1, s.color);
    }
    const processed = frame.continuous?.stacks.find(
      (item) => item.id === s.id,
    )?.processing;
    if (processed?.shortRole) {
      const group = frame.stacks.filter(
        (other) =>
          Math.abs(other.x - s.x) < 1e-8 &&
          Math.abs(other.y - s.y) < 1e-8 &&
          frame.continuous?.stacks.find((raw) => raw.id === other.id)
            ?.processing?.shortRole,
      );
      if (group[0]?.id === s.id) {
        c.save();
        c.font = '0.14px system-ui';
        c.textAlign = 'left';
        c.fillStyle = '#e8dec3';
        c.fillText(
          `${String(group.length)} retained trial stacks`,
          s.x + 0.55,
          s.y + 0.35,
        );
        c.restore();
      }
    } else
      label(c, s.label, s.x, s.y + (mantle ? 0.95 : processed ? 1.05 : 0.4));
  }
  for (const e of frame.events.filter((e) =>
    ['bark-inspected', 'bark-strip-progress', 'bark-stripped'].includes(e.type),
  )) {
    const target = frame.objects.find((o) => o.id === e.target);
    if (!target || beneathClosedRoof(target.spatial)) continue;
    c.strokeStyle = e.data.status === 'unresolved' ? '#d0d0c4' : '#e1c798';
    c.lineWidth = 0.04;
    c.beginPath();
    c.arc(target.spatial.x, target.spatial.y, 0.45, 0, Math.PI * 2);
    c.stroke();
    label(
      c,
      e.type === 'bark-inspected'
        ? `Layer: ${e.data.status === 'unresolved' ? 'unknown' : 'measured'}`
        : e.type === 'bark-stripped'
          ? 'Actual layer removed'
          : 'Stripping · 1 / 2',
      target.spatial.x,
      target.spatial.y - 1.8,
    );
    const performer = frame.actors.find((a) => a.id === e.actor);
    if (
      performer &&
      typeof e.data.tool === 'string' &&
      frame.continuous?.stacks.some(
        (s) => s.id === e.data.tool && s.owner === performer.id,
      )
    )
      ellipse(
        c,
        performer.position.x + 0.35,
        performer.position.y,
        0.09,
        0.07,
        '#95988d',
      );
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
  c.restore();
}
import { drawMantle } from './forest-insulation-visual.js';
