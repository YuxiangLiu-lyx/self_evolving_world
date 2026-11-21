import type { V7Actor, V7Stack } from '@self-evolving-world/world-core';
/** Only actual paid work has hands/material motion. Inventory labels retain exact provenance. */
export function drawWillowWork(
  c: CanvasRenderingContext2D,
  a: V7Actor,
  active: string | null,
  phase: number,
) {
  const j = a.extensionState['willow:pending'];
  if (
    active !== 'process-willow' ||
    !j ||
    typeof j !== 'object' ||
    Array.isArray(j)
  )
    return;
  c.save();
  c.translate(0.27, -0.23);
  c.rotate(Math.sin(phase * Math.PI * 2) * 0.15);
  c.strokeStyle = j.mode === 'strip' ? '#c5aa73' : '#e1d0a2';
  c.lineWidth = 0.035;
  for (let n = 0; n < 3; n++) {
    c.beginPath();
    c.moveTo(-0.12, -0.13 + n * 0.045);
    c.lineTo(0.17, 0.13 - n * 0.03);
    c.stroke();
  }
  if (j.mode === 'strip') {
    c.fillStyle = '#b5a47a';
    c.fillRect(-0.08, -0.15, 0.06, 0.26);
  } else {
    c.strokeStyle = '#eee0b1';
    c.lineWidth = 0.025;
    for (let i = 0; i < 2; i++) {
      c.beginPath();
      for (let n = 0; n <= 12; n++) {
        const x = -0.12 + n * 0.024,
          y = Math.sin(n * 0.8 + i * Math.PI) * 0.035;
        if (n) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
    }
  }
  c.fillStyle = '#ddc2a0';
  c.beginPath();
  c.arc(-0.1, -0.1, 0.045, 0, Math.PI * 2);
  c.arc(0.14, 0.1, 0.045, 0, Math.PI * 2);
  c.fill();
  c.restore();
}
export function drawWillowItem(
  c: CanvasRenderingContext2D,
  s: V7Stack,
): boolean {
  if (
    ![
      'willow-bark',
      'willow-bast',
      'bast-cord',
      'willow-offcut',
      'willow-shoot-bundle',
    ].includes(s.resource)
  )
    return false;
  c.save();
  c.translate(s.position.x, s.position.y + 0.22);
  c.strokeStyle = (s.fuelMoisture ?? 0) > 0.5 ? '#6d6244' : '#bea775';
  c.lineWidth = 0.025;
  c.fillStyle = '#b5a47a';
  if (s.resource === 'willow-bark') {
    c.fillRect(-0.16, -0.09, 0.2, 0.15);
    c.fillRect(-0.03, -0.03, 0.2, 0.15);
  } else if (s.resource === 'bast-cord') {
    c.beginPath();
    c.ellipse(0, 0, 0.18, 0.1, -0.2, 0, Math.PI * 2);
    c.ellipse(0.02, 0.015, 0.14, 0.07, -0.2, 0, Math.PI * 2);
    c.stroke();
  } else
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(-0.16 + i * 0.04, -0.09);
      c.lineTo(
        (s.resource === 'willow-offcut' ? -0.04 : 0.14) + i * 0.012,
        0.08 - i * 0.02,
      );
      c.stroke();
    }
  c.restore();
  return true;
}
