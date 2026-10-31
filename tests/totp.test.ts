import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { AuthVault, encodeBase32, totpCode, verifyTotp } from '../dist/packages/core/totp.js';
test('authenticator codes match the RFC6238 SHA1 test vector and reject replay', () => {
  const secret = encodeBase32(Buffer.from('12345678901234567890'));
  assert.equal(totpCode(secret, 1), '287082');
  assert.equal(verifyTotp(secret, '287082', -1, 59000), 1);
  assert.equal(verifyTotp(secret, '287082', 1, 59000), null);
  assert.equal(verifyTotp(secret, 'abcdef', -1, 59000), null);
  assert.equal(verifyTotp(secret, '123456', -1, 59000), null);
});
test('authenticator secrets are encrypted, tamper-detected and readable across restarts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tm-auth-'));
  assert(resolve(directory).startsWith(resolve(tmpdir()) + sep));
  const keyFile = join(directory, 'auth-key.bin'),
    first = new AuthVault(keyFile),
    encrypted = first.encrypt('MY-PRIVATE-SECRET');
  assert(!encrypted.includes('PRIVATE'));
  assert.equal(new AuthVault(keyFile).decrypt(encrypted), 'MY-PRIVATE-SECRET');
  const parts = encrypted.split('.');
  parts[2] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => first.decrypt(parts.join('.')));
  rmSync(directory, { recursive: true });
});
