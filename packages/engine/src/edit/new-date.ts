// Where later payments go when a payment's date changes for this and all
// later ones (D91, D96). The engine uses this itself when a "this-and-later"
// command gives a new date and no schedule, so every phone, and every edit
// replayed after a sync clash, follows the same rule.

import { type Day, formatDate, parseDate, partsOfDay } from '../dates/day.ts';
import { EngineInputError } from '../errors.ts';
import type { Schedule } from '../schedule/types.ts';

/**
 * The schedule from a payment's new date on, as the owner set it out (D96):
 *
 * - weekly, every few weeks or an irregular weekly estimate: unchanged, so
 *   the later ones go on the new date's weekday, every so many weeks from it
 * - monthly, on any kind of day: the new date's day of the month, with the
 *   same months left out
 * - on chosen dates: only this payment's date changes in the list. Later
 *   series of the family keep their own dates (`later.ts`).
 * - once: unchanged, so the payment moves to the new date.
 *
 * `original` is the payment's date from its schedule and `day` the new one,
 * both before the weekend and bank holiday rule. The schedule must be checked
 * already, as a prepared series' schedule is.
 */
export function scheduleForNewDay(schedule: Schedule, original: Day, day: Day): Schedule {
  switch (schedule.kind) {
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
      const at = schedule.dates.findIndex((date) => parseDate(date) === original);
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
  }
}
