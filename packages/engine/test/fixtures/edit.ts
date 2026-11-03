// Short ways to make edits in tests, compare records, and check that the two
// halves of a private transfer still match (D16, D94).

import {
  applyWrites,
  type Edit,
  type EditCommand,
  type EditInput,
  editPlan,
  type PaymentChange,
  type Series,
  type Tick,
  workOutPayments,
} from '../../src/index.ts';

/** Makes one edit and saves it: the edit, and the records afterwards. */
export function edited<T extends EditInput>(
  input: T,
  command: EditCommand,
): { edit: Edit; after: T } {
  const edit = editPlan(input, command);
  return { edit, after: applyWrites(input, edit.writes) };
}

/** Makes several edits in turn and saves each. */
export function editedInTurn<T extends EditInput>(input: T, commands: readonly EditCommand[]): T {
  return commands.reduce((records, command) => edited(records, command).after, input);
}

/** The records as sorted lists, so two sets of records can be compared whatever their order. */
export function canonical(records: EditInput) {
  const by =
    <R>(key: (record: R) => string) =>
    (a: R, b: R) =>
      key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  // A payment's tick and its money set aside's tick are two records (D116).
  const onPayment = (record: PaymentChange | Tick) =>
    `${record.seriesId} ${record.originalDate}${'setAside' in record && record.setAside ? ' set-aside' : ''}`;
  return {
    series: [...records.series].sort(by((one: Series) => one.id)),
    changes: [...(records.changes ?? [])].sort(by(onPayment)),
    ticks: [...(records.ticks ?? [])].sort(by(onPayment)),
    balanceUpdates: [...records.balanceUpdates].sort(by((one) => one.id)),
    debts: [...(records.debts ?? [])].sort(by((one) => one.id)),
    spends: [...(records.spends ?? [])].sort(by((one) => one.id)),
  };
}

/** One series' payments, worked out with every series of the plan, so the family counts. */
export function paymentsOfSeries(input: EditInput, seriesId: string, from: string, to: string) {
  return workOutPayments({
    series: input.series,
    changes: input.changes ?? [],
    holidays: input.holidays,
    from,
    to,
  }).filter((payment) => payment.seriesId === seriesId);
}

/**
 * Everything that doesn't match between the two halves of each private
 * transfer: their series' timing and amounts, their payments, and their
 * ticks. Empty when every pair is in step.
 */
export function halvesProblems(input: EditInput, from: string, to: string): string[] {
  const problems: string[] = [];
  const byId = new Map(input.series.map((one) => [one.id, one]));
  const shared = input.series.filter((one) => one.mirrorOf !== undefined);
  const mirrored = new Set(shared.map((one) => one.mirrorOf));
  const all = workOutPayments({
    series: input.series,
    changes: input.changes ?? [],
    holidays: input.holidays,
    from,
    to,
  });
  const ticks = new Map((input.ticks ?? []).map((t) => [`${t.seriesId} ${t.originalDate}`, t]));
  const inStep = (one: Series) => ({
    amount: one.amount,
    amountCycle: one.amountCycle,
    cycleOffset: one.cycleOffset,
    start: one.start,
    schedule: one.schedule,
    end: one.end,
    lastAmount: one.lastAmount,
    holidayRule: one.holidayRule,
    isEstimate: one.isEstimate,
    firstNumber: one.firstNumber ?? 0,
  });
  for (const half of shared) {
    const other = byId.get(half.mirrorOf as string);
    if (other === undefined) {
      problems.push(`${half.id} mirrors a series that isn't there`);
      continue;
    }
    if (JSON.stringify(inStep(half)) !== JSON.stringify(inStep(other))) {
      problems.push(
        `${half.id} and ${other.id} differ: ${JSON.stringify([inStep(half), inStep(other)])}`,
      );
    }
    if (half.name !== 'From Jess' || half.note !== undefined) {
      problems.push(`${half.id} has a name or note of its own`);
    }
    const view = (id: string) =>
      all
        .filter((p) => p.seriesId === id)
        .map((p) => {
          const t = ticks.get(`${p.seriesId} ${p.originalDate}`);
          return [
            p.number,
            p.originalDate,
            p.date,
            p.amount,
            p.isEstimate,
            p.skipped,
            p.isLast,
            t === undefined ? null : [t.paidOn, t.tickedAt, t.inBalanceUpdate ?? null],
          ];
        });
    if (JSON.stringify(view(half.id)) !== JSON.stringify(view(other.id))) {
      problems.push(`${half.id} and ${other.id} have different payments or ticks`);
    }
  }
  // Every series in the family of a mirrored private half has its own shared half.
  for (const one of input.series) {
    const family = input.series.filter((s) => s.familyId === one.familyId);
    if (
      family.some((s) => mirrored.has(s.id)) &&
      !mirrored.has(one.id) &&
      one.mirrorOf === undefined
    ) {
      problems.push(`${one.id} has no shared half`);
    }
  }
  return problems;
}
