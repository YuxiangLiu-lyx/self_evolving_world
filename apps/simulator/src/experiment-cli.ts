import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { accessToken } from './chatgpt-auth.js';
import { runOneRound } from './experiment.js';
import { responsesProvider, selectModel } from './responses.js';

try {
  const token = await accessToken();
  const model = await selectModel(token, process.env.SEW_MODEL);
  console.log(
    `Running one decision per agent with ${model}; three requests maximum, no retries.`,
  );
  const directory = join(
    'experiment-results',
    `round-${Date.now().toString()}`,
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const result = await runOneRound(
    responsesProvider(token, model, fetch, async (input, evidence) => {
      await writeFile(
        join(directory, `response-${input.observation.self.id}.json`),
        JSON.stringify({ source: 'live-http-response', ...evidence }, null, 2) +
          '\n',
        { flag: 'wx', mode: 0o600 },
      );
    }),
  );
  await writeFile(
    join(directory, 'decisions.json'),
    JSON.stringify(
      { source: 'live-chatgpt-oauth-responses', model, ...result },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  await writeFile(
    join(directory, 'replay.json'),
    JSON.stringify(result.replay, null, 2) + '\n',
    { flag: 'wx' },
  );
  console.log(JSON.stringify(result.decisions, null, 2));
  console.log(
    `Saved one round to ${directory}. No further decisions will run.`,
  );
  if (result.decisions.some((decision) => decision.status === 'failed'))
    process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Experiment failed.');
  process.exitCode = 1;
}
