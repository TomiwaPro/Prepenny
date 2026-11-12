'use client';

// Accounts, under More (brief 4.2, D151, D155, D158, D181): what it's for in
// one plain sentence (D213), then every account with what its bank showed
// and the day it was checked (in Sam's example, the day it's as on, D448), its overdraft limit and the amount it warns
// under. Each can be changed or closed, and new ones added. The part of the
// UK for bank holidays is changed here too.

import { useState } from 'react';
import { checkedLine } from '../lib/checked-line.ts';
import { formatMoney } from '../lib/money.ts';
import type { AccountCard } from '../lib/money-views.ts';
import { strings } from '../strings/en-GB.ts';
import { AccountSheet } from './AccountSheet.tsx';
import formStyles from './Form.module.css';
import { NationSheet } from './NationSheet.tsx';
import { isSamsExample, usePlanActions } from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { useScreenView } from './useScreenView.ts';

const t = strings.accounts;

function Account({
  account,
  today,
  example,
  onChange,
}: {
  readonly account: AccountCard;
  readonly today: string;
  /** Sam's example: "£267.54, as on Sun 25 Oct 2026", never "today" (D448). */
  readonly example: boolean;
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
        {checkedLine(t, balance, account.checkedOn, today, example)}
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
  const { loaded } = usePlanActions();
  const example = loaded !== null && isSamsExample(loaded.plan);
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
              example={example}
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
                <Account
                  key={account.id}
                  account={account}
                  today={view.today}
                  example={example}
                  onChange={null}
                />
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
