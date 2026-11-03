// Our own line icons (ARCHITECTURE.md 1.1, DESIGN.md): 1.7 stroke, round
// ends, for the bottom navigation only. They're decoration beside a word,
// so screen readers skip them.

import styles from './icons.module.css';

const paths = {
  home: ['M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z'],
  plan: ['M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'],
  debts: ['M12 3a9 9 0 1 0 9 9h-9z', 'M15 3.6A8 8 0 0 1 20.4 9H15z'],
  more: ['M4 7h16M4 12h16M4 17h16'],
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
