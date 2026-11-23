import type { V7ActionContext, V7Actor, V7World } from './continuous-types.js';
import {
  v7Id,
  v7Json,
  v7Record,
  v7Signature,
  v7String,
} from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  collectiveJobs,
  workCreate,
  workFind,
  workPay,
  workResult,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import { personalEvidence } from './long-food-evidence.js';
import {
  ACCESS_ID,
  ACCESS_ITEM,
  accessModel,
  accessSource,
  accessInputs,
  accessReference,
} from './long-nut-access-model.js';
function sync(a: V7Actor, j: CollectiveWork) {
  if (['active', 'paused'].includes(j.status))
    a.extensionState['long:work:nut-access'] = v7Json(j);
  else {
    delete a.extensionState['long:work:nut-access'];
    a.extensionState['long:last-nut-access'] = v7Json(j);
  }
}
function release(w: V7World, a: V7Actor, j: CollectiveWork, status: string) {
  if (!['active', 'paused'].includes(j.status))
    throw Error('Already settled; no repeated release.');
  for (const s of w.stacks) if (s.reservedFor === j.id) delete s.reservedFor;
  const o = w.objects.find((o) => o.data.accessLock === j.id);
  if (o) {
    delete o.data.accessLock;
    o.spatial.reserved = false;
  }
  j.status = status;
  j.elasticDisplacement = 0;
  sync(a, j);
}
function report(
  c: V7ActionContext,
  kind: string,
  finding: unknown,
  novel: boolean,
) {
  const id = v7Id(c.world, 'access-report'),
    key = 'access:' + id;
  c.emit(
    'nut-access-observed',
    'Actual source-specific access finding; no detached or edible product.',
    { reportId: id, phase: kind, sourceId: ACCESS_ITEM, qualified: false },
    ACCESS_ITEM,
  );
  const evidence = c.world.events.at(-1)?.id ?? '';
  c.actor.memory.knowledge ??= {};
  c.actor.memory.knowledge[key] = {
    key,
    subject: ACCESS_ITEM,
    property: 'source-specific ' + kind,
    value: v7Json(finding),
    method: 'paid local geometry or nonimpact contact',
    condition:
      'No internal insertion, extraction, safety, nutrition or calibrated force claim.',
    verified: true,
    tick: c.world.tick,
    evidence,
  };
  const canonical = v7Signature({ source: ACCESS_ITEM, kind, finding }),
    raw = c.actor.extensionState['long:access:confirmed'],
    seen = Array.isArray(raw) ? raw : [];
  if (!seen.includes(canonical)) {
    c.actor.extensionState['long:access:confirmed'] = [...seen, canonical];
    if (novel)
      c.emit(
        'information-confirmed',
        'New paid source-specific finding; details remain personal.',
        { key, evidence, qualified: true },
        ACCESS_ITEM,
      );
  }
}
export function accessExecute(c: V7ActionContext) {
  const mode = v7String(c.action.args.mode, 'mode'),
    m = accessModel(c.world);
  if (mode === 'assess') {
    if (accessReference(c, c.action.args.specimenId, 'owned') !== ACCESS_ITEM)
      throw Error('Use the actual reviewed assembly.');
    const s = accessSource(c);
    if (c.action.args.receiverRef)
      throw Error(
        'No transfer or receiver mechanism in this minimal rim-contact release; omit receiverRef.',
      );
    const inputs = accessInputs(
      c,
      accessReference(c, c.action.args.actuatorRef, 'owned'),
      accessReference(c, c.action.args.supportRef, 'object'),
    );
    const { refs } = personalEvidence(c);
    if (m.contacts >= 2)
      throw Error(
        'The lifetime two-contact bound is exhausted; no repeated charge.',
      );
    v7Spend(c.actor, 0.5);
    // Assessment includes explicit safe local positioning; both real items remain on the support.
    s.owner = null;
    s.position = { ...inputs.point };
    inputs.tool.owner = null;
    inputs.tool.position = {
      ...(m.contacts === 0 ? inputs.startPoint : inputs.toolPoint),
    };
    const id = v7Id(c.world, 'access-assessment');
    const measured = Math.round(m.aperture / 0.02) * 0.02,
      clearance =
        measured + 0.01 < 0.12
          ? 'blocked'
          : Math.abs(measured - 0.12) <= 0.02
            ? 'unresolved'
            : 'clear';
    const quote = {
      assessmentId: id,
      owner: c.actor.id,
      sourceRevision: m.sourceRevision,
      actuatorRef: inputs.tool.id,
      supportRef: inputs.support.id,
      point: inputs.point,
      inputSignature: inputs.signature,
      method: 'exterior-rim-contact-only',
      componentRef: ACCESS_ITEM + ':covering-rim',
      actuatorPosition: inputs.tool.position,
      maxWork: 2 - m.contacts,
      energyPerRound: 0.5,
      maxTravel: 0.02,
      maxEffort: 0.1,
      wear: 0,
      allocated: 1,
      transfer: 0,
      receiverRef: null,
    };
    c.world.state['long:access:assessment:' + id] = v7Json(quote);
    c.emit(
      'nut-access-assessed',
      'Paid local geometry examination completed; only exterior contact is quoted.',
      {
        assessmentId: id,
        sourceId: s.id,
        actuatorRef: inputs.tool.id,
        supportRef: inputs.support.id,
        phase: 'positioned-and-assessed',
        location: inputs.point,
        actuatorPosition: { ...inputs.tool.position },
        qualified: false,
      },
      s.id,
    );
    report(
      c,
      'clearance',
      {
        aperture: measured,
        actuatorDiameter: 0.12,
        resolution: 0.02,
        uncertainty: 0.01,
        clearance,
        scope:
          'Whole-stone internal insertion only; no loose component or receiver represented.',
      },
      true,
    );
    c.actor.memory.knowledge ??= {};
    c.actor.memory.knowledge['access-quote:' + id] = {
      key: 'access-quote:' + id,
      subject: s.id,
      property: 'exact executable exterior contact quote',
      value: v7Json({
        quote,
        assumption: m.assumption,
        evidenceCount: refs.length,
      }),
      method: 'paid local assessment',
      condition: 'Model assumptions are not prior facts; no transfer.',
      verified: true,
      tick: c.world.tick,
      evidence: c.world.events.at(-1)?.id ?? '',
    };
    return { complete: true, writes: [] };
  }
  let j = workFind(c);
  if (mode === 'cancel') {
    if (!j || c.action.args.processId !== j.id)
      throw Error('Name exact unfinished personal work.');
    release(c.world, c.actor, j, 'stopped');
    c.emit(
      'nut-access-stopped',
      'Cancelled; actual source stays at support, no refund or automatic pickup.',
      { processId: j.id, phase: 'cancelled', qualified: false },
      ACCESS_ITEM,
    );
    return workResult(j);
  }
  if (!['begin', 'resume'].includes(mode))
    throw Error('Use assess, begin, resume or cancel.');
  if (!j) {
    const a = v7Record(
        c.world.state[
          'long:access:assessment:' +
            v7String(c.action.args.assessmentId, 'assessmentId')
        ],
      ),
      s = accessSource(c, undefined, true);
    if (
      mode !== 'begin' ||
      a.owner !== c.actor.id ||
      a.sourceRevision !== m.sourceRevision ||
      m.contacts >= 2 ||
      (c.action.args.targetComponentRef &&
        c.action.args.targetComponentRef !== ACCESS_ITEM + ':covering-rim')
    )
      throw Error(
        'A current exact exterior-rim quote is required; no interior component transfer.',
      );
    const inputs = accessInputs(
      c,
      String(a.actuatorRef),
      String(a.supportRef),
      undefined,
      v7Record(a.point) as { x: number; y: number },
      true,
    );
    if (
      v7Signature(s.position) !== v7Signature(inputs.point) ||
      inputs.signature !== a.inputSignature ||
      c.actor.vitals.energy < 0.5
    )
      throw Error(
        'Quote inputs changed or insufficient energy before commitment.',
      );
    j = workCreate(c, 'bounded-exterior-contact', 2 - m.contacts);
    j.x = inputs.point.x;
    j.y = inputs.point.y;
    j.target = inputs.support.id;
    j.actuatorRef = inputs.tool.id;
    j.componentRef = ACCESS_ITEM + ':covering-rim';
    j.selection = v7Json(c.action.args);
    j.escrow = [s.id, inputs.tool.id];
    j.sources = [{ itemId: s.id, quantity: 1, origin: s.origin }];
    j.outputs = [s.id];
    j.sourceRevision = m.sourceRevision;
    s.owner = null;
    s.position = { ...inputs.point };
    s.reservedFor = j.id;
    inputs.tool.reservedFor = j.id;
    inputs.support.data.accessLock = j.id;
    inputs.support.spatial.reserved = true;
  }
  if (
    !['active', 'paused'].includes(j.status) ||
    (mode === 'resume' && c.action.args.processId !== j.id) ||
    (mode === 'begin' &&
      v7Signature(c.action.args) !== v7Signature(j.selection))
  )
    throw Error('Resume exact unfinished work; no repeated completed contact.');
  try {
    const source = accessSource(c, j.id);
    if (source.position.x !== j.x || source.position.y !== j.y)
      throw Error('Actual source left its quoted position.');
    accessInputs(
      c,
      v7String(j.actuatorRef, 'actuatorRef'),
      String(j.target),
      j.id,
      {
        x: j.x,
        y: j.y,
      },
    );
  } catch (error) {
    j.status = 'paused';
    j.reason = error instanceof Error ? error.message : 'Access changed';
    sync(c.actor, j);
    return workResult(j);
  }
  if (!workPay(c, j, 0.5)) {
    sync(c.actor, j);
    return workResult(j);
  }
  const inputs = accessInputs(
    c,
    v7String(j.actuatorRef, 'actuatorRef'),
    String(j.target),
    j.id,
    { x: j.x, y: j.y },
  );
  const from = { ...inputs.tool.position };
  inputs.tool.position = { ...inputs.toolPoint };
  const path =
    m.contacts === 0
      ? [from, inputs.toolPoint]
      : [
          from,
          {
            x: from.x - inputs.direction.x * 0.01,
            y: from.y - inputs.direction.y * 0.01,
          },
          from,
        ];
  m.contacts++;
  j.elasticDisplacement = m.compliance * 0.1;
  j.observedDisplacement = 'below0.02 resolution; retention unresolved';
  c.emit(
    'nut-access-contact',
    'Slow bounded exterior-rim contact; no insertion or detached material.',
    {
      processId: j.id,
      sourceId: ACCESS_ITEM,
      sourceRevision: m.sourceRevision,
      componentRef: j.componentRef ?? null,
      actuatorRef: j.actuatorRef ?? null,
      supportRef: j.target,
      receiverRef: null,
      phase: 'contact-observed',
      completedWork: j.completedWork,
      remainingWork: j.remainingWork,
      location: { x: j.x, y: j.y },
      actuatorPath: path,
      actuatorTravel: 0.02,
      effort: 0.1,
      elasticDisplacement: j.elasticDisplacement,
      materialAllocations: { retained: 1, transferred: 0, residue: 0, loss: 0 },
      qualified: false,
    },
    ACCESS_ITEM,
  );
  // The elastic response settles within the paid step; no persistent deformation or hidden yield.
  j.elasticDisplacement = 0;
  report(
    c,
    'contact',
    {
      scope: 'exterior covering rim only',
      observedDisplacement: 'below supported0.02 resolution',
      retention: 'unresolved',
      transfer: 0,
      interiorContact: false,
    },
    false,
  );
  if (j.remainingWork === 0) {
    release(c.world, c.actor, j, 'completed');
    c.emit(
      'nut-access-completed',
      'Bounded contact test ended; transfer and food properties remain unestablished.',
      {
        processId: j.id,
        phase: 'contact-observed',
        transferred: 0,
        qualified: false,
      },
      ACCESS_ITEM,
    );
  } else sync(c.actor, j);
  return workResult(j);
}
export function accessDeath(w: V7World, a: V7Actor) {
  for (const j of collectiveJobs(w, ACCESS_ID).filter(
    (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
  ))
    release(w, a, j, 'stopped');
}
