import type { V7Stack } from '@self-evolving-world/world-core';

/** Read-only bark panels, vine ties, wet darkening and condition-dependent fraying. */
export function drawMantle(
  c: CanvasRenderingContext2D,
  mantle: NonNullable<V7Stack['mantle']>,
) {
  c.save();
  c.fillStyle = mantle.moisture > 0.5 ? '#6d604a' : '#baa27a';
  c.strokeStyle = '#514b38';
  c.lineWidth = 0.02;
  for (let i = 0; i < 3; i++) {
    const x = -0.22 + i * 0.14;
    c.beginPath();
    c.moveTo(x + 0.03, -0.36);
    c.lineTo(x + 0.15, -0.34);
    c.lineTo(x + 0.17, 0.06);
    c.lineTo(x, mantle.condition < 40 ? 0.14 - i * 0.035 : 0.09);
    c.closePath();
    c.fill();
    c.stroke();
  }
  c.strokeStyle = '#779455';
  c.lineWidth = 0.035;
  c.beginPath();
  c.moveTo(-0.19, -0.3);
  c.lineTo(0.18, -0.18);
  c.moveTo(0.18, -0.3);
  c.lineTo(-0.19, -0.18);
  c.stroke();
  if (mantle.condition < 40) {
    c.strokeStyle = '#d5bd89';
    c.lineWidth = 0.015;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(-0.2 + i * 0.1, 0.04);
      c.lineTo(-0.23 + i * 0.1, 0.16);
      c.stroke();
    }
  }
  c.restore();
}
