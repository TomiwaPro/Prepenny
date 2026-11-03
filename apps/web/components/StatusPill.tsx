// A status always has a word: Tight or Short (VOICE.md). Colour is never the
// only signal (brief Part 6).

import { strings } from '../strings/en-GB.ts';
import styles from './StatusPill.module.css';

export type Status = 'tight' | 'short';

export function StatusPill({ status }: { readonly status: Status }) {
  return <span className={`${styles.pill} ${styles[status]}`}>{strings.status[status]}</span>;
}
