'use client';

// The "?" beside Coming up's "Not ticked yet" (step 4h, D596): why a
// payment from before today still counts, in this account's own figures.
// Every sentence is the balance rule (brief 5.5): a payment dated on or
// before the balance check that's ticked is inside the bank's figure;
// one that isn't ticked is counted on top of it; and one from before today
// that isn't ticked stays under "Not ticked yet" (D11).

import { useState } from 'react';
import type { AccountView } from '../lib/plan-view.ts';
import { notTickedWhy } from '../lib/why.ts';
import { WhyButton, WhySheet } from './Why.tsx';

export function NotTickedWhy({
  account,
  today,
}: {
  readonly account: AccountView;
  readonly today: string;
}) {
  const [open, setOpen] = useState(false);
  const sheet = notTickedWhy(account, today);
  return (
    <>
      <WhyButton title={sheet.title} testId="not-ticked-why" onOpen={() => setOpen(true)} />
      <WhySheet open={open} {...sheet} onClose={() => setOpen(false)} />
    </>
  );
}
