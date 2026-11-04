'use client';

// Add or change an account, and close it (brief 4.2, D151, D158, D181). A
// new account comes with what its bank shows today, as in setup (D222).
// Changing it covers its name, overdraft limit and warning level. Closing
// it needs £0.00 at the end of today and nothing planned in it: when money
// is left, one tap moves it to another account first ("Move £3.12 to another
// account first"), or into it when it's overdrawn (D181). The move is added
// for today, marked as done, because the money has to have really moved
// before the account can close. Each is one change with one Undo.

import type { AccountKind, EditCommand } from '@prepenny/engine';
import { useId, useRef, useState } from 'react';
import { amountForTyping, parseAmount, parseSignedAmount } from '../lib/amount.ts';
import { newId, timeNow } from '../lib/ids.ts';
import { formatMoney } from '../lib/money.ts';
import type { AccountCard } from '../lib/money-views.ts';
import { refusalMessage } from '../lib/refusals.ts';
import { type AccountErrors, blankAccount, buildAccount } from '../lib/setup-forms.ts';
import { strings } from '../strings/en-GB.ts';
import { ChoiceList } from './ChoiceList.tsx';
import { CheckOption, describedBy, Field, MoneyInput, Problem } from './Fields.tsx';
import styles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import { Sheet } from './Sheet.tsx';
import { focusFirst } from './setup/focus.ts';
import { useOpenCount } from './useOpenCount.ts';

const t = strings.accountSheet;
const words = strings.setup.account;

export function AccountSheet({
  open,
  account,
  others,
  onClose,
}: {
  readonly open: boolean;
  /** The account to change, or null to add one. */
  readonly account: AccountCard | null;
  /** The other open accounts, to move money to or from before closing. */
  readonly others: readonly { readonly id: string; readonly name: string }[];
  readonly onClose: () => void;
}) {
  const opened = useOpenCount(open);
  return (
    <Sheet
      open={open}
      title={account === null ? t.addTitle : t.changeTitle}
      intro={account === null ? t.addIntro : t.changeIntro}
      onClose={onClose}
    >
      {opened === 0 ? null : account === null ? (
        <AddAccount key={opened} onDone={onClose} />
      ) : (
        <ChangeAccount key={opened} account={account} others={others} onDone={onClose} />
      )}
    </Sheet>
  );
}

interface Form {
  readonly name: string;
  readonly kind: AccountKind;
  readonly balance: string;
  readonly overdrawn: boolean;
  readonly overdraft: string;
  readonly warning: string;
}

function mistakeWords(errors: AccountErrors, field: keyof AccountErrors): string | undefined {
  const mistake = errors[field];
  return mistake === undefined ? undefined : words[mistake];
}

function NameBox({
  id,
  value,
  error,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={words.name} error={error}>
      <input
        id={id}
        className={styles.input}
        type="text"
        autoComplete="off"
        value={value}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy(id, error)}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function LimitBoxes({
  id,
  form,
  set,
  errors,
}: {
  readonly id: string;
  readonly form: Form;
  readonly set: (change: Partial<Form>) => void;
  readonly errors: AccountErrors;
}) {
  return (
    <>
      <Field
        id={`${id}-overdraft`}
        label={words.overdraft}
        error={mistakeWords(errors, 'overdraft')}
        hint={words.overdraftHint}
      >
        <MoneyInput
          id={`${id}-overdraft`}
          value={form.overdraft}
          onChange={(overdraft) => set({ overdraft })}
          invalid={errors.overdraft !== undefined}
          describedBy={describedBy(`${id}-overdraft`, mistakeWords(errors, 'overdraft'), [
            `${id}-overdraft-hint`,
          ])}
        />
      </Field>
      <Field
        id={`${id}-warning`}
        label={words.warning}
        error={mistakeWords(errors, 'warning')}
        hint={words.warningHint}
      >
        <MoneyInput
          id={`${id}-warning`}
          value={form.warning}
          onChange={(warning) => set({ warning })}
          invalid={errors.warning !== undefined}
          describedBy={describedBy(`${id}-warning`, mistakeWords(errors, 'warning'), [
            `${id}-warning-hint`,
          ])}
        />
      </Field>
    </>
  );
}

function AddAccount({ onDone }: { readonly onDone: () => void }) {
  const { loaded, makeChange } = usePlanActions();
  const id = useId();
  const [form, setForm] = useState<Form>(() => blankAccount(false));
  const [errors, setErrors] = useState<AccountErrors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (change: Partial<Form>) => setForm((now) => ({ ...now, ...change }));
  return (
    <form
      className={styles.form}
      noValidate
      aria-label={t.addTitle}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || loaded === null) return;
        const built = buildAccount(
          form,
          loaded.today,
          { accountId: newId(), balanceId: newId() },
          timeNow(),
        );
        if (!built.ok) {
          setErrors(built.errors);
          const order = ['name', 'balance', 'overdraft', 'warning'] as const;
          focusFirst(
            order.filter((one) => built.errors[one] !== undefined).map((one) => `${id}-${one}`),
          );
          return;
        }
        setErrors({});
        setBusy(true);
        setProblem(null);
        const outcome = await makeChange(built.command, t.added(form.name.trim()));
        setBusy(false);
        if (outcome.ok) onDone();
        else setProblem(refusalMessage(outcome.code));
      }}
    >
      <NameBox
        id={`${id}-name`}
        value={form.name}
        error={mistakeWords(errors, 'name')}
        onChange={(name) => set({ name })}
      />
      <ChoiceList<AccountKind>
        legend={words.kind}
        name={`${id}-kind`}
        value={form.kind}
        options={[
          { value: 'current', label: words.current },
          { value: 'savings', label: words.savings },
          { value: 'joint', label: words.joint },
        ]}
        onChange={(kind) => set({ kind })}
      />
      <Field id={`${id}-balance`} label={words.balance} error={mistakeWords(errors, 'balance')}>
        <MoneyInput
          id={`${id}-balance`}
          value={form.balance}
          onChange={(balance) => set({ balance })}
          invalid={errors.balance !== undefined}
          describedBy={describedBy(`${id}-balance`, mistakeWords(errors, 'balance'))}
        />
      </Field>
      <CheckOption checked={form.overdrawn} onChange={(overdrawn) => set({ overdrawn })}>
        {words.overdrawn}
      </CheckOption>
      <LimitBoxes id={id} form={form} set={set} errors={errors} />
      <button type="submit" className={styles.main} aria-disabled={busy}>
        {t.save}
      </button>
      <Problem text={problem} />
    </form>
  );
}

function ChangeAccount({
  account,
  others,
  onDone,
}: {
  readonly account: AccountCard;
  readonly others: readonly { readonly id: string; readonly name: string }[];
  readonly onDone: () => void;
}) {
  const { loaded, makeChange, makeChanges } = usePlanActions();
  const id = useId();
  const [form, setForm] = useState<Form>(() => ({
    ...blankAccount(false, account.name),
    overdraft: account.overdraftLimit === 0 ? '' : amountForTyping(account.overdraftLimit),
    warning:
      account.warningLevel < 0
        ? `-${amountForTyping(account.warningLevel)}`
        : amountForTyping(account.warningLevel),
  }));
  const [errors, setErrors] = useState<AccountErrors>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; at: 'save' | 'close' } | null>(null);
  const [otherId, setOtherId] = useState(others[0]?.id ?? '');
  const closeHeading = useRef<HTMLHeadingElement>(null);
  const set = (change: Partial<Form>) => setForm((now) => ({ ...now, ...change }));
  const other = others.find((one) => one.id === otherId) ?? others[0];
  const left = Math.abs(account.endOfToday);
  const leftWords = formatMoney(left);

  async function change(
    commands: readonly EditCommand[],
    message: string,
    at: 'save' | 'close',
    done: boolean,
  ) {
    setBusy(true);
    setProblem(null);
    const outcome =
      commands.length === 1 && commands[0] !== undefined
        ? await makeChange(commands[0], message)
        : await makeChanges(commands, message);
    setBusy(false);
    if (!outcome.ok) {
      setProblem({ text: refusalMessage(outcome.code), at });
      return;
    }
    if (done) onDone();
    else closeHeading.current?.focus();
  }

  function save() {
    if (busy) return;
    const found: AccountErrors = {};
    const name = form.name.trim();
    if (name === '') found.name = 'nameError';
    const overdraft = form.overdraft.trim() === '' ? 0 : parseAmount(form.overdraft);
    if (overdraft === null) found.overdraft = 'overdraftError';
    const warning = form.warning.trim() === '' ? 0 : parseSignedAmount(form.warning);
    if (warning === null) found.warning = 'warningError';
    setErrors(found);
    if (overdraft === null || warning === null || name === '') {
      const order = ['name', 'overdraft', 'warning'] as const;
      focusFirst(order.filter((one) => found[one] !== undefined).map((one) => `${id}-${one}`));
      return;
    }
    const edits: { name?: string; overdraftLimit?: number; warningLevel?: number } = {};
    if (name !== account.name) edits.name = name;
    if (overdraft !== account.overdraftLimit) edits.overdraftLimit = overdraft;
    if (warning !== account.warningLevel) edits.warningLevel = warning;
    if (Object.keys(edits).length === 0) {
      setProblem({ text: t.nothingChanged, at: 'save' });
      return;
    }
    change(
      [{ kind: 'change-account', accountId: account.id, edits }],
      t.changed(name),
      'save',
      true,
    );
  }

  function move() {
    if (busy || loaded === null || other === undefined) return;
    const out = account.closing === 'money-left';
    const from = out ? { id: account.id, name: account.name } : other;
    const to = out ? other : { id: account.id, name: account.name };
    const seriesId = newId();
    const today = loaded.today;
    change(
      [
        {
          kind: 'add-payment',
          series: {
            id: seriesId,
            accountId: from.id,
            toAccountId: to.id,
            name: t.moveName(from.name, to.name),
            direction: 'transfer',
            amount: left,
            start: today,
            schedule: { kind: 'once' },
            end: { kind: 'never' },
            holidayRule: 'keep',
            type: 'savings',
            isEstimate: false,
          },
          madeAt: timeNow(),
        },
        // Marked as done: the account closes once the money has really moved (D151, D158).
        { kind: 'tick', seriesId, originalDate: today, tickedAt: timeNow() },
      ],
      t.moved(leftWords, from.name, to.name),
      'close',
      false,
    );
  }

  return (
    <div className={styles.form}>
      <form
        className={styles.form}
        noValidate
        aria-label={t.changeTitle}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <NameBox
          id={`${id}-name`}
          value={form.name}
          error={mistakeWords(errors, 'name')}
          onChange={(name) => set({ name })}
        />
        <LimitBoxes id={id} form={form} set={set} errors={errors} />
        <button type="submit" className={styles.main} aria-disabled={busy}>
          {t.saveChanges}
        </button>
        {problem?.at === 'save' ? <Problem text={problem.text} /> : null}
      </form>

      <section className={styles.group} aria-labelledby={`${id}-close`} data-testid="close-account">
        <h3 id={`${id}-close`} ref={closeHeading} tabIndex={-1} className={styles.subheading}>
          {t.closeHeading}
        </h3>
        {account.closing === 'in-use' ? <p className={styles.note}>{t.inUse}</p> : null}
        {account.closing === 'ready' ? (
          <>
            <p className={styles.hint}>{t.closeIntro}</p>
            <button
              type="button"
              className={styles.outlined}
              aria-disabled={busy}
              onClick={() =>
                change(
                  [{ kind: 'close-account', accountId: account.id }],
                  t.closed(account.name),
                  'close',
                  true,
                )
              }
            >
              {t.close}
            </button>
          </>
        ) : null}
        {account.closing === 'money-left' || account.closing === 'overdrawn' ? (
          <>
            <p className={`${styles.note} num`}>
              {(account.closing === 'money-left' ? t.moneyLeft : t.overdrawn)(leftWords)}
            </p>
            {others.length === 0 ? (
              <p className={styles.hint}>{t.noOther}</p>
            ) : (
              <>
                {others.length > 1 ? (
                  <ChoiceList<string>
                    legend={account.closing === 'money-left' ? t.moveTo : t.moveFrom}
                    name={`${id}-other`}
                    value={other?.id ?? ''}
                    options={others.map((one) => ({ value: one.id, label: one.name }))}
                    onChange={setOtherId}
                  />
                ) : null}
                <div className={styles.withHint}>
                  <button
                    type="button"
                    className={styles.outlined}
                    aria-disabled={busy}
                    aria-describedby={`${id}-move-hint`}
                    onClick={move}
                  >
                    {(account.closing === 'money-left' ? t.moveOut : t.moveIn)(leftWords)}
                  </button>
                  <p id={`${id}-move-hint`} className={styles.hint}>
                    {t.moveHint}
                  </p>
                </div>
              </>
            )}
          </>
        ) : null}
        {problem?.at === 'close' ? <Problem text={problem.text} /> : null}
      </section>
    </div>
  );
}
