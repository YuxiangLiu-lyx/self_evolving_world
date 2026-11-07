import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { requirePlanGrant, validateIdentity } from '../src/chatgpt-auth.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwks = {
  keys: [
    { ...publicKey.export({ format: 'jwk' }), kid: 'fixture', use: 'sig' },
  ],
};
const claims = {
  iss: 'https://auth.openai.com',
  aud: 'fixture-client',
  sub: 'fixture-subject',
  nonce: 'fixture-nonce',
  exp: 2000,
  nbf: 900,
};
function token(changes: object = {}, headerChanges: object = {}): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: 'fixture', ...headerChanges }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ ...claims, ...changes }),
  ).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}
const validate = (value: string) =>
  validateIdentity(value, jwks, 'fixture-client', 'fixture-nonce', 1000);

describe('ChatGPT OAuth identity acceptance', () => {
  it('accepts a valid signature and exact identity claims, including a singleton audience array', () => {
    expect(validate(token())).toBe('fixture-subject');
    expect(validate(token({ aud: ['fixture-client'] }))).toBe(
      'fixture-subject',
    );
  });
  it.each([
    { iss: 'https://untrusted.example' },
    { aud: 'other-client' },
    { nonce: 'old-nonce' },
    { exp: 999 },
    { nbf: 1001 },
    { aud: ['fixture-client', 'other-client'], azp: 'other-client' },
  ])('rejects invalid identity claims %j', (changes) => {
    expect(() => validate(token(changes))).toThrow('validation failed');
  });
  it('rejects changed signatures, unknown keys and algorithm changes', () => {
    const signed = token();
    const parts = signed.split('.');
    parts[1] = Buffer.from(
      JSON.stringify({ ...claims, sub: 'different' }),
    ).toString('base64url');
    expect(() => validate(parts.join('.'))).toThrow('signature');
    expect(() => validate(token({}, { kid: 'unknown' }))).toThrow(
      'signing key',
    );
    expect(() => validate(token({}, { alg: 'none' }))).toThrow('signature');
  });
  it('requires both direct plan usage and resource permission', () => {
    expect(() => requirePlanGrant(['openid', 'profile'])).toThrow('permission');
    expect(() => requirePlanGrant(['chatgpt.tokens.use.direct'])).toThrow(
      'permission',
    );
    expect(
      requirePlanGrant(['chatgpt.tokens.use.direct', 'resource.invoke']),
    ).toHaveLength(2);
  });
});
