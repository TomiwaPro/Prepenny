// "Your plan" on More (the More sketch in ARCHITECTURE.md 4.6): Accounts,
// Budgets, Savings goals, the Pay calculator, Your job, What if and Share with my
// partner (step 3f), each a whole row
// that opens its screen, with a line saying what's there (D213).

import Link from 'next/link';
import { strings } from '../strings/en-GB.ts';
import styles from './Screens.module.css';

const t = strings.more;

const links = [
  { href: '/app/accounts/', label: t.accounts, line: t.accountsLine },
  { href: '/app/budgets/', label: t.budgets, line: t.budgetsLine },
  { href: '/app/goals/', label: t.goals, line: t.goalsLine },
  { href: '/app/pay/', label: t.payCalculator, line: t.payCalculatorLine },
  { href: '/app/job/', label: t.job, line: t.jobLine },
  { href: '/app/what-if/', label: t.whatIf, line: t.whatIfLine },
  { href: '/app/share/', label: strings.share.moreLink, line: strings.share.moreLine },
] as const;

export function MoreLinks() {
  return (
    <nav className={styles.card} aria-labelledby="your-plan">
      <h2 id="your-plan" className={styles.cardTitle}>
        {t.yourPlan}
      </h2>
      <ul className={styles.list}>
        {links.map((one) => (
          <li key={one.href}>
            <Link className={styles.rowLink} href={one.href}>
              <span className={styles.rowBody}>
                <span className={styles.rowName}>{one.label}</span>
                <span className={styles.second}>{one.line}</span>
              </span>
              <span className={styles.arrow} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
