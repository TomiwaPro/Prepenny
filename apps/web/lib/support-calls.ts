'use client';

// Asking the database's support steps (step 4j), shared by the support
// dashboard (lib/support-tools.ts, with its own sign-in) and the app's
// "Let support see my plan" (lib/support-access.ts, with the app's). The
// database decides everything; this only asks and reads the answer. Nothing
// here writes an email address, words or anything about money to the
// console or anywhere else (CLAUDE.md).

import type { SupabaseClient } from '@supabase/supabase-js';

/** Why a step didn't work, as a code the screens turn into words. */
export type ToolsProblem =
  | 'offline'
  | 'server'
  | 'not-allowed'
  | 'busy'
  | 'already'
  | 'waiting'
  | 'two-step-off'
  | 'no-backup'
  | 'is-you'
  | 'email-off'
  | 'no-address'
  | 'not-found'
  | 'no-access'
  | 'no-plan'
  | 'bad-email'
  | 'bad-reply';

const KNOWN: readonly ToolsProblem[] = [
  'not-allowed',
  'busy',
  'already',
  'waiting',
  'two-step-off',
  'no-backup',
  'is-you',
  'email-off',
  'no-address',
  'not-found',
  'no-access',
  'no-plan',
  'bad-email',
  'bad-reply',
];

export type Done<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: ToolsProblem };

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function problemOf(error: unknown): ToolsProblem {
  const message =
    error !== null && typeof error === 'object' ? (error as { message?: unknown }).message : null;
  if (typeof message === 'string') {
    const found = KNOWN.find((one) => one === message);
    if (found !== undefined) return found;
  }
  return offline() ? 'offline' : 'server';
}

/** Calls one of the database's steps with the client given, or none when signed out. */
export async function callWith<T>(
  client: () => Promise<SupabaseClient | null>,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Done<T>> {
  if (offline()) return { ok: false, problem: 'offline' };
  try {
    const made = await client();
    if (made === null) return { ok: false, problem: 'not-allowed' };
    const { data, error } = await made.rpc(name, args);
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: data as T };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

export const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
export const count = (value: unknown): number =>
  typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || 0 : 0;

export interface AccessState {
  readonly on: boolean;
  readonly endsAt: string | null;
  readonly lastLookedAt: string | null;
}

export function accessOf(raw: unknown): AccessState {
  const one = (raw ?? {}) as Record<string, unknown>;
  return {
    on: one.on === true,
    endsAt: text(one.ends_at),
    lastLookedAt: text(one.last_looked_at),
  };
}
