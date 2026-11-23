export interface LongQuery {
  section:
    | 'abilities'
    | 'inventory'
    | 'knowledge'
    | 'projects'
    | 'memory'
    | 'state'
    | 'observed';
  search: string;
  ids: string[];
  offset: number;
  part: number;
}
/** Search is an index. Exact IDs retrieve stable full-record pages under the same permissions. */
export function longQueryIndex(
  section: LongQuery['section'],
  id: string,
  value: unknown,
) {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const clip = (v: unknown) => (typeof v === 'string' ? v.slice(0, 180) : null);
  const object =
    record.object &&
    typeof record.object === 'object' &&
    !Array.isArray(record.object)
      ? (record.object as Record<string, unknown>)
      : null;
  const spatial =
    object?.spatial && typeof object.spatial === 'object'
      ? (object.spatial as Record<string, unknown>)
      : null;
  const data =
    object?.data && typeof object.data === 'object'
      ? (object.data as Record<string, unknown>)
      : null;
  if (section === 'observed')
    return {
      id,
      kind: clip(object?.kind),
      name: clip(object?.name),
      position: spatial ? { x: spatial.x, y: spatial.y } : null,
      resource: clip(data?.resource),
      stockWhenSeen: number(data?.stock),
      seenAt: number(record.seenAt),
    };
  if (section === 'knowledge')
    return {
      id,
      subject: clip(record.subject),
      property: clip(record.property),
      verified: typeof record.verified === 'boolean' ? record.verified : null,
      tick: number(record.tick),
    };
  if (section === 'projects')
    return {
      id,
      status: clip(record.status),
      goal: clip(record.goal),
      updatedAt: number(record.updatedAt),
    };
  if (section === 'inventory')
    return {
      id,
      resource: clip(record.resource),
      quantity: number(record.quantity),
      owner: clip(record.owner),
      reservedFor: clip(record.reservedFor),
    };
  return {
    id,
    kind: typeof value,
    summary: clip(
      record.summary ??
        record.property ??
        (typeof value === 'string' ? value : null),
    ),
  };
}
export const QUERY_INDEX_ACCESS =
  'Search/index only; omission is not absence. Use exact ids and zero-based offset/part for full records. No physical observation, state change or reward is performed.';
