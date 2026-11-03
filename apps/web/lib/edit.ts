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
