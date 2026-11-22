import type { V7World } from '@self-evolving-world/world-core';
import { collectiveJobs } from '@self-evolving-world/world-core';
export function drawCollectiveBark(
  c: CanvasRenderingContext2D,
  w: V7World,
  personal: string | null,
) {
  const jobs = collectiveJobs(w, 'bark-extraction');
  for (const j of jobs.filter(
    (j) =>
      (!personal || j.owner === personal) &&
      !jobs.some(
        (other) =>
          other.owner === j.owner && jobs.indexOf(other) > jobs.indexOf(j),
      ),
  )) {
    if (
      j.status === 'completed' &&
      [
        ...collectiveJobs(w, 'material-stack-combine'),
        ...collectiveJobs(w, 'root-preparation-surface'),
      ].some((later) => later.owner === j.owner && later.lastPaid > j.lastPaid)
    )
      continue;
    const materials = w.stacks.filter(
        (s) => j.escrow.includes(s.id) && s.quantity > 0,
      ),
      source = materials.find((s) => s.id === j.input);
    if (!source) continue;
    const owner = w.actors.find((a) => a.id === source.owner),
      p = owner?.position ?? source.position;
    const bark = materials
        .filter((s) => s.resource === 'bark')
        .reduce((n, s) => n + s.quantity, 0),
      fines = materials
        .filter((s) => s.resource === 'bark-fines')
        .reduce((n, s) => n + s.quantity * (s.physical?.unitMass ?? 0), 0);
    c.save();
    c.translate(p.x, p.y);
    c.strokeStyle = '#e2cc9d';
    c.lineWidth = 0.025;
    c.setLineDash([0.08, 0.06]);
    c.beginPath();
    c.ellipse(0, 0.2, 0.6, 0.25, 0, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#8d704e';
    c.fillRect(-0.5, 0.15, 1, 0.1);
    c.fillStyle = '#cdb788';
    const fraction = j.initialWork ? j.remainingWork / j.initialWork : 0;
    c.fillRect(-0.5, 0.1, fraction, 0.06);
    c.fillStyle = '#d0c1a3';
    for (let i = 0; i < Math.min(4, Math.ceil(bark * 3)); i++)
      c.fillRect(-0.4 + i * 0.16, 0.4, 0.12, 0.08);
    c.fillStyle = '#89938c';
    c.beginPath();
    c.ellipse(0.45, 0.05, 0.12, 0.07, 0, 0, Math.PI * 2);
    c.fill();
    c.font = '600 0.22px system-ui';
    c.textAlign = 'center';
    c.lineWidth = 0.045;
    c.strokeStyle = '#20332b';
    c.fillStyle = '#fff2d4';
    const lines = [
      `Bark work · ${j.status} · ${j.remainingWork.toFixed(2)} left`,
      `${j.paidEnergy.toFixed(2)} effort · ${bark.toFixed(1)} bark · ${fines.toFixed(3)} fines mass`,
      `Residual ${(source.quantity * (source.physical?.unitMass ?? 0)).toFixed(3)} mass · ${materials.some((s) => s.resource === 'stone' || s.resource === 'flint') ? 'actual tool retained' : 'tool moved'}`,
    ];
    lines.forEach((line, i) => {
      c.strokeText(line, 0, -1.45 - i * 0.34);
      c.fillText(line, 0, -1.45 - i * 0.34);
    });
    c.restore();
  }
}
