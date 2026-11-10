'use client';

// Shared plans (brief 4.14, step 3f): invites by link or email, asking to
// join, "Allow" and "Don't allow", who's in the plan, sharing accounts and
// claiming pay. The database decides what each step may do
// (supabase/migrations, step 3f): this file only asks, and turns its short
// refusal codes into problems the screens put in words.
//
// Nothing here writes an email address, an invite link's secret or anything
// about money to the console or anywhere else (CLAUDE.md).

import { signedInClient } from './account.ts';
import { newId, timeNow } from './ids.ts';

export type Role = 'editor' | 'viewer';

/** What an invite is now, for the person who opened its link. */
export type InviteState =
  | 'open'
  | 'waiting'
  | 'joined'
  | 'not-allowed'
  | 'used'
  | 'ran-out'
  | 'cancelled'
  | 'not-found'
  | 'yours'
  | 'member'
  | 'has-a-plan'
  | 'full';

const STATES: readonly InviteState[] = [
  'open',
  'waiting',
  'joined',
  'not-allowed',
  'used',
  'ran-out',
  'cancelled',
  'not-found',
  'yours',
  'member',
  'has-a-plan',
  'full',
];

/** Why something didn't work, as a code the screens turn into words. */
export type SharingProblem =
  | { readonly kind: 'offline' }
  | { readonly kind: 'server' }
  | { readonly kind: 'needs-name' }
  | { readonly kind: 'bad-email' }
  | { readonly kind: 'too-many-emails' }
  | { readonly kind: 'full' }
  | { readonly kind: 'view-only' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'not-waiting' }
  | { readonly kind: 'ran-out' }
  | { readonly kind: 'has-a-plan' }
  | { readonly kind: 'not-pay' }
  | { readonly kind: 'pay-has-details' }
  /** The invite can't be asked with: what it is now. */
  | { readonly kind: 'invite'; readonly state: InviteState }
  /** Money moves between these accounts and other private ones: share them too, or neither. */
  | { readonly kind: 'share-together'; readonly ids: readonly string[] }
  /** These payments are kept as "From Jess" in a shared account (D16). */
  | { readonly kind: 'share-has-halves'; readonly ids: readonly string[] };

export type Done<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: SharingProblem };

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function idsIn(details: unknown): string[] {
  try {
    const parsed = JSON.parse(typeof details === 'string' ? details : '[]') as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((one): one is string => typeof one === 'string')
      : [];
  } catch {
    return [];
  }
}

/** A refusal from PrePenny's database, as a problem. Only its code is read, never what it holds. */
export function problemOf(error: unknown): SharingProblem {
  if (error === null || typeof error !== 'object') {
    return offline() ? { kind: 'offline' } : { kind: 'server' };
  }
  const { message, details } = error as { message?: unknown; details?: unknown };
  switch (message) {
    case 'needs-name':
    case 'bad-email':
    case 'too-many-emails':
    case 'full':
    case 'view-only':
    case 'not-found':
    case 'not-waiting':
    case 'ran-out':
    case 'has-a-plan':
    case 'not-pay':
    case 'pay-has-details':
      return { kind: message };
    case 'share-together':
    case 'share-has-halves':
      return { kind: message, ids: idsIn(details) };
    default:
      if (typeof message === 'string' && (STATES as readonly string[]).includes(message)) {
        return { kind: 'invite', state: message as InviteState };
      }
      return offline() ? { kind: 'offline' } : { kind: 'server' };
  }
}

/** Calls one of PrePenny's own steps on the server, signed in. */
async function call<T>(name: string, args: Record<string, unknown>): Promise<Done<T>> {
  try {
    const client = await signedInClient();
    if (client === null) return { ok: false, problem: { kind: 'server' } };
    const { data, error } = await client.rpc(name, args);
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: data as T };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

// ---------------------------------------------------------------------------
// The invite link.

/** Where an invite link's secret waits while its person signs in, on this phone only. */
export const JOIN_KEY = 'prepenny-join';

/** The invite link: PrePenny's join page, with the secret after a "#", so it's never sent to the site. */
export function inviteLink(token: string, origin: string = window.location.origin): string {
  return `${origin}/join/#${token}`;
}

/** The secret from a link opened on this page, or one kept while signing in. */
export function tokenFrom(hash: string): string | null {
  const found = hash.replace(/^#/, '').trim();
  return /^[A-Za-z0-9_-]{20,100}$/.test(found) ? found : null;
}

export function keepToken(token: string): void {
  try {
    localStorage.setItem(JOIN_KEY, token);
  } catch {
    // A private window may keep nothing: the person opens the link again after signing in.
  }
}

export function keptToken(): string | null {
  try {
    return tokenFrom(localStorage.getItem(JOIN_KEY) ?? '');
  } catch {
    return null;
  }
}

export function forgetToken(): void {
  try {
    localStorage.removeItem(JOIN_KEY);
  } catch {
    // Nothing kept.
  }
}

// ---------------------------------------------------------------------------
// The steps.

export interface MadeInvite {
  readonly invite: string;
  readonly role: Role;
  /** The link's secret, for a link only: an email carries the link itself. */
  readonly token: string | null;
  readonly expiresAt: string;
}

export async function makeInvite(
  planId: string,
  role: Role,
  nickname: string,
  email: string | null,
): Promise<Done<MadeInvite>> {
  const answer = await call<{
    invite: string;
    role: Role;
    token: string | null;
    expires_at: string;
  }>('make_invite', { plan: planId, role, nickname, email });
  if (!answer.ok) return answer;
  return {
    ok: true,
    value: {
      invite: answer.value.invite,
      role: answer.value.role,
      token: answer.value.token,
      expiresAt: answer.value.expires_at,
    },
  };
}

export function cancelInvite(invite: string): Promise<Done<unknown>> {
  return call('cancel_invite', { invite });
}

export interface InviteLook {
  readonly state: InviteState;
  readonly role: Role;
  /** The name of the person who made the plan, when the invite is for this person. */
  readonly inviter: string | null;
  readonly expiresAt: string | null;
}

function lookOf(value: {
  state?: unknown;
  role?: unknown;
  inviter?: unknown;
  expires_at?: unknown;
}): InviteLook {
  const state = (STATES as readonly unknown[]).includes(value.state)
    ? (value.state as InviteState)
    : 'not-found';
  return {
    state,
    role: value.role === 'viewer' ? 'viewer' : 'editor',
    inviter: typeof value.inviter === 'string' ? value.inviter : null,
    expiresAt: typeof value.expires_at === 'string' ? value.expires_at : null,
  };
}

export async function lookAtInvite(token: string): Promise<Done<InviteLook>> {
  const answer = await call<Record<string, unknown>>('look_at_invite', { token });
  return answer.ok ? { ok: true, value: lookOf(answer.value) } : answer;
}

export async function askToJoin(token: string, nickname: string): Promise<Done<InviteLook>> {
  const answer = await call<Record<string, unknown>>('ask_to_join', { token, nickname });
  return answer.ok ? { ok: true, value: lookOf(answer.value) } : answer;
}

export function answerJoin(invite: string, allow: boolean): Promise<Done<unknown>> {
  return call('answer_join', { invite, allow });
}

/** Someone who asked to join this person's plan, for "Jess wants to join your plan". */
export interface JoinRequest {
  readonly invite: string;
  readonly plan: string;
  readonly role: Role;
  readonly nickname: string;
  /** The email address they signed in with, so the owner knows who it is. */
  readonly email: string;
  readonly askedAt: string;
}

export function requestsOf(value: unknown): JoinRequest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((one: Record<string, unknown>) =>
    typeof one?.invite === 'string' &&
    typeof one.plan === 'string' &&
    typeof one.nickname === 'string' &&
    typeof one.email === 'string' &&
    typeof one.asked_at === 'string'
      ? [
          {
            invite: one.invite,
            plan: one.plan,
            role: one.role === 'viewer' ? ('viewer' as const) : ('editor' as const),
            nickname: one.nickname,
            email: one.email,
            askedAt: one.asked_at,
          },
        ]
      : [],
  );
}

export interface Member {
  readonly person: string;
  readonly role: 'owner' | Role;
  readonly nickname: string;
}

export interface Sharing {
  readonly members: readonly Member[];
  readonly maxMembers: number;
  readonly myName: string;
  /** The owner's invite still open or waiting, or the last one. */
  readonly invite: {
    readonly id: string;
    readonly role: Role;
    readonly email: string | null;
    readonly state: InviteState;
    readonly expiresAt: string;
  } | null;
  readonly requests: readonly JoinRequest[];
}

export async function sharingOf(planId: string): Promise<Done<Sharing>> {
  const answer = await call<{
    members: { person: string; role: Member['role']; nickname: string }[];
    max_members: number;
    my_name: string;
    invite: {
      id: string;
      role: Role;
      email: string | null;
      state: InviteState;
      expires_at: string;
    } | null;
    requests: unknown;
  }>('sharing', { plan: planId });
  if (!answer.ok) return answer;
  const value = answer.value;
  return {
    ok: true,
    value: {
      members: value.members,
      maxMembers: value.max_members,
      myName: value.my_name ?? '',
      invite:
        value.invite === null
          ? null
          : {
              id: value.invite.id,
              role: value.invite.role,
              email: value.invite.email,
              state: value.invite.state,
              expiresAt: value.invite.expires_at,
            },
      requests: requestsOf(value.requests),
    },
  };
}

/** "Share these accounts": the server's own step (PLAN.md item 26). */
export function shareAccounts(planId: string, accounts: readonly string[]): Promise<Done<unknown>> {
  return call('share_accounts', {
    plan: planId,
    accounts,
    edit: newId(),
    made_at: timeNow(),
  });
}

/** "This is my pay" (D418): shared pay someone else added becomes this person's, for its whole family. */
export function claimPay(planId: string, familyId: string): Promise<Done<unknown>> {
  return call('claim_pay', { plan: planId, family: familyId, edit: newId(), made_at: timeNow() });
}
