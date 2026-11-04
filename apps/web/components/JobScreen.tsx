'use client';

// Your job, under More (step 2h, brief 4.15, D154): what it's for in one
// plain sentence (D213), then each saved job's details from the payslip:
// the tax code and how it's worked out, the workplace pension, student
// loans, other deductions, the last payslip's figures, the overtime rate,
// the last day of work each payday pays for (D131), and the usual weeks
// overtime is worked out from (D5). "Change these details" changes them as
// one change with one Undo; overtime and missed shifts saved for paydays
// still to come are worked out again with them (D154, D162).

import Link from 'next/link';
import { useState } from 'react';
import type { JobCard } from '../lib/job-view.ts';
import {
  coveredWords,
  deductionWords,
  loanWords,
  overtimeWords,
  pensionWords,
  soFarWords,
  taxCodeWords,
  weekForWords,
} from '../lib/job-words.ts';
import { strings } from '../strings/en-GB.ts';
import formStyles from './Form.module.css';
import styles from './JobScreen.module.css';
import { JobSheet } from './JobSheet.tsx';
import { ScreenHeader } from './ScreenParts.tsx';
import screenStyles from './Screens.module.css';
import { useScreenView } from './useScreenView.ts';

const t = strings.job;

function Detail({ label, children }: { readonly label: string; readonly children: string }) {
  return (
    <div className={styles.detail}>
      <dt>{label}</dt>
      <dd className="num">{children}</dd>
    </div>
  );
}

function Job({
  job,
  today,
  onChange,
}: {
  readonly job: JobCard;
  readonly today: string;
  readonly onChange: () => void;
}) {
  const profile = job.profile;
  const headingId = `job-${job.id}`;
  return (
    <section className={screenStyles.card} aria-labelledby={headingId} data-testid="job">
      <h2 id={headingId} className={screenStyles.cardTitle}>
        {job.name}
      </h2>
      {job.pays.length === 0 ? null : (
        <p className={screenStyles.second}>{t.forPay(job.pays.join(', '))}</p>
      )}
      <dl className={styles.details}>
        <Detail label={t.often}>{strings.pay.frequencies[job.frequency]}</Detail>
        <Detail label={t.taxCode}>{taxCodeWords(profile)}</Detail>
        <Detail label={t.pension}>{pensionWords(profile)}</Detail>
        <Detail label={t.studentLoan}>{loanWords(profile)}</Detail>
        <Detail label={t.deductions}>{deductionWords(profile)}</Detail>
        <Detail label={t.soFar}>{soFarWords(profile)}</Detail>
        <Detail label={t.overtimeRate}>{overtimeWords(profile)}</Detail>
        <Detail label={t.covered}>{coveredWords(job, today)}</Detail>
      </dl>
      <h3 className={`${screenStyles.label} ${styles.weeksHeading}`}>{t.weeks}</h3>
      {job.weeks.length === 0 ? (
        <p className={screenStyles.second}>{t.weeksNone}</p>
      ) : (
        <>
          <p className={screenStyles.second}>{t.weeksIntro}</p>
          <ul className={styles.weeks}>
            {job.weeks.map((week) => (
              <li key={week.id}>
                <span className={styles.weekName}>{week.name}</span>
                <span className={screenStyles.second}>
                  {weekForWords(week.steps, job.steps, week.until, today)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {job.shiftsAhead === 0 ? null : (
        <p className={screenStyles.second} data-testid="shifts-ahead">
          {t.shiftsAhead(job.shiftsAhead)}
        </p>
      )}
      <button
        type="button"
        className={formStyles.outlined}
        aria-haspopup="dialog"
        aria-describedby={headingId}
        onClick={onChange}
      >
        {t.change}
      </button>
    </section>
  );
}

export function JobScreen() {
  const { view, failed } = useScreenView('job');
  const [open, setOpen] = useState<string | null>(null);
  const changing = view?.jobs.find((one) => one.id === open) ?? null;
  return (
    <>
      <ScreenHeader
        heading={t.heading}
        purpose={t.purpose}
        back={{ label: t.back, href: '/app/more/' }}
      />
      {view === null ? (
        <p className={screenStyles.card} role={failed ? 'alert' : undefined}>
          {failed ? strings.errors.plan : t.loading}
        </p>
      ) : view.jobs.length === 0 ? (
        <section className={screenStyles.card} aria-labelledby="no-job">
          <h2 id="no-job" className={screenStyles.cardTitle}>
            {t.noJobTitle}
          </h2>
          <p className={screenStyles.line}>{t.noJob}</p>
          <Link className={formStyles.outlined} href="/app/pay/">
            {t.toCalculator}
          </Link>
        </section>
      ) : (
        view.jobs.map((job) => (
          <Job key={job.id} job={job} today={view.today} onChange={() => setOpen(job.id)} />
        ))
      )}
      {view === null ? null : (
        <JobSheet
          open={changing !== null}
          job={changing}
          today={view.today}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
