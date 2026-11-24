import { describe, expect, it } from 'vitest';
import type { V7Cursor, V7Event } from '@self-evolving-world/world-core';
import type { ContinuousModelInput } from '../apps/simulator/src/continuous-provider.js';
import {
  activityEpisodes,
  archiveCultureMetrics,
  contentSimilarity,
  cultureMarkdown,
  cultureMetrics,
  environmentIndex,
  ordinaryCompound,
  phraseSimilarity,
  restStep,
  sharingMatches,
  survivalInterface,
  termCandidates,
  transactional,
  utterances,
  withoutPrivateMemory,
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
      restRounds: 1,
      shareWithoutRest: 2 / 6,
      perAgent: [
        {
          actor: 'lin',
          actorRounds: 2,
          survivalRounds: 2,
          restRounds: 0,
          share: 1,
          shareWithoutRest: 1,
        },
        {
          actor: 'moss',
          actorRounds: 2,
          survivalRounds: 1,
          restRounds: 1,
          share: 0.5,
          shareWithoutRest: 0,
        },
        {
          actor: 'sol',
          actorRounds: 2,
          survivalRounds: 0,
          restRounds: 0,
          share: 0,
          shareWithoutRest: 0,
        },
      ],
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

/** Ideas the sharing detector finds in a text, per matching sentence. */
const ideas = (value: string) =>
  sharingMatches(value).map((s) => s.matches.map((m) => m.idea));

describe('sharing expressions', () => {
  // Exact texts from the ex15 replay (round = replay round of the action or first memory record).
  it('classifies the ex15 candidate texts', () => {
    // Kai, round 1, tell (written at round 1): a modest share is restraint at a common bush.
    const kai1 =
      "I know red berries provide 8 nutrition with no toxicity. I'll collect a modest share, then learn to exchange findings. I would welcome observations about food preparation and shelter.";
    expect(sharingMatches(kai1)).toEqual([
      {
        sentence:
          "I'll collect a modest share, then learn to exchange findings.",
        matches: [
          { idea: 'take-moderately', phrase: 'collect a modest share' },
        ],
      },
    ]);
    // Kai, round 1, plan note and preference: leaving a share counts; sharing evidence does not.
    expect(
      ideas(
        'The observed berry source initially contains 12 units; collecting six would leave a share if stock remains unchanged.',
      ),
    ).toEqual([['leave-for-others']]);
    expect(
      ideas(
        'Share useful evidence while distinguishing it from untested ideas.',
      ),
    ).toEqual([]);
    // Kai, round 5, tell and preference.
    expect(
      ideas(
        'This berry patch is empty now. I saw another berry patch near (8.66,14.19) at round 3; I will check it and take a modest share. Red berries are known to provide 8 nutrition with no toxicity.',
      ),
    ).toEqual([['take-moderately']]);
    expect(
      sharingMatches(
        'Prefer known-safe food and leave some stock for others.',
      )[0]?.matches,
    ).toEqual([
      { idea: 'leave-for-others', phrase: 'leave some stock for others' },
    ]);
    // Wren, round 9, tell (written at round 1 in Wren's first plan).
    expect(
      sharingMatches(
        "I know meadow roots provide 14 nutrition and have zero toxicity. I'm collecting four from the patch near (10.1,12), leaving some for others. I'd like to investigate replenishing food together.",
      ).map((s) => s.matches),
    ).toEqual([
      [{ idea: 'leave-for-others', phrase: 'leaving some for others' }],
    ]);
    // Lin has no new text at round 14. Its round-13 tell only asks to coordinate (negative);
    // its round-13 preference states the coordination-instead-of-duplication idea.
    expect(
      ideas(
        "I learned a single-person shelter method: it requires 13 branches, 4 vines and 6 bark, then 12 work rounds. No shelter built yet. I'll collect branches at (17.2,13.3). Has anyone located vines or bark? Sol, let's coordinate materials.",
      ),
    ).toEqual([]);
    expect(
      ideas(
        'Coordinate finite material stocks rather than duplicating nearby shelter work.',
      ),
    ).toEqual([['coordinate-collection']]);
    // Sol, round 14, message to Lin, intention and preference.
    expect(
      sharingMatches(
        "I mastered a shared shelter method: two bays need 26 branches, 8 vines and 12 bark, plus 24 work rounds. Birch bark at (12.2,21.3) had 11 units at tick 13. I plan to collect 5, leaving 6 for your single bay. No vines located yet. Let's avoid starting construction until materials and a clear site are secured.",
      ),
    ).toEqual([
      {
        sentence: 'I plan to collect 5, leaving 6 for your single bay.',
        matches: [
          { idea: 'leave-for-others', phrase: 'leaving 6 for your single bay' },
        ],
      },
    ]);
    expect(
      sharingMatches(
        'Coordinate shelter materials with Lin, collect a modest bark supply without exhausting the source, maintain food and energy, and learn a reusable food-preparation skill.',
      )[0]?.matches,
    ).toEqual([
      { idea: 'no-depletion', phrase: 'without exhausting the source' },
    ]);
    expect(
      ideas('Coordinate scarce materials rather than duplicate collection.'),
    ).toEqual([['coordinate-collection']]);
    // Moss, round 14, tell: a plain quantity from the same bark is no sharing expression.
    expect(
      ideas(
        "I saw birch bark at (12.2,21.3), stock 11; I'll collect 6 for shelter work. A branch held a 0.25 press load, flexibility 0.2; that does not establish roof safety. I'll test wetting next. No vines located yet.",
      ),
    ).toEqual([]);
  });

  it('rejects self-rationing, information sharing, non-interference and descriptions', () => {
    for (const negative of [
      // ex15 texts
      'Gathering is limited to the observed stock; reserve berries for later rather than consuming the whole harvest.',
      'Gather only observed stock. Requesting a method is not learning it or building a shelter.',
      'Recover enough energy for safe work, share known food information, and personally learn the observation skill before choosing material trials.',
      'Share the completed food-preparation trial honestly, then learn how to conduct a small root-cultivation experiment before committing any food or land to it.',
      'Review the measured result before selecting further trials or sharing material-property claims.',
      "I see your trial north of us, Ivo. I'll try one root farther northeast near (20,5.3), leaving your position alone.",
      'Survival remains uncertain; please leave it undisturbed.',
      'Secure a modest reserve of known-safe food, recover energy, and investigate a reusable way to make shelter without assuming materials or construction knowledge.',
      'Prefer reusable skills and shared facilities with testable practical benefits.',
      'Staying alive with tolerable risk, understanding through actual evidence, and making useful knowledge and everyday security easier to share.',
      'Coordinate material ownership before committing to construction.',
      // earlier archives
      'Continue the current approach and coordinate evidence with Moss before duplicating food trials.',
      'Search westward for food without exhausting my reserves.',
      'Four owned berries are split between two exact stacks.',
      'Please share what your tree inspection actually finds.',
      // synthetic
      "I won't leave any for others.",
      'Do not exhaust yourself before the walk.',
      'The patch is not depleted yet.',
      "I'll split the branches for the roof.",
    ])
      expect(ideas(negative), negative).toEqual([]);
  });

  it('recognizes common sharing paraphrases', () => {
    expect(
      [
        'Take only what you need.',
        "Don't strip the bush.",
        'Never take the last berry.',
        "Let's split the berries between us.",
        'We should share the roots.',
        "I'll try collecting one more so our combined supply reaches six.",
        'Avoid competing with others for already discussed supplies.',
        'Please coordinate before collecting the same supply;',
        'Maintain a modest food reserve rather than strip shared patches.',
      ].map(ideas),
    ).toEqual([
      [['take-moderately']],
      [['no-depletion']],
      [['no-depletion']],
      [['share-split']],
      [['share-split']],
      [['share-split']],
      [['coordinate-collection']],
      [['coordinate-collection']],
      [['no-depletion']],
    ]);
    expect(
      phraseSimilarity(
        'leave some stock for others',
        'leaving some for others',
      ),
    ).toBe(0.5);
    expect(phraseSimilarity('take a modest share', 'take a modest share')).toBe(
      1,
    );
  });

  it('measures reuse by other people with authored rounds and message, speech and sign exposure', () => {
    const say = (
      r: CultureRound,
      actor: string,
      text: string,
      id = 'tell',
    ): CultureRound => {
      r.actions[actor] = { interface: id, args: { text } };
      return r;
    };
    const where = { lin: 0, moss: 1, sol: 40 };
    const rounds = [
      say(
        round(1, { lin: 'tell', moss: 'wait', sol: 'wait' }, { where }),
        'lin',
        'Leave some berries for others.',
      ),
      round(3, idle, {
        where,
        memory: {
          moss: { notes: ['Leave some roots for others too.'] },
          sol: { notes: ['Leaving some berries for others is kind.'] },
        },
      }),
      // Lin's message reaches Sol at round 4, after Sol wrote the tell it speaks at round 6.
      round(4, idle, {
        where,
        events: [
          message(4, 'lin', 'sol', 'Take only what you need from the bush.'),
        ],
      }),
      {
        ...say(
          round(6, { lin: 'wait', moss: 'wait', sol: 'tell' }, { where }),
          'sol',
          'Take only what you need.',
        ),
        authored: { sol: 2 },
      },
      // Moss marks the ground at x = 1; Sol first stands within sight of it at round 8.
      say(
        round(7, { lin: 'wait', moss: 'mark', sol: 'wait' }, { where }),
        'moss',
        'Share the roots.',
        'mark',
      ),
      round(8, idle, { where: { lin: 0, moss: 1, sol: 3 } }),
      round(9, idle, {
        where: { lin: 0, moss: 1, sol: 3 },
        memory: { sol: { notes: ['We share roots here.'] } },
      }),
    ];
    const metrics = cultureMetrics(world(rounds));
    const s = metrics.sharing;
    expect(
      s.list.map((e) => [e.actor, e.round, e.authored, e.kind, e.communicated]),
    ).toEqual([
      ['lin', 1, 1, 'public', true],
      ['sol', 6, 2, 'public', true],
      ['moss', 3, 3, 'note', false],
      ['sol', 3, 3, 'note', false],
      ['lin', 4, 4, 'message', true],
      ['moss', 7, 7, 'name', true],
      ['sol', 9, 9, 'note', false],
    ]);
    expect(
      s.reuseList.map((r) => [
        r.actor,
        r.authored,
        r.idea,
        r.closest.actor,
        Number(r.closest.similarity.toFixed(2)),
        r.similarWording,
        r.exposure,
      ]),
    ).toEqual([
      [
        'moss',
        3,
        'leave-for-others',
        'lin',
        0.33,
        false,
        {
          idea: 'leave-for-others',
          actor: 'lin',
          round: 1,
          received: 1,
          via: 'speech',
        },
      ],
      // Sol was out of hearing range.
      ['sol', 3, 'leave-for-others', 'lin', 0.67, true, null],
      // Sol wrote its tell at round 2, so Lin's round-4 message is the later one and Sol is first.
      ['lin', 4, 'take-moderately', 'sol', 1, true, null],
      [
        'sol',
        9,
        'share-split',
        'moss',
        1,
        true,
        {
          idea: 'share-split',
          actor: 'moss',
          round: 7,
          received: 8,
          via: 'sign',
        },
      ],
    ]);
    expect(s.reuseList[3]?.otherExposure).toEqual({
      idea: 'take-moderately',
      actor: 'lin',
      round: 4,
      received: 4,
      via: 'message',
    });
    expect(s).toMatchObject({
      expressions: 7,
      communicated: 4,
      reuses: 4,
      similarReuses: 3,
      exposedReuses: 2,
    });
    expect(
      s.ideas.map((i) => [
        i.idea,
        i.expressions,
        i.firstUsers,
        i.firstAuthored,
        i.laterUsers,
        i.exposedLaterUsers,
      ]),
    ).toEqual([
      ['leave-for-others', 3, ['lin'], 1, ['moss', 'sol'], ['moss']],
      ['take-moderately', 2, ['sol'], 2, ['lin'], []],
      ['no-depletion', 0, [], null, [], []],
      ['share-split', 2, ['moss'], 7, ['sol'], ['sol']],
      ['coordinate-collection', 0, [], null, [], []],
    ]);
    const markdown = cultureMarkdown(metrics);
    expect(markdown).toContain('### Sharing expressions');
    expect(markdown).toContain('moss r7 via sign (r8)');

    // Owner-only cares and views are detected in the private section only.
    const secret = world(rounds);
    const first = secret.rounds[1];
    if (first)
      first.memory = {
        ...first.memory,
        moss: {
          ...first.memory.moss,
          views: { lin: 'Lin leaves some for others.' },
        },
        sol: { ...first.memory.sol, cares: 'Never take the last berry.' },
      };
    const hidden = cultureMetrics(secret);
    expect(hidden.sharing).toEqual(s);
    expect(
      hidden.privateMemory?.sharing.expressions.map((x) => [
        x.actor,
        x.field,
        x.person,
        x.matches.map((m) => m.idea),
        x.exposure,
      ]),
    ).toEqual([
      [
        'moss',
        'view',
        'lin',
        ['leave-for-others'],
        {
          idea: 'leave-for-others',
          actor: 'lin',
          round: 1,
          received: 1,
          via: 'speech',
        },
      ],
      ['sol', 'cares', null, ['no-depletion'], null],
    ]);
  });
});

describe('rest as a default idle behavior', () => {
  const rested = (
    tick: number,
    actor: string,
    recovered: number,
    mentalFactor = 1,
  ) =>
    event(tick, actor, 'rested', {
      interface: 'rest',
      data: { recovered, nominal: 4, mentalFactor, bonus: 0 },
    });
  const restWorld = (unrecordedRestFactor = false): CultureInput => ({
    ...world([
      round(
        1,
        { lin: 'rest', moss: 'rest', sol: 'navigate' },
        {
          // Lin's recovery is uncapped; Moss rests from a step without an energy condition.
          events: [rested(1, 'lin', 4.0025, 1.000625), rested(1, 'moss', 4)],
          restSteps: {
            lin: { conditioned: true, target: 39 },
            moss: { conditioned: false, target: null },
          },
        },
      ),
      round(
        2,
        { lin: 'rest', moss: 'gather', sol: 'rest' },
        {
          // The cap cut Lin's recovery: Lin began the round within one rest of full energy.
          events: [
            rested(2, 'lin', 1.5, 1.000625),
            event(2, 'sol', 'failed', { interface: 'rest' }),
          ],
          restSteps: {
            lin: { conditioned: true, target: 39 },
            sol: { conditioned: true, target: 30 },
          },
        },
      ),
    ]),
    energy: { cap: 40, restRecovery: 4, unrecordedRestFactor },
  });

  it('counts idle rests from unconditioned steps and cap-cut recoveries, per person', () => {
    const metrics = cultureMetrics(restWorld());
    expect(metrics.rest).toMatchObject({
      rests: 4,
      idle: 2,
      unconditioned: 1,
      highEnergy: 1,
      toFull: 2,
      withStep: 4,
      withRecovery: 3,
      idleShare: 0.5,
      default: true,
    });
    expect(metrics.rest.perAgent).toEqual([
      {
        actor: 'lin',
        rests: 2,
        idle: 1,
        unconditioned: 0,
        highEnergy: 1,
        toFull: 2,
        withStep: 2,
        withRecovery: 2,
        idleShare: 0.5,
      },
      {
        actor: 'moss',
        rests: 1,
        idle: 1,
        unconditioned: 1,
        highEnergy: 0,
        toFull: 0,
        withStep: 1,
        withRecovery: 1,
        idleShare: 1,
      },
      {
        actor: 'sol',
        rests: 1,
        idle: 0,
        unconditioned: 0,
        highEnergy: 0,
        toFull: 0,
        withStep: 1,
        withRecovery: 0,
        idleShare: 0,
      },
    ]);
    // The second survival share leaves the gate's share unchanged.
    expect(metrics.survival).toMatchObject({
      survivalRounds: 5,
      restRounds: 4,
      share: 5 / 6,
      shareWithoutRest: 1 / 6,
    });
    const markdown = cultureMarkdown(metrics);
    expect(markdown).toContain('Without `rest`');
    expect(markdown).toContain('2 of 4 rests idle (50.0%');
    expect(markdown).toContain('Default: yes');
  });

  it('skips the cap test when an unrecorded weather factor can lower recovery', () => {
    expect(cultureMetrics(restWorld(true)).rest).toMatchObject({
      idle: 1,
      highEnergy: null,
      withRecovery: 0,
      default: false,
    });
  });

  it('finds the plan step that produced a rest from the cursor after the round', () => {
    const until = (value: number) => ({
      path: 'self.energy',
      comparison: 'gte' as const,
      value,
    });
    const cursor = (
      step: number,
      repetition: number,
      reason: string | null = null,
      planUntil: number | null = null,
    ): V7Cursor => ({
      plan: {
        intention: '',
        steps: [
          {
            action: { interface: 'rest', args: {} },
            repeat: 8,
            until: until(39),
            guard: null,
          },
          {
            action: { interface: 'gather', args: { target: 'bush' } },
            repeat: 1,
            until: null,
            guard: null,
          },
          {
            action: { interface: 'rest', args: {} },
            repeat: 3,
            until: null,
            guard: null,
          },
        ],
        repeat: 1,
        until: planUntil === null ? null : until(planUntil),
        interrupts: [],
        notes: [],
        preferences: [],
      },
      step,
      repetition,
      cycle: 0,
      startedAt: 0,
      navigation: null,
      reason,
    });
    const rest = { interface: 'rest', args: {} };
    const conditioned = { conditioned: true, target: 39 };
    const free = { conditioned: false, target: null };
    // Still repeating the first step, then advanced past it.
    expect(restStep(cursor(0, 2), rest)).toEqual(conditioned);
    expect(restStep(cursor(1, 0), rest)).toEqual(conditioned);
    // Repeating the last step; wrapped after it; stopped on it by a failure.
    expect(restStep(cursor(2, 1), rest)).toEqual(free);
    expect(restStep(cursor(0, 0), rest)).toEqual(free);
    expect(restStep(cursor(2, 0, 'failed'), rest)).toEqual(free);
    // A plan-level until on energy conditions every step.
    expect(restStep(cursor(2, 1, null, 40), rest)).toEqual({
      conditioned: true,
      target: 40,
    });
    expect(restStep(cursor(1, 0), { interface: 'eat', args: {} })).toBeNull();
  });
});

describe('owner-only private memory', () => {
  it('rebuilds cares and views with persistence, forgetting and the person cap', () => {
    const metrics = cultureMetrics(
      world([
        round(1, idle, {
          memory: {
            lin: {
              cares: 'Quiet mornings by the stream',
              views: { sol: 'Loud', moss: 'Patient and kind' },
            },
          },
        }),
        // Omitted fields persist.
        round(2, idle, { memory: { lin: { notes: [] } } }),
        // An unchanged text is a write, not a change; an empty view forgets.
        round(3, idle, {
          memory: {
            lin: { cares: 'Quiet mornings by the stream', views: { sol: '' } },
          },
        }),
        round(4, idle, {
          memory: { lin: { cares: '' }, moss: { cares: 'Shared meals' } },
        }),
      ]),
    );
    const p = metrics.privateMemory;
    expect(p).toMatchObject({
      visibility: 'owner-only',
      cares: { people: 2, holding: 1, writes: 4, changes: 3, forgotten: 1 },
      views: {
        observers: 1,
        targets: 2,
        holding: 1,
        entries: 1,
        writes: 3,
        changes: 3,
        forgotten: 1,
      },
    });
    expect(p?.perAgent[0]).toEqual({
      actor: 'lin',
      cares: { writes: 3, changes: 2, forgotten: 1, current: null },
      views: {
        writes: 3,
        changes: 3,
        forgotten: 1,
        current: [{ person: 'moss', view: 'Patient and kind', round: 1 }],
      },
    });
    expect(p?.perAgent[1]?.cares.current).toBe('Shared meals');
    // Only round 4, the last retained round, is sampled.
    expect(p?.viewConvergence.samples.map((s) => s.round)).toEqual([4]);

    const people = Array.from({ length: 10 }, (_, i) => ({
      id: `p${String(i)}`,
      name: `P${String(i)}`,
    }));
    const crowded = cultureMetrics({
      ...world([
        round(
          1,
          {},
          {
            memory: {
              p0: {
                views: Object.fromEntries(
                  people.slice(1).map((x) => [x.id, `Neighbour ${x.name}`]),
                ),
              },
            },
          },
        ),
      ]),
      actors: people,
    });
    // Views apply in person-id order and only the eight most recent people are kept.
    expect(
      crowded.privateMemory?.perAgent[0]?.views.current.map((v) => v.person),
    ).toEqual(['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
  });

  it('is null without private memory and empty in a voice scope without updates', () => {
    expect(cultureMetrics(world([round(1, idle)])).privateMemory).toBeNull();
    const empty = cultureMetrics({ ...world([round(1, idle)]), voice: true });
    expect(empty.privateMemory).toMatchObject({
      cares: { people: 0, writes: 0 },
      views: { observers: 0, writes: 0 },
      viewConvergence: {
        samples: [{ round: 1, similarity: null, targets: 0, pairs: 0 }],
        trend: { first: null, last: null, change: null },
      },
    });
  });

  it('measures private view convergence rising as two observers see a third alike', () => {
    expect(
      contentSimilarity(
        'Moss is a gentle forager.',
        'Gentle forager, Lin.',
        NAMES,
      ),
    ).toBe(1);
    expect(contentSimilarity('Moss', 'the', NAMES)).toBeNull();
    const views = (
      tick: number,
      memory: CultureRound['memory'],
    ): CultureRound => round(tick, idle, { memory });
    const metrics = cultureMetrics(
      world([
        views(1, {
          lin: {
            cares: 'The stream and quiet mornings',
            views: { moss: 'Gentle forager who hums near the stream' },
          },
          moss: { views: { lin: 'Quiet' } },
        }),
        round(10, idle),
        views(12, {
          sol: {
            cares: 'Quiet mornings and warm fires',
            views: { moss: 'Stubborn climber hoarding roots' },
          },
        }),
        round(20, idle),
        views(25, {
          sol: { views: { moss: 'Gentle climber who hums at dusk' } },
        }),
        round(30, idle),
        views(35, {
          sol: { views: { moss: 'Gentle forager who hums by the stream' } },
        }),
        round(40, idle),
      ]),
    );
    const p = metrics.privateMemory;
    // Each target has a single observer at round 10, so convergence is undefined there.
    expect(
      p?.viewConvergence.samples.map((s) => [
        s.round,
        s.similarity,
        s.targets,
        s.pairs,
      ]),
    ).toEqual([
      [10, null, 0, 0],
      [20, 0, 1, 1],
      [30, 1 / 3, 1, 1],
      [40, 1, 1, 1],
    ]);
    expect(p?.viewConvergence.trend).toMatchObject({
      first: { round: 20, similarity: 0 },
      last: { round: 40, similarity: 1 },
      change: 1,
    });
    expect(p?.viewConvergence.trend.slopePer100Rounds).toBeCloseTo(5);
    expect(
      p?.caresSimilarity.samples.map((s) => [s.round, s.similarity, s.people]),
    ).toEqual([
      [10, null, 1],
      [20, 0.4, 2],
      [30, 0.4, 2],
      [40, 0.4, 2],
    ]);
    expect(p?.caresSimilarity.trend.slopePer100Rounds).toBeCloseTo(0);
    const markdown = cultureMarkdown(metrics);
    expect(markdown).toContain('### Private memory (owner-only)');
    expect(markdown).toContain('no other person can see them');
    expect(markdown).toContain(
      'first round 20 0.000 (1 target, 1 pair), last round 40 1.000 (1 target, 1 pair)',
    );
  });

  it('never feeds private cares and views into public or transmission metrics', () => {
    const rounds = () => [
      round(1, idle, {
        events: [
          message(1, 'lin', 'moss', 'Meet me at the Stone Circle.'),
          message(1, 'lin', 'sol', 'We should always share berries.'),
        ],
      }),
      round(2, idle, {
        memory: { moss: { notes: ['The Stone Circle is quiet.'] } },
      }),
      round(3, idle, {
        events: [message(3, 'moss', 'sol', 'I rested at the Hearth Keeper.')],
      }),
    ];
    const base = world(rounds());
    const secret = world(rounds());
    // Private text repeats a shared term, coins a term used publicly later, states a
    // norm and a belief, and echoes the public norm; none of it may count publicly.
    const first = secret.rounds[0];
    if (first)
      first.memory = {
        sol: {
          cares: 'The Hearth Keeper and the Stone Circle.',
          views: {
            moss: 'Moss should always share berries because the spirit is angry.',
          },
        },
        lin: { views: { sol: 'Sol must rest by the Stone Circle.' } },
      };
    const second = secret.rounds[1];
    if (second)
      second.memory = {
        ...second.memory,
        sol: {
          views: {
            lin: 'We should always share berries at the Hearth Keeper.',
          },
        },
      };
    expect(utterances(secret)).toEqual(utterances(base));
    const open = cultureMetrics(base);
    const hidden = cultureMetrics(secret);
    expect(open.privateMemory).toBeNull();
    expect(hidden.privateMemory?.views.entries).toBe(3);
    expect({ ...hidden, privateMemory: null }).toEqual(open);
    expect(hidden.vocabulary.top.map((t) => t.term)).toEqual(['Stone Circle']);
    expect(hidden.norms.phraseEchoes).toBe(0);
    expect(hidden.beliefs.statements).toBe(0);
    // The private views share berries; that sharing idea stays in the private section.
    expect(hidden.privateMemory?.sharing.byIdea['share-split']).toBe(2);
    expect(hidden.sharing).toEqual(open.sharing);
  });

  it('empties private memory in a retained request before it becomes environment', () => {
    const input: ContinuousModelInput = {
      longContext: {
        version: 1,
        scope: 'culture',
        role: 'ordinary',
        actor: 'lin',
        remainingQueryBatches: 2,
        outputTokens: 100,
        voice: true,
      },
      protocol: 'continuous-v1',
      tick: 3,
      catalogue: { interfaces: [], events: [] },
      packet: {
        memory: {
          tendencies: null,
          cares: 'The Hearth Keeper',
          views: [{ person: 'moss', view: 'Ember Warden', updatedAt: 2 }],
        },
      },
      retrieval: [],
    };
    const cleaned = withoutPrivateMemory(input);
    expect(JSON.stringify(cleaned)).not.toMatch(/Hearth Keeper|Ember Warden/);
    expect(cleaned).toEqual({
      ...input,
      packet: { memory: { tendencies: null, cares: null, views: [] } },
    });
    expect(JSON.stringify(input)).toContain('Hearth Keeper');
    const earlier: ContinuousModelInput = {
      ...input,
      packet: { memory: { tendencies: null } },
    };
    expect(withoutPrivateMemory(earlier)).toBe(earlier);
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
      'sharing',
      'beliefs',
      'relationships',
      'survival',
      'rest',
      'nonTransactional',
      'symbolic',
      'privateMemory',
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
      survival: { actorRounds: 840, survivalRounds: 349, restRounds: 199 },
      rest: { rests: 199, idle: 44, unconditioned: 3, highEnergy: 44 },
      sharing: { expressions: 5, communicated: 1 },
      nonTransactional: { messages: 17, nonTransactional: 0 },
      symbolic: { everyAgentAtLeastOne: false },
      privateMemory: null,
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
    expect(cultureMarkdown(metrics)).not.toContain('Private memory');
  });
});

describe('retained ex15 culture pilot', () => {
  it('pins sharing expressions, rest and the survival share without rest', () => {
    const metrics = archiveCultureMetrics('experiment/ex15');
    // The gate's survival share is unchanged; the second share leaves out rest.
    expect(metrics.survival).toMatchObject({
      actorRounds: 420,
      survivalRounds: 166,
      restRounds: 115,
    });
    expect(metrics.survival.shareWithoutRest).toBeCloseTo(51 / 420);
    expect(
      metrics.survival.perAgent.map((a) => [
        a.actor,
        a.survivalRounds,
        a.restRounds,
      ]),
    ).toEqual([
      ['lin', 35, 28],
      ['moss', 31, 20],
      ['sol', 26, 17],
      ['kai', 27, 19],
      ['wren', 20, 15],
      ['ivo', 27, 16],
    ]);
    // Every rest step stops at an energy target of 38-40 of 40; 24 rests began within one
    // rest of the cap, so rest is not a default idle behavior by the criterion.
    expect(metrics.rest).toMatchObject({
      rests: 115,
      idle: 24,
      unconditioned: 0,
      highEnergy: 24,
      toFull: 115,
      withStep: 115,
      withRecovery: 115,
      default: false,
    });
    expect(metrics.rest.perAgent.map((a) => [a.actor, a.highEnergy])).toEqual([
      ['lin', 4],
      ['moss', 5],
      ['sol', 2],
      ['kai', 5],
      ['wren', 3],
      ['ivo', 5],
    ]);

    const s = metrics.sharing;
    expect(s).toMatchObject({
      expressions: 31,
      communicated: 9,
      reuses: 23,
      similarReuses: 10,
      exposedReuses: 9,
    });
    const at = (actor: string, round: number) =>
      s.list
        .filter((e) => e.actor === actor && e.round === round)
        .map((e) => [e.kind, e.authored, e.matches.map((m) => m.idea)]);
    expect(at('kai', 1)).toEqual([
      ['public', 1, ['take-moderately']],
      ['note', 1, ['leave-for-others']],
    ]);
    expect(at('kai', 5)).toEqual([
      ['public', 5, ['take-moderately']],
      ['note', 5, ['leave-for-others']],
    ]);
    // Wren spoke at round 9 a tell written in its first plan, before hearing anyone.
    expect(at('wren', 9)).toEqual([['public', 1, ['leave-for-others']]]);
    expect(at('lin', 13)).toEqual([['note', 13, ['coordinate-collection']]]);
    expect(at('lin', 14)).toEqual([]);
    expect(at('sol', 14)).toEqual([
      ['message', 14, ['leave-for-others']],
      ['intention', 14, ['no-depletion']],
      ['note', 14, ['coordinate-collection']],
    ]);
    expect(
      s.ideas.map((i) => [i.idea, i.expressions, i.communicated, i.firstUsers]),
    ).toEqual([
      ['leave-for-others', 7, 3, ['kai', 'wren']],
      ['take-moderately', 6, 2, ['kai']],
      ['no-depletion', 5, 0, ['moss', 'wren']],
      ['share-split', 1, 1, ['moss']],
      ['coordinate-collection', 13, 3, ['lin']],
    ]);
    // Sol's round-41 message repeats Lin's round-40 message to Sol in similar words.
    expect(
      s.reuseList.find(
        (r) => r.actor === 'sol' && r.kind === 'message' && r.round === 41,
      ),
    ).toMatchObject({
      idea: 'coordinate-collection',
      closest: { actor: 'lin', round: 40 },
      similarWording: true,
      exposure: { actor: 'lin', round: 40, via: 'message' },
    });
    // Kai's round-22 preference follows Wren's round-9 tell, which Kai heard.
    expect(
      s.reuseList.find((r) => r.actor === 'kai' && r.authored === 22),
    ).toMatchObject({
      idea: 'leave-for-others',
      exposure: { actor: 'wren', round: 9, via: 'speech' },
    });
    // Owner-only cares and views carry three sharing ideas, none after a public one was heard.
    expect(
      metrics.privateMemory?.sharing.expressions.map((x) => [
        x.actor,
        x.round,
        x.field,
        x.matches.map((m) => m.idea),
        x.exposure,
      ]),
    ).toEqual([
      ['moss', 1, 'cares', ['share-split'], null],
      ['wren', 1, 'cares', ['no-depletion'], null],
      ['sol', 14, 'view', ['coordinate-collection'], null],
    ]);
    expect(cultureMarkdown(metrics)).toContain('### Sharing expressions');
  });
});
