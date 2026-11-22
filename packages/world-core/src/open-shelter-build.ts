import { refugeLoads } from './open-shelter-loads.js';
import type { V7ActionContext, V7Object, V7Data } from './continuous-types.js';
import { v7Id, v7Number } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { v7ShapeDistance } from './continuous-geometry.js';
import { refugeInputs, refugeCapacity } from './open-shelter-material.js';
import {
  refugeShape,
  refugePlacement,
  refugePoles,
} from './open-shelter-geometry.js';
import {
  refugeActive,
  refugeCreate,
  refugeReserve,
  refugeInstall,
  refugeStop,
} from './open-shelter-work.js';
export function refugeBuild(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  let j = refugeActive(w, a);
  if (!j) {
    const inputs = refugeInputs(c),
      sum = (resource: string) =>
        inputs
          .filter((r) => r.s.resource === resource)
          .reduce((n, r) => n + r.q, 0);
    if (sum('branch') < 6 || sum('reed') < 6 || sum('vine') < 2)
      throw new Error(
        'Minimum real allocation: 6 branch, 6 reed, 2 vine; capacity and geometry must also pass.',
      );
    if (
      inputs.some(
        (r) => r.material.intact !== true || !refugeCapacity(w, a.id, r.s),
      )
    )
      throw new Error(
        'Personally tested intact source batches are required; altered test fragments are not poles.',
      );
    const branches = inputs.filter((r) => r.s.resource === 'branch');
    if (
      branches.reduce(
        (n, r) => n + (Number(r.material.length) >= 1.8 ? Math.floor(r.q) : 0),
        0,
      ) < 1 ||
      branches.reduce(
        (n, r) => n + (Number(r.material.length) >= 1.2 ? Math.floor(r.q) : 0),
        0,
      ) < 5
    )
      throw new Error(
        'Actual pole lengths cannot make the 1.8 ridge and four 1.2 rafters; old short beams stay short.',
      );
    const matArea = inputs.reduce(
        (n, r) => n + Number(r.material.matArea) * r.q,
        0,
      ),
      lash = inputs
        .filter((r) => r.s.resource === 'vine')
        .reduce((n, r) => n + Number(r.material.length) * r.q, 0);
    if (matArea < 1 || lash < 6)
      throw new Error('Insufficient actual woven area or lash length.');
    const x = v7Number(c.action.args.x, 'x'),
      y = v7Number(c.action.args.y, 'y'),
      angle = v7Number(c.action.args.angle, 'angle'),
      shape = refugeShape(x, y, angle);
    refugePlacement(w, a, shape);
    if (a.vitals.energy < 0.8)
      return { complete: false, remaining: 10, writes: [] };
    j = refugeCreate(c, 'build', 10);
    j.x = x;
    j.y = y;
    j.angle = angle;
    const o: V7Object = {
      id: v7Id(w, 'object'),
      kind: 'open-refuge',
      name: 'Lashed shade structure',
      spatial: shape,
      visual: {
        component: 'rock',
        color: '#b7a36c',
        accent: '#e1ce96',
        label: 'Actual frame',
        state: 'partial',
      },
      data: {
        project: j.id,
        owner: a.id,
        stage: 0,
        proven: false,
        condition: 1,
        coverage:
          Math.min(0.9, matArea / (2 * 1.8 * Math.hypot(1, 0.6))) * 0.85,
        roofArea: matArea,
        roofMass: inputs
          .filter((r) => r.s.resource === 'reed')
          .reduce((n, r) => n + Number(r.material.unitMass) * r.q, 0),
        components: [],
        capacity: Math.min(
          4 *
            Math.min(
              ...inputs
                .filter((r) => r.s.resource === 'branch')
                .map((r) => refugeCapacity(w, a.id, r.s)),
            ),
          6 *
            Math.min(
              ...inputs
                .filter((r) => r.s.resource === 'vine')
                .map((r) => refugeCapacity(w, a.id, r.s)),
            ),
        ),
        mass: inputs.reduce((n, r) => n + Number(r.material.unitMass) * r.q, 0),
        wetness: 0,
        creep: 0,
        polygons: [
          { x: [-0.9, 0.9], y: [-0.6, 0], z: [0, 1] },
          { x: [-0.9, 0.9], y: [0, 0.6], z: [1, 0] },
        ],
      },
      createdBy: a.id,
      createdAt: w.tick,
      revision: 'resting-shelter@1',
    };
    w.objects.push(o);
    j.structure = o.id;
    for (const r of inputs) {
      const capacity = refugeCapacity(w, a.id, r.s);
      const part = refugeReserve(c, j, r.s, r.q);
      part.processing = {
        ...(part.processing ?? {}),
        refugeMaterial: r.material,
        refugeCapacity: capacity,
      };
    }
    w.processes.push({
      id: v7Id(w, 'process'),
      handler: 'open.refuge-weather',
      object: o.id,
      owner: a.id,
      next: w.tick + 1,
      revision: 'resting-shelter@1',
      data: {},
    });
  }
  const o = w.objects.find((o) => o.id === j.structure);
  if (!o) throw new Error('Actual partial structure is absent.');
  if (v7ShapeDistance(a.position, o.spatial) > 0.65 || a.vitals.energy < 0.8)
    return { complete: false, remaining: 10 - j.stage, writes: [] };
  if (
    j.escrow.some(
      (id) => !w.stacks.some((s) => s.id === id && s.owner === a.id),
    )
  )
    return { complete: false, remaining: 10 - j.stage, writes: [] };
  j.components = (o.data.components ?? []) as V7Data[];
  v7Spend(a, 0.8);
  j.stage++;
  j.paid += 0.8;
  const install =
    j.stage === 1
      ? 'branch'
      : j.stage === 4
        ? 'vine'
        : j.stage === 7
          ? 'reed'
          : null;
  for (const id of [...j.escrow])
    if (w.stacks.find((s) => s.id === id)?.resource === install)
      refugeInstall(c, j, id);
  if (j.stage === 1)
    for (const spatial of refugePoles(o.spatial))
      w.objects.push({
        id: v7Id(w, 'object'),
        kind: 'refuge-pole',
        assemblyParent: o.id,
        name: 'Actual supporting pole',
        spatial,
        visual: {
          component: 'rock',
          color: '#94734d',
          accent: '#dbbb85',
          label: 'Pole',
          state: 'installed',
        },
        data: { parent: o.id },
        createdBy: a.id,
        createdAt: w.tick,
        revision: 'resting-shelter@1',
      });
  o.data.components = j.components;
  o.data.stage = j.stage;
  c.emit(
    'shelter-progress',
    'Installed only the material assigned to this performed stage; both ends remain open.',
    {
      project: j.id,
      stage: j.stage,
      remainingWork: 10 - j.stage,
      paidEnergy: j.paid,
      components: j.components,
      geometry: o.spatial as unknown as V7Data,
    },
    o.id,
  );
  if (j.stage === 10) {
    const { capacity, load, sound } = refugeLoads(w, o);
    o.data.proven = sound;
    if (!o.data.proven) {
      o.data.condition = 0.2;
      o.visual.state = 'failed';
      for (const component of j.components) component.condition = 0.2;
      c.emit(
        'shelter-damaged',
        'Actual final proof failed; damaged installed material remains for dismantling, with no shelter effect.',
        { capacity, load, safetyFactor: 2 },
        o.id,
      );
    } else {
      o.visual.state = 'sound';
      c.emit(
        'shelter-completed',
        'Ten paid stages and actual load proof completed an open-ended shade structure.',
        {
          capacity,
          load,
          safetyFactor: 2,
          coverage: o.data.coverage ?? 0,
          paidEnergy: j.paid,
        },
        o.id,
      );
    }
    refugeStop(w, a, j, 'Construction work finished.');
    j.status = 'completed';
  }
  return { complete: j.stage === 10, remaining: 10 - j.stage, writes: [o.id] };
}
