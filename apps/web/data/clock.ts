// The phone's clock corrected against the server's (step 3d, D59,
// ARCHITECTURE.md 3.5). When the same thing is changed on two phones, the
// change made last wins, by when each was made. A phone's own clock can be
// wrong, by an hour or a day, so every answer from the server carries the
// server's time, and the phone keeps the difference. Each change is stamped
// with the phone's time plus that difference, so a phone with the wrong time
// can't always win or always lose.
//
// The difference is kept in the phone's database with everything else, so
// signing out removes it too (D308). It holds no money data.

import type { PrePennyDb } from './db.ts';

/** Where the difference is kept, in the phone's own settings (the `device` table). */
export const CLOCK_KEY = 'server-clock';

export interface ServerClock {
  /** The server's time minus this phone's, in milliseconds. */
  readonly offsetMs: number;
  /** How long the answer took to come back: the difference is right to within half of it. */
  readonly roundTripMs: number;
}

/** An answer slower than this says too little about the server's time to use. */
const SLOWEST_USEFUL_MS = 10_000;

/** The difference this phone keeps, or null before it has heard from the server. */
export async function clockOn(db: PrePennyDb): Promise<ServerClock | null> {
  const value = (await db.device.get(CLOCK_KEY))?.value as Partial<ServerClock> | undefined;
  if (typeof value?.offsetMs !== 'number' || typeof value.roundTripMs !== 'number') return null;
  return { offsetMs: value.offsetMs, roundTripMs: value.roundTripMs };
}

/**
 * The difference from one answer: the server's time against the middle of
 * the time the question took. Null when it can't be used.
 */
export function clockFrom(
  serverTime: unknown,
  sentAtMs: number,
  receivedAtMs: number,
): ServerClock | null {
  if (typeof serverTime !== 'string') return null;
  const server = Date.parse(serverTime);
  const roundTripMs = receivedAtMs - sentAtMs;
  if (!Number.isFinite(server) || roundTripMs < 0 || roundTripMs > SLOWEST_USEFUL_MS) return null;
  return { offsetMs: Math.round(server - (sentAtMs + receivedAtMs) / 2), roundTripMs };
}

/** Keeps the difference from the latest answer, so a phone whose clock is put right is followed. */
export async function rememberClock(db: PrePennyDb, clock: ServerClock): Promise<void> {
  await db.device.put({ key: CLOCK_KEY, value: clock });
}

/** A time on this phone, corrected against the server's, as the engine writes times. */
export function correctedTime(phoneMs: number, clock: ServerClock | null): string {
  return new Date(phoneMs + (clock?.offsetMs ?? 0)).toISOString();
}
