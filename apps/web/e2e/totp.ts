// The 6-digit code an authenticator app shows (RFC 6238, as Google
// Authenticator and the others work it out), from the key PrePenny shows
// when two-step sign-in is turned on (step 3e). For the tests only.

import { createHmac } from 'node:crypto';

function bytesOf(key: string): Buffer {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const letter of key.replace(/[\s=]/g, '').toUpperCase()) {
    bits += letters.indexOf(letter).toString(2).padStart(5, '0');
  }
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}

/** The code for `key` at a moment, in steps of 30 seconds. */
export function appCode(key: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hash = createHmac('sha1', bytesOf(key)).update(counter).digest();
  const offset = (hash[19] ?? 0) & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
