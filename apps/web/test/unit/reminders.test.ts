// Which reminders are due, and their words (step 4e, D560 to D565), on Sam's
// example plan, at UK times on both sides of the clock changes.

import { type PlanRecords, parsePounds as pounds } from '@prepenny/engine';
import { describe, expect, it } from 'vitest';
import { examplePlan } from '../../data/example-plan.ts';
import {
  isQuiet,
  NO_REMINDERS,
  type ReminderChoices,
  type RemindersInput,
  ukClock,
  workOutReminders,
} from '../../lib/reminders.ts';

const ALL: ReminderChoices = {
  payday: true,
  evening: true,
  shortfall: true,
  weekly: true,
  hideAmounts: false,
};

/** Dates keep their parts together with non-breaking spaces; plain spaces here, for reading. */
const plain = (text: string) => text.replaceAll('\u00a0', ' ');

function due(now: string, overrides: Partial<RemindersInput> = {}) {
  const found = workOutReminders({
    records: examplePlan,
    now,
    choices: ALL,
    knownShortfalls: [],
    ...overrides,
  });
  return { ...found, due: found.due.map((one) => ({ ...one, text: plain(one.text) })) };
}

const textsOf = (now: string, overrides: Partial<RemindersInput> = {}) =>
  Object.fromEntries(due(now, overrides).due.map((one) => [one.kind, one.text]));

/** Sam's rent on Sun 1 Nov as £640.00, so he's £35.47 short that day. */
const samShort: PlanRecords = {
  ...examplePlan,
  changes: (examplePlan.changes ?? []).map((one) =>
    one.seriesId === 'rent' ? { ...one, amount: pounds('640.00') } : one,
  ),
};

describe('the UK clock (D560)', () => {
  it('reads GMT in winter and BST in summer, by the rules, not by adding an hour', () => {
    // BST ended at 1am GMT on Sun 25 Oct 2026.
    expect(ukClock('2026-10-25T00:30:00Z')).toEqual({ date: '2026-10-25', hour: 1, minute: 30 });
    expect(ukClock('2026-10-25T01:30:00Z')).toEqual({ date: '2026-10-25', hour: 1, minute: 30 });
    expect(ukClock('2026-10-25T18:00:00Z')).toEqual({ date: '2026-10-25', hour: 18, minute: 0 });
    // BST starts at 1am GMT on Sun 28 Mar 2027.
    expect(ukClock('2027-03-28T00:59:00Z')).toEqual({ date: '2027-03-28', hour: 0, minute: 59 });
    expect(ukClock('2027-03-28T01:00:00Z')).toEqual({ date: '2027-03-28', hour: 2, minute: 0 });
    expect(ukClock('2027-03-28T17:00:00Z')).toEqual({ date: '2027-03-28', hour: 18, minute: 0 });
    // Late on a summer night is already tomorrow in the UK.
    expect(ukClock('2027-06-30T23:30:00Z')).toEqual({ date: '2027-07-01', hour: 0, minute: 30 });
  });

  it('has quiet hours from 9pm to 8am', () => {
    expect(isQuiet({ date: '2026-10-31', hour: 20, minute: 59 })).toBe(false);
    expect(isQuiet({ date: '2026-10-31', hour: 21, minute: 0 })).toBe(true);
    expect(isQuiet({ date: '2026-11-01', hour: 7, minute: 59 })).toBe(true);
    expect(isQuiet({ date: '2026-11-01', hour: 8, minute: 0 })).toBe(false);
  });
});

describe('nothing is sent until a reminder is turned on (D560)', () => {
  it('with every reminder off, nothing is due', () => {
    expect(due('2026-10-25T18:00:00Z', { choices: NO_REMINDERS }).due).toEqual([]);
    expect(
      due('2026-10-30T09:00:00Z', { choices: { ...NO_REMINDERS, hideAmounts: true } }).due,
    ).toEqual([]);
  });

  it('each reminder comes only when it is on', () => {
    expect(
      due('2026-10-25T19:00:00Z', { choices: { ...NO_REMINDERS, weekly: true } }).due.map(
        (one) => one.kind,
      ),
    ).toEqual(['weekly']);
    expect(
      due('2026-10-25T19:00:00Z', { choices: { ...NO_REMINDERS, evening: true } }).due.map(
        (one) => one.kind,
      ),
    ).toEqual(['evening']);
  });
});

describe('the evening before money goes out, at 7pm (D560, D565)', () => {
  it("keeps a date's parts together, so it never splits across two lines", () => {
    const [evening] = workOutReminders({
      records: examplePlan,
      now: '2026-10-29T19:00:00Z',
      choices: { ...NO_REMINDERS, evening: true },
      knownShortfalls: [],
    }).due;
    expect(evening?.text.endsWith('until Fri\u00a06\u00a0Nov.')).toBe(true);
  });

  it('Sat 31 Oct: rent, and the lowest until Friday', () => {
    expect(textsOf('2026-10-31T19:00:00Z').evening).toBe(
      "Rent goes out tomorrow. You'll have £4.53 left until Friday.",
    );
    expect(due('2026-10-31T19:00:00Z').due.find((one) => one.kind === 'evening')?.key).toBe(
      '2026-11-01',
    );
  });

  it('names the biggest, with how many more, and the lowest until payday', () => {
    // Mon 26 Oct: Family loan £125.00 and a driving lesson £100.00. The
    // lowest from Mon 26 to Thu 29 Oct is £12.54, on Mon 26 Oct (D3).
    expect(textsOf('2026-10-25T19:00:00Z').evening).toBe(
      "Family loan and 1 more go out tomorrow. You'll have £12.54 left until Friday.",
    );
  });

  it("gives the payday's date when it's more than a week away", () => {
    // Thu 29 Oct: tomorrow is payday, so the next one after it is Fri 6 Nov,
    // 7 days on. The lowest from Fri 30 Oct to Thu 5 Nov is £4.53 on Sun 1 Nov.
    expect(textsOf('2026-10-29T19:00:00Z').evening).toBe(
      "Spending money goes out tomorrow. You'll have £4.53 left until Fri 6 Nov.",
    );
  });

  it('says short instead, with the first short day', () => {
    expect(textsOf('2026-10-31T19:00:00Z', { records: samShort }).evening).toBe(
      "Rent goes out tomorrow. You'll be £35.47 short on Sun 1 Nov.",
    );
  });

  it('with amounts hidden, says only what goes out (D561)', () => {
    const hidden = { choices: { ...ALL, hideAmounts: true } };
    expect(textsOf('2026-10-31T19:00:00Z', hidden).evening).toBe('Rent goes out tomorrow.');
    expect(textsOf('2026-10-25T19:00:00Z', hidden).evening).toBe(
      'Family loan and 1 more go out tomorrow.',
    );
  });

  it('never counts money moved between his own accounts', () => {
    // Tue 27 Oct evening: only the £500.00 from savings on Wed 28 Oct.
    expect(textsOf('2026-10-27T19:00:00Z').evening).toBeUndefined();
  });

  it('comes from 7pm, and not in quiet hours', () => {
    expect(textsOf('2026-10-31T18:59:00Z').evening).toBeUndefined();
    expect(textsOf('2026-10-31T20:59:00Z').evening).toBeDefined();
    expect(textsOf('2026-10-31T21:00:00Z').evening).toBeUndefined();
  });
});

describe('the weekly summary, on Sundays at 6pm (D560, D565)', () => {
  it("Sam's week from Mon 26 Oct, on the day the clocks went back", () => {
    // At 6pm GMT: 18:00 UTC. The £500.00 from savings isn't counted.
    expect(textsOf('2026-10-25T18:00:00Z').weekly).toBe(
      'This week: 5 payments going out, £1,336.07 in all. Lowest point ahead: £4.53 on Sun 1 Nov.',
    );
    expect(due('2026-10-25T18:00:00Z').due.find((one) => one.kind === 'weekly')?.key).toBe(
      '2026-10-26',
    );
    // 5pm GMT isn't 6pm, even though it would have been in summer.
    expect(textsOf('2026-10-25T17:00:00Z').weekly).toBeUndefined();
  });

  it('with amounts hidden, the count and the date only (D561)', () => {
    expect(textsOf('2026-10-25T18:00:00Z', { choices: { ...ALL, hideAmounts: true } }).weekly).toBe(
      'This week: 5 payments going out. Lowest point ahead: Sun 1 Nov.',
    );
  });

  it('at 6pm BST in summer: 5pm UTC', () => {
    // Sun 28 Mar 2027, the day the clocks go forward.
    expect(textsOf('2027-03-28T16:59:00Z').weekly).toBeUndefined();
    expect(textsOf('2027-03-28T17:00:00Z').weekly).toMatch(/^This week: /);
  });

  it('only on a Sunday', () => {
    expect(textsOf('2026-10-31T18:00:00Z').weekly).toBeUndefined();
  });
});

describe('payday, at 9am (D560)', () => {
  it('Fri 30 Oct, at 9am GMT', () => {
    expect(textsOf('2026-10-30T08:59:00Z').payday).toBeUndefined();
    expect(textsOf('2026-10-30T09:00:00Z').payday).toBe('Payday: update your balance.');
    expect(due('2026-10-30T09:00:00Z').due.find((one) => one.kind === 'payday')?.key).toBe(
      '2026-10-30',
    );
  });

  it('Fri 2 Apr 2027, at 9am BST: 8am UTC', () => {
    expect(textsOf('2027-04-02T07:59:00Z').payday).toBeUndefined();
    expect(textsOf('2027-04-02T08:00:00Z').payday).toBe('Payday: update your balance.');
  });

  it("not on a day that isn't payday", () => {
    expect(textsOf('2026-10-31T09:00:00Z').payday).toBeUndefined();
  });

  it('not once the pay is ticked, or the balance updated today', () => {
    const ticked: PlanRecords = {
      ...examplePlan,
      ticks: [
        {
          seriesId: 'pay',
          originalDate: '2026-10-30',
          tickedAt: '2026-10-30T08:00:00Z',
          paidOn: '2026-10-30',
        },
      ],
    };
    expect(textsOf('2026-10-30T09:00:00Z', { records: ticked }).payday).toBeUndefined();
    const updated: PlanRecords = {
      ...examplePlan,
      balanceUpdates: [
        ...examplePlan.balanceUpdates,
        {
          id: 'current-30-oct',
          accountId: 'current',
          balance: pounds('600.00'),
          checkedOn: '2026-10-30',
          checkedAt: '2026-10-30T08:10:00Z',
        },
      ],
    };
    expect(textsOf('2026-10-30T09:00:00Z', { records: updated }).payday).toBeUndefined();
  });
});

describe('a shortfall, when it first appears and the day before (D560, D565)', () => {
  const current = { accountId: 'current', date: '2026-11-01' };

  it('when it first appears', () => {
    const now = due('2026-10-26T10:00:00Z', { records: samShort });
    expect(now.due.find((one) => one.kind === 'shortfall')).toEqual({
      kind: 'shortfall',
      key: '2026-10-26',
      text: "You'll be £35.47 short on Sun 1 Nov.",
      shortfall: current,
    });
    // Not known yet: it's added once its warning has gone.
    expect(now.stillKnown).toEqual([]);
  });

  it('not again while it is known, until 9am the day before', () => {
    const known = { records: samShort, knownShortfalls: [current] };
    expect(textsOf('2026-10-27T10:00:00Z', known).shortfall).toBeUndefined();
    expect(due('2026-10-27T10:00:00Z', known).stillKnown).toEqual([current]);
    expect(textsOf('2026-10-31T08:59:00Z', known).shortfall).toBeUndefined();
    expect(textsOf('2026-10-31T09:00:00Z', known).shortfall).toBe(
      "You'll be £35.47 short on Sun 1 Nov.",
    );
  });

  it('with amounts hidden, the date only (D561)', () => {
    expect(
      textsOf('2026-10-26T10:00:00Z', {
        records: samShort,
        choices: { ...ALL, hideAmounts: true },
      }).shortfall,
    ).toBe("You'll be short on Sun 1 Nov.");
  });

  it('waits for 8am when it appears in quiet hours', () => {
    expect(due('2026-10-26T22:00:00Z', { records: samShort }).due).toEqual([]);
    expect(due('2026-10-27T07:59:00Z', { records: samShort }).due).toEqual([]);
    expect(textsOf('2026-10-27T08:00:00Z', { records: samShort }).shortfall).toBe(
      "You'll be £35.47 short on Sun 1 Nov.",
    );
  });

  it('one that has gone away is forgotten, so if it comes back it is new again', () => {
    expect(due('2026-10-27T10:00:00Z', { knownShortfalls: [current] }).stillKnown).toEqual([]);
  });

  it('names the account when it is not the one the main pay comes into', () => {
    const savingsShort: PlanRecords = {
      ...examplePlan,
      series: examplePlan.series.map((one) =>
        one.id === 'from-savings' ? { ...one, amount: pounds('520.00') } : one,
      ),
    };
    expect(textsOf('2026-10-26T10:00:00Z', { records: savingsShort }).shortfall).toBe(
      'Savings will be £20.00 short on Wed 28 Oct.',
    );
  });
});
