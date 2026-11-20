'use client';

// A plan shown read only, on the support screen (step 4j, D618): the plan
// someone let support see, exactly as their own phone gets it, or the plan
// copy they sent. Worked out by the same engine and views as their phone:
// each account with its bank balance and lowest point ahead, the next 3
// months of payments with what's left after each, and their debts. Nothing
// here can change anything: the rows don't open, and support isn't in the
// plan, so the database would refuse a change anyway.

import type { PlanRecords } from '@prepenny/engine';
import { dateTile, formatDay } from '../lib/dates.ts';
import { workOutDebtsView } from '../lib/debts-view.ts';
import { formatIn, formatMoney } from '../lib/money.ts';
import { workOutPlanView } from '../lib/plan-view.ts';
import { strings } from '../strings/en-GB.ts';
import { PaymentRow } from './PaymentRow.tsx';
import { secondLine } from './RowItem.tsx';
import styles from './Screens.module.css';

const t = strings.supportTools;

/** The plan's figures, or null when the engine can't work them out. */
function workedOut(records: PlanRecords, today: string) {
  try {
    return { plan: workOutPlanView(records, today), debts: workOutDebtsView(records, today) };
  } catch {
    return null;
  }
}

export function ReadOnlyPlan({
  records,
  today,
}: {
  readonly records: PlanRecords;
  readonly today: string;
}) {
  const found = workedOut(records, today);
  if (found === null) {
    return (
      <section className={styles.card}>
        <p className={styles.line}>{t.notAPlan}</p>
      </section>
    );
  }
  const day = (date: string) => formatDay(date, today);
  const open = found.debts.debts;
  return (
    <>
      {found.plan.accounts.map((account) => {
        const rows = account.periods.flatMap((period) => period.rows);
        return (
          <section
            key={account.id}
            className={styles.card}
            aria-labelledby={`plan-${account.id}`}
            data-testid="read-only-account"
          >
            <h2 id={`plan-${account.id}`} className={styles.cardTitle}>
              {account.name}
            </h2>
            <p className={`${styles.line} num`}>
              {t.accountChecked(formatMoney(account.balance), day(account.checkedOn))}
            </p>
            <p className={`${styles.line} num`}>
              {t.lowest(formatMoney(account.lowest.balance), day(account.lowest.date))}
            </p>
            <h3 className={styles.label}>{t.comingUp}</h3>
            {rows.length === 0 && account.notTickedYet.length === 0 ? (
              <p className={styles.second}>{t.nothingComing}</p>
            ) : (
              <ul className={styles.list}>
                {[...account.notTickedYet, ...rows].map((row) => (
                  <PaymentRow
                    key={row.key}
                    testId="read-only-row"
                    tile={dateTile(row.date)}
                    name={row.name}
                    second={
                      row.notTickedYet
                        ? t.notTicked(secondLine(row, today))
                        : secondLine(row, today)
                    }
                    amount={formatMoney(row.change, { sign: 'always' })}
                    moneyIn={row.change > 0}
                    left={strings.rows.left(formatMoney(row.leftAfter))}
                    status={row.status === 'ok' ? null : row.status}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {open.length === 0 ? null : (
        <section className={styles.card} aria-labelledby="plan-debts" data-testid="read-only-debts">
          <h2 id="plan-debts" className={styles.cardTitle}>
            {t.debtsHeading}
          </h2>
          <ul className={styles.list}>
            {open.map((debt) => (
              <li key={debt.id} className={styles.rowBody}>
                <span className={`${styles.line} num`}>
                  {t.debtLine(debt.name, formatIn(debt.leftNow, debt.currency))}
                </span>
                <span className={`${styles.second} num`}>
                  {debt.paidOffOn !== null
                    ? t.paidOffOn(day(debt.paidOffOn))
                    : debt.leftAtEnd !== null
                      ? t.stillOwed(formatIn(debt.leftAtEnd, debt.currency))
                      : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
