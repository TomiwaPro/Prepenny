'use client';

// On Home, once, when a newer bank holiday list moved a payment (step 4c,
// D539, the owner's answer to PLAN.md question 4): "A new bank holiday on
// Mon 8 May 2028 moved Rent to Fri 5 May 2028.", with "Got it". It sits
// under the lowest point, as the example's banner does, so a 320 by 568
// phone still shows the account and the lowest point first (D442, D451).

import { useEffect, useState } from 'react';
import {
  dismissHolidayNote,
  holidayNoteFor,
  type HolidayNote as Note,
} from '../data/bank-holidays.ts';
import { openDb } from '../data/db.ts';
import { formatDay } from '../lib/dates.ts';
import { strings } from '../strings/en-GB.ts';
import styles from './Notes.module.css';
import { usePlan } from './PlanProvider.tsx';

const t = strings.home;

/** How many moved payments the note lists before "And 2 more." */
const LISTED = 3;

export function HolidayNote({ today }: { readonly today: string }) {
  const state = usePlan();
  const planId = state.plan !== null && !state.plan.isExample ? state.plan.id : null;
  const version = state.status === 'ready' ? state.version : 0;
  const [note, setNote] = useState<Note | null>(null);
  // Read again whenever the plan changes: a newer list can arrive from this
  // phone or, in an account, from the other one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the reason to look again
  useEffect(() => {
    if (planId === null) {
      setNote(null);
      return;
    }
    let current = true;
    (async () => {
      try {
        const db = openDb();
        try {
          const found = await holidayNoteFor(db, planId);
          if (current) setNote(found);
        } finally {
          db.close();
        }
      } catch {
        // No database: no note.
      }
    })();
    return () => {
      current = false;
    };
  }, [planId, version]);

  if (note === null) return null;
  const day = (date: string) => formatDay(date, today);
  const [first] = note.moves;
  if (first === undefined) return null;
  const holidays = new Set(note.moves.map((move) => move.holiday));
  const listed = note.moves.slice(0, LISTED);
  const more = note.moves.length - listed.length;
  return (
    <div
      className={`${styles.note} ${styles.offline} ${styles.withButton}`}
      role="status"
      data-testid="holiday-note"
    >
      {note.moves.length === 1 ? (
        <p>{t.holidayMovedOne(day(first.holiday), first.name, day(first.to))}</p>
      ) : (
        <div className={styles.moves}>
          <p>
            {holidays.size === 1
              ? t.holidayMovedSome(day(first.holiday), note.moves.length)
              : t.holidaysMovedSome(note.moves.length)}
          </p>
          <ul>
            {listed.map((move) => (
              <li key={`${move.seriesId} ${move.originalDate}`}>
                {holidays.size === 1
                  ? t.holidayMovedTo(move.name, day(move.to))
                  : t.holidayMovedFromTo(move.name, day(move.holiday), day(move.to))}
              </li>
            ))}
          </ul>
          {more > 0 ? <p>{t.holidayMovedMore(more)}</p> : null}
        </div>
      )}
      <button
        type="button"
        className={styles.leave}
        onClick={async () => {
          // Gone from the phone first, so PrePenny closed straight after never brings it back.
          try {
            const db = openDb();
            try {
              await dismissHolidayNote(db);
            } finally {
              db.close();
            }
          } catch {
            // No database: it was never kept.
          }
          setNote(null);
        }}
      >
        {t.holidayGotIt}
      </button>
    </div>
  );
}
