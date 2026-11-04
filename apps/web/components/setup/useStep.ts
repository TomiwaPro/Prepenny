'use client';

// What every step of setup uses (step 2e): the plan as it is now, today,
// the plan's bank holidays, going to another step, and saving one form at a
// time as its own item so Remove can take it back.

import type { Account, PlanRecords } from '@prepenny/engine';
import { useMemo, useState } from 'react';
import { holidaysFor } from '../../lib/holidays.ts';
import { refusalMessage } from '../../lib/refusals.ts';
import type { SetupItem, SetupProgress, SetupStep } from '../../lib/setup-progress.ts';
import { strings } from '../../strings/en-GB.ts';
import { type SetupActions, useSetup } from './SetupProvider.tsx';

export interface StepBasics {
  readonly records: PlanRecords;
  readonly progress: SetupProgress;
  readonly today: string;
  readonly holidays: ReturnType<typeof holidaysFor>;
  /** Open accounts, in the order they were added. */
  readonly accounts: readonly Account[];
  readonly view: SetupActions['view'];
  readonly save: SetupActions['save'];
  /** Items this step added, oldest first. */
  readonly items: (kind?: SetupItem['kind']) => readonly SetupItem[];
  readonly go: (step: SetupStep) => Promise<void>;
  /** Removes an item, saying why when it can't be removed. True when it's gone. */
  readonly removeItem: (id: string) => Promise<boolean>;
  /** Why the last Remove of an item didn't work, by item. */
  readonly removeProblem: (id: string) => string | null;
  readonly busy: boolean;
  readonly setBusy: (busy: boolean) => void;
  readonly problem: string | null;
  readonly setProblem: (problem: string | null) => void;
}

export function useStep(step: SetupStep): StepBasics {
  const setup = useSetup();
  const { state } = setup;
  if (state.status !== 'ready') throw new Error('A setup step needs the plan.');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [removeProblems, setRemoveProblems] = useState<Readonly<Record<string, string>>>({});
  const nation = state.records.settings?.nation ?? 'england-and-wales';
  const holidays = useMemo(() => holidaysFor(nation), [nation]);
  return {
    records: state.records,
    progress: state.progress,
    today: state.today,
    holidays,
    accounts: state.records.accounts.filter((one) => one.closed !== true),
    view: setup.view,
    save: setup.save,
    items: (kind) =>
      state.progress.items.filter(
        (item) => item.step === step && (kind === undefined || item.kind === kind),
      ),
    go: async (to) => {
      await setup.goTo(to);
    },
    removeItem: async (id) => {
      const outcome = await setup.remove(id);
      setRemoveProblems((now) => {
        const { [id]: _gone, ...rest } = now;
        if (outcome.ok) return rest;
        return {
          ...rest,
          [id]:
            outcome.code === 'changed-since'
              ? strings.setup.cantRemove
              : refusalMessage(outcome.code),
        };
      });
      return outcome.ok;
    },
    removeProblem: (id) => removeProblems[id] ?? null,
    busy,
    setBusy,
    problem,
    setProblem,
  };
}

/** The name an account has, for the boxes that choose one. */
export function accountName(account: Account): string {
  return account.name ?? '';
}
