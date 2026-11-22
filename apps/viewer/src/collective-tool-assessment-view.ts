import {
  toolAssessmentResult,
  toolAssessmentHistory,
} from '@self-evolving-world/world-core';
import type { V7Actor, V7World } from '@self-evolving-world/world-core';
export function appendToolAssessment(parent: HTMLElement, a: V7Actor) {
  const latest = toolAssessmentResult(a);
  if (!latest) return;
  const history = toolAssessmentHistory(a),
    panel = document.createElement('section'),
    title = document.createElement('h4'),
    select = document.createElement('select'),
    body = document.createElement('div');
  title.textContent = 'Recorded tool-only assessment';
  select.ariaLabel = 'Recorded tool assessment';
  history.forEach((r, i) => {
    select.add(new Option(`Round ${String(Number(r.tick))}`, String(i)));
  });
  select.value = String(
    Math.max(
      0,
      history.findIndex((r) => r.assessmentId === latest.assessmentId),
    ),
  );
  const render = () => {
    body.replaceChildren();
    const r = history[Number(select.value)] ?? latest;
    const status = document.createElement('p');
    status.textContent = `${typeof r.itemId === 'string' ? r.itemId : ''} · Recorded round ${String(Number(r.tick))} · ${r.suitable ? 'Tool predicate passed then' : 'Failed or unresolved tool condition'} · Entire setup NOT certified.`;
    body.append(status);
    for (const [label, value] of [
      ['Contact', r.contact],
      ['Evidence source', r.evidenceSource],
      ['Uncertainty', r.uncertainty],
    ] as const) {
      const p = document.createElement('p');
      p.style.cssText = 'font-size:12px;overflow-wrap:anywhere';
      p.textContent = label + ': ' + JSON.stringify(value);
      body.append(p);
    }
    if (Array.isArray(r.checks))
      for (const raw of r.checks) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const item = document.createElement('details'),
          title = document.createElement('summary'),
          value = document.createElement('p');
        item.open = true;
        item.style.cssText = 'font-size:12px;overflow-wrap:anywhere';
        title.textContent = `${typeof raw.status === 'string' ? raw.status.toUpperCase() : 'UNKNOWN'} · ${typeof raw.code === 'string' ? raw.code : ''}`;
        value.textContent = `Observed: ${JSON.stringify(raw.observed)}. Required: ${JSON.stringify(raw.required)}. ${typeof raw.basis === 'string' ? raw.basis : ''}`;
        item.append(title, value);
        body.append(item);
      }
  };
  select.addEventListener('change', render);
  panel.append(title, select, body);
  parent.append(panel);
  render();
}
export function drawToolAssessment(
  c: CanvasRenderingContext2D,
  w: V7World,
  personal: string | null,
) {
  for (const a of w.actors.filter((a) => !personal || a.id === personal)) {
    const r = toolAssessmentResult(a);
    if (
      !r ||
      r.tick !== w.tick ||
      !w.events.some(
        (e) => e.actor === a.id && e.type === 'tool-suitability-assessed',
      )
    )
      continue;
    const tool = w.stacks.find((s) => s.id === r.itemId && s.owner === a.id);
    if (!tool) continue;
    c.save();
    c.translate(a.position.x, a.position.y);
    c.strokeStyle = '#d4b780';
    c.fillStyle = '#909b99';
    c.lineWidth = 0.025;
    c.beginPath();
    c.ellipse(0.34, -0.1, 0.1, 0.07, -0.25, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.font = '600 0.18px system-ui';
    c.textAlign = 'center';
    c.lineWidth = 0.04;
    c.strokeStyle = '#20332b';
    c.fillStyle = '#f9ead2';
    const text = `Inspecting carried ${tool.id} · tool only · round ${String(w.tick)}`;
    c.strokeText(text, 0, 2.4);
    c.fillText(text, 0, 2.4);
    c.restore();
  }
}
