/** Exact technical repairs. Preserved snapshots, call journal, prompts, seed and budgets remain mandatory. */
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
  // Ex13 round 157: stable pagination and bounded search indexes repair actual
  // empty continuation pages; retained results and all physical/policy state persist.
  if (declaration === 'long-stable-pagination-v1')
    return (
      path === 'apps/simulator/src/long-context.ts' &&
      before ===
        '82b6a5429f6f68add763d7ef9fd148684067392fe461e1d828430fdd5626458b' &&
      after ===
        '1caaf40375f1a8fa218fafefdc5aac1638201cc3fc2a8cb80f718f8ac9c15373'
    );
  // Ex13 round 56: broad catalogue retrieval is an index; exact-id details and
  // active operations remain intact. Original requests/results and limits persist.
  if (declaration === 'long-catalogue-view-v1')
    return (
      path === 'apps/simulator/src/long-context.ts' &&
      before ===
        '174dee00c43fe36084993bd39c04a9efeb9b11a53a631d7bb88fb195725ecfa5' &&
      after ===
        '82b6a5429f6f68add763d7ef9fd148684067392fe461e1d828430fdd5626458b'
    );
  // Ex13 round 25: an empty commentary is not a decision. Bound capability views
  // also withhold unobserved instance IDs; execution state and all policy stay fixed.
  if (declaration === 'long-empty-commentary-and-instance-view-v1') {
    const pairs: Record<string, { before: string; after: string }> = {
      'apps/simulator/src/responses.ts': {
        before:
          'dfec542a97ad920528c1edce4aa7352c52906d6ba32974cec01cc96eee0a3371',
        after:
          'c5ddbe394637cd7b03ec4dc738a7d498b4eec2e0f64b9fd9a50ba10afb0937ea',
      },
      'apps/simulator/src/long-context.ts': {
        before:
          '04d07f306045b10b3a965245a9e8bfe66acfe9c908abc3f26516a97a6f776876',
        after:
          '174dee00c43fe36084993bd39c04a9efeb9b11a53a631d7bb88fb195725ecfa5',
      },
    };
    const pair = pairs[path];
    return pair?.before === before && pair.after === after;
  }
  // Ex13 round 23: only the long-run transport recognizes explicit commentary/final-answer
  // phases. Raw failed evidence and usage stay unchanged; no policy or request change.
  if (declaration === 'long-final-answer-phase-v1') {
    const pairs: Record<string, { before: string; after: string }> = {
      'apps/simulator/src/responses.ts': {
        before:
          '300b8189a667ad4f16882ee9e921258f69804d1802d3bf36d2ef3a48bc05f5e2',
        after:
          'dfec542a97ad920528c1edce4aa7352c52906d6ba32974cec01cc96eee0a3371',
      },
      'apps/simulator/src/continuous-provider.ts': {
        before:
          'a3891d7e1781a344a29afdef3d69f5cbd1f07a56d40090bc4fe300652f3ed989',
        after:
          '1661ae2886124e371d370d0338ee8c72aaf10a82fed998bc2c0f66609dd2b7a1',
      },
    };
    const pair = pairs[path];
    return pair?.before === before && pair.after === after;
  }
  // Ex13 round 7: both actual world replies used quoted learning durations after
  // ambiguous output-type wording. Clarify only JSON field types; preserve objectives,
  // capability policy, cost ceilings, physical state and every failed call.
  if (declaration === 'long-review-field-types-v1')
    return (
      path === 'apps/simulator/src/long-request.ts' &&
      before ===
        '1d2439f0c1ffd1631cedc0b7edb713d2bf14d6701d1e5b67304c2cc9a4c7a0bf' &&
      after ===
        '789f2d98956fa85bd50e009ccfa3f04264cbb4b691201a3a7ab975c36400bf3d'
    );
  // Ex12 round 56: clear only the explicitly reviewed feedback-repair barrier.
  // No scheduler, budget, prompt, goal, parameter or previously executed action changes.
  if (declaration === 'collective-reviewed-bark-feedback-v1')
    return (
      path === 'apps/simulator/src/continuous-run.ts' &&
      before ===
        'e6e0059bf8d416d195075be152f4118c792fb8b691936e604a5d71e91eb523b6' &&
      after ===
        'f2a3a756b6615f41a8090dc7cf091f1f9915e60b1b3afacd4dad42ed30ba1a26'
    );
  // Ex11 round 1: retain three decoder failures and one explicitly abandoned unknown
  // transport. Only collective response decoding accepts a bounded multi-member text;
  // prompts, output token cap, policy, world state and attempted-call ledgers are unchanged.
  if (declaration === 'collective-batched-response-reader-v1') {
    const pairs: Record<string, { before: string; after: string }> = {
      'apps/simulator/src/responses.ts': {
        before:
          '1d9e79e628104849cc509c78ab02c1992cd90acdab9df3468e45d3bd07e90763',
        after:
          '300b8189a667ad4f16882ee9e921258f69804d1802d3bf36d2ef3a48bc05f5e2',
      },
      'apps/simulator/src/continuous-provider.ts': {
        before:
          '840c45cd73373d81106174a6619379dc7784c015a24adfc99787cb7bc3b3a7dc',
        after:
          '60b3c688778109680caa774a406aa1859bd4fcf771ede787cc590b15f12a441f',
      },
      'apps/simulator/src/continuous-run.ts': {
        before:
          '761b5dc9abb7f7faf82a85ee57d04b8676c95564b98d6f397834d3827f7e3537',
        after:
          'e6e0059bf8d416d195075be152f4118c792fb8b691936e604a5d71e91eb523b6',
      },
    };
    const pair = pairs[path];
    return pair?.before === before && pair.after === after;
  }
  // Ex10 round 123: preserve the raw native migration hash and add a separately verified
  // model-precision browser proof. Original records remain immutable; every later hash is exact.
  if (declaration === 'open-registration-replay-and-context-v1')
    return (
      path === 'scripts/continuous-store.ts' &&
      before ===
        '2862d3b9b0f49844c70999a360626a54d4a2cafc67219055a0dba9ae22a1ae7c' &&
      after ===
        '46448669fed33b25528ed2018a56863a5ba56e9b6eacf1d510a09556dcc1e8c2'
    );
  // Ex9 development-1 exposed missing operation cursors in replay at round 86.
  // This exact store revision only adds cursor-bearing segments and replay verification;
  // the original cursor-free parts remain retained and no live action/controller policy changes.
  if (declaration === 'experience-operation-replay-v1')
    return (
      path === 'scripts/continuous-store.ts' &&
      before ===
        'f679e28ffa9fb72c984e294196b2ee151f27e3150d2214cd3cdeb4557a3157df' &&
      after ===
        'e402f607f8cd5887c32456af5fa9f5d44e39d9a015b3853914a395dfe0bb49bd'
    );
  // Ex9 round 451 stopped before inference. This exact codec/controller repair preserves
  // every JSON fact and the existing byte cap, prompts, output schema and role budgets.
  if (declaration === 'experience-lossless-input-v1') {
    const pairs: Record<string, { before: string; after: string }> = {
      'apps/simulator/src/continuous-run.ts': {
        before:
          'cc71b865ce5699974db83db5a158571ac91ffd72881865d6da0a5654bd8d6762',
        after:
          '7d82ea3b0315838c3c63875094de8b16e3c46638f8e64082958fb0b007941024',
      },
      'apps/simulator/src/continuous-provider.ts': {
        before:
          '2d37fe465b009e307cf7a5aa8cbddb7f87ff9eacd97c51a568626ed5a6234d0e',
        after:
          '3f9c8fc0e07471770d8a8cc9d6b19f833a5339b784eda68e628525dd5be203c4',
      },
    };
    const pair = pairs[path];
    return pair?.before === before && pair.after === after;
  }
  // Ex9 round 458: preserve public optional-argument semantics in strict output transport.
  if (declaration === 'experience-optional-arguments-v1') {
    const pairs: Record<string, { before: string; after: string }> = {
      'apps/simulator/src/continuous-run.ts': {
        before:
          '7d82ea3b0315838c3c63875094de8b16e3c46638f8e64082958fb0b007941024',
        after:
          'a6829bedd90662ff6c212b0667cc84e94a3044cfc7a17aac4896a497980e7788',
      },
      'apps/simulator/src/continuous-provider.ts': {
        before:
          '3f9c8fc0e07471770d8a8cc9d6b19f833a5339b784eda68e628525dd5be203c4',
        after:
          '79f844d90af10d9674ddb385fe0d2a75d2819d37f18e07e7e19fd87141908951',
      },
    };
    const pair = pairs[path];
    return pair?.before === before && pair.after === after;
  }
  // Ex9 round 495: an unchanged already-mastered interface needs no duplicate learning.
  if (declaration === 'experience-operation-continuity-v1') {
    const pairs: Record<string, { before: string; after: string }> = {
      'apps/simulator/src/continuous-run.ts': {
        before:
          'a6829bedd90662ff6c212b0667cc84e94a3044cfc7a17aac4896a497980e7788',
        after:
          '135a3267a92be3c643b9b64688b154aa064141bade3d119b89741babfa407c89',
      },
      'scripts/continuous-source.ts': {
        before:
          'a9bf51774b44e4268c19f061c466b3c65fda6e50a2685435bb5459ac8d1a7eef',
        after:
          '4833b83c3358cf4674574be289677c78236a5019a37e217e492606969314c9bb',
      },
    };
    const pair = pairs[path];
    return pair?.before === before && pair.after === after;
  }
  const repair = repairs[path];
  return (
    declaration === 'forest-checkpoint-config-v1' &&
    repair?.before === before &&
    repair.after === after
  );
}
