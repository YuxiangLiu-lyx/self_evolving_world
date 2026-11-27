import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { taskRoute } from './harness.js';
import {
  archiveVersion,
  contentHash,
  fingerprint,
  experimentInput,
  inputFiles,
  protocolVersions,
  runtimeInput,
  toolchainInput,
} from './validation-inputs.js';

export interface CheckPlan {
  version: 1;
  base: string;
  audit: boolean;
  files: readonly string[];
  code: boolean;
  experiments: string[];
  browserGroups: string[];
  browserArchives: string[];
  reasons: Record<string, string>;
}
export const GROUP_FILES: Readonly<Record<string, readonly string[]>> = {
  classic: ['world.spec.ts', 'anomalies.spec.ts', 'experiment-browser.spec.ts'],
  survival: ['survival.spec.ts'],
  learning: ['learning.spec.ts'],
  evolution: ['evolution.spec.ts'],
  coevolution: ['coevolution.spec.ts'],
  continuous: ['continuous.spec.ts', 'ashen.spec.ts'],
  historical: ['continuous.spec.ts'],
};
const allGroups = Object.keys(GROUP_FILES);
/** Validation, delivery and read-only metric tooling. */
const TOOLING =
  /^scripts\/(validat|harness|check-|pr-policy|publish-pr|github|documentation|unit-reporter|experiment-review|long-metrics|long-compatibility|culture-metrics|culture-labels)/;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
/**
 * Whether a `package.json` change only adds, changes or removes `scripts` entries that run
 * read-only tooling (`tsx scripts/<tool>.ts`). Any other manifest change keeps conservative scope.
 */
export function toolingManifestChange(before: string, after: string): boolean {
  const parse = (text: string) => {
    try {
      return record(JSON.parse(text));
    } catch {
      return null;
    }
  };
  const a = parse(before);
  const b = parse(after);
  if (!a || !b) return false;
  const rest = (v: Record<string, unknown>) =>
    JSON.stringify({ ...v, scripts: undefined });
  const sa = record(a.scripts) ?? {};
  const sb = record(b.scripts) ?? {};
  const tool = (v: unknown) =>
    v === undefined ||
    (typeof v === 'string' &&
      TOOLING.test(/^tsx (scripts\/[\w-]+\.ts)$/.exec(v)?.[1] ?? ''));
  const changed = [...new Set([...Object.keys(sa), ...Object.keys(sb)])].filter(
    (k) => sa[k] !== sb[k],
  );
  return (
    rest(a) === rest(b) &&
    changed.length > 0 &&
    changed.every((k) => tool(sa[k]) && tool(sb[k]))
  );
}
/** Published story JSON is a viewer input; screenshots and prose remain evidence. */
export const presentationInput = (path: string): boolean =>
  /^docs\/presentation\/ex[1-9]\d*\/story\.json$/.test(path);
const groupFor = (v: number): string =>
  v < 3
    ? 'classic'
    : (['survival', 'learning', 'evolution', 'coevolution', 'continuous'][
        v - 3
      ] ?? 'continuous');
export function selectChecks(
  files: readonly string[],
  archives: Readonly<Record<string, number>>,
  base: string,
  audit = false,
  /** Changed files whose content diff is known to touch only tooling, such as `package.json`. */
  tooling: ReadonlySet<string> = new Set(),
): CheckPlan {
  const deep = new Set<string>(),
    groups = new Set<string>(),
    browser = new Set<string>(),
    reasons: Record<string, string> = {};
  let code = audit;
  const affect = (
    versions: readonly number[],
    reason: string,
    visual = true,
  ): void => {
    for (const [id, version] of Object.entries(archives))
      if (versions.includes(version)) {
        deep.add(id);
        reasons[`experiment:${id}`] = reason;
        if (visual) browser.add(id);
      }
    if (visual) for (const v of versions) groups.add(groupFor(v));
  };
  if (audit) {
    affect([1, 2, 3, 4, 5, 6, 7], 'Explicit full audit');
    groups.add('historical');
  }
  for (const file of files) {
    const archive = /^experiment\/(ex[1-9]\d*)\//.exec(file)?.[1];
    if (archive) {
      deep.add(archive);
      browser.add(archive);
      reasons[`experiment:${archive}`] = 'New or explicitly reused archive';
      continue;
    }
    if (presentationInput(file)) {
      groups.add('continuous');
      continue;
    }
    if (/\.md$|^docs\/|^experiment\/analyses\//.test(file)) continue;
    code = true;
    if (/\.(test|spec)\.ts$/.test(file)) {
      if (file.startsWith('apps/viewer/e2e/')) {
        const group = Object.entries(GROUP_FILES).find(([, names]) =>
          names.includes(file.split('/').at(-1) ?? ''),
        )?.[0];
        if (group) {
          groups.add(group);
          if (file.endsWith('/continuous.spec.ts')) groups.add('historical');
        } else allGroups.forEach((g) => groups.add(g));
      }
      continue;
    }
    if (file.startsWith('apps/viewer/')) {
      // Shared canvas/catalogue/import changes cover every protocol, with representative frames.
      const versions = /\/continuous-|\/observatory/.test(file)
        ? [6, 7]
        : [1, 2, 3, 4, 5, 6, 7];
      affect(versions, `Browser reference states for ${file}`);
      groups.add('historical');
      continue;
    }
    if (
      file.startsWith('packages/world-core/src/') ||
      file.startsWith('apps/simulator/src/')
    ) {
      affect(protocolVersions(file), `Runtime dependency: ${file}`);
      continue;
    }
    // Validation, delivery and read-only metric tooling needs code checks only; run
    // `pnpm validate:audit` when a tooling change alters reconstruction or scenes.
    if (TOOLING.test(file) || /^\.github\//.test(file) || tooling.has(file))
      continue;
    if (
      /^scripts\/(continuous|coevolution|evolution|learning|survival|synchronous|experiment)-/.test(
        file,
      )
    ) {
      affect(
        protocolVersions(file),
        `Archive validator or controller: ${file}`,
      );
      continue;
    }
    // Unclassified files, shared acceptance code and dependency changes fail toward wider coverage.
    affect([1, 2, 3, 4, 5, 6, 7], `Shared or unclassified dependency: ${file}`);
  }
  for (const group of groups)
    for (const [id, v] of Object.entries(archives))
      if (
        groupFor(v) === group ||
        (group === 'historical' && (v === 6 || v === 1))
      )
        browser.add(id);
  for (const id of browser) {
    deep.add(id);
    reasons[`experiment:${id}`] ??=
      'Reference states for selected browser compatibility checks';
  }
  reasons.code = code
    ? 'Code, test, dependency or acceptance-tool changes; unfiltered unit suite'
    : 'Not applicable: documentation/archive data only';
  reasons.browser = files.some(presentationInput)
    ? 'Published presentation metadata and affected browser/archive compatibility'
    : groups.size || browser.size
      ? 'Affected browser scenarios and archive load/state compatibility'
      : 'Not applicable: no viewer/runtime/archive impact';
  reasons.archives =
    'Batch compare every historical archive blob and actual file inventory with the base';
  return {
    version: 1,
    base,
    audit,
    files: [...files],
    code,
    experiments: [...deep].sort(),
    browserGroups: [...groups].sort(),
    browserArchives: [...browser].sort(),
    reasons,
  };
}
export function validationBase(root: string): string {
  if (process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'),
    ) as { pull_request?: { base: { sha: string } }; before?: string };
    if (event.pull_request) return event.pull_request.base.sha;
    if (event.before && !/^0+$/.test(event.before)) return event.before;
  }
  return execFileSync('git', ['rev-parse', 'origin/main'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}
export function makePlan(
  root: string,
  audit = false,
  base = validationBase(root),
): CheckPlan {
  const ids = [
    ...new Set(
      inputFiles(root).flatMap(
        (p) => /^experiment\/(ex[1-9]\d*)\/manifest\.json$/.exec(p)?.[1] ?? [],
      ),
    ),
  ];
  const files = taskRoute(root, base).files;
  const manifest = (): boolean => {
    try {
      return toolingManifestChange(
        execFileSync('git', ['show', `${base}:package.json`], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
        readFileSync(resolve(root, 'package.json'), 'utf8'),
      );
    } catch {
      return false;
    }
  };
  return selectChecks(
    files,
    Object.fromEntries(ids.map((id) => [id, archiveVersion(root, id)])),
    base,
    audit,
    new Set(
      files.includes('package.json') && manifest() ? ['package.json'] : [],
    ),
  );
}
export function browserSelection(): {
  groups: string[];
  archives: string[];
} | null {
  const value = process.env.WORLD_BROWSER_SELECTION;
  if (!value) return null;
  return JSON.parse(value) as { groups: string[]; archives: string[] };
}
export function browserInput(root: string, plan: CheckPlan): string {
  const versions = plan.browserArchives.map((id) => archiveVersion(root, id));
  return contentHash(
    JSON.stringify({
      groups: plan.browserGroups,
      archives: plan.browserArchives,
    }) +
      fingerprint(
        root,
        (p) =>
          toolchainInput(p) ||
          presentationInput(p) ||
          p.startsWith('apps/viewer/') ||
          p === 'playwright.config.ts' ||
          p === 'scripts/browser-reporter.ts' ||
          p.startsWith('scripts/validation-') ||
          p === 'scripts/experiments.ts' ||
          p === 'scripts/validation.ts' ||
          p === 'scripts/validate.ts' ||
          p === 'scripts/experiment-assets.ts' ||
          versions.some((v) => runtimeInput(p, v)) ||
          plan.browserArchives.some((id, index) =>
            experimentInput(p, id, versions[index] ?? 7),
          ) ||
          plan.browserArchives.some((id) => p.startsWith(`experiment/${id}/`)),
      ),
  );
}
export function selectedBrowserFiles(
  root: string,
  plan: Pick<CheckPlan, 'browserGroups' | 'browserArchives'>,
): string[] {
  const files = new Set(
    plan.browserGroups.flatMap((g) => GROUP_FILES[g] ?? []),
  );
  for (const id of plan.browserArchives)
    files.add(
      archiveVersion(root, id) === 7
        ? 'continuous.spec.ts'
        : 'experiments.spec.ts',
    );
  // Later protocol fixtures are discoverable without changing this planner's baseline.
  for (const file of [
    'forest.spec.ts',
    'collective.spec.ts',
    'collective-work.spec.ts',
    'collective-roots.spec.ts',
    'collective-bark.spec.ts',
    'collective-food-inspection.spec.ts',
    'collective-material-combine.spec.ts',
    'collective-root-surface.spec.ts',
    'collective-inventory.spec.ts',
    'collective-surface-diagnostics.spec.ts',
    'collective-small-drying.spec.ts',
    'collective-tray-clearance.spec.ts',
    'collective-tool-assessment.spec.ts',
  ])
    if (
      plan.browserGroups.includes('continuous') &&
      existsSync(resolve(root, 'apps/viewer/e2e', file))
    )
      files.add(file);
  return [...files];
}
