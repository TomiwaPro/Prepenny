'use client';

// The four actions on Home (brief 4.9, DESIGN.md): a 2 by 2 grid, one navy
// main button (Update balance) and the others outlined. Until their steps are
// built, each opens a sheet that says so.

import { useState } from 'react';
import { strings } from '../strings/en-GB.ts';
import styles from './Actions.module.css';
import { Sheet } from './Sheet.tsx';

const actions = [
  { id: 'update-balance', label: strings.actions.updateBalance, main: true },
  { id: 'add-payment', label: strings.actions.addPayment, main: false },
  { id: 'spent', label: strings.actions.spent, main: false },
  { id: 'overtime', label: strings.actions.overtime, main: false },
] as const;

type ActionId = (typeof actions)[number]['id'];

export function Actions() {
  const [open, setOpen] = useState<ActionId | null>(null);
  const action = actions.find((one) => one.id === open);
  return (
    <section className={styles.actions} aria-label={strings.actions.label}>
      <div className={styles.grid}>
        {actions.map((one) => (
          <button
            key={one.id}
            type="button"
            className={`${styles.button} ${one.main ? styles.main : styles.outlined}`}
            onClick={() => setOpen(one.id)}
          >
            {one.label}
          </button>
        ))}
      </div>
      <Sheet open={action !== undefined} title={action?.label ?? ''} onClose={() => setOpen(null)}>
        <p>{strings.sheet.stillBeingBuilt}</p>
      </Sheet>
    </section>
  );
}
