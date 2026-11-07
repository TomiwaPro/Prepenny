// The sync's work for the background worker (step 3c): what to send for a
// change or a whole plan, and the plan from the server's rows. It's here,
// not on the screen's side, because it works out payment numbers with the
// engine (PLAN.md item 4), and a big plan has thousands of rows.

import { applyWrites, type RecordWrite } from '@prepenny/engine';
import type { SyncWritesAsk } from '../worker/messages.ts';
import {
  type DbWrite,
  type FromRows,
  type MirrorRow,
  recordsFromRows,
  writesFor,
  writesForEdit,
} from './sync-rows.ts';

export function syncWrites(ask: Omit<SyncWritesAsk, 'kind'>): readonly DbWrite[] {
  if (ask.records !== undefined) return writesFor(ask.records, ask.plan, ask.rows, ask.setup);
  return writesForEdit(ask.rows, ask.writes ?? [], ask.plan, ask.setup).writes;
}

export function syncRecords(
  rows: readonly MirrorRow[],
  unsent: readonly (readonly RecordWrite[])[],
): FromRows {
  const server = recordsFromRows(rows);
  let records = server.records;
  for (const writes of unsent) records = applyWrites(records, writes);
  return { records, setup: server.setup };
}
