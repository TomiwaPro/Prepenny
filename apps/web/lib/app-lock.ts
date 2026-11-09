'use client';

// The optional app lock, "Open with your PIN" (brief 4.13, D35, step 3e).
//
// - Asked for when PrePenny opens, and when it comes back after 5 minutes
//   or more away. While it's away with the lock on, the plan is covered, so
//   the phone's picture of it in the app switcher shows nothing of it; the
//   phone may still keep an older picture (ARCHITECTURE.md 7), which the App
//   lock screen says.
// - The PIN is kept on this phone only, scrambled (PBKDF2 with SHA-256 and a
//   salt of its own, from the browser's own crypto), so it can't be read
//   back: ARCHITECTURE.md 3.8. Whether the lock is on is kept in the
//   browser's small store too, so it shows before anything else on opening.
// - Signing out removes it with everything else (D308).
// - 5 wrong tries in a row make it wait 30 seconds, then 30 more for each
//   wrong try after that.
//
// Never written to the console, never sent anywhere.

import { useSyncExternalStore } from 'react';
import { openDb } from '../data/db.ts';
import { updatedWithin } from './update.ts';

/** In the browser's small store: "1" while the lock is on. No secret in it. */
const ON_KEY = 'prepenny-app-lock';
/** Wrong tries in a row and when the next try is allowed, also no secret. */
const TRIES_KEY = 'prepenny-app-lock-tries';
/** For this tab: when the PIN was last typed, so an update that reloads the page straight after doesn't ask again. */
const OPENED_KEY = 'prepenny-app-lock-opened';
/** In the phone's database (the `device` table): the scrambled PIN. */
const PIN_KEY = 'app-lock';

/** Asked for again after this long away. */
export const AWAY_MS = 5 * 60 * 1000;
const ITERATIONS = 310_000;
const TRIES_BEFORE_WAITING = 5;
const WAIT_MS = 30_000;

export const PIN = /^\d{4,8}$/;

interface Scrambled {
  readonly salt: string;
  readonly hash: string;
  readonly iterations: number;
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesOf(text: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1)
    out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function scramble(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return hex(bits);
}

/** True when the app lock is on for this phone. */
export function lockOn(): boolean {
  try {
    return localStorage.getItem(ON_KEY) === '1';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Whether PrePenny is locked now, or covered while away.

export type LockState = 'open' | 'locked' | 'covered';

let state: LockState | null = null;
const listeners = new Set<() => void>();
let hiddenAt: number | null = null;
let watching = false;

function setState(next: LockState) {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

/** Locked when PrePenny opens with the lock on, unless the PIN was typed just before an update loaded the page afresh. */
function firstState(): LockState {
  if (!lockOn()) return 'open';
  try {
    const opened = Number(sessionStorage.getItem(OPENED_KEY));
    if (updatedWithin(10_000) && Number.isFinite(opened) && Date.now() - opened < AWAY_MS) {
      return 'open';
    }
  } catch {
    // Asked for, as on any opening.
  }
  return 'locked';
}

function watch() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  document.addEventListener('visibilitychange', () => {
    if (!lockOn()) return;
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      // Covered at once, so the phone's picture of the app shows nothing of the plan.
      if (state === 'open') setState('covered');
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (state === 'locked') return;
    setState(away >= AWAY_MS ? 'locked' : 'open');
  });
}

function current(): LockState {
  state ??= firstState();
  return state;
}

/** Open, locked, or covered while away, kept up to date. */
export function useLockState(): LockState {
  return useSyncExternalStore(
    (listener) => {
      watch();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current,
    () => 'open',
  );
}

// ---------------------------------------------------------------------------
// Tries.

interface Tries {
  readonly wrong: number;
  readonly until: number;
}

function triesNow(): Tries {
  try {
    const value = JSON.parse(localStorage.getItem(TRIES_KEY) ?? 'null') as Partial<Tries> | null;
    return { wrong: Number(value?.wrong) || 0, until: Number(value?.until) || 0 };
  } catch {
    return { wrong: 0, until: 0 };
  }
}

function keepTries(tries: Tries) {
  try {
    if (tries.wrong === 0) localStorage.removeItem(TRIES_KEY);
    else localStorage.setItem(TRIES_KEY, JSON.stringify(tries));
  } catch {
    // Counted for this page only.
  }
}

/** Seconds until the PIN can be tried again, or 0. */
export function secondsToWait(now = Date.now()): number {
  return Math.max(0, Math.ceil((triesNow().until - now) / 1000));
}

// ---------------------------------------------------------------------------
// The PIN.

async function kept(): Promise<Scrambled | null> {
  const db = openDb();
  try {
    const value = (await db.device.get(PIN_KEY))?.value as Partial<Scrambled> | undefined;
    if (
      typeof value?.salt !== 'string' ||
      typeof value.hash !== 'string' ||
      typeof value.iterations !== 'number'
    ) {
      return null;
    }
    return { salt: value.salt, hash: value.hash, iterations: value.iterations };
  } finally {
    db.close();
  }
}

/** True when the PIN matches the one kept. Counts wrong tries. */
async function matches(pin: string): Promise<boolean> {
  const scrambled = await kept();
  if (scrambled === null) return false;
  return (await scramble(pin, bytesOf(scrambled.salt), scrambled.iterations)) === scrambled.hash;
}

/** Keeps a new PIN, scrambled, and turns the lock on. */
export async function turnOnLock(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await scramble(pin, salt, ITERATIONS);
  const db = openDb();
  try {
    await db.device.put({ key: PIN_KEY, value: { salt: hex(salt), hash, iterations: ITERATIONS } });
  } finally {
    db.close();
  }
  localStorage.setItem(ON_KEY, '1');
  keepTries({ wrong: 0, until: 0 });
  noteOpened();
  setState('open');
}

function noteOpened() {
  try {
    sessionStorage.setItem(OPENED_KEY, String(Date.now()));
  } catch {
    // Asked for again if an update loads the page afresh.
  }
}

export type PinCheck = 'right' | 'wrong' | { readonly wait: number };

/** Checks the PIN on the lock screen or in a setting, and opens PrePenny when it's right. */
export async function checkPin(pin: string): Promise<PinCheck> {
  const wait = secondsToWait();
  if (wait > 0) return { wait };
  if (await matches(pin)) {
    keepTries({ wrong: 0, until: 0 });
    noteOpened();
    setState('open');
    return 'right';
  }
  const wrong = triesNow().wrong + 1;
  const until =
    wrong >= TRIES_BEFORE_WAITING ? Date.now() + WAIT_MS * (wrong - TRIES_BEFORE_WAITING + 1) : 0;
  keepTries({ wrong, until });
  return until > 0 ? { wait: Math.ceil((until - Date.now()) / 1000) } : 'wrong';
}

/** Turns the lock off, with the PIN. */
export async function turnOffLock(pin: string): Promise<PinCheck> {
  const checked = await checkPin(pin);
  if (checked !== 'right') return checked;
  const db = openDb();
  try {
    await db.device.delete(PIN_KEY);
  } finally {
    db.close();
  }
  localStorage.removeItem(ON_KEY);
  keepTries({ wrong: 0, until: 0 });
  setState('open');
  return 'right';
}

/** Changes the PIN, with the one now. */
export async function changePin(now: string, next: string): Promise<PinCheck> {
  const checked = await checkPin(now);
  if (checked !== 'right') return checked;
  await turnOnLock(next);
  return 'right';
}
