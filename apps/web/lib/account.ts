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
import { forgetEverything, planSafelyKept } from '../data/forget.ts';
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
  /** Google isn't set up on the Supabase project yet (README.md, "Signing in", part C). */
  | { readonly kind: 'google-off' }
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
    made.auth.onAuthStateChange((event, session) => {
      // Supabase couldn't renew a sign-in that has ended, as after "Sign out
      // everywhere" or 90 days without opening PrePenny (PLAN.md item 29).
      if (event === 'SIGNED_OUT' && !signingOutOnPurpose) {
        void signInEnded();
        return;
      }
      setAccount(accountOf(session));
    });
    return made;
  });
  return client;
}

/**
 * Supabase's client for the plan's own requests (step 3c, data/sync.ts):
 * saving changes, bringing the plan down and the live nudges. Only on a
 * phone that's signed in; null otherwise, so nothing is loaded or sent.
 */
export async function signedInClient(): Promise<SupabaseClient | null> {
  if (signInConfig() === null || !hasStoredSignIn()) return null;
  try {
    return await supabase();
  } catch {
    return null;
  }
}

/** Who's signed in on this phone, as far as it knows now. */
export function accountNow(): Account {
  return currentAccount();
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
  // With no signal the kept sign-in still counts, so "Sign out" is always
  // there; it's checked with Supabase next time.
  if (offline()) {
    setAccount(keptAccount());
    return;
  }
  try {
    const { data } = await (await supabase()).auth.getSession();
    if (data.session === null) {
      // Supabase's client removes a sign-in that has ended; one it couldn't
      // renew for now, with a weak signal, is still kept.
      if (hasStoredSignIn()) setAccount(keptAccount());
      else await signInEnded();
      return;
    }
    if ((await claimPlan(data.session.user.id)) === 'someone-else') {
      await signOutHere();
      setAccount({ status: 'signed-out' });
      return;
    }
    setAccount(accountOf(data.session));
  } catch {
    setAccount(keptAccount());
  }
}

/** True while PrePenny itself is signing this phone out, so it isn't taken for a sign-in that ended. */
let signingOutOnPurpose = false;

/** Ends this phone's sign-in on purpose, for PrePenny's own reasons. */
async function signOutHere(): Promise<void> {
  signingOutOnPurpose = true;
  try {
    await (await supabase()).auth.signOut({ scope: 'local' });
  } catch {
    // The sign-in on the phone goes all the same.
  } finally {
    signingOutOnPurpose = false;
  }
}

/**
 * A sign-in that ended by itself (PLAN.md item 29, step 3c): the plan is
 * removed from the phone, as signing out does, once it's safely in the
 * account. A plan with something not sent yet stays, so nothing is lost, and
 * whoever signs in next is asked first (D306). Then the welcome says so.
 */
async function signInEnded(): Promise<void> {
  setAccount({ status: 'signed-out' });
  if (!(await planSafelyKept())) return;
  await forgetEverything();
  window.location.replace('/?sign-in-ended');
}

/** True when the phone says it has no signal. */
function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * When PrePenny is signed out in another tab, which removes everything it
 * keeps, this tab starts afresh too, so it never shows or saves the plan
 * from memory (D314). Returns how to stop listening.
 */
export function followSignOutInOtherTabs(): () => void {
  const listener = (event: StorageEvent) => {
    // Only signing out empties the small store all at once.
    if (event.key === null && event.storageArea === localStorage) window.location.replace('/');
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
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
    // Google came back in another browser, which doesn't hold this one's secret (PKCE).
    case 'pkce_code_verifier_not_found':
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
    await signOutHere();
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
    if (error !== null) {
      // The only thing sent is the address, so a refusal of what was sent is about it.
      const problem =
        (error as { code?: unknown }).code === 'validation_failed'
          ? ({ kind: 'email-refused' } as const)
          : problemOf(error);
      return { ok: false, problem };
    }
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
  const config = signInConfig();
  if (config === null) return { ok: false, problem: { kind: 'off' } };
  try {
    // Asked first, so nobody is sent to a bare error page when Google isn't
    // set up yet. Only Supabase's public settings come back: nothing is sent.
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key },
    });
    const settings = (await response.json()) as { external?: { google?: unknown } };
    if (settings.external?.google !== true) {
      return { ok: false, problem: { kind: 'google-off' } };
    }
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
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

/** Work to let finish before the phone forgets everything, such as a send under way (D360). */
const beforeForgetting = new Set<() => Promise<unknown>>();

/**
 * Lets work already under way, such as sending a change or bringing down
 * what's new, finish before signing out clears the phone, so nothing it
 * saves comes back afterwards (D360). Gives back a way to stop.
 */
export function finishBeforeSigningOut(work: () => Promise<unknown>): () => void {
  beforeForgetting.add(work);
  return () => beforeForgetting.delete(work);
}

/**
 * Ends this phone's sign-in, then removes the plan and everything else
 * PrePenny keeps from the phone (brief 4.13). Ends it on the server too when
 * there's a signal; without one, the sign-in on the phone is removed all the same.
 */
export async function signOutAndForget(): Promise<void> {
  if (signInConfig() !== null && hasStoredSignIn() && !offline()) {
    // Supabase is given a few seconds at most: with a weak signal the phone
    // forgets the sign-in all the same, straight after (D314).
    signingOutOnPurpose = true;
    await Promise.race([
      supabase()
        .then((made) => made.auth.signOut({ scope: 'local' }))
        .catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, SIGN_OUT_WAIT_MS)),
    ]);
  }
  // Signed out, nothing new starts; what's under way finishes first, for a
  // few seconds at most, so it can't save anything after the phone is cleared (D360).
  await Promise.race([
    Promise.allSettled([...beforeForgetting].map((work) => work())),
    new Promise((resolve) => setTimeout(resolve, SIGN_OUT_WAIT_MS)),
  ]);
  await forgetEverything();
  setAccount({ status: 'signed-out' });
}

/** How long signing out waits for Supabase before forgetting everything anyway. */
const SIGN_OUT_WAIT_MS = 3000;

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

/** Forgets the code sent from this tab, as when the person uses a different address. */
export function forgetCodeSent() {
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
