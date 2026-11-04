'use client';

// Budgets, under More (brief 4.5, D29 to D32, D152): what it's for in one
// plain sentence (D213), then each budget with what's spent and left this
// week or month, anything that rolled over as "£25 + £7 from last week"
// (D30), and for a pay-later card what's left on the card and its bill
// (D61). Each can be changed or ended, and new ones added.

import { useState } from 'react';
import { formatDay } from '../lib/dates.ts';
import { formatMoney } from '../lib/money.ts';
import type { BudgetCard } from '../lib/money-views.ts';
import { strings } from '../strings/en-GB.ts';
import { BudgetSheet } from './BudgetSheet.tsx';
import formStyles from './Form.module.css';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { useScreenView } from './useScreenView.ts';

const t = strings.budgets;

function leavesWords(budget: BudgetCard): string {
  if (budget.leaves === 'pay-later') {
    return t.payLater(strings.dates.ordinal(budget.budget.billDay ?? 1));
  }
  if (budget.leaves === 'spread') {
    return budget.current.perDay === null
      ? t.spreadNoDay
      : t.spread(formatMoney(budget.current.perDay));
  }
  return t.atStart;
}

function Budget({
  budget,
  today,
  onChange,
}: {
  readonly budget: BudgetCard;
  readonly today: string;
  readonly onChange: () => void;
}) {
  const day = (date: string) => formatDay(date, today);
  const current = budget.current;
  const base = formatMoney(current.base);
  const bill = current.bill;
  return (
    <section
      className={styles.card}
      aria-labelledby={`budget-${budget.id}`}
      data-testid="budget"
      data-budget={budget.name}
    >
      <h2 id={`budget-${budget.id}`} className={styles.cardTitle}>
        {budget.name}
      </h2>
      <p className={`${styles.line} num`}>
        {(budget.every === 'week' ? t.aWeek : t.aMonth)(base, budget.accountName)}
      </p>
      <p className={styles.second}>{leavesWords(budget)}</p>
      {budget.rollOver ? <p className={styles.second}>{t.rollOverOn}</p> : null}
      <div className={styles.panel}>
        <h3 className={styles.label}>
          {budget.startsLater
            ? t.startsOn(day(current.start))
            : (budget.every === 'week' ? t.thisWeek : t.thisMonth)(day(current.end))}
        </h3>
        <dl className={styles.totals}>
          <div className={styles.total}>
            <dt>{t.spent}</dt>
            <dd className="num">{formatMoney(current.spent)}</dd>
          </div>
          <div className={styles.total}>
            <dt>{t.left}</dt>
            <dd className="num">{formatMoney(current.left)}</dd>
          </div>
        </dl>
        {current.rolledOver === 0 ? null : (
          <p className={`${styles.second} num`} data-testid="rolled-over">
            {(budget.every === 'week' ? t.rolledOverWeek : t.rolledOverMonth)(
              formatMoney(current.base, { wholePounds: true }),
              formatMoney(current.rolledOver, { wholePounds: true }),
            )}
          </p>
        )}
      </div>
      {budget.leaves === 'pay-later' ? (
        <>
          <p className={`${styles.line} num`}>
            {t.payLaterLeft(formatMoney(current.left), day(current.end))}
          </p>
          {bill === null ? null : (
            <p className={`${styles.second} num`}>
              {(bill.isEstimate ? t.billEstimate : t.bill)(
                day(bill.date),
                formatMoney(bill.amount),
              )}
            </p>
          )}
        </>
      ) : null}
      <button
        type="button"
        className={formStyles.outlined}
        aria-haspopup="dialog"
        onClick={onChange}
      >
        {t.change(budget.name)}
      </button>
    </section>
  );
}

export function BudgetsScreen() {
  const { view, failed } = useScreenView('budgets');
  // The budget being changed, "new" for a new one, or null when no sheet is open.
  const [editing, setEditing] = useState<string | null>(null);
  const changing =
    editing === null || editing === 'new'
      ? null
      : (view?.budgets.find((one) => one.id === editing) ?? null);
  return (
    <>
      <ScreenHeader
        heading={t.heading}
        purpose={t.purpose}
        back={{ label: t.back, href: '/app/more/' }}
      />
      {view === null ? (
        <p className={styles.card} role={failed ? 'alert' : undefined}>
          {failed ? strings.errors.plan : t.loading}
        </p>
      ) : view.budgets.length === 0 ? (
        <section className={styles.card} data-testid="no-budgets">
          <h2 className={styles.cardTitle}>{t.none}</h2>
          <p className={styles.line}>{t.noneLine}</p>
        </section>
      ) : (
        view.budgets.map((budget) => (
          <Budget
            key={budget.id}
            budget={budget}
            today={view.today}
            onChange={() => setEditing(budget.id)}
          />
        ))
      )}
      <button
        type="button"
        className={formStyles.main}
        aria-haspopup="dialog"
        onClick={() => setEditing('new')}
      >
        {t.add}
      </button>
      <BudgetSheet
        open={editing === 'new' || changing !== null}
        budget={changing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
