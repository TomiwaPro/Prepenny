'use client';

// The bottom navigation (brief Part 6, DESIGN.md): Home, Plan, Debts and
// More, each a line icon with its word under it, the active one in a soft pill.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { strings } from '../strings/en-GB.ts';
import styles from './BottomNav.module.css';
import { Icon, type IconName } from './icons.tsx';

const places: readonly {
  readonly href: string;
  readonly icon: IconName;
  readonly label: string;
}[] = [
  { href: '/app/', icon: 'home', label: strings.nav.home },
  { href: '/app/plan/', icon: 'plan', label: strings.nav.plan },
  { href: '/app/debts/', icon: 'debts', label: strings.nav.debts },
  { href: '/app/more/', icon: 'more', label: strings.nav.more },
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
              aria-current={here === place.href ? 'page' : undefined}
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
