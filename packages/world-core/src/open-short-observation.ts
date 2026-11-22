import type { V7Object, V7Stack } from './continuous-types.js';
/** Retain physical audit state in replay; expose paid evidence and visible condition, not hidden constitutive tables. */
export function shortPublicObject(o: V7Object): V7Object {
  if (o.kind !== 'short-refuge') return o;
  const data = Object.fromEntries(
    Object.entries(o.data).filter(
      ([key]) =>
        !['components', 'lastLoad', 'poleLengths', 'poleRadii'].includes(key),
    ),
  );
  const parts = (o.data.components ?? []) as unknown as V7Stack[];
  return {
    ...o,
    data: {
      ...data,
      components: parts.map((s) => ({
        id: s.id,
        resource: s.resource,
        origin: s.origin,
        quantity: s.quantity,
        role: s.processing?.shortRole ?? null,
      })),
      conditionPrecision:
        'Visible geometry and condition; full raw constitutive state is not personal measured evidence.',
    },
  };
}
export function shortPublicStack(s: V7Stack): V7Stack {
  if (!s.processing?.shortRole) return s;
  const processing = Object.fromEntries(
    Object.entries(s.processing).filter(([key]) => key !== 'shortShape'),
  );
  const coupon = processing.shortCoupon;
  if (coupon && typeof coupon === 'object' && !Array.isArray(coupon))
    processing.shortCoupon = Object.fromEntries(
      Object.entries(coupon).filter(([key]) => key !== 'breakingForce'),
    );
  return { ...s, processing };
}
