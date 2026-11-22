import type {
  V7ActionContext,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7Record,
  v7String,
} from './continuous-data.js';
import { v7ObjectSchema } from './continuous-base.js';
import { forestResolveReference } from './forest-references.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import {
  materialLots,
  materialRefresh,
  materialValidate,
} from './material-lots.js';
import {
  collectiveJobs,
  workCreate,
  workFind,
  workPay,
  workResult,
  workStop,
} from './collective-work.js';
import { forestEvent } from './forest-climate.js';

const ID = 'material-stack-combine';
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, value]) => JSON.stringify(k) + ':' + canonical(value))
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}
/** A deterministic observable version, not an authority token. Revalidation still reads actual state. */
function version(s: V7Stack) {
  let h = 2166136261;
  for (const char of canonical(s))
    h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return 'material-' + (h >>> 0).toString(16);
}
function compatibility(w: V7World, s: V7Stack): string {
  materialValidate(s);
  const leaves = materialLots(s),
    profiles = leaves.map((lot) => {
      const r = collectiveFoodProfile(w, lot);
      // This first conservative version handles passive material supplies. Stateful transformations
      // and edible blending require their own compositional laws, rather than inheriting one lot's effects.
      if (
        !r ||
        r.nutrition !== 0 ||
        lot.frictionKit ||
        lot.waterCup ||
        lot.mantle ||
        lot.materialLayer ||
        lot.canopyDrying
      )
        throw new Error(
          'This version combines passive material supplies; food, equipment and active treatment require a represented combination law.',
        );
      const processing = lot.processing ?? {};
      const permitted = [
        'barkProfile',
        'source',
        'sourceOrigin',
        'sourceHistory',
        'work',
        'separated',
        'collectiveWorkReleased',
        'combinedSupply',
      ];
      if (Object.keys(processing).some((key) => !permitted.includes(key)))
        throw new Error(
          'Incompatible or unsupported active processing state; no material was changed.',
        );
      return canonical({
        resource: lot.resource,
        profile: r,
        physical: lot.physical ?? null,
        fuelMoisture: lot.fuelMoisture ?? null,
        separated: processing.separated ?? null,
      });
    });
  if (!profiles.length || profiles.some((p) => p !== profiles[0]))
    throw new Error(
      'Component intrinsic properties or material forms are incompatible.',
    );
  return profiles[0] ?? '';
}
function sources(c: V7ActionContext): V7Stack[] {
  const refs = c.action.args.sourceIds;
  if (!Array.isArray(refs) || refs.length < 2 || refs.length > 16)
    throw new Error('Supply 2–16 distinct actual owned sourceIds.');
  const stacks = refs.map((ref) => {
    const id = forestResolveReference(
      c.world,
      c.actor,
      v7String(ref, 'sourceId'),
      'owned',
      0.1,
    );
    const s = c.world.stacks.find((s) => s.id === id);
    if (!s) throw new Error('Resolved source disappeared.');
    // In this engine unreserved owner-attributed stacks are carried. Ground stacks have owner null;
    // reservations are never eligible. A stale production position is not an owned-ground disposition.
    return s;
  });
  if (new Set(stacks.map((s) => s.id)).size !== stacks.length)
    throw new Error('Duplicate source identity.');
  const signatures = stacks.map((s) => compatibility(c.world, s));
  if (signatures.some((s) => s !== signatures[0]))
    throw new Error(
      'Different canonical units, intrinsic properties or material forms.',
    );
  return stacks;
}
function execute(c: V7ActionContext) {
  const operation = v7String(c.action.args.operation, 'operation');
  if (operation === 'status') {
    const selected = c.action.args.sourceIds ? sources(c) : [];
    const j = c.action.args.processId ? workFind(c) : undefined;
    c.emit(
      'material-combine-status',
      'Observed actual supplies and any named personal operation; no material or reward changes.',
      {
        sources: v7Json(
          selected.map((s) => ({
            id: s.id,
            quantityTenths: Math.round(s.quantity * 10),
            version: version(s),
            componentLots: materialLots(s),
          })),
        ),
        operation: j ? v7Json(j) : null,
      },
    );
    return { complete: true, writes: [] };
  }
  if (operation === 'cancel') {
    const j = workFind(c);
    if (!j) throw new Error('No exact personal operation to cancel.');
    workStop(
      c.world,
      c.actor,
      j,
      'Cancelled; surviving original sources released once.',
      false,
    );
    c.emit(
      'material-combine-stopped',
      'Original sources retained; no material refund or duplicate.',
      { ...j },
      j.id,
    );
    return workResult(j);
  }
  if (operation !== 'combine')
    throw new Error('Unknown material combination operation.');
  if (c.actor.vitals.health <= 0 || c.actor.vitals.energy < 0.5)
    throw new Error('A living performer with 0.5 energy is required.');
  const items = sources(c),
    versions = items.map(version);
  const expected =
    c.action.args.expectedVersions === undefined
      ? null
      : v7Record(c.action.args.expectedVersions);
  if (
    expected &&
    (Object.keys(expected).some((id) => !items.some((s) => s.id === id)) ||
      items.some((s, i) => expected[s.id] !== versions[i]))
  )
    throw new Error(
      'Expected source versions do not match all actual selected supplies.',
    );
  const j = workCreate(c, 'combine', 1);
  j.escrow = items.map((s) => s.id);
  j.sources = items.map((s, i) => ({
    itemId: s.id,
    version: versions[i] ?? '',
    quantityTenths: Math.round(s.quantity * 10),
    owner: s.owner,
    position: { ...s.position },
  }));
  for (const s of items) s.reservedFor = j.id;
  c.emit(
    'material-combine-started',
    'One bounded round of handling reserved original owned supplies.',
    { ...j, componentLots: v7Json(items.flatMap(materialLots)) },
    j.id,
  );
  // The handler is atomic within the world barrier; there is no asynchronous interval in this round.
  // The recheck also protects a restored/prepared transaction without cloning its original inputs.
  for (const [i, s] of items.entries()) {
    const check = v7Clone(s);
    delete check.reservedFor;
    if (
      s.owner !== c.actor.id ||
      s.reservedFor !== j.id ||
      version(check) !== versions[i]
    )
      throw new Error('Source changed before material commitment.');
    compatibility(c.world, s);
  }
  if (!workPay(c, j, 0.5)) return workResult(j);
  const first = items[0];
  if (!first) throw new Error('Missing committed source.');
  const output: V7Stack = {
    ...v7Clone(first),
    id: v7Id(c.world, 'item'),
    owner: c.actor.id,
    position: { ...c.actor.position },
    origin: j.id,
    processing: { ...first.processing, combinedSupply: j.id },
    componentLots: items.flatMap(materialLots).map((lot) => {
      delete lot.reservedFor;
      return lot;
    }),
  };
  delete output.reservedFor;
  materialRefresh(output);
  materialValidate(output);
  c.world.stacks = c.world.stacks.filter((s) => !j.escrow.includes(s.id));
  c.world.stacks.push(output);
  j.status = 'completed';
  j.outputs = [output.id];
  c.emit(
    'material-combine-completed',
    'Actual supplies combined once; no quality, facility or wellbeing benefit is awarded.',
    {
      ...j,
      outputId: output.id,
      quantityTenths: output.quantityTenths ?? 0,
      componentLots: v7Json(output.componentLots),
      costs: { energy: j.paidEnergy, rounds: 1 },
    },
    output.id,
  );
  return { ...workResult(j), writes: [...j.escrow, output.id, j.id] };
}
export const COLLECTIVE_MATERIAL_COMBINE: V7Package = {
  id: ID,
  version: 1,
  scope: 'collective-ex12',
  dependencies: ['foundation-open@1'],
  description:
    'Conservative addressable passive supplies with actual original component lots.',
  reuse: {
    experiment: 'ex11 generic owned material reservations',
    source: 'collective-work.ts; forest-references.ts',
    description:
      'Implementation reuse only; this new combination interface requires current approval and individual study.',
  },
  abilities: [
    {
      id: ID,
      name: 'Combine compatible material supplies',
      function:
        'Combine actual compatible passive material stacks into one addressable supply with conserved component provenance.',
      equivalence: 'material:passive-compatible-lots:combine:1',
      parameters: {
        ...v7ObjectSchema({
          operation: { type: 'string', enum: ['combine', 'status', 'cancel'] },
          sourceIds: {
            type: 'array',
            items: { type: 'string' },
          },
          expectedVersions: { type: 'object', additionalProperties: true },
          processId: { type: 'string' },
        }),
        required: ['operation'],
      },
      prerequisites: [],
      learning: 1,
      costs:
        'Combine: 2–16 distinct exact owned unlocked carried supplies, one active round and 0.5 energy. Status: one round, no energy; supply sourceIds or personal processId. Cancel names a still-active processId. Optional expectedVersions maps every exact source ID to the version returned by status; any change rejects.',
      effects:
        'Same canonical unit, passive form and intrinsic profile required; histories and ages may differ and remain separate. Edible blends, indivisible equipment and active processing have no generic combination law in this version. Ground supplies must first be actually picked up; this engine has no unreserved privately owned ground disposition. No teleportation or added material. Exact stable slices preserve partial reservations, transfers and per-component spoilage. Aggregation awards no pleasure, practice or understanding.',
      handler: 'collective.material-combine',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'material-combine-completed',
      references: {},
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One atomic paid handling round; started event shows one remaining work, completed shows zero. Status exposes real versions and lots. Cancel/death releases unsettled original records once.',
      },
      dependencies: { abilities: [], resources: [], knowledge: [] },
    },
  ],
  handlers: { 'collective.material-combine': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: [],
  events: [
    'material-combine-started',
    'material-combine-completed',
    'material-combine-stopped',
    'material-combine-status',
  ],
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    )) {
      workStop(
        w,
        a,
        j,
        'Performer died; original sources released at actual death location.',
        true,
      );
      forestEvent(
        w,
        'material-combine-stopped',
        'Actual original supplies released once after death.',
        a.position,
        a.id,
        { ...j },
        j.id,
      );
    }
  },
};
