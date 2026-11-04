'use client';

// Accounts, under More (brief 4.2, D151, D155, D158, D181): what it's for in
// one plain sentence (D213), then every account with what its bank showed
// and the day it was checked, its overdraft limit and the amount it warns
// under. Each can be changed or closed, and new ones added. The part of the
// UK for bank holidays is changed here too.

import { useState } from 'react';
import { formatDay } from '../lib/dates.ts';
import { formatMoney } from '../lib/money.ts';
import type { AccountCard } from '../lib/money-views.ts';
import { strings } from '../strings/en-GB.ts';
import { AccountSheet } from './AccountSheet.tsx';
import formStyles from './Form.module.css';
import { NationSheet } from './NationSheet.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { useScreenView } from './useScreenView.ts';

const t = strings.accounts;

function Account({
  account,
  today,
  onChange,
}: {
  readonly account: AccountCard;
  readonly today: string;
  readonly onChange: (() => void) | null;
}) {
  const balance = formatMoney(account.balance);
  // A closed account sits under "Closed accounts", one level down.
  const Heading = onChange === null ? 'h3' : 'h2';
  return (
    <section
      className={styles.card}
      aria-labelledby={`account-${account.id}`}
      data-testid="account"
      data-account={account.name}
    >
      <div className={styles.cardHead}>
        <Heading id={`account-${account.id}`} className={styles.cardTitle}>
          {account.name}
        </Heading>
        <span className={styles.second}>{t.kinds[account.kind]}</span>
      </div>
      <p className={`${styles.line} num`}>
        {account.checkedOn === today
          ? t.checkedToday(balance)
          : t.checked(balance, formatDay(account.checkedOn, today))}
      </p>
      {onChange === null ? (
        <p className={styles.second}>{t.closedLine}</p>
      ) : (
        <>
          <p className={`${styles.second} num`}>
            {account.overdraftLimit === 0
              ? t.noOverdraft
              : t.overdraft(formatMoney(account.overdraftLimit))}
          </p>
          <p className={`${styles.second} num`}>{t.warning(formatMoney(account.warningLevel))}</p>
          <button
            type="button"
            className={formStyles.outlined}
            aria-haspopup="dialog"
            onClick={onChange}
          >
            {t.change(account.name)}
          </button>
        </>
      )}
    </section>
  );
}

export function AccountsScreen() {
  const { view, failed } = useScreenView('accounts');
  // The account being changed, "new" for a new one, "nation", or null when no sheet is open.
  const [open, setOpen] = useState<string | null>(null);
  const changing =
    open === null || open === 'new' || open === 'nation'
      ? null
      : (view?.accounts.find((one) => one.id === open) ?? null);
  const others = (view?.accounts ?? [])
    .filter((one) => one.id !== changing?.id)
    .map((one) => ({ id: one.id, name: one.name }));
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
      ) : (
        <>
          {view.accounts.map((account) => (
            <Account
              key={account.id}
              account={account}
              today={view.today}
              onChange={() => setOpen(account.id)}
            />
          ))}
          <button
            type="button"
            className={formStyles.main}
            aria-haspopup="dialog"
            onClick={() => setOpen('new')}
          >
            {t.add}
          </button>
          <section className={styles.card} aria-labelledby="bank-holidays">
            <h2 id="bank-holidays" className={styles.cardTitle}>
              {t.holidays}
            </h2>
            <p className={styles.line}>
              {t.holidaysLine(strings.setup.account.nations[view.nation])}
            </p>
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => setOpen('nation')}
            >
              {t.changeNation}
            </button>
          </section>
          {view.closed.length === 0 ? null : (
            <>
              <h2 className={styles.sectionHeading}>{t.closedHeading}</h2>
              {view.closed.map((account) => (
                <Account key={account.id} account={account} today={view.today} onChange={null} />
              ))}
            </>
          )}
        </>
      )}
      <AccountSheet
        open={open === 'new' || changing !== null}
        account={changing}
        others={others}
        onClose={() => setOpen(null)}
      />
      {view === null ? null : (
        <NationSheet open={open === 'nation'} nation={view.nation} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
