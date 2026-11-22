import type {
  V7ActionContext,
  V7Actor,
  V7Package,
  V7World,
} from './continuous-types.js';
import type {
  CollectiveCoordination,
  CollectiveGroup,
  CollectiveReport,
  CollectiveShared,
} from './collective-types.js';
import {
  v7Clone,
  v7Freeze,
  v7Json,
  v7String,
  v7Id,
} from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Distance } from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';

export function collectiveGroups(world: V7World): CollectiveGroup[] {
  return v7Clone(
    (world.state['collective:groups'] ?? []) as unknown as CollectiveGroup[],
  );
}
/** Reads reported records only. It never unions private actor observations. */
export function collectiveShared(world: V7World, id: string): CollectiveShared {
  const group = collectiveGroups(world).find((g) => g.id === id);
  if (!group) throw new Error('Unknown collective.');
  return {
    group,
    reports: group.members.flatMap((member) => {
      const report = world.state[`collective:report:${member}`];
      return report ? [v7Clone(report) as unknown as CollectiveReport] : [];
    }),
    board: v7Clone(
      world.state[`collective:board:${id}`] ?? null,
    ) as unknown as CollectiveCoordination | null,
  };
}
export function collectiveAtMeeting(world: V7World, actor: V7Actor): boolean {
  const group = collectiveGroups(world).find(
    (g) => g.id === actor.collective?.group,
  );
  return !!group && v7Distance(actor.position, group.meeting) <= 3;
}
function council(c: V7ActionContext) {
  const { actor: a, world: w } = c;
  if (!a.collective || !collectiveAtMeeting(w, a))
    throw new Error(
      'Attend the known meeting location to report, read or respond.',
    );
  const mode = v7String(c.action.args.mode, 'council mode');
  const text = typeof c.action.args.text === 'string' ? c.action.args.text : '';
  v7Spend(a, 0.2);
  if (mode === 'report') {
    const report: CollectiveReport = {
      actor: a.id,
      tick: w.tick,
      position: v7Clone(a.position),
      text,
      facts: Object.values(a.memory.knowledge ?? {})
        .filter((k) => k.verified)
        .slice(-8),
      knownAbilities: [...a.collective.knownAbilities],
      inventory: w.stacks
        .filter((s) => s.owner === a.id && !s.reservedFor && s.quantity > 0)
        .map((s) => ({ resource: s.resource, quantity: s.quantity })),
    };
    w.state[`collective:report:${a.id}`] = v7Json(report);
    c.emit(
      'collective-report',
      'Submitted a dated account and personally verified findings at the meeting location.',
      { report: v7Json(report) },
    );
  } else if (mode === 'read') {
    const shared = collectiveShared(w, a.collective.group);
    a.memory.knowledge ??= {};
    for (const report of shared.reports) {
      a.collective.received.push({
        tick: w.tick,
        source: report.actor,
        subject: `Meeting report at round ${String(report.tick)}`,
        text: JSON.stringify({
          text: report.text,
          inventory: report.inventory.slice(0, 12),
          omittedInventory: Math.max(0, report.inventory.length - 12),
        }),
      });
      for (const fact of report.facts) {
        if (!a.memory.knowledge[fact.key]?.verified)
          a.memory.knowledge[fact.key] = {
            ...v7Clone(fact),
            verified: false,
            receivedFrom: report.actor,
          };
      }
      for (const id of report.knownAbilities)
        if (
          w.abilities.some((ability) => ability.id === id) &&
          !a.collective.knownAbilities.includes(id)
        )
          a.collective.knownAbilities.push(id);
    }
    if (shared.board) {
      a.collective.received.push({
        tick: w.tick,
        source: a.collective.group,
        subject: 'Public coordination summary',
        text: shared.board.summary,
      });
      for (const proposal of shared.board.proposals.filter(
        (p) => p.member === a.id,
      ))
        a.collective.received.push({
          tick: w.tick,
          source: a.collective.group,
          subject: 'Voluntary personal proposal',
          text: JSON.stringify(proposal),
        });
    }
    c.emit(
      'collective-read',
      'Read dated shared records and proposals. No task, inventory or mastery was assigned.',
      { shared: v7Json(shared) },
    );
  } else {
    const proposal = collectiveShared(
      w,
      a.collective.group,
    ).board?.proposals.find(
      (p) => p.id === c.action.args.proposal && p.member === a.id,
    );
    if (!proposal)
      throw new Error('No current proposal addressed to this member.');
    const response = v7String(c.action.args.response, 'personal response');
    a.collective.commitments[proposal.id] = {
      response,
      reason: text,
      tick: w.tick,
    };
    c.emit(
      'collective-response',
      'The member independently responded. Their current task and intention remain their own.',
      { proposal: proposal.id, response, reason: text },
    );
  }
  return { complete: true, writes: [] };
}
function teach(c: V7ActionContext) {
  const { actor: a, world: w } = c;
  const other = w.actors.find(
    (b) =>
      b.id === c.action.args.participant &&
      b.id !== a.id &&
      b.vitals.health > 0,
  );
  if (
    !a.collective ||
    !other?.collective ||
    v7Distance(a.position, other.position) > 2 ||
    !v7Observe(w, a.id).actors.some((b) => b.id === other.id)
  )
    throw new Error(
      'A separate living participant must be visible and within two units.',
    );
  const ability = v7String(c.action.args.ability, 'teaching subject');
  if (!w.abilities.some((x) => x.id === ability))
    throw new Error('No such current-world ability.');
  v7Spend(a, 0.2);
  if (c.action.args.mode === 'offer') {
    if (!a.mastered.includes(ability))
      throw new Error('The teacher must personally master the subject.');
    w.state[`collective:lesson:${a.id}:${other.id}`] = {
      ability,
      tick: w.tick,
    };
    c.emit(
      'lesson-offered',
      'Offered a nearby lesson; acceptance and individual study are still required.',
      { ability },
      other.id,
    );
  } else {
    const offer = w.state[`collective:lesson:${other.id}:${a.id}`];
    if (
      !offer ||
      typeof offer !== 'object' ||
      Array.isArray(offer) ||
      offer.ability !== ability ||
      typeof offer.tick !== 'number' ||
      w.tick - offer.tick > 80 ||
      !other.mastered.includes(ability)
    )
      throw new Error(
        'No matching recent offer from this qualified nearby participant.',
      );
    if (!a.collective.knownAbilities.includes(ability))
      a.collective.knownAbilities.push(ability);
    a.memory.abilityDetails = [
      ability,
      ...(a.memory.abilityDetails ?? []).filter((x) => x !== ability),
    ].slice(0, 4);
    w.state = Object.fromEntries(
      Object.entries(w.state).filter(
        ([key]) => key !== `collective:lesson:${other.id}:${a.id}`,
      ),
    );
    c.emit(
      'lesson-accepted',
      'Accepted an actual explanation. Individual learning still costs the full declared study time.',
      { ability, participants: [a.id, other.id] },
      other.id,
    );
  }
  return { complete: true, writes: [] };
}
export function collectiveFoundation(scope: string): V7Package {
  const string = { type: 'string' as const, maxLength: 360 };
  return {
    id: 'foundation-collective',
    version: 1,
    scope,
    dependencies: ['foundation-open@1'],
    description:
      'Authored local reporting, voluntary responses and consent-based capability communication.',
    resources: [],
    satisfaction: [],
    processes: {},
    visualComponents: [],
    events: [
      'collective-report',
      'collective-read',
      'collective-response',
      'lesson-offered',
      'lesson-accepted',
      'collective-coordination',
      'collective-experience',
    ],
    abilities: [
      {
        id: 'council',
        name: 'council',
        function:
          'Report personal findings, read shared records or independently respond at the group meeting location.',
        parameters: v7ObjectSchema({
          mode: { type: 'string', enum: ['report', 'read', 'respond'] },
          text: string,
          proposal: string,
          response: {
            type: 'string',
            enum: ['accept', 'alternative', 'decline'],
          },
        }),
        handler: 'collective.council',
      },
      {
        id: 'teach',
        name: 'teach',
        function:
          'Offer a personally mastered ability to a nearby participant, or accept an actual offer before individual study.',
        parameters: v7ObjectSchema({
          mode: { type: 'string', enum: ['offer', 'accept'] },
          participant: string,
          ability: string,
        }),
        handler: 'collective.teach',
      },
    ].map((a) => ({
      ...a,
      equivalence: `collective-baseline:${a.id}:1`,
      prerequisites: [],
      learning: 0,
      costs: 'One round and 0.2 energy. Actual local presence is required.',
      effects:
        'Dated information or a voluntary response only; no free goods, mastery or reward.',
      revision: 'foundation-collective@1',
      authored: true,
      references: {},
      execution: {
        duration: 1,
        interruption: 'cancel' as const,
        progress: 'One actual communication per complete execution.',
      },
    })),
    handlers: { 'collective.council': council, 'collective.teach': teach },
  };
}
/** Council output is a proposal recorded after simultaneous physical actions, never an actor command. */
export function collectiveSettle(
  saved: V7World,
  updates: CollectiveCoordination[],
): V7World {
  if (!updates.length) return saved;
  const world = v7Clone(saved);
  if (!world.config.collective) throw new Error('Collective policy required.');
  for (const update of updates) {
    const group = collectiveGroups(world).find((g) => g.id === update.group);
    if (
      !group ||
      update.tick !== world.tick - 1 ||
      update.proposals.some((p) => !group.members.includes(p.member))
    )
      throw new Error('Council update does not match the preserved barrier.');
    world.state[`collective:board:${group.id}`] = v7Json(update);
    world.events.push({
      id: v7Id(world, 'event'),
      tick: world.tick,
      actor: null,
      type: 'collective-coordination',
      interface: 'council',
      success: true,
      description: update.summary,
      position: group.meeting,
      target: group.id,
      data: { coordination: v7Json(update) },
    });
  }
  return v7Freeze(world);
}
/** Mild experience differences never change nutrition or the availability of basic recovery. */
export function collectiveExperienceScale(
  actor: V7Actor,
  event: string,
): number {
  const t = actor.collective?.tendencies;
  if (!t) return 1;
  const preference = /information|trial|practice/.test(event)
    ? t.curiosity
    : /finding|social|shared|lesson/.test(event)
      ? t.social
      : t.comfort;
  return 1 + (preference - 0.5) * 0.4;
}
export function collectiveAfterRound(before: V7World, world: V7World): void {
  if (!world.config.collective) return;
  for (const actor of world.actors) {
    const member = actor.collective;
    if (!member) continue;
    const old = before.actors.find((a) => a.id === actor.id);
    const events = world.events.filter(
      (e) => e.actor === actor.id || e.target === actor.id,
    );
    if (
      world.config.collective.arm === 'B' &&
      old &&
      actor.vitals.health < old.vitals.health
    ) {
      member.tendencies.risk = Math.max(
        0.2,
        member.tendencies.risk -
          Math.min(0.01, (old.vitals.health - actor.vitals.health) * 0.001),
      );
      member.updates.push({
        tick: world.tick,
        reason:
          'Experienced physical injury; risk acceptance decreased slightly.',
        evidence:
          events
            .filter((e) => /damage|attack|injur|died/.test(e.type))
            .map((e) => e.id)
            .join(',') ||
          `health:${String(old.vitals.health)}->${String(actor.vitals.health)}`,
      });
    }
    for (const event of events.filter((e) => e.success)) {
      if (event.type === 'information-confirmed' && event.actor === actor.id) {
        member.lastProgress = world.tick;
        const key = typeof event.data.key === 'string' ? event.data.key : '',
          claim = old?.memory.knowledge?.[key],
          fact = actor.memory.knowledge?.[key];
        if (claim?.receivedFrom && !claim.verified && fact?.verified) {
          const agrees =
            JSON.stringify(claim.value) === JSON.stringify(fact.value);
          member.trust[claim.receivedFrom] = Math.max(
            -1,
            Math.min(
              1,
              (member.trust[claim.receivedFrom] ?? 0) + (agrees ? 0.05 : -0.05),
            ),
          );
          member.updates.push({
            tick: world.tick,
            reason: agrees
              ? 'Personally confirmed a received finding.'
              : 'Personally contradicted a received finding.',
            evidence: event.id,
          });
        }
      }
      if (['finding-accepted', 'lesson-accepted'].includes(event.type))
        member.lastSocial = world.tick;
      if (event.type === 'message' && event.target === actor.id && event.actor)
        member.received.push({
          tick: world.tick,
          source: event.actor,
          subject:
            typeof event.data.subject === 'string'
              ? event.data.subject
              : 'message',
          text: event.description,
        });
    }
    member.received = member.received.slice(-24);
    member.updates = member.updates.slice(-24);
  }
}
export function collectiveAssert(world: V7World): void {
  const policy = world.config.collective;
  if (!policy) return;
  const groups = collectiveGroups(world),
    members = groups.flatMap((g) => g.members);
  if (
    new Set(groups.map((g) => g.id)).size !== groups.length ||
    new Set(members).size !== members.length ||
    members.length !== world.actors.length ||
    members.some((id) => !world.actors.some((a) => a.id === id)) ||
    ![
      policy.shortRounds,
      policy.maxDecisionWait,
      policy.contextCharacters,
      policy.tokens.short,
      policy.tokens.total,
      policy.tokens.output,
    ].every((n) => Number.isSafeInteger(n) && n > 0) ||
    policy.tokens.total < policy.tokens.short
  )
    throw new Error(
      'Invalid collective membership or frozen attention/token policy.',
    );
  for (const actor of world.actors) {
    const m = actor.collective;
    if (
      !m ||
      !groups.some((g) => g.id === m.group && g.members.includes(actor.id)) ||
      Object.values(m.tendencies).some(
        (v) => !Number.isFinite(v) || v < 0.2 || v > 0.8,
      ) ||
      Object.values(m.trust).some(
        (v) => !Number.isFinite(v) || v < -1 || v > 1,
      ) ||
      m.knownAbilities.some((id) => !world.abilities.some((a) => a.id === id))
    )
      throw new Error(
        'Invalid personal collective state or foreign capability knowledge.',
      );
  }
}
