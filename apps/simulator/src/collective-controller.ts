import {
  collectiveGroups,
  collectiveShared,
  v7TaskAction,
  v7Record,
  v7String,
} from '@self-evolving-world/world-core';
import type {
  CollectiveCoordination,
  CollectiveIntent,
  V7Plan,
} from '@self-evolving-world/world-core';
import type {
  V7Execution,
  CollectiveAttention,
} from './continuous-run-types.js';
import type { CollectiveInput } from './collective-input.js';
import { collectiveInput } from './collective-input.js';

export function collectiveAttention(state: V7Execution): CollectiveAttention {
  state.attention ??= {
    intents: {},
    lastSlot: {},
    needsSince: {},
    lastDecision: {},
    lastCoordination: {},
    lastPublicAttempt: {},
    pending: [],
    queuedRounds: {},
    maximumWait: 0,
  };
  return state.attention;
}
export function collectiveLimit(
  state: V7Execution,
  role: 'ordinary' | 'world' | 'development',
): number {
  const p = state.world.config.collective;
  if (!p) return state.world.config.budgets[role];
  return !state.collectiveContinuation
    ? p.shortBudgets[role]
    : state.world.config.budgets[role] - p.shortBudgets[role];
}
export function collectivePhaseUsed(
  state: V7Execution,
  role: 'ordinary' | 'world' | 'development',
): number {
  const boundary = state.collectiveContinuation;
  const records =
    role === 'development'
      ? state.developments.slice(boundary?.developments ?? 0)
      : state.attempts
          .slice(boundary?.attempts ?? 0)
          .filter((a) => a.role === role);
  return records.length;
}
export function collectiveTokenBudget(state: V7Execution) {
  const p = state.world.config.collective;
  if (!p) return null;
  const short = !state.collectiveContinuation;
  const used = state.attempts
    .slice(state.collectiveContinuation?.attempts ?? 0)
    .reduce(
      (n, a) =>
        n +
        (a.usage
          ? a.usage.inputTokens + a.usage.outputTokens
          : (a.reservedTokens ?? 0)),
      0,
    );
  return {
    used,
    limit: short ? p.tokens.short : p.tokens.total - p.tokens.short,
  };
}
/** A frozen continuation allocation is separate from, and never enlarges, the short comparison. */
export function canContinueCollective(state: V7Execution): boolean {
  const p = state.world.config.collective;
  return (
    !!p &&
    p.arm === 'B' &&
    !state.collectiveContinuation &&
    state.windowTarget === p.shortRounds &&
    !state.pendingCall &&
    ((state.phase === 'window-complete' &&
      state.world.tick === p.shortRounds) ||
      (state.phase === 'paused' &&
        state.world.tick < p.shortRounds &&
        [
          'ordinary attempted-call budget exhausted.',
          'world attempted-call budget exhausted.',
          'Conversation development-handoff budget exhausted.',
          'Phase token budget cannot reserve the next complete attempt; world paused.',
        ].includes(state.reason ?? '')))
  );
}
/** One attention slot per group per round, with age priority before risk priority. No activity is selected here. */
export function collectiveDecisions(
  state: V7Execution,
): { actor: string; reason: string; input: CollectiveInput }[] {
  const w = state.world,
    p = w.config.collective;
  if (!p) return [];
  const attention = collectiveAttention(state);
  const decisions: { actor: string; reason: string; input: CollectiveInput }[] =
    [];
  for (const group of collectiveGroups(w)) {
    if (attention.lastSlot[group.id] === w.tick) continue;
    const members = w.actors.filter(
      (a) => group.members.includes(a.id) && a.vitals.health > 0 && !a.learning,
    );
    const needed = members
      .filter((a) => {
        const cursor = state.cursors[a.id];
        if (
          cursor &&
          !cursor.operation &&
          w.tick - (attention.lastDecision[a.id] ?? cursor.startedAt) >=
            p.reconsiderAfter
        )
          cursor.reason ??=
            'Scheduled opportunity to reconsider the current intention after sustained execution.';
        const needs = !cursor || !v7TaskAction(w, a.id, cursor);
        if (needs) attention.needsSince[a.id] ??= w.tick;
        else
          attention.needsSince = Object.fromEntries(
            Object.entries(attention.needsSince).filter(([id]) => id !== a.id),
          );
        return needs;
      })
      .sort((a, b) => {
        const ageA = w.tick - (attention.needsSince[a.id] ?? w.tick),
          ageB = w.tick - (attention.needsSince[b.id] ?? w.tick);
        const overdueA = ageA >= p.maxDecisionWait - 1,
          overdueB = ageB >= p.maxDecisionWait - 1;
        if (overdueA !== overdueB) return overdueA ? -1 : 1;
        const urgentA =
          a.vitals.health <= 20 ||
          a.vitals.satiety <= 5 ||
          a.vitals.energy <= 1;
        const urgentB =
          b.vitals.health <= 20 ||
          b.vitals.satiety <= 5 ||
          b.vitals.energy <= 1;
        if (urgentA !== urgentB) return urgentA ? -1 : 1;
        const riskA = Math.min(
            a.vitals.satiety,
            a.vitals.health,
            a.vitals.energy * 3,
          ),
          riskB = Math.min(
            b.vitals.satiety,
            b.vitals.health,
            b.vitals.energy * 3,
          );
        return (
          ageB - ageA ||
          (attention.lastDecision[a.id] ?? -1) -
            (attention.lastDecision[b.id] ?? -1) ||
          riskA - riskB ||
          a.id.localeCompare(b.id)
        );
      });
    const last = attention.lastCoordination[group.id] ?? -1;
    const reports =
      p.arm === 'B'
        ? collectiveShared(w, group.id).reports.filter((r) => r.tick > last)
        : [];
    const publicDue =
      reports.length > 0 &&
      w.tick -
        (attention.lastPublicAttempt[group.id] ?? -p.coordinationInterval) >=
        p.coordinationInterval;
    const oldestMember = Math.max(
      0,
      ...needed.map((a) => w.tick - (attention.needsSince[a.id] ?? w.tick)),
    );
    const urgentMember = needed.some(
      (a) =>
        a.vitals.health <= 20 || a.vitals.satiety <= 5 || a.vitals.energy <= 1,
    );
    if (
      publicDue &&
      (!needed.length ||
        (!urgentMember &&
          oldestMember < p.maxDecisionWait - 1 &&
          w.tick - Math.min(...reports.map((r) => r.tick)) >=
            p.maxDecisionWait))
    ) {
      decisions.push({
        actor: group.id,
        reason: 'Actual reports awaiting public coordination.',
        input: collectiveInput(
          w,
          group.id,
          [],
          state.cursors,
          'coordination',
          collectiveLimit(state, 'ordinary') -
            collectivePhaseUsed(state, 'ordinary'),
        ),
      });
    } else if (needed.length) {
      const selected = p.arm === 'A' ? needed : needed.slice(0, 1);
      const ids = selected.map((a) => a.id);
      for (const a of selected)
        attention.maximumWait = Math.max(
          attention.maximumWait,
          w.tick - (attention.needsSince[a.id] ?? w.tick),
        );
      decisions.push({
        actor: p.arm === 'A' ? group.id : (ids[0] ?? ''),
        reason: selected
          .map(
            (a) =>
              `${a.id}: ${state.cursors[a.id]?.reason ?? 'Initial persistent member decision'}`,
          )
          .join('; '),
        input: collectiveInput(
          w,
          group.id,
          ids,
          state.cursors,
          p.arm === 'A' ? 'shared-control' : 'individual',
          collectiveLimit(state, 'ordinary') -
            collectivePhaseUsed(state, 'ordinary'),
        ),
      });
    }
  }
  return decisions;
}
export function parseCollectiveDecision(
  text: string,
  input: CollectiveInput,
  parse: (text: string) => V7Plan,
): {
  plans: Record<string, V7Plan>;
  intents: Record<string, CollectiveIntent>;
  coordination: CollectiveCoordination | null;
} {
  const raw = v7Record(JSON.parse(text) as unknown);
  if (input.collective.mode === 'coordination') {
    if (
      Object.keys(raw).sort().join() !== 'proposals,summary' ||
      !Array.isArray(raw.proposals) ||
      raw.proposals.length > 6
    )
      throw new Error('Expected one bounded public coordination response.');
    const group = v7Record(input.payload.group);
    const members = group.members;
    const proposals = raw.proposals.map((item: unknown, index: number) => {
      const p = v7Record(item);
      if (
        Object.keys(p).sort().join() !== 'goal,member,next,pause,reason' ||
        !Array.isArray(members) ||
        !members.includes(p.member)
      )
        throw new Error(
          'Proposal must address an actual member of this group.',
        );
      const field = (key: string) => {
        const value = v7String(p[key], `proposal ${key}`);
        if (value.length > 360)
          throw new Error('Proposal fields must be concise.');
        return value;
      };
      return {
        id: `${input.collective.group}-${String(input.tick)}-${String(index)}`,
        member: field('member'),
        goal: field('goal'),
        reason: field('reason'),
        next: field('next'),
        pause: field('pause'),
      };
    });
    const summary = v7String(raw.summary, 'coordination summary');
    if (summary.length > 600)
      throw new Error('Coordination summary must be concise.');
    return {
      plans: {},
      intents: {},
      coordination: {
        group: input.collective.group,
        tick: input.tick,
        summary,
        proposals,
      },
    };
  }
  if (
    Object.keys(raw).join() !== 'assignments' ||
    !Array.isArray(raw.assignments)
  )
    throw new Error('Expected bounded member assignments.');
  const plans: Record<string, V7Plan> = {};
  const intents: Record<string, CollectiveIntent> = {};
  for (const item of raw.assignments) {
    const assignment = v7Record(item),
      member = v7String(assignment.member, 'selected member');
    if (
      !input.collective.eligible.includes(member) ||
      plans[member] ||
      Object.keys(assignment).sort().join() !== 'intent,member,plan'
    )
      throw new Error(
        'Assign each eligible member exactly once; other intentions are protected.',
      );
    const plan = v7Record(assignment.plan);
    const intent = v7Record(assignment.intent);
    if (Object.keys(intent).sort().join() !== 'goal,next,pause,progress,reason')
      throw new Error('Retain a complete personal intention.');
    const field = (key: string) => {
      const value = intent[key];
      if (typeof value !== 'string' || value.length > 360)
        throw new Error('Personal intention fields must be concise strings.');
      return value;
    };
    intents[member] = {
      goal: field('goal'),
      reason: field('reason'),
      progress: field('progress'),
      next: field('next'),
      pause: field('pause'),
      updatedAt: input.tick,
    };
    if (
      !Array.isArray(plan.steps) ||
      plan.steps.length > 6 ||
      JSON.stringify(plan).length > 14000
    )
      throw new Error('Use at most six concise steps.');
    for (const step of plan.steps) {
      const s = v7Record(step),
        a = v7Record(s.action);
      if (Object.keys(a).sort().join() !== 'args_json,interface')
        throw new Error(
          'Expected a declared interface and exact JSON arguments.',
        );
      s.action = {
        interface: a.interface,
        args: JSON.parse(v7String(a.args_json, 'JSON arguments')) as unknown,
      };
    }
    plans[member] = parse(JSON.stringify(plan));
  }
  if (
    Object.keys(plans).sort().join() !==
    [...input.collective.eligible].sort().join()
  )
    throw new Error('Every eligible member needs exactly one plan.');
  return { plans, intents, coordination: null };
}
