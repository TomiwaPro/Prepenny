'use client';

// The Plan screen (brief 4.8, the Plan sketch in ARCHITECTURE.md 4.6): one
// account at a time, grouped by pay period (D14, D84) or calendar month.
// At the top, the lowest point ahead with Tight or Short in words, then
// "Not ticked yet" (D11). Each period has "Came in", every row in date order
// with "Left after this", and "Left at the end". Filters hide rows without
// changing any figure (D184). Three months at first, and "Show another
// month" up to 24. Tapping a row opens the edit sheet (brief 4.4).

import { PAYMENT_TYPES, type PaymentType } from '@prepenny/engine';
import { useEffect, useId, useRef, useState } from 'react';
import { formatDay, formatMonth } from '../lib/dates.ts';
import { formatMoney } from '../lib/money.ts';
import { type Filters, filtersOn, NO_FILTERS, rowMatches, type Show } from '../lib/plan-filters.ts';
import { PLAN_MONTHS_AHEAD } from '../lib/plan-input.ts';
import type { AccountView, Grouping, PeriodView, PlanView } from '../lib/plan-view.ts';
import type { RowView } from '../lib/rows.ts';
import { strings } from '../strings/en-GB.ts';
import { workOutPlanInBackground } from '../worker/client.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { EditSheet } from './EditSheet.tsx';
import { usePlanActions } from './PlanProvider.tsx';
import styles from './PlanScreen.module.css';
import { RowItem } from './RowItem.tsx';
import { Segmented } from './Segmented.tsx';
import { Sheet } from './Sheet.tsx';
import { StatusPill } from './StatusPill.tsx';
import { useEditSheet } from './useEditSheet.ts';

const t = strings.plan;

/** Pay periods or months is kept on this phone, like Light or Dark (D173, D187). */
const GROUPING_KEY = 'prepenny-plan-by';

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

/** Filters, months and the account are kept only while PrePenny is open (D187). */
let remembered: {
  filters: Filters;
  months: number;
  accountId: string | null;
} = { filters: NO_FILTERS, months: PLAN_MONTHS_AHEAD, accountId: null };

const showLabels: Readonly<Record<Show, string>> = {
  everything: t.filtersSheet.everything,
  'still-to-pay': t.filtersSheet.stillToPay,
  'money-in': t.filtersSheet.moneyIn,
  debts: t.filtersSheet.debts,
};

function Lowest({ account, today }: { readonly account: AccountView; readonly today: string }) {
  const { lowest } = account;
  const day = (date: string) => formatDay(date, today);
  const warning = formatMoney(account.warningLevel, { wholePounds: true });
  let context: string | null = null;
  if (lowest.short !== null) {
    context = strings.home.shortOn(formatMoney(lowest.short.amount), day(lowest.short.date));
  } else if (lowest.underWarningFrom !== null) {
    context = strings.home.underWarningFrom(warning, day(lowest.underWarningFrom));
  }
  const amount = formatMoney(lowest.balance);
  return (
    <section className={styles.card} data-testid="plan-lowest">
      <div className={styles.cardHead}>
        <h2 className={styles.label}>{t.lowestPointAhead}</h2>
        {lowest.status === 'ok' ? null : <StatusPill status={lowest.status} />}
      </div>
      <p className={`${styles.lowestLine} num`}>
        {lowest.after === null
          ? t.lowestOn(amount, day(lowest.date))
          : t.lowestOnAfter(amount, day(lowest.date), lowest.after)}
      </p>
      {context === null ? null : <p className={styles.context}>{context}</p>}
    </section>
  );
}

function Total({ label, amount }: { readonly label: string; readonly amount: string }) {
  return (
    <dl className={styles.totals}>
      <div className={styles.total}>
        <dt>{label}</dt>
        <dd className="num">{amount}</dd>
      </div>
    </dl>
  );
}

function Period({
  period,
  grouping,
  today,
  filters,
  onOpen,
}: {
  readonly period: PeriodView;
  readonly grouping: Grouping;
  readonly today: string;
  readonly filters: Filters;
  readonly onOpen: (row: RowView) => void;
}) {
  const headingId = useId();
  const day = (date: string) => formatDay(date, today);
  let heading: string;
  if (grouping === 'months') heading = formatMonth(period.start, today);
  else if (period.first) heading = t.fromToday(day(period.end));
  else heading = t.period(day(period.start), day(period.end));
  const rows = period.rows.filter((row) => rowMatches(row, filters));
  return (
    <section
      className={styles.period}
      aria-labelledby={headingId}
      data-testid="period"
      data-start={period.start}
    >
      <h2 id={headingId} className={styles.periodHeading}>
        {heading}
      </h2>
      <div className={styles.periodCard}>
        <Total label={t.cameIn} amount={formatMoney(period.cameIn)} />
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
        <Total label={t.leftAtEnd} amount={formatMoney(period.leftAtEnd)} />
      </div>
    </section>
  );
}

function FiltersSheet({
  open,
  filters,
  onChange,
  onClose,
}: {
  readonly open: boolean;
  readonly filters: Filters;
  readonly onChange: (filters: Filters) => void;
  readonly onClose: () => void;
}) {
  const name = useId();
  const f = t.filtersSheet;
  return (
    <Sheet open={open} title={f.title} onClose={onClose}>
      <div className={styles.filters}>
        <ChoiceList<Show>
          legend={f.show}
          name={`${name}-show`}
          value={filters.show}
          options={(['everything', 'still-to-pay', 'money-in', 'debts'] as const).map((value) => ({
            value,
            label: showLabels[value],
          }))}
          onChange={(show) => onChange({ ...filters, show })}
        />
        <ChoiceList<PaymentType | 'all'>
          legend={f.type}
          name={`${name}-type`}
          value={filters.type}
          options={[
            { value: 'all', label: f.allTypes },
            ...PAYMENT_TYPES.map((value) => ({ value, label: strings.types[value] })),
          ]}
          onChange={(type) => onChange({ ...filters, type })}
        />
        <button type="button" className={styles.main} onClick={onClose}>
          {f.done}
        </button>
      </div>
    </Sheet>
  );
}

function PlanSkeleton() {
  return (
    <div className={styles.skeleton} data-testid="plan-skeleton">
      <p className="visually-hidden">{t.loading}</p>
      {['lowest', 'first', 'second'].map((block) => (
        <div key={block} className={styles.block} aria-hidden="true" />
      ))}
    </div>
  );
}

export function PlanScreen() {
  const { loaded } = usePlanActions();
  const [grouping, setGrouping] = useState<Grouping>('pay');
  const [months, setMonths] = useState(remembered.months);
  const [filters, setFilters] = useState<Filters>(remembered.filters);
  const [chosenAccount, setChosenAccount] = useState<string | null>(remembered.accountId);
  const [shown, setShown] = useState<{ view: PlanView; version: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const furthest = useRef<HTMLParagraphElement>(null);
  const showMore = useRef(false);
  const name = useId();

  useEffect(() => setGrouping(storedGrouping()), []);

  useEffect(() => {
    remembered = { filters, months, accountId: chosenAccount };
  }, [filters, months, chosenAccount]);

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
  const on = filtersOn(filters);
  const filterWords = [
    filters.show === 'everything' ? null : showLabels[filters.show],
    filters.type === 'all' ? null : strings.types[filters.type],
  ]
    .filter((one) => one !== null)
    .join(', ');

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>{t.heading}</h1>
      </header>

      <div className={styles.controls}>
        <Segmented<Grouping>
          legend={t.showBy}
          name={`${name}-by`}
          value={view?.grouping ?? grouping}
          options={[
            { value: 'pay', label: t.payPeriods },
            { value: 'months', label: t.months },
          ]}
          onChange={(value) => {
            setGrouping(value);
            saveGrouping(value);
          }}
          testId="plan-by"
        />
        {view !== null && view.accounts.length > 1 && account !== null ? (
          <Segmented<string>
            legend={t.account}
            name={`${name}-account`}
            value={account.id}
            options={view.accounts.map((one) => ({ value: one.id, label: one.name }))}
            onChange={setChosenAccount}
            testId="plan-account"
          />
        ) : null}
        <div className={styles.filterLine}>
          <button
            type="button"
            className={styles.outlined}
            aria-haspopup="dialog"
            onClick={() => setFiltersOpen(true)}
          >
            {on === 0 ? t.filters : t.filtersOn(on)}
          </button>
          {on === 0 ? null : (
            <button type="button" className={styles.quiet} onClick={() => setFilters(NO_FILTERS)}>
              {t.clearFilters}
            </button>
          )}
        </div>
        {on === 0 ? null : (
          <p className={styles.filtered} data-testid="plan-filtered">
            {t.filteredBy(filterWords)}
          </p>
        )}
      </div>

      <div className={styles.plan} aria-busy={view === null}>
        {view === null || account === null ? (
          failed ? (
            <p className={styles.card} role="alert">
              {strings.errors.plan}
            </p>
          ) : (
            <PlanSkeleton />
          )
        ) : (
          <>
            <Lowest account={account} today={today} />
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
                <p className={styles.context}>{t.notTickedYetIntro}</p>
                <ul className={styles.rows}>
                  {account.notTickedYet.map((row) => (
                    <RowItem key={row.key} row={row} today={today} onOpen={sheet.open} />
                  ))}
                </ul>
              </section>
            ) : null}
            {account.periods.map((period) => (
              <Period
                key={period.start}
                period={period}
                grouping={view.grouping}
                today={today}
                filters={filters}
                onOpen={sheet.open}
              />
            ))}
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

      <FiltersSheet
        open={filtersOpen}
        filters={filters}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
      />
      <EditSheet row={sheet.editing} today={today} onClose={sheet.close} />
    </>
  );
}
