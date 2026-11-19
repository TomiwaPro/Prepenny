'use client';

// Contact us, Something looks wrong and Suggest a feature (step 4i, brief
// 4.16, D601 to D613): the phone's side. The database decides everything
// (supabase/migrations/20261123100000_support_messages.sql): this only asks.
//
// - Signed in, a message is sent as the person, and the automatic reply
//   goes to the address they sign in with.
// - Signed out, the person first asks for a 6-digit code at their address,
//   and the message goes only with that code (D605). Nothing they typed is
//   sent before then. Those two requests carry no sign-in, so someone whose
//   sign-in has ended, or isn't finished, can write too (D615).
// - The phone adds the app's version and the phone's type ("Android, Chrome
//   131"), never the browser's whole description, and never any money data:
//   the words typed, the screen's name and a picture or plan copy the person
//   chose are all that's sent.
// - Nothing here writes the words, an address, a code or a picture to the
//   console or anywhere else (CLAUDE.md), and nothing typed is kept on the
//   phone: a draft lives in memory only, until PrePenny is closed.

import { signedInClient } from './account.ts';
import { base64Of, type Picture, type PlanCopy } from './picture.ts';
import { signInConfig } from './sign-in-config.ts';
import { fetchWithTimeLimit } from './time-limit.ts';
import { appVersion } from './version.ts';

export type SupportKind = 'contact' | 'problem' | 'idea';

/** The most characters a message may have (the database's check). */
export const MOST_CHARACTERS = 2000;

/** Why something didn't work, as a code the screens turn into words. */
export type SupportProblem =
  | 'offline'
  | 'server'
  /** Signing in, and so sending, is switched off in this version of the app. */
  | 'off'
  | 'bad-email'
  | 'bad-message'
  | 'not-allowed'
  | 'too-many'
  | 'busy'
  | 'email-off'
  | 'code-wrong'
  | 'code-ran-out'
  /** A new code was asked for within a minute of the last: `wait` seconds more. */
  | 'wait'
  | 'bad-picture'
  | 'bad-plan'
  | 'file-too-big'
  | 'files-full';

const KNOWN: readonly SupportProblem[] = [
  'bad-email',
  'bad-message',
  'not-allowed',
  'too-many',
  'busy',
  'email-off',
  'bad-picture',
  'bad-plan',
  'file-too-big',
  'files-full',
];

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** A refusal from PrePenny's database, by its short code, never its words. */
function problemOf(error: unknown): SupportProblem {
  if (error !== null && typeof error === 'object') {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string') {
      const known = KNOWN.find((one) => one === message);
      if (known !== undefined) return known;
    }
  }
  return offline() ? 'offline' : 'server';
}

/**
 * The phone's type in plain words, from the browser's description: the kind
 * of device and the browser with its main version number, such as
 * "Android, Chrome 131". Never more of the description than that.
 */
export function phoneType(description: string, touchPoints = 0): string {
  const device = /iPhone|iPod/.test(description)
    ? 'iPhone'
    : /iPad/.test(description) || (/Macintosh/.test(description) && touchPoints > 1)
      ? 'iPad'
      : /Android/.test(description)
        ? 'Android'
        : /CrOS/.test(description)
          ? 'Chromebook'
          : /Windows/.test(description)
            ? 'Windows'
            : /Macintosh|Mac OS X/.test(description)
              ? 'Mac'
              : /Linux/.test(description)
                ? 'Linux'
                : 'Another device';
  const browsers: readonly (readonly [RegExp, string])[] = [
    [/SamsungBrowser\/(\d{1,4})/, 'Samsung Internet'],
    [/(?:Edg|EdgA|EdgiOS)\/(\d{1,4})/, 'Edge'],
    [/(?:OPR|OPiOS)\/(\d{1,4})/, 'Opera'],
    [/(?:Firefox|FxiOS)\/(\d{1,4})/, 'Firefox'],
    [/(?:Chrome|CriOS)\/(\d{1,4})/, 'Chrome'],
    [/Version\/(\d{1,4})[\d.]*(?: Mobile\/\S+)? Safari\//, 'Safari'],
  ];
  for (const [pattern, name] of browsers) {
    const found = pattern.exec(description);
    if (found !== null) return `${device}, ${name} ${found[1]}`;
  }
  return `${device}, Another browser`;
}

/** This phone's type, as phoneType says it. */
export function thisPhone(): string {
  if (typeof navigator === 'undefined') return 'Another device, Another browser';
  return phoneType(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}

/** This copy of PrePenny's version, as support sees it: the build it came from. */
export function thisVersion(): string {
  const build = appVersion().build;
  return /^[A-Za-z0-9._-]{1,40}$/.test(build) ? build : 'unknown';
}

/**
 * The screen a person is on, as a name support reads, from its address only:
 * "home", "coming-up", "help-sign-in-problems". Never what's after a "#",
 * where a debt's id is (D337), and never anything typed.
 */
export function screenName(path: string): string {
  const parts = path
    .split(/[?#]/)[0]
    ?.split('/')
    .filter((part) => part !== '' && part !== 'app')
    .map((part) => part.toLowerCase().replace(/[^a-z0-9-]/g, ''))
    .filter((part) => part !== '');
  const name = (parts ?? []).join('-').slice(0, 60).replace(/-+$/, '');
  return name === '' ? 'home' : name;
}

/**
 * Text as the database can take it: without the "null" character and without
 * half of a pair that makes one character, either of which makes the Data
 * API refuse the request and write what was typed into its log (D615). What
 * the person sees typed is unchanged.
 */
export function cleanText(typed: string): string {
  return typed
    .split(String.fromCharCode(0))
    .join('')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

/**
 * One of the two steps, as someone signed out: with PrePenny's public key
 * only, never a sign-in kept on this phone, so someone whose sign-in has
 * ended, or is waiting for its second step, can still write (D615). Nothing
 * of Supabase's own code is loaded for it.
 */
async function callSignedOut(
  name: string,
  args: Record<string, unknown>,
): Promise<{ readonly data: unknown; readonly error: { readonly message: string } | null }> {
  const config = signInConfig();
  if (config === null) throw new Error('off');
  const response = await fetchWithTimeLimit()(`${config.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      'Content-Type': 'application/json',
      'x-prepenny-version': appVersion().database,
    },
    body: JSON.stringify(args),
  });
  const answer = (await response.json().catch(() => null)) as unknown;
  if (response.ok) return { data: answer, error: null };
  const message =
    answer !== null &&
    typeof answer === 'object' &&
    typeof (answer as { message?: unknown }).message === 'string'
      ? (answer as { message: string }).message
      : '';
  return { data: null, error: { message } };
}

/** One of the two steps, signed in or out. */
async function call(
  name: string,
  args: Record<string, unknown>,
  signedIn: boolean,
): Promise<{ readonly data: unknown; readonly error: unknown }> {
  if (!signedIn) return callSignedOut(name, args);
  const client = await signedInClient();
  if (client === null) throw new Error('signed-out');
  return client.rpc(name, args);
}

export type Asked =
  | { readonly ok: true }
  | { readonly ok: false; readonly problem: SupportProblem; readonly wait?: number };

/** Asks for a 6-digit code at the address someone signed out typed (D605). */
export async function askForCode(email: string): Promise<Asked> {
  if (signInConfig() === null) return { ok: false, problem: 'off' };
  try {
    const { data, error } = await call('support_code', { email: cleanText(email) }, false);
    if (error !== null) return { ok: false, problem: problemOf(error) };
    const answer = data as { sent?: unknown; wait?: unknown } | null;
    if (answer?.sent === true) return { ok: true };
    if (typeof answer?.wait === 'number') return { ok: false, problem: 'wait', wait: answer.wait };
    return { ok: false, problem: 'server' };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}

export interface Message {
  readonly kind: SupportKind;
  readonly words: string;
  /** Something looks wrong: the screen's name (screenName). */
  readonly screen?: string | null;
  /** Something looks wrong: a picture or plan copy, chosen after the consent message. */
  readonly file?: Picture | PlanCopy | null;
}

export type Sent =
  | {
      readonly ok: true;
      /** The working day support aims to answer by, "YYYY-MM-DD", or null for an idea. */
      readonly answerBy: string | null;
      /** Whether the automatic reply was emailed. */
      readonly replied: boolean;
    }
  | { readonly ok: false; readonly problem: SupportProblem };

/**
 * Sends a message to PrePenny support. Signed in, as the person; signed
 * out, with the address and the code sent to it.
 */
export async function sendToSupport(
  message: Message,
  signedOut: { readonly email: string; readonly code: string } | null,
): Promise<Sent> {
  if (signInConfig() === null) return { ok: false, problem: 'off' };
  const file = message.kind === 'problem' ? (message.file ?? null) : null;
  try {
    const { data, error } = await call(
      'send_support',
      {
        kind: message.kind,
        words: cleanText(message.words),
        screen: message.kind === 'problem' ? (message.screen ?? null) : null,
        app_version: thisVersion(),
        phone_type: thisPhone(),
        file_kind: file?.kind ?? null,
        file_data: file === null ? null : base64Of(file.bytes),
        consent: file === null ? null : true,
        email: signedOut === null ? null : cleanText(signedOut.email),
        code: signedOut?.code ?? null,
      },
      signedOut === null,
    );
    if (error !== null) return { ok: false, problem: problemOf(error) };
    const answer = data as {
      sent?: unknown;
      why?: unknown;
      answer_by?: unknown;
      replied?: unknown;
    } | null;
    if (answer?.sent === true) {
      return {
        ok: true,
        answerBy: typeof answer.answer_by === 'string' ? answer.answer_by : null,
        replied: answer.replied === true,
      };
    }
    if (answer?.why === 'code-wrong' || answer?.why === 'code-ran-out') {
      return { ok: false, problem: answer.why };
    }
    return { ok: false, problem: 'server' };
  } catch (error) {
    return { ok: false, problem: problemOf(error) };
  }
}
