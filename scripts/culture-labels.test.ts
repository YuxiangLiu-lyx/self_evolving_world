import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { V7TransportError } from '../apps/simulator/src/continuous-provider.js';
import { cultureInput } from './culture-metrics.js';
import type { CultureInput } from './culture-metrics.js';
import {
  LABEL_ENDPOINT,
  LabelRejection,
  acceptLabels,
  agreementReport,
  buildItems,
  labelProvider,
  labelRequest,
  labelRun,
  labelSchema,
  ledgerTotal,
  nextBatch,
  readLabels,
  readLedger,
  requestMeasure,
  sample,
  schemaError,
  writeItems,
  writeOutputs,
} from './culture-labels.js';
import type {
  ItemsFile,
  JsonSchema,
  LabelProvider,
  LabelsFile,
  RegistryEntry,
} from './culture-labels.js';

const people = [
  { id: 'sol', name: 'Sol' },
  { id: 'moss', name: 'Moss' },
  { id: 'kai', name: 'Kai' },
];
/** Five synthetic items: a name, its adoption with a norm, the norm repeated, a plain report and a view. */
function synthetic(): ItemsFile {
  const rows = [
    ['sol', 'name', 'The Berry Lantern'],
    [
      'moss',
      'speech',
      'Shall we rest at the Berry Lantern? Everyone should leave | some berries.',
    ],
    [
      'kai',
      'speech',
      'Yes, everyone should leave some berries for the others.',
    ],
    ['sol', 'speech', 'I gathered roots near the river.'],
    ['moss', 'view', 'Sol seems kind but distant.'],
  ] as const;
  const items = rows.map(([person, kind, text], i) => ({
    id: `u${String(i + 1).padStart(4, '0')}`,
    tick: i + 1,
    person,
    kind,
    ...(kind === 'speech'
      ? { heard: people.map((p) => p.id).filter((p) => p !== person) }
      : {}),
    ...(kind === 'name'
      ? { sign: 'name' as const, subject: 'this place' }
      : {}),
    ...(kind === 'view' ? { about: 'sol' } : {}),
    text,
  }));
  return {
    format: 'self-evolving-world/culture-label-items',
    version: 1,
    archive: 'experiment/fixture',
    range: { from: 0, through: 5 },
    people,
    context: [],
    items,
    mapping: Object.fromEntries(
      items.map((item, i) => [
        item.id,
        {
          tick: item.tick,
          actor: item.person,
          callId: `ordinary-${String(i + 11)}`,
          eventId: item.kind === 'view' ? null : `event-${String(i)}`,
        },
      ]),
    ),
  };
}
interface Raw {
  id: string;
  categories: string[];
  name: string | null;
  adoptsName: string | null;
  narrative: string | null;
  continues: string | null;
  norm: string | null;
  repeatsNorm: string | null;
  about: string | null;
  absent: string | null;
  evidence: string;
  confidence: string;
}
const none = (id: string): Raw => ({
  id,
  categories: [],
  name: null,
  adoptsName: null,
  narrative: null,
  continues: null,
  norm: null,
  repeatsNorm: null,
  about: null,
  absent: null,
  evidence: '',
  confidence: 'high',
});
/** The intended labels of the synthetic items; links point at the registry or an earlier item. */
const truth: Record<string, Raw> = {
  u0001: {
    ...none('u0001'),
    categories: ['naming'],
    name: 'The Berry Lantern',
    evidence: 'The Berry Lantern',
  },
  u0002: {
    ...none('u0002'),
    categories: ['name-adoption', 'norm'],
    adoptsName: 'u0001',
    norm: 'leave some berries',
    evidence: 'Everyone should leave | some berries.',
    confidence: 'medium',
  },
  u0003: {
    ...none('u0003'),
    categories: ['norm-repetition'],
    repeatsNorm: 'R1',
    evidence: 'everyone should leave some berries',
  },
  u0004: none('u0004'),
  u0005: {
    ...none('u0005'),
    categories: ['private-view'],
    about: 'sol',
    evidence: 'Sol seems kind but distant.',
  },
};
const payloadIds = (content: string | undefined) =>
  (JSON.parse(content ?? '{}') as { items: { id: string }[] }).items.map(
    (i) => i.id,
  );
/** A fake transport: records each batch's item ids and answers with `respond`. */
function fake(
  respond: (ids: string[]) => unknown = (ids) => ({
    labels: ids.map((id) => truth[id] ?? none(id)),
  }),
  usage: (
    n: number,
  ) => { inputTokens: number; outputTokens: number } | null = () => ({
    inputTokens: 100,
    outputTokens: 50,
  }),
) {
  const calls: string[][] = [];
  const provider: LabelProvider = (request) => {
    const ids = payloadIds(request.input[0]?.content);
    calls.push(ids);
    return Promise.resolve({
      text: JSON.stringify(respond(ids)),
      responseId: `resp-${String(calls.length)}`,
      usage: usage(calls.length),
      http: { status: 200, requestId: null, contentType: 'text/event-stream' },
      evidence: '',
    });
  };
  return { provider, calls };
}
const directories: string[] = [];
const temporary = () => {
  const directory = mkdtempSync(join(tmpdir(), 'culture-labels-'));
  directories.push(directory);
  return directory;
};
afterEach(() => {
  for (const d of directories.splice(0))
    rmSync(d, { recursive: true, force: true });
});
async function prepared(items: ItemsFile = synthetic()) {
  const root = temporary();
  const out = join(root, 'fixture-0-5');
  await writeItems(out, items);
  return { root, out, ledger: join(root, 'ledger.json') };
}
const base = {
  cap: 1_000_000,
  seed: 7,
  model: 'gpt-6.1-sol',
  batch: 2,
  context: 1,
};
const accept = (
  text: string,
  ids: string[],
  registry: RegistryEntry[] = [],
  items = synthetic(),
) =>
  acceptLabels(
    text,
    { id: 'b0001', items: items.items.filter((i) => ids.includes(i.id)) },
    registry,
    items.people,
    items.mapping,
  );
const respond = (labels: unknown[]) => JSON.stringify({ labels });

describe('items from a retained archive', () => {
  let input: CultureInput | undefined;
  const read = () => (input ??= cultureInput('experiment/ex16', 80));
  let cached: ItemsFile | undefined;
  const items = () => (cached ??= buildItems(read(), { through: 80 }));

  it('builds speech, invitation, work and view items with their local provenance', () => {
    const file = items();
    const kinds = file.items.map((i) => i.kind);
    expect(file.items).toHaveLength(45);
    expect(kinds.filter((k) => k === 'speech')).toHaveLength(28);
    expect(kinds.filter((k) => k === 'view')).toHaveLength(11);
    expect(kinds.filter((k) => k === 'work')).toHaveLength(5);
    expect(file.range).toEqual({ from: 0, through: 80 });
    expect(file.items.map((i) => i.tick)).toEqual(
      [...file.items.map((i) => i.tick)].sort((a, b) => a - b),
    );
    const [first] = file.items;
    expect(first).toMatchObject({
      id: 'u0001',
      tick: 1,
      person: 'moss',
      kind: 'speech',
      heard: ['lin', 'sol', 'kai', 'ivo'],
    });
    expect(file.mapping.u0001).toEqual({
      tick: 1,
      actor: 'moss',
      callId: 'ordinary-6',
      eventId: 'event-1-moss-4',
    });
    const invitations = file.items.filter((i) => i.kind === 'invitation');
    expect(invitations).toEqual([
      {
        id: 'u0033',
        tick: 51,
        person: 'moss',
        kind: 'invitation',
        heard: ['lin', 'sol', 'kai', 'ivo'],
        meeting: { x: 14.8, y: 16.2, round: 60 },
        text: 'Quiet company near the little mat; bring yourself, not supplies. We can compare our experiments, or simply rest.',
      },
    ]);
    expect(file.mapping.u0033).toEqual({
      tick: 51,
      actor: 'moss',
      callId: 'ordinary-119',
      eventId: 'event-51-moss-601',
    });
    // The spoken invitation note is labeled once, as the invitation.
    expect(
      file.items.filter((i) => i.text === invitations[0]?.text),
    ).toHaveLength(1);
    expect(file.items.find((i) => i.kind === 'view')).toMatchObject({
      tick: 3,
      person: 'moss',
      about: 'kai',
    });
    expect(
      file.items
        .filter((i) => i.kind === 'work')
        .map((i) => [i.tick, i.person, i.change, i.subject]),
    ).toEqual([
      [37, 'moss', 'created', 'Fiber mat (fiber-mat) made by moss'],
      [43, 'moss', 'completed', 'Fiber mat (fiber-mat) made by moss'],
      [50, 'sol', 'created', 'Woven branch screen (branch-screen) made by sol'],
      [
        57,
        'sol',
        'completed',
        'Woven branch screen (branch-screen) made by sol',
      ],
      [79, 'wren', 'created', 'Fiber mat (fiber-mat) made by wren'],
    ]);
  }, 120_000);

  it('keeps every model input blind to the scope, tag, experiment, paths and call ids', () => {
    const file = items();
    const configuration = JSON.parse(
      readFileSync('experiment/ex16/configuration.json', 'utf8'),
    ) as {
      development: { scope: string };
      longDevelopment: { scenario: string };
    };
    const forbidden = [
      'ex16',
      configuration.development.scope,
      configuration.longDevelopment.scenario,
      'long-culture-v2',
      'experiment/',
      '.json',
      ...Object.values(file.mapping).flatMap((m) =>
        [m.callId, m.eventId].filter((v): v is string => v !== null),
      ),
    ];
    expect(configuration.development.scope).toBe('long-ex16');
    let state: LabelsFile = {
      format: 'self-evolving-world/culture-labels',
      version: 1,
      run: 'ex16-0-80',
      model: null,
      settings: { batch: 20, context: 4, maxOutput: 8000 },
      seededFrom: null,
      complete: false,
      batches: [],
      labels: [],
      registry: [],
    };
    const inputs: string[] = [];
    for (;;) {
      const planned = nextBatch(file, state);
      if (!planned) break;
      const request = labelRequest('gpt-6.1-sol', planned.input);
      inputs.push(
        request.instructions,
        request.input[0]?.content ?? '',
        JSON.stringify(request.text),
      );
      state = {
        ...state,
        batches: [
          ...state.batches,
          {
            id: planned.id,
            items: [],
            attempt: 1,
            responseId: null,
            usage: null,
            counted: 0,
          },
        ],
        labels: [
          ...state.labels,
          ...planned.input.items.map((i) => ({
            ...none(i.id),
            categories: [],
            confidence: 'low' as const,
            batch: planned.id,
            introduces: [],
          })),
        ],
      };
    }
    expect(inputs).toHaveLength(9);
    for (const value of inputs) {
      for (const word of forbidden) expect(value).not.toContain(word);
      expect(value).not.toMatch(/\b(?:ordinary|world|development)-\d+\b/);
      expect(value).not.toMatch(/\b(?:event|sign)-\d+-/);
    }
  }, 120_000);

  it('splits an earlier range into read-only context with stable item ids', () => {
    const continuation = buildItems(read(), { from: 40, through: 80 });
    expect(continuation.context.every((i) => i.tick < 40)).toBe(true);
    expect(continuation.items.every((i) => i.tick >= 40)).toBe(true);
    expect([...continuation.context, ...continuation.items]).toEqual(
      items().items,
    );
    const state: LabelsFile = {
      format: 'self-evolving-world/culture-labels',
      version: 1,
      run: 'ex16-40-80',
      model: null,
      settings: { batch: 20, context: 4, maxOutput: 8000 },
      seededFrom: null,
      complete: false,
      batches: [],
      labels: [],
      registry: [],
    };
    const planned = nextBatch(continuation, state);
    expect(planned?.input.context.map((i) => i.id)).toEqual(
      continuation.context.slice(-4).map((i) => i.id),
    );
    expect(planned?.input.items[0]?.tick).toBeGreaterThanOrEqual(40);
  }, 120_000);
});

describe('schema validation', () => {
  it('uses a strict schema: every object closes additional properties and requires all keys', () => {
    const visit = (s: JsonSchema): void => {
      if (s.type === 'object') {
        expect(s.additionalProperties).toBe(false);
        expect([...(s.required ?? [])].sort()).toEqual(
          Object.keys(s.properties ?? {}).sort(),
        );
      }
      Object.values(s.properties ?? {}).forEach(visit);
      if (s.items) visit(s.items);
      s.anyOf?.forEach(visit);
    };
    const schema = labelSchema(['u0001'], ['sol']);
    visit(schema);
    expect(schemaError(schema, { labels: [none('u0001')] })).toBeNull();
    expect(
      schemaError(schema, { labels: [{ ...none('u0001'), extra: 1 }] }),
    ).toMatch(/unexpected property/);
  });

  it('accepts a valid response and resolves a link to an earlier item of the batch', () => {
    const result = accept(respond([truth.u0001, truth.u0002]), [
      'u0001',
      'u0002',
    ]);
    expect(
      result.entries.map((e) => [e.id, e.type, e.item, e.by, e.gist, e.call]),
    ).toEqual([
      ['N1', 'name', 'u0001', 'sol', 'The Berry Lantern', 'ordinary-11'],
      ['R1', 'norm', 'u0002', 'moss', 'leave some berries', 'ordinary-12'],
    ]);
    expect(result.labels[1]).toMatchObject({
      id: 'u0002',
      categories: ['name-adoption', 'norm'],
      adoptsName: 'N1',
      introduces: ['R1'],
    });
  });

  it.each([
    ['invalid JSON', '{"labels": [', /not valid JSON/],
    [
      'an extra property',
      respond([{ ...none('u0004'), extra: true }]),
      /unexpected property/,
    ],
    [
      'a missing property',
      respond([
        Object.fromEntries(
          Object.entries(none('u0004')).filter(([k]) => k !== 'confidence'),
        ),
      ]),
      /missing property/,
    ],
    [
      'an unknown category',
      respond([{ ...none('u0004'), categories: ['ritual'] }]),
      /not allowed/,
    ],
    ['an id outside the batch', respond([none('u0009')]), /not allowed/],
    [
      'a repeated id',
      respond([none('u0004'), none('u0004')]),
      /more than once/,
    ],
    [
      'a wrong confidence',
      respond([{ ...none('u0004'), confidence: 'certain' }]),
      /not allowed/,
    ],
    [
      'a top-level extra',
      JSON.stringify({ labels: [none('u0004')], notes: 'x' }),
      /unexpected property/,
    ],
  ])('rejects %s', (_, text, error) => {
    expect(() => accept(text, ['u0004'])).toThrow(LabelRejection);
    expect(() => accept(text, ['u0004'])).toThrow(error);
  });

  it('rejects missing labels, fields without categories, paraphrased evidence and self-views', () => {
    expect(() => accept(respond([none('u0004')]), ['u0004', 'u0005'])).toThrow(
      /Missing labels for u0005/,
    );
    expect(() =>
      accept(respond([{ ...none('u0004'), name: 'River' }]), ['u0004']),
    ).toThrow(/name is set without the naming category/);
    expect(() =>
      accept(
        respond([
          { ...none('u0004'), categories: ['naming'], evidence: 'roots' },
        ]),
        ['u0004'],
      ),
    ).toThrow(/naming requires name/);
    expect(() =>
      accept(
        respond([{ ...truth.u0005, evidence: 'Sol is kind but distant.' }]),
        ['u0005'],
      ),
    ).toThrow(/not a verbatim quote/);
    expect(() =>
      accept(respond([{ ...truth.u0005, about: 'moss' }]), ['u0005']),
    ).toThrow(/another person/);
    expect(() =>
      accept(respond([{ ...truth.u0005, about: 'wren' }]), ['u0005']),
    ).toThrow(/not allowed/);
    expect(() =>
      accept(respond([{ ...truth.u0005, evidence: '' }]), ['u0005']),
    ).toThrow(/needs evidence/);
    // A quote of the item's subject is evidence too.
    expect(
      accept(respond([{ ...truth.u0001, evidence: 'this place' }]), ['u0001'])
        .labels[0]?.evidence,
    ).toBe('this place');
    // Typographic quotes and spacing differences still count as verbatim.
    expect(
      accept(respond([{ ...truth.u0005, evidence: 'Sol  seems kind' }]), [
        'u0005',
      ]).labels,
    ).toHaveLength(1);
  });
});

describe('registry linking', () => {
  const registry: RegistryEntry[] = [
    {
      id: 'N1',
      type: 'name',
      item: 'u0001',
      tick: 1,
      by: 'sol',
      gist: 'The Berry Lantern',
      call: 'ordinary-11',
    },
    {
      id: 'R1',
      type: 'norm',
      item: 'u0002',
      tick: 2,
      by: 'moss',
      gist: 'leave some berries',
      call: 'ordinary-12',
    },
    {
      id: 'S1',
      type: 'narrative',
      item: 'u0002',
      tick: 2,
      by: 'moss',
      gist: 'a lantern tale',
      call: 'ordinary-12',
    },
  ];
  const adoption = (id: string, ref: string) => ({
    ...none(id),
    categories: ['name-adoption'],
    adoptsName: ref,
    evidence: id === 'u0002' ? 'Berry Lantern' : 'roots',
  });

  it('links an adoption by another person to the registry entry', () => {
    const result = accept(
      respond([adoption('u0002', 'N1')]),
      ['u0002'],
      registry,
    );
    expect(result.labels[0]?.adoptsName).toBe('N1');
    expect(
      accept(respond([adoption('u0002', 'u0001')]), ['u0002'], registry)
        .labels[0]?.adoptsName,
    ).toBe('N1');
  });

  it('rejects an adoption, continuation or repetition by the original author', () => {
    expect(() =>
      accept(respond([adoption('u0004', 'N1')]), ['u0004'], registry),
    ).toThrow(/introduced by the same person/);
    expect(() =>
      accept(
        respond([
          {
            ...none('u0005'),
            categories: ['norm-repetition'],
            repeatsNorm: 'R1',
            evidence: 'Sol seems kind',
          },
        ]),
        ['u0005'],
        registry,
      ),
    ).toThrow(/introduced by the same person/);
    expect(() =>
      accept(
        respond([
          {
            ...none('u0005'),
            categories: ['narrative-continuation'],
            continues: 'S1',
            evidence: 'Sol seems kind',
          },
        ]),
        ['u0005'],
        registry,
      ),
    ).toThrow(/introduced by the same person/);
    // Within one batch: Sol cannot adopt the name Sol introduced in an earlier item.
    expect(() =>
      accept(
        respond([
          truth.u0001,
          adoption('u0004', 'u0001'),
          none('u0002'),
          none('u0003'),
        ]),
        ['u0001', 'u0002', 'u0003', 'u0004'],
      ),
    ).toThrow(/introduced by the same person/);
  });

  it('rejects unknown entries, wrong entry types and links to later items', () => {
    expect(() =>
      accept(respond([adoption('u0002', 'N9')]), ['u0002'], registry),
    ).toThrow(/not a known name/);
    expect(() =>
      accept(respond([adoption('u0002', 'R1')]), ['u0002'], registry),
    ).toThrow(/not a known name/);
    expect(() =>
      accept(
        respond([
          { ...truth.u0001 },
          { ...adoption('u0002', 'u0003') },
          {
            ...none('u0003'),
            categories: ['naming'],
            name: 'Lantern',
            evidence: 'berries',
          },
        ]),
        ['u0001', 'u0002', 'u0003'],
      ),
    ).toThrow(/not a known name/);
  });

  it('numbers new entries after the existing registry', () => {
    const result = accept(
      respond([
        {
          ...none('u0004'),
          categories: ['naming', 'norm'],
          name: 'River Roots',
          norm: 'gather near the river',
          evidence: 'near the river',
        },
      ]),
      ['u0004'],
      registry,
    );
    expect(result.entries.map((e) => e.id)).toEqual(['N2', 'R2']);
  });
});

describe('ledger, cap and resume', () => {
  it('records usage, refuses a batch over the cap and resumes without resending', async () => {
    const { out, ledger } = await prepared();
    const first = fake();
    const paused = await labelRun({
      ...base,
      out,
      ledger,
      provider: first.provider,
      batches: 1,
    });
    expect(paused).toMatchObject({
      status: 'paused',
      sent: 1,
      labeled: 2,
      used: 150,
    });
    expect(first.calls).toEqual([['u0001', 'u0002']]);
    const state = readLabels(out);
    if (!state) throw new Error('labels.json is missing');
    const next = nextBatch(synthetic(), state);
    if (!next) throw new Error('no next batch');
    const reservation = requestMeasure(
      labelRequest(base.model, next.input, 8000),
    ).reservation;
    // The next batch's reservation does not fit: it is never started.
    const refused = fake();
    const budget = await labelRun({
      ...base,
      out,
      ledger,
      cap: 150 + reservation - 1,
      provider: refused.provider,
    });
    expect(budget).toMatchObject({ status: 'budget', sent: 0, used: 150 });
    expect(budget.reason).toContain(String(reservation));
    expect(refused.calls).toEqual([]);
    expect(readLedger(ledger).calls).toHaveLength(1);
    // A call without usage counts at its reserved estimate; the completed batch is not resent.
    const rest = fake(undefined, (n) =>
      n === 1 ? null : { inputTokens: 200, outputTokens: 80 },
    );
    const done = await labelRun({
      ...base,
      out,
      ledger,
      provider: rest.provider,
    });
    expect(done).toMatchObject({
      status: 'complete',
      sent: 2,
      labeled: 5,
      remaining: 0,
    });
    expect(rest.calls).toEqual([['u0003', 'u0004'], ['u0005']]);
    const calls = readLedger(ledger).calls;
    expect(calls.map((c) => [c.batch, c.status, c.counted])).toEqual([
      ['b0001', 'accepted', 150],
      ['b0002', 'accepted', reservation],
      ['b0003', 'accepted', 280],
    ]);
    expect(calls[1]?.inputTokens).toBeNull();
    expect(ledgerTotal(readLedger(ledger))).toBe(150 + reservation + 280);
    // A finished run sends nothing more.
    const again = fake();
    expect(
      await labelRun({ ...base, out, ledger, provider: again.provider }),
    ).toMatchObject({ status: 'complete', sent: 0 });
    expect(again.calls).toEqual([]);
    // Retained calls keep the request, the response text, usage and ids, not the stream.
    const retained = JSON.parse(
      readFileSync(join(out, 'calls', 'b0002-1.json'), 'utf8'),
    ) as {
      request: { input: { content: string }[] };
      response: { text: string; usage: null };
      failureEvidence: null;
    };
    expect(payloadIds(retained.request.input[0]?.content)).toEqual([
      'u0003',
      'u0004',
    ]);
    expect(retained.response.usage).toBeNull();
    expect(retained.failureEvidence).toBeNull();
    // Resuming with different settings is refused.
    await expect(
      labelRun({ ...base, out, ledger, batch: 3, provider: again.provider }),
    ).rejects.toThrow(/started with batch 2/);
  });

  it('keeps one cumulative ledger across archives under one cap', async () => {
    const a = await prepared();
    const ledger = a.ledger;
    await labelRun({ ...base, out: a.out, ledger, provider: fake().provider });
    const used = ledgerTotal(readLedger(ledger));
    expect(used).toBe(450);
    const b = await prepared();
    const outB = join(b.root, 'other-0-5');
    await writeItems(outB, synthetic());
    const capped = fake();
    const result = await labelRun({
      ...base,
      out: outB,
      ledger,
      cap: used + 100,
      provider: capped.provider,
    });
    expect(result).toMatchObject({ status: 'budget', sent: 0, used: 450 });
    expect(capped.calls).toEqual([]);
    await labelRun({ ...base, out: outB, ledger, provider: fake().provider });
    expect(new Set(readLedger(ledger).calls.map((c) => c.run))).toEqual(
      new Set(['fixture-0-5', 'other-0-5']),
    );
    expect(ledgerTotal(readLedger(ledger))).toBe(900);
  });

  it('counts a rejected response, stops, and sends the batch again as a new attempt', async () => {
    const { out, ledger } = await prepared();
    const bad = fake((ids) => ({
      labels: ids.map((id) => ({ ...none(id), categories: ['naming'] })),
    }));
    const rejected = await labelRun({
      ...base,
      out,
      ledger,
      provider: bad.provider,
    });
    expect(rejected).toMatchObject({
      status: 'rejected',
      sent: 1,
      labeled: 0,
      used: 150,
    });
    expect(rejected.reason).toMatch(/naming requires name/);
    const good = fake();
    expect(
      await labelRun({ ...base, out, ledger, provider: good.provider }),
    ).toMatchObject({ status: 'complete', sent: 3 });
    expect(good.calls[0]).toEqual(['u0001', 'u0002']);
    expect(
      readLedger(ledger).calls.map((c) => [c.batch, c.attempt, c.status]),
    ).toEqual([
      ['b0001', 1, 'rejected'],
      ['b0001', 2, 'accepted'],
      ['b0002', 1, 'accepted'],
      ['b0003', 1, 'accepted'],
    ]);
    expect(readLabels(out)?.batches[0]?.attempt).toBe(2);
  });

  it('applies a retained accepted call after an interruption instead of resending it', async () => {
    const { out, ledger } = await prepared();
    await labelRun({
      ...base,
      out,
      ledger,
      provider: fake().provider,
      batches: 1,
    });
    // Interrupted after the call was retained but before labels.json recorded it.
    rmSync(join(out, 'labels.json'));
    const resumed = fake();
    const result = await labelRun({
      ...base,
      out,
      ledger,
      provider: resumed.provider,
    });
    expect(result).toMatchObject({ status: 'complete', recovered: 1, sent: 2 });
    expect(resumed.calls).toEqual([['u0003', 'u0004'], ['u0005']]);
    expect(
      readLedger(ledger).calls.filter((c) => c.batch === 'b0001'),
    ).toHaveLength(1);
  });

  it('counts a transport failure at its reservation when no usage was reported', async () => {
    const { out, ledger } = await prepared();
    const failing: LabelProvider = () =>
      Promise.reject(
        new V7TransportError('HTTP 503', 'data: {"type":"error"}', null),
      );
    const result = await labelRun({ ...base, out, ledger, provider: failing });
    expect(result.status).toBe('failed');
    const [call] = readLedger(ledger).calls;
    expect(call).toMatchObject({ status: 'failed', inputTokens: null });
    expect(call?.counted).toBe(call?.reserved);
    expect(
      (
        JSON.parse(
          readFileSync(join(out, 'calls', 'b0001-1.json'), 'utf8'),
        ) as { failureEvidence: string }
      ).failureEvidence,
    ).toBe('data: {"type":"error"}');
  });

  it('connects the transport only after a batch passes the cap', async () => {
    const { out, ledger } = await prepared();
    let connected = 0;
    const connect = () => {
      connected++;
      return Promise.resolve(fake().provider);
    };
    expect(
      await labelRun({ ...base, out, ledger, cap: 10, connect }),
    ).toMatchObject({ status: 'budget' });
    expect(connected).toBe(0);
    expect(await labelRun({ ...base, out, ledger, connect })).toMatchObject({
      status: 'complete',
    });
    expect(connected).toBe(1);
  });
});

describe('transport', () => {
  const completed = (text: string, extra: Record<string, unknown> = {}) =>
    `event: response.created\ndata: {"type":"response.created"}\n\nevent: response.completed\ndata: ${JSON.stringify(
      {
        type: 'response.completed',
        response: {
          id: 'resp_1',
          status: 'completed',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text }],
            },
          ],
          usage: { input_tokens: 1200, output_tokens: 300 },
          ...extra,
        },
      },
    )}\n\n`;
  const request = labelRequest('gpt-6.1-sol', {
    people,
    registry: [],
    context: [],
    items: synthetic().items.slice(0, 1),
  });

  it('posts the labeling request like the continuous provider and redacts the token', async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const transport = ((url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return Promise.resolve(
        new Response(
          completed(respond([truth.u0001]), { echo: 'secret-token' }),
          {
            headers: { 'content-type': 'text/event-stream' },
          },
        ),
      );
    }) as typeof fetch;
    const result = await labelProvider(
      () => Promise.resolve('secret-token'),
      transport,
    )(request);
    expect(seen[0]?.url).toBe(LABEL_ENDPOINT);
    expect(seen[0]?.init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer secret-token',
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
    });
    expect(JSON.parse(seen[0]?.init?.body as string)).toMatchObject({
      model: 'gpt-6.1-sol',
      store: false,
      stream: true,
      text: {
        format: { type: 'json_schema', name: 'item_labels', strict: true },
      },
    });
    expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 300 });
    expect(result.responseId).toBe('resp_1');
    expect(result.evidence).toContain('[REDACTED]');
    expect(result.evidence).not.toContain('secret-token');
    expect(accept(result.text, ['u0001']).labels[0]?.name).toBe(
      'The Berry Lantern',
    );
  });

  it('rejects a credential echo and keeps failure evidence redacted', async () => {
    const echo = (() =>
      Promise.resolve(
        new Response(completed('secret-token'), {
          headers: { 'content-type': 'text/event-stream' },
        }),
      )) as typeof fetch;
    const error = await labelProvider(
      'secret-token',
      echo,
    )(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(V7TransportError);
    expect((error as V7TransportError).message).toBe(
      'Credential echo rejected.',
    );
    expect((error as V7TransportError).evidence).not.toContain('secret-token');
    expect((error as V7TransportError).usage).toEqual({
      inputTokens: 1200,
      outputTokens: 300,
    });
    const failing = (() =>
      Promise.resolve(
        new Response('{"error":{"message":"bad secret-token"}}', {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
      )) as typeof fetch;
    const failed = await labelProvider(
      'secret-token',
      failing,
    )(request).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(V7TransportError);
    expect((failed as V7TransportError).evidence).toContain('[REDACTED]');
    expect((failed as V7TransportError).evidence).not.toContain('secret-token');
    expect((failed as V7TransportError).usage).toBeNull();
  });
});

describe('timeline and verification', () => {
  it('writes one row per positive in round order with who adopted or repeated whose item', async () => {
    const { out, ledger } = await prepared();
    await labelRun({ ...base, out, ledger, provider: fake().provider });
    const timeline = readFileSync(join(out, 'timeline.md'), 'utf8');
    const rows = timeline.split('\n').filter((l) => /^\| \d/.test(l));
    expect(rows.map((r) => r.split('|')[1]?.trim())).toEqual([
      '1',
      '2',
      '3',
      '5',
    ]);
    expect(rows[0]).toContain('ordinary-11');
    expect(rows[0]).toContain('names N1 "The Berry Lantern"');
    expect(rows[1]).toContain(
      'adopts name N1 "The Berry Lantern" from sol (round 1, call ordinary-11, item u0001)',
    );
    expect(rows[1]).toContain('new norm R1 "leave some berries"');
    // Table cells escape the pipe inside the verbatim text.
    expect(rows[1]).toContain('Everyone should leave \\| some berries.');
    expect(rows[2]).toContain(
      'repeats norm R1 "leave some berries" from moss (round 2, call ordinary-12, item u0002)',
    );
    expect(rows[3]).toContain('view of sol');
    expect(timeline).not.toContain('I gathered roots');
    const positives = JSON.parse(
      readFileSync(join(out, 'positives.json'), 'utf8'),
    ) as {
      items: { id: string; links: unknown[] }[];
    };
    expect(positives.items.map((i) => i.id)).toEqual([
      'u0001',
      'u0002',
      'u0003',
      'u0005',
    ]);
    const negatives = JSON.parse(
      readFileSync(join(out, 'negatives-sample.json'), 'utf8'),
    ) as {
      seed: number;
      negatives: number;
      items: { id: string }[];
    };
    expect(negatives).toMatchObject({ seed: 7, negatives: 1 });
    expect(negatives.items.map((i) => i.id)).toEqual(['u0004']);
  });

  it('draws the same negative sample for the same seed', () => {
    const values = Array.from({ length: 50 }, (_, i) => i);
    const a = sample(values, 20, 7);
    expect(a).toHaveLength(20);
    expect(a).toEqual(sample(values, 20, 7));
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(new Set(a).size).toBe(20);
    expect(sample(values, 20, 8)).not.toEqual(a);
    expect(sample([1, 2], 20, 7)).toEqual([1, 2]);
  });

  it('computes agreement rates from a filled verification file and protects filled verdicts', async () => {
    const { out, ledger } = await prepared();
    await labelRun({ ...base, out, ledger, provider: fake().provider });
    const path = join(out, 'verification.json');
    const template = JSON.parse(readFileSync(path, 'utf8')) as {
      entries: {
        item: string;
        sample: string;
        verdict: string | null;
        note: string;
      }[];
    };
    expect(
      template.entries.map((e) => [e.item, e.sample, e.verdict, e.note]),
    ).toEqual([
      ['u0001', 'positive', null, ''],
      ['u0002', 'positive', null, ''],
      ['u0003', 'positive', null, ''],
      ['u0004', 'negative', null, ''],
      ['u0005', 'positive', null, ''],
    ]);
    const verdicts: Record<string, string> = {
      u0001: 'agree',
      u0002: 'partial',
      u0003: 'disagree',
      u0004: 'agree',
    };
    for (const e of template.entries) e.verdict = verdicts[e.item] ?? null;
    writeFileSync(path, JSON.stringify(template));
    const report = agreementReport(JSON.parse(readFileSync(path, 'utf8')));
    expect(report.overall).toMatchObject({
      entries: 5,
      verified: 4,
      pending: 1,
      agree: 2,
      partial: 1,
      disagree: 1,
      agreement: 0.5,
      lenient: 0.75,
    });
    expect(report.positives).toMatchObject({
      verified: 3,
      agree: 1,
      agreement: 1 / 3,
      lenient: 2 / 3,
    });
    expect(report.negatives).toMatchObject({ verified: 1, agreement: 1 });
    expect(report.categories.naming).toMatchObject({ agree: 1, agreement: 1 });
    expect(report.categories['norm-repetition']).toMatchObject({
      disagree: 1,
      agreement: 0,
    });
    expect(report.categories['private-view']).toMatchObject({
      verified: 0,
      pending: 1,
      agreement: null,
    });
    await expect(writeOutputs(out, 7)).rejects.toThrow(
      /already holds verdicts/,
    );
    // Running label again on the finished run leaves the filled verification untouched.
    expect(
      await labelRun({ ...base, out, ledger, provider: fake().provider }),
    ).toMatchObject({ status: 'complete', sent: 0 });
    expect(
      agreementReport(JSON.parse(readFileSync(path, 'utf8'))).overall.verified,
    ).toBe(4);
    await writeOutputs(out, 7, true);
    expect(
      agreementReport(JSON.parse(readFileSync(path, 'utf8'))).overall.verified,
    ).toBe(0);
    template.entries[0] = {
      ...template.entries[0],
      item: 'u0001',
      sample: 'positive',
      verdict: 'maybe',
      note: '',
    };
    expect(() =>
      agreementReport({
        ...template,
        format: 'self-evolving-world/culture-label-verification',
      }),
    ).toThrow(/verdict must be/);
    expect(existsSync(join(out, 'timeline.md'))).toBe(true);
  });
});
