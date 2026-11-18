// Sealing a reminder for one phone, and signing PrePenny's request to its
// push service (step 4e, D563, D564). Only PrePenny's server uses this
// (supabase/functions/reminders); the app never does.
//
// - The reminder is encrypted for that phone alone, by the Web Push
//   standard's message encryption (RFC 8291, with RFC 8188's aes128gcm):
//   a key worked out from the phone's own public key and a new key of the
//   server's for each message, so Apple's, Google's and Mozilla's push
//   services carry it without being able to read it.
// - Every reminder is padded to the same size, so its size says nothing
//   about the words or amounts inside.
// - PrePenny signs each request with its own key (VAPID, RFC 8292), so a
//   push service knows it's PrePenny and takes messages for PrePenny's
//   phones from nobody else.
//
// Only the browser's own WebCrypto, which Deno and Node have too: no
// building block from anyone else. Pure but for the random numbers WebCrypto
// makes: the time is passed in. Nothing here is ever logged.

/** How big every sealed reminder's words are, padding included, in bytes. */
export const PADDED_SIZE = 2048;

/** The record size written in the header: one record holds the whole message (RFC 8188). */
const RECORD_SIZE = 4096;

/** The contact a push service can use about PrePenny's messages (RFC 8292): PrePenny's own address. */
export const PUSH_CONTACT = 'mailto:hello@prepenny.co.uk';

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new RangeError('Not base64url.');
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function join(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
  const imported = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data));
}

/** HKDF with one block of output (RFC 5869), as RFC 8291 uses it. */
async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
) {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, join(info, new Uint8Array([1])))).slice(0, length);
}

/** A phone's push address and its keys, as its browser gave them (PushSubscription). */
export interface PushTarget {
  readonly endpoint: string;
  /** The phone's public key, 65 bytes, base64url. */
  readonly p256dh: string;
  /** The phone's secret, 16 bytes, base64url. */
  readonly auth: string;
}

export interface SealOptions {
  /** For the standard's own test only: the salt and the server's key for this message. */
  readonly salt?: Uint8Array<ArrayBuffer>;
  readonly serverKeys?: CryptoKeyPair;
  /** For the standard's own test only: no padding. */
  readonly padTo?: number;
}

/**
 * Seals `words` for one phone (RFC 8291): the body of the request to its
 * push service, with Content-Encoding aes128gcm. Every message is padded
 * to PADDED_SIZE bytes before it's encrypted.
 */
export async function sealForPhone(
  words: string,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  options: SealOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const phoneKey = fromBase64url(target.p256dh);
  const secret = fromBase64url(target.auth);
  if (phoneKey.length !== 65 || phoneKey[0] !== 4 || secret.length !== 16) {
    throw new RangeError('Not a push key.');
  }
  const plaintext = encoder.encode(words);
  const padTo = options.padTo ?? PADDED_SIZE;
  if (plaintext.length + 1 > padTo || padTo + 16 > RECORD_SIZE) {
    throw new RangeError('Too long for one message.');
  }
  const serverKeys =
    options.serverKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeys.publicKey));
  const phonePublic = await crypto.subtle.importKey(
    'raw',
    phoneKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: phonePublic },
      serverKeys.privateKey,
      256,
    ),
  );
  const keyInfo = join(encoder.encode('WebPush: info\0'), phoneKey, serverPublic);
  const ikm = await hkdf(secret, shared, keyInfo, 32);
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
  // One record, the last: the words, then 2, then zeros to the padded size (RFC 8188).
  const record = new Uint8Array(padTo);
  record.set(plaintext);
  record[plaintext.length] = 2;
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record),
  );
  const header = new Uint8Array(16 + 4 + 1 + serverPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = serverPublic.length;
  header.set(serverPublic, 21);
  return join(header, sealed);
}

/**
 * Opens a sealed message with the phone's own keys: what the phone's browser
 * does, for the tests (RFC 8291), and the end-to-end tests' stand-in push
 * service, which plays the phone.
 */
export async function openOnPhone(
  body: Uint8Array<ArrayBuffer>,
  phone: { readonly keys: CryptoKeyPair; readonly auth: string },
): Promise<string> {
  const salt = body.slice(0, 16);
  const idLength = body[20] ?? 0;
  const serverPublic = body.slice(21, 21 + idLength);
  const sealed = body.slice(21 + idLength);
  const phoneKey = new Uint8Array(await crypto.subtle.exportKey('raw', phone.keys.publicKey));
  const serverKey = await crypto.subtle.importKey(
    'raw',
    serverPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, phone.keys.privateKey, 256),
  );
  const keyInfo = join(encoder.encode('WebPush: info\0'), phoneKey, serverPublic);
  const ikm = await hkdf(fromBase64url(phone.auth), shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const record = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, sealed),
  );
  let end = record.length - 1;
  while (end >= 0 && record[end] === 0) end -= 1;
  if (record[end] !== 2) throw new RangeError('Not a last record.');
  return new TextDecoder().decode(record.slice(0, end));
}

/** PrePenny's own signing key (VAPID, RFC 8292): made once on the server, kept in Supabase's Vault. */
export interface SigningKey {
  /** The public half, 65 bytes, base64url: what each phone's browser is given. */
  readonly publicKey: string;
  /** The private half, as a JSON Web Key. Never leaves the server. */
  readonly privateJwk: JsonWebKey;
}

export async function makeSigningKey(): Promise<SigningKey> {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const publicKey = base64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
  const privateJwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
  return { publicKey, privateJwk };
}

/**
 * The Authorization header for one request to a push service (RFC 8292): a
 * token for that service's address, signed with PrePenny's key, lasting 12
 * hours at most, with PrePenny's contact address. Nothing else about the
 * person or the reminder.
 */
export async function signedFor(
  endpoint: string,
  key: SigningKey,
  nowSeconds: number,
): Promise<string> {
  return withSignature(await signatureFor(endpoint, key, nowSeconds), key);
}

/** The Authorization header for a signature made before: Apple asks for one an hour at most. */
export const withSignature = (token: string, key: SigningKey) =>
  `vapid t=${token}, k=${key.publicKey}`;

/** The signature itself (a JSON Web Token) for one push service's address. */
export async function signatureFor(
  endpoint: string,
  key: SigningKey,
  nowSeconds: number,
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const part = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: audience,
    exp: Math.floor(nowSeconds) + 12 * 60 * 60,
    sub: PUSH_CONTACT,
  })}`;
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    key.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      encoder.encode(unsigned),
    ),
  );
  return `${unsigned}.${base64url(signature)}`;
}
