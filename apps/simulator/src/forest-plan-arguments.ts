import type { V7Data, V7Json, V7Schema } from '@self-evolving-world/world-core';
/** Structured-output null placeholders mean omission only for declared optional fields. */
export function forestPlanArguments(schema: V7Schema, args: V7Data): V7Data {
  const visit = (schema: V7Schema, value: V7Json): V7Json => {
    if (Array.isArray(value) && schema.type === 'array' && schema.items)
      return value.map((v) => visit(schema.items as V7Schema, v));
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      schema.type === 'object'
    ) {
      const result: V7Data = {};
      for (const [key, v] of Object.entries(value)) {
        const property = schema.properties?.[key];
        if (
          v === null &&
          property &&
          property.type !== 'null' &&
          !schema.required?.includes(key)
        )
          continue;
        result[key] = property ? visit(property, v) : v;
      }
      return result;
    }
    return value;
  };
  return visit(schema, args) as V7Data;
}
