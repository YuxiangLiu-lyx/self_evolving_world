import { forestMaterialRole } from './forest-material-compatibility.js';
import type {
  V7Actor,
  V7Data,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Clone, v7Id, v7RoundNumber } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestClimate, forestEvent } from './forest-environment.js';

interface Job extends V7Data {
  id: string;
  mode: string;
  target: string;
  x: number;
  y: number;
  elapsed: number;
  lastTick: number;
  escrow: string[];
  inputs: V7Data[];
}
function job(a: V7Actor): Job | null {
  const raw = a.extensionState['insulation:pending'];
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Job)
    : null;
}
function event(
  w: V7World,
  a: V7Actor,
  type: string,
  target: string,
  data: V7Data = {},
) {
  forestEvent(
    w,
    type,
    'Portable insulation: ' +
      type.replace('insulation-', '') +
      '.' +
      (typeof data.elapsed === 'number'
        ? ` Paid work ${String(data.elapsed)} rounds${typeof data.remaining === 'number' ? `; ${String(data.remaining)} remaining` : ''}.`
        : ''),
    a.position,
    a.id,
    data,
    target,
  );
  const e = w.events.at(-1);
  if (e) e.interface = 'portable-insulation';
}
function cancel(w: V7World, a: V7Actor, reason: string) {
  const j = job(a);
  if (!j) return;
  for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
    delete s.reservedFor;
  event(w, a, 'insulation-cancelled', j.target, {
    reason,
    elapsed: j.elapsed,
    released: j.escrow,
  });
  a.extensionState['insulation:lastWork'] = {
    ...v7Clone(j),
    status: 'cancelled',
    reason,
  };
  delete a.extensionState['insulation:pending'];
}
function reserve(w: V7World, a: V7Actor, j: Job) {
  for (const [resource, amount] of [
    ['bark', j.mode === 'craft' ? 4 : 2],
    ['vine', j.mode === 'craft' ? 2 : 1],
  ] as const) {
    let left = foodTenths(amount);
    for (const s of [...w.stacks].filter(
      (s) =>
        s.owner === a.id &&
        !s.reservedFor &&
        forestMaterialRole(w, s.resource) === resource,
    )) {
      const used = Math.min(left, foodTenths(s.quantity));
      if (!used) continue;
      const escrow = {
        ...v7Clone(s),
        id: v7Id(w, 'insulation-material'),
        reservedFor: j.id,
      };
      foodSetQuantity(escrow, used);
      foodSetQuantity(s, foodTenths(s.quantity) - used);
      w.stacks.push(escrow);
      j.escrow.push(escrow.id);
      j.inputs.push({
        item: s.id,
        escrow: escrow.id,
        resource: s.resource,
        ...(w.state.willowMaterials === 1
          ? {
              moisture:
                s.fuelMoisture ?? forestClimate(w, a.position).rain ?? 0,
              mass: w.resources.find((r) => r.id === s.resource)?.mass ?? 0,
            }
          : {}),
        quantity: used / 10,
        origin: s.origin,
      });
      left -= used;
    }
    if (left)
      throw new Error(
        'Insufficient actual unreserved ' +
          resource +
          ' for portable insulation.',
      );
  }
}
const total = (j: Job) => (j.mode === 'craft' ? 5 : 2);
const intact = (w: V7World, a: V7Actor, j: Job) =>
  j.escrow.every((id) =>
    w.stacks.some(
      (s) =>
        s.id === id &&
        s.owner === a.id &&
        s.reservedFor === j.id &&
        s.quantity > 0,
    ),
  );

export const FOREST_INSULATION: V7Package = {
  id: 'portable-insulation',
  version: 1,
  dependencies: ['active-warming@1'],
  description:
    'Paid bark-and-vine mantle with persistent identity, real portable cooling protection, moisture and wear.',
  resources: [
    {
      id: 'bark-mantle',
      name: 'Bark-and-vine mantle',
      mass: 2.2,
      nutrition: 0,
      toxicity: 0,
      color: '#a78e64',
    },
    {
      id: 'mantle-scrap',
      name: 'Worn bark and vine panels',
      mass: 1.1,
      nutrition: 0,
      toxicity: 0,
      color: '#796c58',
    },
  ],
  processes: {},
  visualComponents: [],
  satisfaction: [],
  events: [
    'insulation-started',
    'insulation-progress',
    'insulation-completed',
    'insulation-cancelled',
    'insulation-equipped',
    'insulation-unequipped',
    'insulation-exposure-measured',
    'insulation-worn-out',
    'insulation-comfort-qualified',
  ],
  abilities: [
    {
      id: 'portable-insulation',
      name: 'Portable insulation',
      function:
        'Craft, equip, remove or repair a portable bark-and-vine mantle.',
      equivalence: 'portable:bark4-vine2:cooling025:wear160',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['craft', 'equip', 'unequip', 'repair'],
          },
          target: { type: 'string', maxLength: 1000 },
        },
        required: ['mode'],
        additionalProperties: false,
      },
      references: { target: 'owned' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Craft takes 5 stationary rounds; repair 2; equip/unequip 1. repeat counts complete operations. Global pauses preserve work; interruptions release surviving unconsumed escrow once, never spent effort.',
      },
      prerequisites: [],
      learning: 4,
      costs:
        'Craft: 4 actual owned bark + 2 vine, 5 stationary rounds at 1.5 energy. Repair: unequipped owned mantle + 2 bark + 1 vine, 2 rounds at 1 energy; equal mass of worn panels becomes scrap. Equip/unequip: 0.5 energy, one round. Target forbidden for craft, required otherwise; shared owned-item references apply. Inputs may span owned stacks and are reserved once.',
      effects:
        'One real 2.2-mass mantle, initially unequipped. Condition 160, loses 1 per equipped round. Moisture rises 0.10 in exposed rain, falls 0.02 otherwise. Below-comfort cooling reduction is (0.25 - 0.15*moisture)*min(1,condition/40), multiplicative with shelter. No heat, healing or immunity. Only actual measured relief can share the existing thermal-refuge award. Transfer and death unequip; whole item identity persists.',
      handler: 'insulation.work@1',
      revision: 'portable-insulation@1',
      authored: false,
    },
  ],
  handlers: {
    'insulation.work@1': ({ world: w, actor: a, action }) => {
      const mode = typeof action.args.mode === 'string' ? action.args.mode : '',
        target =
          typeof action.args.target === 'string' ? action.args.target : '';
      if (
        (mode === 'craft' && action.args.target !== undefined) ||
        (mode !== 'craft' && !target)
      )
        throw new Error(
          'Craft forbids target; equip, unequip and repair require an owned mantle target.',
        );
      const item = w.stacks.find(
        (s) =>
          s.id === target && s.owner === a.id && s.quantity === 1 && s.mantle,
      );
      if (mode !== 'craft' && !item?.mantle)
        throw new Error('An actual owned whole mantle is required.');
      if (mode === 'equip' || mode === 'unequip') {
        if (!item?.mantle) throw new Error('Missing mantle.');
        if (
          mode === 'equip' &&
          (item.mantle.condition <= 0 ||
            w.stacks.some((s) => s.owner === a.id && s.mantle?.equipped))
        )
          throw new Error(
            'A usable mantle and an empty equipment slot are required.',
          );
        if (mode === 'unequip' && !item.mantle.equipped)
          throw new Error('This mantle is not equipped.');
        v7Spend(a, 0.5);
        item.mantle.equipped = mode === 'equip';
        event(
          w,
          a,
          mode === 'equip' ? 'insulation-equipped' : 'insulation-unequipped',
          item.id,
          { energy: 0.5 },
        );
        return { complete: true, remaining: 0, writes: [] };
      }
      if (item?.mantle?.equipped)
        throw new Error('Repair requires an unequipped mantle.');
      let j = job(a);
      if (
        j &&
        (j.mode !== mode ||
          j.target !== target ||
          j.x !== a.position.x ||
          j.y !== a.position.y ||
          j.lastTick !== w.tick - 1)
      ) {
        cancel(w, a, 'work, position or target changed');
        j = null;
      }
      v7Spend(a, mode === 'craft' ? 1.5 : 1);
      if (!j) {
        j = {
          id: v7Id(w, 'insulation-work'),
          mode,
          target,
          x: a.position.x,
          y: a.position.y,
          elapsed: 0,
          lastTick: w.tick,
          escrow: [],
          inputs: [],
        };
        reserve(w, a, j);
        if (item) item.reservedFor = j.id;
        a.extensionState['insulation:pending'] = j;
        event(w, a, 'insulation-started', target, {
          mode,
          inputs: j.inputs,
          total: total(j),
        });
      }
      if (!intact(w, a, j))
        throw new Error('Actual reserved inputs no longer survive.');
      j.elapsed++;
      j.lastTick = w.tick;
      event(w, a, 'insulation-progress', target, {
        mode,
        elapsed: j.elapsed,
        remaining: total(j) - j.elapsed,
        energy: mode === 'craft' ? 1.5 : 1,
      });
      return {
        complete: j.elapsed === total(j),
        remaining: total(j) - j.elapsed,
        writes: [],
      };
    },
  },
  migrate: (w) => {
    if (!w.config.experience)
      throw new Error(
        'Portable insulation requires the reviewed experience policy.',
      );
    w.state.portableInsulation = 1;
    const refuge = w.satisfaction.find((s) => s.id === 'thermal-refuge');
    if (!refuge) throw new Error('Missing shared thermal-refuge source.');
    refuge.alternativeTriggers = [
      ...(refuge.alternativeTriggers ?? []),
      {
        event: 'insulation-comfort-qualified',
        interface: 'portable-insulation',
      },
    ];
    for (const a of w.actors)
      a.extensionState['harness:portable-insulation'] = true;
    return w;
  },
  harness: {
    'portable-insulation': (o) => ({
      pending: o.self.extensionState['insulation:pending'] ?? null,
      lastWork: o.self.extensionState['insulation:lastWork'] ?? null,
      lastExposure: o.self.extensionState['insulation:exposure'] ?? null,
      garments: o.stacks
        .filter((s) => s.owner === o.self.id && s.mantle)
        .map((s) => ({
          item: s.id,
          condition: s.mantle?.condition ?? 0,
          moisture: s.mantle?.moisture ?? 0,
          equipped: s.mantle?.equipped ?? false,
        })),
    }),
  },
  onDeath: (w, a) => {
    cancel(w, a, 'owner died');
    for (const s of w.stacks.filter((s) => s.owner === a.id && s.mantle))
      if (s.mantle) s.mantle.equipped = false;
    delete a.extensionState['insulation:comfort'];
  },
};

/** Settlement follows physiology/death so unfinished work cannot manufacture a posthumous item. */
export function insulationAfterRound(before: V7World, w: V7World) {
  if (w.state.portableInsulation !== 1) return;
  for (const s of w.stacks) {
    if (!s.mantle || s.mantle.lastTick === w.tick) continue;
    const position =
      w.actors.find((a) => a.id === s.owner)?.position ?? s.position;
    const climate = forestClimate(w, position);
    s.mantle.moisture = v7RoundNumber(
      Math.max(
        0,
        Math.min(
          1,
          s.mantle.moisture +
            (!climate.indoor && (climate.rain ?? 0) > 0 ? 0.1 : -0.02),
        ),
      ),
    );
    s.mantle.lastTick = w.tick;
  }
  for (const a of w.actors) {
    const j = job(a);
    if (j) {
      const target = w.stacks.find(
        (s) =>
          s.id === j.target &&
          s.owner === a.id &&
          s.reservedFor === j.id &&
          s.mantle,
      );
      if (
        j.lastTick !== w.tick ||
        a.position.x !== j.x ||
        a.position.y !== j.y ||
        !intact(w, a, j) ||
        (j.mode === 'repair' && !target)
      )
        cancel(w, a, 'attention, surviving inputs or ownership invalidated');
      else if (j.elapsed === total(j)) {
        w.stacks = w.stacks.filter((s) => !j.escrow.includes(s.id));
        let output: V7Stack;
        if (j.mode === 'craft') {
          output = {
            id: v7Id(w, 'mantle'),
            resource: 'bark-mantle',
            quantity: 1,
            owner: a.id,
            position: { ...a.position },
            origin: j.id,
            mantle: {
              equipped: false,
              condition: 160,
              moisture:
                w.state.willowMaterials === 1
                  ? j.inputs.reduce(
                      (n, i) =>
                        n +
                        Number(i.moisture) *
                          Number(i.mass) *
                          Number(i.quantity),
                      0,
                    ) / 2.2
                  : (forestClimate(w, a.position).rain ?? 0),
              lastTick: -1,
              inputs: j.inputs,
              repairs: [],
            },
          };
          w.stacks.push(output);
        } else {
          if (!target?.mantle)
            throw new Error('Missing retained repair target.');
          output = target;
          delete output.reservedFor;
          target.mantle.condition = 160;
          target.mantle.repairs.push({ tick: w.tick, inputs: j.inputs });
          w.stacks.push({
            id: v7Id(w, 'scrap'),
            resource: 'mantle-scrap',
            quantity: 1,
            owner: a.id,
            position: { ...a.position },
            origin: target.id,
          });
        }
        event(w, a, 'insulation-completed', output.id, {
          mode: j.mode,
          inputs: j.inputs,
          elapsed: j.elapsed,
          condition: 160,
          mass: 2.2,
        });
        a.extensionState['insulation:lastWork'] = {
          ...v7Clone(j),
          status: 'completed',
          output: output.id,
        };
        delete a.extensionState['insulation:pending'];
      }
    }
    const raw = a.extensionState['insulation:exposure'],
      old = before.actors.find((old) => old.id === a.id);
    const e =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    const qualifies =
      e?.tick === w.tick &&
      Number(e.avoidedCooling) > 0 &&
      Number(e.coldDiscomfort) < Number(e.unprotectedColdDiscomfort) &&
      !!old &&
      old.vitals.satiety > 0 &&
      a.vitals.health >= old.vitals.health &&
      !w.events.some(
        (ev) => ev.actor === a.id && ['injured', 'died'].includes(ev.type),
      );
    const count = qualifies
      ? Number(a.extensionState['insulation:comfort'] ?? 0) + 1
      : 0;
    a.extensionState['insulation:comfort'] = count >= 3 ? 0 : count;
    if (count >= 3)
      event(
        w,
        a,
        'insulation-comfort-qualified',
        typeof e?.item === 'string' ? e.item : '',
        {
          qualified: true,
          rounds: 3,
          measurement: e,
        },
      );
  }
}
