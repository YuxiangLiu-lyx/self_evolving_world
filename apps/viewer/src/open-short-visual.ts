import { shortRay, shortDimensions } from '@self-evolving-world/world-core';
import type { V7Object } from '@self-evolving-world/world-core';
/** Same physical pole union, apertures and finite rays; unbuilt assessments remain event text. */
export function drawShortRefuge(
  c: CanvasRenderingContext2D,
  o: V7Object,
  time: number,
  day: number,
): boolean {
  if (o.kind === 'short-pole') {
    c.save();
    c.translate(o.spatial.x, o.spatial.y);
    c.rotate(o.spatial.angle);
    c.fillStyle = '#9e8054';
    const s = o.spatial.shape;
    if (s.kind === 'circle') {
      c.beginPath();
      c.arc(0, 0, s.radius, 0, Math.PI * 2);
      c.fill();
    } else c.fillRect(-s.width / 2, -s.height / 2, s.width, s.height);
    c.restore();
    return true;
  }
  if (o.kind !== 'short-refuge') return false;
  const d = shortDimensions(o),
    phase = (time * Math.PI * 2) / day,
    dx = Math.cos(phase) * 0.5,
    dy = Math.sin(phase) * 0.5;
  for (
    let x = o.spatial.x - d.length - 1;
    x <= o.spatial.x + d.length + 1;
    x += 0.08
  )
    for (
      let y = o.spatial.y - d.width - 1;
      y <= o.spatial.y + d.width + 1;
      y += 0.08
    ) {
      const ray = shortRay(o, { x, y }, dx, dy);
      if (ray > 0) {
        c.fillStyle = `rgba(20,35,30,${String(ray * 0.25)})`;
        c.fillRect(x, y, 0.08, 0.08);
      }
    }
  c.save();
  c.translate(o.spatial.x, o.spatial.y);
  c.rotate(o.spatial.angle);
  const stage = Number(o.data.stage),
    sag = Math.min(d.width / 3, Number(o.data.sag ?? 0)),
    wet = Number(o.data.wetness ?? 0);
  c.strokeStyle = '#d0bc78';
  c.lineWidth = 0.025;
  if (stage >= 1)
    for (const x of [-d.length / 2, d.length / 2])
      for (const y of [-d.width / 2, 0, d.width / 2]) {
        c.beginPath();
        c.arc(x, y, 0.04, 0, Math.PI * 2);
        c.stroke();
      }
  if (stage >= 3) {
    c.strokeStyle = '#a98b60';
    c.lineWidth = 0.045;
    c.beginPath();
    c.moveTo(-(d.ridgeLength ?? d.length) / 2, 0);
    c.quadraticCurveTo(0, sag, (d.ridgeLength ?? d.length) / 2, 0);
    c.stroke();
  }
  if (stage >= 4) {
    c.fillStyle = wet > 0.2 ? '#6e7953' : '#c2b677';
    c.globalAlpha = 0.65;
    for (let x = -d.length / 2; x < d.length / 2; x += 0.08) {
      c.fillRect(
        x,
        -d.width / 2,
        Math.min(0.08 * Number(o.data.coverage), d.length / 2 - x),
        d.width / 2 - sag,
      );
      c.fillRect(
        x,
        sag,
        Math.min(0.08 * Number(o.data.coverage), d.length / 2 - x),
        d.width / 2 - sag,
      );
    }
    c.globalAlpha = 1;
  }
  if (o.data.collapsed === true || o.data.slip === true) {
    c.strokeStyle = '#c9694c';
    c.lineWidth = 0.035;
    c.beginPath();
    c.moveTo(-d.length / 3, -d.width / 3);
    c.lineTo(d.length / 3, d.width / 3);
    c.moveTo(-d.length / 3, d.width / 3);
    c.lineTo(d.length / 3, -d.width / 3);
    c.stroke();
  }
  c.font = '0.14px system-ui';
  c.fillStyle = '#f1e2af';
  c.textAlign = 'left';
  c.fillText(
    `${o.data.proven === true ? 'Tested canopy' : o.data.collapsed === true ? 'Failed frame' : 'Unproven frame'} · ${String(stage)}/4`,
    d.length / 2 + 0.5,
    0,
  );
  c.restore();
  return true;
}

export function drawShortProposal(
  c: CanvasRenderingContext2D,
  data: Record<string, unknown>,
): void {
  const shape = data.shape as V7Object['spatial'] | undefined,
    d = data.dimensions as
      { width: number; length: number; height: number } | undefined;
  if (!shape || !d) return;
  c.save();
  c.translate(shape.x, shape.y);
  c.rotate(shape.angle);
  c.strokeStyle = '#c7d9c5';
  c.lineWidth = 0.02;
  c.setLineDash([0.07, 0.05]);
  c.strokeRect(-d.length / 2, -d.width / 2, d.length, d.width);
  c.setLineDash([]);
  c.font = '0.14px system-ui';
  c.textAlign = 'left';
  c.fillStyle = '#e5ebda';
  c.fillText(
    `Proposed ${d.length.toFixed(2)} × ${d.width.toFixed(2)} × ${d.height.toFixed(2)} · unbuilt`,
    d.length / 2 + 0.5,
    0,
  );
  c.restore();
}
