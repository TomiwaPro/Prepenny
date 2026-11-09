'use client';

// Keeping an account safe (brief 4.13, step 3e): two-step sign-in with an
// authenticator app (Supabase's own), the list of signed-in devices,
// changing the email address, and a backup email to get back in with.
//
// The database decides what each step may do (supabase/migrations, step
// 3e): this file only asks. Nothing here writes an email address, a code or
// anything about money to the console or anywhere else (CLAUDE.md).

import type { SupabaseClient } from '@supabase/supabase-js';
import { anyClient, signedInClient } from './account.ts';
import { signInConfig } from './sign-in-config.ts';
import { appVersion } from './version.ts';

/** Why something didn't work, as a code the screens turn into words. */
export type SecurityProblem =
  | 'offline'
  | 'server'
  /** The 6 numbers don't match: a wrong code, or one used already. */
  | 'code-wrong'
  | 'code-ran-out'
  /** The second step is needed first, or again, as for signing out everywhere. */
  | 'second-step-needed'
  | 'bad-email'
  | 'same-as-sign-in'
  | 'in-use'
  | 'too-many'
  | 'email-off'
  | 'not-found';

export type Done<T = true> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: SecurityProblem; readonly wait?: number };

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** A refusal from Supabase or from PrePenny's database, as a problem. */
function problemOf(error: unknown): SecurityProblem {
  if (error === null || typeof error !== 'object') return offline() ? 'offline' : 'server';
  const { code, message, name, status } = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
    status?: unknown;
  };
  if (name === 'AuthRetryableFetchError' || status === 0) return offline() ? 'offline' : 'server';
  if (typeof message === 'string') {
    for (const known of [
      'second-step-needed',
      'bad-email',
      'same-as-sign-in',
      'in-use',
      'too-many',
      'email-off',
      'not-found',
    ] as const) {
      if (message === known) return known;
    }
  }
  switch (code) {
    case 'insufficient_aal':
      return 'second-step-needed';
    case 'mfa_verification_failed':
    case 'mfa_challenge_expired':
    case 'otp_expired':
    case 'invalid_credentials':
      return 'code-wrong';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'bad-email';
    case 'email_exists':
    case 'email_address_not_authorized':
      return 'in-use';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'too-many';
    default:
      return offline() ? 'offline' : 'server';
  }
}

async function client(): Promise<SupabaseClient | null> {
  return signedInClient();
}

/** Calls one of PrePenny's own steps on the server. */
async function call<T>(
  name: string,
  args: Record<string, unknown> = {},
  signedOut = false,
): Promise<Done<T>> {
  try {
    const made = signedOut ? await anyClient() : await client();
    if (made === null) return { ok: false, problem: 'server' };
    const { data, error } = await made.rpc(name, args);
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: data as T };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

// ---------------------------------------------------------------------------
// Two-step sign-in.

export interface TwoStep {
  /** On: an authenticator app is set up, and its codes are asked for at sign-in. */
  readonly on: boolean;
  /** This sign-in has passed the second step. */
  readonly passed: boolean;
}

/** Whether two-step sign-in is on, and whether this sign-in has passed it. */
export async function twoStep(): Promise<Done<TwoStep>> {
  try {
    const made = await client();
    if (made === null) return { ok: false, problem: 'server' };
    const { data, error } = await made.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return {
      ok: true,
      value: { on: data.nextLevel === 'aal2', passed: data.currentLevel === 'aal2' },
    };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/** The authenticator app's factor, once it's set up. */
async function factorId(made: SupabaseClient): Promise<string | null> {
  const { data, error } = await made.auth.mfa.listFactors();
  if (error !== null) throw error;
  return data.totp.find((one) => one.status === 'verified')?.id ?? null;
}

/**
 * Checks a code from the authenticator app, for signing in or for doing
 * something that needs the second step just now (signing out everywhere,
 * changing the email address, turning two-step sign-in off).
 */
export async function passSecondStep(code: string): Promise<Done> {
  try {
    const made = await client();
    if (made === null) return { ok: false, problem: 'server' };
    const id = await factorId(made);
    if (id === null) return { ok: true, value: true };
    const { error } = await made.auth.mfa.challengeAndVerify({ factorId: id, code });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

export interface NewAuthenticator {
  readonly factorId: string;
  /** The picture to scan, as Supabase draws it. */
  readonly qrCode: string;
  /** The key to type into the app by hand, in groups of 4. */
  readonly key: string;
  /** The address an authenticator app on this phone opens. */
  readonly link: string;
}

/**
 * Starts setting up an authenticator app: the picture to scan, the key to
 * type and the link to open. Nothing changes until its first code is typed.
 */
export async function startTwoStep(): Promise<Done<NewAuthenticator>> {
  try {
    const made = await client();
    if (made === null) return { ok: false, problem: 'server' };
    // A setup started before and never finished is cleared first.
    const { data: factors } = await made.auth.mfa.listFactors();
    for (const old of factors?.all ?? []) {
      if (old.status !== 'verified') await made.auth.mfa.unenroll({ factorId: old.id });
    }
    const { data, error } = await made.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'PrePenny',
      issuer: 'PrePenny',
    });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return {
      ok: true,
      value: {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        key: data.totp.secret.replace(/(.{4})/g, '$1 ').trim(),
        link: data.totp.uri,
      },
    };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/**
 * Turns two-step sign-in on with the authenticator app's first code. Supabase
 * signs every other device out as it does: each needs the second step to
 * sign in again.
 */
export async function finishTwoStep(id: string, code: string): Promise<Done> {
  try {
    const made = await client();
    if (made === null) return { ok: false, problem: 'server' };
    const { error } = await made.auth.mfa.challengeAndVerify({ factorId: id, code });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/**
 * Turns two-step sign-in off, once a code from the authenticator app has
 * been typed just now (passSecondStep, in the sheet that asks for it).
 */
export async function turnOffTwoStep(): Promise<Done> {
  try {
    const made = await client();
    if (made === null) return { ok: false, problem: 'server' };
    const id = await factorId(made);
    if (id === null) return { ok: true, value: true };
    const { error } = await made.auth.mfa.unenroll({ factorId: id });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    // The sign-in is renewed, so it no longer says the second step is needed.
    await made.auth.refreshSession();
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

// ---------------------------------------------------------------------------
// Signed-in devices.

export interface Device {
  readonly id: string;
  /** A code for the kind of browser: "chrome", "safari", "firefox", "edge", "samsung", "opera" or "". */
  readonly browser: string;
  /** A code for the kind of device: "iphone", "android-phone", "mac" and so on, or "". */
  readonly device: string;
  readonly thisOne: boolean;
  /** When it was last used, a UTC time. */
  readonly lastUsedAt: string;
}

/** The person's own signed-in devices, this one first, and the server's time. */
export async function myDevices(): Promise<Done<{ devices: Device[]; now: string }>> {
  const answer = await call<{
    devices: { id: string; browser: string; device: string; this: boolean; last_used_at: string }[];
    now: string;
  }>('my_devices');
  if (!answer.ok) return answer;
  return {
    ok: true,
    value: {
      now: answer.value.now,
      devices: answer.value.devices.map((one) => ({
        id: one.id,
        browser: one.browser,
        device: one.device,
        thisOne: one.this,
        lastUsedAt: one.last_used_at,
      })),
    },
  };
}

/** "Sign out of this device", for another of the person's devices. */
export function endDevice(id: string): Promise<Done<unknown>> {
  return call('end_device', { device: id });
}

/** "Sign out everywhere": every device of the person's, this one included. */
export function endEveryDevice(): Promise<Done<unknown>> {
  return call('end_every_device');
}

// ---------------------------------------------------------------------------
// Changing the email address: a code to each address, both typed in.

/** The email address this phone is signed in with. */
export async function signInEmail(): Promise<string | null> {
  try {
    const made = await client();
    const { data } = (await made?.auth.getUser()) ?? { data: { user: null } };
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Asks to change the email address: Supabase emails a code to the current address and another to the new one. */
export async function startEmailChange(newEmail: string): Promise<Done> {
  try {
    const made = await client();
    if (made === null) return { ok: false, problem: 'server' };
    const { error } = await made.auth.updateUser({ email: newEmail });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/**
 * Finishes changing the email address with the two codes. They're checked on
 * a connection of their own that keeps nothing, because Supabase starts a
 * new sign-in once both are typed: that one is ended straight away, so this
 * phone keeps its own, second step and all, and no extra device appears in
 * the list. This phone's sign-in is then renewed with the new address in it.
 */
export async function finishEmailChange(
  current: { readonly email: string; readonly code: string },
  next: { readonly email: string; readonly code: string },
): Promise<Done> {
  const config = signInConfig();
  if (config === null) return { ok: false, problem: 'server' };
  const kept = new Map<string, string>();
  // Loaded only now, as everywhere else Supabase's code is (D309).
  const { createClient } = await import('@supabase/supabase-js');
  const checker = createClient(config.url, config.key, {
    global: { headers: { 'x-prepenny-version': appVersion().database } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `prepenny-email-change-${Date.now()}`,
      storage: {
        getItem: (key) => kept.get(key) ?? null,
        setItem: (key, value) => {
          kept.set(key, value);
        },
        removeItem: (key) => {
          kept.delete(key);
        },
      },
    },
  });
  try {
    const first = await checker.auth.verifyOtp({
      email: current.email,
      token: current.code,
      type: 'email_change',
    });
    if (first.error !== null) return { ok: false, problem: problemOf(first.error) };
    const second = await checker.auth.verifyOtp({
      email: next.email,
      token: next.code,
      type: 'email_change',
    });
    if (second.error !== null) return { ok: false, problem: problemOf(second.error) };
    if (second.data.session !== null) await checker.auth.signOut({ scope: 'local' });
    const made = await client();
    await made?.auth.refreshSession();
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

// ---------------------------------------------------------------------------
// The backup email.

/** The person's backup email, or null when there's none. */
export async function backupEmail(): Promise<Done<string | null>> {
  const answer = await call<{ email: string } | null>('backup_email');
  if (!answer.ok) return answer;
  return { ok: true, value: answer.value?.email ?? null };
}

/** Sends a code to an address to make it the backup email. `wait` is the seconds until a new one can be asked for. */
export async function addBackupEmail(email: string): Promise<Done> {
  const answer = await call<{ sent: boolean; wait?: number }>('add_backup_email', { email });
  if (!answer.ok) return answer;
  if (!answer.value.sent) return { ok: false, problem: 'too-many', wait: answer.value.wait ?? 60 };
  return { ok: true, value: true };
}

/** Adds the backup email once its code is typed in. */
export async function confirmBackupEmail(email: string, code: string): Promise<Done> {
  const answer = await call<{ added: boolean; problem?: string }>('confirm_backup_email', {
    email,
    code,
  });
  if (!answer.ok) return answer;
  if (!answer.value.added) {
    return {
      ok: false,
      problem: answer.value.problem === 'ran-out' ? 'code-ran-out' : 'code-wrong',
    };
  }
  return { ok: true, value: true };
}

export function removeBackupEmail(): Promise<Done<unknown>> {
  return call('remove_backup_email');
}

// ---------------------------------------------------------------------------
// Getting back in with the backup email, signed out.

/** Asks for a code at a backup email. The answer is the same whether or not it's anyone's backup. */
export function sendGetInCode(email: string): Promise<Done<unknown>> {
  return call('send_get_in_code', { email }, true);
}

/** Uses the code: the backup becomes the address the account signs in with. */
export async function getInWithCode(email: string, code: string): Promise<Done> {
  const answer = await call<{ in: boolean }>('use_get_in_code', { email, code }, true);
  if (!answer.ok) return answer;
  if (!answer.value.in) return { ok: false, problem: 'code-wrong' };
  return { ok: true, value: true };
}
