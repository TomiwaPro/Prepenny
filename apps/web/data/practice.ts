// What if's practice changes (brief 4.10, D135), kept on this phone until
// they're kept or thrown away, even after PrePenny is closed (step 2h). Each
// plan has its own: the example's are never the person's own plan's. They're
// kept in memory while PrePenny is open, so going to another screen and back
// is instant, and in the phone's own database for the next time it opens.
// They never leave the phone (ARCHITECTURE.md 3.8), and nothing here writes
// an amount, a name or a note anywhere else (CLAUDE.md).

import type { EditCommand } from '@prepenny/engine';
import { openDb } from './db.ts';

/** One practice change: the commands one sheet made, and the words it would show in the undo bar. */
export interface PracticeChange {
  readonly commands: readonly EditCommand[];
  readonly message: string;
}

/** Saves on the phone one after another, so a later list never lands before an earlier one. */
let saving: Promise<void> = Promise.resolve();

let memory: { readonly planId: string; readonly changes: readonly PracticeChange[] } | null = null;

const keyOf = (planId: string) => `what-if|${planId}`;

/** A stored list, checked before it's trusted: anything else counts as none. */
function practiceFrom(value: unknown): readonly PracticeChange[] {
  if (!Array.isArray(value)) return [];
  const changes: PracticeChange[] = [];
  for (const one of value) {
    if (typeof one !== 'object' || one === null) return [];
    const { commands, message } = one as { commands?: unknown; message?: unknown };
    if (!Array.isArray(commands) || commands.length === 0 || typeof message !== 'string') {
      return [];
    }
    if (!commands.every((command) => typeof command === 'object' && command !== null)) return [];
    changes.push({ commands: commands as EditCommand[], message });
  }
  return changes;
}

/** The practice changes kept in memory for this plan, or null when none have been read yet. */
export function practiceInMemory(planId: string): readonly PracticeChange[] | null {
  return memory?.planId === planId ? memory.changes : null;
}

/** The plan's practice changes: from memory, or from the phone's database. */
export async function loadPractice(planId: string): Promise<readonly PracticeChange[]> {
  const known = practiceInMemory(planId);
  if (known !== null) return known;
  let changes: readonly PracticeChange[] = [];
  // A list still being saved is read once it's there.
  await saving;
  try {
    const db = openDb();
    try {
      changes = practiceFrom((await db.device.get(keyOf(planId)))?.value);
    } finally {
      db.close();
    }
  } catch {
    // No database on this phone, as in some private windows: nothing was kept.
  }
  if (practiceInMemory(planId) === null) memory = { planId, changes };
  return practiceInMemory(planId) ?? changes;
}

async function saveOnPhone(planId: string, changes: readonly PracticeChange[]): Promise<void> {
  try {
    const db = openDb();
    try {
      if (changes.length === 0) await db.device.delete(keyOf(planId));
      else await db.device.put({ key: keyOf(planId), value: changes });
    } finally {
      db.close();
    }
  } catch {
    // They still last while PrePenny is open.
  }
}

/** Keeps the plan's practice changes, in memory at once and on the phone straight after. */
export function keepPractice(planId: string, changes: readonly PracticeChange[]): Promise<void> {
  memory = { planId, changes };
  saving = saving.then(() => saveOnPhone(planId, changes));
  return saving;
}

/** Forgets a plan's practice changes, as when the example starts again (D182). */
export function forgetPractice(planId: string): Promise<void> {
  return keepPractice(planId, []);
}
