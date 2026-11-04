'use client';

// Home (brief 4.9, the Home sketch in ARCHITECTURE.md 4.6): what it's for in
// one plain sentence (D213), the balance and
// when it was checked, Left to spend, the lowest point ahead, what this pay
// has to cover, the next three due and the four actions. Every figure comes
// from the engine, worked out in the background; every word from the strings file.

import type { ReactNode } from 'react';
import { formatDay } from '../lib/dates.ts';
import type { HomeView } from '../lib/home.ts';
import { formatMoney } from '../lib/money.ts';
import type { RowView } from '../lib/rows.ts';
import { strings } from '../strings/en-GB.ts';
import { Actions } from './Actions.tsx';
import { BalanceCard } from './BalanceCard.tsx';
import { EditSheet } from './EditSheet.tsx';
import { FigureCard } from './FigureCard.tsx';
import styles from './HomeScreen.module.css';
import { HomeSkeleton } from './HomeSkeleton.tsx';
import { PaymentList } from './PaymentList.tsx';
import { usePlan } from './PlanProvider.tsx';
import { RowItem } from './RowItem.tsx';
import { TotalsCard } from './TotalsCard.tsx';
import { useEditSheet } from './useEditSheet.ts';

const t = strings.home;

function leftToSpend(home: HomeView) {
  const left = home.leftToSpend;
  if (left === null) return undefined;
  const day = (date: string) => formatDay(date, home.today);
  const warning = formatMoney(home.account.warningLevel, { wholePounds: true });
  const until = left.runsTo === 'payday' ? left.until : left.lastDay;
  const lines: ReactNode[] = [];
  if (left.line?.kind === 'spend-no-more-than') {
    lines.push(t.spendNoMoreThan(formatMoney(left.line.amount), warning, day(until)));
  } else if (left.line?.kind === 'under-even-spending-nothing') {
    lines.push(t.underEvenSpendingNothing(warning, day(left.line.date)));
  }
  for (const card of left.payLater) {
    lines.push(t.payLaterLeft(formatMoney(card.left), day(card.until)));
  }
  if (home.mainPayEnded) lines.push(t.mainPayEnded);
  return {
    label:
      left.runsTo === 'payday'
        ? t.leftToSpendUntil(day(left.until))
        : t.leftToSpendTo(day(left.lastDay)),
    amount: formatMoney(left.amount),
    lines,
  };
}

function Figures({
  home,
  onOpen,
}: {
  readonly home: HomeView;
  readonly onOpen: (row: RowView) => void;
}) {
  const day = (date: string) => formatDay(date, home.today);
  const warning = formatMoney(home.account.warningLevel, { wholePounds: true });
  const { lowest, cover } = home;
  let context: string | null = null;
  if (lowest.short !== null) {
    context = t.shortOn(formatMoney(lowest.short.amount), day(lowest.short.date));
  } else if (lowest.underWarningFrom !== null) {
    context = t.underWarningFrom(warning, day(lowest.underWarningFrom));
  }
  const raised = leftToSpend(home);
  return (
    <>
      <BalanceCard
        account={home.account.name}
        balance={formatMoney(home.account.balance)}
        checked={
          home.account.checkedOn === home.today
            ? t.checkedToday(day(home.account.checkedOn))
            : t.checked(day(home.account.checkedOn))
        }
        {...(raised === undefined ? {} : { raised })}
      />
      <FigureCard
        testId="lowest-point"
        label={t.lowestPointAhead}
        status={lowest.status === 'ok' ? null : lowest.status}
        figure={formatMoney(lowest.balance)}
        detail={
          lowest.after === null ? day(lowest.date) : t.lowestOnAfter(day(lowest.date), lowest.after)
        }
        context={context}
      />
      {cover === null ? null : (
        <TotalsCard
          testId="this-pay"
          heading={t.thisPayHasToCover}
          lead={
            cover.payToday === null
              ? null
              : (cover.payToday.ticked ? t.payCameInToday : t.payComingInToday)(
                  formatMoney(cover.payToday.amount),
                )
          }
          rows={[
            { label: t.goingOutBy(day(cover.by)), amount: formatMoney(cover.goingOut) },
            // On payday the pay has its own line, so "Coming in" shows only
            // when something else comes in too: never "Coming in £0.00" (D206).
            ...(cover.payToday !== null && cover.comingIn === 0
              ? []
              : [{ label: t.comingIn, amount: formatMoney(cover.comingIn) }]),
          ]}
        />
      )}
      <PaymentList
        testId="next-due"
        heading={t.nextDue}
        link={{ label: t.seeComingUp, href: '/app/coming-up/' }}
        empty={t.nothingDue(day(home.lookAheadTo))}
      >
        {home.nextDue.map((row) => (
          <RowItem key={row.key} row={row} today={home.today} onOpen={onOpen} />
        ))}
      </PaymentList>
    </>
  );
}

export function HomeScreen() {
  const state = usePlan();
  const sheet = useEditSheet(state.status === 'ready' ? state.version : null);
  return (
    <>
      <header className={styles.header}>
        <p className={styles.wordmark}>{strings.app.name}</p>
        <h1 className="visually-hidden">{t.heading}</h1>
        <p className={styles.purpose}>{t.purpose}</p>
      </header>
      <div className={styles.figures} aria-busy={state.status === 'loading'}>
        {state.status === 'ready' ? (
          <Figures home={state.home} onOpen={sheet.open} />
        ) : state.status === 'failed' ? (
          <p className={styles.failed} role="alert">
            {strings.errors.plan}
          </p>
        ) : (
          <HomeSkeleton />
        )}
      </div>
      <Actions />
      {state.status === 'ready' ? (
        <EditSheet row={sheet.editing} today={state.home.today} onClose={sheet.close} />
      ) : null}
    </>
  );
}
