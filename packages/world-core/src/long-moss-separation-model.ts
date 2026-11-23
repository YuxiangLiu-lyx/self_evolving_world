import type { V7ActionContext, V7World } from './continuous-types.js';
import { v7Record, v7Signature, v7String } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import { nutModel, nutRevision } from './long-nut-contact.js';
import { MOSS_NUT_BINDING } from './long-moss-opening.js';
import { rimResponse } from './long-nut-access-model.js';
import { collectiveJobs } from './collective-work.js';
export const SEPARATION_ID = 'moss-conserved-hazelnut-separation-trial',
  SEPARATION_ITEM = 'item-184-moss-1091',
  SEPARATION_TOOL = 'item-185-moss-1097',
  SEPARATION_KEY = 'long:forest-nut:separation';
function separationInputs(w: V7World) {
  const s = w.stacks.find((s) => s.id === SEPARATION_ITEM),
    t = w.stacks.find((s) => s.id === SEPARATION_TOOL),
    m = nutModel(w, MOSS_NUT_BINDING),
    j = collectiveJobs(w, MOSS_NUT_BINDING.id).find(
      (j) => j.id === 'manual-178-moss-1044',
    );
  if (
    !s ||
    !t ||
    s.owner !== 'moss' ||
    t.owner !== 'moss' ||
    s.quantity !== 1 ||
    t.quantity !== 1 ||
    s.reservedFor ||
    t.reservedFor ||
    s.origin !== 'forest-hazelnut-1' ||
    s.harvestedAt !== 140 ||
    s.resource !== 'hazelnut' ||
    t.resource !== 'stone' ||
    t.origin !== 'start-2-stone' ||
    t.harvestedAt !== 171 ||
    t.processing?.method !== MOSS_NUT_BINDING.id + '@1' ||
    t.processing.blunting !== 0.004 ||
    t.processing.diameter !== 0.12 ||
    m.contacts !== 2 ||
    !m.exposed ||
    nutRevision({ ...s, id: MOSS_NUT_BINDING.item }) !== m.currentRevision ||
    !j ||
    j.owner !== 'moss' ||
    j.status !== 'completed' ||
    j.completedWork !== 2 ||
    j.toolId !== 'item-171-moss-994' ||
    j.target !== 'start-2-stone' ||
    !j.sources.some(
      (x) => x.itemId === MOSS_NUT_BINDING.item && x.quantity === 1,
    )
  )
    throw Error(
      'Actual recovered whole inputs, original completed contact ledger and unchanged source condition are required.',
    );
  return { s, t, m, j };
}
export function installSeparation(w: V7World) {
  const { s, t, m } = separationInputs(w);
  if (!s.processing?.interiorObserved)
    throw Error(
      'The limited exposed region must already have been personally inspected.',
    );
  const p = w.actors.find((a) => a.id === 'moss');
  if (
    !['event-184-moss-1092', 'event-185-moss-1098'].every((id) =>
      p?.memory.experiences.some((e) => e.event === id),
    )
  )
    throw Error('The actual two personal pickup records are required.');
  w.state[SEPARATION_KEY] = {
    revision: SEPARATION_ID + '@1',
    introducedAt: w.tick,
    sourceRevision: nutRevision(s),
    toolRevision: nutRevision(t),
    sourceLineage: [MOSS_NUT_BINDING.item, s.id],
    toolLineage: ['item-171-moss-994', t.id],
    pickupEvidence: ['event-184-moss-1092', 'event-185-moss-1098'],
    ...rimResponse(w, s.origin, m.exteriorWidth),
    contacts: 0,
    assumption:
      'New source applicability of the deterministic exterior aperture/rim response, bounded by this actual source body. Not a prior measurement or inferred from visibleRegion. No loose internal component, retention/release law, partition, insertion path, hand anatomy or receiver is represented. No contact is executable in this release.',
  };
  const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
  if (r?.maintenance) {
    const trigger = {
      event: 'information-confirmed',
      interface: SEPARATION_ID,
    };
    r.alternativeTriggers = [...(r.alternativeTriggers ?? []), trigger];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
  }
  return w;
}
export function validateSeparation(c: V7ActionContext) {
  if (c.actor.id !== 'moss' || c.actor.vitals.health <= 0)
    throw Error('The living source owner is required.');
  for (const [key, wanted] of [
    ['specimenId', SEPARATION_ITEM],
    ['actuatorRef', SEPARATION_TOOL],
  ])
    if (
      !key ||
      forestResolveReference(
        c.world,
        c.actor,
        v7String(c.action.args[key], key),
        'owned',
        1,
      ) !== wanted
    )
      throw Error(
        'Use the exact recovered owned source and actuator identities.',
      );
  const inputs = separationInputs(c.world),
    model = v7Record(c.world.state[SEPARATION_KEY]);
  if (
    nutRevision(inputs.s) !== model.sourceRevision ||
    nutRevision(inputs.t) !== model.toolRevision
  )
    throw Error(
      'Current source or actuator revision does not match the assessed model.',
    );
  return { s: inputs.s, t: inputs.t, model };
}
export function separationFinding(aperture: number) {
  const measured = Math.round(aperture / 0.02) * 0.02;
  return {
    aperture: measured,
    actuatorDiameter: 0.12,
    resolution: 0.02,
    uncertainty: 0.01,
    clearance: measured + 0.01 < 0.12 ? 'blocked' : 'unresolved',
    scope:
      'Local exposed aperture versus whole stone only; no internal path measurement.',
  };
}
export const separationCanonical = (finding: unknown) =>
  v7Signature({
    source: 'forest-hazelnut-1:140:item-140-moss-811',
    property: 'opened-aperture-clearance',
    finding,
  });
