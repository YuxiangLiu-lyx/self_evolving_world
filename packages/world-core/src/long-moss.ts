import type {
  V7ActionContext,
  V7Actor,
  V7Object,
  V7Package,
  V7Spatial,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { FOREST_BASE } from './forest-foundation.js';
import { v7Id, v7Json, v7Number, v7RoundNumber } from './continuous-data.js';
import {
  v7Distance,
  v7Reach,
  v7ShapesOverlap,
  v7Visible,
} from './continuous-geometry.js';
import { rootPlacement } from './collective-tray-placement.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workFind,
  workPay,
  workReserve,
  workResult,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import { foodTenths } from './forest-food-accounting.js';
import { materialPortion, materialSlice } from './material-lots.js';
import { openRemember } from './open-foundation.js';
const ID = 'moss-resting-pad-trial',
  REV = ID + '@1';
function parts(w: V7World, o: V7Object) {
  const ids = Array.isArray(o.data.parts) ? o.data.parts : [];
  return w.stacks.filter(
    (s) =>
      ids.includes(s.id) &&
      s.owner === null &&
      s.quantity > 0 &&
      v7Distance(s.position, o.spatial) <= o.spatial.interaction,
  );
}
function sync(a: V7Actor, j: CollectiveWork) {
  if (['active', 'paused'].includes(j.status))
    a.extensionState['long:work:moss'] = v7Json(j);
  else {
    delete a.extensionState['long:work:moss'];
    a.extensionState['long:last-moss'] = v7Json(j);
  }
}
function release(w: V7World, a: V7Actor, j: CollectiveWork, death = false) {
  workStop(
    w,
    a,
    j,
    'Loose moss work stopped; placed material remains at its actual location.',
    death,
  );
  const o = w.objects.find((o) => o.id === j.target);
  if (o) {
    o.data.activeWork = null;
    o.spatial.reserved = false;
    o.data.construction = 'cancelled';
  }
  sync(a, j);
}
function placement(
  c: V7ActionContext,
  p: V7Spatial,
  existing?: V7Object,
  contact = false,
) {
  const radius = p.shape.kind === 'circle' ? p.shape.radius : 0;
  const others = c.world.objects.filter((o) => o.id !== existing?.id);
  const check = rootPlacement(
    {
      ...c.world,
      objects: others,
      actors: contact
        ? c.world.actors.filter((a) => a.id !== c.actor.id)
        : c.world.actors,
    },
    c.actor,
    p,
    radius,
  );
  if (
    check.error ||
    !v7Visible(c.world, c.actor.position, p) ||
    others.some((o) => v7ShapesOverlap(p, o.spatial))
  )
    throw new Error(
      'The visible footprint is inaccessible, unsupported, occupied or reserved.',
    );
}
function target(c: V7ActionContext) {
  const o = c.world.objects.find(
    (o) => o.id === c.action.args.arrangementId && o.revision === REV,
  );
  if (!o || !v7Reach(c.actor, o.spatial))
    throw new Error('Reach the exact existing loose-moss arrangement.');
  return o;
}
function measure(c: V7ActionContext, o: V7Object, rest: boolean) {
  const ps = parts(c.world, o),
    before = c.actor.vitals.energy;
  let contacts = 0,
    displaced = 0;
  if (rest) {
    if (o.data.activeWork)
      throw new Error(
        'Finish or cancel the actual placement before a rest trial.',
      );
    if (
      v7Distance(c.actor.position, o.spatial) >
      c.actor.radius +
        (o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0)
    )
      throw new Error(
        'A real contact position is required; approach without automatic movement.',
      );
    placement(c, o.spatial, o, true);
    for (const s of ps)
      if (v7Distance(s.position, c.actor.position) <= c.actor.radius) {
        contacts += s.quantity;
        // Minimal contact model: one bounded lateral displacement of loose, unbound material; no load or volume inference.
        const dx = s.position.x - c.actor.position.x,
          dy = s.position.y - c.actor.position.y,
          d = Math.hypot(dx, dy);
        const next = {
          x: s.position.x + (d ? dx / d : 1) * 0.02,
          y: s.position.y + (d ? dy / d : 0) * 0.02,
        };
        const radius =
          o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0;
        if (v7Distance(next, o.spatial) <= radius) {
          s.position = { x: v7RoundNumber(next.x), y: v7RoundNumber(next.y) };
          displaced += s.quantity;
        }
      }
    const handler = FOREST_BASE.handlers['forest.rest'];
    if (!handler) throw new Error('Missing baseline rest.');
    handler(c);
  } else {
    if (before < 0.2) throw new Error('Inspection requires 0.2 energy.');
    c.actor.vitals.energy -= 0.2;
  }
  const finding = {
    arrangement: o.id,
    quantity: ps.reduce((n, s) => n + s.quantity, 0),
    construction: o.data.construction ?? null,
    contactQuantity: rest ? v7RoundNumber(contacts) : null,
    displacedQuantity: rest ? v7RoundNumber(displaced) : null,
    coverage: null,
    usability: 'inconclusive',
    limitation:
      'Quantity and contact do not establish full-body coverage, thickness, comfort, insulation or durability.',
    energyBefore: before,
    energyAfter: c.actor.vitals.energy,
    recovered: rest ? c.actor.vitals.energy - before : 0,
    mossBonus: 0,
  };
  openRemember(c, {
    key: o.id + (rest ? ':contact-trial' : ':inspection'),
    subject: o.id,
    property: rest
      ? 'actual loose-moss contact'
      : 'visible arrangement condition',
    value: finding,
    method: rest
      ? 'actual ground-supported rest and bounded displacement'
      : 'paid local inspection',
    condition:
      'Only this existing material and contact geometry; no bedding certification',
    verified: false,
  });
  c.emit(
    rest ? 'moss-rest-trial-completed' : 'moss-inspected',
    rest
      ? 'Actual ordinary rest on supporting ground; loose-material contact measured without a recovery bonus.'
      : 'Actual loose material inspected; no repair or comfort certification.',
    finding,
    o.id,
  );
  return { complete: true, writes: [o.id, ...ps.map((s) => s.id)] };
}
function execute(c: V7ActionContext) {
  const mode = c.action.args.mode;
  if (mode === 'recover') {
    const o = target(c),
      ps = parts(c.world, o).filter(
        (s) =>
          v7Distance(s.position, c.actor.position) <= c.actor.radius + 0.65,
      );
    if (o.data.activeWork || !ps.length)
      throw new Error(
        'Unlock the arrangement and reach surviving loose material before recovery.',
      );
    if (c.actor.vitals.energy < 0.5)
      throw new Error('Physical recovery requires 0.5 energy.');
    c.actor.vitals.energy -= 0.5;
    for (const s of ps) {
      s.owner = c.actor.id;
      s.position = { ...c.actor.position };
    }
    c.emit(
      'moss-recovered',
      'Surviving reachable loose portions physically picked up once.',
      {
        arrangementId: o.id,
        items: ps.map((s) => s.id),
        quantity: v7RoundNumber(ps.reduce((n, s) => n + s.quantity, 0)),
        paidEnergy: 0.5,
      },
      o.id,
    );
    return { complete: true, writes: ps.map((s) => s.id) };
  }

  if (mode === 'inspect' || mode === 'rest-trial')
    return measure(c, target(c), mode === 'rest-trial');
  let j = workFind(c),
    o = j ? c.world.objects.find((o) => o.id === j?.target) : undefined;
  if (mode === 'cancel') {
    if (!j) throw new Error('No unfinished personal moss work.');
    release(c.world, c.actor, j);
    return workResult(j);
  }
  if (!j) {
    if (mode !== 'begin') throw new Error('No unfinished moss work to resume.');
    if (c.action.args.arrangementId) {
      o = target(c);
      if (o.createdBy !== c.actor.id || o.data.activeWork)
        throw new Error(
          'Only the owner can add material to an unlocked arrangement.',
        );
    }
    const r = v7Number(c.action.args.radius, 'radius', 0.1);
    if (r > 0.5) throw new Error('Nominated radius must be 0.1 to 0.5.');
    const p: V7Spatial = {
      x: v7Number(c.action.args.x, 'x'),
      y: v7Number(c.action.args.y, 'y'),
      angle: 0,
      shape: { kind: 'circle', radius: r },
      solid: false,
      reserved: true,
      interaction: 0.65,
      entrances: [],
    };
    if (
      o &&
      (o.spatial.x !== p.x ||
        o.spatial.y !== p.y ||
        o.spatial.shape.kind !== 'circle' ||
        o.spatial.shape.radius !== r)
    )
      throw new Error('Additional placement retains the exact footprint.');
    placement(c, p, o);
    const quantity = v7Number(c.action.args.quantity, 'quantity', 0.1);
    if (quantity > 2)
      throw new Error(
        'One bounded loose-placement job accepts 0.1 to 2 units in tenths.',
      );
    const allocations = workAllocations(c, [
      { itemId: c.action.args.inputStackId, quantity },
    ]);
    if (allocations[0]?.stack.resource !== 'moss')
      throw new Error('An owned, unreserved actual moss portion is required.');
    if (c.actor.vitals.energy < 1)
      throw new Error('One energy is required to begin paid placement.');
    j = workCreate(c, 'place', 2);
    j.x = p.x;
    j.y = p.y;
    j.quantity = quantity;
    j.radius = r;
    workReserve(c, j, allocations, true);
    if (!o) {
      o = {
        id: v7Id(c.world, 'moss-arrangement'),
        kind: 'loose-moss-arrangement',
        name: 'Loose moss trial arrangement',
        spatial: p,
        visual: {
          component: 'loose-material',
          color: '#6f925c',
          accent: '#c4d2a5',
          label: 'Loose moss: placement in progress',
          state: 'partial',
        },
        data: {
          parts: [],
          construction: 'partial',
          usability: 'untested',
          coverage: null,
          durability: 'unknown',
          activeWork: j.id,
        },
        createdBy: c.actor.id,
        createdAt: c.world.tick,
        revision: REV,
      };
      c.world.objects.push(o);
    }
    o.data.activeWork = j.id;
    o.spatial.reserved = true;
    o.data.construction = 'partial';
    j.target = o.id;
    c.emit(
      'moss-work-started',
      'Exact owned moss reserved for two paid placement steps.',
      {
        processId: j.id,
        arrangementId: o.id,
        sources: v7Json(j.sources),
        radius: r,
        quantity,
      },
      o.id,
    );
  }
  if (!o || !['active', 'paused'].includes(j.status))
    throw new Error('The exact moss job is already settled.');
  if (
    mode === 'begin' &&
    (c.action.args.inputStackId !== j.sources[0]?.itemId ||
      c.action.args.quantity !== j.quantity ||
      c.action.args.x !== j.x ||
      c.action.args.y !== j.y ||
      c.action.args.radius !== j.radius)
  )
    throw new Error(
      'Substituted materials or geometry cannot replace paid work; resume the exact process.',
    );
  placement(c, o.spatial, o);
  const items =
    j.completedWork === 0
      ? c.world.stacks.filter((s) => j.escrow.includes(s.id))
      : parts(c.world, o).filter(
          (s) => Array.isArray(j.placed) && j.placed.includes(s.id),
        );
  if (!items.length)
    throw new Error('The exact placement material is no longer at this site.');
  if (!workPay(c, j, 1)) {
    sync(c.actor, j);
    return workResult(j);
  }
  if (j.completedWork === 1) {
    j.placed = items.map((s) => s.id);
    for (const s of items) {
      delete s.reservedFor;
      s.owner = null;
      s.position = { x: j.x, y: j.y };
    }
    j.escrow = [];
    o.data.parts = [
      ...(Array.isArray(o.data.parts) ? o.data.parts : []),
      ...items.map((s) => s.id),
    ];
  } else {
    const placed: string[] = [];
    for (const s of items) {
      const n = foodTenths(s.quantity),
        original = { ...s };
      for (let k = 0; k < n; k++) {
        const part = {
          ...materialPortion(original, 1),
          id: k === 0 ? s.id : v7Id(c.world, 'item'),
        };
        if (original.componentLots)
          part.componentLots = materialSlice(original, k, 1);
        part.owner = null;
        delete part.reservedFor;
        const angle = (2 * Math.PI * k) / n,
          rad = Number(j.radius) * 0.7;
        part.position = {
          x: v7RoundNumber(j.x + Math.cos(angle) * rad),
          y: v7RoundNumber(j.y + Math.sin(angle) * rad),
        };
        if (k > 0) c.world.stacks.push(part);
        else c.world.stacks[c.world.stacks.indexOf(s)] = part;
        placed.push(part.id);
      }
    }
    o.data.parts = [
      ...(Array.isArray(o.data.parts) ? o.data.parts : []).filter(
        (id) => !items.some((s) => s.id === id),
      ),
      ...placed,
    ];
    j.outputs = [o.id, ...placed];
    j.status = 'completed';
    o.spatial.reserved = false;
    o.data.activeWork = null;
    o.data.construction = 'completed';
    o.visual.state = 'placed';
    o.visual.label = 'Loose moss: usability untested';
    c.emit(
      'moss-placement-completed',
      'Actual loose moss spread into recorded ground portions; completion does not establish a bed.',
      {
        processId: j.id,
        arrangementId: o.id,
        parts: placed,
        paidEnergy: j.paidEnergy,
        quantity: parts(c.world, o).reduce((n, s) => n + s.quantity, 0),
        usability: 'untested',
        qualified: false,
      },
      o.id,
    );
  }
  o.data.completedWork = j.completedWork;
  o.data.remainingWork = j.remainingWork;
  sync(c.actor, j);
  return workResult(j);
}
export const LONG_MOSS: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['foundation-open@1'],
  description:
    'Conserved loose-moss placement and actual contact/rest measurement, without assumed bedding efficacy.',
  reuse: {
    experiment: 'ex13/ex12 paid work; authored forest/open foundation',
    source:
      'collective-work.ts; material-lots.ts; collective-tray-placement.ts; forest-foundation.ts',
    description:
      'Reuses escrow, portion provenance, spatial checks, baseline rest and private observations. No historical generated ability is activated.',
  },
  abilities: [
    {
      id: ID,
      name: 'Loose moss resting trial',
      function:
        'Place owned moss, inspect the resulting arrangement or perform a real ground-supported contact/rest trial.',
      equivalence: 'loose-moss:placement-contact-trial:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'begin',
              'resume',
              'cancel',
              'inspect',
              'rest-trial',
              'recover',
            ],
          },
          inputStackId: { type: 'string' },
          quantity: { type: 'number', minimum: 0.1, maximum: 2 },
          x: { type: 'number' },
          y: { type: 'number' },
          radius: { type: 'number', minimum: 0.1, maximum: 0.5 },
          processId: { type: 'string' },
          arrangementId: { type: 'string' },
        }),
        required: ['mode'],
      },
      prerequisites: [],
      learning: 2,
      learningEnergy: 0.2,
      costs:
        'Quote: retrieve this ability through the free control abilities query; reading these exact terms takes no world round. Begin requires inputStackId, quantity 0.1–2 in tenths, x/y and radius 0.1–0.5, two actual rounds at 1 energy each. Study costs two rounds at 0.2 energy. Inspect requires arrangementId, one round/0.2 energy. Rest-trial requires arrangementId and actual contact position, one baseline rest round, with existing mental/facility factors and cap40. Resume/cancel use exact processId. Additional placement on an owned unlocked arrangement repeats the same costs and exact footprint.',
      effects:
        'First step places actual reserved moss at the site; second spreads actual tenths within the nominated radius, without mass-to-volume or coverage inference. Placed ground material is recoverable with recover(arrangementId), one round/0.5 energy for actual reachable surviving portions; this scoped pickup supports tenths that baseline whole-unit pickup cannot. Recovery removes material from the arrangement. Cancel/death preserve placed material and paid work; no refund or automatic labor. Rest measures real geometric contact and at most0.02 lateral displacement of contacted loose material inside the footprint; no inferred load strength, thickness, comfort, durability or recovery bonus. Usability remains inconclusive. Personal findings are not publicly shared. No reward, regeneration, binding, tool or stock grant.',
      handler: 'long.moss',
      revision: REV,
      authored: false,
      references: {
        inputStackId: 'optional-owned',
        arrangementId: 'optional-exact-visible',
      },
      practiceEvidence: 'moss-qualified-practice',
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Exact process, source portions, paid rounds and placed ground material persist; resume only outstanding work. Quote is a read-only control query, not a physical action.',
      },
    },
  ],
  handlers: { 'long.moss': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: ['loose-material'],
  events: [
    'moss-work-started',
    'moss-placement-completed',
    'moss-inspected',
    'moss-recovered',
    'moss-rest-trial-completed',
    'moss-qualified-practice',
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
    for (const o of w.objects.filter((o) => o.revision === REV)) {
      o.data.remainingQuantity = v7RoundNumber(
        parts(w, o).reduce((n, s) => n + s.quantity, 0),
      );
    }
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      release(w, a, j, true);
  },
};
