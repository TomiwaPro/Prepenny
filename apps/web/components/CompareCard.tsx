'use client';

// Compare ways to pay a credit card (brief 4.6, D102, D146): paying the
// minimum, a fixed amount each month, or the full balance, with how many
// payments each takes and the interest paid on the way. Numbers only: it
// never says which way to choose (brief Part 3, principle 10). The fixed
// amount starts at the card's planned payment and can be changed.

import type { CardComparison, PayingOff } from '@prepenny/engine';
import { useEffect, useId, useState } from 'react';
import { amountForTyping, parseAmount } from '../lib/amount.ts';
import type { CompareStart } from '../lib/debts-view.ts';
import { currencySign, formatIn } from '../lib/money.ts';
import { strings } from '../strings/en-GB.ts';
import { askInBackground } from '../worker/client.ts';
import { describedBy, Field, MoneyInput } from './Fields.tsx';
import formStyles from './Form.module.css';
import { usePlanActions } from './PlanProvider.tsx';
import styles from './Screens.module.css';

const t = strings.compare;

function resultWords(way: PayingOff | null, currency: string, noMinimum = false): string {
  if (way === null) return noMinimum ? t.noMinimum : t.never;
  if (!way.paidOff || way.payments === null || way.interest === null) return t.never;
  return t.result(way.payments, formatIn(way.interest, currency));
}

export function CompareCard({
  debtId,
  currency,
  start,
}: {
  readonly debtId: string;
  readonly currency: string;
  readonly start: CompareStart;
}) {
  const { loaded } = usePlanActions();
  const id = useId();
  const [fixedText, setFixedText] = useState(
    start.fixed === null ? '' : amountForTyping(start.fixed),
  );
  const [paysOnText, setPaysOnText] = useState(start.paysOn === null ? '' : String(start.paysOn));
  const [result, setResult] = useState<CardComparison | null>(null);
  const fixed = parseAmount(fixedText);
  const paysOnTyped = /^\d{1,2}$/.test(paysOnText.trim()) ? Number(paysOnText.trim()) : null;
  const paysOn =
    start.paysOn ??
    (paysOnTyped !== null && paysOnTyped >= 1 && paysOnTyped <= 31 ? paysOnTyped : null);
  const fixedError =
    fixedText.trim() !== '' && (fixed === null || fixed === 0) ? t.fixedError : undefined;
  const paysOnError =
    start.paysOn === null && paysOnText.trim() !== '' && paysOn === null
      ? t.paysOnError
      : undefined;

  useEffect(() => {
    if (loaded === null || fixed === null || fixed === 0 || paysOn === null) {
      setResult(null);
      return;
    }
    let current = true;
    askInBackground({
      kind: 'compare',
      records: loaded.records,
      today: loaded.today,
      compare: { debtId, fixed, paysOn },
    }).then(
      (answer) => {
        if (current) setResult(answer);
      },
      () => {
        if (current) setResult(null);
      },
    );
    return () => {
      current = false;
    };
  }, [loaded, debtId, fixed, paysOn]);

  return (
    <section className={styles.card} aria-labelledby={`${id}-heading`} data-testid="compare">
      <h2 id={`${id}-heading`} className={styles.cardTitle}>
        {t.heading}
      </h2>
      <p className={styles.second}>{t.intro}</p>
      <Field id={`${id}-fixed`} label={t.fixed} error={fixedError}>
        <MoneyInput
          id={`${id}-fixed`}
          symbol={currencySign(currency)}
          value={fixedText}
          onChange={setFixedText}
          invalid={fixedError !== undefined}
          describedBy={describedBy(`${id}-fixed`, fixedError)}
        />
      </Field>
      {start.paysOn === null ? (
        <Field id={`${id}-pays-on`} label={t.paysOn} error={paysOnError}>
          <input
            id={`${id}-pays-on`}
            className={`${formStyles.input} num`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={paysOnText}
            aria-invalid={paysOnError !== undefined}
            aria-describedby={describedBy(`${id}-pays-on`, paysOnError)}
            onChange={(event) => setPaysOnText(event.target.value)}
          />
        </Field>
      ) : null}
      {result === null ? null : (
        <div aria-live="polite">
          <dl className={styles.totals}>
            <div className={styles.total} data-testid="compare-minimum">
              <dt>{t.minimum}</dt>
              <dd className="num">
                {resultWords(result.minimum, currency, result.minimum === null)}
              </dd>
            </div>
            <div className={styles.total} data-testid="compare-fixed">
              <dt>{t.fixedEach(formatIn(fixed ?? 0, currency))}</dt>
              <dd className="num">{resultWords(result.fixed, currency)}</dd>
            </div>
            <div className={styles.total} data-testid="compare-full">
              <dt>{t.full}</dt>
              <dd className="num">{resultWords(result.full, currency)}</dd>
            </div>
          </dl>
        </div>
      )}
      <p className={styles.second}>{t.estimates}</p>
    </section>
  );
}
