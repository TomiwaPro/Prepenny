// "Changed by Tom, 2 hours ago" (brief 4.14, step 3g, D459): who last
// changed a payment, and when, from the server's own record of the edit that
// last saved each of its parts: its series, its one-off change and its tick.
//
// Pure: the time now is passed in. Names come from the plan's members; a
// person who hasn't given one is "your partner" (D377, D420).

import { strings } from '../strings/en-GB.ts';
import { formatDay } from './dates.ts';
import { localToday } from './today.ts';

const t = strings.together;

/** The edit that last saved a record: who made it, when (UTC), and what kind of change it was. */
export interface ChangeMark {
  readonly by: string;
  readonly at: string;
  readonly kind: string;
}

/** What a payment's "Changed by" line says, and whether it's the other person's. */
export interface ChangedBy {
  readonly words: string;
  readonly mine: boolean;
  /** When it was made, as a time, for keeping only the recent ones on a row. */
  readonly at: string;
}

/** Changes that say nothing about a payment itself: the server's own steps about who sees what. */
const NOT_A_CHANGE = new Set(['first-copy', 'join-with-plan', 'make-private', 'share-record']);

/** Changes that end a series at a payment, so its earlier payments haven't changed. */
const ENDS_A_SERIES = new Set(['this-and-later', 'remove-this-and-later']);

/**
 * The latest change to a payment: to its series (when that changed the
 * payment, not only where the series now ends), its one-off change, or its
 * tick. Null when none is known.
 */
export function lastChange(
  marks: ReadonlyMap<string, ChangeMark>,
  seriesId: string,
  originalDate: string,
  seriesVersion: number | null,
): ChangeMark | null {
  const found: ChangeMark[] = [];
  const series = marks.get(`series|${seriesId}`);
  // A series made by "this and all later ones" is new (version 1): every payment in it changed.
  // An older one it was split from only got a new end.
  if (series !== undefined && !(ENDS_A_SERIES.has(series.kind) && (seriesVersion ?? 2) > 1)) {
    found.push(series);
  }
  for (const part of ['change', 'tick'] as const) {
    const mark = marks.get(`${part}|${seriesId}|${originalDate}`);
    if (mark !== undefined) found.push(mark);
  }
  const usable = found.filter((mark) => !NOT_A_CHANGE.has(mark.kind));
  if (usable.length === 0) {
    return found.find((mark) => mark.kind === 'share-accounts') ?? null;
  }
  return usable.reduce((newest, mark) =>
    Date.parse(mark.at) > Date.parse(newest.at) ? mark : newest,
  );
}

/** "just now", "5 minutes ago", "2 hours ago", "yesterday" or "Tue 3 Nov", by this phone's own clock and dates. */
export function agoWords(at: string, now: number): string {
  const then = Date.parse(at);
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return t.justNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t.minutesAgo(minutes);
  const today = localToday(new Date(now));
  const day = localToday(new Date(then));
  const hours = Math.floor(minutes / 60);
  if (day === today) return t.hoursAgo(hours);
  const yesterday = localToday(new Date(now - 24 * 60 * 60 * 1000));
  if (day === yesterday) return t.yesterday;
  return formatDay(day, today);
}

/** Who someone is in a sentence about them: "you", their name, or "your partner". */
export function whoInSentence(
  person: string,
  me: string,
  nicknames: Readonly<Record<string, string>>,
): string {
  if (person === me) return t.you;
  const name = nicknames[person];
  return name === undefined || name === '' ? t.yourPartner : name;
}

/** The line for a payment: "Changed by Tom, 2 hours ago", "Added by you, just now", "Shared by Jess, Tue 10 Nov". */
export function changedByWords(
  mark: ChangeMark,
  me: string,
  nicknames: Readonly<Record<string, string>>,
  now: number,
): ChangedBy {
  const who = whoInSentence(mark.by, me, nicknames);
  const when = agoWords(mark.at, now);
  const words =
    mark.kind === 'share-accounts'
      ? t.sharedBy(who, when)
      : mark.kind === 'add-payment'
        ? t.addedBy(who, when)
        : t.changedBy(who, when);
  return { words, mine: mark.by === me, at: mark.at };
}

/** How long a partner's change shows on the payment's row; the edit sheet always says (D459). */
export const RECENT_ON_ROWS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The line on a payment's row: only the other person's change, from the
 * last 7 days, and never the moment an account was shared, so the plan
 * stays calm (DESIGN.md) and a partner's change stands out.
 */
export function rowLine(
  mark: ChangeMark | null,
  me: string,
  nicknames: Readonly<Record<string, string>>,
  now: number,
): string | null {
  if (mark === null || mark.by === me || mark.kind === 'share-accounts') return null;
  if (now - Date.parse(mark.at) > RECENT_ON_ROWS_MS) return null;
  return changedByWords(mark, me, nicknames, now).words;
}
