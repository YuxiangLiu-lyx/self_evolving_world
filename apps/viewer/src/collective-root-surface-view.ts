import {
  collectiveJobs,
  v7Observe,
  rootProcessing,
} from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
export function drawRootSurface(
  c: CanvasRenderingContext2D,
  w: V7World,
  personal: string | null,
) {
  for (const a of w.actors.filter((a) => !personal || a.id === personal)) {
    const j = collectiveJobs(w, 'root-preparation-surface')
      .filter((j) => j.owner === a.id)
      .at(-1);
    const assessment = w.events.find(
      (e) => e.actor === a.id && e.type === 'root-surface-assessed',
    );
    if (!j && Array.isArray(assessment?.data.checks)) continue;
    const raw = j?.geometry ?? assessment?.data.geometry;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const g = raw,
      site = j ? { x: j.x, y: j.y } : a.position;
    const implements_ = v7Observe(w, a.id).stacks.filter((s) =>
      j?.escrow.includes(s.id),
    );
    if (j && personal && !implements_.length) continue;
    const p = j ? site : a.position;
    c.save();
    c.translate(p.x, p.y);
    if (j && implements_.some((s) => s.resource === 'bark')) {
      c.fillStyle = '#c9b287';
      c.strokeStyle = '#745a39';
      c.lineWidth = 0.015;
      c.fillRect(
        -Number(g.width) / 2,
        -Number(g.height) / 2,
        Number(g.width),
        Number(g.height),
      );
      c.strokeRect(
        -Number(g.width) / 2,
        -Number(g.height) / 2,
        Number(g.width),
        Number(g.height),
      );
    }
    const food = j
      ? implements_.find(
          (s) => Array.isArray(j.foodIds) && j.foodIds.includes(s.id),
        )
      : undefined;
    const fraction = food ? rootProcessing(w, food)?.fraction : undefined;
    const lines = [
      `Containing sheet · ${Number(g.width).toFixed(3)} × ${Number(g.height).toFixed(3)} m · ${Number(g.mass).toFixed(3)} mass`,
      typeof g.basis === 'string' && g.basis.startsWith('Model')
        ? 'Model-derived dimensions · not measured'
        : 'Retained represented geometry',
      j
        ? `${String(Number(j.quantity))} selected root · ${j.status} · ${j.remainingWork.toFixed(2)} work left · ${j.paidEnergy.toFixed(2)} energy`
        : assessment?.data.suitable
          ? 'Actual assessment: 0.16 × 0.16 m footprint fits'
          : 'Actual assessment: unmet support or material condition',
      ...(fraction === undefined
        ? []
        : [
            `Actual selected material: ${(fraction * 100).toFixed(0)}% crushed · ${food?.quantity.toFixed(1) ?? '0'} root units`,
          ]),
      'Other roots untouched · no preservation or nutrition bonus',
    ];
    c.font = '600 0.19px system-ui';
    c.textAlign = 'center';
    c.lineWidth = 0.045;
    c.strokeStyle = '#20332b';
    c.fillStyle = '#f5dfb5';
    lines.forEach((line, i) => {
      c.strokeText(line, 0, 2.4 + i * 0.3);
      c.fillText(line, 0, 2.4 + i * 0.3);
    });
    c.restore();
  }
}
