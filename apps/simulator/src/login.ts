import { login } from './chatgpt-auth.js';

try {
  await login();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Authorization failed.',
  );
  process.exitCode = 1;
}
