// The tax year check (D45, D625): quiet until 1 March, then it says which
// file is missing, as a warning, or as a failure with --fail.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taxYearCheck, ukToday } from './check-tax-year.ts';

test('before 1 March, every file the pay calculator needs is there', () => {
  assert.deepEqual(taxYearCheck('2027-02-28', true), {
    lines: ['The pay calculator has the tax file for every tax year it needs now.'],
    failed: false,
  });
});

test("from 1 March, next year's missing file is a warning on pull requests", () => {
  assert.deepEqual(taxYearCheck('2027-03-01', false), {
    lines: [
      '::warning title=Tax year::The pay calculator has no tax file for the 2027 to 2028 tax year, which starts on Tue 6 Apr 2027. Ask Claude Code to add it (step 4r) before then.',
    ],
    failed: false,
  });
});

test('and a failure in the daily check, so GitHub emails the owner', () => {
  const result = taxYearCheck('2027-03-01', true);
  assert.equal(result.failed, true);
  assert.match(result.lines[0] ?? '', /^::error title=Tax year::/);
});

test('from 6 April it is this tax year that is missing', () => {
  assert.match(taxYearCheck('2027-04-06', false).lines[0] ?? '', /2027 to 2028 tax year/);
});

test("today is the UK's date: just after midnight in summer, it's already the next day", () => {
  assert.equal(ukToday(new Date('2027-03-31T23:30:00Z')), '2027-04-01');
  assert.equal(ukToday(new Date('2027-01-31T23:30:00Z')), '2027-01-31');
});
