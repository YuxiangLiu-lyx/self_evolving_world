import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  verify,
} from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { record, responseJson, string } from './remote-data.js';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const DIRECT_SCOPE = 'chatgpt.tokens.use.direct';
const directory = () => join(homedir(), '.config', 'self-evolving-world');

async function saved(name: string): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = JSON.parse(
      await readFile(join(directory(), name), 'utf8'),
    );
    return record(value);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null;
    throw error;
  }
}

async function save(name: string, data: unknown): Promise<void> {
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const target = join(directory(), name);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
  await rename(temporary, target);
}

/** Only RS256 keys from the fixed OpenAI JWKS endpoint are accepted. */
export function validateIdentity(
  token: string,
  jwks: unknown,
  clientId: string,
  nonce: string,
  now: number,
): string {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid ID token.');
  const headerPart = string(parts[0], 'JWT header');
  const claimsPart = string(parts[1], 'JWT claims');
  const signature = string(parts[2], 'JWT signature');
  const header = record(
    JSON.parse(Buffer.from(headerPart, 'base64url').toString()) as unknown,
  );
  const claims = record(
    JSON.parse(Buffer.from(claimsPart, 'base64url').toString()) as unknown,
  );
  const keys = record(jwks).keys;
  if (
    header.alg !== 'RS256' ||
    header.crit !== undefined ||
    !Array.isArray(keys)
  )
    throw new Error('Unsupported ID token signature.');
  const key = keys
    .map((value: unknown) => record(value))
    .find((value) => value.kid === header.kid);
  if (!key || key.kty !== 'RSA' || (key.use !== undefined && key.use !== 'sig'))
    throw new Error('ID token signing key is unavailable.');
  const publicKey = createPublicKey({
    key: {
      kty: 'RSA',
      n: string(key.n, 'RSA modulus'),
      e: string(key.e, 'RSA exponent'),
    },
    format: 'jwk',
  });
  const audience = claims.aud;
  const validAudience =
    audience === clientId ||
    (Array.isArray(audience) &&
      audience.includes(clientId) &&
      (audience.length === 1 || claims.azp === clientId));
  const checks = {
    signature: verify(
      'RSA-SHA256',
      Buffer.from(`${headerPart}.${claimsPart}`),
      publicKey,
      Buffer.from(signature, 'base64url'),
    ),
    issuer: claims.iss === ISSUER,
    audience:
      validAudience && (claims.azp === undefined || claims.azp === clientId),
    nonce: claims.nonce === nonce,
    expiry:
      typeof claims.exp === 'number' &&
      Number.isFinite(claims.exp) &&
      claims.exp > now,
    notBefore:
      claims.nbf === undefined ||
      (typeof claims.nbf === 'number' &&
        Number.isFinite(claims.nbf) &&
        claims.nbf <= now),
  };
  const failed = Object.entries(checks)
    .filter(([, valid]) => !valid)
    .map(([name]) => name);
  if (failed.length)
    throw new Error(
      `ID token validation failed: ${failed.join(', ')}. No credential was accepted.`,
    );
  return string(claims.sub, 'verified subject');
}

export function requirePlanGrant(scopes: unknown): readonly string[] {
  if (
    !Array.isArray(scopes) ||
    !scopes.every((scope: unknown) => typeof scope === 'string') ||
    !scopes.includes(DIRECT_SCOPE) ||
    !scopes.includes('resource.invoke')
  )
    throw new Error(
      'ChatGPT plan permission was not granted. Run pnpm experiment:login and authorize plan usage.',
    );
  return scopes;
}

export async function accessToken(): Promise<string> {
  const session = await saved('chatgpt-session.json');
  if (!session)
    throw new Error(
      'No experiment authorization. Run pnpm experiment:login first.',
    );
  requirePlanGrant(session.scopes);
  if (
    typeof session.expiresAt !== 'number' ||
    session.expiresAt <= Date.now() + 60_000
  )
    throw new Error(
      'Experiment authorization expired. Run pnpm experiment:login again.',
    );
  return string(session.accessToken, 'access token');
}

export async function login(): Promise<void> {
  const previous = await saved('chatgpt-registration.json');
  const registration = {
    hostId: previous
      ? string(previous.hostId, 'host ID')
      : `urn:uuid:${randomUUID()}`,
    clientId:
      previous?.clientId === undefined
        ? undefined
        : string(previous.clientId, 'issued client ID'),
  };
  await save('chatgpt-registration.json', registration);
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  let resolveCallback: ((url: URL) => void) | undefined;
  let rejectCallback: ((error: Error) => void) | undefined;
  const pending = new Promise<URL>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (
      request.method !== 'GET' ||
      url.pathname !== '/auth/callback' ||
      url.searchParams.get('state') !== state
    ) {
      response.writeHead(400).end('Invalid authorization callback.');
      return;
    }
    response
      .writeHead(200, {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store',
      })
      .end(
        'Authorization received. Return to the terminal for the verification result.',
      );
    resolveCallback?.(url);
  });
  server.on('error', (error) => rejectCallback?.(error));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Loopback listener is unavailable.');
  const redirect = `http://127.0.0.1:${String(address.port)}/auth/callback`;
  const authorize = new URL(`${ISSUER}/api/accounts/authorize`);
  authorize.search = new URLSearchParams({
    client_id: registration.clientId ?? 'dynamic_agent_client',
    ...(registration.clientId
      ? {}
      : { agent_name_hint: 'Self-Evolving World' }),
    ext_agent_host_id: registration.hostId,
    response_type: 'code',
    redirect_uri: redirect,
    scope:
      'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString();
  const timeout = setTimeout(
    () =>
      rejectCallback?.(
        new Error(
          'Browser authorization timed out; no inference was requested.',
        ),
      ),
    600_000,
  );
  try {
    console.log(
      'Continue with ChatGPT in the browser. This authorizes the local three-agent experiment.',
    );
    console.log(authorize.toString());
    const opener = spawn(
      process.platform === 'darwin' ? 'open' : 'xdg-open',
      [authorize.toString()],
      { stdio: 'ignore' },
    );
    opener.on('error', () => {
      console.log('Open the authorization URL manually.');
    });
    const callback = await pending;
    if (callback.searchParams.has('error'))
      throw new Error(
        'ChatGPT authorization was declined or failed; no inference was requested.',
      );
    const clientId =
      callback.searchParams.get('client_id') ?? registration.clientId;
    if (
      !clientId ||
      clientId === 'dynamic_agent_client' ||
      (registration.clientId && registration.clientId !== clientId)
    )
      throw new Error('OAuth callback has an invalid issued client ID.');
    await save('chatgpt-registration.json', { ...registration, clientId });
    const response = await fetch(`${ISSUER}/api/accounts/oauth/token`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: string(callback.searchParams.get('code'), 'authorization code'),
        code_verifier: verifier,
        redirect_uri: redirect,
        resource: RESOURCE,
      }),
    });
    const tokens = record(await responseJson(response));
    const idToken = string(tokens.id_token, 'ID token');
    const jwks = await responseJson(
      await fetch(`${ISSUER}/.well-known/jwks.json`, {
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      }),
    );
    const subject = validateIdentity(
      idToken,
      jwks,
      clientId,
      nonce,
      Date.now() / 1000,
    );
    const active = await saved('chatgpt-session.json');
    if (active && (active.clientId !== clientId || active.subject !== subject))
      throw new Error(
        'The authorized identity differs from the selected experiment account.',
      );
    const scopes = requirePlanGrant(
      string(tokens.scope, 'granted scopes').split(/\s+/),
    );
    if (
      tokens.token_type !== 'Bearer' ||
      typeof tokens.expires_in !== 'number' ||
      !Number.isFinite(tokens.expires_in) ||
      tokens.expires_in <= 0
    )
      throw new Error('Invalid OAuth token lifetime or type.');
    await save('chatgpt-session.json', {
      clientId,
      subject,
      scopes,
      accessToken: string(tokens.access_token, 'access token'),
      idToken,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });
    console.log(
      'ChatGPT plan authorization verified and saved outside the repository. No inference has run.',
    );
  } finally {
    clearTimeout(timeout);
    server.close();
    server.closeAllConnections();
  }
}
