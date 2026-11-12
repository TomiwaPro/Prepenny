// "Download my data" as a spreadsheet (step 3h, lib/backup-csv.ts): Sam's
// figures as the plan works them out, a part for each kind of thing, and
// nothing a person typed can run as a formula when the file is opened.

import { describe, expect, it } from 'vitest';
import { samToday } from '../../../../packages/engine/test/fixtures/sam.ts';
import { examplePlan } from '../../data/example-plan.ts';
import { poundsCell, spreadsheetOf, timeCell } from '../../lib/backup-csv.ts';
import { strings } from '../../strings/en-GB.ts';

const t = strings.yourData.csv;

function sams(records = examplePlan) {
  return spreadsheetOf({
    records,
    today: samToday,
    now: '2026-10-25T13:05:00Z',
    account: null,
    people: null,
    history: [
      {
        at: '2026-10-25T09:00:00Z',
        words: 'You updated Current account to £267.54.',
        undone: false,
      },
    ],
  });
}

describe('The spreadsheet', () => {
  it("has Sam's lowest point: £4.53 left on Sun 1 Nov 2026, after rent (brief 8.3)", () => {
    const lines = sams().split('\r\n');
    expect(lines).toContain('2026-11-01,Current account,Rent,-600.00,4.53,');
  });

  it('starts with a mark saying it is UTF-8, then its title, with each part under a heading', () => {
    const text = sams();
    expect(
      text.startsWith('\ufeff"PrePenny: your data, downloaded at 1:05pm on Sun 25 Oct 2026"'),
    ).toBe(true);
    for (const heading of [t.accounts, t.comingUp, t.payments, t.debts, t.history]) {
      expect(text).toContain(`\r\n\r\n${heading}\r\n`);
    }
  });

  it("has each account's balance as the bank showed it", () => {
    expect(sams()).toContain('Current account,Current account,267.54,2026-10-25,0.00,20.00,No');
  });

  it("has the history in Activity's words, at the UK's time", () => {
    // Clocks went back at 1am that morning, so 9am UTC is 9am in the UK.
    expect(sams()).toContain('2026-10-25 09:00,You updated Current account to £267.54.,');
  });

  it("can't run a formula from anything a person typed, and quotes commas and quotes", () => {
    const records = {
      ...examplePlan,
      series: examplePlan.series.map((one, i) =>
        i === 0 ? { ...one, name: '=HYPERLINK("x")', note: 'Rent, "big" one' } : one,
      ),
    };
    const text = sams(records);
    expect(text).toContain('"\'=HYPERLINK(""x"")"');
    expect(text).toContain('"Rent, ""big"" one"');
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  it('writes amounts as plain numbers in pounds, and times as the UK clock shows them', () => {
    expect(poundsCell(26754)).toBe('267.54');
    expect(poundsCell(-3000)).toBe('-30.00');
    expect(poundsCell(5)).toBe('0.05');
    expect(poundsCell(-5)).toBe('-0.05');
    expect(timeCell('2026-07-01T09:30:00Z')).toBe('2026-07-01 10:30');
    expect(timeCell('2026-12-01T09:30:00Z')).toBe('2026-12-01 09:30');
  });

  it('has no long dashes', () => {
    expect(sams()).not.toMatch(/[–—]/);
  });
});
