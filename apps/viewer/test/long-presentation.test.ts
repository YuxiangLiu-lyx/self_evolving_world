import { readFileSync } from 'node:fs';
import type { V7World } from '@self-evolving-world/world-core';
import { currentAction, progress } from '../src/presentation/ex9/model.js';
const saved = JSON.parse(
  readFileSync(
    'docs/exec-plans/evidence/pr-31-long-open-development/prepared-placement-fixture.json',
    'utf8',
  ),
) as { world: V7World };
import { expect, it } from 'vitest';
import {
  presentationExperiment,
  parseStory,
} from '../src/presentation/session.js';
it('keeps ex9 default, selects only the supported new archive, and rejects invalid story identities', () => {
  expect(presentationExperiment('')).toBe('ex9');
  expect(presentationExperiment('?experiment=ex13')).toBe('ex13');
  expect(presentationExperiment('?experiment=../../private')).toBe('ex9');
  expect(() =>
    parseStory({
      experiment: 'ex13',
      title: 'Retained evidence',
      initialRound: 0,
      bookmarks: [
        {
          tick: 1,
          actor: 'unknown',
          sourceActor: 'lin',
          title: 'x',
          type: 'moved',
          text: 'x',
        },
      ],
    }),
  ).toThrow('Invalid');
  expect(
    parseStory({
      experiment: 'ex13',
      title: 'Retained evidence',
      initialRound: 0,
      bookmarks: [],
    }),
  ).toMatchObject({ experiment: 'ex13', bookmarks: [] });
});

it('shows recorded paid work without implying project success and recognizes actual rest through a generated interface', () => {
  const world = structuredClone(saved.world),
    actor = world.actors.find((a) => a.id === 'sol');
  if (!actor) throw new Error('Missing retained actor');
  const base = world.events[0];
  if (!base) throw new Error('Missing retained event shape');
  world.events = [
    {
      ...base,
      actor: actor.id,
      interface: 'moss-resting-pad-trial',
      success: true,
      type: 'process-progress',
      data: { completedWork: 2, initialWork: 3, remainingWork: 1 },
    },
  ];
  expect(progress(world, actor)).toMatchObject({
    paid: 2,
    total: 3,
    label: 'Paid work steps; see actual outcome',
  });
  expect(currentAction(world, actor)).toMatchObject({
    working: true,
    resting: false,
    label: 'Loose moss resting trial',
  });
  const work = world.events[0];
  if (!work) throw new Error('Missing fixture work');
  const rest = { ...work, type: 'rested', data: { recovered: 3.2 } };
  world.events = [rest];
  expect(currentAction(world, actor)).toMatchObject({
    working: false,
    resting: true,
  });
  rest.success = false;
  expect(currentAction(world, actor)).toMatchObject({
    working: false,
    resting: false,
    failed: true,
  });
});

it('shows a performed specimen examination without a food-safety or opening claim', () => {
  const w = structuredClone(saved.world),
    a = w.actors[0],
    e = w.events[0];
  if (!a || !e) throw new Error('Missing retained fixture shape');
  w.events = [
    {
      ...e,
      actor: a.id,
      interface: 'owned-hazelnut-assessment',
      type: 'specimen-examination-completed',
      success: true,
      data: { interiorVisible: false, progress: 1 },
    },
  ];
  expect(currentAction(w, a)).toMatchObject({
    working: true,
    failed: false,
    label: 'Specimen examined; safety unverified',
  });
});

it('distinguishes a completed exterior contact test from actual extraction', () => {
  const w = structuredClone(saved.world),
    a = w.actors[0],
    e = w.events[0];
  if (!a || !e) throw Error('Missing retained fixture');
  w.events = [
    {
      ...e,
      actor: a.id,
      interface: 'source-bound-opened-hazelnut-access-trial',
      type: 'nut-access-completed',
      success: true,
      data: { transferred: 0 },
    },
  ];
  expect(currentAction(w, a).label).toBe(
    'Contact test ended; no material transferred',
  );
});

it('labels completed bounded contacts and fruit reports without implying safe or useful outcomes', () => {
  const w = structuredClone(saved.world),
    a = w.actors[0],
    e = w.events[0];
  if (!a || !e) throw Error('Missing fixture');
  w.events = [
    {
      ...e,
      actor: a.id,
      success: true,
      type: 'nut-opening-completed',
      interface: 'source-bound-hazelnut-opening-trial',
      data: { exposed: false },
    },
  ];
  expect(currentAction(w, a).label).toBe(
    'Bounded contact ended; result unverified',
  );
  const contact = w.events[0];
  if (!contact) throw Error('Missing contact');
  contact.data.exposed = true;
  expect(currentAction(w, a).label).toBe(
    'Contact exposed a region; safety unverified',
  );
  w.events = [
    {
      ...e,
      actor: a.id,
      success: true,
      type: 'apple-assessment-completed',
      interface: 'bounded-unfamiliar-food-assessment',
      data: { outcome: 'inconclusive-food-safety' },
    },
  ];
  expect(currentAction(w, a)).toMatchObject({
    working: true,
    label: 'Assessment inconclusive; safety unverified',
  });
  const report = w.events[0];
  if (!report) throw Error('Missing report');
  report.success = false;
  expect(currentAction(w, a)).toMatchObject({ working: false, failed: true });
});
