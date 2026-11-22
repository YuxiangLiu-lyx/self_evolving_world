import type {
  V7Object,
  V7Stack,
  V7Event,
  V7Actor,
} from '@self-evolving-world/world-core';
function text(
  c: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
) {
  c.font = '0.14px system-ui';
  c.textAlign = 'left';
  c.fillStyle = '#eee7ce';
  c.fillText(value, x, y);
}
export function drawWaterObject(
  c: CanvasRenderingContext2D,
  o: V7Object,
  quiet = false,
): boolean {
  if (!['water-cup-work', 'water-spill'].includes(o.kind)) return false;
  c.save();
  c.translate(o.spatial.x, o.spatial.y);
  if (o.kind === 'water-cup-work') {
    c.fillStyle = '#a97c61';
    c.beginPath();
    c.arc(0, 0, 0.03, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#dfc59b';
    c.lineWidth = 0.015;
    c.setLineDash([0.025, 0.025]);
    c.beginPath();
    c.arc(0, 0, 0.15, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    text(
      c,
      `Forming ${String(Number(o.data.stage))}/3 · ${String(Number(o.data.paidEnergy))} energy`,
      0.22,
      0.08,
    );
  } else {
    c.strokeStyle = '#6c9fa7';
    c.lineWidth = 0.015;
    c.setLineDash([0.06, 0.06]);
    c.strokeRect(-0.5, -0.5, 1, 1);
    c.setLineDash([]);
    c.fillStyle = '#628b99';
    c.beginPath();
    c.arc(0, 0, 0.06, 0, Math.PI * 2);
    c.fill();
    text(
      c,
      quiet
        ? ''
        : `Deposit audit · ${Number(o.data.waterMl).toFixed(1)} ml · ${(Number(o.data.clayMass) * 1000).toFixed(1)} g clay`,
      0.58,
      0.15,
    );
  }
  c.restore();
  return true;
}
export function drawWaterItem(
  c: CanvasRenderingContext2D,
  s: V7Stack,
  summary?: string,
): boolean {
  if (!s.waterCup && s.resource !== 'wet-clay-fragments') return false;
  c.save();
  c.translate(s.position.x, s.position.y);
  if (s.waterCup) {
    c.strokeStyle = '#c9a27b';
    c.lineWidth = 0.02;
    c.beginPath();
    c.arc(0, 0, 0.03, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#82b5c1';
    c.beginPath();
    c.arc(
      0,
      0,
      0.023 * Math.sqrt(Number(s.waterCup.waterMl) / 100),
      0,
      Math.PI * 2,
    );
    c.fill();
    text(
      c,
      summary ?? `Unfired cup · ${String(Number(s.waterCup.waterMl))}/100 ml`,
      0.23,
      -0.1,
    );
  } else {
    c.fillStyle = '#a97c61';
    c.beginPath();
    c.moveTo(-0.05, -0.02);
    c.lineTo(0.03, -0.05);
    c.lineTo(0.06, 0.03);
    c.lineTo(-0.02, 0.05);
    c.closePath();
    c.fill();
    text(
      c,
      summary ??
        `Retained clay · ${((s.physical?.unitMass ?? 0) * s.quantity * 1000).toFixed(1)} g`,
      0.23,
      0.35,
    );
  }
  c.restore();
  return true;
}
export function drawWaterAccess(
  c: CanvasRenderingContext2D,
  e: V7Event,
  a: V7Actor | undefined,
) {
  if (e.type !== 'water-access-inspected' || !a || !e.data.point) return;
  const p = e.data.point as { x: number; y: number };
  c.save();
  c.strokeStyle = e.data.reachable === true ? '#c7dba0' : '#dd9279';
  c.lineWidth = 0.025;
  c.setLineDash([0.05, 0.05]);
  c.beginPath();
  c.moveTo(a.position.x, a.position.y);
  c.lineTo(p.x, p.y);
  c.stroke();
  c.setLineDash([]);
  c.beginPath();
  c.arc(p.x, p.y, 0.08, 0, Math.PI * 2);
  c.stroke();
  text(
    c,
    e.data.reachable === true
      ? 'Surface reachable'
      : 'Reach blocked or unresolved',
    p.x + 0.25,
    p.y - 0.4,
  );
  text(c, 'Safety unknown', p.x + 0.25, p.y - 0.2);
  c.restore();
}
export function drawCarriedWater(
  c: CanvasRenderingContext2D,
  items: V7Stack[],
  a: V7Actor,
) {
  if (!items.length) return;
  c.save();
  c.translate(a.position.x + 0.25, a.position.y - 0.28);
  c.strokeStyle = '#c9a27b';
  c.lineWidth = 0.02;
  c.beginPath();
  c.arc(0, 0, 0.03, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = '#82b5c1';
  c.beginPath();
  c.arc(0, 0, 0.02, 0, Math.PI * 2);
  c.fill();
  text(
    c,
    `Carried cups ${String(items.length)} · ${String(items.reduce((n, s) => n + Number(s.waterCup?.waterMl ?? 0), 0))} ml`,
    0.2,
    0.05,
  );
  c.restore();
}
