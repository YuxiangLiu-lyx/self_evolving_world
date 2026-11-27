import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { continuousRequest } from '../src/continuous-provider.js';
import type { LongInput } from '../src/long-context.js';
import {
  longOrdinaryInput,
  longWorldInput,
  OPEN_LIFE_GOAL,
  ORIGINAL_GOAL,
} from '../src/long-context.js';
import {
  CULTURE_EXCLUDED_WORDS,
  CULTURE_TENDENCIES,
  CULTURE_V2_OLDGOAL_OPTIONS,
  CULTURE_V2_OPTIONS,
} from '../src/long-culture.js';
import { OPEN_GOAL } from '../src/open-context.js';
import {
  OPEN_GOAL_REPLACEMENTS,
  ORIGINAL_GOAL_ORDINARY,
  VOICE_ORDINARY,
  VOICE_REPLACEMENTS,
} from '../src/long-request.js';
import {
  initialLongWorld,
  LONG_CULTURE_V2_OLDGOAL_OBJECTIVE,
  longObjective,
  longScenario,
} from '../src/long-scenario.js';

const MODEL = 'model';
/** Both tags under the same scope and seed; only the tag differs. */
const v2 = initialLongWorld('long-ex19', 'long-culture-v2');
const old = initialLongWorld('long-ex19', 'long-culture-v2-oldgoal');

const ordinary = (world: V7World, actor: string) =>
  JSON.stringify(
    continuousRequest(MODEL, 'ordinary', longOrdinaryInput(world, actor)),
  );
/** One development request from every person, as at a World Agent barrier. */
const requests: Record<string, V7Action> = Object.fromEntries(
  v2.actors.map((a) => [
    a.id,
    {
      interface: 'request',
      args: {
        name: 'woven mat',
        function: 'Make a flat mat from owned fibre.',
        conditions: 'Owned fibre within reach.',
        inputs: 'fibre',
        costs: 'energy and time',
        effects: 'One mat.',
      },
    },
  ]),
);
const world = (w: V7World) =>
  JSON.stringify(
    continuousRequest(MODEL, 'world', longWorldInput(w, requests)),
  );
/** A raw text as it occurs inside the serialized input, which is a JSON string. */
const escaped = (text: string) => JSON.stringify(text).slice(1, -1);
const count = (text: string, part: string) => text.split(part).length - 1;
/** Every path of a JSON value whose string value equals `value`. */
function paths(value: unknown, wanted: string, at = ''): string[] {
  if (typeof value === 'string') return value === wanted ? [at] : [];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) =>
    paths(v, wanted, at ? `${at}.${k}` : k),
  );
}
/** The brief's forbidden words, in any case and inflection; `\b` keeps "history" and
 * "store" out. */
const FORBIDDEN =
  /\b(?:cultur\w*|belie(?:f|v)\w*|religio\w*|ritual\w*|social\w*|stor(?:y|ies)\w*|myth\w*|legend\w*|tradition\w*)/gi;
/** The pre-existing culture v2 sentence that this tag shares unchanged. */
const STORIES =
  'Names, stories, views, values, explanations and impressions of other people are your own: form, share, revise or drop them freely; they need no evidence.';

describe('culture v2 old-goal genesis', () => {
  it('is the culture v2 genesis except the goal switch and the scenario label', () => {
    const policy = old.config.longDevelopment;
    if (!policy) throw new Error('Missing long policy');
    expect(policy.scenario).toBe('culture-v2-oldgoal');
    expect(policy.culture).toEqual({
      ...CULTURE_V2_OPTIONS,
      incentives: false,
      goal: 'original',
    });
    expect(CULTURE_V2_OLDGOAL_OPTIONS).toEqual({
      ...CULTURE_V2_OPTIONS,
      goal: 'original',
    });
    expect(longScenario(policy)).toBe('long-culture-v2-oldgoal');
    expect(longObjective(policy)).toBe(LONG_CULTURE_V2_OLDGOAL_OBJECTIVE);
    // The whole serialized genesis, with the two fields replaced by placeholders.
    const mask = (w: V7World, goal: string, label: string) => {
      const json = JSON.stringify(w);
      const goalField = `"goal":"${goal}"`,
        labelField = `"scenario":"${label}"`;
      expect(count(json, goalField)).toBe(1);
      expect(count(json, labelField)).toBe(1);
      return json
        .replace(goalField, '"goal":"<goal>"')
        .replace(labelField, '"scenario":"<label>"');
    };
    expect(mask(old, 'original', 'culture-v2-oldgoal')).toBe(
      mask(v2, 'open', 'culture-v2'),
    );
    expect(JSON.stringify(old.config)).not.toBe(JSON.stringify(v2.config));
  });
});

describe('culture v2 old-goal agent inputs at round 0', () => {
  it('uses the ex15 goal sentence verbatim and the culture v2 prompt otherwise', () => {
    expect(ORIGINAL_GOAL).toBe(
      'Maintain health and tolerable risk, understand unknowns through evidence, develop reusable abilities and improve personal and shared living. Choose your own questions, projects and activities; none is required.',
    );
    // It is the sentence that the ex15 voice prompt opens with and that v2 replaced.
    expect(OPEN_GOAL_REPLACEMENTS[0]).toEqual([ORIGINAL_GOAL, OPEN_LIFE_GOAL]);
    expect(VOICE_REPLACEMENTS[0]?.[1].startsWith(STORIES)).toBe(true);
    expect(VOICE_ORDINARY.startsWith(`${ORIGINAL_GOAL} ${STORIES}`)).toBe(true);
    expect(
      ORIGINAL_GOAL_ORDINARY.startsWith(`${ORIGINAL_GOAL} ${STORIES}`),
    ).toBe(true);
  });

  it('differs from culture v2 only in the goal sentence and the leaning presentation', () => {
    v2.actors.forEach((actor, i) => {
      const leaning = CULTURE_TENDENCIES[i]?.leaning ?? '';
      expect(leaning).not.toBe('');
      const before = ordinary(v2, actor.id),
        after = ordinary(old, actor.id);
      // (a) The goal sentence opens the instructions and is the packet goal, on both sides.
      expect(count(before, OPEN_LIFE_GOAL)).toBe(2);
      expect(count(after, ORIGINAL_GOAL)).toBe(2);
      expect(count(before, ORIGINAL_GOAL)).toBe(0);
      expect(count(after, OPEN_LIFE_GOAL)).toBe(0);
      // (b) v2 states the leaning in a sentence after the goal and marks the open goal and
      // the leaning in the context header; the old-goal tag has neither, as in ex15.
      const sentence = ` You tend to value ${leaning}.`,
        markers = escaped(`"voice":true,"goal":"open","leaning":"${leaning}",`),
        bare = escaped('"voice":true,');
      expect(count(before, `${OPEN_LIFE_GOAL}${sentence} ${STORIES}`)).toBe(1);
      expect(count(before, sentence)).toBe(1);
      expect(count(before, markers)).toBe(1);
      expect(count(after, `${ORIGINAL_GOAL} ${STORIES}`)).toBe(1);
      expect(count(after, bare)).toBe(1);
      expect(after).not.toContain('You tend to value');
      // Placeholders: the goal sentence on both sides, and the leaning presentation at its
      // two v2 positions, where the old-goal tag presents nothing.
      const GOAL = '<goal>',
        LEANING = '<leaning>',
        HEADER = escaped('"voice":true,<leaning>');
      const maskedBefore = before
        .replace(sentence, LEANING)
        .replace(markers, HEADER)
        .replaceAll(OPEN_LIFE_GOAL, GOAL);
      const maskedAfter = after
        .replace(`${ORIGINAL_GOAL} ${STORIES}`, `${GOAL}${LEANING} ${STORIES}`)
        .replace(bare, HEADER)
        .replaceAll(ORIGINAL_GOAL, GOAL);
      expect(maskedAfter).toBe(maskedBefore);
      expect(count(maskedAfter, GOAL)).toBe(2);
      expect(count(maskedAfter, LEANING)).toBe(2);
      // The leaning stays only as the tendencies data field, exactly as ex15 showed it.
      const input = longOrdinaryInput(old, actor.id),
        ex15 = longOrdinaryInput(
          initialLongWorld('long-ex19', 'long-culture'),
          actor.id,
        );
      expect(paths(input, leaning)).toEqual([
        'packet.memory.tendencies.leaning',
      ]);
      expect(paths(ex15, leaning)).toEqual([
        'packet.memory.tendencies.leaning',
      ]);
      expect(
        (input.packet.memory as { tendencies: unknown }).tendencies,
      ).toEqual((ex15.packet.memory as { tendencies: unknown }).tendencies);
      expect(input.longContext).toEqual({
        ...ex15.longContext,
        compaction: true,
      });
      expect(input.packet.goal).toBe(ORIGINAL_GOAL);
    });
  });

  it('shows the leaning as the retained ex15 input did', () => {
    // The first retained ex15 ordinary call (Lin, round 0, scope long-ex15).
    const retained = (
      JSON.parse(
        readFileSync('experiment/ex15/calls/ordinary-1.json', 'utf8'),
      ) as { input: LongInput }
    ).input;
    expect(retained.longContext.actor).toBe('lin');
    expect(paths(retained, 'freedom')).toEqual([
      'packet.memory.tendencies.leaning',
    ]);
    expect(retained.longContext).not.toHaveProperty('goal');
    expect(retained.longContext).not.toHaveProperty('leaning');
    const instructions = continuousRequest(
      MODEL,
      'ordinary',
      retained,
    ).instructions;
    expect(instructions.startsWith(`${ORIGINAL_GOAL} ${STORIES}`)).toBe(true);
    expect(instructions).not.toContain('freedom');
    // ex15's packet goal was the older open-development sentence; this tag uses the
    // prompt's goal sentence in both places, as culture v2 uses its open goal.
    expect(retained.packet.goal).toBe(OPEN_GOAL);
    expect(OPEN_GOAL).not.toBe(ORIGINAL_GOAL);
    const lin = longOrdinaryInput(old, 'lin');
    expect((lin.packet.memory as { tendencies: unknown }).tendencies).toEqual(
      (retained.packet.memory as { tendencies: unknown }).tendencies,
    );
  });

  it('gives the World Agent exactly the culture v2 request', () => {
    expect(world(old)).toBe(world(v2));
  });

  it('shows neither the goal switch nor the scenario label to any agent', () => {
    for (const json of [
      ...old.actors.map((a) => ordinary(old, a.id)),
      world(old),
    ]) {
      expect(json).not.toContain('"original"');
      expect(json).not.toContain(escaped('"original"'));
      expect(json).not.toMatch(/oldgoal|culture-v2/);
    }
    for (const actor of old.actors) {
      const context = longOrdinaryInput(old, actor.id).longContext;
      expect(context).not.toHaveProperty('goal');
      expect(context).not.toHaveProperty('leaning');
    }
  });

  it('contains no forbidden word except the shared culture v2 sentence with "stories"', () => {
    for (const actor of old.actors) {
      const after = ordinary(old, actor.id),
        before = ordinary(v2, actor.id);
      const hits = [...after.matchAll(FORBIDDEN)];
      expect(hits.map((m) => m[0])).toEqual(['stories']);
      // The only occurrence lies in the sentence, which is the same in both tags.
      const start = after.indexOf(STORIES);
      expect(count(after, STORIES)).toBe(1);
      expect(count(before, STORIES)).toBe(1);
      expect(hits[0]?.index).toBe(start + STORIES.indexOf('stories'));
      expect([...before.matchAll(FORBIDDEN)].map((m) => m[0])).toEqual([
        'stories',
      ]);
      expect(after).not.toMatch(CULTURE_EXCLUDED_WORDS);
    }
    // The World Agent prompt keeps its pre-existing "social participation" sentence; its
    // request is byte-identical to culture v2's (see above).
    expect([...world(old).matchAll(FORBIDDEN)].map((m) => m[0])).toEqual([
      'social',
    ]);
  });
});
