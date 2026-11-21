/** Exact ex8 technical repairs. Preserved snapshots, call journal, prompts, seed and budgets remain mandatory. */
const repairs: Record<string, { before: string; after: string }> = {
  'apps/simulator/src/continuous-input.ts': {
    before: 'ce34371a69a8b99f3a84bff016037f3585ab06a468c871de2343187f7c86bcb6',
    after: 'b9ffb65c453a1935e79bb4449cb94564f673ba3d71f71ff508dabf02e31f54eb',
  },
  'apps/simulator/src/continuous-run.ts': {
    before: 'd68659025895629a26501fa5cb730c61b57cdf1dc66e493aeb1c251412525fc8',
    after: '152328522b7aab3082461766ad3df4376b50fb42ade1c5c26ac11c1a4c1e3514',
  },
  'apps/simulator/src/continuous-provider.ts': {
    before: '57c95bd77c67e02f9634d3fdb874d77d1f855aca7c944ee8da8eddc0ae0cea1d',
    after: 'b4edefe83f0ca4d5a47ab39fc39d5edbe52aa8d83752999f7ea4c88bf4cacc86',
  },
  'scripts/continuous-cli.ts': {
    before: '0edc6dcc5bbb57e4b50c96ee7094dce7503fdc00858674b7946a5cc84a94daa6',
    after: '3691ceebafa3599a42875bf2695714f68b30d0e9d137af8aba614833043cdda6',
  },
  'scripts/continuous-analysis.ts': {
    before: 'd9f0786f83ed4d184d94c0361edcdfa62519aaf4ccd1d2a1b592bd452f92e3ef',
    after: 'cd00c40b4fa7163b84ef6b8ec131dd7cb8d76ba7dc37ca3e16e61b6214033ad8',
  },
  'scripts/continuous-store.test.ts': {
    before: '0f2c2c4e3f25d5d98b2fce818ff69fb04730ca843c7ac42a50b27245ad2c3ea8',
    after: '0c006ab530701fecadcaa5c02137ba8d18a2759bb5b355251293085d8004f99e',
  },
  'scripts/continuous-store.ts': {
    before: 'f176da8a6e0262303f7bd480a1576aa73dcc343b553e6c3236fab18d88091aef',
    after: '25f99c79f714fbfe2564218bbc94e0c631d4277e97c004e482a4c9bada096ce5',
  },
  'scripts/continuous-source.ts': {
    before: '6cca9c3f7bb9cf9566456539f96ee8ba02c4eafafafd4a5c68938c6702e4207d',
    after: '7e81c1a5a78c71e923e569c1d3251e879c3fc41a175c24a9bdd265d356eb3449',
  },
};
export function forestCheckpointRepair(
  path: string,
  before: string,
  after: string,
  declaration: unknown,
): boolean {
  const repair = repairs[path];
  return (
    declaration === 'forest-checkpoint-config-v1' &&
    repair?.before === before &&
    repair.after === after
  );
}
