// Each person's plan built from an empty plan with the commands for adding
// and changing records only (step 2a, D149), the way setup, "Add a payment"
// and the add sheets will build it, day by day. Today moves on as the person
// sets up, ticks what arrives and updates their balance.

import {
  type Account,
  applyWrites,
  type BalanceUpdate,
  type Budget,
  type Debt,
  type Edit,
  type EditCommand,
  type EditInput,
  editPlan,
  type Goal,
  type PayProfile,
  type PayWeek,
  type PlanRecords,
  type Series,
  type WhatIfInput,
} from '../../src/index.ts';
import { calendarFor } from './holidays.ts';
import { samPayProfile, samPayWeeks } from './pay.ts';
import { aliPlan, deePlan, jessAndTomPlan, kofiPlan, priyaPlan } from './people.ts';
import { samChanges, samDebts, samEverything, samMainPay, samPlan, samToday } from './sam.ts';

/** One command, made on a day. */
export interface Step {
  readonly today: string;
  readonly command: EditCommand;
}

/** A plan built step by step: the records at the end, and each step with the records before it. */
export interface Built {
  readonly records: PlanRecords;
  readonly history: readonly {
    readonly step: Step;
    readonly before: PlanRecords;
    readonly edit: Edit;
  }[];
}

export const emptyPlan: PlanRecords = { accounts: [], balanceUpdates: [], series: [] };

/** What an edit needs, from the records: the main pay and nation in their settings (D155). */
export function inputFor(records: PlanRecords, today: string): EditInput {
  return {
    ...records,
    mainPayFamilyId: records.settings?.mainPayFamilyId ?? null,
    holidays: calendarFor(records.settings?.nation ?? 'england-and-wales'),
    today,
  };
}

/** Only the stored records. */
export function recordsOf(input: EditInput | WhatIfInput): PlanRecords {
  const {
    mainPayFamilyId: _mainPay,
    holidays: _holidays,
    today: _today,
    ...records
  } = input as EditInput & { to?: string; debtsTo?: string };
  const {
    to: _to,
    debtsTo: _debtsTo,
    ...stored
  } = records as typeof records & {
    to?: string;
    debtsTo?: string;
  };
  return stored;
}

/** Makes each command in turn on the records the one before left. */
export function build(steps: readonly Step[], from: PlanRecords = emptyPlan): Built {
  let records = from;
  const history: Built['history'][number][] = [];
  for (const step of steps) {
    const input = inputFor(records, step.today);
    const edit = editPlan(input, step.command);
    history.push({ step, before: records, edit });
    records = recordsOf(applyWrites(input, edit.writes));
  }
  return { records, history };
}

/** A fixture plan's own records, with its main pay and nation as the settings record. */
export function fixtureRecords(plan: WhatIfInput): PlanRecords {
  return {
    ...recordsOf(plan),
    settings: { nation: 'england-and-wales', mainPayFamilyId: plan.mainPayFamilyId },
  };
}

/** Every record, each kind sorted by id, so two plans can be compared whatever the order. */
export function allRecords(records: PlanRecords) {
  const byKey =
    <R>(key: (record: R) => string) =>
    (list: readonly R[] | undefined) =>
      [...(list ?? [])].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const id = byKey((one: { id: string }) => one.id);
  const onPayment = byKey(
    (one: { seriesId: string; originalDate: string; setAside?: true }) =>
      `${one.seriesId} ${one.originalDate}${one.setAside === true ? ' set-aside' : ''}`,
  );
  return {
    settings: records.settings ?? null,
    accounts: id(records.accounts),
    balanceUpdates: id(records.balanceUpdates),
    series: id(records.series),
    changes: onPayment(records.changes),
    ticks: onPayment(records.ticks),
    debts: id(records.debts),
    budgets: id(records.budgets),
    spends: id(records.spends),
    goals: id(records.goals),
    payProfiles: id(records.payProfiles),
    payWeeks: id(records.payWeeks),
    payAdjustments: id(records.payAdjustments),
  };
}

// Commands from a fixture's records.

const on = (today: string, command: EditCommand): Step => ({ today, command });

export function addAccount(today: string, account: Account, balance: BalanceUpdate): Step {
  const { accountId: _accountId, ...first } = balance;
  return on(today, { kind: 'add-account', account, balance: first });
}

export function addPayment(today: string, series: Series): Step {
  const {
    familyId: _family,
    familyCreatedAt,
    firstNumber: _first,
    splitFrom: _split,
    mirrorOf: _mirror,
    ...fields
  } = series;
  return on(today, { kind: 'add-payment', series: fields, madeAt: familyCreatedAt });
}

export const addDebt = (today: string, debt: Debt): Step => on(today, { kind: 'add-debt', debt });
export const addBudget = (today: string, budget: Budget): Step =>
  on(today, { kind: 'add-budget', budget });
export const addGoal = (today: string, goal: Goal): Step => on(today, { kind: 'add-goal', goal });
export const addPayProfile = (today: string, profile: PayProfile): Step =>
  on(today, { kind: 'add-pay-profile', profile });
export const addPayWeek = (today: string, week: PayWeek): Step =>
  on(today, { kind: 'add-pay-week', week });
export const setNation = (today: string): Step =>
  on(today, { kind: 'set-nation', nation: 'england-and-wales' });
export const chooseMainPay = (today: string, familyId: string): Step =>
  on(today, { kind: 'choose-main-pay', familyId });

function balanceOf(plan: { balanceUpdates: readonly BalanceUpdate[] }, id: string): BalanceUpdate {
  const found = plan.balanceUpdates.find((one) => one.id === id);
  if (found === undefined) throw new Error(`No balance update ${id}.`);
  return found;
}

function accountOf(plan: { accounts: readonly Account[] }, id: string): Account {
  const found = plan.accounts.find((one) => one.id === id);
  if (found === undefined) throw new Error(`No account ${id}.`);
  return found;
}

/** The series in the order they were made, so their creation times only go forward. */
const inOrderMade = (series: readonly Series[]) =>
  [...series].sort((a, b) => (a.familyCreatedAt < b.familyCreatedAt ? -1 : 1));

/**
 * Sam's plan from brief 8.1 and 8.2, with the D15 names, as setup builds it
 * on Sun 25 Oct 2026: his accounts and balances, his debts, every payment,
 * then his main pay and the three first payments that are different.
 */
export function samSteps(): Step[] {
  const plan = samPlan();
  const today = samToday;
  return [
    setNation(today),
    addAccount(today, accountOf(plan, 'current'), balanceOf(plan, 'current-25-oct')),
    addAccount(today, accountOf(plan, 'savings'), balanceOf(plan, 'savings-25-oct')),
    ...samDebts.map((debt) => addDebt(today, debt)),
    ...inOrderMade(plan.series).map((series) => addPayment(today, series)),
    chooseMainPay(today, samMainPay),
    ...samChanges.map((change) =>
      on(today, {
        kind: 'just-this-one',
        seriesId: change.seriesId,
        originalDate: change.originalDate,
        edits: { amount: change.amount as number },
      }),
    ),
  ];
}

/** Sam's plan with every engine part switched on (step 1g's samEverything), from empty. */
export function samEverythingSteps(): Step[] {
  const plan = samEverything();
  const today = samToday;
  return [
    setNation(today),
    addAccount(today, accountOf(plan, 'current'), balanceOf(plan, 'current-25-oct')),
    addAccount(today, accountOf(plan, 'savings'), balanceOf(plan, 'savings-25-oct')),
    ...(plan.debts ?? []).map((debt) => addDebt(today, debt)),
    addPayProfile(today, samPayProfile),
    ...samPayWeeks.map((week) => addPayWeek(today, week)),
    ...(plan.goals ?? []).map((goal) => addGoal(today, goal)),
    ...(plan.budgets ?? []).map((budget) => addBudget(today, budget)),
    ...inOrderMade(plan.series).map((series) => addPayment(today, series)),
    chooseMainPay(today, samMainPay),
    ...samChanges.map((change) =>
      on(today, {
        kind: 'just-this-one',
        seriesId: change.seriesId,
        originalDate: change.originalDate,
        edits: { amount: change.amount as number },
      }),
    ),
  ];
}

/** An Update balance with nothing ticked, from a fixture's balance update. */
function updateBalance(today: string, update: BalanceUpdate): Step {
  return on(today, { kind: 'update-balance', update });
}

/** Priya sets up on Sat 24 Oct and updates her balances on Sun 25 Oct. */
export function priyaSteps(): Step[] {
  const plan = priyaPlan();
  const setup = '2026-10-24';
  return [
    setNation(setup),
    addAccount(setup, accountOf(plan, 'current'), balanceOf(plan, 'current-2026-10-24')),
    addAccount(setup, accountOf(plan, 'savings'), balanceOf(plan, 'savings-2026-10-24')),
    ...(plan.goals ?? []).map((goal) => addGoal(setup, goal)),
    ...inOrderMade(plan.series).map((series) => addPayment(setup, series)),
    ...(plan.budgets ?? []).map((budget) => addBudget(setup, budget)),
    chooseMainPay(setup, 'salary'),
    updateBalance('2026-10-25', balanceOf(plan, 'current-2026-10-25')),
    updateBalance('2026-10-25', balanceOf(plan, 'savings-2026-10-25')),
  ];
}

/**
 * Dee sets up on Tue 27 Oct, types in her real Universal Credit and wages
 * and ticks them as they arrive, ticks the rent and council tax on Sun 1
 * Nov, and updates her balance on Mon 2 Nov.
 */
export function deeSteps(): Step[] {
  const plan = deePlan();
  const setup = '2026-10-27';
  const real = (today: string, seriesId: string, edits: { amount?: number; isEstimate: false }) =>
    on(today, { kind: 'just-this-one', seriesId, originalDate: today, edits });
  const tick = (today: string, seriesId: string, tickedAt: string) =>
    on(today, { kind: 'tick', seriesId, originalDate: today, tickedAt });
  return [
    setNation(setup),
    addAccount(setup, accountOf(plan, 'current'), balanceOf(plan, 'current-2026-10-27')),
    ...(plan.payProfiles ?? []).map((profile) => addPayProfile(setup, profile)),
    ...(plan.payWeeks ?? []).map((week) => addPayWeek(setup, week)),
    ...inOrderMade(plan.series).map((series) => addPayment(setup, series)),
    chooseMainPay(setup, 'universal-credit'),
    real('2026-10-28', 'universal-credit', { amount: 81246, isEstimate: false }),
    tick('2026-10-28', 'universal-credit', '2026-10-28T09:00:00Z'),
    real('2026-10-30', 'wages', { isEstimate: false }),
    tick('2026-10-30', 'wages', '2026-10-30T10:00:00Z'),
    ...(plan.budgets ?? []).map((budget) => addBudget('2026-10-30', budget)),
    tick('2026-11-01', 'rent', '2026-11-01T07:00:00Z'),
    tick('2026-11-01', 'council-tax', '2026-11-01T07:00:00Z'),
    updateBalance('2026-11-02', balanceOf(plan, 'current-2026-11-02')),
  ];
}

/** "Update from statement" for a debt, from the fixture's debt (D103). */
function fromStatement(today: string, debt: Debt): Step {
  return on(today, {
    kind: 'update-from-statement',
    debtId: debt.id,
    balance: debt.balance,
    balanceOn: debt.balanceOn,
    balanceAt: debt.balanceAt,
  });
}

/** A debt as it was typed in during setup, the day before its statement update. */
function atSetup(debt: Debt, today: string, at: string): Debt {
  return { ...debt, balanceOn: today, balanceAt: at };
}

/** Kofi sets up on Tue 27 Oct, and updates his balances and van finance on Wed 28 Oct. */
export function kofiSteps(): Step[] {
  const plan = kofiPlan();
  const setup = '2026-10-27';
  const van = (plan.debts ?? [])[0] as Debt;
  return [
    setNation(setup),
    addAccount(setup, accountOf(plan, 'current'), balanceOf(plan, 'current-2026-10-27')),
    addAccount(setup, accountOf(plan, 'tax'), balanceOf(plan, 'tax-2026-10-27')),
    addDebt(setup, atSetup(van, setup, '2026-10-27T20:40:00Z')),
    ...inOrderMade(plan.series).map((series) => addPayment(setup, series)),
    ...(plan.budgets ?? []).map((budget) => addBudget(setup, budget)),
    chooseMainPay(setup, 'rides'),
    updateBalance('2026-10-28', balanceOf(plan, 'current-2026-10-28')),
    updateBalance('2026-10-28', balanceOf(plan, 'tax-2026-10-28')),
    fromStatement('2026-10-28', van),
  ];
}

/** Jess and Tom set up on Sat 24 Oct, and update their balances and Tom's car loan on Sun 25 Oct. */
export function jessAndTomSteps(): Step[] {
  const plan = jessAndTomPlan();
  const setup = '2026-10-24';
  const carLoan = (plan.debts ?? [])[0] as Debt;
  return [
    setNation(setup),
    ...['jess', 'tom', 'joint'].map((id) =>
      addAccount(setup, accountOf(plan, id), balanceOf(plan, `${id}-2026-10-24`)),
    ),
    addDebt(setup, atSetup(carLoan, setup, '2026-10-24T17:40:00Z')),
    ...inOrderMade(plan.series).map((series) => addPayment(setup, series)),
    ...(plan.budgets ?? []).map((budget) => addBudget(setup, budget)),
    chooseMainPay(setup, 'jess-pay'),
    ...['jess', 'tom', 'joint'].map((id) =>
      updateBalance('2026-10-25', balanceOf(plan, `${id}-2026-10-25`)),
    ),
    fromStatement('2026-10-25', carLoan),
  ];
}

/**
 * Ali sets up on Sun 20 Sep, ticks his first loan payment and the term's
 * rent as they go, adds his food budget on Sun 1 Nov and updates his balance
 * on Mon 2 Nov.
 */
export function aliSteps(): Step[] {
  const plan = aliPlan();
  const setup = '2026-09-20';
  return [
    setNation(setup),
    addAccount(setup, accountOf(plan, 'current'), balanceOf(plan, 'current-2026-09-20')),
    ...inOrderMade(plan.series).map((series) => addPayment(setup, series)),
    chooseMainPay(setup, 'student-loan'),
    on('2026-09-21', {
      kind: 'tick',
      seriesId: 'student-loan',
      originalDate: '2026-09-21',
      tickedAt: '2026-09-21T08:00:00Z',
    }),
    on('2026-09-25', {
      kind: 'tick',
      seriesId: 'rent',
      originalDate: '2026-09-25',
      tickedAt: '2026-09-25T08:00:00Z',
    }),
    ...(plan.budgets ?? []).map((budget) => addBudget('2026-11-01', budget)),
    updateBalance('2026-11-02', balanceOf(plan, 'current-2026-11-02')),
  ];
}

/** Each of the other five people: their fixture plan and the steps that build it. */
export const otherPeopleSteps = {
  Priya: { plan: priyaPlan, steps: priyaSteps },
  Dee: { plan: deePlan, steps: deeSteps },
  Kofi: { plan: kofiPlan, steps: kofiSteps },
  'Jess and Tom': { plan: jessAndTomPlan, steps: jessAndTomSteps },
  Ali: { plan: aliPlan, steps: aliSteps },
} as const;
