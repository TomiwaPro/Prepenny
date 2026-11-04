// Dates as people read them (brief Part 6, VOICE.md): "Fri 30 Oct", with the
// year only when it isn't this year: "Fri 1 Jan 2027". Dates are the
// engine's "YYYY-MM-DD" calendar dates, never Date objects, so a date can
// never slip a day across a time zone or a clock change.

import { parseDate, partsOfDay, weekday } from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';

function partsOf(date: string) {
  const day = parseDate(date);
  return { ...partsOfDay(day), weekday: weekday(day) };
}

function monthName(month: number): string {
  const name = strings.dates.months[month - 1];
  if (name === undefined) throw new RangeError(`No month ${month}.`);
  return name;
}

/** Between the parts of a date, so "Fri 30 Oct" never splits across two lines. */
const KEEP_TOGETHER = '\u00a0';

/**
 * "Fri 30 Oct", or "Fri 1 Jan 2027" when the date isn't in today's year. The
 * parts are joined with non-breaking spaces, so a date stays on one line.
 */
export function formatDay(date: string, today: string): string {
  const parts = partsOf(date);
  const words = [strings.dates.weekdays[parts.weekday - 1], parts.day, monthName(parts.month)];
  if (parts.year !== partsOf(today).year) words.push(parts.year);
  return words.join(KEEP_TOGETHER);
}

/** The date tile on a payment row: the day number over the month (DESIGN.md). */
export function dateTile(date: string): { readonly day: string; readonly month: string } {
  const parts = partsOf(date);
  return { day: parts.day.toString(), month: monthName(parts.month) };
}

/** A calendar month's heading: "October", or "January 2027" when it isn't in today's year. */
export function formatMonth(date: string, today: string): string {
  const parts = partsOf(date);
  const name = strings.dates.monthsLong[parts.month - 1];
  if (name === undefined) throw new RangeError(`No month ${parts.month}.`);
  return parts.year === partsOf(today).year ? name : `${name}${KEEP_TOGETHER}${parts.year}`;
}

/** "Fri": a date's weekday, short. */
export function weekdayShort(date: string): string {
  const name = strings.dates.weekdays[partsOf(date).weekday - 1];
  if (name === undefined) throw new RangeError(`No weekday for ${date}.`);
  return name;
}

/** "Friday": a date's weekday in full. */
export function weekdayName(date: string): string {
  const name = strings.dates.weekdaysLong[partsOf(date).weekday - 1];
  if (name === undefined) throw new RangeError(`No weekday for ${date}.`);
  return name;
}

/**
 * "9:14am": the time on this phone's clock, from a UTC time such as
 * "2026-10-30T09:14:05Z". Only for showing when something was done, never in a sum.
 */
export function formatTime(time: string): string {
  const moment = new Date(time);
  const hours = moment.getHours();
  const minutes = moment.getMinutes().toString().padStart(2, '0');
  return strings.dates.time(hours % 12 === 0 ? 12 : hours % 12, minutes, hours < 12);
}
