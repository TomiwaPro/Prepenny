// Activity's words (brief 4.12, 4.14, step 3g, D456): each change in plain
// words, "Tom changed Rent on Tue 1 Dec to £560.00.", from what the server
// gives this person: who made it, what kind of change it was, and copies of
// the records it saved, as they were before and after. The server gives only
// copies this person could read when the change was made and can still read
// now (supabase/migrations, step 3g), so these words can name nothing private.
//
// Pure: names that aren't in the change itself (a tick names its payment's
// series, a spend its budget) come from the plan on this phone through
// `nameOf`, which also only holds what this person can read.

import { strings } from '../strings/en-GB.ts';
import { formatDay } from './dates.ts';
import { formatMoney } from './money.ts';

const t = strings.together;
const w = t.what;

type Copy = Readonly<Record<string, unknown>>;

/** One record a change saved, as this person may see it: before (null when the change made it) and after. */
export interface ActivityRecord {
  readonly table: string;
  readonly id: string;
  readonly before: Copy | null;
  readonly after: Copy | null;
}

/** One change, as plan_activity gives it. */
export interface ActivityEdit {
  readonly id: string;
  readonly by: string;
  readonly madeAt: string;
  readonly kind: string;
  readonly mine: boolean;
  readonly undone: boolean;
  /** For an undo made in Activity: the change it undid. */
  readonly undoes: string | null;
  readonly canUndo: boolean;
  /** The server's own words for its own steps: who a role changed for and to what, what was made private. */
  readonly summary: Readonly<Record<string, unknown>> | null;
  readonly records: readonly ActivityRecord[];
}

export interface ActivityContext {
  readonly me: string;
  readonly nicknames: Readonly<Record<string, string>>;
  /** Today on this phone, for dates without the year when it's this year. */
  readonly today: string;
  /** A record's name on this phone now, when this person can read it: a series, account, budget, debt or goal. */
  readonly nameOf: (table: string, id: string) => string | null;
  /** Whether a series is money coming in, on this phone now: "arrived" rather than "paid". */
  readonly comesIn: (seriesId: string) => boolean | null;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const pence = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
const removed = (copy: Copy | null) => copy === null || copy.deleted === true;

/** Who made it, at the start of a sentence: "You", "Tom", or "Your partner". */
export function whoStarts(person: string, context: ActivityContext): string {
  if (person === context.me) return t.You;
  const name = context.nicknames[person];
  return name === undefined || name === '' ? t.YourPartner : name;
}

/** Who someone is inside a sentence: "you", "Tom" or "your partner". */
function whoInside(person: string, context: ActivityContext): string {
  if (person === context.me) return t.you;
  const name = context.nicknames[person];
  return name === undefined || name === '' ? t.yourPartner : name;
}

/** Names joined as in a sentence: "Rent", "Rent and Gym", "Rent, Gym and Phone". */
function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function copyOf(record: ActivityRecord): Copy | null {
  return record.after ?? record.before;
}

class Reader {
  readonly edit: ActivityEdit;
  readonly context: ActivityContext;

  constructor(edit: ActivityEdit, context: ActivityContext) {
    this.edit = edit;
    this.context = context;
  }

  of(table: string): ActivityRecord[] {
    return this.edit.records.filter((one) => one.table === table);
  }

  day(date: unknown): string {
    const found = text(date);
    return found === null ? '' : formatDay(found, this.context.today);
  }

  /** A series' name: from the change's own copy, or the plan on this phone. */
  seriesName(id: unknown): string | null {
    const seriesId = text(id);
    if (seriesId === null) return null;
    const copy = this.edit.records.find((one) => one.table === 'series' && one.id === seriesId);
    const own = copy === undefined ? null : text(copyOf(copy)?.name);
    return (
      own ?? this.context.nameOf('series', seriesId) ?? this.context.nameOf('budgets', seriesId)
    );
  }

  /** A payment's money as a sentence shows it: "−£54.85" going out, "+£500.00" coming in. */
  signed(copy: Copy): string {
    const amount = pence(copy.amount) ?? 0;
    const direction = copy.direction;
    if (direction === 'out') return formatMoney(-amount);
    if (direction === 'in') return formatMoney(amount, { sign: 'always' });
    return formatMoney(amount);
  }

  comesIn(seriesId: unknown): boolean {
    const id = text(seriesId);
    if (id === null) return false;
    const copy = this.edit.records.find((one) => one.table === 'series' && one.id === id);
    const direction = copy === undefined ? null : copyOf(copy)?.direction;
    if (direction === 'in') return true;
    if (direction === 'out' || direction === 'transfer') return false;
    return this.context.comesIn(id) ?? false;
  }

  /** The names of every account, payment, budget, debt and goal the change saved. */
  names(): string[] {
    const found: string[] = [];
    for (const record of this.edit.records) {
      let name: string | null = null;
      if (['series', 'accounts', 'budgets', 'debts', 'goals'].includes(record.table)) {
        name = text(copyOf(record)?.name) ?? this.context.nameOf(record.table, record.id);
      } else if (record.table === 'payment_changes' || record.table === 'ticks') {
        const copy = copyOf(record);
        name = this.seriesName(copy?.series_id ?? copy?.budget_id);
      }
      if (name !== null && !found.includes(name)) found.push(name);
    }
    return found;
  }

  generic(): string {
    const names = this.names();
    return names.length === 0 ? w.madeAChange : w.changedNames(namesList(names));
  }

  /** A tick or an untick. */
  ticks(ticking: boolean): string | null {
    const records = this.of('ticks').filter((one) =>
      ticking ? !removed(one.after) : removed(one.after),
    );
    const first = records[0];
    if (first === undefined) return null;
    if (records.length > 1) return w.ticked(records.length);
    const copy = copyOf(first) ?? {};
    const series = copy.series_id ?? copy.budget_id;
    const name = this.seriesName(series);
    if (name === null) return null;
    const date = this.day(copy.original_date);
    const arrived = this.comesIn(series);
    if (ticking) return (arrived ? w.markedArrived : w.markedPaid)(name, date);
    return (arrived ? w.markedNotArrived : w.markedNotPaid)(name, date);
  }

  /** A change to one payment: moved, removed, a new amount, or something else about it. */
  justThisOne(): string | null {
    const record = this.of('payment_changes')[0];
    if (record === undefined) return null;
    const after = record.after;
    const before = record.before;
    const copy = copyOf(record) ?? {};
    const name = this.seriesName(copy.series_id ?? copy.budget_id);
    if (name === null) return null;
    const date = this.day(copy.original_date);
    if (after !== null && !removed(after)) {
      if (after.skipped === true && before?.skipped !== true) return w.removedOne(name, date);
      const moved = text(after.new_date);
      if (moved !== null && moved !== text(before?.new_date)) {
        return w.movedOne(name, date, this.day(moved));
      }
      const amount = pence(after.amount);
      if (amount !== null && amount !== pence(before?.amount)) {
        return w.changedOneTo(name, date, formatMoney(amount));
      }
    }
    return w.changedOne(name, date);
  }

  /** "This and all later ones": a new series from a payment on, or the whole series from its first. */
  thisAndLater(): string | null {
    const series = this.of('series');
    const made = series.find((one) => one.before === null && !removed(one.after));
    if (made?.after !== undefined && made.after !== null) {
      const name = text(made.after.name) ?? '';
      const from = this.day(made.after.start_date);
      const amount = pence(made.after.amount);
      const old = series.find((one) => one.id === text(made.after?.split_from));
      const oldAmount = pence(old?.before?.amount ?? old?.after?.amount);
      return amount !== null && amount !== oldAmount
        ? w.changedLaterTo(name, formatMoney(amount), from)
        : w.changedLater(name, from);
    }
    const whole = series.find((one) => one.before !== null && !removed(one.after));
    if (whole?.after !== undefined && whole.after !== null) {
      const name = text(whole.after.name) ?? '';
      const amount = pence(whole.after.amount);
      return amount !== null && amount !== pence(whole.before?.amount)
        ? w.changedAllTo(name, formatMoney(amount))
        : w.changed(name);
    }
    return null;
  }

  removeLater(): string | null {
    const record = this.of('series')[0];
    const name = record === undefined ? null : text(copyOf(record)?.name);
    return name === null ? null : w.removedLater(name);
  }

  addPayment(): string | null {
    const made = this.of('series').find(
      (one) => one.before === null && one.after !== null && one.after.locked_to == null,
    );
    const copy = made?.after ?? this.of('series').find((one) => one.before === null)?.after ?? null;
    if (copy === null) return null;
    const name = text(copy.name) ?? '';
    const schedule = copy.schedule as { kind?: unknown } | null | undefined;
    const once = schedule?.kind === 'once';
    return (once ? w.addedOnce : w.addedFrom)(name, this.signed(copy), this.day(copy.start_date));
  }

  deletePayment(): string | null {
    const record = this.of('series')[0];
    const name = record === undefined ? null : text(copyOf(record)?.name);
    return name === null ? null : w.removed(name);
  }

  balance(): string | null {
    const update = this.of('balance_updates').find((one) => one.before === null);
    const copy = update?.after;
    if (copy === undefined || copy === null) return null;
    const account = this.context.nameOf('accounts', text(copy.account_id) ?? '') ?? '';
    const amount = formatMoney(pence(copy.balance) ?? 0);
    const ticked = this.of('ticks').filter((one) => !removed(one.after)).length;
    return ticked === 0 ? w.balance(account, amount) : w.balanceTicked(account, amount, ticked);
  }

  spend(kind: string): string | null {
    const record = this.of('spends')[0];
    if (record === undefined) return null;
    const copy = copyOf(record) ?? {};
    const budget = this.context.nameOf('budgets', text(copy.budget_id) ?? '') ?? '';
    const amount = formatMoney(pence(copy.amount) ?? 0);
    if (kind === 'remove-spend') {
      return w.removedSpend(formatMoney(pence(record.before?.amount) ?? 0), budget);
    }
    if (kind === 'change-spend') return w.changedSpend(budget, amount);
    return w.spent(amount, budget);
  }

  thing(table: string, kind: 'account' | 'debt' | 'goal' | 'budget'): string | null {
    const record = this.of(table)[0];
    if (record === undefined) return null;
    const name = text(copyOf(record)?.name) ?? this.context.nameOf(table, record.id);
    return name === null ? null : w[kind](name);
  }

  shift(): string {
    const details = this.of('pay_adjustment_details')[0];
    const copy = details === undefined ? null : copyOf(details);
    if (copy === null) return w.theirPay;
    if (removed(details?.after ?? null)) return w.removedShift;
    const date = this.day(copy.worked_on);
    return copy.kind === 'missed-shift' ? w.missedShift(date) : w.overtime(date);
  }
}

/** What a change did, after who made it: "changed Rent on Tue 1 Dec to £560.00". */
export function whatItDid(edit: ActivityEdit, context: ActivityContext): string {
  const read = new Reader(edit, context);
  const summary = edit.summary ?? {};
  const found = ((): string | null => {
    switch (edit.kind) {
      case 'tick':
        return read.ticks(true);
      case 'untick':
        return read.ticks(false);
      case 'just-this-one':
      case 'move':
      case 'move-to-next-payday':
      case 'remove-this-one':
        return read.justThisOne();
      case 'this-and-later':
        return read.thisAndLater();
      case 'remove-this-and-later':
        return read.removeLater();
      case 'add-payment':
        return read.addPayment();
      case 'delete-payment':
        return read.deletePayment();
      case 'update-balance':
        return read.balance();
      case 'spend':
      case 'change-spend':
      case 'remove-spend':
        return read.spend(edit.kind);
      case 'add-account':
      case 'change-account':
      case 'close-account': {
        const thing = read.thing('accounts', 'account');
        if (thing === null) return null;
        return edit.kind === 'add-account'
          ? w.added(thing)
          : edit.kind === 'close-account'
            ? w.closed(thing)
            : w.changed(thing);
      }
      case 'add-debt':
      case 'change-debt':
      case 'close-debt': {
        const thing = read.thing('debts', 'debt');
        if (thing === null) return null;
        return edit.kind === 'add-debt'
          ? w.added(thing)
          : edit.kind === 'close-debt'
            ? w.closed(thing)
            : w.changed(thing);
      }
      case 'update-from-statement': {
        const record = read.of('debts')[0];
        const name = record === undefined ? null : text(copyOf(record)?.name);
        return name === null ? null : w.statement(name);
      }
      case 'add-goal':
      case 'change-goal':
      case 'close-goal': {
        const thing = read.thing('goals', 'goal');
        if (thing === null) return null;
        return edit.kind === 'add-goal'
          ? w.added(thing)
          : edit.kind === 'close-goal'
            ? w.closed(thing)
            : w.changed(thing);
      }
      case 'add-budget':
      case 'change-budget':
      case 'end-budget': {
        const thing = read.thing('budgets', 'budget');
        if (thing === null) return null;
        return edit.kind === 'add-budget'
          ? w.added(thing)
          : edit.kind === 'end-budget'
            ? w.ended(thing)
            : w.changed(thing);
      }
      case 'overtime':
      case 'missed-shift':
      case 'remove-pay-adjustment':
        return read.shift();
      case 'add-pay-profile':
      case 'change-pay-profile':
      case 'add-pay-week':
      case 'change-pay-week':
      case 'link-pay':
        return w.job;
      case 'choose-main-pay':
        return w.mainPay;
      case 'set-nation': {
        const plan = read.of('plans')[0];
        const nation = text(plan?.after?.nation) ?? '';
        const where = (strings.setup.account.nations as Record<string, string>)[nation];
        return where === undefined ? null : w.nation(where);
      }
      case 'share-accounts': {
        const names = read
          .of('accounts')
          .map((one) => text(copyOf(one)?.name))
          .filter((one): one is string => one !== null);
        return names.length === 0 ? null : w.sharedAccounts(namesList(names));
      }
      case 'share-record': {
        const kind = text(summary.shared);
        const thing =
          kind === 'debt'
            ? read.thing('debts', 'debt')
            : kind === 'goal'
              ? read.thing('goals', 'goal')
              : null;
        return thing === null ? null : w.sharedRecord(thing);
      }
      case 'make-private': {
        const kind = text(summary.made_private) ?? 'account';
        const table = kind === 'debt' ? 'debts' : kind === 'goal' ? 'goals' : 'accounts';
        const thing = read.thing(
          table,
          kind === 'debt' ? 'debt' : kind === 'goal' ? 'goal' : 'account',
        );
        if (thing !== null && edit.mine) return w.madePrivate(thing);
        return w.madeSomethingPrivate(w.kinds[kind] ?? w.kinds.account ?? '');
      }
      case 'claim-pay': {
        const name = read.names()[0];
        if (name === undefined) return null;
        return edit.mine ? w.claimedMine(name) : w.claimedTheirs(name);
      }
      case 'change-role': {
        const person = text(summary.person);
        const role = text(summary.role);
        if (person === null || role === null) return null;
        const words = strings.share.roles[role];
        return words === undefined ? null : w.role(whoInside(person, context), words);
      }
      case 'undo': {
        const names = read.names();
        return names.length === 0 ? w.undidSomething : w.undid(namesList(names));
      }
      default:
        return null;
    }
  })();
  return found ?? read.generic();
}

/** The whole sentence: "Tom changed Rent on Tue 1 Dec to £560.00." */
export function activityWords(edit: ActivityEdit, context: ActivityContext): string {
  return t.sentence(whoStarts(edit.by, context), whatItDid(edit, context));
}

/** Reads plan_activity's answer, keeping only what's well formed. */
export function activityEditsFrom(value: unknown): ActivityEdit[] {
  if (value === null || typeof value !== 'object') return [];
  const edits = (value as { edits?: unknown }).edits;
  if (!Array.isArray(edits)) return [];
  return edits.flatMap((raw): ActivityEdit[] => {
    if (raw === null || typeof raw !== 'object') return [];
    const one = raw as Record<string, unknown>;
    const id = text(one.id);
    const by = text(one.by);
    const madeAt = text(one.made_at);
    const kind = text(one.kind);
    if (id === null || by === null || madeAt === null || kind === null) return [];
    const records = Array.isArray(one.records) ? one.records : [];
    return [
      {
        id,
        by,
        madeAt,
        kind,
        mine: one.mine === true,
        undone: one.undone === true,
        undoes: text(one.undoes),
        canUndo: one.can_undo === true,
        summary:
          one.summary !== null && typeof one.summary === 'object'
            ? (one.summary as Record<string, unknown>)
            : null,
        records: records.flatMap((record): ActivityRecord[] => {
          if (record === null || typeof record !== 'object') return [];
          const r = record as Record<string, unknown>;
          const table = text(r.table);
          const recordId = text(r.id);
          if (table === null || recordId === null) return [];
          const copy = (value: unknown): Copy | null =>
            value !== null && typeof value === 'object' ? (value as Copy) : null;
          return [{ table, id: recordId, before: copy(r.before), after: copy(r.after) }];
        }),
      },
    ];
  });
}
