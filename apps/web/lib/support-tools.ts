'use client';

// The support screen's calls to the database (step 4j, D617 to D623), and a
// person's own support access (question 13, D618). The database decides
// everything: each support step refuses anyone but PrePenny support, signed
// in with two-step sign-in passed (app.support_only). This file only asks,
// and reads the answers. Nothing here writes an email address, words or
// anything about money to the console or anywhere else (CLAUDE.md).

import type { SupabaseClient } from '@supabase/supabase-js';
import { signedInClient } from './account.ts';

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

async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<Done<T>> {
  if (offline()) return { ok: false, problem: 'offline' };
  try {
    const made: SupabaseClient | null = await signedInClient();
    if (made === null) return { ok: false, problem: 'not-allowed' };
    const { data, error } = await made.rpc(name, args);
    if (error !== null) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: data as T };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const count = (value: unknown): number =>
  typeof value === 'number' ? value : typeof value === 'string' ? Number(value) || 0 : 0;

// ---------------------------------------------------------------------------
// Who's support.

/** "support", "two-step" for support's own address without two-step sign-in passed, or "no". */
export type SupportStatus = 'support' | 'two-step' | 'no';

export async function supportStatus(): Promise<Done<SupportStatus>> {
  const answer = await call<{ status?: unknown }>('support_status');
  if (!answer.ok) return answer;
  const status = answer.value.status;
  return {
    ok: true,
    value: status === 'support' || status === 'two-step' ? status : 'no',
  };
}

// ---------------------------------------------------------------------------
// The inbox.

export type MessageKind = 'contact' | 'problem' | 'idea';

export interface InboxMessage {
  readonly id: string;
  readonly kind: MessageKind;
  /** UTC, to the second. */
  readonly sentAt: string;
  readonly words: string;
  readonly screen: string | null;
  readonly appVersion: string;
  readonly phoneType: string;
  /** "YYYY-MM-DD": the working day the automatic reply aimed for. */
  readonly answerBy: string | null;
  readonly fileKind: 'picture' | 'plan' | null;
  readonly hasFile: boolean;
  readonly fileGoneAt: string | null;
  /** The account it's from, signed in, or null for an address proved with a code. */
  readonly person: string | null;
  /** The address a reply goes to. */
  readonly from: string | null;
  readonly repliedAt: string | null;
}

function messageOf(raw: unknown): InboxMessage | null {
  if (raw === null || typeof raw !== 'object') return null;
  const one = raw as Record<string, unknown>;
  const id = text(one.id);
  const kind = text(one.kind);
  const sentAt = text(one.sent_at);
  if (
    id === null ||
    sentAt === null ||
    (kind !== 'contact' && kind !== 'problem' && kind !== 'idea')
  )
    return null;
  const fileKind = one.file_kind === 'picture' || one.file_kind === 'plan' ? one.file_kind : null;
  return {
    id,
    kind,
    sentAt,
    words: text(one.words) ?? '',
    screen: text(one.screen),
    appVersion: text(one.app_version) ?? '',
    phoneType: text(one.phone_type) ?? '',
    answerBy: text(one.answer_by),
    fileKind,
    hasFile: one.has_file === true,
    fileGoneAt: text(one.file_gone_at),
    person: text(one.person),
    from: text(one.from),
    repliedAt: text(one.replied_at),
  };
}

export interface Inbox {
  readonly messages: readonly InboxMessage[];
  readonly more: boolean;
  readonly waiting: number;
}

/** Every message and idea, newest first, 50 at a time; older than a moment for the next 50. */
export async function supportInbox(olderThan: string | null = null): Promise<Done<Inbox>> {
  const answer = await call<Record<string, unknown>>(
    'support_inbox',
    olderThan === null ? {} : { older_than: olderThan },
  );
  if (!answer.ok) return answer;
  const raw = Array.isArray(answer.value.messages) ? answer.value.messages : [];
  return {
    ok: true,
    value: {
      messages: raw.flatMap((one) => {
        const found = messageOf(one);
        return found === null ? [] : [found];
      }),
      more: answer.value.more === true,
      waiting: count(answer.value.waiting),
    },
  };
}

export interface MessageFile {
  readonly kind: 'picture' | 'plan';
  readonly contentType: string;
  readonly width: number | null;
  readonly height: number | null;
  /** When it's deleted, 30 days after it was sent. */
  readonly goneAt: string;
}

export interface MessageDetail extends InboxMessage {
  readonly replies: readonly { readonly words: string; readonly sentAt: string }[];
  readonly file: MessageFile | null;
  /** The person who sent it has let support see their plan now. */
  readonly access: boolean;
}

export async function supportMessage(id: string): Promise<Done<MessageDetail>> {
  const answer = await call<Record<string, unknown>>('support_message', { message: id });
  if (!answer.ok) return answer;
  const base = messageOf(answer.value);
  if (base === null) return { ok: false, problem: 'server' };
  const rawFile = answer.value.file as Record<string, unknown> | null;
  const file: MessageFile | null =
    rawFile !== null &&
    typeof rawFile === 'object' &&
    (rawFile.kind === 'picture' || rawFile.kind === 'plan')
      ? {
          kind: rawFile.kind,
          contentType: text(rawFile.content_type) ?? '',
          width: typeof rawFile.width === 'number' ? rawFile.width : null,
          height: typeof rawFile.height === 'number' ? rawFile.height : null,
          goneAt: text(rawFile.gone_at) ?? '',
        }
      : null;
  const replies = Array.isArray(answer.value.replies) ? answer.value.replies : [];
  return {
    ok: true,
    value: {
      ...base,
      file,
      access: answer.value.access === true,
      replies: replies.flatMap((raw) => {
        if (raw === null || typeof raw !== 'object') return [];
        const one = raw as Record<string, unknown>;
        const words = text(one.words);
        const sentAt = text(one.sent_at);
        return words === null || sentAt === null ? [] : [{ words, sentAt }];
      }),
    },
  };
}

/** A message's picture or plan copy: its type and its contents, in base64. */
export async function supportFile(
  id: string,
): Promise<Done<{ readonly contentType: string; readonly data: string }>> {
  const answer = await call<Record<string, unknown>>('support_file', { message: id });
  if (!answer.ok) return answer;
  const contentType = text(answer.value.content_type);
  const data = text(answer.value.data);
  if (contentType === null || data === null) return { ok: false, problem: 'server' };
  return { ok: true, value: { contentType, data } };
}

/** Emails a reply from hello@prepenny.co.uk and keeps it with the message. */
export async function supportReply(id: string, words: string): Promise<Done<true>> {
  const answer = await call<unknown>('support_reply', { message: id, words });
  return answer.ok ? { ok: true, value: true } : answer;
}

// ---------------------------------------------------------------------------
// Accounts.

export async function supportFind(email: string): Promise<Done<string | null>> {
  const answer = await call<{ found?: unknown; person?: unknown }>('support_find', { email });
  if (!answer.ok) return answer;
  return { ok: true, value: answer.value.found === true ? text(answer.value.person) : null };
}

export interface AccessState {
  readonly on: boolean;
  readonly endsAt: string | null;
  readonly lastLookedAt: string | null;
}

function accessOf(raw: unknown): AccessState {
  const one = (raw ?? {}) as Record<string, unknown>;
  return {
    on: one.on === true,
    endsAt: text(one.ends_at),
    lastLookedAt: text(one.last_looked_at),
  };
}

export interface AccountDetail {
  readonly person: string;
  readonly email: string | null;
  readonly backupEmail: string | null;
  readonly signedUpAt: string | null;
  readonly lastSignedInAt: string | null;
  readonly twoStep: boolean;
  readonly plan: 'own' | 'shared' | 'none';
  readonly devices: number;
  readonly isYou: boolean;
  readonly access: AccessState;
  readonly errorCodes: readonly {
    readonly code: string;
    readonly screen: string | null;
    readonly appVersion: string;
    readonly at: string;
  }[];
  readonly twoStepWait: { readonly startedAt: string; readonly endsAt: string } | null;
  readonly getBackIn: {
    readonly startedAt: string;
    readonly readyAt: string;
    readonly fromSupport: boolean;
    readonly finishLinkAt: string | null;
  } | null;
  readonly messages: readonly {
    readonly id: string;
    readonly kind: MessageKind;
    readonly sentAt: string;
    readonly replied: boolean;
  }[];
  readonly actions: readonly {
    readonly action: string;
    readonly at: string;
    readonly emailed: boolean;
  }[];
}

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((one): one is Record<string, unknown> => one !== null && typeof one === 'object')
    : [];

export async function supportAccount(person: string): Promise<Done<AccountDetail>> {
  const answer = await call<Record<string, unknown>>('support_account', { person });
  if (!answer.ok) return answer;
  const one = answer.value;
  const wait = one.two_step_wait as Record<string, unknown> | null;
  const back = one.get_back_in as Record<string, unknown> | null;
  const plan = one.plan === 'own' || one.plan === 'shared' ? one.plan : 'none';
  return {
    ok: true,
    value: {
      person,
      email: text(one.email),
      backupEmail: text(one.backup_email),
      signedUpAt: text(one.signed_up_at),
      lastSignedInAt: text(one.last_signed_in_at),
      twoStep: one.two_step === true,
      plan,
      devices: count(one.devices),
      isYou: one.is_you === true,
      access: accessOf(one.access),
      errorCodes: list(one.error_codes).map((code) => ({
        code: text(code.code) ?? '',
        screen: text(code.screen),
        appVersion: text(code.app_version) ?? '',
        at: text(code.at) ?? '',
      })),
      twoStepWait:
        wait !== null && typeof wait === 'object'
          ? { startedAt: text(wait.started_at) ?? '', endsAt: text(wait.ends_at) ?? '' }
          : null,
      getBackIn:
        back !== null && typeof back === 'object'
          ? {
              startedAt: text(back.started_at) ?? '',
              readyAt: text(back.ready_at) ?? '',
              fromSupport: back.from_support === true,
              finishLinkAt: text(back.finish_link_at),
            }
          : null,
      messages: list(one.messages).flatMap((message) => {
        const id = text(message.id);
        const kind = message.kind;
        if (id === null || (kind !== 'contact' && kind !== 'problem' && kind !== 'idea')) return [];
        return [
          { id, kind, sentAt: text(message.sent_at) ?? '', replied: message.replied === true },
        ];
      }),
      actions: list(one.actions).map((action) => ({
        action: text(action.action) ?? '',
        at: text(action.at) ?? '',
        emailed: action.emailed === true,
      })),
    },
  };
}

/** The plan rows a person sees, while they let support see it: as plan_changes gives their own phone. */
export async function supportPlan(person: string): Promise<Done<Record<string, unknown>>> {
  return call<Record<string, unknown>>('support_plan', { person });
}

// ---------------------------------------------------------------------------
// Actions (D621, D622).

export async function supportSignOut(person: string): Promise<Done<number>> {
  const answer = await call<{ ended?: unknown }>('support_sign_out', { person });
  return answer.ok ? { ok: true, value: count(answer.value.ended) } : answer;
}

export async function supportStartTwoStepWait(person: string): Promise<Done<string>> {
  const answer = await call<{ ends_at?: unknown }>('support_start_two_step_wait', { person });
  if (!answer.ok) return answer;
  const ends = text(answer.value.ends_at);
  return ends === null ? { ok: false, problem: 'server' } : { ok: true, value: ends };
}

export async function supportStopTwoStepWait(person: string): Promise<Done<true>> {
  const answer = await call<unknown>('support_stop_two_step_wait', { person });
  return answer.ok ? { ok: true, value: true } : answer;
}

/** Sends the link to the backup email: "start" asks to get back in, "finish" finishes. */
export async function supportSendBackupLink(person: string): Promise<Done<'start' | 'finish'>> {
  const answer = await call<{ sent?: unknown }>('support_send_backup_link', { person });
  if (!answer.ok) return answer;
  return { ok: true, value: answer.value.sent === 'finish' ? 'finish' : 'start' };
}

// ---------------------------------------------------------------------------
// Usage, counts only (D623).

export interface Usage {
  readonly signUps: readonly { readonly week: string; readonly count: number }[];
  readonly opened7: number;
  readonly opened30: number;
  readonly sharedPlans: number;
  readonly remindersOn: number;
  readonly waiting: number;
}

export async function supportUsage(): Promise<Done<Usage>> {
  const answer = await call<Record<string, unknown>>('support_usage');
  if (!answer.ok) return answer;
  const one = answer.value;
  return {
    ok: true,
    value: {
      signUps: list(one.sign_ups).map((week) => ({
        week: text(week.week) ?? '',
        count: count(week.count),
      })),
      opened7: count(one.opened_7),
      opened30: count(one.opened_30),
      sharedPlans: count(one.shared_plans),
      remindersOn: count(one.reminders_on),
      waiting: count(one.waiting),
    },
  };
}

// ---------------------------------------------------------------------------
// A person's own support access (question 13, D618).

export async function mySupportAccess(): Promise<Done<AccessState>> {
  const answer = await call<unknown>('my_support_access');
  return answer.ok ? { ok: true, value: accessOf(answer.value) } : answer;
}

export async function giveSupportAccess(): Promise<Done<AccessState>> {
  const answer = await call<unknown>('give_support_access');
  return answer.ok ? { ok: true, value: accessOf(answer.value) } : answer;
}

export async function endSupportAccess(): Promise<Done<AccessState>> {
  const answer = await call<unknown>('end_support_access');
  return answer.ok ? { ok: true, value: accessOf(answer.value) } : answer;
}
