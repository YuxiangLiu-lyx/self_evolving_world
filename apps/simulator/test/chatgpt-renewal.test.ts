import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { renewableAccessToken } from '../src/chatgpt-renewal.js';

it('renews the existing grant once for concurrent callers and atomically saves rotated credentials outside archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'forest-session-'));
  const path = join(directory, 'chatgpt-session.json');
  const session = {
    clientId: 'issued-test-client',
    subject: 'verified-test-subject',
    idToken: 'verified-test-identity',
    scopes: ['openid', 'resource.invoke', 'chatgpt.tokens.use.direct'],
    accessToken: 'old-test-access',
    refreshToken: 'old-test-refresh',
    expiresAt: 500,
  };
  let calls = 0;
  const transport: typeof fetch = (url, options) => {
    calls++;
    expect(url).toBe('https://auth.openai.com/api/accounts/oauth/token');
    const body = options?.body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'refresh_token',
      client_id: session.clientId,
      refresh_token: session.refreshToken,
      resource: 'https://api.openai.com/v1',
    });
    return Promise.resolve(
      Response.json({
        access_token: 'new-test-access',
        refresh_token: 'new-test-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    );
  };
  try {
    await writeFile(path, JSON.stringify(session), { mode: 0o600 });
    const options = { directory, transport, now: () => 1000 };
    expect(
      await Promise.all([
        renewableAccessToken(options),
        renewableAccessToken(options),
      ]),
    ).toEqual(['new-test-access', 'new-test-access']);
    expect(await renewableAccessToken(options)).toBe('new-test-access');
    expect(calls).toBe(1);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      ...session,
      accessToken: 'new-test-access',
      refreshToken: 'new-test-refresh',
      expiresAt: 3601000,
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    for (const result of [
      Response.json({ secret: 'never-report' }, { status: 401 }),
      Response.json({
        access_token: 'bad-test-access',
        refresh_token: 'bad-test-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid',
      }),
    ]) {
      await expect(
        renewableAccessToken({
          directory,
          now: () => 4000000,
          transport: () => Promise.resolve(result),
        }),
      ).rejects.toThrow();
      expect(
        (JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>)
          .accessToken,
      ).toBe('new-test-access');
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
