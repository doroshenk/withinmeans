import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCognitoVerifier } from './auth.js';

const POOL = 'us-east-2_Example';
const CLIENT = 'exampleclient';
const ISS = `https://cognito-idp.us-east-2.amazonaws.com/${POOL}`;

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = {
  keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }],
};

const b64 = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url');

function token(claims: Record<string, unknown> = {}, key: typeof privateKey = privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64({
    sub: 'sub-1',
    iss: ISS,
    client_id: CLIENT,
    token_use: 'access',
    iat: now,
    exp: now + 600,
    ...claims,
  })}`;
  return `${body}.${createSign('RSA-SHA256').update(body).sign(key, 'base64url')}`;
}

const verifier = createCognitoVerifier({
  userPoolId: POOL,
  clientId: CLIENT,
  jwks: jwks as never,
});

describe('P0-09: Cognito token verifier', () => {
  it('accepts a valid access token and returns its sub', async () => {
    expect(await verifier.verify(token())).toEqual({ sub: 'sub-1' });
  });
  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    await expect(verifier.verify(token({ exp: past, iat: past - 600 }))).rejects.toThrow();
  });
  it('rejects a token for a different app client', async () => {
    await expect(verifier.verify(token({ client_id: 'someone-else' }))).rejects.toThrow();
  });
  it('rejects an ID token (only access tokens are accepted)', async () => {
    await expect(verifier.verify(token({ token_use: 'id' }))).rejects.toThrow();
  });
  it('rejects a token from another issuer', async () => {
    await expect(verifier.verify(token({ iss: 'https://evil.example/pool' }))).rejects.toThrow();
  });
  it('rejects a token signed with a different key', async () => {
    await expect(verifier.verify(token({}, other.privateKey))).rejects.toThrow();
  });
  it('rejects garbage', async () => {
    await expect(verifier.verify('not-a-jwt')).rejects.toThrow();
  });
});
