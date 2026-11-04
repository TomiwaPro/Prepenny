'use client';

// Every part from DESIGN.md on one page, filled in with the example plan's own
// figures, so the look can be checked before more screens are built. Not
// linked from the app.

import { applyWrites, editPlan } from '@prepenny/engine';
import { useMemo, useState } from 'react';
import { examplePlan } from '../data/example-plan.ts';
import { formatDay } from '../lib/dates.ts';
import { englandAndWales } from '../lib/holidays.ts';
import { workOutHome } from '../lib/home.ts';
import { formatMoney } from '../lib/money.ts';
import { EXAMPLE_TODAY } from '../lib/today.ts';
import { strings } from '../strings/en-GB.ts';
import { FigureCard } from './FigureCard.tsx';
import { HomeSkeleton } from './HomeSkeleton.tsx';
import { ExampleBanner, OfflineMessage } from './Notes.tsx';
import styles from './PartsScreen.module.css';
import { Sheet } from './Sheet.tsx';
import { SimplePage } from './SimplePage.tsx';
import { StatusPill } from './StatusPill.tsx';
import { UndoBar } from './UndoBar.tsx';

/** D69's case: the Fri 30 Oct pay £100.00 lower leaves Sam £95.47 short on Sun 1 Nov. */
function shortExample() {
  const edit = editPlan(
    { ...examplePlan, mainPayFamilyId: 'pay', holidays: englandAndWales(), today: EXAMPLE_TODAY },
    {
      kind: 'just-this-one',
      seriesId: 'pay',
      originalDate: '2026-10-30',
      edits: { amount: 50306 },
    },
  );
  return workOutHome(applyWrites(examplePlan, edit.writes), EXAMPLE_TODAY);
}

export function PartsScreen() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const short = useMemo(shortExample, []);
  const day = (date: string) => formatDay(date, EXAMPLE_TODAY);
  return (
    <SimplePage heading={strings.parts.heading} purpose={strings.parts.intro}>
      <p className={styles.caption}>
        {strings.parts.whenShort(formatMoney(10000), day('2026-10-30'))}
      </p>
      <FigureCard
        label={strings.home.lowestPointAhead}
        status={short.lowest.status === 'ok' ? null : short.lowest.status}
        figure={formatMoney(short.lowest.balance)}
        detail={strings.home.lowestOnAfter(day(short.lowest.date), short.lowest.after ?? '')}
        context={
          short.lowest.short === null
            ? null
            : strings.home.shortOn(
                formatMoney(short.lowest.short.amount),
                day(short.lowest.short.date),
              )
        }
      />
      <div className={styles.pills}>
        <StatusPill status="tight" />
        <StatusPill status="short" />
      </div>
      <p className={styles.caption}>{strings.parts.messages}</p>
      <ExampleBanner />
      <OfflineMessage />
      <UndoBar placement="inline" message={strings.parts.undoMessage} onUndo={() => undefined} />
      <button type="button" className={styles.open} onClick={() => setSheetOpen(true)}>
        {strings.parts.openSheet}
      </button>
      <Sheet open={sheetOpen} title={strings.parts.sheetTitle} onClose={() => setSheetOpen(false)}>
        <p>{strings.sheet.stillBeingBuilt}</p>
      </Sheet>
      <p className={styles.caption}>{strings.parts.loading}</p>
      <HomeSkeleton />
    </SimplePage>
  );
}
