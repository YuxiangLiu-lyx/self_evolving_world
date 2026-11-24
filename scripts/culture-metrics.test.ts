import { describe, expect, it } from 'vitest';
import type { V7Event } from '@self-evolving-world/world-core';
import {
  activityEpisodes,
  archiveCultureMetrics,
  cultureMarkdown,
  cultureMetrics,
  environmentIndex,
  ordinaryCompound,
  survivalInterface,
  termCandidates,
  transactional,
  utterances,
} from './culture-metrics.js';
import type { CultureInput, CultureRound } from './culture-metrics.js';

const ACTORS = [
  { id: 'lin', name: 'Lin' },
  { id: 'moss', name: 'Moss' },
  { id: 'sol', name: 'Sol' },
];
const NAMES = new Set(['lin', 'moss', 'sol']);
const ENVIRONMENT = [
  'Ripe berries',
  'Meadow roots',
  'Maintain health and survival. Navigate toward a known target.',
  'item-12-moss-3',
];
const nothing = environmentIndex(ENVIRONMENT);

let serial = 0;
function event(
  tick: number,
  actor: string | null,
  type: string,
  extra: Partial<V7Event> = {},
): V7Event {
  serial++;
  return {
    id: `event-${String(tick)}-${String(serial)}`,
    tick,
    actor,
    type,
    interface: null,
    success: true,
    description: '',
    position: null,
    target: null,
    data: {},
    ...extra,
  };
}
const at = (x: number, y = 0) => ({ x, y });
const message = (
  tick: number,
  from: string,
  to: string,
  description: string,
): V7Event =>
  event(tick, from, 'message', {
    interface: 'message',
    description,
    target: to,
    data: { recipient: to },
  });
/** One round in which every listed actor performs `interfaces[actor]` at `where[actor]`. */
function round(
  tick: number,
  interfaces: Record<string, string>,
  extra: Partial<CultureRound> & { where?: Record<string, number> } = {},
): CultureRound {
  const { where = {}, events = [], ...rest } = extra;
  return {
    tick,
    actions: Object.fromEntries(
      Object.entries(interfaces).map(([actor, id]) => [
        actor,
        { interface: id, args: {} },
      ]),
    ),
    events: [
      ...Object.entries(interfaces).map(([actor, id]) =>
        event(tick, actor, 'acted', {
          interface: id,
          position: at(where[actor] ?? 0),
        }),
      ),
      ...events,
    ],
    memory: {},
    intentions: {},
    ...rest,
  };
}
function world(rounds: CultureRound[]): CultureInput {
  return {
    archive: 'experiment/fixture',
    actors: ACTORS,
    vision: 5,
    start: { lin: at(0), moss: at(1), sol: at(2) },
    abilities: [
      { id: 'gather', name: 'Gather accessible material' },
      { id: 'rest', name: 'Rest' },
      { id: 'eat', name: 'Eat' },
      { id: 'message', name: 'Message' },
      { id: 'name', name: 'Name' },
      { id: 'mark', name: 'Mark' },
    ],
    resources: [
      { id: 'berry', name: 'Ripe berries', nutrition: 8 },
      { id: 'root', name: 'Meadow roots', nutrition: 14 },
      { id: 'moss', name: 'Moss', nutrition: 0 },
      { id: 'fern-root', name: 'Fern root', nutrition: 9 },
    ],
    environment: ENVIRONMENT,
    harness: [],
    rounds,
  };
}
const idle = { lin: 'wait', moss: 'wait', sol: 'wait' };

describe('shared vocabulary', () => {
  it('finds capitalized phrases, hyphenated compounds and quoted coinages', () => {
    const found = termCandidates(
      'The Stone Circle is where we meet; I call the trail "the long walk" and the hollow a berry-gate.',
      nothing,
      NAMES,
    );
    expect(found.map((t) => t.key)).toEqual([
      'stone circle',
      'berry gate',
      'the long walk',
    ]);
  });

  it('rejects environment, actor, number, id and ordinary-compound false positives', () => {
    const text =
      'Ripe Berries near Lin Moss; meadow-root and Meadow Roots; six-round wait; item-12-moss-3; ' +
      'known-safe, low-risk and evidence-producing choices; Sol-applicable; "usable"; Navigate Toward.';
    expect(termCandidates(text, nothing, NAMES)).toEqual([]);
    expect(ordinaryCompound(['known', 'safe'])).toBe(true);
    expect(ordinaryCompound(['berry', 'gate'])).toBe(false);
  });

  it('counts a term coined by one agent and later used by others, with message exposure', () => {
    const metrics = cultureMetrics(
      world([
        round(1, idle, {
          events: [message(1, 'lin', 'moss', 'Meet me at the Stone Circle.')],
        }),
        round(2, idle, {
          memory: { moss: { notes: ['The Stone Circle is quiet.'] } },
        }),
        round(3, idle, {
          memory: {
            moss: { notes: ['The Stone Circle is quiet.'] },
            sol: { intention: 'Walk to the Stone Circle.' },
          },
        }),
        // Used by two agents in its first round: nobody coined it.
        round(4, idle, {
          memory: {
            lin: { notes: ['A Cold Hollow lies west.'] },
            sol: { notes: ['Cold Hollow is damp.'] },
          },
        }),
      ]),
    );
    expect(metrics.vocabulary).toMatchObject({
      terms: 2,
      sharedTerms: 1,
      transmittedTerms: 1,
      crossAgentUses: 2,
    });
    expect(metrics.vocabulary.top).toEqual([
      {
        term: 'Stone Circle',
        firstUsers: ['lin'],
        firstRound: 1,
        laterUsers: ['moss', 'sol'],
        exposedLaterUsers: ['moss'],
        crossAgentUses: 2,
      },
    ]);
  });

  it('treats a name given through a naming action as a term', () => {
    const naming = round(1, { lin: 'name', moss: 'wait', sol: 'wait' });
    naming.actions.lin = {
      interface: 'name',
      args: { target: 'object:rock-1', name: 'Hearth' },
    };
    const metrics = cultureMetrics(
      world([
        naming,
        round(3, idle, {
          events: [message(3, 'moss', 'sol', 'I rested by Hearth today.')],
        }),
      ]),
    );
    expect(utterances(world([naming]))).toMatchObject([
      { actor: 'lin', kind: 'name', text: 'Hearth' },
    ]);
    expect(metrics.vocabulary.top[0]).toMatchObject({
      term: 'Hearth',
      firstUsers: ['lin'],
      laterUsers: ['moss'],
    });
  });

  it('records notes once per actor however long they persist', () => {
    const note = { moss: { notes: ['Roots regrow slowly.'] } };
    const list = utterances(
      world([1, 2, 3].map((t) => round(t, idle, { memory: note }))),
    );
    expect(list).toEqual([
      {
        actor: 'moss',
        tick: 1,
        kind: 'note',
        text: 'Roots regrow slowly.',
        recipient: null,
      },
    ]);
  });

  it('skips the controller fallback intention written after a failed decision', () => {
    const fallback =
      'One failed-decision interval; the next decision remains budgeted.';
    const input = {
      ...world([
        round(1, idle, {
          memory: { lin: { intention: fallback } },
          intentions: { moss: fallback, sol: 'Gather roots.' },
        }),
      ]),
      harness: [fallback],
    };
    expect(utterances(input).map((u) => [u.actor, u.text])).toEqual([
      ['sol', 'Gather roots.'],
    ]);
  });
});

describe('repeated collective activities', () => {
  it('links different agents within one round and the vision radius into episodes', () => {
    const uses = [
      { actor: 'lin', tick: 1, at: at(0) },
      { actor: 'moss', tick: 2, at: at(3) },
      { actor: 'sol', tick: 2, at: at(30) },
      { actor: 'lin', tick: 9, at: at(0) },
      { actor: 'lin', tick: 10, at: at(0) },
    ];
    expect(activityEpisodes(uses, 5).map((g) => [...g])).toEqual([
      ['lin', 'moss'],
    ]);
  });

  it('reports interfaces with at least two separate episodes and skips movement and failures', () => {
    const together = { lin: 'gather', moss: 'gather', sol: 'navigate' };
    const far = { where: { lin: 0, moss: 40, sol: 1 } };
    const failed = round(
      30,
      { lin: 'rest', moss: 'rest', sol: 'wait' },
      { events: [event(30, 'moss', 'failed', { interface: 'rest' })] },
    );
    const metrics = cultureMetrics(
      world([
        round(1, together),
        round(2, together),
        round(10, idle),
        round(11, together),
        round(20, together, far),
        round(21, { lin: 'navigate', moss: 'navigate', sol: 'navigate' }),
        failed,
      ]),
    );
    expect(metrics.activities.byInterface).toEqual([
      {
        interface: 'gather',
        survival: true,
        episodes: 2,
        participants: ['lin', 'moss'],
        actorRounds: 8,
      },
    ]);
    expect(metrics.activities).toMatchObject({
      repeated: 1,
      repeatedNonSurvival: 0,
    });
  });
});

describe('norms', () => {
  it('detects statements and their phrase and action echoes', () => {
    const metrics = cultureMetrics(
      world([
        round(1, idle, {
          events: [
            message(1, 'lin', 'moss', 'We should always share berries.'),
            message(1, 'lin', 'sol', 'You should rest by the fire.'),
          ],
        }),
        round(2, idle),
        round(3, { lin: 'wait', moss: 'wait', sol: 'rest' }),
        round(4, idle, {
          events: [message(4, 'moss', 'sol', 'I share berries at dusk.')],
        }),
      ]),
    );
    expect(metrics.norms).toMatchObject({
      statements: 2,
      echoed: 2,
      phraseEchoes: 1,
      actionEchoes: 1,
    });
    expect(metrics.norms.list[0]).toMatchObject({
      actor: 'lin',
      key: ['share', 'berry'],
      polarity: 'prescriptive',
      phraseEchoes: [{ actor: 'moss', round: 4 }],
    });
    expect(metrics.norms.list[1]).toMatchObject({
      prescribedInterface: 'rest',
      actionEchoes: [{ actor: 'sol', round: 3 }],
    });
  });

  it('ignores questions, counterfactuals, descriptions and habitual actions', () => {
    const metrics = cultureMetrics(
      world([
        round(
          1,
          { lin: 'wait', moss: 'rest', sol: 'wait' },
          {
            events: [
              message(1, 'lin', 'moss', 'Should we rest?'),
              message(1, 'lin', 'moss', 'I should have gathered more.'),
              message(1, 'lin', 'moss', 'The patch has never been empty.'),
              message(1, 'lin', 'moss', 'You must rest now.'),
              message(1, 'lin', 'moss', 'Never eat red fungus.'),
            ],
            memory: { sol: { notes: ['Stock must be checked on arrival.'] } },
          },
        ),
        round(2, { lin: 'wait', moss: 'rest', sol: 'wait' }),
      ]),
    );
    expect(metrics.norms.list.map((n) => [n.text, n.polarity])).toEqual([
      ['You must rest now.', 'prescriptive'],
      ['Never eat red fungus.', 'prohibitive'],
    ]);
    // Moss was already resting before the statement, so resting is no echo.
    expect(metrics.norms.actionEchoes).toBe(0);
    expect(metrics.norms.privateStatements).toBe(1);
  });
});

describe('beliefs', () => {
  it('detects causal and supernatural explanations and their citations', () => {
    const metrics = cultureMetrics(
      world([
        round(1, idle, {
          memory: {
            lin: {
              notes: [
                'The berries vanished because the spirit is angry.',
                'The stock dropped because deer grazed the shrub.',
              ],
            },
          },
        }),
        round(5, idle, {
          memory: { sol: { notes: ['The spirit is angry again.'] } },
          events: [message(5, 'moss', 'lin', 'I saw deer grazed the shrub.')],
        }),
      ]),
    );
    expect(
      metrics.beliefs.list.map((b) => [b.type, b.key, b.citations]),
    ).toEqual([
      ['supernatural', ['spirit', 'angry'], [{ actor: 'sol', round: 5 }]],
      ['causal', ['deer', 'grazed', 'shrub'], [{ actor: 'moss', round: 5 }]],
    ]);
    expect(metrics.beliefs).toMatchObject({
      causal: 1,
      supernatural: 1,
      cited: 2,
      citations: 2,
    });
  });

  it('ignores failure feedback, decision rationale, negations and preference verbs', () => {
    const metrics = cultureMetrics(
      world([
        round(1, idle, {
          memory: {
            lin: {
              notes: [
                'Eating failed because no owned item was available.',
                'Shelter work remains paused because poles are unverified.',
                'This establishes ineligibility, not the reason for it.',
                'Why did it fail because of rain?',
              ],
              preferences: ['Favor safe food reserves.'],
            },
          },
        }),
      ]),
    );
    expect(metrics.beliefs.statements).toBe(0);
  });
});

describe('relationship structure', () => {
  it('builds message, response and transfer graphs with reciprocity', () => {
    const metrics = cultureMetrics(
      world([
        round(1, idle, {
          events: [
            message(1, 'lin', 'moss', 'Hello.'),
            message(1, 'lin', 'sol', 'Hello.'),
          ],
        }),
        round(2, idle, { events: [message(2, 'lin', 'moss', 'Still here.')] }),
        round(3, idle, {
          events: [
            message(3, 'moss', 'lin', 'Hello back.'),
            event(3, 'lin', 'given', { data: { recipient: 'moss' } }),
          ],
        }),
        round(20, idle, { events: [message(20, 'sol', 'lin', 'Late reply.')] }),
      ]),
    );
    expect(metrics.relationships.messages).toEqual({
      edges: [
        { from: 'lin', to: 'moss', weight: 2 },
        { from: 'lin', to: 'sol', weight: 1 },
        { from: 'moss', to: 'lin', weight: 1 },
        { from: 'sol', to: 'lin', weight: 1 },
      ],
      pairs: 4,
      reciprocated: 4,
      reciprocity: 1,
    });
    // One reply answers one message; Sol replied after the window.
    expect(metrics.relationships.responses).toEqual({
      edges: [{ from: 'moss', to: 'lin', weight: 1 }],
      pairs: 1,
      reciprocated: 0,
      reciprocity: 0,
    });
    expect(metrics.relationships.transfers.edges).toEqual([
      { from: 'lin', to: 'moss', weight: 1 },
    ]);
  });
});

describe('auxiliary metrics', () => {
  it('classifies survival interfaces by base id, keywords and edible resources', () => {
    const edible = new Set(['berry', 'root']);
    const survival = (id: string, name = id) =>
      survivalInterface({ id, name }, edible);
    expect(
      [
        'rest',
        'assess-food',
        'active-warming',
        'build-shelter',
        'root-assessment',
        'bounded-berries-trial',
      ].map((id) => survival(id)),
    ).toEqual([true, true, true, true, true, true]);
    expect(
      ['navigate', 'probe', 'moss-resting-pad-trial', 'process-willow'].map(
        (id) => survival(id),
      ),
    ).toEqual([false, false, false, false]);
    const metrics = cultureMetrics(
      world([
        round(1, { lin: 'gather', moss: 'probe', sol: 'navigate' }),
        round(2, { lin: 'eat', moss: 'rest', sol: 'message' }),
      ]),
    );
    expect(metrics.survival).toEqual({
      actorRounds: 6,
      survivalRounds: 3,
      share: 0.5,
      interfaces: ['eat', 'gather', 'rest'],
    });
  });

  it('separates transactional from social messages', () => {
    const resources = new Set(['berry', 'fern root']);
    expect(transactional('Berries at (13,7).', resources)).toBe(true);
    expect(transactional('Can you help me carry this?', resources)).toBe(true);
    expect(transactional('I found fern roots.', resources)).toBe(true);
    expect(transactional('Hello, how are you feeling today?', resources)).toBe(
      false,
    );
    const metrics = cultureMetrics(
      world([
        round(1, idle, {
          events: [
            message(1, 'lin', 'moss', 'Moss, thank you for the company.'),
            message(1, 'moss', 'lin', 'Roots are stocked at the patch.'),
          ],
        }),
      ]),
    );
    // The resource "moss" is also an actor name, so it does not make a message transactional.
    expect(metrics.nonTransactional).toEqual({
      messages: 2,
      nonTransactional: 1,
      share: 0.5,
    });
  });

  it('counts successful symbolic actions per agent for a later gate', () => {
    const rounds = [
      round(
        1,
        { lin: 'name', moss: 'mark', sol: 'tell' },
        {
          events: [event(1, 'moss', 'failed', { interface: 'mark' })],
        },
      ),
    ];
    const first = cultureMetrics(world(rounds)).symbolic;
    expect(first.perAgent).toEqual([
      {
        actor: 'lin',
        attempted: 1,
        succeeded: 1,
        byInterface: { name: 1, mark: 0, tell: 0, invite: 0 },
      },
      {
        actor: 'moss',
        attempted: 1,
        succeeded: 0,
        byInterface: { name: 0, mark: 0, tell: 0, invite: 0 },
      },
      {
        actor: 'sol',
        attempted: 1,
        succeeded: 1,
        byInterface: { name: 0, mark: 0, tell: 1, invite: 0 },
      },
    ]);
    expect(first.everyAgentAtLeastOne).toBe(false);
    rounds.push(round(2, { lin: 'wait', moss: 'invite', sol: 'wait' }));
    expect(cultureMetrics(world(rounds)).symbolic.everyAgentAtLeastOne).toBe(
      true,
    );
  });
});

describe('retained ex13 baseline', () => {
  it('pins headline culture metrics from retained files', () => {
    const metrics = archiveCultureMetrics('experiment/ex13');
    expect(Object.keys(metrics)).toEqual([
      'archive',
      'rounds',
      'agents',
      'utterances',
      'vocabulary',
      'activities',
      'norms',
      'beliefs',
      'relationships',
      'survival',
      'nonTransactional',
      'symbolic',
      'modelLabels',
    ]);
    expect(metrics).toMatchObject({
      rounds: { first: 1, last: 280, count: 280 },
      agents: ['lin', 'moss', 'sol'],
      utterances: { message: 17, public: 0, name: 0 },
      vocabulary: {
        terms: 32,
        sharedTerms: 1,
        transmittedTerms: 0,
        crossAgentUses: 1,
      },
      activities: { repeated: 2, repeatedNonSurvival: 1 },
      norms: { statements: 0, privateStatements: 23 },
      beliefs: { statements: 0 },
      relationships: {
        messages: { pairs: 6, reciprocated: 6, reciprocity: 1 },
        responses: { pairs: 6 },
        transfers: { pairs: 0, reciprocity: null },
      },
      survival: { actorRounds: 840, survivalRounds: 349 },
      nonTransactional: { messages: 17, nonTransactional: 0 },
      symbolic: { everyAgentAtLeastOne: false },
      modelLabels: null,
    });
    expect(metrics.vocabulary.top[0]).toMatchObject({
      term: 'resting-surface',
      firstUsers: ['lin'],
      firstRound: 48,
      laterUsers: ['moss'],
    });
    expect(
      metrics.relationships.responses.edges.reduce((n, e) => n + e.weight, 0),
    ).toBe(9);
    expect(metrics.symbolic.perAgent.every((a) => a.attempted === 0)).toBe(
      true,
    );
    expect(archiveCultureMetrics('experiment/ex13', 80).rounds.count).toBe(80);
    expect(cultureMarkdown(metrics)).toContain('## Culture metrics: ex13');
  });
});
