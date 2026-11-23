import type { V7Stack } from '@self-evolving-world/world-core';
/** A recorded exposure glyph never creates a detached product or implies food safety. */
export function specimenAppearance(s: V7Stack) {
  const p = s.processing,
    method = p?.method;
  if (
    !p ||
    typeof method !== 'string' ||
    ![
      'source-bound-hazelnut-opening-trial@1',
      'moss-source-bound-hazelnut-interior-access-trial@1',
    ].includes(method)
  )
    return null;
  return {
    deformed: p.covering === 'bounded deformation',
    exposed:
      p.exposed === true &&
      (method === 'source-bound-hazelnut-opening-trial@1' ||
        p.interiorObserved === true),
  };
}
