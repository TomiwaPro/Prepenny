// Bank holidays on the phone (step 4c).
//
// - Each week the phone fetches the bank holiday list from PrePenny's own
//   site, which the Bank holidays workflow keeps up to date from GOV.UK
//   (D57, D537), and keeps it. With no signal, or before the first fetch,
//   the copy built into the app is used.
// - A plan kept only on this phone takes a newer list straight away. A plan
//   in an account takes the server's: a phone that can change the plan
//   sends a newer list there (data/sync.ts), and every phone brings it down,
//   so both phones in a shared plan give the same dates (D536).
// - When a newer list moves a payment because of a new bank holiday, Home
//   says so once, until "Got it" (D539, the owner's answer to question 4).
//
// The list is GOV.UK's, never the person's. The note names the person's own
// payments, so it's kept in the phone's database with the plan, which
// signing out clears (D308), and never written anywhere else.

import {
  type BankHolidayCopy,
  checkBankHolidayCopy,
  type HolidayMove,
  isNewerBankHolidayVersion,
  type PlanRecords,
} from '@prepenny/engine';
import { builtInCopy, copyOf, holidayMoves, newerCopy } from '../lib/holidays.ts';
import { HOME_MONTHS_AHEAD, planLookAhead } from '../lib/plan-input.ts';
import { fetchWithTimeLimit } from '../lib/time-limit.ts';
import { type PrePennyDb, type StoredPlan, saveBankHolidays } from './db.ts';

/** Where the phone keeps the list it last fetched, and when it last fetched one. */
const FETCHED = 'bank-holidays-fetched';
/** Where the note for Home waits until "Got it". */
const NOTE = 'bank-holiday-note';

/** How often the phone fetches the list: once a week (D537). */
export const FETCH_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

interface Fetched {
  readonly copy: BankHolidayCopy | null;
  /** When the phone last fetched it, by its own clock. */
  readonly fetchedAt: number;
}

async function fetchedOn(db: PrePennyDb): Promise<Fetched | null> {
  const value = (await db.device.get(FETCHED))?.value as Partial<Fetched> | undefined;
  if (value === undefined || typeof value.fetchedAt !== 'number') return null;
  return { copy: value.copy ?? null, fetchedAt: value.fetchedAt };
}

/** The newest list on this phone: the one it fetched, or the built-in one (D536). */
export async function newestOnPhone(db: PrePennyDb): Promise<BankHolidayCopy> {
  return newerCopy(builtInCopy(), (await fetchedOn(db))?.copy ?? null);
}

/** True when a week has passed since the phone last fetched the list, or it never has. */
export function fetchDue(fetchedAt: number | null, now: number): boolean {
  return fetchedAt === null || now - fetchedAt >= FETCH_EVERY_MS || now < fetchedAt;
}

/**
 * Fetches the list from PrePenny's own site, once a week (D537), never from
 * the browser's or the offline helper's copy. Keeps it when it's newer than
 * the one the phone has. True when it got a newer one. With no signal, or a
 * list that isn't GOV.UK's, nothing changes and it's tried again next time.
 */
export async function fetchNewList(db: PrePennyDb, now = Date.now()): Promise<boolean> {
  const before = await fetchedOn(db);
  if (!fetchDue(before?.fetchedAt ?? null, now)) return false;
  try {
    const response = await fetchWithTimeLimit()('/bank-holidays.json', { cache: 'no-store' });
    if (!response.ok) return false;
    const body = (await response.json()) as { readonly version?: unknown; readonly list?: unknown };
    const { copy } = checkBankHolidayCopy({ version: body.version, list: body.list });
    const kept = before?.copy ?? null;
    const newer = kept === null || isNewerBankHolidayVersion(copy.version, kept.version);
    await db.device.put({ key: FETCHED, value: { copy: newer ? copy : kept, fetchedAt: now } });
    return newer;
  } catch {
    return false;
  }
}

/**
 * For a plan kept only on this phone: takes the newest list the phone has,
 * when it's newer than the plan's, and notes on Home any payment a new bank
 * holiday moved (D539). Gives back the plan's records with it, or null when
 * nothing changed. A plan in an account, and the example, are left alone:
 * the server decides an account's list (data/sync.ts), and the example
 * always uses the built-in copy.
 */
export async function takeNewerList(
  db: PrePennyDb,
  plan: StoredPlan,
  records: PlanRecords,
  today: string,
): Promise<PlanRecords | null> {
  if (plan.isExample) return null;
  if ((await db.links.get(plan.id)) !== undefined) return null;
  const now = copyOf(records);
  const newest = await newestOnPhone(db);
  if (!isNewerBankHolidayVersion(newest.version, now.version)) return null;
  const moves = holidayMoves(records, now, newest, today, planLookAhead(today, HOME_MONTHS_AHEAD));
  const saved = await db.transaction(
    'rw',
    [db.plans, db.records, db.device, db.links],
    async () => {
      // Gone, or now in an account, since this began: the server decides then.
      if ((await db.plans.get(plan.id)) === undefined) return false;
      if ((await db.links.get(plan.id)) !== undefined) return false;
      await saveBankHolidays(db, plan.id, newest);
      await noteMoves(db, plan.id, moves);
      return true;
    },
  );
  return saved ? { ...records, bankHolidays: newest } : null;
}

/** The note for Home: the payments new bank holidays moved, for one plan (D539). */
export interface HolidayNote {
  readonly planId: string;
  readonly moves: readonly HolidayMove[];
}

/**
 * Adds payments a newer list moved to the note for Home. A note for another
 * plan is replaced; one payment told twice is told once, where it is now.
 * Must run inside a transaction with `db.device`, or on its own.
 */
export async function noteMoves(
  db: PrePennyDb,
  planId: string,
  moves: readonly HolidayMove[],
): Promise<void> {
  if (moves.length === 0) return;
  const kept = (await db.device.get(NOTE))?.value as HolidayNote | undefined;
  const earlier = kept?.planId === planId ? kept.moves : [];
  const key = (move: HolidayMove) => `${move.seriesId}|${move.originalDate}`;
  const fresh = new Set(moves.map(key));
  const all = [...earlier.filter((move) => !fresh.has(key(move))), ...moves].sort((a, b) =>
    a.to !== b.to ? (a.to < b.to ? -1 : 1) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  await db.device.put({ key: NOTE, value: { planId, moves: all } satisfies HolidayNote });
}

/** The note for Home for this plan, or null when there's none. */
export async function holidayNoteFor(db: PrePennyDb, planId: string): Promise<HolidayNote | null> {
  const kept = (await db.device.get(NOTE))?.value as HolidayNote | undefined;
  return kept?.planId === planId && kept.moves.length > 0 ? kept : null;
}

/** "Got it": the note goes. */
export async function dismissHolidayNote(db: PrePennyDb): Promise<void> {
  await db.device.delete(NOTE);
}
