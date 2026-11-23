import type { LongQuery } from './long-query-index.js';
import { longQueryIndex, QUERY_INDEX_ACCESS } from './long-query-index.js';
import { catalogueRetrievalView } from './long-catalogue.js';
import { longVisibleAbilities } from './long-capability-view.js';
import {
  v7Observe,
  v7Load,
  v7Distance,
  forestClimate,
  v7Record,
  v7String,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Cursor,
  V7Action,
  V7Ability,
} from '@self-evolving-world/world-core';
import { forestExperienceSummary } from './forest-experience-context.js';
import { OPEN_GOAL } from './open-context.js';

export const LONG_CALL_PAUSE =
  'A long-development decision failed; its complete request, response or uncertainty and token charge are retained for current-conversation review.';

export type { LongQuery } from './long-query-index.js';
export interface LongRetrieval {
  tick: number;
  batches: number;
  results: unknown[];
}
export interface LongInput {
  longContext: {
    version: 1;
    scope: string;
    role: 'ordinary' | 'world';
    actor: string;
    remainingQueryBatches: number;
    outputTokens: number;
  };
  protocol: 'continuous-v1';
  tick: number;
  catalogue: {
    interfaces: V7Ability[];
    events: string[];
  };
  packet: Record<string, unknown>;
  retrieval: unknown[];
}
const text = (value: unknown) => JSON.stringify(value ?? null);
const terms = (query: string) =>
  query
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((s) => s.length > 2)
    .slice(0, 40);
function ranked<T>(records: T[], query: string): T[] {
  const words = terms(query);
  return records
    .map((value, index) => ({
      value,
      index,
      score: words.reduce(
        (n, word) => n + Number(text(value).toLowerCase().includes(word)),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.value);
}
/** Whole records where possible; a large value is explicitly paged, never silently reinterpreted. */
export function longPage(
  records: { id: string; value: unknown }[],
  offset = 0,
  part = 0,
  size = 4,
) {
  // A part has one meaning everywhere, including proactive views and explicit queries.
  const width = 600;
  return {
    total: records.length,
    offset,
    next: offset + size < records.length ? offset + size : null,
    records: records.slice(offset, offset + size).map(({ id, value }) => {
      const json = text(value);
      return json.length <= width
        ? { id, value }
        : {
            id,
            fragment: json.slice(part * width, (part + 1) * width),
            encoding: 'paged-json',
            part,
            parts: Math.ceil(json.length / width),
            partWidth: width,
            ...(part >= Math.ceil(json.length / width)
              ? {
                  error:
                    'Part out of range; use zero-based part0 through parts-1.',
                }
              : {}),
            access:
              'Stable600-code-unit pages, zero-based part; concatenate all parts before parsing. Use the same exact id for continuation.',
          };
    }),
  };
}
function entries(values: Record<string, unknown>) {
  return Object.entries(values).map(([id, value]) => ({ id, value }));
}
/** Nested component lots must not bypass the base sensory projection. */
function publicObservation(world: V7World, actor: string) {
  const o = v7Observe(world, actor);
  const scrub = (stack: (typeof o.stacks)[number]): void => {
    delete stack.physical;
    delete stack.materialLayer;
    stack.componentLots?.forEach(scrub);
  };
  o.stacks.forEach(scrub);
  return o;
}
function records(world: V7World, actor: string, section: LongQuery['section']) {
  if (section === 'abilities')
    return longVisibleAbilities(world, actor).map((a) => ({
      id: a.id,
      value: a,
    }));
  const o = publicObservation(world, actor),
    m = o.self.memory;
  if (section === 'inventory')
    return o.stacks
      .filter((s) => s.owner === actor)
      .map((s) => ({ id: s.id, value: s }));
  if (section === 'knowledge')
    return entries({ ...m.discoveries, ...m.knowledge });
  if (section === 'projects') return entries(m.projects ?? {});
  if (section === 'state') return entries(o.self.extensionState);
  if (section === 'observed')
    return [
      ...o.objects.map((value) => ({
        id: value.id,
        value: { seenAt: world.tick, object: value },
      })),
      ...m.objects
        .filter((r) => !o.objects.some((x) => x.id === r.object.id))
        .map((value) => ({ id: value.object.id, value })),
    ];
  return [
    ...entries({
      notes: m.notes,
      preferences: m.preferences,
      intention: m.intention,
    }),
    ...(m.important ?? []).map((value) => ({ id: value.event, value })),
    ...m.experiences.map((value) => ({ id: value.event, value })),
  ];
}
export function parseLongDecision(raw: string) {
  const result = v7Record(JSON.parse(raw) as unknown);
  if (
    Object.keys(result).sort().join() !== 'queries,result_json' ||
    !Array.isArray(result.queries) ||
    result.queries.length > 4
  )
    throw new Error('Expected one bounded query batch or decision.');
  const queries = result.queries.map((raw): LongQuery => {
    const q = v7Record(raw);
    if (Object.keys(q).sort().join() !== 'ids,offset,part,search,section')
      throw new Error('Unknown query parameter.');
    if (
      ![
        'abilities',
        'inventory',
        'knowledge',
        'projects',
        'memory',
        'state',
        'observed',
      ].includes(String(q.section)) ||
      !Array.isArray(q.ids) ||
      q.ids.length > 4 ||
      q.ids.some((id) => typeof id !== 'string' || id.length > 240) ||
      typeof q.search !== 'string' ||
      q.search.length > 400 ||
      !Number.isSafeInteger(q.offset) ||
      Number(q.offset) < 0 ||
      !Number.isSafeInteger(q.part) ||
      Number(q.part) < 0
    )
      throw new Error('Invalid control query.');
    return q as unknown as LongQuery;
  });
  const decision =
    result.result_json === null
      ? null
      : v7String(result.result_json, 'decision JSON');
  if (queries.length ? decision !== null : decision === null)
    throw new Error('Return either queries or a decision, never both.');
  return { queries, decision };
}
export function longRetrieve(
  world: V7World,
  actor: string,
  role: 'ordinary' | 'world',
  queries: LongQuery[],
) {
  return queries.map((query) => {
    if (role === 'world' && query.section !== 'abilities')
      return {
        query,
        error:
          'Only this experiment capability catalogue is available to world control queries.',
      };
    let found = records(world, actor, query.section);
    if (query.ids.length) found = found.filter((r) => query.ids.includes(r.id));
    else if (query.search)
      found = ranked(found, query.search).filter((r) =>
        terms(query.search).some((term) =>
          text(r).toLowerCase().includes(term),
        ),
      );
    if (!query.ids.length && query.section !== 'abilities') {
      return {
        query,
        total: found.length,
        offset: query.offset,
        next: query.offset + 3 < found.length ? query.offset + 3 : null,
        access: QUERY_INDEX_ACCESS,
        records: found.slice(query.offset, query.offset + 3).map((r) => ({
          id: r.id,
          value: longQueryIndex(query.section, r.id, r.value),
        })),
      };
    }
    const result = {
      query,
      ...longPage(found, query.offset, query.part, query.ids.length ? 1 : 3),
    };
    return catalogueRetrievalView(world, actor, [result])[0];
  });
}
function base(
  world: V7World,
  actor: string,
  role: 'ordinary' | 'world',
  retrieval?: LongRetrieval,
): LongInput {
  const policy = world.config.longDevelopment;
  if (!policy || !world.config.development)
    throw new Error('Missing long context policy.');
  return {
    longContext: {
      version: 1,
      scope: world.config.development.scope,
      actor,
      role,
      remainingQueryBatches:
        policy.queriesPerDecision -
        (retrieval?.tick === world.tick ? retrieval.batches : 0),
      outputTokens: policy.outputTokens,
    },
    protocol: world.protocol,
    tick: world.tick,
    catalogue: { interfaces: [], events: [] },
    packet: {},
    retrieval: (retrieval?.tick === world.tick ? retrieval.results : []).map(
      (raw) => {
        const result = v7Record(raw);
        if (!result.query) return raw;
        const { queries } = parseLongDecision(
          JSON.stringify({ queries: [result.query], result_json: null }),
        );
        const projected = longRetrieve(world, actor, role, queries)[0];
        return {
          ...v7Record(projected),
          projection:
            'Current authorized read with stable600 pages; original query/result retained unchanged in the call archive.',
        };
      },
    ),
  };
}
function compactAbility(a: V7World['abilities'][number], mastered: string[]) {
  return {
    id: a.id,
    function: a.function.slice(0, 180),
    learning: a.learning,
    mastered: mastered.includes(a.id),
  };
}
export function longOrdinaryInput(
  world: V7World,
  id: string,
  cursor?: V7Cursor,
  retrieval?: LongRetrieval,
): LongInput {
  const input = base(world, id, 'ordinary', retrieval),
    o = publicObservation(world, id),
    a = o.self;
  const projects = Object.values(a.memory.projects ?? {}).sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  );
  const taskText = text({
    intention: cursor?.plan.intention ?? a.memory.intention,
    action:
      cursor?.operation?.action ?? cursor?.plan.steps[cursor.step]?.action,
    projects: projects.slice(0, 2),
    failure: cursor?.reason,
  });
  const currentStep = cursor?.plan.steps[cursor.step];
  const bound = v7Record(a.extensionState['execution:operation'] ?? {});
  const boundAction = v7Record(v7Record(bound.operation ?? {}).action ?? {});
  const needed = new Set([
    ...(typeof boundAction.interface === 'string'
      ? [boundAction.interface]
      : []),
    ...a.mastered
      .filter((id) => !world.config.development?.baseline.includes(id))
      .slice(-1),
    ...(currentStep ? [currentStep.action.interface] : []),
    ...(a.learning ? [a.learning.ability] : []),
    ...(cursor?.operation ? [cursor.operation.action.interface] : []),
  ]);
  const personalAbilities = longVisibleAbilities(world, id);
  const candidates = ranked(
    personalAbilities.filter((ability) => !ability.authored),
    taskText,
  ).slice(0, 4);
  // Schemas occur only here, not again in the output schema. Baseline verbs use compact argument contracts.
  input.packet = {
    goal: OPEN_GOAL,
    identity: { id, name: a.name },
    time: world.time,
    state: {
      position: a.position,
      vitals: a.vitals,
      wellbeing: { physical: a.wellbeing.physical, total: a.wellbeing.total },
      life: a.life,
      learning: a.learning,
      load: v7Load(world, a),
      experience: forestExperienceSummary(a),
    },
    environment: forestClimate(world, a.position),
    execution: {
      cursor: cursor
        ? {
            intention: cursor.plan.intention,
            step: cursor.step,
            repetition: cursor.repetition,
            cycle: cursor.cycle,
            steps: cursor.plan.steps,
            reason: cursor.reason,
            operation: cursor.operation ?? null,
          }
        : null,
      binding: a.extensionState['execution:operation'] ?? null,
      // Active bindings and reserved identities are control facts, never a lossy summary.
      reserved: o.stacks.filter((s) => s.owner === id && s.reservedFor),
      activeState: Object.fromEntries(
        Object.entries(a.extensionState).filter(
          ([key]) =>
            /pending|:work:|operation/.test(key) &&
            key !== 'execution:operation',
        ),
      ),
    },
    observation: {
      actors: o.actors,
      terrain: o.terrain.map((p) => [p.x, p.y, p.kind]),
      objects: longPage(
        ranked(o.objects, taskText).map((x) => ({
          id: x.id,
          value: { seenAt: world.tick, object: x },
        })),
        0,
        0,
        8,
      ),
      ground: longPage(
        o.stacks
          .filter((s) => s.owner === null)
          .map((s) => ({ id: s.id, value: s })),
        0,
        0,
        4,
      ),
      events: longPage(
        o.events
          .filter((e) => !['wellbeing', 'mental-state'].includes(e.type))
          .map((e) => ({ id: e.id, value: e })),
        0,
        0,
        6,
      ),
    },
    inventory: longPage(
      ranked(records(world, id, 'inventory'), taskText),
      0,
      0,
      8,
    ),
    memory: {
      tendencies: a.extensionState['long:tendencies'] ?? null,
      offers: Object.fromEntries(
        Object.entries(world.state).filter(([key]) =>
          key.startsWith(`open:offer:${id}:`),
        ),
      ),
      recentMessages: longPage(
        (a.memory.important ?? [])
          .filter((e) => e.type === 'message')
          .slice(-3)
          .map((e) => ({ id: e.event, value: e })),
        0,
        0,
        3,
      ),
      projects: longPage(
        projects.map((p) => ({ id: p.id, value: p })),
        0,
        0,
        4,
      ),
      knowledge: longPage(
        ranked(records(world, id, 'knowledge'), taskText),
        0,
        0,
        3,
      ),
      records: longPage(
        ranked(
          records(world, id, 'memory')
            .reverse()
            .filter((r) => !text(r.value).includes('"type":"message"')),
          taskText,
        ),
        0,
        0,
        2,
      ),
      remembered: a.memory.objects
        .filter((m) => !o.objects.some((x) => x.id === m.object.id))
        .sort(
          (x, y) =>
            v7Distance(a.position, x.object.spatial) -
            v7Distance(a.position, y.object.spatial),
        )
        .slice(0, 6)
        .map((m) => ({
          id: m.object.id,
          kind: m.object.kind,
          resource: m.object.data.resource,
          stockWhenSeen: m.object.data.stock,
          position: { x: m.object.spatial.x, y: m.object.spatial.y },
          seenAt: m.seenAt,
        })),
    },
    abilities: {
      total: world.abilities.length,
      baseline: personalAbilities
        .filter((x) => x.authored)
        .map((x) => ({
          id: x.id,
          parameters: x.parameters,
          ...(Object.keys(x.references ?? {}).length
            ? { references: x.references }
            : {}),
        })),
      candidates: candidates.map((x) => compactAbility(x, a.mastered)),
      details: personalAbilities
        .filter((x) => !x.authored && needed.has(x.id))
        .map((x) => ({
          id: x.id,
          parameters: x.parameters,
          references: x.references,
          execution: x.execution,
          learning: x.learning,
          prerequisites: x.prerequisites,
          costs: x.costs,
          effects: x.effects,
          mastered: a.mastered.includes(x.id),
        })),
      masteredCount: a.mastered.length,
    },
    rules: {
      hunger: world.config.hunger,
      energyCap: world.config.energyCap,
      bounds: [world.config.width, world.config.height],
      interaction: world.config.interaction,
      inheritSkills: false,
    },
    access:
      'Omission is not absence. Query abilities, own inventory, knowledge, projects, memory, state or personally observed objects in batches. Ability search/list returns compact catalogue entries; use exact ids for full interface details and applicability. Search results are indexes. Exact queries return one record per offset. All paged records use600-code-unit fragments with zero-based part0..parts-1, consistently in proactive and queried views. Current-scope retained queries are reprojected using these stable pages; original results remain archived. Queries expose no hidden properties, other private records or historical capabilities. Queries do not perform physical trials or award experience.',
  };
  return input;
}
export function longWorldInput(
  world: V7World,
  requests: Record<string, V7Action>,
  retrieval?: LongRetrieval,
): LongInput {
  const input = base(world, 'world', 'world', retrieval),
    query = text(requests);
  input.packet = {
    requests,
    applicants: Object.keys(requests).map((id) => {
      const o = publicObservation(world, id);
      return {
        id,
        vitals: o.self.vitals,
        learning: o.self.learning,
        known: longPage(
          ranked(records(world, id, 'knowledge'), text(requests[id])),
          0,
          0,
          3,
        ),
        owned: longPage(
          ranked(records(world, id, 'inventory'), text(requests[id])),
          0,
          0,
          6,
        ),
        observed: longPage(
          ranked(o.objects, query).map((x) => ({ id: x.id, value: x })),
          0,
          0,
          5,
        ),
      };
    }),
    registry: {
      total: world.abilities.length,
      candidates: ranked(world.abilities, query)
        .slice(0, 8)
        .map((a) => ({
          id: a.id,
          function: a.function,
          equivalence: a.equivalence,
          learning: a.learning,
          prerequisites: a.prerequisites,
          costs: a.costs,
          effects: a.effects,
        })),
    },
    rules: {
      hunger: world.config.hunger,
      bounds: [world.config.width, world.config.height],
      fresh: world.config.development,
      experience: world.config.experience,
    },
    access:
      'Search or retrieve only this experiment abilities with control queries. Missing candidates do not prove a function absent. Full implementation facts remain available in the development handoff; never grant inventory or individual mastery. Require actual physical prerequisites.',
  };
  return input;
}
