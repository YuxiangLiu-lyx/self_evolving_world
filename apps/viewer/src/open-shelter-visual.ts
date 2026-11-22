import { refugeRay, refugePoint } from '@self-evolving-world/world-core';
import type { V7Object } from '@self-evolving-world/world-core';
/** Draws the same finite roof rays and physical pole footprints used by simulation. */
export function drawOpenRefuge(
  c: CanvasRenderingContext2D,
  o: V7Object,
  time: number,
  day: number,
): boolean {
  if (o.kind === 'refuge-pole') {
    c.fillStyle = o.visual.color;
    c.beginPath();
    c.arc(
      o.spatial.x,
      o.spatial.y,
      o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0.06,
      0,
      Math.PI * 2,
    );
    c.fill();
    return true;
  }
  if (o.kind !== 'open-refuge') return false;
  const sunAngle = (time * Math.PI * 2) / day,
    dx = Math.cos(sunAngle) * 0.5,
    dy = Math.sin(sunAngle) * 0.5;
  for (let x = -1.5; x < 1.5; x += 0.12)
    for (let y = -1.2; y < 1.2; y += 0.12) {
      const p = refugePoint(o.spatial, x, y),
        coverage = refugeRay(o, p, dx, dy);
      if (coverage > 0) {
        c.fillStyle = `rgba(20,35,30,${String(coverage * 0.3)})`;
        c.fillRect(p.x - 0.06, p.y - 0.06, 0.12, 0.12);
      }
    }
  c.save();
  c.translate(o.spatial.x, o.spatial.y);
  c.rotate(o.spatial.angle);
  const stage = Number(o.data.stage),
    condition = Number(o.data.condition),
    sag = Math.min(0.2, Number(o.data.creep)),
    wet = Number(o.data.wetness);
  c.strokeStyle = condition > 0.2 ? '#bba06b' : '#805c4a';
  c.lineWidth = 0.055;
  if (stage >= 1) {
    for (const y of [-0.6, 0.6]) {
      c.beginPath();
      c.moveTo(-0.9, y);
      c.lineTo(0.9, y);
      c.stroke();
    }
    for (const x of [-0.9, 0.9]) {
      c.beginPath();
      c.moveTo(x, -0.6);
      c.lineTo(x, 0);
      c.lineTo(x, 0.6);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(-0.9, 0);
    c.quadraticCurveTo(0, sag, 0.9, 0);
    c.stroke();
  }
  if (stage >= 4) {
    c.strokeStyle = '#d0c783';
    c.lineWidth = 0.02;
    for (const x of [-0.9, 0.9])
      for (const y of [-0.6, 0, 0.6]) {
        c.beginPath();
        c.arc(x, y, 0.075, 0, Math.PI * 2);
        c.stroke();
      }
  }
  if (stage >= 7 && o.visual.state !== 'dismantling') {
    c.globalAlpha = 0.4 + condition * 0.25;
    c.fillStyle = wet > 0.4 ? '#6a7853' : '#c9be80';
    const spacing = 0.14,
      width = spacing * Number(o.data.coverage);
    for (let x = -0.85; x < 0.85; x += spacing) {
      c.fillRect(x, -0.56, width, 0.5 - sag);
      c.fillRect(x, 0.06 + sag, width, 0.5 - sag);
    }
    c.globalAlpha = 1;
  }
  if (o.visual.state === 'failed') {
    c.strokeStyle = '#cc765b';
    c.lineWidth = 0.04;
    c.beginPath();
    c.moveTo(-0.3, -0.25);
    c.lineTo(0.3, 0.25);
    c.moveTo(-0.3, 0.25);
    c.lineTo(0.3, -0.25);
    c.stroke();
  }
  c.restore();
  return true;
}
