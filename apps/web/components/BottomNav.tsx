'use client';

// The bottom navigation (brief Part 6, DESIGN.md): Home, Coming up, Debts
// and More (D208), each a line icon with its word under it, the active one
// in a soft pill.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { strings } from '../strings/en-GB.ts';
import styles from './BottomNav.module.css';
import { Icon, type IconName } from './icons.tsx';

const places: readonly {
  readonly href: string;
  readonly icon: IconName;
  readonly label: string;
  /** The screens under this place, which mark it as the one you're in (step 2f). */
  readonly under?: readonly string[];
}[] = [
  { href: '/app/', icon: 'home', label: strings.nav.home },
  { href: '/app/coming-up/', icon: 'comingUp', label: strings.nav.comingUp },
  { href: '/app/debts/', icon: 'debts', label: strings.nav.debts, under: ['/app/debt/'] },
  {
    href: '/app/more/',
    icon: 'more',
    label: strings.nav.more,
    under: ['/app/accounts/', '/app/budgets/', '/app/goals/'],
  },
];

const withSlash = (path: string) => (path.endsWith('/') ? path : `${path}/`);

export function BottomNav() {
  const here = withSlash(usePathname() ?? '/app/');
  return (
    <nav className={styles.nav} aria-label={strings.nav.label}>
      <ul className={styles.list}>
        {places.map((place) => (
          <li key={place.href}>
            <Link
              className={styles.link}
              href={place.href}
              aria-current={
                here === place.href
                  ? 'page'
                  : place.under?.includes(here) === true
                    ? 'location'
                    : undefined
              }
            >
              <span className={styles.pill}>
                <Icon name={place.icon} />
              </span>
              <span>{place.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
