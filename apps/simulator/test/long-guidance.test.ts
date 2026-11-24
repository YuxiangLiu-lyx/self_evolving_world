import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { V7Execution } from '../src/continuous-run.js';
import { longOrdinaryInput, longWorldInput } from '../src/long-context.js';
import {
  GENERAL_CAPABILITY_GUIDANCE,
  longRequest,
  PLAN_HORIZON_GUIDANCE,
} from '../src/long-request.js';

const PAUSE = 'experiment/ex13/technical-pauses/round-157/execution.json';
const saved = () => JSON.parse(readFileSync(PAUSE, 'utf8')) as V7Execution;
type Guidance = ('plan-horizon' | 'general-capabilities')[];
const withGuidance = (s: V7Execution, guidance: Guidance) => {
  const world = structuredClone(s.world);
  if (!world.config.longDevelopment) throw Error('Missing long policy');
  world.config.longDevelopment.guidance = guidance;
  return world;
};
const ordinary = (world: V7Execution['world'], s: V7Execution) =>
  longOrdinaryInput(world, 'lin', s.cursors.lin, s.longRetrieval?.lin);

it('leaves ex13 inputs and instructions without addenda when guidance is absent', () => {
  const s = saved();
  expect(s.world.config.longDevelopment?.guidance).toBeUndefined();
  const input = ordinary(s.world, s);
  expect('guidance' in input.longContext).toBe(false);
  const text = longRequest(s.model, input).instructions;
  expect(text).not.toContain(PLAN_HORIZON_GUIDANCE);
  expect(text).not.toContain(GENERAL_CAPABILITY_GUIDANCE);
});

it('records the chosen addenda in the input and appends each only to its role', () => {
  const s = saved();
  const both = withGuidance(s, ['plan-horizon', 'general-capabilities']);
  const input = ordinary(both, s);
  expect(input.longContext.guidance).toEqual([
    'plan-horizon',
    'general-capabilities',
  ]);
  const ordinaryText = longRequest(s.model, input).instructions;
  expect(ordinaryText.endsWith(PLAN_HORIZON_GUIDANCE)).toBe(true);
  expect(ordinaryText).not.toContain(GENERAL_CAPABILITY_GUIDANCE);
  const worldText = longRequest(s.model, longWorldInput(both, {})).instructions;
  expect(worldText.endsWith(GENERAL_CAPABILITY_GUIDANCE)).toBe(true);
  expect(worldText).not.toContain(PLAN_HORIZON_GUIDANCE);
});

it('switches each addendum independently for ablation', () => {
  const s = saved();
  const planOnly = withGuidance(s, ['plan-horizon']);
  expect(
    longRequest(s.model, longWorldInput(planOnly, {})).instructions,
  ).not.toContain(GENERAL_CAPABILITY_GUIDANCE);
  const generalOnly = withGuidance(s, ['general-capabilities']);
  expect(
    longRequest(s.model, ordinary(generalOnly, s)).instructions,
  ).not.toContain(PLAN_HORIZON_GUIDANCE);
});
