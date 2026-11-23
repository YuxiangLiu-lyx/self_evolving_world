import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Object,
  V7Package,
  V7Spatial,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Id, v7Json, v7Number } from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Obstacles,
  v7SegmentClear,
  v7ShapesOverlap,
  v7Visible,
} from './continuous-geometry.js';
import { openConditions } from './open-physical.js';
import {
  collectiveJobs,
  workCreate,
  workFind,
  workPay,
  workResult,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
function residuePackage(
  ID: string,
  SOURCE: string,
  x: number,
  y: number,
  actor?: string,
): V7Package {
  const REV = ID + '@1',
    HANDLER = actor
      ? `long.residue-transfer-${actor}`
      : 'long.residue-transfer';
  function units(value: unknown): number {
    const n = v7Number(value, 'represented mass', 0),
      q = Math.round(n * 100);
    if (Math.abs(n * 100 - q) > 1e-7)
      throw new Error(
        'Unsupported fractional surface mass; no rounding or transfer.',
      );
    return q;
  }
  function entries(o: V7Object): V7Data[] {
    return Array.isArray(o.data.residues)
      ? o.data.residues.map((v) => {
          if (!v || typeof v !== 'object' || Array.isArray(v))
            throw new Error('Invalid actual residue entry.');
          return v;
        })
      : [];
  }
  function sync(a: V7Actor, j: CollectiveWork) {
    if (['active', 'paused'].includes(j.status))
      a.extensionState['long:work:residue'] = v7Json(j);
    else {
      delete a.extensionState['long:work:residue'];
      a.extensionState['long:last-residue'] = v7Json(j);
    }
  }
  function close(w: V7World, a: V7Actor, j: CollectiveWork, status: string) {
    if (status === 'cancelled')
      workStop(
        w,
        a,
        j,
        'Committed residue remains; only work locks released.',
        false,
      );
    else {
      j.status = 'completed';
      j.remainingWork = 0;
    }
    j.outcome = status;
    for (const o of w.objects)
      if (o.data.activeWork === j.id) {
        o.data.activeWork = null;
        if (o.revision === REV) o.spatial.reserved = false;
      }
    sync(a, j);
  }
  function source(c: V7ActionContext, j?: CollectiveWork) {
    const id = c.action.args.sourceId ?? j?.sourceId;
    const o = c.world.objects.find(
      (o) =>
        o.id === id &&
        o.id === SOURCE &&
        o.revision === 'small-soil-patch-preparation@1',
    );
    if (
      !o ||
      o.spatial.x !== x ||
      o.spatial.y !== y ||
      (actor !== undefined && c.actor.id !== actor) ||
      (actor === 'moss' &&
        (o.data.source !== 'terrain-footprint:14:12.5:0.2' ||
          entries(o).some((e) => e.source !== o.data.source))) ||
      o.spatial.shape.kind !== 'circle' ||
      o.spatial.shape.radius !== 0.2 ||
      o.createdBy !== c.actor.id
    )
      throw new Error(
        'This version requires the exact created surface and its responsible learned actor.',
      );
    return o;
  }
  function reach(c: V7ActionContext, s: V7Object, p: V7Spatial) {
    const distance = v7Distance(s.spatial, p);
    if (
      distance <= 0.3 + 1e-8 ||
      distance > 0.5 + 1e-8 ||
      !v7Inside(c.world, p, 0.1) ||
      v7Distance(c.actor.position, s.spatial) > 0.65 + 1e-8 ||
      v7Distance(c.actor.position, p) > 0.65 + 1e-8 ||
      !v7Visible(c.world, c.actor.position, s.spatial) ||
      !v7Visible(c.world, c.actor.position, p)
    )
      throw new Error(
        'Source and receiver must be visible within 0.65; receiver radius0.1 must be outside the source with center separation (0.3,0.5].',
      );
  }
  function routes(c: V7ActionContext, s: V7Object, p: V7Spatial, d?: V7Object) {
    const obstacles = [
      ...v7Obstacles(c.world),
      ...c.world.objects
        .filter((o) => o.id !== s.id && o.id !== d?.id)
        .map((o) => ({ ...o.spatial, solid: true })),
      ...c.world.actors
        .filter((a) => a.vitals.health > 0)
        .map((a) => ({
          ...a.position,
          shape: { kind: 'circle' as const, radius: a.radius },
          angle: 0,
          solid: true,
          interaction: 0,
          entrances: [],
        })),
    ].filter((o) => o !== s.spatial && o !== d?.spatial);
    return entries(s).map((e, index) => {
      const from = {
          x: v7Number(e.x, 'residue x'),
          y: v7Number(e.y, 'residue y'),
        },
        radius = v7Number(e.radius, 'residue extent', 0),
        to = { x: p.x, y: p.y };
      const clear =
        !obstacles.some((obstacle) => v7ShapesOverlap(p, obstacle)) &&
        radius <= 0.03 &&
        v7Distance(c.actor.position, from) <= 0.65 &&
        v7SegmentClear(from, to, radius, obstacles, c.work) &&
        Array.from({ length: 9 }, (_, i) => ({
          x: from.x + ((to.x - from.x) * i) / 8,
          y: from.y + ((to.y - from.y) * i) / 8,
        })).every((point) => {
          const q = openConditions(c.world, point);
          return (
            !['~', '=', ','].includes(q.ground) &&
            q.waterlogging <= 0.1 &&
            v7Visible(c.world, c.actor.position, point)
          );
        });
      return { index, from, to, radius, units: units(e.mass), clear };
    });
  }
  function execute(c: V7ActionContext) {
    const mode = c.action.args.mode;
    let j = workFind(c);
    if (
      actor &&
      (mode === 'resume' || mode === 'cancel') &&
      (!j || c.action.args.processId !== j.id)
    )
      throw new Error(
        'Resume or cancel requires the exact personal processId.',
      );
    if (mode === 'cancel') {
      if (!j) throw new Error('No unfinished personal residue work.');
      close(c.world, c.actor, j, 'cancelled');
      c.emit(
        'residue-transfer-cancelled',
        'Actual deposits retained; work locks released.',
        { processId: j.id, movedMass: Number(j.movedUnits) / 100 },
        j.target,
      );
      return workResult(j);
    }
    const s = source(c, j);
    let d = j ? c.world.objects.find((o) => o.id === j?.target) : undefined;
    const p: V7Spatial = d?.spatial ?? {
      x: v7Number(c.action.args.destinationX, 'destinationX'),
      y: v7Number(c.action.args.destinationY, 'destinationY'),
      angle: 0,
      shape: { kind: 'circle', radius: 0.1 },
      solid: false,
      reserved: true,
      interaction: 0.65,
      entrances: [],
    };
    reach(c, s, p);
    if (
      j &&
      mode === 'start' &&
      (c.action.args.sourceId !== j.sourceId ||
        c.action.args.destinationX !== p.x ||
        c.action.args.destinationY !== p.y)
    )
      throw new Error(
        'Resume the exact bound source and receiver; paid work cannot be substituted.',
      );
    if (s.data.activeWork && s.data.activeWork !== j?.id)
      throw new Error('Source has conflicting actual work.');
    if (!j) {
      if (mode !== 'start') throw new Error('No unfinished residue work.');
      d = c.world.objects.find(
        (o) => o.revision === REV && v7Distance(o.spatial, p) < 1e-8,
      );
      if (d?.data.activeWork)
        throw new Error('Receiver has conflicting actual work.');
    }
    if (d?.data.activeWork && d.data.activeWork !== j?.id)
      throw new Error('Receiver has conflicting actual work.');
    const rs = routes(c, s, p, d),
      remaining = rs.reduce((n, r) => n + r.units, 0);
    if (remaining !== units(s.data.residueMass))
      throw new Error('Surface mass accounting is inconsistent; no transfer.');
    if (!j) {
      if (c.actor.vitals.energy < 0.5)
        throw new Error('Fresh examination requires0.5 energy.');
      j = workCreate(c, 'transfer', 3);
      j.sourceId = s.id;
      j.sourceRevision = s.revision;
      j.sourceEntries = v7Json(rs);
      j.x = p.x;
      j.y = p.y;
      j.movedUnits = 0;
      j.allowance = Math.min(4, remaining);
      j.examinedAt = c.world.tick;
      workPay(c, j, 0.5);
      c.emit(
        'residue-route-examined',
        'A paid source/receiver/short-route examination completed; no material moved.',
        {
          processId: j.id,
          sourceId: s.id,
          receiver: { x: p.x, y: p.y, radius: 0.1 },
          feasible:
            remaining > 0 &&
            rs.filter((r) => r.units > 0).every((r) => r.clear),
          sourceMass: remaining / 100,
        },
        s.id,
      );
      if (!remaining || rs.some((r) => r.units > 0 && !r.clear)) {
        close(c.world, c.actor, j, 'blocked');
        return workResult(j);
      }
      if (!d) {
        d = {
          id: v7Id(c.world, 'residue-deposit'),
          kind: 'surface-residue-deposit',
          name: 'Loose non-food residue deposit',
          spatial: p,
          visual: {
            component: 'surface-residue',
            color: '#574f39',
            accent: '#b8a17b',
            label: 'Residue receiver: no deposit yet',
            state: 'examined',
          },
          data: { deposits: [], mass: 0, source: s.id, activeWork: j.id },
          createdBy: c.actor.id,
          createdAt: c.world.tick,
          revision: REV,
        };
        c.world.objects.push(d);
      }
      j.target = d.id;
      s.data.activeWork = j.id;
      d.data.activeWork = j.id;
      d.spatial.reserved = true;
      sync(c.actor, j);
      return workResult(j);
    }
    if (!d || !['active', 'paused'].includes(j.status))
      throw new Error('The exact residue job is already settled.');
    if (rs.some((r) => r.units > 0 && !r.clear)) {
      j.status = 'paused';
      j.reason = 'Actual route no longer clear; unpaid work retained.';
      sync(c.actor, j);
      c.emit(
        'residue-transfer-blocked',
        'Route invalidated before work; no transfer or energy charge.',
        { processId: j.id },
        s.id,
      );
      return workResult(j);
    }
    if (!remaining) {
      close(c.world, c.actor, j, 'partial');
      return workResult(j);
    }
    if (!workPay(c, j, 1)) {
      sync(c.actor, j);
      return workResult(j);
    }
    let allowance = Math.min(2, Number(j.allowance) - Number(j.movedUnits)),
      moved = 0;
    const es = entries(s),
      deposits = Array.isArray(d.data.deposits) ? d.data.deposits : [];
    for (const r of rs) {
      const take = Math.min(allowance, r.units);
      if (!take) continue;
      const e = es[r.index];
      if (!e) throw new Error('Missing exact residue entry.');
      e.mass = (r.units - take) / 100;
      const deposit = {
        id: v7Id(c.world, 'debris'),
        sourceId: s.id,
        sourceEntry: r.index,
        source: e.source ?? null,
        mass: take / 100,
        x: p.x,
        y: p.y,
        radius: r.radius,
        edible: false,
        harvestable: false,
        route: { from: r.from, to: r.to },
        tick: c.world.tick,
      };
      deposits.push(deposit);
      allowance -= take;
      moved += take;
    }
    s.data.residues = es;
    s.data.residueMass = (remaining - moved) / 100;
    d.data.deposits = deposits;
    d.data.mass = (units(d.data.mass) + moved) / 100;
    j.movedUnits = Number(j.movedUnits) + moved;
    d.visual.state = 'deposited';
    d.visual.label = 'Actual non-food residue';
    s.visual.label = 'Surface: assessment pending';
    s.data.outcome = 'transfer-unassessed';
    c.emit(
      'residue-displaced',
      'Actual residue moved atomically along checked short contact routes; no inventory or planting benefit.',
      {
        processId: j.id,
        sourceId: s.id,
        destinationId: d.id,
        movedMass: moved / 100,
        remainingSource: s.data.residueMass,
        destinationMass: d.data.mass,
        paidEnergy: j.paidEnergy,
        rootCompatible: null,
      },
      d.id,
    );
    if (
      j.remainingWork === 0 ||
      j.movedUnits >= Number(j.allowance) ||
      remaining === moved
    ) {
      close(c.world, c.actor, j, remaining === moved ? 'completed' : 'partial');
      c.emit(
        'residue-transfer-completed',
        'Bounded transfer ended; planting compatibility requires separate assessment.',
        {
          processId: j.id,
          movedMass: j.movedUnits / 100,
          remainingSource: s.data.residueMass,
          destinationId: d.id,
          rootCompatible: null,
          paidEnergy: j.paidEnergy,
        },
        d.id,
      );
    }
    sync(c.actor, j);
    return workResult(j);
  }
  return {
    id: ID,
    version: 1,
    scope: 'long-ex13',
    dependencies: [
      'small-soil-patch-preparation@1',
      ...(actor ? ['bounded-surface-residue-transfer@1'] : []),
      ...(actor === 'moss' ? ['sol-surface-residue-transfer@1'] : []),
    ],
    description:
      'Source-bound conserved hand displacement along verified short ground-contact routes.',
    reuse: {
      experiment: actor
        ? 'ex13 existing residue transfer implementation'
        : 'ex13 physical surface; ex12 generic work',
      source:
        'long-surface-work.ts; collective-work.ts; continuous-geometry.ts; open-physical.ts',
      description: actor
        ? 'Reuses long.residue-transfer and functional equivalence surface-residue:checked-short-external-transfer:1 unchanged; only the separately learned actor/source applicability binding is new. This is not another material-transfer invention.'
        : 'Reuses the actual source material, locks, paid work and spatial predicates; adds external deposits and route verification, not free material or planting eligibility.',
    },
    abilities: [
      {
        id: ID,
        name: actor
          ? `${actor === 'moss' ? 'Moss' : 'Sol'} bounded surface residue transfer`
          : 'Bounded surface residue transfer',
        function:
          'Examine and manually displace actual prepared-surface residue to an explicitly selected adjacent receiver.',
        equivalence:
          'surface-residue:checked-short-external-transfer:1' +
          (actor ? ':' + SOURCE : ''),
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: ['start', 'resume', 'cancel'] },
            sourceId: { type: 'string' },
            destinationX: { type: 'number' },
            destinationY: { type: 'number' },
            processId: { type: 'string' },
          }),
          required: ['mode'],
        },
        references: { sourceId: 'optional-exact-visible' },
        prerequisites: [],
        learning: 1,
        learningEnergy: 0.2,
        costs: `Study one round/0.2 energy. Start(sourceId,destinationX,destinationY) examines one round/0.5 energy, then at most two1-energy rounds moving0.02 each, up to actual0.04. Version bound to original ${SOURCE} and its creator; both centers and moved portions within0.65 of the actor. Receiver radius0.1, center separation from source greater than0.3 and at most0.5, entirely in bounds. Resume/cancel exact processId; no material/tool/container supplied.`,
        effects:
          'Exact hundredth mass accounting and source-entry provenance. Each atomic transfer requires a swept-radius clear visible ground route excluding people, plants, obstacles and unrelated reservations. Invalid references/range cost nothing; performed blocked examination costs0.5. Changed route pauses before charges. Deposits persist as nonfood, nonharvestable matter, never inventory. Cancel/death release only locks, preserving all movement and spent effort. No unattended work, restoration, reward, fertility, food, moisture or planting certification. Repeated starts inspect live remaining mass, never reset it.',
        handler: HANDLER,
        revision: REV,
        authored: false,
        practiceEvidence: 'residue-qualified-practice',
        execution: {
          duration: null,
          interruption: 'cancel',
          progress:
            'Exact source revision, entry routes, receiver, work ID, allowance, paid progress and deposits persist; resume never resets allowance.',
        },
      },
    ],
    handlers: { [HANDLER]: execute },
    processes: {},
    resources: [],
    satisfaction: [],
    visualComponents: ['surface-residue'],
    events: [
      'residue-route-examined',
      'residue-displaced',
      'residue-transfer-blocked',
      'residue-transfer-cancelled',
      'residue-transfer-completed',
      'residue-qualified-practice',
    ],
    afterEnvironment(w) {
      for (const j of collectiveJobs(w, ID).filter((j) =>
        ['active', 'paused'].includes(j.status),
      )) {
        const a = w.actors.find((a) => a.id === j.owner);
        if (a) {
          if (j.lastPaid < w.tick) j.status = 'paused';
          sync(a, j);
        }
      }
    },
    onDeath(w, a) {
      for (const j of collectiveJobs(w, ID).filter(
        (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
      ))
        close(w, a, j, 'cancelled');
    },
  };
}
export const LONG_RESIDUE = residuePackage(
  'bounded-surface-residue-transfer',
  'surface-21-lin-113',
  9.25,
  12.9,
);
export const LONG_SOL_RESIDUE = residuePackage(
  'sol-surface-residue-transfer',
  'surface-34-sol-201',
  13,
  25,
  'sol',
);

export const LONG_MOSS_RESIDUE = residuePackage(
  'moss-surface-residue-transfer',
  'surface-38-moss-234',
  14,
  12.5,
  'moss',
);
