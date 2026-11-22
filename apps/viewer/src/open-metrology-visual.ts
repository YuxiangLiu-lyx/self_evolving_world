import type { V7Object } from '@self-evolving-world/world-core';
/** The displayed outline and reserved footprint are the same persisted specimen geometry. */
export function drawMetrology(
  c: CanvasRenderingContext2D,
  o: V7Object,
): boolean {
  if (o.kind !== 'metrology-layout') return false;
  const length = Number(o.data.length),
    diameter = Number(o.data.diameter),
    taper = Number(o.data.taper),
    curve = Number(o.data.curvature),
    span = Number(o.data.span),
    bend = Math.min(0.3, Number(o.data.deflection));
  c.save();
  c.translate(o.spatial.x, o.spatial.y);
  c.rotate(o.spatial.angle);
  c.fillStyle = '#a7885f';
  c.strokeStyle = '#503d2c';
  c.lineWidth = 0.012;
  c.beginPath();
  c.moveTo(-length / 2, -diameter / 2);
  c.quadraticCurveTo(
    0,
    curve + bend - diameter / 2,
    length / 2,
    (-diameter * taper) / 2,
  );
  c.lineTo(length / 2, (diameter * taper) / 2);
  c.quadraticCurveTo(0, curve + bend + diameter / 2, -length / 2, diameter / 2);
  c.closePath();
  c.fill();
  c.stroke();
  if (span > 0) {
    c.fillStyle = '#697968';
    for (const x of [-span / 2, span / 2])
      c.fillRect(x - 0.04, -0.12, 0.08, 0.24);
    c.fillStyle = '#b6bcb2';
    c.fillRect(-0.09, -0.09 + curve + bend, 0.18, 0.18);
  }
  if (o.data.broken === true) {
    c.strokeStyle = '#bd664b';
    c.lineWidth = 0.04;
    c.beginPath();
    c.moveTo(-0.05, -0.1);
    c.lineTo(0.05, curve + bend + 0.1);
    c.stroke();
  }
  if (o.data.measured === true) {
    c.strokeStyle = '#f3df9c';
    c.lineWidth = 0.015;
    for (const t of [-0.5, 0, 0.5]) {
      c.beginPath();
      c.moveTo(t * length, -0.2);
      c.lineTo(t * length, 0.2);
      c.stroke();
    }
  }
  c.restore();
  return true;
}
