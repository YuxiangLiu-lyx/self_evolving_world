import { collectiveFoodProfile } from './collective-food-profile.js';
import type {
  V7Ability,
  V7ActionContext,
  V7Package,
  V7Schema,
  V7Knowledge,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7String, v7Number, v7Clone, v7Json } from './continuous-data.js';
import { v7Distance, v7Reach } from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { openAdvanceProcess } from './open-processes.js';
import { openConditions, openMaterial } from './open-physical.js';
import { collectiveAtMeeting } from './collective-social.js';

export const OPEN_BASELINE = [
  'navigate',
  'rest',
  'wait',
  'pickup',
  'gather',
  'eat',
  'drop',
  'give',
  'message',
  'request',
  'learn',
  'probe',
  'consult',
  'exchange',
];
const str: V7Schema = { type: 'string', maxLength: 360 };
const ability = (
  id: string,
  purpose: string,
  properties: Record<string, V7Schema>,
  references: V7Ability['references'] = {},
): V7Ability => ({
  id,
  name: id,
  function: purpose,
  equivalence: `open-baseline:${id}:1`,
  parameters: v7ObjectSchema(properties),
  prerequisites: [],
  learning: 0,
  costs:
    'One round; actual observation or communication effort 0.2, physical trials 0.5 energy and 0.1 actual material unit.',
  effects:
    'Only measured facts and performed interactions take effect. No mature capability or mastery is supplied.',
  handler: `open.${id}`,
  revision: 'foundation-open@1',
  authored: true,
  references,
  execution: {
    duration: 1,
    interruption: 'cancel',
    progress:
      'One complete low-cost interaction; repetition performs a new interaction with its actual costs.',
  },
});
export function openRemember(
  c: V7ActionContext,
  fact: Omit<V7Knowledge, 'evidence' | 'tick'>,
): void {
  c.actor.memory.knowledge ??= {};
  const old = c.actor.memory.knowledge[fact.key];
  c.emit(
    'trial-result',
    `${fact.subject}: ${fact.property} = ${JSON.stringify(fact.value)} (${fact.method}; ${fact.condition}).`,
    {
      key: fact.key,
      subject: fact.subject,
      property: fact.property,
      value: fact.value,
      method: fact.method,
      condition: fact.condition,
      verified: fact.verified,
      newInformation: !old || !old.verified,
      known: !!old,
    },
    fact.subject,
  );
  const event = c.world.events.at(-1);
  c.actor.memory.knowledge[fact.key] = {
    ...fact,
    tick: c.world.tick,
    evidence: event?.id ?? '',
  };
  if (fact.verified && (!old || !old.verified))
    c.emit(
      'information-confirmed',
      'Actual trial established a previously unverified property.',
      { key: fact.key, evidence: event?.id ?? '', qualified: true },
      fact.subject,
    );
}
function probe(c: V7ActionContext) {
  const { world: w, actor: a, action } = c,
    target = v7String(action.args.target, 'trial target'),
    mode = v7String(action.args.mode, 'trial mode');
  const object = w.objects.find((o) => o.id === target),
    stack = w.stacks.find((s) => s.id === target && !s.reservedFor);
  if (!object && !stack)
    throw new Error('The actual trial subject is unavailable.');
  if (object && !v7Reach(a, object.spatial))
    throw new Error('Approach the visible subject before a local trial.');
  if (
    stack &&
    stack.owner !== a.id &&
    v7Distance(a.position, stack.position) > a.radius + w.config.interaction
  )
    throw new Error('The trial material is out of reach.');
  const subject =
      stack?.resource ??
      v7String(
        object?.data.resource ?? object?.data.species ?? object?.kind,
        'trial subject',
      ),
    r = stack
      ? collectiveFoodProfile(w, stack)
      : w.resources.find((r) => r.id === subject);
  if (mode === 'observe') {
    v7Spend(a, 0.2);
    const data = object?.data ?? {};
    // Visual state is observed; hidden constitutive properties are not inferred for free.
    const value =
      object?.kind === 'animal'
        ? {
            mode: data.mode ?? null,
            health: data.health ?? null,
            group: data.group ?? null,
            offspring: data.offspring ?? 0,
          }
        : {
            stock: data.stock ?? null,
            growth: data.growth ?? null,
            stage: data.stage ?? null,
            soil: openConditions(w, object?.spatial ?? a.position),
          };
    const key = `${target}:observed-state`,
      old = a.memory.knowledge?.[key];
    openRemember(c, {
      key,
      subject,
      property: 'visible state',
      value,
      method: 'direct observation',
      condition: 'current local conditions',
      verified: false,
    });
    if (
      old &&
      w.tick - old.tick >= 20 &&
      JSON.stringify(old.value) !== JSON.stringify(value) &&
      object?.kind !== 'animal'
    ) {
      const regime = openConditions(w, object?.spatial ?? a.position).regime;
      openRemember(c, {
        key: `${subject}:change:${regime}`,
        subject,
        property: 'visible state changed over time',
        value: { before: old.value, after: value, elapsed: w.tick - old.tick },
        method: 'dated repeated observation',
        condition: regime,
        verified: true,
      });
    }
    return { complete: true, writes: [] };
  }
  if (!stack || stack.owner !== a.id || stack.quantity < 0.1 || !r)
    throw new Error(
      'A physical material trial requires at least 0.1 of an owned unreserved material.',
    );
  const intensity = v7Number(action.args.intensity, 'trial intensity', 0, 1),
    p = openMaterial(r);
  if (
    mode === 'heat' &&
    !w.objects.some(
      (o) => v7Reach(a, o.spatial) && Number(o.data.availableHeat ?? 0) > 0,
    )
  )
    throw new Error(
      'No actual available heat source is within reach. Request a missing mechanism if needed.',
    );
  if (
    mode === 'wet' &&
    !['~', '=', ','].includes(
      w.terrain[Math.floor(a.position.y)]?.[Math.floor(a.position.x)] ?? '',
    )
  )
    throw new Error('No accessible local water for this trial.');
  if (mode === 'heat') {
    const source = w.objects.find(
      (o) => v7Reach(a, o.spatial) && Number(o.data.availableHeat ?? 0) >= 0.1,
    );
    if (!source) throw new Error('Insufficient actual heat energy.');
    source.data.availableHeat = Number(source.data.availableHeat) - 0.1;
  }
  v7Spend(a, 0.5);
  stack.quantity = Math.max(0, Math.round((stack.quantity - 0.1) * 1e8) / 1e8);
  if (stack.quantityTenths !== undefined) stack.quantityTenths -= 1;
  const property =
    mode === 'press'
      ? 'load response'
      : mode === 'wet'
        ? 'water response'
        : 'heat response';
  const value =
    mode === 'press'
      ? {
          load: intensity,
          held: p.strength >= intensity,
          flexibility: p.flexibility,
        }
      : mode === 'wet'
        ? {
            retainedStrength: p.strength * p.waterResistance,
            waterResistance: p.waterResistance,
          }
        : { fuel: p.fuel, softening: p.heatSoftening };
  // Discrete load regimes bound information gain; arbitrary numeric jitter cannot create new rewards.
  const condition =
    mode === 'press' ? `load-band-${String(Math.floor(intensity * 3))}` : mode;
  openRemember(c, {
    key: `${subject}:${property}:${condition}`,
    subject,
    property,
    value,
    method: `physical ${mode} trial consuming 0.1 material`,
    condition,
    verified: true,
  });
  c.emit(
    'trial-material-consumed',
    'Actual sample was deformed, wetted or heated and consumed by the trial.',
    {
      resource: r.id,
      quantity: 0.1,
      mass: r.mass * 0.1,
      origin: stack.origin,
      mode,
    },
    stack.id,
  );
  return { complete: true, writes: [stack.id] };
}
function consult(c: V7ActionContext) {
  const id = v7String(c.action.args.subject, 'record subject'),
    kind = v7String(c.action.args.kind, 'record kind');
  v7Spend(c.actor, 0.2);
  if (kind === 'ability') {
    if (c.actor.collective && !c.actor.collective.knownAbilities.includes(id)) {
      if (!collectiveAtMeeting(c.world, c.actor))
        throw new Error(
          'Read the current public capability register at the known meeting location, or accept a nearby lesson.',
        );
      if (/^page:[0-9]+$/.test(id)) {
        const page = Number(id.slice(5));
        const records = c.world.abilities
          .slice(page * 12, (page + 1) * 12)
          .map((a) => ({ id: a.id, function: a.function }));
        for (const record of records)
          if (!c.actor.collective.knownAbilities.includes(record.id))
            c.actor.collective.knownAbilities.push(record.id);
        c.emit(
          'record-consulted',
          'Read a page of the current experiment capability register; mastery is unchanged.',
          { records: v7Json(records), total: c.world.abilities.length, page },
        );
        return { complete: true, writes: [] };
      }
    }
    const a = c.world.abilities.find((a) => a.id === id);
    if (!a) throw new Error('No such capability exists in this experiment.');
    if (c.actor.collective && !c.actor.collective.knownAbilities.includes(id))
      c.actor.collective.knownAbilities.push(id);
    c.actor.memory.abilityDetails = [
      id,
      ...(c.actor.memory.abilityDetails ?? []).filter((x) => x !== id),
    ].slice(0, 4);
    c.emit(
      'record-consulted',
      'Read the implemented ability contract; this grants no mastery.',
      { kind, subject: id, record: v7Json(a) },
      id,
    );
  } else {
    if (/^page:[0-9]+$/.test(id)) {
      const page = Number(id.slice(5)),
        records =
          kind === 'project'
            ? Object.values(c.actor.memory.projects ?? {}).map((p) => ({
                id: p.id,
                status: p.status,
              }))
            : Object.values(c.actor.memory.knowledge ?? {}).map((k) => ({
                id: k.key,
                verified: k.verified,
                subject: k.subject,
              }));
      c.emit(
        'record-consulted',
        'Read a retained personal record index page.',
        {
          kind,
          subject: id,
          total: records.length,
          records: v7Json(records.slice(page * 24, (page + 1) * 24)),
        },
      );
      return { complete: true, writes: [] };
    }
    const record =
      kind === 'project'
        ? c.actor.memory.projects?.[id]
        : c.actor.memory.knowledge?.[id];
    if (!record) throw new Error('No such personal record.');
    c.emit(
      'record-consulted',
      'Read the retained personal record.',
      { kind, subject: id, record: v7Json(record) },
      id,
    );
  }
  return { complete: true, writes: [] };
}
function exchange(c: V7ActionContext) {
  const { actor: a, world: w } = c,
    recipient = v7String(c.action.args.recipient, 'participant'),
    key = v7String(c.action.args.finding, 'finding'),
    mode = v7String(c.action.args.mode, 'exchange mode');
  const other = w.actors.find(
    (x) => x.id === recipient && x.id !== a.id && x.vitals.health > 0,
  );
  if (
    !other ||
    !v7Observe(w, a.id).actors.some((x) => x.id === recipient) ||
    v7Distance(a.position, other.position) > 2
  )
    throw new Error('A separate living participant must actually be nearby.');
  if (mode === 'offer') {
    const fact = a.memory.knowledge?.[key];
    if (!fact?.verified)
      throw new Error(
        'Offer only a finding personally verified through real evidence.',
      );
    v7Spend(a, 0.2);
    w.state[`open:offer:${other.id}:${a.id}`] = {
      finding: v7Json(fact),
      at: w.tick,
    };
    c.emit(
      'finding-offered',
      'Offered a measured finding; the recipient has not accepted or verified it.',
      { finding: key, recipient },
      recipient,
    );
  } else {
    const raw = w.state[`open:offer:${a.id}:${recipient}`];
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      typeof raw.at !== 'number' ||
      w.tick - raw.at > 80
    )
      throw new Error('No recent real offer from that participant.');
    const fact = raw.finding as unknown as V7Knowledge;
    if (fact.key !== key)
      throw new Error('Acceptance must match the actually offered finding.');
    v7Spend(a, 0.2);
    const known = a.memory.knowledge?.[key];
    a.memory.knowledge ??= {};
    if (!known?.verified)
      a.memory.knowledge[key] = {
        ...v7Clone(fact),
        verified: false,
        receivedFrom: recipient,
        tick: w.tick,
      };
    w.state = Object.fromEntries(
      Object.entries(w.state).filter(
        ([key]) => key !== `open:offer:${a.id}:${recipient}`,
      ),
    );
    const receipt = `${recipient}:${key}`,
      receipts = (a.extensionState['open:accepted'] ?? []) as string[],
      fresh = !receipts.includes(receipt) && !known;
    if (!receipts.includes(receipt)) receipts.push(receipt);
    a.extensionState['open:accepted'] = receipts;
    a.relationships[recipient] = v7Json({
      acceptedFindings: receipts.filter((x) => x.startsWith(recipient + ':'))
        .length,
      lastInteraction: w.tick,
    });
    c.emit(
      'finding-accepted',
      'The recipient independently accepted a second-hand finding; physical truth and mastery are unchanged.',
      {
        finding: key,
        sender: recipient,
        participants: [a.id, recipient],
        qualified: fresh,
      },
      recipient,
    );
  }
  return { complete: true, writes: [] };
}
export const OPEN_FOUNDATION: V7Package = {
  id: 'foundation-open',
  version: 1,
  description:
    'Authored generic observation, evidence exchange and record consultation; no mature production skills.',
  dependencies: ['foundation-forest@1'],
  resources: [],
  abilities: [
    ability(
      'probe',
      'Observe a nearby subject or physically test a small owned material sample.',
      {
        target: str,
        mode: { type: 'string', enum: ['observe', 'press', 'wet', 'heat'] },
        intensity: { type: 'number', minimum: 0, maximum: 1 },
      },
      { target: 'visible' },
    ),
    ability(
      'consult',
      'Read a current-world capability contract or retained personal record.',
      {
        kind: { type: 'string', enum: ['ability', 'project', 'knowledge'] },
        subject: str,
      },
    ),
    ability(
      'exchange',
      'Offer a personally tested finding or independently accept an actual nearby offer.',
      {
        mode: { type: 'string', enum: ['offer', 'accept'] },
        recipient: str,
        finding: str,
      },
    ),
  ],
  handlers: {
    'open.probe': probe,
    'open.consult': consult,
    'open.exchange': exchange,
  },
  processes: { 'open.process': openAdvanceProcess },
  visualComponents: ['plant', 'animal'],
  events: [
    'trial-result',
    'trial-material-consumed',
    'information-confirmed',
    'record-consulted',
    'finding-offered',
    'finding-accepted',
    'practice-confirmed',
    'local-hazard',
    'seed-dispersed',
    'plant-established',
    'animal-born',
    'animal-injured',
    'animal-fed',
    'process-progress',
    'process-completed',
    'process-stopped',
  ],
  satisfaction: [
    {
      id: 'grounded-understanding',
      name: 'Confirmed understanding',
      equivalence: 'open:verified-information',
      event: 'information-confirmed',
      interface: 'probe',
      conditions: [{ path: 'qualified', comparison: 'eq', value: true }],
      amount: 0.8,
      cap: 1,
      duration: 8,
      mode: 'hold',
      repetition: 'refresh',
      cooldown: 12,
      rationale:
        'A real experiment confirmed new information; repeated facts do not qualify.',
      revision: 'foundation-open@1',
      maintenance: {
        event: 'information-confirmed',
        interface: 'probe',
        gain: 0.035,
        decay: 0.0015,
      },
    },
    {
      id: 'reciprocal-understanding',
      name: 'Participating in an evidence exchange',
      equivalence: 'open:accepted-finding',
      event: 'finding-accepted',
      interface: 'exchange',
      conditions: [{ path: 'qualified', comparison: 'eq', value: true }],
      participants: 'participants',
      amount: 0.7,
      cap: 1,
      duration: 8,
      mode: 'hold',
      repetition: 'refresh',
      cooldown: 20,
      rationale:
        'Separate offer and acceptance around an actual finding; no relation or physical agreement is invented.',
      revision: 'foundation-open@1',
      maintenance: {
        event: 'finding-accepted',
        interface: 'exchange',
        gain: 0.025,
        decay: 0.0015,
      },
    },
  ],
};
