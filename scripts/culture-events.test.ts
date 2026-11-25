import { describe, expect, it } from 'vitest';
import {
  archiveCultureMetrics,
  cultureMarkdown,
  G2_REVISION,
  phraseClauses,
  phraseMatch,
  phraseTokens,
  PHRASE_RULE,
} from './culture-metrics.js';
import type { CultureMetrics } from './culture-metrics.js';

/** Clause-to-clause match with every word counted as content, for the rule's word thresholds. */
const match = (a: string, b: string) =>
  phraseMatch(phraseTokens(a), phraseTokens(b), () => true);

describe('phrase matching', () => {
  it('matches the ex17 saying and rejects unrelated clauses', () => {
    const m = match(
      "we needn't make every moment into work",
      "we needn't turn every lovely thing into work",
    );
    expect(m?.shared).toEqual(['we', 'needn', 'every', 'into', 'work']);
    expect(m?.coverage).toBeCloseTo(5 / 7);
    // Fewer shared words in order than the rule's minimum.
    expect(
      match('I will gather some roots now', 'the wind was too strong today'),
    ).toBeNull();
    expect(PHRASE_RULE.minShared).toBe(4);
  });

  it('splits text into clauses at punctuation, semicolons and commas', () => {
    expect(
      phraseClauses(
        "Sol, I'd enjoy some quiet company here. I'm setting the planting trial aside for now; we needn't make every moment into work.",
      ),
    ).toEqual([
      "I'd enjoy some quiet company here",
      "I'm setting the planting trial aside for now",
      "we needn't make every moment into work",
    ]);
  });
});

describe('retained ex17 culture rerun', () => {
  let cached: CultureMetrics | undefined;
  const metrics = () =>
    (cached ??= archiveCultureMetrics('experiment/ex17', 80));

  it('detects the round-52 saying repeated at round 65 with both calls and the receipt', () => {
    const p = metrics().phrases.list.find(
      (x) => x.actor === 'sol' && x.round === 65 && x.source.round === 52,
    );
    expect(p).toMatchObject({
      kind: 'public',
      call: 'ordinary-97',
      text: "we needn't turn every lovely thing into work",
      source: {
        actor: 'moss',
        kind: 'public',
        call: 'ordinary-89',
        text: "we needn't make every moment into work",
      },
      received: { tick: 52, via: 'speech' },
    });
    // A pleasantry shares only one content word ("glad") and is not a saying.
    expect(
      metrics().phrases.list.some((x) => /glad you['’]re here/i.test(x.text)),
    ).toBe(false);
    expect(
      metrics().gate.adoption.sayings.some(
        (a) =>
          a.adopter === 'sol' && a.adoptedRound === 65 && a.origin === 'moss',
      ),
    ).toBe(true);
  }, 60_000);

  it('counts the sign-transmitted name and not its coiner reusing a part of it (7g)', () => {
    const m = metrics();
    expect(m.vocabulary.top[0]).toMatchObject({
      term: "Earth's Quiet Gold",
      firstUsers: ['sol'],
      exposedLaterUsers: ['moss'],
    });
    expect(m.gate.adoption.names).toEqual([
      {
        type: 'name',
        text: "Earth's Quiet Gold",
        origin: 'sol',
        round: 14,
        adopter: 'moss',
        adoptedRound: 18,
        via: 'sign',
        call: 'ordinary-48',
      },
    ]);
    expect(
      m.timeline.find((t) => t.type === 'name' && t.round === 14),
    ).toMatchObject({
      actor: 'sol',
      call: 'ordinary-35',
      ref: 'sign-14-sol-158',
    });
  }, 60_000);

  it('passes the revised G2 and still fails the original one', () => {
    const g = metrics().gate;
    expect(g).toMatchObject({
      id: G2_REVISION.id,
      postHoc: true,
      survival: { passed: true },
      symbolic: {
        people: ['moss', 'sol', 'kai', 'ivo'],
        required: 3,
        passed: true,
      },
      adoption: { passed: true },
      passed: true,
      original: { everyAgentAtLeastOne: false, passed: false },
    });
    expect(g.survival.share).toBeCloseTo(
      metrics().survival.shareWithoutRest ?? NaN,
    );
    expect(metrics().idle).toMatchObject({ rounds: 244, actorRounds: 480 });
  }, 60_000);
});

describe('retained ex16 culture run', () => {
  let cached: CultureMetrics | undefined;
  const metrics = () =>
    (cached ??= archiveCultureMetrics('experiment/ex16', 80));

  it('reports the round-51 invitation, the round-60 attendance and the speech at the meeting', () => {
    const [invitation, ...rest] = metrics().invitations.list;
    expect(rest).toEqual([]);
    expect(invitation).toMatchObject({
      host: 'moss',
      round: 51,
      call: 'ordinary-119',
      sign: 'sign-51-moss-600',
      meetingRound: 60,
      attendance: {
        event: 'event-60-world-690',
        present: ['ivo', 'moss', 'sol'],
        came: ['ivo'],
      },
      arrivals: [
        { actor: 'sol', round: 60, call: 'ordinary-129' },
        { actor: 'ivo', round: 60, call: 'ordinary-128' },
      ],
    });
    expect(
      invitation?.speech
        .filter((s) => s.round <= 61 && s.actor !== 'moss')
        .map((s) => [s.actor, s.round, s.call, s.text.slice(0, 36)]),
    ).toEqual([
      ['ivo', 60, 'ordinary-128', "Moss, I'd welcome some quiet company"],
      ['sol', 61, 'ordinary-129', "I'd welcome some quiet company, Moss"],
    ]);
  }, 60_000);

  it("finds Sol's round-70 screen, valued for its pattern although it gave no shelter", () => {
    const m = metrics();
    expect(m.works.map((w) => [w.id, w.maker, w.created, w.completed])).toEqual(
      [
        ['mat-37-moss-435', 'moss', 37, 43],
        ['screen-50-sol-571', 'sol', 50, 57],
        ['mat-79-wren-890', 'wren', 79, null],
      ],
    );
    expect(m.appearance.list).toHaveLength(1);
    expect(m.appearance.list[0]).toMatchObject({
      actor: 'sol',
      round: 70,
      call: 'ordinary-134',
      work: 'screen-50-sol-571',
      failure: 'too strong',
      appearance: 'woven, pattern',
      acknowledgements: [{ actor: 'moss', round: 71, call: 'ordinary-138' }],
    });
  }, 60_000);

  it('passes the revised G2 with idle time apart and dates every item with its call', () => {
    const m = metrics();
    expect(m.gate).toMatchObject({
      survival: { passed: true },
      symbolic: { people: ['lin', 'moss', 'sol', 'kai', 'ivo'], passed: true },
      passed: true,
      original: { passed: false },
    });
    expect(m.gate.survival.share).toBeCloseTo(57 / 480);
    expect(m.idle).toMatchObject({ rest: 186, wait: 57, rounds: 243 });
    expect(
      m.gate.adoption.sayings.map((a) => [
        a.origin,
        a.round,
        a.adopter,
        a.adoptedRound,
      ]),
    ).toContainEqual(['lin', 19, 'moss', 22]);
    expect(m.timeline.map((t) => t.type)).toEqual(
      expect.arrayContaining([
        'rule',
        'saying-adopted',
        'invitation',
        'attendance',
        'work-started',
        'work-completed',
        'valued-appearance',
      ]),
    );
    expect(m.timeline.filter((t) => t.actor && !t.call)).toEqual([]);
    const md = cultureMarkdown(m);
    expect(md).toContain('### Gate G2 (revised after the fact)');
    expect(md).toContain('### Timeline');
  }, 60_000);
});
