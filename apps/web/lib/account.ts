'use client';

// Signing up, signing in and signing out (brief 4.13, D19, D20, step 3b),
// with Supabase Auth.
//
// - A 6-digit code by email first, with the email's link as a backup (D20),
//   and "Continue with Google". Apple waits for Phase 6.
// - Supabase's code is loaded only on the sign-in page, or when this phone is
//   signed in already, so a phone that never signs in sends nothing anywhere.
// - Signed in, the phone stays signed in until the person signs out, or, once
//   Supabase's paid plan is on, 90 days without opening PrePenny (D19, D305).
//   Each time PrePenny opens, the sign-in is renewed in the background.
// - Nothing about money is sent: only the email address, the code, or
//   Google's answer. Nothing here writes an email address, a code or a
//   message to the console or anywhere else (CLAUDE.md, PLAN.md item 20).

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { claimOwnPlan, openDb } from '../data/db.ts';
import { forgetEverything } from '../data/forget.ts';
import { signInConfig } from './sign-in-config.ts';

/** Where Supabase keeps the sign-in on this phone, in the browser's small store. */
export const SIGN_IN_KEY = 'prepenny-sign-in';

/** Where the email address and the time the last code was sent are kept for this tab. */
const CODE_SENT_KEY = 'prepenny-code-sent';

/** How long a code lasts (supabase/config.toml, supabase/sign-in-settings.json). */
export const CODE_LASTS_MS = 10 * 60 * 1000;

export type Account =
  /** Signing in is switched off in this version of the app (README.md, "Signing in"). */
  | { readonly status: 'off' }
  | { readonly status: 'checking' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly id: string; readonly email: string };

/** Why something didn't work, for the words the person reads (strings.signIn). */
export type Problem =
  | { readonly kind: 'offline' }
  | { readonly kind: 'server' }
  | { readonly kind: 'off' }
  /** Asked for a new code too soon after the last one, for this email address. */
  | { readonly kind: 'wait'; readonly seconds: number }
  /** Supabase's limit on emails an hour, for everyone. */
  | { readonly kind: 'too-many-emails' }
  /** Too many sign-in tries from this phone's connection in a few minutes. */
  | { readonly kind: 'too-many-tries' }
  /** A code that's wrong, or that has run out: Supabase doesn't say which. */
  | { readonly kind: 'code-refused' }
  | { readonly kind: 'email-refused' }
  | { readonly kind: 'google-cancelled' }
  | { readonly kind: 'someone-elses-plan' };

export type Outcome = { readonly ok: true } | { readonly ok: false; readonly problem: Problem };

// ---------------------------------------------------------------------------
// Who's signed in, for every screen that shows it.

function firstAccount(): Account {
  if (signInConfig() === null) return { status: 'off' };
  return hasStoredSignIn() ? { status: 'checking' } : { status: 'signed-out' };
}

let account: Account | null = null;
const listeners = new Set<() => void>();

function setAccount(next: Account) {
  const now = account;
  if (
    now !== null &&
    now.status === next.status &&
    (now.status !== 'signed-in' || (next.status === 'signed-in' && now.id === next.id))
  ) {
    return;
  }
  account = next;
  for (const listener of listeners) listener();
}

function currentAccount(): Account {
  account ??= firstAccount();
  return account;
}

const serverAccount: Account = { status: 'checking' };

/** Whether this phone is signed in, kept up to date. */
export function useAccount(): Account {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    currentAccount,
    () => serverAccount,
  );
}

function accountOf(session: Session | null): Account {
  if (session === null) return { status: 'signed-out' };
  return { status: 'signed-in', id: session.user.id, email: session.user.email ?? '' };
}

function hasStoredSignIn(): boolean {
  try {
    return localStorage.getItem(SIGN_IN_KEY) !== null;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Supabase's client, made once and only when needed.

let client: Promise<SupabaseClient> | null = null;

function supabase(): Promise<SupabaseClient> {
  const config = signInConfig();
  if (config === null) return Promise.reject(new Error('off'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const made = createClient(config.url, config.key, {
      auth: {
        // Google comes back with a one-time code, checked against a secret
        // only this browser holds (PKCE).
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        // The sign-in page reads what comes back itself (SignInScreen.tsx).
        detectSessionInUrl: false,
        storageKey: SIGN_IN_KEY,
      },
    });
    made.auth.onAuthStateChange((_event, session) => {
      setAccount(accountOf(session));
    });
    return made;
  });
  return client;
}

/**
 * Checks whether this phone is signed in, when it has a sign-in kept, and
 * renews it if it's due (D19). Called when PrePenny opens. Loads nothing when
 * the phone has never signed in.
 */
export async function checkSignIn(): Promise<void> {
  if (signInConfig() === null) {
    setAccount({ status: 'off' });
    return;
  }
  if (!hasStoredSignIn()) {
    setAccount({ status: 'signed-out' });
    return;
  }
  try {
    const { data } = await (await supabase()).auth.getSession();
    setAccount(accountOf(data.session));
    if (data.session !== null) await claimPlan(data.session.user.id);
  } catch {
    // With no signal the kept sign-in still counts; it's checked next time.
    setAccount(keptAccount());
  }
}

/** The sign-in kept on this phone, read as it is, for when Supabase can't be asked. */
function keptAccount(): Account {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(SIGN_IN_KEY) ?? 'null');
    const user = (kept as { user?: { id?: unknown; email?: unknown } } | null)?.user;
    if (typeof user?.id === 'string') {
      return {
        status: 'signed-in',
        id: user.id,
        email: typeof user.email === 'string' ? user.email : '',
      };
    }
  } catch {
    // Nothing readable is kept.
  }
  return { status: 'signed-out' };
}

// ---------------------------------------------------------------------------
// Supabase's refusals, as PrePenny's words.

const WAIT = /after (\d+) seconds?/i;

export function problemOf(error: unknown): Problem {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (error === null || typeof error !== 'object') return { kind: 'server' };
  const { code, status, message, name } = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
    name?: unknown;
  };
  if (name === 'AuthRetryableFetchError' || status === 0 || code === undefined) {
    return online ? { kind: 'server' } : { kind: 'offline' };
  }
  switch (code) {
    case 'over_email_send_rate_limit': {
      const seconds = typeof message === 'string' ? WAIT.exec(message)?.[1] : undefined;
      return seconds === undefined
        ? { kind: 'too-many-emails' }
        : { kind: 'wait', seconds: Number(seconds) };
    }
    case 'over_request_rate_limit':
      return { kind: 'too-many-tries' };
    case 'otp_expired':
    case 'otp_disabled':
    case 'bad_code_verifier':
    case 'flow_state_expired':
    case 'flow_state_not_found':
      return { kind: 'code-refused' };
    case 'email_address_invalid':
    case 'email_address_not_authorized':
      return { kind: 'email-refused' };
    case 'signup_disabled':
    case 'email_provider_disabled':
    case 'provider_disabled':
      return { kind: 'off' };
    default:
      return online ? { kind: 'server' } : { kind: 'offline' };
  }
}

// ---------------------------------------------------------------------------
// Signing up and signing in.

/** Makes the plan on this phone the person's (brief 4.13 "Try first"). */
async function claimPlan(personId: string): Promise<'mine' | 'no-plan' | 'someone-else'> {
  try {
    const db = openDb();
    try {
      return await claimOwnPlan(db, personId);
    } finally {
      db.close();
    }
  } catch {
    // No database on this phone, as in some private windows: no plan to claim.
    return 'no-plan';
  }
}

/** After a code, a link or Google has worked: the plan becomes the person's. */
async function signedIn(session: Session | null): Promise<Outcome> {
  if (session === null) return { ok: false, problem: { kind: 'server' } };
  if ((await claimPlan(session.user.id)) === 'someone-else') {
    await (await supabase()).auth.signOut({ scope: 'local' }).catch(() => undefined);
    setAccount({ status: 'signed-out' });
    return { ok: false, problem: { kind: 'someone-elses-plan' } };
  }
  forgetCodeSent();
  setAccount(accountOf(session));
  return { ok: true };
}

/** Emails a 6-digit code, with the link as a backup. Someone new gets an account. */
export async function sendCode(email: string): Promise<Outcome> {
  try {
    const { error } = await (await supabase()).auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    rememberCodeSent(email);
    return { ok: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/** Signs in with the code from the email. */
export async function checkCode(email: string, code: string): Promise<Outcome> {
  try {
    const { data, error } = await (await supabase()).auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return await signedIn(data.session);
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/** Signs in with the link from the email: its one-time key, from after the "#". */
export async function checkLink(tokenHash: string): Promise<Outcome> {
  try {
    const { data, error } = await (await supabase()).auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return await signedIn(data.session);
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/**
 * Sends the browser to Google, through Supabase, to choose an account. Google
 * sends it back to `back` with a one-time code (finishGoogle).
 */
export async function startGoogle(back: string): Promise<Outcome> {
  try {
    const { error } = await (await supabase()).auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: back },
    });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/** Signs in with the one-time code Google came back with. */
export async function finishGoogle(code: string): Promise<Outcome> {
  try {
    const { data, error } = await (await supabase()).auth.exchangeCodeForSession(code);
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return await signedIn(data.session);
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/**
 * Ends this phone's sign-in, then removes the plan and everything else
 * PrePenny keeps from the phone (brief 4.13). Ends it on the server too when
 * there's a signal; without one, the sign-in on the phone is removed all the same.
 */
export async function signOutAndForget(): Promise<void> {
  if (signInConfig() !== null && hasStoredSignIn()) {
    try {
      await (await supabase()).auth.signOut({ scope: 'local' });
    } catch {
      // No signal: the phone forgets the sign-in below anyway.
    }
  }
  await forgetEverything();
  setAccount({ status: 'signed-out' });
}

// ---------------------------------------------------------------------------
// The code that was sent, for this tab: the email address and when, so the
// code step comes back after the phone has reloaded PrePenny while the person
// read their email, and so a refused code can be told apart from one that has
// run out (Supabase says the same for both).

export interface CodeSent {
  readonly email: string;
  readonly at: number;
}

function rememberCodeSent(email: string, at = Date.now()) {
  try {
    sessionStorage.setItem(CODE_SENT_KEY, JSON.stringify({ email, at }));
  } catch {
    // The code step still works while the page is open.
  }
}

function forgetCodeSent() {
  try {
    sessionStorage.removeItem(CODE_SENT_KEY);
  } catch {
    // Nothing was kept.
  }
}

/** The code sent from this tab in the last 10 minutes, or null. */
export function codeSent(now = Date.now()): CodeSent | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(CODE_SENT_KEY) ?? 'null');
    if (value === null || typeof value !== 'object') return null;
    const { email, at } = value as { email?: unknown; at?: unknown };
    if (typeof email !== 'string' || typeof at !== 'number') return null;
    if (now - at > CODE_LASTS_MS || at > now) return null;
    return { email, at };
  } catch {
    return null;
  }
}
