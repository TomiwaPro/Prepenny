// When an account's balance was checked, in one line: "£267.54, checked
// today" or "£267.54, checked Sun 25 Oct" (Coming up and Accounts), or in
// Sam's example, whose day never changes, "£267.54, as on Sun 25 Oct 2026",
// so the example never says "today" (D133, D448).

import { formatDay, formatDayAndYear } from './dates.ts';

export interface CheckedWords {
  checkedToday(amount: string): string;
  checked(amount: string, date: string): string;
  asOn(amount: string, date: string): string;
}

export function checkedLine(
  words: CheckedWords,
  balance: string,
  checkedOn: string,
  today: string,
  example: boolean,
): string {
  if (example) return words.asOn(balance, formatDayAndYear(checkedOn));
  return checkedOn === today
    ? words.checkedToday(balance)
    : words.checked(balance, formatDay(checkedOn, today));
}
