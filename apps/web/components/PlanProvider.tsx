'use client';

// Loads the plan from the phone's database and works it out in the
// background worker: the person's own plan, or Sam's example when they've
// chosen to look at it (step 2e). Sam's example is put on the phone the
// first time it's looked at (D15), and the browser is asked to keep the data
// (ARCHITECTURE.md 3.8, 7). When the person's own plan isn't set up yet, the
// app goes to setup instead (brief 4.1).
//
// Every change goes through here (brief Part 3, principle 4): the engine
// makes it in the background, it's saved on the phone straight away, the
// plan is worked out again, and the last change can be undone in one tap
// (D87). Changes are made one at a time, in the order they're asked for.

import type { Edit, EditCommand, PlanRecords } from '@prepenny/engine';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  askToKeepData,
  exampleNeedsReplacing,
  loadRecords,
  openDb,
  ownPlanOnPhone,
  type Showing,
  type StoredPlan,
  saveChange,
  savePlan,
  setShowing,
  showingOnPhone,
} from '../data/db.ts';
import {
  EXAMPLE_PLAN_ID,
  EXAMPLE_VERSION,
  examplePlan,
  fingerprint,
} from '../data/example-plan.ts';
import { forgetPractice } from '../data/practice.ts';
import { onPlanBroughtDown, syncSoon } from '../data/sync.ts';
import { type BarWords, barWords, type ChangeWords } from '../lib/bar-words.ts';
import type { PaymentNumbers } from '../lib/edit.ts';
import type { HomeView } from '../lib/home.ts';
import { newId } from '../lib/ids.ts';
import type { PaymentAt } from '../lib/payment-at.ts';
import { setupDone } from '../lib/setup-progress.ts';
import { testSetting } from '../lib/test-setting.ts';
import { todayFor } from '../lib/today.ts';
import { strings } from '../strings/en-GB.ts';
import {
  EngineError,
  editInBackground,
  editsInBackground,
  workOutHomeInBackground,
} from '../worker/client.ts';

export type PlanState =
  | { readonly status: 'loading'; readonly plan: StoredPlan | null }
  | {
      readonly status: 'ready';
      readonly plan: StoredPlan;
      readonly home: HomeView;
      /** The version of the records Home was worked out from. */
      readonly version: number;
    }
  | { readonly status: 'failed'; readonly plan: StoredPlan | null };

/** The plan's records as they are now. `version` goes up with every change. */
export interface LoadedPlan {
  readonly plan: StoredPlan;
  readonly records: PlanRecords;
  readonly today: string;
  readonly version: number;
}

/** The change the undo bar is about (ARCHITECTURE.md 4.5). */
export interface LastChange {
  /** Goes up with every change, so the bar is drawn afresh and announced again, even with the same words. */
  readonly id: number;
  readonly message: string;
  /** Shorter words for very large text (D284). */
  readonly short: string;
  /** The edit Undo puts back, or null when there's nothing to undo, such as just after an undo. */
  readonly edit: Edit | null;
  /** The payments the edit's changes and ticks were on, so Undo can check they still are (PLAN.md item 4). */
  readonly numbers?: PaymentNumbers;
}

/**
 * How a change went: made, with the records' new version, or refused with the
 * engine's code, for the strings file.
 */
export type ChangeOutcome =
  | { readonly ok: true; readonly version: number }
  | { readonly ok: false; readonly code: string };

export interface PlanActions {
  readonly loaded: LoadedPlan | null;
  /**
   * The person's own plan isn't set up yet, and they haven't chosen to look
   * at the example: the app goes to setup (step 2e).
   */
  readonly needsSetup: boolean;
  /** How far the person's own plan is: none yet, part-way through setup, or ready. */
  readonly ownPlan: OwnPlan;
  readonly lastChange: LastChange | null;
  /** Makes one change and, when it works, shows `message` in the undo bar. */
  makeChange(command: EditCommand, message: ChangeWords): Promise<ChangeOutcome>;
  /**
   * Makes several commands one after another as one change, so one Undo
   * takes all of them back (D87), such as "Make it £20.99 and stop after it"
   * (D63).
   */
  makeChanges(commands: readonly EditCommand[], message: ChangeWords): Promise<ChangeOutcome>;
  /**
   * "Put mine back" after a clash (step 3d): makes a change's commands
   * again, now, on the plan as it is, each payment found again by its
   * family and number, as one change with one undo.
   */
  makeChangesAgain(
    commands: readonly EditCommand[],
    madeOn: readonly PaymentAt[],
    message: ChangeWords,
  ): Promise<ChangeOutcome>;
  /** Undoes the change the bar showed, and refuses when a newer one has been made since. */
  undoLastChange(id: number): Promise<ChangeOutcome>;
  dismissLastChange(): void;
  /** Puts Sam's example back exactly as it is in the app (D182). */
  startAgainWithExample(): Promise<ChangeOutcome>;
  /**
   * Shows the person's own plan or the example from now on, on this phone.
   * Looking at the example never changes the person's own plan (step 2e).
   */
  showPlan(showing: Showing): Promise<void>;
}

/** The person's own plan on this phone (step 2e). */
export type OwnPlan = 'none' | 'setting-up' | 'ready';

/** A change's words, saying it wasn't saved on the phone (D186). */
function notKept(words: ChangeWords): BarWords {
  const { full, short } = barWords(words);
  return {
    full: `${full} ${strings.undo.notKept}`,
    short: `${short} ${strings.undo.short.notKept}`,
  };
}

const PlanContext = createContext<PlanState>({ status: 'loading', plan: null });

const noPlan = async (..._: unknown[]): Promise<ChangeOutcome> => ({
  ok: false,
  code: 'not-ready',
});

const ActionsContext = createContext<PlanActions>({
  loaded: null,
  needsSetup: false,
  ownPlan: 'none',
  lastChange: null,
  makeChange: noPlan,
  makeChanges: noPlan,
  makeChangesAgain: noPlan,
  undoLastChange: noPlan,
  dismissLastChange: () => {},
  startAgainWithExample: noPlan,
  showPlan: async () => {},
});

/**
 * The example's records and their version: Sam's plan, or the end-to-end
 * tests' own plan when they set one (D201).
 */
function theExample(): { readonly records: PlanRecords; readonly version: string } {
  const plan = testSetting()?.plan;
  return plan === undefined
    ? { records: examplePlan, version: EXAMPLE_VERSION }
    : { records: plan, version: fingerprint(plan) };
}

/**
 * True when the plan showing is Sam's example, as people see it: "Example
 * plan, as on Sun 25 Oct 2026" on Home (D440). A test plan in the example's
 * place (D201) stands for a person's own plan there, so the tests of Home's
 * own words (D430) keep working on it.
 */
export function isSamsExample(plan: StoredPlan): boolean {
  return plan.isExample && testSetting()?.plan === undefined;
}

/** Today for a plan, or the end-to-end tests' own today when they set one (D201). */
export function todayOf(plan: StoredPlan): string {
  return testSetting()?.today ?? todayFor(plan);
}

const freshExample = (): StoredPlan => ({
  id: EXAMPLE_PLAN_ID,
  isExample: true,
  exampleVersion: theExample().version,
});

const ASKED_TO_KEEP = 'asked-to-keep-data';

/** How far an own plan has got. */
function ownPlanOf(plan: StoredPlan | undefined): OwnPlan {
  if (plan === undefined) return 'none';
  return setupDone(plan.setup) ? 'ready' : 'setting-up';
}

/**
 * Which plan to show when this phone hasn't chosen one: the person's own.
 * The end-to-end tests from before setup start on the example (D201).
 */
function firstShowing(): Showing {
  const setting = testSetting();
  return setting?.example === true || setting?.plan !== undefined ? 'example' : 'own';
}

type OnPhone =
  | { readonly plan: StoredPlan; readonly records: PlanRecords; readonly own: OwnPlan }
  | { readonly needsSetup: true; readonly own: OwnPlan };

/**
 * The plan to show from this phone: the person's own once it's set up, or
 * the example when they've chosen it. The example is put there first if it
 * isn't, or when the app's example has changed and the person hasn't
 * changed theirs (D182).
 */
async function planOnPhone(): Promise<OnPhone> {
  const db = openDb();
  const example = theExample();
  try {
    const showing = (await showingOnPhone(db)) ?? firstShowing();
    const own = await ownPlanOnPhone(db);
    if (showing === 'own') {
      if (own === undefined || !setupDone(own.setup)) {
        return { needsSetup: true, own: ownPlanOf(own) };
      }
      return { plan: own, records: await loadRecords(db, own.id), own: 'ready' };
    }
    let plan = await db.plans.get(EXAMPLE_PLAN_ID);
    if (plan === undefined || exampleNeedsReplacing(plan, example.version)) {
      plan = freshExample();
      await savePlan(db, plan, example.records);
      // Practice changes made on the old example aren't the new one's (step 2h).
      await forgetPractice(plan.id);
    }
    if ((await db.device.get(ASKED_TO_KEEP)) === undefined) {
      await db.device.put({ key: ASKED_TO_KEEP, value: await askToKeepData() });
    }
    return { plan, records: await loadRecords(db, EXAMPLE_PLAN_ID), own: ownPlanOf(own) };
  } finally {
    db.close();
  }
}

const codeOf = (error: unknown) => (error instanceof EngineError ? error.code : 'unexpected');

/** What kind of change it is, as the server keeps it: the command's own kind (save_edit). */
function kindOf(command: EditCommand | readonly EditCommand[]): string {
  const kinds = new Set((Array.isArray(command) ? command : [command]).map((one) => one.kind));
  return kinds.size === 1 ? ([...kinds][0] as string) : 'changes';
}

export function PlanProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<PlanState>({ status: 'loading', plan: null });
  const [loaded, setLoaded] = useState<LoadedPlan | null>(null);
  const [lastChange, setLastChange] = useState<LastChange | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [ownPlan, setOwnPlan] = useState<OwnPlan>('none');
  // Goes up to load the plan again, after choosing another one to show.
  const [loadCount, setLoadCount] = useState(0);
  const loadedRef = useRef<LoadedPlan | null>(null);
  const lastChangeRef = useRef<LastChange | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Once the phone's database has failed, nothing more is saved there this
  // time: saving later changes alone, on top of a plan missing earlier ones,
  // could mix two plans together.
  const canSave = useRef(true);
  const changeCount = useRef(0);

  const keepLoaded = useCallback((next: LoadedPlan) => {
    loadedRef.current = next;
    setLoaded(next);
  }, []);

  const showChange = useCallback(
    (words: ChangeWords, edit: Edit | null, numbers?: PaymentNumbers) => {
      changeCount.current += 1;
      const { full, short } = barWords(words);
      const change =
        full === ''
          ? null
          : {
              id: changeCount.current,
              message: full,
              short,
              edit,
              ...(numbers === undefined ? {} : { numbers }),
            };
      lastChangeRef.current = change;
      setLastChange(change);
    },
    [],
  );

  // `loadCount` goes up to load the plan again after choosing another one to show.
  // biome-ignore lint/correctness/useExhaustiveDependencies: loadCount is the reason to run again
  useEffect(() => {
    let current = true;
    (async () => {
      let found: OnPhone;
      try {
        found = await planOnPhone();
      } catch {
        // No database on this phone, for example in some private windows:
        // the example still works, it just isn't saved.
        canSave.current = false;
        found = { plan: freshExample(), records: theExample().records, own: 'none' };
      }
      if (!current) return;
      setOwnPlan(found.own);
      if ('needsSetup' in found) {
        setNeedsSetup(true);
        return;
      }
      setNeedsSetup(false);
      setState({ status: 'loading', plan: found.plan });
      keepLoaded({
        plan: found.plan,
        records: found.records,
        today: todayOf(found.plan),
        version: (loadedRef.current?.version ?? 0) + 1,
      });
    })();
    return () => {
      current = false;
    };
  }, [keepLoaded, loadCount]);

  // Home is worked out again after every change. The old figures stay on
  // screen until the new ones are ready, so nothing flashes.
  useEffect(() => {
    if (loaded === null) return;
    let current = true;
    workOutHomeInBackground(loaded.records, loaded.today).then(
      (home) => {
        if (current)
          setState({ status: 'ready', plan: loaded.plan, home, version: loaded.version });
      },
      () => {
        if (current) setState({ status: 'failed', plan: loaded.plan });
      },
    );
    return () => {
      current = false;
    };
  }, [loaded]);

  /** Runs one task after the ones before it, so changes never overlap. */
  const inTurn = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(task, task);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  // When the plan has been brought up to date from the server (step 3c), the
  // screens show it, in turn with the changes made here.
  useEffect(
    () =>
      onPlanBroughtDown(() => {
        void inTurn(async () => {
          const now = loadedRef.current;
          if (now === null || now.plan.isExample) return;
          try {
            const db = openDb();
            try {
              const plan = await db.plans.get(now.plan.id);
              if (plan === undefined) return;
              keepLoaded({
                ...now,
                plan,
                records: await loadRecords(db, plan.id),
                version: now.version + 1,
              });
            } finally {
              db.close();
            }
          } catch {
            // The plan on screen stays as it is.
          }
        });
      }),
    [inTurn, keepLoaded],
  );

  /**
   * Makes one edit, saves it on the phone and works the plan out again. When
   * the plan is kept in an account, the change joins the queue to send in
   * the same go, and is sent straight after (step 3c).
   */
  const apply = useCallback(
    async (
      command: EditCommand | readonly EditCommand[],
      numbers?: PaymentNumbers,
      madeOn?: readonly PaymentAt[],
    ): Promise<
      | { ok: true; edit: Edit; numbers: PaymentNumbers; kept: boolean; version: number }
      | { ok: false; code: string }
    > => {
      const now = loadedRef.current;
      if (now === null) return { ok: false, code: 'not-ready' };
      let result: Awaited<ReturnType<typeof editInBackground>>;
      try {
        result = Array.isArray(command)
          ? await editsInBackground(now.records, now.today, command, madeOn)
          : await editInBackground(now.records, now.today, command as EditCommand, numbers);
      } catch (error) {
        return { ok: false, code: codeOf(error) };
      }
      let plan: StoredPlan = now.plan.isExample ? { ...now.plan, edited: true } : now.plan;
      let kept = canSave.current;
      if (kept) {
        try {
          const db = openDb();
          try {
            const commands: readonly EditCommand[] = Array.isArray(command)
              ? command
              : [command as EditCommand];
            plan = await saveChange(db, now.plan, result.edit.writes, {
              editId: newId(),
              madeOnPhone: Date.now(),
              kind: kindOf(command),
              // To make it again on newer records after a clash (step 3d).
              commands,
              today: now.today,
              ...(numbers === undefined ? {} : { numbers }),
              before: result.edit.undo,
              payments: result.payments,
            });
          } finally {
            db.close();
          }
        } catch {
          // The change still shows until PrePenny closes, and the undo bar says so.
          canSave.current = false;
          kept = false;
        }
      }
      // Counted as waiting to be sent before it shows anywhere (D510).
      if (kept && !now.plan.isExample) await syncSoon();
      const version = now.version + 1;
      keepLoaded({ ...now, plan, records: result.records, version });
      return { ok: true, edit: result.edit, numbers: result.numbers, kept, version };
    },
    [keepLoaded],
  );

  const makeChange = useCallback(
    (command: EditCommand, message: ChangeWords) =>
      inTurn(async (): Promise<ChangeOutcome> => {
        const outcome = await apply(command);
        if (!outcome.ok) return outcome;
        showChange(outcome.kept ? message : notKept(message), outcome.edit, outcome.numbers);
        return { ok: true, version: outcome.version };
      }),
    [apply, inTurn, showChange],
  );

  const makeChanges = useCallback(
    (commands: readonly EditCommand[], message: ChangeWords) =>
      inTurn(async (): Promise<ChangeOutcome> => {
        const outcome = await apply(commands);
        if (!outcome.ok) return outcome;
        showChange(outcome.kept ? message : notKept(message), outcome.edit, outcome.numbers);
        return { ok: true, version: outcome.version };
      }),
    [apply, inTurn, showChange],
  );

  const makeChangesAgain = useCallback(
    (commands: readonly EditCommand[], madeOn: readonly PaymentAt[], message: ChangeWords) =>
      inTurn(async (): Promise<ChangeOutcome> => {
        const outcome = await apply(commands, undefined, madeOn);
        if (!outcome.ok) return outcome;
        showChange(outcome.kept ? message : notKept(message), outcome.edit, outcome.numbers);
        return { ok: true, version: outcome.version };
      }),
    [apply, inTurn, showChange],
  );

  const undoLastChange = useCallback(
    (id: number) =>
      inTurn(async (): Promise<ChangeOutcome> => {
        const last = lastChangeRef.current;
        if (last === null || last.id !== id) return { ok: false, code: 'not-last-change' };
        if (last.edit === null) return { ok: false, code: 'nothing-to-undo' };
        const outcome = await apply({ kind: 'undo', edit: last.edit }, last.numbers);
        if (!outcome.ok) return outcome;
        showChange(strings.undo.undone, null);
        return { ok: true, version: outcome.version };
      }),
    [apply, inTurn, showChange],
  );

  const dismissLastChange = useCallback(() => {
    if (lastChangeRef.current !== null) showChange('', null);
  }, [showChange]);

  const startAgainWithExample = useCallback(
    () =>
      inTurn(async (): Promise<ChangeOutcome> => {
        const plan = freshExample();
        const { records } = theExample();
        // Practice changes made on the old example aren't the new one's (step 2h).
        await forgetPractice(plan.id);
        try {
          const db = openDb();
          try {
            await savePlan(db, plan, records);
            // The whole plan is saved again, so changes can be saved from here on.
            canSave.current = true;
          } finally {
            db.close();
          }
        } catch {
          // Without a database the example is only ever in memory anyway.
          canSave.current = false;
        }
        const version = (loadedRef.current?.version ?? 0) + 1;
        keepLoaded({ plan, records, today: todayOf(plan), version });
        showChange('', null);
        return { ok: true, version };
      }),
    [inTurn, showChange, keepLoaded],
  );

  const showPlan = useCallback(
    (showing: Showing) =>
      inTurn(async () => {
        try {
          const db = openDb();
          try {
            await setShowing(db, showing);
          } finally {
            db.close();
          }
        } catch {
          // Without a database there's only the example to show anyway.
        }
        showChange('', null);
        setState({ status: 'loading', plan: null });
        setLoadCount((count) => count + 1);
      }),
    [inTurn, showChange],
  );

  const actions = useMemo<PlanActions>(
    () => ({
      loaded,
      needsSetup,
      ownPlan,
      lastChange,
      makeChange,
      makeChanges,
      makeChangesAgain,
      undoLastChange,
      dismissLastChange,
      startAgainWithExample,
      showPlan,
    }),
    [
      loaded,
      needsSetup,
      ownPlan,
      lastChange,
      makeChange,
      makeChanges,
      makeChangesAgain,
      undoLastChange,
      dismissLastChange,
      startAgainWithExample,
      showPlan,
    ],
  );

  return (
    <PlanContext.Provider value={state}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </PlanContext.Provider>
  );
}

/**
 * Puts other plan actions under part of a screen: What if gives its sheets
 * the practice plan this way, so they make practice changes with the same
 * sheets as real ones, and nothing is saved (brief 4.10, D135, step 2g).
 */
export function PlanActionsOverride({
  value,
  children,
}: {
  readonly value: PlanActions;
  readonly children: ReactNode;
}) {
  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

/** The plan as Home shows it. */
export function usePlan(): PlanState {
  return useContext(PlanContext);
}

/** The plan's records, and the changes that can be made to them. */
export function usePlanActions(): PlanActions {
  return useContext(ActionsContext);
}
