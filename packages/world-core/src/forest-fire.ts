import {
  forestMaterialRole,
  forestFireFuel,
} from './forest-material-compatibility.js';
import type {
  V7Actor,
  V7Data,
  V7Object,
  V7Package,
  V7Spatial,
  V7World,
} from './continuous-types.js';
import { v7Clone, v7Id, v7Signature } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  v7Distance,
  v7Inside,
  v7Interior,
  v7Obstacles,
  v7Reach,
  v7SegmentClear,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestClimate } from './forest-environment.js';
import { fireEvent, fireWeather } from './forest-fire-environment.js';
import { fireState } from './forest-fire-exposure.js';

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
  kit: string;
  signature: string;
  site: string;
}
function job(a: V7Actor): Job | null {
  const j = a.extensionState['fire:pending'];
  return j && typeof j === 'object' && !Array.isArray(j) ? (j as Job) : null;
}
const duration = (mode: string) => (mode === 'ignite' ? 8 : 4);
export function hearthSpatial(x: number, y: number): V7Spatial {
  return {
    x,
    y,
    angle: 0,
    shape: { kind: 'circle', radius: 0.45 },
    solid: true,
    interaction: 0.65,
    entrances: [],
  };
}
function site(w: V7World, a: V7Actor, id: string) {
  const o = w.objects.find((o) => o.id === id && o.kind === 'stone-hearth');
  if (!o || !v7Reach(a, o.spatial))
    throw new Error(
      'A real completed hearth within interaction reach is required.',
    );
  return o;
}
function cancel(w: V7World, a: V7Actor, reason: string) {
  const j = job(a);
  if (!j) return;
  for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
    delete s.reservedFor;
  if (j.mode === 'build') w.objects = w.objects.filter((o) => o.id !== j.site);
  fireEvent(w, a, 'fire-work-cancelled', j.target, {
    reason,
    elapsed: j.elapsed,
    released: j.escrow,
    kit: j.kit,
    spentEffortRefunded: false,
  });
  a.extensionState['fire:lastWork'] = {
    ...v7Clone(j),
    status: 'cancelled',
    reason,
  };
  delete a.extensionState['fire:pending'];
}
function materials(
  w: V7World,
  a: V7Actor,
  raw: V7Data['materials'] | undefined,
) {
  if (!Array.isArray(raw) || !raw.length)
    throw new Error('Actual explicit material entries are required.');
  const selected = raw.map((v) => {
    if (
      !v ||
      typeof v !== 'object' ||
      Array.isArray(v) ||
      typeof v.target !== 'string' ||
      typeof v.quantity !== 'number'
    )
      throw new Error('Invalid material entry.');
    const n = foodTenths(v.quantity);
    const s = w.stacks.find(
      (s) => s.id === v.target && s.owner === a.id && !s.reservedFor,
    );
    if (!s || n <= 0 || foodTenths(s.quantity) < n)
      throw new Error('Insufficient actual unreserved owned material.');
    return { s, n };
  });
  if (new Set(selected.map((v) => v.s.id)).size !== selected.length)
    throw new Error('Duplicate material identities are not permitted.');
  return selected;
}
function reserve(
  w: V7World,
  a: V7Actor,
  j: Job,
  raw: V7Data['materials'] | undefined,
) {
  const selected = materials(w, a, raw),
    totals: Record<string, number> = {};
  for (const { s, n } of selected)
    totals[forestMaterialRole(w, s.resource)] =
      (totals[forestMaterialRole(w, s.resource)] ?? 0) + n;
  const required =
    j.mode === 'prepare' ? { branch: 10 } : { stone: 40, bark: 20, vine: 10 };
  if (v7Signature(totals) !== v7Signature(required))
    throw new Error(
      'Material recipe must exactly match the declared real costs.',
    );
  if (
    j.mode === 'prepare' &&
    (selected.length !== 1 || selected[0]?.s.id !== j.target)
  )
    throw new Error(
      'Prepare target and its one branch material must identify the same owned item.',
    );
  for (const { s, n } of selected) {
    const escrow = {
      ...v7Clone(s),
      id: v7Id(w, 'fire-material'),
      reservedFor: j.id,
    };
    foodSetQuantity(escrow, n);
    foodSetQuantity(s, foodTenths(s.quantity) - n);
    w.stacks.push(escrow);
    j.escrow.push(escrow.id);
    j.inputs.push({
      item: s.id,
      escrow: escrow.id,
      resource: s.resource,
      quantity: n / 10,
      origin: s.origin,
    });
  }
}
function validGeometry(w: V7World, a: V7Actor, x: number, y: number) {
  const spatial = hearthSpatial(x, y);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !v7Inside(w, spatial, 0.7) ||
    !v7Reach(a, spatial)
  )
    throw new Error(
      'Hearth must be in bounds and within surface interaction reach.',
    );
  if (
    w.objects.some((o) => v7Interior(spatial, o.spatial)) ||
    forestClimate(w, spatial).indoor
  )
    throw new Error('Hearth requires open sky, outside roofs.');
  if (
    !v7SegmentClear(spatial, spatial, 0.7, v7Obstacles(w)) ||
    w.objects.some(
      (o) => o.spatial.reserved && v7ShapeDistance(spatial, o.spatial) < 0.7,
    ) ||
    w.actors.some(
      (other) =>
        other.vitals.health > 0 &&
        v7Distance(other.position, spatial) < other.radius + 0.7,
    )
  )
    throw new Error(
      'The hearth footprint, clearance and all actor bodies must remain separate.',
    );
  return spatial;
}
function ignition(w: V7World, a: V7Actor, o: V7Object, paid: boolean) {
  const f = fireState(o),
    weather = fireWeather(w, o);
  if (
    f.lit ||
    weather.rain > 0.15 ||
    weather.wind > 0.65 ||
    f.lots.some((l) => l.moisture > 0.35)
  )
    throw new Error(
      'Ignition needs an unlit site, dry fuel, transmitted rain <= 0.15 and wind <= 0.65.',
    );
  for (const [r, q] of [
    ['dry-grass', paid ? 0.4 : 0.5],
    ['branch', 0.5],
  ] as const)
    if (
      f.lots
        .filter((l) => l.resource === r)
        .reduce((n, l) => n + l.quantity, 0) +
        1e-8 <
      q
    )
      throw new Error(
        'Ignition requires actual loaded dry-grass tinder and branch fuel.',
      );
  const j = job(a);
  const kits = w.stacks.filter(
    (s) =>
      s.owner === a.id &&
      s.frictionKit &&
      (paid
        ? s.id === j?.kit && s.reservedFor === j.id
        : !s.reservedFor && s.frictionKit.durability > 0),
  );
  if (kits.length > 1)
    throw new Error(
      'Ambiguous owned usable friction kits: ' +
        kits.map((s) => 'item:' + s.id).join(', ') +
        '. Keep one eligible kit before ignition.',
    );
  const kit = kits[0];
  if (!kit?.frictionKit)
    throw new Error(
      'An owned usable friction kit is required; prepare one from a real branch.',
    );
  return kit;
}
export const FOREST_FIRE: V7Package = {
  id: 'local-fire',
  version: 1,
  dependencies: ['active-warming@1'],
  description:
    'Finite paid stationary hearth, friction ignition, weather-dependent combustion and shared measured warmth.',
  resources: [
    {
      id: 'friction-kit',
      name: 'Branch friction kit',
      mass: 1.1,
      nutrition: 0,
      toxicity: 0,
      color: '#95744c',
    },
  ],
  processes: {},
  visualComponents: ['stone-hearth'],
  satisfaction: [],
  events: [
    'fire-work-started',
    'fire-work-progress',
    'fire-work-completed',
    'fire-work-cancelled',
    'fire-ignited',
    'fire-fed',
    'fire-burned',
    'fire-extinguished',
    'fire-exposure-measured',
    'fire-comfort-qualified',
    'satisfaction-maintained',
  ],
  abilities: [
    {
      id: 'tend-fire',
      name: 'Tend local fire',
      function:
        'Prepare a friction kit, build a covered stone hearth, load real fuel, ignite it or extinguish it.',
      equivalence: 'hearth:stone4-bark2-vine1:friction8:finite-fuel-heat06',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['prepare', 'build', 'ignite', 'feed', 'extinguish'],
          },
          target: { type: 'string', maxLength: 1000 },
          materials: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                target: { type: 'string', maxLength: 1000 },
                quantity: { type: 'number', minimum: 0.1 },
              },
              required: ['target', 'quantity'],
              additionalProperties: false,
            },
          },
          x: { type: 'number' },
          y: { type: 'number' },
        },
        required: ['mode'],
        additionalProperties: false,
      },
      references: { target: 'visible', materials: 'owned' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Prepare/build take 4 stationary paid rounds; ignition 8; feed/extinguish 1. repeat counts completed operations. Escrow survives global pauses; cancellation releases surviving materials once. Spent ignition tinder, kit durability and effort never return.',
      },
      prerequisites: [],
      learning: 6,
      handler: 'fire.work@1',
      revision: 'local-fire@1',
      authored: false,
      costs:
        'prepare: target owned branch and materials [{target,quantity:1}], 4 rounds at 1 energy, produces one equal-mass friction kit with 10 attempts. build: x,y and explicit materials totaling stone4+bark2+vine1; no target, 4 rounds at 1.5 energy, center within existing 0.65 surface interaction reach, radius0.45 plus0.25 clearance excludes solids/water/actors/roofs. feed: target hearth and explicit owned branch/bark/dry-grass/wood materials; exact positive tenths, capacity8 mass, 1 round0.5 energy. ignite: target hearth only, owned usable kit, loaded dry grass0.5+branch0.5, fuel moisture<=0.35, transmitted rain<=0.15, effective wind<=0.65, 8 stationary rounds1.5 energy; first stroke spends one kit attempt and0.1 tinder. extinguish: target only, 1 round0.5 energy.',
      effects:
        'Shared persistent unlit hearth, cover condition80 loses0.25 per rainy round; rain transmission0.2+0.8*(1-condition/80), covered wind0.75. Real fuel moisture gains0.08*rain or dries0.01*(1+wind); lit fuel dries0.08 first. Up to1 actual fuel energy per round scaled by dryness; at most3 ember rounds, rain>0.6 extinguishes. Heat0.6*burnFraction*max(0,1-distance/2)*(1-0.5*wind), walls block, overheat remains. Real residue and released input mass tracked. Three stationary healthy fed rest/wait rounds with measured reduced cold qualify shared thermal-refuge; ongoing qualification maintains the same capped source by0.025/round, otherwise decays0.003. No healing, food, mastery, install reward or free fuel. Cover is not a room; smoke is cosmetic open-air evidence.',
    },
  ],
  handlers: {
    'fire.work@1': ({ world: w, actor: a, action }) => {
      const mode = typeof action.args.mode === 'string' ? action.args.mode : '',
        target =
          typeof action.args.target === 'string' ? action.args.target : '';
      const hasMaterials = action.args.materials !== undefined,
        hasCoords = action.args.x !== undefined || action.args.y !== undefined;
      if (
        (mode === 'build'
          ? !!target ||
            !hasMaterials ||
            typeof action.args.x !== 'number' ||
            typeof action.args.y !== 'number'
          : !target || hasCoords) ||
        (['prepare', 'feed'].includes(mode)
          ? !hasMaterials
          : mode !== 'build' && hasMaterials)
      )
        throw new Error(
          'Mode-specific fields: build requires only x,y,materials; prepare/feed require target,materials; ignite/extinguish target only.',
        );
      let j = job(a);
      const signature = v7Signature(action.args);
      if (
        j &&
        (j.signature !== signature ||
          j.x !== a.position.x ||
          j.y !== a.position.y ||
          j.lastTick !== w.tick - 1)
      ) {
        cancel(w, a, 'operation, position or continuity changed');
        j = null;
      }
      const o = ['ignite', 'feed', 'extinguish'].includes(mode)
        ? site(w, a, target)
        : null;
      if (mode === 'extinguish' && o) {
        v7Spend(a, 0.5);
        const f = fireState(o);
        f.lit = false;
        f.embers = 0;
        f.burnFraction = 0;
        fireEvent(w, a, 'fire-extinguished', o.id, {
          reason: 'explicit',
          energy: 0.5,
        });
        return { complete: true, remaining: 0, writes: [o.id] };
      }
      if (mode === 'feed' && o) {
        const selected = materials(w, a, action.args.materials),
          f = fireState(o);
        const lots = selected.map(({ s, n }) => {
          const r = w.resources.find((r) => r.id === s.resource);
          if (
            !r?.properties ||
            r.properties.fuel <= 0 ||
            !forestFireFuel(w, s.resource)
          )
            throw new Error(
              'Only actual combustible declared materials can be loaded.',
            );
          return {
            item: s.id,
            resource: s.resource,
            quantity: n / 10,
            mass: r.mass,
            energy: r.properties.fuel,
            moisture: s.fuelMoisture ?? forestClimate(w, a.position).rain ?? 0,
          };
        });
        if (
          [...f.lots, ...lots].reduce((n, l) => n + l.quantity * l.mass, 0) >
          8 + 1e-8
        )
          throw new Error('Hearth capacity is eight mass units.');
        v7Spend(a, 0.5);
        for (const { s, n } of selected)
          foodSetQuantity(s, foodTenths(s.quantity) - n);
        f.lots.push(...lots);
        f.history.push({
          tick: w.tick,
          actor: a.id,
          type: 'feed',
          lots: v7Clone(lots),
        });
        fireEvent(w, a, 'fire-fed', o.id, { lots, energy: 0.5 });
        return { complete: true, remaining: 0, writes: [o.id] };
      }
      if (!j) {
        j = {
          id: v7Id(w, 'fire-work'),
          mode,
          target,
          x: a.position.x,
          y: a.position.y,
          elapsed: 0,
          lastTick: w.tick,
          escrow: [],
          inputs: [],
          kit: '',
          signature,
          site: '',
        };
        if (mode === 'build') {
          const spatial = validGeometry(
            w,
            a,
            Number(action.args.x),
            Number(action.args.y),
          );
          reserve(w, a, j, action.args.materials);
          j.site = v7Id(w, 'hearth');
          w.objects.push({
            id: j.site,
            kind: 'hearth-work',
            name: 'Covered stone hearth under construction',
            spatial,
            visual: {
              component: 'stone-hearth',
              color: '#777c73',
              accent: '#ad9467',
              label: 'Paid hearth work',
              state: 'work',
            },
            data: { progress: 0 },
            createdBy: a.id,
            createdAt: w.tick,
            revision: 'local-fire@1',
          });
        } else if (mode === 'prepare') reserve(w, a, j, action.args.materials);
        else if (mode === 'ignite' && o) {
          const kit = ignition(w, a, o, false);
          j.kit = kit.id;
          kit.reservedFor = j.id;
          if (kit.frictionKit) kit.frictionKit.durability--;
          let left = 0.1;
          const f = fireState(o);
          for (const l of f.lots.filter((l) => l.resource === 'dry-grass')) {
            const used = Math.min(left, l.quantity);
            l.quantity -= used;
            left -= used;
            f.ash += used * l.mass;
            f.history.push({
              tick: w.tick,
              type: 'ignition-tinder',
              item: l.item,
              quantity: used,
              mass: used * l.mass,
            });
            if (left <= 1e-8) break;
          }
          f.lots = f.lots.filter((l) => l.quantity > 1e-8);
        } else throw new Error('Unsupported fire operation.');
        a.extensionState['fire:pending'] = j;
        fireEvent(w, a, 'fire-work-started', target, {
          mode,
          inputs: j.inputs,
          kit: j.kit,
          total: duration(mode),
        });
      } else if (mode === 'ignite' && o) ignition(w, a, o, true);
      if (
        !j.escrow.every((id) =>
          w.stacks.some(
            (s) =>
              s.id === id &&
              s.owner === a.id &&
              s.reservedFor === j.id &&
              s.quantity > 0,
          ),
        )
      )
        throw new Error('Reserved fire materials no longer survive.');
      v7Spend(a, mode === 'prepare' ? 1 : 1.5);
      j.elapsed++;
      j.lastTick = w.tick;
      const placeholder = w.objects.find((o) => o.id === j.site);
      if (placeholder) placeholder.data.progress = j.elapsed;
      fireEvent(w, a, 'fire-work-progress', target, {
        mode,
        elapsed: j.elapsed,
        remaining: duration(mode) - j.elapsed,
        energy: mode === 'prepare' ? 1 : 1.5,
      });
      return {
        complete: j.elapsed === duration(mode),
        remaining: duration(mode) - j.elapsed,
        writes: [],
      };
    },
  },
  migrate: (w) => {
    if (!w.config.experience)
      throw new Error('Local fire requires the reviewed experience policy.');
    w.state.localFire = 1;
    const r = w.satisfaction.find((r) => r.id === 'thermal-refuge');
    if (!r) throw new Error('Shared refuge source missing.');
    r.alternativeTriggers = [
      ...(r.alternativeTriggers ?? []),
      { event: 'fire-comfort-qualified', interface: 'tend-fire' },
    ];
    r.maintenance = {
      event: 'fire-comfort-qualified',
      interface: 'tend-fire',
      gain: 0.025,
      decay: 0.003,
    };
    for (const a of w.actors) a.extensionState['harness:local-fire'] = true;
    return w;
  },
  harness: {
    'tend-fire': (o) => ({
      pending: o.self.extensionState['fire:pending'] ?? null,
      lastWork: o.self.extensionState['fire:lastWork'] ?? null,
      lastExposure: o.self.extensionState['fire:exposure'] ?? null,
      sites: o.objects
        .filter((o) => ['stone-hearth', 'hearth-work'].includes(o.kind))
        .map((o) => ({
          id: o.id,
          position: { x: o.spatial.x, y: o.spatial.y },
          state: o.data,
        })),
      kits: o.stacks
        .filter((s) => s.owner === o.self.id && s.frictionKit)
        .map((s) => ({
          item: s.id,
          durability: s.frictionKit?.durability ?? 0,
        })),
    }),
  },
  onDeath: (w, a) => {
    cancel(w, a, 'owner died');
    delete a.extensionState['fire:comfort'];
  },
};
export function fireAfterRound(before: V7World, w: V7World) {
  if (w.state.localFire !== 1) return;
  for (const a of w.actors) {
    const j = job(a);
    if (j) {
      const alive =
        a.vitals.health > 0 &&
        !w.events.some((e) => e.actor === a.id && e.type === 'died');
      const intact = j.escrow.every((id) =>
        w.stacks.some(
          (s) =>
            s.id === id &&
            s.owner === a.id &&
            s.reservedFor === j.id &&
            s.quantity > 0,
        ),
      );
      if (
        !alive ||
        j.lastTick !== w.tick ||
        j.x !== a.position.x ||
        j.y !== a.position.y ||
        !intact
      )
        cancel(
          w,
          a,
          'work, surviving inputs, life or stationary position invalidated',
        );
      else if (j.elapsed === duration(j.mode)) {
        let output: string;
        if (j.mode === 'prepare') {
          output = v7Id(w, 'friction-kit');
          w.stacks.push({
            id: output,
            resource: 'friction-kit',
            quantity: 1,
            owner: a.id,
            position: { ...a.position },
            origin: j.id,
            frictionKit: { durability: 10, inputs: j.inputs },
          });
        } else if (j.mode === 'build') {
          const o = w.objects.find((o) => o.id === j.site);
          if (!o) throw new Error('Reserved hearth footprint disappeared.');
          output = o.id;
          o.kind = 'stone-hearth';
          o.name = 'Covered stone hearth';
          o.visual.state = 'cold';
          o.data = {
            condition: 80,
            lit: false,
            embers: 0,
            lots: [],
            inputs: j.inputs,
            ash: 0,
            releasedMass: 0,
            burnedMass: 0,
            burnFraction: 0,
            rain: 0,
            wind: 0,
            moisture: 0,
            lastTick: w.tick,
            history: [],
          };
        } else {
          const o = site(w, a, j.target);
          try {
            ignition(w, a, o, true);
            const f = fireState(o);
            f.lit = true;
            f.embers = 3;
            output = o.id;
            fireEvent(w, a, 'fire-ignited', o.id, {
              kit: j.kit,
              elapsed: j.elapsed,
            });
          } catch {
            cancel(w, a, 'ignition conditions invalidated before completion');
            continue;
          }
        }
        w.stacks = w.stacks.filter((s) => !j.escrow.includes(s.id));
        for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
          delete s.reservedFor;
        fireEvent(w, a, 'fire-work-completed', output, {
          mode: j.mode,
          inputs: j.inputs,
          elapsed: j.elapsed,
        });
        a.extensionState['fire:lastWork'] = {
          ...v7Clone(j),
          status: 'completed',
          output,
        };
        delete a.extensionState['fire:pending'];
      }
    }
    const old = before.actors.find((old) => old.id === a.id),
      raw = a.extensionState['fire:exposure'];
    const e =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    const stationary =
      !!old &&
      old.position.x === a.position.x &&
      old.position.y === a.position.y;
    const resting = w.events.some(
      (ev) =>
        ev.actor === a.id &&
        ev.success &&
        ['rest', 'wait'].includes(ev.interface ?? ''),
    );
    const qualified =
      e?.tick === w.tick &&
      Number(e.heat) > 0 &&
      Number(e.reducedCold) > 0 &&
      stationary &&
      resting &&
      old.vitals.satiety > 0 &&
      a.vitals.health >= old.vitals.health &&
      !w.events.some(
        (ev) => ev.actor === a.id && ['injured', 'died'].includes(ev.type),
      );
    const count = qualified
      ? Number(a.extensionState['fire:comfort'] ?? 0) + 1
      : 0;
    a.extensionState['fire:comfort'] = count;
    if (count >= 3)
      fireEvent(w, a, 'fire-comfort-qualified', 'thermal-refuge', {
        qualified: true,
        rounds: count,
        measurement: e,
      });
  }
}
