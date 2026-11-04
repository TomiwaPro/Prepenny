// Makes one change with the engine (brief 5.4, D87): the stored records and
// one command go in; the edit (the records to save, and the undo) and the
// records after it come out. Runs in the background worker. The engine
// refuses what it can't do with a code, never with words for the screen.

import {
  applyWrites,
  type Edit,
  type EditCommand,
  editPlan,
  type PlanRecords,
  type RecordWrite,
  sameValue,
} from '@prepenny/engine';
import { editInputOf } from './plan-input.ts';

export interface EditResult {
  readonly edit: Edit;
  /** The records once the edit is saved. */
  readonly records: PlanRecords;
}

export function runEdit(records: PlanRecords, today: string, command: EditCommand): EditResult {
  const edit = editPlan(editInputOf(records, today), command);
  return { edit, records: applyWrites(records, edit.writes) };
}

/** Which record a write is about, so two writes to the same record can be told apart. */
export function recordKey(write: RecordWrite): string {
  switch (write.kind) {
    case 'settings':
      return 'settings';
    case 'change':
      return `change|${write.seriesId}|${write.originalDate}`;
    case 'tick':
      return `tick|${write.seriesId}|${write.originalDate}${write.setAside === true ? '|set-aside' : ''}`;
    default:
      return `${write.kind}|${write.id}`;
  }
}

/**
 * Several commands made one after another, each on the records the one
 * before left, as one edit (step 2e): for each record, how it was before the
 * first and how it is after the last, as What if's Keep does (D135). So one
 * undo takes all of them back (D87). A record that ends as it started isn't
 * in it.
 */
export function runEdits(
  records: PlanRecords,
  today: string,
  commands: readonly EditCommand[],
): EditResult {
  let now = records;
  const order: string[] = [];
  const first = new Map<string, RecordWrite>();
  const last = new Map<string, RecordWrite>();
  for (const command of commands) {
    const edit = editPlan(editInputOf(now, today), command);
    edit.writes.forEach((write, index) => {
      const key = recordKey(write);
      if (!first.has(key)) {
        const before = edit.undo[index];
        if (before === undefined) throw new Error('An edit has no undo for one of its writes.');
        first.set(key, before);
        order.push(key);
      }
      last.set(key, write);
    });
    now = applyWrites(now, edit.writes);
  }
  const writes: RecordWrite[] = [];
  const undo: RecordWrite[] = [];
  for (const key of order) {
    const after = last.get(key);
    const before = first.get(key);
    if (after === undefined || before === undefined) continue;
    if (sameValue(after.value, before.value)) continue;
    writes.push(after);
    undo.push(before);
  }
  return { edit: { writes, undo }, records: now };
}
