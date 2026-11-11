'use client';

// Screen 1, your account (brief 4.1 and 4.2, D47, D163, step 2e): its name,
// what the bank shows today, any overdraft limit and "Warn me when it goes
// under" (£20.00 suggested), with "Add another account", and which part of
// the UK the person lives in, for bank holidays. This screen can't be
// skipped: every plan starts from a balance.

import { type AccountKind, NATIONS, type Nation } from '@prepenny/engine';
import { useId, useState } from 'react';
import { newId, timeInOrder } from '../../lib/ids.ts';
import { formatMoney } from '../../lib/money.ts';
import {
  type AccountErrors,
  type AccountForm,
  accountTyped,
  blankAccount,
  buildAccount,
  withKind,
} from '../../lib/setup-forms.ts';
import { strings } from '../../strings/en-GB.ts';
import { ChoiceList } from '../ChoiceList.tsx';
import { CheckOption, describedBy, Field, MoneyInput } from '../Fields.tsx';
import formStyles from '../Form.module.css';
import { focusFirst } from './focus.ts';
import styles from './Setup.module.css';
import { AddedList, focusAddAnother, SetupCard, StepFrame } from './StepFrame.tsx';
import { useStep } from './useStep.ts';

const t = strings.setup.account;

/** Each kind's own name, which an account's name follows until one is typed (D429). */
const KIND_NAMES = { current: t.current, savings: t.savings, joint: t.joint } as const;

interface Draft {
  readonly key: string;
  readonly form: AccountForm;
  /** True once the person has typed in the name box: their name then stays (D429). */
  readonly named: boolean;
}

export function StepAccounts() {
  const step = useStep(1);
  const id = useId();
  const saved = step.items('account');
  const [drafts, setDrafts] = useState<readonly Draft[]>(() =>
    step.accounts.length === 0
      ? [{ key: newId(), form: blankAccount(true, t.firstName), named: false }]
      : [],
  );
  const [errors, setErrors] = useState<Readonly<Record<string, AccountErrors>>>({});
  const [nation, setNation] = useState<Nation>(
    step.records.settings?.nation ?? 'england-and-wales',
  );

  const setForm = (key: string, change: Partial<AccountForm>) =>
    setDrafts((now) =>
      now.map((draft) =>
        draft.key === key ? { ...draft, form: { ...draft.form, ...change } } : draft,
      ),
    );
  /** The name box typed in: from now on the name is the person's own. */
  const setName = (key: string, name: string) =>
    setDrafts((now) =>
      now.map((draft) =>
        draft.key === key ? { ...draft, named: true, form: { ...draft.form, name } } : draft,
      ),
    );
  /** A kind chosen: the name follows it, until the person has typed one of their own. */
  const setKind = (key: string, kind: AccountKind) =>
    setDrafts((now) =>
      now.map((draft) =>
        draft.key === key
          ? { ...draft, form: withKind(draft.form, kind, draft.named, KIND_NAMES) }
          : draft,
      ),
    );
  const fieldId = (key: string, field: keyof AccountForm) => `${id}-${key}-${field}`;

  /** Checks every form with something typed, or the first when there's no account yet. */
  function check() {
    const found: Record<string, AccountErrors> = {};
    const built: {
      key: string;
      command: Parameters<typeof step.save>[0]['commands'][number];
      accountId: string;
    }[] = [];
    drafts.forEach((draft, index) => {
      const needed = accountTyped(draft.form) || (index === 0 && step.accounts.length === 0);
      if (!needed) return;
      const accountId = newId();
      const result = buildAccount(
        draft.form,
        step.today,
        { accountId, balanceId: newId() },
        timeInOrder(),
      );
      if (result.ok) built.push({ key: draft.key, command: result.command, accountId });
      else found[draft.key] = result.errors;
    });
    return { found, built };
  }

  async function next() {
    step.setProblem(null);
    const { found, built } = check();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(
        drafts.flatMap((draft) =>
          (['name', 'balance', 'overdraft', 'warning'] as const)
            .filter((field) => found[draft.key]?.[field] !== undefined)
            .map((field) => fieldId(draft.key, field)),
        ),
      );
      return;
    }
    step.setBusy(true);
    for (const one of built) {
      const outcome = await step.save({
        commands: [one.command],
        item: { kind: 'account', id: one.accountId },
      });
      if (!outcome.ok) {
        step.setBusy(false);
        step.setProblem(strings.setup.problem);
        return;
      }
      setDrafts((now) => now.filter((draft) => draft.key !== one.key));
    }
    const settings = step.records.settings;
    const outcome = await step.save({
      commands: settings?.nation === nation ? [] : [{ kind: 'set-nation', nation }],
      step: 2,
    });
    step.setBusy(false);
    if (!outcome.ok) step.setProblem(strings.setup.problem);
  }

  const balanceOf = (accountId: string) => {
    const updates = step.records.balanceUpdates.filter((one) => one.accountId === accountId);
    return updates.at(-1)?.balance ?? 0;
  };

  return (
    <StepFrame
      step={1}
      title={t.title}
      intro={t.intro}
      onNext={next}
      onBack={() => step.go(0)}
      busy={step.busy}
      problem={step.problem}
    >
      <AddedList
        items={saved.flatMap((item) => {
          const account = step.records.accounts.find((one) => one.id === item.id);
          if (account === undefined) return [];
          const balance = formatMoney(balanceOf(account.id));
          const warning = formatMoney(account.warningLevel, { wholePounds: true });
          return [
            {
              id: item.id,
              name: account.name ?? '',
              line:
                account.overdraftLimit > 0
                  ? t.cardOverdraft(
                      balance,
                      formatMoney(account.overdraftLimit, { wholePounds: true }),
                      warning,
                    )
                  : t.card(balance, warning),
              onRemove: () => step.removeItem(item.id),
              problem: step.removeProblem(item.id),
            },
          ];
        })}
      />

      {drafts.map((draft, index) => {
        const form = draft.form;
        const error = (field: keyof AccountForm) => {
          const mistake = errors[draft.key]?.[field];
          return mistake === undefined ? undefined : t[mistake];
        };
        const first = index === 0 && step.accounts.length === 0;
        return (
          <SetupCard
            key={draft.key}
            heading={first ? null : t.anotherHeading}
            testId="account-form"
          >
            <Field id={fieldId(draft.key, 'name')} label={t.name} error={error('name')}>
              <input
                id={fieldId(draft.key, 'name')}
                className={formStyles.input}
                type="text"
                autoComplete="off"
                value={form.name}
                aria-invalid={error('name') !== undefined}
                aria-describedby={describedBy(fieldId(draft.key, 'name'), error('name'))}
                onChange={(event) => setName(draft.key, event.target.value)}
              />
            </Field>
            <ChoiceList<AccountKind>
              legend={t.kind}
              name={`${id}-${draft.key}-kind`}
              value={form.kind}
              options={[
                { value: 'current', label: t.current },
                { value: 'savings', label: t.savings },
                { value: 'joint', label: t.joint },
              ]}
              onChange={(kind) => setKind(draft.key, kind)}
            />
            <Field id={fieldId(draft.key, 'balance')} label={t.balance} error={error('balance')}>
              <MoneyInput
                id={fieldId(draft.key, 'balance')}
                value={form.balance}
                onChange={(balance) => setForm(draft.key, { balance })}
                invalid={error('balance') !== undefined}
                describedBy={describedBy(fieldId(draft.key, 'balance'), error('balance'))}
              />
            </Field>
            <CheckOption
              checked={form.overdrawn}
              onChange={(overdrawn) => setForm(draft.key, { overdrawn })}
            >
              {t.overdrawn}
            </CheckOption>
            <Field
              id={fieldId(draft.key, 'overdraft')}
              label={t.overdraft}
              error={error('overdraft')}
              hint={t.overdraftHint}
            >
              <MoneyInput
                id={fieldId(draft.key, 'overdraft')}
                value={form.overdraft}
                onChange={(overdraft) => setForm(draft.key, { overdraft })}
                invalid={error('overdraft') !== undefined}
                describedBy={describedBy(fieldId(draft.key, 'overdraft'), error('overdraft'), [
                  `${fieldId(draft.key, 'overdraft')}-hint`,
                ])}
              />
            </Field>
            <Field
              id={fieldId(draft.key, 'warning')}
              label={t.warning}
              error={error('warning')}
              hint={t.warningHint}
            >
              <MoneyInput
                id={fieldId(draft.key, 'warning')}
                value={form.warning}
                onChange={(warning) => setForm(draft.key, { warning })}
                invalid={error('warning') !== undefined}
                describedBy={describedBy(fieldId(draft.key, 'warning'), error('warning'), [
                  `${fieldId(draft.key, 'warning')}-hint`,
                ])}
              />
            </Field>
            {first ? null : (
              <button
                type="button"
                className={formStyles.quiet}
                onClick={() => {
                  setDrafts((now) => now.filter((one) => one.key !== draft.key));
                  focusAddAnother();
                }}
              >
                {t.removeForm}
              </button>
            )}
          </SetupCard>
        );
      })}

      <button
        data-add-another
        type="button"
        className={formStyles.outlined}
        onClick={() => {
          const key = newId();
          setDrafts((now) => [
            ...now,
            { key, form: blankAccount(false, KIND_NAMES.savings), named: false },
          ]);
          // The new account's name box takes focus once it's drawn.
          requestAnimationFrame(() => document.getElementById(fieldId(key, 'name'))?.focus());
        }}
      >
        {t.addAnother}
      </button>

      <div className={styles.card}>
        <ChoiceList<Nation>
          legend={t.nation}
          name={`${id}-nation`}
          value={nation}
          options={NATIONS.map((value) => ({ value, label: t.nations[value] }))}
          onChange={setNation}
          describedBy={`${id}-nation-hint`}
        />
        <p id={`${id}-nation-hint`} className={formStyles.hint}>
          {t.nationHint}
        </p>
      </div>
    </StepFrame>
  );
}
