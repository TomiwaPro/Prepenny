'use client';

// Light or dark colours on this phone (ARCHITECTURE.md 3.8): match the
// phone, or always light, or always dark. Kept in this phone's browser only.

import { useEffect, useId, useState } from 'react';
import { strings } from '../strings/en-GB.ts';
import styles from './ColourChoice.module.css';

const KEY = 'prepenny-colours';

type Choice = 'phone' | 'light' | 'dark';

const choices: readonly { readonly value: Choice; readonly label: string }[] = [
  { value: 'phone', label: strings.more.matchPhone },
  { value: 'light', label: strings.more.light },
  { value: 'dark', label: strings.more.dark },
];

function stored(): Choice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'phone';
  } catch {
    return 'phone';
  }
}

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === 'phone') delete root.dataset.theme;
  else root.dataset.theme = choice;
  try {
    if (choice === 'phone') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // The choice still applies until the app is closed.
  }
}

export function ColourChoice() {
  const [choice, setChoice] = useState<Choice>('phone');
  const name = useId();
  const hint = useId();
  useEffect(() => setChoice(stored()), []);
  return (
    <fieldset className={styles.card} aria-describedby={hint}>
      <legend className={styles.legend}>{strings.more.colours}</legend>
      <p id={hint} className={styles.hint}>
        {strings.more.coloursHint}
      </p>
      {choices.map((one) => (
        <label key={one.value} className={styles.option}>
          <input
            type="radio"
            name={name}
            value={one.value}
            checked={choice === one.value}
            onChange={() => {
              setChoice(one.value);
              apply(one.value);
            }}
          />
          <span>{one.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
