'use client';

// Your plan on the server (step 3c, ARCHITECTURE.md 3.5).
//
// - Once someone signs in, the plan on their phone goes up as the first
//   copy. From then on every change made on the phone is saved there at
//   once and joins a queue (data/db.ts, saveChange), and is sent as one edit
//   with its records (save_edit), one at a time, in the order made.
// - Signing in on another phone brings the plan down exactly as it was left
//   (plan_changes, brief Part 10).
// - A phone hears that something changed from a live nudge with nothing in
//   it (Supabase Realtime, D295), and also looks when PrePenny opens, when it
//   comes back on screen, when the signal comes back and every minute while
//   it's open. Then it brings down only what's new.
// - Every screen of a phone that's signed in looks at the account, the
//   welcome and setup included (D351): a plan of the phone's own beside the
//   account's asks which to keep (D324), and a phone with none brings the
//   account's down. The account holds one plan of the person's own (D352).
// - Changes made with no signal wait in the queue, in order, and go when the
//   signal is back (step 3d). Before each is sent, the phone looks at what's
//   new, and when another phone has changed the same thing since, the newest
//   change wins (D59, lib/clash.ts): this phone's is sent and the other
//   person is told, or theirs is kept and this person is told, with "Put
//   mine back". Times are this phone's clock corrected against the
//   server's (data/clock.ts).
// - A change the server refuses for another reason is taken off the queue,
//   so nothing after it waits for ever, and the person is told (PLAN.md item 32).
// - Only a phone that's signed in sends anything; the example plan is never
//   sent (D182). Nothing here writes an amount, a name, a note or an email
//   address to the console or anywhere else (CLAUDE.md).

import type { RecordWrite } from '@prepenny/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import {
  finishBeforeSigningOut,
  signedInClient,
  signInEndedOnServer,
  stillSignedIn,
} from '../lib/account.ts';
import type { ClashFacts, QueuedChange } from '../lib/clash.ts';
import { newId } from '../lib/ids.ts';
import { SETUP_LAYOUT, type SetupProgress, setupDone } from '../lib/setup-progress.ts';
import {
  type DbWrite,
  type MirrorRow,
  mirrorRowOf,
  savedRows,
  type Table,
} from '../lib/sync-rows.ts';
import { updateWhenSafe } from '../lib/update.ts';
import { differs, liveVersion } from '../lib/version.ts';
import {
  clashFactsInBackground,
  settleInBackground,
  syncRecordsInBackground,
  syncWritesInBackground,
} from '../worker/client.ts';
import { clashesChanged } from './clashes.ts';
import { clockFrom, clockOn, correctedTime, rememberClock } from './clock.ts';
import {
  loadRecords,
  type MadeChange,
  openDb,
  ownPlanOnPhone,
  type PlanLink,
  type PrePennyDb,
  type StoredClash,
  type StoredPlan,
  type StoredRow,
  savePlan,
  setShowing,
  type UnsentEdit,
} from './db.ts';
import { setGetBackInNotice } from './get-back-in-notice.ts';

// ---------------------------------------------------------------------------
// What the screens show.

export interface SyncState {
  /** The person's own plan on this phone is kept in their account. */
  readonly kept: boolean;
  /** Changes made on this phone that haven't been sent yet. */
  readonly unsent: number;
  /** The last try to send didn't reach the server, or the server couldn't take it. */
  readonly cantSend: boolean;
}

const NOTHING: SyncState = { kept: false, unsent: 0, cantSend: false };
let state: SyncState = NOTHING;
const stateListeners = new Set<() => void>();

function setState(next: SyncState) {
  if (
    next.kept === state.kept &&
    next.unsent === state.unsent &&
    next.cantSend === state.cantSend
  ) {
    return;
  }
  state = next;
  for (const listener of stateListeners) listener();
}

/** Whether the plan is kept in the account, and what's still to send, kept up to date. */
export function useSync(): SyncState {
  return useSyncExternalStore(
    (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    () => state,
    () => NOTHING,
  );
}

const updatedListeners = new Set<() => void>();

/** Calls back whenever the plan on this phone has been brought up to date from the server. */
export function onPlanBroughtDown(listener: () => void): () => void {
  updatedListeners.add(listener);
  return () => updatedListeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Talking to the server.

/** Why a request didn't work, as a code only. */
type Failure =
  /** No signal, or no answer: try again later. */
  | { readonly kind: 'unreachable' }
  /** The server refused it, with save_edit's own code (step 3d decides what next). */
  | { readonly kind: 'refused'; readonly code: string };

/** PrePenny's own refusals, from supabase/migrations: anything else is "unreachable". */
const REFUSALS = new Set([
  'changed-since',
  'not-allowed',
  'not-found',
  'bad-edit',
  'bad-record',
  'family-broken',
  'shared-plan',
  'link-to-private',
  'private-transfer-needs-halves',
  'shared-half',
  'family-mixed',
  'fixed-field',
  'sharing-comes-later',
  'not-your-pay',
  'link-not-needed',
  'private-belongs-to',
  'has-a-plan',
]);

function failureOf(error: { code?: unknown; message?: unknown } | null): Failure {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (REFUSALS.has(message)) return { kind: 'refused', code: message };
  // The privacy rules' own refusal: a record they can read but not change,
  // as for "Can view only" (D51). Anything they can't see is refused as
  // "not-found" by PrePenny's own checks first (D290). Any other "not
  // allowed", such as a sign-in that has just ended, isn't the change's
  // fault: it's tried again, and the sign-in is looked at (step 3d).
  if (error?.code === '42501' && message.startsWith('new row violates row-level security')) {
    return { kind: 'refused', code: 'not-allowed' };
  }
  // A server whose database hasn't had step 3c yet, a weak signal, or none.
  return { kind: 'unreachable' };
}

/**
 * Calls one of the server's steps. With the phone's database, the server's
 * time in its answer corrects this phone's clock (step 3d, data/clock.ts).
 */
async function rpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  db?: PrePennyDb,
): Promise<{ ok: true; data: T } | { ok: false; failure: Failure }> {
  try {
    const sentAt = Date.now();
    const { data, error } = await client.rpc(name, args);
    const receivedAt = Date.now();
    if (error !== null) return { ok: false, failure: failureOf(error) };
    if (db !== undefined && typeof data === 'object' && data !== null) {
      const clock = clockFrom((data as { now?: unknown }).now, sentAt, receivedAt);
      if (clock !== null) await rememberClock(db, clock);
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, failure: { kind: 'unreachable' } };
  }
}

async function personOf(client: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/** Opens the phone's database for one task, and closes it after. */
async function withDb<T>(task: (db: PrePennyDb) => Promise<T>): Promise<T> {
  const db = openDb();
  try {
    return await task(db);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Before anything is sent or brought down: does this phone's sign-in still
// stand, and is it on the version the server expects (step 3e)?

/** What the server says about this phone before anything else happens. */
type Standing =
  /** All's well: send what's queued and bring down what's new. */
  | 'ok'
  /** The sign-in has ended, as after "Sign out of all other devices" on another phone (D21). */
  | 'ended'
  /** Two-step sign-in is on and this sign-in hasn't passed the second step yet. */
  | 'second-step'
  /** A newer version of PrePenny is live: this phone updates itself first. */
  | 'update'
  /** The server is part-way through an update, or can't be reached: nothing goes for now. */
  | 'wait';

/**
 * Asks the server whether this phone's sign-in stands and whether it's on
 * the version the server expects, and the live site which version is live.
 * A phone on an older version updates itself before it sends anything, so it
 * never keeps a different plan; the database gives it nothing until then
 * anyway (supabase/migrations, step 3e).
 */
async function lookAtStanding(client: SupabaseClient): Promise<Standing> {
  const answer = await withDb((db) =>
    rpc<{ sign_in?: unknown; version?: unknown; get_back_in?: unknown }>(client, 'hello', {}, db),
  );
  // A database from before step 3e has no `hello`: it's still being updated.
  if (!answer.ok) return 'wait';
  // Someone getting back in with the backup email: every screen says so,
  // with "Stop it" (step 3e hardening).
  setGetBackInNotice(answer.data.sign_in === 'ok' ? (answer.data.get_back_in ?? null) : null);
  if (answer.data.sign_in === 'ended') return 'ended';
  if (answer.data.sign_in === 'second-step') return 'second-step';
  if (answer.data.sign_in !== 'ok') return 'wait';
  const live = await liveVersion();
  const newerLive = live !== null && differs(live);
  if (answer.data.version === 'update-needed') return newerLive ? 'update' : 'wait';
  if (answer.data.version !== 'ok') return 'wait';
  return newerLive ? 'update' : 'ok';
}

/**
 * Acts on what the server said. True when the phone can go on to send and
 * bring down; otherwise the plan stays as it is on the phone, every change
 * kept in the queue.
 */
async function actOn(standing: Standing, person: string | null): Promise<boolean> {
  if (standing === 'ok') return true;
  if (standing === 'ended') {
    await signInEndedOnServer();
    return false;
  }
  if (standing === 'second-step') tell('second-step');
  if (standing === 'update') updateWhenSafe();
  if (person !== null) {
    await withDb(async (db) => {
      const own = await ownPlanOnPhone(db);
      if (own !== undefined && own.owner === person) {
        await publish(db, own.id, standing === 'wait');
      }
    });
  }
  return false;
}

/**
 * Looks only at whether this phone's sign-in still stands, as PrePenny does
 * every minute when it's not on screen, so an ended sign-in removes the plan
 * within a minute even then (D21).
 */
export async function lookAtSignInOnly(): Promise<void> {
  const client = await signedInClient();
  if (client === null) return;
  if ((await lookAtStanding(client)) === 'ended') await signInEndedOnServer();
}

let lookingForGetBackIn: Promise<void> | null = null;

/**
 * Asks the server only whether someone is getting back into this account
 * with its backup email, on its own, so the notice never waits behind
 * sending or bringing down the plan (D404). Only the notice changes here:
 * everything else the answer says is acted on by the next look at the
 * account, in turn.
 */
export function lookForGetBackIn(): Promise<void> {
  lookingForGetBackIn ??= (async () => {
    try {
      const client = await signedInClient();
      if (client === null) return;
      const answer = await rpc<{ sign_in?: unknown; get_back_in?: unknown }>(client, 'hello', {});
      if (!answer.ok) return;
      setGetBackInNotice(answer.data.sign_in === 'ok' ? (answer.data.get_back_in ?? null) : null);
    } catch {
      // No answer: the next look, within a minute, asks again.
    } finally {
      lookingForGetBackIn = null;
    }
  })();
  return lookingForGetBackIn;
}

// ---------------------------------------------------------------------------
// The server's rows on this phone.

async function rowsOn(db: PrePennyDb, planId: string): Promise<MirrorRow[]> {
  const stored = await db.rows.where('planId').equals(planId).toArray();
  return stored.map(({ planId: _plan, ...row }) => row);
}

async function keepRows(db: PrePennyDb, planId: string, rows: readonly MirrorRow[]) {
  if (rows.length === 0) return;
  await db.rows.bulkPut(rows.map((row): StoredRow => ({ ...row, planId })));
}

interface PlanChanges {
  readonly plan: Record<string, unknown>;
  readonly rows: readonly {
    readonly table: Table;
    readonly row: Record<string, unknown>;
    /** When the edit that last saved it was made, and by whom (step 3d). */
    readonly edit_made_at?: string | null;
    readonly edit_by?: string | null;
  }[];
  readonly members?: readonly { readonly person: string; readonly nickname?: string }[];
  /** This person's own notices not read yet: a change of theirs a newer one replaced (step 3d). */
  readonly notices?: readonly Notice[];
}

interface Notice {
  readonly id: string;
  /** The change that replaced the person's. */
  readonly edit?: string;
  readonly data: {
    readonly lost?: string;
    readonly by?: string;
    readonly made_at?: string;
    readonly rows?: readonly { readonly table?: string; readonly id?: string }[];
    /** The device the replaced change was made on (step 3e). */
    readonly from?: {
      readonly session?: string;
      readonly browser?: string;
      readonly device?: string;
    } | null;
  } | null;
}

/** The server's rows as this phone keeps them, from what plan_changes gave back. */
function rowsFrom(changes: PlanChanges): MirrorRow[] {
  const { edit_made_at: planMadeAt, edit_by: planBy, ...plan } = changes.plan;
  return [
    mirrorRowOf('plans', plan, { madeAt: planMadeAt, by: planBy }),
    ...changes.rows.map(({ table, row, edit_made_at: madeAt, edit_by: by }) =>
      mirrorRowOf(table, row, { madeAt, by }),
    ),
  ];
}

/** Each person in the plan's nickname, for "Tom changed Rent" (step 3d). */
function nicknamesOf(changes: PlanChanges): Record<string, string> | undefined {
  if (changes.members === undefined) return undefined;
  return Object.fromEntries(changes.members.map((one) => [one.person, one.nickname ?? '']));
}

/**
 * Works the plan on this phone out again from the server's rows, with the
 * changes not sent yet on top, and saves it. A change made meanwhile on this
 * phone makes it start again, so nothing made here is ever lost.
 */
async function rebuild(db: PrePennyDb, link: PlanLink): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const unsent = await db.unsent.where('planId').equals(link.planId).sortBy('n');
    const last = unsent.at(-1)?.n ?? 0;
    const rows = await rowsOn(db, link.planId);
    const { records, setup } = await syncRecordsInBackground(
      rows,
      unsent.map((one) => one.writes),
    );
    const done = await db.transaction('rw', [db.plans, db.records, db.unsent], async () => {
      const now = (await db.unsent.where('planId').equals(link.planId).last())?.n ?? 0;
      if (now !== last) return false;
      const stored = await db.plans.get(link.planId);
      const plan: StoredPlan = {
        ...(stored ?? { id: link.planId, isExample: false }),
        owner: link.personId,
        setup: unsent.at(-1)?.setup ?? setup ?? stored?.setup ?? DONE,
        // A change made on these records was made on what's been brought down so far (step 3d).
        seen: { shared: link.shared, mine: link.mine },
      };
      await savePlan(db, plan, records);
      return true;
    });
    if (done) {
      for (const listener of updatedListeners) listener();
      return;
    }
  }
}

/** A plan brought down from someone's account is ready to use, even one they never set up themselves. */
const DONE: SetupProgress = { layout: SETUP_LAYOUT, step: 'done', items: [], answers: {} };

/** Brings down what's new on the server, and says whether anything was. */
async function bringDown(
  client: SupabaseClient,
  db: PrePennyDb,
  link: PlanLink,
): Promise<boolean | Failure> {
  const answer = await rpc<PlanChanges>(
    client,
    'plan_changes',
    { plan: link.planId, shared_after: link.shared, mine_after: link.mine },
    db,
  );
  if (!answer.ok) return answer.failure;
  const rows = rowsFrom(answer.data);
  const nicknames = nicknamesOf(answer.data);
  const known = new Map(
    (await rowsOn(db, link.planId)).map((row) => [`${row.table}|${row.id}`, row]),
  );
  const changed = rows.filter(
    (row) => known.get(`${row.table}|${row.id}`)?.version !== row.version,
  );
  let shared = link.shared;
  let mine = link.mine;
  for (const row of rows) {
    if (row.table === 'plans') continue;
    if (row.privateTo === null) shared = Math.max(shared, row.seq);
    else mine = Math.max(mine, row.seq);
  }
  await keepRows(db, link.planId, changed);
  const now: PlanLink = {
    ...link,
    shared,
    mine,
    ...(nicknames === undefined ? {} : { nicknames }),
  };
  await db.links.put(now);
  if (changed.length > 0) await rebuild(db, now);
  await hearNotices(client, db, now, answer.data.notices ?? []);
  return changed.length > 0;
}

/**
 * The person's notices: a change this phone sent that a newer one from
 * another phone replaced (step 3d). The phone that sent it tells the person,
 * from its own copy of what it sent and the records as they are now, then
 * marks the notice as read. A notice about a change sent from another phone
 * of theirs is left for that phone.
 */
async function hearNotices(
  client: SupabaseClient,
  db: PrePennyDb,
  link: PlanLink,
  notices: readonly Notice[],
) {
  const heard: string[] = [];
  // The person's devices still signed in, asked for only when a notice is about another one (step 3e).
  let devices: Set<string> | null = null;
  for (const notice of notices) {
    if (!stillSignedIn()) return;
    const lost = notice.data?.lost;
    if (typeof lost !== 'string') continue;
    const sent = await db.sent.get([link.planId, lost]);
    if (sent === undefined) {
      // Made on another phone of the person's (PLAN.md item 39).
      devices ??= await devicesNow(client);
      if (await heardElsewhere(db, link, notice, devices)) heard.push(notice.id);
      continue;
    }
    if ((await db.clashes.get(notice.id)) === undefined) {
      const facts = await clashFactsInBackground({
        rows: await rowsOn(db, link.planId),
        change: queued(sent),
        by: notice.data?.by ?? null,
      });
      await db.clashes.put({
        id: notice.id,
        planId: link.planId,
        kind: 'replaced',
        facts,
        ...putBackOf(sent),
        at: Date.now(),
      });
      clashesChanged();
    }
    heard.push(notice.id);
  }
  if (heard.length === 0) return;
  try {
    await client.from('notices').update({ read_at: new Date().toISOString() }).in('id', heard);
  } catch {
    // Heard again next time, and shown once: the clash is kept on the phone.
  }
}

/** The ids of the person's devices still signed in, or null when the server can't say for now. */
async function devicesNow(client: SupabaseClient): Promise<Set<string> | null> {
  const answer = await rpc<{ devices?: readonly { id?: unknown }[] }>(client, 'my_devices', {});
  if (!answer.ok) return null;
  return new Set(
    (answer.data.devices ?? [])
      .map((one) => one.id)
      .filter((id): id is string => typeof id === 'string'),
  );
}

/** A notice about a change made on another device is shown here once it has waited this long unread. */
const WAITED_MS = 60 * 60 * 1000;

/**
 * A notice about a change the person made on another of their devices, which
 * a newer change replaced (PLAN.md item 39, step 3e). The device that made
 * it tells them, as in step 3d. This phone tells them instead when that
 * device has signed out since, or the notice has waited an hour unread,
 * naming the device: "Tom changed Rent on Tue 1 Dec after you changed it on
 * Chrome on an Android phone." This phone doesn't hold the change itself, so
 * it says what was changed but not to what. When this phone made the newer
 * change, there's nothing to tell here: the person has just made it, and the
 * notice is left for their other phones. True when the notice is dealt with.
 */
async function heardElsewhere(
  db: PrePennyDb,
  link: PlanLink,
  notice: Notice,
  devices: Set<string> | null,
): Promise<boolean> {
  // This phone made the newer change: nothing to tell here, and the notice is
  // left for the person's other phones.
  if (
    typeof notice.edit === 'string' &&
    (await db.sent.get([link.planId, notice.edit])) !== undefined
  ) {
    return false;
  }
  const from = notice.data?.from ?? null;
  const madeAt = Date.parse(notice.data?.made_at ?? '');
  const gone = devices !== null && typeof from?.session === 'string' && !devices.has(from.session);
  const waited = Number.isFinite(madeAt) && Date.now() - madeAt > WAITED_MS;
  if (!gone && !waited) return false;
  if ((await db.clashes.get(notice.id)) === undefined) {
    const rows = await rowsOn(db, link.planId);
    const first = notice.data?.rows?.[0];
    const row = rows.find((one) => one.table === first?.table && one.id === first?.id);
    const seriesId = row?.values.series_id;
    const series =
      typeof seriesId === 'string'
        ? rows.find((one) => one.table === 'series' && one.id === seriesId)
        : row?.table === 'series'
          ? row
          : undefined;
    const name = series?.values.name ?? row?.values.name;
    const on = row?.values.original_date;
    await db.clashes.put({
      id: notice.id,
      planId: link.planId,
      kind: 'elsewhere',
      facts: {
        by: notice.data?.by ?? null,
        name: typeof name === 'string' ? name : '',
        on: typeof on === 'string' ? on : null,
        theirs: { kind: 'changed' },
        ours: { kind: 'changed' },
      },
      ...(from === null
        ? {}
        : { madeOn: { browser: from.browser ?? '', device: from.device ?? '' } }),
      at: Date.now(),
    });
    clashesChanged();
  }
  return true;
}

/** A change as lib/clash.ts takes it. */
function queued(change: MadeChange): QueuedChange {
  return {
    writes: change.writes,
    madeAt: change.madeAt,
    ...(change.before === undefined ? {} : { before: change.before }),
    ...(change.commands === undefined ? {} : { commands: change.commands }),
    ...(change.today === undefined ? {} : { today: change.today }),
    ...(change.numbers === undefined ? {} : { numbers: change.numbers }),
    ...(change.payments === undefined ? {} : { payments: change.payments }),
    ...(change.seen === undefined ? {} : { seen: change.seen }),
    ...(change.setup === undefined ? {} : { setup: change.setup }),
  };
}

/** What "Put mine back" makes again, when the change can be made again. */
function putBackOf(change: MadeChange): Pick<StoredClash, 'putBack'> {
  if (change.commands === undefined || change.commands.length === 0) return {};
  return { putBack: { commands: change.commands, payments: change.payments ?? [] } };
}

/** At most this many records in one edit, well inside save_edit's 1,000 and the server's time limit. */
const MOST_IN_ONE_EDIT = 400;

/**
 * Sends the plan on this phone up, whole, for the first time, or what's
 * different from the server's rows when some are there already. A
 * payment's series are always sent together, so a family is never half saved.
 */
async function sendWhole(
  client: SupabaseClient,
  db: PrePennyDb,
  link: PlanLink,
): Promise<true | Failure> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const plan = await db.plans.get(link.planId);
    const records = await loadRecords(db, link.planId);
    const rows = await rowsOn(db, link.planId);
    const writes = await syncWritesInBackground({
      plan: { planId: link.planId, personId: link.personId },
      rows,
      records,
      ...(plan?.setup === undefined ? {} : { setup: plan.setup }),
    });
    let refused: Failure | null = null;
    for (const chunk of chunksOf(writes)) {
      const editId = newId();
      const madeAt = correctedTime(Date.now(), await clockOn(db));
      // Its records are this phone's own, so they never count as someone else's change (step 3d).
      await keepSent(db, { planId: link.planId, editId, madeAt, kind: 'first-copy', writes: [] });
      const result = await saveOnServer(client, db, link, editId, madeAt, 'first-copy', chunk);
      if (result !== true) {
        refused = result;
        break;
      }
    }
    if (refused === null) return true;
    if (refused.kind !== 'refused' || refused.code !== 'changed-since') return refused;
    // Some were there already, from a try that was cut off: look again, then send what's left.
    const again = await bringDown(client, db, { ...link, shared: 0, mine: 0 });
    if (again !== true && again !== false) return again;
  }
  return { kind: 'refused', code: 'changed-since' };
}

function chunksOf(writes: readonly DbWrite[]): DbWrite[][] {
  const series = writes.filter((write) => write.table === 'series');
  const chunks: DbWrite[][] = [];
  let chunk: DbWrite[] = [];
  for (const write of writes) {
    if (write.table === 'series') {
      if (chunk.length > 0 && chunk.length + series.length > MOST_IN_ONE_EDIT) {
        chunks.push(chunk);
        chunk = [];
      }
      if (write === series[0]) chunk.push(...series);
      continue;
    }
    if (chunk.length >= MOST_IN_ONE_EDIT) {
      chunks.push(chunk);
      chunk = [];
    }
    chunk.push(write);
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

/** Saves one edit on the server and keeps the versions it gives back. */
async function saveOnServer(
  client: SupabaseClient,
  db: PrePennyDb,
  link: PlanLink,
  editId: string,
  madeAt: string,
  kind: string,
  writes: readonly DbWrite[],
  /** The edits a clash's newest change replaces, whose people are told (step 3d). */
  overrides: readonly string[] = [],
): Promise<true | Failure> {
  if (writes.length === 0) return true;
  const answer = await rpc<{ saved?: string; rows: Parameters<typeof savedRows>[1] }>(
    client,
    'save_edit',
    {
      plan: link.planId,
      edit: editId,
      made_at: madeAt,
      kind,
      writes,
      ...(overrides.length === 0 ? {} : { overrides }),
    },
    db,
  );
  if (!answer.ok) return answer.failure;
  // Saved already, the first time it was sent: the server's records may have
  // moved on since, so the phone keeps nothing of what it sent, and brings
  // down what's there with its next look (step 3d).
  if (answer.data.saved === 'already') return true;
  const before = await rowsOn(db, link.planId);
  await keepRows(
    db,
    link.planId,
    savedRows(writes, answer.data.rows, before, { id: editId, madeAt, by: link.personId }),
  );
  return true;
}

/** How many changes this phone keeps a note of having sent, for each plan. */
const SENT_KEPT = 100;

/**
 * Notes a change as sent from this phone, before it's sent: if the answer
 * is lost on the way back, its records are still known to be this phone's
 * own when they come down (step 3d). Only the newest are kept.
 */
async function keepSent(db: PrePennyDb, change: MadeChange & { readonly planId: string }) {
  await db.sent.put({ ...change, sentAt: Date.now() });
  const all = await db.sent.where('planId').equals(change.planId).toArray();
  if (all.length <= SENT_KEPT) return;
  const oldest = all.sort((a, b) => a.sentAt - b.sentAt).slice(0, all.length - SENT_KEPT);
  await db.sent.bulkDelete(oldest.map((one) => [one.planId, one.editId] as [string, string]));
}

/** The changes this phone has sent, by id. */
async function oursOn(db: PrePennyDb, planId: string): Promise<string[]> {
  return (await db.sent.where('planId').equals(planId).toArray()).map((one) => one.editId);
}

/**
 * Sends every change in the queue, one at a time, in the order made. Each
 * is looked at first against the newest records (lib/clash.ts). A change
 * that clashes and loses, can't be made any more, or that the server
 * refuses, is taken off the queue and the person is told: nothing after it
 * waits for ever (PLAN.md item 32). Stops at the first that can't reach the
 * server, to try again later.
 */
async function sendQueue(
  client: SupabaseClient,
  db: PrePennyDb,
  link: PlanLink,
): Promise<true | Failure> {
  let sentSome = false;
  try {
    for (;;) {
      // Signing out has begun: nothing more is written to the phone (D360).
      if (!stillSignedIn()) return { kind: 'unreachable' };
      const next = await db.unsent.where('planId').equals(link.planId).first();
      if (next === undefined) return true;
      const sent = await sendOne(client, db, next);
      if (sent !== true) return sent;
      sentSome = true;
    }
  } finally {
    // What was sent may be the change made again on newer records, so the
    // plan on this phone is worked out again from what the server now has.
    if (sentSome && stillSignedIn()) {
      const now = await db.links.get(link.planId);
      if (now !== undefined) await rebuild(db, now);
    }
  }
}

/** Sends one change, after a clash looks again: up to 3 times, then later. */
async function sendOne(
  client: SupabaseClient,
  db: PrePennyDb,
  waiting: UnsentEdit,
): Promise<true | Failure> {
  let next = waiting;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const link = await db.links.get(next.planId);
    if (link === undefined) return { kind: 'unreachable' };
    // Sent before with no answer back: sent again exactly as it was (save_edit
    // changes nothing the second time). Only if it never arrived, and the
    // records have moved on since, is it looked at afresh.
    const before = next.attempt;
    if (before !== undefined) {
      const again = await saveOnServer(
        client,
        db,
        link,
        next.editId,
        before.madeAt,
        next.kind,
        before.writes,
        before.overrides,
      );
      if (again === true) {
        await db.unsent.delete([next.planId, next.n]);
        return true;
      }
      if (again.kind === 'unreachable') return again;
      const { attempt: _sent, ...fresh } = next;
      next = fresh;
      await db.unsent.put(next);
      if (again.code !== 'changed-since') continue;
      const down = await bringDown(client, db, link);
      if (typeof down === 'object') return down;
      continue;
    }
    // A change made before the phone knew the server's time is corrected now.
    const clock = await clockOn(db);
    const stamped =
      next.clockKnown === false && next.madeOnPhone !== undefined && clock !== null
        ? correctedTime(next.madeOnPhone, clock)
        : next.madeAt;
    // Never later than now: a phone whose clock jumped forward since can't
    // make an older change look newer (D366).
    const now = correctedTime(Date.now(), clock);
    const madeAt = Date.parse(stamped) > Date.parse(now) ? now : stamped;
    const change: UnsentEdit = { ...next, madeAt };
    let settled: Awaited<ReturnType<typeof settleInBackground>>;
    try {
      settled = await settleInBackground({
        plan: { planId: link.planId, personId: link.personId },
        rows: await rowsOn(db, link.planId),
        change: queued(change),
        ours: await oursOn(db, link.planId),
      });
    } catch {
      // The phone couldn't work it out, as when it's too slow for now: tried
      // again later, and after 3 tries taken off with a message, so it never
      // holds up the changes after it for ever (D369).
      const tries = (next.tries ?? 0) + 1;
      if (tries < 3) {
        await db.unsent.put({ ...next, tries });
        return { kind: 'unreachable' };
      }
      const facts = await clashFactsInBackground({
        rows: await rowsOn(db, link.planId),
        change: queued(change),
        by: null,
      }).catch(() => ({
        by: null,
        name: '',
        on: null,
        theirs: { kind: 'changed' as const },
        ours: { kind: 'changed' as const },
      }));
      await takeOff(db, link, change, { kind: 'refused', facts, code: 'unexpected' });
      return true;
    }
    if (!stillSignedIn()) return { kind: 'unreachable' };
    if (settled.kind === 'done') {
      await takeOff(db, link, change, null);
      return true;
    }
    if (settled.kind === 'kept-theirs' || settled.kind === 'cant') {
      await takeOff(db, link, change, { kind: settled.kind, facts: settled.facts });
      return true;
    }
    const { refused: _old, n: _n, planId: _plan, attempt: _none, tries: _tries, ...made } = change;
    await keepSent(db, { ...made, planId: link.planId });
    // Kept before it goes, in case the answer is lost on the way back.
    await db.unsent.put({
      ...change,
      attempt: { writes: settled.writes, overrides: settled.overrides, madeAt },
    });
    const result = await saveOnServer(
      client,
      db,
      link,
      change.editId,
      madeAt,
      change.kind,
      settled.writes,
      settled.overrides,
    );
    if (result === true) {
      await db.unsent.delete([change.planId, change.n]);
      return true;
    }
    if (result.kind === 'unreachable') return result;
    if (result.code === 'not-found') {
      // The plan itself gone from the account is for keepInStepOnce to see
      // (D355); otherwise it's this change that names something not there.
      const down = await bringDown(client, db, link);
      if (typeof down === 'object') return down;
    }
    if (result.code === 'changed-since') {
      // Saved by another phone a moment ago: nothing of this was saved, so
      // it's looked at against what's new and settled again.
      await db.unsent.put(change);
      const down = await bringDown(client, db, link);
      if (typeof down === 'object') return down;
      continue;
    }
    // Refused for another reason: taken off, so the changes after it still go (item 32).
    const facts = await clashFactsInBackground({
      rows: await rowsOn(db, link.planId),
      change: queued(change),
      by: null,
    });
    await takeOff(db, link, change, { kind: 'refused', facts, code: result.code });
    return true;
  }
  return { kind: 'unreachable' };
}

/**
 * Takes a change off the queue without sending it, with what to tell the
 * person, if anything, and works the plan on this phone out again, so it
 * shows what the account has.
 */
async function takeOff(
  db: PrePennyDb,
  link: PlanLink,
  change: UnsentEdit,
  tell: {
    readonly kind: StoredClash['kind'];
    readonly facts: ClashFacts;
    readonly code?: string;
  } | null,
) {
  await db.transaction('rw', [db.unsent, db.clashes], async () => {
    await db.unsent.delete([change.planId, change.n]);
    if (tell === null) return;
    await db.clashes.put({
      id: change.editId,
      planId: change.planId,
      kind: tell.kind,
      facts: tell.facts,
      ...(tell.code === undefined ? {} : { code: tell.code }),
      ...(tell.kind === 'kept-theirs' ? putBackOf(change) : {}),
      at: Date.now(),
    });
  });
  await rebuild(db, link);
  if (tell !== null) clashesChanged();
}

// ---------------------------------------------------------------------------
// Looking at the account: the first copy, bringing a plan down, or asking
// which to keep. Done when someone signs in, and on every screen of a phone
// that's signed in: the welcome, setup and the app (D351).

export type Connection =
  /** The plan on this phone is the one kept in the account. */
  | { readonly kind: 'kept' }
  /** There's no plan in the account, and none on this phone with anything in it yet. */
  | { readonly kind: 'nothing-yet' }
  /** The account's plan has just come down to this phone: the screens start afresh with it. */
  | { readonly kind: 'brought-down' }
  /** This phone has a plan of its own and the account another: the person chooses (D324). */
  | {
      readonly kind: 'choose';
      readonly savedChangedAt: string;
      readonly phoneStartedAt: string | null;
      /** The plan on this phone has been set up to the end, not left part-way. */
      readonly phoneSetUp: boolean;
    }
  /** The server can't be reached now, or isn't ready for it: the plan stays on the phone and is tried again. */
  | { readonly kind: 'not-now' };

const KEPT: Connection = { kind: 'kept' };
const NOTHING_YET: Connection = { kind: 'nothing-yet' };
const BROUGHT_DOWN: Connection = { kind: 'brought-down' };
const NOT_NOW: Connection = { kind: 'not-now' };
/** Something changed while looking: look again. */
const AGAIN = Symbol('again');

/** The account's plan to choose against, and its rows, already brought down for the choice. */
let waitingChoice: { readonly planId: string; readonly rows: MirrorRow[] } | null = null;

/** A plan the person is in now, and whether it's theirs (D352: one of their own at most). */
interface InAccount {
  readonly id: string;
  readonly owned: boolean;
}

/** The plans the person is in now: their own first, then the newest. */
async function plansInAccount(client: SupabaseClient, person: string): Promise<InAccount[] | null> {
  try {
    const { data, error } = await client
      .from('plan_members')
      .select('plan_id, role, joined_at')
      .eq('person_id', person)
      .is('left_at', null);
    if (error !== null) return null;
    return [...(data as { plan_id: string; role: string; joined_at: string }[])]
      .sort(
        (a, b) =>
          Number(b.role === 'owner') - Number(a.role === 'owner') ||
          b.joined_at.localeCompare(a.joined_at),
      )
      .map((one) => ({ id: one.plan_id, owned: one.role === 'owner' }));
  } catch {
    return null;
  }
}

/** When the plan on this phone was started: the first thing put in it. */
function startedAt(records: Awaited<ReturnType<typeof loadRecords>>): string | null {
  const times = [
    ...records.balanceUpdates.map((one) => one.checkedAt),
    ...records.series.map((one) => one.familyCreatedAt),
    ...(records.budgets ?? []).map((one) => one.createdAt),
  ].sort();
  return times[0] ?? null;
}

/**
 * True when a plan on this phone has something in it. One with nothing yet,
 * as when "Make my plan" has just been tapped, is never asked about and
 * never sent: the saved plan comes down in its place (D324).
 */
async function hasSomething(db: PrePennyDb, planId: string): Promise<boolean> {
  const found = await db.records
    .where('planId')
    .equals(planId)
    .filter((record) => record.kind === 'account' || record.kind === 'series')
    .count();
  return found > 0;
}

const refusedWith = (failure: Failure, code: string) =>
  failure.kind === 'refused' && failure.code === code;

/**
 * Looks at the account and puts the plan on this phone and the one there
 * together (brief 4.13 "Try first", Part 10, D324, D351):
 * - Only a plan on the phone, with something in it: it goes up as the first copy.
 * - Only a plan in the account, or one on the phone with nothing in it yet: it comes down.
 * - The same plan in both: kept in step.
 * - A plan on the phone with something in it, finished or not, and another
 *   in the account: the person is asked which to keep. That includes an
 *   account with two plans of its own, from before the database refused a
 *   second (D352): the one on this phone against the other.
 * - The plan on this phone was removed from the account by another phone,
 *   which kept another (D324): that one comes down here too.
 */
async function lookAtAccount(client: SupabaseClient, person: string): Promise<Connection> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const found = await lookOnce(client, person);
    if (found !== AGAIN) return found;
  }
  return NOT_NOW;
}

async function lookOnce(
  client: SupabaseClient,
  person: string,
): Promise<Connection | typeof AGAIN> {
  return withDb(async (db) => {
    const own = await ownPlanOnPhone(db);
    // Another account's plan stays until it's removed from the sign-in page (D326).
    if (own?.owner !== undefined && own.owner !== person) return NOT_NOW;
    const inAccount = await plansInAccount(client, person);
    if (inAccount === null) return NOT_NOW;
    const link = own === undefined ? undefined : await db.links.get(own.id);

    if (own !== undefined && link !== undefined) {
      if (link.personId !== person) return NOT_NOW;
      if (!inAccount.some((one) => one.id === own.id)) {
        // Removed from the account on another phone, which kept another
        // plan: that one comes down in its place. With no plan there at
        // all, the other phone hasn't sent its own yet: wait for it.
        const kept = inAccount[0];
        if (kept === undefined) return NOT_NOW;
        const swapped = await bringDownInstead(client, db, kept.id, person, null, {
          id: own.id,
          onlyIfEmpty: false,
        });
        if (swapped === 'changed-here') return AGAIN;
        return swapped === 'done' ? BROUGHT_DOWN : NOT_NOW;
      }
      const other = inAccount.find((one) => one.owned && one.id !== own.id);
      if (other === undefined) return KEPT;
      return askToChoose(client, db, own, other.id);
    }

    const saved = inAccount[0];
    const ownHasSomething = own !== undefined && (await hasSomething(db, own.id));
    if (own !== undefined && inAccount.some((one) => one.id === own.id)) {
      // The same plan in both, from a phone that lost which plan it was for.
      await db.links.put({ planId: own.id, personId: person, shared: 0, mine: 0 });
      return AGAIN;
    }
    if (saved === undefined) {
      if (own === undefined || !ownHasSomething) return NOTHING_YET;
      const sent = await sendFirstCopy(client, db, own, person);
      // Another phone sent its plan a moment ago: look again, and ask.
      if (sent === 'has-a-plan') return AGAIN;
      return sent ? KEPT : NOT_NOW;
    }
    if (!ownHasSomething) {
      const swapped = await bringDownInstead(
        client,
        db,
        saved.id,
        person,
        null,
        own === undefined ? null : { id: own.id, onlyIfEmpty: true },
      );
      // Something was put in this phone's plan meanwhile: look again, and ask.
      if (swapped === 'changed-here') return AGAIN;
      return swapped === 'done' ? BROUGHT_DOWN : NOT_NOW;
    }
    return askToChoose(client, db, own, saved.id);
  });
}

/** Brings the account's plan down for the choice, and says what each plan is. */
async function askToChoose(
  client: SupabaseClient,
  db: PrePennyDb,
  own: StoredPlan,
  saved: string,
): Promise<Connection> {
  const answer = await rpc<PlanChanges>(
    client,
    'plan_changes',
    { plan: saved, shared_after: 0, mine_after: 0 },
    db,
  );
  if (!answer.ok) return NOT_NOW;
  const rows = rowsFrom(answer.data);
  waitingChoice = { planId: saved, rows };
  const changed = rows
    .map((row) => row.changedAt ?? '')
    .filter((time) => time !== '')
    .sort()
    .at(-1);
  return {
    kind: 'choose',
    savedChangedAt: changed ?? new Date().toISOString(),
    phoneStartedAt: startedAt(await loadRecords(db, own.id)),
    phoneSetUp: setupDone(own.setup),
  };
}

/**
 * After signing in, or from the sign-in page's "Choose which plan to keep":
 * looks at the account, then keeps the plan in step.
 */
export async function connectPlan(): Promise<Connection> {
  const client = await signedInClient();
  if (client === null) return NOT_NOW;
  const person = await personOf(client);
  if (person === null) return NOT_NOW;
  if (!(await actOn(await lookAtStanding(client), person))) return NOT_NOW;
  const found = await inTurn(() => lookAtAccount(client, person));
  accountLooked = found.kind !== 'not-now' && found.kind !== 'choose';
  if (found.kind === 'kept') await syncNow();
  return found;
}

/**
 * Sends the plan on this phone up as the account's first copy. "has-a-plan"
 * when the account already has a plan of its own, sent by another phone a
 * moment ago (D352).
 */
async function sendFirstCopy(
  client: SupabaseClient,
  db: PrePennyDb,
  own: StoredPlan,
  person: string,
): Promise<boolean | 'has-a-plan'> {
  const records = await loadRecords(db, own.id);
  const started = await rpc(client, 'start_plan', {
    plan: own.id,
    nation: records.settings?.nation ?? 'england-and-wales',
  });
  if (!started.ok) return refusedWith(started.failure, 'has-a-plan') ? 'has-a-plan' : false;
  // Kept first, so a change made while the first copy goes up joins the
  // queue, and marked as still going up until all of it has arrived: one
  // cut off part-way is sent again, from where it stopped, at the next look.
  await db.links.put({ planId: own.id, personId: person, shared: 0, mine: 0, sending: true });
  const link = await sendRest(client, db, own.id);
  if (!('planId' in link)) return true;
  await bringDown(client, db, link);
  await publish(db, own.id);
  startListening(client, link);
  return true;
}

/**
 * Sends what's left of a first copy that's still going up, if any, and gives
 * how the plan is kept now, or why it couldn't all be sent, with the screens told.
 */
async function sendRest(
  client: SupabaseClient,
  db: PrePennyDb,
  planId: string,
): Promise<PlanLink | Failure> {
  const link = await db.links.get(planId);
  if (link === undefined) return { kind: 'unreachable' };
  if (link.sending !== true) return link;
  const sent = await sendWhole(client, db, link);
  if (sent !== true) {
    await publish(db, planId, sent.kind === 'unreachable');
    return sent;
  }
  const { sending: _sent, ...done } = (await db.links.get(planId)) ?? link;
  await db.links.put(done);
  return done;
}

/**
 * Brings a plan in the account down to this phone, in place of the plan
 * here, if any, in one go: nothing is removed until the new plan has
 * arrived. With `onlyIfEmpty`, a plan here that has had something put in it
 * meanwhile is kept, and the person is asked instead.
 */
async function bringDownInstead(
  client: SupabaseClient,
  db: PrePennyDb,
  planId: string,
  person: string,
  rows: MirrorRow[] | null,
  instead: { readonly id: string; readonly onlyIfEmpty: boolean } | null,
): Promise<'done' | 'changed-here' | 'not-now'> {
  let all = rows;
  let nicknames: Record<string, string> | undefined;
  if (all === null) {
    const answer = await rpc<PlanChanges>(
      client,
      'plan_changes',
      { plan: planId, shared_after: 0, mine_after: 0 },
      db,
    );
    if (!answer.ok) return 'not-now';
    all = rowsFrom(answer.data);
    nicknames = nicknamesOf(answer.data);
  }
  let shared = 0;
  let mine = 0;
  for (const row of all) {
    if (row.table === 'plans') continue;
    if (row.privateTo === null) shared = Math.max(shared, row.seq);
    else mine = Math.max(mine, row.seq);
  }
  const link: PlanLink = {
    planId,
    personId: person,
    shared,
    mine,
    ...(nicknames === undefined ? {} : { nicknames }),
  };
  const arrived = all;
  const swapped = await db.transaction(
    'rw',
    [db.plans, db.records, db.rows, db.unsent, db.links, db.sent, db.clashes],
    async () => {
      // A plan started here meanwhile, as with "Make my plan" tapped while
      // this one was on its way: look again rather than keep two.
      if (((await ownPlanOnPhone(db))?.id ?? null) !== (instead?.id ?? null)) return false;
      if (instead !== null) {
        if (instead.onlyIfEmpty && (await hasSomething(db, instead.id))) return false;
        await removeFromPhone(db, instead.id);
      }
      await db.plans.put({
        id: planId,
        isExample: false,
        owner: person,
        setup: DONE,
        seen: { shared, mine },
      });
      await keepRows(db, planId, arrived);
      await db.links.put(link);
      return true;
    },
  );
  if (!swapped) return 'changed-here';
  await rebuild(db, link);
  await setShowing(db, 'own');
  await publish(db, planId);
  startListening(client, link);
  return 'done';
}

/** Removes one plan from this phone, and everything kept with it. */
async function removeFromPhone(db: PrePennyDb, planId: string) {
  await db.transaction(
    'rw',
    [db.plans, db.records, db.rows, db.unsent, db.links, db.sent, db.clashes],
    async () => {
      await db.records.where('planId').equals(planId).delete();
      await db.rows.where('planId').equals(planId).delete();
      await db.unsent.where('planId').equals(planId).delete();
      await db.sent.where('planId').equals(planId).delete();
      await db.clashes.where('planId').equals(planId).delete();
      await db.links.delete(planId);
      await db.plans.delete(planId);
    },
  );
}

/**
 * "Keep your saved plan": the plan on this phone is removed, from the
 * account too when it's there (D352), and the saved one comes down.
 */
export function keepSavedPlan(): Promise<boolean> {
  return inTurn(async () => {
    const client = await signedInClient();
    const choice = waitingChoice;
    if (client === null || choice === null) return false;
    const person = await personOf(client);
    if (person === null) return false;
    const kept = await withDb(async (db) => {
      const own = await ownPlanOnPhone(db);
      if (own !== undefined && (await db.links.get(own.id)) !== undefined) {
        const removed = await rpc(client, 'remove_plan', { plan: own.id });
        if (!removed.ok && !refusedWith(removed.failure, 'not-found')) return false;
      }
      const swapped = await bringDownInstead(
        client,
        db,
        choice.planId,
        person,
        choice.rows,
        own === undefined ? null : { id: own.id, onlyIfEmpty: false },
      );
      return swapped === 'done';
    });
    if (kept) {
      waitingChoice = null;
      // Looked at again on the next screen, in case the account had a third.
      accountLooked = false;
    }
    return kept;
  });
}

/** "Keep the plan on this phone": the saved plan is removed for good, and this one goes up, if it isn't there already. */
export function keepPhonePlan(): Promise<boolean> {
  return inTurn(async () => {
    const client = await signedInClient();
    const choice = waitingChoice;
    if (client === null || choice === null) return false;
    const person = await personOf(client);
    if (person === null) return false;
    const removed = await rpc(client, 'remove_plan', { plan: choice.planId });
    if (!removed.ok && !refusedWith(removed.failure, 'not-found')) return false;
    waitingChoice = null;
    accountLooked = false;
    // The saved plan is gone, so the choice is made, whether or not this
    // phone's plan can go up straight away: if not, it goes up at the next
    // look, and More says it hasn't been saved yet. Refused only when the
    // account still has another plan of its own, which the next screen asks about (D352).
    await withDb(async (db) => {
      const own = await ownPlanOnPhone(db);
      if (own === undefined || (await db.links.get(own.id)) !== undefined) return;
      await sendFirstCopy(client, db, own, person);
    });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Keeping it in step.

async function publish(db: PrePennyDb, planId: string | null, cantSend = false) {
  if (planId === null) {
    setState(NOTHING);
    return;
  }
  const link = await db.links.get(planId);
  // A first copy still going up isn't safely kept yet (D352).
  const kept = link !== undefined && link.sending !== true;
  const unsent = await db.unsent.where('planId').equals(planId).toArray();
  setState({ kept, unsent: unsent.length, cantSend });
}

/** Account work runs one task at a time, so two looks never both send a first copy. */
let chain: Promise<unknown> = Promise.resolve();

function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task, task);
  chain = next.catch(() => undefined);
  return next;
}

/**
 * Whether the account has been looked at since PrePenny opened. A phone
 * whose plan is kept there looks once, then keeps it in step; one that's
 * still to send its plan, or has none, looks every time (D351).
 */
let accountLooked = false;

let running: Promise<void> | null = null;
let again = false;
// Signing out waits for account work under way, so a send or a look that
// ends just after it can't write to the phone once it's cleared (D360).
finishBeforeSigningOut(async () => {
  await running;
  await chain;
});

/**
 * Looks at the account when it's due, sends what's queued, then brings down
 * what's new. Once at a time: asked again while it runs, it runs once more
 * straight after.
 */
export function syncNow(): Promise<void> {
  if (running !== null) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await inTurn(syncOnce);
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * What a look at the account found that the screen showing has to act on:
 * choosing which plan to keep, the account's plan brought down in place of
 * what was showing, or the second step of two-step sign-in (step 3e).
 */
export type AccountNews = 'choose' | 'brought-down' | 'second-step';

const newsListeners = new Set<(news: AccountNews) => void>();

/**
 * Calls back when a look at the account, made while PrePenny is open, finds
 * the person must choose which plan to keep (D324), or has brought the
 * account's plan down in place of what was showing.
 */
export function onAccountNews(listener: (news: AccountNews) => void): () => void {
  newsListeners.add(listener);
  return () => newsListeners.delete(listener);
}

function tell(news: AccountNews) {
  for (const listener of newsListeners) listener(news);
}

async function syncOnce(): Promise<void> {
  const client = await signedInClient();
  if (client === null) {
    // Signed out, a plan that was kept in an account, with changes here not
    // sent yet, stays on the phone (D348): More says how many, so the person
    // knows to sign in again to send them (step 3e).
    await withDb(async (db) => {
      const own = await ownPlanOnPhone(db);
      const link = own === undefined ? undefined : await db.links.get(own.id);
      await publish(db, link === undefined ? null : link.planId);
    }).catch(() => setState(NOTHING));
    return;
  }
  const person = await personOf(client);
  if (person === null) return;
  // Nothing is sent or brought down until the server says this phone's
  // sign-in stands and it's on the version expected (step 3e).
  if (!(await actOn(await lookAtStanding(client), person))) return;
  for (let pass = 0; pass < 2; pass += 1) {
    const due = !accountLooked || (await withDb(async (db) => !(await keptHere(db, person))));
    if (due) {
      const found = await lookAtAccount(client, person);
      if (found.kind === 'not-now') {
        await withDb(async (db) => {
          const own = await ownPlanOnPhone(db);
          if (own !== undefined && own.owner === person) await publish(db, own.id, true);
        });
        return;
      }
      if (found.kind === 'choose') {
        tell('choose');
        return;
      }
      accountLooked = true;
      if (found.kind === 'brought-down') {
        tell('brought-down');
        return;
      }
      if (found.kind === 'nothing-yet') {
        await withDb(async (db) => publish(db, (await ownPlanOnPhone(db))?.id ?? null));
        return;
      }
    }
    // The plan on this phone is no longer in the account: look again straight away.
    if (!(await keepInStepOnce(client, person))) return;
    accountLooked = false;
  }
}

/** True when the plan on this phone is kept in this person's account. */
async function keptHere(db: PrePennyDb, person: string): Promise<boolean> {
  const own = await ownPlanOnPhone(db);
  if (own === undefined) return false;
  return (await db.links.get(own.id))?.personId === person;
}

/**
 * Sends what's queued for the plan kept in the account, then brings down
 * what's new. True when the server says the plan isn't there any more.
 */
async function keepInStepOnce(client: SupabaseClient, person: string): Promise<boolean> {
  return withDb(async (db) => {
    const own = await ownPlanOnPhone(db);
    if (own === undefined) return false;
    const kept = await db.links.get(own.id);
    if (kept === undefined || kept.personId !== person) return false;
    const rest = await sendRest(client, db, own.id);
    // The plan itself not found means it has left the account.
    if (!('planId' in rest)) return refusedWith(rest, 'not-found');
    let link = rest;
    // Changes waiting to go are looked at against what's new first, so one
    // made on records another phone has changed since is seen as a clash
    // (step 3d). Only the plan itself not being found means it has left the account.
    if ((await db.unsent.where('planId').equals(own.id).count()) > 0) {
      const first = await bringDown(client, db, link);
      if (typeof first === 'object') {
        if (refusedWith(first, 'not-found')) return true;
        await publish(db, own.id, first.kind === 'unreachable');
        return false;
      }
      link = (await db.links.get(own.id)) ?? link;
    }
    const sent = await sendQueue(client, db, link);
    link = (await db.links.get(own.id)) ?? link;
    const down = await bringDown(client, db, link);
    if (typeof down === 'object' && refusedWith(down, 'not-found')) return true;
    const cantSend =
      (sent !== true && sent.kind === 'unreachable') ||
      (typeof down === 'object' && down.kind === 'unreachable');
    await publish(db, own.id, cantSend);
    startListening(client, link);
    return false;
  });
}

// The live nudges, and looking again now and then.

let listeningTo: string | null = null;
let soon: ReturnType<typeof setTimeout> | null = null;

/** Syncs in a moment: after a change, so several in a row go together, or after a nudge. */
export function syncSoon(): void {
  // A change has just joined the queue: More says so straight away (step 3d).
  void withDb(async (db) => {
    const own = await ownPlanOnPhone(db);
    if (own !== undefined && (await db.links.get(own.id)) !== undefined) {
      await publish(db, own.id, state.cantSend);
    }
  }).catch(() => {
    // No database: nothing is queued anyway.
  });
  if (soon !== null) clearTimeout(soon);
  soon = setTimeout(() => {
    soon = null;
    void syncNow();
  }, 300);
}

function startListening(client: SupabaseClient, link: PlanLink) {
  if (listeningTo === link.planId) return;
  listeningTo = link.planId;
  void (async () => {
    try {
      await client.realtime.setAuth();
      for (const topic of [`plan:${link.planId}`, `plan:${link.planId}:${link.personId}`]) {
        client
          .channel(topic, { config: { private: true } })
          .on('broadcast', { event: 'changed' }, () => {
            void lookForGetBackIn();
            syncSoon();
          })
          .subscribe();
      }
    } catch {
      // No live nudges: the phone still looks every minute and when it comes back on screen.
      listeningTo = null;
    }
  })();
}

/** How often an open PrePenny looks for changes, as well as the live nudges. */
const LOOK_EVERY_MS = 60_000;

/**
 * Starts keeping the plan in step while PrePenny is open on a signed-in
 * phone: now, when it comes back on screen or the signal returns, and every
 * minute while it's showing. Returns how to stop.
 */
export function keepInStep(): () => void {
  const look = () => {
    // Someone getting back in with the backup email: asked on its own, so
    // a look at the account under way, or a request of its that never got an
    // answer, can't hold the notice up (D404).
    void lookForGetBackIn();
    if (document.visibilityState === 'visible') void syncNow();
    // Not on screen, it still looks at its sign-in every minute, so one
    // ended on another phone removes the plan here within a minute (D21).
    else void inTurn(lookAtSignInOnly);
  };
  const timer = setInterval(look, LOOK_EVERY_MS);
  window.addEventListener('online', look);
  document.addEventListener('visibilitychange', look);
  void syncNow();
  return () => {
    clearInterval(timer);
    window.removeEventListener('online', look);
    document.removeEventListener('visibilitychange', look);
  };
}

/** True once nothing on this phone is waiting to be sent. */
export async function allSent(): Promise<boolean> {
  await syncNow();
  return withDb(async (db) => {
    const own = await ownPlanOnPhone(db);
    if (own === undefined) return true;
    const link = await db.links.get(own.id);
    if (link === undefined || link.sending === true) return false;
    return (await db.unsent.where('planId').equals(own.id).count()) === 0;
  });
}

/** The unsent changes' writes, for tests and the sign-out sheet. */
export type { RecordWrite };
