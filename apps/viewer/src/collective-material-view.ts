import type { V7Stack, V7World } from '@self-evolving-world/world-core';
import { collectiveJobs, v7Observe } from '@self-evolving-world/world-core';
export function appendMaterialLots(parent: HTMLElement, stacks: V7Stack[]) {
  for (const s of stacks.filter((s) => s.componentLots)) {
    const detail = document.createElement('details'),
      title = document.createElement('summary'),
      body = document.createElement('pre');
    title.textContent = `${s.quantity.toFixed(1)} ${s.resource} · ${s.id} · original component provenance`;
    body.style.whiteSpace = 'pre-wrap';
    body.style.maxHeight = '240px';
    body.style.overflow = 'auto';
    detail.open = (parent.dataset.openMaterialLots ?? '')
      .split('|')
      .includes(s.id);
    title.addEventListener('click', (event) => {
      event.preventDefault();
      detail.open = !detail.open;
      const open = new Set(
        (parent.dataset.openMaterialLots ?? '').split('|').filter(Boolean),
      );
      if (detail.open) open.add(s.id);
      else open.delete(s.id);
      parent.dataset.openMaterialLots = [...open].join('|');
    });
    body.textContent = JSON.stringify(s.componentLots, null, 2);
    detail.append(title, body);
    parent.append(detail);
  }
}
export function drawMaterialCombine(
  c: CanvasRenderingContext2D,
  w: V7World,
  personal: string | null,
) {
  for (const a of w.actors.filter((a) => !personal || a.id === personal)) {
    const j = collectiveJobs(w, 'material-stack-combine')
      .filter((j) => j.owner === a.id)
      .at(-1);
    const selection = w.events.find(
      (e) => e.actor === a.id && e.type === 'material-combine-status',
    );
    const items = v7Observe(w, a.id).stacks.filter((s) => s.componentLots);
    if (!j && !selection) continue;
    if (
      j &&
      collectiveJobs(w, 'root-preparation-surface').some(
        (later) => later.owner === a.id && later.lastPaid > j.lastPaid,
      )
    )
      continue;
    const lines = [
      j
        ? `Material handling · ${j.status} · ${String(j.remainingWork)} work left`
        : 'Selected actual supplies · no combination yet',
      j
        ? `${j.paidEnergy.toFixed(1)} energy · no quality / happiness bonus`
        : 'No material or energy changed by selection',
      ...items.map(
        (s) =>
          `${s.quantity.toFixed(1)} ${s.resource} · ${s.reservedFor ? 'reserved at worksite' : s.owner === a.id ? 'carried' : 'ground'} · ${String(s.componentLots?.length)} original slices`,
      ),
    ];
    c.save();
    c.translate(a.position.x, a.position.y);
    c.textAlign = 'center';
    c.font = '600 0.19px system-ui';
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
