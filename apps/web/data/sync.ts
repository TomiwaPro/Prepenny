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
// - A change the server refuses stays queued, and nothing after it is sent:
//   what the phone does then is step 3d.
// - Only a phone that's signed in sends anything; the example plan is never
//   sent (D182). Nothing here writes an amount, a name, a note or an email
//   address to the console or anywhere else (CLAUDE.md).

import type { RecordWrite } from '@prepenny/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { signedInClient } from '../lib/account.ts';
import { newId, timeNow } from '../lib/ids.ts';
import type { SetupProgress } from '../lib/setup-progress.ts';
import {
  type DbWrite,
  type MirrorRow,
  mirrorRowOf,
  savedRows,
  type Table,
} from '../lib/sync-rows.ts';
import { syncRecordsInBackground, syncWritesInBackground } from '../worker/client.ts';
import {
  loadRecords,
  openDb,
  ownPlanOnPhone,
  type PlanLink,
  type PrePennyDb,
  type StoredPlan,
  type StoredRow,
  savePlan,
  setShowing,
} from './db.ts';

// ---------------------------------------------------------------------------
// What the screens show.

export interface SyncState {
  /** The person's own plan on this phone is kept in their account. */
  readonly kept: boolean;
  /** Changes made on this phone that haven't been sent yet. */
  readonly unsent: number;
  /** The last try to send didn't reach the server, or the server couldn't take it. */
  readonly cantSend: boolean;
  /** The server refused a change, so it and the ones after it wait (step 3d). */
  readonly refused: boolean;
}

const NOTHING: SyncState = { kept: false, unsent: 0, cantSend: false, refused: false };
let state: SyncState = NOTHING;
const stateListeners = new Set<() => void>();

function setState(next: SyncState) {
  if (
    next.kept === state.kept &&
    next.unsent === state.unsent &&
    next.cantSend === state.cantSend &&
    next.refused === state.refused
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
]);

function failureOf(error: { code?: unknown; message?: unknown } | null): Failure {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (REFUSALS.has(message)) return { kind: 'refused', code: message };
  // The privacy rules' own refusal (D290): not theirs to change.
  if (error?.code === '42501') return { kind: 'refused', code: 'not-found' };
  // A server whose database hasn't had step 3c yet, a weak signal, or none.
  return { kind: 'unreachable' };
}

async function rpc<T>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; failure: Failure }> {
  try {
    const { data, error } = await client.rpc(name, args);
    if (error !== null) return { ok: false, failure: failureOf(error) };
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
  readonly rows: readonly { readonly table: Table; readonly row: Record<string, unknown> }[];
}

/** The server's rows as this phone keeps them, from what plan_changes gave back. */
function rowsFrom(changes: PlanChanges): MirrorRow[] {
  return [
    mirrorRowOf('plans', changes.plan),
    ...changes.rows.map(({ table, row }) => mirrorRowOf(table, row)),
  ];
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
const DONE: SetupProgress = { step: 'done', items: [], answers: {} };

/** Brings down what's new on the server, and says whether anything was. */
async function bringDown(
  client: SupabaseClient,
  db: PrePennyDb,
  link: PlanLink,
): Promise<boolean | Failure> {
  const answer = await rpc<PlanChanges>(client, 'plan_changes', {
    plan: link.planId,
    shared_after: link.shared,
    mine_after: link.mine,
  });
  if (!answer.ok) return answer.failure;
  const rows = rowsFrom(answer.data);
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
  await db.links.put({ ...link, shared, mine });
  if (changed.length === 0) return false;
  await rebuild(db, { ...link, shared, mine });
  return true;
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
      const result = await saveOnServer(client, db, link, newId(), timeNow(), 'first-copy', chunk);
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
): Promise<true | Failure> {
  if (writes.length === 0) return true;
  const answer = await rpc<{ rows: Parameters<typeof savedRows>[1] }>(client, 'save_edit', {
    plan: link.planId,
    edit: editId,
    made_at: madeAt,
    kind,
    writes,
  });
  if (!answer.ok) return answer.failure;
  const before = await rowsOn(db, link.planId);
  await keepRows(db, link.planId, savedRows(writes, answer.data.rows, before));
  return true;
}

/** Sends every change in the queue, one at a time, in the order made. */
async function sendQueue(
  client: SupabaseClient,
  db: PrePennyDb,
  link: PlanLink,
): Promise<true | Failure> {
  for (;;) {
    const next = await db.unsent.where('planId').equals(link.planId).first();
    if (next === undefined) return true;
    if (next.refused !== undefined) return { kind: 'refused', code: next.refused };
    const rows = await rowsOn(db, link.planId);
    const writes = await syncWritesInBackground({
      plan: { planId: link.planId, personId: link.personId },
      rows,
      writes: next.writes,
      ...(next.setup === undefined ? {} : { setup: next.setup }),
    });
    const result = await saveOnServer(
      client,
      db,
      link,
      next.editId,
      next.madeAt,
      next.kind,
      writes,
    );
    if (result !== true) {
      if (result.kind === 'refused') await db.unsent.put({ ...next, refused: result.code });
      return result;
    }
    await db.unsent.delete([next.planId, next.n]);
  }
}

// ---------------------------------------------------------------------------
// Signing in: the first copy, bringing a plan down, or asking which to keep.

export type Connection =
  /** The plan on this phone is the one kept in the account. */
  | { readonly kind: 'kept' }
  /** There's no plan on this phone or in the account yet. */
  | { readonly kind: 'nothing-yet' }
  /** This phone has a plan of its own and the account has another: the person chooses. */
  | {
      readonly kind: 'choose';
      readonly savedChangedAt: string;
      readonly phoneStartedAt: string | null;
    }
  /** The server can't be reached now, or isn't ready for it: the plan stays on the phone and is tried again. */
  | { readonly kind: 'not-now' };

/** The account's plan, and the rows already brought down for the choice. */
let waitingChoice: { readonly planId: string; readonly rows: MirrorRow[] } | null = null;

/** The plans the person is in now: their own first, then the newest. */
async function plansInAccount(client: SupabaseClient, person: string): Promise<string[] | null> {
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
      .map((one) => one.plan_id);
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
 * After signing in, or when PrePenny opens signed in: puts the plan on this
 * phone and the one in the account together (brief 4.13 "Try first", Part 10).
 * - Only a plan on the phone: it goes up as the first copy.
 * - Only a plan in the account: it comes down.
 * - The same plan in both: what's different is sent.
 * - A plan of its own in each: the person is asked which to keep (D324).
 */
export async function connectPlan(): Promise<Connection> {
  const client = await signedInClient();
  if (client === null) return { kind: 'not-now' };
  const person = await personOf(client);
  if (person === null) return { kind: 'not-now' };
  return withDb(async (db) => {
    const own = await ownPlanOnPhone(db);
    if (own?.owner !== undefined && own.owner !== person) return { kind: 'not-now' };
    if (own !== undefined && (await db.links.get(own.id)) !== undefined) {
      await syncNow();
      return { kind: 'kept' };
    }
    const inAccount = await plansInAccount(client, person);
    if (inAccount === null) return { kind: 'not-now' };
    const saved = inAccount[0];
    const records = own === undefined ? null : await loadRecords(db, own.id);
    const hasOwn = records !== null && (records.accounts.length > 0 || records.series.length > 0);
    if (saved === undefined) {
      if (own === undefined) return { kind: 'nothing-yet' };
      return (await sendFirstCopy(client, db, own, person))
        ? { kind: 'kept' }
        : { kind: 'not-now' };
    }
    if (own !== undefined && own.id === saved) {
      await db.links.put({ planId: own.id, personId: person, shared: 0, mine: 0 });
      await syncNow();
      return { kind: 'kept' };
    }
    if (!hasOwn) {
      if (own !== undefined) await removeFromPhone(db, own.id);
      return (await bringDownNew(client, db, saved, person, null))
        ? { kind: 'kept' }
        : { kind: 'not-now' };
    }
    const answer = await rpc<PlanChanges>(client, 'plan_changes', {
      plan: saved,
      shared_after: 0,
      mine_after: 0,
    });
    if (!answer.ok) return { kind: 'not-now' };
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
      phoneStartedAt: records === null ? null : startedAt(records),
    };
  });
}

async function sendFirstCopy(
  client: SupabaseClient,
  db: PrePennyDb,
  own: StoredPlan,
  person: string,
): Promise<boolean> {
  const records = await loadRecords(db, own.id);
  const started = await rpc(client, 'start_plan', {
    plan: own.id,
    nation: records.settings?.nation ?? 'england-and-wales',
  });
  if (!started.ok) return false;
  const link: PlanLink = { planId: own.id, personId: person, shared: 0, mine: 0 };
  // Kept first, so a change made while the first copy goes up joins the queue.
  await db.links.put(link);
  const sent = await sendWhole(client, db, link);
  if (sent !== true) {
    setState({
      ...state,
      kept: true,
      cantSend: sent.kind === 'unreachable',
      refused: sent.kind === 'refused',
    });
    return true;
  }
  await bringDown(client, db, link);
  await publish(db, own.id);
  startListening(client, link);
  return true;
}

async function bringDownNew(
  client: SupabaseClient,
  db: PrePennyDb,
  planId: string,
  person: string,
  rows: MirrorRow[] | null,
): Promise<boolean> {
  const link: PlanLink = { planId, personId: person, shared: 0, mine: 0 };
  let all = rows;
  if (all === null) {
    const answer = await rpc<PlanChanges>(client, 'plan_changes', {
      plan: planId,
      shared_after: 0,
      mine_after: 0,
    });
    if (!answer.ok) return false;
    all = rowsFrom(answer.data);
  }
  let shared = 0;
  let mine = 0;
  for (const row of all) {
    if (row.table === 'plans') continue;
    if (row.privateTo === null) shared = Math.max(shared, row.seq);
    else mine = Math.max(mine, row.seq);
  }
  await db.plans.put({ id: planId, isExample: false, owner: person, setup: DONE });
  await keepRows(db, planId, all);
  const kept = { ...link, shared, mine };
  await db.links.put(kept);
  await rebuild(db, kept);
  await setShowing(db, 'own');
  await publish(db, planId);
  startListening(client, kept);
  return true;
}

/** Removes one plan from this phone, and everything kept with it. */
async function removeFromPhone(db: PrePennyDb, planId: string) {
  await db.transaction('rw', [db.plans, db.records, db.rows, db.unsent, db.links], async () => {
    await db.records.where('planId').equals(planId).delete();
    await db.rows.where('planId').equals(planId).delete();
    await db.unsent.where('planId').equals(planId).delete();
    await db.links.delete(planId);
    await db.plans.delete(planId);
  });
}

/** "Keep your saved plan": the plan on this phone is removed, and the saved one comes down. */
export async function keepSavedPlan(): Promise<boolean> {
  const client = await signedInClient();
  const choice = waitingChoice;
  if (client === null || choice === null) return false;
  const person = await personOf(client);
  if (person === null) return false;
  return withDb(async (db) => {
    const own = await ownPlanOnPhone(db);
    if (own !== undefined) await removeFromPhone(db, own.id);
    waitingChoice = null;
    return bringDownNew(client, db, choice.planId, person, choice.rows);
  });
}

/** "Keep the plan on this phone": the saved plan is removed for good, and this one goes up. */
export async function keepPhonePlan(): Promise<boolean> {
  const client = await signedInClient();
  const choice = waitingChoice;
  if (client === null || choice === null) return false;
  const person = await personOf(client);
  if (person === null) return false;
  const removed = await rpc(client, 'remove_plan', { plan: choice.planId });
  if (!removed.ok) return false;
  waitingChoice = null;
  return withDb(async (db) => {
    const own = await ownPlanOnPhone(db);
    if (own === undefined) return false;
    return sendFirstCopy(client, db, own, person);
  });
}

// ---------------------------------------------------------------------------
// Keeping it in step.

async function publish(db: PrePennyDb, planId: string | null, cantSend = false) {
  if (planId === null) {
    setState(NOTHING);
    return;
  }
  const kept = (await db.links.get(planId)) !== undefined;
  const unsent = await db.unsent.where('planId').equals(planId).toArray();
  setState({
    kept,
    unsent: unsent.length,
    cantSend,
    refused: unsent.some((one) => one.refused !== undefined),
  });
}

let running: Promise<void> | null = null;
let again = false;

/**
 * Sends what's queued, then brings down what's new. Once at a time: asked
 * again while it runs, it runs once more straight after.
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
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce(): Promise<void> {
  const client = await signedInClient();
  if (client === null) {
    setState(NOTHING);
    return;
  }
  const person = await personOf(client);
  if (person === null) return;
  await withDb(async (db) => {
    const own = await ownPlanOnPhone(db);
    if (own === undefined) {
      await publish(db, null);
      return;
    }
    let link = await db.links.get(own.id);
    if (link === undefined) {
      // A plan made on this phone after signing in, or a first copy that
      // couldn't go up before: it goes up now. One that would need asking
      // which to keep is asked on the sign-in page (choose()).
      if (own.owner !== undefined && own.owner !== person) return;
      const inAccount = await plansInAccount(client, person);
      if (inAccount === null) {
        await publish(db, own.id, true);
        return;
      }
      if (inAccount.length > 0 && !inAccount.includes(own.id)) {
        chooseListener?.();
        return;
      }
      if (!(await sendFirstCopy(client, db, own, person))) await publish(db, own.id, true);
      return;
    }
    if (link.personId !== person) return;
    const sent = await sendQueue(client, db, link);
    link = (await db.links.get(own.id)) ?? link;
    const down = await bringDown(client, db, link);
    const cantSend =
      (sent !== true && sent.kind === 'unreachable') ||
      (typeof down === 'object' && down.kind === 'unreachable');
    await publish(db, own.id, cantSend);
    startListening(client, link);
  });
}

let chooseListener: (() => void) | null = null;

/** Called when this phone has a plan of its own and the account another, found while PrePenny was open. */
export function onNeedToChoose(listener: () => void): () => void {
  chooseListener = listener;
  return () => {
    if (chooseListener === listener) chooseListener = null;
  };
}

// The live nudges, and looking again now and then.

let listeningTo: string | null = null;
let soon: ReturnType<typeof setTimeout> | null = null;

/** Syncs in a moment: after a change, so several in a row go together, or after a nudge. */
export function syncSoon(): void {
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
          .on('broadcast', { event: 'changed' }, () => syncSoon())
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
    if (document.visibilityState === 'visible') void syncNow();
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
    if ((await db.links.get(own.id)) === undefined) return false;
    return (await db.unsent.where('planId').equals(own.id).count()) === 0;
  });
}

/** The unsent changes' writes, for tests and the sign-out sheet. */
export type { RecordWrite };
