import { shortInspect, shortExposure } from './open-short-observe.js';
import { shortDiagnose } from './open-short-diagnosis.js';
import type { V7ActionContext, V7Object, V7Data } from './continuous-types.js';
import { v7String, v7Id } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { v7ShapeDistance } from './continuous-geometry.js';

import {
  shortInputs,
  shortDesign,
  shortStructure,
  shortParts,
} from './open-short-material.js';
import {
  shortWork,
  shortActive,
  shortStart,
  shortResume,
  shortRelease,
  shortKey,
} from './open-short-work.js';
import { shortTrial, shortProof, shortTestRows } from './open-short-trials.js';
import {
  shortCreate,
  shortAssemble,
  shortService,
  shortRepairInputs,
} from './open-short-assembly.js';
import { shortPlacement, shortDimensions } from './open-short-geometry.js';

function dimensionsUnused(c: V7ActionContext) {
  if (['width', 'length', 'height'].some((k) => c.action.args[k] !== 0))
    throw new Error('Unused dimensions must be zero.');
}
function targetUnused(c: V7ActionContext) {
  if (c.action.args.target !== '')
    throw new Error('Unused target must be empty.');
}
function rowsUnused(c: V7ActionContext) {
  if (
    !Array.isArray(c.action.args.components) ||
    c.action.args.components.length
  )
    throw new Error('Unused component allocations must be empty.');
}
export function shortExecute(c: V7ActionContext) {
  const { world: w, actor: a } = c,
    mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'diagnose-trial') return shortDiagnose(c);
  if (!['assemble', 'assess'].includes(mode)) dimensionsUnused(c);
  if (
    ['inspect', 'measure-exposure', 'resume', 'cancel', 'dismantle'].includes(
      mode,
    )
  )
    rowsUnused(c);
  if (
    [
      'assemble',
      'assess',
      'test-cover',
      'test-joint',
      'resume',
      'cancel',
    ].includes(mode)
  )
    targetUnused(c);
  if (mode === 'inspect') return shortInspect(c);
  if (mode === 'measure-exposure') return shortExposure(c);
  if (mode === 'assess') {
    const plan = shortDesign(c, shortInputs(c));
    v7Spend(a, 0.2);
    c.emit(
      'short-refuge-assessed',
      'Proposed geometry only; assessment creates no materials, structure, load certificate or reward.',
      {
        ...plan,
        shape: plan.shape as unknown as V7Data,
        operationId: `short:assessment:${a.id}:${String(w.tick)}`,
        remainingWork: 0,
        paidEnergy: 0.2,
        geometryRevision: 'short-material-refuge@1',
      },
      undefined,
    );
    return { complete: true, writes: [] };
  }
  if (mode === 'cancel') {
    const j = shortWork(w, a, v7String(c.action.args.project, 'project'));
    if (['completed', 'stopped'].includes(j.status))
      throw new Error('Terminal work cannot be cancelled or refunded.');
    shortRelease(
      w,
      j,
      'stopped',
      'Explicit cancellation; incorporated material and passive weathering persist.',
    );
    return { complete: true, writes: [] };
  }
  let j = shortActive(w, a);
  if (mode === 'resume' && !j) j = shortResume(c);
  if (!j) {
    const rows = shortInputs(c),
      total = ['assemble', 'repair'].includes(mode) ? 4 : 2,
      cost = mode === 'assemble' ? 0.75 : 0.5;
    let o: V7Object | null = null;
    if (mode === 'assemble') o = shortCreate(c, rows);
    else if (['test-cover', 'test-joint'].includes(mode))
      shortTestRows(rows, mode);
    else if (['proof-test', 'repair', 'dismantle'].includes(mode)) {
      o = shortStructure(w, a, v7String(c.action.args.target, 'structure'));
      if (v7ShapeDistance(a.position, o.spatial) > 0.65)
        throw new Error('Actual structure is beyond work reach.');
      if (
        Object.values(w.state).some(
          (r) =>
            r &&
            typeof r === 'object' &&
            !Array.isArray(r) &&
            r.structure === o?.id &&
            ['active', 'paused'].includes(
              typeof r.status === 'string' ? r.status : '',
            ),
        )
      )
        throw new Error(
          'Another unfinished controller reserves this structure.',
        );
      if (
        mode === 'proof-test' &&
        (Number(o.data.stage) !== 4 ||
          !rows.length ||
          rows.some((r) => r.role !== 'load'))
      )
        throw new Error(
          'Proof needs a complete real assembly and explicit distinct actual load allocations.',
        );
      if (mode === 'repair') shortRepairInputs(o, rows);
    } else throw new Error('Unknown short-refuge mode.');
    if (a.vitals.energy < cost)
      return { complete: false, remaining: total, writes: [] };
    j = shortStart(c, rows, o, total);
    if (mode === 'assemble' && o) {
      w.objects.push(o);
      w.processes.push({
        id: v7Id(w, 'process'),
        handler: 'open.short-weather',
        object: o.id,
        owner: a.id,
        next: w.tick + 1,
        revision: 'short-material-refuge@1',
        data: {},
      });
    }
  }
  const o = w.objects.find((o) => o.id === j.structure),
    cost = j.mode === 'assemble' ? 0.75 : 0.5;
  if (j.structure && !o)
    throw new Error('Exact persistent work structure has disappeared.');
  if (
    j.escrow.some(
      (id) =>
        !w.stacks.some(
          (s) =>
            s.id === id &&
            s.owner === a.id &&
            s.reservedFor === shortKey(j.owner, j.id),
        ),
    )
  )
    throw new Error('Exact surviving allocated components are unavailable.');
  const reach = o
    ? v7ShapeDistance(a.position, o.spatial)
    : Math.hypot(a.position.x - j.x, a.position.y - j.y);
  if (a.vitals.energy < cost || reach > 0.65) {
    c.emit(
      'short-refuge-progress',
      'Unchanged remaining work: actual access or energy is unavailable.',
      {
        operationId: shortKey(j.owner, j.id),
        remainingWork: j.total - j.stage,
        paidEnergy: j.paid,
      },
      o?.id,
    );
    return { complete: false, remaining: j.total - j.stage, writes: [] };
  }
  if (o && j.mode === 'assemble')
    shortPlacement(w, a, o.spatial, shortDimensions(o), o.id);
  v7Spend(a, cost);
  j.stage++;
  j.paid += cost;
  if (j.mode === 'assemble') shortAssemble(c, j);
  else if (['test-cover', 'test-joint'].includes(j.mode)) shortTrial(c, j);
  else if (j.mode === 'proof-test' || (j.mode === 'repair' && j.stage > 2))
    shortProof(c, j);
  else shortService(c, j);
  c.emit(
    'short-refuge-progress',
    'Performed only this paid remaining stage on the same actual components.',
    {
      operationId: shortKey(j.owner, j.id),
      mode: j.mode,
      stage: j.stage,
      remainingWork: j.total - j.stage,
      paidEnergy: j.paid,
      escrow: j.escrow,
      incorporated: o
        ? shortParts(o).map((s) => ({
            id: s.id,
            origin: s.origin,
            quantity: s.quantity,
          }))
        : [],
      geometryRevision: 'short-material-refuge@1',
    },
    o?.id,
  );
  return {
    complete: j.stage === j.total,
    remaining: j.total - j.stage,
    writes: [...j.escrow, ...(o ? [o.id] : [])],
  };
}
