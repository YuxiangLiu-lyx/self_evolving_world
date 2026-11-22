import {
  smallDryingAssessment,
  smallSupportValidity,
  v7Observe,
  rootProcessing,
  collectiveJobs,
} from '@self-evolving-world/world-core';
import type { V7World, V7Actor, V7Data } from '@self-evolving-world/world-core';
const label = (value: unknown, fallback = 'Unknown') =>
  typeof value === 'string' ? value : fallback;
export function appendSmallDrying(parent: HTMLElement, w: V7World, a: V7Actor) {
  const r = smallDryingAssessment(a),
    objects = v7Observe(w, a.id).objects.filter(
      (o) => o.kind === 'small-root-drying-support',
    ),
    job = collectiveJobs(w, 'root-small-drying')
      .filter((j) => j.owner === a.id)
      .at(-1);
  if (!r && !objects.length && !job) return;
  const panel = document.createElement('section');
  panel.className = 'small-drying-panel';
  const title = document.createElement('h4');
  title.textContent = 'Small ground-supported drying';
  panel.append(title);
  const line = (text: string) => {
    const p = document.createElement('p');
    p.textContent = text;
    panel.append(p);
  };
  if (r) {
    line(
      `Personal assessment at round ${String(Number(r.tick))} · ${r.suitable ? 'requirements passed' : 'unresolved requirements'} · ${label(r.id)}`,
    );
    const g = r.geometry as V7Data | null;
    if (g)
      line(
        `${Number(g.width).toFixed(3)} × ${Number(g.height).toFixed(3)} m sheet · ${Number(g.mass).toFixed(3)} mass · ${label(g.basis)}`,
      );
    for (const raw of Array.isArray(r.checks) ? r.checks : []) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const d = document.createElement('details'),
        s = document.createElement('summary'),
        p = document.createElement('p');
      s.textContent = `${label(raw.status).toUpperCase()} · ${label(raw.code)}`;
      p.textContent = `Required: ${label(raw.required)} Observed: ${JSON.stringify(raw.observed)}`;
      d.open = raw.status !== 'pass';
      d.append(s, p);
      panel.append(d);
    }
  }
  if (job)
    line(
      `Personal ${job.mode}: ${job.status} · ${job.completedWork.toFixed(2)} work paid · ${job.remainingWork.toFixed(2)} remaining · ${job.paidEnergy.toFixed(2)} energy · ${job.id}`,
    );
  for (const o of objects) {
    line(`${o.id} · ${o.visual.state} · ${smallSupportValidity(w, o).reason}`);
    line(
      `Reserved material identities: ${JSON.stringify(o.data.activeWork && job?.target === o.id ? job.escrow : o.data.components)} · ${String(Number(o.data.remainingWork))} work remaining`,
    );
    const food = w.stacks.find((s) => s.id === o.data.foodId),
      p = food ? rootProcessing(w, food) : null;
    if (food && p)
      line(
        `${food.quantity.toFixed(1)} original root · water ${food.physical?.unitWater.toFixed(4) ?? 'unknown'} per unit · accumulated age ${(food.decay ?? 0).toFixed(2)} · ${label(p.history.at(-1)?.status, 'No exchange yet')} · ${p.dry ? 'dryness threshold met' : 'dryness threshold not met'}`,
      );
    else line('No loaded food. An empty support is not preservation.');
  }
  line(
    'Food safety and nutrition are unchanged. Model dimensions are not personal measurements.',
  );
  parent.append(panel);
}
export function drawSmallDrying(
  c: CanvasRenderingContext2D,
  w: V7World,
  personal: string | null,
) {
  const objects = personal ? v7Observe(w, personal).objects : w.objects;
  for (const o of objects.filter(
    (o) => o.kind === 'small-root-drying-support',
  )) {
    const g = o.data.geometry as V7Data,
      cx = o.spatial.x,
      cy = o.spatial.y,
      food = w.stacks.find((s) => s.id === o.data.foodId);
    c.save();
    c.translate(cx, cy);
    c.lineWidth = 0.012;
    c.strokeStyle = '#5e4931';
    c.fillStyle = o.visual.state === 'ready' ? '#c9af80' : '#9c8d70';
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
    c.setLineDash([0.025, 0.02]);
    c.strokeRect(-0.08, -0.08, 0.16, 0.16);
    c.setLineDash([]);
    if (o.visual.state === 'ready') {
      c.fillStyle = '#728079';
      c.fillRect(0.08, -0.08, 0.02, 0.16);
    }
    if (food) {
      c.fillStyle = '#b6945d';
      c.fillRect(-0.06, -0.06, 0.12, 0.12);
    }
    c.font = '600 0.18px system-ui';
    c.textAlign = 'center';
    c.strokeStyle = '#20332b';
    c.fillStyle = '#f4e0b2';
    c.lineWidth = 0.04;
    const p = food ? rootProcessing(w, food) : null;
    [
      `Small sheet · ${o.visual.state} · ${Number(o.data.remainingWork).toFixed(2)} work left`,
      food
        ? `0.1 root · water ${food.physical?.unitWater.toFixed(4) ?? '?'} · age ${(food.decay ?? 0).toFixed(1)}`
        : 'Empty support · no food or preservation',
      p
        ? label(
            p.history.at(-1)?.status,
            'Exposure not yet observed',
          ).startsWith('Evaporation paused')
          ? 'Exposure paused · inspect actual conditions'
          : label(p.history.at(-1)?.status, 'Exposure not yet observed')
        : o.visual.state === 'ready'
          ? 'Actual ballast and connected sheet'
          : 'Reserved material · assembly incomplete',
      '0.16 m food rectangle · 0.02 m margins · safety unknown',
    ].forEach((text, i) => {
      c.strokeText(text, 0, 1.8 + i * 0.3);
      c.fillText(text, 0, 1.8 + i * 0.3);
    });
    c.restore();
  }
}
