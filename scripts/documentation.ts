import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import GithubSlugger from 'github-slugger';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

export const REQUIRED_DOCUMENTS = [
  'README.md',
  'AGENTS.md',
  'agent.md',
  'ARCHITECTURE.md',
  'docs/PROJECT_OVERVIEW.md',
  'docs/WORLD_FOUNDATION.md',
  'docs/PRODUCT.md',
  'docs/DEVELOPMENT.md',
  'docs/PULL_REQUESTS.md',
  'docs/VALIDATION.md',
  'docs/DOCUMENTATION_POLICY.md',
  'docs/decisions/README.md',
  'docs/exec-plans/README.md',
  'docs/exec-plans/active/README.md',
  '.github/pull_request_template.md',
] as const;

const ignoredDirectories = new Set([
  'test-results',
  'playwright-report',
  'validation-results',
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.pnpm-store',
]);
const markdown = new MarkdownIt();
// Inspect every scheme without rendering HTML; unsupported schemes are diagnosed below.
markdown.validateLink = () => true;

interface MarkdownDocument {
  readonly anchors: ReadonlySet<string>;
  readonly links: readonly string[];
}

function readMarkdown(path: string): MarkdownDocument {
  const tokens = markdown.parse(readFileSync(path, 'utf8'), {});
  const slugger = new GithubSlugger();
  const anchors = new Set<string>();
  const links: string[] = [];

  const visit = (token: Token): void => {
    const url =
      token.type === 'link_open' ? token.attrGet('href') : token.attrGet('src');
    if (url !== null) links.push(url);
    token.children?.forEach(visit);
  };

  for (const [index, token] of tokens.entries()) {
    if (token.type === 'heading_open') {
      const heading = tokens[index + 1];
      const text =
        heading?.children?.map((child) => child.content).join('') ?? '';
      anchors.add(slugger.slug(text));
    }
    visit(token);
  }
  return { anchors, links };
}

function isOutside(root: string, path: string): boolean {
  const part = relative(root, path);
  return part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part);
}

function collectMarkdown(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
        return collectMarkdown(root, path);
      }
      return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    });
}

/** Offline structural checks only; reviewers still verify documentation semantics. */
export function checkDocumentation(rootDirectory: string): readonly string[] {
  const root = realpathSync(rootDirectory);
  const errors: string[] = [];
  const display = (path: string): string =>
    relative(root, path).split(sep).join('/');

  for (const document of REQUIRED_DOCUMENTS) {
    const path = resolve(root, document);
    if (!existsSync(path) || !statSync(path).isFile()) {
      errors.push(`${document}: required document is missing.`);
    } else if (isOutside(root, realpathSync(path))) {
      errors.push(
        `${document}: required document must stay inside the repository.`,
      );
    } else if (readFileSync(path, 'utf8').trim().length === 0) {
      errors.push(`${document}: required document is empty.`);
    }
  }

  for (const directory of [
    'docs/exec-plans/active',
    'docs/exec-plans/completed',
  ]) {
    const path = resolve(root, directory);
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      errors.push(`${directory}: required plan directory is missing.`);
    }
  }

  const paths = collectMarkdown(root);
  if (
    !paths.some((path) => /^docs\/decisions\/\d{4}-.+\.md$/.test(display(path)))
  ) {
    errors.push('docs/decisions: at least one numbered ADR is required.');
  }
  if (
    !paths.some((path) =>
      /^docs\/exec-plans\/(active|completed)\/pr-.+\.md$/.test(display(path)),
    )
  ) {
    errors.push('docs/exec-plans: at least one PR execution plan is required.');
  }

  const documents = new Map(paths.map((path) => [path, readMarkdown(path)]));
  for (const [source, document] of documents) {
    for (const link of document.links) {
      const fail = (reason: string): void => {
        errors.push(`${display(source)}: "${link}" ${reason}`);
      };
      if (/^(https?:|mailto:)/i.test(link)) continue;
      if (/^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith('/')) {
        fail('must be a repository-relative link or an http(s)/mailto URL.');
        continue;
      }
      const hashIndex = link.indexOf('#');
      const rawPath = hashIndex === -1 ? link : link.slice(0, hashIndex);
      let pathPart: string;
      let anchor: string;
      try {
        pathPart = decodeURIComponent(rawPath.split('?')[0] ?? '');
        anchor =
          hashIndex === -1 ? '' : decodeURIComponent(link.slice(hashIndex + 1));
      } catch {
        fail('has invalid URL encoding.');
        continue;
      }
      const target =
        pathPart === '' ? source : resolve(dirname(source), pathPart);
      if (isOutside(root, target)) {
        fail('escapes the repository.');
      } else if (!existsSync(target)) {
        fail('points to a missing local target.');
      } else if (isOutside(root, realpathSync(target))) {
        fail('resolves through a symlink outside the repository.');
      } else if (anchor !== '') {
        if (!statSync(target).isFile() || extname(target) !== '.md') {
          fail('has an anchor on a non-Markdown target; use a file link.');
          continue;
        }
        const targetDocument = documents.get(target) ?? readMarkdown(target);
        if (!targetDocument.anchors.has(anchor))
          fail(`has no matching heading anchor "${anchor}".`);
      }
    }
  }
  return errors;
}
