import type { V7Object, V7Stack, V7Event } from './continuous-types.js';
/** Public appearance and bookkeeping are distinct from the raw physical audit. */
export function preservationPublicObject(o: V7Object): V7Object {
  const d = o.data.preservation;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return o;
  return {
    ...o,
    data: {
      ...o.data,
      preservation: {
        ...d,
        waterFraction: Math.round(Number(d.waterFraction) * 4) / 4,
        massRatio: Math.round(Number(d.massRatio) * 4) / 4,
        precision:
          'Coarse visual appearance, not a calibrated mass or moisture measurement.',
      },
    },
  };
}
export function preservationPublicStack(s: V7Stack): V7Stack {
  const p = s.processing,
    d = p?.preservationPhysics;
  if (!p || !d || typeof d !== 'object' || Array.isArray(d)) return s;
  const input = p.preservationInput;
  const publicInput =
    input && typeof input === 'object' && !Array.isArray(input)
      ? Object.fromEntries(
          Object.entries(input).filter(
            ([key]) => !['nutrition', 'toxins'].includes(key),
          ),
        )
      : null;
  return {
    ...s,
    processing: {
      ...p,
      preservationPhysics: {
        version: d.version ?? null,
        prepared: d.prepared ?? false,
        tray: d.tray ?? '',
        opening: d.opening ?? 1,
        initialization: d.initialization ?? '',
        condition:
          'Exact water and nutrient/toxin totals are physical audit state; paid evidence is recorded separately.',
      },
      ...(publicInput ? { preservationInput: publicInput } : {}),
    },
  };
}
export function preservationPublicEvent(e: V7Event): V7Event {
  if (e.type !== 'preservation-progress' || !('audit' in e.data)) return e;
  const data = Object.fromEntries(
    Object.entries(e.data).filter(([key]) => key !== 'audit'),
  );
  return { ...e, data };
}
