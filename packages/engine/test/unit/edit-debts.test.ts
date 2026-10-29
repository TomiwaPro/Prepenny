// "Update from statement" as an edit (step 1d, brief 4.6, D62, D103): owner
// test 4 made with real edits, ticks made inside its steps, and one undo.

import { describe, expect, it } from 'vitest';
import {
  type DebtPlan,
  type EditCommand,
  type EditInput,
  EngineInputError,
  editPlan,
  formatPounds,
  workOutDebts,
  workOutPlan,
} from '../../src/index.ts';
import { canonical, edited, editedInTurn } from '../fixtures/edit.ts';
import { accountOf, pounds } from '../fixtures/plan.ts';
import { samDebts, samPlan } from '../fixtures/sam.ts';

// Sam's plan with his debts, on Mon 26 Oct 2026. The UK is on GMT after the
// clocks went back on Sun 25 Oct, so 9am is 09:00Z and 6pm is 18:00Z.
const sam: EditInput & { to: string } = { ...samPlan({ today: '2026-10-26' }), debts: samDebts };

function familyLoan(input: EditInput & { to: string }): DebtPlan {
  const plan = workOutDebts({ ...input, debts: input.debts ?? [] });
  return plan.debts.find((one) => one.debt.id === 'family-loan') as DebtPlan;
}

const tickAt = (time: string): EditCommand => ({
  kind: 'tick',
  seriesId: 'family-loan-first',
  originalDate: '2026-10-26',
  tickedAt: `2026-10-26T${time}Z`,
});

const statementAt = (time: string, balance: string): EditCommand => ({
  kind: 'update-from-statement',
  debtId: 'family-loan',
  balance: pounds(balance),
  balanceOn: '2026-10-26',
  balanceAt: `2026-10-26T${time}Z`,
});

function refusedWith(code: string, input: EditInput, command: EditCommand): void {
  let error: unknown = null;
  try {
    editPlan(input, command);
  } catch (caught) {
    error = caught;
  }
  expect(error, `expected a refusal: ${code}`).toBeInstanceOf(EngineInputError);
  expect((error as EngineInputError).code).toBe(code);
  expect((error as Error).message).not.toMatch(/Family loan|1255|1,255|125\.00/);
}

describe('owner test 4, with real edits (D27, D62)', () => {
  it('a. tick the Mon 26 Oct payment at 9am: left now is €1,255.42', () => {
    expect(formatPounds(familyLoan(editedInTurn(sam, [tickAt('09:00:00')])).leftNow)).toBe(
      '1255.42',
    );
  });

  it('b. then update from a statement at 6pm showing €1,255.42: left now stays €1,255.42', () => {
    const after = editedInTurn(sam, [tickAt('09:00:00'), statementAt('18:00:00', '1255.42')]);
    const loan = familyLoan(after);
    expect(formatPounds(loan.leftNow)).toBe('1255.42');
    expect(loan.paidOffOn).toBe('2027-01-01');
    expect(after.debts?.find((one) => one.id === 'family-loan')).toMatchObject({
      balance: pounds('1255.42'),
      balanceOn: '2026-10-26',
      balanceAt: '2026-10-26T18:00:00Z',
      startingBalance: pounds('2396.93'),
    });
  });

  it('c. the other way round, a statement at 9am showing €1,400.57 then the tick at 6pm: €1,255.42', () => {
    const after = editedInTurn(sam, [statementAt('09:00:00', '1400.57'), tickAt('18:00:00')]);
    expect(formatPounds(familyLoan(after).leftNow)).toBe('1255.42');
  });
});

describe('D103: Update from statement is one edit', () => {
  const withTick: EditCommand = {
    ...statementAt('18:00:00', '1255.42'),
    ticks: [
      {
        seriesId: 'family-loan-first',
        originalDate: '2026-10-26',
        tickedAt: '2026-10-26T18:00:40Z',
      },
    ],
  } as EditCommand;

  it('counts a payment ticked in its steps as inside the new balance, though its time is later (D62)', () => {
    const { edit, after } = edited(sam, withTick);
    expect(formatPounds(familyLoan(after).leftNow)).toBe('1255.42');
    expect(after.ticks).toEqual([
      {
        seriesId: 'family-loan-first',
        originalDate: '2026-10-26',
        tickedAt: '2026-10-26T18:00:40Z',
        paidOn: '2026-10-26',
        inDebtUpdate: 'family-loan',
      },
    ]);
    expect(edit.writes.map((write) => write.kind)).toEqual(['tick', 'debt']);
  });

  it('still takes the ticked payment out of the bank account as a normal tick (D83)', () => {
    const { after } = edited(sam, withTick);
    // The current account was last updated on Sun 25 Oct, so a tick on Mon 26 Oct isn't inside it.
    const rows = accountOf(workOutPlan(after)).rows.filter(
      (row) => row.payment.seriesId === 'family-loan-first',
    );
    expect(rows[0]).toMatchObject({
      date: '2026-10-26',
      ticked: true,
      leftAfter: pounds('112.54'),
    });
  });

  it('is undone in one step, the tick and the statement together', () => {
    const { edit, after } = edited(sam, withTick);
    const back = edited(after, { kind: 'undo', edit }).after;
    expect(canonical(back)).toEqual(canonical(sam));
    expect(back.debts).toEqual(sam.debts);
    expect(formatPounds(familyLoan(back).leftNow)).toBe('1400.57');
  });

  it("refuses an undo once the debt's statement has been updated again", () => {
    const { edit, after } = edited(sam, statementAt('09:00:00', '1400.57'));
    const later = edited(after, statementAt('10:00:00', '1300.00')).after;
    refusedWith('changed-since', later, { kind: 'undo', edit });
  });

  it('leaves debts out of the records when an edit has none to change', () => {
    const { debts: _, ...withoutDebts } = sam;
    const { after } = edited(withoutDebts, tickAt('09:00:00'));
    expect('debts' in after).toBe(false);
  });

  it('refuses what it cannot do, with no money data in the message', () => {
    refusedWith('unknown-debt', sam, {
      ...statementAt('18:00:00', '1255.42'),
      debtId: 'nope',
    } as EditCommand);
    const { debts: _, ...withoutDebts } = sam;
    refusedWith('unknown-debt', withoutDebts, statementAt('18:00:00', '1255.42'));
    refusedWith('balance-after-today', sam, {
      ...statementAt('18:00:00', '1255.42'),
      balanceOn: '2026-10-27',
    } as EditCommand);
    refusedWith('statement-not-newer', sam, {
      ...statementAt('18:00:00', '1255.42'),
      balanceAt: '2026-10-25T08:30:00Z',
    } as EditCommand);
    refusedWith('negative-pence', sam, {
      ...statementAt('18:00:00', '1255.42'),
      balance: -1,
    } as EditCommand);
    // Only payments linked to this debt can be ticked in its steps.
    refusedWith('not-linked', sam, {
      ...statementAt('18:00:00', '1255.42'),
      ticks: [
        {
          seriesId: 'driving-lessons',
          originalDate: '2026-10-26',
          tickedAt: '2026-10-26T18:00:40Z',
        },
      ],
    } as EditCommand);
    refusedWith('already-ticked', editedInTurn(sam, [tickAt('09:00:00')]), withTick);
  });
});
