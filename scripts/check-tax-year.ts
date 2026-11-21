// The tax year check GitHub runs (brief 4.15, D45, step 4j, D625). From 1
// March, says if the pay calculator has no tax file for the tax year that
// starts on the coming 6 April, as the support screen does.
//
// - In the Check workflow, on every pull request and on main: a yellow
//   warning only, so nothing is held up while step 4r waits for GOV.UK.
// - In the Tax year workflow, every morning: with --fail, it fails (red),
//   so GitHub emails the owner until the file is added.
//
// "Today" is the UK's date, or --today YYYY-MM-DD for the tests.
//
// Usage: node scripts/check-tax-year.ts [--fail] [--today YYYY-MM-DD]

import { taxYearWords } from '../apps/web/lib/tax-year-check.ts';

/** Today's date in the UK, "YYYY-MM-DD". */
export function ukToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** What the check prints, and whether it fails, for a day. */
export function taxYearCheck(
  today: string,
  fail: boolean,
): { readonly lines: readonly string[]; readonly failed: boolean } {
  const found = taxYearWords(today);
  // The words have non-breaking spaces in dates, as on screen; plain ones here.
  const plain = found.lines.map((line) => line.replaceAll(' ', ' '));
  if (found.missing.length === 0) return { lines: plain, failed: false };
  const kind = fail ? 'error' : 'warning';
  return { lines: plain.map((line) => `::${kind} title=Tax year::${line}`), failed: fail };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--today');
  const today = at >= 0 ? (args[at + 1] ?? '') : ukToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    console.error('--today needs a date, YYYY-MM-DD.');
    process.exit(2);
  }
  const result = taxYearCheck(today, args.includes('--fail'));
  for (const line of result.lines) console.log(line);
  if (result.failed) process.exit(1);
}
