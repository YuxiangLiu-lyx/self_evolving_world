import type { V7Object } from '@self-evolving-world/world-core';
/** Drawing follows paid object state; this does not produce equipment or measurements. */
export function drawAssayApparatus(
  c: CanvasRenderingContext2D,
  o: V7Object,
): boolean {
  if (
    !['comparison-balance', 'drying-tray', 'assay-site', 'woven-site'].includes(
      o.kind,
    )
  )
    return false;
  c.save();
  c.translate(o.spatial.x, o.spatial.y);
  const woven = o.data.variant === 'woven',
    deflection = Math.min(0.16, Number(o.data.deflection ?? 0));
  c.lineWidth = 0.035;
  c.strokeStyle = '#54432e';
  c.fillStyle = '#c5ac7d';
  if (o.kind === 'comparison-balance') {
    c.fillRect(-0.03, -0.3, 0.06, 0.55);
    c.fillRect(-0.2, 0.22, 0.4, 0.05);
    c.beginPath();
    c.moveTo(-0.3, -0.24 - deflection);
    c.lineTo(0.3, -0.24 + deflection);
    c.stroke();
    for (const x of [-0.3, 0.3]) {
      c.beginPath();
      c.moveTo(x, -0.24);
      c.lineTo(x, 0.02);
      c.stroke();
      c.beginPath();
      c.ellipse(x, 0.04, 0.08, 0.04, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      if (woven) {
        c.beginPath();
        c.moveTo(x - 0.08, 0.04);
        c.lineTo(x - 0.05, 0.13);
        c.lineTo(x + 0.05, 0.13);
        c.lineTo(x + 0.08, 0.04);
        c.stroke();
        for (let dx = -0.04; dx <= 0.04; dx += 0.04) {
          c.beginPath();
          c.moveTo(x + dx, 0.03);
          c.lineTo(x + dx, 0.12);
          c.stroke();
        }
      }
    }
    c.fillStyle = o.data.calibrated === true ? '#e3cf93' : '#b59984';
    c.beginPath();
    c.arc(0, -0.3, 0.06, 0, Math.PI * 2);
    c.fill();
  } else if (o.kind === 'drying-tray') {
    c.beginPath();
    c.ellipse(0, 0, 0.18, 0.11, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.strokeStyle = '#8b6e48';
    for (let x = -0.1; x <= 0.1; x += 0.05) {
      c.beginPath();
      c.moveTo(x, -0.07);
      c.lineTo(x, 0.07);
      c.stroke();
      if (woven) {
        c.beginPath();
        c.moveTo(-0.1, x * 0.7);
        c.lineTo(0.1, x * 0.7);
        c.stroke();
      }
    }
  } else {
    c.setLineDash([0.05, 0.04]);
    c.strokeRect(-0.2, -0.14, 0.4, 0.28);
    if (woven) {
      c.setLineDash([]);
      const stage = Number(o.data.progress ?? 0);
      if (o.data.part === 'balance' && stage >= 1) {
        c.beginPath();
        c.moveTo(-0.3, -0.12);
        c.lineTo(0.3, -0.12);
        c.stroke();
        if (stage >= 3) {
          c.beginPath();
          c.moveTo(0, -0.12);
          c.lineTo(0, 0.15);
          c.stroke();
        }
        if (stage >= 5) {
          for (const x of [-0.25, 0.25]) {
            c.beginPath();
            c.moveTo(x, -0.12);
            c.lineTo(x, 0.08);
            c.lineTo(x + 0.06, 0.12);
            c.stroke();
          }
        }
      } else if (stage >= 9) {
        for (let x = -0.15; x <= 0.15; x += 0.05) {
          c.beginPath();
          c.moveTo(x, -0.1);
          c.lineTo(x, 0.1);
          c.stroke();
        }
      }
    }
  }
  const batch = o.data.preservation;
  if (
    o.kind === 'drying-tray' &&
    batch &&
    typeof batch === 'object' &&
    !Array.isArray(batch)
  ) {
    const fraction = Math.max(0, Math.min(1, Number(batch.waterFraction))),
      ratio = Math.max(0.1, Math.min(1.5, Number(batch.massRatio)));
    c.fillStyle = batch.resource === 'berry' ? '#aa5461' : '#be9c66';
    c.beginPath();
    c.ellipse(
      0,
      0,
      0.14 * Math.sqrt(ratio),
      0.075 * Math.sqrt(ratio),
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.strokeStyle = '#83b7c2';
    c.lineWidth = 0.025;
    c.beginPath();
    c.moveTo(-0.12, 0.17);
    c.lineTo(-0.12 + 0.24 * fraction, 0.17);
    c.stroke();
  }
  c.restore();
  return true;
}
