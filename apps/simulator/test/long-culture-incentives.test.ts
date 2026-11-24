import { describe, expect, it } from 'vitest';
import {
  EXPRESSION_INCENTIVE_RULES,
  continuousRegistry,
  expressionSign,
  v7Clone,
  v7Install,
  v7Observe,
  v7Registry,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Package,
  V7World,
} from '@self-evolving-world/world-core';
import { longRetrieve } from '../src/long-context.js';
import { initialLongWorld } from '../src/long-scenario.js';

const WAIT: V7Action = { interface: 'wait', args: {} };
const on = () => initialLongWorld('long-ex16', 'long-culture-incentives');
const off = () => initialLongWorld('long-ex16', 'long-culture');
function step(world: V7World, actions: Record<string, V7Action> = {}) {
  const result = v7Step(
    world,
    Object.fromEntries(world.actors.map((a) => [a.id, actions[a.id] ?? WAIT])),
    continuousRegistry(world),
  );
  if (result.paused) throw new Error(result.paused);
  return result.world;
}
const tell = (text: string): V7Action => ({
  interface: 'tell',
  args: { text },
});
const message = (recipient: string): V7Action => ({
  interface: 'message',
  args: { recipient, text: 'Hello', urgency: 'ordinary', subject: 'greeting' },
});
const source = (w: V7World, actor: string, id: string) =>
  w.actors
    .find((a) => a.id === actor)
    ?.wellbeing.sources.find((s) => s.source === id);
const awards = (w: V7World, actor: string, id: string) =>
  w.events.filter(
    (e) =>
      e.type === 'satisfaction' && e.actor === actor && e.data.source === id,
  ).length;

describe('culture incentives', () => {
  it('exist only when switched on and reward the person who is answered, not the speaker', () => {
    for (const [world, enabled] of [
      [off(), false],
      [on(), true],
    ] as const) {
      expect(world.satisfaction.some((r) => r.id === 'answered')).toBe(enabled);
      let w = step(world, { lin: tell('Moss, the berries are ripe.') });
      w = step(w, { moss: tell('Thank you, Lin.') });
      const acknowledged = w.events.filter((e) => e.type === 'acknowledged');
      expect(acknowledged.map((e) => e.actor)).toEqual(enabled ? ['lin'] : []);
      expect(awards(w, 'lin', 'answered')).toBe(enabled ? 1 : 0);
      expect(awards(w, 'moss', 'answered')).toBe(0);
      if (enabled) {
        expect(acknowledged[0]).toMatchObject({
          interface: null,
          position: null,
          data: { from: ['moss'], modes: ['response'], qualified: true },
        });
        // Derived evidence is private to the person it concerns.
        expect(
          v7Observe(w, 'moss').events.some((e) => e.type === 'acknowledged'),
        ).toBe(false);
      }
    }
  });

  it('caps, cools down, deduplicates and decays the answered source', () => {
    let w = step(on(), { lin: tell('Moss, are you there?') });
    w = step(w, { moss: tell('Lin, yes.') });
    expect(source(w, 'lin', 'answered')?.value).toBe(0.5);
    expect(source(w, 'lin', 'answered')?.value).toBeLessThanOrEqual(0.6);
    // The same pair within its window produces no further evidence.
    w = step(w, { moss: message('lin') });
    expect(w.events.some((e) => e.type === 'acknowledged')).toBe(false);
    // Another pair qualifies as evidence, but the source is still cooling down.
    w = step(w, { lin: message('ivo') });
    w = step(w, { ivo: message('lin'), kai: tell('Lin and Ivo, hello.') });
    expect(
      w.events.filter((e) => e.type === 'acknowledged').map((e) => e.data.from),
    ).toEqual([['ivo']]);
    expect(awards(w, 'lin', 'answered')).toBe(0);
    // The held value then decays to nothing.
    for (let i = 0; i < 12; i++) w = step(w);
    expect(source(w, 'lin', 'answered')?.value ?? 0).toBeLessThan(0.1);
    for (let i = 0; i < 60; i++) w = step(w);
    expect(source(w, 'lin', 'answered')?.value ?? 0).toBe(0);
  }, 60_000);

  it('combines several answers in one round into one event', () => {
    let w = step(on(), { lin: tell('Moss and Sol, look at this.') });
    w = step(w, { moss: tell('Lin, I see it.'), sol: message('lin') });
    const events = w.events.filter((e) => e.type === 'acknowledged');
    expect(events).toHaveLength(1);
    expect(events[0]?.data.from).toEqual(['moss', 'sol']);
    expect(awards(w, 'lin', 'answered')).toBe(1);
  });

  it('rewards repeated two-way contact for both people once per window', () => {
    let w = on();
    for (let i = 0; i < 2; i++) {
      w = step(w, { lin: message('moss') });
      w = step(w, { moss: message('lin') });
    }
    expect(
      w.events
        .filter((e) => e.type === 'reciprocated')
        .map((e) => e.actor)
        .sort(),
    ).toEqual(['lin', 'moss']);
    expect(awards(w, 'lin', 'two-way')).toBe(1);
    expect(awards(w, 'moss', 'two-way')).toBe(1);
    for (let i = 0; i < 3; i++) {
      w = step(w, { lin: message('moss') });
      w = step(w, { moss: message('lin') });
      expect(w.events.some((e) => e.type === 'reciprocated')).toBe(false);
    }
  });

  it('notices made things once per person, but never signs', () => {
    const base = v7Clone(on());
    const moss = base.actors.find((a) => a.id === 'moss');
    if (!moss) throw new Error('Missing actor');
    base.objects.push({
      id: 'fixture-mat',
      kind: 'woven-mat',
      name: 'Woven mat',
      spatial: {
        x: moss.position.x + 0.6,
        y: moss.position.y + 0.6,
        angle: 0,
        shape: { kind: 'circle', radius: 0.2 },
        solid: false,
        interaction: 0.65,
        entrances: [],
      },
      visual: {
        component: 'loose-material',
        color: '#a08060',
        accent: '#d0b080',
        label: 'Mat',
        state: 'ready',
      },
      data: {},
      createdBy: 'lin',
      createdAt: 0,
      revision: 'fixture@1',
    });
    let w = step(base);
    const noticed = w.events.filter((e) => e.type === 'work-noticed');
    expect(noticed).toHaveLength(1);
    expect(noticed[0]).toMatchObject({
      actor: 'lin',
      data: { mode: 'seen', object: 'fixture-mat' },
    });
    expect(awards(w, 'lin', 'work-noticed')).toBe(1);
    // Each other person counts once; the next person who sees it later still counts.
    const seenBy = new Set<string>();
    for (let i = 0; i < 20; i++) {
      w = step(w);
      for (const e of w.events.filter((e) => e.type === 'work-noticed'))
        seenBy.add(JSON.stringify(e.data.by));
    }
    expect(seenBy.has(JSON.stringify(noticed[0]?.data.by))).toBe(false);
    // Signs are excluded from made things.
    let signs = step(on(), {
      lin: { interface: 'mark', args: { subject: '', text: 'Lin' } },
    });
    expect(signs.objects.filter(expressionSign)).toHaveLength(1);
    for (let i = 0; i < 5; i++) signs = step(signs);
    expect(signs.events.some((e) => e.type === 'work-noticed')).toBe(false);
  });

  it('never rewards naming, marking, telling, inviting, queries or requests as such', () => {
    let w = on();
    const before = v7Signature(w);
    longRetrieve(w, 'lin', 'ordinary', [
      { section: 'abilities', search: 'name', ids: [], offset: 0, part: 0 },
      { section: 'observed', search: '', ids: [], offset: 0, part: 0 },
    ]);
    expect(v7Signature(w)).toBe(before);
    const solo: V7Action[] = [
      tell('A story about the river.'),
      { interface: 'name', args: { subject: '', text: 'River bend' } },
      { interface: 'mark', args: { subject: '', text: 'Story told here' } },
      {
        interface: 'invite',
        args: { x: 14, y: 15, round: 20, text: 'Hear a story' },
      },
      {
        interface: 'request',
        args: {
          name: 'x',
          function: 'Carve a story stone',
          conditions: '',
          inputs: '',
          costs: '',
          effects: '',
        },
      },
    ];
    const registry = continuousRegistry(w);
    for (const action of solo.slice(0, 4)) {
      w = step(w, { lin: action });
      expect(w.events.filter((e) => e.type === 'satisfaction')).toEqual([]);
    }
    // A request is never executed as an award either; it needs review before any effect.
    const requested = v7Step(
      w,
      Object.fromEntries(
        w.actors.map((a) => [a.id, a.id === 'lin' ? (solo[4] ?? WAIT) : WAIT]),
      ),
      registry,
      {},
      [
        {
          actor: 'lin',
          decision: 'reject',
          ability: null,
          learning: 0,
          reason: 'Fixture',
          specification: '',
          experienceReview: '',
          visualReview: '',
        },
      ],
    );
    expect(
      requested.world.events.filter((e) => e.type === 'satisfaction'),
    ).toEqual([]);
  });

  it('accepts interface-free derived evidence only from the authored culture foundation', () => {
    const world = on();
    const rule = EXPRESSION_INCENTIVE_RULES[0];
    if (!rule) throw new Error('Missing rule');
    const fixture: V7Package = {
      id: 'fixture-derived',
      version: 1,
      scope: world.config.development?.scope ?? '',
      dependencies: ['foundation-open@1'],
      description: 'Fixture only',
      resources: [],
      processes: {},
      handlers: {},
      abilities: [],
      visualComponents: [],
      events: ['acknowledged'],
      satisfaction: [
        { ...rule, id: 'fixture-derived', equivalence: 'fixture:derived' },
      ],
    };
    const registry = v7Registry([
      ...continuousRegistry(world).packages,
      fixture,
    ]);
    expect(() => v7Install(world, registry, 'fixture-derived@1')).toThrow(
      'Invalid or ungrounded satisfaction rule.',
    );
  });
});
