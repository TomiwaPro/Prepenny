'use client';

// What if (brief 4.10, D135, the What if sketch in ARCHITECTURE.md 4.6): a
// safe practice mode. The top says plainly that it's practice. Changes are
// made with the same sheets as real ones (editing a payment, Add a payment,
// I did overtime and Update balance), on a practice copy of the plan: the
// sheets are given the practice plan, and their changes go into the list of
// practice changes instead of being saved. The real plan and the practice
// plan are shown side by side: each account's lowest point ahead with Tight
// or Short, any shortfall with the payments that could move (D69), each
// debt's Paid off on and each savings goal's date. "Keep these changes"
// makes every practice change on the real plan as one change, which one
// Undo takes back; "Throw them away" leaves the real plan exactly as it was.
//
// Practice changes stay on this phone, in memory, while PrePenny is open
// (ARCHITECTURE.md 3.8), so going to another screen and back keeps them.
// They're made again on the real plan each time it changes, as a sync clash
// runs a command again (D135).

import type { EditCommand } from '@prepenny/engine';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatDay } from '../lib/dates.ts';
import { formatIn, formatMoney } from '../lib/money.ts';
import { refusalMessage } from '../lib/refusals.ts';
import {
  COULD_MOVE_SHOWN,
  type DebtSide,
  type GoalSide,
  type LowestSide,
  type ShortfallView,
  type WhatIfView,
} from '../lib/what-if-view.ts';
import { strings } from '../strings/en-GB.ts';
import { askInBackground, EngineError } from '../worker/client.ts';
import { AddPaymentSheet } from './AddPaymentSheet.tsx';
import { ComingUpScreen } from './ComingUpScreen.tsx';
import { Problem } from './Fields.tsx';
import formStyles from './Form.module.css';
import { focusUndoBar } from './focusUndo.ts';
import { OvertimeSheet } from './OvertimeSheet.tsx';
import {
  type ChangeOutcome,
  type LoadedPlan,
  type PlanActions,
  PlanActionsOverride,
  usePlanActions,
} from './PlanProvider.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import styles from './Screens.module.css';
import { StatusPill } from './StatusPill.tsx';
import { UpdateBalanceSheet } from './UpdateBalanceSheet.tsx';
import whatIfStyles from './WhatIf.module.css';

const t = strings.whatIf;

/** One practice change: the commands one sheet made, and the words it would show in the undo bar. */
interface PracticeChange {
  readonly commands: readonly EditCommand[];
  readonly message: string;
}

/** The practice changes, kept while PrePenny is open, for the plan they were made on. */
let memory: { readonly planId: string; readonly changes: readonly PracticeChange[] } | null = null;

const codeOf = (error: unknown) => (error instanceof EngineError ? error.code : 'unexpected');

const commandsOf = (changes: readonly PracticeChange[]) =>
  changes.flatMap((change) => change.commands);

/** The view shown, with what it was worked out from. */
interface Shown {
  readonly view: WhatIfView;
  readonly realVersion: number;
  readonly changes: readonly PracticeChange[];
  /** Goes up each time, so the sheets know the practice plan they changed is on screen. */
  readonly version: number;
}

function whereWords(side: LowestSide, today: string): string {
  const day = formatDay(side.date, today);
  return side.after === null ? day : t.onAfter(day, side.after);
}

/** One side of the lowest point: the amount, its date and the payment it's after, and Tight or Short. */
function LowestColumn({
  label,
  side,
  today,
  testId,
}: {
  readonly label: string;
  readonly side: LowestSide;
  readonly today: string;
  readonly testId: string;
}) {
  return (
    <div className={whatIfStyles.column} data-testid={testId}>
      <p className={styles.label}>{label}</p>
      <p className={`${whatIfStyles.amount} num`}>{formatMoney(side.balance)}</p>
      <p className={styles.second}>{whereWords(side, today)}</p>
      {side.status === 'ok' ? null : (
        <p>
          <StatusPill status={side.status} />
        </p>
      )}
    </div>
  );
}

/** A shortfall, and the payments that could move to fix it (brief 5.5, D69). */
function Shortfall({
  words,
  shortfall,
  today,
  testId,
}: {
  readonly words: string;
  readonly shortfall: ShortfallView;
  readonly today: string;
  readonly testId: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? shortfall.couldMove : shortfall.couldMove.slice(0, COULD_MOVE_SHOWN);
  const listId = useId();
  return (
    <div className={whatIfStyles.shortfall} data-testid={testId}>
      <p className={`${styles.line} num`}>{words}</p>
      {shortfall.couldMove.length === 0 ? (
        <p className={styles.second}>{t.noneFixes}</p>
      ) : (
        <>
          <p className={styles.second}>
            {shortfall.moveTo === null
              ? t.couldMove
              : t.couldMoveTo(formatDay(shortfall.moveTo, today))}
          </p>
          <ul id={listId} className={styles.list} data-testid="could-move">
            {shown.map((one) => (
              <li key={`${one.name} ${one.date}`} className={whatIfStyles.moveRow}>
                <span className={whatIfStyles.moveName}>
                  <span>{one.name}</span>
                  <span className={styles.second}>{formatDay(one.date, today)}</span>
                </span>
                <span className="num">{formatMoney(one.change, { sign: 'always' })}</span>
              </li>
            ))}
          </ul>
          {shortfall.couldMove.length > COULD_MOVE_SHOWN && !all ? (
            <button
              type="button"
              className={formStyles.outlined}
              aria-controls={listId}
              onClick={() => setAll(true)}
            >
              {t.showAll(shortfall.couldMove.length)}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function debtWords(side: DebtSide, currency: string, view: WhatIfView): string {
  const words =
    side.paidOffOn === null
      ? t.leftOn(formatIn(side.leftAtEnd ?? 0, currency), formatDay(view.debtsTo, view.today))
      : formatDay(side.paidOffOn, view.today);
  return side.isEstimate ? t.estimate(words) : words;
}

function goalWords(side: GoalSide, view: WhatIfView): string {
  const words =
    side.reachedOn === null
      ? t.notReached(formatMoney(side.savedAtEnd), formatDay(view.debtsTo, view.today))
      : formatDay(side.reachedOn, view.today);
  return side.isEstimate ? t.estimate(words) : words;
}

/** The names of the two columns, once above a list of pairs. */
function ColumnNames() {
  return (
    <div className={whatIfStyles.columns} aria-hidden="true">
      <span className={styles.label}>{t.real}</span>
      <span className={styles.label}>{t.practice}</span>
    </div>
  );
}

/** Two short lines side by side: the real plan's and the practice plan's. */
function Pair({
  name,
  real,
  practice,
  testId,
}: {
  readonly name: string;
  readonly real: string;
  readonly practice: string;
  readonly testId: string;
}) {
  return (
    <li className={whatIfStyles.pairItem} data-testid={testId} data-name={name}>
      <h4 className={whatIfStyles.pairName}>{name}</h4>
      <div className={whatIfStyles.columns}>
        {/* The column names are said once above the list, and to screen readers here. */}
        <p className={whatIfStyles.column}>
          <span className="visually-hidden">{t.real}: </span>
          <span className={`${styles.line} num`} data-side="real">
            {real}
          </span>
        </p>
        <p className={whatIfStyles.column}>
          <span className="visually-hidden">{t.practice}: </span>
          <span className={`${styles.line} num`} data-side="practice">
            {practice}
          </span>
        </p>
      </div>
    </li>
  );
}

function SideBySide({ view }: { readonly view: WhatIfView }) {
  const today = view.today;
  return (
    <section className={styles.card} aria-labelledby="side-by-side" data-testid="side-by-side">
      <h2 id="side-by-side" className={styles.cardTitle}>
        {t.sideBySide}
      </h2>
      {view.accounts.map((account) => {
        const shortWords = (side: LowestSide, words: typeof t.practiceShort) =>
          side.shortfall === null
            ? null
            : words(formatMoney(side.shortfall.amount), formatDay(side.shortfall.date, today));
        const practiceShort = shortWords(account.practice, t.practiceShort);
        const realShort = shortWords(account.real, t.realShort);
        const sameShortfall =
          JSON.stringify(account.real.shortfall) === JSON.stringify(account.practice.shortfall);
        return (
          <div
            key={account.id}
            className={whatIfStyles.account}
            data-testid="what-if-account"
            data-account={account.name}
          >
            <h3 className={whatIfStyles.subheading}>
              {t.lowestPoint}, {account.name}
            </h3>
            <div className={whatIfStyles.columns}>
              <LowestColumn label={t.real} side={account.real} today={today} testId="real" />
              <LowestColumn
                label={t.practice}
                side={account.practice}
                today={today}
                testId="practice"
              />
            </div>
            {practiceShort === null || account.practice.shortfall === null ? null : (
              <Shortfall
                words={practiceShort}
                shortfall={account.practice.shortfall}
                today={today}
                testId="practice-short"
              />
            )}
            {realShort === null || account.real.shortfall === null || sameShortfall ? null : (
              <Shortfall
                words={realShort}
                shortfall={account.real.shortfall}
                today={today}
                testId="real-short"
              />
            )}
          </div>
        );
      })}
      {view.debts.length === 0 ? null : (
        <div className={whatIfStyles.account}>
          <h3 className={whatIfStyles.subheading}>{t.paidOffOn}</h3>
          <p className={styles.second}>{t.paidOffIntro}</p>
          <ColumnNames />
          <ul className={styles.list} data-testid="what-if-debts">
            {view.debts.map((debt) => (
              <Pair
                key={debt.id}
                name={debt.name}
                real={debtWords(debt.real, debt.currency, view)}
                practice={debtWords(debt.practice, debt.currency, view)}
                testId="what-if-debt"
              />
            ))}
          </ul>
        </div>
      )}
      {view.goals.length === 0 ? null : (
        <div className={whatIfStyles.account}>
          <h3 className={whatIfStyles.subheading}>{t.goalsReached}</h3>
          <ColumnNames />
          <ul className={styles.list} data-testid="what-if-goals">
            {view.goals.map((goal) => (
              <Pair
                key={goal.id}
                name={goal.name}
                real={goalWords(goal.real, view)}
                practice={goalWords(goal.practice, view)}
                testId="what-if-goal"
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type Open = 'add-payment' | 'overtime' | 'update-balance' | null;

export function WhatIfScreen() {
  const real = usePlanActions();
  const loaded = real.loaded;
  const fromComingUp = useSearchParams()?.get('from') === 'coming-up';
  const [changes, setChanges] = useState<readonly PracticeChange[]>(() => memory?.changes ?? []);
  const [shown, setShown] = useState<Shown | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const changesRef = useRef(changes);
  const loadedRef = useRef<LoadedPlan | null>(loaded);
  const version = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const noteRef = useRef<HTMLParagraphElement>(null);
  loadedRef.current = loaded;

  const keepChanges = useCallback((next: readonly PracticeChange[]) => {
    changesRef.current = next;
    setChanges(next);
  }, []);

  // Practice changes made on another plan, such as the example, aren't this plan's.
  useEffect(() => {
    if (loaded === null) return;
    if (memory !== null && memory.planId !== loaded.plan.id) {
      memory = null;
      keepChanges([]);
    }
  }, [loaded, keepChanges]);

  useEffect(() => {
    if (loaded === null) return;
    memory = changes.length === 0 ? null : { planId: loaded.plan.id, changes };
  }, [loaded, changes]);

  // Worked out again whenever the real plan or the list of changes is new.
  useEffect(() => {
    if (loaded === null) return;
    if (shown !== null && shown.realVersion === loaded.version && shown.changes === changes) {
      return;
    }
    let current = true;
    askInBackground({
      kind: 'what-if',
      records: loaded.records,
      today: loaded.today,
      practice: commandsOf(changes),
    }).then(
      (view) => {
        if (!current) return;
        version.current += 1;
        setShown({ view, realVersion: loaded.version, changes, version: version.current });
        setFailed(false);
      },
      () => {
        if (!current) return;
        if (changes.length > 0) {
          // The real plan changed so that a practice change can't be made any more.
          keepChanges([]);
          setNote(t.cantMakeAgain);
          return;
        }
        setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [loaded, changes, shown, keepChanges]);

  /** A practice change from a sheet: worked out on top of the ones before it, never saved. */
  const practiceChange = useCallback(
    (commands: readonly EditCommand[], message: string): Promise<ChangeOutcome> => {
      const task = async (): Promise<ChangeOutcome> => {
        const now = loadedRef.current;
        if (now === null) return { ok: false, code: 'not-ready' };
        const next = [...changesRef.current, { commands, message }];
        let view: WhatIfView;
        try {
          view = await askInBackground({
            kind: 'what-if',
            records: now.records,
            today: now.today,
            practice: commandsOf(next),
          });
        } catch (error) {
          return { ok: false, code: codeOf(error) };
        }
        version.current += 1;
        const made = version.current;
        keepChanges(next);
        setShown({ view, realVersion: now.version, changes: next, version: made });
        setNote(null);
        setProblem(null);
        return { ok: true, version: made };
      };
      const next = queue.current.then(task, task);
      queue.current = next.catch(() => undefined);
      return next;
    },
    [keepChanges],
  );

  const practiceLoaded = useMemo<LoadedPlan | null>(
    () =>
      loaded === null || shown === null
        ? null
        : {
            plan: loaded.plan,
            records: shown.view.records,
            today: loaded.today,
            version: shown.version,
          },
    [loaded, shown],
  );

  const practiceActions = useMemo<PlanActions>(
    () => ({
      ...real,
      loaded: practiceLoaded,
      lastChange: null,
      makeChange: (command, message) => practiceChange([command], message),
      makeChanges: (commands, message) => practiceChange(commands, message),
      undoLastChange: async () => ({ ok: false, code: 'not-last-change' }),
      dismissLastChange: () => {},
    }),
    [real, practiceLoaded, practiceChange],
  );

  const say = (words: string) => {
    setNote(words);
    // Focus moves to the words, because the buttons that were tapped go (WCAG 2.4.3).
    setTimeout(() => noteRef.current?.focus(), 0);
  };

  const keep = async () => {
    if (busy || changes.length === 0) return;
    setBusy(true);
    setProblem(null);
    const message = t.kept(changes.length);
    const outcome = await real.makeChanges(commandsOf(changes), message);
    setBusy(false);
    if (!outcome.ok) {
      setProblem(refusalMessage(outcome.code));
      return;
    }
    keepChanges([]);
    setNote(null);
    focusUndoBar(message);
  };

  const view = shown?.view ?? null;
  const closeIf = (id: Open) => () => setOpen((now) => (now === id ? null : now));

  return (
    <>
      <ScreenHeader
        heading={t.heading}
        purpose={t.purpose}
        back={
          fromComingUp
            ? { label: t.backToComingUp, href: '/app/coming-up/' }
            : { label: t.backToMore, href: '/app/more/' }
        }
      />

      <section
        className={styles.card}
        aria-labelledby="practice-changes"
        data-testid="practice-changes"
      >
        <h2
          id="practice-changes"
          className={styles.cardTitle}
          tabIndex={-1}
          data-focus-after-change
        >
          {t.yourChanges}
        </h2>
        <div role="status">
          {note === null ? null : (
            <p ref={noteRef} tabIndex={-1} className={styles.line} data-testid="what-if-note">
              {note}
            </p>
          )}
          {changes.length === 0 ? (
            note === null ? (
              <p className={styles.second}>{t.noChanges}</p>
            ) : null
          ) : (
            <ol className={`${styles.list} ${whatIfStyles.changes}`} data-testid="practice-list">
              {changes.map((change, index) => (
                // The same change can be made twice, so its place in the list is part of its key.
                // biome-ignore lint/suspicious/noArrayIndexKey: changes are only added or taken from the end
                <li key={`${index} ${change.message}`}>{change.message}</li>
              ))}
            </ol>
          )}
        </div>
        {changes.length === 0 ? null : (
          <>
            <button
              type="button"
              className={formStyles.quiet}
              onClick={() => {
                keepChanges(changes.slice(0, -1));
                say(t.takenBack);
              }}
            >
              {t.takeBack}
            </button>
            <div className={formStyles.withHint}>
              <button
                type="button"
                className={formStyles.main}
                aria-disabled={busy}
                aria-describedby="keep-hint"
                onClick={keep}
              >
                {t.keep}
              </button>
              <p id="keep-hint" className={formStyles.hint}>
                {t.keepHint}
              </p>
            </div>
            <div className={formStyles.withHint}>
              <button
                type="button"
                className={formStyles.outlined}
                aria-describedby="throw-hint"
                onClick={() => {
                  if (busy) return;
                  keepChanges([]);
                  say(t.thrownAway);
                }}
              >
                {t.throwAway}
              </button>
              <p id="throw-hint" className={formStyles.hint}>
                {t.throwAwayHint}
              </p>
            </div>
            <Problem text={problem} />
          </>
        )}
      </section>

      {view === null ? (
        <p className={styles.card} role={failed ? 'alert' : undefined}>
          {failed ? strings.errors.plan : t.loading}
        </p>
      ) : (
        <SideBySide view={view} />
      )}

      <PlanActionsOverride value={practiceActions}>
        <section className={styles.card} aria-labelledby="make-change">
          <h2 id="make-change" className={styles.cardTitle}>
            {t.makeChange}
          </h2>
          <p className={styles.second}>{t.makeChangeIntro}</p>
          <div className={whatIfStyles.buttons}>
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => setOpen('add-payment')}
            >
              {strings.actions.addPayment}
            </button>
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => setOpen('overtime')}
            >
              {strings.actions.overtime}
            </button>
            <button
              type="button"
              className={formStyles.outlined}
              aria-haspopup="dialog"
              onClick={() => setOpen('update-balance')}
            >
              {strings.actions.updateBalance}
            </button>
          </div>
        </section>
        <section className={whatIfStyles.payments} aria-labelledby="practice-payments">
          <h2 id="practice-payments" className={whatIfStyles.paymentsHeading}>
            {t.payments}
          </h2>
          {practiceLoaded === null ? null : <ComingUpScreen practice />}
        </section>
        <AddPaymentSheet open={open === 'add-payment'} onClose={closeIf('add-payment')} />
        <OvertimeSheet open={open === 'overtime'} onClose={closeIf('overtime')} />
        <UpdateBalanceSheet open={open === 'update-balance'} onClose={closeIf('update-balance')} />
      </PlanActionsOverride>
    </>
  );
}
