'use client';

// Loads the plan from the phone's database and works it out in the
// background worker. On first open it puts Sam's example plan on the phone
// (D15) and asks the browser to keep the data (ARCHITECTURE.md 3.8, 7).
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
  type StoredPlan,
  saveChange,
  savePlan,
} from '../data/db.ts';
import {
  EXAMPLE_PLAN_ID,
  EXAMPLE_VERSION,
  examplePlan,
  fingerprint,
} from '../data/example-plan.ts';
import type { HomeView } from '../lib/home.ts';
import { testSetting } from '../lib/test-setting.ts';
import { todayFor } from '../lib/today.ts';
import { strings } from '../strings/en-GB.ts';
import { EngineError, editInBackground, workOutHomeInBackground } from '../worker/client.ts';

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
  /** The edit Undo puts back, or null when there's nothing to undo, such as just after an undo. */
  readonly edit: Edit | null;
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
  readonly lastChange: LastChange | null;
  /** Makes one change and, when it works, shows `message` in the undo bar. */
  makeChange(command: EditCommand, message: string): Promise<ChangeOutcome>;
  /** Undoes the change the bar showed, and refuses when a newer one has been made since. */
  undoLastChange(id: number): Promise<ChangeOutcome>;
  dismissLastChange(): void;
  /** Puts Sam's example back exactly as it is in the app (D182). */
  startAgainWithExample(): Promise<ChangeOutcome>;
}

const PlanContext = createContext<PlanState>({ status: 'loading', plan: null });

const noPlan = async (..._: unknown[]): Promise<ChangeOutcome> => ({
  ok: false,
  code: 'not-ready',
});

const ActionsContext = createContext<PlanActions>({
  loaded: null,
  lastChange: null,
  makeChange: noPlan,
  undoLastChange: noPlan,
  dismissLastChange: () => {},
  startAgainWithExample: noPlan,
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

/** Today for a plan, or the end-to-end tests' own today when they set one (D201). */
function todayOf(plan: StoredPlan): string {
  return testSetting()?.today ?? todayFor(plan);
}

const freshExample = (): StoredPlan => ({
  id: EXAMPLE_PLAN_ID,
  isExample: true,
  exampleVersion: theExample().version,
});

const ASKED_TO_KEEP = 'asked-to-keep-data';

/**
 * The plan on this phone, putting the example there first if it isn't, or
 * when the app's example has changed and the person hasn't changed theirs (D182).
 */
async function planOnPhone(): Promise<{ plan: StoredPlan; records: PlanRecords }> {
  const db = openDb();
  const example = theExample();
  try {
    let plan = await db.plans.get(EXAMPLE_PLAN_ID);
    if (plan === undefined || exampleNeedsReplacing(plan, example.version)) {
      plan = freshExample();
      await savePlan(db, plan, example.records);
    }
    if ((await db.device.get(ASKED_TO_KEEP)) === undefined) {
      await db.device.put({ key: ASKED_TO_KEEP, value: await askToKeepData() });
    }
    return { plan, records: await loadRecords(db, EXAMPLE_PLAN_ID) };
  } finally {
    db.close();
  }
}

const codeOf = (error: unknown) => (error instanceof EngineError ? error.code : 'unexpected');

export function PlanProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<PlanState>({ status: 'loading', plan: null });
  const [loaded, setLoaded] = useState<LoadedPlan | null>(null);
  const [lastChange, setLastChange] = useState<LastChange | null>(null);
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

  const showChange = useCallback((message: string, edit: Edit | null) => {
    changeCount.current += 1;
    const change = message === '' ? null : { id: changeCount.current, message, edit };
    lastChangeRef.current = change;
    setLastChange(change);
  }, []);

  useEffect(() => {
    let current = true;
    (async () => {
      let found: { plan: StoredPlan; records: PlanRecords };
      try {
        found = await planOnPhone();
      } catch {
        // No database on this phone, for example in some private windows:
        // the example still works, it just isn't saved.
        canSave.current = false;
        found = { plan: freshExample(), records: theExample().records };
      }
      if (!current) return;
      setState({ status: 'loading', plan: found.plan });
      keepLoaded({ ...found, today: todayOf(found.plan), version: 1 });
    })();
    return () => {
      current = false;
    };
  }, [keepLoaded]);

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

  /** Makes one edit, saves it on the phone and works the plan out again. */
  const apply = useCallback(
    async (
      command: EditCommand,
    ): Promise<
      { ok: true; edit: Edit; kept: boolean; version: number } | { ok: false; code: string }
    > => {
      const now = loadedRef.current;
      if (now === null) return { ok: false, code: 'not-ready' };
      let result: Awaited<ReturnType<typeof editInBackground>>;
      try {
        result = await editInBackground(now.records, now.today, command);
      } catch (error) {
        return { ok: false, code: codeOf(error) };
      }
      let plan: StoredPlan = now.plan.isExample ? { ...now.plan, edited: true } : now.plan;
      let kept = canSave.current;
      if (kept) {
        try {
          const db = openDb();
          try {
            plan = await saveChange(db, now.plan, result.edit.writes);
          } finally {
            db.close();
          }
        } catch {
          // The change still shows until PrePenny closes, and the undo bar says so.
          canSave.current = false;
          kept = false;
        }
      }
      const version = now.version + 1;
      keepLoaded({ ...now, plan, records: result.records, version });
      return { ok: true, edit: result.edit, kept, version };
    },
    [keepLoaded],
  );

  const makeChange = useCallback(
    (command: EditCommand, message: string) =>
      inTurn(async (): Promise<ChangeOutcome> => {
        const outcome = await apply(command);
        if (!outcome.ok) return outcome;
        showChange(outcome.kept ? message : `${message} ${strings.undo.notKept}`, outcome.edit);
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
        const outcome = await apply({ kind: 'undo', edit: last.edit });
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

  const actions = useMemo<PlanActions>(
    () => ({
      loaded,
      lastChange,
      makeChange,
      undoLastChange,
      dismissLastChange,
      startAgainWithExample,
    }),
    [loaded, lastChange, makeChange, undoLastChange, dismissLastChange, startAgainWithExample],
  );

  return (
    <PlanContext.Provider value={state}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </PlanContext.Provider>
  );
}

/** The plan as Home shows it. */
export function usePlan(): PlanState {
  return useContext(PlanContext);
}

/** The plan's records, and the changes that can be made to them. */
export function usePlanActions(): PlanActions {
  return useContext(ActionsContext);
}
