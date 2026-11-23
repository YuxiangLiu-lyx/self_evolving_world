import { personalEvidence } from './long-food-evidence.js';
import type { NutBinding } from './long-nut-contact.js';
import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7World,
} from './continuous-types.js';
import {
  v7Id,
  v7Json,
  v7Record,
  v7Signature,
  v7String,
} from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { v7Reach } from './continuous-geometry.js';
import {
  collectiveJobs,
  workCreate,
  workFind,
  workPay,
  workResult,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  NUT_BINDING,
  nutModel,
  nutSpecimen,
  nutInputs,
  nutReference,
  nutRevision,
} from './long-nut-contact.js';
function sync(a: V7Actor, j: CollectiveWork) {
  if (['active', 'paused'].includes(j.status))
    a.extensionState['long:work:nut-opening'] = v7Json(j);
  else {
    delete a.extensionState['long:work:nut-opening'];
    a.extensionState['long:last-nut-opening'] = v7Json(j);
  }
}
export function nutRelease(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  status: string,
  allowSettled = false,
) {
  if (
    !['active', 'paused'].includes(j.status) &&
    !(allowSettled && ['completed', 'stopped'].includes(j.status))
  )
    throw new Error('This process is already settled.');
  for (const s of w.stacks) if (s.reservedFor === j.id) delete s.reservedFor;
  const o = w.objects.find(
    (o) => o.id === j.target && o.data.nutContactLock === j.id,
  );
  if (o) {
    delete o.data.nutContactLock;
    o.spatial.reserved = false;
  }
  j.status = status;
  sync(a, j);
}
function remember(
  c: V7ActionContext,
  key: string,
  value: unknown,
  verified: boolean,
  binding: NutBinding,
) {
  c.actor.memory.knowledge ??= {};
  c.actor.memory.knowledge[key] = {
    key,
    subject: binding.item,
    property: 'source-bound opening evidence',
    value: v7Json(value),
    method: 'paid local bounded contact or observation',
    condition: 'No safety, composition, nutrition or measured force claim.',
    verified,
    tick: c.world.tick,
    evidence: c.world.events.at(-1)?.id ?? '',
  };
}
function findings(c: V7ActionContext, j: CollectiveWork, binding: NutBinding) {
  const m = nutModel(c.world, binding),
    s = nutSpecimen(c, false, j.id, binding);
  const result = {
    processId: j.id,
    specimenId: s.id,
    tick: c.world.tick,
    location: { ...(s.owner === c.actor.id ? c.actor.position : s.position) },
    covering: binding.groundTool
      ? m.exposed
        ? 'actual contact discontinuity'
        : m.damage > m.threshold / 2
          ? 'bounded visible deformation'
          : 'unresolved sub-resolution response'
      : m.damage > 0
        ? 'actual contact discontinuity'
        : 'unchanged covering',
    exposed: m.exposed,
    interior: m.exposed
      ? {
          color: m.interiorColor,
          texture: m.interiorTexture,
          view: 'limited exposed region; no whole interior or safety claim',
        }
      : null,
  };
  if (binding.groundTool && m.exposed && s.processing) {
    s.processing.interiorObserved = true;
    m.currentRevision = nutRevision(s);
    j.currentRevision = m.currentRevision;
    j.condition = v7Json(s.processing);
  }
  c.emit(
    'nut-opening-inspected',
    'Paid local inspection of the actual retained specimen; safety unverified.',
    { processId: j.id, exposed: result.exposed, qualified: false },
    s.id,
  );
  remember(c, 'nut-opening:' + j.id, result, true, binding);
  const signature = v7Signature({
    covering: result.covering,
    exposed: result.exposed,
    interior: result.interior,
  });
  const raw = c.actor.extensionState['long:nut:confirmed-opening'],
    confirmed = Array.isArray(raw) ? raw : [];
  const equivalent = Object.values(c.actor.memory.knowledge ?? {}).some(
    (k) =>
      k.subject === binding.item &&
      k.key !== 'nut-opening:' + j.id &&
      k.verified &&
      v7Signature(v7Record(k.value).observedState ?? k.value) === signature,
  );
  if (!confirmed.includes(signature)) {
    c.actor.extensionState['long:nut:confirmed-opening'] = [
      ...confirmed,
      signature,
    ];
    // An unchanged opaque covering was already examined; only actual new damage/exposure qualifies.
    if (m.damage > 0 && !equivalent)
      c.emit(
        'information-confirmed',
        'New directly observed damage or exposure; full finding remains personal.',
        {
          key: 'nut-opening:' + j.id,
          evidence: c.world.events.at(-1)?.id ?? '',
          qualified: true,
        },
        s.id,
      );
  }
}
export function nutExecute(c: V7ActionContext, binding = NUT_BINDING) {
  if (c.actor.id !== binding.actor || c.actor.vitals.health <= 0)
    throw new Error(
      'This source-bound trial requires the living reviewed owner.',
    );
  const mode = c.action.args.mode;
  if (mode === 'assess') {
    if (nutReference(c, 'specimenId', 'owned') !== binding.item)
      throw new Error('Name the reviewed specimen.');
    const s = nutSpecimen(c, true, undefined, binding),
      m = nutModel(c.world, binding),
      id = v7Id(c.world, 'nut-assessment');
    let inputs: ReturnType<typeof nutInputs> | undefined;
    if (c.action.args.toolId && c.action.args.supportId)
      inputs = nutInputs(
        c,
        nutReference(c, 'toolId', 'owned'),
        nutReference(c, 'supportId', 'object'),
        undefined,
        undefined,
        binding,
      );
    else {
      if (c.action.args.toolId) nutReference(c, 'toolId', 'owned');
      if (c.action.args.supportId) {
        const supportId = nutReference(c, 'supportId', 'object');
        const support = c.world.objects.find((o) => o.id === supportId);
        if (!support || !v7Reach(c.actor, support.spatial))
          throw new Error('Reach the nominated support before assessment.');
      }
    }
    const ownEvidence = binding.groundTool ? personalEvidence(c) : null;
    v7Spend(c.actor, 0.5);
    const executable = !!inputs && m.contacts < 2 && !m.exposed;
    const report: V7Data = {
      ...(ownEvidence
        ? { suppliedPersonalEvidence: v7Json(ownEvidence.evidence) }
        : {}),
      assessmentId: id,
      specimenId: s.id,
      sourceRevision: nutRevision(s),
      executable,
      toolId: inputs?.tool.id ?? null,
      supportId: inputs?.support.id ?? null,
      toolRevision: inputs ? nutRevision(inputs.tool) : null,
      supportRevision: inputs
        ? v7Signature({
            spatial: inputs.support.spatial,
            resource: inputs.support.data.resource,
          })
        : null,
      point: inputs?.point ?? null,
      quote: {
        maxRounds: 2 - m.contacts,
        energyPerRound: 1,
        toolBluntingPerContact: 0.002,
        consumption: 0,
        fractureGuarantee: false,
        ...(binding.groundTool
          ? {
              maxEffortPerContact: 1,
              decayDomain: [0, 1000],
              detachment: false,
              toolFracture: false,
            }
          : {}),
      },
      model: binding.id + '@1',
      assumptions: m.assumption,
      observedGeometry: inputs
        ? {
            toolDiameter: 0.12,
            supportRadius:
              inputs.support.spatial.shape.kind === 'circle'
                ? inputs.support.spatial.shape.radius
                : null,
            resolution: 0.02,
            uncertainty: 0.01,
          }
        : null,
      limitation: executable
        ? 'Abstract bounded response, not calibrated force. Begin retains actual matter at the support; pickup is separate.'
        : 'Obtain and nominate an actual whole stone and accessible solid rock support, or this version effort ceiling has already been reached. No opening or reservation performed.',
    };
    c.world.state['long:nut:assessment:' + id] = {
      ...report,
      owner: c.actor.id,
    };
    c.emit(
      'nut-opening-assessed',
      'Paid prerequisite assessment; no specimen transformation.',
      { assessmentId: id, executable, qualified: false },
      s.id,
    );
    remember(c, 'nut-assessment:' + id, report, !!inputs, binding);
    return { complete: true, writes: [] };
  }
  let j = workFind(c);
  // The separately learned recovery adapter delegates here; old public schemas
  // do not expose this administrative mode or change prior cancellation semantics.
  if (mode === 'release' && binding.groundTool) {
    if (!j || c.action.args.processId !== j.id)
      throw Error('Release requires the exact personal process.');
    const processId = j.id;
    const count =
      c.world.stacks.filter((s) => s.reservedFor === processId).length +
      c.world.objects.filter((o) => o.data.nutContactLock === processId).length;
    nutRelease(
      c.world,
      c.actor,
      j,
      ['completed', 'stopped'].includes(j.status) ? j.status : 'stopped',
      true,
    );
    c.emit(
      'nut-opening-released',
      count
        ? 'Existing process locks released at actual locations.'
        : 'Existing process was already released; no physical change.',
      {
        processId: j.id,
        releasedLocks: count,
        status: j.status,
        qualified: false,
      },
      binding.item,
    );
    return { complete: true, writes: [] };
  }
  if (mode === 'inspect') {
    if (!j || c.action.args.processId !== j.id)
      throw new Error('Inspect requires the exact personal process.');
    nutSpecimen(c, false, j.id, binding);
    v7Spend(c.actor, 0.2);
    findings(c, j, binding);
    return { complete: true, writes: [] };
  }
  if (mode === 'cancel') {
    if (!j || c.action.args.processId !== j.id)
      throw new Error('Cancel requires the exact unfinished personal process.');
    nutRelease(c.world, c.actor, j, 'stopped');
    c.emit(
      'nut-opening-stopped',
      'Cancelled; paid contact and damage remain, no refund or automatic retrieval.',
      { processId: j.id, qualified: false },
      binding.item,
    );
    return workResult(j);
  }
  if (!['begin', 'resume'].includes(v7String(mode, 'mode')))
    throw new Error('Unknown opening operation.');
  if (!j) {
    if (
      mode !== 'begin' ||
      nutReference(c, 'specimenId', 'owned') !== binding.item
    )
      throw new Error(
        'Begin requires the exact owned specimen and paid assessment.',
      );
    const a = v7Record(
        c.world.state[
          'long:nut:assessment:' +
            v7String(c.action.args.assessmentId, 'assessmentId')
        ],
      ),
      s = nutSpecimen(c, true, undefined, binding),
      m = nutModel(c.world, binding);
    if (
      a.owner !== c.actor.id ||
      a.executable !== true ||
      a.sourceRevision !== nutRevision(s) ||
      m.contacts >= 2 ||
      m.exposed
    )
      throw new Error(
        'A current executable personal assessment is required; past damage and the lifetime contact ceiling never reset.',
      );
    if (
      binding.groundTool &&
      (nutReference(c, 'toolId', 'owned') !== a.toolId ||
        nutReference(c, 'supportId', 'object') !== a.supportId)
    )
      throw Error(
        'Begin requires the exact independently selected quoted tool and support.',
      );
    const inputs = nutInputs(
      c,
      String(a.toolId),
      String(a.supportId),
      undefined,
      v7Record(a.point) as { x: number; y: number },
      binding,
    );
    if (
      nutRevision(inputs.tool) !== a.toolRevision ||
      v7Signature({
        spatial: inputs.support.spatial,
        resource: inputs.support.data.resource,
      }) !== a.supportRevision
    )
      throw new Error('Tool or support changed after the quote; assess again.');
    if (c.actor.vitals.energy < 1)
      throw new Error(
        'Contact requires1 energy before reserving or placing matter.',
      );
    j = workCreate(c, 'opening', 2 - m.contacts);
    j.x = inputs.point.x;
    j.y = inputs.point.y;
    j.target = inputs.support.id;
    j.toolId = inputs.tool.id;
    j.assessmentId = String(a.assessmentId);
    j.model = binding.id + '@1';
    j.sourceRevision = nutRevision(s);
    j.selection = v7Json(c.action.args);
    j.escrow = [s.id, inputs.tool.id];
    j.sources = [{ itemId: s.id, quantity: 1, origin: s.origin }];
    s.owner = null;
    s.position = { ...inputs.point };
    s.reservedFor = j.id;
    inputs.tool.reservedFor = j.id;
    if (binding.groundTool) {
      inputs.tool.owner = null;
      inputs.tool.position = { ...inputs.point };
    }
    inputs.support.data.nutContactLock = j.id;
    inputs.support.spatial.reserved = true;
  }
  if (
    !['active', 'paused'].includes(j.status) ||
    (mode === 'resume' && c.action.args.processId !== j.id) ||
    (mode === 'begin' &&
      v7Signature(c.action.args) !== v7Signature(j.selection))
  )
    throw new Error(
      'Resume exact unfinished work; completed contacts cannot be replayed or replaced.',
    );
  let inputs: ReturnType<typeof nutInputs>;
  try {
    nutSpecimen(c, false, j.id, binding);
    inputs = nutInputs(
      c,
      v7String(j.toolId, 'toolId'),
      String(j.target),
      j.id,
      {
        x: j.x,
        y: j.y,
      },
      binding,
    );
  } catch (error) {
    j.status = 'paused';
    j.reason = error instanceof Error ? error.message : 'Access changed';
    sync(c.actor, j);
    return workResult(j);
  }
  if (!workPay(c, j, 1)) {
    sync(c.actor, j);
    return workResult(j);
  }
  const m = nutModel(c.world, binding),
    s = nutSpecimen(c, false, j.id, binding);
  const blunting = Number(inputs.tool.processing?.blunting ?? 0);
  // Abstract energy-to-contact response; no claim of SI force or measured shell strength.
  const response =
    (inputs.hardness / 10) *
    (1 - blunting) *
    Math.min(1, 0.12 / m.exteriorLength);
  m.contacts = m.contacts + 1;
  m.damage = m.damage + response;
  m.exposed =
    m.damage >= m.threshold * (1 - Math.min(0.1, (s.decay ?? 0) / 10000));
  inputs.tool.processing = {
    method: binding.id + '@1',
    blunting: blunting + 0.002,
    geometry: 'single rounded piece',
    diameter: 0.12,
  };
  s.processing = {
    method: binding.id + '@1',
    sourceUnit: 1,
    contacts: m.contacts,
    covering:
      binding.groundTool && !m.exposed
        ? 'bounded deformation'
        : 'contact discontinuity',
    exposed: m.exposed,
    retainedAssembly: true,
    visibleRegion: m.exposed ? 0.2 : 0,
    ...(binding.groundTool ? { interiorObserved: false } : {}),
  };
  // Internal fractions stay in model state until real exposure. No additional edible stock is minted.
  if (m.exposed && !binding.groundTool)
    s.processing.sourceFractions = m.fractions;
  m.currentRevision = nutRevision(s);
  c.world.state[binding.modelKey] = m;
  j.condition = v7Json(s.processing);
  j.currentRevision = m.currentRevision;
  j.outputs = [s.id];
  c.emit(
    'nut-opening-contact',
    'One real paid stone contact; actual response retained without safety or nutrition inference.',
    {
      processId: j.id,
      model: binding.id + '@1',
      source: s.id,
      tool: inputs.tool.id,
      support: inputs.support.id,
      location: { ...(s.owner === c.actor.id ? c.actor.position : s.position) },
      contacts: m.contacts,
      exposed: m.exposed,
      visibleRegion: s.processing.visibleRegion ?? 0,
      qualified: false,
    },
    s.id,
  );
  if (m.exposed || j.remainingWork === 0) {
    j.remainingWork = 0;
    nutRelease(c.world, c.actor, j, 'completed');
    c.emit(
      'nut-opening-completed',
      'Bounded work ended; inspect the actual result, pickup remains separate.',
      { processId: j.id, exposed: m.exposed, qualified: false },
      s.id,
    );
  } else sync(c.actor, j);
  return workResult(j);
}
export function nutDeath(w: V7World, a: V7Actor, binding = NUT_BINDING) {
  for (const j of collectiveJobs(w, binding.id).filter(
    (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
  ))
    nutRelease(w, a, j, 'stopped');
}
