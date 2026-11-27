import type { V7Package } from './continuous-types.js';
import { leverMassComparatorKit } from './long-ex19-lever-mass-comparison.js';

/** ex21: the ex19 lever mass comparator, built by the same factory for this run under its own
 * identity, as the calibrated measuring device that compare-material-samples@1 weighs on. Its
 * geometry, physics, costs, rules and texts are those of ex19 lever-mass-comparator@1. */
export const LONG_EX21_BEAM_MASS_KIT = leverMassComparatorKit({
  id: 'beam-mass-comparator',
  scope: 'long-ex21',
  dependencies: ['foundation-open@1'],
  events: 'beam-comparator',
  name: 'Beam mass comparator',
  equivalence: 'measurement:beam-comparator:reference-mass-ratio:1',
  reuse: {
    experiment:
      'Registry check: no long-ex21 interface weighs or compares masses (the foundations, air-dry-food-trial@1 and small-combustion-source@1); ex19 lever-mass-comparator@1 is the general mechanism but is scoped to long-ex19 and cannot be installed here, so its factory builds this package under its own id, handler, record keys and event prefix',
    source:
      'long-ex19-lever-mass-comparison.ts (leverMassComparatorKit, which also builds LONG_EX19_LEVER_MASS_COMPARATOR unchanged); through it branch-screen@1 rod geometry, material-geometry@1 wood values, the ex19 contact and firm-ground checks, collective-work.ts and openRemember',
    description:
      'Implementation reuse only; no beam, stone, reference piece, instrument, skill or mastery is supplied. Only the identity is new; compare-material-samples@1 weighs its own samples on a tested comparator of this package with the same physics.',
  },
});

export const LONG_EX21_BEAM_MASS_COMPARATOR: V7Package =
  LONG_EX21_BEAM_MASS_KIT.package;
