// "Download my data" as a spreadsheet (brief 4.12, step 3h): one CSV file
// with a part for each kind of thing, each with a heading row, so it opens in
// Excel, Numbers or Google Sheets.
//
// It's for a spreadsheet, so amounts are plain numbers in pounds ("-30.00")
// and dates are written "2026-11-12", which a spreadsheet can sort and add
// up; the words people read, the parts' and columns' names, follow
// docs/VOICE.md. Anything a person typed that a spreadsheet could take for
// a formula starts with an apostrophe, so opening the file can't run it.
//
// Pure: no network, no storage. Nothing here writes an amount, a name or a
// note anywhere but its return value (CLAUDE.md).

import type { PlanRecords, Series } from '@prepenny/engine';
import { strings } from '../strings/en-GB.ts';
import type { BackupAccount, BackupChange, BackupPerson } from './backup.ts';
import { formatDayAndYear, formatTime } from './dates.ts';
import { planLookAhead, workOutPlanTo } from './plan-input.ts';
import { oftenWords } from './schedule-words.ts';

const t = strings.yourData.csv;

/** A cell a spreadsheet won't take for a formula, quoted when it needs to be. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // A plain number, such as "-30.00", is safe as it is.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Whole pence as pounds, a plain number for a spreadsheet: 26754 is "267.54", −3000 is "-30.00". */
export function poundsCell(pence: number | null | undefined): string {
  if (pence === null || pence === undefined) return '';
  const sign = pence < 0 ? '-' : '';
  const whole = Math.abs(pence);
  return `${sign}${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, '0')}`;
}

/** A UTC time as the UK's clock shows it, for a spreadsheet: "2026-11-12 14:05". */
export function timeCell(time: string | null | undefined): string {
  if (time === null || time === undefined || time === '') return '';
  const moment = new Date(time);
  if (Number.isNaN(moment.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(moment);
  const part = (type: string) => parts.find((one) => one.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

const yesNo = (value: boolean | undefined) => (value === true ? t.yes : t.no);

export interface SpreadsheetInput {
  readonly records: PlanRecords;
  /** The person's own date today, for Coming up. */
  readonly today: string;
  /** When it was downloaded, as a UTC time. */
  readonly now: string;
  readonly account: BackupAccount | null;
  readonly people: readonly BackupPerson[] | null;
  readonly history: readonly BackupChange[] | null;
}

/** The whole spreadsheet, as the text of a CSV file. */
export function spreadsheetOf(input: SpreadsheetInput): string {
  const { records, today } = input;
  const lines: string[] = [];
  const row = (...cells: (string | number | null | undefined)[]) =>
    lines.push(cells.map(cell).join(','));
  const part = (heading: string, columns: readonly string[], rows: () => void) => {
    lines.push('');
    row(heading);
    row(...columns);
    rows();
  };
  const day = input.now.slice(0, 10);
  row(
    strings.yourData.csvTitle(
      `${formatTime(input.now)} on ${formatDayAndYear(day)}`.replaceAll(' ', ' '),
    ),
  );

  const accountNames = new Map(
    records.accounts.map((one) => [one.id, one.name ?? strings.accounts.kinds[one.kind]]),
  );
  const accountName = (id: string | undefined) =>
    id === undefined ? '' : (accountNames.get(id) ?? '');
  const seriesById = new Map(records.series.map((one) => [one.id, one]));
  const budgetById = new Map((records.budgets ?? []).map((one) => [one.id, one]));
  const debtNames = new Map((records.debts ?? []).map((one) => [one.id, one.name]));
  const goalNames = new Map((records.goals ?? []).map((one) => [one.id, one.name]));
  const paymentName = (id: string) => seriesById.get(id)?.name ?? budgetById.get(id)?.name ?? '';

  // Your account, signed in only.
  const { account } = input;
  if (account !== null) {
    part(t.account, [t.email, t.signedUp, t.name, t.backupEmail, t.twoStep, t.google], () => {
      row(
        account.email,
        timeCell(account.signedUpAt),
        account.name ?? '',
        account.backupEmail ?? '',
        yesNo(account.twoStepSignIn),
        yesNo(account.signsInWithGoogle),
      );
    });
    part(t.devices, [t.device, t.signedIn, t.lastUsed, t.thisDevice], () => {
      for (const one of account.devices) {
        row(
          one.device,
          timeCell(one.signedInAt),
          timeCell(one.lastUsedAt),
          one.thisDevice ? t.yes : '',
        );
      }
    });
  }
  if (input.people !== null && input.people.length > 1) {
    part(t.people, [t.person, t.role], () => {
      for (const one of input.people ?? []) {
        row(one.you ? `${one.name} (${t.you})` : one.name, t.roles[one.role] ?? one.role);
      }
    });
  }

  part(
    t.accounts,
    [t.accountName, t.kind, t.bankShowed, t.checkedOn, t.overdraft, t.warnUnder, t.closed],
    () => {
      for (const one of records.accounts) {
        const latest = records.balanceUpdates
          .filter((update) => update.accountId === one.id)
          .sort((a, b) => (a.checkedAt < b.checkedAt ? -1 : 1))
          .at(-1);
        row(
          accountName(one.id),
          strings.accounts.kinds[one.kind],
          poundsCell(latest?.balance),
          latest?.checkedOn,
          poundsCell(one.overdraftLimit),
          poundsCell(one.warningLevel),
          yesNo(one.closed),
        );
      }
    },
  );

  // Coming up, as the plan works it out: every payment for 12 months, with what's left after it.
  let comingUp: {
    date: string;
    account: string;
    name: string;
    change: number;
    left: number;
    late: boolean;
  }[] = [];
  try {
    const plan = workOutPlanTo(records, today, planLookAhead(today, 12));
    comingUp = plan.accounts.flatMap((one) =>
      one.rows
        .filter((planRow) => planRow.date >= today || planRow.notTickedYet)
        .map((planRow) => ({
          date: planRow.date,
          account: accountName(one.account.id),
          name: planRow.payment.name,
          change: planRow.change,
          left: planRow.leftAfter,
          late: planRow.notTickedYet,
        })),
    );
  } catch {
    // A plan the engine can't work out has no Coming up; everything else is still there.
  }
  part(
    t.comingUp,
    [t.date, t.accountName, t.paymentName, t.amount, t.leftAfter, t.notTickedYet],
    () => {
      for (const one of comingUp) {
        row(
          one.date,
          one.account,
          one.name,
          poundsCell(one.change),
          poundsCell(one.left),
          one.late ? t.yes : '',
        );
      }
    },
  );

  const ends = (series: Series) =>
    series.end.kind === 'never'
      ? t.endsNever
      : series.end.kind === 'after'
        ? t.endsAfter(series.end.payments)
        : t.endsOn(series.end.date);
  part(
    t.payments,
    [
      t.paymentName,
      t.accountName,
      t.inOrOut,
      t.toAccount,
      t.amount,
      t.pattern,
      t.howOften,
      t.first,
      t.ends,
      t.lastAmount,
      t.type,
      t.estimate,
      t.debt,
      t.goal,
      t.note,
    ],
    () => {
      for (const one of records.series) {
        row(
          one.name,
          accountName(one.accountId),
          t.directions[one.direction] ?? one.direction,
          accountName(one.toAccountId),
          poundsCell(one.amount),
          one.amountCycle?.map((amount) => poundsCell(amount)).join(' / ') ?? '',
          oftenWords(one.schedule, one.start, today).replaceAll(' ', ' '),
          one.start,
          ends(one),
          poundsCell(one.lastAmount),
          strings.types[one.type],
          yesNo(one.isEstimate),
          one.debtId === undefined ? '' : (debtNames.get(one.debtId) ?? ''),
          one.goalId === undefined ? '' : (goalNames.get(one.goalId) ?? ''),
          one.note ?? '',
        );
      }
    },
  );

  part(
    t.changes,
    [
      t.paymentName,
      t.originalDate,
      t.newDate,
      t.newAmount,
      t.newName,
      t.estimate,
      t.skipped,
      t.note,
    ],
    () => {
      for (const one of records.changes ?? []) {
        row(
          paymentName(one.seriesId),
          one.originalDate,
          one.newDate,
          poundsCell(one.amount),
          one.name,
          one.isEstimate === undefined ? '' : yesNo(one.isEstimate),
          one.skipped === true ? t.yes : '',
          one.note,
        );
      }
    },
  );

  part(t.ticks, [t.paymentName, t.originalDate, t.paidOn, t.tickedAt], () => {
    for (const one of records.ticks ?? []) {
      row(paymentName(one.seriesId), one.originalDate, one.paidOn, timeCell(one.tickedAt));
    }
  });

  part(t.balances, [t.accountName, t.balance, t.checkedOn, t.checkedAt], () => {
    for (const one of records.balanceUpdates) {
      row(
        accountName(one.accountId),
        poundsCell(one.balance),
        one.checkedOn,
        timeCell(one.checkedAt),
      );
    }
  });

  part(
    t.debts,
    [t.debtName, t.kind, t.currency, t.rate, t.owed, t.owedOn, t.startedAt, t.interest, t.closed],
    () => {
      for (const one of records.debts ?? []) {
        // A debt's amounts are in its own currency's smallest units, as pence are for pounds.
        row(
          one.name,
          strings.setup.debts.kinds[one.kind],
          one.currency,
          one.rate ?? '',
          poundsCell(one.balance),
          one.balanceOn,
          poundsCell(one.startingBalance),
          one.interestRate ?? '',
          yesNo(one.closed),
        );
      }
    },
  );

  part(
    t.budgets,
    [t.budgetName, t.accountName, t.amount, t.every, t.leaves, t.startsOn, t.endsOnHeading],
    () => {
      for (const one of records.budgets ?? []) {
        row(
          one.name,
          accountName(one.accountId),
          poundsCell(one.amount),
          t.everyWords[one.every] ?? one.every,
          t.leavesWords[one.leaves] ?? one.leaves,
          one.startsOn,
          one.endsOn,
        );
      }
    },
  );

  part(t.spends, [t.budgetName, t.amount, t.spentOn, t.note], () => {
    for (const one of records.spends ?? []) {
      row(budgetById.get(one.budgetId)?.name ?? '', poundsCell(one.amount), one.spentOn, one.note);
    }
  });

  part(
    t.goals,
    [t.goalName, t.accountName, t.target, t.targetDate, t.startingAmount, t.closed],
    () => {
      for (const one of records.goals ?? []) {
        row(
          one.name,
          accountName(one.accountId),
          poundsCell(one.target),
          one.targetDate,
          poundsCell(one.startingAmount),
          yesNo(one.closed),
        );
      }
    },
  );

  if ((records.payProfiles ?? []).length > 0) {
    part(t.jobs, [t.jobName, t.frequency, t.taxCode, t.overtimeRate], () => {
      for (const one of records.payProfiles ?? []) {
        row(
          one.name ?? '',
          t.frequencies[one.frequency] ?? one.frequency,
          one.taxCode,
          one.overtimeRate,
        );
      }
    });
  }

  if ((records.payAdjustments ?? []).length > 0) {
    part(t.shifts, [t.shiftKind, t.workedOn, t.hours, t.change], () => {
      for (const one of records.payAdjustments ?? []) {
        row(
          one.kind === undefined ? '' : (t.shiftKinds[one.kind] ?? one.kind),
          one.workedOn,
          one.hours,
          poundsCell(one.change),
        );
      }
    });
  }

  if (input.history !== null) {
    part(t.history, [t.when, t.whatHappened, t.undone], () => {
      for (const one of input.history ?? []) {
        row(timeCell(one.at), one.words, one.undone ? t.yes : '');
      }
    });
  }

  // A mark at the start says it's UTF-8, so a spreadsheet shows "£" as it is.
  return `﻿${lines.join('\r\n')}\r\n`;
}
