// A list of choices with a legend, one of which is picked (radio buttons):
// each row is at least 44px tall and the whole row can be tapped. A choice
// can have a short hint after its words, such as "Fri to Thu", or a longer
// one under them, as a second line (step 2h).
//
// Each radio is named by its own words only, and its hint is read after them,
// so someone using voice control can say just the words. The group's hint
// and any mistake are read with whichever radio has focus, as a text box's
// are (D203, step 2h).

import { useId } from 'react';
import styles from './ChoiceList.module.css';

export interface ChoiceListProps<T extends string> {
  readonly legend: string;
  readonly name: string;
  /** The chosen option, or null while nothing is chosen yet. */
  readonly value: T | null;
  readonly options: readonly {
    readonly value: T;
    readonly label: string;
    readonly hint?: string | null;
  }[];
  readonly onChange: (value: T) => void;
  /** The ids of lines read with each choice: a hint for the group, or a mistake in it. */
  readonly describedBy?: string | undefined;
  /** True while there's a mistake in the choice, such as nothing chosen. */
  readonly invalid?: boolean;
  /** Each hint goes under its choice's words, as a second line, for hints longer than a few words. */
  readonly hintsUnder?: boolean;
}

export function ChoiceList<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  describedBy,
  invalid = false,
  hintsUnder = false,
}: ChoiceListProps<T>) {
  const base = useId();
  return (
    <fieldset className={styles.choice}>
      <legend className={styles.legend}>{legend}</legend>
      {options.map((option, index) => {
        const labelId = `${base}-${index}`;
        const hasHint = option.hint !== undefined && option.hint !== null;
        const hintId = hasHint ? `${base}-${index}-hint` : undefined;
        const described = [hintId, describedBy].filter((one) => one !== undefined).join(' ');
        return (
          <label
            key={option.value}
            className={hintsUnder ? `${styles.option} ${styles.stacked}` : styles.option}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              aria-labelledby={hasHint ? labelId : undefined}
              aria-describedby={described === '' ? undefined : described}
              aria-invalid={invalid ? true : undefined}
            />
            {hintsUnder ? (
              <span className={styles.words}>
                <span id={labelId}>{option.label}</span>
                {hasHint ? (
                  <span id={hintId} className={styles.under}>
                    {option.hint}
                  </span>
                ) : null}
              </span>
            ) : (
              <>
                <span id={labelId}>{option.label}</span>
                {hasHint ? (
                  <span id={hintId} className={styles.hint}>
                    {option.hint}
                  </span>
                ) : null}
              </>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
