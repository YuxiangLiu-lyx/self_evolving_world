import type { V7ActionContext, V7Data, V7World } from './continuous-types.js';
import { v7Clone, v7String } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { shortCouponChecks } from './open-short-predicates.js';
const object = (v: unknown): V7Data | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : null;
/** Link only this actor's retained evidence; absent history remains absent, never backfilled from current physics. */
export function shortLinkDiagnostics(w: V7World): void {
  for (const actor of w.actors)
    for (const [key, value] of Object.entries(w.state)) {
      const job = object(value);
      if (
        !key.startsWith(`short:work:${actor.id}:`) ||
        !job ||
        !['test-cover', 'test-joint'].includes(
          typeof job.mode === 'string' ? job.mode : '',
        )
      )
        continue;
      const fact = Object.values(actor.memory.knowledge ?? {}).find(
        (k) => object(k.value)?.operationId === key,
      );
      w.state[`short:history:${key}`] = {
        operationId: key,
        owner: actor.id,
        evidence: fact ? v7Clone(fact.value) : null,
        event: fact?.evidence ?? null,
        tick: fact?.tick ?? null,
        provenance:
          'Linked retained personal trial evidence. No physical experiment, certificate or missing operand is supplied.',
      };
    }
}
export function shortDiagnose(c: V7ActionContext) {
  const { world: w, actor: a, action } = c;
  if (
    !a.mastered.includes('short-refuge-trial-diagnostics') ||
    !a.mastered.includes('short-material-refuge')
  )
    throw new Error(
      'Personal study of both the original capability and trial diagnostics is required.',
    );
  const key = v7String(
      action.args.project,
      'exact personal trial operation ID',
    ),
    job = object(w.state[key]);
  if (
    !key.startsWith(`short:work:${a.id}:`) ||
    !job ||
    job.owner !== a.id ||
    !['test-cover', 'test-joint'].includes(
      typeof job.mode === 'string' ? job.mode : '',
    ) ||
    job.status !== 'completed'
  )
    throw new Error(
      'An exact own completed cover or joint trial operation is required.',
    );
  if (
    !Array.isArray(action.args.components) ||
    action.args.components.length ||
    ['x', 'y', 'angle', 'width', 'length', 'height'].some(
      (k) => action.args[k] !== 0,
    )
  )
    throw new Error(
      'Diagnostic components must be empty and all coordinates and dimensions zero.',
    );
  if (typeof action.args.target !== 'string')
    throw new Error('Optional coupon reference must be a string.');
  const id = action.args.target,
    coupon = id
      ? w.stacks.find(
          (s) =>
            s.id === id && s.owner === a.id && !s.reservedFor && s.quantity > 0,
        )
      : null;
  if (
    id &&
    (!coupon || object(coupon.processing?.shortInput)?.operation !== key)
  )
    throw new Error(
      'Optional coupon must be owned, unreserved and trace to this exact personal trial.',
    );
  if (action.args.mode === 'cancel') {
    c.emit(
      'short-refuge-diagnostic-stopped',
      'Cancelled the read without payment, physical change or diagnostic output.',
      { operationId: key, paidEnergy: 0, remainingWork: 0 },
    );
    return { complete: true, remaining: 0, writes: [] };
  }
  if (action.args.mode !== 'diagnose-trial')
    throw new Error('Unknown trial diagnostic mode.');
  if (a.vitals.energy < 0.2)
    return { complete: false, remaining: 1, writes: [] };
  const linked = object(w.state[`short:history:${key}`]),
    record = object(linked?.evidence) ?? {},
    revision =
      typeof record.geometryRevision === 'string'
        ? record.geometryRevision
        : 'unknown',
    predicates = shortCouponChecks(record, revision),
    data: V7Data = {
      operationId: key,
      diagnosticRevision: 'short-refuge-trial-diagnostics@1',
      evaluatorRevision: revision,
      originalEvent: linked?.event ?? null,
      originalTick: linked?.tick ?? null,
      originalInputs: record.inputs ?? null,
      historicalCoupons: Array.isArray(record.inputs)
        ? record.inputs.flatMap((input) => {
            const row = object(input);
            return row &&
              ['cover', 'binding'].includes(
                typeof row.role === 'string' ? row.role : '',
              ) &&
              typeof row.id === 'string'
              ? [row.id]
              : [];
          })
        : [],
      originalPaidEnergy: job.paid ?? null,
      originalOutcome: record.passed ?? null,
      predicates,
      coupon: coupon?.id ?? null,
      currentCoupon: coupon
        ? {
            physical: coupon.physical ?? null,
            integrity: coupon.processing?.shortIntegrity ?? null,
            note: 'Current condition may differ from the historical test; it is not used to recalculate acceptance.',
          }
        : null,
      recordedOperands: {
        force: record.force ?? null,
        wetness: record.wetness ?? null,
        area: record.area ?? null,
        aperture: record.aperture ?? null,
      },
      assumptions:
        'Evaluator v1: breaking force = 50 * dry grass mass * (1 - 0.5 * wetness); slip = max(0,(force - breakingForce/2)/max(0.00001,breakingForce)); area = grass mass/0.5; sag = force/max(0.001,50*breakingForce). Aperture 0.15 is a model assumption, not an acceptance predicate. These rules explain performed evidence, not an alternate configuration.',
      parameterBounds: {
        quantityTenths:
          'integer >= 1; actual owned quantity bounds every allocation',
        components:
          'one individually measured whole pole, one grass allocation with cover/binding role, and one or more distinct actual load allocations',
        dimensions:
          'trial width/length/height zero; layout x/y/angle must satisfy actual reach and placement',
        consequence:
          'Changing actual allocated mass or wetness changes the physical trial; a read cannot establish its outcome.',
      },
      missingEvidence: predicates
        .filter((p) => p.result === 'unknown')
        .map((p) => p.missing ?? ''),
      interpretation:
        'Read-only historical explanation. No coupon alteration, new experiment, certificate, hypothetical pass or wellbeing award.',
      paidEnergy: 0.2,
      remainingWork: 0,
    };
  v7Spend(a, 0.2);
  w.state[`short:diagnostic:${a.id}:${key}`] = v7Clone(data);
  c.emit(
    'short-refuge-trial-diagnosed',
    'Explained the original trial acceptance predicates; the coupon and its certificate are unchanged.',
    data,
    coupon?.id,
  );
  return { complete: true, remaining: 0, writes: [] };
}
