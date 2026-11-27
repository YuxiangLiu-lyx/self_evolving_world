import { describe, expect, it } from 'vitest';
import type { V7Event } from '../packages/world-core/src/index.js';
import {
  attendedInvitations,
  caresLeanings,
  confirmedPositives,
  labelMeasures,
  leaningMatches,
} from './culture-metrics-pairs.js';
import type { CultureInput, CultureRound } from './culture-metrics.js';

const round = (
  tick: number,
  memory: CultureRound['memory'] = {},
  events: V7Event[] = [],
): CultureRound => ({ tick, actions: {}, events, memory, intentions: {} });
const input = (rounds: CultureRound[]): CultureInput => ({
  archive: 'experiment/fixture',
  actors: [
    { id: 'lin', name: 'Lin' },
    { id: 'moss', name: 'Moss' },
    { id: 'wren', name: 'Wren' },
  ],
  vision: 5,
  start: {},
  abilities: [],
  resources: [],
  environment: [],
  harness: [],
  rounds,
});
const attendance = (
  tick: number,
  host: string,
  present: string[],
): V7Event => ({
  id: `event-${String(tick)}`,
  tick,
  actor: null,
  type: 'attendance',
  interface: null,
  success: true,
  description: '',
  position: { x: 0, y: 0 },
  target: 'sign-1',
  data: { invitation: 'sign-1', host, round: tick, present, came: [] },
});
const item = (
  id: string,
  person: string,
  categories: string[],
  links: {
    field: string;
    entry: string;
    by: string;
  }[] = [],
) => ({
  id,
  tick: 5,
  call: 'ordinary-1',
  person,
  kind: 'speech',
  text: 'text',
  categories,
  links: links.map((l) => ({
    ...l,
    gist: `gist ${l.entry}`,
    item: 'u0000',
    tick: 1,
    call: 'ordinary-0',
  })),
});

describe('experiment B outcome measures', () => {
  it('matches leaning words with the review item B exclusions', () => {
    expect(
      leaningMatches('freedom', 'free time, freedom, moving freely'),
    ).toEqual(['freedom', 'freely']);
    expect(
      leaningMatches(
        'belonging',
        'a sense of belonging; tools belonging to Kai; it belongs here',
      ),
    ).toEqual(['belonging']);
    expect(leaningMatches('mastery', 'Cultivation is mastered')).toEqual([]);
    expect(
      leaningMatches(
        'mastery',
        'practical mastery and the wish to master weaving; mastery alone',
      ),
    ).toEqual(['practical mastery', 'master']);
    expect(
      leaningMatches('fairness', 'treat others fairly and fair shares'),
    ).toEqual(['fairly', 'fair']);
    expect(leaningMatches('calm', 'Living calmly in calm company')).toEqual([
      'calmly',
      'calm',
    ]);
    expect(leaningMatches('beauty', 'beautiful things and beauty')).toEqual([
      'beautiful',
      'beauty',
    ]);
  });

  it('counts people whose cares in any version contain their own leaning word', () => {
    const cares = caresLeanings(
      input([
        round(0, { lin: { cares: 'freedom before the window' } }),
        round(3, {
          lin: { cares: 'Staying healthy.' },
          moss: { cares: 'Fairness for all.' },
        }),
        round(9, { lin: { cares: 'Staying healthy with freedom to roam.' } }),
        round(12, { lin: { cares: 'Staying healthy.' } }),
      ]),
      { lin: 'freedom', moss: 'belonging', wren: 'mastery' },
    );
    expect(
      cares.map((c) => [c.actor, c.first?.tick ?? null, c.versions]),
    ).toEqual([
      ['lin', 9, 2],
      ['moss', null, 1],
      ['wren', null, 0],
    ]);
    expect(cares[0]?.first?.matches).toEqual(['freedom']);
  });

  it('counts invitations whose attendance lists someone other than the host', () => {
    const attended = attendedInvitations(
      input([
        round(10, {}, [attendance(10, 'lin', ['lin'])]),
        round(20, {}, [attendance(20, 'moss', ['lin', 'moss'])]),
        round(30, {}, [attendance(30, 'wren', [])]),
      ]),
    );
    expect(attended.map((a) => [a.round, a.host, a.present])).toEqual([
      [20, 'moss', ['lin', 'moss']],
    ]);
  });

  it('counts only verified categories and links to another person', () => {
    const items = [
      item('u1', 'lin', ['naming']),
      item(
        'u2',
        'moss',
        ['name-adoption'],
        [{ field: 'adoptsName', entry: 'N1', by: 'lin' }],
      ),
      item(
        'u3',
        'wren',
        ['name-adoption'],
        [{ field: 'adoptsName', entry: 'N1', by: 'lin' }],
      ),
      item('u4', 'lin', ['narrative']),
      item(
        'u5',
        'moss',
        ['narrative-continuation', 'norm-repetition'],
        [
          { field: 'continues', entry: 'S1', by: 'lin' },
          { field: 'repeatsNorm', entry: 'R1', by: 'wren' },
        ],
      ),
      item('u6', 'wren', ['valued-object', 'invitation']),
      item('u7', 'lin', ['valued-object']),
      item(
        'u8',
        'moss',
        ['norm-repetition'],
        [{ field: 'repeatsNorm', entry: 'R2', by: 'lin' }],
      ),
    ];
    const confirmed = confirmedPositives(items, [
      { item: 'u1', sample: 'positive', verdict: 'agree' },
      { item: 'u2', sample: 'positive', verdict: 'agree' },
      { item: 'u3', sample: 'positive', verdict: 'agree' },
      { item: 'u4', sample: 'positive', verdict: 'agree' },
      {
        item: 'u5',
        sample: 'positive',
        verdict: 'partial',
        confirmed: ['norm-repetition'],
      },
      {
        item: 'u6',
        sample: 'positive',
        verdict: 'partial',
        confirmed: ['valued-object'],
        object: 'object-3',
      },
      { item: 'u7', sample: 'positive', verdict: 'agree', object: 'object-3' },
      { item: 'u8', sample: 'positive', verdict: 'disagree' },
    ]);
    const m = labelMeasures(confirmed);
    expect(m.adoptedNames).toEqual([
      { entry: 'N1', gist: 'gist N1', by: 'lin', adopters: ['moss', 'wren'] },
    ]);
    expect(m.narratives).toEqual({ items: ['u4'], continuations: [] });
    expect(m.normRepetitions).toEqual([
      { item: 'u5', person: 'moss', entry: 'R1', by: 'wren' },
    ]);
    expect(m.valuedObjects).toEqual([
      { object: 'object-3', items: ['u6', 'u7'] },
    ]);
  });

  it('refuses unverified positives, unlabelled confirmations and unnamed valued objects', () => {
    const items = [item('u1', 'lin', ['valued-object'])];
    expect(() => confirmedPositives(items, [])).toThrow(
      /without a verification verdict/,
    );
    expect(() =>
      confirmedPositives(items, [
        { item: 'u1', sample: 'positive', verdict: 'partial' },
      ]),
    ).toThrow(/needs its confirmed categories/);
    expect(() =>
      confirmedPositives(items, [
        {
          item: 'u1',
          sample: 'positive',
          verdict: 'partial',
          confirmed: ['naming'],
        },
      ]),
    ).toThrow(/were not labelled/);
    expect(() =>
      confirmedPositives(items, [
        { item: 'u1', sample: 'positive', verdict: 'agree' },
      ]),
    ).toThrow(/needs the object/);
  });
});
