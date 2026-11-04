'use client';

// The public take-home pay calculator (brief 4.15, 4.17: "Free for
// everyone", a public page that works without signing in), at
// /pay-calculator/. It works with nothing saved on the phone, and sends
// nothing anywhere: every sum is worked out on the phone (step 2g). "Start a
// free plan with this pay" opens setup with the pay filled in.

import { useEffect, useState } from 'react';
import { formatMoney } from '../lib/money.ts';
import { blankCalculator } from '../lib/pay-calculator.ts';
import { savePayDraft } from '../lib/pay-draft.ts';
import { testSetting } from '../lib/test-setting.ts';
import { localToday } from '../lib/today.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import styles from './PayCalculator.module.css';
import { PayCalculator } from './PayCalculator.tsx';
import screenStyles from './Screens.module.css';

const t = strings.pay;

export function PublicPayScreen() {
  // Today is this phone's own date, known only once the page is on it.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(testSetting()?.today ?? localToday()), []);
  return (
    <div className={styles.page}>
      {/* A plain link, so nothing is fetched ahead of a tap. */}
      <a className={styles.wordmark} href="/">
        {t.homeLink}
      </a>
      <main className={styles.calculator}>
        <header className={screenStyles.header}>
          <h1 className={screenStyles.heading}>{t.publicHeading}</h1>
          <p className={screenStyles.purpose}>{t.publicPurpose}</p>
        </header>
        {today === null ? null : (
          <PayCalculator
            initial={blankCalculator(today)}
            today={today}
            actions={({ form, result }) => {
              const amount = formatMoney(Math.max(0, result.takeHome));
              return (
                <div className={styles.actions}>
                  <div className={formStyles.withHint}>
                    <button
                      type="button"
                      className={formStyles.main}
                      aria-describedby="start-plan-hint"
                      onClick={() => {
                        savePayDraft({
                          amount: Math.max(0, result.takeHome),
                          frequency: form.frequency,
                          payDate: form.payDate,
                        });
                        window.location.assign('/setup/');
                      }}
                    >
                      {t.startPlan}
                    </button>
                    <p id="start-plan-hint" className={formStyles.hint}>
                      {t.startPlanHint(amount)}
                    </p>
                  </div>
                </div>
              );
            }}
          />
        )}
      </main>
    </div>
  );
}
