// Times for the tests of a partner's changes (step 4f, D576). A change's
// time is when it reached the account, by the server's clock, so to give
// each test the same times on any day it runs, the changes it makes are
// placed on a day of its own, tomorrow, at UK times, and the reminders
// function is started at moments on that day (supabase/seed.sql's test
// clock).

import { expect } from '@playwright/test';
import { quoted, sql } from './two-phones.ts';

/** The hour on a UK clock at a moment (the app's own is in lib/reminders.ts, which the test runner can't load). */
const ukHour = (moment: number) =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(moment)),
  );

/** A date as PrePenny says it, "Fri 13 Nov", with the year only when it isn't `today`'s. */
export function sayDay(date: string, today: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const words = [parts.weekday, parts.day, parts.month];
  if (date.slice(0, 4) !== today.slice(0, 4)) words.push(parts.year ?? '');
  return words.join(' ');
}

/**
 * A moment on a UK clock, `days` after today, as UTC: 10am is 10am in winter
 * (GMT) and in summer (BST).
 */
export function uk(days: number, hour: number, minute = 0, second = 0): Date {
  const now = new Date();
  const guess = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + days,
    hour,
    minute,
    second,
  );
  return new Date(guess - (ukHour(guess) - hour) * 60 * 60 * 1000);
}

/** The server's time now, to place only the changes made after it. */
export const serverNow = () => sql(`select app.utc_exact(now())`);

/**
 * Puts every change this person made after `after`, and not placed yet, at
 * a moment on the test's day, as if it reached the account then. Placed
 * changes are from 9am tomorrow on; new ones are before it.
 */
export function placeChanges(person: string, after: string, moment: Date) {
  sql(`update public.edits set saved_at = ${quoted(moment.toISOString())}::timestamptz
    where person_id = ${quoted(person)} and saved_at > ${quoted(after)}::timestamptz
      and saved_at < ${quoted(uk(1, 9).toISOString())}::timestamptz`);
}

/** Waits until a payment of this name is in the person's plan on the server. */
export async function onTheServer(person: string, name: string) {
  await expect
    .poll(() =>
      sql(
        `select count(*) from public.series s join public.plan_members m on m.plan_id = s.plan_id where m.person_id = ${quoted(person)} and m.left_at is null and s.name = ${quoted(name)} and not s.deleted`,
      ),
    )
    .toBe('1');
}
