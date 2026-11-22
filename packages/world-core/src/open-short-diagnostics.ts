import type { V7Package } from './continuous-types.js';
import { v7Clone } from './continuous-data.js';
import { OPEN_SHORT_REFUGE } from './open-short.js';
import { shortDiagnose, shortLinkDiagnostics } from './open-short-diagnosis.js';
const original = OPEN_SHORT_REFUGE.abilities[0];
if (!original) throw new Error('Missing original short-refuge contract.');
const parameters = v7Clone(original.parameters);
if (!parameters.properties) throw new Error('Missing diagnostic parameters.');
parameters.properties.mode = {
  type: 'string',
  enum: ['diagnose-trial', 'cancel'],
};
export const OPEN_SHORT_DIAGNOSTICS: V7Package = {
  id: 'short-refuge-trial-diagnostics',
  version: 1,
  scope: 'open-ex10',
  dependencies: ['short-material-refuge@1'],
  description:
    'Read-only predicate-level explanation of retained personally performed trials.',
  reuse: {
    experiment: 'ex10 development 15',
    source: 'packages/world-core/src/open-short-trials.ts',
    description:
      'Uses the same exact coupon acceptance evaluator, operation records and public shared reference resolver. This is an added diagnostic, not an independent reinvention or new physical capability.',
  },
  abilities: [
    {
      id: 'short-refuge-trial-diagnostics',
      name: 'Read historical trial acceptance',
      function:
        'Explain recorded cover/joint acceptance checks without rerunning or certifying another configuration.',
      equivalence: 'open:short-refuge-historical-trial-diagnostic:1',
      parameters,
      prerequisites: ['short-material-refuge'],
      dependencies: {
        abilities: ['short-material-refuge'],
        resources: [],
        knowledge: [],
      },
      learning: 1,
      costs:
        '1 round/0.2 energy. project=exact own completed short:work:actor:ID. target="" or exact owned coupon (optional item: prefix). components=[]; x/y/angle/width/length/height=0. Low energy: pause unpaid, remaining=1. Cancel, incompatible action or death: no output or refund.',
      effects:
        'Persists historical values, predicates, thresholds, lineage, unknowns and actual parameter bounds. No specimen, material, certificate, mastery or reward change. After study, the same diagnose-trial mode works on short-material-refuge.',
      handler: 'open.short-diagnostics',
      revision: 'short-refuge-trial-diagnostics@1',
      authored: false,
      practiceEvidence: 'short-refuge-trial-diagnosed',
      references: { target: 'optional-exact-visible' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'One atomic paid read; no escrow or passive physical effects. An unfinished read requires one remaining action.',
      },
    },
  ],
  handlers: { 'open.short-diagnostics': shortDiagnose },
  resources: [],
  satisfaction: [],
  processes: {},
  visualComponents: ['rock'],
  events: ['short-refuge-trial-diagnosed', 'short-refuge-diagnostic-stopped'],
  migrate(w) {
    w.state.shortTrialDiagnostics = 1;
    const ability = w.abilities.find((a) => a.id === 'short-material-refuge');
    const mode = ability?.parameters.properties?.mode;
    if (!ability || !mode?.enum)
      throw new Error('Missing existing short-refuge mode schema.');
    mode.enum.push('diagnose-trial');
    ability.costs +=
      ' diagnose-trial requires personal short-refuge-trial-diagnostics study: full own operation ID, optional owned coupon, empty components and zero coordinates/dimensions; one read at 0.2 energy, no reward.';
    shortLinkDiagnostics(w);
    return w;
  },
};
