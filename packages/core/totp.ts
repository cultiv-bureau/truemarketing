import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { assert, safeEqual } from './domain.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encodeBase32(bytes: Buffer) {
  let value = 0,
    bits = 0,
    result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decodeBase32(secret: string) {
  let value = 0,
    bits = 0;
  const result: number[] = [];
  for (const letter of secret.toUpperCase().replace(/[=\s]/g, '')) {
    const n = alphabet.indexOf(letter);
    assert(n >= 0, 'Invalid authenticator secret.');
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      result.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(result);
}
export const newTotpSecret = () => encodeBase32(randomBytes(20));
export function totpCode(secret: string, step = Math.floor(Date.now() / 30000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function verifyTotp(secret: string, code: string, lastStep = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1])
    if (step > lastStep && safeEqual(totpCode(secret, step), code)) return step;
  return null;
}
export class AuthVault {
  key: Buffer;
  constructor(path: string) {
    if (process.env.TOKEN_ENCRYPTION_KEY) {
      this.key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'base64');
      assert(this.key.length === 32, 'TOKEN_ENCRYPTION_KEY must contain 32 base64-encoded bytes.', 500);
      return;
    }
    assert(process.env.NODE_ENV !== 'production', 'TOKEN_ENCRYPTION_KEY is required in production.', 500);
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' });
    this.key = readFileSync(path);
    assert(this.key.length === 32, 'Invalid local authentication key.', 500);
  }
  encrypt(value: string) {
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [nonce, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
  }
  decrypt(value: string) {
    const [nonce, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64url'));
    const cipher = createDecipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
  }
}
