// "Today" for a plan. The engine has no clock, so the app passes today in
// (brief Part 5). Sam's example plan always shows Sun 25 Oct 2026 (D133).

/** The day Sam's example plan always shows as today (D133). */
export const EXAMPLE_TODAY = '2026-10-25';

/** This phone's own date, "YYYY-MM-DD" (brief 5.1: today is the person's local date). */
export function localToday(now: Date = new Date()): string {
  const year = now.getFullYear().toString().padStart(4, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today for a plan: fixed for the example, this phone's date otherwise. */
export function todayFor(plan: { readonly isExample: boolean }, now: Date = new Date()): string {
  return plan.isExample ? EXAMPLE_TODAY : localToday(now);
}
