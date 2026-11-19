'use client';

// Home (brief 4.9, the Home sketch in ARCHITECTURE.md 4.6): what it's for in
// one plain sentence (D213), about what's in the account now, with what the
// bank showed and when (D430), or in Sam's example the day it's shown as on
// (D440), Left to spend, the lowest point ahead, what this pay has to cover,
// the next three due, the four actions and "+ Add an account" under them
// (D431, D442). In the example, its banner is under the lowest point (D451),
// and so is the card offering free help when money is tight (D584). Every
// figure comes from the engine, worked out in the
// background; every word from the strings file.

import { type ReactNode, useState } from 'react';
import { formatDay, formatDayAndYear } from '../lib/dates.ts';
import type { HomeView } from '../lib/home.ts';
import { formatMoney } from '../lib/money.ts';
import type { RowView } from '../lib/rows.ts';
import { lowestWhy } from '../lib/why.ts';
import { strings } from '../strings/en-GB.ts';
import { AccountSheet } from './AccountSheet.tsx';
import { Actions } from './Actions.tsx';
import { BalanceCard } from './BalanceCard.tsx';
import { EditSheet } from './EditSheet.tsx';
import { ExampleNote } from './ExampleNote.tsx';
import { FigureCard } from './FigureCard.tsx';
import { HolidayNote } from './HolidayNote.tsx';
import styles from './HomeScreen.module.css';
import { HomeSkeleton } from './HomeSkeleton.tsx';
import { InstallSuggestion } from './InstallSuggestion.tsx';
import { MoneyHelp } from './MoneyHelp.tsx';
import { PaymentList } from './PaymentList.tsx';
import { isSamsExample, usePlan } from './PlanProvider.tsx';
import { RowItem } from './RowItem.tsx';
import { TotalsCard } from './TotalsCard.tsx';
import { HOME_HEADING_ID, Tour } from './Tour.tsx';
import { TourCard } from './TourCard.tsx';
import { useEditSheet } from './useEditSheet.ts';
import { WhyButton, WhySheet } from './Why.tsx';

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

/**
 * The line under the balance: when it was checked (D430), or in Sam's
 * example the day it's shown as on, whatever the real date (D133, D440).
 */
function checkedWords(home: HomeView, example: boolean) {
  const { checkedOn } = home.account;
  const day = (date: string) => formatDay(date, home.today);
  const asOn = example ? t.exampleAsOn(formatDayAndYear(home.today)) : undefined;
  const checkedToday = checkedOn === home.today;
  return {
    checked: asOn ?? (checkedToday ? t.checkedToday(day(checkedOn)) : t.checked(day(checkedOn))),
    // "Bank: £267.54 today" (D450), or in the example "Bank: £267.54"
    // with the day it's shown as on in the line under it (D440).
    ...(asOn !== undefined && checkedToday
      ? { asOn }
      : {
          when: checkedToday ? t.bankShowedToday : t.bankShowedOn(day(checkedOn)),
          ...(asOn === undefined ? {} : { asOn }),
        }),
  };
}

function Figures({
  home,
  example,
  onOpen,
}: {
  readonly home: HomeView;
  /** Sam's example, which says the day it's shown as on (D440). */
  readonly example: boolean;
  readonly onOpen: (row: RowView) => void;
}) {
  const day = (date: string) => formatDay(date, home.today);
  const warning = formatMoney(home.account.warningLevel, { wholePounds: true });
  const { lowest, cover } = home;
  const [why, setWhy] = useState(false);
  const lowestSheet = lowestWhy(home);
  let context: string | null = null;
  if (lowest.short !== null) {
    context = t.shortOn(formatMoney(lowest.short.amount), day(lowest.short.date));
  } else if (lowest.underWarningFrom !== null) {
    context = t.underWarningFrom(warning, day(lowest.underWarningFrom));
  }
  const raised = leftToSpend(home);
  const { checked, ...line } = checkedWords(home, example);
  return (
    <>
      <BalanceCard
        account={home.account.name}
        balance={formatMoney(home.account.balance)}
        checked={checked}
        {...(home.account.movedSinceCheck
          ? { now: { amount: formatMoney(home.account.now), ...line } }
          : {})}
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
        help={
          <WhyButton title={lowestSheet.title} testId="lowest-why" onOpen={() => setWhy(true)} />
        }
      />
      <WhySheet open={why} {...lowestSheet} onClose={() => setWhy(false)} />
      {/* Free help when the plan is short three pay periods running (D584), under the lowest point. */}
      <MoneyHelp today={home.today} shortRunning={home.shortRunning} />
      {/* The tour, offered once after setup, under the lowest point and the help card (D597). */}
      <TourCard />
      {/* In the example, the banner is here, so the account and the lowest point show first (D451). */}
      <ExampleNote />
      {/* A new bank holiday that moved a payment, once (D539), in the same place. */}
      <HolidayNote today={home.today} />
      {/* Adding PrePenny to the home screen, once, on the second day (D546), in the same place. */}
      <InstallSuggestion today={home.today} />
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
  // "+ Add an account" opens the same form as More, Accounts (D431).
  const [addingAccount, setAddingAccount] = useState(false);
  return (
    <>
      <header className={styles.header}>
        <p className={styles.wordmark}>{strings.app.name}</p>
        <h1 id={HOME_HEADING_ID} className="visually-hidden" tabIndex={-1}>
          {t.heading}
        </h1>
        <p className={styles.purpose}>{t.purpose}</p>
      </header>
      <div className={styles.figures} aria-busy={state.status === 'loading'}>
        {state.status === 'ready' ? (
          <Figures home={state.home} example={isSamsExample(state.plan)} onOpen={sheet.open} />
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
        <>
          {/* Under the four buttons, so the account and the lowest point show first (D442). */}
          <button
            type="button"
            className={styles.addAccount}
            aria-haspopup="dialog"
            onClick={() => setAddingAccount(true)}
          >
            {t.addAccount}
          </button>
          <EditSheet row={sheet.editing} today={state.home.today} onClose={sheet.close} />
          {/* The 60-second tour of Home, from the card or from More (D597). */}
          <Tour home={state.home} />
        </>
      ) : null}
      <AccountSheet
        open={addingAccount}
        account={null}
        others={[]}
        onClose={() => setAddingAccount(false)}
      />
    </>
  );
}
