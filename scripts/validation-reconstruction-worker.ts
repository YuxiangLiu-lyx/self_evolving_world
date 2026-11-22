import { reconstructionMetrics, validateExperiment } from './experiments.js';

const id = process.argv[2];
if (!id || process.argv.length !== 3 || !process.env.WORLD_VALIDATION_RUN)
  throw new Error(
    'A reconstruction worker requires one archive and a validation run.',
  );
validateExperiment(process.cwd(), id);
console.log(JSON.stringify(reconstructionMetrics().at(-1)));
