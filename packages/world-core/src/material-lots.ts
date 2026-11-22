import type { V7Stack } from './continuous-types.js';
import { v7Clone } from './continuous-data.js';

/** Flat original lots; locations in these records are provenance, never extra world items. */
export function materialLots(s: V7Stack): V7Stack[] {
  return s.componentLots
    ? v7Clone(s.componentLots)
    : [{ ...v7Clone(s), quantityTenths: Math.round(s.quantity * 10) }];
}
function tenths(s: V7Stack) {
  return Math.round(s.quantity * 10);
}
export function materialSlice(
  s: V7Stack,
  start: number,
  count: number,
): V7Stack[] {
  if (![start, count].every(Number.isSafeInteger) || start < 0 || count < 0)
    throw new Error('Invalid component slice.');
  const lots = materialLots(s),
    result: V7Stack[] = [];
  let offset = 0,
    left = count;
  for (const lot of lots) {
    if (lot.componentLots) throw new Error('Component ledgers must be flat.');
    const n = tenths(lot),
      take = Math.min(left, Math.max(0, offset + n - Math.max(start, offset)));
    if (take)
      result.push({ ...lot, quantity: take / 10, quantityTenths: take });
    offset += n;
    left -= take;
  }
  if (left) throw new Error('Insufficient actual component quantity.');
  return result;
}
export function materialRefresh(s: V7Stack) {
  if (!s.componentLots) return;
  s.componentLots = s.componentLots.filter((lot) => lot.quantity > 0);
  s.quantityTenths = s.componentLots.reduce((n, lot) => n + tenths(lot), 0);
  s.quantity = s.quantityTenths / 10;
  const dates = s.componentLots.flatMap((lot) =>
    lot.harvestedAt === undefined ? [] : [lot.harvestedAt],
  );
  if (dates.length) s.harvestedAt = Math.min(...dates);
  // The summary never rejuvenates older material; actual aging is per original lot.
  s.decay = Math.max(0, ...s.componentLots.map((lot) => lot.decay ?? 0));
}
export function materialReduce(s: V7Stack, target: number) {
  if (!s.componentLots) return;
  const previous = s.componentLots.reduce((n, lot) => n + tenths(lot), 0);
  if (target > previous)
    throw new Error('Cannot create material by enlarging a component ledger.');
  s.componentLots = materialSlice(s, previous - target, target);
  materialRefresh(s);
}
/** A copy of the first exact slices. The caller separately removes these slices from the source. */
export function materialPortion(s: V7Stack, count: number): V7Stack {
  const p = v7Clone(s);
  if (s.componentLots) p.componentLots = materialSlice(s, 0, count);
  p.quantity = count / 10;
  p.quantityTenths = count;
  if (p.componentLots) materialRefresh(p);
  return p;
}
export function materialValidate(s: V7Stack) {
  if (!s.componentLots) return;
  if (
    !s.componentLots.length ||
    s.componentLots.some(
      (lot) =>
        lot.componentLots ||
        lot.resource !== s.resource ||
        lot.quantity <= 0 ||
        !Number.isSafeInteger(lot.quantity * 10) ||
        lot.quantityTenths !== tenths(lot),
    )
  )
    throw new Error('Invalid original material components.');
  if (s.componentLots.reduce((n, lot) => n + tenths(lot), 0) !== tenths(s))
    throw new Error(
      'Component ledger does not conserve its material quantity.',
    );
}
