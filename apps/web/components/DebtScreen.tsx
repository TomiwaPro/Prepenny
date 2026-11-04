'use client';

// One debt (brief 4.6, the "One debt" sketch in ARCHITECTURE.md 4.6), at
// /app/debt/?id=… (ARCHITECTURE.md 5): what's left now, in both currencies
// for a debt in another one (D99), "Paid off on" and its progress, a credit
// card's interest and minimum as estimates (D101, D104, D106), every linked
// payment with what's left after it, and the actions: Update from statement
// (D62, D103), Change the rate, Add a payment, Change its details and
// Close. A payment bigger than what's left says by how much, with the one-tap
// fix "Make it £20.99 and stop after it" (D63). A credit card with a
// statement day can compare ways to pay, as numbers only (D102).

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { dateTile, formatDay } from '../lib/dates.ts';
import type { DebtPaymentView, DebtRowView, DebtsView, DebtView } from '../lib/debts-view.ts';
import { formatIn, formatMoney, perPoundWords } from '../lib/money.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { strings } from '../strings/en-GB.ts';
import { AddPaymentSheet } from './AddPaymentSheet.tsx';
import { CompareCard } from './CompareCard.tsx';
import { ConfirmSheet } from './ConfirmSheet.tsx';
import { DebtSheet } from './DebtSheet.tsx';
import { paidOffWords } from './DebtsScreen.tsx';
import { Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { focusUndoBar } from './focusUndo.ts';
import { PaymentRow } from './PaymentRow.tsx';
import { usePlanActions } from './PlanProvider.tsx';
import { RateSheet } from './RateSheet.tsx';
import { EstimateTag, ProgressBar, ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { StatementSheet } from './StatementSheet.tsx';
import { useScreenView } from './useScreenView.ts';

const t = strings.debt;

type Open = 'statement' | 'rate' | 'payment' | 'details' | 'close' | null;

/** The one-tap fix under a payment that's more than what's left (D63). */
function Fix({ row }: { readonly row: DebtPaymentView }) {
  const { makeChanges } = usePlanActions();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fix = row.fix;
  if (fix === null) return null;
  const amount = formatMoney(fix.amount);
  return (
    <div className={formStyles.withHint} data-testid="fix">
      <button
        type="button"
        className={formStyles.outlined}
        aria-disabled={busy}
        aria-describedby={`fix-${row.key.replace(/\W/g, '-')}`}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setProblem(null);
          const message = t.fixed(row.name, amount);
          const outcome = await makeChanges(fix.commands, message);
          setBusy(false);
          if (outcome.ok) focusUndoBar(message);
          else setProblem(refusalMessage(outcome.code));
        }}
      >
        {t.fix(amount)}
      </button>
      <p id={`fix-${row.key.replace(/\W/g, '-')}`} className={formStyles.hint}>
        {t.fixHint}
      </p>
      <Problem text={problem} />
    </div>
  );
}

function Row({
  row,
  debt,
  today,
}: {
  readonly row: DebtRowView;
  readonly debt: DebtView;
  readonly today: string;
}) {
  const day = formatDay(row.date, today);
  const left = (amount: number, paidOff: boolean) =>
    paidOff ? strings.debts.paidOff : t.left(formatIn(amount, debt.currency));
  if (row.kind === 'statement') {
    return (
      <PaymentRow
        testId="debt-row"
        tile={dateTile(row.date)}
        name={t.interestRow}
        second={day}
        third={row.minimum === null ? null : t.minimumRow(formatIn(row.minimum, debt.currency))}
        amount={`+${formatIn(row.interest, debt.currency)}`}
        moneyIn={false}
        left={left(row.leftAfter, false)}
        status={null}
      />
    );
  }
  const when = row.ticked
    ? strings.rows.paid(day)
    : row.isEstimate
      ? strings.rows.estimate(day)
      : day;
  return (
    <PaymentRow
      testId="debt-row"
      tile={dateTile(row.date)}
      name={row.name}
      second={
        debt.currency === 'GBP' ? when : t.secondForeign(when, formatIn(row.inDebt, debt.currency))
      }
      third={
        row.moreThanLeft === null ? null : t.moreThanLeft(formatIn(row.moreThanLeft, debt.currency))
      }
      amount={formatMoney(-row.amount)}
      moneyIn={false}
      left={left(row.leftAfter, row.paidOff)}
      status={null}
      extra={<Fix row={row} />}
    />
  );
}

function CardDetails({ debt, today }: { readonly debt: DebtView; readonly today: string }) {
  const card = debt.card;
  if (card === null) return null;
  const money = (amount: number) => formatIn(amount, debt.currency);
  const lines: string[] = [];
  lines.push(card.interestRate === null ? t.noRate : t.rateAYear(card.interestRate));
  if (card.zeroInterestUntil !== null) {
    lines.push(t.zeroUntil(formatDay(card.zeroInterestUntil, today)));
  }
  if (card.statementDay !== null) {
    lines.push(t.statementDay(strings.dates.ordinal(card.statementDay)));
  }
  const rule = card.minimumRule;
  if (rule?.kind === 'rule') lines.push(t.minimumRule(rule.percent, money(rule.atLeast)));
  if (rule?.kind === 'typed') lines.push(t.minimumTyped(money(rule.amount)));
  return (
    <section className={styles.card} aria-labelledby="card-details" data-testid="card-details">
      <h2 id="card-details" className={styles.cardTitle}>
        {t.card}
      </h2>
      {lines.map((line) => (
        <p key={line} className={styles.line}>
          {line}
        </p>
      ))}
      {card.nextStatement === null ? null : (
        <>
          <p className={styles.second}>
            {t.nextStatement(
              formatDay(card.nextStatement.date, today),
              money(card.nextStatement.interest),
            )}
          </p>
          {card.nextStatement.minimum === null ? null : (
            <p className={styles.second}>{t.nextMinimum(money(card.nextStatement.minimum))}</p>
          )}
        </>
      )}
    </section>
  );
}

function OneDebt({ debt, view }: { readonly debt: DebtView; readonly view: DebtsView }) {
  const { makeChange } = usePlanActions();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const money = (amount: number) => formatIn(amount, debt.currency);
  const kindWords = strings.setup.debts.kinds[debt.kind];
  const names: Readonly<Record<string, string>> = t.currencyNames;
  return (
    <>
      <p className={styles.second}>
        {debt.currency === 'GBP'
          ? kindWords
          : t.kind(kindWords, names[debt.currency] ?? debt.currency)}
      </p>
      <section className={styles.card} data-testid="left-now">
        <div className={styles.cardHead}>
          <h2 className={styles.label}>{t.leftNow}</h2>
          {debt.leftNowIsEstimate ? <EstimateTag /> : null}
        </div>
        <p className={`${styles.figure} num`}>{money(debt.leftNow)}</p>
        {debt.rate === null ? null : (
          <p className={`${styles.second} num`}>
            {t.aboutAt(formatMoney(debt.leftNowInPounds), perPoundWords(debt.rate, debt.currency))}
          </p>
        )}
        {debt.interestNotIncluded ? <p className={styles.second}>{t.interestNotIncluded}</p> : null}
        {debt.interestSinceUpdate > 0 ? (
          <p className={styles.second}>{t.interestIncluded(money(debt.interestSinceUpdate))}</p>
        ) : null}
        <hr className={styles.rule} />
        <p className={styles.line}>{debt.closed ? t.closedNote : paidOffWords(debt, view)}</p>
        {debt.isEstimate && !debt.closed ? (
          <p>
            <EstimateTag />
          </p>
        ) : null}
        <ProgressBar
          percent={debt.percentPaid}
          words={strings.debts.percentPaid(debt.percentPaid)}
        />
        <p className={`${styles.second} num`}>
          {t.paidOfStarted(money(debt.paidSoFar), money(debt.startingBalance))}
        </p>
      </section>

      <CardDetails debt={debt} today={view.today} />

      <section className={styles.card} aria-labelledby="debt-payments">
        <h2 id="debt-payments" className={styles.cardTitle}>
          {t.payments}
        </h2>
        {debt.rows.length === 0 ? (
          <p className={styles.line}>{t.noPayments}</p>
        ) : (
          <>
            <p className={styles.second}>{t.paymentsIntro}</p>
            <ul className={styles.list} data-testid="debt-rows">
              {debt.rows.map((row) => (
                <Row key={row.key} row={row} debt={debt} today={view.today} />
              ))}
            </ul>
            <p className={styles.second}>{t.toChange}</p>
          </>
        )}
      </section>

      {debt.closed ? null : (
        <section className={styles.actions} aria-label={t.actions}>
          <button
            type="button"
            className={formStyles.main}
            aria-haspopup="dialog"
            onClick={() => setOpen('statement')}
          >
            {t.updateFromStatement}
          </button>
          {debt.rate === null ? null : (
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => setOpen('rate')}
            >
              {t.changeRate}
            </button>
          )}
          <button
            type="button"
            className={formStyles.outlined}
            aria-haspopup="dialog"
            onClick={() => setOpen('payment')}
          >
            {t.addPayment}
          </button>
          <button
            type="button"
            className={formStyles.outlined}
            aria-haspopup="dialog"
            onClick={() => setOpen('details')}
          >
            {t.changeDetails}
          </button>
          <button
            type="button"
            className={formStyles.quiet}
            aria-haspopup="dialog"
            onClick={() => setOpen('close')}
          >
            {t.close}
          </button>
        </section>
      )}

      {debt.card?.compare === null || debt.card === null || debt.closed ? null : (
        <CompareCard debtId={debt.id} currency={debt.currency} start={debt.card.compare} />
      )}

      <StatementSheet open={open === 'statement'} debt={debt} today={view.today} onClose={close} />
      {debt.rate === null ? null : <RateSheet open={open === 'rate'} debt={debt} onClose={close} />}
      <AddPaymentSheet
        open={open === 'payment'}
        onClose={close}
        preset={{ direction: 'out', name: debt.name, type: 'debt', link: `debt:${debt.id}` }}
      />
      <DebtSheet open={open === 'details'} debt={debt.debt} onClose={close} />
      <ConfirmSheet
        open={open === 'close'}
        title={strings.closing.debtTitle}
        intro={strings.closing.debtIntro}
        confirm={strings.closing.debtConfirm}
        keep={strings.closing.keep}
        onConfirm={() =>
          makeChange({ kind: 'close-debt', debtId: debt.id }, strings.closing.debtClosed(debt.name))
        }
        onClose={(changed) => {
          close();
          if (changed) focusUndoBar(strings.closing.debtClosed(debt.name));
        }}
      />
    </>
  );
}

export function DebtScreen() {
  const id = useSearchParams()?.get('id') ?? '';
  const { view, failed } = useScreenView('debts');
  const debt =
    view === null ? null : ([...view.debts, ...view.closed].find((one) => one.id === id) ?? null);
  const back = { label: t.back, href: '/app/debts/' };
  if (view === null) {
    return (
      <>
        <ScreenHeader heading={strings.debts.heading} purpose={t.purpose} back={back} />
        <p className={styles.card} role={failed ? 'alert' : undefined}>
          {failed ? strings.errors.plan : strings.debts.loading}
        </p>
      </>
    );
  }
  if (debt === null) {
    return (
      <>
        <ScreenHeader heading={strings.debts.heading} purpose={t.purpose} back={back} />
        <p className={styles.card}>{t.notFound}</p>
      </>
    );
  }
  return (
    <>
      <ScreenHeader heading={debt.name} purpose={t.purpose} back={back} />
      <OneDebt debt={debt} view={view} />
    </>
  );
}
