'use client';

// First-time setup's plan (brief 4.1, step 2e): the person's own plan, kept
// apart from Sam's example. Each step's records are made by the engine's
// commands (D149) in the background worker and saved on the phone straight
// away, with how far setup has got, in one go. So leaving part-way keeps
// what's done, and opening PrePenny again carries on at the same step.

import type { EditCommand, PlanRecords } from '@prepenny/engine';
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
  loadRecords,
  openDb,
  ownPlanOnPhone,
  type Showing,
  type StoredPlan,
  saveChange,
  setShowing,
} from '../../data/db.ts';
import { syncSoon } from '../../data/sync.ts';
import type { EditResult } from '../../lib/edit.ts';
import { newId } from '../../lib/ids.ts';
import {
  NEW_SETUP,
  SCREEN_OF_KIND,
  type SetupAnswers,
  type SetupItem,
  type SetupProgress,
  type SetupStep,
  upgradeSetup,
} from '../../lib/setup-progress.ts';
import type { SetupView } from '../../lib/setup-view.ts';
import { testSetting } from '../../lib/test-setting.ts';
import { localToday } from '../../lib/today.ts';
import { EngineError, editsInBackground, workOutSetupInBackground } from '../../worker/client.ts';

/** An empty plan: setup starts from nothing (D149). */
const EMPTY: PlanRecords = { accounts: [], balanceUpdates: [], series: [] };

export type SetupState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      /** The person's own plan, or null before "Make my plan". */
      readonly plan: StoredPlan | null;
      readonly progress: SetupProgress;
      readonly records: PlanRecords;
      readonly today: string;
      /** Goes up with every change. */
      readonly version: number;
    };

export type SetupOutcome = { readonly ok: true } | { readonly ok: false; readonly code: string };

/** Something setup adds, as one item that Remove can take back. */
export interface NewItem {
  readonly kind: SetupItem['kind'];
  readonly id: string;
  readonly bill?: SetupItem['bill'];
}

export interface SetupActions {
  readonly state: SetupState;
  /** The figures only the engine can work out, for the plan as it is now. Null while it's worked out. */
  readonly view: SetupView | null;
  /** Saving on this phone has failed, so what's typed now will go when PrePenny closes. */
  readonly notSaved: boolean;
  /** "Make my plan": starts the person's own plan, or carries on with it. */
  start(): Promise<SetupOutcome>;
  /** Shows a step, and remembers it for next time. */
  goTo(step: SetupStep | 'done'): Promise<SetupOutcome>;
  /**
   * Makes the commands in turn as one change and saves it, with each new
   * item kept so it can be removed, and any answers, and the step to show next.
   */
  save(change: {
    readonly commands: readonly EditCommand[];
    readonly item?: NewItem;
    readonly answers?: SetupAnswers;
    readonly step?: SetupStep | 'done';
  }): Promise<SetupOutcome>;
  /** Takes back something setup added, as one undo (D87). */
  remove(itemId: string): Promise<SetupOutcome>;
  /** Which plan the app shows from now on: the example, or the person's own (step 2e). */
  show(showing: Showing): Promise<void>;
}

const SetupContext = createContext<SetupActions | null>(null);

/** Today for the person's own plan, or the end-to-end tests' own today (D201). */
function todayNow(): string {
  return testSetting()?.today ?? localToday();
}

const codeOf = (error: unknown) => (error instanceof EngineError ? error.code : 'unexpected');

export function SetupProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<SetupState>({ status: 'loading' });
  const [view, setView] = useState<SetupView | null>(null);
  const [notSaved, setNotSaved] = useState(false);
  const stateRef = useRef<SetupState>(state);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const canSave = useRef(true);

  const keep = useCallback((next: SetupState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let current = true;
    (async () => {
      const today = todayNow();
      let plan: StoredPlan | null = null;
      let records = EMPTY;
      try {
        const db = openDb();
        try {
          plan = (await ownPlanOnPhone(db)) ?? null;
          if (plan !== null) records = await loadRecords(db, plan.id);
        } finally {
          db.close();
        }
      } catch {
        canSave.current = false;
        setNotSaved(true);
      }
      if (!current) return;
      // Progress saved in the old 8 steps carries on at the matching screen (D356).
      const progress = upgradeSetup(plan?.setup) ?? { ...NEW_SETUP, step: 0 };
      if (plan !== null && plan.setup !== undefined) plan = { ...plan, setup: progress };
      keep({
        status: 'ready',
        plan,
        progress,
        records,
        today,
        version: 1,
      });
    })();
    return () => {
      current = false;
    };
  }, [keep]);

  // The engine's figures, worked out again after every change.
  const records = state.status === 'ready' ? state.records : null;
  const today = state.status === 'ready' ? state.today : null;
  useEffect(() => {
    if (records === null || today === null) return;
    let current = true;
    workOutSetupInBackground(records, today).then(
      (answer) => {
        if (current) setView(answer);
      },
      () => {
        if (current) setView(null);
      },
    );
    return () => {
      current = false;
    };
  }, [records, today]);

  const inTurn = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(task, task);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  /** Saves the plan, its progress and an edit's writes on the phone, in one go. */
  const store = useCallback(
    async (
      plan: StoredPlan,
      writes: Parameters<typeof saveChange>[2],
      showOwn: boolean,
      isNew = false,
      /** The commands that made it, to make it again after a clash (step 3d). */
      made?: {
        readonly commands: readonly EditCommand[];
        readonly today: string;
        readonly result: EditResult;
      },
    ) => {
      if (!canSave.current) return;
      try {
        const db = openDb();
        try {
          // Kept in an account, each step's change is sent too (step 3c).
          await saveChange(
            db,
            plan,
            writes,
            {
              editId: newId(),
              madeOnPhone: Date.now(),
              kind: 'setup',
              ...(made === undefined
                ? {}
                : {
                    commands: made.commands,
                    today: made.today,
                    before: made.result.edit.undo,
                    payments: made.result.payments,
                  }),
            },
            isNew,
          );
          if (showOwn) await setShowing(db, 'own');
        } finally {
          db.close();
        }
        syncSoon();
      } catch {
        canSave.current = false;
        setNotSaved(true);
      }
    },
    [],
  );

  const start = useCallback(
    () =>
      inTurn(async (): Promise<SetupOutcome> => {
        const now = stateRef.current;
        if (now.status !== 'ready') return { ok: false, code: 'not-ready' };
        const plan: StoredPlan = now.plan ?? { id: newId(), isExample: false, setup: NEW_SETUP };
        const progress: SetupProgress =
          now.plan === null || now.progress.step === 0
            ? { ...now.progress, step: 1 }
            : now.progress;
        const saved: StoredPlan = { ...plan, setup: progress };
        await store(saved, [], true, now.plan === null);
        if (now.plan === null && canSave.current) {
          try {
            await askToKeepData();
          } catch {
            // Asking is only a request; the plan is saved either way.
          }
        }
        keep({ ...now, plan: saved, progress, version: now.version + 1 });
        return { ok: true };
      }),
    [inTurn, keep, store],
  );

  const goTo = useCallback(
    (step: SetupStep | 'done') =>
      inTurn(async (): Promise<SetupOutcome> => {
        const now = stateRef.current;
        if (now.status !== 'ready' || now.plan === null) return { ok: false, code: 'not-ready' };
        const progress: SetupProgress = { ...now.progress, step };
        const saved: StoredPlan = { ...now.plan, setup: progress };
        await store(saved, [], step === 'done');
        keep({ ...now, plan: saved, progress, version: now.version + 1 });
        return { ok: true };
      }),
    [inTurn, keep, store],
  );

  const save = useCallback<SetupActions['save']>(
    (change) =>
      inTurn(async (): Promise<SetupOutcome> => {
        const now = stateRef.current;
        if (now.status !== 'ready' || now.plan === null) return { ok: false, code: 'not-ready' };
        let result: Awaited<ReturnType<typeof editsInBackground>> | null = null;
        if (change.commands.length > 0) {
          try {
            result = await editsInBackground(now.records, now.today, change.commands);
          } catch (error) {
            return { ok: false, code: codeOf(error) };
          }
        }
        const item: SetupItem | null =
          change.item === undefined || result === null
            ? null
            : {
                id: change.item.id,
                kind: change.item.kind,
                step: SCREEN_OF_KIND[change.item.kind],
                ...(change.item.bill === undefined ? {} : { bill: change.item.bill }),
                edit: result.edit,
              };
        const progress: SetupProgress = {
          layout: now.progress.layout,
          step: change.step ?? now.progress.step,
          items: item === null ? now.progress.items : [...now.progress.items, item],
          answers: { ...now.progress.answers, ...change.answers },
        };
        const saved: StoredPlan = { ...now.plan, setup: progress };
        await store(
          saved,
          result?.edit.writes ?? [],
          change.step === 'done',
          false,
          result === null ? undefined : { commands: change.commands, today: now.today, result },
        );
        keep({
          ...now,
          plan: saved,
          progress,
          records: result?.records ?? now.records,
          version: now.version + 1,
        });
        return { ok: true };
      }),
    [inTurn, keep, store],
  );

  const remove = useCallback(
    (itemId: string) =>
      inTurn(async (): Promise<SetupOutcome> => {
        const now = stateRef.current;
        if (now.status !== 'ready' || now.plan === null) return { ok: false, code: 'not-ready' };
        const item = now.progress.items.find((one) => one.id === itemId);
        if (item === undefined) return { ok: false, code: 'nothing-to-undo' };
        let result: Awaited<ReturnType<typeof editsInBackground>>;
        try {
          result = await editsInBackground(now.records, now.today, [
            { kind: 'undo', edit: item.edit },
          ]);
        } catch (error) {
          return { ok: false, code: codeOf(error) };
        }
        const progress: SetupProgress = {
          ...now.progress,
          items: now.progress.items.filter((one) => one.id !== itemId),
        };
        const saved: StoredPlan = { ...now.plan, setup: progress };
        await store(saved, result.edit.writes, false, false, {
          commands: [{ kind: 'undo', edit: item.edit }],
          today: now.today,
          result,
        });
        keep({
          ...now,
          plan: saved,
          progress,
          records: result.records,
          version: now.version + 1,
        });
        return { ok: true };
      }),
    [inTurn, keep, store],
  );

  const show = useCallback(
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
          // Without a database the app shows the example anyway.
        }
      }),
    [inTurn],
  );

  const actions = useMemo<SetupActions>(
    () => ({ state, view, notSaved, start, goTo, save, remove, show }),
    [state, view, notSaved, start, goTo, save, remove, show],
  );

  return <SetupContext.Provider value={actions}>{children}</SetupContext.Provider>;
}

export function useSetup(): SetupActions {
  const actions = useContext(SetupContext);
  if (actions === null) throw new Error('useSetup needs a SetupProvider.');
  return actions;
}
