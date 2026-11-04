// A list of choices with a legend, one of which is picked (radio buttons):
// each row is at least 44px tall and the whole row can be tapped. A choice
// can have a short hint after its words, such as "Fri to Thu", or a longer
// one under them, as a second line (step 2h).

import styles from './ChoiceList.module.css';

export interface ChoiceListProps<T extends string> {
  readonly legend: string;
  readonly name: string;
  readonly value: T;
  readonly options: readonly {
    readonly value: T;
    readonly label: string;
    readonly hint?: string | null;
  }[];
  readonly onChange: (value: T) => void;
  /** The id of a line that explains a mistake in the choice, read with it. */
  readonly describedBy?: string | undefined;
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
  hintsUnder = false,
}: ChoiceListProps<T>) {
  return (
    <fieldset className={styles.choice} aria-describedby={describedBy}>
      <legend className={styles.legend}>{legend}</legend>
      {options.map((option) => (
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
          />
          {hintsUnder ? (
            <span className={styles.words}>
              <span>{option.label}</span>
              {option.hint === undefined || option.hint === null ? null : (
                <span className={styles.under}>{option.hint}</span>
              )}
            </span>
          ) : (
            <>
              <span>{option.label}</span>
              {option.hint === undefined || option.hint === null ? null : (
                <span className={styles.hint}>{option.hint}</span>
              )}
            </>
          )}
        </label>
      ))}
    </fieldset>
  );
}
