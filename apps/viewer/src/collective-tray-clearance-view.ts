import {
  trayClearanceResult,
  trayClearanceHistory,
} from '@self-evolving-world/world-core';
import type { V7Actor, V7World } from '@self-evolving-world/world-core';
export function appendTrayClearance(parent: HTMLElement, a: V7Actor) {
  const latest = trayClearanceResult(a);
  if (!latest) return;
  const history = trayClearanceHistory(a),
    panel = document.createElement('section'),
    title = document.createElement('h4');
  title.textContent = 'Recorded tray placement';
  const select = document.createElement('select');
  select.ariaLabel = 'Recorded tray assessment';
  history.forEach((r, i) => {
    select.add(
      new Option(
        `Round ${String(Number(r.tick))}${r.legacy ? ' · legacy detail unavailable' : ''}`,
        String(i),
      ),
    );
  });
  select.value = String(
    Math.max(
      0,
      history.findIndex((r) => r.assessmentId === latest.assessmentId),
    ),
  );
  const body = document.createElement('div');
  const render = () => {
    body.replaceChildren();
    const r = history[Number(select.value)] ?? latest;
    const status = document.createElement('p');
    status.textContent = `${typeof r.assessmentId === 'string' ? r.assessmentId : ''} · Recorded round ${String(Number(r.tick))} · ${r.legacy ? 'Unknown historical detail' : r.suitable ? 'All requirements passed at that time' : 'Failed or unresolved requirements'} · Later conditions are not substituted.`;
    body.append(status);
    if (Array.isArray(r.checks))
      for (const raw of r.checks) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const check = document.createElement('details');
        check.open = raw.status !== 'pass';
        check.className = 'surface-requirement';
        check.style.cssText =
          'border-top:1px solid #b6c2aa;padding:8px 0;overflow-wrap:anywhere;font-size:12px';
        const heading = document.createElement('summary'),
          values = document.createElement('div'),
          basis = document.createElement('div');
        heading.textContent = `${typeof raw.status === 'string' ? raw.status.toUpperCase() : 'UNKNOWN'} · ${typeof raw.code === 'string' ? raw.code : ''}`;
        values.textContent = `Observed: ${JSON.stringify(raw.observed)}. Required: ${JSON.stringify(raw.required)}. Evidence: ${JSON.stringify(raw.evidenceIds ?? [])}.`;
        basis.textContent = typeof raw.basis === 'string' ? raw.basis : '';
        check.append(heading, values, basis);
        body.append(check);
      }
  };
  select.addEventListener('change', render);
  panel.append(title, select, body);
  parent.append(panel);
  render();
}
export function drawTrayClearance(
  c: CanvasRenderingContext2D,
  w: V7World,
  personal: string | null,
) {
  for (const a of w.actors.filter((a) => !personal || a.id === personal)) {
    const r = trayClearanceResult(a),
      site = r?.site;
    if (!r || !site || typeof site !== 'object' || Array.isArray(site))
      continue;
    if (typeof site.x !== 'number' || typeof site.y !== 'number') continue;
    c.save();
    c.translate(site.x, site.y);
    c.lineWidth = 0.025;
    c.setLineDash([0.08, 0.05]);
    c.strokeStyle = r.suitable
      ? '#91c5a1'
      : Array.isArray(r.unresolvedChecks) && r.unresolvedChecks.length
        ? '#e4cc73'
        : '#ec8e6d';
    c.beginPath();
    c.arc(0, 0, 0.4, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#f4d182';
    c.beginPath();
    c.arc(0, 0, 1.05, 0, Math.PI * 2);
    c.stroke();
    c.font = '600 0.18px system-ui';
    c.textAlign = 'center';
    c.lineWidth = 0.04;
    c.strokeStyle = '#20332b';
    c.fillStyle = '#f9ead2';
    const lines = [
      `Recorded assessment · round ${String(Number(r.tick))} · ${r.suitable ? 'passed then' : 'unmet conditions'}`,
      'Circular footprint radius 0.40 m · interaction 0.65 m',
      'Dated evidence only · no physical reservation',
      `Failed: ${JSON.stringify(r.failedChecks)} · unknown: ${JSON.stringify(r.unresolvedChecks)}`,
    ];
    lines.forEach((s, i) => {
      c.strokeText(s, 0, 2.4 + i * 0.3);
      c.fillText(s, 0, 2.4 + i * 0.3);
    });
    c.restore();
    if (Array.isArray(r.checks))
      for (const raw of r.checks) {
        if (
          !raw ||
          typeof raw !== 'object' ||
          Array.isArray(raw) ||
          raw.code !== 'clearance'
        )
          continue;
        const value = raw.observed;
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          !Array.isArray(value.blockers)
        )
          continue;
        for (const b of value.blockers) {
          if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
          const at = b.spatial;
          if (
            !at ||
            typeof at !== 'object' ||
            Array.isArray(at) ||
            typeof at.x !== 'number' ||
            typeof at.y !== 'number'
          )
            continue;
          c.save();
          c.strokeStyle = '#d2674b';
          c.lineWidth = 0.04;
          const shape = at.shape;
          if (shape && typeof shape === 'object' && !Array.isArray(shape)) {
            c.save();
            c.translate(at.x, at.y);
            c.rotate(Number(at.angle ?? 0));
            c.beginPath();
            if (shape.kind === 'circle')
              c.arc(0, 0, Number(shape.radius), 0, Math.PI * 2);
            else if (shape.kind === 'rectangle')
              c.rect(
                -Number(shape.width) / 2,
                -Number(shape.height) / 2,
                Number(shape.width),
                Number(shape.height),
              );
            c.stroke();
            c.restore();
          }
          c.beginPath();
          c.moveTo(at.x - 0.12, at.y - 0.12);
          c.lineTo(at.x + 0.12, at.y + 0.12);
          c.moveTo(at.x + 0.12, at.y - 0.12);
          c.lineTo(at.x - 0.12, at.y + 0.12);
          c.stroke();
          c.restore();
        }
      }
  }
}
