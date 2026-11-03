// A row of choices side by side, one of which is picked, such as "Pay
// periods" or "Months" (brief 4.8). They're radio buttons, so a screen reader
// and the keyboard treat them as one choice. They wrap onto more rows when
// the names are long or the text is big.

import styles from './Segmented.module.css';

export interface SegmentedProps<T extends string> {
  readonly legend: string;
  readonly name: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
  readonly testId?: string;
}

export function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  testId,
}: SegmentedProps<T>) {
  return (
    <fieldset className={styles.group} data-testid={testId}>
      <legend className="visually-hidden">{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              className={styles.input}
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
