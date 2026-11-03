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

/** "Fri 30 Oct", or "Fri 1 Jan 2027" when the date isn't in today's year. */
export function formatDay(date: string, today: string): string {
  const parts = partsOf(date);
  const weekdayName = strings.dates.weekdays[parts.weekday - 1];
  const text = `${weekdayName} ${parts.day} ${monthName(parts.month)}`;
  return parts.year === partsOf(today).year ? text : `${text} ${parts.year}`;
}

/** The date tile on a payment row: the day number over the month (DESIGN.md). */
export function dateTile(date: string): { readonly day: string; readonly month: string } {
  const parts = partsOf(date);
  return { day: parts.day.toString(), month: monthName(parts.month) };
}
