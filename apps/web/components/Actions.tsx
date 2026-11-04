'use client';

// The four actions on Home (brief 4.9, DESIGN.md): a 2 by 2 grid, one navy
// main button (Update balance) and the others outlined. Each opens its own
// bottom sheet (brief 4.2, 4.3, 4.5): every change saves at once, updates
// the plan and shows the undo bar. Closing a sheet puts focus back on its
// button.

import { useState } from 'react';
import { strings } from '../strings/en-GB.ts';
import styles from './Actions.module.css';
import { AddPaymentSheet } from './AddPaymentSheet.tsx';
import { OvertimeSheet } from './OvertimeSheet.tsx';
import { SpentSheet } from './SpentSheet.tsx';
import { UpdateBalanceSheet } from './UpdateBalanceSheet.tsx';

const actions = [
  { id: 'update-balance', label: strings.actions.updateBalance, main: true },
  { id: 'add-payment', label: strings.actions.addPayment, main: false },
  { id: 'spent', label: strings.actions.spent, main: false },
  { id: 'overtime', label: strings.actions.overtime, main: false },
] as const;

type ActionId = (typeof actions)[number]['id'];

export function Actions() {
  const [open, setOpen] = useState<ActionId | null>(null);
  const close = () => setOpen(null);
  return (
    <section className={styles.actions} aria-label={strings.actions.label}>
      <div className={styles.grid}>
        {actions.map((one) => (
          <button
            key={one.id}
            type="button"
            className={`${styles.button} ${one.main ? styles.main : styles.outlined}`}
            aria-haspopup="dialog"
            onClick={() => setOpen(one.id)}
          >
            {one.label}
          </button>
        ))}
      </div>
      <UpdateBalanceSheet open={open === 'update-balance'} onClose={close} />
      <AddPaymentSheet open={open === 'add-payment'} onClose={close} />
      <SpentSheet open={open === 'spent'} onClose={close} />
      <OvertimeSheet open={open === 'overtime'} onClose={close} />
    </section>
  );
}
