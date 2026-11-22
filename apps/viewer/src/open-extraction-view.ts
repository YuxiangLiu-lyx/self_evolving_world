import type { V7Data, V7World } from '@self-evolving-world/world-core';
/** Presentation uses retained transfers and interval records, never infers a successful assay. */
export function renderExtraction(parent: HTMLElement, data?: V7Data) {
  parent.replaceChildren();
  parent.hidden = !data;
  if (!data) return;
  parent.className = 'trial-diagnostic';
  const scalar = (v: unknown) =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : 'unknown';
  const line = (s: string) => {
    const p = document.createElement('p');
    p.textContent = s;
    parent.append(p);
  };
  line(
    `Actual extraction · ${scalar(data.operationId ?? 'local inspection')} · paid ${scalar(data.paidEnergy)} energy · remaining work ${scalar(data.remainingWork ?? 'see stages')}`,
  );
  line(
    'Not a safety or nutrition certificate. Model partition assumptions are separate from observed intervals.',
  );
  if (Array.isArray(data.arms))
    for (const arm of data.arms) {
      if (!arm || typeof arm !== 'object' || Array.isArray(arm)) continue;
      line(
        `Cup ${scalar(arm.cup)} · water ${scalar(arm.waterMl)} ml · contact ${scalar(arm.contactRounds)} rounds · ${arm.separated === true ? 'actual tray residue' : 'retained mixing'} · leaked solids ${Number(arm.leakedSolids ?? 0).toFixed(6)}`,
      );
    }
  if (Array.isArray(data.measurements))
    for (const [i, m] of data.measurements.entries()) {
      if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
      line(
        `${i === 0 ? 'Sample' : 'Reference'} residue interval [${Number(m.lower).toFixed(5)}, ${Number(m.upper).toFixed(5)}] · relative model mass, not certified SI.`,
      );
    }
  if (Array.isArray(data.limits))
    for (const limit of data.limits) if (typeof limit === 'string') line(limit);
  if (typeof data.interpretation === 'string') line(data.interpretation);
}
export function drawExtraction(c: CanvasRenderingContext2D, w: V7World) {
  for (const value of Object.values(w.state)) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !Array.isArray(value.arms) ||
      typeof value.id !== 'string'
    )
      continue;
    for (const [i, arm] of value.arms.entries()) {
      if (
        !arm ||
        typeof arm !== 'object' ||
        Array.isArray(arm) ||
        typeof arm.cup !== 'string'
      )
        continue;
      const cup = w.stacks.find((s) => s.id === arm.cup);
      if (!cup) continue;
      c.save();
      c.font = '.16px system-ui';
      c.textAlign = 'right';
      c.fillStyle = i === 0 ? '#e3d5b1' : '#bee2d3';
      const x = cup.position.x - 1.1,
        y = cup.position.y - 0.4 + i * 0.35;
      c.fillText(
        `${i === 0 ? 'Sample' : 'Reference'} cup · ${Number(cup.waterCup?.waterMl ?? 0).toFixed(0)} ml`,
        x,
        y,
      );
      c.strokeStyle = c.fillStyle;
      c.lineWidth = 0.012;
      c.beginPath();
      c.moveTo(x + 0.08, y - 0.04);
      c.lineTo(cup.position.x - 0.06, cup.position.y);
      c.stroke();
      c.restore();
    }
  }
  for (const tray of w.objects.filter((o) => o.kind === 'drying-tray')) {
    const regions = w.stacks.filter((s) => {
      const d = s.processing?.preservationPhysics;
      return (
        s.processing?.extractionRegion &&
        d &&
        typeof d === 'object' &&
        !Array.isArray(d) &&
        d.tray === tray.id
      );
    });
    if (!regions.length) continue;
    c.save();
    c.translate(tray.spatial.x, tray.spatial.y);
    c.rotate(tray.spatial.angle);
    const shape = tray.spatial.shape,
      width = shape.kind === 'circle' ? shape.radius * 2 : shape.width,
      height = shape.kind === 'circle' ? shape.radius * 2 : shape.height;
    c.strokeStyle = '#b9aa86';
    c.lineWidth = 0.02;
    c.setLineDash([0.06, 0.04]);
    if (shape.kind === 'circle') {
      c.beginPath();
      c.arc(0, 0, shape.radius, 0, Math.PI * 2);
      c.stroke();
    } else c.strokeRect(-width / 2, -height / 2, width, height);
    c.beginPath();
    c.moveTo(0, -height / 2);
    c.lineTo(0, height / 2);
    c.stroke();
    c.setLineDash([]);
    regions.forEach((s) => {
      const d = s.processing?.extractionRegion as V7Data;
      c.fillStyle = Number(d.slot) === 0 ? '#b9a57a' : '#7fa79b';
      c.beginPath();
      c.arc(
        (Number(d.slot) === 0 ? -0.2 : 0.2) * width,
        0,
        0.05,
        0,
        Math.PI * 2,
      );
      c.fill();
    });
    c.restore();
  }
}
