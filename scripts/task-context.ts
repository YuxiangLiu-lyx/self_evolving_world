import { createHash } from 'node:crypto';
import { object } from './validation.js';
import type { TaskRoute } from './harness.js';
import type { DeliveryMode } from './delivery.js';

export interface Basis {
  readonly source: 'task-instruction' | 'standing-instruction';
  readonly reference: string;
  readonly quote: string;
}
export type MergeAuthority =
  | { readonly status: 'missing' }
  | { readonly status: 'granted' | 'forbidden'; readonly basis: Basis };
export type ExperimentIntent =
  | { readonly mode: 'none' }
  | {
      readonly mode: 'random' | 'survival';
      readonly allocation: 'new' | 'reuse';
      readonly basis: Basis;
      readonly id?: string;
      readonly seed?: number;
      readonly rounds?: number;
    };
export interface TaskIntent {
  readonly id: string;
  readonly task: string;
  readonly request: string;
  readonly plan: string;
  readonly requirementsVersion: number;
  readonly requestedType: 'code' | 'documentation' | 'experiment' | 'mixed';
  readonly experiment: ExperimentIntent;
  readonly analyze: readonly string[];
  readonly delivery: { readonly mode: DeliveryMode; readonly basis: Basis };
  readonly merge: MergeAuthority;
}
export type Step =
  | 'prepare'
  | 'experiment'
  | 'analysis'
  | 'validate'
  | 'review'
  | 'commit'
  | 'pr-body'
  | 'publish'
  | 'merge'
  | 'finish';
export type Status =
  | 'running'
  | 'needs_review'
  | 'needs_fix'
  | 'needs_authorization'
  | 'blocked'
  | 'completed';
export interface Snapshot {
  readonly branch: string;
  readonly head: string;
  readonly base: string;
  readonly sourceHash: string;
  readonly planHash: string;
  readonly route: TaskRoute;
  readonly policy: DeliveryMode;
}
export interface Handoff {
  readonly id: string;
  readonly taskId: string;
  readonly step: Step;
  readonly requirementsVersion: number;
  readonly sourceHash: string;
  readonly intentHash: string;
  readonly materials: unknown;
  readonly question: string;
  readonly resume: string;
}
export interface TaskContext {
  readonly version: 1;
  intent: TaskIntent;
  readonly originalIntent: TaskIntent;
  readonly amendments: TaskIntent[];
  prepared: boolean;
  derived?: Snapshot & {
    commitRequired: boolean;
    publishRequired: boolean;
    mergeRequested: boolean;
  };
  experiment?: {
    before: string[];
    phase: 'started' | 'recorded';
    id?: string;
    error?: string;
  };
  validation?: {
    runId: string;
    sourceHash: string;
    intentHash: string;
    log: string;
  };
  review?: {
    runId: string;
    sourceHash: string;
    files: string[];
    commitMessage: string;
  };
  body?: { path: string; title: string; head: string; runId: string };
  publication?: Record<string, unknown>;
  completion?: Record<string, unknown>;
  readonly history: { step: Step; detail: string }[];
  status: Status;
  step: Step;
  reason: string;
  request?: Handoff;
}

export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`Missing ${name}.`);
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.some((item) => item === value))
    throw new Error(`Expected ${values.join(', ')}.`);
  return value as T;
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported task parameter; checks cannot be disabled.');
}
export function basis(value: unknown): Basis {
  const b = object(value);
  keys(b, ['source', 'reference', 'quote']);
  const quote = text(b.quote, 'instruction quote');
  if (quote.trim().length < 20)
    throw new Error('Record the substantive actual instruction.');
  return {
    source: choice(b.source, ['task-instruction', 'standing-instruction']),
    reference: text(b.reference, 'instruction reference'),
    quote,
  };
}
export function authority(value: unknown): MergeAuthority {
  const a = object(value);
  keys(a, ['status', 'basis']);
  const status = choice(a.status, ['granted', 'missing', 'forbidden']);
  return status === 'missing' ? { status } : { status, basis: basis(a.basis) };
}
export function experimentId(value: unknown): string {
  const id = text(value, 'experiment ID');
  if (!/^ex[1-9]\d*$/.test(id)) throw new Error('Invalid experiment ID.');
  return id;
}
export function parseIntent(value: unknown): TaskIntent {
  const v = object(value);
  keys(v, [
    'id',
    'task',
    'request',
    'plan',
    'requirementsVersion',
    'requestedType',
    'experiment',
    'analyze',
    'delivery',
    'merge',
  ]);
  const id = text(v.id, 'task ID'),
    plan = text(v.plan, 'plan');
  if (
    !/^[a-z0-9][a-z0-9-]{1,79}$/.test(id) ||
    !/^docs\/exec-plans\/(active|completed)\/pr-\d{2,}-[a-z0-9-]+\.md$/.test(
      plan,
    )
  )
    throw new Error('Invalid task ID or plan path.');
  if (
    typeof v.requirementsVersion !== 'number' ||
    !Number.isSafeInteger(v.requirementsVersion) ||
    v.requirementsVersion < 1
  )
    throw new Error('Invalid requirements version.');
  const e = object(v.experiment);
  const mode = choice(e.mode, ['none', 'random', 'survival']);
  keys(
    e,
    mode === 'none'
      ? ['mode']
      : ['mode', 'allocation', 'basis', 'id', 'seed', 'rounds'],
  );
  let experiment: ExperimentIntent = { mode: 'none' };
  if (mode !== 'none') {
    const allocation = choice(e.allocation, ['new', 'reuse']);
    if (allocation === 'new' && e.id !== undefined)
      throw new Error('New experiment IDs are allocated by the existing CLI.');
    if (mode === 'survival' && (e.seed !== undefined || e.rounds !== undefined))
      throw new Error('Survival uses the existing fixed protocol.');
    if (
      e.seed !== undefined &&
      (typeof e.seed !== 'number' ||
        !Number.isInteger(e.seed) ||
        e.seed < 1 ||
        e.seed > 4294967295)
    )
      throw new Error('Invalid random seed.');
    if (
      e.rounds !== undefined &&
      (typeof e.rounds !== 'number' ||
        !Number.isInteger(e.rounds) ||
        e.rounds < 3 ||
        e.rounds > 500)
    )
      throw new Error('Invalid random round count.');
    experiment = {
      mode,
      allocation,
      basis: basis(e.basis),
      ...(allocation === 'reuse' ? { id: experimentId(e.id) } : {}),
      ...(typeof e.seed === 'number' ? { seed: e.seed } : {}),
      ...(typeof e.rounds === 'number' ? { rounds: e.rounds } : {}),
    };
  }
  if (!Array.isArray(v.analyze))
    throw new Error('Expected retrospective analysis IDs.');
  const delivery = object(v.delivery);
  keys(delivery, ['mode', 'basis']);
  const policy = choice(delivery.mode, ['merge', 'pr-only', 'local-only']);
  const merge = authority(v.merge);
  if (policy !== 'merge' && merge.status !== 'forbidden')
    throw new Error('No-merge exceptions must explicitly forbid merge.');
  if (policy === 'merge' && merge.status === 'forbidden')
    throw new Error(
      'Record the no-merge instruction as the existing plan exception.',
    );
  return {
    id,
    task: text(v.task, 'task name'),
    request: text(v.request, 'original request'),
    plan,
    requirementsVersion: v.requirementsVersion,
    requestedType: choice(v.requestedType, [
      'code',
      'documentation',
      'experiment',
      'mixed',
    ]),
    experiment,
    analyze: [...new Set(v.analyze.map(experimentId))],
    delivery: { mode: policy, basis: basis(delivery.basis) },
    merge,
  };
}

export function newContext(intent: TaskIntent): TaskContext {
  return {
    version: 1,
    intent,
    originalIntent: intent,
    amendments: [],
    prepared: false,
    history: [],
    status: 'needs_review',
    step: 'prepare',
    reason: '',
  };
}
