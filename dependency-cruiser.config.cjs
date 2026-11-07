/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'viewer-uses-public-core-api',
      severity: 'error',
      from: { path: '^apps/viewer/src/' },
      to: {
        path: '^packages/world-core/',
        pathNot: '^packages/world-core/src/index\\.ts$',
      },
    },
    {
      name: 'viewer-dependency-allowlist',
      comment:
        'Browser code may only use its own files and the public core API; no Node or other apps.',
      severity: 'error',
      from: { path: '^apps/viewer/src/' },
      to: {
        pathNot: '^(apps/viewer/src/|packages/world-core/src/index\\.ts$)',
      },
    },
    {
      name: 'no-circular-dependencies',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-unresolved-imports',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'world-core-is-independent',
      comment:
        'world-core production code may only import its own source files.',
      severity: 'error',
      from: { path: '^packages/world-core/src/' },
      to: { pathNot: '^packages/world-core/src/' },
    },
    {
      name: 'simulator-uses-public-core-api',
      severity: 'error',
      from: { path: '^apps/simulator/src/' },
      to: {
        path: '^packages/world-core/',
        pathNot: '^packages/world-core/src/index\\.ts$',
      },
    },
    {
      name: 'simulator-dependency-allowlist',
      comment:
        'The simulator may use its own source, world-core public API and Node built-ins.',
      severity: 'error',
      from: { path: '^apps/simulator/src/' },
      to: {
        pathNot: '^(apps/simulator/src/|packages/world-core/src/index\\.ts$)',
        dependencyTypesNot: ['core'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
