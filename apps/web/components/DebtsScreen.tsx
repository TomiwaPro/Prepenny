'use client';

// The Debts tab (brief 4.6, the Debts sketch in ARCHITECTURE.md 4.6): what
// it's for in one plain sentence (D213), Owed now across every open debt
// (D99), then each debt in the order it's paid off, with what's left now,
// "Paid off on" or what's still left at the end, looking 24 months ahead
// (D43), its progress and "Estimate" where it depends on one (D100). Each
// opens its own page. With no debts, it says so, with "Add a debt".

import Link from 'next/link';
import { useState } from 'react';
import { formatDay } from '../lib/dates.ts';
import type { DebtsView, DebtView } from '../lib/debts-view.ts';
import { formatIn, formatMoney, perPoundWords } from '../lib/money.ts';
import { recordAddress } from '../lib/record-id.ts';
import { strings } from '../strings/en-GB.ts';
import { DebtSheet } from './DebtSheet.tsx';
import formStyles from './Form.module.css';
import { EstimateTag, ProgressBar, ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { useScreenView } from './useScreenView.ts';

const t = strings.debts;

/** "Paid off on Thu 29 Oct", "Paid off", or "£225.25 still left on Wed 25 Oct 2028". */
export function paidOffWords(debt: DebtView, view: { today: string; to: string }): string {
  const day = (date: string) => formatDay(date, view.today);
  if (debt.paidOffNow) return t.paidOff;
  if (debt.paidOffOn !== null) return t.paidOffOn(day(debt.paidOffOn));
  return t.stillLeft(formatIn(debt.leftAtEnd ?? debt.leftNow, debt.currency), day(view.to));
}

function DebtItem({ debt, view }: { readonly debt: DebtView; readonly view: DebtsView }) {
  return (
    <li data-testid="debt" data-debt={debt.name}>
      <Link className={styles.rowLink} href={recordAddress('/app/debt/', debt.id)}>
        <span className={styles.rowBody}>
          <span className={styles.rowTop}>
            <span className={styles.rowName}>{debt.name}</span>
            <span className={`${styles.rowAmount} num`}>
              {formatIn(debt.leftNow, debt.currency)}
            </span>
          </span>
          {debt.currency === 'GBP' ? null : (
            <span className={`${styles.second} num`}>
              {t.about(formatMoney(debt.leftNowInPounds))}
            </span>
          )}
          <span className={styles.line}>
            {debt.closed ? t.closedLine : paidOffWords(debt, view)}
          </span>
          {debt.isEstimate && !debt.closed ? (
            <span>
              <EstimateTag />
            </span>
          ) : null}
          <ProgressBar percent={debt.percentPaid} words={t.percentPaid(debt.percentPaid)} />
        </span>
        <span className={styles.arrow} aria-hidden="true" />
      </Link>
    </li>
  );
}

export function DebtsScreen() {
  const { view, failed } = useScreenView('debts');
  const [adding, setAdding] = useState(false);
  return (
    <>
      <ScreenHeader heading={t.heading} purpose={t.purpose} />
      {view === null ? (
        <p className={styles.card} role={failed ? 'alert' : undefined}>
          {failed ? strings.errors.plan : t.loading}
        </p>
      ) : view.debts.length === 0 && view.closed.length === 0 ? (
        <section className={styles.card} data-testid="no-debts">
          <h2 className={styles.cardTitle}>{t.noDebts}</h2>
          <p className={styles.line}>{t.noDebtsLine}</p>
        </section>
      ) : (
        <>
          <section className={styles.card} data-testid="owed-now">
            <div className={styles.cardHead}>
              <h2 className={styles.label}>{t.owedNow}</h2>
              {view.owedNowIsEstimate ? <EstimateTag /> : null}
            </div>
            <p className={`${styles.figure} num`}>{formatMoney(view.owedNow)}</p>
            <p className={styles.second}>
              {[
                t.count(view.debts.length),
                ...view.rates.map((one) =>
                  t.countedAt(one.name, perPoundWords(one.rate, one.currency)),
                ),
              ].join(' ')}
            </p>
          </section>
          {view.debts.length === 0 ? null : (
            <section className={styles.card} aria-labelledby="each-debt">
              <h2 id="each-debt" className={styles.cardTitle}>
                {t.eachDebt}
              </h2>
              <p className={styles.second}>{t.eachDebtIntro}</p>
              <ul className={styles.list} data-testid="debts">
                {view.debts.map((debt) => (
                  <DebtItem key={debt.id} debt={debt} view={view} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <button
        type="button"
        className={formStyles.main}
        aria-haspopup="dialog"
        onClick={() => setAdding(true)}
      >
        {t.add}
      </button>
      {view !== null && view.closed.length > 0 ? (
        <section className={styles.card} aria-labelledby="closed-debts">
          <h2 id="closed-debts" className={styles.cardTitle}>
            {t.closedHeading}
          </h2>
          <ul className={styles.list}>
            {view.closed.map((debt) => (
              <DebtItem key={debt.id} debt={debt} view={view} />
            ))}
          </ul>
        </section>
      ) : null}
      <DebtSheet open={adding} debt={null} onClose={() => setAdding(false)} />
    </>
  );
}
