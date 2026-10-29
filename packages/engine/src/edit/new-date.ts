// Where later payments go when a payment's date changes for this and all
// later ones (D91, D96). The app passes the result to a "this-and-later"
// command as its schedule, so every phone follows the same rule.

import { formatDate, parseDate, partsOfDay } from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import type { Schedule } from '../schedule/types.ts';

/**
 * The schedule from a payment's new date on, as the owner set it out (D96):
 *
 * - weekly, every few weeks or an irregular weekly estimate: unchanged, so
 *   the later ones go on the new date's weekday, every so many weeks from it
 * - monthly, on any kind of day: the new date's day of the month, with the
 *   same months left out
 * - on chosen dates: only this payment's date changes in the list
 * - once: unchanged, so the payment simply moves.
 *
 * `originalDate` is the payment's date from its schedule and `newDate` the
 * new one, both before the weekend and bank holiday rule, "YYYY-MM-DD".
 */
export function scheduleForNewDate(
  schedule: Schedule,
  originalDate: string,
  newDate: string,
): Schedule {
  const original = parseDate(originalDate, "the payment's original date");
  const day = parseDate(newDate, 'the new date');
  switch (schedule?.kind) {
    case 'once':
    case 'weekly':
    case 'irregular':
      return schedule;
    case 'monthly': {
      const on = { kind: 'day', day: partsOfDay(day).day } as const;
      return schedule.leaveOut === undefined
        ? { kind: 'monthly', every: schedule.every, on }
        : { kind: 'monthly', every: schedule.every, on, leaveOut: schedule.leaveOut };
    }
    case 'dates': {
      const dates = schedule.dates.map((date) => parseDate(date, 'a chosen date'));
      const at = dates.indexOf(original);
      if (at < 0) {
        throw new EngineInputError(
          'no-payment',
          `The chosen dates don't include ${formatDate(original)}.`,
        );
      }
      return {
        kind: 'dates',
        dates: schedule.dates.map((date, i) => (i === at ? formatDate(day) : date)),
      };
    }
    default:
      throw new EngineInputError('bad-schedule', 'The schedule is missing or unknown.');
  }
}
