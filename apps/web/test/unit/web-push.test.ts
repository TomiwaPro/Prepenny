// Sealing a reminder for one phone and signing PrePenny's request (step 4e,
// D563, D564): the encryption standard's own worked example, the padding,
// and the signature a push service checks.

import { describe, expect, it } from 'vitest';
import {
  base64url,
  fromBase64url,
  makeSigningKey,
  openOnPhone,
  PADDED_SIZE,
  PUSH_CONTACT,
  sealForPhone,
  signedFor,
} from '../../lib/web-push.ts';

/** A key pair from the raw private number and public point, as the standard prints them. */
async function keysFrom(privateKey: string, publicKey: string): Promise<CryptoKeyPair> {
  const point = fromBase64url(publicKey);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(point.slice(1, 33)),
    y: base64url(point.slice(33, 65)),
  };
  return {
    privateKey: await crypto.subtle.importKey(
      'jwk',
      { ...jwk, d: privateKey },
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    ),
    publicKey: await crypto.subtle.importKey(
      'raw',
      point,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    ),
  };
}

async function newPhone() {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const p256dh = base64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
  const auth = base64url(crypto.getRandomValues(new Uint8Array(16)));
  return { keys, p256dh, auth };
}

describe('sealed so only the phone can open it (RFC 8291)', () => {
  it("matches the standard's own worked example, byte for byte (RFC 8291, Appendix A)", async () => {
    const server = await keysFrom(
      'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
      'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    );
    const words = 'When I grow up, I want to be a watermelon';
    const body = await sealForPhone(
      words,
      {
        p256dh:
          'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
        auth: 'BTBZMqHH6r4Tts7J_aSIgg',
      },
      {
        salt: fromBase64url('DGv6ra1nlYgDCS1FRnbzlw'),
        serverKeys: server,
        padTo: new TextEncoder().encode(words).length + 1,
      },
    );
    expect(base64url(body)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
    // And the phone in the example opens it.
    const phone = await keysFrom(
      'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    );
    expect(await openOnPhone(body, { keys: phone, auth: 'BTBZMqHH6r4Tts7J_aSIgg' })).toBe(words);
  });

  it('every reminder is the same size, whatever its words', async () => {
    const phone = await newPhone();
    const short = await sealForPhone('{"body":"Payday: update your balance."}', phone);
    const long = await sealForPhone(
      `{"body":"${'Rent and 2 more go out tomorrow. '.repeat(20)}"}`,
      phone,
    );
    expect(short.length).toBe(long.length);
    // Header (16 + 4 + 1 + 65), the padded words, and the 16-byte check.
    expect(short.length).toBe(86 + PADDED_SIZE + 16);
    expect(await openOnPhone(short, phone)).toBe('{"body":"Payday: update your balance."}');
  });

  it('a new key and salt for every message, so the same words never look the same', async () => {
    const phone = await newPhone();
    const one = await sealForPhone('same', phone);
    const two = await sealForPhone('same', phone);
    expect(base64url(one)).not.toBe(base64url(two));
  });

  it("another phone's keys can't open it", async () => {
    const phone = await newPhone();
    const other = await newPhone();
    const body = await sealForPhone("You'll be £40.00 short on Sun 1 Nov.", phone);
    await expect(openOnPhone(body, { keys: other.keys, auth: phone.auth })).rejects.toThrow();
    await expect(openOnPhone(body, { keys: phone.keys, auth: other.auth })).rejects.toThrow();
  });

  it('refuses keys that are not a push key, and words too long for one message', async () => {
    const phone = await newPhone();
    await expect(sealForPhone('x', { p256dh: 'AAAA', auth: phone.auth })).rejects.toThrow(
      'Not a push key.',
    );
    await expect(sealForPhone('x'.repeat(PADDED_SIZE), phone)).rejects.toThrow(
      'Too long for one message.',
    );
  });
});

describe("PrePenny's signature (RFC 8292)", () => {
  it("a token for that push service only, lasting 12 hours, with PrePenny's own address", async () => {
    const key = await makeSigningKey();
    expect(fromBase64url(key.publicKey)).toHaveLength(65);
    const header = await signedFor(
      'https://fcm.googleapis.com/fcm/send/abc:def',
      key,
      1_794_000_000,
    );
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, publicKey] = match as unknown as string[];
    expect(publicKey).toBe(key.publicKey);
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(head as string)))).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    });
    expect(JSON.parse(new TextDecoder().decode(fromBase64url(claims as string)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_794_000_000 + 12 * 60 * 60,
      sub: PUSH_CONTACT,
    });
    expect(PUSH_CONTACT).toBe('mailto:hello@prepenny.co.uk');
    // The push service checks the signature with the public key.
    const verify = await crypto.subtle.importKey(
      'raw',
      fromBase64url(key.publicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    expect(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        verify,
        fromBase64url(signature as string),
        new TextEncoder().encode(`${head}.${claims}`),
      ),
    ).toBe(true);
  });
});
