import { collectiveJobs, v7Observe } from '@self-evolving-world/world-core';
import type { V7World, V7Data } from '@self-evolving-world/world-core';
export function drawFoodInspection(
  c: CanvasRenderingContext2D,
  w: V7World,
  personal: string | null,
) {
  const jobs = collectiveJobs(w, 'non-ingestive-food-inspection');
  for (const a of w.actors.filter((a) => !personal || a.id === personal)) {
    const j = jobs.filter((j) => j.owner === a.id).at(-1);
    const record = Object.values(a.memory.knowledge ?? {})
      .filter((k) => k.key.startsWith('food-inspection:'))
      .sort((x, y) => y.tick - x.tick)[0];
    const sample = w.stacks.find(
      (s) => s.id === (j?.sample ?? record?.subject),
    );
    if (
      !sample ||
      (personal &&
        !v7Observe(w, personal).stacks.some((s) => s.id === sample.id))
    )
      continue;
    const owner = w.actors.find((a) => a.id === sample.owner),
      p = sample.reservedFor
        ? sample.position
        : (owner?.position ?? sample.position);
    const f = Number(
      (sample.processing?.foodInspection as V7Data | undefined)?.fraction ?? 0,
    );
    c.save();
    c.translate(p.x, p.y);
    c.fillStyle = '#b79159';
    c.strokeStyle = '#624a31';
    c.lineWidth = 0.025;
    c.beginPath();
    c.ellipse(0, 0.2, 0.17, 0.12, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    if (f > 0) {
      c.strokeStyle = '#ede0b5';
      c.lineWidth = 0.025 + f * 0.025;
      c.beginPath();
      c.moveTo(-0.12, 0.15);
      c.lineTo(0, 0.24);
      c.lineTo(0.12, 0.16);
      c.stroke();
    }
    if (j && w.stacks.some((s) => s.id === j.tool)) {
      const paid = j.lastPaid === w.tick && j.status === 'active';
      c.fillStyle = '#939e98';
      c.beginPath();
      c.ellipse(
        paid ? 0 : 0.3,
        paid ? 0.05 : 0.25,
        0.13,
        0.08,
        -0.4,
        0,
        Math.PI * 2,
      );
      c.fill();
      if (paid) {
        c.strokeStyle = '#e8ddbb';
        c.beginPath();
        c.moveTo(0, 0.08);
        c.lineTo(0, 0.16);
        c.stroke();
      }
    }
    c.font = '600 0.21px system-ui';
    c.textAlign = 'center';
    c.lineWidth = 0.045;
    c.strokeStyle = '#20332b';
    c.fillStyle = '#fff0cf';
    const lines = [
      j
        ? `Sample opening · ${j.status} · ${String(j.remainingWork)} work left`
        : 'Actual sample inspection',
      `${sample.quantity.toFixed(1)} sample · ${j ? j.paidEnergy.toFixed(1) + ' opening energy' : '0.2 inspection energy'} · ${(f * 100).toFixed(0)}% opened`,
      'Not a safety test · nutrition / toxicity unknown',
    ];
    lines.forEach((line, i) => {
      c.strokeText(line, 0, -1.7 - i * 0.33);
      c.fillText(line, 0, -1.7 - i * 0.33);
    });
    c.restore();
  }
}
