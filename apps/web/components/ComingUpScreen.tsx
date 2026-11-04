'use client';

// The Coming up page (brief 4.8, D208 to D212): what's going to go out and
// come in, one account at a time, and what's left after each payment.
//
// At the top: what the page is for in one plain sentence, "How to read this"
// on the first visit (and from the "?" after that), the account with its
// balance, one line saying what's shown with a View button, the lowest point
// ahead, and "Not ticked yet" (D11). Then this pay, open, with every payment
// and "Left at the end", and each later payday as one line that opens in
// place. Grouped by calendar month it works the same way. What's shown only
// hides rows, never changes a figure (D184). Three months at first, and
// "Show another month" up to 24. Tapping a payment opens the edit sheet.

import { PAYMENT_TYPES, type PaymentType } from '@prepenny/engine';
import { useEffect, useId, useRef, useState } from 'react';
import { formatDay, formatMonth, weekdayShort } from '../lib/dates.ts';
import { formatMoney } from '../lib/money.ts';
import { type Filters, NO_FILTERS, rowMatches, type Show } from '../lib/plan-filters.ts';
import { PLAN_MONTHS_AHEAD } from '../lib/plan-input.ts';
import {
  type AccountView,
  type Grouping,
  monthsUpTo,
  type PeriodView,
  type PlanView,
} from '../lib/plan-view.ts';
import type { RowView } from '../lib/rows.ts';
import { strings } from '../strings/en-GB.ts';
import { workOutPlanInBackground } from '../worker/client.ts';
import { ChoiceList } from './ChoiceList.tsx';
import styles from './ComingUpScreen.module.css';
import { EditSheet } from './EditSheet.tsx';
import { Icon } from './icons.tsx';
import { usePlanActions } from './PlanProvider.tsx';
import { RowItem } from './RowItem.tsx';
import { Sheet } from './Sheet.tsx';
import { StatusPill } from './StatusPill.tsx';
import { useEditSheet } from './useEditSheet.ts';

const t = strings.comingUp;

/** By payday or by calendar month is kept on this phone, like Light or Dark (D173, D187). */
const GROUPING_KEY = 'prepenny-plan-by';

/** "How to read this" has been closed on this phone, so it doesn't come back by itself (D212). */
const HELP_SEEN_KEY = 'prepenny-coming-up-help-seen';

function storedGrouping(): Grouping {
  try {
    return localStorage.getItem(GROUPING_KEY) === 'months' ? 'months' : 'pay';
  } catch {
    return 'pay';
  }
}

function saveGrouping(grouping: Grouping) {
  try {
    if (grouping === 'pay') localStorage.removeItem(GROUPING_KEY);
    else localStorage.setItem(GROUPING_KEY, grouping);
  } catch {
    // The choice still applies until PrePenny closes.
  }
}

function helpSeen(): boolean {
  try {
    return localStorage.getItem(HELP_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

function saveHelpSeen() {
  try {
    localStorage.setItem(HELP_SEEN_KEY, 'yes');
  } catch {
    // It shows again next time PrePenny opens, which does no harm.
  }
}

/**
 * What's shown, the extra months, the account and the paydays opened are
 * kept only while PrePenny is open (D187, D211).
 */
let remembered: {
  filters: Filters;
  months: number;
  accountId: string | null;
  opened: readonly string[];
} = { filters: NO_FILTERS, months: PLAN_MONTHS_AHEAD, accountId: null, opened: [] };

/** "showing everything", "showing only Bills". */
function showingWords(filters: Filters): string {
  switch (filters.show) {
    case 'still-to-pay':
      return t.showingStillToPay;
    case 'money-in':
      return t.showingMoneyIn;
    case 'debts':
      return t.showingDebts;
    case 'type':
      return t.showingType(strings.types[filters.type]);
    default:
      return t.showingEverything;
  }
}

/** The period with a date in it, if it's shown. */
function periodWith(account: AccountView, date: string): PeriodView | null {
  return account.periods.find((period) => period.start <= date && date <= period.end) ?? null;
}

/** "Fri 30 Oct", or "November" for a calendar month. */
function periodName(period: PeriodView, today: string): string {
  return period.byMonth ? formatMonth(period.start, today) : formatDay(period.start, today);
}

function HowToRead({
  id,
  grouping,
  onGotIt,
}: {
  readonly id: string;
  readonly grouping: Grouping;
  readonly onGotIt: () => void;
}) {
  const headingId = useId();
  const points = [
    ...(grouping === 'months' ? t.howToReadMonths : t.howToReadPay),
    ...t.howToReadAll,
  ];
  return (
    <section id={id} className={styles.help} aria-labelledby={headingId} data-testid="how-to-read">
      <h2 id={headingId} className={styles.sectionHeading}>
        {t.howToRead}
      </h2>
      <ul className={styles.points}>
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <button type="button" className={`${styles.main} ${styles.gotIt}`} onClick={onGotIt}>
        {t.gotIt}
      </button>
    </section>
  );
}

function AccountCard({
  account,
  today,
  canSwitch,
  onSwitch,
}: {
  readonly account: AccountView;
  readonly today: string;
  readonly canSwitch: boolean;
  readonly onSwitch: () => void;
}) {
  const balance = formatMoney(account.balance);
  return (
    <section className={styles.account} data-testid="plan-account">
      <div className={styles.accountWords}>
        <h2 className={styles.accountName}>{account.name}</h2>
        <p className={`${styles.second} num`}>
          {account.checkedOn === today
            ? t.checkedToday(balance)
            : t.checked(balance, formatDay(account.checkedOn, today))}
        </p>
      </div>
      {canSwitch ? (
        <button type="button" className={styles.outlined} aria-haspopup="dialog" onClick={onSwitch}>
          {t.switchAccount}
        </button>
      ) : null}
    </section>
  );
}

/** Where the lowest point is, and what tapping it does (D209). */
type LowestPlace =
  | { readonly kind: 'first'; readonly period: PeriodView }
  | { readonly kind: 'later'; readonly period: PeriodView }
  | { readonly kind: 'beyond' };

function LowestLine({
  account,
  view,
  onTap,
}: {
  readonly account: AccountView;
  readonly view: PlanView;
  readonly onTap: (place: LowestPlace) => void;
}) {
  const { lowest } = account;
  const today = view.today;
  const day = (date: string) => formatDay(date, today);
  const warning = formatMoney(account.warningLevel, { wholePounds: true });
  let context: string | null = null;
  if (lowest.short !== null) {
    context = strings.home.shortOn(formatMoney(lowest.short.amount), day(lowest.short.date));
  } else if (lowest.underWarningFrom !== null) {
    context = strings.home.underWarningFrom(warning, day(lowest.underWarningFrom));
  }
  const amount = formatMoney(lowest.balance);
  const line =
    lowest.after === null
      ? t.lowestOn(amount, day(lowest.date))
      : t.lowestOnAfter(amount, day(lowest.date), lowest.after);

  // The lowest point looks 12 months ahead, like Home's, even when fewer
  // months are shown (D183, D190). Tapping it opens the payday it's in.
  const period = periodWith(account, lowest.date);
  let place: LowestPlace | null;
  if (period === null) place = lowest.date > view.to ? { kind: 'beyond' } : null;
  else place = period.first ? { kind: 'first', period } : { kind: 'later', period };
  // Nothing to show when it's today's balance before any payment.
  if (place?.kind === 'first' && lowest.after === null) place = null;

  let action: string | null = null;
  if (place?.kind === 'beyond') action = t.showUpTo(day(lowest.date));
  else if (place?.kind === 'later') action = t.openBelow(periodName(place.period, today));
  else if (place?.kind === 'first') {
    action = place.period.byMonth ? t.seeInThisMonth : t.seeInThisPay;
  }

  const inside = (
    <>
      <span className={styles.lowestTop}>
        <span className={`${styles.lowestLine} num`}>{line}</span>
        {lowest.status === 'ok' ? null : <StatusPill status={lowest.status} />}
      </span>
      {context === null ? null : <span className={styles.second}>{context}</span>}
    </>
  );
  return (
    <section className={styles.lowest} data-testid="plan-lowest">
      {place === null || action === null ? (
        <div className={styles.lowestInside}>{inside}</div>
      ) : (
        <button
          type="button"
          className={`${styles.lowestInside} ${styles.lowestButton}`}
          onClick={() => onTap(place)}
        >
          {inside}
          <span className={styles.lowestAction}>{action}</span>
        </button>
      )}
    </section>
  );
}

/** "Left at the end", under a period's last payment. */
function LeftAtEnd({ amount }: { readonly amount: string }) {
  return (
    <dl className={styles.totals}>
      <div className={styles.total}>
        <dt>{t.leftAtEnd}</dt>
        <dd className="num">{amount}</dd>
      </div>
    </dl>
  );
}

/** A period's payments that match what's shown, then "Left at the end". */
function PeriodRows({
  period,
  today,
  filters,
  onOpen,
}: {
  readonly period: PeriodView;
  readonly today: string;
  readonly filters: Filters;
  readonly onOpen: (row: RowView) => void;
}) {
  const rows = period.rows.filter((row) => rowMatches(row, filters));
  return (
    <>
      {rows.length > 0 ? (
        <ul className={styles.rows}>
          {rows.map((row) => (
            <RowItem key={row.key} row={row} today={today} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {period.rows.length === 0 ? t.nothingPlanned : t.nothingMatches}
        </p>
      )}
      <LeftAtEnd amount={formatMoney(period.leftAtEnd)} />
    </>
  );
}

/** This pay, or this month: open, with every payment (D211). */
function FirstPeriod({
  period,
  today,
  filters,
  onOpen,
}: {
  readonly period: PeriodView;
  readonly today: string;
  readonly filters: Filters;
  readonly onOpen: (row: RowView) => void;
}) {
  const headingId = useId();
  const end = formatDay(period.end, today);
  return (
    <section
      className={styles.period}
      aria-labelledby={headingId}
      data-testid="period"
      data-start={period.start}
      data-open="true"
    >
      <h2 id={headingId} className={styles.periodHeading} tabIndex={-1} data-period-heading>
        {period.byMonth ? t.thisMonth(end) : t.thisPay(end)}
      </h2>
      <div className={styles.card}>
        <PeriodRows period={period} today={today} filters={filters} onOpen={onOpen} />
      </div>
    </section>
  );
}

/** "Pay £603.06 in", or what else comes in, or "Nothing coming in" (D211). */
function inWords(period: PeriodView): string {
  if (period.pay !== null) return t.payIn(formatMoney(period.pay));
  if (period.cameIn > 0) return t.moneyIn(formatMoney(period.cameIn));
  return t.nothingIn;
}

/**
 * A later payday, or month, as one line: its date, the pay coming in and its
 * lowest point. Tapping it opens it in place to show every payment; tapping
 * again closes it (D211). It tells screen readers whether it's open.
 */
function LaterPeriod({
  period,
  today,
  open,
  filters,
  onToggle,
  onOpen,
}: {
  readonly period: PeriodView;
  readonly today: string;
  readonly open: boolean;
  readonly filters: Filters;
  readonly onToggle: () => void;
  readonly onOpen: (row: RowView) => void;
}) {
  const regionId = useId();
  const buttonId = useId();
  return (
    <li
      className={styles.later}
      data-testid="period"
      data-start={period.start}
      data-open={open ? 'true' : 'false'}
    >
      <h3 className={styles.laterHeading}>
        <button
          id={buttonId}
          type="button"
          className={styles.laterButton}
          aria-expanded={open}
          aria-controls={regionId}
          onClick={onToggle}
          data-period-heading
        >
          <span className={styles.laterWords}>
            <span className={styles.laterLeft}>
              <span className={styles.laterName}>{periodName(period, today)}</span>
              <span className={`${styles.second} num`}>{inWords(period)}</span>
            </span>
            <span className={styles.laterRight}>
              <span className={`${styles.laterLowest} num`}>
                {t.lowest(formatMoney(period.lowest.balance))}
              </span>
              {period.lowest.status === 'ok' ? null : <StatusPill status={period.lowest.status} />}
            </span>
          </span>
          <Icon name="chevron" className={open ? styles.chevronOpen : styles.chevron} />
        </button>
      </h3>
      <section id={regionId} className={styles.laterRows} aria-labelledby={buttonId} hidden={!open}>
        {open ? (
          <PeriodRows period={period} today={today} filters={filters} onOpen={onOpen} />
        ) : null}
      </section>
    </li>
  );
}

function ViewSheet({
  open,
  view,
  grouping,
  filters,
  onGrouping,
  onFilters,
  onClose,
}: {
  readonly open: boolean;
  readonly view: PlanView | null;
  readonly grouping: Grouping;
  readonly filters: Filters;
  readonly onGrouping: (grouping: Grouping) => void;
  readonly onFilters: (filters: Filters) => void;
  readonly onClose: () => void;
}) {
  const name = useId();
  const v = t.viewSheet;
  const week = view?.payWeek ?? null;
  const showOptions: readonly { value: Show; label: string }[] = [
    { value: 'everything', label: v.everything },
    { value: 'still-to-pay', label: v.stillToPay },
    { value: 'money-in', label: v.moneyIn },
    { value: 'debts', label: v.debts },
    { value: 'type', label: v.oneType },
  ];
  return (
    <Sheet
      open={open}
      title={v.title}
      intro={v.intro}
      closeLabel={strings.sheet.done}
      onClose={onClose}
    >
      <div className={styles.viewSheet}>
        {view === null || view.canGroupByPay ? (
          <ChoiceList<Grouping>
            legend={v.group}
            name={`${name}-group`}
            value={grouping}
            options={[
              {
                value: 'pay',
                label: t.byPayday,
                hint:
                  week === null
                    ? null
                    : v.payWeek(weekdayShort(week.start), weekdayShort(week.end)),
              },
              { value: 'months', label: t.byMonth },
            ]}
            onChange={onGrouping}
          />
        ) : (
          <div className={styles.viewGroup}>
            <h3 className={styles.legend}>{v.group}</h3>
            <p className={styles.second}>{v.needsMainPay}</p>
          </div>
        )}
        <ChoiceList<Show>
          legend={v.show}
          name={`${name}-show`}
          value={filters.show}
          options={showOptions}
          onChange={(show) => onFilters({ ...filters, show })}
        />
        {filters.show === 'type' ? (
          <ChoiceList<PaymentType>
            legend={v.whichType}
            name={`${name}-type`}
            value={filters.type}
            options={PAYMENT_TYPES.map((value) => ({ value, label: strings.types[value] }))}
            onChange={(type) => onFilters({ ...filters, type })}
          />
        ) : null}
      </div>
    </Sheet>
  );
}

function SwitchAccountSheet({
  open,
  view,
  shownId,
  onChoose,
  onClose,
}: {
  readonly open: boolean;
  readonly view: PlanView | null;
  readonly shownId: string | null;
  readonly onChoose: (accountId: string) => void;
  readonly onClose: () => void;
}) {
  const today = view?.today ?? '';
  return (
    <Sheet open={open} title={t.switchAccount} intro={t.switchIntro} onClose={onClose}>
      <ul className={styles.accounts}>
        {(view?.accounts ?? []).map((account) => {
          const balance = formatMoney(account.balance);
          const showing = account.id === shownId;
          return (
            <li key={account.id}>
              <button
                type="button"
                className={styles.accountChoice}
                aria-current={showing ? 'true' : undefined}
                onClick={() => onChoose(account.id)}
              >
                <span className={styles.accountName}>{account.name}</span>
                <span className={`${styles.second} num`}>
                  {account.checkedOn === today
                    ? t.checkedToday(balance)
                    : t.checked(balance, formatDay(account.checkedOn, today))}
                </span>
                {showing ? <span className={styles.showingNow}>{t.showingNow}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function Skeleton() {
  return (
    <div className={styles.skeleton} data-testid="plan-skeleton">
      <p className="visually-hidden">{t.loading}</p>
      {['account', 'lowest', 'first', 'later'].map((block) => (
        <div key={block} className={styles.block} aria-hidden="true" />
      ))}
    </div>
  );
}

/** Focuses the lowest point's row, or the heading of the period it's in. */
function focusLowest(account: AccountView, start: string) {
  const row = [...account.notTickedYet, ...account.periods.flatMap((period) => period.rows)].find(
    (one) => one.isLowest,
  );
  const found =
    row === undefined
      ? null
      : document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(row.key)}"]`);
  if (found !== null) {
    found.focus();
    return;
  }
  document
    .querySelector<HTMLElement>(
      `[data-testid="period"][data-start="${CSS.escape(start)}"] [data-period-heading]`,
    )
    ?.focus();
}

export function ComingUpScreen() {
  const { loaded } = usePlanActions();
  const [grouping, setGrouping] = useState<Grouping>('pay');
  const [months, setMonths] = useState(remembered.months);
  const [filters, setFilters] = useState<Filters>(remembered.filters);
  const [chosenAccount, setChosenAccount] = useState<string | null>(remembered.accountId);
  const [opened, setOpened] = useState<readonly string[]>(remembered.opened);
  const [shown, setShown] = useState<{ view: PlanView; version: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  // Null until this phone has been asked whether "How to read this" was closed before.
  const [help, setHelp] = useState<boolean | null>(null);
  const helpId = useId();
  const laterId = useId();
  const helpButton = useRef<HTMLButtonElement>(null);
  const furthest = useRef<HTMLParagraphElement>(null);
  const showMore = useRef(false);
  // Tapping the lowest point: the period to focus in once it's drawn open, or
  // the view it was tapped on when the months up to it have to be shown first.
  const focusLowestIn = useRef<string | null>(null);
  const toLowest = useRef<{ view: PlanView; accountId: string } | null>(null);

  useEffect(() => {
    setGrouping(storedGrouping());
    setHelp(!helpSeen());
  }, []);

  useEffect(() => {
    remembered = { filters, months, accountId: chosenAccount, opened };
  }, [filters, months, chosenAccount, opened]);

  useEffect(() => {
    if (loaded === null) return;
    let current = true;
    workOutPlanInBackground(loaded.records, loaded.today, { grouping, months }).then(
      (view) => {
        if (!current) return;
        setShown({ view, version: loaded.version });
        setFailed(false);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [loaded, grouping, months]);

  // When the last month has been added, the button goes: focus moves to the line that says so.
  useEffect(() => {
    if (showMore.current && shown?.view.canShowMore === false) {
      showMore.current = false;
      furthest.current?.focus();
    }
  }, [shown]);

  const sheet = useEditSheet(shown?.version ?? null);

  const view = shown?.view ?? null;
  const today = view?.today ?? loaded?.today ?? '';
  const account =
    view === null
      ? null
      : (view.accounts.find((one) => one.id === chosenAccount) ??
        view.accounts.find((one) => one.id === view.firstAccountId) ??
        view.accounts[0] ??
        null);

  /**
   * Opens the period the lowest point is in, then puts focus on its row: at
   * once when it's already open, or once it's drawn open.
   */
  const openLowest = (shownAccount: AccountView, period: PeriodView) => {
    if (period.first || opened.includes(period.start)) {
      focusLowest(shownAccount, period.start);
      return;
    }
    focusLowestIn.current = period.start;
    setOpened((now) => [...now, period.start]);
  };

  // After the months up to the lowest point are shown, open its period (D190, D209).
  useEffect(() => {
    const wanted = toLowest.current;
    if (wanted === null || view === null || view === wanted.view) return;
    toLowest.current = null;
    const there = view.accounts.find((one) => one.id === wanted.accountId);
    const period = there === undefined ? null : periodWith(there, there.lowest.date);
    if (there !== undefined && period !== null) openLowest(there, period);
  });

  // Once the lowest point's period is drawn open, focus goes to its row.
  useEffect(() => {
    const start = focusLowestIn.current;
    if (start === null || account === null || !opened.includes(start)) return;
    focusLowestIn.current = null;
    focusLowest(account, start);
  });

  const tapLowest = (place: LowestPlace) => {
    if (view === null || account === null) return;
    if (place.kind === 'beyond') {
      toLowest.current = { view, accountId: account.id };
      setMonths((now) => Math.max(now, monthsUpTo(today, account.lowest.date)));
      return;
    }
    openLowest(account, place.period);
  };

  const closeHelp = () => {
    saveHelpSeen();
    setHelp(false);
  };

  const groupWords = (view?.grouping ?? grouping) === 'months' ? t.byMonth : t.byPayday;
  const [first, ...later] = account?.periods ?? [];

  return (
    <>
      <header className={styles.header}>
        <div className={styles.titleLine}>
          <h1 className={styles.heading}>{t.heading}</h1>
          <button
            ref={helpButton}
            type="button"
            className={styles.helpButton}
            aria-label={t.howToReadButton}
            aria-expanded={help === true}
            aria-controls={helpId}
            onClick={() => {
              if (help === true) closeHelp();
              else setHelp(true);
            }}
          >
            <span aria-hidden="true">?</span>
          </button>
        </div>
        <p className={styles.purpose}>{t.purpose}</p>
      </header>

      {help === true ? (
        <HowToRead
          id={helpId}
          grouping={view?.grouping ?? grouping}
          onGotIt={() => {
            closeHelp();
            // The card goes, so focus moves to the "?" that brings it back (WCAG 2.4.3).
            helpButton.current?.focus();
          }}
        />
      ) : null}

      <div className={styles.plan} aria-busy={view === null}>
        {view === null || account === null || first === undefined ? (
          failed ? (
            <p className={styles.card} role="alert">
              {strings.errors.plan}
            </p>
          ) : (
            <Skeleton />
          )
        ) : (
          <>
            <AccountCard
              account={account}
              today={today}
              canSwitch={view.accounts.length > 1}
              onSwitch={() => setSwitchOpen(true)}
            />
            <div className={styles.viewLine}>
              <p className={styles.viewWords} data-testid="plan-showing">
                {t.showing(groupWords, showingWords(filters))}
              </p>
              <button
                type="button"
                className={styles.outlined}
                aria-haspopup="dialog"
                onClick={() => setViewOpen(true)}
              >
                {t.view}
              </button>
            </div>
            <LowestLine account={account} view={view} onTap={tapLowest} />
            {failed ? (
              // The figures below are from before the last change: say so plainly.
              <p className={styles.card} role="alert">
                {strings.errors.plan}
              </p>
            ) : null}
            {view.mainPayEnded ? <p className={styles.card}>{strings.home.mainPayEnded}</p> : null}
            {account.notTickedYet.length > 0 ? (
              <section className={styles.card} data-testid="not-ticked-yet">
                <h2 className={styles.sectionHeading}>{t.notTickedYet}</h2>
                <p className={styles.second}>{t.notTickedYetIntro}</p>
                <ul className={styles.rows}>
                  {account.notTickedYet.map((row) => (
                    <RowItem key={row.key} row={row} today={today} onOpen={sheet.open} />
                  ))}
                </ul>
              </section>
            ) : null}

            <FirstPeriod period={first} today={today} filters={filters} onOpen={sheet.open} />

            {later.length > 0 ? (
              <section className={styles.period} aria-labelledby={laterId}>
                <h2 id={laterId} className={styles.periodHeading}>
                  {view.grouping === 'months' ? t.nextMonths : t.nextPaydays}
                </h2>
                <p className={styles.tapOne}>{t.tapOne}</p>
                <ul className={styles.laterCard}>
                  {later.map((period) => (
                    <LaterPeriod
                      key={period.start}
                      period={period}
                      today={today}
                      open={opened.includes(period.start)}
                      filters={filters}
                      onToggle={() =>
                        setOpened((now) =>
                          now.includes(period.start)
                            ? now.filter((one) => one !== period.start)
                            : [...now, period.start],
                        )
                      }
                      onOpen={sheet.open}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {view.canShowMore ? (
              <button
                type="button"
                className={styles.outlined}
                onClick={() => {
                  showMore.current = true;
                  setMonths((now) => now + 1);
                }}
              >
                {t.showAnotherMonth}
              </button>
            ) : (
              <p ref={furthest} tabIndex={-1} className={styles.furthest}>
                {t.showingMost}
              </p>
            )}
          </>
        )}
      </div>

      <ViewSheet
        open={viewOpen}
        view={view}
        grouping={grouping}
        filters={filters}
        onGrouping={(value) => {
          setGrouping(value);
          saveGrouping(value);
          setOpened([]);
        }}
        onFilters={setFilters}
        onClose={() => setViewOpen(false)}
      />
      <SwitchAccountSheet
        open={switchOpen}
        view={view}
        shownId={account?.id ?? null}
        onChoose={(accountId) => {
          setChosenAccount(accountId);
          setOpened([]);
          setSwitchOpen(false);
        }}
        onClose={() => setSwitchOpen(false)}
      />
      <EditSheet row={sheet.editing} today={today} onClose={sheet.close} />
    </>
  );
}
