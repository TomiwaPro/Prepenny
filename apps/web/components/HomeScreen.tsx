'use client';

// Home (brief 4.9, the Home sketch in ARCHITECTURE.md 4.6): the balance and
// when it was checked, Left to spend, the lowest point ahead, what this pay
// has to cover, the next three due and the four actions. Every figure comes
// from the engine, worked out in the background; every word from the strings file.

import type { ReactNode } from 'react';
import { dateTile, formatDay } from '../lib/dates.ts';
import type { HomeView } from '../lib/home.ts';
import { formatMoney } from '../lib/money.ts';
import { strings } from '../strings/en-GB.ts';
import { Actions } from './Actions.tsx';
import { BalanceCard } from './BalanceCard.tsx';
import { FigureCard } from './FigureCard.tsx';
import styles from './HomeScreen.module.css';
import { HomeSkeleton } from './HomeSkeleton.tsx';
import { PaymentList } from './PaymentList.tsx';
import { PaymentRow } from './PaymentRow.tsx';
import { usePlan } from './PlanProvider.tsx';
import { TotalsCard } from './TotalsCard.tsx';

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

function Figures({ home }: { readonly home: HomeView }) {
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
          rows={[
            { label: t.goingOutBy(day(cover.by)), amount: formatMoney(cover.goingOut) },
            { label: t.comingIn, amount: formatMoney(cover.comingIn) },
          ]}
        />
      )}
      <PaymentList
        testId="next-due"
        heading={t.nextDue}
        link={{ label: t.seeThePlan, href: '/app/plan/' }}
        empty={t.nothingDue(day(home.lookAheadTo))}
      >
        {home.nextDue.map((row) => (
          <PaymentRow
            key={row.key}
            tile={dateTile(row.date)}
            name={row.name}
            second={row.isEstimate ? t.withEstimate(day(row.date)) : day(row.date)}
            amount={formatMoney(row.change, { sign: 'always' })}
            moneyIn={row.change > 0}
            left={t.left(formatMoney(row.leftAfter))}
            status={row.status === 'ok' ? null : row.status}
          />
        ))}
      </PaymentList>
    </>
  );
}

export function HomeScreen() {
  const state = usePlan();
  return (
    <>
      <header className={styles.header}>
        <p className={styles.wordmark}>{strings.app.name}</p>
        <h1 className="visually-hidden">{t.heading}</h1>
      </header>
      <div className={styles.figures} aria-busy={state.status === 'loading'}>
        {state.status === 'ready' ? (
          <Figures home={state.home} />
        ) : state.status === 'failed' ? (
          <p className={styles.failed} role="alert">
            {strings.errors.plan}
          </p>
        ) : (
          <HomeSkeleton />
        )}
      </div>
      <Actions />
    </>
  );
}
