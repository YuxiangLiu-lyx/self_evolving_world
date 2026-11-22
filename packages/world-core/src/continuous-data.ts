import type {
  V7Data,
  V7Json,
  V7Schema,
  V7Work,
  V7World,
} from './continuous-types.js';

export class V7ComputePause extends Error {}
export function v7Work(limit: number): V7Work {
  return {
    remaining: limit,
    spend(amount = 1) {
      this.remaining -= amount;
      if (this.remaining < 0)
        throw new V7ComputePause(
          'Simulation computation budget exhausted; checkpoint the entire world.',
        );
    },
  };
}
export function v7Clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export function v7Freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) v7Freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function v7Number(
  value: unknown,
  name: string,
  min = -Infinity,
  max = Infinity,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`Invalid finite ${name}.`);
  return value;
}
export function v7String(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`Missing ${name}.`);
  return value;
}
export function v7Record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a record.');
  return value as Record<string, unknown>;
}
export function v7Json(value: unknown, depth = 0): V7Json {
  if (depth > 24)
    throw new V7ComputePause('Input nesting exceeds parsing protection.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return value;
  if (typeof value === 'number') return v7Number(value, 'JSON number');
  if (Array.isArray(value))
    return value.map((x: unknown) => v7Json(x, depth + 1));
  const result: V7Data = {};
  for (const [key, child] of Object.entries(v7Record(value))) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('Unsafe data key.');
    result[key] = v7Json(child, depth + 1);
  }
  return result;
}
export function v7Validate(
  schema: V7Schema,
  value: V7Json,
  path = 'arguments',
): void {
  if (
    schema.enum &&
    !schema.enum.some((x) => JSON.stringify(x) === JSON.stringify(value))
  )
    throw new Error(`${path} is outside the declared choices.`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`${path} must be an object.`);
    for (const key of schema.required ?? [])
      if (!(key in value)) throw new Error(`${path}.${key} is required.`);
    for (const [key, child] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub) v7Validate(sub, child, `${path}.${key}`);
      else if (!schema.additionalProperties)
        throw new Error(`${path}.${key} is not registered.`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || !schema.items)
      throw new Error(`${path} must be a declared array.`);
    for (const x of value) v7Validate(schema.items, x, path);
  } else if (schema.type === 'number' || schema.type === 'integer') {
    v7Number(value, path, schema.minimum, schema.maximum);
    if (schema.type === 'integer' && !Number.isSafeInteger(value))
      throw new Error(`${path} must be an integer.`);
  } else if (schema.type === 'null') {
    if (value !== null) throw new Error(`${path} must be null.`);
  } else if (typeof value !== schema.type)
    throw new Error(`${path} must be ${schema.type}.`);
  if (
    typeof value === 'string' &&
    schema.maxLength !== undefined &&
    value.length > schema.maxLength
  )
    throw new V7ComputePause(`${path} exceeds string parsing protection.`);
}
export function v7Id(world: V7World, prefix: string): string {
  world.nextIdentity += 1;
  return `${prefix}-${String(world.tick)}-${world.identityScope}-${String(world.nextIdentity)}`;
}
export const v7RoundNumber = (value: number): number =>
  Math.round(value * 1e8) / 1e8;
export function v7Signature(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(v7Signature).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${v7Signature(v)}`)
    .join(',')}}`;
}

/** Compare world data without serializing unchanged entities. No mutable cache.
 * Canonical fallback preserves even legacy non-JSON signature aliases. */
export function v7Equivalent(left: unknown, right: unknown): boolean {
  return sameStructure(left, right) || v7Signature(left) === v7Signature(right);
}
function sameStructure(left: unknown, right: unknown): boolean {
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  )
    return typeof left !== 'bigint' && left === right;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !Array.isArray(left) ||
      !Array.isArray(right) ||
      left.length !== right.length
    )
      return false;
    for (let i = 0; i < left.length; i++)
      if (!sameStructure(left[i], right[i])) return false;
    return true;
  }
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) => Object.hasOwn(b, key) && sameStructure(a[key], b[key]),
  );
}

/** Persist finite noninteger numbers at the protocol's shared precision across JS engines. */
export function v7CanonicalNumbers<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key: string, child: unknown) =>
      typeof child === 'number' && !Number.isInteger(child)
        ? v7RoundNumber(child)
        : child,
    ),
  ) as T;
}
