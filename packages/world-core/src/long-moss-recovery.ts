import type {
  V7ActionContext,
  V7Package,
  V7World,
} from './continuous-types.js';
import { v7Id, v7Json, v7String } from './continuous-data.js';
import { v7ObjectSchema, v7Spend, v7Load } from './continuous-base.js';
import { v7Distance, v7Reach, v7Visible } from './continuous-geometry.js';
import { forestResolveReference } from './forest-references.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { collectiveJobs } from './collective-work.js';
import { personalEvidence } from './long-food-evidence.js';
import { MOSS_NUT_BINDING } from './long-moss-opening.js';
import { nutModel, nutRevision } from './long-nut-contact.js';
import { nutExecute } from './long-nut-work.js';
const ID = 'moss-exposed-hazelnut-assessment-and-recovery',
  ITEM = 'item-140-moss-811',
  TOOL = 'item-171-moss-994',
  SUPPORT = 'start-2-stone',
  PROCESS = 'manual-178-moss-1044';
function sourceProcess(w: V7World, actor: string, id: unknown) {
  const j = collectiveJobs(w, MOSS_NUT_BINDING.id).find((j) => j.id === id);
  if (
    actor !== 'moss' ||
    id !== PROCESS ||
    !j ||
    j.owner !== actor ||
    j.toolId !== TOOL ||
    j.target !== SUPPORT ||
    !j.sources.some(
      (s) =>
        s.itemId === ITEM &&
        s.origin === 'forest-hazelnut-1' &&
        s.quantity === 1,
    )
  )
    throw Error('The exact personally authorized source process is required.');
  return j;
}
function assess(c: V7ActionContext) {
  const j = sourceProcess(c.world, c.actor.id, c.action.args.processId);
  // Observation permission for this person's exact process never releases a real lock.
  const view = {
    ...c.world,
    objects: c.world.objects.map((o) =>
      o.id === SUPPORT && o.data.nutContactLock === j.id
        ? { ...o, spatial: { ...o.spatial, reserved: false } }
        : o,
    ),
    stacks: c.world.stacks.map((s) => {
      if (s.reservedFor !== j.id || ![ITEM, TOOL].includes(s.id)) return s;
      const copy = { ...s };
      delete copy.reservedFor;
      return copy;
    }),
  };
  const resolve = (key: string, scope: 'visible' | 'object') =>
    forestResolveReference(
      view,
      c.actor,
      v7String(c.action.args[key], key),
      scope,
      scope === 'visible' ? 1 : 0,
    );
  if (
    resolve('specimenId', 'visible') !== ITEM ||
    resolve('toolId', 'visible') !== TOOL ||
    resolve('supportId', 'object') !== SUPPORT
  )
    throw Error(
      'Name the actual source, actuator and support; no substitution.',
    );
  const s = c.world.stacks.find((s) => s.id === ITEM),
    t = c.world.stacks.find((s) => s.id === TOOL),
    o = c.world.objects.find((o) => o.id === SUPPORT),
    m = nutModel(c.world, MOSS_NUT_BINDING);
  if (
    !s ||
    !t ||
    !o ||
    s.quantity !== 1 ||
    t.quantity !== 1 ||
    t.resource !== 'stone' ||
    s.origin !== 'forest-hazelnut-1' ||
    s.harvestedAt !== 140 ||
    nutRevision(s) !== m.currentRevision ||
    [s, t].some(
      (x) =>
        (x.owner !== null && x.owner !== c.actor.id) ||
        (x.owner === null &&
          (v7Distance(c.actor.position, x.position) > 0.65 ||
            !v7Visible(c.world, c.actor.position, x.position))),
    ) ||
    !v7Reach(c.actor, o.spatial) ||
    !v7Visible(c.world, c.actor.position, o.spatial)
  )
    throw Error(
      'The unchanged surviving whole assembly/tool and reachable visible support are required.',
    );
  const { evidence } = personalEvidence(c);
  v7Spend(c.actor, 0.5);
  const reportId = v7Id(c.world, 'recovery-assessment'),
    key = 'recovery:' + reportId;
  const ownLocks =
    c.world.stacks.filter((s) => s.reservedFor === j.id).length +
    c.world.objects.filter((o) => o.data.nutContactLock === j.id).length;
  const recovery = [s, t].map((x) => {
    const energy = 1 + foodUnitMass(c.world, x) * 0.2,
      local =
        x.owner === null &&
        v7Distance(c.actor.position, x.position) <=
          c.actor.radius + c.world.config.interaction;
    return {
      itemId: x.id,
      position: { ...(x.owner === c.actor.id ? c.actor.position : x.position) },
      custody: x.owner === c.actor.id ? 'carried' : 'ground',
      reservation: x.reservedFor === j.id ? 'this personal process' : null,
      currentlyUnreserved: !x.reservedFor,
      reachableForWholePickup: local,
      pickupSupportedNow:
        local && !x.reservedFor && c.actor.vitals.energy >= energy,
      pickupEnergy: energy,
      quantity: 1,
    };
  });
  const previous = c.actor.memory.knowledge?.['nut-opening:' + PROCESS];
  c.emit(
    'recovery-assessment-completed',
    'Limited exposure; separation unresolved. Actual release and pickup are separate.',
    {
      component: 'assessment-overlay',
      processId: j.id,
      sourceId: s.id,
      toolId: t.id,
      supportId: o.id,
      reportId,
      status: 'observed-access',
      observedTick: c.world.tick,
      qualified: false,
    },
    s.id,
  );
  const eventId = c.world.events.at(-1)?.id ?? '';
  c.actor.memory.knowledge ??= {};
  c.actor.memory.knowledge[key] = {
    key,
    subject: s.id,
    property: 'dated exposed-assembly access and recovery status',
    value: v7Json({
      reportId,
      eventId,
      tick: c.world.tick,
      process: {
        id: j.id,
        status: j.status,
        paidContacts: j.completedWork,
        remainingWork: j.remainingWork,
        remainingLocks: ownLocks,
        releaseEligibility:
          'Only this process locks; already-clear release is idempotent, no pickup.',
      },
      sourceRevision: nutRevision(s),
      recovery,
      currentLoad: v7Load(c.world, c.actor),
      carrying:
        'Baseline pickup has no separate hard capacity cap; actual mass increases subsequent movement cost. Each pickup independently validates current energy, range and access.',
      observed: {
        covering: s.processing?.covering ?? 'unavailable',
        limitedExposure: m.exposed && s.processing?.interiorObserved === true,
        previousInspection: previous
          ? {
              key: previous.key,
              tick: previous.tick,
              evidence: previous.evidence,
            }
          : null,
        scope:
          'Limited already observed region, not whole interior or new food evidence.',
      },
      separation: {
        status: 'unresolved',
        clearance: 'unavailable for internal handling',
        retention: 'unavailable',
        detachableComponent: 'not represented',
        actuatorAndReceiver:
          'No suitable manipulation/retention mechanism established; no executable separation quote.',
      },
      geometry: {
        resolution: 0.02,
        uncertainty: 0.01,
        scope: 'Existing exterior model only, not aperture measurement',
      },
      suppliedPersonalEvidence: evidence,
      food: 'Identity, preparation, safety and nutrition remain unresolved.',
      novelInformation: false,
    }),
    method: 'paid local observation plus exact personal process control facts',
    condition: 'No displacement, material allocation, new trial or food claim.',
    verified: false,
    tick: c.world.tick,
    evidence: eventId,
  };
  return { complete: true, writes: [] };
}
export const LONG_MOSS_RECOVERY: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: [
    'moss-source-bound-hazelnut-interior-access-trial@1',
    'opened-hazelnut-preparation-assessment@1',
  ],
  description:
    'Private source access/readiness report and delegation to the original process release; baseline pickup remains separate.',
  reuse: {
    experiment: 'ex13',
    source:
      'moss-source-bound-hazelnut-interior-access-trial@1; opened-hazelnut-preparation-assessment@1; long-nut-work.ts; forest-references.ts; base.pickup',
    description:
      'Reuses the real process/inspection ledger, private evidence and existing local pickup rules. Actual round181 inputs are already unlocked; this is a control/assessment precursor, not a demonstrated lock repair or material invention. Administrative release delegates to the same work handler/ledger, including idempotent settled cleanup, without changing old public cancellation behavior.',
  },
  migrate: (w) => {
    sourceProcess(w, 'moss', PROCESS);
    return w;
  },
  abilities: [
    {
      id: ID,
      name: 'Exposed specimen access and recovery assessment',
      function:
        'Assess the actual nearby exposed forest assembly, process locks and local whole-item recovery; separately release only its own remaining locks. No separation.',
      equivalence: 'control:forest-nut:exposed-access-recovery:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['assess', 'release'] },
          processId: { type: 'string' },
          specimenId: { type: 'string' },
          toolId: { type: 'string' },
          supportId: { type: 'string' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        }),
        required: ['mode', 'processId'],
      },
      references: {},
      prerequisites: [],
      learning: 1,
      learningEnergy: 0.2,
      costs:
        'Study1 round/0.2. Assess(processId=manual-178-moss-1044,specimenId=item-140-moss-811,toolId=item-171-moss-994,supportId=start-2-stone,evidenceRefs=[]):1 atomic round/0.5 energy, current lawful reach/source checks before pay. Own process observation does not release locks. Release(processId):one administrative action/0 additional energy, idempotent, no pickup; only original process locks at actual locations. Baseline pickup of each actual ground item is separate and retains its normal cost and new item ID semantics.',
      effects:
        'Private dated access, location, reservation and pickup readiness facts plus prior limited-exposure citation. Empty inventory does not mean inputs vanished. No new geometry, aperture, interior anatomy, receiver, tool, separation, material, wear, repair, ingestion, nutrition or reward. Existing2 contacts and paid progress stay exhausted; zero pleasure/practice/curiosity/comfort for this precursor. Release delegates to original work ledger; completed-state cleanup preserves status/changes and releases only surviving own locks once. No remote return. Atomic invalid access fails before pay; no ongoing process, maintenance or automatic refresh. Ordinary ageing continues.',
      handler: 'long.moss-recovery',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'recovery-assessment-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic observation or explicit administrative release; physical pickup remains a separate real action.',
      },
    },
  ],
  handlers: {
    'long.moss-recovery': (c) => {
      if (c.action.args.mode === 'assess') return assess(c);
      if (c.action.args.mode !== 'release')
        throw Error('Use assess or release.');
      sourceProcess(c.world, c.actor.id, c.action.args.processId);
      return nutExecute(
        {
          ...c,
          action: {
            interface: MOSS_NUT_BINDING.id,
            args: {
              mode: 'release',
              processId: c.action.args.processId ?? null,
            },
          },
        },
        MOSS_NUT_BINDING,
      );
    },
  },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: [
    'recovery-assessment-completed',
    'nut-opening-released',
    'recovery-assessment-practice',
  ],
};
