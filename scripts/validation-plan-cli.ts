import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { makePlan } from './validation-plan.js';
const plan = makePlan(process.cwd(), process.argv.includes('--audit'));
mkdirSync('validation-results', { recursive: true });
writeFileSync(
  'validation-results/plan.json',
  JSON.stringify(plan, null, 2) + '\n',
);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `browser=${String(plan.browserArchives.length > 0 || plan.browserGroups.length > 0)}\n`,
  );
console.log(JSON.stringify(plan, null, 2));
