import type {
  V7Action,
  V7Actor,
  V7Cursor,
  V7World,
} from './continuous-types.js';
import { v7Clone, v7Signature, v7Json } from './continuous-data.js';
import {
  forestReferenceSpelling,
  FOREST_REFERENCE_SCOPES,
} from './forest-references.js';

type Operation = NonNullable<V7Cursor['operation']>;
interface Binding {
  request: V7Action;
  operation: Operation;
  life: string;
  tick: number;
}
const key = 'execution:operation';
/** A plan is disposable; paid work and its exact resolved identity are not. */
export function forestBoundOperation(
  w: V7World,
  a: V7Actor,
  action: V7Action,
): Operation | null {
  if (w.state.operationContinuity !== 1 || a.vitals.health <= 0) return null;
  const raw = a.extensionState[key];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as unknown as Binding;
  if (b.tick !== w.tick || b.life !== v7Signature(a.life ?? null)) return null;
  if (
    !Number.isSafeInteger(b.operation.elapsed) ||
    b.operation.elapsed < 1 ||
    (b.operation.remaining !== null &&
      (!Number.isSafeInteger(b.operation.remaining) ||
        b.operation.remaining < 1))
  )
    throw new Error('Invalid persisted operation progress.');
  const normalize = (request: V7Action): V7Action => {
    if (!w.config.longDevelopment) return request;
    const copy = v7Clone(request);
    const scopes =
      w.abilities.find((ability) => ability.id === request.interface)
        ?.references ??
      FOREST_REFERENCE_SCOPES[request.interface] ??
      {};
    for (const field of Object.keys(scopes)) {
      const raw = copy.args[field];
      if (typeof raw === 'string')
        copy.args[field] = forestReferenceSpelling(w, raw);
      else if (Array.isArray(raw))
        copy.args[field] = raw.map((item) => {
          if (typeof item === 'string') return forestReferenceSpelling(w, item);
          if (
            item &&
            typeof item === 'object' &&
            !Array.isArray(item) &&
            typeof item.target === 'string'
          )
            return { ...item, target: forestReferenceSpelling(w, item.target) };
          return item;
        });
    }
    return copy;
  };
  action = normalize(action);
  const candidates = [normalize(b.request), b.operation.action];
  // Typed aliases may spell the same already-bound identity. Resource aliases are accepted
  // only if they were the original request; no new lookup can select another resource.
  const typed = v7Clone(b.operation.action);
  const references =
    w.abilities.find((a) => a.id === typed.interface)?.references ??
    FOREST_REFERENCE_SCOPES[typed.interface] ??
    {};
  const alias = (
    value: unknown,
    incoming: unknown,
    original: unknown,
  ): unknown => {
    if (
      typeof value !== 'string' ||
      typeof incoming !== 'string' ||
      !/^(item|object):/.test(incoming) ||
      incoming.replace(/^(item|object):/, '') !== value
    )
      return value;
    const kind =
      typeof original === 'string' && /^(item|object):/.test(original)
        ? original.slice(0, original.indexOf(':'))
        : w.objects.some((o) => o.id === value)
          ? 'object'
          : 'item';
    return incoming.startsWith(kind + ':') ? incoming : value;
  };
  for (const field of Object.keys(references)) {
    const value = typed.args[field],
      incoming = action.args[field],
      original = b.request.args[field];
    if (Array.isArray(value) && Array.isArray(incoming)) {
      typed.args[field] = value.map((entry, index) => {
        const next = incoming[index],
          old = Array.isArray(original) ? original[index] : null;
        if (
          !entry ||
          typeof entry !== 'object' ||
          Array.isArray(entry) ||
          !next ||
          typeof next !== 'object' ||
          Array.isArray(next)
        )
          return entry;
        return {
          ...entry,
          target: v7Json(
            alias(
              entry.target,
              next.target,
              old && typeof old === 'object' && !Array.isArray(old)
                ? old.target
                : null,
            ),
          ),
        };
      });
    } else if (value !== undefined)
      typed.args[field] = v7Json(alias(value, incoming, original));
  }
  candidates.push(typed);
  return candidates.some((c) => v7Signature(c) === v7Signature(action))
    ? v7Clone(b.operation)
    : null;
}
export function forestSaveOperation(
  w: V7World,
  a: V7Actor,
  request: V7Action,
  operation: Operation | null,
): void {
  if (w.state.operationContinuity !== 1) return;
  if (!operation) {
    delete a.extensionState['execution:operation'];
    return;
  }
  const old = a.extensionState[key] as unknown as Binding | undefined;
  a.extensionState[key] = v7Json({
    request:
      old && old.operation.startedAt === operation.startedAt
        ? old.request
        : v7Clone(request),
    operation: v7Clone(operation),
    life: v7Signature(a.life ?? null),
    tick: w.tick,
  });
}
export function forestClearOperation(a: V7Actor): void {
  delete a.extensionState['execution:operation'];
}
