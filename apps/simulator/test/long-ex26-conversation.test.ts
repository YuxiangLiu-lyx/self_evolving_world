import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  v7Clone,
  v7Distance,
  v7Install,
  v7Observe,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Event,
  V7Package,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';
import { VILLAGES } from '../src/long-villages.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'reciprocal-conversation';
const REVISION = `${id}@1`;
const OPEN = `${id}:work:open`;
const LAST = `${id}:last`;
const BOOK = `${id}:sessions`;
const WAIT: V7Action = { interface: 'wait', args: {} };
const LEARN: V7Action = { interface: 'learn', args: { ability: id } };
/** The brief's agent-visible exclusions beyond the import list, and no mention of the far group. */
const EXTRA_EXCLUDED = /history|spiritual/i;
const MENTION = /villag|neighbo|meeting|middle|other group|stranger/i;
/** sha256 of JSON.stringify of the key-sorted map from id@version to the sha256 of
 * JSON.stringify of each of the 136 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex26/hashes-before-4.json, taken before this change). */
const EXISTING_DIGEST =
  'a21f4c98a00740a65b9f51b3bbedb2e9904d56c4d056601eb154b09a39a6320f';
const TOPIC = 'where the berries are';
const RANGE = 'must be alive and within 5 units of you';
const UNKNOWN = 'You have no open conversation with that session id';
const UNSEEN = 'Invite one other living person you can see within 5 units.';
/** Kai's start; free places due north of it at the given distances. */
const KAI = { x: 131.1, y: 16.91 };
const NORTH = { 4.6: 12.31, 4.99: 11.92, 5.01: 11.9, 5.51: 11.4 } as const;

type Data = Record<string, unknown>;
type Round = ReturnType<typeof step>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const conversationPackage = (): V7Package => {
  const p = V7_PACKAGES.find((p) => p.id === id);
  if (!p) throw new Error('Missing package.');
  return p;
};
const act = (mode: string, args: Data = {}): V7Action => ({
  interface: id,
  args: { mode, ...args },
});
const propose = (args: Data = {}) =>
  act('propose', {
    participants: ['kai', 'wren'],
    topic: TOPIC,
    rounds: 12,
    ...args,
  });
const join = (session: string, args: Data = {}) =>
  act('join', { session, topic: TOPIC, ...args });
const say = (session: string, text: string, respondsTo?: string) =>
  act('contribute', {
    session,
    text,
    ...(respondsTo ? { respondsTo } : {}),
  });
const tell = (text: string): V7Action => ({
  interface: 'tell',
  args: { text },
});
const move = (x: number, y: number): V7Action => ({
  interface: 'navigate',
  args: { target: '', x, y },
});
function step(w: V7World, actions: Record<string, V7Action> = {}) {
  const result = v7Step(
    w,
    Object.fromEntries(
      w.actors
        .filter((a) => a.vitals.health > 0)
        .map((a) => [a.id, actions[a.id] ?? WAIT]),
    ),
    continuousRegistry(w),
  );
  if (result.paused) throw new Error(result.paused);
  return { outcomes: result.outcomes, world: v7Clone(result.world) };
}
const ok = (r: Round, ...who: string[]) => {
  for (const x of who.length ? who : ['kai'])
    expect(r.outcomes[x]?.success, r.outcomes[x]?.reason).toBe(true);
  return r.world;
};
const refused = (r: Round, pattern: RegExp | string, who = 'kai') => {
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(pattern);
  expect(r.outcomes[who]?.reason).toMatch(/Nothing was said\.$/);
  // A refused step says nothing: no told event and nothing heard by anyone.
  expect(
    r.world.events.filter((e) => e.type === 'told' || e.type === 'heard'),
  ).toEqual([]);
  return r.world;
};
const actor = (w: V7World, who = 'kai'): V7Actor => {
  const a = w.actors.find((a) => a.id === who);
  if (!a) throw new Error(`Missing ${who}.`);
  return a;
};
const place = (w: V7World, who: string, x: number, y: number) => {
  actor(w, who).position = { x, y };
  return w;
};
const views = (w: V7World, who = 'kai', key = OPEN) => {
  const v = actor(w, who).extensionState[key];
  return (Array.isArray(v) ? v : []) as Data[];
};
const view = (w: V7World, who = 'kai') => views(w, who)[0];
const last = (w: V7World, who = 'kai') => views(w, who, LAST).at(-1);
const record = (w: V7World, session: string) =>
  (w.state[BOOK] as Record<string, Data> | undefined)?.[session];
/** The person's own events of the round, without the per-round wellbeing bookkeeping. */
const mine = (w: V7World, who = 'kai') =>
  w.events
    .filter(
      (e) => e.actor === who && !['wellbeing', 'mental-state'].includes(e.type),
    )
    .map((e) => e.type);
const told = (w: V7World, who = 'kai') => {
  const e = w.events.find((e) => e.actor === who && e.type === 'told');
  if (!e) throw new Error(`${who} said nothing.`);
  return e.id;
};
const heard = (w: V7World, who: string) =>
  w.events.filter((e) => e.type === 'heard' && e.actor === who);
const installed = () => {
  const g = initialLongWorld('long-ex26', 'long-culture-v2-villages');
  return v7Clone(v7Install(g, continuousRegistry(g), REVISION));
};
/** Kai, Wren and Ivo study in round 1 and master the conversation. */
function learned(world?: V7World) {
  const r = step(world ?? installed(), { kai: LEARN, wren: LEARN, ivo: LEARN });
  const w = ok(r, 'kai', 'wren', 'ivo');
  for (const x of ['kai', 'wren', 'ivo'])
    expect(actor(w, x).mastered).toContain(id);
  return w;
}
/** Kai proposes in round 2 and both join in round 3: the session is active. */
function active(world?: V7World, rounds = 12) {
  let w = ok(step(world ?? learned(), { kai: propose({ rounds }) }));
  const session = `session-${String(w.tick)}-kai`;
  w = ok(step(w, { kai: join(session), wren: join(session) }), 'kai', 'wren');
  expect(view(w)).toMatchObject({ session, status: 'active' });
  expect(view(w, 'wren')).toMatchObject({ session, status: 'active' });
  return { w, session };
}

describe('reciprocal conversation in ex26', () => {
  it('is registered second for long-ex26, with new names, the size limit, no excluded word and every earlier package byte-identical', () => {
    const pkg = conversationPackage();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    // The second long-ex26 package; later developments of this run append their own after it.
    expect(
      V7_PACKAGES.filter((p) => p.scope === 'long-ex26')
        .map((p) => p.id)
        .slice(0, 2),
    ).toEqual(['bounded-resource-search', id]);
    expect(pkg).toMatchObject({
      id,
      version: 1,
      scope: 'long-ex26',
      dependencies: ['foundation-open@1'],
      visualComponents: [],
      satisfaction: [],
      resources: [],
      processes: {},
      events: [
        `${id}-proposed`,
        `${id}-joined`,
        `${id}-active`,
        `${id}-contributed`,
        `${id}-delivered`,
        `${id}-interrupted`,
        `${id}-exchange`,
        `${id}-paused`,
        `${id}-resumed`,
        `${id}-ended`,
      ],
    });
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 1,
      revision: REVISION,
      handler: `long.${id}`,
      authored: false,
      prerequisites: ['tell'],
      dependencies: { abilities: ['tell'], resources: [], knowledge: [] },
      references: {},
      practiceEvidence: `${id}-exchange`,
      execution: { duration: 1, interruption: 'cancel' },
    });
    expect(ability.learningEnergy).toBeUndefined();
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'session',
      'participants',
      'topic',
      'text',
      'rounds',
      'respondsTo',
    ]);
    expect(ability.parameters.required).toEqual(['mode']);
    expect(ability.parameters.properties?.mode?.enum).toEqual([
      'propose',
      'join',
      'contribute',
      'pause',
      'resume',
      'leave',
      'cancel',
    ]);
    expect(ability.parameters.properties?.rounds).toMatchObject({
      minimum: 1,
      maximum: 20,
    });
    // No parameter names a target, so no reference contract is needed.
    expect(ability.parameters.properties?.target).toBeUndefined();
    // New package, ability, equivalence, handler and event names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
        expect(a.handler).not.toBe(ability.handler);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e.startsWith(`${id}-`)).toBe(false);
    }
    const g = installed();
    for (const a of g.abilities.filter((a) => a.id !== id))
      expect(a.equivalence).not.toBe(ability.equivalence);
    for (const e of pkg.events ?? [])
      expect(g.eventTypes?.filter((x) => x === e)).toEqual([e]);
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
      description: pkg.description,
      reuse: pkg.reuse,
    });
    expect(visible).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    expect(visible).not.toMatch(MENTION);
    // Every package registered before this one, by id@version, is byte-identical.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    const map = Object.fromEntries(
      existing
        .map((p) => [`${p.id}@${String(p.version)}`, sha(p)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(Object.keys(map)).toHaveLength(136);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    // Only the current scope can install it, and only where tell exists.
    const other = initialLongWorld('long-ex25', 'long-culture-v2-villages');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    const mute = v7Clone(
      initialLongWorld('long-ex26', 'long-culture-v2-villages'),
    );
    mute.abilities = mute.abilities.filter((a) => a.id !== 'tell');
    expect(() => v7Install(mute, continuousRegistry(mute), REVISION)).toThrow(
      /ordinary tell interface/,
    );
    // Installing changes no person, object, item, process or state.
    const before = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    expect(v7Signature(g.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(g.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(g.stacks)).toBe(v7Signature(before.stacks));
    expect(v7Signature(g.state)).toBe(v7Signature(before.state));
    expect(g.processes).toEqual(before.processes);
  });

  it('is learned in one round of study without energy, and only by a person with tell', () => {
    const g = installed();
    const unlearned = step(g, { kai: propose() });
    expect(unlearned.outcomes.kai?.success).toBe(false);
    expect(unlearned.outcomes.kai?.reason).toMatch(/not mastered/);
    const r = step(g, { kai: LEARN });
    const w = ok(r);
    expect(r.outcomes.kai?.reason).toMatch(/after one round of study/);
    expect(actor(w).mastered).toContain(id);
    expect(actor(w).learning).toBeNull();
    // Study costs nothing but the round: vitals are those of a waiting person.
    const idle = step(g).world;
    expect(actor(w).vitals).toEqual(actor(idle).vitals);
    // A person without tell cannot study it, and one who lost tell cannot run it.
    const mute = v7Clone(g);
    actor(mute, 'wren').mastered = actor(mute, 'wren').mastered.filter(
      (x) => x !== 'tell',
    );
    const study = step(mute, { wren: LEARN });
    expect(study.outcomes.wren?.success).toBe(false);
    expect(study.outcomes.wren?.reason).toMatch(/prerequisites/);
    const lost = v7Clone(w);
    actor(lost).mastered = actor(lost).mastered.filter((x) => x !== 'tell');
    const run = step(lost, { kai: propose() });
    expect(run.outcomes.kai?.success).toBe(false);
    expect(run.outcomes.kai?.reason).toMatch(/capability/);
  });

  it('proposes, lets both join and contributes, each at tell’s cost of one round and no energy or material', () => {
    let w = learned(),
      hand = v7Clone(w);
    const compare = (round: Round, by: Round, ...who: string[]) => {
      w = ok(round, ...who);
      hand = ok(by, ...who);
      expect(round.outcomes.kai?.complete).toBe(true);
      expect(w.tick).toBe(hand.tick);
      for (const a of w.actors) {
        expect(a.vitals, a.id).toEqual(actor(hand, a.id).vitals);
        expect(a.position, a.id).toEqual(actor(hand, a.id).position);
      }
      expect(v7Signature(w.stacks)).toBe(v7Signature(hand.stacks));
      expect(v7Signature(w.objects)).toBe(v7Signature(hand.objects));
    };
    // Round 2: propose says one ordinary tell invitation and opens a pending session.
    const start = actor(w).vitals.energy;
    const r = step(w, { kai: propose() });
    const session = `session-${String(r.world.tick)}-kai`;
    const invitation = r.world.events.find((e) => e.type === 'told');
    expect(invitation?.data.text).toBe(
      `${session}: Kai invites Wren to a conversation about "${TOPIC}" until round 14; each of you joins with this id and topic.`,
    );
    compare(r, step(hand, { kai: tell(invitation?.data.text as string) }));
    expect(mine(w)).toEqual(['told', `${id}-proposed`]);
    expect(actor(w).vitals.energy).toBe(start);
    expect(view(w)).toMatchObject({
      session,
      with: 'wren',
      role: 'proposer',
      topic: TOPIC,
      status: 'pending',
      expiresAt: 14,
      ready: false,
      otherReady: false,
    });
    // Wren heard it, so Wren knows the session; it is an invitation, not a conversation.
    expect(view(w, 'wren')).toMatchObject({
      session,
      with: 'kai',
      role: 'invited',
      status: 'pending',
    });
    expect(record(w, session)).toMatchObject({
      initiator: 'kai',
      invited: 'wren',
      status: 'pending',
      proposedAt: 2,
      expiresAt: 14,
    });
    // Round 3: Wren joins first; proposing alone is not consent, so it stays pending.
    let s = step(w, { wren: join(session) });
    compare(
      s,
      step(hand, {
        wren: tell(
          `${session}: Wren joins the conversation with Kai about "${TOPIC}".`,
        ),
      }),
      'wren',
    );
    expect(mine(w, 'wren')).toEqual(['told', `${id}-joined`]);
    expect(view(w)).toMatchObject({
      status: 'pending',
      ready: false,
      otherReady: true,
    });
    expect(view(w, 'wren')).toMatchObject({
      status: 'pending',
      ready: true,
      otherReady: false,
    });
    // Round 4: Kai joins too; each heard the other, so it becomes active for both.
    s = step(w, { kai: join(session) });
    compare(
      s,
      step(hand, {
        kai: tell(
          `${session}: Kai joins the conversation with Wren about "${TOPIC}".`,
        ),
      }),
    );
    expect(mine(w)).toEqual(['told', `${id}-joined`, `${id}-active`]);
    expect(mine(w, 'wren')).toEqual(['waited', 'heard', `${id}-active`]);
    expect(record(w, session)).toMatchObject({
      status: 'active',
      activeSince: 4,
    });
    // Round 5: one contribution is one tell of exactly the person's words.
    s = step(w, { kai: say(session, 'The bush by the stone is empty.') });
    compare(s, step(hand, { kai: tell('The bush by the stone is empty.') }));
    expect(mine(w)).toEqual(['told', `${id}-contributed`, `${id}-delivered`]);
    expect(w.events.find((e) => e.type === 'told')?.data).toEqual({
      text: 'The bush by the stone is empty.',
      by: 'kai',
      hearing: 5,
    });
    expect(view(w)).toMatchObject({ said: [told(w)], heard: [] });
    expect(view(w, 'wren')).toMatchObject({ said: [], heard: [told(w)] });
    // Control modes say nothing and cost nothing beyond the round's action.
    const paused = step(w, { kai: act('pause', { session }) });
    compare(paused, step(hand));
    expect(mine(w)).toEqual([`${id}-paused`]);
    expect(view(w)).toMatchObject({ status: 'paused' });
    const left = step(w, { kai: act('leave', { session }) });
    compare(left, step(hand));
    expect(mine(w)).toEqual([`${id}-ended`]);
    expect(views(w)).toEqual([]);
    expect(last(w)).toMatchObject({
      session,
      status: 'ended',
      reason: 'you left',
    });
    expect(record(w, session)).toMatchObject({
      status: 'ended',
      reason: 'left',
      by: 'kai',
      endedAt: 7,
    });
  });

  it('delivers every word exactly as tell does: the same hearers within 5, heard events and heard lists', () => {
    const { w, session } = active();
    for (const distance of [4.99, 5.01] as const) {
      // Ivo listens due north of Kai, just inside or just outside the hearing radius.
      const world = place(v7Clone(w), 'ivo', KAI.x, NORTH[distance]);
      expect(
        v7Distance(actor(world).position, actor(world, 'ivo').position),
      ).toBeCloseTo(distance, 8);
      const text = 'Roots grow near the water.';
      const c = ok(step(world, { kai: say(session, text) }));
      const t = ok(step(world, { kai: tell(text) }));
      const spoken = (x: V7World) =>
        x.events
          .filter((e) => e.type === 'heard')
          .map((e) => ({ ...e, id: null }));
      expect(spoken(c)).toEqual(spoken(t));
      expect(spoken(c).map((e) => e.actor)).toEqual(
        distance < 5 ? ['wren', 'ivo'] : ['wren'],
      );
      // The same told event id and the same entries in everybody's heard list.
      expect(told(c)).toBe(told(t));
      for (const a of c.actors)
        expect(a.extensionState['expression:heard'], a.id).toEqual(
          actor(t, a.id).extensionState['expression:heard'],
        );
      // The bystander hears the words like any tell but learns nothing of the session record.
      expect(views(c, 'ivo')).toEqual([]);
    }
    // The speech is tell's own handler and delivery, and the provenance says so.
    const pkg = conversationPackage();
    expect(pkg.reuse?.source).toContain("handlers['expression.tell']");
  });

  it('needs the other person within 5 to propose, join, resume or contribute', () => {
    const g = learned();
    // Propose: Wren 5.51 away cannot be invited; the answer is the same as for nobody.
    const far = place(v7Clone(g), 'wren', KAI.x, NORTH[5.51]);
    const a = refused(step(far, { kai: propose() }), UNSEEN);
    const nobody = refused(
      step(g, { kai: propose({ participants: ['kai', 'nobody'] }) }),
      UNSEEN,
    );
    expect(a.events.find((e) => e.actor === 'kai')?.description).toBe(
      nobody.events.find((e) => e.actor === 'kai')?.description,
    );
    expect(record(a, `session-2-kai`)).toBeUndefined();
    expect(views(a)).toEqual([]);
    refused(
      step(g, { kai: propose({ participants: ['wren', 'ivo'] }) }),
      /your own id/,
    );
    refused(step(g, { kai: propose({ topic: '' }) }), /topic of 1 to 80/);
    refused(
      step(g, { kai: propose({ topic: 'x'.repeat(81) }) }),
      /topic of 1 to 80/,
    );
    refused(
      step(g, { kai: propose({ text: 'y'.repeat(200) }) }),
      /tell allows 240/,
    );
    const outOfRange = step(g, { kai: propose({ rounds: 21 }) });
    expect(outOfRange.outcomes.kai?.success).toBe(false);
    // Join: after the proposal Wren steps beyond 5; neither can join.
    let w = ok(step(g, { kai: propose() }));
    const session = `session-${String(w.tick)}-kai`;
    const apart = place(v7Clone(w), 'wren', KAI.x, NORTH[5.01]);
    refused(step(apart, { wren: join(session) }), RANGE, 'wren');
    refused(step(apart, { kai: join(session) }), RANGE);
    refused(
      step(w, { wren: join(session, { topic: 'stones' }) }),
      /exactly/,
      'wren',
    );
    // Contribute: once active, Wren beyond 5 means Kai cannot speak in it.
    w = ok(step(w, { kai: join(session), wren: join(session) }), 'kai', 'wren');
    expect(view(w)).toMatchObject({ status: 'active' });
    const gone = place(v7Clone(w), 'wren', KAI.x, NORTH[5.01]);
    const r = refused(step(gone, { kai: say(session, 'Still here?') }), RANGE);
    expect(heard(r, 'wren')).toEqual([]);
    // That round paused it: they are no longer both within 5.
    expect(view(r)).toMatchObject({
      status: 'paused',
      reason: 'you are not both alive within 5 units',
    });
    refused(step(r, { kai: act('resume', { session }) }), RANGE);
    // Within 5 again, both resume and it is active again.
    let back = place(v7Clone(r), 'wren', KAI.x, NORTH[4.6]);
    back = ok(step(back, { kai: act('resume', { session }) }));
    expect(view(back)).toMatchObject({ status: 'paused', ready: true });
    expect(view(back, 'wren')).toMatchObject({ otherReady: true });
    back = ok(step(back, { wren: act('resume', { session }) }), 'wren');
    expect(view(back)).toMatchObject({ status: 'active' });
    expect(view(back, 'wren')).toMatchObject({ status: 'active' });
  });

  it('never connects the far group: Lin can neither be invited, join nor receive anything through a session', () => {
    const groups = VILLAGES.groups;
    expect(groups[0]).toContain('lin');
    expect(groups[1]).toContain('kai');
    const g = learned();
    // Lin starts more than 100 units from Kai and Wren.
    expect(
      v7Distance(actor(g, 'lin').position, actor(g).position),
    ).toBeGreaterThan(100);
    // Kai cannot invite Lin: the same answer as for a made-up id.
    const invite = refused(
      step(g, { kai: propose({ participants: ['kai', 'lin'] }) }),
      UNSEEN,
    );
    expect(record(invite, 'session-2-kai')).toBeUndefined();
    // Lin cannot invite Kai either (Lin also masters the interface here).
    const lin = v7Clone(g);
    actor(lin, 'lin').mastered.push(id);
    refused(
      step(lin, { lin: propose({ participants: ['lin', 'kai'] }) }),
      UNSEEN,
      'lin',
    );
    // A whole conversation between Kai and Wren, while Lin, far away and also just beyond the
    // hearing radius, tries every mode with the real session id each round.
    for (const near of [false, true]) {
      let w = v7Clone(lin);
      if (near) place(w, 'lin', KAI.x + 5.2, KAI.y);
      w = ok(step(w, { kai: propose() }));
      const session = `session-${String(w.tick)}-kai`;
      const script = (i: number): Record<string, V7Action> =>
        [
          { kai: join(session), wren: join(session) },
          { kai: say(session, 'The bush by the stone is empty.') },
          {
            wren: say(
              session,
              'Then try the roots.',
              String((view(w, 'wren')?.heard as string[] | undefined)?.[0]),
            ),
          },
          { kai: act('pause', { session }) },
          { kai: act('resume', { session }), wren: act('resume', { session }) },
          { wren: act('leave', { session }) },
        ][i] ?? {};
      const tries = [
        join(session),
        say(session, 'Hello?'),
        act('resume', { session }),
        act('pause', { session }),
        act('leave', { session }),
        act('cancel', { session }),
      ];
      const seen: V7Event[] = [];
      for (const [i, attempt] of tries.entries()) {
        const actions = script(i);
        const r = step(w, { ...actions, lin: attempt });
        // The same answer as for a made-up session id: nothing tells Lin the session exists.
        const made = step(w, {
          lin: {
            ...attempt,
            args: { ...attempt.args, session: 'session-9-kai' },
          },
        });
        expect(r.outcomes.lin?.success).toBe(false);
        expect(r.outcomes.lin?.reason).toMatch(UNKNOWN);
        expect(r.outcomes.lin?.reason).toBe(made.outcomes.lin?.reason);
        w = ok(r, ...Object.keys(actions));
        seen.push(...v7Observe(w, 'lin').events);
        expect(
          v7Distance(actor(w, 'lin').position, actor(w).position),
        ).toBeGreaterThan(5);
      }
      expect(view(w)).toBeUndefined();
      expect(last(w)).toMatchObject({
        status: 'ended',
        reason: 'Wren left',
        exchanges: [`${session}:exchange-1`],
      });
      // Nothing of it reached Lin: no event of the far people, no told or heard word, no
      // session event, no record and no memory. Lin still sees Lin's own group nearby.
      expect(seen.length).toBeGreaterThan(0);
      expect(
        seen.filter(
          (e) =>
            (!!e.actor && (groups[1] ?? []).includes(e.actor)) ||
            e.type === 'told' ||
            e.type === 'heard' ||
            e.type.startsWith(`${id}-`) ||
            (e.interface === id && e.success),
        ),
      ).toEqual([]);
      const l = actor(w, 'lin');
      expect(l.extensionState['expression:heard'] ?? []).toEqual([]);
      expect(
        Object.keys(l.extensionState).filter((k) => k.startsWith(id)),
      ).toEqual([]);
      expect(JSON.stringify(l.memory)).not.toContain(session);
      for (const words of [TOPIC, 'The bush by the stone', 'try the roots'])
        expect(JSON.stringify(l)).not.toContain(words);
    }
  });

  it('pauses for another action, a pause or an urgent risk, keeps silence with wait, and resumes only by both', () => {
    const start = active();
    const session = start.session;
    let w = start.w;
    // wait is silence: the session stays active.
    w = ok(step(w));
    expect(view(w)).toMatchObject({ status: 'active' });
    // Another action pauses it; Wren is within 5 and sees why.
    let r = step(w, { kai: { interface: 'rest', args: {} } });
    let p = ok(r);
    expect(view(p)).toMatchObject({
      status: 'paused',
      reason: 'you took another action',
    });
    expect(view(p, 'wren')).toMatchObject({
      status: 'paused',
      reason: 'Kai took another action',
    });
    expect(mine(p, 'wren')).toContain(`${id}-paused`);
    refused(
      step(p, { kai: say(session, 'Hello') }),
      /paused; contribute needs it active/,
    );
    refused(
      step(p, { wren: join(session) }),
      /resume continues a paused one/,
      'wren',
    );
    // One resume is not enough; both must reaffirm.
    p = ok(step(p, { kai: act('resume', { session }) }));
    expect(view(p)).toMatchObject({
      status: 'paused',
      ready: true,
      otherReady: false,
    });
    p = ok(step(p, { wren: act('resume', { session }) }), 'wren');
    expect(view(p)).toMatchObject({ status: 'active' });
    // An explicit pause by Wren.
    r = step(p, { wren: act('pause', { session }) });
    p = ok(r, 'wren');
    expect(view(p)).toMatchObject({
      status: 'paused',
      reason: 'Wren paused it',
    });
    expect(view(p, 'wren')).toMatchObject({
      status: 'paused',
      reason: 'you paused it',
    });
    // An urgent risk pauses it and blocks speech until the person is safe again.
    const risky = v7Clone(w);
    actor(risky, 'wren').vitals.satiety = 7;
    p = step(risky).world;
    expect(view(p)).toMatchObject({
      status: 'paused',
      reason: 'Wren must attend to an urgent risk',
    });
    expect(view(p, 'wren')?.reason).toMatch(
      /you must attend to an urgent risk \(satiety/,
    );
    refused(
      step(p, { wren: act('resume', { session }) }),
      /Attend to the urgent risk first/,
      'wren',
    );
    // A refused step of this interface counts as silence, not as another action.
    const typo = step(w, { kai: say(session, 'z'.repeat(241)) });
    expect(typo.outcomes.kai?.success).toBe(false);
    expect(view(typo.world)).toMatchObject({ status: 'active' });
  });

  it('commits only words the other heard, records a reciprocal exchange only for a new answer to an earlier heard utterance, and hides out-of-range causes', () => {
    const start = active();
    const session = start.session;
    let w = start.w;
    // Simultaneous unrelated words: both commit, neither is an exchange.
    w = ok(
      step(w, { kai: say(session, 'Hello.'), wren: say(session, 'Good day.') }),
      'kai',
      'wren',
    );
    const kaiFirst = told(w),
      wrenFirst = told(w, 'wren');
    expect(view(w)).toMatchObject({
      said: [kaiFirst],
      heard: [wrenFirst],
      exchanges: [],
    });
    // A reply must name the other person's committed utterance.
    refused(
      step(w, { kai: say(session, 'Me again.', kaiFirst) }),
      /respondsTo must be/,
    );
    refused(
      step(w, { kai: say(session, 'Hm.', 'event-0-x-1') }),
      /respondsTo must be/,
    );
    // An identical retry of earlier words is no exchange.
    w = ok(step(w, { kai: say(session, 'Hello.', wrenFirst) }));
    expect(view(w)).toMatchObject({ exchanges: [] });
    // New words in reply to Wren's earlier utterance: one reciprocal exchange, seen by both.
    w = ok(
      step(w, { kai: say(session, 'The roots are by the water.', wrenFirst) }),
    );
    const answer = told(w);
    expect(mine(w)).toContain(`${id}-exchange`);
    expect(mine(w, 'wren')).toContain(`${id}-exchange`);
    const ex = w.events.find(
      (e) => e.type === `${id}-exchange` && e.actor === 'kai',
    );
    expect(ex?.data.exchange).toMatchObject({
      id: `${session}:exchange-1`,
      first: wrenFirst,
      response: answer,
      speakers: ['wren', 'kai'],
      listeners: ['kai', 'wren'],
      topic: TOPIC,
      rounds: [4, 6],
    });
    expect(view(w, 'wren')).toMatchObject({
      exchanges: [`${session}:exchange-1`],
    });
    // The same first utterance completes no second exchange.
    w = ok(step(w, { kai: say(session, 'And by the stone too.', wrenFirst) }));
    expect(view(w)).toMatchObject({ exchanges: [`${session}:exchange-1`] });
    // Words Wren does not hear do not count: Wren walks out of range in the same round.
    const edge = place(v7Clone(w), 'wren', KAI.x, NORTH[4.6]);
    const r = step(edge, {
      kai: say(session, 'Can you hear me?'),
      wren: move(KAI.x, NORTH[5.51]),
    });
    const lost = ok(r, 'kai', 'wren');
    expect(
      v7Distance(actor(lost).position, actor(lost, 'wren').position),
    ).toBeGreaterThan(5);
    expect(heard(lost, 'wren')).toEqual([]);
    expect(mine(lost)).toContain(`${id}-interrupted`);
    expect(mine(lost)).not.toContain(`${id}-delivered`);
    expect(view(lost)?.said).not.toContain(told(lost));
    // Each record shows only what its person could perceive: Kai is not told what Wren did.
    expect(view(lost)).toMatchObject({
      status: 'paused',
      reason: 'you are not both alive within 5 units',
    });
    expect(view(lost, 'wren')).toMatchObject({
      status: 'paused',
      reason: 'you took another action; you are not both alive within 5 units',
    });
  });

  it('keeps an end by a far person hidden until they are within 5 again or the expiry round', () => {
    const { w, session } = active(undefined, 8);
    // Wren goes far away; the session pauses for range.
    let far = place(v7Clone(w), 'wren', 110, KAI.y);
    far = ok(step(far));
    expect(view(far)).toMatchObject({ status: 'paused' });
    // Wren leaves far away: Kai receives nothing, and Kai's record and answers stay the same.
    const stay = ok(step(far), 'kai');
    const left = ok(step(far, { wren: act('leave', { session }) }), 'wren');
    expect(views(left, 'wren')).toEqual([]);
    expect(last(left, 'wren')).toMatchObject({ reason: 'you left' });
    expect(record(left, session)).toMatchObject({
      status: 'ended',
      reason: 'left',
    });
    expect(view(left)).toEqual(view(stay));
    expect(mine(left)).toEqual(mine(stay));
    expect(actor(left).extensionState).toEqual(actor(stay).extensionState);
    const ask = (x: V7World) =>
      step(x, { kai: act('resume', { session }) }).outcomes.kai;
    expect(ask(left)).toEqual(ask(stay));
    // Back within 5 the end shows, with its reason.
    const back = ok(step(place(v7Clone(left), 'wren', KAI.x, NORTH[4.6])));
    expect(views(back)).toEqual([]);
    expect(last(back)).toMatchObject({ status: 'ended', reason: 'Wren left' });
    // Kept apart, it closes at the expiry round, as it would have anyway.
    let apart = left;
    while (apart.tick < 11) apart = ok(step(apart));
    expect(views(apart)).toEqual([]);
    expect(last(apart)).toMatchObject({
      status: 'ended',
      reason: 'the expiry round passed',
    });
  });

  it('ends at the expiry round counted from the proposal, pausing included, and at a leave, cancel or death', () => {
    // Expiry: proposed in round 2 for 4 rounds, so it closes at the end of round 6.
    const start = active(undefined, 4);
    let w = start.w,
      session = start.session;
    w = ok(step(w, { kai: act('pause', { session }) }));
    w = ok(step(w));
    expect(view(w)).toMatchObject({ status: 'paused', expiresAt: 6 });
    w = ok(step(w));
    expect(w.tick).toBe(6);
    expect(views(w)).toEqual([]);
    expect(last(w)).toMatchObject({ reason: 'the expiry round passed' });
    expect(last(w, 'wren')).toMatchObject({
      reason: 'the expiry round passed',
    });
    expect(record(w, session)).toMatchObject({
      status: 'ended',
      reason: 'expired',
      by: null,
    });
    refused(step(w, { kai: say(session, 'Hello') }), /has ended/);
    // Cancel by the invited person ends it for both.
    ({ w, session } = active());
    const c = ok(step(w, { wren: act('cancel', { session }) }), 'wren');
    expect(last(c)).toMatchObject({ reason: 'Wren cancelled it' });
    expect(last(c, 'wren')).toMatchObject({ reason: 'you cancelled it' });
    // Death ends it; nothing continues after the respawn, and what was said stays said.
    w = ok(step(w, { kai: say(session, 'Hello.') }));
    actor(w, 'wren').vitals.health = 0.5;
    actor(w, 'wren').vitals.satiety = 0;
    const d = step(w).world;
    expect(mine(d, 'wren')).toEqual(
      expect.arrayContaining(['died', `${id}-ended`, 'respawned']),
    );
    expect(last(d, 'wren')).toMatchObject({
      status: 'ended',
      reason: 'you died',
    });
    expect(last(d)).toMatchObject({
      status: 'ended',
      reason: 'Wren died',
      said: [expect.any(String)],
    });
    expect(record(d, session)).toMatchObject({
      status: 'ended',
      reason: 'death',
      by: 'wren',
    });
    refused(step(d, { wren: say(session, 'Back.') }), /has ended/, 'wren');
  });

  it('never rewards a conversation: no satisfaction, mood, practice milestone or progress credit beyond the same words by tell', () => {
    const start = active();
    const session = start.session;
    let w = start.w;
    let hand = v7Clone(w);
    const seen: V7Event[] = [];
    const script: [Record<string, V7Action>, Record<string, V7Action>][] = [
      [{ kai: say(session, 'Hello.') }, { kai: tell('Hello.') }],
      [{ wren: say(session, 'Good day.') }, { wren: tell('Good day.') }],
      [
        { kai: say(session, 'Roots are by the water.') },
        { kai: tell('Roots are by the water.') },
      ],
      [{}, {}],
    ];
    for (const [round, [c, t]] of script.entries()) {
      if (round === 2) {
        const reply = (view(w)?.heard as string[])[0];
        c.kai = say(session, 'Roots are by the water.', reply);
      }
      w = ok(step(w, c), ...(Object.keys(c).length ? Object.keys(c) : ['kai']));
      hand = ok(
        step(hand, t),
        ...(Object.keys(t).length ? Object.keys(t) : ['kai']),
      );
      seen.push(...w.events);
    }
    expect(seen.some((e) => e.type === `${id}-exchange`)).toBe(true);
    expect(
      seen.filter((e) =>
        [
          'satisfaction',
          'satisfaction-maintained',
          'practice-confirmed',
          'information-confirmed',
        ].includes(e.type),
      ),
    ).toEqual([]);
    for (const a of w.actors) {
      const b = actor(hand, a.id);
      expect(a.vitals, a.id).toEqual(b.vitals);
      expect(a.wellbeing, a.id).toEqual(b.wellbeing);
      expect(a.experience?.mental, a.id).toBe(b.experience?.mental);
      expect(a.experience?.pleasure, a.id).toBe(b.experience?.pleasure);
      for (const key of [
        'open:routine',
        'open:routineBurden',
        'long:lastProgress',
        'long:visited',
      ])
        expect(a.extensionState[key], `${a.id} ${key}`).toEqual(
          b.extensionState[key],
        );
      // The same words in the same heard lists (event ids differ only by numbering).
      const words = (x: V7Actor) => {
        const list = x.extensionState['expression:heard'];
        return (Array.isArray(list) ? list : []).map((h) => ({
          ...(h as Data),
          source: null,
        }));
      };
      expect(words(a), a.id).toEqual(words(b));
      expect(
        Object.keys(a.extensionState).filter((k) =>
          k.startsWith('open:practice:'),
        ),
      ).toEqual([]);
    }
    // The install's practice rule exists, but nothing can trigger it.
    expect(w.satisfaction.find((r) => r.id === `practice:${id}`)).toMatchObject(
      {
        event: 'practice-confirmed',
        interface: id,
      },
    );
  });

  it('keeps every agent-visible text free of excluded words and of any mention of the far people', () => {
    const texts: unknown[] = [];
    const keep = (w: V7World) => {
      for (const who of ['kai', 'wren'])
        texts.push(
          w.events.filter((e) => e.actor === who),
          longOrdinaryInput(w, who).packet.execution,
          (longOrdinaryInput(w, who).packet.memory as Data).heard,
          views(w, who),
          views(w, who, LAST),
        );
      return w;
    };
    const start = active();
    const session = start.session;
    let w = start.w;
    keep(w);
    w = keep(ok(step(w, { kai: say(session, 'Hello.') })));
    w = keep(ok(step(w, { wren: say(session, 'Good day.', told(w)) }), 'wren'));
    w = keep(ok(step(w, { kai: { interface: 'rest', args: {} } })));
    keep(step(w, { kai: say(session, 'Hi') }).world);
    const lost = place(v7Clone(w), 'wren', KAI.x, NORTH[5.51]);
    keep(step(lost, { kai: act('resume', { session }) }).world);
    w = keep(
      ok(
        step(w, {
          kai: act('resume', { session }),
          wren: act('resume', { session }),
        }),
        'kai',
        'wren',
      ),
    );
    w = keep(ok(step(w, { wren: act('leave', { session }) }), 'wren'));
    keep(step(w, { kai: say(session, 'Hello?') }).world);
    keep(step(w, { kai: act('join', { session: 'nothing' }) }).world);
    const input = longOrdinaryInput(w, 'kai');
    texts.push(
      input.packet.abilities,
      input.catalogue.interfaces.filter((x) => x.id === id),
    );
    const text = JSON.stringify(texts);
    expect(text).toContain(`${id}-exchange`);
    expect(text).toContain(`${id}-paused`);
    expect(text).toContain(`${id}-ended`);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    expect(text).not.toMatch(MENTION);
    // The open session is shown with the person's active work under its own key.
    const open = active().w;
    const shown = (
      longOrdinaryInput(open, 'kai').packet.execution as { activeState: Data }
    ).activeState;
    expect(Object.keys(shown)).toEqual([OPEN]);
  });
});
