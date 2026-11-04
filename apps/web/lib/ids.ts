// New record ids, made on the phone so records can be made offline
// (ARCHITECTURE.md 3.3): UUID version 7, which starts with the time, so ids
// made later sort later. The engine can't make ids, so they come in with
// each command (D87).

const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));

/** A new UUID version 7. `now` and `random` are only for tests. */
export function newId(
  now: number = Date.now(),
  random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = random(new Uint8Array(16));
  let time = Math.floor(now);
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const h = hex(bytes);
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

/** The time now as the engine stores it, a UTC time such as "2026-10-30T09:14:05.123Z" (D33). */
export function timeNow(now: Date = new Date()): string {
  return now.toISOString();
}

let lastMoment = 0;

/**
 * The time now, always later than the last one this function gave, so
 * records made one after another in the same moment keep the order they
 * were made in, for the same-day order (D12, step 2e).
 */
export function timeInOrder(now: number = Date.now()): string {
  lastMoment = Math.max(now, lastMoment + 1);
  return new Date(lastMoment).toISOString();
}
