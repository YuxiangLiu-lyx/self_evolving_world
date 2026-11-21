import type {
  V7Actor,
  V7Data,
  V7Package,
  V7World,
} from './continuous-types.js';
import { v7Clone, v7Id, v7Signature, v7Json } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { forestEvent } from './forest-environment.js';
import { forestMaterialRole } from './forest-material-compatibility.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestClearOperation } from './forest-operations.js';
import {
  canopyPosts,
  canopySite,
  canopySpatial,
} from './forest-canopy-geometry.js';
interface Job extends V7Data {
  id: string;
  site: string;
  x: number;
  y: number;
  angle: number;
  actorX: number;
  actorY: number;
  life: string;
  elapsed: number;
  lastTick: number;
  escrow: string[];
  inputs: V7Data[];
  signature: string;
}
const job = (a: V7Actor): Job | null => {
  const j = a.extensionState['canopy:pending'];
  return j && typeof j === 'object' && !Array.isArray(j) ? (j as Job) : null;
};
function event(
  w: V7World,
  a: V7Actor,
  type: string,
  target: string,
  data: V7Data,
) {
  forestEvent(
    w,
    type,
    `Rain canopy: ${type.replace('rain-canopy-', '')}.${typeof data.elapsed === 'number' ? ` Paid ${String(data.elapsed)} / 6; ${String(6 - data.elapsed)} remaining.` : ''}`,
    a.position,
    a.id,
    data,
    target,
  );
  const e = w.events.at(-1);
  if (e) e.interface = 'rain-canopy-work';
}
function cancel(w: V7World, a: V7Actor, reason: string) {
  const j = job(a);
  if (!j) return;
  const released = w.stacks.filter(
    (s) => j.escrow.includes(s.id) && s.reservedFor === j.id,
  );
  for (const s of released) delete s.reservedFor;
  w.objects = w.objects.filter((o) => o.id !== j.site);
  event(w, a, 'rain-canopy-work-cancelled', j.site, {
    operation: j.id,
    elapsed: j.elapsed,
    released: released.map((s) => s.id),
    reason,
    effortRefunded: false,
  });
  a.extensionState['canopy:lastWork'] = {
    ...v7Clone(j),
    status: 'cancelled',
    reason,
  };
  delete a.extensionState['canopy:pending'];
  forestClearOperation(a);
}
function reserve(
  w: V7World,
  a: V7Actor,
  j: Job,
  raw: V7Data['materials'] | undefined,
) {
  if (!Array.isArray(raw) || !raw.length)
    throw new Error('Explicit actual canopy materials are required.');
  const selected = raw.map((v) => {
    if (
      !v ||
      typeof v !== 'object' ||
      Array.isArray(v) ||
      typeof v.target !== 'string' ||
      typeof v.quantity !== 'number' ||
      !Number.isFinite(v.quantity) ||
      v.quantity <= 0 ||
      Math.abs(v.quantity * 10 - Math.round(v.quantity * 10)) > 1e-8
    )
      throw new Error('Material quantities must be positive exact tenths.');
    const s = w.stacks.find(
      (s) => s.id === v.target && s.owner === a.id && !s.reservedFor,
    );
    if (!s || s.quantity < v.quantity)
      throw new Error(
        'Actual unreserved owned canopy material is insufficient.',
      );
    return { s, n: foodTenths(v.quantity) };
  });
  if (new Set(selected.map((x) => x.s.id)).size !== selected.length)
    throw new Error('Duplicate canopy material identities.');
  const totals: Record<string, number> = {};
  for (const { s, n } of selected) {
    const role = forestMaterialRole(w, s.resource);
    totals[role] = (totals[role] ?? 0) + n;
  }
  if (v7Signature(totals) !== v7Signature({ branch: 40, bark: 60, vine: 20 }))
    throw new Error(
      'Canopy recipe is exactly four branch, six bark-compatible panels and two binding units.',
    );
  for (const { s, n } of selected) {
    const held = {
      ...v7Clone(s),
      id: v7Id(w, 'canopy-material'),
      reservedFor: j.id,
      position: { ...a.position },
    };
    foodSetQuantity(held, n);
    foodSetQuantity(s, foodTenths(s.quantity) - n);
    w.stacks.push(held);
    j.escrow.push(held.id);
    j.inputs.push({
      item: s.id,
      escrow: held.id,
      resource: s.resource,
      quantity: n / 10,
      mass:
        ((w.resources.find((r) => r.id === s.resource)?.mass ?? 0) * n) / 10,
      origin: s.origin,
      moisture: s.fuelMoisture ?? 0,
      provenance: s.processing ?? {},
    });
  }
}
function intact(w: V7World, a: V7Actor, j: Job): boolean {
  return j.escrow.every((id) =>
    w.stacks.some(
      (s) =>
        s.id === id &&
        s.owner === a.id &&
        s.reservedFor === j.id &&
        s.quantity > 0,
    ),
  );
}
export const FOREST_CANOPY: V7Package = {
  id: 'rain-canopy',
  version: 1,
  dependencies: ['willow-operation-continuity@1'],
  description:
    'Finite paid four-post roof intercepts actual rain and gradually dries actual mantles; no room, heat, insulation or direct recovery.',
  resources: [],
  handlers: {
    'canopy.work@1': ({ world: w, actor: a, action }) => {
      let j = job(a);
      const spatial = canopySpatial(
        Number(action.args.x),
        Number(action.args.y),
        Number(action.args.angle),
      );
      if (
        j &&
        (j.signature !== v7Signature(action) ||
          j.actorX !== a.position.x ||
          j.actorY !== a.position.y ||
          j.lastTick !== w.tick - 1)
      ) {
        cancel(w, a, 'action, position or continuity changed');
        j = null;
      }
      canopySite(w, a, spatial, j?.site ?? '');
      if (!j) {
        j = {
          id: v7Id(w, 'canopy-work'),
          site: v7Id(w, 'canopy-site'),
          x: spatial.x,
          y: spatial.y,
          angle: spatial.angle,
          actorX: a.position.x,
          actorY: a.position.y,
          life: v7Signature(a.life ?? null),
          elapsed: 0,
          lastTick: w.tick,
          escrow: [],
          inputs: [],
          signature: v7Signature(action),
        };
        reserve(w, a, j, action.args.materials);
        a.extensionState['canopy:pending'] = j;
        w.objects.push({
          id: j.site,
          kind: 'rain-canopy-work',
          name: 'Rain canopy under construction',
          spatial: { ...spatial, reserved: true },
          visual: {
            component: 'rain-canopy',
            color: '#a89569',
            accent: '#665740',
            label: 'Paid roof work',
            state: 'working',
          },
          data: { elapsed: 0, condition: 0 },
          createdBy: a.id,
          createdAt: w.tick,
          revision: 'rain-canopy@1',
        });
        event(w, a, 'rain-canopy-work-started', j.site, {
          operation: j.id,
          elapsed: 0,
          inputs: j.inputs,
        });
      }
      if (
        !intact(w, a, j) ||
        j.life !== v7Signature(a.life ?? null) ||
        !Number.isSafeInteger(j.elapsed) ||
        j.elapsed < 0 ||
        j.elapsed >= 6
      )
        throw new Error('Canopy escrow, life or paid progress is invalid.');
      v7Spend(a, 1.5);
      j.elapsed++;
      j.lastTick = w.tick;
      const site = w.objects.find((o) => o.id === j.site);
      if (site) site.data.elapsed = j.elapsed;
      event(w, a, 'rain-canopy-work-progress', j.site, {
        operation: j.id,
        elapsed: j.elapsed,
        energy: 1.5,
        escrow: j.escrow,
      });
      return {
        complete: j.elapsed === 6,
        remaining: 6 - j.elapsed,
        writes: [],
      };
    },
  },
  processes: {},
  visualComponents: ['rain-canopy', 'canopy-post'],
  events: [
    'rain-canopy-work-started',
    'rain-canopy-work-progress',
    'rain-canopy-work-completed',
    'rain-canopy-work-cancelled',
    'rain-canopy-cover-expired',
    'rain-canopy-exposure-measured',
    'rain-canopy-comfort-qualified',
  ],
  satisfaction: [],
  abilities: [
    {
      id: 'rain-canopy-work',
      name: 'Build rain canopy',
      function:
        'Build a persistent open roof that intercepts rain and gradually dries actual mantle instances.',
      equivalence: 'canopy:2x2:branch4-bark6-vine2:paid6:rain-condition120',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['build'] },
          x: { type: 'number' },
          y: { type: 'number' },
          angle: { type: 'number' },
          materials: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                target: { type: 'string' },
                quantity: { type: 'number', minimum: 0.1 },
              },
              required: ['target', 'quantity'],
              additionalProperties: false,
            },
          },
        },
        required: ['mode', 'x', 'y', 'angle', 'materials'],
        additionalProperties: false,
      },
      references: { materials: 'owned' },
      execution: {
        duration: 6,
        interruption: 'cancel',
        progress:
          'Six stationary paid rounds at1.5 energy. Exact escrow is retained through a matching plan continuation or global pause; change, lost access, invalidation or death releases surviving inputs once without effort refunds.',
      },
      prerequisites: [],
      learning: 5,
      handler: 'canopy.work@1',
      revision: 'rain-canopy@1',
      authored: false,
      costs:
        'Four branch, six bark-compatible panels, two binding units in explicit owned unreserved exact-tenth material entries. Clear2x2 footprint and four solid0.08-radius posts; front-edge surface reach within0.65; six stationary rounds1.5 energy each.',
      effects:
        'Roof condition120 loses0.5*ambientRain each round; transmission0.1+0.9*(1-condition/120). Only whole-body covered geometry protects. Effective rain<=0.15 dries actual mantles0.02/round; otherwise wets0.10*effectiveRain. No heat, wind reduction, insulation, nutrition, food preservation or rest bonus. Drying can improve the existing mantle cooling reduction. Shared thermal-refuge requires three actual fed healthy stationary rest/wait rounds with measured dryness-dependent relief; existing cap1/cooldown12, no construction reward. Posts and mass persist after covering failure.',
    },
  ],
  migrate: (w) => {
    w.state.rainCanopy = 1;
    const r = w.satisfaction.find((r) => r.id === 'thermal-refuge');
    if (!r?.maintenance)
      throw new Error('Canopy requires existing maintained thermal refuge.');
    r.alternativeTriggers = [
      ...(r.alternativeTriggers ?? []),
      { event: 'rain-canopy-comfort-qualified', interface: 'rain-canopy-work' },
    ];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      { event: 'rain-canopy-comfort-qualified', interface: 'rain-canopy-work' },
    ];
    for (const a of w.actors) {
      a.extensionState['harness:rain-canopy-work'] = true;
      a.extensionState['canopy:exposure'] = null;
    }
    return w;
  },
  beforeAction: (w, a, action, continuing) => {
    if (job(a) && (!continuing || action.interface !== 'rain-canopy-work'))
      cancel(w, a, 'actual incompatible action');
  },
  onDeath: (w, a) => {
    cancel(w, a, 'owner died');
    delete a.extensionState['canopy:comfort'];
  },
  harness: {
    'rain-canopy-work': (o) => ({
      pending: o.self.extensionState['canopy:pending'] ?? null,
      lastWork: o.self.extensionState['canopy:lastWork'] ?? null,
      exposure: o.self.extensionState['canopy:exposure'] ?? null,
      sites: o.objects
        .filter((o) => ['rain-canopy', 'rain-canopy-work'].includes(o.kind))
        .map((o) => ({ id: o.id, geometry: v7Json(o.spatial), state: o.data })),
    }),
  },
};
export function canopyAfterRound(before: V7World, w: V7World): void {
  if (w.state.rainCanopy !== 1) return;
  for (const a of w.actors) {
    const j = job(a);
    if (j) {
      let valid = true;
      try {
        canopySite(w, a, canopySpatial(j.x, j.y, j.angle), j.site);
      } catch {
        valid = false;
      }
      if (
        !valid ||
        a.vitals.health <= 0 ||
        j.life !== v7Signature(a.life ?? null) ||
        j.actorX !== a.position.x ||
        j.actorY !== a.position.y ||
        j.lastTick !== w.tick ||
        !intact(w, a, j)
      ) {
        cancel(w, a, 'life, geometry, attention or escrow invalidated');
      } else if (j.elapsed === 6) {
        const roof = w.objects.find((o) => o.id === j.site);
        if (!roof) throw new Error('Missing paid canopy site.');
        const mass = j.inputs.reduce((n, i) => n + Number(i.mass), 0);
        w.stacks = w.stacks.filter((s) => !j.escrow.includes(s.id));
        roof.kind = 'rain-canopy';
        roof.name = 'Bark rain canopy';
        roof.spatial = canopySpatial(j.x, j.y, j.angle);
        roof.visual.state = 'complete';
        roof.visual.label = 'Rain canopy';
        roof.data = {
          condition: 120,
          mass,
          inputs: j.inputs,
          elapsed: 6,
          lastTick: w.tick,
          rain: 0,
          transmission: 0.1,
          posts: [],
        };
        const ids: string[] = [];
        for (const spatial of canopyPosts(roof.spatial)) {
          const id = v7Id(w, 'canopy-post');
          ids.push(id);
          w.objects.push({
            id,
            kind: 'canopy-post',
            name: 'Solid canopy post',
            spatial,
            visual: {
              component: 'canopy-post',
              color: '#776349',
              accent: '#b8a078',
              label: 'Post',
              state: 'standing',
            },
            data: { parent: roof.id, massAccount: roof.id },
            createdBy: a.id,
            createdAt: w.tick,
            revision: 'rain-canopy@1',
          });
        }
        roof.data.posts = ids;
        event(w, a, 'rain-canopy-work-completed', roof.id, {
          operation: j.id,
          elapsed: 6,
          inputs: j.inputs,
          mass,
          posts: ids,
          condition: 120,
        });
        a.extensionState['canopy:lastWork'] = {
          ...v7Clone(j),
          status: 'completed',
        };
        delete a.extensionState['canopy:pending'];
      }
    }
    const old = before.actors.find((p) => p.id === a.id),
      raw = a.extensionState['canopy:exposure'],
      e = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    const qualifies =
      !!old &&
      !!e &&
      e.tick === w.tick &&
      Number(e.after) < Number(e.before) &&
      Number(e.avoidedCooling) > 0 &&
      Number(e.coldDiscomfort) < Number(e.counterfactualColdDiscomfort) &&
      a.vitals.health > 0 &&
      a.vitals.health >= old.vitals.health &&
      old.vitals.satiety >= 20 &&
      a.vitals.satiety >= 20 &&
      a.position.x === old.position.x &&
      a.position.y === old.position.y &&
      !old.learning &&
      !a.learning &&
      w.events.some(
        (e) => e.actor === a.id && ['rested', 'waited'].includes(e.type),
      ) &&
      !w.events.some(
        (e) => e.actor === a.id && ['injured', 'died'].includes(e.type),
      );
    const rawPrevious = a.extensionState['canopy:comfort'],
      previous =
        rawPrevious &&
        typeof rawPrevious === 'object' &&
        !Array.isArray(rawPrevious)
          ? rawPrevious
          : null;
    if (!qualifies) {
      delete a.extensionState['canopy:comfort'];
      continue;
    }
    const rounds =
      previous?.tick === w.tick - 1 && previous.canopy === e.canopy
        ? Number(previous.rounds) + 1
        : 1;
    a.extensionState['canopy:comfort'] = {
      tick: w.tick,
      canopy: e.canopy ?? null,
      rounds,
    };
    if (rounds >= 3)
      event(
        w,
        a,
        'rain-canopy-comfort-qualified',
        typeof e.canopy === 'string' ? e.canopy : '',
        {
          ...e,
          qualified: true,
          participant: a.id,
          eligibleRounds: 1,
          consecutiveRounds: rounds,
        },
      );
  }
}
