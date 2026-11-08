// Record ids for the rows a phone makes on the server that the engine has no
// id for (step 3c): a one-off change or a tick (found by its payment, D87),
// the plan's settings, an overtime's details, and a private link (D291,
// D303). Each is worked out from what it's for, the same on every phone, so
// two phones ticking the same payment name the same row: one tick per
// payment (D83), and a clash rather than two ticks (step 3d).
//
// The id is the first 16 bytes of a SHA-256 of what it's for, written as a
// UUID (version 8, "made by the app itself"). Nothing in it can be read
// back, and nobody can make another record land on the same id.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of some text, as bytes. Small and synchronous, for the background worker. */
export function sha256(text: string): Uint8Array {
  const data = new TextEncoder().encode(text);
  const length = data.length;
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  padded.set(data);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotate = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15] as number;
      const b = w[i - 2] as number;
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash as unknown as number[];
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotate(e as number, 6) ^ rotate(e as number, 11) ^ rotate(e as number, 25);
      const ch = ((e as number) & (f as number)) ^ (~(e as number) & (g as number));
      const t1 = ((h as number) + s1 + ch + (K[i] as number) + (w[i] as number)) >>> 0;
      const s0 = rotate(a as number, 2) ^ rotate(a as number, 13) ^ rotate(a as number, 22);
      const maj =
        ((a as number) & (b as number)) ^
        ((a as number) & (c as number)) ^
        ((b as number) & (c as number));
      const t2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = ((d as number) + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const worked = [a, b, c, d, e, f, g, h] as number[];
    for (let i = 0; i < 8; i += 1) hash[i] = ((hash[i] as number) + (worked[i] as number)) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, hash[i] as number);
  return out;
}

/** The id of a row worked out from what it's for: its plan, its kind and its parts. */
export function derivedId(planId: string, kind: string, ...parts: readonly string[]): string {
  const bytes = sha256(['prepenny', planId, kind, ...parts].join('|')).slice(0, 16);
  bytes[6] = 0x80 | ((bytes[6] as number) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] as number) & 0x3f);
  const h = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}
