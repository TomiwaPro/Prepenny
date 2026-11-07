// A pay adjustment with its change alone (step 3c, PLAN.md item 28, D303):
// what a partner's phone has of someone else's overtime or missed shift.
// It's added to its payday like any other, and never worked out again on
// that phone; the shift's details stay on the phone of the person whose pay
// it is.

import { describe, expect, it } from 'vitest';
import {
  type EditCommand,
  type EditInput,
  EngineInputError,
  editPlan,
  hasShiftDetails,
  type PayAdjustment,
  type PlanInput,
  workOutPlan,
} from '../../src/index.ts';
import { edited } from '../fixtures/edit.ts';
import { englandAndWales } from '../fixtures/holidays.ts';
import { samPayPlan } from '../fixtures/pay.ts';
import { accountOf } from '../fixtures/plan.ts';

const amountOnly: PayAdjustment = { id: 'theirs', familyId: 'pay', number: 1, change: 15512 };

/** Sam's plan as a partner's phone would have it: his pay with someone's overtime as an amount. */
function partnerPlan(adjustments: readonly PayAdjustment[] = [amountOnly]): PlanInput {
  return samPayPlan({ payAdjustments: adjustments });
}

const asEdit = (plan: PlanInput): EditInput => ({
  ...plan,
  holidays: plan.holidays ?? englandAndWales,
});

const payOn = (plan: PlanInput, date: string) =>
  accountOf(workOutPlan(plan), 'current').rows.find(
    (row) => row.payment.seriesId === 'pay' && row.date === date,
  );

describe('a pay adjustment with its change alone', () => {
  it('has no details', () => {
    expect(hasShiftDetails(amountOnly)).toBe(false);
  });

  it('is added to its payday, as an estimate, like any other', () => {
    const without = payOn(partnerPlan([]), '2026-11-06');
    const withIt = payOn(partnerPlan(), '2026-11-06');
    expect(withIt?.payment.amount).toBe((without?.payment.amount ?? 0) + 15512);
    expect(withIt?.payment.payAdjustment).toBe(15512);
  });

  it('is refused with only some of its details', () => {
    const half = { ...amountOnly, hours: '3' } as PayAdjustment;
    expect(() => workOutPlan(partnerPlan([half]))).toThrow(EngineInputError);
  });

  it('is never worked out again, even when its pay week changes', () => {
    const command: EditCommand = {
      kind: 'change-pay-week',
      payWeekId: 'week-27',
      edits: { lines: [{ name: 'Basic', kind: 'basic', hours: '40', rate: '12.71' }] },
    };
    const { after } = edited(asEdit(partnerPlan()), command);
    expect(after.payAdjustments).toEqual([amountOnly]);
  });

  it("refuses overtime on a payday that has someone else's shift on it", () => {
    const command: EditCommand = {
      kind: 'overtime',
      id: 'mine',
      seriesId: 'pay',
      workedOn: '2026-10-26',
      hours: '1',
    };
    try {
      editPlan(asEdit(partnerPlan()), command);
      expect.unreachable('it should be refused');
    } catch (error) {
      expect((error as EngineInputError).code).toBe('not-your-pay');
    }
  });

  it('can be removed, leaving nothing to work out again', () => {
    const { after } = edited(asEdit(partnerPlan()), {
      kind: 'remove-pay-adjustment',
      id: 'theirs',
    });
    expect(after.payAdjustments).toEqual([]);
  });
});
