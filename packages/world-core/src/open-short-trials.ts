import type { V7ActionContext, V7Data, V7Stack } from './continuous-types.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { openRemember } from './open-foundation.js';
import {
  shortEvidenceKey,
  shortGrass,
  shortLoads,
} from './open-short-material.js';
import { shortKey, shortRelease } from './open-short-work.js';
import type { ShortWork } from './open-short-work.js';
import { forestClimate } from './forest-climate.js';
import { shortCouponPass } from './open-short-predicates.js';
import { v7Clone } from './continuous-data.js';
export function shortTrial(c: V7ActionContext, j: ShortWork) {
  const w = c.world,
    parts = j.escrow.flatMap((id) => {
      const s = w.stacks.find((s) => s.id === id);
      return s ? [s] : [];
    }),
    role = j.mode === 'test-cover' ? 'cover' : 'binding',
    samples = parts.filter((s) => s.processing?.shortRole === role),
    loads = parts.filter((s) => s.processing?.shortRole === 'load'),
    force =
      loads.reduce((n, s) => n + foodUnitMass(w, s) * s.quantity, 0) *
      9.81 *
      (j.stage / 2);
  const dry = samples.reduce((n, s) => n + shortGrass(w, s).dry, 0),
    mass = samples.reduce((n, s) => n + shortGrass(w, s).mass, 0),
    wet = mass ? 1 - dry / mass : 0,
    breaking = 50 * dry * (1 - 0.5 * wet),
    slip = Math.max(0, (force - breaking / 2) / Math.max(0.00001, breaking)),
    broken = force > breaking,
    area = mass / 0.5,
    aperture = 0.15,
    sag = force / Math.max(0.001, 50 * breaking),
    passed = shortCouponPass(broken, slip, sag, area);
  for (const s of samples)
    s.processing = {
      ...s.processing,
      shortCoupon: {
        mode: j.mode,
        progress: j.stage,
        twist: j.stage / 2,
        interlace: j.mode === 'test-cover' ? j.stage / 2 : 0,
        force,
        breakingForce: breaking,
        slip,
        broken,
        area,
        aperture,
        sag,
        wetness: wet,
        source: s.origin,
      },
      shortIntegrity: broken ? 0.2 : Math.max(0.2, 1 - slip),
    };
  const data: V7Data = {
    operationId: shortKey(j.owner, j.id),
    inputs: parts.map((s) => ({
      id: s.id,
      origin: s.origin,
      quantity: s.quantity,
      role: s.processing?.shortRole ?? '',
    })),
    stage: j.stage,
    remainingWork: 2 - j.stage,
    paidEnergy: j.paid,
    force,
    slip,
    broken,
    area,
    aperture,
    sag,
    passed,
    wetness: wet,
    uncertainty: 0.2,
    geometryRevision: 'short-material-refuge@1',
    applicability:
      'Actual coupon, applied load and moisture; altered coupon is not pristine construction stock. A source trial does not certify any assembled frame.',
  };
  c.emit(
    'short-refuge-trial',
    'Paid contact used actual gravity loads and retained the deformed grass coupon.',
    data,
    j.target,
  );
  if (j.stage === 2) {
    if (w.state.shortTrialDiagnostics === 1)
      w.state[`short:history:${shortKey(j.owner, j.id)}`] = {
        operationId: shortKey(j.owner, j.id),
        owner: j.owner,
        evidence: v7Clone(data),
        event: w.events.at(-1)?.id ?? null,
        tick: w.tick,
        provenance: 'Original completed trial payload retained at execution.',
      };
    for (const s of samples)
      w.state[shortEvidenceKey(j.owner, role, s.origin)] = {
        passed,
        force,
        wetness: wet,
        uncertainty: 0.2,
        coupon: s.id,
        tick: w.tick,
      };
    openRemember(c, {
      key: `short:trial:${role}:${passed ? 'held' : 'limited'}`,
      subject: samples[0]?.origin ?? j.target,
      property: `bounded ${role} response`,
      value: data,
      method: 'two paid contacts with actual allocated masses',
      condition:
        'New outcome only; relabeling or repeating a known coupon does not renew feedback.',
      verified: true,
    });
    shortRelease(
      w,
      j,
      'completed',
      'Coupon trial finished; actual weights, pole and altered grass remain at the trial location.',
    );
  }
}
export function shortProof(c: V7ActionContext, j: ShortWork) {
  const proofStage = j.mode === 'repair' ? j.stage - 2 : j.stage;
  const w = c.world,
    o = w.objects.find((o) => o.id === j.structure);
  if (!o) throw new Error('Actual structure absent.');
  const loads = j.escrow.flatMap((id) => {
      const s = w.stacks.find((s) => s.id === id);
      return s ? [s] : [];
    }),
    load =
      loads.reduce((n, s) => n + foodUnitMass(w, s) * s.quantity, 0) *
      (proofStage / 2),
    weather = forestClimate(w, o.spatial);
  o.data.wind = weather.wind ?? 0;
  const result = shortLoads(w, o, load),
    data: V7Data = {
      ...result,
      stressRatio: Number.isFinite(result.stressRatio)
        ? result.stressRatio
        : null,
      bucklingRatio: Number.isFinite(result.bucklingRatio)
        ? result.bucklingRatio
        : null,
      sag: Number.isFinite(result.sag) ? result.sag : null,
      operationId: shortKey(j.owner, j.id),
      stage: j.stage,
      remainingWork: j.total - j.stage,
      paidEnergy: j.paid,
      actualLoads: loads.map((s, i) => ({
        item: s.id,
        quantity: s.quantity,
        mass: foodUnitMass(w, s) * s.quantity,
        point:
          ['ridge-midpoint', 'first-end-apex', 'second-end-apex'][i % 3] ??
          'ridge-midpoint',
      })),
      geometryRevision: 'short-material-refuge@1',
    };
  o.data.sag = Number.isFinite(result.sag) ? result.sag : 0;
  o.data.slip = result.slipping;
  if (result.stressRatio > 1 || result.bucklingRatio > 1)
    o.data.frameDamaged = true;
  if (!result.sound) {
    o.data.proven = false;
    o.data.collapsed = true;
    o.data.integrity = Math.max(0, Number(o.data.integrity) - 0.1);
    o.visual.state = 'collapsed';
  }
  c.emit(
    'short-refuge-trial',
    'Actual two-stage proof loading assessed bending, buckling, joints, spread and deformation.',
    data,
    o.id,
  );
  if (proofStage === 2) {
    o.data.proven = result.sound;
    o.data.proof = {
      ...data,
      wind: weather.wind ?? 0,
      wetness: o.data.wetness ?? 0,
      tick: w.tick,
    };
    o.visual.state = result.sound ? 'proven' : 'collapsed';
    openRemember(c, {
      key: `short:proof:${result.sound ? 'held' : 'failed'}`,
      subject: o.id,
      property: 'actual assembly response',
      value: data,
      method: 'two paid actual load stages',
      condition:
        'Exact structure and bounded moisture/loading envelope; no material-batch certificate.',
      verified: true,
    });
    shortRelease(
      w,
      j,
      'completed',
      'Proof complete; retained actual loads released once at their physical location.',
    );
  }
}
export function shortTestRows(
  rows: { s: V7Stack; quantity: number; role: string }[],
  mode: string,
) {
  const role = mode === 'test-cover' ? 'cover' : 'binding';
  if (
    rows.filter((r) => r.role === role).length !== 1 ||
    !rows.some((r) => r.role === 'load') ||
    rows.filter((r) => r.role === 'pole').length !== 1 ||
    rows.some((r) => ![role, 'load', 'pole'].includes(r.role))
  )
    throw new Error(
      'Trial requires one measured pole fixture, one actual grass allocation and separate real loads.',
    );
}
