import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { requirePlanGrant } from './chatgpt-auth.js';
import { record, string } from './remote-data.js';

const pending = new Map<string, Promise<string>>();
/** Renew only the existing explicitly granted session, before inference; never retry a model call. */
export async function renewableAccessToken(
  options: {
    directory?: string;
    transport?: typeof fetch;
    now?: () => number;
  } = {},
): Promise<string> {
  const directory =
    options.directory ?? join(homedir(), '.config/self-evolving-world');
  const path = join(directory, 'chatgpt-session.json');
  const existing = pending.get(path);
  if (existing) return existing;
  const run = async (): Promise<string> => {
    const session = record(JSON.parse(await readFile(path, 'utf8')) as unknown);
    requirePlanGrant(session.scopes);
    const now = options.now ?? Date.now;
    if (
      typeof session.expiresAt === 'number' &&
      session.expiresAt > now() + 60_000
    )
      return string(session.accessToken, 'access token');
    if (!session.refreshToken)
      throw new Error(
        'Experiment session cannot renew. Run pnpm experiment:login.',
      );
    const response = await (options.transport ?? fetch)(
      'https://auth.openai.com/api/accounts/oauth/token',
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: string(session.clientId, 'issued client ID'),
          refresh_token: string(session.refreshToken, 'refresh token'),
          resource: 'https://api.openai.com/v1',
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `Session renewal failed with HTTP ${String(response.status)}; no model request was retried.`,
      );
    const tokens = record((await response.json()) as unknown);
    const scopes = requirePlanGrant(
      typeof tokens.scope === 'string'
        ? tokens.scope.split(/\s+/)
        : session.scopes,
    );
    if (
      tokens.token_type !== 'Bearer' ||
      typeof tokens.expires_in !== 'number' ||
      !Number.isFinite(tokens.expires_in) ||
      tokens.expires_in <= 0
    )
      throw new Error('Invalid renewed session lifetime or token type.');
    const token = string(tokens.access_token, 'renewed access token');
    const updated = {
      ...session,
      scopes,
      accessToken: token,
      refreshToken: string(tokens.refresh_token, 'replacement refresh token'),
      expiresAt: now() + tokens.expires_in * 1000,
    };
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(updated), {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, path);
    return token;
  };
  const operation = run();
  pending.set(path, operation);
  try {
    return await operation;
  } finally {
    pending.delete(path);
  }
}
