import type { V7Data } from '@self-evolving-world/world-core';
/** Shared read-only evidence view; text nodes preserve untrusted actor identifiers safely. */
export function renderTrialDiagnostic(
  parent: HTMLElement,
  data?: V7Data,
): void {
  parent.replaceChildren();
  parent.hidden = !data;
  if (!data) return;
  parent.className = 'trial-diagnostic';
  const label = (v: unknown): string => (typeof v === 'string' ? v : 'unknown');
  const paragraph = (text: string) => {
    const p = document.createElement('p');
    p.textContent = text;
    parent.append(p);
  };
  paragraph(
    `Historical trial: ${label(data.operationId)} · ${label(data.evaluatorRevision)}`,
  );
  paragraph(
    `Coupon: ${typeof data.coupon === 'string' ? data.coupon : 'record only'} · read cost ${String(Number(data.paidEnergy))} energy. Original outcome: ${data.originalOutcome === true ? 'passed' : data.originalOutcome === false ? 'failed' : 'unknown'}.`,
  );
  if (Array.isArray(data.historicalCoupons) && data.historicalCoupons.length)
    paragraph(
      `Original coupon: ${data.historicalCoupons.map(label).join(', ')}`,
    );
  const table = document.createElement('table'),
    caption = document.createElement('caption');
  caption.textContent = 'Original acceptance predicates';
  table.append(caption);
  const head = document.createElement('tr');
  for (const title of ['Check / unit', 'Recorded', 'Limit', 'Result']) {
    const th = document.createElement('th');
    th.textContent = title;
    head.append(th);
  }
  table.append(head);
  const value = (v: unknown) =>
    typeof v === 'number'
      ? Number(v.toPrecision(5)).toString()
      : typeof v === 'boolean'
        ? String(v)
        : 'unknown';
  for (const p of Array.isArray(data.predicates) ? data.predicates : []) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const row = document.createElement('tr');
    for (const cell of [
      `${label(p.id)} / ${p.units === 'dimensionless' ? 'unitless' : label(p.units)}`,
      value(p.value),
      `${label(p.comparison)} ${value(p.threshold)}`,
      label(p.result),
    ]) {
      const td = document.createElement('td');
      td.textContent = cell;
      row.append(td);
    }
    table.append(row);
  }
  parent.append(table);
  paragraph(
    'Recorded responses are model-derived from a performed trial; thresholds are model assumptions. Current coupon condition is separate. No new trial, altered coupon, certificate or reward.',
  );
  if (Array.isArray(data.missingEvidence) && data.missingEvidence.length)
    paragraph(
      `Missing historical evidence: ${data.missingEvidence.map(label).join(' ')}`,
    );
}
