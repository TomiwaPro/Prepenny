'use client';

// "Finish joining" on every screen of the app (step 3f-2, D426): someone let
// into a plan whose own plan is still to come, as when they closed the join
// page before it was allowed. It opens the join page for that invite, which
// brings their plan in, so the move happens on a page with nothing else
// changing. Shown from what the server says every minute (data/joining.ts).

import Link from 'next/link';
import { useJoining } from '../data/joining.ts';
import { finishJoiningLink } from '../lib/sharing.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import styles from './GetBackInNotice.module.css';

const t = strings.joining;

export function FinishJoining() {
  const joining = useJoining();
  const first = joining[0];
  if (first === undefined) return null;
  const name = first.inviter === '' ? strings.join.someone : first.inviter;
  return (
    <section
      className={styles.notice}
      aria-labelledby="finish-joining-heading"
      data-testid="finish-joining"
    >
      <h2 id="finish-joining-heading" className={styles.heading}>
        {t.heading(name)}
      </h2>
      <p>{t.line}</p>
      <Link className={formStyles.main} href={finishJoiningLink(first.invite)}>
        {t.finish}
      </Link>
    </section>
  );
}
