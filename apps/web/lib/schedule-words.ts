// How often a payment happens, in words, for the cards setup shows of what
// it has added (step 2e): "monthly on the 1st", "every Friday", "every 3
// months on the 5th, not in February and March".

import type { Schedule, Series } from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';
import { formatDay, weekdayName } from './dates.ts';

const t = strings.setup.often;

/** "February and March", "January, February and March". */
function listOf(words: readonly string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/** How often a schedule repeats, from its first date. */
export function oftenWords(schedule: Schedule, start: string, today: string): string {
  switch (schedule.kind) {
    case 'once':
      return t.once(formatDay(start, today));
    case 'weekly':
      return schedule.every === 1
        ? t.weekly(weekdayName(start))
        : t.everyWeeks(schedule.every, weekdayName(start));
    case 'irregular':
      return t.irregular(weekdayName(start));
    case 'dates':
      return t.dates(listOf(schedule.dates.map((date) => formatDay(date, today))));
    case 'monthly': {
      const on = schedule.on;
      let words: string;
      if (on.kind === 'last-day') words = t.monthlyLastDay;
      else if (on.kind === 'last-working-day') words = t.monthlyLastWorkingDay;
      else if (on.kind === 'weekday') {
        const position =
          on.position === 'last'
            ? strings.addPayment.last
            : (strings.addPayment.positions[on.position - 1] ?? '');
        words = t.monthlyWeekday(position, strings.dates.weekdaysLong[on.weekday - 1] ?? '');
      } else {
        const day = strings.dates.ordinal(on.day);
        words = schedule.every === 1 ? t.monthlyDay(day) : t.everyMonthsDay(schedule.every, day);
      }
      const left = schedule.leaveOut ?? [];
      return left.length === 0
        ? words
        : `${words}${t.leaveOut(listOf(left.map((month) => strings.dates.monthsLong[month - 1] ?? '')))}`;
    }
  }
}

/** How often a series repeats, and its next date: "monthly on the 1st, next Sun 1 Nov". */
export function seriesWords(series: Series, today: string): string {
  const often = oftenWords(series.schedule, series.start, today);
  return series.schedule.kind === 'once' ? often : t.next(often, formatDay(series.start, today));
}
