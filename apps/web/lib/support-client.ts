'use client';

// Signing in to the support dashboard (step 4j, D641, D642), at its own
// address, admin.prepenny.co.uk. Support's account is its own (D640) and
// never needs the app: the dashboard has its own sign-in, by a 6-digit code
// by email, and its own two-step sign-in, with Supabase Auth as the app has.
//
// Nothing from the dashboard is kept on the computer (D642): the sign-in is
// kept for this tab only (sessionStorage), so closing the tab signs out
// here, and the dashboard keeps no plan, no offline helper and nothing
// else. Nothing here writes an email address, a code or anything about
// money to the console or anywhere else (CLAUDE.md).

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { signInConfig } from './sign-in-config.ts';
import { fetchWithTimeLimit } from './time-limit.ts';
import { appVersion } from './version.ts';

/** Where the sign-in is kept, for this tab only. */
const SIGN_IN_KEY = 'prepenny-support-sign-in';

export type Who =
  | { readonly status: 'off' }
  | { readonly status: 'checking' }
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly id: string };

/** Why something didn't work, for the words on the dashboard. */
export type SignInProblem =
  | { readonly kind: 'offline' }
  | { readonly kind: 'server' }
  | { readonly kind: 'off' }
  | { readonly kind: 'wait'; readonly seconds: number }
  | { readonly kind: 'too-many-emails' }
  | { readonly kind: 'too-many-tries' }
  /** A code that's wrong or has run out, or a link used already. */
  | { readonly kind: 'code-refused' }
  | { readonly kind: 'email-refused' }
  /** The authenticator app's code doesn't match. */
  | { readonly kind: 'app-code-wrong' };

export type Done<T = true> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: SignInProblem };

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const WAIT = /after (\d+) seconds?/i;

export function problemOf(error: unknown): SignInProblem {
  if (error === null || typeof error !== 'object') {
    return offline() ? { kind: 'offline' } : { kind: 'server' };
  }
  const { code, status, message, name } = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
    name?: unknown;
  };
  if (name === 'AuthRetryableFetchError' || status === 0 || code === undefined) {
    return offline() ? { kind: 'offline' } : { kind: 'server' };
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
      return { kind: 'code-refused' };
    case 'mfa_verification_failed':
    case 'mfa_challenge_expired':
    case 'invalid_credentials':
      return { kind: 'app-code-wrong' };
    case 'email_address_invalid':
    case 'email_address_not_authorized':
    case 'validation_failed':
      return { kind: 'email-refused' };
    case 'signup_disabled':
    case 'email_provider_disabled':
      return { kind: 'off' };
    default:
      return offline() ? { kind: 'offline' } : { kind: 'server' };
  }
}

/** This tab's own store, which a browser empties when the tab closes. */
const tabStore = {
  getItem(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // A browser that keeps nothing: the sign-in lasts until the page closes.
    }
  },
  removeItem(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing was kept.
    }
  },
};

// ---------------------------------------------------------------------------
// Who's signed in.

let who: Who | null = null;
const listeners = new Set<() => void>();

function setWho(next: Who) {
  if (
    who !== null &&
    who.status === next.status &&
    (who.status !== 'signed-in' || (next.status === 'signed-in' && who.id === next.id))
  ) {
    return;
  }
  who = next;
  for (const listener of listeners) listener();
}

function currentWho(): Who {
  who ??=
    signInConfig() === null
      ? { status: 'off' }
      : tabStore.getItem(SIGN_IN_KEY) === null
        ? { status: 'signed-out' }
        : { status: 'checking' };
  return who;
}

const serverWho: Who = { status: 'checking' };

/** Who's signed in to the dashboard in this tab, kept up to date. */
export function useSupportSignIn(): Who {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    currentWho,
    () => serverWho,
  );
}

const whoOf = (session: Session | null): Who =>
  session === null ? { status: 'signed-out' } : { status: 'signed-in', id: session.user.id };

// ---------------------------------------------------------------------------
// Supabase's client, made once.

let client: Promise<SupabaseClient> | null = null;

/** Supabase's client for the dashboard: every support step goes through it. */
export function supportClient(): Promise<SupabaseClient> {
  const config = signInConfig();
  if (config === null) return Promise.reject(new Error('off'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) => {
    const made = createClient(config.url, config.key, {
      // The database answers only the version it is (lib/version.ts), and
      // every request has a time limit (D404), as in the app.
      global: {
        headers: { 'x-prepenny-version': appVersion().database },
        fetch: fetchWithTimeLimit(),
      },
      auth: {
        storage: tabStore,
        storageKey: SIGN_IN_KEY,
        persistSession: true,
        autoRefreshToken: true,
        // The dashboard reads the email's link itself (SupportDashboard.tsx).
        detectSessionInUrl: false,
      },
    });
    made.auth.onAuthStateChange((_event, session) => setWho(whoOf(session)));
    return made;
  });
  return client;
}

/** Checks the sign-in this tab keeps, if any, when the dashboard opens. */
export async function checkSupportSignIn(): Promise<void> {
  if (signInConfig() === null) {
    setWho({ status: 'off' });
    return;
  }
  if (tabStore.getItem(SIGN_IN_KEY) === null) {
    setWho({ status: 'signed-out' });
    return;
  }
  try {
    const { data } = await (await supportClient()).auth.getSession();
    setWho(whoOf(data.session));
  } catch {
    setWho({ status: 'signed-out' });
  }
}

// ---------------------------------------------------------------------------
// Signing in by email.

/** Emails a 6-digit code. Its link opens this dashboard, never the app (supabase/templates). */
export async function sendSupportCode(email: string): Promise<Done> {
  try {
    const { error } = await (await supportClient()).auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/` },
    });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/** Signs in with the code from the email. */
export async function checkSupportCode(email: string, code: string): Promise<Done> {
  try {
    const { data, error } = await (await supportClient()).auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    setWho(whoOf(data.session));
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/** Signs in with the email's link: its one-time key, from after the "#". */
export async function checkSupportLink(tokenHash: string): Promise<Done> {
  try {
    const { data, error } = await (await supportClient()).auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    setWho(whoOf(data.session));
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/** Signs out here: the sign-in this tab keeps ends. */
export async function signOutOfSupport(): Promise<void> {
  try {
    await (await supportClient()).auth.signOut({ scope: 'local' });
  } catch {
    // It's gone from this tab whatever Supabase says.
  }
  tabStore.removeItem(SIGN_IN_KEY);
  setWho({ status: 'signed-out' });
}

// ---------------------------------------------------------------------------
// Two-step sign-in, the dashboard's own.

export interface SupportTwoStep {
  /** An authenticator app is set up. */
  readonly on: boolean;
  /** This sign-in has passed its code. */
  readonly passed: boolean;
}

export async function supportTwoStep(): Promise<Done<SupportTwoStep>> {
  try {
    const { data, error } = await (await supportClient()).auth.mfa.getAuthenticatorAssuranceLevel();
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return {
      ok: true,
      value: { on: data.nextLevel === 'aal2', passed: data.currentLevel === 'aal2' },
    };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/** Checks a code from the authenticator app, for this sign-in. */
export async function passSupportSecondStep(code: string): Promise<Done> {
  try {
    const made = await supportClient();
    const { data: factors, error: listError } = await made.auth.mfa.listFactors();
    if (listError !== null) return { ok: false, problem: problemOf(listError) };
    const id = factors.totp.find((one) => one.status === 'verified')?.id;
    if (id === undefined) return { ok: false, problem: { kind: 'server' } };
    const { error } = await made.auth.mfa.challengeAndVerify({ factorId: id, code });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

export interface NewSupportApp {
  readonly factorId: string;
  /** The picture to scan, as Supabase draws it. */
  readonly qrCode: string;
  /** The key to type into the app by hand, in groups of 4. */
  readonly key: string;
}

/** Starts setting up the authenticator app: nothing changes until its first code is typed. */
export async function startSupportTwoStep(): Promise<Done<NewSupportApp>> {
  try {
    const made = await supportClient();
    const { data: factors } = await made.auth.mfa.listFactors();
    for (const old of factors?.all ?? []) {
      if (old.status !== 'verified') await made.auth.mfa.unenroll({ factorId: old.id });
    }
    const { data, error } = await made.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'PrePenny support',
      issuer: 'PrePenny support',
    });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return {
      ok: true,
      value: {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        key: data.totp.secret.replace(/(.{4})/g, '$1 ').trim(),
      },
    };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

/** Turns two-step sign-in on with the app's first code; this sign-in has then passed it. */
export async function finishSupportTwoStep(factorId: string, code: string): Promise<Done> {
  try {
    const { error } = await (await supportClient()).auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}
