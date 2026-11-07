import { fileURLToPath } from 'node:url';
import { checkDocumentation } from './documentation.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const errors = checkDocumentation(root);
if (errors.length > 0) {
  process.stderr.write(
    `Documentation checks failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    'Documentation checks passed: required documents, local links and heading anchors.\n',
  );
}
